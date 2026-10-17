// Spec: 11-fidelity §11.2.4 (pixelmatch with per-pixel threshold 0.1 and anti-aliasing detection; FID-05 cluster rule:
// any 16×16 block with > 25 % of its pixels changed), §11.2.5 (masks are solid fills applied before comparing), R3 (CIEDE2000).
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { readFileSync } from 'node:fs';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Image {
  width: number;
  height: number;
  data: Buffer;
}

export const PIXEL_THRESHOLD = 0.1;
export const CLUSTER = { block: 16, maxChangedShare: 0.25 } as const;
const MASK_RGB = [255, 0, 255] as const;

export const readPng = (file: string): Image => PNG.sync.read(readFileSync(file));
export const decodePng = (buf: Buffer): Image => PNG.sync.read(buf);

export function encodePng(img: Image): Buffer {
  const png = new PNG({ width: img.width, height: img.height });
  img.data.copy(png.data);
  return PNG.sync.write(png);
}

export function blank(width: number, height: number): Image {
  return { width, height, data: Buffer.alloc(width * height * 4) };
}

/** Integer crop clipped to the image (fractional boxes round outwards on size, nearest on origin). */
export function crop(img: Image, r: Rect): Image {
  const x0 = Math.max(0, Math.round(r.x));
  const y0 = Math.max(0, Math.round(r.y));
  const w = Math.max(0, Math.min(img.width - x0, Math.round(r.width)));
  const h = Math.max(0, Math.min(img.height - y0, Math.round(r.height)));
  const out = blank(w, h);
  for (let y = 0; y < h; y++) img.data.copy(out.data, y * w * 4, ((y0 + y) * img.width + x0) * 4, ((y0 + y) * img.width + x0 + w) * 4);
  return out;
}

/** §11.2.5: masks are filled with one solid colour in both images before comparing. */
export function fillRects(img: Image, rects: Rect[]): Image {
  const out: Image = { width: img.width, height: img.height, data: Buffer.from(img.data) };
  for (const r of rects) {
    const x0 = Math.max(0, Math.floor(r.x));
    const y0 = Math.max(0, Math.floor(r.y));
    const x1 = Math.min(img.width, Math.ceil(r.x + r.width));
    const y1 = Math.min(img.height, Math.ceil(r.y + r.height));
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const i = (y * img.width + x) * 4;
        out.data[i] = MASK_RGB[0];
        out.data[i + 1] = MASK_RGB[1];
        out.data[i + 2] = MASK_RGB[2];
        out.data[i + 3] = 255;
      }
  }
  return out;
}

export interface DiffResult {
  width: number;
  height: number;
  diffPixels: number;
  total: number;
  ratio: number;
  /** Heat-map: the first image greyed, changed pixels red, anti-aliasing yellow. */
  heatmap: Image;
  /** Changed pixels only (alpha 255 where counted). */
  mask: Image;
  /** Set when the two images had different sizes and only the overlap was compared. */
  sizeMismatch: { a: [number, number]; b: [number, number] } | null;
}

/** pixelmatch over the overlapping area, threshold 0.1, anti-aliasing detection on (`includeAA: false`). */
export function diff(a: Image, b: Image, threshold = PIXEL_THRESHOLD): DiffResult {
  const width = Math.min(a.width, b.width);
  const height = Math.min(a.height, b.height);
  const same = a.width === b.width && a.height === b.height;
  const A = same ? a : crop(a, { x: 0, y: 0, width, height });
  const B = same ? b : crop(b, { x: 0, y: 0, width, height });
  const heatmap = blank(width, height);
  const mask = blank(width, height);
  const total = width * height;
  const diffPixels = total ? pixelmatch(A.data, B.data, heatmap.data, width, height, { threshold, includeAA: false, alpha: 0.1 }) : 0;
  if (total) pixelmatch(A.data, B.data, mask.data, width, height, { threshold, includeAA: false, diffMask: true });
  return {
    width,
    height,
    diffPixels,
    total,
    ratio: total ? diffPixels / total : 0,
    heatmap,
    mask,
    sizeMismatch: same ? null : { a: [a.width, a.height], b: [b.width, b.height] },
  };
}

export interface Cluster {
  x: number;
  y: number;
  share: number;
}

/** FID-05: every 16×16 block (edge blocks clipped) whose changed-pixel share is above 25 %. */
export function clusterViolations(mask: Image, block: number = CLUSTER.block, maxShare: number = CLUSTER.maxChangedShare): Cluster[] {
  const out: Cluster[] = [];
  for (let by = 0; by < mask.height; by += block)
    for (let bx = 0; bx < mask.width; bx += block) {
      const w = Math.min(block, mask.width - bx);
      const h = Math.min(block, mask.height - by);
      let changed = 0;
      for (let y = by; y < by + h; y++) for (let x = bx; x < bx + w; x++) if (mask.data[(y * mask.width + x) * 4 + 3]! > 0) changed++;
      const share = changed / (w * h);
      if (share > maxShare) out.push({ x: bx, y: by, share });
    }
  return out;
}

export type Rgb = [number, number, number];

/** The most frequent colour in the 5×5 block at the centre of `r` (the fill, not a glyph pixel). */
export function sampleFill(img: Image, r: Rect): Rgb | null {
  const cx = Math.floor(r.x + r.width / 2);
  const cy = Math.floor(r.y + r.height / 2);
  const counts = new Map<string, { rgb: Rgb; n: number }>();
  for (let y = cy - 2; y <= cy + 2; y++)
    for (let x = cx - 2; x <= cx + 2; x++) {
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
      const i = (y * img.width + x) * 4;
      const rgb: Rgb = [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!];
      const k = rgb.join(',');
      const c = counts.get(k);
      if (c) c.n++;
      else counts.set(k, { rgb, n: 1 });
    }
  let best: { rgb: Rgb; n: number } | null = null;
  for (const c of counts.values()) if (!best || c.n > best.n) best = c;
  return best ? best.rgb : null;
}

export const hex = (c: Rgb) => '#' + c.map((v) => v.toString(16).padStart(2, '0').toUpperCase()).join('');

/** sRGB (D65) → CIELAB. */
export function srgbToLab([r, g, b]: Rgb): [number, number, number] {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const X = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / 0.95047;
  const Y = R * 0.2126729 + G * 0.7151522 + B * 0.072175;
  const Z = (R * 0.0193339 + G * 0.119192 + B * 0.9503041) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

/** CIEDE2000 colour difference (Sharma, Wu, Dalal 2005), kL = kC = kH = 1. */
export function deltaE2000(lab1: [number, number, number], lab2: [number, number, number]): number {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const hp = (a: number, b: number) => {
    if (a === 0 && b === 0) return 0;
    const h = Math.atan2(b, a) / rad;
    return h < 0 ? h + 360 : h;
  };
  const h1p = hp(a1p, b1);
  const h2p = hp(a2p, b2);
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
  const Lbp = (L1 + L2) / 2;
  const Cbp = (C1p + C2p) / 2;
  let hbp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) > 180) hbp = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
    else hbp = (h1p + h2p) / 2;
  }
  const T =
    1 -
    0.17 * Math.cos((hbp - 30) * rad) +
    0.24 * Math.cos(2 * hbp * rad) +
    0.32 * Math.cos((3 * hbp + 6) * rad) -
    0.2 * Math.cos((4 * hbp - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hbp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbp;
  const Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}
