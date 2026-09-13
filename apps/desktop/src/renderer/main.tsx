import React from 'react';
import ReactDOM from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { i18n, initI18n } from './i18n';
import { useSettingsStore, DEFAULT_SETTINGS } from './state';
import { App } from './App';
import './index.css';

// Boot order: settings → i18n → first paint. Theme application lives in useSettingsStore, so
// this only has to make sure the store has loaded before React renders.
async function boot(): Promise<void> {
  await useSettingsStore.getState().load();
  const { locale } = useSettingsStore.getState().settings ?? DEFAULT_SETTINGS;
  await initI18n(locale);

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <I18nextProvider i18n={i18n}>
        <App />
      </I18nextProvider>
    </React.StrictMode>,
  );
}

void boot();
