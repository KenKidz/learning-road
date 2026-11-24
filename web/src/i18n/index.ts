import { createI18n } from 'vue-i18n';
import vi from './vi';
import en from './en';

export const SUPPORTED_LOCALES = ['vi', 'en'] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

const STORAGE_KEY = 'lr-locale';

function initialLocale(): AppLocale {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'vi' || stored === 'en') return stored;
  return 'vi';
}

const initial = initialLocale();

export const i18n = createI18n({
  legacy: false,
  locale: initial,
  fallbackLocale: 'en',
  messages: { vi, en },
  missingWarn: false,
  fallbackWarn: false,
});

export function currentLocale(): AppLocale {
  return i18n.global.locale.value;
}

export function setLocale(locale: AppLocale): void {
  i18n.global.locale.value = locale;
  window.localStorage.setItem(STORAGE_KEY, locale);
  document.documentElement.lang = locale;
}

export function translate(key: string, named: Record<string, unknown> = {}): string {
  return i18n.global.t(key, named);
}

document.documentElement.lang = initial;
