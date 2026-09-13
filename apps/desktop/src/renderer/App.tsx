import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Spinner } from '@cairn/ui';
import type { AppInfo, Locale } from '../shared/protocol';

export function App() {
  const { t, i18n } = useTranslation('common');
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    void window.cairn.app.info().then(setInfo);
  }, []);

  const setLocale = async (locale: Locale) => {
    await window.cairn.settings.set({ locale });
    await i18n.changeLanguage(locale);
    document.documentElement.lang = locale;
  };

  return (
    <div className="min-h-screen bg-surface-0 text-fg-1 font-sans">
      <header className="flex items-center justify-between border-b border-line-1 px-6 py-3">
        <h1 className="text-lg font-semibold tracking-tight">{t('app.name')}</h1>
        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            className={`rounded px-2 py-1 ${i18n.language === 'fr' ? 'bg-surface-3' : 'hover:bg-surface-2'}`}
            onClick={() => void setLocale('fr')}
          >
            FR
          </button>
          <button
            type="button"
            className={`rounded px-2 py-1 ${i18n.language === 'en' ? 'bg-surface-3' : 'hover:bg-surface-2'}`}
            onClick={() => void setLocale('en')}
          >
            EN
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-4xl p-8">
        <p className="text-fg-2">{t('app.tagline')}</p>
        <section className="mt-8 rounded-lg border border-line-1 bg-surface-1 p-4 text-sm">
          <h2 className="mb-2 font-medium">{t('app.status')}</h2>
          {info ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-fg-2">
              <dt>{t('app.version')}</dt>
              <dd className="font-mono text-fg-1">{info.version}</dd>
              <dt>{t('app.platform')}</dt>
              <dd className="font-mono text-fg-1">
                {info.platform} / {info.arch}
              </dd>
              <dt>{t('app.database')}</dt>
              <dd className="break-all font-mono text-fg-1">{info.dbPath}</dd>
            </dl>
          ) : (
            <Spinner label={t('app.loading')} />
          )}
        </section>
      </main>
    </div>
  );
}
