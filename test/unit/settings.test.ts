// 08-0 §A: unknown keys dropped, invalid values fall back to the default, valid values kept.
import { describe, expect, it } from 'vitest';
import { repair } from '../../src/main/settings/Settings';
import { settingsDefaults } from '../../src/shared/settingsDefaults';

describe('settings repair', () => {
  it('fills a missing file with defaults', () => expect(repair({}).settings).toEqual(settingsDefaults));
  it('keeps valid values and repairs bad ones', () => {
    const { settings, repaired } = repair({
      schemaVersion: 2,
      appearance: { theme: 'dark', useWindowsAccent: 'yes', animations: 'basic' },
      window: { sidebarWidth: 999, maximized: true, rightShellOpen: false },
      zoom: 125,
      stray: 1,
    });
    expect(settings.appearance).toEqual({
      theme: 'dark',
      useWindowsAccent: false,
      animations: 'basic',
      sounds: false,
      mica: true,
      faceMotion: true,
      visuals: 'balanced',
    });
    expect(settings.window.sidebarWidth).toBe(340);
    expect(settings.window.maximized).toBe(true);
    expect(settings.zoom).toBe(125);
    expect(settings).not.toHaveProperty('stray');
    expect(repaired).toEqual(expect.arrayContaining(['appearance.useWindowsAccent', 'window.sidebarWidth']));
  });
  it('rejects a zoom that is not a step', () => expect(repair({ zoom: 105 }).settings.zoom).toBe(100));
});
