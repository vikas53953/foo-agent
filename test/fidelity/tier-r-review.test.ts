// 11-fidelity §11.2.4 ("A Review result is not a pass: it goes to the reviewer and then to Vikas … side by side"), §11.2.7
// step 3 (a CR disputes only the checks it names). M2 review D6: a step with an undisputed check in the Review band was
// reported "disputed" and never reached "For Vikas".
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { build, withReview, type TierRJson } from '../../scripts/fidelity-report';
import { blank, type Image, type Rgb } from '../../scripts/golden/pixels';
import { disputedChecks, rollUp, tierR, type Side } from '../../scripts/tier-r';

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

describe('Tier R roll-up: Review beats a dispute on other checks (review D6)', () => {
  const v = (r1: string, r2: string, r3: string, r4: string) =>
    ({ r1: { verdict: r1 }, r2: { verdict: r2 }, r3: { verdict: r3 }, r4: { verdict: r4 } }) as Parameters<typeof rollUp>[0];
  const cr = { cr: 'CR-0003', checks: ['r1', 'r2'] as ('r1' | 'r2')[] };

  it('R4 in the Review band with R1 disputed is "review", and the dispute is still listed', () => {
    expect(rollUp(v('fail', 'pass', 'pass', 'review'), cr)).toEqual({ verdict: 'review', disputed: { cr: 'CR-0003', checks: ['r1'] } });
  });
  it('only the failing checks the CR names are excused; an undisputed failure fails', () => {
    expect(rollUp(v('fail', 'fail', 'pass', 'pass'), cr).verdict).toBe('disputed');
    expect(rollUp(v('fail', 'pass', 'fail', 'review'), cr).verdict).toBe('fail');
    // A disputed check in the Review band is not excused (the CR covers its failure only).
    expect(rollUp(v('review', 'pass', 'pass', 'pass'), cr)).toEqual({ verdict: 'review', disputed: null });
  });
  it('no dispute: the worst check', () => {
    expect(rollUp(v('pass', 'pass', 'pass', 'review'), null).verdict).toBe('review');
    expect(rollUp(v('pass', 'pass', 'pass', 'pass'), null)).toEqual({ verdict: 'pass', disputed: null });
  });

  it('on a synthetic frame: disputed R1 (other words) and R4 at 5 % → review', () => {
    const box = { x: 5, y: 5, width: 20, height: 10 };
    const frame = paint(solid(40, 30, [255, 255, 255]), 5, 5, 20, 10, [43, 63, 214]);
    const app = paint(frame, 5, 5, 5, 2, [0, 0, 0]); // 10 of the 200 hl pixels, away from the anchor centre
    const side = (image: Image, texts: string[]): Side => ({ image, texts, hlTexts: texts, hl: box, anchors: { button: box }, masks: [] });
    const d = disputedChecks([{ cr: 'CR-0003', ids: ['UX-08-03'], checks: ['r1'] }], 'UX-08-03');
    const r = tierR('UX-08-03', 'light', side(frame, ['Approve ₹14,600']), side(app, ['Pay now']), null, d);
    expect([r.r1.verdict, r.r4.verdict, r.verdict]).toEqual(['fail', 'review', 'review']);
    expect(r.disputed).toEqual({ cr: 'CR-0003', checks: ['r1'] });
  });
});

describe('the report routes Review rows to "For Vikas" (review D6)', () => {
  const row = (id: string, verdict: TierRJson['verdict'], r4: string, ratio: number): TierRJson => ({
    id,
    theme: 'light',
    verdict,
    disputed: { cr: 'CR-0003', checks: ['r1'] },
    r1: { verdict: 'fail' },
    r2: { verdict: 'pass', anchors: [] },
    r3: { verdict: 'pass', anchors: [] },
    r4: { verdict: r4, ratio, skipped: null },
    r5: { ratio: 0.02, heatmap: null },
    ref: 'none.png',
    app: 'none.png',
  });

  it('an older "disputed" result with R4 in Review is read as review', () => {
    expect(withReview(row('UX-08-05', 'disputed', 'review', 0.0363)).verdict).toBe('review');
    expect(withReview(row('UX-08-01', 'disputed', 'pass', 0.01)).verdict).toBe('disputed');
  });

  it('lists each Review row, with the check and its number, in "For Vikas"', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tier-r-'));
    writeFileSync(join(dir, 'UX-08-05.light.tier-r.json'), JSON.stringify(row('UX-08-05', 'disputed', 'review', 0.0363)));
    writeFileSync(join(dir, 'UX-08-01.light.tier-r.json'), JSON.stringify(row('UX-08-01', 'disputed', 'pass', 0.01)));
    const r = build({
      milestone: 'M2',
      vitest: null,
      e2e: null,
      refsDir: 'does-not-exist',
      tierRDir: dir,
      runner: { pinned: null },
      fid14: null,
      eslint: null,
      audit: null,
      env: {},
    });
    expect(r.golden.counts).toMatchObject({ review: 1, disputed: 1 });
    expect(r.forVikas.changed.join('\n')).toContain('UX-08-05 (light): R4 pixels (3.63 %) in the Review band');
    expect(r.forVikas.changed.join('\n')).not.toContain('UX-08-01');
  });
});
