// Spec: 08-2 §9.4.2 (fresh terms check: immediately before creating a card and again immediately before executing, the
// engine re-reads the live price, slot, fee and recipient through a read tool; any difference from `fields` → the current
// approval SUPERSEDED + a new PENDING card), §9.7 (`liveTermsCheck(approval)` → `{ same, diff? }`), §10.4 (any amount, up
// or down, J10), 05-2 §5.5.4 (the superseded card names the term: price, time, recipient, fee), M5 map fix 9 (this pure
// `checkLiveTerms` is what M9's `engine/tools/browser/readLiveTerms.ts` calls). A term the read did not return is not a
// change: the caller decides what an unreadable read means (runnerGate: cannot check → HELD).
import type { ApprovalFields } from '../../shared/types';

export type LiveTerm = 'price' | 'time' | 'recipient' | 'fee';

export interface LiveTermsResult {
  same: boolean;
  /** The terms that changed, in the order the superseded card names one (price first). */
  changed: LiveTerm[];
  diff: Partial<Record<LiveTerm, { from: unknown; to: unknown }>>;
}

const ORDER: readonly LiveTerm[] = ['price', 'time', 'recipient', 'fee'];

const addresses = (f: Partial<ApprovalFields>): string | undefined =>
  f.recipients
    ?.map((r) => r.address.toLowerCase())
    .sort()
    .join(', ');

export function checkLiveTerms(approved: ApprovalFields, live: Partial<ApprovalFields>): LiveTermsResult {
  const diff: LiveTermsResult['diff'] = {};
  if (live.amountPaise !== undefined && live.amountPaise !== approved.amountPaise)
    diff.price = { from: approved.amountPaise ?? null, to: live.amountPaise };
  if (live.when && (live.when.start !== approved.when?.start || (live.when.end ?? null) !== (approved.when?.end ?? null)))
    diff.time = { from: approved.when?.start ?? null, to: live.when.start };
  if (live.recipients && addresses(live) !== addresses(approved))
    diff.recipient = { from: addresses(approved) ?? null, to: addresses(live) };
  else if (live.payee !== undefined && live.payee !== approved.payee) diff.recipient = { from: approved.payee ?? null, to: live.payee };
  const fee = live.cancelTerms;
  if (fee && (fee.feePaise !== approved.cancelTerms?.feePaise || fee.refundable !== approved.cancelTerms?.refundable))
    diff.fee = { from: approved.cancelTerms?.feePaise ?? null, to: fee.feePaise ?? null };
  const changed = ORDER.filter((k) => k in diff);
  return { same: changed.length === 0, changed, diff };
}
