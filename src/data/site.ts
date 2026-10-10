/** Dati aziendali e configurazione condivisa del sito. */
export const company = {
  name: 'SISTEC AM SRL Unipersonale',
  shortName: 'SISTEC',
  vat: '03904360363',
  email: 'sistec@sistec-am.com',
  phone: '+39 0434 789511',
  phoneHref: 'tel:+390434789511',
  fax: '+39 0434 789590',
  street: 'Viale Trento 105/M',
  postalCode: '33077',
  city: 'Sacile',
  province: 'PN',
  region: 'Friuli Venezia Giulia',
  country: 'IT',
  mapsUrl: 'https://www.google.com/maps/search/?api=1&query=SISTEC+AM+Viale+Trento+105%2FM+Sacile+PN',
  foundedYears: 25,
  social: {
    linkedin: 'https://www.linkedin.com/company/sistec-s.r.l',
    youtube: 'https://www.youtube.com/@sistecam',
  },
  parent: { name: 'Prima Power', url: 'https://www.primapower.com/' },
} as const;

/**
 * Endpoint dei moduli. Il sito è statico: i moduli inviano i dati (POST multipart) a un servizio esterno
 * configurabile via variabili d'ambiente (es. Formspree, Basin, una funzione serverless o un endpoint PHP aziendale).
 * Se non configurati, il modulo mostra un messaggio con l'indirizzo email diretto.
 */
export const formEndpoints = {
  contact: import.meta.env.PUBLIC_CONTACT_FORM_ENDPOINT ?? '',
  careers: import.meta.env.PUBLIC_CAREERS_FORM_ENDPOINT ?? '',
  newsletter: import.meta.env.PUBLIC_NEWSLETTER_FORM_ENDPOINT ?? '',
};

/** Google Tag Manager: caricato solo dopo il consenso alla categoria "Statistiche". */
export const analytics = {
  gtmId: import.meta.env.PUBLIC_GTM_ID ?? 'GTM-PJB6N25',
};
