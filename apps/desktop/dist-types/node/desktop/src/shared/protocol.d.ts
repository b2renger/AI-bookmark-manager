export declare const IPC: {
    readonly APP_INFO: "app:info";
    readonly SETTINGS_GET: "settings:get";
    readonly SETTINGS_SET: "settings:set";
};
export interface AppInfo {
    version: string;
    platform: NodeJS.Platform | string;
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
//# sourceMappingURL=protocol.d.ts.map