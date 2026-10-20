// 02-2 §F15.9.1a pose geometry (binding: % of the disc, the right eye mirrors the left), §F15.9.1 ring sizes and shapes,
// §F15.9.3d (animate={false}: still Resting with only the Working and Needs you rings), §F15.9.2 blink cycle, §F15.9.9
// (`data-state` = the mood on the face root; `Avatar` renders `Face` for living faces), §F15.1 (FooMark = Resting, still).
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { MOODS } from '../../../src/shared/face';
import { barHeights, blinkCycleMs, Face, facePose, ringMetrics } from '../../../src/renderer/ui/Face';
import { Avatar } from '../../../src/renderer/ui/Avatar';
import { FooMark } from '../../../src/renderer/icons/custom/FooMark';

// Node has no matchMedia; the face reads reduced motion through this hook (the e2e run checks the real one).
vi.mock('../../../src/renderer/a11y/useReducedMotion', () => ({ useReducedMotion: () => false }));

describe('pose geometry (§F15.9.1a)', () => {
  it('base eye: 12 × 24, radius 6, centre (36, 48); the right eye mirrors it to x 64', () => {
    expect(facePose('resting').left).toEqual({ kind: 'rect', x: 30, y: 36, w: 12, h: 24, r: 6 });
    expect(facePose('resting').right).toBe('mirror');
  });
  it('noticed 13 × 27 and needs you 13 × 26, radius 6.5, same centre', () => {
    expect(facePose('noticed').left).toEqual({ kind: 'rect', x: 29.5, y: 34.5, w: 13, h: 27, r: 6.5 });
    expect(facePose('needs_you').left).toEqual({ kind: 'rect', x: 29.5, y: 35, w: 13, h: 26, r: 6.5 });
  });
  it('listening down 7 (centre y 55); thinking 12 × 20 up 8 (y 40) with drift; working 12 × 18', () => {
    expect(facePose('listening').left).toMatchObject({ y: 43, h: 24 });
    expect(facePose('thinking')).toMatchObject({ left: { y: 30, h: 20 }, motion: 'drift' });
    expect(facePose('working').left).toMatchObject({ y: 39, h: 18 });
  });
  it('happy arcs: chord 16 at y 47 centred on x 36, rise 7, stroke 6; asleep is the arc flipped at y 50', () => {
    expect(facePose('happy').left).toEqual({ kind: 'arc', d: 'M28 47 Q36 33 44 47', stroke: 6 });
    expect(facePose('asleep').left).toEqual({ kind: 'arc', d: 'M28 50 Q36 64 44 50', stroke: 6 });
  });
  it('wink: left base eye, right a Happy arc at x 64, with the 👍 badge', () => {
    const p = facePose('thumbs_up');
    expect(p.left).toMatchObject({ kind: 'rect', x: 30 });
    expect(p.right).toEqual({ kind: 'arc', d: 'M56 47 Q64 33 72 47', stroke: 6 });
    expect(p.badge).toBe('👍');
    expect(facePose('heart').badge).toBe('❤️');
  });
  it('stopped is a 12 × 3 bar, radius 1.5, with no ring', () => {
    expect(facePose('stopped')).toMatchObject({ left: { x: 30, y: 46.5, w: 12, h: 3, r: 1.5 }, ring: null });
  });
  it('speaking: eyes up 5 (y 43) with level bars; celebrating: arcs with sparks; asleep has the "z"', () => {
    expect(facePose('speaking')).toMatchObject({ left: { y: 31 }, bars: true });
    expect(facePose('celebrating')).toMatchObject({ sparks: true, ring: { tone: 'ok' } });
    expect(facePose('asleep').z).toBe(true);
  });
  it('half-lidded (waiting) and sorry (chamfered outer corner) are paths', () => {
    expect(facePose('waiting').left.kind).toBe('path');
    expect(facePose('sorry').left).toMatchObject({ kind: 'path', d: expect.stringMatching(/^M30 49 L35 44/) });
  });
  it('bars run 4 to 14 from the audio level', () => {
    expect(barHeights(0)).toEqual([4, 4, 4]);
    expect(barHeights(1)[1]).toBe(14);
    expect(barHeights(5)[1]).toBe(14);
  });
});

