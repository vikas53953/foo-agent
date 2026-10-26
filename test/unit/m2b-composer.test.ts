// Spec: 04-2 §21.2 (morphing round button: state order and tooltips), §20.4 (placeholder per situation), §22.9 (keys: Enter
// never during IME or on repeat, Shift+Enter, Ctrl+Enter, ↑ edits last, the Esc order, Backspace to the last chip, Ctrl+U,
// wrap markers, mention keys), §22.4 (masks are atomic, "Send anyway" text, Move removes the span, drafts never carry a
// mask), §22.8 (mention trigger and filter; drafts store @{helperId}), §22.6 (6 files, blocked types, one notice; drop
// verdict), §22.1 (timer, level bars, microphone problems), §23.4 (pending strip text, "{m}:{ss} left"), §23.5 (drafts per
// chat: 500 ms debounce, at once on switch, the same payload not resent), §23.6 (counter from 9,000; over 10,000 disables).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sent: unknown[] = [];
vi.mock('../../src/renderer/ipc/client', () => ({
  invoke: (channel: string, payload: unknown) => {
    sent.push({ channel, payload });
    return Promise.resolve({ ok: true, value: undefined });
  },
  IpcTimeoutError: class extends Error {},
}));

import { COUNTER_FROM, MAX_FILE_BYTES, TEXT_LIMIT } from '../../src/shared/attachmentRules';
import { t } from '../../src/shared/copy/t';
import { MASK } from '../../src/shared/redactor';
import type { CardRow } from '../../src/shared/types';
import { dropVerdict, planFiles, typeLabel } from '../../src/renderer/composer/chips';
import { composerKeyAction, isPrintable, type KeyFacts, type KeyLike } from '../../src/renderer/composer/composerKeys';
import {
  cacheDraft,
  cachedDraft,
  cancelDraftSave,
  resetDrafts,
  saveDraftLater,
  saveDraftNow,
  saveDraftSoon,
  DRAFT_DEBOUNCE_MS,
} from '../../src/renderer/composer/drafts';
import {
  checkText,
  dropMasks,
  filterHelpers,
  hasMask,
  hasText,
  maskHits,
  mentionQuery,
  parseDraft,
  serialise,
  splitAt,
  textLength,
  wrapSelection,
  type Segment,
} from '../../src/renderer/composer/fieldModel';
import { findSecrets } from '../../src/shared/redactor';
import { stripView, waitingCards } from '../../src/renderer/composer/pending';
import { placeholderText, type PlaceholderFacts } from '../../src/renderer/composer/placeholder';
import { isTalkChord, roundButtonState, roundTooltip, talkKeyLabel, type RoundFacts } from '../../src/renderer/composer/roundState';
import { barHeight, micBanner, timerText } from '../../src/renderer/composer/voice';

const NOW = Date.UTC(2026, 9, 16, 3, 30);

describe('morphing round button (04-2 §21.2)', () => {
  const base: RoundFacts = {
    notSetUp: false,
    editing: false,
    recording: null,
    hasContent: false,
    replying: false,
    catchOpen: false,
    tooLong: false,
  };
  it('checks the states in order', () => {
    expect(roundButtonState(base)).toBe('mic');
    expect(roundButtonState({ ...base, replying: true })).toBe('stop');
    expect(roundButtonState({ ...base, replying: true, hasContent: true })).toBe('send');
    expect(roundButtonState({ ...base, recording: 'hold' })).toBe('recording');
    expect(roundButtonState({ ...base, recording: 'locked' })).toBe('send_voice');
    expect(roundButtonState({ ...base, editing: true, hasContent: true })).toBe('save_edit');
    expect(roundButtonState({ ...base, notSetUp: true, editing: true })).toBe('disabled');
    expect(roundButtonState({ ...base, catchOpen: true, hasContent: true })).toBe('disabled');
    expect(roundButtonState({ ...base, tooLong: true, hasContent: true })).toBe('disabled');
  });
  it('tooltips per state, with the talk key', () => {
    expect(roundTooltip('mic', base, 'Ctrl+Space')).toBe('Hold to record a voice note (Ctrl+Space)');
    expect(roundTooltip('disabled', { ...base, notSetUp: true }, 'Ctrl+Space')).toBe('Connect your AI first');
    expect(roundTooltip('disabled', { ...base, catchOpen: true }, 'Ctrl+Space')).toBe('Choose an option above first');
    expect(roundTooltip('disabled', { ...base, tooLong: true }, 'Ctrl+Space')).toBe(t('composer.send.tooltip.too_long'));
    expect(roundTooltip('send', base, '')).toBe('Send (Enter)');
    expect(roundTooltip('stop', base, '')).toBe('Stop (Esc)');
  });
  it('talk key: Ctrl+Space, or Ctrl+Shift+Space with a CJK layout', () => {
    expect(talkKeyLabel(['en-IN', 'hi-IN'])).toBe('Ctrl+Space');
    expect(talkKeyLabel(['en-IN', 'ja-JP'])).toBe('Ctrl+Shift+Space');
    const chord = { key: ' ', code: 'Space', ctrlKey: true, shiftKey: false, altKey: false, metaKey: false };
    expect(isTalkChord(chord, 'Ctrl+Space')).toBe(true);
    expect(isTalkChord(chord, 'Ctrl+Shift+Space')).toBe(false);
    expect(isTalkChord({ ...chord, shiftKey: true }, 'Ctrl+Shift+Space')).toBe(true);
  });
});

