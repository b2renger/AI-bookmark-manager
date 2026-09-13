import { Select } from './Input.js';
import type { TFn } from './types.js';

// The mapper UI of P0 task 12: CSV/JSON headers → the canonical shape, with the first rows of
// the file shown underneath so the choice can be checked without importing.

export const CANONICAL_FIELDS = [
  'url',
  'title',
  'tags',
  'folderPath',
  'createdAt',
  'note',
  'ignore',
] as const;

export type CanonicalFieldKey = (typeof CANONICAL_FIELDS)[number];

export interface ColumnMapperProps {
  t: TFn;
  headers: string[];
  mapping: Record<string, string>;
  /** Raw rows as parsed, keyed by header. */
  sample: Record<string, string>[];
  onChange: (header: string, field: CanonicalFieldKey) => void;
}

export function ColumnMapper({ t, headers, mapping, sample, onChange }: ColumnMapperProps) {
  const options = CANONICAL_FIELDS.map((f) => ({ value: f, label: t(`import.field.${f}`) }));
  // Resolved outside the JSX: the default field is a value, not copy.
  const columns = headers.map((header) => ({
    header,
    field: (mapping[header] ?? 'ignore') as CanonicalFieldKey,
  }));
  const mappedUrl = columns.some((c) => c.field === 'url');

  return (
    <section data-testid="column-mapper" className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {columns.map((c) => (
          <Select
            key={c.header}
            label={c.header}
            options={options}
            value={c.field}
            aria-label={t('import.mapColumn', { header: c.header })}
            onChange={(e) => onChange(c.header, e.target.value as CanonicalFieldKey)}
          />
        ))}
      </div>

      {!mappedUrl ? (
        <p role="alert" className="text-xs text-danger">
          {t('import.urlRequired')}
        </p>
      ) : null}

      {sample.length > 0 ? (
        <div className="overflow-auto rounded-lg border border-line-1">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-2 text-fg-3">
              <tr>
                {columns.map((c) => (
                  <th key={c.header} className="whitespace-nowrap px-2 py-1.5 font-medium">
                    {c.header}
                    <span className="ml-1 text-accent">
                      {t('import.mappedTo', { field: t(`import.field.${c.field}`) })}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-fg-2">
              {sample.slice(0, 5).map((row, i) => (
                <tr key={i} className="border-t border-line-1">
                  {headers.map((h) => (
                    <td key={h} className="max-w-48 truncate px-2 py-1">
                      {row[h] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
