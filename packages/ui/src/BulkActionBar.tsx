import { useState } from 'react';
import { Button } from './Button.js';
import { Input } from './Input.js';
import { CloseIcon, StarIcon, TagIcon, TrashIcon } from './icons/index.js';
import type { TFn } from './types.js';

// Port of legacy/components/BulkActionBar.tsx. Keyword append survives; remove-tag, star and
// delete are new (TECHNICAL-DESIGN §6.3). Collection move lands with collections in P1.

export interface BulkActionBarProps {
  t: TFn;
  count: number;
  busy?: boolean;
  onClear: () => void;
  onAddTag: (label: string) => void;
  onRemoveTag: (label: string) => void;
  onStar: (starred: boolean) => void;
  onDelete: () => void;
}

export function BulkActionBar({
  t,
  count,
  busy = false,
  onClear,
  onAddTag,
  onRemoveTag,
  onStar,
  onDelete,
}: BulkActionBarProps) {
  const [label, setLabel] = useState('');
  const [mode, setMode] = useState<'add' | 'remove'>('add');
  if (count === 0) return null;

  const pickAdd = (): void => setMode('add');
  const pickRemove = (): void => setMode('remove');

  const submit = (e: { preventDefault: () => void }): void => {
    e.preventDefault();
    const value = label.trim();
    if (!value) return;
    if (mode === 'add') onAddTag(value);
    else onRemoveTag(value);
    setLabel('');
  };

  return (
    <div
      role="toolbar"
      aria-label={t('bulk.toolbar')}
      data-testid="bulk-action-bar"
      className="fixed bottom-6 left-1/2 z-40 flex w-[min(56rem,95vw)] -translate-x-1/2 items-center gap-4 rounded-full border border-line-2 bg-surface-2 px-5 py-3 shadow-2xl"
    >
      <span className="flex shrink-0 items-center gap-3">
        <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-bold text-surface-0">
          {count}
        </span>
        <span className="hidden text-sm font-medium text-fg-1 sm:inline">
          {t('bulk.selected', { n: count })}
        </span>
        <Button variant="ghost" size="sm" onClick={onClear} aria-label={t('bulk.clear')}>
          <CloseIcon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{t('bulk.clear')}</span>
        </Button>
      </span>

      <span className="h-6 w-px shrink-0 bg-line-1" />

      <form onSubmit={submit} className="flex min-w-0 flex-1 items-center gap-2">
        <Button
          variant={mode === 'add' ? 'primary' : 'ghost'}
          size="sm"
          onClick={pickAdd}
          aria-pressed={mode === 'add'}
        >
          <TagIcon className="h-3.5 w-3.5" />
          <span>{t('bulk.addTag')}</span>
        </Button>
        <Button
          variant={mode === 'remove' ? 'primary' : 'ghost'}
          size="sm"
          onClick={pickRemove}
          aria-pressed={mode === 'remove'}
        >
          <span>{t('bulk.removeTag')}</span>
        </Button>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={mode === 'add' ? t('bulk.addTagPlaceholder') : t('bulk.removeTagPlaceholder')}
          aria-label={mode === 'add' ? t('bulk.addTag') : t('bulk.removeTag')}
          className="max-w-56"
        />
        <Button type="submit" variant="secondary" size="sm" disabled={busy || !label.trim()}>
          {t('bulk.apply')}
        </Button>
      </form>

      <span className="h-6 w-px shrink-0 bg-line-1" />

      <span className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => onStar(true)}>
          <StarIcon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{t('bulk.star')}</span>
        </Button>
        <Button variant="danger" size="sm" disabled={busy} onClick={onDelete}>
          <TrashIcon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{t('bulk.delete')}</span>
        </Button>
      </span>
    </div>
  );
}
