import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Button, DownloadIcon, MoonIcon, SunIcon } from '@cairn/ui';
import type { ExportTarget } from '../../shared/protocol';
import { call, useSettingsStore, useToastStore } from '../state';
import { useT } from '../i18n/useT';

const TARGETS: ExportTarget[] = ['json', 'netscape', 'markdown', 'db'];

function Section({
  title,
  help,
  children,
}: {
  title: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line-1 bg-surface-1 p-4">
      <h2 className="text-sm font-medium text-fg-1">{title}</h2>
      {help ? <p className="mt-0.5 text-xs text-fg-3">{help}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function SettingsScreen() {
  const t = useT('settings');
  const settings = useSettingsStore((s) => s.settings);
  const info = useSettingsStore((s) => s.info);
  const loadInfo = useSettingsStore((s) => s.loadInfo);
  const setLocale = useSettingsStore((s) => s.setLocale);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const toast = useToastStore((s) => s.success);

  const [targets, setTargets] = useState<ExportTarget[]>(['json']);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!info) void loadInfo();
  }, [info, loadInfo]);

  const runExport = async (): Promise<void> => {
    const dir = await call('errors.dialog.openDir', (c) => c.dialog.openDir());
    if (!dir) return;
    setExporting(true);
    const res = await call('errors.export.run', (c) => c.export.run({ targets, dir }));
    setExporting(false);
    if (res) toast('toast.exported', { n: res.files.length });
  };

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6">
        <h1 className="text-base font-semibold text-fg-1">{t('settings.title')}</h1>

        <Section title={t('settings.locale.title')} help={t('settings.locale.help')}>
          <div className="flex gap-2">
            <Button
              variant={settings.locale === 'fr' ? 'primary' : 'secondary'}
              onClick={() => void setLocale('fr')}
            >
              {t('settings.locale.fr')}
            </Button>
            <Button
              variant={settings.locale === 'en' ? 'primary' : 'secondary'}
              onClick={() => void setLocale('en')}
            >
              {t('settings.locale.en')}
            </Button>
          </div>
        </Section>

        <Section title={t('settings.theme.title')} help={t('settings.theme.help')}>
          <div className="flex gap-2">
            <Button
              variant={settings.theme === 'dark' ? 'primary' : 'secondary'}
              onClick={() => void setTheme('dark')}
            >
              <MoonIcon className="h-4 w-4" />
              <span>{t('settings.theme.dark')}</span>
            </Button>
            <Button
              variant={settings.theme === 'light' ? 'primary' : 'secondary'}
              onClick={() => void setTheme('light')}
            >
              <SunIcon className="h-4 w-4" />
              <span>{t('settings.theme.light')}</span>
            </Button>
          </div>
        </Section>

        <Section title={t('settings.ai.title')} help={t('settings.ai.help')}>
          <p className="text-sm text-fg-2">{t('settings.ai.body')}</p>
        </Section>

        <Section title={t('settings.export.title')} help={t('settings.export.help')}>
          <div className="flex flex-wrap gap-3">
            {TARGETS.map((target) => (
              <label key={target} className="flex items-center gap-1.5 text-sm text-fg-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-accent"
                  checked={targets.includes(target)}
                  onChange={(e) =>
                    setTargets((prev) =>
                      e.target.checked ? [...prev, target] : prev.filter((x) => x !== target),
                    )
                  }
                />
                <span>{t(`settings.export.target.${target}`)}</span>
              </label>
            ))}
          </div>
          <div className="mt-3">
            <Button
              variant="primary"
              disabled={exporting || targets.length === 0}
              onClick={() => void runExport()}
            >
              <DownloadIcon className="h-4 w-4" />
              <span>{t('settings.export.run')}</span>
            </Button>
          </div>
        </Section>

        <Section title={t('settings.about.title')}>
          {info ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm text-fg-3">
              <dt>{t('settings.about.version')}</dt>
              <dd className="font-mono text-fg-1">{info.version}</dd>
              <dt>{t('settings.about.platform')}</dt>
              <dd className="font-mono text-fg-1">
                {t('settings.about.platformValue', { platform: info.platform, arch: info.arch })}
              </dd>
              <dt>{t('settings.about.userData')}</dt>
              <dd className="break-all font-mono text-fg-1">{info.userDataPath}</dd>
              <dt>{t('settings.about.database')}</dt>
              <dd className="break-all font-mono text-fg-1">{info.dbPath}</dd>
            </dl>
          ) : (
            <p className="text-sm text-fg-3">{t('settings.about.unavailable')}</p>
          )}
        </Section>
      </div>
    </div>
  );
}
