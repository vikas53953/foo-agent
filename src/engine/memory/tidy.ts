// Spec: 08-3 §12.7 (nightly tidy: (1) near-duplicate merge, same scope, normalised text similarity ≥ 0.9, keep the newest
// `said`; (2) conflicts: facts grouped by entity = the `people\{slug}` file, else the phrase after `lives in|works at|
// birthday|allergic to|prefers|drives|married to|phone|address|email`; only groups of ≥ 2 facts go to one cheap `tidy` turn
// whose `<act>` is `TidyAct`; keep the newest `said`; both `guessed` or an `ask` → one Choice card (`purpose='conflict'`,
// `reversible:false`) in foo's chat, unprompted (§15.2 step 5, held when over budget); its answer edits the kept fact to
// `you said · {today}` and forgets the other (tombstone, §12.6); (3) drop `guessed` facts unused for 180 days; (4) one entry
// in `memory\.tidy-log.md`; (5) the week count for Monday's `memory_week` brief item), 03:00 user time and, when missed,
// once after 10 minutes of user idle (`getSystemIdleTime() ≥ 600`), §15.7 (`memory_conflict:{idA}-{idB}`, ids sorted: asked
// once), 08-4 §24.1 (`tidy`: system 2 · protocol.md + memory_review.md), §24.21 (the tidy data block), §30.1 (cheap tier),
// 08-0 §G.17 (`messages.why`). CR-0010 G-M6-02 (the card is `conflict`), G-M6-06 (`privacy.rememberOn=false` blocks tidy's
// merges), G-M6-09 (M6 ships the function and the idle rule; M7 schedules it). AT-219.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { EngineFact } from '../../main/db/queries';
import type { Clock } from '../../shared/clock';
import { t } from '../../shared/copy/t';
import { fail, ok, type Result } from '../../shared/errors';
import type { Settings } from '../../shared/settings';
import type { CardRow, ChoicePayload, MessageWhy } from '../../shared/types';
import type { ProviderId } from '../../shared/types';
import type { TurnRequest, TurnResult, AiUsage } from '../ai/types';
import { parseEnvelope } from '../prompt/envelope';
import { formatFactLine } from '../prompt/PromptBuilder';
import type { DbOp, MainLink } from '../protocol';
import type { MemoryService } from './MemoryService';

const DAY = 86_400_000;
/** §12.7 step 1. */
export const NEAR_DUPLICATE = 0.9;
/** §12.7 step 3 `[foo decision]`. */
export const UNUSED_GUESS_MS = 180 * DAY;
/** §12.7: the built-in routine's time, minutes after local midnight (03:00). */
export const TIDY_AT_MIN = 3 * 60;
/** §12.7: a missed run waits for this much user idle (`powerMonitor.getSystemIdleTime()`, seconds). */
export const CATCH_UP_IDLE_SEC = 600;
export const TIDY_LOG_FILE = 'memory/.tidy-log.md';
const IDENTITY_FILE = 'memory/identity.md';
const ENTITY_WORDS = ['lives in', 'works at', 'birthday', 'allergic to', 'prefers', 'drives', 'married to', 'phone', 'address', 'email'];

/** 08-3 §12.7 `TidyAct` (schema row 08-2 §7.4); strict like every act. */
export const TidyActSchema = z
  .object({
    conflicts: z.array(
      z
        .object({
          factIds: z.tuple([z.string().min(1), z.string().min(1)]),
          entity: z.string().min(1).max(80),
          keep: z.string().min(1).optional(),
          ask: z
            .object({
              question: z.string().trim().min(1).max(200),
              options: z.tuple([z.string().trim().min(1).max(40), z.string().trim().min(1).max(40)]),
            })
            .strict()
            .optional(),
        })
        .strict(),
    ),
  })
  .strict();
export type TidyAct = z.infer<typeof TidyActSchema>;

export type TidyFact = Pick<
  EngineFact,
  'id' | 'file' | 'scope' | 'chatId' | 'text' | 'provenance' | 'learnedAt' | 'lastUsedAt' | 'private'
>;
/** One group of the §24.21 tidy block. */
export interface EntityGroup {
  entity: string;
  facts: TidyFact[];
}
/** The `tidy` turn: the `<act>` value, or null when it failed (offline, signed out, the spend cap, a bad act). */
export type TidyTurn = (groups: EntityGroup[]) => Promise<unknown>;

export type TidyOp =
  | { op: 'merge'; keep: string; drop: string[] }
  | { op: 'resolve'; keep: string; drop: string; entity: string }
  | { op: 'drop_unused'; factId: string };
