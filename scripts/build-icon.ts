// Spec: 02-2 §F15.1 (the foo mark = two-eyes face, X-143), §F14.7, 09-windows §9.2 (multi-size .ico).
// Draws the master geometry of foo/look-book/assets/logo-face.svg (viewBox 100: disc r 50; eyes 12×24 rx 6 at x 30 and 58, y 36)
// at each size with the light colour pair and the dark-taskbar rim, then writes resources/icons/foo.ico (PNG entries).
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { tokens } from '../src/shared/tokens';

export const SIZES = [16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72, 80, 96, 256] as const;
const DISC = tokens.colors['--fg-1'].light; // #0B0B10
const EYES = '#FFFFFF';
const RIM = '#3A3A44'; // F15.1: rim colour, logo-only value
const SS = 8; // supersampling per axis

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

/** F15.1: rim 1px at 32 (and the mid sizes), 2px at 64 and up, none at 16 and 20. */
const rimWidth = (size: number) => (size <= 20 ? 0 : size >= 64 ? 2 : 1);

type Shape = (x: number, y: number) => boolean;

function eyes(size: number): Shape {
  if (size === 16) {
    // F15.1 small sizes: eyes 2×5px at x 5 and 9, y 4, on whole pixels.
    return (x, y) => y >= 4 && y < 9 && ((x >= 5 && x < 7) || (x >= 9 && x < 11));
  }
  const k = size / 100;
  if (size === 20) {
    const [w, h, y0] = [Math.round(12 * k), Math.round(24 * k), Math.round(36 * k)];
    const xs = [Math.round(30 * k), Math.round(58 * k)];
    return (x, y) => y >= y0 && y < y0 + h && xs.some((x0) => x >= x0 && x < x0 + w);
  }
  const rr =
    (x0: number, y0: number, w: number, h: number, r: number): Shape =>
    (x, y) => {
      if (x < x0 || x > x0 + w || y < y0 || y > y0 + h) return false;
      const cx = Math.min(Math.max(x, x0 + r), x0 + w - r);
      const cy = Math.min(Math.max(y, y0 + r), y0 + h - r);
      return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
    };
  const left = rr(30 * k, 36 * k, 12 * k, 24 * k, 6 * k);
  const right = rr(58 * k, 36 * k, 12 * k, 24 * k, 6 * k);
  return (x, y) => left(x, y) || right(x, y);
}

export function render(size: number): Buffer {
  const r = size / 2;
  const rim = rimWidth(size);
  const eye = eyes(size);
  const px = Buffer.alloc(size * size * 4);
  const [disc, eyeC, rimC] = [rgb(DISC), rgb(EYES), rgb(RIM)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0, 0];
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = x + (sx + 0.5) / SS;
          const fy = y + (sy + 0.5) / SS;
          const d = Math.hypot(fx - r, fy - r);
          if (d > r) continue;
          const c = d > r - rim ? rimC : (size <= 20 ? eye(x, y) : eye(fx, fy)) ? eyeC : disc;
          acc[0] += c[0];
          acc[1] += c[1];
          acc[2] += c[2];
          acc[3] += 1;
        }
      }
      const i = (y * size + x) * 4;
      if (acc[3]) {
        px[i] = Math.round(acc[0]! / acc[3]!);
        px[i + 1] = Math.round(acc[1]! / acc[3]!);
        px[i + 2] = Math.round(acc[2]! / acc[3]!);
      }
      px[i + 3] = Math.round((acc[3]! / (SS * SS)) * 255);
    }
  }
  return png(size, px);
}

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (b: Buffer) => {
  let c = -1;
  for (const byte of b) c = CRC[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size: number, rgba: Buffer): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function ico(images: { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png: data }, i) => {
    const e = 6 + i * 16;
    header.writeUInt8(size >= 256 ? 0 : size, e);
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((i) => i.png)]);
}

if (process.argv[1]?.endsWith('build-icon.ts')) {
  const images = SIZES.map((size) => ({ size, png: render(size) }));
  writeFileSync('resources/icons/foo.ico', ico(images));
  writeFileSync('resources/icons/foo-256.png', images.at(-1)!.png);
  console.log(`foo.ico written (${SIZES.length} sizes)`);
}
