// 11-fidelity §11.2.4 Tier R scoring (R1–R5) and the FID-05 cluster rule, on tiny synthetic images.
import { describe, expect, it } from 'vitest';
import {
  blank,
  clusterViolations,
  decodePng,
  deltaE2000,
  diff,
  encodePng,
  fillRects,
  srgbToLab,
  type Image,
  type Rgb,
} from '../../scripts/golden/pixels';
import { authorise, crFile } from '../../scripts/golden-bless';
import { boxVerdict, colourVerdict, ratioVerdict, tierR, wordDiff, words, type Side, disputedChecks } from '../../scripts/tier-r';

function solid(w: number, h: number, rgb: Rgb): Image {
  const img = blank(w, h);
  for (let i = 0; i < w * h; i++) img.data.set([...rgb, 255], i * 4);
  return img;
}
function paint(img: Image, x0: number, y0: number, w: number, h: number, rgb: Rgb): Image {
  const out = { ...img, data: Buffer.from(img.data) };
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) out.data.set([...rgb, 255], (y * img.width + x) * 4);
  return out;
}
const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];

describe('CIEDE2000 (Sharma et al. 2005 test data)', () => {
  it.each([
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
    [[50, 0, 0], [50, -1, 2], 2.3669],
    [[50, 2.49, -0.001], [50, -2.49, 0.0009], 7.1792],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
    [[2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514], 0.9082],
  ] as [number[], number[], number][])('%j vs %j = %d', (a, b, want) => {
    expect(deltaE2000(a as [number, number, number], b as [number, number, number])).toBeCloseTo(want, 3);
  });
  it('sRGB white is L 100, a 0, b 0', () => {
    const [L, a, b] = srgbToLab(WHITE);
    expect(L).toBeCloseTo(100, 2);
    expect(Math.abs(a) + Math.abs(b)).toBeLessThan(0.01);
  });
});

describe('Tier R thresholds', () => {
  const ref = { x: 10, y: 10, width: 100, height: 40 };
  it('R2: ±4 px position and ±2 px size pass, up to 8 px review, beyond or missing fail', () => {
    expect(boxVerdict(ref, ref).verdict).toBe('pass');
    expect(boxVerdict(ref, { x: 14, y: 6, width: 102, height: 38 }).verdict).toBe('pass');
    expect(boxVerdict(ref, { ...ref, x: 15 }).verdict).toBe('review');
    expect(boxVerdict(ref, { ...ref, width: 103 }).verdict).toBe('review');
    expect(boxVerdict(ref, { ...ref, y: 18, height: 48 }).verdict).toBe('review');
    expect(boxVerdict(ref, { ...ref, x: 19 }).verdict).toBe('fail');
    expect(boxVerdict(ref, { ...ref, height: 49 }).verdict).toBe('fail');
    expect(boxVerdict(ref, undefined).verdict).toBe('fail');
  });
  it('R3: ΔE ≤ 2 pass, 2–5 review, > 5 fail', () => {
    expect(colourVerdict(0)).toBe('pass');
    expect(colourVerdict(2)).toBe('pass');
    expect(colourVerdict(2.01)).toBe('review');
    expect(colourVerdict(5)).toBe('review');
    expect(colourVerdict(5.01)).toBe('fail');
  });
  it('R4: ≤ 3 % pass, 3–10 % review, > 10 % fail', () => {
    expect(ratioVerdict(0.03)).toBe('pass');
    expect(ratioVerdict(0.031)).toBe('review');
    expect(ratioVerdict(0.1)).toBe('review');
    expect(ratioVerdict(0.11)).toBe('fail');
  });
  it('R1: word-level missing and extra', () => {
    expect(wordDiff(words(['Pay  Taj', 'now']), words(['Pay Taj now']))).toEqual({ missing: [], extra: [] });
    expect(wordDiff(words(['Approve ₹14,600']), words(['Approve ₹14,500', 'Not now']))).toEqual({
      missing: ['₹14,600'],
      extra: ['₹14,500', 'Not', 'now'],
    });
  });
});

describe('pixel diff', () => {
  it('counts isolated changed pixels (threshold 0.1) and draws a heat-map', () => {
    const a = solid(10, 10, WHITE);
    const b = paint(paint(a, 2, 2, 1, 1, BLACK), 7, 7, 1, 1, BLACK);
    const d = diff(a, b);
    expect(d.diffPixels).toBe(2);
    expect(d.ratio).toBeCloseTo(0.02);
    expect(d.heatmap.data.subarray((2 * 10 + 2) * 4, (2 * 10 + 2) * 4 + 3)).toEqual(Buffer.from([255, 0, 0]));
    expect(decodePng(encodePng(d.heatmap)).width).toBe(10);
  });
  it('ignores a change below the per-pixel threshold', () => {
    expect(diff(solid(4, 4, WHITE), solid(4, 4, [254, 254, 254])).diffPixels).toBe(0);
  });
  it('compares the overlap and reports a size mismatch', () => {
    const d = diff(solid(10, 10, WHITE), solid(8, 12, WHITE));
    expect([d.width, d.height, d.diffPixels]).toEqual([8, 10, 0]);
    expect(d.sizeMismatch).toEqual({ a: [10, 10], b: [8, 12] });
  });
  it('masks fill both sides with one colour before comparing', () => {
    const a = solid(10, 10, WHITE);
    const b = paint(a, 0, 0, 4, 4, BLACK);
    const m = [{ x: 0, y: 0, width: 4, height: 4 }];
    expect(diff(fillRects(a, m), fillRects(b, m)).diffPixels).toBe(0);
  });
});