describe('placeholder (04-2 §20.4)', () => {
  const f: PlaceholderFacts = {
    notSetUp: false,
    banner: null,
    aiName: 'Claude',
    hasAttachments: false,
    hasText: false,
    narrow: false,
    kind: 'foo',
    private: false,
    title: 'foo',
    agentName: 'foo',
    talkKey: 'Ctrl+Space',
  };
  it('per situation, most specific first', () => {
    expect(placeholderText(f)).toBe('Message foo, or hold Ctrl+Space to talk');
    expect(placeholderText({ ...f, kind: 'helper', title: 'Trip planner' })).toBe('Message Trip planner, or hold Ctrl+Space to talk');
    expect(placeholderText({ ...f, kind: 'group', title: 'Family' })).toBe('Message Family. Type @ to ask a helper');
    expect(placeholderText({ ...f, private: true })).toBe('Nothing here is remembered. What do you need?');
    expect(placeholderText({ ...f, kind: 'wa_mirror', title: 'Society' })).toBe('Draft a message for Society');
    expect(placeholderText({ ...f, narrow: true, title: 'Family' })).toBe('Message Family');
    expect(placeholderText({ ...f, hasAttachments: true })).toBe('Add a message, or press Enter to send');
    expect(placeholderText({ ...f, banner: 'offline', hasAttachments: true })).toBe(t('composer.placeholder.offline'));
    expect(placeholderText({ ...f, banner: 'ai_signed_out' })).toBe(t('composer.placeholder.ai_not_answering', { AI: 'Claude' }));
    expect(placeholderText({ ...f, banner: 'ai_cap' })).toBe(t('composer.placeholder.ai_cap'));
    expect(placeholderText({ ...f, banner: 'plan_limit' })).toBe(t('composer.placeholder.plan_limit', { AI: 'Claude' }));
    expect(placeholderText({ ...f, banner: 'update_ready' })).toBe('Message foo, or hold Ctrl+Space to talk');
    expect(placeholderText({ ...f, notSetUp: true, banner: 'offline' })).toBe('Connect your AI first');
  });
});

