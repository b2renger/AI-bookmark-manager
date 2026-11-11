/**
 * Generates the PWA icons in public/ from one inline SVG.
 *
 *   node scripts/generate-icons.mjs
 *
 * Needs the `sharp` package (not a project dependency: the generated PNGs are
 * committed, so this only has to run when the icon design changes).
 */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

/** `pad` is the share of the canvas left empty around the glyph. */
const svg = (pad, rounded) => {
  const s = 512;
  const inner = s * (1 - 2 * pad);
  const scale = inner / 512;
  const offset = s * pad;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#3b82f6"/>
      <stop offset="1" stop-color="#4f46e5"/>
    </linearGradient>
  </defs>
  <rect width="${s}" height="${s}" rx="${rounded ? 112 : 0}" fill="url(#bg)"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})">
    <path d="M168 104h176a24 24 0 0 1 24 24v280l-112-72-112 72V128a24 24 0 0 1 24-24z" fill="#ffffff"/>
    <path d="M256 164l14 40 40 14-40 14-14 40-14-40-40-14 40-14z" fill="#4f46e5"/>
  </g>
</svg>`;
};

mkdirSync('public', { recursive: true });
const out = [
  ['public/icon-192.png', 192, svg(0, true)],
  ['public/icon-512.png', 512, svg(0, true)],
  // Maskable icons are cropped to a circle or squircle: full-bleed background, glyph in the safe zone.
  ['public/icon-maskable-512.png', 512, svg(0.14, false)],
  // iOS adds its own corner rounding and ignores transparency.
  ['public/apple-touch-icon-180.png', 180, svg(0.06, false)],
  ['public/favicon-32.png', 32, svg(0, true)],
];
for (const [file, size, source] of out) {
  await sharp(Buffer.from(source)).resize(size, size).png().toFile(file);
  console.log('wrote', file);
}
