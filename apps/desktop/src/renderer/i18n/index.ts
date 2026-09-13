import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { Locale } from '../../shared/protocol';

import frCommon from './fr/common.json';
import frLibrary from './fr/library.json';
import frImport from './fr/import.json';
import frSettings from './fr/settings.json';
import frEgress from './fr/egress.json';
import frErrors from './fr/errors.json';

import enCommon from './en/common.json';
import enLibrary from './en/library.json';
import enImport from './en/import.json';
import enSettings from './en/settings.json';
import enEgress from './en/egress.json';
import enErrors from './en/errors.json';

// FR is the source-of-truth locale, EN is the fallback. apps/desktop/scripts/check-i18n.mjs
// asserts the two key sets are identical per namespace and that no value is empty.
//
// `fallbackNS` covers every namespace because packages/ui components take a single `t` and use
// keys from several of them (a table cell shows `platform.*` while its toast shows `errors.*`).

export const NAMESPACES = ['common', 'library', 'import', 'settings', 'egress', 'errors'] as const;
export type Namespace = (typeof NAMESPACES)[number];

export const i18n = i18next;

const resources = {
  fr: {
    common: frCommon,
    library: frLibrary,
    import: frImport,
    settings: frSettings,
    egress: frEgress,
    errors: frErrors,
  },
  en: {
    common: enCommon,
    library: enLibrary,
    import: enImport,
    settings: enSettings,
    egress: enEgress,
    errors: enErrors,
  },
};

export async function initI18n(locale: Locale): Promise<void> {
  if (i18next.isInitialized) {
    await i18next.changeLanguage(locale);
    return;
  }
  await i18next.use(initReactI18next).init({
    lng: locale,
    fallbackLng: 'en',
    supportedLngs: ['fr', 'en'],
    defaultNS: 'common',
    fallbackNS: [...NAMESPACES],
    ns: [...NAMESPACES],
    resources,
    interpolation: { escapeValue: false },
    returnNull: false,
  });
}
