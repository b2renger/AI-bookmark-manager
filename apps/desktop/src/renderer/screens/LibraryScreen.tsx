import { useEffect, useMemo, useState } from 'react';
import {
  BookmarkDrawer,
  BookmarkTable,
  BulkActionBar,
  Button,
  EmptyState,
  FilterBar,
  LibraryIcon,
  Textarea,
  type DrawerField,
} from '@cairn/ui';
import { call, useLibraryStore, useNavStore, useSelectionStore } from '../state';
import { useLocale, useT } from '../i18n/useT';

// The paste box is the legacy UrlInput minus the AI hints: split lines, hand them to
// library:saveUrls with source 'paste'. Filtering and sorting happen in SQL, not here.

function PasteBox() {
  const t = useT('library');
  const [text, setText] = useState('');
  const saving = useLibraryStore((s) => s.saving);
  const saveUrls = useLibraryStore((s) => s.saveUrls);

  const submit = (e: { preventDefault: () => void }): void => {
    e.preventDefault();
    if (!text.trim()) return;
    void saveUrls(text);
    setText('');
  };

  return (
    <form onSubmit={submit} className="border-b border-line-1 bg-surface-1 px-4 py-3">
      <label htmlFor="paste-urls" className="mb-1.5 block text-xs font-medium text-fg-2">
        {t('paste.label')}
      </label>
      <div className="flex items-start gap-2">
        <Textarea
          id="paste-urls"
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('paste.placeholder')}
          aria-label={t('paste.label')}
          disabled={saving}
        />
        <Button type="submit" variant="primary" disabled={saving || !text.trim()}>
          {t('paste.submit')}
        </Button>
      </div>
      <p className="mt-1 text-[11px] text-fg-3">{t('paste.hint')}</p>
    </form>
  );
}

export function LibraryScreen() {
  const t = useT('library');
  const locale = useLocale();
  const setScreen = useNavStore((s) => s.setScreen);

  const filters = useLibraryStore((s) => s.filters);
  const setFilter = useLibraryStore((s) => s.setFilter);
  const hash = useLibraryStore((s) => s.hash);
  const pages = useLibraryStore((s) => s.pages);
  const loading = useLibraryStore((s) => s.loading);
  const loadingMore = useLibraryStore((s) => s.loadingMore);
  const refresh = useLibraryStore((s) => s.refresh);
  const loadMore = useLibraryStore((s) => s.loadMore);
  const open = useLibraryStore((s) => s.open);
  const closeDetail = useLibraryStore((s) => s.closeDetail);
  const detail = useLibraryStore((s) => s.detail);
  const detailId = useLibraryStore((s) => s.detailId);
  const detailLoading = useLibraryStore((s) => s.detailLoading);
  const commitField = useLibraryStore((s) => s.commitField);
  const bulkEdit = useLibraryStore((s) => s.bulkEdit);
  const selectAllVisible = useLibraryStore((s) => s.selectAllVisible);
  const saving = useLibraryStore((s) => s.saving);

  const selectedIds = useSelectionStore((s) => s.ids);
  const toggle = useSelectionStore((s) => s.toggle);
  const clearSelection = useSelectionStore((s) => s.clear);

  const page = pages[hash];
  const rows = page?.items ?? [];
  const total = page?.total ?? 0;

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' }),
    [locale],
  );
  const fullFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }),
    [locale],
  );
  const fmt = (f: Intl.DateTimeFormat, iso: string): string => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : f.format(d);
  };

  const allSelected = rows.length > 0 && selectedIds.size >= rows.length;

  const openExternal = (url: string): void => {
    void call('errors.shell.openExternal', (c) => c.shell.openExternal(url));
  };

  const commit = (field: DrawerField, value: string): void => {
    if (detailId) void commitField(detailId, field, value);
  };

  // Tag edits from the drawer act on the open row only, not on the shared selection.
  const tagOne = (value: string, mode: 'add' | 'remove'): void => {
    if (!detailId) return;
    const id = detailId;
    void call('errors.library.bulkEdit', (c) =>
      c.library.bulkEdit({
        ids: [id],
        ...(mode === 'add' ? { addTags: [value] } : { removeTags: [value] }),
      }),
    ).then(() => open(id));
  };

  const addTagToOpen = (label: string): void => tagOne(label, 'add');
  const removeTagFromOpen = (tagId: string): void => tagOne(tagId, 'remove');

  const empty = !loading && rows.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PasteBox />

      <FilterBar
        t={t}
        value={filters}
        platformFacets={page?.platformFacets ?? []}
        statusFacets={page?.statusFacets ?? []}
        total={total}
        loading={loading}
        onChange={setFilter}
      />

      <div className="flex min-h-0 flex-1">
        {empty ? (
          <div className="flex-1">
            <EmptyState
              icon={<LibraryIcon className="h-6 w-6" />}
              title={t('empty.title')}
              description={t('empty.body')}
              action={
                <Button variant="primary" onClick={() => setScreen('import')}>
                  {t('empty.action')}
                </Button>
              }
            />
          </div>
        ) : (
          <BookmarkTable
            t={t}
            rows={rows}
            total={total}
            selectedIds={selectedIds}
            allSelected={allSelected}
            onToggle={toggle}
            onSelectAllVisible={selectAllVisible}
            onOpen={(id) => void open(id)}
            activeId={detailId}
            loading={loadingMore}
            hasMore={page !== undefined && page.nextCursor !== null}
            onLoadMore={() => void loadMore()}
            formatDate={(iso) => fmt(dateFmt, iso)}
          />
        )}

        {detailId ? (
          <BookmarkDrawer
            t={t}
            detail={detail}
            loading={detailLoading}
            onClose={closeDetail}
            onCommitField={commit}
            onAddTag={addTagToOpen}
            onRemoveTag={removeTagFromOpen}
            onToggleStar={(starred) => void bulkEdit({ setStarred: starred })}
            onOpenExternal={openExternal}
            onDelete={() => void bulkEdit({ softDelete: true })}
            formatDate={(iso) => fmt(fullFmt, iso)}
          />
        ) : null}
      </div>

      <BulkActionBar
        t={t}
        count={selectedIds.size}
        busy={saving}
        onClear={clearSelection}
        onAddTag={(label) => void bulkEdit({ addTags: [label] })}
        onRemoveTag={(label) => void bulkEdit({ removeTags: [label] })}
        onStar={(starred) => void bulkEdit({ setStarred: starred })}
        onDelete={() => void bulkEdit({ softDelete: true })}
      />
    </div>
  );
}
