// 11-fidelity §11.2.1, §11.2.7: golden/manifest.json is generated from the frozen walkthrough and fixes the BP ids.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { BP, CHAPTER_MILESTONE, SUPERSEDED, readManifest } from '../../scripts/golden-manifest';
import { compareRenders, select, type RefJson } from '../../scripts/golden-render';

const manifest = readManifest();

describe('golden manifest', () => {
  it('has the 245 walkthrough steps in 25 chapters with well-formed ids', () => {
    expect(manifest.counts).toEqual({ uxChapters: 25, uxSteps: 245, uxFrames: 490, bp: BP.length });
    expect(manifest.ux).toHaveLength(245);
    expect(new Set(manifest.ux.map((e) => e.id)).size).toBe(245);
    for (const [i, e] of manifest.ux.entries()) {
      expect(e.id).toMatch(/^UX-(0[1-9]|1\d|2[0-5])-(0[1-9]|1[0-6])$/);
      expect(e.index).toBe(i);
      expect(e.c && e.s && e.f).toBeTruthy();
    }
  });
  it('matches the 11 §11.2.1 chapter table counts', () => {
    const perChapter = [8, 9, 10, 13, 7, 8, 8, 7, 8, 8, 10, 12, 16, 10, 10, 10, 10, 10, 10, 6, 11, 8, 11, 12, 13];
    const counts = Array.from({ length: 25 }, (_, c) => manifest.ux.filter((e) => e.chapter === c + 1).length);
    expect(counts).toEqual(perChapter);
  });
  it('maps every chapter anchor to a milestone (or null) and keeps the superseded list', () => {
    for (const e of manifest.ux) expect(e.anchor.split('-')[0]! in CHAPTER_MILESTONE).toBe(true);
    expect(manifest.superseded.map((s) => s.id).sort()).toEqual(Object.keys(SUPERSEDED).sort());
    for (const s of manifest.superseded) expect(manifest.ux.find((e) => e.id === s.id)?.superseded?.decision).toBe(s.decision);
  });
  it('fixes the BP ids for M1 with selectors and spec sections', () => {
    expect(manifest.bp).toEqual(BP);
    const ids = manifest.bp.map((b) => b.id);
    for (const id of ['BP-APP-L', 'BP-APP-M', 'BP-APP-R', 'BP-ANAT-L', 'BP-ANAT-M', 'BP-ANAT-S', 'BP-ANAT-XS']) expect(ids).toContain(id);
    for (const b of manifest.bp) {
      expect(b.selector).not.toBe('');
      expect(b.spec).toMatch(/§/);
      expect(b.milestone).toBe('M1');
    }
  });
  it('the selectors exist in the frozen Blueprint', () => {
    const html = readFileSync(manifest.sources.bp, 'utf8');
    for (const cls of ['id="win"', 'class="left"', 'class="mid"', 'class="right"', 'class="tbar"', 'class="lhead"', 'class="rhead"'])
      expect(html).toContain(cls);
  });
});

describe('golden-render helpers', () => {
  it('selects by milestone, id and family', () => {
    expect(select(manifest, { milestone: 'M1' }).bp).toHaveLength(BP.length);
    expect(select(manifest, { milestone: 'M1' }).ux).toHaveLength(0);
    expect(select(manifest, { ids: ['UX-08-01'] }).ux.map((e) => e.id)).toEqual(['UX-08-01']);
    expect(select(manifest, { milestone: 'M2', family: 'bp' }).ux).toHaveLength(0);
    expect(select(manifest, { milestone: 'M2' }).ux).toHaveLength(7);
  });
  it('FID-03 compare flags any PNG whose bytes differ', () => {
    const ref = (id: string, light: string): RefJson =>
      ({ id, files: { light: { png: '', sha256: light }, dark: { png: '', sha256: 'd' } } }) as unknown as RefJson;
    expect(compareRenders([ref('A', 'x')], [ref('A', 'x')])).toEqual([]);
    expect(compareRenders([ref('A', 'x')], [ref('A', 'y')])).toEqual(['A.light']);
  });
});
