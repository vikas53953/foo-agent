// M4 T6 stacked error notices above the composer (04-2 §23.2a, X-149, AT-282, G-M4-12): both sources (a message not sent,
// a job that failed), the same sentence as the in-chat error, newest on top, 3 shown then "+{n} more", "Copy code" =
// `{ErrorKind}-{6-char id}`, Dismiss / Clear all remove notices only, and notices clear after 24 h away from the chat.
import { describe, expect, it } from 'vitest';
import {
  chatNotices,
  dismissNotices,
  enterChat,
  leaveChat,
  noticeCode,
  stackView,
  type NoticeSources,
} from '../../src/renderer/composer/ComposerNotices';
import { t } from '../../src/shared/copy/t';
import type { CardRow, JobRow, MessageRow } from '../../src/shared/types';

const NOW = Date.UTC(2026, 9, 16, 3, 30);
const H = 3_600_000;

const msg = (id: string, over: Partial<MessageRow> = {}): MessageRow =>
  ({
    id,
    chatId: 'c_1',
    authorKind: 'user',
    kind: 'text',
    text: 'hello',
    status: 'complete',
    clientId: null,
    jobId: null,
    cardId: null,
    createdAt: NOW,
    deletedAt: null,
    ...over,
  }) as MessageRow;
const job = (id: string, over: Partial<JobRow> = {}): JobRow =>
  ({ id, chatId: 'c_1', title: id, state: 'failed', finishedAt: NOW, createdAt: NOW - H, rev: 2, ...over }) as JobRow;
const errorCard = (id: string, jobId: string, payload: Record<string, unknown>): CardRow =>
  ({ id, chatId: 'c_1', jobId, type: 'error', state: 'shown', payload, rev: 1 }) as CardRow;

const sources = (over: Partial<NoticeSources> = {}): NoticeSources => ({
  chatId: 'c_1',
  messages: [],
  jobs: [],
  cards: {},
  sendErrors: {},
  ...over,
});
const fresh = enterChat(undefined, NOW - H);

describe('notices from both sources, newest on top', () => {
  it('a message not sent, then a job failed: two notices, the job on top, each with the in-chat sentence', () => {
    const list = chatNotices(
      sources({
        messages: [msg('m_01JABCDEFGHJK7Q2ZX', { status: 'failed', createdAt: NOW - 60_000 }), msg('m_ok')],
        jobs: [job('j_01JABCDEFGHJKM4P9R')],
        cards: { k_1: errorCard('k_1', 'j_01JABCDEFGHJKM4P9R', { kind: 'SITE_BLOCKED', whatHappened: 'irctc.co.in won’t let me in.' }) },
        sendErrors: { m_01JABCDEFGHJK7Q2ZX: 'NET_OFFLINE' },
      }),
      fresh,
    );
    expect(list.map((n) => [n.rowId, n.kind, n.text])).toEqual([
      ['j_01JABCDEFGHJKM4P9R', 'SITE_BLOCKED', 'irctc.co.in won’t let me in.'],
      ['m_01JABCDEFGHJK7Q2ZX', 'NET_OFFLINE', t('bubble.not_sent.text')],
    ]);
  });

  it('only user messages that failed, not deleted ones; only FAILED jobs of this chat', () => {
    const list = chatNotices(
      sources({
        messages: [
          msg('m_foo', { authorKind: 'foo', status: 'failed' }),
          msg('m_del', { status: 'failed', deletedAt: NOW }),
          msg('m_other', { status: 'failed', chatId: 'c_2' }),
        ],
        jobs: [job('j_done', { state: 'done' }), job('j_cancel', { state: 'cancelled' }), job('j_other', { chatId: 'c_2' })],
      }),
      fresh,
    );
    expect(list).toEqual([]);
  });

  it('a hand-back (SITE_HANDBACK) is a step handed back, not a failure: no notice above the composer (08-3 §21.2, run-8 bank banner)', () => {
    const list = chatNotices(
      sources({
        jobs: [job('j_bank'), job('j_blocked')],
        cards: {
          k_b: errorCard('k_b', 'j_bank', { kind: 'SITE_HANDBACK', whatHappened: t('errors.site_handback.body') }),
          k_s: errorCard('k_s', 'j_blocked', { kind: 'SITE_BLOCKED', whatHappened: 'irctc.co.in won’t let me in.' }),
        },
      }),
      fresh,
    );
    expect(list.map((n) => n.rowId)).toEqual(['j_blocked']);
  });

  it('a failed job without an error card yet shows the generic sentence; an unknown send error is UNKNOWN', () => {
    const list = chatNotices(sources({ jobs: [job('j_1')], messages: [msg('local:abc123', { status: 'failed' })] }), fresh);
    expect(list.find((n) => n.rowId === 'j_1')).toMatchObject({ kind: 'UNKNOWN', text: t('errors.unknown.what_happened') });
    expect(list.find((n) => n.rowId === 'local:abc123')?.kind).toBe('UNKNOWN');
  });
});

