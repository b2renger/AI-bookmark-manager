import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { Locale } from '../../shared/protocol';
import frCommon from './fr/common.json';
import enCommon from './en/common.json';

// FR is the source-of-truth locale, EN is the fallback. Namespaces are added per screen
// (library, map, tree, review, ask, import, settings, egress, sharing, errors). The CI script
// apps/desktop/scripts/check-i18n.mjs asserts FR and EN key sets are identical and non-empty.
export const i18n = i18next;

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
    ns: ['common'],
    resources: {
      fr: { common: frCommon },
      en: { common: enCommon },
    },
    interpolation: { escapeValue: false },
    returnNull: false,
  });
}
