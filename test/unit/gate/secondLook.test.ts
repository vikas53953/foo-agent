// Spec: 08-2 §9.6 (second look: user's words only; A deterministic checks, any mismatch → HELD(mismatch); B the AI check,
// invalid twice / timeout / primary unavailable → HELD(cannot_check); C the result stored, pass → RUNNING), 08-4 §28.3 (empty
// user words → step B skipped, HELD no_user_words), §28.4 (HELD values formatted by F10: "₹14,600", "Sat 17 Oct, 8:00 PM",
// "4 people", "Rakesh (r***@gmail.com)"), §25.4 (`ai = { ok: act.match, note }`), §28.6 ({verbing}), §9.4.3 (an untrusted
// recipient MUST be flagged).
import { describe, expect, it } from 'vitest';
import { maskAddress, secondLook, type SecondLookInput } from '../../../src/engine/gate/secondLook';
import type { ApprovalFields } from '../../../src/shared/types';

const TZ = 'Asia/Kolkata';
const NOW = Date.UTC(2026, 9, 19, 6, 0);
const SAT_8PM = Date.UTC(2026, 9, 24, 14, 30);

const book: ApprovalFields = {
  verb: 'book',
  payee: 'Toit',
  siteDomain: 'table.example',
  amountPaise: 240_000,
  partySize: 4,
  when: { start: SAT_8PM, tz: TZ },
  cancelTerms: { refundable: true },
  irreversible: false,
};

const input = (o: Partial<SecondLookInput> = {}): SecondLookInput => ({
  fields: book,
  userWords: [{ at: NOW - 60_000, text: 'Book a table for 4 at Toit on Saturday at 8 pm' }],
  timeZone: TZ,
  now: NOW,
  askAi: () => Promise.resolve({ match: true }),
  ...o,
});

