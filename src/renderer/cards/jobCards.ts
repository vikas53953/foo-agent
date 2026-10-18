// Spec: 05-1 §5.2 Checklist (rows from the runner's `steps`: done / current / waiting / next / failed / stopped / took_over;
// the three phrase forms `next | running | done` of 08-4 §26.1, keys `cards.checklist.{key}.{form}`; max 6 rows, finished
// steps fold into "✓ {n} steps done · Show"; QUEUED is one row "Waiting for another job to finish"; right label live /
// Paused / Didn't finish; paused line by waiting reason; footer "{n} min · uses about ₹{x} of your AI", "under 1 min";
// summary "Done · {n} steps · {m} min"; `cards.state` live / done / done_unverified / failed / stopped), G-M4-06 ("Stopped by
// you" only for the user's stop reasons), 05-3 §5.12 Plan (1–12 steps; beyond 6 the first 5 + "…and {n} more · Show",
// X-131), §5.15 Proof chip variants (`cards.proof_chip.chip.{variant}`), §5.18.2 job link status words, §5.21 Spend cap
// ("Wait until {Sun 1 Nov}": the first day of the next month). Pure functions of the rows, so they are unit-tested; the
// components only draw what these return.
import { t } from '../../shared/copy/t';
import { phraseCopyKey, resolvePhrase, type PhraseForm } from '../../shared/phrases';
import type { AiStatus, CardRow, JobRow, ProofKind, StepRow, StopReason, WaitingReason } from '../../shared/types';

export type ChecklistRowState = 'done' | 'current' | 'waiting' | 'next' | 'failed' | 'stopped' | 'took_over';

export interface ChecklistLine {
  index: number;
  state: ChecklistRowState;
  /** The row's words: a phrase form of 08-4 §26.1, or a fixed row. */
  text: string;
}

export interface ChecklistView {
  /** Finished steps folded into the top row ("✓ {n} steps done · Show"); 0 when nothing is folded. */
  folded: number;
  lines: ChecklistLine[];
}

/** 05-1 §5.2.1: at most 6 rows visible. */
export const CHECKLIST_MAX_ROWS = 6;
/** 05-3 §5.12.1 / X-131: a plan of more than 6 steps shows the first 5 and "…and {n} more". */
export const PLAN_MAX_ROWS = 6;
export const PLAN_FOLDED_ROWS = 5;

const ROW_OF_STEP: Record<StepRow['state'], ChecklistRowState> = {
  done: 'done',
  skipped: 'done',
  running: 'current',
  waiting_user: 'waiting',
  pending: 'next',
  failed: 'failed',
};
const FORM_OF_ROW: Record<ChecklistRowState, PhraseForm> = {
  done: 'done',
  current: 'running',
  waiting: 'running',
  next: 'next',
  failed: 'running',
  stopped: 'done',
  took_over: 'done',
};

/** G-M4-06: the stop reasons that are the user's own (the row reads "Stopped by you"). */
export const USER_STOP_REASONS: readonly StopReason[] = ['user_word', 'user_button', 'stop_all', 'stuck_stop', 'window_closed'];

function phraseLine(step: StepRow, state: ChecklistRowState): ChecklistLine {
  const { key, slots } = resolvePhrase(step.phraseKey, step.slots);
  // 08-4 §26.1: runner-only keys have no `next` form; a not-started row of one falls back to generic_working.
  const form = FORM_OF_ROW[state];
  const own = phraseCopyKey(key, form);
  return { index: step.idx, state, text: own ? t(own, slots) : t(phraseCopyKey('generic_working', form)!) };
}

/** The rows the checklist draws for the job's steps (05-1 §5.2.2–§5.2.3). */
export function checklistView(job: Pick<JobRow, 'state' | 'stopReason'>, steps: readonly StepRow[], showAll = false): ChecklistView {
  if (job.state === 'queued') return { folded: 0, lines: [{ index: 0, state: 'next', text: t('cards.checklist.caption.queued') }] };
  const ordered = [...steps].sort((a, b) => a.idx - b.idx);
  // CANCELLED (05-1 §5.2 states): nothing runs any more, so a row the runner left running or waiting reads as not started.
  const stopped = job.state === 'cancelled';
  const rowOf = (st: StepRow['state']): ChecklistRowState => {
    const r = ROW_OF_STEP[st];
    return stopped && (r === 'current' || r === 'waiting') ? 'next' : r;
  };
  const lines = ordered.map((s) => phraseLine(s, rowOf(s.state)));
  if (job.state === 'cancelled' && USER_STOP_REASONS.includes(job.stopReason as StopReason))
    lines.push({ index: ordered.length, state: 'stopped', text: t(phraseCopyKey('stopped', 'done')!) });
  if (showAll || lines.length <= CHECKLIST_MAX_ROWS) return { folded: 0, lines };
  // Fold the finished rows at the top, as many as needed (one row goes to the fold itself).
  const finished = lines.findIndex((l) => l.state !== 'done');
  const leading = finished === -1 ? lines.length : finished;
  const fold = Math.min(leading, lines.length - (CHECKLIST_MAX_ROWS - 1));
  const shown = fold > 0 ? lines.slice(fold) : lines;
  // T5-11: still more than 6 rows (few steps finished): the last not-started rows wait below until rows fold; "Show"
  // (once a row has folded) or the job's details list them all. A current, failed or stopped row is never cut.
  const room = CHECKLIST_MAX_ROWS - (fold > 0 ? 1 : 0);
  while (shown.length > room) {
    const last = shown.map((l) => l.state).lastIndexOf('next');
    if (last === -1) break;
    shown.splice(last, 1);
  }
  return { folded: Math.max(fold, 0), lines: shown };
}

