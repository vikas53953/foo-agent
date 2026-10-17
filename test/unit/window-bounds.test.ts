// 03-shell-1 §3.1.1 (default size), §3.1.2 rule 1 (restore).
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  BrowserWindow: class {},
  nativeTheme: {},
  screen: {},
  systemPreferences: {},
  app: {},
  net: {},
  protocol: {},
}));
const { defaultBounds, restoredBounds } = await import('../../src/main/windows/mainWindow');

const FHD = { x: 0, y: 0, width: 1920, height: 1040 };

describe('window bounds', () => {
  it('opens at 1280×800 centred', () => expect(defaultBounds(FHD)).toEqual({ x: 320, y: 120, width: 1280, height: 800 }));
  it('uses 90 % of a small work area', () =>
    expect(defaultBounds({ x: 0, y: 0, width: 1280, height: 760 })).toEqual({ x: 64, y: 38, width: 1152, height: 684 }));
  it('restores a saved rect that is on screen', () => {
    const saved = { x: 100, y: 100, width: 900, height: 700 };
    expect(restoredBounds(saved, [FHD], FHD)).toEqual(saved);
  });
  it('ignores a saved rect less than half on screen', () =>
    expect(restoredBounds({ x: 1700, y: 100, width: 900, height: 700 }, [FHD], FHD)).toEqual(defaultBounds(FHD)));
});