describe('secondLook (08-2 §9.6)', () => {
  it('everything agrees → pass, deterministic ok and the AI said match', async () => {
    const r = await secondLook(input());
    expect(r.pass).toBe(true);
    expect(r.result).toEqual({ at: NOW, deterministic: { ok: true, mismatches: [] }, ai: { ok: true, note: '' } });
  });

  it('people: the user said 2, the card books 4 → HELD mismatch "2 people" / "4 people", no AI call', async () => {
    let asked = 0;
    const r = await secondLook(
      input({
        userWords: [{ at: NOW - 60_000, text: 'Book a table for 2 at Toit' }],
        askAi: () => (asked++, Promise.resolve({ match: true })),
      }),
    );
    expect(r.pass).toBe(false);
    expect(r.held).toEqual({ reason: 'mismatch', userSaid: '2 people', actionHas: '4 people' });
    expect(r.result.held).toEqual({ field: 'people', userSaid: '2 people', actionHas: '4 people' });
    expect(r.result.deterministic).toEqual({ ok: false, mismatches: ['people'] });
    expect(asked).toBe(0);
  });

  it('the latest statement wins: "actually 4" after "for 2" passes', async () => {
    const r = await secondLook(
      input({
        userWords: [
          { at: NOW - 120_000, text: 'Book a table for 2 at Toit' },
          { at: NOW - 60_000, text: 'actually we are 4 people' },
        ],
      }),
    );
    expect(r.pass).toBe(true);
  });

  it('amount: a ₹ total the user stated must equal the card total ("₹2,000" vs "₹2,400")', async () => {
    const r = await secondLook(input({ userWords: [{ at: NOW, text: 'Book Toit for 4, the ₹2,000 table' }] }));
    expect(r.held).toEqual({ reason: 'mismatch', userSaid: '₹2,000', actionHas: '₹2,400' });
  });

  it('site: the page the submit runs on must be the card site', async () => {
    const r = await secondLook(input({ live: { siteDomain: 'tab1e.example' } }));
    expect(r.held).toEqual({ reason: 'mismatch', userSaid: 'table.example', actionHas: 'tab1e.example' });
    expect(r.result.held?.field).toBe('place');
  });

  it('recipient: the outgoing address must be one of the card recipients; HELD shows name + masked address', async () => {
    const send: ApprovalFields = {
      verb: 'send',
      recipients: [{ name: 'Rakesh', address: 'rakesh@example.com', isNew: false, isGroup: false }],
      irreversible: true,
    };
    const ok = await secondLook(
      input({ fields: send, userWords: [{ at: NOW, text: 'mail Rakesh' }], live: { recipients: ['RAKESH@example.com'] } }),
    );
    expect(ok.pass).toBe(true);
    const r = await secondLook(
      input({ fields: send, userWords: [{ at: NOW, text: 'mail Rakesh' }], live: { recipients: ['rakesh@example.org'] } }),
    );
    expect(r.held).toEqual({ reason: 'mismatch', userSaid: 'Rakesh (r***@example.com)', actionHas: 'r***@example.org' });
  });

  it('§9.4.3: a recipient seen only in untrusted content is flagged even when the AI says match', async () => {
    const send: ApprovalFields = {
      verb: 'send',
      recipients: [{ name: 'Accounts', address: 'pay@example.net', isNew: true, isGroup: false }],
      irreversible: true,
    };
    const r = await secondLook(
      input({ fields: send, userWords: [{ at: NOW, text: 'reply to the invoice mail' }], untrusted: ['pay@example.net'] }),
    );
    expect(r.pass).toBe(false);
    expect(r.result.held?.field).toBe('recipient');
    expect(r.result.deterministic.mismatches).toEqual(['recipient']);
  });

  it('dates: with a date parser, a time the user stated must equal fields.when to the minute', async () => {
    const parseWhen = (text: string) => (/9 pm/u.test(text) ? { start: SAT_8PM + 3_600_000, hasTime: true } : null);
    const r = await secondLook(input({ userWords: [{ at: NOW, text: 'Toit for 4 on Saturday at 9 pm' }], parseWhen }));
    expect(r.held).toEqual({ reason: 'mismatch', userSaid: 'Sat 24 Oct, 9:00 PM', actionHas: 'Sat 24 Oct, 8:00 PM' });
    expect(r.result.held?.field).toBe('time');
    const day = await secondLook(
      input({ userWords: [{ at: NOW, text: 'Toit on Saturday' }], parseWhen: () => ({ start: SAT_8PM - 9 * 3_600_000, hasTime: false }) }),
    );
    expect(day.pass).toBe(true);
  });

  it('the AI finds a mismatch → HELD with its two values; the stored ai note is "field: said ≠ has"', async () => {
    const r = await secondLook(
      input({ askAi: () => Promise.resolve({ match: false, field: 'item', userSaid: 'window table', actionHas: 'bar seat' }) }),
    );
    expect(r.held).toEqual({ reason: 'mismatch', userSaid: 'window table', actionHas: 'bar seat' });
    expect(r.result.ai).toEqual({ ok: false, note: 'item: window table ≠ bar seat' });
    expect(r.result.held).toEqual({ field: 'item', userSaid: 'window table', actionHas: 'bar seat' });
  });

  it('AI invalid twice, timed out or primary unavailable → HELD cannot_check with the verb in -ing form', async () => {
    const r = await secondLook(input({ askAi: () => Promise.resolve('cannot_check') }));
    expect(r.pass).toBe(false);
    expect(r.held).toEqual({ reason: 'cannot_check', verbing: 'booking' });
    expect(r.result.ai).toBeUndefined();
    const del = await secondLook(input({ fields: { ...book, verb: 'delete' }, askAi: () => Promise.resolve('cannot_check') }));
    expect(del.held?.verbing).toBe('deleting');
  });

  it('no user words → step B skipped, HELD no_user_words (Art. 10 fails closed)', async () => {
    let asked = 0;
    const r = await secondLook(input({ userWords: [], askAi: () => (asked++, Promise.resolve({ match: true })) }));
    expect(r.held).toEqual({ reason: 'no_user_words' });
    expect(asked).toBe(0);
  });

  it('the AI prompt gets the user lines oldest first and the action without `irreversible`', async () => {
    let seen: Parameters<SecondLookInput['askAi']>[0] | null = null;
    await secondLook(input({ askAi: (p) => ((seen = p), Promise.resolve({ match: true })) }));
    expect(seen!.userWords).toEqual(['[Mon 19 Oct, 11:29 AM] Book a table for 4 at Toit on Saturday at 8 pm']);
    expect(JSON.parse(seen!.actionJson)).toEqual({
      verb: 'book',
      payee: 'Toit',
      siteDomain: 'table.example',
      amountPaise: 240_000,
      partySize: 4,
      when: { start: SAT_8PM, tz: TZ },
      cancelTerms: { refundable: true },
    });
  });

  it('maskAddress keeps the first letter and the domain', () => {
    expect(maskAddress('rakesh@gmail.com')).toBe('r***@gmail.com');
  });
});
