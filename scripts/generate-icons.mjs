/**
 * Generates the extension icons as PNGs with no image dependencies.
 *
 * Rasterizes a rounded chocolate-orange tile with a white graduation cap, then
 * encodes it by hand (PNG scanlines + zlib deflate + CRC32 chunks).
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '../public/icons');
const SIZES = [16, 32, 48, 128];

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function mixColor(c1, c2, t) {
  return [Math.round(lerp(c1[0], c2[0], t)), Math.round(lerp(c1[1], c2[1], t)), Math.round(lerp(c1[2], c2[2], t))];
}

/** Signed coverage of a point inside a rounded rectangle, anti-aliased. */
function roundedRectAlpha(x, y, size, radius) {
  const inset = size * 0.03;
  const min = inset;
  const max = size - inset;
  const dx = Math.max(min + radius - x, 0, x - (max - radius));
  const dy = Math.max(min + radius - y, 0, y - (max - radius));
  const distance = Math.sqrt(dx * dx + dy * dy) - radius;
  return Math.max(0, Math.min(1, 0.5 - distance));
}

function pointInPolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Graduation cap: a diamond mortarboard, a trapezoid base and a tassel. */
function capAlpha(x, y, size) {
  const u = x / size;
  const v = y / size;
  const board = [
    [0.5, 0.24],
    [0.86, 0.42],
    [0.5, 0.6],
    [0.14, 0.42],
  ];
  if (pointInPolygon(u, v, board)) return 1;

  const base = [
    [0.29, 0.49],
    [0.71, 0.49],
    [0.71, 0.68],
    [0.62, 0.75],
    [0.38, 0.75],
    [0.29, 0.68],
  ];
  if (pointInPolygon(u, v, base) && !pointInPolygon(u, v, board)) return 1;

  // Tassel: a vertical line hanging off the right edge with a bead.
  if (u > 0.8 && u < 0.845 && v > 0.42 && v < 0.66) return 1;
  const beadDx = u - 0.822;
  const beadDy = v - 0.7;
  if (Math.sqrt(beadDx * beadDx + beadDy * beadDy) < 0.05) return 1;

  return 0;
}

function renderIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const radius = size * 0.22;
  const topColor = [61, 40, 31];
  const bottomColor = [228, 114, 63];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const tileAlpha = roundedRectAlpha(x + 0.5, y + 0.5, size, radius);
      const [r, g, b] = mixColor(topColor, bottomColor, (x + y) / (size * 2));
      const cap = capAlpha(x + 0.5, y + 0.5, size);
      const red = cap ? 255 : r;
      const green = cap ? 255 : g;
      const blue = cap ? 255 : b;
      pixels[index] = red;
      pixels[index + 1] = green;
      pixels[index + 2] = blue;
      pixels[index + 3] = Math.round(255 * tileAlpha);
    }
  }
  return pixels;
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

function encodePng(pixels, size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0; // filter type: none
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(outDir, { recursive: true });
for (const size of SIZES) {
  const png = encodePng(renderIcon(size), size);
  writeFileSync(resolve(outDir, `icon-${size}.png`), png);
  console.log(`wrote icon-${size}.png (${png.length} bytes)`);
}
