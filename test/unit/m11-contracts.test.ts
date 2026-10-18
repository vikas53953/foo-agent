// M11 T1 contracts (CR-0015): 08-5 §6 foo-native fallbacks (G-M11-03), the EngineToMain proc.track / proc.kill /
// voice.synthesize rows and their no-addon replies (G-M11-01, G-M11-02), the fake Notifier of 08-3 §22.6 (G-M11-16),
// `notifications.quietOverride` (G-M11-13), the new invoke / event channels (G-M11-14, G-M11-15), test ids and copy keys.
import { describe, expect, it } from 'vitest';
import { engineToMainSchema } from '../../src/engine/protocol';
import { EngineBridge } from '../../src/main/engine-supervisor/EngineBridge';
import { SCHEMAS } from '../../src/main/ipc/IpcRouter';
import { FALLBACK, loadFooNative } from '../../src/main/native/fooNative';
import { migrate } from '../../src/main/store/db';
import { EVENT_CHANNELS, INVOKE_CHANNELS } from '../../src/shared/ipc';
import { settingsSchema } from '../../src/shared/settings';
import { settingsDefaults } from '../../src/shared/settingsDefaults';
import { TID } from '../../src/shared/testids';
import type { NotificationRequest, ToastSpec } from '../../src/shared/types';
import copy from '../../src/shared/copy/en-IN.json';
import { RecordingNotifier } from '../fakes/notifier';
import Database from 'better-sqlite3';

const toast = (tag: string, group: string, kind: NotificationRequest['kind'] = 'payment'): ToastSpec => ({
  req: {
    kind,
    chatId: group,
    title: 'Money',
    body: 'Pay Airtel ₹1,179?',
    buttons: [
      { label: 'Review', action: { kind: 'review', cardId: tag } },
      { label: 'Not now', action: { kind: 'not_now', cardId: tag } },
    ],
    prompted: false,
    ref: tag,
  },
  tag,
  group,
  groupTitle: 'Money',
  logoPng: 'resources/tray/letter-48.png',
  silent: false,
  locked: false,
});

describe('foo-native fallbacks (08-5 §6)', () => {
  it('runs on the fallback column when the addon does not load', async () => {
    const n = loadFooNative(() => {
      throw new Error('Cannot find module foo-native');
    });
    expect(n.available).toBe(false);
    expect(n.api.networkCost()).toBe('unknown');
    expect(n.api.toastSetting()).toBe('enabled');
    expect(n.api.textScaleFactor()).toBe(1);
    expect(n.api.keyboardLayouts()).toEqual([]);
    expect(n.api.focusActive()).toBeNull();
    expect(n.api.trackWindow(1, () => undefined)).toBe(-1);
    expect(n.api.findWindowByPid(1)).toBeNull();
    expect(n.api.assignToJobObject(1)).toBeUndefined();
    await expect(n.api.verifyUser('Pay')).resolves.toBe('unavailable');
    await expect(n.api.synthesize('Hi', 'en', 'x.wav')).rejects.toMatchObject({ kind: 'VOICE_UNAVAILABLE' });
    await expect(n.api.ocrRead('x.png')).resolves.toEqual({ status: 'unavailable', lines: [] });
  });

  it('takes each export the addon has and falls back for the rest', () => {
    const killed: number[] = [];
    const n = loadFooNative(() => ({ killJobObject: (pid: number) => void killed.push(pid), networkCost: () => 'fixed' }));
    expect(n.available).toBe(true);
    n.api.killJobObject(42);
    expect(killed).toEqual([42]);
    expect(n.api.networkCost()).toBe('fixed');
    expect(n.api.toastSetting).toBe(FALLBACK.toastSetting);
  });
});

