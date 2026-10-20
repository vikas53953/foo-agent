// Spec: 04 §1.6 (stick to bottom with rows of different heights; streaming follows until the answer's top is 16px from the
// top; the user's send always follows), 08-5 §5 rule 4 (message:delta in order; a gap resyncs with message:get), 04 §7 /
// §1.6 (the composer's optimistic row and its re-key when main stores it), §8 (one reaction per person: the toggle rule).
import { describe, expect, it } from 'vitest';
// The store module first: messages.ts and index.ts import each other, and index builds the initial state on load.
import { update, useStore } from '../../src/renderer/store/index';
import {
  applyDeltaReducer,
  confirmSentReducer,
  failSendReducer,
  initialMessages,
  insertOptimisticReducer,
  loadMessagesReducer,
  localId,
  prependMessages,
  prependMessagesReducer,
  reactionChange,
  setBadgeReducer,
  upsertMessageReducer,
} from '../../src/renderer/store/messages';
import {
  STICK_THRESHOLD,
  STREAM_TOP_GAP,
  atBottom,
  followStreaming,
  onRowsAdded,
  rowVisible,
} from '../../src/renderer/messages/stickToBottom';
import type { MessageRow } from '../../src/shared/types';

const T0 = Date.UTC(2026, 9, 16, 2, 35);