describe('keys (04-2 §22.9)', () => {
  const k = (o: Partial<KeyLike>): KeyLike => ({
    key: 'a',
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    repeat: false,
    isComposing: false,
    keyCode: 0,
    ...o,
  });
  const f: KeyFacts = {
    hasSelection: true,
    fieldEmpty: false,
    canEditLast: true,
    menuOpen: false,
    mentionOpen: false,
    mentionHasMatch: false,
    catchOpen: false,
    recording: null,
    strip: null,
    streaming: false,
    chips: 0,
  };
  it('Enter sends; never during IME or on repeat; Shift+Enter is a new line; Ctrl+Enter sends', () => {
    expect(composerKeyAction(k({ key: 'Enter' }), f)).toBe('send');
    expect(composerKeyAction(k({ key: 'Enter', isComposing: true }), f)).toBeNull();
    expect(composerKeyAction(k({ key: 'Enter', keyCode: 229 }), f)).toBeNull();
    expect(composerKeyAction(k({ key: 'Enter', repeat: true }), f)).toBe('block');
    expect(composerKeyAction(k({ key: 'Enter', shiftKey: true }), f)).toBe('newline');
    expect(composerKeyAction(k({ key: 'Enter', ctrlKey: true }), f)).toBe('send');
    expect(composerKeyAction(k({ key: 'Enter' }), { ...f, catchOpen: true })).toBe('block');
  });
  it('Esc does the first of: menu, catch, recording, strip, streaming; else nothing', () => {
    const esc = k({ key: 'Escape' });
    expect(composerKeyAction(esc, { ...f, mentionOpen: true, catchOpen: true })).toBe('mention_close');
    expect(composerKeyAction(esc, { ...f, menuOpen: true, catchOpen: true })).toBe('close_menu');
    expect(composerKeyAction(esc, { ...f, catchOpen: true, strip: 'reply' })).toBe('dismiss_catch');
    expect(composerKeyAction(esc, { ...f, recording: 'locked', strip: 'edit' })).toBe('cancel_recording');
    expect(composerKeyAction(esc, { ...f, strip: 'edit', streaming: true })).toBe('cancel_strip');
    expect(composerKeyAction(esc, { ...f, streaming: true })).toBe('stop_reply');
    expect(composerKeyAction(esc, f)).toBeNull();
  });
  it('↑ in an empty field edits the last message; Backspace reaches the chips; Ctrl+U; wrap keys', () => {
    expect(composerKeyAction(k({ key: 'ArrowUp' }), { ...f, fieldEmpty: true })).toBe('edit_last');
    expect(composerKeyAction(k({ key: 'ArrowUp' }), f)).toBeNull();
    expect(composerKeyAction(k({ key: 'Backspace' }), { ...f, fieldEmpty: true, chips: 2 })).toBe('focus_last_chip');
    expect(composerKeyAction(k({ key: 'Backspace' }), { ...f, fieldEmpty: true })).toBeNull();
    expect(composerKeyAction(k({ key: 'u', ctrlKey: true }), f)).toBe('pick_files');
    expect(composerKeyAction(k({ key: 'b', ctrlKey: true }), f)).toBe('wrap_bold');
    expect(composerKeyAction(k({ key: 'i', ctrlKey: true }), f)).toBe('wrap_italic');
    // CR-0060: with nothing selected Ctrl+I is left to the shell, which opens the profile (09 §9.17).
    expect(composerKeyAction(k({ key: 'i', ctrlKey: true }), { ...f, hasSelection: false })).toBeNull();
    expect(composerKeyAction(k({ key: 'X', ctrlKey: true, shiftKey: true }), f)).toBe('wrap_strike');
  });
  it('while recording only Esc, Enter (locked) and Space pass', () => {
    const rec = { ...f, recording: 'locked' as const };
    expect(composerKeyAction(k({ key: 'Enter' }), rec)).toBe('send');
    expect(composerKeyAction(k({ key: 'Enter' }), { ...f, recording: 'hold' })).toBe('block');
    expect(composerKeyAction(k({ key: 'a' }), rec)).toBe('block');
    expect(composerKeyAction(k({ key: ' ' }), rec)).toBeNull();
  });
  it('mention keys', () => {
    const m = { ...f, mentionOpen: true, mentionHasMatch: true };
    expect(composerKeyAction(k({ key: 'ArrowDown' }), m)).toBe('mention_next');
    expect(composerKeyAction(k({ key: 'ArrowUp' }), m)).toBe('mention_prev');
    expect(composerKeyAction(k({ key: 'Tab' }), m)).toBe('mention_pick');
    expect(composerKeyAction(k({ key: 'Enter' }), m)).toBe('mention_pick');
    expect(composerKeyAction(k({ key: ' ' }), { ...m, mentionHasMatch: false })).toBe('mention_close');
  });
  it('a printable key moves from the list to the field', () => {
    expect(isPrintable({ key: 'h', ctrlKey: false, altKey: false, metaKey: false })).toBe(true);
    expect(isPrintable({ key: 'ArrowDown', ctrlKey: false, altKey: false, metaKey: false })).toBe(false);
    expect(isPrintable({ key: 'c', ctrlKey: true, altKey: false, metaKey: false })).toBe(false);
  });
});

