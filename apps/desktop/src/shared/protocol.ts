// IPC contract shared by main, preload and renderer. Channel names are constants; every payload
// is typed here and nowhere else. Channels are added phase by phase (plans/TECHNICAL-DESIGN.md §2.2).

export const IPC = {
  APP_INFO: 'app:info',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
} as const;

export interface AppInfo {
  version: string;
  platform: string; // process.platform: win32 | darwin | linux
  arch: string;
  userDataPath: string;
  dbPath: string;
  locale: string;
  dev: boolean;
}

export type Locale = 'fr' | 'en';

export interface Settings {
  locale: Locale;
  theme: 'dark' | 'light';
}

export interface CairnApi {
  app: {
    info(): Promise<AppInfo>;
  };
  settings: {
    get(): Promise<Settings>;
    set(patch: Partial<Settings>): Promise<Settings>;
  };
}
