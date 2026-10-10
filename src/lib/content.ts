import { getCollection, type CollectionEntry } from 'astro:content';
import type { Locale } from '../i18n/config';

export type Solution = CollectionEntry<'solutions'>;
export type Case = CollectionEntry<'cases'>;
export type Job = CollectionEntry<'jobs'>;

export async function getSolutions(locale: Locale) {
  const all = await getCollection('solutions', ({ data }) => data.lang === locale);
  return all.sort((a, b) => a.data.order - b.data.order);
}

export async function getCases(locale: Locale) {
  const all = await getCollection('cases', ({ data }) => data.lang === locale);
  return all.sort((a, b) => b.data.date.getTime() - a.data.date.getTime());
}

export async function getJobs(locale: Locale) {
  const all = await getCollection('jobs', ({ data }) => data.lang === locale);
  return all.sort((a, b) => a.data.order - b.data.order);
}

/** Trova la stessa voce nell'altra lingua (stesso `key`). */
export async function findTranslation<C extends 'solutions' | 'cases'>(collection: C, key: string, locale: Locale) {
  const all = await getCollection(collection, ({ data }) => data.lang === locale && data.key === key);
  return all[0] as CollectionEntry<C> | undefined;
}

export const readingMinutes = (text: string) => Math.max(1, Math.round(text.split(/\s+/).length / 200));

/** Converte testo con paragrafi separati da righe vuote in HTML semplice (per JSON-LD). */
export const paragraphsHtml = (...blocks: string[]) =>
  blocks
    .flatMap((b) => b.split(/\n{2,}/))
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p}</p>`)
    .join('');