describe('FID-05 cluster rule (16×16 blocks, > 25 % changed)', () => {
  const base = solid(32, 32, WHITE);
  it('passes a small change inside one block (5×5 = 9.8 %)', () => {
    expect(clusterViolations(diff(base, paint(base, 3, 3, 5, 5, BLACK)).mask)).toEqual([]);
  });
  it('fails a 9×9 change (31.6 %) even though the frame ratio is only 7.9 %', () => {
    const d = diff(base, paint(base, 18, 2, 9, 9, BLACK));
    expect(d.ratio).toBeLessThan(0.08);
    expect(clusterViolations(d.mask)).toEqual([{ x: 16, y: 0, share: 81 / 256 }]);
  });
});

describe('tierR end to end on a synthetic frame', () => {
  const frame = paint(solid(40, 30, WHITE), 5, 5, 20, 10, [43, 63, 214]);
  const side = (image: Image, box = { x: 5, y: 5, width: 20, height: 10 }): Side => ({
    image,
    texts: ['Approve ₹14,600'],
    hlTexts: ['Approve ₹14,600'],
    hl: box,
    anchors: { button: box },
    masks: [],
  });
  it('identical frames pass every check', () => {
    const r = tierR('UX-00-00', 'light', side(frame), side(frame));
    expect([r.verdict, r.r1.verdict, r.r2.verdict, r.r3.verdict, r.r4.verdict, r.r5.ratio]).toEqual([
      'pass',
      'pass',
      'pass',
      'pass',
      'pass',
      0,
    ]);
  });
  it('a moved, recoloured button with other words fails', () => {
    const app = paint(solid(40, 30, WHITE), 15, 15, 20, 10, [200, 30, 30]);
    const r = tierR('UX-00-00', 'light', side(frame), { ...side(app, { x: 15, y: 15, width: 20, height: 10 }), texts: ['Pay now'] });
    expect(r.verdict).toBe('fail');
    expect(r.r1.verdict).toBe('fail');
    expect(r.r2.verdict).toBe('fail');
    expect(r.r3.verdict).toBe('fail');
    expect(r.r4.verdict).toBe('fail');
    expect(r.r5.ratio).toBeGreaterThan(0);
  });
  it('a superseded step skips only the hl pixel compare', () => {
    const app = paint(frame, 5, 5, 20, 10, [0, 0, 0]);
    const r = tierR('UX-13-03', 'light', side(frame), side(app), 'X-04');
    expect(r.r4.skipped).toMatch(/superseded/);
    expect(r.r3.verdict).toBe('fail');
  });
  it('a CR dispute turns only its own failing checks into expected fails (§11.2.7)', () => {
    const app = { ...side(frame), texts: ['Pay now'] };
    const d = disputedChecks([{ cr: 'CR-0002', ids: ['BP-X'], checks: ['r1', 'r2'] }], 'BP-X');
    const r = tierR('BP-X', 'light', side(frame), app, null, d);
    expect([r.verdict, r.r1.verdict, r.disputed]).toEqual(['disputed', 'fail', { cr: 'CR-0002', checks: ['r1'] }]);
    // An undisputed failing check still fails the ref, and other refs are not covered.
    const moved = paint(solid(40, 30, WHITE), 15, 15, 20, 10, [200, 30, 30]);
    expect(tierR('BP-X', 'light', side(frame), side(moved, { x: 15, y: 15, width: 20, height: 10 }), null, d).verdict).toBe('fail');
    expect(disputedChecks([{ cr: 'CR-0002', ids: ['BP-X'], checks: ['r1'] }], 'BP-Y')).toBeNull();
    expect(tierR('BP-X', 'light', side(frame), side(frame), null, d)).toMatchObject({ verdict: 'pass', disputed: null });
  });
});

describe('golden-bless refuses without a CR or a signed report (FID-06)', () => {
  it('needs --cr or --report', () => {
    expect(() => authorise({})).toThrow(/needs --cr CR-nnnn or --report/);
    expect(() => authorise({ cr: 'CR-9999' })).toThrow(/not a CR file/);
    expect(() => authorise({ cr: 'cr-1' })).toThrow(/not a CR file/);
    expect(() => authorise({ report: 'M1-unsigned' })).toThrow(/no signed fidelity report/);
    expect(() => authorise({ cr: 'CR-0001', report: 'x' })).toThrow(/not both/);
  });
  it('accepts an existing CR file', () => {
    expect(crFile('CR-0001')).toMatch(/CR-0001-freeze-completion\.md$/);
    expect(authorise({ cr: 'CR-0001' }).kind).toBe('cr');
  });
});
