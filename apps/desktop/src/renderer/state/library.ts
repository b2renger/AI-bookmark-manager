import { create } from 'zustand';
import type { FilterValue } from '@cairn/ui';
import type {
  BookmarkDetailDto,
  BookmarkRowDto,
  BookmarkStatus,
  BulkEditRequest,
  FacetBucket,
  LibraryQuery,
  OpInputDto,
  Platform,
} from '../../shared/protocol';
import { parsePastedUrls } from '../lib/paste';
import { call } from './ipc';
import { useSelectionStore } from './selection';
import { useToastStore } from './toast';

// Filtering and sorting are server-side: 100k rows cannot be filtered in JS (§6.3). The store
// only caches *pages* keyed by the query hash and appends as the table reaches the tail.

export const PAGE_SIZE = 200;
const SEARCH_DEBOUNCE_MS = 250;

export interface CachedPage {
  items: BookmarkRowDto[];
  nextCursor: string | null;
  total: number;
  platformFacets: FacetBucket[];
  statusFacets: FacetBucket[];
}

const EMPTY_PAGE: CachedPage = {
  items: [],
  nextCursor: null,
  total: 0,
  platformFacets: [],
  statusFacets: [],
};

export function queryHash(filters: FilterValue, collectionId?: string): string {
  return JSON.stringify([collectionId ?? '', filters.text, filters.platform, filters.status, filters.sort]);
}

function buildQuery(filters: FilterValue, collectionId: string | undefined, cursor?: string): LibraryQuery {
  return {
    sort: filters.sort,
    limit: PAGE_SIZE,
    ...(collectionId === undefined ? {} : { collectionId }),
    ...(filters.text.trim() === '' ? {} : { text: filters.text.trim() }),
    ...(filters.platform === null ? {} : { platform: filters.platform as Platform }),
    ...(filters.status === null ? {} : { status: filters.status as BookmarkStatus }),
    ...(cursor === undefined ? {} : { cursor }),
  };
}

interface LibraryState {
  filters: FilterValue;
  collectionId: string | undefined;
  hash: string;
  pages: Record<string, CachedPage>;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;

  detailId: string | null;
  detail: BookmarkDetailDto | null;
  detailLoading: boolean;

  saving: boolean;

  current: () => CachedPage;
  setFilter: (patch: Partial<FilterValue>) => void;
  refresh: (force?: boolean) => Promise<void>;
  loadMore: () => Promise<void>;

  open: (id: string) => Promise<void>;
  closeDetail: () => void;

  selectAllVisible: () => void;

  saveUrls: (text: string) => Promise<number>;
  commitField: (id: string, field: string, value: string) => Promise<void>;
  bulkEdit: (patch: Omit<BulkEditRequest, 'ids'>) => Promise<void>;
}

let searchTimer: ReturnType<typeof setTimeout> | null = null;