/** The conflict question; `factIds[i]` is the fact option i keeps. */
export interface ConflictAsk {
  key: string;
  entity: string;
  question: string;
  options: [string, string];
  factIds: [string, string];
}
export interface TidyPlan {
  ops: TidyOp[];
  card?: ConflictAsk;
}

/** CR-0010 G-M6-15 normalisation (the fact hash's): NFKC, white space runs → one space, trimmed, lower-cased. */
export function normText(s: string): string {
  return s.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLowerCase();
}

/** §12.7 step 1 similarity: 1 − Levenshtein distance / the longer length, on code points of the normalised texts. */
export function similarity(a: string, b: string): number {
  const x = Array.from(normText(a));
  const y = Array.from(normText(b));
  const longest = Math.max(x.length, y.length);
  if (longest === 0) return 1;
  // The distance is at least the length gap: skip pairs that can never reach the threshold.
  if (1 - Math.abs(x.length - y.length) / longest < NEAR_DUPLICATE) return 0;
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (x[i - 1] === y[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[y.length]! / longest;
}

/** §12.7 step 2 entity: the person's file, else the first of the relation words the text holds (G-M6-T7a, see notes). */
export function entityOf(f: Pick<TidyFact, 'file' | 'text'>): string | null {
  const person = /^memory\/people\/(.+)\.md$/u.exec(f.file);
  if (person) return person[1]!;
  const text = normText(f.text);
  let best: { word: string; at: number } | null = null;
  for (const word of ENTITY_WORDS) {
    const at = text.search(new RegExp(`(^|[^\\p{L}])${word}($|[^\\p{L}])`, 'u'));
    if (at >= 0 && (!best || at < best.at)) best = { word, at };
  }
  return best?.word ?? null;
}

/** §15.7 key for a conflict: the two fact ids sorted, joined by `-`. */
export function conflictKey(a: string, b: string): string {
  return `memory_conflict:${[a, b].sort().join('-')}`;
}

const newest = (fs: TidyFact[]) => fs.reduce((a, b) => (b.learnedAt > a.learnedAt ? b : a));
const newestSaid = (fs: TidyFact[]) => {
  const said = fs.filter((f) => f.provenance === 'said');
  return said.length ? newest(said) : null;
};

/** Option i keeps the fact whose text holds the option's words; when that does not decide, the AI's order. */
function optionFacts(options: [string, string], ids: [string, string], byId: Map<string, TidyFact>): [string, string] {
  const holds = (opt: string, id: string) => normText(byId.get(id)?.text ?? '').includes(normText(opt));
  const first = holds(options[0], ids[0]) !== holds(options[0], ids[1]) ? (holds(options[0], ids[0]) ? ids[0] : ids[1]) : null;
  const second = holds(options[1], ids[0]) !== holds(options[1], ids[1]) ? (holds(options[1], ids[0]) ? ids[0] : ids[1]) : null;
  if (first && second && first !== second) return [first, second];
  if (first) return [first, first === ids[0] ? ids[1] : ids[0]];
  if (second) return [second === ids[0] ? ids[1] : ids[0], second];
  return ids;
}

/**
 * §12.7 steps 1–3 as a plan (the seam AT-219 tests with the fake AI): what to merge, settle and drop, and at most one
 * conflict question not asked before. `identity.md` is never tidied; `merge: false` (rememberOn off) skips steps 1–2.
 */
export async function tidy(input: {
  facts: readonly TidyFact[];
  now: number;
  ai: TidyTurn | null;
  /** §15.7: true when the conflict key was offered before (any state): it is never asked again. */
  asked?: (key: string) => Promise<boolean>;
  merge?: boolean;
}): Promise<TidyPlan> {
  const ops: TidyOp[] = [];
  const gone = new Set<string>();
  const facts = input.facts.filter((f) => f.file !== IDENTITY_FILE);
  const merge = input.merge ?? true;

  // (1) near-duplicates: same scope and same file (two people's files may hold the same words).
  if (merge) {
    const byPlace = new Map<string, TidyFact[]>();
    for (const f of facts) {
      const k = `${f.scope}|${f.chatId ?? ''}|${f.file}`;
      byPlace.set(k, [...(byPlace.get(k) ?? []), f]);
    }
    for (const group of byPlace.values()) {
      const left = [...group];
      while (left.length) {
        const seed = left.shift()!;
        const cluster = [seed];
        for (let i = left.length - 1; i >= 0; i--) {
          if (cluster.some((c) => similarity(c.text, left[i]!.text) >= NEAR_DUPLICATE)) cluster.push(...left.splice(i, 1));
        }
        if (cluster.length < 2) continue;
        const keep = newestSaid(cluster) ?? newest(cluster);
        const drop = cluster.filter((f) => f.id !== keep.id).map((f) => f.id);
        drop.forEach((id) => gone.add(id));
        ops.push({ op: 'merge', keep: keep.id, drop });
      }
    }
  }

  // (2) conflicts: groups of ≥ 2 facts by entity, one AI turn for all of them.
  let card: ConflictAsk | undefined;
  const live = facts.filter((f) => !gone.has(f.id));
  if (merge && input.ai) {
    const byEntity = new Map<string, TidyFact[]>();
    for (const f of live) {
      const e = entityOf(f);
      if (e) byEntity.set(e, [...(byEntity.get(e) ?? []), f]);
    }
    const groups = [...byEntity].filter(([, fs]) => fs.length >= 2).map(([entity, fs]) => ({ entity, facts: fs }));
    const parsed = groups.length ? TidyActSchema.safeParse(await input.ai(groups).catch(() => null)) : null;
    const byId = new Map(live.map((f) => [f.id, f]));
    for (const c of parsed?.success ? parsed.data.conflicts : []) {
      const [a, b] = c.factIds;
      const fa = byId.get(a);
      const fb = byId.get(b);
      if (!fa || !fb || a === b || gone.has(a) || gone.has(b)) continue;
      const key = conflictKey(a, b);
      if (c.ask) {
        if (!card && !(await input.asked?.(key)))
          card = {
            key,
            entity: c.entity,
            question: c.ask.question,
            options: c.ask.options,
            factIds: optionFacts(c.ask.options, c.factIds, byId),
          };
        continue;
      }
      // Keep the newest `said`; two guesses with no question stay as they are (no words to ask with).
      const keep = newestSaid([fa, fb]);
      if (!keep) continue;
      const drop = keep.id === a ? b : a;
      gone.add(drop);
      ops.push({ op: 'resolve', keep: keep.id, drop, entity: c.entity });
    }
  }

  // (3) guesses nobody used for 180 days (never used: counted from when they were learned).
  const asking = new Set(card?.factIds ?? []);
  for (const f of live) {
    if (gone.has(f.id) || asking.has(f.id) || f.provenance !== 'guessed') continue;
    if (input.now - (f.lastUsedAt ?? f.learnedAt) >= UNUSED_GUESS_MS) ops.push({ op: 'drop_unused', factId: f.id });
  }
  return card ? { ops, card } : { ops };
}

/** The local minutes after midnight of an instant. */
function localMinutes(at: number, timeZone: string): number {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const get = (k: string) => Number(p.find((x) => x.type === k)?.value ?? 0);
  return get('hour') * 60 + get('minute');
}

/** §12.7: the most recent 03:00 user time at or before `now`. */
export function lastTidySlot(now: number, timeZone: string): number {
  const min = localMinutes(now, timeZone);
  const back = min >= TIDY_AT_MIN ? min - TIDY_AT_MIN : min + 24 * 60 - TIDY_AT_MIN;
  const at = now - back * 60_000;
  return at - (at % 60_000);
}

/** §12.7: the 03:00 run was missed (the PC was off or asleep) and the user has been idle 10 minutes: run once now. */
export function catchUpDue(o: { lastRunAt: number | null; now: number; timeZone: string; idleSec: number }): boolean {
  const slot = lastTidySlot(o.now, o.timeZone);
  const missed = o.lastRunAt === null || o.lastRunAt < slot;
  return missed && o.idleSec >= CATCH_UP_IDLE_SEC;
}

/** §24.21 tidy data block: the messages header (none: tidy reads facts), the facts by entity, the tombstone hashes. */
export function tidyDataBlock(groups: EntityGroup[], hashes: readonly string[], timeZone: string, now: number): string {
  const facts = groups.flatMap((g) => [
    `## ${g.entity}`,
    ...g.facts.map((f) =>
      formatFactLine({ id: f.id, text: f.text, said: f.provenance === 'said' ? 'user' : 'guess', learnedAt: f.learnedAt }, timeZone, now),
    ),
  ]);
  return ['Messages since my last look:', '', 'Facts grouped by entity:', ...facts, '', 'Never save again (hashes):', ...hashes].join('\n');
}

export interface TidyReport {
  merged: number;
  settled: number;
  dropped: number;
  asked: number;
  /** §12.7 step 5: facts learned in the last 7 days (Monday's `memory_week`). */
  weekCount: number;
}

export interface MemoryTidyDeps {
  link: MainLink;
  clock: Clock;
  dataDir: string;
  memory: Pick<MemoryService, 'drop' | 'cmd'>;
  settings: () => Settings;
  newId: (prefix: 'm' | 'k' | 't' | 'sg') => string;
  newNonce: () => string;
  /** The real `tidy` turn (null in unit tests that pass their own). */
  turn: TidyTurn | null;
  log: (evt: string, kind?: string) => void;
}

/** §24.1 tidy turn over the your-AI service: one cheap turn in foo's chat, its `ai_turns` row, the `<act>`. */
export function tidyTurnVia(d: {
  link: MainLink;
  clock: Clock;
  newId: (prefix: 't') => string;
  timeZone: () => string;
  fooChatId: () => Promise<string | null>;
  ai: {
    pick(): { providerId: ProviderId; billing: 'plan' | 'key' | 'local' } | null;
    turnParams(id: ProviderId, purpose: 'tidy'): Omit<TurnRequest, 'turnId' | 'purpose' | 'system' | 'prompt'>;
    runTurn(id: ProviderId, req: TurnRequest, sink: { onText(): void; onSession(): void }, signal: AbortSignal): Promise<TurnResult>;
    costPaise(id: ProviderId, usage: AiUsage, model?: string): { paise: number | null; source: string };
  };
  build: (dataBlock: string) => { system: string; prompt: string };
  allow: (chars: number) => Promise<boolean>;
}): TidyTurn {
  return async (groups) => {
    const pick = d.ai.pick();
    const chatId = await d.fooChatId();
    if (!pick || !chatId) return null;
    const hashes = (await d.link.request<{ hash: string }[]>('db.query', { q: 'memory.tombstones', args: [] })) as Result<
      { hash: string }[]
    >;
    const now = d.clock.now();
    const built = d.build(tidyDataBlock(groups, hashes.ok ? hashes.value.map((h) => h.hash) : [], d.timeZone(), now));
    if (!(await d.allow(built.system.length + built.prompt.length))) return null;
    const turnId = d.newId('t');
    const params = d.ai.turnParams(pick.providerId, 'tidy');
    const r = await d.ai
      .runTurn(
        pick.providerId,
        { ...params, turnId, purpose: 'tidy', system: built.system, prompt: built.prompt, chatId },
        { onText: () => {}, onSession: () => {} },
        new AbortController().signal,
      )
      .catch((): TurnResult => ({
        text: '',
        usage: { tokensIn: null, tokensOut: null, cacheRead: null, cacheWrite: null, costUsd: null },
        stopReason: 'error',
        errorKind: 'UNKNOWN',
      }));
    const cost = d.ai.costPaise(pick.providerId, r.usage, r.modelReported);
    const outcome =
      r.stopReason === 'end' ? 'ok' : r.stopReason === 'cancelled' ? 'cancelled' : r.errorKind === 'AI_TIMEOUT' ? 'timeout' : 'error';
    await d.link.request('db.tx', {
      ops: [
        {
          op: 'insert',
          table: 'ai_turns',
          row: {
            id: turnId,
            chat_id: chatId,
            job_id: null,
            purpose: 'tidy',
            provider_id: pick.providerId,
            model_reported: r.modelReported ?? null,
            session_id: r.sessionId ?? null,
            tokens_in: r.usage.tokensIn,
            tokens_out: r.usage.tokensOut,
            tokens_cache_read: r.usage.cacheRead,
            tokens_cache_write: r.usage.cacheWrite,
            cost_paise: cost.paise,
            cost_source: cost.source,
            billing: pick.billing,
            duration_ms: d.clock.now() - now,
            outcome,
            error_kind: outcome === 'ok' ? null : (r.errorKind ?? 'UNKNOWN'),
            started_at: now,
          },
        },
      ] satisfies DbOp[],
    });
    if (r.stopReason !== 'end') return null;
    return parseEnvelope(r.text).act ?? null;
  };
}

/** The nightly tidy run (`test.memoryTidy` now; M7's `memory_tidy` builtin at 03:00) and the conflict card's answer. */
export class MemoryTidy {
  constructor(private readonly d: MemoryTidyDeps) {}

  async run(): Promise<Result<TidyReport>> {
    const s = this.d.settings();
    const facts = await this.query<EngineFact[]>('memory.all', []);
    if (!facts) return fail('UNKNOWN', 'memory index unreadable');
    const plan = await tidy({
      facts,
      now: this.d.clock.now(),
      merge: s.privacy.rememberOn,
      asked: async (key) => (await this.query<string | null>('suggestionState', [key])) !== null,
      ai: this.d.turn,
    });
    const report: TidyReport = { merged: 0, settled: 0, dropped: 0, asked: 0, weekCount: 0 };
    const drop: string[] = [];
    for (const op of plan.ops) {
      if (op.op === 'merge') {
        drop.push(...op.drop);
        report.merged += op.drop.length;
      } else if (op.op === 'resolve') {
        drop.push(op.drop);
        report.settled += 1;
      } else {
        drop.push(op.factId);
        report.dropped += 1;
      }
    }
    if (drop.length) {
      const r = await this.d.memory.drop(drop);
      if (!r.ok) return r;
    }
    if (plan.card) {
      const r = await this.ask(plan.card);
      if (!r.ok) return r;
      report.asked = 1;
    }
    report.weekCount = await this.weekCount();
    await this.appendLog(report);
    return ok(report);
  }

  /** §12.7 step 5 / §14.2 `memory_week`: facts learned this week. */
  async weekCount(): Promise<number> {
    return (await this.query<number>('memory.weekCount', [])) ?? 0;
  }

  /** The conflict card's answer (main wrote the card's state): keep the picked fact as `you said · {today}`, forget the
   * other with its tombstone. True when the card was a conflict card. */
  async onCardAnswered(a: { cardId: string; choice?: string }): Promise<boolean> {
    const card = await this.query<CardRow>('cardById', [a.cardId]);
    if (card?.type !== 'choice' || card.payload.purpose !== 'conflict') return false;
    const ids = Array.isArray(card.payload.factIds) ? card.payload.factIds.map(String) : [];
    const i = a.choice === 'o1' ? 0 : a.choice === 'o2' ? 1 : -1;
    const keep = ids[i];
    const other = ids[1 - i];
    if (i < 0 || !keep || !other) return true;
    const kept = await this.query<EngineFact>('memory.byId', [keep]);
    if (kept) await this.d.memory.cmd({ cmd: 'edit', factId: keep, text: kept.text });
    await this.d.memory.cmd({ cmd: 'forget', factId: other });
    return true;
  }

  /** One unprompted Choice card in foo's chat, with its suggestion key; main's budget may hold it (§15.2 step 5). */
  private async ask(c: ConflictAsk): Promise<Result<unknown>> {
    const chatId = await this.query<string | null>('chats.foo', []);
    if (!chatId) return fail('NOT_FOUND', 'no foo chat');
    const now = this.d.clock.now();
    const messageId = this.d.newId('m');
    const cardId = this.d.newId('k');
    const why: MessageWhy = { source: 'housekeeping', suggestionKey: c.key, vars: {} };
    const payload: ChoicePayload & { factIds: [string, string]; entity: string } = {
      purpose: 'conflict',
      question: c.question,
      options: [
        { id: 'o1', label: c.options[0] },
        { id: 'o2', label: c.options[1] },
      ],
      aiReversible: false,
      reversible: false,
      livePrices: false,
      factIds: c.factIds,
      entity: c.entity,
    };
    return this.d.link.request('db.tx', {
      ops: [
        {
          op: 'insert',
          table: 'suggestions',
          row: { id: this.d.newId('sg'), key: c.key, kind: 'memory_conflict', text: c.question, state: 'offered', offered_at: now },
        },
        {
          op: 'insert',
          table: 'messages',
          row: {
            id: messageId,
            chat_id: chatId,
            author_kind: 'foo',
            kind: 'card',
            card_id: cardId,
            status: 'complete',
            prompted: 0,
            why: JSON.stringify(why),
            created_at: now,
          },
        },
        {
          op: 'insert',
          table: 'cards',
          row: {
            id: cardId,
            chat_id: chatId,
            message_id: messageId,
            job_id: null,
            type: 'choice',
            state: 'asking',
            payload,
            nonce: this.d.newNonce(),
            created_at: now,
          },
        },
      ] satisfies DbOp[],
    });
  }

  /** §12.7 step 4: one human-readable line per run ("Merged 2 duplicates · Asked about 1 conflict"). */
  private async appendLog(r: TidyReport): Promise<void> {
    const tz = this.d.settings().locale.timeZone;
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
      this.d.clock.now(),
    );
    const line = t('memory.tidy_log.line', { date, merged: r.merged, settled: r.settled, dropped: r.dropped, asked: r.asked });
    const prev = await readFile(join(this.d.dataDir, ...TIDY_LOG_FILE.split('/')), 'utf8').catch(() => '');
    const w = await this.d.link.request('file.write', { relPath: TIDY_LOG_FILE, text: `${prev}${line}\n`, atomic: true });
    if (!w.ok) this.d.log('memory.tidy_log_failed', w.error.kind);
  }

  private async query<T>(q: string, args: unknown[]): Promise<T | null> {
    const r = await this.d.link.request<T>('db.query', { q, args });
    return r.ok ? r.value : null;
  }
}
