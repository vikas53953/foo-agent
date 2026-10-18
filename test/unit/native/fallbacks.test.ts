// 08-5 §6 (`foo-native` exports; every export has a JS fallback returning the "unsupported" value named), 09 §9.19.2
// (loaded in main only; foo runs without the addon). Expected values are the 08-5 §6 table, literally.
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import type * as FooNative from '../../../native/foo-native';

const require = createRequire(import.meta.url);
const fallback = require('../../../native/foo-native/fallback.js') as typeof FooNative;

describe('foo-native fallbacks (08-5 §6)', () => {
  it('assignToJobObject / killJobObject → no-op', () => {
    expect(fallback.assignToJobObject(1234)).toBeUndefined();
    expect(fallback.killJobObject(1234)).toBeUndefined();
  });
  it("verifyUser → 'unavailable'", async () => {
    await expect(fallback.verifyUser('Approve ₹500')).resolves.toBe('unavailable');
  });
  it('synthesize → rejects VOICE_UNAVAILABLE', async () => {
    await expect(fallback.synthesize('hello', 'en-IN', 'x.wav')).rejects.toMatchObject({ code: 'VOICE_UNAVAILABLE' });
  });
  it("networkCost → 'unknown'", () => {
    expect(fallback.networkCost()).toBe('unknown');
  });
  it('toastRemove / toastRemoveGroup / toastClear → no-op', () => {
    expect(fallback.toastRemove('t', 'g')).toBeUndefined();
    expect(fallback.toastRemoveGroup('g')).toBeUndefined();
    expect(fallback.toastClear()).toBeUndefined();
  });
  it("toastSetting → 'enabled'", () => {
    expect(fallback.toastSetting()).toBe('enabled');
  });
  it('textScaleFactor → 1, watchTextScale → no-op', () => {
    expect(fallback.textScaleFactor()).toBe(1);
    expect(fallback.watchTextScale(() => undefined)).toBeUndefined();
  });
  it('keyboardLayouts → []', () => {
    expect(fallback.keyboardLayouts()).toEqual([]);
  });
  it('focusActive → null', () => {
    expect(fallback.focusActive()).toBeNull();
  });
  it('trackWindow → -1, untrackWindow → no-op, findWindowByPid → null', () => {
    expect(fallback.trackWindow(1, () => undefined)).toBe(-1);
    expect(fallback.untrackWindow(1)).toBeUndefined();
    expect(fallback.findWindowByPid(1)).toBeNull();
  });
  it("ocrRead → { status: 'unavailable', lines: [] }, blackout → rejects", async () => {
    await expect(fallback.ocrRead('a.png')).resolves.toEqual({ status: 'unavailable', lines: [] });
    await expect(fallback.blackout('a.png', 'b.png', [])).rejects.toBeInstanceOf(Error);
  });
  it('exports exactly the 08-5 §6 list', () => {
    expect(Object.keys(fallback).sort()).toEqual(
      [
        'assignToJobObject',
        'killJobObject',
        'verifyUser',
        'synthesize',
        'networkCost',
        'toastRemove',
        'toastRemoveGroup',
        'toastClear',
        'toastSetting',
        'textScaleFactor',
        'watchTextScale',
        'keyboardLayouts',
        'focusActive',
        'trackWindow',
        'untrackWindow',
        'findWindowByPid',
        'ocrRead',
        'blackout',
      ].sort(),
    );
  });
});

describe('foo-native loader', () => {
  it('without a built .node every export comes from the fallback and `available` is false', () => {
    const mod = require('../../../native/foo-native/index.js') as typeof FooNative & { available: boolean };
    if (process.platform !== 'win32') {
      expect(mod.available).toBe(false);
      expect(mod.networkCost()).toBe('unknown');
    }
    for (const k of Object.keys(fallback)) expect(typeof (mod as unknown as Record<string, unknown>)[k]).toBe('function');
  });
});
