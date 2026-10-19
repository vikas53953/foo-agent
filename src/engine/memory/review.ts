// Spec: 08-3 §12.4 (post-turn review: after a chat-lane reply or a job finishing, when the chat has ≥ 1 new user message since
// the last review, 20 s of quiet in that chat, at most once per chat per 2 minutes, background lane, only if
// `privacy.learnFromChats`, skipped at the spend cap; input = the new messages (redacted), the facts in the same scopes
// (≤ 4,000 chars), tombstone hashes; output `MemoryReviewAct`; placement is the engine's; an op with a category outside
// `MemoryCategory`, or `kind='person'` without `person`, is rejected), §12.3 (`said` needs a user message among
// `evidenceMessageIds` whose text has the fact's key content, token overlap ≥ 0.6 after normalisation; `guessed` needs ≥ 2
// distinct evidence events and a `reason`), §12.4.1 (sensitive rule, in MemoryService.learn), §12.4.2 (chip placement R-20;
// `privacy.askBeforeRemembering` → a Choice card `purpose='memory_confirm'` "Remember that {fact}?" [ Remember ] [ Don't ]),
// §12.1 (a private chat never saves memory or offers review), 08-4 §24.1 (memory_review parts), §24.10, §24.21 (data block),
// §30.1 (memory_review: cheap, 800 out, 60 s), CR-0010 G-M6-06 (`privacy.rememberOn=false` blocks the review).
import { z } from 'zod';
import type { Clock, TimerId } from '../../shared/clock';
import { t } from '../../shared/copy/t';
import { newNonce } from '../../shared/canon';
import type { Result } from '../../shared/errors';
import type { Settings } from '../../shared/settings';
import type { ChoicePayload, MemoryCategory, MemoryKind } from '../../shared/types';
import type { EngineChat, EngineFact, EngineMessage, EngineTombstone } from '../../main/db/queries';
import type { DbOp, DbTxReply } from '../protocol';
import { MEMORY_CATEGORIES, MEMORY_KINDS } from './fileFormat';
import type { LearnOp, LearnResult } from './MemoryService';
import type { MemoryChips } from './chips';

export const QUIET_MS = 20_000;
export const MIN_GAP_MS = 2 * 60_000;
const FACTS_CAP = 4_000;
const WINDOW_MAX = 40;
export const SAID_OVERLAP = 0.6;

const addOp = z
  .object({
    op: z.literal('add'),
    scope: z.enum(['global', 'chat', 'helper']),
    text: z.string().trim().min(1).max(120),
    provenance: z.enum(['said', 'guessed']),
    evidenceMessageIds: z.array(z.string()),
    reason: z.string().trim().min(1).max(120).optional(),
    category: z.enum(MEMORY_CATEGORIES as [MemoryCategory, ...MemoryCategory[]]),
    kind: z.enum(MEMORY_KINDS as [MemoryKind, ...MemoryKind[]]),
    person: z.string().trim().min(1).max(80).optional(),
    private: z.boolean(),
  })
  .strict();
const updateOp = z
  .object({
    op: z.literal('update'),
    factId: z.string().min(1),
    text: z.string().trim().min(1).max(120),
    evidenceMessageIds: z.array(z.string()),
  })
  .strict();
const nothingOp = z.object({ op: z.literal('nothing') }).strict();
/** 08-3 §12.4 `MemoryReviewAct` (the schema the AI is shown); each op is checked on its own, so one bad op drops only itself. */
export const MemoryReviewActSchema = z.object({ ops: z.array(z.discriminatedUnion('op', [addOp, updateOp, nothingOp])) }).strict();
/** One add op (also `memory.propose`'s args without `op`, 08-2 §8.2). */
export const ReviewAddOp = addOp;
export type ReviewAdd = z.infer<typeof addOp>;
export type ReviewUpdate = z.infer<typeof updateOp>;

