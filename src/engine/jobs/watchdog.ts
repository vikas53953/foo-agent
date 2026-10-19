// Spec: 08-2 §5.6 (a watchdog every 5 s for each WORKING job; slow = no step finished for 60 s, badge stays 🛠 with the
// tooltip, never ⏳; stuck: no progress 180 s of WORKING time, fail_streak ≥ 3, cost > 2 × estimate, the same normalised URL
// 5 × in a row; stuck card while the job waits on the user, badge ⏳; Stop → cancelled stuck_stop; "Try another way" →
// stuck_count++, counters reset, ROUTE_EXCLUDE; stuck_count ≥ 2 → only [ Take over ] [ Stop ]; no answer in 15 min →
// FAILED), 08-4 §26.3 items 5–6 (unreported usage; budget and time ceilings, never reset by "Try another way"; a second
// budget/time card offers only [ Take over ] [ Stop ]), §26.4 (card texts: one classify turn with stuck.md over the last 5
// redacted results, fallback; "What I'd do" from facts; spent line; Stop and the 15 min timeout), §24.21 classify layout,
// §24.22 (part 8 `Avoid:`), 07-2 SM-A2 / SM-A11, X-80, 05-3 §5.19 (payload), AT-084, AT-116, AT-116a, ART-12b, ART-13c.
import { t } from '../../shared/copy/t';
import { formatInr } from '../../shared/format';
import type { CardRow, JobRow, StepRow } from '../../shared/types';
import type { TurnResult } from '../ai/types';
import type { DbOp } from '../protocol';
import { estimateCallPaise } from './costMeter';
import type { RunnerCore } from './JobRunner';
import type { StopFlow } from './stopFlow';

export const WATCHDOG_MS = 5_000;
export const SLOW_MS = 60_000;
export const NO_PROGRESS_MS = 180_000;
/** 08-4 §26.4 item 4: an unanswered stuck card fails the job after 15 min. */
export const STUCK_ANSWER_MS = 15 * 60_000;
const FAIL_STREAK = 3;
const URL_LOOP = 5;
const MAX_STEP_TURNS = 60;
const MAX_CALLS_STEP = 25;
const MAX_CALLS_JOB = 150;
const MAX_WORKING_MS = 30 * 60_000;
/** §24.21 classify: the last 5 results, each cut to 800 chars, ≤ 4,000 chars in all. */
const CLASSIFY_RESULTS = 5;
const CLASSIFY_EACH = 800;
const CLASSIFY_MAX = 4_000;

export type StuckRule = 'no_progress' | 'fail_streak' | 'cost' | 'url_loop' | 'budget' | 'time';
export interface StuckSignal {
  rule: StuckRule;
  at: number;
  /** ≤ 80, tech log only. */
  detail: string;
}

export interface StuckInput {
  now: number;
  lastProgressAt: number | null;
  /** WORKING wall time (NEEDS_YOU and WAITING excluded). */
  workingMs: number;
  failStreak: number;
  spentTokens: number;
  estTokens: number | null;
  billing: 'plan' | 'key' | 'local';
  spentCostPaise: number;
  estCostPaise: number | null;
  estMinutes: number | null;
  stepTurns: number;
  toolCallsStep: number;
  toolCallsJob: number;
  /** Navigated URLs of the job, oldest first (since the last "Try another way"). */
  navUrls: string[];
}

/** Origin + path, query keys sorted, no fragment; anything unparsable stays as it is. */
export function normaliseUrl(u: string): string {
  try {
    const url = new URL(u);
    const q = [...url.searchParams.entries()].sort(([a, x], [b, y]) => (a === b ? x.localeCompare(y) : a.localeCompare(b)));
    const qs = q.length ? `?${new URLSearchParams(q).toString()}` : '';
    return `${url.origin}${url.pathname}${qs}`;
  } catch {
    return u;
  }
}

/** Slow (08-2 §5.6): no step finished for 60 s. Only a tooltip; never ⏳ and never a stuck card by itself. */
export function isSlow(now: number, lastStepAt: number | null): boolean {
  return lastStepAt !== null && now - lastStepAt >= SLOW_MS;
}

