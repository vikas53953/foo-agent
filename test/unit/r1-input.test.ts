// Spec: 04 §6.5 ("foo read:" items: people, places, dates, times, amounts; from the redacted text; never a secret), §17.4
// ("Ask about this" in foo's menu), §17.5 (a side question is stored with `reply_to_id` and `messages.side = 1`, about a foo
// or helper message), 04-2 §22.5 (three paste bands; `pasted-{time}.txt`), CR-0022 picks 6, 7 (X-180). R1 T6 seams; the
// journeys are test/e2e/r1-input.spec.ts (AT-363..365).
import Database from 'better-sqlite3';
import { beforeAll, describe, expect, it } from 'vitest';
import { t } from '../../src/shared/copy/t';
import { pasteBand, pastedFileName } from '../../src/shared/attachmentRules';
import { understoodItems, UNDERSTOOD_MAX } from '../../src/engine/chat/understood';
import { menuActions, type MenuFacts } from '../../src/renderer/messages/messageMenu';
import { showsReadLine } from '../../src/renderer/messages/ReadLine';
import { migrate, type Db } from '../../src/main/store/db';
import { sendMessage, type SendContext } from '../../src/main/store/composerQueries';
import { SeedWriter, ist } from '../../src/main/test/seed/writer';
import { isSideAiText } from '../../src/shared/sideQuestion';

const TZ = 'Asia/Kolkata';
/** Fri 16 Oct 2026, 9:41 AM IST (the ux-world clock). */
const NOW = Date.parse('2026-10-16T09:41:00+05:30');
const read = (text: string) => understoodItems(text, { now: NOW, timeZone: TZ });

describe('"foo read:" items (04 §6.5)', () => {
  it('reads the party size, the place and the day with its time', () => {
    expect(read('Book a table for 4 at Toit on Fri 7 pm')).toEqual([t('bubble.read.people', { n: 4 }), 'Toit', 'Fri 16 Oct, 7:00 PM']);
  });

  it('resolves weekdays, tomorrow and dated days to the real date (Article 21)', () => {
    expect(read('next Fri')).toEqual(['Fri 23 Oct']);
    expect(read('remind me tomorrow at 10:30 am')).toEqual(['Sat 17 Oct, 10:30 AM']);
    expect(read('my flight is on 2 Jan')).toEqual(['Sat 2 Jan 2027']);
    expect(read('Call Riya on 20 Oct')).toEqual(['Riya', 'Tue 20 Oct']);
  });

  it('formats amounts as exact ₹ (F19.2)', () => {
    expect(read('split ₹2500 with Asha')).toEqual(['₹2,500', 'Asha']);
    expect(read('budget Rs 1,20,000 for Goa')).toEqual(['₹1,20,000']);
  });

  it('a length is not a party size, and a lowercase "sat" is not a Saturday', () => {
    expect(read('park for 2 hours')).toEqual([]);
    expect(read('I sat down and ate')).toEqual([]);
  });

  it('never shows a secret: the text is redacted first and a masked item is dropped', () => {
    const items = read('my password is hunter2xyz, pay ₹500 to Ravi with card 4111 1111 1111 1111');
    expect(items.join(' ')).not.toMatch(/hunter2xyz|4111/);
    expect(items).toContain('₹500');
    expect(items).toContain('Ravi');
    expect(read('key sk-proj-AbCdEfGhIjKlMnOpQrStUvWx1234 at Toit').join(' ')).not.toContain('sk-proj');
  });

  it('nothing found is an empty list; at most UNDERSTOOD_MAX items', () => {
    expect(read('ok thanks')).toEqual([]);
    expect(read('with Ana with Bea with Cy with Dev with Eli with Fay with Gus with Hal with Ivy with Jo')).toHaveLength(UNDERSTOOD_MAX);
  });

  it('shows only under the last user bubble and never in groups or WhatsApp mirrors', () => {
    const base = { understood: ['Toit'], isLatestUser: true, chatKind: 'foo', deleted: false };
    expect(showsReadLine(base)).toBe(true);
    expect(showsReadLine({ ...base, isLatestUser: false })).toBe(false);
    expect(showsReadLine({ ...base, chatKind: 'group' })).toBe(false);
    expect(showsReadLine({ ...base, chatKind: 'wa_mirror' })).toBe(false);
    expect(showsReadLine({ ...base, understood: [] })).toBe(false);
  });
});

