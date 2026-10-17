// Spec: 11-fidelity §11.2.4 Tier R (reference conformance, app vs drawing): R1 copy, R2 anchor boxes, R3 colour (CIEDE2000
// at anchor centres), R4 hl-crop pixels, R5 whole frame (reported, with a diff heat-map); §11.2.5 masks; §11.2.7 superseded
// steps skip the pixel compare of the highlighted element only.
// Usage: tsx scripts/tier-r.ts --ref golden/ref/ux/UX-08-01.json --app golden/out/app/UX-08-01.light.json --theme light
//        [--out golden/out/tier-r]
// The app capture JSON is written by the step's test: { id, theme, png, texts, hlTexts, hl, anchors, masks? } with boxes in
// frame pixels and anchors keyed by the same names as the reference JSON.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { crop, deltaE2000, diff, encodePng, fillRects, hex, readPng, sampleFill, srgbToLab, type Image, type Rect } from './golden/pixels';

export type Verdict = 'pass' | 'review' | 'fail';
export const R2_LIMITS = { passPos: 4, passSize: 2, review: 8 } as const;
export const R3_LIMITS = { pass: 2, review: 5 } as const;
export const R4_LIMITS = { pass: 0.03, review: 0.1 } as const;

export interface Side {
  image: Image;
  texts: string[];
  hlTexts: string[];
  hl: Rect | null;
  anchors: Record<string, Rect>;
  masks: Rect[];
}

const RANK: Record<Verdict, number> = { pass: 0, review: 1, fail: 2 };
export const worst = (vs: Verdict[]): Verdict => vs.reduce<Verdict>((a, b) => (RANK[b] > RANK[a] ? b : a), 'pass');

// ---------- R1 copy ----------
export const words = (texts: string[]) => texts.join(' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);

/** Word-level difference (LCS): words only in the reference are missing, words only in the app are extra. */
export function wordDiff(ref: string[], app: string[]): { missing: string[]; extra: string[] } {
  const n = ref.length;
  const m = app.length;
  const L: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) L[i]![j] = ref[i] === app[j] ? L[i + 1]![j + 1]! + 1 : Math.max(L[i + 1]![j]!, L[i]![j + 1]!);
  const missing: string[] = [];
  const extra: string[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (ref[i] === app[j]) {
      i++;
      j++;
    } else if (L[i + 1]![j]! >= L[i]![j + 1]!) missing.push(ref[i++]!);
    else extra.push(app[j++]!);
  }
  while (i < n) missing.push(ref[i++]!);
  while (j < m) extra.push(app[j++]!);
  return { missing, extra };
}

export function r1(ref: Side, app: Side) {
  const frame = wordDiff(words(ref.texts), words(app.texts));
  const hl = wordDiff(words(ref.hlTexts), words(app.hlTexts));
  const same = !frame.missing.length && !frame.extra.length && !hl.missing.length && !hl.extra.length;
  return { verdict: (same ? 'pass' : 'fail') as Verdict, frame, hl };
}

// ---------- R2 anchors ----------
export function boxVerdict(ref: Rect, app: Rect | undefined) {
  if (!app) return { dPos: null, dSize: null, verdict: 'fail' as Verdict };
  const dPos = Math.max(Math.abs(app.x - ref.x), Math.abs(app.y - ref.y));
  const dSize = Math.max(Math.abs(app.width - ref.width), Math.abs(app.height - ref.height));
  const verdict: Verdict =
    dPos <= R2_LIMITS.passPos && dSize <= R2_LIMITS.passSize
      ? 'pass'
      : dPos <= R2_LIMITS.review && dSize <= R2_LIMITS.review
        ? 'review'
        : 'fail';
  return { dPos, dSize, verdict };
}

export function r2(ref: Side, app: Side) {
  const anchors = Object.entries(ref.anchors).map(([name, box]) => ({
    name,
    ref: box,
    app: app.anchors[name] ?? null,
    ...boxVerdict(box, app.anchors[name]),
  }));
  return { verdict: worst(anchors.map((a) => a.verdict)), anchors };
}

// ---------- R3 colour ----------
export function colourVerdict(dE: number): Verdict {
  return dE <= R3_LIMITS.pass ? 'pass' : dE <= R3_LIMITS.review ? 'review' : 'fail';
}

export function r3(ref: Side, app: Side) {
  const anchors = Object.entries(ref.anchors).map(([name, box]) => {
    const appBox = app.anchors[name];
    const a = sampleFill(ref.image, box);
    const b = appBox ? sampleFill(app.image, appBox) : null;
    if (!a || !b) return { name, ref: a ? hex(a) : null, app: b ? hex(b) : null, deltaE: null, verdict: 'fail' as Verdict };
    const deltaE = deltaE2000(srgbToLab(a), srgbToLab(b));
    return { name, ref: hex(a), app: hex(b), deltaE: Math.round(deltaE * 100) / 100, verdict: colourVerdict(deltaE) };
  });
  return { verdict: worst(anchors.map((a) => a.verdict)), anchors };
}

