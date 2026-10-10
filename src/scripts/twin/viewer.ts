/**
 * Digital twin interattivo: carica three.js e il modello della cella solo su richiesta,
 * poi riproduce il ciclo reale del robot con inquadrature guidate o camera libera.
 * Accessibilità: controlli nativi (button, range, radio), pausa sempre disponibile,
 * nessuna riproduzione automatica con "prefers-reduced-motion".
 */
import { withBase } from '../../i18n/config';

type Strings = {
  loading: string;
  preparing: string;
  play: string;
  pause: string;
  fullscreen: string;
  exitFullscreen: string;
  phases: Record<string, string>;
};

const TARGET = { x: 300, y: -600, z: 800 };

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export function initTwin(root: HTMLElement) {
  const $ = <T extends Element = HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const strings = JSON.parse(root.dataset.strings ?? '{}') as Strings;
  const stage = $('[data-twin-stage]');
  const canvas = $<HTMLCanvasElement>('[data-twin-canvas]');
  const launch = $<HTMLButtonElement>('[data-twin-launch]');
  const startBox = $('[data-twin-start]');
  const loadingBox = $('[data-twin-loading]');
  const loadingText = $('[data-twin-loading-text]');
  const bar = $('[data-twin-bar]');
  const errorBox = $('[data-twin-error]');
  const hud = $('[data-twin-hud]');
  const hudPhase = $('[data-twin-hud-phase]');
  const hudTime = $('[data-twin-hud-time]');
  const controls = $('[data-twin-controls]');
  const playBtn = $<HTMLButtonElement>('[data-twin-play]');
  const restartBtn = $<HTMLButtonElement>('[data-twin-restart]');
  const range = $<HTMLInputElement>('[data-twin-range]');
  const timeOut = $('[data-twin-time]');
  const hint = $('[data-twin-hint]');
  const phaseText = $('[data-twin-phase-text]');
  const fsBtn = $<HTMLButtonElement>('[data-twin-fullscreen]');
  const axisEls = [...root.querySelectorAll<HTMLElement>('[data-twin-axis]')];
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const nf = new Intl.NumberFormat(document.documentElement.lang || 'it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  launch.addEventListener('click', async () => {
    if (!webglAvailable() || !('DecompressionStream' in window)) {
      startBox.hidden = true;
      errorBox.hidden = false;
      return;
    }
    startBox.hidden = true;
    loadingBox.hidden = false;

    try {
      const [{ createCell }, { createLoader }, { OrbitControls }] = await Promise.all([
        import('./cell.js'),
        import('./loader.js'),
        import('three/addons/controls/OrbitControls.js'),
      ]);
      const loader = createLoader(withBase('/twin/'), (p: number) => {
        const pct = Math.round(p * 100);
        bar.style.width = `${pct}%`;
        loadingText.textContent = strings.loading.replace('{p}', String(pct));
      });

      const size = () => ({ w: Math.max(1, stage.clientWidth), h: Math.max(1, stage.clientHeight) });
      const dpr = () => Math.min(window.devicePixelRatio || 1, 1.75);
      const { w, h } = size();
      canvas.hidden = false;
      const cell = await createCell({
        canvas,
        width: w,
        height: h,
        pixelRatio: dpr(),
        loader,
        shadowSize: w < 700 ? 1024 : 2048,
      });
      loadingText.textContent = strings.preparing;
      if (import.meta.env.DEV || new URLSearchParams(location.search).has('twin-debug')) (root as any).__twin = cell;

      const DUR: number = cell.DUR;
      const E = cell.E as Record<string, number>;
      const phases = (
        [
          ['intro', 0],
          ['stack', E.stack - 1.2],
          ['align', E.align - 1],
          ['bend1', E.pinch1 - 0.8],
          ['regrip', E.regrip1 - 0.6],
          ['bend2', E.pinch2 - 0.8],
          ['flip', E.clamp - 1],
          ['bend3', E.pinch3 - 0.8],
          ['deposit', E.deposit - 1.2],
          ['end', E.deposit + 1.5],
        ] as [string, number][]
      ).sort((a, b) => a[1] - b[1]);
      const phaseAt = (u: number) => {
        let k = phases[0][0];
        for (const [key, t0] of phases) if (u >= t0) k = key;
        return strings.phases[k] ?? k;
      };

      range.max = String(Math.round(DUR * 100));
      let u = reduce ? E.pinch1 : 0;
      let playing = !reduce;
      let mode: 'guided' | 'free' = 'guided';
      let orbit: InstanceType<typeof OrbitControls> | null = null;
      let visible = true;
      let dirty = true;
      let last = performance.now();
      let lastUi = 0;

      const fmtClock = (s: number) => {
        const sec = s * 1.5; // ciclo mostrato a 1,5× il tempo reale
        const m = Math.floor(sec / 60);
        return `${String(m).padStart(2, '0')}:${(sec % 60).toFixed(2).padStart(5, '0')}`;
      };

      const updateUi = () => {
        const phase = phaseAt(u);
        hudPhase.textContent = phase;
        hudTime.textContent = fmtClock(u);
        timeOut.textContent = `${nf.format(u)} s`;
        range.value = String(Math.round(u * 100));
        range.setAttribute('aria-valuetext', `${nf.format(u)} s – ${phase}`);
        if (phaseText.textContent !== phase) phaseText.textContent = phase;
        const q: number[] = cell.info(u).q;
        q.forEach((deg, i) => {
          const el = axisEls[i];
          if (el) el.textContent = `${deg >= 0 ? '+' : '−'}${Math.abs(deg).toFixed(1).padStart(5, '0')}°`;
        });
      };

      const setPlaying = (p: boolean) => {
        playing = p;
        playBtn.querySelector('[data-icon-pause]')!.classList.toggle('hidden', !p);
        playBtn.querySelector('[data-icon-play]')!.classList.toggle('hidden', p);
        $('[data-twin-play-label]').textContent = p ? strings.pause : strings.play;
        last = performance.now();
      };

      const frame = () => {
        requestAnimationFrame(frame);
        const now = performance.now();
        if (!visible || document.hidden) {
          last = now;
          return;
        }
        const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
        last = now;
        if (playing) {
          u += dt;
          if (u > DUR) u = 0;
          dirty = true;
        }
        if (mode === 'free' && orbit) {
          if (orbit.update()) dirty = true;
        }
        if (!dirty) return;
        cell.render(u, { free: mode === 'free' });
        dirty = false;
        if (now - lastUi > 100) {
          updateUi();
          lastUi = now;
        }
      };

      // Pronto
      loadingBox.hidden = true;
      $('[data-twin-poster]').remove();
      hud.setAttribute('data-on', '');
      controls.hidden = false;
      setPlaying(playing);
      updateUi();
      requestAnimationFrame(frame);
      playBtn.focus();

      playBtn.addEventListener('click', () => setPlaying(!playing));
      restartBtn.addEventListener('click', () => {
        u = 0;
        dirty = true;
        updateUi();
        setPlaying(true);
      });
      range.addEventListener('input', () => {
        u = Number(range.value) / 100;
        dirty = true;
        updateUi();
      });

      root.querySelectorAll<HTMLInputElement>('[data-twin-cam]').forEach((radio) =>
        radio.addEventListener('change', () => {
          mode = radio.value as 'guided' | 'free';
          hint.hidden = mode !== 'free';
          if (mode === 'free') {
            const cam = cell.camera;
            cam.up.set(0, 0, 1);
            if (!orbit) {
              orbit = new OrbitControls(cam, canvas);
              orbit.enableDamping = !reduce;
              orbit.dampingFactor = 0.08;
              orbit.minDistance = 1200;
              orbit.maxDistance = 22000;
              orbit.maxPolarAngle = Math.PI * 0.49;
              orbit.addEventListener('change', () => (dirty = true));
            }
            orbit.target.set(TARGET.x, TARGET.y, TARGET.z);
            orbit.enabled = true;
            orbit.update();
          } else if (orbit) {
            orbit.enabled = false;
          }
          canvas.style.cursor = mode === 'free' ? 'grab' : '';
          dirty = true;
        }),
      );

      // Schermo intero
      fsBtn.addEventListener('click', () => {
        if (document.fullscreenElement) document.exitFullscreen();
        else root.requestFullscreen?.();
      });
      document.addEventListener('fullscreenchange', () => {
        $('[data-twin-fs-label]').textContent = document.fullscreenElement === root ? strings.exitFullscreen : strings.fullscreen;
      });
      if (!document.fullscreenEnabled) fsBtn.hidden = true;

      // Ridimensionamento
      new ResizeObserver(() => {
        const s = size();
        cell.resize(s.w, s.h, dpr());
        dirty = true;
      }).observe(stage);

      // Nessun rendering quando la sezione non è visibile
      new IntersectionObserver(([e]) => {
        visible = e.isIntersecting;
        last = performance.now();
      }).observe(stage);
    } catch (err) {
      console.error('[twin]', err);
      loadingBox.hidden = true;
      canvas.hidden = true;
      errorBox.hidden = false;
    }
  });
}
