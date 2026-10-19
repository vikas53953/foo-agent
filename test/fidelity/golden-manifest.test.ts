// 11-fidelity §11.2.1, §11.2.7: golden/manifest.json is generated from the frozen walkthrough and fixes the BP ids.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  BP,
  BP_M2,
  BP_M4,
  BP_M5,
  BP_M6,
  CHAPTER_MILESTONE,
  EARLY_STEPS,
  STEP_MILESTONE,
  SUPERSEDED,
  readManifest,
} from '../../scripts/golden-manifest';
import { compareRenders, select, type RefJson } from '../../scripts/golden-render';

const manifest = readManifest();

describe('golden manifest', () => {
  it('has the 245 walkthrough steps in 25 chapters with well-formed ids', () => {
    expect(manifest.counts).toEqual({
      uxChapters: 25,
      uxSteps: 245,
      uxFrames: 490,
      bp: BP.length + BP_M2.length + BP_M4.length + BP_M5.length + BP_M6.length,
    });
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
    expect(manifest.bp).toEqual([...BP, ...BP_M2, ...BP_M4, ...BP_M5, ...BP_M6]);
    const ids = manifest.bp.map((b) => b.id);
    for (const id of ['BP-APP-L', 'BP-APP-M', 'BP-APP-R', 'BP-ANAT-L', 'BP-ANAT-M', 'BP-ANAT-S', 'BP-ANAT-XS']) expect(ids).toContain(id);
    for (const b of BP) {
      expect(b.selector).not.toBe('');
      expect(b.spec).toMatch(/§/);
      expect(b.milestone).toBe('M1');
    }
  });
  it('CR-0003 adds the four message refs and nine composer refs; the engine-only states wait for M3', () => {
    expect(BP_M2.map((b) => b.id)).toEqual([
      ...[1, 2, 3, 4].map((n) => `BP-MSG-0${n}`),
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `BP-COMP-0${n}`),
    ]);
    expect(BP_M2.filter((b) => b.milestone === 'M3').map((b) => b.id)).toEqual(['BP-MSG-02', 'BP-COMP-03']);
    for (const b of BP_M2) {
      expect(b.drawn).toBe(true);
      expect(b.spec).toMatch(/§/);
      expect(b.selector).toMatch(/^#(messages|compstates) .*\.mini$/);
    }
    expect(manifest.ux.filter((e) => e.firstTested && e.firstTested === 'M2').map((e) => [e.id, e.milestone, e.firstTested])).toEqual(
      ['UX-09-01', 'UX-09-08'].map((id) => [id, 'M11', 'M2']),
    );
  });
  it('CR-0008 adds the six M4 card refs and the M4 early UX-23 / UX-05 steps', () => {
    // CR-0010: the M6 refs.
    expect(BP_M6.map((b) => b.id)).toEqual(['BP-CARD-16', 'BP-SCR-09']);
    expect(BP_M4.map((b) => b.id)).toEqual(['BP-CARD-02', 'BP-CARD-12', 'BP-CARD-15', 'BP-CARD-18', 'BP-CARD-19', 'BP-CARD-20']);
    for (const b of BP_M4) {
      expect(b.milestone).toBe('M4');
      expect(b.selector).toMatch(/^#cardgal > \.panel:nth-child\(\d+\) > \.mini$/);
    }
    const early = manifest.ux.filter((e) => e.firstTested).map((e) => [e.id, e.milestone, e.firstTested]);
    expect(early).toEqual(
      manifest.ux
        .filter((e) => e.id in EARLY_STEPS)
        .map((e) => [e.id, STEP_MILESTONE[e.id] ?? CHAPTER_MILESTONE[e.anchor.split('-')[0]!] ?? null, EARLY_STEPS[e.id]]),
    );
    expect(early.filter((e) => e[2] === 'M4').map((e) => e[0])).toEqual([
      'UX-05-02',
      'UX-05-03',
      'UX-05-04',
      ...['01', '02', '03', '04', '05', '06', '09', '11'].map((s) => `UX-23-${s}`),
    ]);
  });
  it('CR-0009 adds the six M5 card refs, the M5 early Approval / Draft steps, moves the notification-answer step of chapter 10 to M11 and the memory chip step to M6', () => {
    expect(BP_M5.map((b) => b.id)).toEqual(['BP-CARD-03', 'BP-CARD-04', 'BP-CARD-05', 'BP-CARD-07', 'BP-CARD-08', 'BP-CARD-09']);
    for (const b of BP_M5) {
      expect(b.milestone).toBe('M5');
      expect(b.selector).toMatch(/^#cardgal > \.panel:nth-child\(\d+\) > \.mini$/);
    }
    const early = manifest.ux.filter((e) => e.firstTested === 'M5').map((e) => [e.id, e.milestone]);
    expect(early).toEqual([
      ['UX-12-05', 'M9'],
      ['UX-12-06', 'M9'],
      ['UX-16-02', 'M8'],
      ['UX-16-04', 'M8'],
      ['UX-16-06', 'M8'],
    ]);
    const choice = manifest.ux.filter((e) => e.id.startsWith('UX-10-'));
    expect(choice.filter((e) => e.milestone === 'M5').map((e) => e.id)).toEqual(['01', '03', '04', '05', '06'].map((s) => `UX-10-${s}`));
    expect(choice.find((e) => e.id === 'UX-10-07')?.milestone).toBe('M11');
    // G-M5-26: the memory chip step waits for memory in replies.
    expect(choice.find((e) => e.id === 'UX-10-02')?.milestone).toBe('M6');
    // G-M5-41: the [ Search again ] step waits for the message-button contract.
    expect(choice.find((e) => e.id === 'UX-10-08')?.milestone).toBe('M13');
  });
  it('the selectors exist in the frozen Blueprint', () => {
    const html = readFileSync(manifest.sources.bp, 'utf8');
    for (const cls of [
      'id="win"',
      'class="left"',
      'class="mid"',
      'class="right"',
      'class="tbar"',
      'class="lhead"',
      'class="rhead"',
      'id="messages"',
      'id="compstates"',
      'id="cardgal"',
    ])
      expect(html).toContain(cls);
  });
});

describe('golden-render helpers', () => {
  it('selects by milestone, id and family', () => {
    expect(select(manifest, { milestone: 'M1' }).bp).toHaveLength(BP.length);
    expect(select(manifest, { milestone: 'M1' }).ux).toHaveLength(0);
    expect(select(manifest, { ids: ['UX-08-01'] }).ux.map((e) => e.id)).toEqual(['UX-08-01']);
    expect(select(manifest, { milestone: 'M2', family: 'bp' }).ux).toHaveLength(0);
    // UX-08 (7 steps) plus the two UX-09 steps M2 tests first (CR-0003); 11 drawn M2 BP ids (BP-MSG-02, BP-COMP-03 are M3).
    expect(select(manifest, { milestone: 'M2' }).ux.map((e) => e.id)).toEqual([
      ...[1, 2, 3, 4, 5, 6, 7].map((n) => `UX-08-0${n}`),
      'UX-09-01',
      'UX-09-08',
    ]);
    expect(select(manifest, { milestone: 'M2' }).bp).toHaveLength(11);
    expect(select(manifest, { milestone: 'M1,M2', family: 'bp' }).bp).toHaveLength(BP.length + 11);
    expect(select(manifest, { milestone: 'M11' }).ux.map((e) => e.id)).toContain('UX-09-01');
  });
  it('FID-03 compare flags any PNG whose bytes differ', () => {
    const ref = (id: string, light: string): RefJson =>
      ({ id, files: { light: { png: '', sha256: light }, dark: { png: '', sha256: 'd' } } }) as unknown as RefJson;
    expect(compareRenders([ref('A', 'x')], [ref('A', 'x')])).toEqual([]);
    expect(compareRenders([ref('A', 'x')], [ref('A', 'y')])).toEqual(['A.light']);
  });
});
