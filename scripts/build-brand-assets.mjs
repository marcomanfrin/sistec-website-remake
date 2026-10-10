// Genera favicon, icone e immagine Open Graph a partire dai tracciati vettoriali del logo.
// Uso: node --experimental-strip-types scripts/build-brand-assets.mjs
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import { ASTERISK, WORDMARK, PRIMA_POWER } from '../src/components/brand/logo-paths.ts';

const ORANGE = '#F07D00';
const INK = '#0D0E0F';

const asteriskSvg = (size, pad, bg) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
${bg ? `<rect width="${size}" height="${size}" rx="${size * 0.22}" fill="${bg}"/>` : ''}
<svg x="${pad}" y="${pad}" width="${size - pad * 2}" height="${size - pad * 2}" viewBox="${ASTERISK.viewBox}"><path fill="${ORANGE}" d="${ASTERISK.d}"/></svg></svg>`;

const lockup = (w, wordFill, subFill) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1372 368" width="${w}" height="${Math.round(w * 368 / 1372)}">
<svg width="284" height="263" viewBox="${ASTERISK.viewBox}"><path fill="${ORANGE}" d="${ASTERISK.d}"/></svg>
<svg x="333" y="11" width="1039" height="246" viewBox="${WORDMARK.viewBox}"><path fill="${wordFill}" fill-rule="evenodd" d="${WORDMARK.d}"/></svg>
<svg x="333" y="296" width="760" height="72" viewBox="${PRIMA_POWER.viewBox}"><path fill="${subFill}" fill-rule="evenodd" d="${PRIMA_POWER.d}"/></svg></svg>`;

// favicon.svg con supporto dark mode del browser (asterisco arancio su trasparente)
await writeFile('public/favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${ASTERISK.viewBox}"><path fill="${ORANGE}" d="${ASTERISK.d}"/></svg>\n`);

await sharp(Buffer.from(asteriskSvg(180, 30, INK))).png().toFile('public/apple-touch-icon.png');
await sharp(Buffer.from(asteriskSvg(192, 34, INK))).png().toFile('public/icon-192.png');
await sharp(Buffer.from(asteriskSvg(512, 90, INK))).png().toFile('public/icon-512.png');

// favicon.ico (PNG incapsulato 32×32)
const png32 = await sharp(Buffer.from(asteriskSvg(32, 2, null))).png().toBuffer();
const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
header.writeUInt8(32, 6); header.writeUInt8(32, 7); header.writeUInt8(0, 8); header.writeUInt8(0, 9);
header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12); header.writeUInt32LE(png32.length, 14); header.writeUInt32LE(22, 18);
await writeFile('public/favicon.ico', Buffer.concat([header, png32]));

// Logo PNG per schema.org / email
await sharp(Buffer.from(lockup(1200, '#686A68', '#686A68'))).png().toFile('public/brand/sistec-logo.png');
await writeFile('public/brand/sistec-logo-white.svg', lockup(1372, '#FFFFFF', '#A3A6A8'));
await writeFile('public/brand/sistec-logo.svg', lockup(1372, '#686A68', '#686A68'));

// Immagine Open Graph di default: fotogramma della cella 3D + logo
const bg = await sharp('src/assets/showreel/f0620.jpg').resize(1200, 630, { fit: 'cover' }).modulate({ brightness: 0.55 }).toBuffer();
const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
<defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="${INK}" stop-opacity=".95"/><stop offset=".65" stop-color="${INK}" stop-opacity=".35"/><stop offset="1" stop-color="${INK}" stop-opacity="0"/></linearGradient></defs>
<rect width="1200" height="630" fill="url(#g)"/>
<g transform="translate(80 150)">${lockup(520, '#FFFFFF', '#A3A6A8').replace('<svg xmlns="http://www.w3.org/2000/svg"', '<svg')}</g>
<text x="80" y="400" font-family="Montserrat, Helvetica, Arial, sans-serif" font-weight="700" font-size="54" fill="#FFFFFF">Driven by Automation.</text>
<text x="80" y="466" font-family="Montserrat, Helvetica, Arial, sans-serif" font-weight="700" font-size="54" fill="${ORANGE}">Defined by Robotics.</text>
<rect x="80" y="520" width="64" height="4" fill="${ORANGE}"/></svg>`;
await sharp(bg).composite([{ input: Buffer.from(overlay) }]).jpeg({ quality: 86, mozjpeg: true }).toFile('src/assets/brand/og-default.jpg');

await writeFile('public/site.webmanifest', JSON.stringify({
  name: 'SISTEC – Automazione robotizzata',
  short_name: 'SISTEC',
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
  ],
  theme_color: INK,
  background_color: INK,
  display: 'browser',
}, null, 2) + '\n');
console.log('ok');
