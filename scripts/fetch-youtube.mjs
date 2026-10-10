// Scarica titoli (oEmbed) e miniature dei video YouTube referenziati nei contenuti.
// Le miniature vengono servite dal nostro dominio: nessuna richiesta verso Google
// prima del consenso dell'utente.
// Uso: node scripts/fetch-youtube.mjs
import { readFile, writeFile, mkdir, readdir, access } from 'node:fs/promises';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const contentDir = join(root, 'src/content');
const thumbsDir = join(root, 'src/assets/youtube');
const dataFile = join(root, 'src/data/youtube.json');

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(p)));
    else if (/\.(md|mdx|ya?ml|json)$/.test(entry.name)) out.push(p);
  }
  return out;
}

const ids = new Set();
for (const file of await walk(contentDir)) {
  const src = await readFile(file, 'utf8');
  const block = src.match(/videos:\s*\n((?:\s+-\s+.+\n?)+)/);
  if (!block) continue;
  for (const m of block[1].matchAll(/-\s+['"]?([\w-]{11})['"]?/g)) ids.add(m[1]);
}

await mkdir(thumbsDir, { recursive: true });
let data = {};
try {
  data = JSON.parse(await readFile(dataFile, 'utf8'));
} catch {}

for (const id of ids) {
  const thumb = join(thumbsDir, `${id}.jpg`);
  try {
    await access(thumb);
  } catch {
    for (const variant of ['maxresdefault', 'sddefault', 'hqdefault']) {
      const res = await fetch(`https://i.ytimg.com/vi/${id}/${variant}.jpg`);
      if (res.ok) {
        await writeFile(thumb, Buffer.from(await res.arrayBuffer()));
        break;
      }
    }
  }
  if (!data[id]) {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`,
    );
    data[id] = res.ok ? { title: (await res.json()).title } : { title: 'Video SISTEC' };
  }
  console.log(id, data[id].title);
}

await mkdir(join(root, 'src/data'), { recursive: true });
await writeFile(dataFile, JSON.stringify(data, null, 2) + '\n');
console.log(`${ids.size} video elaborati.`);