describe('engine ⇄ main native rows (G-M11-01, G-M11-02)', () => {
  const bridge = () => {
    const db = new Database(':memory:');
    migrate(db);
    let settings = structuredClone(settingsDefaults);
    const replies: unknown[] = [];
    const b = new EngineBridge({
      db,
      settings: { get: () => settings, update: (fn) => (settings = fn(settings)) },
      emit: () => undefined,
      emitMessage: () => undefined,
      emitChat: () => undefined,
    });
    b.postReply = (r) => replies.push(r);
    return { b, replies };
  };

  it('validates the three new EngineToMain kinds', () => {
    expect(engineToMainSchema.safeParse({ id: 'e1', kind: 'proc.track', payload: { pid: 10, purpose: 'ai_cli' } }).success).toBe(true);
    expect(engineToMainSchema.safeParse({ id: 'e1', kind: 'proc.track', payload: { pid: 10, purpose: 'shell' } }).success).toBe(false);
    expect(engineToMainSchema.safeParse({ id: 'e2', kind: 'proc.kill', payload: { pid: 10 } }).success).toBe(true);
    expect(
      engineToMainSchema.safeParse({ id: 'e3', kind: 'voice.synthesize', payload: { text: 'Hi', lang: 'hi', outPath: 'a.wav' } }).success,
    ).toBe(true);
  });

  it('answers native:false without the addon, so ProcessHost keeps its taskkill sweep', () => {
    const { b } = bridge();
    expect(b.receive({ id: 'e1', kind: 'proc.track', payload: { pid: 10, purpose: 'whisper' } })).toEqual({
      re: 'e1',
      result: { ok: true, value: { native: false } },
    });
    expect(b.receive({ id: 'e2', kind: 'proc.kill', payload: { pid: 10 } })?.result).toEqual({ ok: true, value: { native: false } });
  });

  it('routes proc rows to the installed host and replies to voice.synthesize when it settles', async () => {
    const { b, replies } = bridge();
    const tracked: [number, string][] = [];
    b.native = {
      track: (pid, purpose) => (tracked.push([pid, purpose]), { native: true }),
      kill: () => ({ native: true }),
      synthesize: () => Promise.reject(new Error('no voice')),
    };
    expect(b.receive({ id: 'e1', kind: 'proc.track', payload: { pid: 7, purpose: 'ai_cli' } })?.result).toEqual({
      ok: true,
      value: { native: true },
    });
    expect(tracked).toEqual([[7, 'ai_cli']]);
    expect(b.receive({ id: 'e2', kind: 'voice.synthesize', payload: { text: 'Hi', lang: 'en', outPath: 'a.wav' } })).toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    expect(replies).toEqual([{ re: 'e2', result: { ok: false, error: { kind: 'VOICE_UNAVAILABLE' } } }]);
  });
});

describe('fake Notifier (08-3 §22.6)', () => {
  it('records every toast and replaces one with the same tag and group, as Windows does', () => {
    const n = new RecordingNotifier();
    n.show(toast('k1', 'c_money'));
    n.show(toast('k1', 'c_money'));
    n.show(toast('m1', 'c_trips', 'reply'));
    expect(n.shown()).toHaveLength(3);
    expect(n.showing().map((s) => s.tag)).toEqual(['k1', 'm1']);
    n.close('k1', 'c_money');
    n.closeGroup('c_trips');
    expect(n.showing()).toEqual([]);
    n.show(toast('k2', 'c_money'));
    n.closeAll();
    expect(n.showing()).toEqual([]);
    expect(n.calls.map((c) => c.op)).toEqual(['show', 'show', 'show', 'close', 'closeGroup', 'show', 'closeAll']);
  });
});

describe('channels, settings, ids and copy (CR-0015)', () => {
  it('adds the update, restart and close-choice channels with strict schemas', () => {
    for (const c of ['app:restart', 'app:downloadUpdate', 'app:closeChoice'] as const) expect(INVOKE_CHANNELS).toContain(c);
    for (const e of ['update:status', 'app:closeAsk'] as const) expect(EVENT_CHANNELS).toContain(e);
    expect(SCHEMAS['app:closeChoice'].safeParse({ choice: 'tray', dontShowAgain: true }).success).toBe(true);
    expect(SCHEMAS['app:closeChoice'].safeParse({ choice: 'hide', dontShowAgain: true }).success).toBe(false);
    expect(SCHEMAS['app:restart'].safeParse({}).success).toBe(true);
    expect(SCHEMAS['app:downloadUpdate'].safeParse({ now: true }).success).toBe(false);
  });

  it('defaults notifications.quietOverride to null and accepts a one-off quiet period', () => {
    expect(settingsDefaults.notifications.quietOverride).toBeNull();
    const s = structuredClone(settingsDefaults);
    s.notifications.quietOverride = { mode: 'quiet', until: 1_760_000_000_000 };
    expect(settingsSchema.safeParse(s).success).toBe(true);
    (s.notifications as Record<string, unknown>).quietOverride = { mode: 'snooze', until: 1 };
    expect(settingsSchema.safeParse(s).success).toBe(false);
  });

  it('registers the M11 test ids and the native surfaces’ words', () => {
    expect(TID.dialogQuit).toBe('dialog-quit');
    expect(TID.toastPreviewButton).toBe('toast-preview-button');
    const c = copy as Record<string, string>;
    expect(c['notifications.button.review']).toBe('Review');
    expect(c['notifications.button.not_now']).toBe('Not now');
    expect(c['jumplist.needs_you.title']).toBe('See what needs you');
    expect(c['dialog.c_18.title']).toBe('foo keeps working in the background');
  });
});
