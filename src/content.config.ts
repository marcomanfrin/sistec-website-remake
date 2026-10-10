import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const lang = z.enum(['it', 'en']);

/** Percorso di un'immagine relativo a src/assets/media (es. "2026/04/piegatura-1.png"). */
const media = z.string().regex(/^\d{4}\/\d{2}\/.+\.(jpe?g|png)$/i);

const galleryItem = z.union([media, z.object({ src: media, alt: z.string() })]);

const faq = z.object({ q: z.string(), a: z.string() });

const solutionKey = z.enum([
  'software',
  'integrated-lines',
  'welding',
  'palletizing',
  'laser-sorting',
  'handling',
  'bending',
]);

const solutions = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/solutions' }),
  schema: z.object({
    key: solutionKey,
    lang,
    slug: z.string(),
    order: z.number(),
    title: z.string(),
    shortTitle: z.string(),
    tagline: z.string(),
    seoTitle: z.string().optional(),
    seoDescription: z.string(),
    cover: media,
    coverAlt: z.string(),
    intro: z.string(),
    keywords: z.array(z.string()).default([]),
    benefitsTitle: z.string(),
    benefits: z.array(
      z.object({
        title: z.string(),
        text: z.string(),
        points: z.array(z.object({ title: z.string(), text: z.string() })).optional(),
      }),
    ),
    gallery: z.array(galleryItem).default([]),
    videos: z.array(z.string()).default([]),
    faqs: z.array(faq).default([]),
  }),
});

const cases = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/cases' }),
  schema: z.object({
    key: z.string(),
    lang,
    slug: z.string(),
    date: z.coerce.date(),
    title: z.string(),
    cardTitle: z.string(),
    sector: z.string(),
    lede: z.string(),
    seoDescription: z.string(),
    cover: media,
    coverAlt: z.string(),
    hero: media,
    heroAlt: z.string(),
    solutions: z.array(solutionKey).default([]),
    highlights: z.array(z.object({ value: z.string(), label: z.string() })).default([]),
    quote: z.string().optional(),
    gallery: z.array(galleryItem).default([]),
    videos: z.array(z.string()).default([]),
    featured: z.boolean().default(false),
  }),
});

const jobs = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/jobs' }),
  schema: z.object({
    key: z.string(),
    lang,
    title: z.string(),
    area: z.string(),
    location: z.string(),
    type: z.string(),
    summary: z.string(),
    pdf: z.string(),
    order: z.number(),
    date: z.coerce.date(),
  }),
});

const legal = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/legal' }),
  schema: z.object({
    key: z.enum(['privacy', 'cookies']),
    lang,
    title: z.string(),
    description: z.string(),
    updated: z.coerce.date(),
  }),
});

export const collections = { solutions, cases, jobs, legal };
