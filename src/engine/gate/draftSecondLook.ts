// Spec: 08-2 §9.6 (the second look runs right before every `send`, a Draft's Send tap included; ONLY the user's own words;
// A deterministic checks, B the AI check on the primary, fail closed), 08-0 §G.7 and 08-3 §16.1 (a Draft send: approve once
// → 5 s undo → the second look on the card text → Gmail drafts.send), 05-2 §5.7.2 (HELD: "Before I send this, one check:
// you said {Monday}, the draft says {Tuesday 20 Oct}. Which one?"), Art. 10. M5 T14 (CR-0009 G-M5-39 (b)): main's Draft tick
// asks the engine (`draft.secondLook`) because the AI and the job's words live here; main acts on the answer.
import type { ApprovalFields, SecondLookResult } from '../../shared/types';
import type { RunnerCore } from '../jobs/JobRunner';
import { askSecondLook, userWordsFor } from './afterApproved';
import { secondLook, verbingOf, type Held } from './secondLook';

export interface DraftLookReq {
  approvalId: string;
  /** The card text main is about to send: subject and body, redacted (08-3 §16.1 "the second look on the card text"). */
  content: string;
  /** The addresses on the outgoing Gmail send. */
  recipients: string[];
}
/** Main waits 60 s for the answer (draftIpc LOOK_TIMEOUT_MS); the AI turn stops at the same cap so a late turn frees its slot. */
export const DRAFT_LOOK_TIMEOUT_MS = 60_000;

export type DraftLookAnswer = { pass: true; result: SecondLookResult } | { pass: false; result?: SecondLookResult; held: Held };

interface ApprovalLite {
  jobId: string;
  fields: ApprovalFields;
}

export async function draftSecondLook(core: RunnerCore, timeZone: string, req: DraftLookReq): Promise<DraftLookAnswer> {
  const cannot: DraftLookAnswer = { pass: false, held: { reason: 'cannot_check', verbing: verbingOf('send') } };
  const a = await core.query<ApprovalLite | null>('approvals.byId', req.approvalId);
  const job = a ? await core.job(a.jobId) : null;
  if (!a || !job) return cannot;
  const ctl = new AbortController();
  const timer = core.d.clock.setTimeout(() => ctl.abort(), DRAFT_LOOK_TIMEOUT_MS);
  const out = await secondLook({
    fields: { ...a.fields, contentSummary: req.content },
    userWords: await userWordsFor(core, job),
    timeZone,
    now: core.d.clock.now(),
    live: { recipients: req.recipients },
    askAi: (p) => askSecondLook(core, job, p, ctl.signal),
  }).finally(() => core.d.clock.clearTimeout(timer));
  return out.pass ? { pass: true, result: out.result } : { pass: false, result: out.result, held: out.held };
}
