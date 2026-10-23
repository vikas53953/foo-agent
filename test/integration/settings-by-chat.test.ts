// Spec: CR-0043 (X-201), 08-4 §25.6 as amended (settings by words), 08-0 §A.3 (allow-list, mini line, refusal line, Undo with
// no time limit, TOO_LATE), 08-1 §4.4.2 steps 3–5 (change record `setting_changed`, actor 'foo', approved_how 'none';
// settings:undo), 10-acceptance-1 AT-094. Real-AI run 13 (main 3a35be0, Claude CLI): "Switch to dark mode" got "I didn't get
// that". Every intake answer below is the Claude CLI's real answer with the CR-0043 prompt (Wed 21 Oct, 12 of 12 named a path
// from the list; with the old prompt 3 of 8 did, e.g. `voice.replies`, `purchaseCap`).
import { afterEach, describe, expect, it } from 'vitest';
import { applySetting, undoSetting } from '../../src/main/settings/applySetting';
import { changeRecordRow } from '../../src/main/settings/changeRecord';
import { t } from '../../src/shared/copy/t';
import type { Settings } from '../../src/shared/settings';
import { jobHarness, verified, type JobHarness } from './jobs/jobHarness';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const real = (decision: Record<string, unknown>) => `<say></say>\n<act>${JSON.stringify({ decision, usedMemoryIds: [] })}</act>`;
const DARK = real({ kind: 'setting', path: 'appearance.theme', value: 'dark' });

type Line = { id: string; text: string; why: { settingLine: { kind: string; changeId?: string; state?: string; page?: string } } };
const lines = (x: JobHarness): Line[] =>
  (
    x.db.prepare("SELECT id, text, why FROM messages WHERE marker_kind = 'system_line' ORDER BY seq").all() as {
      id: string;
      text: string;
      why: string;
    }[]
  ).map((r) => ({ ...r, why: JSON.parse(r.why) as Line['why'] }));
const fooTexts = (x: JobHarness) =>
  (x.db.prepare("SELECT text FROM messages WHERE author_kind = 'foo' AND kind = 'text'").all() as { text: string }[]).map((m) => m.text);
const activity = (x: JobHarness) =>
  x.db.prepare("SELECT id, event, actor, approved_how, fields FROM activity WHERE kind = 'changed' ORDER BY at, rowid").all() as {
    id: string;
    event: string;
    actor: string;
    approved_how: string;
    fields: string;
  }[];

async function ask(reply: string, text: string, settings?: (s: Settings) => Settings) {
  h = jobHarness({
    script: [{ match: { purpose: 'intake' }, reply }],
    ...(settings ? { settings: (s: Settings) => settings(verified()(s)) } : {}),
  });
  const id = h.userSays(text);
  await h.settle();
  return { h, id };
}
const undo = (x: JobHarness, changeId: string) => undoSetting({ db: x.db, settings: x.store, now: () => x.clock.now() }, changeId);

