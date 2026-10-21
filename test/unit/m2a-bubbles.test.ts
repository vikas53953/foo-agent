// Spec: 04 §1.2 (rhythm), §1.3 (runs), §1.4 (corners), §3.3 (ticks), §4.1–§4.2 (badge slot and tooltips), §6.2 (edit
// window), §12.4 (group sender label), §12.5 (backup mark), §15 ("Worked for"), §17.1 (action row on the latest answer),
// §1.8 (accessible name), §9 (menu items), §19.7 (cards break runs).
import { describe, expect, it } from 'vitest';
import { RUN_WINDOW_MS, hangsBelow, joinsRun, layoutRows, tailCorners } from '../../src/renderer/messages/runs';
import {
  BADGE_DEBOUNCE_MS,
  EDIT_WINDOW_MS,
  backupNames,
  badgeSlot,
  badgeTooltip,
  bubbleName,
  canEdit,
  slotTooltip,
  tickLabel,
  tickState,
  workedAccessible,
  workedLabel,
} from '../../src/renderer/messages/bubbleState';
import { menuActions, type MenuFacts } from '../../src/renderer/messages/messageMenu';
import type { VRow } from '../../src/renderer/messages/rows';
import type { MessageRow } from '../../src/shared/types';

const T0 = Date.UTC(2026, 9, 16, 2, 35); // Fri 16 Oct 2026, 8:05 AM IST
const MIN = 60_000;
let n = 0;

function msg(p: Partial<MessageRow> = {}): MessageRow {
  n++;
  return {
    id: `m_${n}`,
    chatId: 'c_1',
    seq: n,
    authorKind: 'user',
    authorId: null,
    kind: 'text',
    markerKind: null,
    clientId: null,
    text: 'hi',
    status: 'sent',
    badge: null,
    replyToId: null,
    jobId: null,
    cardId: null,
    lang: null,
    voicePath: null,
    voiceMs: null,
    transcript: null,
    transcriptConf: null,
    attachments: null,
    prompted: true,
    why: null,
    pinned: false,
    providerNote: null,
    suggestions: null,
    side: false,
    understood: null,
    kitPick: null,
    actions: null,
    rev: 1,
    createdAt: T0,
    editedAt: null,
    deletedAt: null,
    reactions: [],
    ...p,
  };
}
const row = (m: MessageRow): VRow => ({ kind: 'message', key: m.id, message: m });

describe('runs (04 §1.3)', () => {
  it('same sender within 3 minutes joins; a 3:01 gap, another sender, a day change in time order or a deletion breaks', () => {
    const a = msg({ createdAt: T0 });
    expect(joinsRun(a, msg({ createdAt: T0 + RUN_WINDOW_MS }))).toBe(true);
    expect(joinsRun(a, msg({ createdAt: T0 + RUN_WINDOW_MS + 1000 }))).toBe(false);
    expect(joinsRun(a, msg({ authorKind: 'foo', createdAt: T0 + MIN }))).toBe(false);
    expect(joinsRun(a, msg({ createdAt: T0 + MIN, deletedAt: T0 + 2 * MIN }))).toBe(false);
    expect(joinsRun(msg({ deletedAt: T0 }), msg({ createdAt: T0 + MIN }))).toBe(false);
  });
  it('two helpers are two senders; a card is never part of a run', () => {
    const h1 = msg({ authorKind: 'helper', authorId: 'h_1' });
    expect(joinsRun(h1, msg({ authorKind: 'helper', authorId: 'h_2', createdAt: T0 + MIN }))).toBe(false);
    expect(joinsRun(h1, msg({ authorKind: 'helper', authorId: 'h_1', createdAt: T0 + MIN }))).toBe(true);
    expect(joinsRun(h1, msg({ authorKind: 'helper', authorId: 'h_1', kind: 'card', cardId: 'k_1', createdAt: T0 + MIN }))).toBe(false);
  });
  it('a bubble with a badge or a reaction chip ends its run (something hangs below it)', () => {
    expect(hangsBelow(msg({ badge: 'seen' }))).toBe(true);
    expect(hangsBelow(msg({ reactions: [{ emoji: '👍', by: 'foo' }] }))).toBe(true);
    expect(hangsBelow(msg({ reactions: [{ emoji: '👍', by: 'me' }] }))).toBe(false); // the user's own reaction is not a slot
    expect(hangsBelow(msg({ status: 'failed', badge: 'seen' }))).toBe(false);
    expect(hangsBelow(msg({ authorKind: 'foo', reactions: [{ emoji: '❤️', by: 'me' }] }))).toBe(true);
    expect(joinsRun(msg({ badge: 'done' }), msg({ createdAt: T0 + MIN }))).toBe(false);
  });
});

