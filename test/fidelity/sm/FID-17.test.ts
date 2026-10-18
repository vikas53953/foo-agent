// 11-fidelity §11.5 FID-17 (random walks, fast-check): random event sequences with the fake clock, checking invariants after
// every step: never WORKING after CANCELLED/FAILED/DONE; DONE only with a proof or "⚠ Not checked live" (done_unverified);
// the badge always equals the runner's state (BADGE_OF_STATE). Every push runs 1,000 machine walks; the runner walks drive
// the real JobRunner through random AI decisions. The approval invariants (one charge per approval id, no approval leaves
// PENDING without a tap) arrive with M5.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { BADGE_OF_STATE, canTransition, JOB_EVENTS, nextState, TERMINAL, type JobEvent } from '../../../src/shared/jobMachine';
import type { JobState } from '../../../src/shared/types';
import { badgeSets, jobHarness, jobIntake, step, tool, type PlanStepIn } from '../../integration/jobs/jobHarness';
import type { FakeLineIn } from '../../unit/m3-engine-helpers';

const EVENTS = Object.keys(JOB_EVENTS) as JobEvent[];
const NUM_RUNS = Number(process.env.FID17_RUNS ?? 1_000);

describe('FID-17 · job machine random walks', () => {
  it(`${NUM_RUNS} random event sequences keep the invariants`, () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...EVENTS), { maxLength: 40 }), (events) => {
        let state: JobState = 'queued';
        let ended = false;
        for (const e of events) {
          const to = nextState(state, e);
          // undefined = not allowed; null = allowed and the state stays (retry makes a new linked job, AT-120).
          if (to === undefined || to === null) continue;
          expect(canTransition(state, to)).toBe(true);
          if (ended) throw new Error(`${state} × ${e} → ${to} after a final state`);
          state = to;
          if (TERMINAL.has(state)) ended = true;
          expect(BADGE_OF_STATE[state]).toBeDefined();
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

type Move = 'toolOk' | 'toolBlocked' | 'ask' | 'doneNoProof' | 'doneProof' | 'doneBadProof' | 'doneUnverified' | 'fail';
const MOVES: Move[] = ['toolOk', 'toolBlocked', 'ask', 'doneNoProof', 'doneProof', 'doneBadProof', 'doneUnverified', 'fail'];
const PLAN: PlanStepIn[] = [{ phraseKey: 'check_site', slots: { site: 'stay.example' } }, { phraseKey: 'find_proof' }];
const proof = (code: string) => ({ kind: 'confirmation', code, site: 'stay.example', seenInToolCallId: 'tc_000001' });

function line(m: Move): FakeLineIn {
  switch (m) {
    case 'toolOk':
      return tool('fake.site', { site: 'stay.example' }, { delayMs: 400 });
    case 'toolBlocked':
      return tool('fake.site', { site: 'blocked.example' }, { delayMs: 400 });
    case 'ask':
      return step({ kind: 'ask', card: { question: 'Which one?', options: [{ label: 'A' }, { label: 'B' }] } }, { delayMs: 400 });
    case 'doneNoProof':
      return step({ kind: 'done', result: 'All done!' });
    case 'doneProof':
      return step({ kind: 'done', result: 'Booked. Reference ABC123.', proof: proof('ABC123') });
    case 'doneBadProof':
      return step({ kind: 'done', result: 'Booked.', proof: proof('ZZZ999') });
    case 'doneUnverified':
      return step({ kind: 'done', result: 'Could not check.', unverified: true });
    case 'fail':
      return step({ kind: 'fail', reason: 'Blocked.' });
  }
}

describe('FID-17 · runner random walks', () => {
  it('random AI decisions: never moves after a final state; DONE only with a checked proof; badge = state', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.constantFrom(...MOVES), { minLength: 1, maxLength: 6 }), async (moves) => {
        const h = jobHarness({ tools: { blockedSites: ['blocked.example'] }, script: [jobIntake(PLAN), ...moves.map(line)] });
        try {
          const userId = h.userSays('Book the stay');
          await h.settle();
          for (let i = 0; i < 8 && h.job().state === 'needs_you'; i++) {
            // The open card: a choice gets its first option; a stuck card (3 failures, T3) gets Stop.
            const card = h.cards().find((c) => c.id === h.job().needs_you_card_id)!;
            h.answer(String(card.id), card.type === 'stuck' ? 'stop' : 'o1');
            await h.settle();
          }
          const job = h.job();
          const id = job.id;
          // Every move the runner made on this job, in order: none after a final state, each allowed.
          let at: JobState = 'queued';
          for (const op of h.txs.filter((t) => t.ok).flatMap((t) => t.ops))
            if (op.op === 'transition' && op.id === id) {
              const to = (op as { to: JobState }).to;
              expect(TERMINAL.has(at), `${at} → ${to}`).toBe(false);
              expect(canTransition(at, to)).toBe(true);
              at = to;
            }
          expect(at).toBe(job.state);
          if (job.state === 'done') expect(JSON.parse(String(job.proof))).toMatchObject({ kind: 'confirmation', code: 'ABC123' });
          if (job.state === 'done_unverified') expect(job.proof).toBeNull();
          expect(h.messages().some((m) => m.text === 'All done!')).toBe(false);
          const badges = badgeSets(h, userId);
          expect(badges.at(-1)).toBe(BADGE_OF_STATE[job.state as JobState]);
          expect(h.message(userId).badge).toBe(BADGE_OF_STATE[job.state as JobState]);
        } finally {
          h.close();
        }
      }),
      { numRuns: Number(process.env.FID17_RUNNER_RUNS ?? 60) },
    );
  }, 60_000);
});
