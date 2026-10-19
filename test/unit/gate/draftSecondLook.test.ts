// Spec: 08-2 §9.6 (the second look before every send, a Draft's included; only the user's own words; a recipient on the
// outgoing call that is not the card's → HELD(mismatch); no user words → HELD(no_user_words); primary unavailable →
// HELD(cannot_check), fail closed), 08-3 §16.1 (the look reads the card text). M5 T14 (CR-0009 G-M5-39 (b)): the engine's
// half of main's `draft.secondLook`.
import { describe, expect, it } from 'vitest';
import { draftSecondLook } from '../../../src/engine/gate/draftSecondLook';
import type { RunnerCore } from '../../../src/engine/jobs/JobRunner';
import { FakeClock } from '../../../src/shared/clock';
import type { ApprovalFields } from '../../../src/shared/types';

const NOW = Date.UTC(2026, 9, 19, 6, 0);
const FIELDS: ApprovalFields = {
  verb: 'send',
  channel: 'email',
  recipients: [{ name: 'Rakesh Sharma', address: 'r.sharma@example.com', isNew: false, isGroup: false }],
  contentSummary: 'Re: October rent',
  irreversible: true,
};

/** Just what the look reads: main's approval row, the job, the chat's user messages, the clock, the AI's primary. */
function core(o: { words?: string[]; approval?: boolean; primary?: boolean } = {}) {
  const prompts: unknown[] = [];
  const clock = new FakeClock(NOW);
  const c = {
    d: {
      clock,
      ai: {
        pick: () => (o.primary === false ? null : { providerId: 'claude', backup: false }),
        turnParams: () => ({ maxOutputTokens: 200 }),
      },
      rateOf: () => null,
      usdToInr: 1,
      prompts: {
        buildSecondLook: (userWords: string[], actionJson: string) => {
          prompts.push({ userWords, actionJson });
          return { system: '', prompt: '' };
        },
        parseSecondLook: () => null,
      },
    },
    query: (q: string) =>
      Promise.resolve(
        q === 'approvals.byId'
          ? o.approval === false
            ? null
            : { jobId: 'j_1', fields: FIELDS }
          : (o.words ?? []).map((text, i) => ({ authorKind: 'user', text, createdAt: NOW - 60_000 + i })),
      ),
    // The cap refuses the call, so the look ends cannot_check right after building its prompt.
    cost: { allows: () => Promise.resolve(false) },
    job: () => Promise.resolve({ id: 'j_1', origin: 'user', createdAt: NOW - 120_000, chatId: 'c_1', originChatId: 'c_1' }),
  };
  return { core: c as unknown as RunnerCore, prompts, clock };
}

const req = {
  approvalId: 'ap_1',
  content: 'Re: October rent\nHi Rakesh, I’ll pay on Tuesday 20 Oct.',
  recipients: ['r.sharma@example.com'],
};

describe('draft.secondLook (08-2 §9.6 on a Draft send, G-M5-39 (b))', () => {
  it('an address on the outgoing send that the card does not show → HELD(mismatch) with no AI turn', async () => {
    const { core: c, prompts } = core({ words: ['Email Rakesh that I’ll pay the rent on Monday'] });
    const out = await draftSecondLook(c, 'Asia/Kolkata', { ...req, recipients: ['someone@example.net'] });
    expect(out).toMatchObject({ pass: false, held: { reason: 'mismatch', actionHas: 's***@example.net' } });
    expect(prompts).toEqual([]);
  });

  it('the AI check reads the whole card text, not the 140-character summary, and the user’s own words', async () => {
    const { core: c, prompts, clock } = core({ words: ['Email Rakesh that I’ll pay the rent on Monday'] });
    expect(await draftSecondLook(c, 'Asia/Kolkata', req)).toMatchObject({ pass: false, held: { reason: 'cannot_check' } });
    // The 60 s cap on the AI turn is cleared once the look answers.
    expect(clock.pendingTimers).toBe(0);
    expect(prompts).toHaveLength(1);
    const p = prompts[0] as { userWords: string[]; actionJson: string };
    expect(JSON.parse(p.actionJson).contentSummary).toBe(req.content);
    expect(p.userWords.join('\n')).toContain('pay the rent on Monday');
  });

  it('no user words → HELD(no_user_words); no AI → HELD(cannot_check, sending); no approval row → cannot_check', async () => {
    expect(await draftSecondLook(core().core, 'Asia/Kolkata', req)).toMatchObject({ pass: false, held: { reason: 'no_user_words' } });
    expect(await draftSecondLook(core({ words: ['pay on Monday'], primary: false }).core, 'Asia/Kolkata', req)).toMatchObject({
      pass: false,
      held: { reason: 'cannot_check', verbing: 'sending' },
    });
    expect(await draftSecondLook(core({ approval: false }).core, 'Asia/Kolkata', req)).toEqual({
      pass: false,
      held: { reason: 'cannot_check', verbing: 'sending' },
    });
  });
});