/** 05-3 §5.12.2 / 05-1 §0.5: a withdrawn Plan card. Only the 24 h no-answer timeout (`resolvedBy` auto) offers Start again. */
export function planWithdrawn(title: string, resolvedBy: CardRow['resolvedBy']): { text: string; startAgain: boolean } {
  return resolvedBy === 'auto'
    ? { text: t('cards.plan.summary.withdrawn', { title }), startAgain: true }
    : { text: t('cards.common.content.withdrawn'), startAgain: false };
}

/** 05-1 §5.2.2 right label. */
export function checklistRightLabel(state: JobRow['state']): string {
  if (state === 'waiting') return t('cards.checklist.right_label.paused');
  if (state === 'failed') return t('cards.checklist.right_label.failed');
  return t('cards.checklist.right_label.live');
}

/** 05-1 §5.2.2 "Paused: …" line by waiting reason; quit, shutdown and opening hours show no line (08-4 §26.10). */
export function pausedLine(reason: WaitingReason | null): string | null {
  switch (reason) {
    case 'ai_offline':
    case 'ai_down':
    case 'ai_signed_out':
    case 'ai_limit':
      return t('cards.checklist.paused.ai_down');
    case 'spend_cap':
      return t('cards.checklist.paused.spend_cap');
    case 'asleep':
      return t('cards.checklist.paused.asleep');
    case 'net_offline':
      return t('cards.checklist.paused.net_offline');
    default:
      return null;
  }
}

const MIN = 60_000;
/** Whole minutes between two times (05-1 §5.2.2 "n = whole minutes since WORKING"). */
export const wholeMinutes = (from: number, to: number) => Math.max(0, Math.floor((to - from) / MIN));

/** "{n} min" or "under 1 min". */
export function durationText(minutes: number): string {
  return minutes < 1 ? t('cards.checklist.duration.under_minute') : t('cards.checklist.duration.minutes', { n: minutes });
}

/**
 * 05-1 §5.2.2 footer text. Key billing: "{duration} · uses about {x} of your AI" with the metered spend. Plan-based AI
 * reports no percentage in M4 and local AI costs nothing, so those show the duration alone (implementation-notes "M4 T5").
 */
export function checklistFooter(
  job: Pick<JobRow, 'startedAt' | 'createdAt' | 'spentCostPaise'>,
  now: number,
  billing: AiStatus['billing'] | undefined,
): { duration: string; costPaise: number | null } {
  const duration = durationText(wholeMinutes(job.startedAt ?? job.createdAt, now));
  return { duration, costPaise: billing === 'key' ? job.spentCostPaise : null };
}

/** 05-1 §0.7 / §5.2.4 "step {k} of {n}": k is the current (or last finished) step, 1-based. */
export function stepOf(job: Pick<JobRow, 'currentStepIdx' | 'stepsDone' | 'stepCount'>): { k: number; n: number } {
  const n = job.stepCount;
  const k = job.currentStepIdx !== null ? job.currentStepIdx + 1 : Math.max(1, Math.min(n, job.stepsDone));
  return { k: Math.min(k, Math.max(n, 1)), n };
}

/** 05-3 §5.12.1: the plan steps shown, and how many are behind "…and {n} more". */
export function planRows(steps: readonly string[], showAll = false): { shown: string[]; more: number } {
  if (showAll || steps.length <= PLAN_MAX_ROWS) return { shown: [...steps], more: 0 };
  return { shown: steps.slice(0, PLAN_FOLDED_ROWS), more: steps.length - PLAN_FOLDED_ROWS };
}

/** 05-3 §5.18.2 status words of the job link card, from the runner's job state ("Working · step {k} of {n}"). */
export function jobLinkStatus(
  state: JobRow['state'],
  k: number,
  n: number,
): { tone: 'working' | 'needs_you' | 'done' | 'failed' | 'stopped'; text: string } {
  switch (state) {
    case 'needs_you':
      return { tone: 'needs_you', text: t('cards.job_link.status.needs_you') };
    case 'done':
    case 'done_unverified':
      return { tone: 'done', text: t('cards.job_link.status.done') };
    case 'failed':
      return { tone: 'failed', text: t('cards.job_link.status.failed') };
    case 'cancelled':
      return { tone: 'stopped', text: t('cards.job_link.status.stopped') };
    default:
      return { tone: 'working', text: t('cards.job_link.status.working', { k, n }) };
  }
}

