import type { Clock, DbHandle } from '../ports/index.js';
import type { Locale, UiSettings } from './dto.js';

// settings:get / settings:set (channel 32). `settings` is a local key→JSON store: it is not
// shareable, never travels in a bundle and never goes through applyOp.

export const SETTINGS_UI_KEY = 'ui';
export const DEFAULT_UI_SETTINGS: UiSettings = { locale: 'fr', theme: 'dark' };

export function getSetting<T>(db: DbHandle, key: string, fallback: T): T {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get<{ value: string }>(key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export function setSetting(db: DbHandle, clock: Clock, key: string, value: unknown): void {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?,?,?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(key, JSON.stringify(value ?? null), clock.iso());
}

function isLocale(v: unknown): v is Locale {
  return v === 'fr' || v === 'en';
}

function isTheme(v: unknown): v is UiSettings['theme'] {
  return v === 'dark' || v === 'light';
}

/** Always a complete, valid object: an unknown or corrupt stored value falls back per field. */
export function getUiSettings(db: DbHandle): UiSettings {
  const stored = getSetting<Partial<UiSettings>>(db, SETTINGS_UI_KEY, {});
  return {
    locale: isLocale(stored.locale) ? stored.locale : DEFAULT_UI_SETTINGS.locale,
    theme: isTheme(stored.theme) ? stored.theme : DEFAULT_UI_SETTINGS.theme,
  };
}

export function patchUiSettings(
  db: DbHandle,
  clock: Clock,
  patch: Partial<UiSettings>,
): UiSettings {
  const next: UiSettings = { ...getUiSettings(db) };
  if (isLocale(patch.locale)) next.locale = patch.locale;
  if (isTheme(patch.theme)) next.theme = patch.theme;
  setSetting(db, clock, SETTINGS_UI_KEY, next);
  return next;
}
