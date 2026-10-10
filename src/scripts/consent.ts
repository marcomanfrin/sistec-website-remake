/** Gestione centralizzata del consenso cookie (memorizzato in localStorage per 6 mesi). */
export interface Consent {
  v: 1;
  analytics: boolean;
  media: boolean;
  ts: number;
}

const KEY = 'sistec-consent';
const MAX_AGE = 1000 * 60 * 60 * 24 * 182; // ~6 mesi
const EVENT = 'sistec:consent';

export function readConsent(): Consent | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Consent;
    if (c.v !== 1 || Date.now() - c.ts > MAX_AGE) return null;
    return c;
  } catch {
    return null;
  }
}

export function writeConsent(c: Pick<Consent, 'analytics' | 'media'>) {
  const value: Consent = { v: 1, analytics: c.analytics, media: c.media, ts: Date.now() };
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* storage non disponibile (es. navigazione privata): la scelta vale per la sessione */
  }
  document.dispatchEvent(new CustomEvent<Consent>(EVENT, { detail: value }));
}

export function onConsentChange(cb: (c: Consent) => void) {
  document.addEventListener(EVENT, (e) => cb((e as CustomEvent<Consent>).detail));
}