function msg(p: Partial<MessageRow>): MessageRow {
  return {
    id: 'm_1',
    chatId: 'c_1',
    seq: 1,
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

describe('the optimistic seam (builder B)', () => {
  it('insertOptimistic shows a pending, queued row last; confirmSent re-keys it to the stored id', () => {
    const s = initialMessages();
    loadMessagesReducer(s, 'c_1', [msg({ id: 'm_1', seq: 1 }), msg({ id: 'm_2', seq: 2 })], 50);
    insertOptimisticReducer(s, msg({ id: 'x', seq: 0, clientId: 'cl_1', text: 'new' }));
    const c = s.byChat.c_1!;
    expect(c.ids).toEqual(['m_1', 'm_2', localId('cl_1')]);
    expect(c.byId[localId('cl_1')]).toMatchObject({ pending: true, status: 'queued', seq: 3 });
    confirmSentReducer(s, 'c_1', 'cl_1', 'm_3', false);
    expect(c.ids).toEqual(['m_1', 'm_2', 'm_3']);
    expect(c.byId.m_3).toMatchObject({ id: 'm_3', pending: false, status: 'sent' });
  });
  it('main’s upsert can arrive before the send reply; the row is not doubled', () => {
    const s = initialMessages();
    insertOptimisticReducer(s, msg({ id: 'x', clientId: 'cl_2', chatId: 'c_1' }));
    upsertMessageReducer(s, msg({ id: 'm_9', seq: 9, clientId: 'cl_2', status: 'sent' }));
    confirmSentReducer(s, 'c_1', 'cl_2', 'm_9', false);
    expect(s.byChat.c_1!.ids).toEqual(['m_9']);
    expect(s.byChat.c_1!.byId.m_9!.status).toBe('sent');
  });
  it('a send that fails before main stored it shows Not sent; a reload keeps the pending row', () => {
    const s = initialMessages();
    insertOptimisticReducer(s, msg({ id: 'x', clientId: 'cl_3' }));
    failSendReducer(s, 'c_1', 'cl_3');
    expect(s.byChat.c_1!.byId[localId('cl_3')]!.status).toBe('failed');
    loadMessagesReducer(s, 'c_1', [msg({ id: 'm_1', seq: 1 })], 50);
    expect(s.byChat.c_1!.ids).toContain(localId('cl_3'));
  });
});

describe('older pages (03-shell-2 §3.6.4)', () => {
  const page = (from: number, n: number) => Array.from({ length: n }, (_, i) => msg({ id: `m_${from + i}`, seq: from + i }));
  it('prependMessages (plain objects) gives the same chat as the Immer reducer, frozen, and keeps rows already loaded', () => {
    const s = initialMessages();
    loadMessagesReducer(s, 'c_1', page(51, 50), 50);
    prependMessagesReducer(s, 'c_1', [...page(1, 50), msg({ id: 'm_51', seq: 51, text: 'dup' })], 50);
    update((d) => {
      loadMessagesReducer(d.messages, 'c_1', page(51, 50), 50);
    });
    prependMessages('c_1', [...page(1, 50), msg({ id: 'm_51', seq: 51, text: 'dup' })], 50);
    const c = useStore.getState().messages.byChat['c_1']!;
    expect(c.ids).toEqual(s.byChat['c_1']!.ids);
    expect(c.ids[0]).toBe('m_1');
    expect(c.byId['m_51']!.text).toBe('hi');
    expect(c.oldestSeq).toBe(1);
    expect(c.hasMore).toBe(true);
    expect(Object.isFrozen(c) && Object.isFrozen(c.ids) && Object.isFrozen(c.byId['m_1'])).toBe(true);
    // A later Immer update still works on it.
    update((d) => {
      prependMessagesReducer(d.messages, 'c_1', [msg({ id: 'm_0', seq: 0 })], 50);
    });
    expect(useStore.getState().messages.byChat['c_1']!.ids.slice(0, 2)).toEqual(['m_0', 'm_1']);
    expect(useStore.getState().messages.byChat['c_1']!.hasMore).toBe(false);
  });
});

describe('message events', () => {
  it('message:delta appends in order; a gap reports false (the caller resyncs); a repeat is ignored', () => {
    const s = initialMessages();
    loadMessagesReducer(s, 'c_1', [msg({ id: 'm_1', authorKind: 'foo', text: '', status: 'streaming' })], 50);
    expect(applyDeltaReducer(s, { messageId: 'm_1', seq: 1, append: 'No, ' })).toBe(true);
    expect(applyDeltaReducer(s, { messageId: 'm_1', seq: 2, append: 'Mon 2 Nov' })).toBe(true);
    expect(applyDeltaReducer(s, { messageId: 'm_1', seq: 2, append: 'Mon 2 Nov' })).toBe(true);
    expect(applyDeltaReducer(s, { messageId: 'm_1', seq: 4, append: '!' })).toBe(false);
    expect(s.byChat.c_1!.byId.m_1!.text).toBe('No, Mon 2 Nov');
  });
  it('message:badge sets the badge; older revs never overwrite newer rows', () => {
    const s = initialMessages();
    loadMessagesReducer(s, 'c_1', [msg({ id: 'm_1', rev: 3, text: 'new' })], 50);
    setBadgeReducer(s, { messageId: 'm_1', badge: 'seen' });
    expect(s.byChat.c_1!.byId.m_1!.badge).toBe('seen');
    upsertMessageReducer(s, msg({ id: 'm_1', rev: 2, text: 'old' }));
    expect(s.byChat.c_1!.byId.m_1!.text).toBe('new');
  });
  it('reactions: one per person; the same emoji removes it, another replaces it', () => {
    expect(reactionChange(undefined, '👍')).toEqual({ add: '👍' });
    expect(reactionChange('👍', '👍')).toEqual({ remove: '👍' });
    expect(reactionChange('👍', '❤️')).toEqual({ remove: '👍', add: '❤️' });
  });
});

/**
 * A list of rows whose real heights differ from their estimates, measured one at a time (as the virtualizer does), with the
 * same rule useStickToBottom applies: after a size change, follow to the end only when the list was at the bottom before it.
 */
class Sim {
  heights: number[] = [];
  scrollTop = 0;
  wasAtBottom = true;
  constructor(readonly clientHeight: number) {}
  get total() {
    return this.heights.reduce((a, b) => a + b, 0);
  }
  metrics() {
    return { scrollHeight: this.total, scrollTop: this.scrollTop, clientHeight: this.clientHeight };
  }
  toEnd() {
    this.scrollTop = Math.max(0, this.total - this.clientHeight);
  }
  scrollBy(dy: number) {
    this.scrollTop = Math.max(0, Math.min(this.total - this.clientHeight, this.scrollTop + dy));
    this.wasAtBottom = atBottom(this.metrics());
  }
  resize(i: number, h: number, follow = true) {
    this.heights[i] = h;
    if (this.wasAtBottom && follow) this.toEnd();
  }
  add(h: number, byUser = false) {
    this.heights.push(h);
    if (onRowsAdded({ wasAtBottom: this.wasAtBottom, added: 1, byUser }).follow) {
      this.toEnd();
      this.wasAtBottom = true;
    }
  }
  start(i: number) {
    return this.heights.slice(0, i).reduce((a, b) => a + b, 0);
  }
}

describe('stick to bottom with rows of different heights (04 §1.6)', () => {
  const est = [56, 56, 88, 160, 56, 56, 260, 56];
  const real = [48, 120, 92, 214, 48, 300, 204, 70];

  it('measuring rows that come out taller or shorter keeps the list on its last line', () => {
    const s = new Sim(400);
    est.forEach((h) => s.add(h));
    real.forEach((h, i) => {
      s.resize(i, h);
      expect(s.total - s.scrollTop - s.clientHeight).toBeLessThan(STICK_THRESHOLD);
    });
  });
  it('after the user scrolls up, measurements and new rows never move what they read; a send jumps to the end', () => {
    const s = new Sim(400);
    est.forEach((h) => s.add(h));
    s.scrollBy(-300);
    expect(s.wasAtBottom).toBe(false);
    const top = s.scrollTop;
    real.forEach((h, i) => i > 4 && s.resize(i, h));
    s.add(56);
    expect(s.scrollTop).toBe(top);
    s.add(56, true);
    expect(atBottom(s.metrics())).toBe(true);
  });
  it('a streaming answer is followed until its top is 16px below the top of the view, then the view holds', () => {
    const s = new Sim(400);
    est.forEach((h) => s.add(h));
    s.add(56);
    const i = s.heights.length - 1;
    let grew = 56;
    while (grew < 1200) {
      grew += 44;
      // As MessageList does: would following to the new end still leave the answer's top more than 16px down?
      const end = s.total - s.heights[i]! + grew - s.clientHeight;
      s.resize(i, grew, followStreaming({ rowStart: s.start(i), scrollTop: end }));
      expect(s.start(i) - s.scrollTop).toBeGreaterThan(STREAM_TOP_GAP); // the first line is never pushed under the header
    }
    expect(s.start(i) - s.scrollTop).toBeLessThanOrEqual(STREAM_TOP_GAP + 44); // it followed until the last step
  });
  it('a row counts as seen only while some of it is inside the view', () => {
    expect(rowVisible({ start: 100, end: 150, scrollTop: 0, clientHeight: 400 })).toBe(true);
    expect(rowVisible({ start: 500, end: 550, scrollTop: 0, clientHeight: 400 })).toBe(false);
  });
});
