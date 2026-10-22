// Spec: 08-4 §24.1 purpose `classify` (protocol.md + the purpose file; cheap model, §30.1), §24.13 (stuck.md), §24.13a
// (steer_check.md, CR-0045), 08-2 §5.10 item 4 (the pre-call cap check), §5.11 (every turn recorded in ai_turns). One
// small turn for a job; null when no AI is ready, the cap refuses it, it throws, or it ends any way but `end`.
import type { JobRow } from '../../shared/types';
import type { TurnResult } from '../ai/types';
import { estimateCallPaise } from './costMeter';
import type { RunnerCore } from './JobRunner';

export async function classifyTurn(core: RunnerCore, job: JobRow, built: { system: string; prompt: string }): Promise<string | null> {
  const d = core.d;
  const pick = d.ai.pick();
  if (!pick) return null;
  const params = d.ai.turnParams(pick.providerId, 'classify');
  const est = estimateCallPaise(built.system.length + built.prompt.length, params.maxOutputTokens, d.rateOf(pick.providerId), d.usdToInr);
  if (!(await core.cost.allows(est))) return null;
  const turnId = d.newId('t');
  const startedAt = d.clock.now();
  let r: TurnResult;
  try {
    r = await d.ai.runTurn(
      pick.providerId,
      { ...params, turnId, purpose: 'classify', system: built.system, prompt: built.prompt, chatId: job.chatId },
      { onText: () => {}, onSession: () => {} },
      new AbortController().signal,
    );
  } catch {
    d.log('job.classify_turn_threw', 'UNKNOWN', { jobId: job.id, chatId: job.chatId });
    r = {
      text: '',
      usage: { tokensIn: null, tokensOut: null, cacheRead: null, cacheWrite: null, costUsd: null },
      stopReason: 'error',
      errorKind: 'UNKNOWN',
    };
  }
  await core.recordTurn(job, pick, turnId, 'classify', startedAt, r);
  return r.stopReason === 'end' ? r.text : null;
}