/** The first stuck rule that fires, in the order of the 08-2 §5.6 table, then the 08-4 §26.3 ceilings. */
export function stuckCheck(i: StuckInput): StuckSignal | null {
  const sig = (rule: StuckRule, detail: string): StuckSignal => ({ rule, at: i.now, detail: detail.slice(0, 80) });
  if (i.lastProgressAt !== null && i.now - i.lastProgressAt > NO_PROGRESS_MS)
    return sig('no_progress', `no progress for ${Math.round((i.now - i.lastProgressAt) / 1000)} s`);
  if (i.failStreak >= FAIL_STREAK) return sig('fail_streak', `${i.failStreak} failures in a row`);
  if (i.estTokens !== null && i.spentTokens > 2 * i.estTokens) return sig('cost', `tokens ${i.spentTokens} > 2 x ${i.estTokens}`);
  if (i.billing === 'key' && i.estCostPaise !== null && i.spentCostPaise > 2 * i.estCostPaise)
    return sig('cost', `paise ${i.spentCostPaise} > 2 x ${i.estCostPaise}`);
  const tail = i.navUrls.slice(-URL_LOOP).map(normaliseUrl);
  if (tail.length === URL_LOOP && tail.every((u) => u === tail[0])) return sig('url_loop', `same page ${URL_LOOP} times`);
  if (i.stepTurns >= MAX_STEP_TURNS || i.toolCallsStep >= MAX_CALLS_STEP || i.toolCallsJob >= MAX_CALLS_JOB)
    return sig('budget', `turns ${i.stepTurns}, step calls ${i.toolCallsStep}, job calls ${i.toolCallsJob}`);
  if (i.workingMs >= MAX_WORKING_MS || (i.estMinutes !== null && i.estMinutes >= 5 && i.workingMs >= 3 * i.estMinutes * 60_000))
    return sig('time', `working ${Math.round(i.workingMs / 60_000)} min`);
  return null;
}

/** 08-4 §26.4 item 2: "What I'd do", written from facts (never by the AI). */
export function stuckSuggestion(f: { sites: string[]; opened: (site: string) => boolean; book: boolean; business: string | null }): string {
  const fresh = f.sites.find((s) => !f.opened(s));
  if (fresh) return t('cards.stuck.suggestion.try_site', { site: fresh });
  if (f.book && f.business) return t('cards.stuck.suggestion.email', { business: f.business });
  return t('cards.stuck.suggestion.open_page');
}

/** 08-4 §26.4 item 3. Minutes of WORKING time, at least 1. */
export function spentLine(billing: 'plan' | 'key' | 'local', spentPaise: number, workingMs: number): string {
  const m = Math.max(1, Math.floor(workingMs / 60_000));
  return billing === 'key' ? t('cards.stuck.spent_line.key', { x: formatInr(spentPaise), m }) : t('cards.stuck.spent_line.minutes', { m });
}

interface ToolCallView {
  id: string;
  stepId: string | null;
  tool: string;
  args: unknown;
  result: unknown;
  outcome: string | null;
  errorKind: string | null;
}

/** What "Try another way" resets (08-4 §26.3: not the per-job budget and time counts). */
interface Baseline {
  tokens: number;
  paise: number;
  navCount: number;
  stepCalls: Map<string, number>;
}

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const ROUTES_NOT_SITES = new Set(['api', 'email', 'handback', 'screen']);

export class Watchdog {
  private ticks = new Map<string, ReturnType<RunnerCore['d']['clock']['setTimeout']>>();
  private answerTimers = new Map<string, ReturnType<RunnerCore['d']['clock']['setTimeout']>>();
  private base = new Map<string, Baseline>();
  private ceilingStuck = new Set<string>();
  private avoid = new Map<string, string[]>();
  private showing = new Set<string>();

  constructor(
    private core: RunnerCore,
    private stop: StopFlow,
  ) {}

