/**
 * Motion system: reveal on scroll, titoli parola per parola, contatori.
 * Con "prefers-reduced-motion: reduce" tutto è mostrato subito nello stato finale.
 */
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

function reveal() {
  const targets = document.querySelectorAll<HTMLElement>('[data-reveal], .split-words');
  if (reduce.matches || !('IntersectionObserver' in window)) {
    targets.forEach((el) => el.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
  );
  targets.forEach((el) => {
    // Elementi già visibili al caricamento: animazione immediata
    io.observe(el);
  });
}

/** Contatori: il valore finale è nel testo per screen reader e no-JS; l'animazione è solo visiva. */
function counters() {
  const els = document.querySelectorAll<HTMLElement>('[data-count]');
  if (!els.length) return;
  const locale = document.documentElement.lang || 'it-IT';
  const nf = new Intl.NumberFormat(locale);
  const run = (el: HTMLElement) => {
    const target = Number(el.dataset.count);
    if (reduce.matches || !Number.isFinite(target)) return;
    const duration = 1800;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 4);
      el.textContent = nf.format(Math.round(target * eased));
      if (p < 1) requestAnimationFrame(tick);
    };
    el.textContent = nf.format(0);
    requestAnimationFrame(tick);
  };
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        run(e.target as HTMLElement);
        io.unobserve(e.target);
      }
    },
    { threshold: 0.6 },
  );
  els.forEach((el) => io.observe(el));
}

/** Effetto "magnetico" sui pulsanti principali (solo puntatori fini). */
function magnetic() {
  if (reduce.matches || !window.matchMedia('(pointer: fine)').matches) return;
  document.querySelectorAll<HTMLElement>('[data-magnetic]').forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left - r.width / 2) * 0.18;
      const y = (e.clientY - r.top - r.height / 2) * 0.28;
      el.style.transform = `translate(${x}px, ${y}px)`;
    });
    el.addEventListener('pointerleave', () => (el.style.transform = ''));
  });
}

/** Spotlight che segue il puntatore sulle card (variabili CSS --mx/--my). */
function spotlight() {
  if (!window.matchMedia('(pointer: fine)').matches) return;
  document.addEventListener(
    'pointermove',
    (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('[data-spotlight]');
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    },
    { passive: true },
  );
}

reveal();
counters();
magnetic();
spotlight();