describe('Copy code {ErrorKind}-{6-char id}', () => {
  it('uses the last 6 letters or digits of the row id, upper case', () => {
    expect(noticeCode('SITE_BLOCKED', 'j_01JABCDEFGHJKM4P9R')).toBe('SITE_BLOCKED-KM4P9R');
    expect(noticeCode('UNKNOWN', 'local:ab-c1_23')).toBe('UNKNOWN-ABC123');
  });
});

describe('stack: 3 shown, then "+{n} more"', () => {
  const five = Array.from({ length: 5 }, (_, i) => job(`j_${i}`, { finishedAt: NOW - i * 60_000 }));
  it('5 notices → 3 shown + 2 more; expanded shows all 5', () => {
    const list = chatNotices(sources({ jobs: five }), fresh);
    expect(stackView(list, false)).toMatchObject({ more: 2 });
    expect(stackView(list, false).shown.map((n) => n.rowId)).toEqual(['j_0', 'j_1', 'j_2']);
    expect(stackView(list, true)).toMatchObject({ more: 0 });
    expect(stackView(list, true).shown).toHaveLength(5);
  });

  it('Dismiss removes one notice; Clear all removes every notice shown or hidden; the rows are untouched', () => {
    const src = sources({ jobs: five });
    const before = JSON.stringify(src);
    const one = dismissNotices(fresh, ['j_1']);
    expect(chatNotices(src, one).map((n) => n.rowId)).toEqual(['j_0', 'j_2', 'j_3', 'j_4']);
    const all = dismissNotices(
      one,
      chatNotices(src, one).map((n) => n.rowId),
    );
    expect(chatNotices(src, all)).toEqual([]);
    expect(JSON.stringify(src)).toBe(before);
  });
});

describe('notices clear after 24 h away from the chat', () => {
  it('back after 23 h they stay; back after 24 h they are gone, and a later failure shows again', () => {
    const src = sources({ jobs: [job('j_1')] });
    const left = leaveChat(fresh, NOW);
    expect(chatNotices(src, enterChat(left, NOW + 23 * H))).toHaveLength(1);
    const back = enterChat(left, NOW + 24 * H);
    expect(chatNotices(src, back)).toEqual([]);
    const later = sources({ jobs: [job('j_1'), job('j_2', { finishedAt: NOW + 24 * H + 1 })] });
    expect(chatNotices(later, back).map((n) => n.rowId)).toEqual(['j_2']);
  });

  it('first open this session shows failures from the last 24 h only', () => {
    const src = sources({ jobs: [job('j_old', { finishedAt: NOW - 25 * H }), job('j_new', { finishedAt: NOW - 2 * H })] });
    expect(chatNotices(src, enterChat(undefined, NOW)).map((n) => n.rowId)).toEqual(['j_new']);
  });
});