describe('layout: positions, gaps, sender label, latest answer (04 §1.2, §1.4, §12.4, §17.1, §19.7)', () => {
  it('positions single / first / middle / last and the 2 / 12 / 16 / 4 gaps', () => {
    const rows = [
      msg({ createdAt: T0 }),
      msg({ createdAt: T0 + MIN }),
      msg({ createdAt: T0 + 2 * MIN, badge: 'done' }),
      msg({ authorKind: 'foo', createdAt: T0 + 3 * MIN, status: 'complete' }),
      msg({ authorKind: 'foo', kind: 'card', cardId: 'k_1', createdAt: T0 + 3 * MIN, status: 'complete' }),
      msg({ authorKind: 'foo', createdAt: T0 + 4 * MIN, status: 'complete' }),
    ].map(row);
    const L = layoutRows(rows, { chatKind: 'foo' });
    expect(L.map((l) => l.pos)).toEqual(['first', 'middle', 'last', 'single', null, 'single']);
    expect(L.map((l) => l.gap)).toEqual(['none', 's-1', 's-1', 's3', 's0', 's2']);
    expect(L.map((l) => l.latestAnswer)).toEqual([false, false, false, false, false, true]);
  });
  it('markers and separators pad themselves; the label sits above each output run, and in groups on a card after another sender', () => {
    const rows: VRow[] = [
      row(msg({ authorKind: 'helper', authorId: 'h_1', createdAt: T0, status: 'complete' })),
      row(msg({ authorKind: 'helper', authorId: 'h_1', createdAt: T0 + 20_000, status: 'complete' })),
      row(msg({ authorKind: 'system', kind: 'marker', markerKind: 'handoff', createdAt: T0 + MIN })),
      row(msg({ authorKind: 'foo', createdAt: T0 + 2 * MIN, status: 'complete' })),
      row(msg({ authorKind: 'helper', authorId: 'h_1', kind: 'card', cardId: 'k_2', createdAt: T0 + 3 * MIN })),
    ];
    const L = layoutRows(rows, { chatKind: 'group' });
    expect(L.map((l) => l.senderLabel)).toEqual([true, false, false, true, true]);
    expect(L.map((l) => l.gap)).toEqual(['none', 's-1', 'none', 'none', 's2']);
    // CR-0024 F2: foo's and helpers' own chats label each output run too; cards there carry no label.
    expect(layoutRows(rows, { chatKind: 'helper' }).map((l) => l.senderLabel)).toEqual([true, false, false, true, false]);
  });
  it('24 below foo’s reaction chips, 16 below the user’s badge slot (04 §1.2, §8; CR-0024 B2)', () => {
    const chip = { emoji: '👎', by: 'me' };
    const rows = [
      msg({ authorKind: 'foo', createdAt: T0, status: 'complete', reactions: [chip] }),
      msg({ createdAt: T0 + MIN, badge: 'done' }),
      msg({ authorKind: 'foo', createdAt: T0 + 2 * MIN, status: 'complete' }),
    ].map(row);
    expect(layoutRows(rows, { chatKind: 'foo' }).map((l) => l.gap)).toEqual(['none', 's5', 's3']);
  });
  it('no latest answer when foo’s newest text is still streaming or deleted', () => {
    const L = layoutRows([row(msg({ authorKind: 'foo', status: 'streaming' })), row(msg({ authorKind: 'foo', deletedAt: T0 }))], {
      chatKind: 'foo',
    });
    expect(L.every((l) => !l.latestAnswer)).toBe(true);
  });
  it('tail corners: bottom-outer on the first or single bubble, top-outer too once continued (04 §1.4)', () => {
    expect(tailCorners('single', 'me')).toEqual([false, false, true, false]);
    expect(tailCorners('middle', 'me')).toEqual([false, true, true, false]);
    expect(tailCorners('first', 'them')).toEqual([false, false, false, true]);
    expect(tailCorners('last', 'them')).toEqual([true, false, false, true]);
  });
});