  /** Starts the 5 s tick of a WORKING job's loop. */
  watch(jobId: string): void {
    if (this.ticks.has(jobId)) return;
    const tick = () => {
      this.ticks.set(
        jobId,
        this.core.d.clock.setTimeout(() => {
          void this.core.track(this.check(jobId)).then((fired) => {
            if (!fired && this.ticks.has(jobId)) tick();
          });
        }, WATCHDOG_MS),
      );
    };
    tick();
  }

  unwatch(jobId: string): void {
    const id = this.ticks.get(jobId);
    if (id !== undefined) this.core.d.clock.clearTimeout(id);
    this.ticks.delete(jobId);
  }

  /** The `Avoid:` line items of part 8 (ROUTE_EXCLUDE). */
  avoidList(jobId: string): string[] {
    return this.avoid.get(jobId) ?? [];
  }

  forget(jobId: string): void {
    this.unwatch(jobId);
    this.base.delete(jobId);
    this.ceilingStuck.delete(jobId);
    this.avoid.delete(jobId);
    this.showing.delete(jobId);
  }

  dispose(): void {
    for (const id of [...this.ticks.values(), ...this.answerTimers.values()]) this.core.d.clock.clearTimeout(id);
    this.ticks.clear();
    this.answerTimers.clear();
  }

  private async inputOf(job: JobRow, calls: ToolCallView[], steps: StepRow[]): Promise<StuckInput> {
    const d = this.core.d;
    const b = this.base.get(job.id);
    const current = steps.find((s) => s.state === 'running') ?? null;
    const stepCalls = current ? calls.filter((c) => c.stepId === current.id).length - (b?.stepCalls.get(current.id) ?? 0) : 0;
    const nav = calls.filter((c) => c.tool.startsWith('browser.') && typeof (c.args as { url?: unknown } | null)?.url === 'string');
    const stepTurns = (await this.core.query<number>('stepTurnsForJob', job.id)) ?? 0;
    return {
      now: d.clock.now(),
      lastProgressAt: job.lastProgressAt,
      workingMs: this.core.workingMs(job.id),
      failStreak: job.failStreak,
      spentTokens: job.spentTokensIn + job.spentTokensOut - (b?.tokens ?? 0),
      estTokens: job.estTokens,
      billing: d.ai.pick()?.billing ?? 'plan',
      spentCostPaise: job.spentCostPaise - (b?.paise ?? 0),
      estCostPaise: job.estCostPaise,
      estMinutes: job.estMinutes,
      stepTurns,
      toolCallsStep: Math.max(0, stepCalls),
      toolCallsJob: calls.length,
      navUrls: nav.slice(b?.navCount ?? 0).map((c) => String((c.args as { url: string }).url)),
    };
  }

  /** One watchdog look at a WORKING job; true when a stuck card was shown (the loop must end). */
  async check(jobId: string): Promise<boolean> {
    if (this.showing.has(jobId)) return true;
    const job = await this.core.job(jobId);
    if (!job || job.state !== 'working') return false;
    const calls = (await this.core.query<ToolCallView[]>('toolCallsForJob', jobId)) ?? [];
    const signal = stuckCheck(await this.inputOf(job, calls, await this.core.steps(jobId)));
    if (!signal) return false;
    await this.stuck(job, signal);
    return true;
  }

