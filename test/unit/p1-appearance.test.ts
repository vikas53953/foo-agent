// 02-3 §F28.3 (deriveAccent vectors), §F28.4 as amended by X-179 (Mica decision, AT-319), 09 §9.14.3 (zoom ladder, overlay
// height, AT-321), 02-3 §F22 as amended (sound gate, AT-318). CR-0021 picks 20–22.
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ nativeTheme: {}, BrowserWindow: class {} }));

import { accentCss, contrast, deriveAccent } from '../../src/shared/accent';
import { micaDecision, overlayHeight, windowsBuild, type MicaInputs } from '../../src/main/settings/appearance';
import { zoomStep } from '../../src/renderer/shell/shortcuts';
import { approvedByUser, doneWithProof, soundAllowed } from '../../src/renderer/sound/gate';
import type { CardRow, JobRow } from '../../src/shared/types';

// §F28.3 test vectors: light accent / hover / pressed / soft, then dark.
const VECTORS: [string, string[]][] = [
  ['#0078D4', ['#0D6DBF', '#045CA3', '#064B86', '#E3F0FF', '#55A9FF', '#81BCFC', '#3395F4', '#072F54']],
  ['#107C10', ['#107C10', '#066807', '#065506', '#E0F6DD', '#5FBE59', '#72D26C', '#4BAB46', '#10370F']],
  ['#FF8C00', ['#A3590B', '#8B4A04', '#733D06', '#FEEADC', '#FF8C00', '#FDAC6C', '#E37E0E', '#472403']],
  ['#881798', ['#881798', '#710A7F', '#5A0566', '#FCE6FF', '#DD72EE', '#EF89FF', '#C95FD9', '#401E45']],
  ['#E81123', ['#D5031C', '#B4121B', '#980512', '#FEE9E6', '#FE7369', '#FE968C', '#FD4341', '#4F1A17']],
  ['#FFB900', ['#8B6405', '#75540B', '#614502', '#FDECD1', '#FFB900', '#FDD48B', '#E6A817', '#3D2A00']],
];

/** "±1 in the last hex digit allowed" (§F28.3). */
const near = (a: string, b: string) =>
  [1, 3, 5].every((i) => Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)) <= 1);

