// 02-2 §F15.9.9 Rasters (X-124, X-135): `<FaceRaster>` draws 16 / 20 / 24 / 32 without the ring and 48 with it, as still
// frames of the §F15.9.1a poses, for foo's and each helper's living face in the mood it shows now; 08-1 §3.3.1 sizes.
import { describe, expect, it } from 'vitest';
import { RASTER_SIZES } from '../../../src/shared/face';
import type { ChatRow } from '../../../src/shared/types';
import { initialState } from '../../../src/renderer/store/index';
import { faceSvg, rasterTargets, RASTER_DEBOUNCE_MS } from '../../../src/renderer/ui/FaceRaster';

const C = { disc: '#0B0B10', eye: '#FFFFFF', accent: '#2B3FD6', warn: '#A04807', ok: '#137044', font: 'Segoe UI Variable' };

describe('face rasters', () => {
  it('sizes are exactly 16, 20, 24, 32, 48; debounce 1 s', () => {
    expect(RASTER_SIZES).toEqual([16, 20, 24, 32, 48]);
    expect(RASTER_DEBOUNCE_MS).toBe(1000);
  });
  it('48 carries the mood ring inside the picture; the tray sizes have none', () => {
    const toast = faceSvg('needs_you', 48, C, true);
    expect(toast).toContain('width="48" height="48"');
    expect(toast).toContain(`stroke="${C.warn}"`);
    expect(faceSvg('needs_you', 16, C, false)).not.toContain(C.warn);
  });
  it('draws the resolved colours (no stylesheet reaches an image)', () => {
    const svg = faceSvg('resting', 32, C, false);
    expect(svg).toContain(`fill="${C.disc}"`);
    expect(svg).toContain(`fill="${C.eye}"`);
    expect(svg).not.toContain('var(');
  });
  it('holds one-time moods still: sparks drawn, the Happy ring shown', () => {
    const svg = faceSvg('celebrating', 48, C, true);
    expect(svg.match(/<path d="M\d+ \d+ Q/g)?.length).toBeGreaterThanOrEqual(3);
    expect(svg).toContain(`stroke="${C.ok}"`);
  });
  it("targets foo's and helpers' living faces only, each with its mood", () => {
    const s = initialState(0);
    s.chats.byId = {
      c1: { id: 'c1', kind: 'foo', face: 'living:default', colorToken: null, pill: 'working', lastActivityAt: 0 } as unknown as ChatRow,
      c2: { id: 'c2', kind: 'helper', face: 'living:default', colorToken: '--h-teal', pill: null, lastActivityAt: 0 } as unknown as ChatRow,
      c3: { id: 'c3', kind: 'helper', face: 'glyph:🌿', colorToken: '--h-teal', pill: null, lastActivityAt: 0 } as unknown as ChatRow,
      c4: { id: 'c4', kind: 'group', face: 'living:default', colorToken: null, pill: null, lastActivityAt: 0 } as unknown as ChatRow,
    };
    s.chats.order = ['c1', 'c2', 'c3', 'c4'];
    expect(rasterTargets(s)).toEqual([
      { faceRef: 'living:default', tone: 'foo', color: null, mood: 'working' },
      { faceRef: 'living:default', tone: 'helper', color: '--h-teal', mood: 'resting' },
    ]);
  });
});