describe('ticks and the badge slot (04 §3.3, §4, 08-0 §F)', () => {
  it('tick from status and badge', () => {
    expect(tickState({ status: 'failed', badge: null })).toBe('not_sent');
    expect(tickState({ status: 'queued', badge: null })).toBe('waiting');
    expect(tickState({ status: 'sent', badge: null })).toBe('sent');
    // CR-0024 F9: once foo started on it (`complete`), it stays read after the badge clears.
    expect(tickState({ status: 'complete', badge: null })).toBe('read');
    expect(tickState({ status: 'sent', badge: 'seen' })).toBe('read');
    expect(tickLabel('read', 'foo')).toContain('foo');
  });
  it('the slot: foo’s reaction beats the badge; offline waiting shows no badge; Not sent and deleted show nothing', () => {
    expect(badgeSlot(msg({ badge: 'seen', reactions: [{ emoji: '👍', by: 'foo' }] }), { offline: false })).toEqual({
      kind: 'reaction',
      emoji: '👍',
    });
    expect(badgeSlot(msg({ badge: 'working' }), { offline: false })).toEqual({ kind: 'badge', value: 'working' });
    expect(badgeSlot(msg({ status: 'queued', badge: 'waiting' }), { offline: true })).toBeNull();
    expect(badgeSlot(msg({ status: 'queued', badge: 'waiting' }), { offline: false })).toEqual({ kind: 'badge', value: 'waiting' });
    expect(badgeSlot(msg({ status: 'failed', badge: 'seen' }), { offline: false })).toBeNull();
    expect(badgeSlot(msg({ deletedAt: T0, badge: 'seen' }), { offline: false })).toBeNull();
    expect(badgeSlot(msg({ authorKind: 'foo', badge: 'seen' }), { offline: false })).toBeNull();
  });
  it('tooltips have variants for slow work and the AI being away; reaction tooltips name the agent', () => {
    expect(badgeTooltip('working', { slow: true })).not.toBe(badgeTooltip('working'));
    expect(badgeTooltip('waiting', { aiDown: true })).not.toBe(badgeTooltip('waiting'));
    expect(slotTooltip({ kind: 'reaction', emoji: '👍' }, { agentName: 'foo' })).toContain('foo');
    expect(BADGE_DEBOUNCE_MS).toBe(700);
  });
  it('accessible name: sender, time, text and state', () => {
    const name = bubbleName({ sender: 'You', at: T0, timeZone: 'Asia/Kolkata', now: T0, text: 'thanks!', state: ['Read by foo'] });
    expect(name).toMatch(/^You, .*8:05 AM.*thanks!.*Read by foo\.$/);
  });
});

describe('edit, Worked for, backup mark (04 §6.2, §15, §12.5)', () => {
  const facts = { isLatestUserMessage: true, now: T0 + EDIT_WINDOW_MS, approvedFromIt: false };
  it('edit: the latest user text within 15 minutes, never after an approval from it', () => {
    expect(canEdit(msg(), facts)).toBe(true);
    expect(canEdit(msg(), { ...facts, now: T0 + EDIT_WINDOW_MS + 1 })).toBe(false);
    expect(canEdit(msg(), { ...facts, isLatestUserMessage: false })).toBe(false);
    expect(canEdit(msg(), { ...facts, approvedFromIt: true })).toBe(false);
    expect(canEdit(msg({ kind: 'voice' }), facts)).toBe(false);
    expect(canEdit(msg({ authorKind: 'foo' }), facts)).toBe(false);
  });
  it('Worked for: seconds, minutes, hours', () => {
    expect(workedLabel(42_400)).toMatch(/42s/);
    expect(workedLabel(300)).toMatch(/1s/);
    expect(workedLabel(5 * MIN + 10_000)).toMatch(/5 min/);
    expect(workedLabel(83 * MIN)).toMatch(/1 h 23 min/);
    expect(workedAccessible(42_400)).toMatch(/42/);
  });
  it('backup names come from the provider note', () => {
    expect(backupNames('answered with ChatGPT while Claude rests')).toEqual({ backup: 'ChatGPT', primary: 'Claude' });
    expect(backupNames(null)).toBeNull();
    expect(backupNames('something else')).toBeNull();
  });
});

describe('menu items (04 §9.1)', () => {
  const base: MenuFacts = { side: 'me', deleted: false, hasText: true, canEdit: false, canTryAgain: false };
  it('the user’s bubble: Reply, Copy, Edit (when allowed), Select, Delete; no React', () => {
    expect(menuActions(base)).toEqual(['reply', 'copy', 'select', 'delete']);
    expect(menuActions({ ...base, canEdit: true })).toEqual(['reply', 'copy', 'edit', 'select', 'delete']);
  });
  it('foo’s bubble: React, Try again on the latest answer, 👍 / 👎; voice Keep; tables Copy table; cards have no Delete', () => {
    expect(menuActions({ ...base, side: 'them', canTryAgain: true, hasTable: true })).toEqual([
      'reply',
      'react',
      'copy',
      'copyTable',
      'ask', // R1 T6 (04 §17.4, X-180)
      'tryAgain',
      'good',
      'bad',
      'select',
      'delete',
    ]);
    expect(menuActions({ ...base, side: 'them', hasText: false, voiceKept: false })).toContain('keep');
    expect(menuActions({ ...base, side: 'card', noReact: true })).toEqual(['reply', 'copy', 'select']);
  });
  it('a deleted bubble offers only Delete', () => {
    expect(menuActions({ ...base, deleted: true })).toEqual(['delete']);
  });
});
