// M5 T12: Ctrl+J target (05-1 §0 / 09 §9.17.1 [X-09, X-21]): the oldest card in this chat that needs the user (pending
// gated card, choice, sign-in, secret, plan, stuck, bill in `waiting`; HELD counts too, 03-shell-1 §3.4.4, G-M5-36); expired,
// deleted, answered and other chats' cards never count.
import { describe, expect, it } from 'vitest';
import { needsYou, oldestNeedsYouCard } from '../../src/renderer/shell/jumpToCard';
import type { CardRow } from '../../src/shared/types';

const NOW = Date.parse('2026-10-16T09:41:00+05:30');
let n = 0;
const card = (type: CardRow['type'], state: string, o: Partial<CardRow> = {}): CardRow => ({
  id: `k_${++n}`,
  chatId: 'c_1',
  messageId: `m_${n}`,
  jobId: null,
  type,
  state,
  payload: {},
  answer: null,
  nonce: 'x',
  expiresAt: null,
  resolvedBy: null,
  resolvedAt: null,
  supersedesId: null,
  rev: 1,
  createdAt: NOW - 1_000 * n,
  updatedAt: NOW,
  deletedAt: null,
  ...o,
});

describe('Ctrl+J: which cards need the user', () => {
  it('counts the 05-1 §0 list in its waiting states', () => {
    const yes: [CardRow['type'], string][] = [
      ['approval', 'PENDING'],
      ['approval', 'HELD'],
      ['payment', 'PENDING'],
      ['choice', 'asking'],
      ['tiles', 'asking'],
      ['signin', 'waiting'],
      ['secret', 'asking'],
      ['plan', 'pending'],
      ['stuck', 'asking'],
      ['bill', 'waiting'],
    ];
    for (const [type, state] of yes) expect(needsYou(card(type, state), NOW), `${type} ${state}`).toBe(true);
    const no: [CardRow['type'], string][] = [
      ['approval', 'APPROVED'],
      ['approval', 'DECLINED'],
      ['choice', 'answered'],
      ['signin', 'live'],
      ['secret', 'saved'],
      ['plan', 'go'],
      ['stuck', 'other_way'],
      ['bill', 'paid'],
      ['draft', 'pending'],
      ['error', 'asking'],
      ['checklist', 'live'],
    ];
    for (const [type, state] of no) expect(needsYou(card(type, state), NOW), `${type} ${state}`).toBe(false);
  });

  it('skips expired and deleted cards', () => {
    expect(needsYou(card('choice', 'asking', { expiresAt: NOW }), NOW)).toBe(false);
    expect(needsYou(card('choice', 'asking', { expiresAt: NOW + 1 }), NOW)).toBe(true);
    expect(needsYou(card('choice', 'asking', { deletedAt: NOW }), NOW)).toBe(false);
  });

  it('picks the oldest one in this chat, or none', () => {
    const newer = card('approval', 'PENDING', { createdAt: NOW - 5_000 });
    const oldest = card('choice', 'asking', { createdAt: NOW - 9_000 });
    const answered = card('choice', 'answered', { createdAt: NOW - 20_000 });
    const elsewhere = card('stuck', 'asking', { chatId: 'c_2', createdAt: NOW - 30_000 });
    expect(oldestNeedsYouCard([newer, answered, oldest, elsewhere], 'c_1', NOW)?.id).toBe(oldest.id);
    expect(oldestNeedsYouCard([answered, elsewhere], 'c_1', NOW)).toBeNull();
    expect(oldestNeedsYouCard([], 'c_1', NOW)).toBeNull();
  });
});
