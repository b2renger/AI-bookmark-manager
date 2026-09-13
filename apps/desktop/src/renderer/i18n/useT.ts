import { useTranslation } from 'react-i18next';
import type { TFn } from '@cairn/ui';
import type { Locale } from '../../shared/protocol';

// packages/ui takes `t` as a plain (key, opts) => string. react-i18next's TFunction carries a
// stack of generic overloads that do not narrow to that shape, so it is adapted once, here.
export function useT(ns: string): TFn {
  const { t } = useTranslation(ns);
  return t as unknown as TFn;
}

export function useLocale(): Locale {
  const { i18n } = useTranslation();
  return (i18n.resolvedLanguage ?? i18n.language ?? 'fr').startsWith('en') ? 'en' : 'fr';
}
