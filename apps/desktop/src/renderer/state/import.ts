import { create } from 'zustand';
import type {
  CanonicalField,
  ColumnMapping,
  ImportPhase,
  ImportPreviewResponse,
  ImportSource,
  ImporterId,
} from '../../shared/protocol';
import { call } from './ipc';
import { useLibraryStore } from './library';
import { useToastStore } from './toast';

// The wizard reuses the shape of legacy/components/NotionSyncModal.tsx — one `step` enum driving
// the whole modal — widened to pick → map → preview → committing → done | error (§6.3).

export type ImportStep = 'pick' | 'map' | 'preview' | 'committing' | 'done' | 'error';

export interface ImportProgressState {
  phase: ImportPhase;
  done: number;
  total: number;
  message: string | null;
}

const IDLE_PROGRESS: ImportProgressState = { phase: 'parsing', done: 0, total: 0, message: null };

interface ImportState {
  step: ImportStep;
  kind: ImporterId | 'auto';
  source: ImportSource | null;
  /** Display name of what was picked (file basename, or the paste label key). */
  sourceLabel: string | null;
  pasteText: string;
  mapping: ColumnMapping;
  preview: ImportPreviewResponse | null;
  enqueueFetch: boolean;
  progress: ImportProgressState;
  errorKey: string | null;
  errorDetail: string | null;
  result: { runId: string; inserted: number; skipped: number } | null;
  busy: boolean;

  setKind: (kind: ImporterId | 'auto') => void;
  setPasteText: (text: string) => void;
  setEnqueueFetch: (value: boolean) => void;
  setMappingField: (header: string, field: CanonicalField) => void;

  pickFile: () => Promise<void>;
  usePaste: () => void;
  runPreview: () => Promise<void>;
  back: () => void;
  commit: () => Promise<void>;
  reset: () => void;

  /** Wires import:progress; returns the unsubscribe the caller must keep. */
  subscribe: () => () => void;
}

const INITIAL = {
  step: 'pick' as ImportStep,
  kind: 'auto' as ImporterId | 'auto',
  source: null,
  sourceLabel: null,
  pasteText: '',
  mapping: {} as ColumnMapping,
  preview: null,
  enqueueFetch: true,
  progress: IDLE_PROGRESS,
  errorKey: null,
  errorDetail: null,
  result: null,
  busy: false,
};

export const useImportStore = create<ImportState>()((set, get) => ({
  ...INITIAL,

  setKind: (kind) => set({ kind }),
  setPasteText: (pasteText) => set({ pasteText }),
  setEnqueueFetch: (enqueueFetch) => set({ enqueueFetch }),
  setMappingField: (header, field) =>
    set((s) => ({ mapping: { ...s.mapping, [header]: field } })),

  pickFile: async () => {
    const picked = await call('errors.dialog.openFile', (c) =>
      c.dialog.openFile({
        withBytes: true,
        filters: [
          { name: 'bookmarks', extensions: ['html', 'htm', 'json', 'csv', 'sqlite'] },
          { name: 'all', extensions: ['*'] },
        ],
      }),
    );
    if (!picked) return;
    const source: ImportSource = picked.bytes
      ? { kind: 'bytes', bytes: picked.bytes, path: picked.path }
      : { kind: 'path', path: picked.path };
    const name = picked.path.split(/[\\/]/).pop() ?? picked.path;
    set({ source, sourceLabel: name, errorKey: null, errorDetail: null });
  },

  usePaste: () => {
    const text = get().pasteText;
    if (!text.trim()) return;
    set({
      source: { kind: 'text', text },
      sourceLabel: null,
      errorKey: null,
      errorDetail: null,
    });
  },

  runPreview: async () => {
    const { source, kind, mapping } = get();
    if (!source) return;
    set({ busy: true, errorKey: null, errorDetail: null, progress: { ...IDLE_PROGRESS, phase: 'parsing' } });
    const hasMapping = Object.keys(mapping).length > 0;
    const preview = await call('errors.import.preview', (c) =>
      c.import.preview({ kind, source, ...(hasMapping ? { mapping } : {}) }),
    );
    if (!preview) {
      set({ busy: false, step: 'error', errorKey: 'errors.import.preview' });
      return;
    }
    // A CSV/JSON source with headers needs the mapper before the report means anything.
    const needsMapping =
      !hasMapping && preview.headers !== undefined && preview.headers.length > 0;
    set({
      busy: false,
      preview,
      kind: preview.importer,
      mapping: hasMapping ? mapping : (preview.detectedMapping ?? {}),
      step: needsMapping ? 'map' : 'preview',
    });
  },

  back: () => {
    const { step } = get();
    if (step === 'preview' && Object.keys(get().mapping).length > 0) set({ step: 'map' });
    else if (step === 'map' || step === 'preview' || step === 'error') set({ step: 'pick' });
  },

  commit: async () => {
    const { preview, enqueueFetch } = get();
    if (!preview) return;
    set({ step: 'committing', busy: true, progress: { phase: 'inserting', done: 0, total: preview.newCount, message: null } });
    const res = await call('errors.import.commit', (c) =>
      c.import.commit({ previewId: preview.previewId, enqueueFetch }),
    );
    if (!res) {
      set({ busy: false, step: 'error', errorKey: 'errors.import.commit' });
      return;
    }
    set({
      busy: false,
      step: 'done',
      result: res,
      progress: { phase: 'done', done: res.inserted, total: res.inserted, message: null },
    });
    useToastStore.getState().success('toast.imported', { n: res.inserted });
    void useLibraryStore.getState().refresh(true);
  },

  reset: () => set({ ...INITIAL }),

  subscribe: () => {
    const cairn = typeof window === 'undefined' ? null : window.cairn;
    if (!cairn) return () => {};
    try {
      return cairn.import.onProgress((event) => {
        set({
          progress: {
            phase: event.phase,
            done: event.done,
            total: event.total,
            message: event.message ?? null,
          },
          ...(event.phase === 'error' ? { step: 'error' as ImportStep } : {}),
        });
      });
    } catch {
      return () => {};
    }
  },
}));