describe('Ask about this in the message menu (04 §17.4)', () => {
  const facts = (o: Partial<MenuFacts>): MenuFacts => ({
    side: 'them',
    deleted: false,
    hasText: true,
    canEdit: false,
    canTryAgain: false,
    ...o,
  });
  it('sits after Copy on a foo or helper bubble with words, and nowhere else', () => {
    expect(menuActions(facts({}))).toEqual(['reply', 'react', 'copy', 'ask', 'good', 'bad', 'select', 'delete']);
    expect(menuActions(facts({ side: 'me' }))).not.toContain('ask');
    expect(menuActions(facts({ side: 'card' }))).not.toContain('ask');
    expect(menuActions(facts({ hasText: false }))).not.toContain('ask');
  });
});

describe('a side question is stored as a reply with messages.side = 1 (04 §17.5)', () => {
  let db: Db;
  let chat = '';
  let fooMsg = '';
  let userMsg = '';
  let n = 0;
  const ctx = (): SendContext => ({ now: NOW, newId: () => `m_side_${++n}`, waiting: false, attachment: () => undefined });
  beforeAll(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    migrate(db);
    const w = new SeedWriter(db, 1);
    const at = ist(2026, 10, 16, 9, 0);
    db.transaction(() => {
      chat = w.chat({ kind: 'foo', title: 'foo', at }).chatId;
      fooMsg = w.message(chat, { author: 'foo', text: 'Your EMI is ₹12,400 a month for 5 years.', at });
      userMsg = w.message(chat, { author: 'user', text: 'thanks', at: at + 1 });
    })();
    w.finish(NOW);
  });

  it('asks about a foo message and keeps the flag', () => {
    const r = sendMessage(db, { chatId: chat, clientId: 's-1', text: 'what does EMI mean?', replyToId: fooMsg, side: true }, ctx());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.side).toBe(true);
    expect(r.row.replyToId).toBe(fooMsg);
  });

  it('the picked words go into the AI text only; the bubble keeps the question', () => {
    const r = sendMessage(
      db,
      { chatId: chat, clientId: 's-4', text: 'and for 3 years?', replyToId: fooMsg, side: true, quote: '5 years' },
      ctx(),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.text).toBe('and for 3 years?');
    const forAi = db.prepare('SELECT text_for_ai FROM messages WHERE id = ?').pluck().get(r.messageId) as string;
    expect(isSideAiText(forAi)).toBe(true);
    expect(forAi).toContain('> 5 years');
    expect(forAi.endsWith('and for 3 years?')).toBe(true);
  });

  it("a normal reply is not a side question; a side question about the user's own message is refused", () => {
    const plain = sendMessage(db, { chatId: chat, clientId: 's-2', text: 'ok', replyToId: fooMsg }, ctx());
    expect(plain.ok && plain.row.side).toBe(false);
    const own = sendMessage(db, { chatId: chat, clientId: 's-3', text: 'what?', replyToId: userMsg, side: true }, ctx());
    expect(own).toEqual({ ok: false, reason: 'not_found' });
  });
});

describe('paste bands (04-2 §22.5)', () => {
  it('≤ 2,000 inline; 2,001–10,000 or > 40 lines a chip; > 10,000 a file', () => {
    expect(pasteBand('a'.repeat(2_000))).toBe('inline');
    expect(pasteBand('a'.repeat(2_001))).toBe('chip');
    expect(pasteBand(Array.from({ length: 41 }, () => 'x').join('\n'))).toBe('chip');
    expect(pasteBand('a'.repeat(10_000))).toBe('chip');
    expect(pasteBand('a'.repeat(10_001))).toBe('file');
  });
  it("names the file pasted-{time}.txt in the user's zone, with no characters Windows refuses", () => {
    expect(pastedFileName(NOW, TZ)).toBe('pasted-2026-10-16-0941.txt');
    expect(pastedFileName(Date.parse('2026-10-16T23:05:00+05:30'), TZ)).toBe('pasted-2026-10-16-2305.txt');
  });
});