describe('AT-094 · a setting on the allow-list changes by chat, with one line and Undo', () => {
  it('run 13: "Switch to dark mode" sets the theme and says "Changed: Theme → Dark." with Undo', async () => {
    const { h: x, id } = await ask(DARK, 'Switch to dark mode');
    expect(x.settings().appearance.theme).toBe('dark');
    const [line, ...rest] = lines(x);
    expect(rest).toEqual([]);
    expect(line!.text).toBe('Changed: Theme → Dark.');
    expect(line!.why.settingLine.kind).toBe('changed');
    const [row] = activity(x);
    expect(row).toMatchObject({ event: 'setting_changed', actor: 'foo', approved_how: 'none' });
    expect(JSON.parse(row!.fields)).toEqual({ path: 'appearance.theme', old: 'system', new: 'dark' });
    expect(line!.why.settingLine.changeId).toBe(row!.id);
    expect(fooTexts(x)).toEqual([]);
    expect(x.message(id).badge).toBeNull();
    expect(x.patches.some((p) => p.event === 'settings:changed')).toBe(true);
  });

  it('Undo calls settings:undo and puts the old value back: "Changed back: Theme → Same as Windows."', async () => {
    const { h: x } = await ask(DARK, 'dark mode kar do');
    const changeId = lines(x)[0]!.why.settingLine.changeId!;
    const r = undo(x, changeId);
    expect(r.ok).toBe(true);
    expect(x.settings().appearance.theme).toBe('system');
    const line = lines(x)[0]!;
    expect(line.text).toBe('Changed back: Theme → Same as Windows.');
    expect(line.why.settingLine.state).toBe('undone');
    // A new activity row with old and new swapped (08-1 §4.4.2 step 4).
    expect(activity(x).map((a) => [a.actor, JSON.parse(a.fields)])).toEqual([
      ['foo', { path: 'appearance.theme', old: 'system', new: 'dark' }],
      ['user', { path: 'appearance.theme', old: 'dark', new: 'system' }],
    ]);
    // A second tap is too late: the value is no longer the one this line set; the undone line stays undone.
    expect(undo(x, changeId)).toMatchObject({ ok: false, error: { kind: 'TOO_LATE' } });
    expect(lines(x)[0]!.why.settingLine.state).toBe('undone');
  });

  it('Undo after the value changed again is TOO_LATE and leaves the setting alone', async () => {
    const { h: x } = await ask(DARK, 'Switch to dark mode');
    const changeId = lines(x)[0]!.why.settingLine.changeId!;
    x.store.update((s) => ({ ...s, appearance: { ...s.appearance, theme: 'light' } }));
    expect(undo(x, changeId)).toMatchObject({ ok: false, error: { kind: 'TOO_LATE' } });
    expect(x.settings().appearance.theme).toBe('light');
    expect(lines(x)[0]!.why.settingLine.state).toBe('too_late');
  });

  it.each([
    ['zoom thoda badha do', { path: 'zoom', value: 110 }, 'Changed: Zoom → 110%.'],
    ['screenshots mat rakho', { path: 'privacy.screenshotDays', value: 0 }, 'Changed: Job screenshots → Don’t keep.'],
    ['Ask me before you remember anything', { path: 'privacy.askBeforeRemembering', value: true }, 'Changed: Ask before remembering → On.'],
  ])('"%s" (real CLI answer) changes it with its line', async (text, d, want) => {
    const { h: x } = await ask(real({ kind: 'setting', ...d }), text);
    expect(lines(x).map((l) => l.text)).toEqual([want]);
    expect(JSON.parse(activity(x)[0]!.fields)).toMatchObject({ path: d.path, new: d.value });
  });

  it('"Don\'t message me on your own" (unprompted 0) reads "None", the Settings row\'s word', async () => {
    const { h: x } = await ask(real({ kind: 'setting', path: 'notifications.unpromptedPerDay', value: 0 }), "Don't message me on your own");
    expect(x.settings().notifications.unpromptedPerDay).toBe(0);
    expect(lines(x).map((l) => l.text)).toEqual(['Changed: Messages I start on my own → None.']);
  });

  it('"raat 10 baje se subah 7 tak quiet rakho": quiet hours take the parts named; days stay', async () => {
    const quiet = real({ kind: 'setting', path: 'notifications.quiet', value: { on: true, from: '22:00', to: '07:00' } });
    const { h: x } = await ask(quiet, 'raat 10 baje se subah 7 tak quiet rakho', (s) => ({
      ...s,
      notifications: { ...s.notifications, quiet: { on: false, from: '23:00', to: '06:00', days: [1, 2, 3, 4, 5] } },
    }));
    expect(x.settings().notifications.quiet).toEqual({ on: true, from: '22:00', to: '07:00', days: [1, 2, 3, 4, 5] });
    expect(lines(x).map((l) => l.text)).toEqual(['Changed: Quiet hours → 10:00 PM to 7:00 AM.']);
  });
});

