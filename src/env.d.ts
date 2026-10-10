interface ImportMetaEnv {
  readonly PUBLIC_CONTACT_FORM_ENDPOINT?: string;
  readonly PUBLIC_CAREERS_FORM_ENDPOINT?: string;
  readonly PUBLIC_NEWSLETTER_FORM_ENDPOINT?: string;
  readonly PUBLIC_GTM_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
