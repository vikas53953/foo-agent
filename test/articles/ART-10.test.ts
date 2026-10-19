// Spec: ART-10 (Art. 10 second look: 40 mismatch fixtures — recipient, amount, date, item — and 40 matching ones; a separate
// check call is made before the action, captured; all mismatches HELD with the exact copy, all matches proceed), 08-2 §9.6,
// 08-4 §28.4 (F10 values), §28.6 (`cards.approval.held.mismatch`). Made-up names, sites and example.com addresses only.
import { afterEach, describe, expect, it } from 'vitest';
import { secondLook, type SecondLookInput } from '../../src/engine/gate/secondLook';
import { t } from '../../src/shared/copy/t';
import type { ApprovalFields } from '../../src/shared/types';
import { bookScript, gateTools } from '../integration/approvals/gateFlow';
import { jobHarness, type JobHarness } from '../integration/jobs/jobHarness';

const TZ = 'Asia/Kolkata';
const NOW = Date.UTC(2026, 9, 19, 6, 0);
const DAY = 86_400_000;
const at = (d: number, h: number) => Date.UTC(2026, 9, 20 + d, h - 5, 30); // h:00 IST on 20+d Oct

const NAMES = ['Asha', 'Rakesh', 'Meera', 'Kabir', 'Simran', 'Arjun', 'Neha', 'Vikram', 'Priya', 'Dev'];
const ITEMS = ['window table', 'garden table', 'rooftop seats', 'private room', 'booth', 'bar seats', 'family table', 'patio table'];

interface Fixture {
  name: string;
  input: Omit<SecondLookInput, 'askAi' | 'timeZone' | 'now'>;
  /** What the fake AI answers (the item check is the AI's: there is no deterministic item rule). */
  ai: Awaited<ReturnType<SecondLookInput['askAi']>>;
  held?: { userSaid: string; actionHas: string };
}

/** A tiny stand-in for chrono-node: "on {d} Oct at {h} pm". */
const parseWhen = (text: string) => {
  const m = /on (\d{1,2}) Oct(?: at (\d{1,2}) pm)?/u.exec(text);
  if (!m) return null;
  const d = Number(m[1]) - 20;
  return m[2] ? { start: at(d, Number(m[2]) + 12), hasTime: true } : { start: at(d, 9), hasTime: false };
};

const fixtures: Fixture[] = [];
for (let i = 0; i < 10; i++) {
  const name = NAMES[i]!;
  const addr = `${name.toLowerCase()}@example.com`;
  const send: ApprovalFields = { verb: 'send', recipients: [{ name, address: addr, isNew: false, isGroup: false }], irreversible: true };
  // recipient
  fixtures.push({
    name: `recipient match ${i}`,
    input: { fields: send, userWords: [{ at: NOW, text: `mail ${name} the notes` }], live: { recipients: [addr] } },
    ai: { match: true },
  });
  fixtures.push({
    name: `recipient mismatch ${i}`,
    input: {
      fields: send,
      userWords: [{ at: NOW, text: `mail ${name} the notes` }],
      live: { recipients: [`${name.toLowerCase()}@example.org`] },
    },
    ai: { match: true },
    held: { userSaid: `${name} (${name[0]!.toLowerCase()}***@example.com)`, actionHas: `${name[0]!.toLowerCase()}***@example.org` },
  });
  // amount
  const paise = (1_000 + i * 250) * 100;
  const rupees = (paise / 100).toLocaleString('en-IN');
  const book: ApprovalFields = { verb: 'book', payee: 'Toit', amountPaise: paise, irreversible: false };
  fixtures.push({
    name: `amount match ${i}`,
    input: { fields: book, userWords: [{ at: NOW, text: `book it, ₹${rupees} is fine` }] },
    ai: { match: true },
  });
  const other = paise + 20_000;
  fixtures.push({
    name: `amount mismatch ${i}`,
    input: { fields: { ...book, amountPaise: other }, userWords: [{ at: NOW, text: `book it, ₹${rupees} is fine` }] },
    ai: { match: true },
    held: { userSaid: `₹${rupees}`, actionHas: `₹${(other / 100).toLocaleString('en-IN')}` },
  });
  // date / time
  const d = i % 5;
  const hour = 7 + (i % 3);
  const when = { start: at(d, hour + 12), tz: TZ };
  const dated: ApprovalFields = { verb: 'book', payee: 'Toit', when, irreversible: false };
  fixtures.push({
    name: `date match ${i}`,
    input: { fields: dated, userWords: [{ at: NOW, text: `book Toit on ${20 + d} Oct at ${hour} pm` }], parseWhen },
    ai: { match: true },
  });
  const wrong = i % 2 === 0 ? { start: when.start + 3_600_000, tz: TZ } : { start: when.start + DAY, tz: TZ };
  fixtures.push({
    name: `date mismatch ${i}`,
    input: { fields: { ...dated, when: wrong }, userWords: [{ at: NOW, text: `book Toit on ${20 + d} Oct at ${hour} pm` }], parseWhen },
    ai: { match: true },
  });
  // item (the AI's check)
  const item = ITEMS[i % ITEMS.length]!;
  const otherItem = ITEMS[(i + 3) % ITEMS.length]!;
  const withItem: ApprovalFields = { verb: 'book', payee: 'Toit', item, irreversible: false };
  fixtures.push({
    name: `item match ${i}`,
    input: { fields: withItem, userWords: [{ at: NOW, text: `a ${item} at Toit` }] },
    ai: { match: true },
  });
  fixtures.push({
    name: `item mismatch ${i}`,
    input: { fields: { ...withItem, item: otherItem }, userWords: [{ at: NOW, text: `a ${item} at Toit` }] },
    ai: { match: false, field: 'item', userSaid: item, actionHas: otherItem },
    held: { userSaid: item, actionHas: otherItem },
  });
}