describe('deriveAccent (02-3 §F28.3)', () => {
  it.each(VECTORS)('%s matches the spec vector', (input, want) => {
    const d = deriveAccent(input)!;
    const got = [d.light.accent, d.light.hover, d.light.pressed, d.light.soft, d.dark.accent, d.dark.hover, d.dark.pressed, d.dark.soft];
    got.forEach((g, i) => expect(near(g, want[i]!), `${i}: ${g} vs ${want[i]}`).toBe(true));
  });
  it('keeps the contrast floors: white on light accent, dark ink on dark accent, both ≥ 4.5:1', () => {
    for (const [input] of VECTORS) {
      const d = deriveAccent(input)!;
      expect(contrast('#FFFFFF', d.light.accent)).toBeGreaterThanOrEqual(4.5);
      expect(contrast('#0D0D11', d.dark.accent)).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('takes the Windows RRGGBBAA form and swaps tick-read like F2', () => {
    const d = deriveAccent('0078d4ff')!;
    expect(d.light.accent).toBe('#0D6DBF');
    expect(d.light.tickReadOnMe).toBe(d.dark.accent);
    expect(d.dark.tickReadOnMe).toBe(d.light.accent);
  });
  it('step 7: a failed read is null (the caller keeps the brand indigo)', () => {
    expect(deriveAccent('')).toBeNull();
    expect(deriveAccent('not a colour')).toBeNull();
  });
  it('the inserted sheet sets both themes and stays out of forced colours', () => {
    const css = accentCss(deriveAccent('#107C10')!);
    expect(css).toContain('@media not (forced-colors: active)');
    expect(css).toContain(':root { --accent: #107C10;');
    expect(css).toContain(':root[data-theme="dark"] { --accent: #5FBE59;');
  });
});

describe('micaDecision', () => {
  const win11: MicaInputs = { platform: 'win32', osBuild: 22631, transparency: true, highContrast: false, setting: true, test: false };
  it('Mica only on Windows 11 + transparency + setting on', () => {
    expect(micaDecision(win11)).toEqual({ row: 'enabled', on: true });
  });
  it.each<[string, Partial<MicaInputs>, { row: string; on: boolean }]>([
    ['setting off', { setting: false }, { row: 'enabled', on: false }],
    ['transparency off', { transparency: false }, { row: 'disabled', on: false }],
    ['high contrast', { highContrast: true }, { row: 'disabled', on: false }],
    ['Windows 10', { osBuild: 19045 }, { row: 'hidden', on: false }],
    ['Windows 11 21H2 (Electron draws Mica from 22H2)', { osBuild: 22000 }, { row: 'enabled', on: false }],
    ['a FOO_TEST run', { test: true }, { row: 'enabled', on: false }],
    ['not Windows', { platform: 'linux', osBuild: 0 }, { row: 'enabled', on: false }],
  ])('solid with %s', (_name, change, want) => {
    expect(micaDecision({ ...win11, ...change })).toEqual(want);
  });
  it('reads the build from os.release()', () => {
    expect(windowsBuild('10.0.22631')).toBe(22631);
    expect(windowsBuild('6.8.0-generic')).toBe(0);
  });
});

describe('zoom (09 §9.14.3)', () => {
  it('steps along 80 · 90 · 100 · 110 · 125 · 150 · 175 · 200 and clamps at the ends', () => {
    const up = [80];
    while (up.length < 9) up.push(zoomStep(up[up.length - 1]!, 1));
    expect(up).toEqual([80, 90, 100, 110, 125, 150, 175, 200, 200]);
    expect(zoomStep(80, -1)).toBe(80);
    expect(zoomStep(125, -1)).toBe(110);
  });
  it('Ctrl+0 resets to 100 %', () => {
    expect(zoomStep(175, 0)).toBe(100);
  });
  it('a value off the ladder snaps to the next step in the pressed direction', () => {
    expect(zoomStep(105, 1)).toBe(110);
    expect(zoomStep(105, -1)).toBe(100);
  });
  it('overlay height = round(32 × zoom)', () => {
    expect([80, 100, 110, 125, 175, 200].map(overlayHeight)).toEqual([26, 32, 35, 40, 56, 64]);
  });
});

describe('sound gate', () => {
  it('plays only with the setting on, outside quiet hours, while visible', () => {
    expect(soundAllowed({ setting: true, quiet: false, hidden: false })).toBe(true);
    expect(soundAllowed({ setting: false, quiet: false, hidden: false })).toBe(false);
    expect(soundAllowed({ setting: true, quiet: true, hidden: false })).toBe(false);
    expect(soundAllowed({ setting: true, quiet: false, hidden: true })).toBe(false);
  });
  const card = (p: Partial<CardRow>) => ({ type: 'approval', state: 'PENDING', resolvedBy: null, ...p }) as CardRow;
  it('Approve: the user tapped an Approval or Payment card to APPROVED', () => {
    expect(approvedByUser(card({}), card({ state: 'APPROVED', resolvedBy: 'tap' }))).toBe(true);
    expect(approvedByUser(card({ type: 'payment' }), card({ type: 'payment', state: 'APPROVED', resolvedBy: 'keyboard' }))).toBe(true);
    expect(approvedByUser(card({}), card({ state: 'APPROVED', resolvedBy: 'auto' }))).toBe(false);
    // Opening a chat loads its old approved cards: no tone.
    expect(approvedByUser(undefined, card({ state: 'APPROVED', resolvedBy: 'tap' }))).toBe(false);
    expect(approvedByUser(card({ type: 'choice' }), card({ type: 'choice', state: 'APPROVED', resolvedBy: 'tap' }))).toBe(false);
    expect(approvedByUser(card({ state: 'APPROVED', resolvedBy: 'tap' }), card({ state: 'APPROVED', resolvedBy: 'tap' }))).toBe(false);
  });
  const job = (p: Partial<JobRow>) => ({ chatId: 'c1', state: 'working', proof: null, ...p }) as JobRow;
  it('Done: a job of the open chat turned DONE with proof', () => {
    expect(doneWithProof(job({}), job({ state: 'done', proof: { kind: 'receipt' } }), 'c1')).toBe(true);
    expect(doneWithProof(job({}), job({ state: 'done', proof: { kind: 'receipt' } }), 'c2')).toBe(false);
    expect(doneWithProof(job({}), job({ state: 'done_unverified', proof: null }), 'c1')).toBe(false);
    expect(doneWithProof(job({}), job({ state: 'done', proof: null }), 'c1')).toBe(false);
    expect(doneWithProof(undefined, job({ state: 'done', proof: { kind: 'receipt' } }), 'c1')).toBe(false);
  });
});
