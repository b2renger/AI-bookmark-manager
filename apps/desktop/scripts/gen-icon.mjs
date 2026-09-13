// Generates build/icon.png (512×512) procedurally: a cairn — four stacked stones on a dark
// rounded tile — with no image dependency (raw RGBA → zlib deflate → PNG chunks). electron-builder
// derives .ico/.icns from the PNG. Run: node scripts/gen-icon.mjs   (from apps/desktop)
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SIZE = 512;
const px = new Uint8Array(SIZE * SIZE * 4);

const BG = [0x0d, 0x0d, 0x0d];
const STONE = [0xe8, 0xe8, 0xe8];
const ACCENT = [0x27, 0xb6, 0xc4];

function put(x, y, rgb, a = 255) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
  const ia = a / 255;
  px[i] = Math.round(px[i] * (1 - ia) + rgb[0] * ia);
  px[i + 1] = Math.round(px[i + 1] * (1 - ia) + rgb[1] * ia);
  px[i + 2] = Math.round(px[i + 2] * (1 - ia) + rgb[2] * ia);
  px[i + 3] = Math.max(px[i + 3], a);
}

/** Rounded rectangle with anti-aliased edge (signed distance). */
function roundedRect(cx, cy, w, h, r, rgb) {
  const x0 = Math.floor(cx - w / 2 - 2), x1 = Math.ceil(cx + w / 2 + 2);
  const y0 = Math.floor(cy - h / 2 - 2), y1 = Math.ceil(cy + h / 2 + 2);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = Math.abs(x + 0.5 - cx) - (w / 2 - r);
      const dy = Math.abs(y + 0.5 - cy) - (h / 2 - r);
      const ox = Math.max(dx, 0), oy = Math.max(dy, 0);
      const d = Math.hypot(ox, oy) + Math.min(Math.max(dx, dy), 0) - r; // <0 inside
      const a = Math.min(1, Math.max(0, 0.5 - d));
      if (a > 0) put(x, y, rgb, Math.round(a * 255));
    }
  }
}

// Tile
roundedRect(SIZE / 2, SIZE / 2, SIZE, SIZE, 96, BG);
// Stones, bottom to top: wide → narrow, slight lateral offsets like a real cairn
const stones = [
  { w: 300, h: 78, dx: 0 },
  { w: 232, h: 70, dx: 12 },
  { w: 168, h: 62, dx: -8 },
  { w: 104, h: 54, dx: 6 },
];
let y = 424;
for (const s of stones) {
  y -= s.h / 2;
  roundedRect(SIZE / 2 + s.dx, y, s.w, s.h, s.h / 2 - 6, STONE);
  y -= s.h / 2 + 10;
}
// Accent pebble on top
roundedRect(SIZE / 2 + 2, y - 8, 46, 34, 14, ACCENT);

// PNG encode
const crcTable = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c;
}
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
for (let row = 0; row < SIZE; row++) {
  raw[row * (SIZE * 4 + 1)] = 0; // filter: none
  Buffer.from(px.buffer, row * SIZE * 4, SIZE * 4).copy(raw, row * (SIZE * 4 + 1) + 1);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'build', 'icon.png');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, png);
console.log(`wrote ${out} (${png.length} bytes)`);