const mismatches = fixtures.filter((f) => f.name.includes('mismatch'));
const matches = fixtures.filter((f) => !f.name.includes('mismatch'));

describe('ART-10 second look before acting (Art. 10)', () => {
  it('ART-10 has 40 mismatch fixtures and 40 matching ones across recipient, amount, date and item', () => {
    expect(mismatches).toHaveLength(40);
    expect(matches).toHaveLength(40);
  });

  it('ART-10 every mismatch is HELD with the exact copy; every match proceeds after its own check call', async () => {
    for (const f of fixtures) {
      let calls = 0;
      const r = await secondLook({ ...f.input, timeZone: TZ, now: NOW, askAi: () => (calls++, Promise.resolve(f.ai)) });
      if (f.name.includes('mismatch')) {
        expect(r.pass, f.name).toBe(false);
        expect(r.held?.reason, f.name).toBe('mismatch');
        if (f.held) expect({ userSaid: r.held?.userSaid, actionHas: r.held?.actionHas }, f.name).toEqual(f.held);
        const copy = t('cards.approval.held.mismatch', { userSaid: r.held!.userSaid!, actionHas: r.held!.actionHas! });
        expect(copy, f.name).toBe(
          `Before I do this, one check: you asked for ${r.held!.userSaid}, this is ${r.held!.actionHas}. Which one?`,
        );
      } else {
        expect(r.pass, f.name).toBe(true);
        expect(calls, `${f.name}: the separate check call`).toBe(1);
      }
    }
  });

  let h: JobHarness | null = null;
  afterEach(() => {
    h?.close();
    h = null;
  });

  it('ART-10 in a job the check call is made (and recorded) before the action runs', async () => {
    const ran: string[] = [];
    h = jobHarness({ script: bookScript(), tools: { extra: gateTools(ran) } });
    h.userSays('Book a table for 4 at Toit on Saturday');
    await h.settle();
    const card = h.cards('approval')[0]!;
    h.approvals.approve({ cardId: String(card.id), nonce: String(card.nonce), scope: 'once', resolvedBy: 'tap' });
    await h.settle();
    expect(ran).toEqual(['browser.submit']);
    const look = h.db.prepare("SELECT started_at FROM ai_turns WHERE purpose = 'second_look'").get() as { started_at: number };
    const submit = h.toolCalls().find((c) => c.tool === 'browser.submit')!;
    expect(look.started_at).toBeLessThanOrEqual(Number(submit.started_at));
  });
});