describe('rings (§F15.9.1)', () => {
  it('Working accent turning arc; Stuck warn still arc; Needs you warn full; Waiting dashed; Happy ok fading', () => {
    expect(facePose('working').ring).toEqual({ shape: 'arc_turning', tone: 'accent' });
    expect(facePose('stuck').ring).toEqual({ shape: 'arc_still', tone: 'warn' });
    expect(facePose('needs_you').ring).toEqual({ shape: 'full', tone: 'warn' });
    expect(facePose('waiting').ring).toEqual({ shape: 'dashed', tone: 'warn' });
    expect(facePose('happy').ring).toEqual({ shape: 'full_fade', tone: 'ok' });
  });
  it('no other mood has a ring', () => {
    const ringed = MOODS.filter((m) => facePose(m).ring);
    expect(ringed).toEqual(['working', 'stuck', 'needs_you', 'waiting', 'happy', 'celebrating']);
  });
  it('stroke 2px up to 48, 3px above; gap 1.5px at 26, 2px otherwise', () => {
    expect(ringMetrics(26)).toEqual({ stroke: 2, gap: 1.5 });
    expect(ringMetrics(48)).toEqual({ stroke: 2, gap: 2 });
    expect(ringMetrics(72)).toEqual({ stroke: 3, gap: 2 });
  });
});

describe('groups and still faces (§F15.9.3d)', () => {
  it('draw Resting still with only the Working and Needs you rings', () => {
    for (const m of MOODS) {
      const p = facePose(m, false);
      expect(p.left).toEqual(facePose('resting').left);
      expect(p.motion).toBe('none');
      expect(p.sparks ?? false).toBe(false);
    }
    expect(facePose('working', false).ring).toEqual({ shape: 'arc_turning', tone: 'accent' });
    expect(facePose('needs_you', false).ring).toEqual({ shape: 'full', tone: 'warn' });
    expect(facePose('waiting', false).ring).toBeNull();
  });
});

describe('blink (§F15.9.8, CR-0021 pick 7)', () => {
  it('cycles every 2–6 s, randomised per face (X-179 wins over the 4–7 s of §F15.9.2)', () => {
    expect(blinkCycleMs(() => 0)).toBe(2000);
    expect(blinkCycleMs(() => 1)).toBe(6000);
  });
});

describe('the rendered face (§F15.9.9)', () => {
  const html = (mood: (typeof MOODS)[number], extra: Record<string, unknown> = {}) =>
    renderToStaticMarkup(createElement(Face, { faceRef: 'living:default', size: 40, mood, ...extra }));

  it('carries data-state = the mood, is aria-hidden and draws two eyes on a disc', () => {
    for (const m of MOODS) expect(html(m)).toContain(`data-state="${m}"`);
    expect(html('resting')).toContain('aria-hidden="true"');
    expect(html('resting').match(/<rect/g)).toHaveLength(2);
  });
  it('draws the ring only when ring is on', () => {
    expect(html('working')).toContain('data-ring="arc_turning"');
    expect(html('working', { ring: false })).not.toContain('data-ring');
  });
  it('draws the "z" at 40px and up, never below', () => {
    expect(html('asleep')).toContain('data-part="z"');
    expect(renderToStaticMarkup(createElement(Face, { faceRef: 'living:default', size: 26, mood: 'asleep' }))).not.toContain(
      'data-part="z"',
    );
  });
  it('Avatar renders the living face for foo instead of a letter', () => {
    const out = renderToStaticMarkup(createElement(Avatar, { face: 'living:default', name: 'foo', kind: 'foo', mood: 'working' }));
    expect(out).toContain('data-state="working"');
    expect(out).toContain('<svg');
    expect(out).not.toMatch(/>f</);
  });
  it('letter faces stay letters and show no mood', () => {
    const out = renderToStaticMarkup(createElement(Avatar, { face: 'letter:V', name: 'Vikas', kind: 'user' }));
    expect(out).toContain('>V<');
    expect(out).not.toContain('<svg');
  });
});

describe('FooMark (§F15.1, X-143)', () => {
  it('is the still Resting face: disc r 50, eyes 12 × 24 rx 6 at x 30 / 58, y 36', () => {
    const out = renderToStaticMarkup(createElement(FooMark, { size: 48 }));
    expect(out).toContain('r="50"');
    expect(out).toContain('x="30" y="36" width="12" height="24" rx="6"');
    expect(out).toContain('x="58" y="36" width="12" height="24" rx="6"');
    expect(out).not.toContain('animation');
  });
  it('redraws the eyes on whole pixels at 16: 2 × 5 at x 5 and 9, y 4', () => {
    const out = renderToStaticMarkup(createElement(FooMark, { size: 16 }));
    expect(out).toContain('x="5" y="4" width="2" height="5"');
    expect(out).toContain('x="9" y="4" width="2" height="5"');
  });
});
