// Spec: 08-2 §9.6 (the second look in a job: user's words, the AI check on the PRIMARY provider only, fail closed), §9.4.2
// (fresh terms re-read through a read tool right before executing), 08-4 §28.3 (`userWords` by `job.origin`), §28.5 (primary
// only, cheap model; primary unavailable → cannot_check even with a verified backup), §24.7 / §25.4 (prompt and act), 08-2
// §7.5 (one repair turn; invalid twice → cannot_check), 08-4 §26.3 (the cap check before a key call), X-125 (after APPROVED:
// second look → liveTermsCheck → write-ahead). The runner glue of `secondLook.ts` and `liveTerms.ts`.
// implementation-notes M5-T8: origins other than `user` (routine, brief, handoff, retry) read the chat's user messages of the
// last 30 min until M7 / M12 give their own texts; the live re-read covers the evidenced total and fee (the read tool of
// their evidence, run again); a draft with no money evidence (or one read back after a restart) has nothing to re-read, and
// M9's `readLiveTerms` replaces this read.
import { estimateCallPaise } from '../jobs/costMeter';
import type { RunnerCore } from '../jobs/JobRunner';
import type { SecondLookAct } from '../../shared/schemas';
import type { ApprovalDraft, ApprovalFields, JobRow } from '../../shared/types';
import type { ToolLayer, ToolJob } from '../tools/ToolLayer';
import type { TurnResult } from '../ai/types';
import { amountIn } from './requestApproval';

const WINDOW_MS = 30 * 60_000;
const SCAN = 50;

interface MessageLite {
  authorKind: string;
  text: string;
  createdAt: number;
}

/** 08-4 §28.3: only the user's own words for this job, oldest first. */
export async function userWordsFor(core: RunnerCore, job: JobRow): Promise<{ at: number; text: string }[]> {
  const now = core.d.clock.now();
  const since = job.origin === 'user' ? job.createdAt - WINDOW_MS : now - WINDOW_MS;
  const chats = [...new Set([job.originChatId, job.chatId])];
  const out: { at: number; text: string }[] = [];
  for (const c of chats) {
    const rows = (await core.query<MessageLite[]>('messagesBefore', c, null, SCAN)) ?? [];
    for (const m of rows) if (m.authorKind === 'user' && m.createdAt >= since && m.text.trim()) out.push({ at: m.createdAt, text: m.text });
  }
  return out.sort((a, b) => a.at - b.at);
}

/**
 * Step B on the primary only (§28.5): one turn; one repair (§7.5) only when the act was invalid. A timeout, an error or a
 * refused cost goes straight to 'cannot_check' (M5 T8 review 6).
 */
export async function askSecondLook(
  core: RunnerCore,
  job: JobRow,
  p: { userWords: string[]; actionJson: string },
  signal: AbortSignal,
): Promise<SecondLookAct | 'cannot_check'> {
  const d = core.d;
  const pick = d.ai.pick();
  if (!pick || pick.backup || !d.prompts.buildSecondLook || !d.prompts.parseSecondLook) return 'cannot_check';
  const built = d.prompts.buildSecondLook(p.userWords, p.actionJson);
  const params = d.ai.turnParams(pick.providerId, 'second_look');
  const run = async (prompt: string): Promise<SecondLookAct | 'invalid' | 'cannot_check'> => {
    const est = estimateCallPaise(built.system.length + prompt.length, params.maxOutputTokens, d.rateOf(pick.providerId), d.usdToInr);
    if (!(await core.cost.allows(est))) return 'cannot_check';
    const turnId = d.newId('t');
    const startedAt = d.clock.now();
    let r: TurnResult;
    try {
      r = await d.ai.runTurn(
        pick.providerId,
        { ...params, turnId, purpose: 'second_look', system: built.system, prompt, chatId: job.chatId },
        { onText: () => {}, onSession: () => {} },
        signal,
      );
    } catch {
      r = {
        text: '',
        usage: { tokensIn: null, tokensOut: null, cacheRead: null, cacheWrite: null, costUsd: null },
        stopReason: 'error',
        errorKind: 'UNKNOWN',
      };
    }
    await core.recordTurn(job, pick, turnId, 'second_look', startedAt, r);
    if (r.stopReason !== 'end') return 'cannot_check';
    return d.prompts.parseSecondLook!(r.text) ?? 'invalid';
  };
  const first = await run(built.prompt);
  if (first !== 'invalid') return first;
  const again = await run(`${built.prompt}\n\n${d.prompts.buildRepair('The <act> block was not a valid SecondLookAct')}`);
  return again === 'invalid' ? 'cannot_check' : again;
}

interface CallLite {
  id: string;
  tool: string;
  args: unknown;
}

/** The ₹ amount after the quote's label in a fresh result ("Total ₹2,400" → the amount after "Total"). */
export function labelledAmount(text: string, quote: string): number | null {
  const label = quote.slice(0, Math.max(0, quote.indexOf('₹'))).trim();
  if (!label) return amountIn(text);
  const esc = label.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const m = new RegExp(`${esc}\\s*(₹\\s?\\d[\\d,]*(?:\\.\\d{1,2})?)`, 'u').exec(text);
  return m ? amountIn(m[1]!) : null;
}

/**
 * 08-2 §9.4.2 right before executing: the evidenced total and fee read again by running their read tool again. 'none' when
 * the draft carries no money evidence (nothing to re-read); 'unreadable' when the read failed or no longer shows the value.
 */
export async function readLiveTerms(
  core: RunnerCore,
  tools: ToolLayer,
  job: ToolJob,
  draft: ApprovalDraft,
  signal: AbortSignal,
): Promise<Partial<ApprovalFields> | 'none' | 'unreadable'> {
  const wanted = draft.evidence.filter((e) => e.field === 'amountPaise' || e.field === 'cancelTerms');
  if (!wanted.length) return 'none';
  const calls = (await core.query<CallLite[]>('toolCallsForJob', job.id)) ?? [];
  const live: Partial<ApprovalFields> = {};
  const fresh = new Map<string, string | null>();
  for (const e of wanted) {
    const src = calls.find((c) => c.id === e.toolCallId);
    if (!src) return 'unreadable';
    if (!fresh.has(src.id)) {
      const r = await tools.reread(job, { tool: src.tool, args: (src.args ?? {}) as Record<string, unknown> }, signal);
      fresh.set(src.id, r.outcome === 'ok' ? JSON.stringify(r.result ?? null) : null);
    }
    const text = fresh.get(src.id);
    if (text === null || text === undefined) return 'unreadable';
    const v = labelledAmount(text, e.quote);
    if (v === null) return 'unreadable';
    if (e.field === 'amountPaise') live.amountPaise = v;
    else if (draft.fields.cancelTerms) live.cancelTerms = { ...draft.fields.cancelTerms, feePaise: v };
  }
  return live;
}
