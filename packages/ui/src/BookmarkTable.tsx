import { useEffect, useRef } from 'react';
import { observeElementRect, useVirtualizer, type Virtualizer } from '@tanstack/react-virtual';
import { ConfidenceBadge } from './ConfidenceBadge.js';
import { PlatformBadge } from './PlatformBadge.js';
import { StarFilledIcon } from './icons/index.js';
import type { BookmarkRow, TFn } from './types.js';

// The ported list, now a table (TECHNICAL-DESIGN §6.1). Row height is fixed at 64 px so
// estimateSize is constant and 100k rows scroll without measurement. Nothing here maps over the
// full array: only the virtual window reaches the DOM.

export const ROW_HEIGHT = 64;

/** grid-template-columns: checkbox / platform / title+url / tags / confidence / date. */
const GRID = 'grid grid-cols-[2.5rem_2.5rem_minmax(12rem,1fr)_minmax(6rem,14rem)_9rem_7rem] items-center gap-2 px-3';

export interface BookmarkTableProps {
  t: TFn;
  rows: BookmarkRow[];
  /** Total matching rows server-side, for the header count. */
  total: number;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  /** Selects (or clears) every row the store has loaded — the store owns the id list. */
  onSelectAllVisible: () => void;
  /** O(1) flag from the store; the table never scans its own row array. */
  allSelected?: boolean;
  onOpen: (id: string) => void;
  activeId?: string | null;
  loading?: boolean;
  /** Called once when the window reaches the tail of the loaded pages. */
  onLoadMore?: () => void;
  hasMore?: boolean;
  formatDate?: (iso: string) => string;
  overscan?: number;
  /**
   * Forces the viewport height instead of measuring it. Only for environments with no layout
   * (happy-dom returns a 0 px rect, and a 0 px viewport means zero virtual rows).
   */
  viewportHeight?: number;
}

function defaultFormatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
}

export function BookmarkTable({
  t,
  rows,
  total,
  selectedIds,
  onToggle,
  onSelectAllVisible,
  allSelected = false,
  onOpen,
  activeId = null,
  loading = false,
  onLoadMore,
  hasMore = false,
  formatDate = defaultFormatDate,
  overscan = 8,
  viewportHeight,
}: BookmarkTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan,
    getItemKey: (index) => rows[index]?.id ?? index,
    observeElementRect: (
      instance: Virtualizer<HTMLDivElement, Element>,
      cb: (rect: { width: number; height: number }) => void,
    ) => {
      if (viewportHeight !== undefined) {
        cb({ width: 0, height: viewportHeight });
        return () => {};
      }
      return observeElementRect(instance, cb);
    },
  });

  const items = virtualizer.getVirtualItems();
  const last = items.length > 0 ? items[items.length - 1] : undefined;

  useEffect(() => {
    if (!onLoadMore || !hasMore || loading) return;
    if (last && last.index >= rows.length - 1) onLoadMore();
  }, [last, rows.length, hasMore, loading, onLoadMore]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        data-testid="bookmark-table"
        role="grid"
        aria-rowcount={total}
        className="relative min-h-0 flex-1 overflow-auto"
      >
        <div
          role="row"
          className={`${GRID} sticky top-0 z-10 h-9 border-b border-line-1 bg-surface-1 text-[11px] font-semibold uppercase tracking-wider text-fg-3`}
        >
          <span>
            <input
              type="checkbox"
              checked={allSelected}
              aria-label={t('table.selectAllVisible')}
              onChange={onSelectAllVisible}
              className="h-4 w-4 cursor-pointer accent-accent"
            />
          </span>
          <span>{t('table.platform')}</span>
          <span>{t('table.title')}</span>
          <span>{t('table.tags')}</span>
          <span>{t('table.confidence')}</span>
          <span>{t('table.date')}</span>
        </div>

        <div style={{ height: `${virtualizer.getTotalSize()}px` }} className="relative w-full">
          {items.map((vi) => {
            const row = rows[vi.index];
            if (!row) return null;
            const selected = selectedIds.has(row.id);
            return (
              <div
                key={vi.key}
                data-testid="bookmark-row"
                data-index={vi.index}
                role="row"
                tabIndex={0}
                aria-selected={selected}
                onClick={() => onOpen(row.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onOpen(row.id);
                }}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${ROW_HEIGHT}px`,
                  transform: `translateY(${vi.start}px)`,
                }}
                className={`${GRID} cursor-pointer border-b border-line-1 text-sm transition-colors ${
                  activeId === row.id ? 'bg-surface-2' : 'hover:bg-surface-2/60'
                } ${selected ? 'bg-accent/5' : ''}`}
              >
                <span onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected}
                    aria-label={t('table.selectRow', { title: row.title ?? row.url })}
                    onChange={() => onToggle(row.id)}
                    className="h-4 w-4 cursor-pointer accent-accent"
                  />
                </span>

                <span className="text-fg-2">
                  <PlatformBadge t={t} url={row.url} platform={row.platform} compact />
                </span>

                <span className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-1.5 truncate font-medium text-fg-1">
                    {row.starred ? <StarFilledIcon className="h-3.5 w-3.5 shrink-0 text-warn" /> : null}
                    <span className="truncate">{row.title || t('table.untitled')}</span>
                  </span>
                  <span className="truncate text-xs text-fg-3">{row.url}</span>
                </span>

                <span className="flex min-w-0 flex-wrap gap-1 overflow-hidden">
                  {row.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag.id}
                      className="truncate rounded-full border border-line-1 bg-surface-2 px-1.5 py-0.5 text-[11px] text-fg-2"
                    >
                      {tag.label}
                    </span>
                  ))}
                  {row.tags.length > 3 ? (
                    <span className="text-[11px] text-fg-3">
                      {t('table.moreTags', { n: row.tags.length - 3 })}
                    </span>
                  ) : null}
                </span>

                <span onClick={(e) => e.stopPropagation()}>
                  <ConfidenceBadge t={t} score={row.confidence} reason={row.confidenceReason} />
                </span>

                <span className="text-xs text-fg-3">{formatDate(row.createdAt)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="border-t border-line-1 px-3 py-1.5 text-xs text-fg-3" aria-live="polite">
          {t('table.loadingMore')}
        </div>
      ) : null}
    </div>
  );
}