// ---------- R4 hl crop, R5 whole frame ----------
export function ratioVerdict(ratio: number): Verdict {
  return ratio <= R4_LIMITS.pass ? 'pass' : ratio <= R4_LIMITS.review ? 'review' : 'fail';
}

export function r4(ref: Side, app: Side, superseded: string | null) {
  if (superseded) return { verdict: 'pass' as Verdict, skipped: `superseded (${superseded})`, ratio: null, diffPixels: null, total: null };
  if (!ref.hl) return { verdict: 'pass' as Verdict, skipped: 'no hl element', ratio: null, diffPixels: null, total: null };
  if (!app.hl) return { verdict: 'fail' as Verdict, skipped: 'hl element missing in the app', ratio: null, diffPixels: null, total: null };
  const size = { width: ref.hl.width, height: ref.hl.height };
  const a = crop(fillRects(ref.image, ref.masks), { ...ref.hl, ...size });
  const b = crop(fillRects(app.image, app.masks), { x: app.hl.x, y: app.hl.y, ...size });
  const d = diff(a, b);
  return { verdict: ratioVerdict(d.ratio), skipped: null, ratio: d.ratio, diffPixels: d.diffPixels, total: d.total };
}

export function r5(ref: Side, app: Side) {
  const d = diff(fillRects(ref.image, ref.masks), fillRects(app.image, app.masks));
  return { ratio: d.ratio, diffPixels: d.diffPixels, total: d.total, sizeMismatch: d.sizeMismatch, heatmap: d.heatmap };
}

export interface TierRResult {
  id: string;
  theme: string;
  verdict: Verdict;
  r1: ReturnType<typeof r1>;
  r2: ReturnType<typeof r2>;
  r3: ReturnType<typeof r3>;
  r4: ReturnType<typeof r4>;
  r5: Omit<ReturnType<typeof r5>, 'heatmap'> & { heatmap: string | null };
  ref: string;
  app: string;
}

export function tierR(id: string, theme: string, ref: Side, app: Side, superseded: string | null = null) {
  const res = { r1: r1(ref, app), r2: r2(ref, app), r3: r3(ref, app), r4: r4(ref, app, superseded), r5: r5(ref, app) };
  const verdict = worst([res.r1.verdict, res.r2.verdict, res.r3.verdict, res.r4.verdict]);
  return { id, theme, verdict, ...res };
}

// ---------- CLI ----------
interface RefFile {
  id: string;
  files: Record<string, { png: string }>;
  texts: string[];
  hlTexts: string[];
  hl: { box: Rect | null } | null;
  anchors?: Record<string, Rect>;
  masks?: Rect[];
  ux?: { superseded: string | null };
}
interface AppFile {
  id: string;
  theme: string;
  png: string;
  texts: string[];
  hlTexts: string[];
  hl: Rect | null;
  anchors: Record<string, Rect>;
  masks?: Rect[];
}

function main() {
  const { values } = parseArgs({
    options: {
      ref: { type: 'string' },
      app: { type: 'string' },
      theme: { type: 'string', default: 'light' },
      out: { type: 'string', default: join('golden', 'out', 'tier-r') },
    },
  });
  if (!values.ref || !values.app) throw new Error('--ref and --app are required');
  const refJson = JSON.parse(readFileSync(values.ref, 'utf8')) as RefFile;
  const appJson = JSON.parse(readFileSync(values.app, 'utf8')) as AppFile;
  const theme = values.theme!;
  const refPng = refJson.files[theme]?.png;
  if (!refPng) throw new Error(`${refJson.id} has no ${theme} reference PNG`);
  const ref: Side = {
    image: readPng(join(dirname(values.ref), refPng)),
    texts: refJson.texts,
    hlTexts: refJson.hlTexts,
    hl: refJson.hl?.box ?? null,
    anchors: refJson.anchors ?? {},
    masks: refJson.masks ?? [],
  };
  const app: Side = {
    image: readPng(resolve(dirname(values.app), appJson.png)),
    texts: appJson.texts,
    hlTexts: appJson.hlTexts,
    hl: appJson.hl,
    anchors: appJson.anchors,
    masks: refJson.masks ?? [], // masks come from the reference step JSON only (§11.2.5), never from the app side
  };
  const res = tierR(refJson.id, theme, ref, app, refJson.ux?.superseded ?? null);
  mkdirSync(values.out!, { recursive: true });
  const heat = `${refJson.id}.${theme}.diff.png`;
  writeFileSync(join(values.out!, heat), encodePng(res.r5.heatmap));
  const out: TierRResult = {
    ...res,
    r5: { ...res.r5, heatmap: heat },
    ref: join(dirname(values.ref), refPng),
    app: resolve(dirname(values.app), appJson.png),
  };
  writeFileSync(join(values.out!, `${refJson.id}.${theme}.tier-r.json`), JSON.stringify(out, null, 2) + '\n');
  console.log(
    `${refJson.id} ${theme}: ${res.verdict.toUpperCase()} (R1 ${res.r1.verdict}, R2 ${res.r2.verdict}, R3 ${res.r3.verdict}, R4 ${res.r4.verdict}, R5 ${(res.r5.ratio * 100).toFixed(2)} %)`,
  );
  if (res.verdict === 'fail') process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
