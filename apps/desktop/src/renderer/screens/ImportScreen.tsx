import { useEffect } from 'react';
import {
  Button,
  ColumnMapper,
  DedupeReport,
  EmptyState,
  ImportIcon,
  ImportProgress,
  Textarea,
  type CanonicalFieldKey,
} from '@cairn/ui';
import { useImportStore, useNavStore } from '../state';
import { useT } from '../i18n/useT';

// pick → map → preview → committing → done | error. The step enum and its rendering are the
// shape of legacy/components/NotionSyncModal.tsx, reused for import (§6.3).

const STEPS = ['pick', 'map', 'preview', 'committing', 'done'] as const;

function StepBar({ step, t }: { step: string; t: (k: string) => string }) {
  const index = STEPS.indexOf(step as (typeof STEPS)[number]);
  return (
    <ol className="flex items-center gap-2 text-xs" aria-label={t('import.steps')}>
      {STEPS.map((s, i) => (
        <li
          key={s}
          aria-current={s === step ? 'step' : undefined}
          className={`rounded-full border px-2 py-0.5 ${
            s === step
              ? 'border-accent bg-accent/10 text-accent'
              : i < index
                ? 'border-line-1 text-fg-2'
                : 'border-line-1 text-fg-3'
          }`}
        >
          {t(`import.step.${s}`)}
        </li>
      ))}
    </ol>
  );
}

