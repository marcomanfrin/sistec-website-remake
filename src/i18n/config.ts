export const locales = ['it', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'it';

export const htmlLang: Record<Locale, string> = { it: 'it-IT', en: 'en-GB' };
export const ogLocale: Record<Locale, string> = { it: 'it_IT', en: 'en_GB' };

/** Base di pubblicazione con slash finale ("/" in produzione, es. "/sistec-website-remake/" su GitHub Pages). */
const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/');

/** Prefissa un percorso assoluto del sito (pagina o file in public/) con la base di pubblicazione. */
export const withBase = (path: string) => (path.startsWith('/') ? BASE + path.slice(1) : path);

/** Percorso senza la base di pubblicazione (per confronti indipendenti dal deploy). */
export const stripBase = (path: string) => (path.startsWith(BASE) ? '/' + path.slice(BASE.length) : path);

const prefixRoutes = <T extends Record<string, Record<Locale, string>>>(r: T) =>
  Object.fromEntries(
    Object.entries(r).map(([k, v]) => [k, { it: withBase(v.it), en: withBase(v.en) }]),
  ) as { [K in keyof T]: Record<Locale, string> };

/** Rotte statiche: stessi URL del sito precedente, in entrambe le lingue. */
export const routes = prefixRoutes({
  home: { it: '/', en: '/en/' },
  solutions: { it: '/soluzioni-di-automazione/', en: '/en/advanced-automation-solutions/' },
  solutionBase: { it: '/soluzione/', en: '/en/solutions/' },
  about: { it: '/chi-siamo/', en: '/en/about-us/' },
  cases: { it: '/case-history/', en: '/en/case-history/' },
  careers: { it: '/carriera/', en: '/en/careers/' },
  contact: { it: '/contatti/', en: '/en/contacts/' },
  privacy: { it: '/privacy-policy/', en: '/en/privacy-policy/' },
  cookies: { it: '/cookie-policy/', en: '/en/cookie-policy/' },
});

export type RouteKey = keyof typeof routes;

export const solutionUrl = (locale: Locale, slug: string) => `${routes.solutionBase[locale]}${slug}/`;
export const caseUrl = (locale: Locale, slug: string) => `${routes.cases[locale]}${slug}/`;

export type Alternates = Partial<Record<Locale, string>>;

export const pageAlternates = (key: RouteKey): Alternates => ({ ...routes[key] });