  /** WORKING → NEEDS_YOU with the stuck card (SM-A2: the badge is ⏳; ⚠ only in the card header). */
  async stuck(job: JobRow, signal: StuckSignal | StuckRule): Promise<void> {
    if (this.showing.has(job.id)) return;
    this.showing.add(job.id);
    try {
      const sig = typeof signal === 'string' ? { rule: signal, at: this.core.d.clock.now(), detail: signal } : signal;
      // No more turns or tool calls for this job while the card is up.
      this.core.halt(job.id);
      this.unwatch(job.id);
      this.core.d.log(`job.stuck.${sig.rule}`, 'STUCK', { jobId: job.id });
      const calls = (await this.core.query<ToolCallView[]>('toolCallsForJob', job.id)) ?? [];
      const steps = await this.core.steps(job.id);
      const ceiling = sig.rule === 'budget' || sig.rule === 'time';
      const fresh = (await this.core.job(job.id)) ?? job;
      const billing = this.core.d.ai.pick()?.billing ?? 'plan';
      const payload = {
        whatsWrong: ceiling ? t('cards.stuck.whats_wrong.ceiling') : await this.whatsWrong(fresh, calls),
        spentLine: spentLine(billing, fresh.spentCostPaise, this.core.workingMs(job.id)),
        suggestion: this.suggestion(fresh, steps, calls),
        allowOtherWay: fresh.stuckCount < 2 && !(ceiling && this.ceilingStuck.has(job.id)),
      };
      if (ceiling) this.ceilingStuck.add(job.id);
      const cardId = await this.core.needsYou(fresh, { type: 'stuck', state: 'asking', payload });
      if (!cardId) return;
      this.answerTimers.set(
        cardId,
        this.core.d.clock.setTimeout(() => {
          this.answerTimers.delete(cardId);
          void this.core.track(this.timedOut(job.id, cardId));
        }, STUCK_ANSWER_MS),
      );
    } finally {
      this.showing.delete(job.id);
    }
  }

  /** 08-4 §26.4 item 1: one classify turn; failure, timeout, the cap, or a banned word → the fallback line. */
  private async whatsWrong(job: JobRow, calls: ToolCallView[]): Promise<string> {
    const d = this.core.d;
    const site = job.siteDomain ?? this.lastSite(calls) ?? 'this site';
    const fallback = t('cards.stuck.whats_wrong.fallback', { site });
    const pick = d.ai.pick();
    if (!pick) return fallback;
    const results = calls
      .slice(-CLASSIFY_RESULTS)
      .map((c) => {
        const head = `### ${c.id} ${c.tool} → ${c.outcome === 'ok' ? 'ok' : `error ${c.errorKind ?? 'UNKNOWN'}`}`;
        return `${head}\n${JSON.stringify(c.result ?? null).slice(0, CLASSIFY_EACH)}`;
      })
      .join('\n')
      .slice(0, CLASSIFY_MAX);
    const built = d.prompts.buildStuck(results);
    const params = d.ai.turnParams(pick.providerId, 'classify');
    const est = estimateCallPaise(built.system.length + built.prompt.length, params.maxOutputTokens, d.rateOf(pick.providerId), d.usdToInr);
    if (!(await this.core.cost.allows(est))) return fallback;
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
    await this.core.recordTurn(job, pick, turnId, 'classify', startedAt, r);
    if (r.stopReason !== 'end') return fallback;
    const said = d.prompts.parseStuck(r.text);
    if (!said) return fallback;
    const clean = d.prompts.filter(said);
    return clean && !d.prompts.isBanned(clean) ? clean : fallback;
  }

  private lastSite(calls: ToolCallView[]): string | null {
    for (let i = calls.length - 1; i >= 0; i--) {
      const a = calls[i]!.args as { site?: unknown; url?: unknown } | null;
      if (typeof a?.site === 'string') return a.site;
      if (typeof a?.url === 'string') {
        try {
          return new URL(a.url).hostname;
        } catch {
          /* not a URL */
        }
      }
    }
    return null;
  }

  private suggestion(job: JobRow, steps: StepRow[], calls: ToolCallView[]): string {
    const sites = steps
      .filter((s) => s.phraseKey === 'check_site' || s.phraseKey === 'check_sites')
      .flatMap((s) => String(s.slots.site ?? s.slots.sites ?? '').split(/,|\band\b/))
      .map((x) => x.trim())
      .filter(Boolean);
    const seen = calls.map((c) => JSON.stringify(c.args ?? null).toLowerCase());
    const business = calls.map((c) => JSON.stringify(c.result ?? null).match(EMAIL)?.[0] ?? null).find(Boolean) ?? null;
    return stuckSuggestion({
      sites,
      opened: (site) => seen.some((a) => a.includes(site.toLowerCase())),
      book: job.doVerbs.includes('book'),
      business,
    });
  }