describe('field model (04-2 §22.4, §22.8, §23.6)', () => {
  const segs: Segment[] = [
    { kind: 'text', text: 'Ask ' },
    { kind: 'mention', helperId: 'h_1', name: 'Trip planner' },
    { kind: 'text', text: ' my key sk-proj-abcdefghijklmnopqrstuvwx please' },
  ];
  it('masks a caught span atomically and never keeps a character of it', () => {
    const hits = findSecrets(checkText(segs), {});
    expect(hits).toHaveLength(1);
    let n = 0;
    const out = maskHits(segs, hits, () => `m${++n}`);
    expect(hasMask(out.segs)).toBe(true);
    expect(serialise(out.segs, 'send', '•••• (hidden)')).toBe('Ask @Trip planner my key •••• (hidden) please');
    expect(serialise(out.segs, 'send', '')).not.toContain('sk-proj');
    expect(findSecrets(checkText(out.segs), {})).toEqual([]);
    expect(serialise(dropMasks(out.segs), 'send')).toBe('Ask @Trip planner my key  please');
    expect(textLength(out.segs)).toBe(4 + 13 + ' my key '.length + MASK.length + ' please'.length);
  });
  it('drafts store mentions as @{helperId} and read them back', () => {
    const draft = serialise(segs, 'draft');
    expect(draft).toBe('Ask @{h_1} my key sk-proj-abcdefghijklmnopqrstuvwx please');
    expect(parseDraft(draft, (id) => (id === 'h_1' ? 'Trip planner' : undefined))).toEqual(segs);
    expect(parseDraft('Hi @{gone}', () => undefined)).toEqual([{ kind: 'text', text: 'Hi @{gone}' }]);
  });
  it('split, empty and wrap', () => {
    const [a, b] = splitAt([{ kind: 'text', text: 'hello world' }], 5);
    expect(a).toEqual([{ kind: 'text', text: 'hello' }]);
    expect(b).toEqual([{ kind: 'text', text: ' world' }]);
    expect(hasText([{ kind: 'text', text: '  \n ' }])).toBe(false);
    expect(wrapSelection('make this bold', 5, 9, '*')).toEqual({ text: 'make *this* bold', start: 6, end: 10 });
  });
  it('mention trigger and filter', () => {
    expect(mentionQuery('@tr')).toEqual({ query: 'tr', at: 0 });
    expect(mentionQuery('hi @')).toEqual({ query: '', at: 3 });
    expect(mentionQuery('mail me@x')).toBeNull();
    const hs = [{ name: 'Bill tracker' }, { name: 'Trip planner' }, { name: 'Ration' }];
    expect(filterHelpers(hs, 'tr').map((h) => h.name)).toEqual(['Trip planner', 'Bill tracker']);
    expect(filterHelpers(hs, 'zz')).toEqual([]);
  });
  it('the counter starts at 9,000 and the limit is 10,000', () => {
    expect(COUNTER_FROM).toBe(9_000);
    expect(TEXT_LIMIT).toBe(10_000);
    expect(textLength([{ kind: 'text', text: 'नमस्ते' }])).toBe([...'नमस्ते'].length);
  });
});

describe('attachments (04-2 §21.4, §22.6)', () => {
  const file = (name: string, size = 1000) => ({ name, size });
  it('takes 6 files and gives one notice', () => {
    const r = planFiles(
      [1, 2, 3, 4, 5, 6, 7, 8].map((i) => file(`p${i}.jpg`)),
      0,
    );
    expect(r.add).toHaveLength(6);
    expect(r.notice?.slot).toBe('too_many_files');
    expect(planFiles([file('a.pdf'), file('b.pdf')], 5).add).toHaveLength(1);
  });
  it('blocks programs, zipped folders, unknown types and files over 25 MB', () => {
    expect(planFiles([file('setup.exe')], 0)).toEqual({ add: [], notice: { slot: 'programs', name: 'setup.exe' } });
    expect(planFiles([file('photos.zip')], 0).notice?.slot).toBe('zipped');
    expect(planFiles([file('x.xyz')], 0).notice?.slot).toBe('unreadable');
    expect(planFiles([file('big.mp4', MAX_FILE_BYTES + 1)], 0).notice).toEqual({ slot: 'too_big', name: 'big.mp4' });
    expect(planFiles([file('ok.pdf'), file('run.bat')], 0).add.map((f) => f.name)).toEqual(['ok.pdf']);
  });
  it('drop verdict and type label', () => {
    expect(dropVerdict([file('a.png')])).toBe('ok');
    expect(dropVerdict([file('a.png'), file('b.exe')])).toBe('some');
    expect(dropVerdict([file('b.exe')])).toBe('none');
    expect(typeLabel('Rent agreement.docx')).toBe('DOCX');
  });
});

