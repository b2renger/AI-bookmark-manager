import { Button } from './Button.js';
import { Input, Select } from './Input.js';
import { CloseIcon, SearchIcon } from './icons/index.js';
import { SORT_KEYS, type FacetCount, type SortKey, type TFn } from './types.js';

// The surviving half of legacy/components/BookmarkList.tsx: the search box, the platform pills
// with counts and the sort select. The state itself lives in useLibraryStore and the filtering
// happens in SQL — 100k rows cannot be filtered in JS (TECHNICAL-DESIGN §6.3).

export interface FilterValue {
  text: string;
  platform: string | null;
  status: string | null;
  sort: SortKey;
}

export interface FilterBarProps {
  t: TFn;
  value: FilterValue;
  /** Facet counts from the same query; `platform` pills render in this order. */
  platformFacets: FacetCount[];
  statusFacets: FacetCount[];
  total: number;
  loading?: boolean;
  onChange: (patch: Partial<FilterValue>) => void;
}

export function FilterBar({
  t,
  value,
  platformFacets,
  statusFacets,
  total,
  loading = false,
  onChange,
}: FilterBarProps) {
  const sortOptions = SORT_KEYS.map((key) => ({ value: key, label: t(`sort.${key}`) }));
  const statusOptions = [
    { value: '', label: t('filter.allStatuses') },
    ...statusFacets.map((f) => ({
      value: f.key,
      label: t('filter.statusOption', { status: t(`status.${f.key}`), n: f.count }),
    })),
  ];

  const hasFilters = value.text !== '' || value.platform !== null || value.status !== null;

  return (
    <div
      data-testid="filter-bar"
      className="flex flex-wrap items-end gap-3 border-b border-line-1 bg-surface-1 px-4 py-3"
    >
      <div className="min-w-56 flex-1">
        <Input
          id="library-search"
          type="search"
          value={value.text}
          leading={<SearchIcon className="h-4 w-4" />}
          placeholder={t('filter.searchPlaceholder')}
          aria-label={t('filter.search')}
          onChange={(e) => onChange({ text: e.target.value })}
        />
      </div>

      <div role="group" aria-label={t('filter.platform')} className="flex flex-wrap items-center gap-1.5">
        <Button
          size="sm"
          variant={value.platform === null ? 'primary' : 'ghost'}
          aria-pressed={value.platform === null}
          onClick={() => onChange({ platform: null })}
        >
          {t('filter.allPlatforms', { n: total })}
        </Button>
        {platformFacets.map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant={value.platform === f.key ? 'primary' : 'ghost'}
            aria-pressed={value.platform === f.key}
            data-testid={`platform-pill-${f.key}`}
            onClick={() => onChange({ platform: value.platform === f.key ? null : f.key })}
          >
            {t('filter.platformOption', { platform: t(`platform.${f.key}`), n: f.count })}
          </Button>
        ))}
      </div>

      <Select
        id="library-status"
        label={t('filter.status')}
        options={statusOptions}
        value={value.status ?? ''}
        className="w-44"
        onChange={(e) => onChange({ status: e.target.value === '' ? null : e.target.value })}
      />

      <Select
        id="library-sort"
        label={t('filter.sort')}
        options={sortOptions}
        value={value.sort}
        className="w-48"
        onChange={(e) => onChange({ sort: e.target.value as SortKey })}
      />

      {hasFilters ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onChange({ text: '', platform: null, status: null })}
        >
          <CloseIcon className="h-3.5 w-3.5" />
          <span>{t('filter.reset')}</span>
        </Button>
      ) : null}

      <span className="ml-auto self-center text-xs text-fg-3" aria-live="polite">
        {loading ? t('filter.loading') : t('filter.results', { n: total })}
      </span>
    </div>
  );
}
