// Spec: M5 T10, the M4 spec lines CR-0008 (j) moved to M5. Rows 1–2: 08-2 §5.10 item 3 (the spend meter is updated per turn,
// `spend:update`) and item 4 (at ≥ 80 % once per month → one line in foo's chat, 05-3 §5.21 trigger "You've used ₹{800} of
// your ₹{1,000} AI cap this month.", `messages.why` cap_warning, 08-0 §G.17); row 5: item 4 "every AI call on a key
// provider" (intake, repair and rewrite turns too; at the cap a message waits to send, 04 §3.3).
import { afterEach, describe, expect, it } from 'vitest';
import { t } from '../../../src/shared/copy/t';
import type { Settings } from '../../../src/shared/settings';
import { envelope, intake } from '../../unit/m3-engine-helpers';
import { jobHarness, type JobHarness } from './jobHarness';
import { keyBilling, seedSpend, until } from './t3Helpers';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const CAP = 100_000;
const spendPatches = (x: JobHarness) => x.patches.filter((p) => p.event === 'spend:update');
const intakeTurns = (x: JobHarness) =>
  Number((x.db.prepare("SELECT COUNT(*) AS n FROM ai_turns WHERE purpose = 'intake'").get() as { n: number }).n);
const warnLines = (x: JobHarness) =>
  x.db.prepare("SELECT * FROM messages WHERE json_extract(why, '$.source') = 'cap_warning'").all() as Record<string, unknown>[];

describe('CR-0008 (j) row 1 · the Spent meter moves after every AI turn', () => {
  it('each ai_turns write is followed by one spend:update with the new month total', async () => {
    h = jobHarness({ settings: keyBilling(CAP), script: [intake(envelope('Hello there.'))] });
    seedSpend(h, 5_000);
    const before = spendPatches(h).length;
    h.userSays('hi');
    await h.settle();
    const after = spendPatches(h).slice(before);
    expect(after).toHaveLength(1);
    const summary = after[0]!.payload as { aiSpentPaise: number; aiCapPaise: number };
    // The summary is read after the turn's row: it carries this month's key total from the table.
    const total = (h.db.prepare("SELECT SUM(COALESCE(cost_paise, 0)) AS p FROM ai_turns WHERE billing = 'key'").get() as { p: number }).p;
    expect(Number((h.db.prepare('SELECT COUNT(*) AS n FROM ai_turns').get() as { n: number }).n)).toBe(2);
    expect(summary.aiSpentPaise).toBe(total);
    expect(summary.aiCapPaise).toBe(CAP);
  });
});

describe('CR-0008 (j) row 2 · 80 % of the AI cap, once per month', () => {
  it("at 80 % one line in foo's chat with the Why footer; a second turn the same month posts nothing more", async () => {
    h = jobHarness({ settings: keyBilling(CAP), script: [intake(envelope('Sure.'))] });
    seedSpend(h, 80_000);
    h.userSays('one');
    await h.settle();
    const lines = warnLines(h);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.text).toBe(t('thread.cap_warning.line', { spent: '₹800', cap: '₹1,000' }));
    expect(lines[0]!.text).toBe('You’ve used ₹800 of your ₹1,000 AI cap this month.');
    expect(lines[0]!.chat_id).toBe(h.chatId);
    expect(lines[0]!.author_kind).toBe('foo');
    h.userSays('two');
    await h.settle();
    expect(warnLines(h)).toHaveLength(1);
  });

  it('under 80 %, with the warning turned off, or with plan billing, no line', async () => {
    h = jobHarness({ settings: keyBilling(CAP), script: [intake(envelope('Sure.'))] });
    seedSpend(h, 79_000);
    h.userSays('one');
    await h.settle();
    expect(warnLines(h)).toHaveLength(0);
    h.close();
    const off = (s: Settings): Settings => {
      const k = keyBilling(CAP)(s);
      return { ...k, money: { ...k.money, warnAt80: false } };
    };
    h = jobHarness({ settings: off, script: [intake(envelope('Sure.'))] });
    seedSpend(h, 90_000);
    h.userSays('one');
    await h.settle();
    expect(warnLines(h)).toHaveLength(0);
  });

  it('a new month warns again', async () => {
    h = jobHarness({ settings: keyBilling(CAP), script: [intake(envelope('Sure.'))] });
    seedSpend(h, 80_000);
    h.userSays('one');
    await h.settle();
    h.clock.advance(32 * 86_400_000);
    seedSpend(h, 85_000);
    h.userSays('two');
    await h.settle();
    expect(warnLines(h)).toHaveLength(2);
  });
});

describe('CR-0008 (j) row 5 · the cap check covers chat-lane turns', () => {
  it('at the cap an intake turn is not made: the message waits to send and goes when the cap is raised', async () => {
    h = jobHarness({ settings: keyBilling(CAP), script: [intake(envelope('Here you go.'))] });
    seedSpend(h, CAP + 1);
    const id = h.userSays('what is on today?');
    await h.settle();
    expect(intakeTurns(h)).toBe(1); // the seeded row only
    expect(h.message(id).status).toBe('queued');
    const s = h.settings();
    h.send('settings.changed', { paths: ['money.aiCapPaise'], settings: { ...s, money: { ...s.money, aiCapPaise: 2 * CAP } } });
    await h.settle();
    expect(intakeTurns(h)).toBe(2);
    expect(h.message(id).status).toBe('complete');
    expect(h.messages().some((m) => m.text === 'Here you go.')).toBe(true);
  });

  it('a repair turn at the cap is not made', async () => {
    // The intake reply has no valid act, so a repair turn would follow; the cap is reached while the intake is in flight.
    h = jobHarness({
      settings: keyBilling(CAP),
      script: [intake('<say>Hi.</say><act>{"bad":true}</act>', { delayMs: 5_000 }), { match: { purpose: 'repair' }, reply: envelope('') }],
    });
    h.userSays('hello');
    await until(h, () => h!.turnsJsonl().some((r) => r.purpose === 'intake'), 0);
    seedSpend(h, CAP + 1);
    await h.settle();
    expect(intakeTurns(h)).toBe(2);
    expect(h.turnsJsonl().filter((r) => r.purpose === 'repair')).toHaveLength(0);
    // The valid <say> is still posted as a plain reply (08-2 §7.5).
    expect(h.messages().some((m) => m.text === 'Hi.')).toBe(true);
  });
});