export function ImportScreen() {
  const t = useT('import');
  const setScreen = useNavStore((s) => s.setScreen);

  const step = useImportStore((s) => s.step);
  const kind = useImportStore((s) => s.kind);
  const source = useImportStore((s) => s.source);
  const sourceLabel = useImportStore((s) => s.sourceLabel);
  const pasteText = useImportStore((s) => s.pasteText);
  const mapping = useImportStore((s) => s.mapping);
  const preview = useImportStore((s) => s.preview);
  const progress = useImportStore((s) => s.progress);
  const enqueueFetch = useImportStore((s) => s.enqueueFetch);
  const busy = useImportStore((s) => s.busy);
  const errorKey = useImportStore((s) => s.errorKey);
  const errorDetail = useImportStore((s) => s.errorDetail);
  const result = useImportStore((s) => s.result);

  const setPasteText = useImportStore((s) => s.setPasteText);
  const setEnqueueFetch = useImportStore((s) => s.setEnqueueFetch);
  const setMappingField = useImportStore((s) => s.setMappingField);
  const pickFile = useImportStore((s) => s.pickFile);
  const usePaste = useImportStore((s) => s.usePaste);
  const runPreview = useImportStore((s) => s.runPreview);
  const back = useImportStore((s) => s.back);
  const commit = useImportStore((s) => s.commit);
  const reset = useImportStore((s) => s.reset);
  const subscribe = useImportStore((s) => s.subscribe);

  useEffect(() => subscribe(), [subscribe]);

  const sampleRows = (preview?.sample ?? []).map((r) => {
    const row: Record<string, string> = {};
    for (const h of preview?.headers ?? []) row[h] = '';
    row['url'] = r.url;
    if (r.title !== null) row['title'] = r.title;
    return row;
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <header className="flex items-center justify-between border-b border-line-1 bg-surface-1 px-4 py-3">
        <div>
          <h1 className="text-sm font-semibold text-fg-1">{t('import.title')}</h1>
          <p className="text-xs text-fg-3">{t('import.subtitle')}</p>
        </div>
        <StepBar step={step} t={t} />
      </header>

      <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6">
        {step === 'pick' ? (
          <section className="space-y-4">
            <div className="rounded-lg border border-line-1 bg-surface-1 p-4">
              <h2 className="mb-1 text-sm font-medium text-fg-1">{t('import.source.file')}</h2>
              <p className="mb-3 text-xs text-fg-3">{t('import.source.fileHint')}</p>
              <div className="flex items-center gap-3">
                <Button variant="secondary" onClick={() => void pickFile()}>
                  <ImportIcon className="h-4 w-4" />
                  <span>{t('import.source.choose')}</span>
                </Button>
                {sourceLabel ? (
                  <span className="truncate font-mono text-xs text-fg-2">{sourceLabel}</span>
                ) : null}
              </div>
            </div>

            <div className="rounded-lg border border-line-1 bg-surface-1 p-4">
              <h2 className="mb-1 text-sm font-medium text-fg-1">{t('import.source.paste')}</h2>
              <p className="mb-3 text-xs text-fg-3">{t('import.source.pasteHint')}</p>
              <Textarea
                id="import-paste"
                rows={6}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={t('import.source.pastePlaceholder')}
                aria-label={t('import.source.paste')}
              />
              <div className="mt-2">
                <Button size="sm" disabled={!pasteText.trim()} onClick={usePaste}>
                  {t('import.source.usePaste')}
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="primary"
                disabled={source === null || busy}
                onClick={() => void runPreview()}
              >
                {t('import.analyse')}
              </Button>
              <span className="text-xs text-fg-3">
                {t('import.importer.label', { importer: t(`import.importer.${kind}`) })}
              </span>
            </div>
          </section>
        ) : null}

        {step === 'map' && preview ? (
          <section className="space-y-4">
            <p className="text-xs text-fg-3">
              {t('import.importer.detected', { importer: t(`import.importer.${preview.importer}`) })}
            </p>
            <ColumnMapper
              t={t}
              headers={preview.headers ?? []}
              mapping={mapping}
              sample={sampleRows}
              onChange={(header: string, field: CanonicalFieldKey) => setMappingField(header, field)}
            />
            <div className="flex gap-2">
              <Button onClick={back}>{t('import.back')}</Button>
              <Button variant="primary" disabled={busy} onClick={() => void runPreview()}>
                {t('import.analyse')}
              </Button>
            </div>
          </section>
        ) : null}

        {step === 'preview' && preview ? (
          <section className="space-y-4">
            <p className="text-xs text-fg-3">
              {t('import.importer.detected', { importer: t(`import.importer.${preview.importer}`) })}
            </p>
            <DedupeReport
              t={t}
              total={preview.total}
              newCount={preview.newCount}
              duplicateCount={preview.duplicateCount}
              malformedCount={preview.malformedCount}
              duplicates={preview.duplicates}
              malformed={preview.malformed}
            />
            <label className="flex items-center gap-2 text-sm text-fg-2">
              <input
                type="checkbox"
                checked={enqueueFetch}
                onChange={(e) => setEnqueueFetch(e.target.checked)}
                className="h-4 w-4 accent-accent"
              />
              <span>{t('import.enqueueFetch')}</span>
            </label>
            <div className="flex gap-2">
              <Button onClick={back}>{t('import.back')}</Button>
              <Button
                variant="primary"
                disabled={busy || preview.newCount === 0}
                onClick={() => void commit()}
              >
                {t('import.commit', { n: preview.newCount })}
              </Button>
            </div>
          </section>
        ) : null}

        {step === 'committing' ? (
          <section className="rounded-lg border border-line-1 bg-surface-1 p-4">
            <ImportProgress
              t={t}
              phase={progress.phase}
              done={progress.done}
              total={progress.total}
              message={progress.message}
            />
          </section>
        ) : null}

        {step === 'done' && result ? (
          <EmptyState
            icon={<ImportIcon className="h-6 w-6" />}
            title={t('import.done.title')}
            description={t('import.done.body', { n: result.inserted, skipped: result.skipped })}
            action={
              <div className="flex gap-2">
                <Button variant="primary" onClick={() => setScreen('library')}>
                  {t('import.done.toLibrary')}
                </Button>
                <Button onClick={reset}>{t('import.restart')}</Button>
              </div>
            }
          />
        ) : null}

        {step === 'error' ? (
          <div role="alert" className="space-y-3 rounded-lg border border-danger/50 bg-danger/10 p-4">
            <p className="text-sm text-fg-1">{t(errorKey ?? 'errors.unknown')}</p>
            {errorDetail ? (
              <p className="break-all font-mono text-xs text-fg-3">{errorDetail}</p>
            ) : null}
            <Button onClick={reset}>{t('import.restart')}</Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
