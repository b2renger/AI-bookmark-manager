import { useState } from 'react';
import { Button } from './Button.js';
import { Input } from './Input.js';
import { EditableField } from './EditableField.js';
import { ConfidenceBadge } from './ConfidenceBadge.js';
import { PlatformBadge } from './PlatformBadge.js';
import { Spinner } from './Spinner.js';
import { CloseIcon, ExternalLinkIcon, StarFilledIcon, StarIcon, TrashIcon } from './icons/index.js';
import type { BookmarkDetail, TFn } from './types.js';

// Detail side panel. Every edit goes out as an op through onCommitField — nothing here writes.

export type DrawerField = 'title' | 'summary' | 'note';

export interface BookmarkDrawerProps {
  t: TFn;
  detail: BookmarkDetail | null;
  loading?: boolean;
  onClose: () => void;
  onCommitField: (field: DrawerField, value: string) => void;
  onAddTag: (label: string) => void;
  onRemoveTag: (tagId: string) => void;
  onToggleStar: (starred: boolean) => void;
  onOpenExternal: (url: string) => void;
  onDelete: () => void;
  formatDate?: (iso: string) => string;
}

export function BookmarkDrawer({
  t,
  detail,
  loading = false,
  onClose,
  onCommitField,
  onAddTag,
  onRemoveTag,
  onToggleStar,
  onOpenExternal,
  onDelete,
  formatDate = (iso) => new Date(iso).toLocaleString(),
}: BookmarkDrawerProps) {
  const [tagDraft, setTagDraft] = useState('');
  // Hoisted out of the JSX so the field names stay plain values, not "strings in markup".
  const commitTitle = (v: string): void => onCommitField('title', v);
  const commitSummary = (v: string): void => onCommitField('summary', v);
  const commitNote = (v: string): void => onCommitField('note', v);
  if (!detail && !loading) return null;

  return (
    <aside
      role="complementary"
      aria-label={t('drawer.title')}
      data-testid="bookmark-drawer"
      className="flex w-[26rem] shrink-0 flex-col border-l border-line-1 bg-surface-1"
    >
      <header className="flex items-center justify-between border-b border-line-1 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-fg-1">{t('drawer.title')}</h2>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label={t('common.close')}>
          <CloseIcon className="h-4 w-4" />
        </Button>
      </header>

      {!detail ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner label={t('common.loading')} />
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-4 overflow-auto px-4 py-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <PlatformBadge t={t} url={detail.url} platform={detail.platform} author={detail.author} />
            <ConfidenceBadge t={t} score={detail.confidence} reason={detail.confidenceReason} />
          </div>

          <div>
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-fg-3">
              {t('drawer.titleField')}
            </div>
            <div className="text-base font-semibold text-fg-1">
              <EditableField
                value={detail.title ?? ''}
                placeholder={t('drawer.titlePlaceholder')}
                ariaLabel={t('drawer.titleField')}
                onCommit={commitTitle}
              />
            </div>
          </div>

          <div>
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-fg-3">
              {t('drawer.url')}
            </div>
            <button
              type="button"
              onClick={() => onOpenExternal(detail.url)}
              className="inline-flex max-w-full items-start gap-1 break-all text-left text-xs text-accent hover:underline"
            >
              <span className="break-all">{detail.url}</span>
              <ExternalLinkIcon className="mt-0.5 h-3 w-3 shrink-0" />
            </button>
          </div>

          <div>
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-fg-3">
              {t('drawer.summary')}
            </div>
            <div className="leading-relaxed text-fg-2">
              <EditableField
                multiline
                value={detail.summary ?? ''}
                placeholder={t('drawer.summaryPlaceholder')}
                ariaLabel={t('drawer.summary')}
                onCommit={commitSummary}
              />
            </div>
          </div>

          <div>
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-fg-3">
              {t('drawer.note')}
            </div>
            <div className="leading-relaxed text-fg-2">
              <EditableField
                multiline
                value={detail.note ?? ''}
                placeholder={t('drawer.notePlaceholder')}
                ariaLabel={t('drawer.note')}
                onCommit={commitNote}
              />
            </div>
          </div>

          <div>
            <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-fg-3">
              {t('drawer.tags')}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {detail.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-1 rounded-full border border-line-1 bg-surface-2 px-2 py-0.5 text-xs text-fg-2"
                >
                  {tag.label}
                  <button
                    type="button"
                    aria-label={t('drawer.removeTag', { label: tag.label })}
                    onClick={() => onRemoveTag(tag.id)}
                    className="rounded-full p-0.5 hover:bg-surface-3"
                  >
                    <CloseIcon className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <form
              className="mt-2"
              onSubmit={(e) => {
                e.preventDefault();
                const v = tagDraft.trim();
                if (!v) return;
                onAddTag(v);
                setTagDraft('');
              }}
            >
              <Input
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                placeholder={t('drawer.addTagPlaceholder')}
                aria-label={t('drawer.addTag')}
              />
            </form>
          </div>

          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-line-1 pt-3 text-xs text-fg-3">
            <dt>{t('drawer.created')}</dt>
            <dd className="text-fg-2">{formatDate(detail.createdAt)}</dd>
            <dt>{t('drawer.updated')}</dt>
            <dd className="text-fg-2">{formatDate(detail.updatedAt)}</dd>
            <dt>{t('drawer.status')}</dt>
            <dd className="text-fg-2">{t(`status.${detail.status}`)}</dd>
          </dl>

          <div className="flex items-center gap-2 border-t border-line-1 pt-3">
            <Button size="sm" onClick={() => onToggleStar(!detail.starred)}>
              {detail.starred ? (
                <StarFilledIcon className="h-3.5 w-3.5 text-warn" />
              ) : (
                <StarIcon className="h-3.5 w-3.5" />
              )}
              <span>{detail.starred ? t('drawer.unstar') : t('drawer.star')}</span>
            </Button>
            <Button size="sm" variant="primary" onClick={() => onOpenExternal(detail.url)}>
              <ExternalLinkIcon className="h-3.5 w-3.5" />
              <span>{t('drawer.open')}</span>
            </Button>
            <Button size="sm" variant="danger" className="ml-auto" onClick={onDelete}>
              <TrashIcon className="h-3.5 w-3.5" />
              <span>{t('drawer.delete')}</span>
            </Button>
          </div>
        </div>
      )}
    </aside>
  );
}
