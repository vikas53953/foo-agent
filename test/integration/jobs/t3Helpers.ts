// Shared bits for the M4 T3 runner tests (stop, steer, stuck, caps): waiting on the fake clock, key billing with a seeded
// month spend (the fake adapter prices nothing, so a spend row stands in for earlier key turns), raw activity rows, and the
// StuckAct reply of the classify turn. 08-2 §5.5–§5.7, §5.10; 08-4 §25.4.
import { realPause, verified } from './jobHarness';
import type { JobHarness } from './jobHarness';
import type { FakeLineIn } from '../../unit/m3-engine-helpers';
import { TEST_EPOCH_MS } from '../../../src/shared/clock';
import type { Settings } from '../../../src/shared/settings';

/** Lets the engine work, advancing the fake clock `stepMs` per round, until `cond` holds. */
export async function until(h: JobHarness, cond: () => boolean, stepMs = 100, rounds = 2_000): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await realPause(3);
    if (cond()) return;
    h.clock.advance(stepMs);
  }
  throw new Error('condition never held');
}

/** Lets queued engine work run without moving the clock. */
export async function flush(rounds = 30): Promise<void> {
  await realPause(rounds);
}

/** The chosen AI is an API key (metered) and verified: the "key billing" world of 08-2 §5.10. */
export function keyBilling(capPaise = 100_000) {
  return (s: Settings): Settings => {
    const v = verified('anthropic-key')(s);
    return {
      ...v,
      money: { ...v.money, aiCapPaise: capPaise },
      ai: {
        ...v.ai,
        providers: { ...v.ai.providers, 'anthropic-key': { kind: 'key', lastVerifiedAt: TEST_EPOCH_MS - 60_000, lastVerifyOk: true } },
      },
    };
  };
}

/** Key AI spend already this month (one ai_turns row, billing 'key'). */
export function seedSpend(h: JobHarness, paise: number, at = h.clock.now()): void {
  h.db
    .prepare(
      `INSERT INTO ai_turns (id, chat_id, purpose, provider_id, cost_paise, cost_source, billing, outcome, started_at)
       VALUES (?, ?, 'intake', 'anthropic-key', ?, 'reported', 'key', 'ok', ?)`,
    )
    .run(`t_seed_${at}_${paise}`, h.chatId, paise, at);
}

/** An action already done for the job (M5/M8 write these; the stop report reads them). */
export function seedActivity(h: JobHarness, jobId: string, summary: string, at = h.clock.now()): void {
  h.db
    .prepare(
      `INSERT INTO activity (id, at, kind, event, actor, chat_id, job_id, summary, outcome)
       VALUES (?, ?, 'sent', 'sent_email', 'foo', ?, ?, ?, 'done')`,
    )
    .run(`act_seed_${at}`, at, h.chatId, jobId, summary);
}

/** The classify turn's reply (08-4 §25.4 StuckAct). */
export const stuckLine = (whatsWrong: string): FakeLineIn => ({
  match: { purpose: 'classify' },
  reply: `<say></say><act>${JSON.stringify({ whatsWrong })}</act>`,
});

/** Step turns started (ai_turns rows of purpose 'step') at or after `from`. */
export function stepTurnsSince(h: JobHarness, from: number): number {
  return (h.db.prepare("SELECT COUNT(*) AS n FROM ai_turns WHERE purpose = 'step' AND started_at >= ?").get(from) as { n: number }).n;
}

/** foo's text messages in the harness chat, oldest first. */
export function fooTexts(h: JobHarness, chatId = h.chatId): string[] {
  return (
    h.db.prepare("SELECT text FROM messages WHERE chat_id = ? AND author_kind = 'foo' AND kind = 'text' ORDER BY seq").all(chatId) as {
      text: string;
    }[]
  ).map((r) => r.text);
}
