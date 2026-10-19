// 11-fidelity §11.5 FID-17 (random walks, fast-check), approval half: random sequences of taps, engine requests, clock jumps
// and job stops drive main's real ApprovalGate (08-2 §9.1, §9.7) over SQLite. Invariants after every step (scripts/
// extract-sm.ts approval invariants): at most one RUNNING per approval id, ever (RUNNING is written ahead of the one
// irreversible call and never re-entered, Art. 7); no approval leaves PENDING (or HELD) for APPROVED / DECLINED without a tap
// or key on its card (Art. 3, 6; X-04: the engine can never approve); the card always mirrors the approvals row
// (08-1 §4.5.1); a final state is never left (07-2 §5).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { APPROVAL_STATES, APPROVAL_TERMINAL } from '../../../src/shared/approvalMachine';
import type { ApprovalScope, ApprovalState } from '../../../src/shared/types';
import { gateHarness, T0 } from '../../unit/approvals/gateHarness';

const NUM_RUNS = Number(process.env.FID17_RUNS ?? 300);

type Act =
  | { k: 'approve'; scope: ApprovalScope; stale: boolean }
  | { k: 'decline'; stale: boolean }
  | { k: 'held'; option: 'action' | 'own' }
  | { k: 'engine'; to: ApprovalState }
  | { k: 'clock'; minutes: number }
  | { k: 'stop' }
  | { k: 'askAgain' };

const act: fc.Arbitrary<Act> = fc.oneof(
  fc.record({ k: fc.constant('approve' as const), scope: fc.constantFrom<ApprovalScope>('once', 'chat', 'always'), stale: fc.boolean() }),
  fc.record({ k: fc.constant('decline' as const), stale: fc.boolean() }),
  fc.record({ k: fc.constant('held' as const), option: fc.constantFrom('action' as const, 'own' as const) }),
  fc.record({ k: fc.constant('engine' as const), to: fc.constantFrom(...APPROVAL_STATES) }),
  fc.record({ k: fc.constant('clock' as const), minutes: fc.integer({ min: 0, max: 20 }) }),
  fc.record({ k: fc.constant('stop' as const) }),
  fc.record({ k: fc.constant('askAgain' as const) }),
);

describe('FID-17 · approval random walks (main ApprovalGate)', () => {
  it(`${NUM_RUNS} random walks: ≤ 1 RUNNING per approval id, no approve or decline without a tap, card mirrors the row`, () => {
    fc.assert(
      fc.property(
        fc.constantFrom('book', 'delete', 'use_app') as fc.Arbitrary<'book' | 'delete' | 'use_app'>,
        fc.array(act, { maxLength: 30 }),
        (verb, acts) => {
          const h = gateHarness();
          const o = h.open({ verb, hardLimit: verb !== 'use_app' });
          let state: ApprovalState = 'PENDING';
          let running = 0;
          for (const a of acts) {
            const tap = { cardId: o.cardId, nonce: o.nonce, resolvedBy: 'tap' as const };
            const stale = { ...tap, nonce: 'f'.repeat(32) };
            let tapped = false;
            switch (a.k) {
              case 'approve':
                tapped = h.gate.approve({ ...(a.stale ? stale : tap), scope: a.scope }).ok;
                break;
              case 'decline':
                tapped = h.gate.decline(a.stale ? stale : tap).ok;
                break;
              case 'held':
                tapped = h.gate.heldPick({ ...tap, optionId: a.option }).ok;
                break;
              case 'engine':
                h.gate.transition(o.approvalId, a.to);
                break;
              case 'clock':
                h.clock.now += a.minutes * 60_000;
                h.gate.expireTick();
                break;
              case 'stop':
                h.db.prepare("UPDATE jobs SET state = 'cancelled', finished_at = ? WHERE id = ? AND state = 'needs_you'").run(T0, h.jobId);
                h.gate.expireTick();
                break;
              case 'askAgain':
                h.gate.askAgain({ cardId: o.cardId });
                break;
            }
            const next = h.approval(o.approvalId).state as ApprovalState;
            if (next !== state) {
              if (APPROVAL_TERMINAL.has(state)) throw new Error(`left final ${state} for ${next}`);
              const userMove = (state === 'PENDING' || state === 'HELD') && (next === 'APPROVED' || next === 'DECLINED');
              if (userMove && !tapped) throw new Error(`${state} → ${next} without a tap (${a.k})`);
              if (next === 'RUNNING') running += 1;
              state = next;
            }
            expect(running).toBeLessThanOrEqual(1);
            expect(h.card(o.cardId).state).toBe(state);
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  }, 60_000);
});
