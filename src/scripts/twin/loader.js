/**
 * Caricamento degli asset del digital twin: file .gz decompressi nel browser
 * con DecompressionStream, con avanzamento in byte. Se il server ha già
 * decompresso il file (Content-Encoding: gzip), i dati vengono usati così come sono.
 */
/**
 * @param {string} base
 * @param {(progress: number) => void} [onProgress]
 */
export function createLoader(base, onProgress = () => {}) {
  let total = 0;
  let loaded = 0;
  const report = () => onProgress(total ? Math.min(1, loaded / total) : 0);

  async function init() {
    const sizes = await fetch(`${base}sizes.json`).then((r) => r.json());
    total = Object.values(sizes).reduce((a, b) => a + b, 0);
  }

  async function fetchGz(name) {
    const res = await fetch(`${base}${name}.gz`);
    if (!res.ok || !res.body) throw new Error(`Asset non disponibile: ${name}`);
    const reader = res.body.getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
      loaded += value.length;
      report();
    }
    const raw = new Uint8Array(size);
    let o = 0;
    for (const c of chunks) {
      raw.set(c, o);
      o += c.length;
    }
    if (raw[0] !== 0x1f || raw[1] !== 0x8b) return raw.buffer;
    const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).arrayBuffer();
  }

  return {
    init,
    fetchGz,
    fetchJson: async (name) => JSON.parse(new TextDecoder().decode(await fetchGz(name))),
    manifest: () => fetch(`${base}manifest.json`).then((r) => r.json()),
  };
}