describe('AT-094 · anything off the allow-list is refused with Open Settings; nothing changes', () => {
  it('"Set my purchase cap to ₹50,000" (real answer `spending.purchaseCap`): "That’s one for you to change." → Money', async () => {
    h = jobHarness({
      script: [{ match: { purpose: 'intake' }, reply: real({ kind: 'setting', path: 'spending.purchaseCap', value: 50000 }) }],
    });
    const x = h;
    const before = structuredClone(x.settings());
    x.userSays('Set my purchase cap to ₹50,000');
    await x.settle();
    expect(x.settings()).toEqual(before);
    expect(lines(x).map((l) => [l.text, l.why.settingLine])).toEqual([[t('thread.setting.refused'), { kind: 'refused', page: 'money' }]]);
    expect(activity(x)).toEqual([]);
  });

  it('a value main refuses on a path foo may change (zoom 130): "I can’t set it to that.", nothing written', async () => {
    const { h: x } = await ask(real({ kind: 'setting', path: 'zoom', value: 130 }), 'Zoom 130');
    expect(x.settings().zoom).toBe(100);
    expect(lines(x).map((l) => [l.text, l.why.settingLine])).toEqual([
      [t('thread.setting.bad_value'), { kind: 'bad_value', page: 'appearance' }],
    ]);
  });

  it('a permission is never changed by chat, even with a real path', async () => {
    const { h: x } = await ask(real({ kind: 'setting', path: 'permissions.actions.pay', value: 'ask' }), 'let foo pay');
    expect(lines(x).map((l) => l.why.settingLine)).toEqual([{ kind: 'refused', page: 'permissions' }]);
    expect(activity(x)).toEqual([]);
  });
});

describe('CR-0043 · an allow-list setting not in this build says so', () => {
  it('"Turn off voice replies" (real answer `chat.voiceReplies` never): "I can’t change that one yet."', async () => {
    const { h: x } = await ask(real({ kind: 'setting', path: 'chat.voiceReplies', value: 'never' }), 'voice replies band kar do');
    expect(lines(x).map((l) => [l.text, l.why.settingLine.kind])).toEqual([[t('thread.setting.not_built'), 'not_built']]);
    expect(activity(x)).toEqual([]);
    expect(fooTexts(x)).not.toContain(t('thread.reply.empty'));
  });
});

describe('CR-0043 review · Undo writes back only a chat change of an allow-list path', () => {
  const forged = changeRecordRow('money.purchaseCapPaise', 100_000_000, 2_500_000, 'foo') ?? {
    ...changeRecordRow('appearance.theme', 'system', 'dark', 'foo')!,
    fields: { path: 'money.purchaseCapPaise', old: 100_000_000, new: 2_500_000 },
  };

  it('the engine cannot write a settings change record (db.tx with a setting_changed activity op is refused)', async () => {
    const { h: x } = await ask(DARK, 'Switch to dark mode');
    const before = activity(x).length;
    const reply = x.bridge.receive({ id: 'forge', kind: 'db.tx', payload: { ops: [{ op: 'activity', row: forged }] } });
    expect(reply?.result).toMatchObject({ ok: false, error: { kind: 'IPC_REJECTED' } });
    expect(activity(x)).toHaveLength(before);
  });

  it('a change id naming any other row (the user raising a cap, a permission) is TOO_LATE and nothing is written', async () => {
    const { h: x } = await ask(DARK, 'Switch to dark mode');
    const cap = applySetting({ db: x.db, settings: x.store, now: () => x.clock.now() }, 'money.aiCapPaise', 150_000, 'user');
    expect(cap.ok && cap.value.changeId).toBeTruthy();
    const capNow = x.settings().money.aiCapPaise;
    expect(undo(x, cap.ok ? cap.value.changeId! : '')).toMatchObject({ ok: false, error: { kind: 'TOO_LATE' } });
    expect(x.settings().money.aiCapPaise).toBe(capNow);
  });
});

describe('Real-AI run cdf2f65 R-dark · the next turn sees the setting line', () => {
  it('"hi" after "Switch to dark mode" gets a reply, not a second "Changed: Theme → Dark."', async () => {
    // The real Claude answered "hi" with the setting again, then "Dark mode abhi tak on nahi hua": the line never reached it.
    h = jobHarness({
      script: [
        { match: { purpose: 'intake', promptIncludes: 'Changed: Theme → Dark.' }, reply: real({ kind: 'reply' }).replace('<say></say>', '<say>Hello!</say>') },
        { match: { purpose: 'intake' }, reply: DARK },
        { match: { purpose: 'intake' }, reply: DARK },
      ],
      settings: verified(),
    });
    h.userSays('Switch to dark mode');
    await h.settle();
    h.userSays('hi');
    await h.settle();
    expect(lines(h).map((l) => l.text)).toEqual(['Changed: Theme → Dark.']);
    expect(fooTexts(h)).toEqual(['Hello!']);
  });
});
