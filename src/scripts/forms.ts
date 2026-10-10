/**
 * Validazione accessibile dei moduli (WCAG 3.3.1, 3.3.3, 4.1.3):
 * - riepilogo errori con link ai campi, che riceve il focus all'invio;
 * - messaggio specifico sotto ogni campo, collegato con aria-describedby;
 * - stato dell'invio annunciato tramite live region.
 */
type Messages = Record<string, string>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_FILE = 5 * 1024 * 1024;
const FILE_TYPES = /\.(pdf|docx?|odt)$/i;

const fmt = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));

function labelText(el: HTMLElement) {
  const label = el.id ? document.querySelector<HTMLLabelElement>(`label[for="${el.id}"]`) : null;
  if (!label) return el.getAttribute('name') ?? '';
  const clone = label.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('[aria-hidden="true"], .sr-only').forEach((n) => n.remove());
  return clone.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function validateField(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, m: Messages): string {
  const value = 'value' in el ? el.value.trim() : '';
  if (el instanceof HTMLInputElement && el.type === 'checkbox') {
    return el.required && !el.checked ? m.consent : '';
  }
  if (el instanceof HTMLInputElement && el.type === 'file') {
    const file = el.files?.[0];
    if (!file) return el.required ? m.file : '';
    if (!FILE_TYPES.test(file.name)) return m.fileType;
    if (file.size > MAX_FILE) return m.fileSize;
    return '';
  }
  if (el.required && !value) return fmt(m.required, { field: labelText(el) });
  if (el instanceof HTMLInputElement && el.type === 'email' && value && !EMAIL.test(value)) return m.email;
  return '';
}

function setError(el: HTMLElement, msg: string) {
  const field = el.closest('[data-field]');
  const out = field?.querySelector<HTMLElement>('[data-error]');
  if (msg) el.setAttribute('aria-invalid', 'true');
  else el.removeAttribute('aria-invalid');
  if (out) out.textContent = msg;
}

export function initForms() {
  document.querySelectorAll<HTMLFormElement>('form[data-form]:not([data-ready])').forEach((form) => {
    form.dataset.ready = '';
    const m = JSON.parse(form.dataset.messages ?? '{}') as Messages;
    const summary = form.querySelector<HTMLElement>('[data-error-summary]')!;
    const summaryTitle = summary.querySelector<HTMLElement>('[data-summary-title] span')!;
    const summaryList = summary.querySelector<HTMLElement>('[data-summary-list]')!;
    const status = form.querySelector<HTMLElement>('[data-form-status]')!;
    const submit = form.querySelector<HTMLButtonElement>('[data-submit]')!;
    const submitLabel = submit.querySelector<HTMLElement>('[data-submit-label]')!;
    const fields = () =>
      [...form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('[data-field] input, [data-field] textarea, [data-field] select')];

    // Rivalidazione "gentile": solo dopo il primo tentativo o all'uscita da un campo già in errore
    form.addEventListener(
      'blur',
      (e) => {
        const el = e.target as HTMLInputElement;
        if (!el.matches?.('[data-field] *') || !el.hasAttribute('aria-invalid')) return;
        setError(el, validateField(el, m));
      },
      true,
    );
    form.addEventListener('change', (e) => {
      const el = e.target as HTMLInputElement;
      if (el.hasAttribute('aria-invalid')) setError(el, validateField(el, m));
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      status.textContent = '';
      const errors: { el: HTMLElement; msg: string }[] = [];
      for (const el of fields()) {
        const msg = validateField(el, m);
        setError(el, msg);
        if (msg) errors.push({ el, msg });
      }

      if (errors.length) {
        summaryTitle.textContent = errors.length === 1 ? m.summaryOne : fmt(m.summary, { n: errors.length });
        summaryList.replaceChildren(
          ...errors.map(({ el, msg }) => {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = `#${el.id}`;
            a.textContent = msg;
            a.className = 'underline underline-offset-2';
            a.addEventListener('click', (ev) => {
              ev.preventDefault();
              el.focus();
            });
            li.append(a);
            return li;
          }),
        );
        summary.setAttribute('data-open', '');
        summary.setAttribute('role', 'alert');
        summary.focus();
        return;
      }
      summary.removeAttribute('data-open');
      summary.removeAttribute('role');

      const honeypot = form.querySelector<HTMLInputElement>('input[name="_gotcha"]');
      if (honeypot?.value) return;

      if (!form.getAttribute('action')) {
        status.textContent = m.notConfigured;
        return;
      }

      submit.disabled = true;
      const original = submitLabel.textContent;
      submitLabel.textContent = m.sending;
      try {
        const res = await fetch(form.action, {
          method: 'POST',
          body: new FormData(form),
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) throw new Error(String(res.status));
        form.reset();
        status.textContent = m.success;
      } catch {
        status.textContent = m.error;
      } finally {
        submit.disabled = false;
        submitLabel.textContent = original;
      }
    });
  });
}
