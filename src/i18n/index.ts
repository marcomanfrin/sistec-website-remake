import it, { type Dict } from './it';
import en from './en';
import { stripBase, type Locale } from './config';

export * from './config';
export type { Dict };

const dicts: Record<Locale, Dict> = { it, en };

export const useDict = (locale: Locale): Dict => dicts[locale];

/** Sostituisce i segnaposto `{nome}` in una stringa. */
export const fmt = (str: string, vars: Record<string, string | number> = {}) =>
  str.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));

export const localeFromUrl = (url: URL): Locale => {
  const path = stripBase(url.pathname);
  return path.startsWith('/en/') || path === '/en' ? 'en' : 'it';
};
