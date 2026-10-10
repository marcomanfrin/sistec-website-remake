# SISTEC — sito web 2026

Nuova versione del sito [sistec-am.com](https://www.sistec-am.com): **Astro 7 (SSG) + Tailwind CSS 4**, bilingue IT/EN, accessibile WCAG 2.2 AA.

## Comandi

| Comando | Azione |
| --- | --- |
| `npm install` | Installa le dipendenze |
| `npm run dev` | Server di sviluppo su `http://localhost:4321` |
| `npm run build` | Build statica in `dist/` |
| `npm run preview` | Anteprima della build |
| `npx astro check` | Type-check di componenti e contenuti |
| `node scripts/fetch-youtube.mjs` | Scarica titoli e miniature dei video YouTube citati nei contenuti |
| `node --experimental-strip-types scripts/build-brand-assets.mjs` | Rigenera favicon, icone, logo PNG e immagine Open Graph |

## Struttura

```
src/
  content/            Contenuti in Markdown (it/ ed en/ con la stessa chiave `key`)
    solutions/        7 soluzioni (galleria, video, FAQ, vantaggi)
    cases/            6 case history
    jobs/             Posizioni aperte (PDF in public/docs)
    legal/            Privacy e cookie policy
  i18n/it.ts, en.ts   Testi di interfaccia e copy delle pagine (en.ts è tipizzato su it.ts)
  i18n/config.ts      Rotte: stessi URL del vecchio sito, per non perdere posizionamento
  views/              Pagine condivise tra le due lingue
  pages/              Rotte Astro (IT alla radice, EN sotto /en/)
  components/         Brand (logo vettoriale), layout, sezioni, media, form
  assets/media/       Immagini originali (ottimizzate in AVIF/WebP in fase di build)
  assets/showreel/    Fotogrammi dello showreel 3D
public/video/         Loop hero e showreel (H.264, faststart) + sottotitoli WebVTT
public/twin/          Modello 3D della cella (mesh .bin compresse gzip, ~3,5 MB) per il digital twin
src/scripts/twin/     Digital twin interattivo (three.js), adattato da sistec-logo-showreel/cell3d.js
```

### Digital twin interattivo

Nella pagina "Ecosistema software" la cella di piegatura 3D esegue il ciclo reale del pezzo. three.js e il modello vengono scaricati solo quando l'utente preme "Avvia", quindi non pesano sul caricamento della pagina. Gli asset sono file `.gz` decompressi nel browser con `DecompressionStream`. Per aggiornarli dal progetto showreel, ricomprimi i file di `assets/cell/*.bin` e il JSON del prodotto in `public/twin/`, poi rigenera `sizes.json`. Per mostrarlo anche in altre pagine (es. Piegatura robotizzata) basta usare `<DigitalTwinViewer locale={locale} />`.

Per aggiungere una case history: crea `src/content/cases/it/<file>.md` e `src/content/cases/en/<file>.md` con lo stesso `key`. Lo schema dei campi è in `src/content.config.ts`.

## Moduli (contatti, candidature, newsletter)

Il sito è statico: i moduli inviano i dati in `POST multipart/form-data` a un endpoint esterno, configurabile con variabili d'ambiente (vedi `.env.example`). Vanno bene servizi come Formspree o Basin, una funzione serverless o un endpoint aziendale. La risposta deve essere `2xx` (meglio se JSON). Finché un endpoint non è configurato, il modulo valida comunque i campi e poi invita l'utente a scrivere a sistec@sistec-am.com.

Ogni modulo invia anche i campi nascosti `form` (`contact` | `careers` | `newsletter`), `lang` e l'honeypot `_gotcha`, che deve essere vuoto.

## Privacy e cookie

- Nessuna richiesta a terze parti prima del consenso: font, immagini e miniature video sono serviti in locale.
- Banner conforme alle Linee guida del Garante: “Rifiuta” ha la stessa evidenza di “Accetta”, le scelte sono granulari e restano memorizzate per 6 mesi. Si possono cambiare dal footer con “Preferenze cookie”.
- Google Tag Manager (`PUBLIC_GTM_ID`, default `GTM-PJB6N25`) viene caricato solo dopo il consenso alle statistiche, con Consent Mode v2. Se il consenso viene revocato, i cookie `_ga*` vengono cancellati.
- I video YouTube sono caricati da `youtube-nocookie.com` solo dopo il consenso “Contenuti multimediali” o il click esplicito sul singolo video.

## Accessibilità e conformità

Verifiche eseguite sulla build:

- **axe-core** (WCAG 2.0/2.1/2.2 A e AA + best practice) su tutte le 43 pagine, desktop e mobile: 0 violazioni.
- **html-validate** (standard + a11y) su tutte le pagine: HTML valido.
- **Lighthouse**: Accessibilità 100, Best Practices 100, SEO 100, Performance 96–97 sulla home.

Accorgimenti principali: skip link, focus sempre visibile, contrasti ≥ 4.5:1, navigazione completa da tastiera (mega menu a disclosure, dialog nativi per menu mobile, lightbox e preferenze), pausa per video e animazioni in movimento, `prefers-reduced-motion` rispettato ovunque, moduli con riepilogo errori e messaggi collegati ai campi, `lang` corretto anche sui titoli dei video in inglese.

SEO: URL invariati rispetto al vecchio sito, `hreflang` IT/EN/x-default, canonical, sitemap, Open Graph, dati strutturati JSON-LD (Organization, BreadcrumbList, Service, FAQPage, Article, JobPosting, ItemList).

## Deploy

`npm run build` genera `dist/`, da pubblicare su qualunque hosting statico (Netlify, Vercel, Cloudflare Pages, Apache/Nginx). La pagina `404.html` va configurata come pagina di errore. Le variabili `PUBLIC_*` devono essere disponibili al momento della build.
