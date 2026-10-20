// CR-0021 (X-179) P1 T2: the living face in the app. Pick 6 (empty-state poses are decorative: no ring, `aria-hidden`,
// never a mood), pick 7 (idle life: 1px bob at 40px and larger), pick 8 ("Show foo's eyes" off holds every face still while
// rings still show), §F15.9.3d (groups: `animate={false}`), §F15.9.4 (picture, glyph and emoji faces keep their look; the
// mood shows around them), §F16.2 Block face.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOB_MIN_SIZE, FACE_POSES } from '../../../src/shared/face';
import { settingsDefaults } from '../../../src/shared/settingsDefaults';
import type { PublicSettings } from '../../../src/shared/types';
import { resetStore, update } from '../../../src/renderer/store/index';
import { Avatar } from '../../../src/renderer/ui/Avatar';
import { EmptyState } from '../../../src/renderer/ui/EmptyState';
import { emptyPose, Face, FacePose, otherMood } from '../../../src/renderer/ui/Face';
import { ThinkingRow } from '../../../src/renderer/messages/Markers';

vi.mock('../../../src/renderer/a11y/useReducedMotion', () => ({ useReducedMotion: () => false, reducedMotionNow: () => false }));
// Server rendering reads a store's initial state; read the live state so a settings change shows.
vi.mock('../../../src/renderer/store/index', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../src/renderer/store/index')>();
  const useStore = Object.assign(
    <T>(sel: (s: ReturnType<typeof real.useStore.getState>) => T) => sel(real.useStore.getState()),
    real.useStore,
  );
  return { ...real, useStore };
});

const face = (extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(createElement(Face, { faceRef: 'living:default', size: 48, mood: 'working', ...extra }));

function faceMotion(on: boolean): void {
  update((s) => {
    s.settings.value = {
      ...(settingsDefaults as unknown as PublicSettings),
      appearance: { ...settingsDefaults.appearance, faceMotion: on },
    };
  });
}

afterEach(() => resetStore());

describe('empty-state poses (CR-0021 pick 6, §F16.2 Block face)', () => {
  it('each pose is eyes only: no ring, and never a mood', () => {
    for (const p of FACE_POSES) {
      expect(emptyPose(p).ring).toBeNull();
      const out = renderToStaticMarkup(createElement(FacePose, { pose: p }));
      expect(out).toContain(`data-pose="${p}"`);
      expect(out).toContain('aria-hidden="true"');
      expect(out).toContain('data-size="64"');
      expect(out).not.toContain('data-state');
      expect(out).not.toContain('data-ring');
    }
  });
  it('no results scans, nothing yet rests with a slow blink, a forgotten list shows the Noticed eyes', () => {
    expect(emptyPose('scan').motion).toBe('scan');
    expect(emptyPose('resting').motion).toBe('blink_slow');
    expect(emptyPose('noticed').left).toMatchObject({ w: 13, h: 27 });
  });
  it('EmptyState puts the pose in the icon slot instead of the 24px icon', () => {
    const out = renderToStaticMarkup(createElement(EmptyState, { state: 'filter_empty', pose: 'scan', icon: 'Search', body: 'Nothing' }));
    expect(out).toContain('data-pose="scan"');
    expect(out).not.toContain('width="24"');
  });
});

describe('idle life and "Show foo\'s eyes" (CR-0021 picks 7, 8)', () => {
  it(`bobs at ${BOB_MIN_SIZE}px and larger only`, () => {
    expect(face({ size: 48 })).toContain('--face-bob:');
    const small = renderToStaticMarkup(createElement(Face, { faceRef: 'living:default', size: 26, mood: 'resting' }));
    const large = renderToStaticMarkup(createElement(Face, { faceRef: 'living:default', size: 40, mood: 'resting' }));
    // The bob class sits on the disc group only when the face is large enough.
    expect(small.match(/class="[^"]*bob[^"]*"/)).toBeNull();
    expect(large.match(/class="[^"]*bob[^"]*"/)).not.toBeNull();
  });
  it('on by default: the face moves', () => {
    expect(face()).toContain('data-motion-face="on"');
  });
  it('off: every living face holds still, and the mood ring still shows', () => {
    faceMotion(false);
    const out = face();
    expect(out).toContain('data-motion-face="off"');
    expect(out).toContain('data-state="working"');
    expect(out).toContain('data-ring="arc_turning"');
    expect(renderToStaticMarkup(createElement(FacePose, { pose: 'scan' }))).toContain('data-motion-face="off"');
  });
});

describe('groups (§F15.9.3d)', () => {
  it('Avatar passes animate={false}: still pose, only the Working ring', () => {
    const out = renderToStaticMarkup(
      createElement(Avatar, { face: 'living:default', name: 'foo', kind: 'foo', mood: 'working', size: 'inline', animate: false }),
    );
    expect(out).toContain('data-motion-face="off"');
    expect(out).toContain('data-ring="arc_turning"');
  });
  it('the Thinking row is the 26px Thinking face; still in a group', () => {
    const solo = renderToStaticMarkup(createElement(ThinkingRow, { face: 'living:default', name: 'foo', kind: 'foo', label: false }));
    expect(solo).toContain('data-state="thinking"');
    expect(solo).toContain('data-size="26"');
    expect(solo).toContain('data-motion-face="on"');
    const group = renderToStaticMarkup(createElement(ThinkingRow, { face: 'living:default', name: 'foo', kind: 'foo', label: true }));
    expect(group).toContain('data-motion-face="off"');
  });
});

describe('picture, glyph and emoji faces (§F15.9.4)', () => {
  it('the face is never altered: the glyph stays, the mood is drawn around it', () => {
    const out = renderToStaticMarkup(createElement(Avatar, { face: 'glyph:🦊', name: 'Trips', kind: 'helper', mood: 'working' }));
    expect(out).toContain('🦊');
    expect(out).toContain('data-other-mood="working"');
    expect(out).toContain('data-ring="arc_turning"');
  });
  it('Listening soft, Thinking dotted, Sorry flash, Offline dashed grey, Asleep dimmed, Stopped nothing', () => {
    expect(otherMood('listening').ring?.shape).toBe('soft');
    expect(otherMood('thinking').ring?.shape).toBe('dotted');
    expect(otherMood('sorry').ring).toMatchObject({ shape: 'flash', tone: 'var(--bad)' });
    expect(otherMood('offline')).toMatchObject({ ring: { shape: 'dashed' }, grey: true });
    expect(otherMood('asleep')).toMatchObject({ ring: null, dim: true });
    expect(otherMood('stopped')).toEqual({ ring: null });
    expect(otherMood('thumbs_up').badge).toBe('👍');
  });
  it('letter faces never show moods', () => {
    const out = renderToStaticMarkup(createElement(Avatar, { face: 'letter:T', name: 'Trips', kind: 'helper', mood: 'working' }));
    expect(out).not.toContain('data-other-mood');
    expect(out).not.toContain('data-ring');
  });
});