  /** An answer on a stuck card: stop | other_way | take_over (stuck:choose). */
  async answer(card: CardRow, choice: string | undefined, resolvedBy: string): Promise<void> {
    if (card.state !== 'asking' || !card.jobId) return;
    const job = await this.core.job(card.jobId);
    if (!job || job.state !== 'needs_you' || job.needsYouCardId !== card.id) return;
    const now = this.core.d.clock.now();
    const timer = this.answerTimers.get(card.id);
    const clear = () => {
      if (timer !== undefined) this.core.d.clock.clearTimeout(timer);
      this.answerTimers.delete(card.id);
    };
    if (choice === 'stop') {
      clear();
      await this.core.tx([
        { op: 'update', table: 'cards', id: card.id, set: { state: 'stopped', resolved_by: resolvedBy, resolved_at: now } },
      ]);
      await this.stop.stopJob(job.id, 'stuck_stop');
      return;
    }
    if (choice === 'take_over') {
      // M9 builds the live window and the hand-back; until then the card records the choice and the job keeps waiting on
      // the user (resolved_at stays NULL so the scheduler does not resume it).
      clear();
      await this.core.tx([{ op: 'update', table: 'cards', id: card.id, set: { state: 'taken_over', answer: { optionId: 'take_over' } } }]);
      return;
    }
    if (choice !== 'other_way' || card.payload.allowOtherWay !== true) return;
    clear();
    const calls = (await this.core.query<ToolCallView[]>('toolCallsForJob', job.id)) ?? [];
    const steps = await this.core.steps(job.id);
    const stepCalls = new Map<string, number>();
    for (const c of calls) if (c.stepId) stepCalls.set(c.stepId, (stepCalls.get(c.stepId) ?? 0) + 1);
    this.base.set(job.id, {
      tokens: job.spentTokensIn + job.spentTokensOut,
      paise: job.spentCostPaise,
      navCount: calls.filter((c) => c.tool.startsWith('browser.')).length,
      stepCalls,
    });
    const current = steps.find((s) => s.state === 'waiting_user' || s.state === 'running');
    const exclude =
      job.siteDomain ?? this.lastSite(calls) ?? (current?.route && !ROUTES_NOT_SITES.has(current.route) ? current.route : null);
    if (exclude && !this.avoidList(job.id).includes(exclude)) this.avoid.set(job.id, [...this.avoidList(job.id), exclude]);
    const r = await this.core.tx([
      {
        op: 'update',
        table: 'cards',
        id: card.id,
        set: { state: 'other_way', resolved_by: resolvedBy, resolved_at: now, answer: { optionId: 'other_way' } },
      },
      { op: 'update', table: 'jobs', id: job.id, set: { stuck_count: job.stuckCount + 1, fail_streak: 0, last_progress_at: now } },
    ]);
    if (r.ok) await this.core.startNext();
  }

  /** SM-A11: 15 min without an answer → FAILED, the stuck card `timed_out`. */
  private async timedOut(jobId: string, cardId: string): Promise<void> {
    const job = await this.core.job(jobId);
    const card = await this.core.query<CardRow>('cardById', cardId);
    if (!job || !card || job.state !== 'needs_you' || job.needsYouCardId !== cardId || card.state !== 'asking') return;
    const now = this.core.d.clock.now();
    const steps = await this.core.steps(jobId);
    const ops: DbOp[] = [
      { op: 'update', table: 'cards', id: cardId, set: { state: 'timed_out', resolved_by: 'system', resolved_at: now } },
      {
        op: 'transition',
        table: 'jobs',
        id: jobId,
        from: ['needs_you'],
        to: 'failed',
        set: { needs_you_card_id: null, finished_at: now },
      },
      ...steps
        .filter((s) => s.state === 'waiting_user' || s.state === 'running')
        .map((s): DbOp => ({ op: 'update', table: 'steps', id: s.id, set: { state: 'failed', finished_at: now } })),
      ...this.core.badgeOps(job, 'failed'),
      ...(await this.core.editChecklistOps(job, 'failed')),
    ];
    if ((await this.core.tx(ops)).ok) await this.core.ended(jobId);
  }
}