/** §12.3 normalisation: NFKC, lower case, letters / marks / numbers only. */
export function tokens(text: string): string[] {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/['’]/gu, '')
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter(Boolean);
}

/** §12.3: the share of the fact's tokens the message also has. */
export function overlap(fact: string, message: string): number {
  const f = [...new Set(tokens(fact))];
  if (!f.length) return 0;
  const m = new Set(tokens(message));
  return f.filter((x) => m.has(x)).length / f.length;
}

/** §12.3 provenance rule for one add op; `byId` = the review window's messages. */
export function provenanceOk(
  op: Pick<ReviewAdd, 'provenance' | 'text' | 'evidenceMessageIds' | 'reason'>,
  byId: Map<string, EngineMessage>,
) {
  if (op.provenance === 'said')
    return op.evidenceMessageIds.some((id) => {
      const m = byId.get(id);
      return !!m && m.authorKind === 'user' && overlap(op.text, m.textForAi ?? m.text) >= SAID_OVERLAP;
    });
  return new Set(op.evidenceMessageIds).size >= 2 && !!op.reason?.trim();
}

/** R-20: the foo (or helper) bubble that followed the evidence, else the user's bubble that carried it. */
export function anchorOf(evidence: readonly string[], window: readonly EngineMessage[]): string | null {
  const ev = window.filter((m) => evidence.includes(m.id));
  const last = ev.length ? Math.max(...ev.map((m) => m.seq)) : null;
  const bubble = (m: EngineMessage) => (m.authorKind === 'foo' || m.authorKind === 'helper') && m.kind !== 'marker';
  if (last !== null) {
    const after = window.find((m) => m.seq > last && bubble(m));
    if (after) return after.id;
    const carried = ev.filter((m) => m.authorKind === 'user').sort((a, b) => b.seq - a.seq)[0];
    if (carried) return carried.id;
  }
  return [...window].reverse().find(bubble)?.id ?? [...window].reverse().find((m) => m.authorKind === 'user')?.id ?? null;
}

export interface ReviewMemory {
  learn(op: LearnOp): Promise<Result<LearnResult>>;
  update(factId: string, text: string): Promise<Result<unknown>>;
}

export interface ReviewDeps {
  clock: Clock;
  settings(): Settings;
  query<T>(q: string, ...args: unknown[]): Promise<T | null>;
  tx(ops: DbOp[]): Promise<Result<DbTxReply>>;
  newId(prefix: 'm' | 'k'): string;
  /** 08-2 §7.2 part 7 line of one message: `[{name}, {when}]: {text}` (cards as one line). */
  messageLine(m: EngineMessage, chat: EngineChat): Promise<string>;
  /** §24.16 item 5 line of one fact. */
  factLine(f: EngineFact): string;
  /** The memory_review prompt (08-4 §24.1) for the §24.21 data block. */
  build(data: string): { system: string; prompt: string };
  /**
   * One background-lane `memory_review` turn (08-2 §6.9; the spend-cap check, the ai_turns row and the envelope are the
   * caller's): the `<act>` value, or null when no turn ran or it failed.
   */
  turn(chatId: string, system: string, prompt: string): Promise<unknown>;
  memory: ReviewMemory;
  chips: MemoryChips;
  log(evt: string, kind?: string, ids?: { chatId?: string }): void;
}

/** The memory half of the background lane: when a review runs, what it reads and what it saves (§12.4). */
export class MemoryReview {
  /** chat → the seq of the last message the previous review read. */
  private readonly read = new Map<string, number>();
  private readonly lastRun = new Map<string, number>();
  private readonly timers = new Map<string, TimerId>();
  /** chat → the first message seq seen this run (a review never reads further back than the session started). */
  private readonly floor = new Map<string, number>();
  /** Messages a "don't remember this" covered (J17): never read by a review. */
  private readonly unsaved = new Set<string>();
  private running: Promise<void> = Promise.resolve();

  constructor(private readonly d: ReviewDeps) {}

  /** A user message arrived in `chatId`: the quiet period starts again. */
  userMessage(chatId: string, seq: number): void {
    if (!this.floor.has(chatId)) this.floor.set(chatId, seq - 1);
    if (this.timers.has(chatId)) this.schedule(chatId);
  }

  /** J17 "don't remember this": the review never reads these messages. */
  skip(messageId: string): void {
    this.unsaved.add(messageId);
  }

  /** §12.4 trigger: a chat-lane reply or a job finished in `chatId`. */
  after(chatId: string): void {
    if (!this.allowed()) return;
    this.schedule(chatId);
  }

  /** Waits for every review that already started (tests). */
  idle(): Promise<void> {
    return this.running;
  }

  cancelAll(): void {
    for (const id of this.timers.values()) this.d.clock.clearTimeout(id);
    this.timers.clear();
  }

  private allowed(): boolean {
    const p = this.d.settings().privacy;
    return p.rememberOn && p.learnFromChats;
  }

  private schedule(chatId: string): void {
    const old = this.timers.get(chatId);
    if (old !== undefined) this.d.clock.clearTimeout(old);
    const now = this.d.clock.now();
    const last = this.lastRun.get(chatId);
    const at = Math.max(now + QUIET_MS, last === undefined ? 0 : last + MIN_GAP_MS);
    this.timers.set(
      chatId,
      this.d.clock.setTimeout(() => {
        this.timers.delete(chatId);
        this.running = this.running.then(() => this.review(chatId)).catch(() => this.d.log('memory.review_crashed', 'UNKNOWN', { chatId }));
      }, at - now),
    );
  }

  /** One review of `chatId` (§12.4): exported for the tests through `runNow`. */
  async runNow(chatId: string): Promise<void> {
    await this.review(chatId);
  }

  private async review(chatId: string): Promise<void> {
    if (!this.allowed()) return;
    const chat = await this.d.query<EngineChat>('chatOpen', chatId);
    // §12.1: a private chat never saves memory and never offers review.
    if (!chat || chat.private) return;
    const recent = (await this.d.query<EngineMessage[]>('messagesBefore', chatId, null, WINDOW_MAX)) ?? [];
    const from = Math.max(this.read.get(chatId) ?? -1, this.floor.get(chatId) ?? -1);
    const window = recent.filter(
      (m) => m.seq > from && m.kind !== 'marker' && (m.status === 'complete' || m.status === 'sent') && !this.unsaved.has(m.id),
    );
    if (!window.some((m) => m.authorKind === 'user')) return;
    const top = recent.length ? recent[recent.length - 1]!.seq : from;
    this.lastRun.set(chatId, this.d.clock.now());
    this.read.set(chatId, top);

    const data = await this.data(chat, window);
    const built = this.d.build(data);
    const act = await this.d.turn(chatId, built.system, built.prompt);
    if (act === null || act === undefined) return;
    const parsed = z.object({ ops: z.array(z.unknown()) }).safeParse(act);
    if (!parsed.success) {
      this.d.log('memory.review_invalid', 'PROTOCOL_INVALID', { chatId });
      return;
    }
    const byId = new Map(window.map((m) => [m.id, m]));
    for (const raw of parsed.data.ops) {
      const add = addOp.safeParse(raw);
      if (add.success) {
        await this.add(chat, add.data, byId, window);
        continue;
      }
      const upd = updateOp.safeParse(raw);
      if (upd.success) {
        await this.update(chat, upd.data, window);
        continue;
      }
      if (!nothingOp.safeParse(raw).success) this.d.log('memory.review_op_rejected', 'VALIDATION', { chatId });
    }
  }

  /** §24.21 memory_review data block. */
  private async data(chat: EngineChat, window: EngineMessage[]): Promise<string> {
    const lines = await Promise.all(window.map(async (m) => `[${m.id}] ${await this.d.messageLine(m, chat)}`));
    const facts: string[] = [];
    let size = 0;
    for (const f of (await this.d.query<EngineFact[]>('memoryByScope', chat.id)) ?? []) {
      const line = this.d.factLine(f);
      if (size + line.length + 1 > FACTS_CAP) break;
      facts.push(line);
      size += line.length + 1;
    }
    const stones = ((await this.d.query<EngineTombstone[]>('memory.tombstones')) ?? []).map((s) => s.hash);
    return [
      'Messages since my last look:',
      ...lines,
      '',
      'Facts already saved (same scopes):',
      ...facts,
      '',
      'Never save again (hashes):',
      ...stones,
    ].join('\n');
  }

  private async add(chat: EngineChat, op: ReviewAdd, byId: Map<string, EngineMessage>, window: EngineMessage[]): Promise<void> {
    if (op.kind === 'person' && !op.person) {
      this.d.log('memory.review_op_rejected', 'VALIDATION', { chatId: chat.id });
      return;
    }
    if (!provenanceOk(op, byId)) {
      this.d.log('memory.provenance_rejected', 'VALIDATION', { chatId: chat.id });
      return;
    }
    const evidence = op.evidenceMessageIds.find((id) => byId.get(id)?.authorKind === 'user') ?? op.evidenceMessageIds[0] ?? '';
    const learn: LearnOp = {
      text: op.text,
      provenance: op.provenance,
      originKind: 'chat',
      origin: `chat:${chat.id}/${evidence}`,
      reason: op.reason ?? null,
      category: op.category,
      kind: op.kind,
      ...(op.person ? { person: op.person } : {}),
      // §12.4: in foo's 1:1 chat a helper-scope add is coerced to global.
      scope: op.scope === 'helper' && !chat.helperId ? 'global' : op.scope,
      chatId: chat.id,
      helperId: chat.helperId,
      private: op.private,
    };
    if (op.scope === 'helper' && !chat.helperId) this.d.log('memory.scope_coerced', undefined, { chatId: chat.id });
    const anchor = anchorOf(op.evidenceMessageIds, window);
    if (this.d.settings().privacy.askBeforeRemembering) {
      await askRemember(this.d, chat.id, learn);
      return;
    }
    await saveAndChip(this.d, chat.id, anchor, learn);
  }

  private async update(chat: EngineChat, op: ReviewUpdate, window: EngineMessage[]): Promise<void> {
    const old = await this.d.query<EngineFact>('memory.byId', op.factId);
    if (!old || old.text === op.text) return;
    const r = await this.d.memory.update(op.factId, op.text);
    if (!r.ok) {
      this.d.log('memory.review_update_failed', r.error.kind, { chatId: chat.id });
      return;
    }
    const anchor = anchorOf(op.evidenceMessageIds, window);
    if (anchor) await this.d.chips.updated(chat.id, anchor, { id: op.factId, text: op.text }, old.text);
  }
}

/** Saves one learned fact and posts its chip (no chip when it was dropped: sensitive guess, tombstone, invalid). */
export async function saveAndChip(
  d: { memory: Pick<ReviewMemory, 'learn'>; chips: Pick<MemoryChips, 'saved'>; log: ReviewDeps['log'] },
  chatId: string,
  anchor: string | null,
  op: LearnOp,
): Promise<string | null> {
  const r = await d.memory.learn(op);
  if (!r.ok) {
    d.log('memory.learn_failed', r.error.kind, { chatId });
    return null;
  }
  if (!('factId' in r.value)) return null;
  // Logged: the source only, never the fact (05-3 §5.17.1).
  d.log(op.provenance === 'said' ? 'memory.saved_said' : 'memory.saved_guessed', undefined, { chatId });
  if (anchor) await d.chips.saved(chatId, anchor, { id: r.value.factId, text: op.text, provenance: op.provenance });
  return r.value.factId;
}

/** The ask-before-remembering card (§12.4.2, 05-3 §5.17.1): "Remember that {fact}?" [ Remember ] [ Don't ]. */
export async function askRemember(
  d: Pick<ReviewDeps, 'tx' | 'newId' | 'clock' | 'log'>,
  chatId: string,
  op: LearnOp,
  helperId: string | null = op.helperId ?? null,
): Promise<string | null> {
  const payload: ChoicePayload & { memory: { op: 'remember'; learn: LearnOp } } = {
    purpose: 'memory_confirm',
    question: t('cards.choice.question.memory_confirm', { fact: op.text }),
    options: [
      { id: 'o1', label: t('cards.choice.option.remember') },
      { id: 'o2', label: t('cards.choice.option.dont_remember') },
    ],
    multi: false,
    aiReversible: false,
    reversible: false,
    livePrices: false,
    memory: { op: 'remember', learn: op },
  };
  return postChoice(d, chatId, payload, helperId);
}

/** A jobless Choice card row and its message (08-1 §4.3.3, §4.5). */
export async function postChoice(
  d: Pick<ReviewDeps, 'tx' | 'newId' | 'clock' | 'log'>,
  chatId: string,
  payload: ChoicePayload,
  helperId: string | null,
): Promise<string | null> {
  const cardId = d.newId('k');
  const messageId = d.newId('m');
  const now = d.clock.now();
  const r = await d.tx([
    {
      op: 'insert',
      table: 'messages',
      row: {
        id: messageId,
        chat_id: chatId,
        author_kind: helperId ? 'helper' : 'foo',
        author_id: helperId,
        kind: 'card',
        card_id: cardId,
        status: 'complete',
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
        nonce: newNonce(),
        created_at: now,
      },
    },
  ]);
  if (!r.ok) {
    d.log('memory.card_failed', r.error.kind, { chatId });
    return null;
  }
  return cardId;
}
