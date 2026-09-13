import { create } from 'zustand';
import type { AppInfo, Locale, Settings } from '../../shared/protocol';
import { i18n } from '../i18n';
import { call } from './ipc';
import { useToastStore } from './toast';

// Theme application lives here, not in main.tsx: `data-theme` on <html> is a consequence of the
// settings state and must follow it whoever changed it.

export const DEFAULT_SETTINGS: Settings = { locale: 'fr', theme: 'dark' };

export function applyTheme(theme: Settings['theme']): void {
  document.documentElement.dataset['theme'] = theme;
}

export function applyLocale(locale: Locale): void {
  document.documentElement.lang = locale;
}

interface SettingsState {
  settings: Settings;
  info: AppInfo | null;
  loaded: boolean;
  load: () => Promise<void>;
  loadInfo: () => Promise<void>;
  patch: (patch: Partial<Settings>) => Promise<void>;
  setLocale: (locale: Locale) => Promise<void>;
  setTheme: (theme: Settings['theme']) => Promise<void>;
  toggleTheme: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  settings: DEFAULT_SETTINGS,
  info: null,
  loaded: false,

  load: async () => {
    const settings = await call('errors.settings.load', (c) => c.settings.get());
    const next = settings ?? DEFAULT_SETTINGS;
    set({ settings: next, loaded: true });
    applyTheme(next.theme);
    applyLocale(next.locale);
  },

  loadInfo: async () => {
    const info = await call('errors.app.info', (c) => c.app.info());
    if (info) set({ info });
  },

  patch: async (patch) => {
    // Optimistic: the chrome must not lag behind the click.
    const optimistic = { ...get().settings, ...patch };
    set({ settings: optimistic });
    if (patch.theme) applyTheme(patch.theme);
    if (patch.locale) {
      applyLocale(patch.locale);
      await i18n.changeLanguage(patch.locale);
    }
    const saved = await call('errors.settings.save', (c) => c.settings.set(patch));
    if (saved) {
      set({ settings: saved });
      applyTheme(saved.theme);
      applyLocale(saved.locale);
    } else {
      useToastStore.getState().info('toast.settingsNotPersisted');
    }
  },

  setLocale: (locale) => get().patch({ locale }),
  setTheme: (theme) => get().patch({ theme }),
  toggleTheme: () => get().patch({ theme: get().settings.theme === 'dark' ? 'light' : 'dark' }),
}));
