// FID-14 (11-fidelity §11.4.4): the spec-values table and the runner's comparisons (the page part runs in E2E).
import { describe, expect, it } from 'vitest';
import { compareBox, compareCss, expectedWindow, liveRows, locator, readRows, type SvRow } from './spec-values';

const rows = readRows();
const row = (id: string) => rows.find((r) => r.id === id)!;

describe('spec-values.json', () => {
  it('has SV-01…SV-38 in order', () =>
    expect(rows.map((r) => r.id)).toEqual(Array.from({ length: 38 }, (_, i) => `SV-${String(i + 1).padStart(2, '0')}`)));
  it('M0 live rows are SV-16, SV-37, SV-38; M1 rows are pending M1', () => {
    expect(liveRows(rows).map((r) => r.id)).toEqual(['SV-16', 'SV-37', 'SV-38']);
    const m1 = rows.filter((r) => r.pending === 'M1').map((r) => r.id);
    expect(m1).toEqual(['SV-13', 'SV-14', 'SV-15', 'SV-17', 'SV-18', 'SV-23', 'SV-24', 'SV-25', 'SV-29', 'SV-32']);
  });
  it('every live row has a machine form and a locator', () => {
    for (const r of liveRows(rows)) {
      expect(r.expect, r.id).not.toBeNull();
      if (r.expect!.kind !== 'window-content') expect(locator(r), r.id).not.toBeNull();
    }
  });
});

describe('FID-14 comparisons', () => {
  it('CSS is exact, per theme', () => {
    const sv38 = row('SV-38') as SvRow & { expect: { kind: 'css' } };
    expect(compareCss(sv38, [{ 'font-synthesis': 'none' }], 'light').ok).toBe(true);
    expect(compareCss(sv38, [{ 'font-synthesis': 'weight style' }], 'light').ok).toBe(false);
    expect(compareCss(sv38, [], 'light').measured).toBe('element not found');
    const sv29 = row('SV-29') as SvRow & { expect: { kind: 'css' } };
    expect(compareCss(sv29, [{ 'background-color': 'rgb(13, 13, 17)' }], 'dark').ok).toBe(true);
    expect(compareCss(sv29, [{ 'background-color': 'rgb(13, 13, 17)' }], 'light').ok).toBe(false);
  });
  it('boxes within ±0.5 px', () => {
    const sv16 = row('SV-16') as SvRow & { expect: { kind: 'box' } };
    expect(compareBox(sv16, [{ width: 1280, height: 32 }]).ok).toBe(true);
    expect(compareBox(sv16, [{ width: 1280, height: 32.5 }]).ok).toBe(true);
    expect(compareBox(sv16, [{ width: 1280, height: 32.6 }]).ok).toBe(false);
    const sv25 = row('SV-25') as SvRow & { expect: { kind: 'min-box' } };
    expect(compareBox(sv25, [{ width: 40, height: 44 }]).ok).toBe(true);
    expect(compareBox(sv25, [{ width: 36, height: 44 }]).ok).toBe(false);
  });
  it('SV-37 window size: 1280×800, or 90 % of a small work area', () => {
    const e = row('SV-37').expect as Parameters<typeof expectedWindow>[0];
    expect(expectedWindow(e, { width: 1920, height: 1040 })).toEqual({ width: 1280, height: 800 });
    expect(expectedWindow(e, { width: 1024, height: 728 })).toEqual({ width: 922, height: 655 });
    expect(expectedWindow(e, { width: 1344, height: 839 })).toEqual({ width: 1210, height: 755 });
  });
});
