// Spec: 08-2 §9.4.2 (immediately before executing, the engine re-reads the live price, slot, fee and recipient through a read
// tool; any difference from `fields` → SUPERSEDED + a new PENDING card), §9.7 `liveTermsCheck`, §10.4 (any amount, up or down),
// X-125 (after APPROVED, `book`: second look → liveTermsCheck → write-ahead), AT-038 (the no-show fee changes between card and
// submit → nothing is booked, a new card shows the new fee), §8.3.10 (a hand-back page is never read). M5 map fix 9: this reads
// the live fields from the job's page and calls M5's `checkLiveTerms`; there is no second check. The page is read whole (not the
// AI's snapshot diff, which leaves out text that did not change), in the engine only: nothing read here goes to the AI.
import type { Page } from 'playwright-core';
import type { ApprovalDraft, ApprovalFields } from '../../../shared/types';
import { labelledAmount } from '../../gate/afterApproved';
import { checkLiveTerms, type LiveTermsResult } from '../../gate/liveTerms';
import { pageFacts } from './submit';

export type LiveRead = { live: Partial<ApprovalFields>; check: LiveTermsResult } | 'none' | 'unreadable';

/** The evidenced money fields read again from `text` (the amount after the quote's label). */
export function liveFieldsFromText(text: string, draft: ApprovalDraft): Partial<ApprovalFields> | 'none' | 'unreadable' {
  const wanted = draft.evidence.filter((e) => e.field === 'amountPaise' || e.field === 'cancelTerms');
  if (!wanted.length) return 'none';
  const live: Partial<ApprovalFields> = {};
  for (const e of wanted) {
    const v = labelledAmount(text, e.quote);
    if (v === null) return 'unreadable';
    if (e.field === 'amountPaise') live.amountPaise = v;
    else if (draft.fields.cancelTerms) live.cancelTerms = { ...draft.fields.cancelTerms, feePaise: v };
  }
  return live;
}

/** Reads the job's page now and compares it with what the user approved. A missing, closed or hand-back page is unreadable. */
export async function readLiveTerms(page: Page | null, draft: ApprovalDraft, o: { handback(url: string): boolean }): Promise<LiveRead> {
  if (!page || page.isClosed() || o.handback(page.url())) return 'unreadable';
  const facts = await pageFacts(page);
  if (!facts) return 'unreadable';
  const live = liveFieldsFromText(facts.text, draft);
  if (live === 'none' || live === 'unreadable') return live;
  return { live, check: checkLiveTerms(draft.fields, live) };
}
