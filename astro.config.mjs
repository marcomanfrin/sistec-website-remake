// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import rehypeTableWrap from './src/lib/markdown/rehype-table-wrap.mjs';

export default defineConfig({
  site: process.env.SITE_URL || 'https://www.sistec-am.com',
  // Sottopercorso di pubblicazione (es. GitHub Pages di progetto); in produzione il sito è alla radice.
  base: process.env.BASE_PATH || '/',
  // Stessa struttura URL del sito precedente (con slash finale) per preservare il posizionamento SEO.
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
  i18n: {
    locales: ['it', 'en'],
    defaultLocale: 'it',
    routing: {
      prefixDefaultLocale: false,
    },
  },
  markdown: {
    rehypePlugins: [rehypeTableWrap],
  },
  prefetch: {
    prefetchAll: false,
    defaultStrategy: 'hover',
  },
  integrations: [
    sitemap({
      i18n: {
        defaultLocale: 'it',
        locales: { it: 'it-IT', en: 'en-GB' },
      },
      filter: (page) => !page.includes('/404'),
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
