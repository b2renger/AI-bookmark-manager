import { Spinner } from './Spinner.js';
import { AlertCircleIcon, CheckIcon } from './icons/index.js';
import type { TFn } from './types.js';

export type ImportPhaseKey =
  | 'parsing' | 'deduping' | 'inserting' | 'indexing' | 'done' | 'error';

export const IMPORT_PHASES: readonly ImportPhaseKey[] = [
  'parsing',
  'deduping',
  'inserting',
  'indexing',
] as const;

export interface ImportProgressProps {
  t: TFn;
  phase: ImportPhaseKey;
  done: number;
  total: number;
  message?: string | null;
}

export function ImportProgress({ t, phase, done, total, message }: ImportProgressProps) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const failed = phase === 'error';
  const finished = phase === 'done';

  return (
    <div data-testid="import-progress" className="space-y-2" aria-live="polite">
      <div className="flex items-center gap-2 text-sm">
        {finished ? (
          <CheckIcon className="h-4 w-4 text-ok" />
        ) : failed ? (
          <AlertCircleIcon className="h-4 w-4 text-danger" />
        ) : (
          <Spinner className="h-4 w-4 text-accent" label={t('common.loading')} />
        )}
        <span className={failed ? 'text-danger' : 'text-fg-1'}>{t(`import.phase.${phase}`)}</span>
        <span className="ml-auto text-xs tabular-nums text-fg-3">
          {t('import.progressCount', { done, total })}
        </span>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
        <div
          data-testid="import-progress-bar"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t(`import.phase.${phase}`)}
          className={`h-full rounded-full transition-[width] ${
            failed ? 'bg-danger' : finished ? 'bg-ok' : 'bg-accent'
          }`}
          style={{ width: `${finished ? 100 : pct}%` }}
        />
      </div>

      <ol className="flex gap-3 text-[11px] text-fg-3">
        {IMPORT_PHASES.map((p) => (
          <li
            key={p}
            className={
              p === phase ? 'font-semibold text-accent' : finished ? 'text-fg-2' : undefined
            }
          >
            {t(`import.phase.${p}`)}
          </li>
        ))}
      </ol>

      {message ? <p className="text-xs text-fg-2">{message}</p> : null}
    </div>
  );
}