export const useLibraryStore = create<LibraryState>()((set, get) => ({
  filters: { text: '', platform: null, status: null, sort: 'created_desc' },
  collectionId: undefined,
  hash: queryHash({ text: '', platform: null, status: null, sort: 'created_desc' }),
  pages: {},
  loading: false,
  loadingMore: false,
  error: null,

  detailId: null,
  detail: null,
  detailLoading: false,
  saving: false,

  current: () => get().pages[get().hash] ?? EMPTY_PAGE,

  setFilter: (patch) => {
    const filters = { ...get().filters, ...patch };
    set({ filters, hash: queryHash(filters, get().collectionId) });
    const textChanged = patch.text !== undefined;
    if (searchTimer) clearTimeout(searchTimer);
    if (textChanged) {
      searchTimer = setTimeout(() => void get().refresh(), SEARCH_DEBOUNCE_MS);
    } else {
      void get().refresh();
    }
  },

  refresh: async (force = false) => {
    const { filters, collectionId } = get();
    const hash = queryHash(filters, collectionId);
    if (!force && get().pages[hash]) {
      set({ hash });
      return;
    }
    set({ hash, loading: true, error: null });
    const page = await call('errors.library.query', (c) =>
      c.library.query(buildQuery(filters, collectionId)),
    );
    if (!page) {
      set({ loading: false, error: 'errors.library.query' });
      return;
    }
    set((s) => ({
      loading: false,
      pages: {
        ...s.pages,
        [hash]: {
          items: page.items,
          nextCursor: page.nextCursor,
          total: page.total,
          platformFacets: page.facets?.platform ?? [],
          statusFacets: page.facets?.status ?? [],
        },
      },
    }));
  },

  loadMore: async () => {
    const { hash, filters, collectionId, loadingMore } = get();
    const page = get().pages[hash];
    if (loadingMore || !page || page.nextCursor === null) return;
    set({ loadingMore: true });
    const next = await call('errors.library.query', (c) =>
      c.library.query(buildQuery(filters, collectionId, page.nextCursor ?? undefined)),
    );
    if (!next) {
      set({ loadingMore: false });
      return;
    }
    set((s) => {
      const prev = s.pages[hash] ?? EMPTY_PAGE;
      return {
        loadingMore: false,
        pages: {
          ...s.pages,
          [hash]: {
            ...prev,
            items: [...prev.items, ...next.items],
            nextCursor: next.nextCursor,
            total: next.total,
          },
        },
      };
    });
  },

  open: async (id) => {
    set({ detailId: id, detailLoading: true, detail: null });
    const detail = await call('errors.library.get', (c) => c.library.get(id));
    if (get().detailId !== id) return; // a newer row won the race
    set({ detail, detailLoading: false });
  },

  closeDetail: () => set({ detailId: null, detail: null, detailLoading: false }),

  selectAllVisible: () => {
    const ids = get().current().items.map((r) => r.id);
    const selection = useSelectionStore.getState();
    if (selection.ids.size >= ids.length && ids.every((id) => selection.ids.has(id))) {
      selection.clear();
    } else {
      selection.replace(ids, 'table');
    }
  },

  saveUrls: async (text) => {
    const items = parsePastedUrls(text);
    if (items.length === 0) {
      useToastStore.getState().info('toast.nothingToSave');
      return 0;
    }
    set({ saving: true });
    const res = await call('errors.library.save', (c) =>
      c.library.saveUrls({ items, source: 'paste' }),
    );
    set({ saving: false });
    if (!res) return 0;
    useToastStore.getState().success('toast.saved', {
      n: res.accepted.length,
      duplicates: res.duplicates.length,
      rejected: res.rejected.length,
    });
    await get().refresh(true);
    return res.accepted.length;
  },

  commitField: async (id, field, value) => {
    const detail = get().detail;
    const collectionId = detail?.collectionId ?? get().collectionId ?? '';
    const op: OpInputDto = {
      collectionId,
      entity: 'bookmarks',
      entityId: id,
      field,
      op: 'set',
      value,
    };
    const res = await call('errors.library.applyOps', (c) => c.library.applyOps({ ops: [op] }));
    if (!res) return;
    // Optimistic local patch so the drawer and the row agree before the next query.
    set((s) => {
      const page = s.pages[s.hash];
      const patched = page
        ? {
            ...page,
            items: page.items.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
          }
        : undefined;
      return {
        detail: s.detail && s.detail.id === id ? { ...s.detail, [field]: value } : s.detail,
        pages: patched ? { ...s.pages, [s.hash]: patched } : s.pages,
      };
    });
  },

  bulkEdit: async (patch) => {
    const ids = [...useSelectionStore.getState().ids];
    if (ids.length === 0) return;
    set({ saving: true });
    const res = await call('errors.library.bulkEdit', (c) => c.library.bulkEdit({ ids, ...patch }));
    set({ saving: false });
    if (!res) return;
    useToastStore.getState().success('toast.bulkApplied', { n: res.changed });
    useSelectionStore.getState().clear();
    await get().refresh(true);
  },
}));
