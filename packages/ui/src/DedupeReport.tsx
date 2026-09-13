import { WarningIcon } from './icons/index.js';
import type { TFn } from './types.js';

// The report P0 task 13 requires *before* the transaction commits: four counts, then the first
// 50 duplicates and the first 50 malformed lines so the user can judge before writing anything.

export interface DedupeReportProps {
  t: TFn;
  total: number;
  newCount: number;
  duplicateCount: number;
  malformedCount: number;
  duplicates: { url: string; existingId: string }[];
  malformed: { raw: string; reason: string }[];
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg border border-line-1 bg-surface-1 px-3 py-2">
      <div className={`text-xl font-semibold tabular-nums ${tone}`}>{value}</div>
      <div className="text-[11px] uppercase tracking-wider text-fg-3">{label}</div>
    </div>
  );
}

export function DedupeReport({
  t,
  total,
  newCount,
  duplicateCount,
  malformedCount,
  duplicates,
  malformed,
}: DedupeReportProps) {
  return (
    <section data-testid="dedupe-report" className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label={t('import.report.total')} value={total} tone="text-fg-1" />
        <Stat label={t('import.report.new')} value={newCount} tone="text-ok" />
        <Stat label={t('import.report.duplicates')} value={duplicateCount} tone="text-warn" />
        <Stat label={t('import.report.malformed')} value={malformedCount} tone="text-danger" />
      </div>

      {duplicates.length > 0 ? (
        <details className="rounded-lg border border-line-1 bg-surface-1">
          <summary className="cursor-pointer px-3 py-2 text-sm text-fg-2">
            {t('import.report.duplicatesSample', { n: duplicates.length })}
          </summary>
          <ul className="max-h-48 overflow-auto border-t border-line-1 px-3 py-2 text-xs text-fg-3">
            {duplicates.map((d) => (
              <li key={d.existingId + d.url} className="truncate py-0.5">
                {d.url}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {malformed.length > 0 ? (
        <details className="rounded-lg border border-danger/40 bg-danger/5">
          <summary className="flex cursor-pointer items-center gap-1.5 px-3 py-2 text-sm text-danger">
            <WarningIcon className="h-4 w-4" />
            <span>{t('import.report.malformedSample', { n: malformed.length })}</span>
          </summary>
          <ul className="max-h-48 overflow-auto border-t border-danger/30 px-3 py-2 text-xs text-fg-2">
            {malformed.map((m, i) => (
              <li key={`${i}-${m.reason}`} className="py-0.5">
                <span className="text-danger">
                  {t(`import.malformed.${m.reason}`, { defaultValue: m.reason })}
                </span>
                <span className="ml-2 break-all text-fg-3">{m.raw}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