describe('voice (04-2 §22.1)', () => {
  it('timer, level bars and microphone problems', () => {
    expect(timerText(3_400)).toBe('0:03');
    expect(timerText(300_000)).toBe('5:00');
    expect(barHeight(0)).toBe(4);
    expect(barHeight(1)).toBe(24);
    expect(barHeight(3)).toBe(24);
    expect(micBanner({ name: 'NotAllowedError' })).toBe('mic_blocked');
    expect(micBanner({ name: 'NotFoundError' })).toBe('no_mic');
    expect(micBanner({ name: 'NotReadableError' })).toBe('mic_busy');
  });
});

describe('pending-card strip (04-2 §23.4)', () => {
  const card = (o: Partial<CardRow>): CardRow =>
    ({
      id: 'c1',
      chatId: 'ch',
      messageId: 'm1',
      jobId: null,
      type: 'approval',
      state: 'PENDING',
      payload: { title: 'Send this email to your landlord?' },
      answer: null,
      nonce: 'n',
      expiresAt: null,
      resolvedBy: null,
      resolvedAt: null,
      supersedesId: null,
      rev: 1,
      createdAt: NOW - 60_000,
      deletedAt: null,
      ...o,
    }) as CardRow;
  it('only waiting cards, oldest first', () => {
    const list = waitingCards(
      [
        card({ id: 'a', createdAt: NOW - 1000 }),
        card({ id: 'b', state: 'APPROVED' }),
        card({ id: 'c', createdAt: NOW - 5000, type: 'choice', state: 'asking' }),
        card({ id: 'd', type: 'checklist' }),
      ],
      NOW,
    );
    expect(list.map((c) => c.id)).toEqual(['c', 'a']);
    expect(waitingCards([card({ expiresAt: NOW - 1 })], NOW)).toEqual([]);
  });
  it('text per card, a count for 2+, and the time left under 10 minutes', () => {
    const one = stripView([card({})], NOW)!;
    expect(one.icon).toBe('LockClosed');
    expect(one.timeLeft).toBeNull();
    const two = stripView([card({}), card({ id: 'c2', expiresAt: NOW + 4 * 60_000 + 5_000 })], NOW)!;
    expect(two.text).toBe(t('composer.pending.many', { n: 2 }));
    expect(two.timeLeft).toBe(t('composer.pending.time_left', { time: '4:05' }));
    expect(stripView([card({ type: 'choice', state: 'asking' })], NOW)!.icon).toBe('Clock');
    expect(stripView([], NOW)).toBeNull();
  });
});

describe('drafts per chat (04-2 §23.5)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sent.length = 0;
    resetDrafts();
  });
  afterEach(() => vi.useRealTimers());
  const p = (chatId: string, text: string) => ({ chatId, text, attachmentIds: [], linkPreviewRemoved: false });
  it('saves 500 ms after the last change, per chat', () => {
    saveDraftSoon(p('a', 'h'));
    vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS - 1);
    saveDraftSoon(p('a', 'hi'));
    saveDraftSoon(p('b', 'other'));
    vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS);
    expect(sent).toEqual([
      { channel: 'composer:saveDraft', payload: p('a', 'hi') },
      { channel: 'composer:saveDraft', payload: p('b', 'other') },
    ]);
  });
  it('builds the payload once, when the 500 ms are up, from the latest text, not on every keystroke; null writes nothing', () => {
    const build = vi.fn(() => p('a', 'hello'));
    for (let i = 0; i < 5; i++) saveDraftLater('a', build);
    expect(build).not.toHaveBeenCalled();
    vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS);
    expect(build).toHaveBeenCalledTimes(1);
    saveDraftLater('b', () => null);
    vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS);
    expect(sent).toEqual([{ channel: 'composer:saveDraft', payload: p('a', 'hello') }]);
  });
  it('saves at once on a chat switch and does not resend the same draft', () => {
    saveDraftSoon(p('a', 'hi'));
    saveDraftNow(p('a', 'hi'));
    saveDraftNow(p('a', 'hi'));
    vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS * 2);
    expect(sent).toHaveLength(1);
  });
  it('a send cancels the waiting save; the session cache is per chat', () => {
    saveDraftSoon(p('a', 'hi'));
    cancelDraftSave('a');
    vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS);
    expect(sent).toEqual([]);
    cacheDraft('a', { segs: [{ kind: 'text', text: 'x' }], attachments: [], replyToId: null, linkPreviewRemoved: false });
    expect(cachedDraft('a')?.segs).toEqual([{ kind: 'text', text: 'x' }]);
    expect(cachedDraft('b')).toBeUndefined();
    cacheDraft('a', null);
    expect(cachedDraft('a')).toBeUndefined();
  });
});