/** 08-2 §5.8 Proof (the stored `jobs.proof`). */
export type Proof =
  | { kind: 'confirmation'; code: string; site: string; screenshot?: string; seenInToolCallId: string }
  | { kind: 'email'; connectionId: string; messageId: string; from: string; subject: string }
  | { kind: 'sent_folder'; connectionId: string; messageId: string }
  | { kind: 'wa_delivered'; waMessageId: string }
  | { kind: 'calendar_event'; eventId: string }
  | { kind: 'emails_read'; count: number; messageIds: string[] }
  | { kind: 'read_source'; source: string; count: number }
  | { kind: 'screenshot'; path: string; stepId: string }
  | { kind: 'receipt'; paymentId: string; ref: string; screenshot?: string };

/** An Indian Railways PNR is 10 digits (05-3 §5.15.2 "Proof: PNR {2134567890}"). */
const PNR = /^\d{10}$/;

/**
 * 05-3 §5.15.2: the chip words of a proof, or null for a kind 05 gives no chip words (calendar_event, emails_read: the
 * result text says it; implementation-notes "M4 T5"). A receipt shows its reference like a booking number.
 */
export function proofChip(proof: Proof): { state: ProofKind; text: string; number?: string } | null {
  switch (proof.kind) {
    case 'confirmation':
      return PNR.test(proof.code)
        ? { state: 'confirmation', text: t('cards.proof_chip.chip.pnr', { pnr: proof.code }), number: proof.code }
        : { state: 'confirmation', text: t('cards.proof_chip.chip.confirmation', { code: proof.code }), number: proof.code };
    case 'receipt':
      return { state: 'receipt', text: t('cards.proof_chip.chip.confirmation', { code: proof.ref }), number: proof.ref };
    case 'screenshot':
      return { state: 'screenshot', text: t('cards.proof_chip.chip.screenshot') };
    case 'email':
      return { state: 'email', text: t('cards.proof_chip.chip.email', { sender: proof.from }) };
    case 'sent_folder':
      return { state: 'sent_folder', text: t('cards.proof_chip.chip.sent_folder') };
    case 'wa_delivered':
      return { state: 'wa_delivered', text: t('cards.proof_chip.chip.wa_delivered') };
    case 'read_source':
      return { state: 'read_source', text: t('cards.proof_chip.chip.read_source', { source: proof.source, n: proof.count }) };
    default:
      return null;
  }
}

/** A stored `jobs.proof` value is a Proof only when it carries a known kind. */
export function asProof(v: unknown): Proof | null {
  const kinds = [
    'confirmation',
    'email',
    'sent_folder',
    'wa_delivered',
    'calendar_event',
    'emails_read',
    'read_source',
    'screenshot',
    'receipt',
  ];
  return v && typeof v === 'object' && kinds.includes(String((v as { kind?: unknown }).kind)) ? (v as Proof) : null;
}

/** 05-3 §5.21 "Wait until {Sun 1 Nov}": local midnight of the first day of the next month, in the user's time zone. */
export function nextMonthStart(now: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: 'numeric' }).formatToParts(now);
  const y = Number(parts.find((p) => p.type === 'year')!.value);
  const m = Number(parts.find((p) => p.type === 'month')!.value);
  const guess = Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1);
  // Shift by the zone's offset at that instant so the result is 00:00 local time.
  const local = new Date(new Date(guess).toLocaleString('en-US', { timeZone })).getTime();
  const utc = new Date(new Date(guess).toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  return guess - (local - utc);
}

/** 08-0 §A.2 `money.aiCapPaise` ceiling (₹1,00,000) and C-21's step above the current cap (₹100). */
export const AI_CAP_MAX_PAISE = 10_000_000;
export const AI_CAP_STEP_PAISE = 10_000;

export type CapCheck = { ok: true; paise: number } | { ok: false; error: 'empty' | 'nan' | 'min' | 'max' };

/** C-21 field rule: whole rupees ("1500", "1,500", "₹1,500"); at least current + ₹100; at most ₹1,00,000. */
export function checkNewCap(text: string, currentPaise: number): CapCheck {
  const s = text.replace(/[₹,\s]/g, '');
  if (!s) return { ok: false, error: 'empty' };
  if (!/^\d{1,9}$/.test(s)) return { ok: false, error: 'nan' };
  const paise = Number(s) * 100;
  if (paise > AI_CAP_MAX_PAISE) return { ok: false, error: 'max' };
  if (paise < currentPaise + AI_CAP_STEP_PAISE) return { ok: false, error: 'min' };
  return { ok: true, paise };
}
