// Spec: 08-2 §5.2 (every user message gets one intake turn), §6.9 (chat lane: 1 per chat, 2 in total), §7.2–§7.6 (prompt,
// FOO/1 envelope, repair once, output filters), 08-4 §24.1 (intake parts), §25.2 (IntakeAct), §25.5 (release gate; what is
// posted per kind, F-095; empty reply → 👍 or "I didn't get that. Say it another way?", F-092), §30.1 (intake: 60 s, stream),
// §30.7 (at 60 s the turn is cancelled and no late text is posted), 04 §3.3 (ticks: ✓✓ delivered when the lane accepts the
// message, read on the first byte), §4.1 rule 4 (a plain answer's badge is `seen` and goes when the first word appears),
// §14.3 (Thinking row only while a request is really in flight: chat:typing), §19.4 (cut-off reply: partial text stays,
// bubble status `failed`), 08-1 §4.3.5 (ai_turns row per turn), Art. 12 (AI words never move a status), Art. 16, 22.
// M3 builds `reply` and `react`; M4 adds `job` (the runner's createJob). The other intake kinds (ask, handoff, routine, memory, setting, catch_up) arrive with
// M4–M8. Until then their unreleased `<say>` is discarded and foo posts the empty-reply line so it never goes silent
// (GAPS.md 2026-10-18 "intake kinds before their milestone"). M6: memory parts 5/5b per turn (08-4 §24.16, retrieval.ts)
// and the uses of the offered facts the AI names in `usedMemoryIds` (§24.16 item 6, 08-3 §12.5). M6 T5: intake kind `memory`
// (08-4 §25.2, §25.5 item 5; memory/intakeMemory.ts), "don't remember this" before the turn (J17), the "Used: {fact}" chips
// under a reply (08-3 §12.5) and the post-turn review trigger after every answered turn (08-3 §12.4). P1 T6 (04-2 §21.7,
// CR-0021 pick 10): a reply's `Suggestions:` line is stored on the reply as `messages.suggestions`, never shown as text.
// R1 T6 (X-180, CR-0022): the "foo read:" items of the user's message go on it when the lane takes it (04 §6.5, rule-based,
// from the redacted text; not in groups or WhatsApp mirrors); a side question (04 §17.5, pick 6, AT-364) skips the stop,
// steer and typed-answer branches and the plan change, is answered as a reply only (never a job, never memory) and its
// answer carries `side = 1`, so a running job keeps running unchanged. C1 T2 (04 §13.7, CR-0024 F3): a reply tagged
// `intent_capabilities` (08-4 §25.2) is followed by the Capabilities card, built from the app's own state (never the AI's).
import { t } from '../../shared/copy/t';
import type { Clock } from '../../shared/clock';
import type { Result } from '../../shared/errors';
import type { Settings } from '../../shared/settings';
import type { ProviderId } from '../../shared/types';
import type { IntakeDecision } from '../../shared/schemas';
import type { EngineChat, EngineHelper, EngineMessage } from '../../main/db/queries';
import type { DbOp, DbTxReply, MainLink } from '../protocol';
import type { AiErrorKind, AiUsage, TurnRequest, TurnResult, TurnSink } from '../ai/types';
import { buildMemoryParts, memoryUseOps, type MemoryParts } from '../memory/retrieval';
import type { EngineFact } from '../../main/db/queries';
import { usedFacts } from '../memory/chips';
// M5 (T5)
import type { CardAnswer } from '../../shared/types';
import { answerTyped, type TypedHookDeps } from '../cards/typedHook';
// P1 T6
import { splitActions } from '../prompt/actions';
import { splitSuggestions } from '../prompt/suggestions';
// R1 T6
import { understoodItems } from './understood';
import { isSideAiText, sideAiText } from '../../shared/sideQuestion';
// C1 T2
import { newNonce } from '../../shared/canon';
import { CAPABILITIES_APP, capabilitiesSurface, type CapabilityState } from '../../shared/kit/capabilities';

/** The your-AI service the lane talks to (Engine wires AiService). */
export interface LaneAi {
  /** The provider a chat turn uses now (primary, or the backup while the primary rests, 08-4 §30.9), or null. */
  pick(): { providerId: ProviderId; billing: 'plan' | 'key' | 'local'; backup: boolean } | null;
  turnParams(
    providerId: ProviderId,
    purpose: 'intake' | 'repair' | 'rewrite' | 'step' | 'classify' | 'second_look' | 'tidy' | 'memory_review', // M5 T8: second_look; M6 T7: tidy; M6 T5: memory_review
  ): Omit<TurnRequest, 'turnId' | 'purpose' | 'system' | 'prompt'>;
  runTurn(providerId: ProviderId, req: TurnRequest, sink: TurnSink, signal: AbortSignal): Promise<TurnResult>;
  reportOk(providerId: ProviderId): void;
  reportError(providerId: ProviderId, kind: AiErrorKind, resetAt?: number): void;
  costPaise(
    providerId: ProviderId,
    usage: AiUsage,
    model?: string,
  ): { paise: number | null; source: 'reported' | 'priced' | 'estimated' | 'free' | 'unknown' };
}

export interface IntakeInput {
  settings: Settings;
  chat: EngineChat;
  helper: EngineHelper | null;
  conversation: EngineMessage[];
  message: EngineMessage;
  local: boolean;
  /** Parts 5 and 5b for this turn (08-4 §24.16). */
  memory: MemoryParts;
  // M5
  /** T10: "Change plan": the old plan goes with this turn (08-2 §5.3.3). */
  oldPlan?: { title: string; steps: string[] };
}

/** The reply protocol (builder B's modules, wired by Engine). */
export interface LaneProtocol {
  /** `factIds`: the facts parts 5/5b carry as sent (08-4 §24.16 item 6). */
  buildIntake(input: IntakeInput): { system: string; prompt: string; factIds?: string[] };
  buildRepair(issues: string): string;
  /** Parse the whole reply: the `<say>` text and the validated IntakeAct, or the zod issues. */
  parse(text: string): { say: string; act: IntakeDecisionView | null; issues: string | null; usedMemoryIds?: string[]; tags?: IntakeTag[] };
  parseAct(text: string): { act: IntakeDecisionView | null; issues: string | null; usedMemoryIds?: string[]; tags?: IntakeTag[] };
  /** The release gate for one streamed turn (08-4 §25.5 item 2). */
  gate(onRelease: (text: string, mode: 'whole' | 'sentence') => void, signal: AbortSignal): LaneGate;
  /** 08-2 §7.6 over a whole `<say>` (used for repair results and the post-check). */
  filter(text: string): string;
}
export interface LaneGate {
  push(delta: string): void;
  /** The stream ended: release the remainder; resolves when held sentences are rewritten or dropped. */
  end(): Promise<void>;
  /** Text released so far. */
  released(): string;
}
/** 08-4 §25.2 `IntakeAct.tags`. */
export type IntakeTag = 'intent_capabilities';
export type IntakeDecisionView =
  | { kind: 'reply' }
  | { kind: 'react'; emoji: '👍' | '❤️' }
  | Extract<IntakeDecision, { kind: 'job' }>
  | Extract<IntakeDecision, { kind: 'memory' }>
  | { kind: 'ask' | 'handoff' | 'routine' | 'setting' | 'catch_up' };

/** M6 T5: the memory seam of the lane (Engine wires IntakeMemory, MemoryChips and MemoryReview). */
export interface LaneMemory {
  /** Before the intake turn, no AI: J17 "don't remember this"; the review's quiet period restarts. */
  beforeTurn(chat: EngineChat, message: EngineMessage): Promise<void>;
  /** Intake kind `memory` (08-4 §25.2). */
  decide(
    chat: EngineChat,
    helper: EngineHelper | null,
    message: EngineMessage,
    act: { op: 'remember' | 'forget'; text: string },
  ): Promise<void>;
  /** 08-3 §12.5: the "Used: {fact}" chips under the reply `anchorId`. */
  used(chatId: string, anchorId: string, facts: EngineFact[]): Promise<void>;
  /** 08-3 §12.4 trigger: a chat-lane turn answered in `chatId`. */
  answered(chatId: string): void;
  /** A typed answer to a `memory_confirm` card; true = taken. */
  onCardAnswered(a: { cardId: string; answer: CardAnswer; choice?: string; resolvedBy: 'typed' }): Promise<boolean>;
}

/** M4: the job runner's intake seam (08-2 §5.3.3; JobRunner.createJob). */
export interface LaneJobs {
  createJob(input: {
    chatId: string;
    userMessageId: string;
    decision: Extract<IntakeDecision, { kind: 'job' }>;
    askedText: string;
    helperId: string | null;
  }): Promise<string | null>;
  // M5
  /** T10: the plan the user asked to change in this chat (08-2 §5.3.3); `take` clears it. */
  planChange?(chatId: string, take?: boolean): { title: string; steps: string[] } | null;
  /** M4 T3: the runner's branches of 08-2 §5.2 (stop word, yes-text on a tap-only card, steer, fold-which); true = handled. */
  onUserMessage?(m: { chatId: string; messageId: string; text: string }): Promise<boolean>;
  // M5 (T5): a typed answer to a job's Choice card goes to the runner as card.answered (08-2 §5.2, 08-4 §26.6).
  onCardAnswered?(a: { cardId: string; answer: CardAnswer; choice?: string; resolvedBy: 'typed' }): Promise<void>;
}

export interface LaneDeps {
  link: MainLink;
  clock: Clock;
  newId(prefix: 'm' | 't' | 'k'): string;
  settings(): Settings;
  ai: LaneAi;
  protocol: LaneProtocol;
  log(evt: string, kind?: string, ids?: { chatId?: string }): void;
  /** M4: kind 'job' creates a job; the user's bubble keeps 👀 and nothing is posted (Art. 22, 08-4 §25.5). */
  jobs?: LaneJobs;
  // M5
  /** T10: the pre-call cap check of a chat-lane turn (08-2 §5.10 item 4); false = no call. */
  capCheck?(promptChars: number, purpose: 'intake' | 'repair'): Promise<boolean>;
  // M6
  /** T5: memory in the lane (intake remember / forget, chips, review trigger). */
  memory?: LaneMemory;
  // C1
  /** T2: what the Capabilities card reads of the app's state (04 §13.7); without it Gmail and WhatsApp count as off. */
  capabilityState?(): CapabilityState;
}

const MAX_TOTAL = 2; // 08-2 §6.9 chat lane
const CONVERSATION = 20; // 08-2 §7.2 part 7

function words(text: string): number {
  return text.trim().split(/\s+/u).filter(Boolean).length;
}

export class ChatLane {
  private queues = new Map<string, string[]>();
  private busy = new Set<string>();
  private waitingChats: string[] = [];
  private running = 0;
  /** User messages whose turn is running now (a second drain must not answer them twice). */
  private inflight = new Set<string>();
  /** User messages whose turn already ran once more after a tool-use violation. */
  private violationRetried = new Set<string>();
  /** Enqueued by a drain of Waiting-to-send messages: skipped if another turn already answered it. */
  private drained = new Set<string>();
  /** Messages a steer sent back to intake (`new_job`): they skip the runner's branches. */
  private intakeOnly = new Set<string>();
  private aborts = new Map<string, AbortController>();
  /** chat id → the running turn's abort, for Stop (04 §14.4). */
  private chatTurns = new Map<string, { abort: AbortController; stopped: boolean }>();
  /** foo reply id → the user message it answered (04 §19.4 Try again). */
  private answered = new Map<string, string>();
  /** R1 T6: user messages that are side questions; every foo row answering one carries `side = 1` (04 §17.5). */
  private sideTurns = new Set<string>();
  /** Resolves when every queued turn has finished (tests). */
  private idleWaiters: (() => void)[] = [];

  constructor(private d: LaneDeps) {}

  // M5 (T5)
  private typedDeps: TypedHookDeps = {
    now: () => this.d.clock.now(),
    newId: (p) => this.d.newId(p),
    query: (q, ...args) => this.query(q, ...args),
    tx: (ops) => this.tx(ops),
    answerJobCard: async (a) => {
      // M6 T5: a `memory_confirm` card is the memory seam's, not the runner's.
      if (await this.d.memory?.onCardAnswered(a)) return;
      await this.d.jobs?.onCardAnswered?.(a);
    },
  };

  /** A user message main stored (MainToEngine user.message). */
  enqueue(chatId: string, messageId: string, opts: { onlyIfQueued?: boolean; intakeOnly?: boolean } = {}): void {
    if (opts.onlyIfQueued) this.drained.add(messageId);
    if (opts.intakeOnly) this.intakeOnly.add(messageId);
    const q = this.queues.get(chatId) ?? [];
    if (this.inflight.has(messageId)) return;
    if (!q.includes(messageId)) q.push(messageId);
    this.queues.set(chatId, q);
    this.pump(chatId);
  }

  /** 04 §19.4 "Try again" on a cut-off reply. */
  retry(fooMessageId: string): boolean {
    const userId = this.answered.get(fooMessageId);
    if (!userId) return false;
    // One retry per cut-off bubble: repeated clicks do not answer twice.
    this.answered.delete(fooMessageId);
    void this.messageById(userId).then((m) => m && this.enqueue(m.chatId, m.id));
    return true;
  }

  /** 04 §14.4 Stop: the reply that is coming in stops; what was shown stays, with "Stopped." under it. */
  stop(chatId: string): boolean {
    const t = this.chatTurns.get(chatId);
    if (!t) return false;
    t.stopped = true;
    t.abort.abort();
    return true;
  }

  cancelAll(): void {
    for (const a of this.aborts.values()) a.abort();
  }

  idle(): Promise<void> {
    if (this.running === 0 && [...this.queues.values()].every((q) => q.length === 0)) return Promise.resolve();
    return new Promise((r) => this.idleWaiters.push(r));
  }

  private pump(chatId: string): void {
    if (this.busy.has(chatId)) return;
    const q = this.queues.get(chatId);
    if (!q?.length) return;
    if (this.running >= MAX_TOTAL) {
      if (!this.waitingChats.includes(chatId)) this.waitingChats.push(chatId);
      return;
    }
    const messageId = q.shift()!;
    this.busy.add(chatId);
    this.running += 1;
    this.inflight.add(messageId);
    void this.turn(chatId, messageId)
      .catch((e: unknown) => this.d.log('chat.turn_crashed', 'UNKNOWN', { chatId }) ?? console.error(e))
      .finally(() => {
        this.busy.delete(chatId);
        this.running -= 1;
        this.inflight.delete(messageId);
        this.sideTurns.delete(messageId);
        this.pump(chatId);
        const next = this.waitingChats.shift();
        if (next) this.pump(next);
        if (this.running === 0 && [...this.queues.values()].every((x) => x.length === 0)) {
          for (const w of this.idleWaiters.splice(0)) w();
        }
      });
  }

  private async tx(ops: DbOp[]): Promise<Result<DbTxReply>> {
    return this.d.link.request<DbTxReply>('db.tx', { ops });
  }
  private async query<T>(q: string, ...args: unknown[]): Promise<T | null> {
    const r = await this.d.link.request<T>('db.query', { q, args });
    return r.ok ? r.value : null;
  }
  private messageById(id: string): Promise<EngineMessage | null> {
    return this.query<EngineMessage>('messageById', id);
  }
  private typing(chatId: string, on: boolean, who: string): void {
    this.d.link.send('ui.patch', { event: 'chat:typing', payload: { chatId, on, who } });
  }

  private async turn(chatId: string, messageId: string): Promise<void> {
    const message = await this.messageById(messageId);
    const fromDrain = this.drained.delete(messageId);
    if (!message || message.authorKind !== 'user') return;
    if (fromDrain && message.status !== 'queued') return;
    // M4 T3: stop, steer and the G16 reply come before the intake turn and need no AI (08-2 §5.2). R1 T6: a side question
    // never reaches the runner's branches (04 §17.5: it never cancels or re-plans a running job).
    const side = message.side === true;
    if (side) this.sideTurns.add(messageId);
    else this.sideTurns.delete(messageId);
    const intakeOnly = this.intakeOnly.delete(messageId) || side;
    // M5 (T5): a typed answer to an open Choice or tiles card comes after the stop word and before the G16 reply (08-2 §5.2).
    if (!intakeOnly && message.kind === 'text' && (await answerTyped(this.typedDeps, { chatId, messageId, text: message.text }))) return;
    if (!intakeOnly && message.kind === 'text' && (await this.d.jobs?.onUserMessage?.({ chatId, messageId, text: message.text }))) return;
    const pick = this.d.ai.pick();
    if (!pick) {
      // 04 §3.3 Waiting to send: foo cannot hand it on now; drained when the AI is back (Engine.drainQueued).
      if (message.status !== 'queued') await this.tx([{ op: 'update', table: 'messages', id: messageId, set: { status: 'queued' } }]);
      return;
    }
    const chat = await this.query<EngineChat>('chatOpen', chatId);
    if (!chat) return;
    const helper = chat.helperId ? await this.query<EngineHelper>('helpers.byId', chat.helperId) : null;
    // M6 T5: J17 "don't remember this" is read before the turn, with no AI.
    await this.d.memory?.beforeTurn(chat, message);
    const history = (await this.query<EngineMessage[]>('messagesBefore', chatId, message.seq, CONVERSATION * 2)) ?? [];
    const conversation = history
      .filter((m) => m.kind !== 'marker' && (m.status === 'complete' || m.status === 'sent'))
      .slice(-CONVERSATION);
    const settings = this.d.settings();
    const who = helper?.name ?? settings.identity.agentName;

    const memory = await buildMemoryParts((q, ...args) => this.query(q, ...args), {
      chatId,
      text: message.textForAi ?? message.text,
      timeZone: settings.locale.timeZone,
      now: this.d.clock.now(),
    });
    let built: { system: string; prompt: string; factIds?: string[] } | null;
    try {
      const oldPlan = side ? null : (this.d.jobs?.planChange?.(chatId) ?? null);
      built = this.d.protocol.buildIntake({
        settings,
        chat,
        helper,
        conversation,
        message: side ? await this.sideMessage(message) : message,
        local: pick.billing === 'local',
        memory,
        ...(oldPlan ? { oldPlan } : {}),
      });
    } catch {
      built = null;
    }
    // M5 T10 (CR-0008 (j) row 5): the pre-call cap check covers intake turns (08-2 §5.10 item 4). At the cap the message
    // waits to send (04 §3.3, composer "Messages wait until you raise it") and is drained when the cap is lifted.
    if (built && this.d.capCheck && !(await this.d.capCheck(built.system.length + built.prompt.length, 'intake'))) {
      if (message.status !== 'queued') await this.tx([{ op: 'update', table: 'messages', id: messageId, set: { status: 'queued' } }]);
      return;
    }

    // ✓✓ Delivered: the lane accepted it (04 §3.3). 👀 shows now, within 1 s of send, while foo thinks (04 §4.2, §14.1;
    // UX-08-02 draws it beside the Thinking row).
    const understood =
      chat.kind === 'group' || chat.kind === 'wa_mirror' || message.kind !== 'text'
        ? []
        : // A side question's AI text carries foo's quoted words; the line reads only the user's own (redacted again inside).
          understoodItems(side ? message.text : (message.textForAi ?? message.text), {
            now: this.d.clock.now(),
            timeZone: settings.locale.timeZone,
          });
    await this.tx([
      {
        op: 'update',
        table: 'messages',
        id: messageId,
        set: { status: 'complete', badge: 'seen', understood: understood.length ? JSON.stringify(understood) : null },
      },
    ]);
    this.typing(chatId, true, who);

    const turnId = this.d.newId('t');
    const startedAt = this.d.clock.now();
    if (!built) {
      // A message over the prompt budget (PromptBudgetError) or a broken prompt file: the reply is cut off with Try again
      // instead of leaving 👀 and the Thinking row up (04 §19.4).
      this.d.log('chat.prompt_failed', 'PROTOCOL_INVALID', { chatId });
      await this.cutOff(chatId, messageId, null, who, '', helper, pick.backup ? 'backup' : null);
      await this.turnRow(
        turnId,
        chatId,
        pick,
        startedAt,
        { text: '', usage: emptyUsage(), stopReason: 'error', errorKind: 'PROTOCOL_INVALID' },
        'error',
      );
      return;
    }
    const params = this.d.ai.turnParams(pick.providerId, 'intake');
    const abort = new AbortController();
    this.aborts.set(turnId, abort);
    const live = { abort, stopped: false };
    this.chatTurns.set(chatId, live);

    let fooId: string | null = null;
    let deltaSeq = 0;
    let pending = Promise.resolve();
    const later = (fn: () => Promise<unknown>) => {
      pending = pending.then(fn).then(() => undefined);
    };
    const providerNote = pick.backup ? 'backup' : null;
    const gate = this.d.protocol.gate((text, mode) => {
      later(async () => {
        // Nothing reaches the bubble after Stop or a cut-off (08-4 §30.7), not even a held sentence's late rewrite.
        if (abort.signal.aborted) return;
        if (!fooId) {
          fooId = this.d.newId('m');
          this.answered.set(fooId, messageId);
          this.typing(chatId, false, who);
          await this.tx([
            {
              op: 'insert',
              table: 'messages',
              row: {
                id: fooId,
                chat_id: chatId,
                author_kind: helper ? 'helper' : 'foo',
                author_id: helper?.id ?? null,
                kind: 'text',
                text: mode === 'whole' ? text : '',
                status: mode === 'whole' ? 'complete' : 'streaming',
                provider_note: providerNote,
                created_at: this.d.clock.now(),
                ...(side ? { side: 1 } : {}),
              },
            },
            // 04 §4.1 rule 4: the plain answer's 👀 goes when the first word appears.
            { op: 'update', table: 'messages', id: messageId, set: { badge: null } },
          ]);
          if (mode === 'whole') return;
        }
        deltaSeq += 1;
        this.d.link.send('ui.patch', { event: 'message:delta', payload: { messageId: fooId, seq: deltaSeq, append: text } });
      });
    }, abort.signal);
    const sink: TurnSink = {
      onText: (delta) => {
        if (abort.signal.aborted) return; // 08-4 §30.7: nothing after cancel
        gate.push(delta);
      },
      onSession: () => {},
    };

    const req: TurnRequest = { ...params, turnId, purpose: 'intake', system: built.system, prompt: built.prompt, chatId };
    let result: TurnResult;
    try {
      result = await this.d.ai.runTurn(pick.providerId, req, sink, abort.signal);
    } catch {
      result = { text: '', usage: emptyUsage(), stopReason: 'error', errorKind: 'UNKNOWN' };
    } finally {
      this.aborts.delete(turnId);
      this.chatTurns.delete(chatId);
    }

    if (live.stopped) {
      abort.abort();
      await pending;
      const shown = gate.released().trimEnd();
      if (fooId)
        await this.tx([{ op: 'update', table: 'messages', id: fooId, set: { text: shown, status: 'complete', badge: 'stopped' } }]);
      else await this.tx([{ op: 'update', table: 'messages', id: messageId, set: { badge: null } }]);
      this.typing(chatId, false, who);
      await this.turnRow(turnId, chatId, pick, startedAt, result, 'cancelled');
      return;
    }

    const failed = result.stopReason === 'error' || result.stopReason === 'cancelled';
    if (failed && result.errorKind === 'AI_PROTOCOL_VIOLATION' && !fooId && !this.violationRetried.has(messageId)) {
      // 08-2 §6.5: the AI used a tool; the turn runs once more before it counts as broken.
      this.violationRetried.add(messageId);
      abort.abort();
      await pending;
      this.d.ai.reportError(pick.providerId, 'AI_PROTOCOL_VIOLATION');
      await this.turnRow(turnId, chatId, pick, startedAt, result, 'error');
      return this.turn(chatId, messageId);
    }
    if (failed) {
      abort.abort();
      await pending;
      await this.cutOff(chatId, messageId, fooId, who, gate.released().trimEnd(), helper, providerNote);
      this.d.ai.reportError(pick.providerId, result.errorKind ?? 'UNKNOWN', result.resetAt);
      await this.turnRow(turnId, chatId, pick, startedAt, result, result.errorKind === 'AI_TIMEOUT' ? 'timeout' : 'error');
      return;
    }
    this.d.ai.reportOk(pick.providerId);
    // M5 T10: the changed plan went with a turn that answered; the next message is a fresh one.
    if (!side) this.d.jobs?.planChange?.(chatId, true);
    await gate.end();
    await pending;

    const parsed = this.d.protocol.parse(result.text);
    let act = parsed.act;
    let usedMemoryIds = act ? (parsed.usedMemoryIds ?? []) : [];
    let tags = act ? (parsed.tags ?? []) : [];
    if (!act) {
      // 08-2 §7.5: one repair turn (same session); its <say> is ignored after streaming (08-4 §25.5 item 3).
      const repairParams = this.d.ai.turnParams(pick.providerId, 'repair');
      const repairPrompt = this.d.protocol.buildRepair(parsed.issues ?? '');
      // M5 T10 (row 5): the repair turn passes the cap check too; at the cap it is skipped (the <say> rule below still applies).
      const capOk = !this.d.capCheck || (await this.d.capCheck(built.system.length + repairPrompt.length, 'repair'));
      const repaired = !capOk
        ? null
        : await this.d.ai
            .runTurn(
              pick.providerId,
              {
                ...repairParams,
                turnId: this.d.newId('t'),
                purpose: 'repair',
                system: built.system,
                prompt: repairPrompt,
                chatId,
              },
              { onText: () => {}, onSession: () => {} },
              new AbortController().signal,
            )
            .catch(() => null);
      const fixed = repaired && repaired.stopReason === 'end' ? this.d.protocol.parseAct(repaired.text) : null;
      act = fixed?.act ?? null;
      if (act) {
        usedMemoryIds = fixed?.usedMemoryIds ?? [];
        tags = fixed?.tags ?? [];
      }
      if (!act) this.d.log('chat.protocol_invalid', 'PROTOCOL_INVALID', { chatId });
      // A valid <say> with a broken <act> is still posted as a plain reply (08-2 §7.5).
      if (!act && parsed.say.trim()) act = { kind: 'reply' };
    }
    // R1 T6: a side question is answered, never turned into a job, a memory change or a setting (04 §17.5).
    if (side && act && act.kind !== 'react') act = { kind: 'reply' };
    const kind = act?.kind ?? 'reply';
    const released = gate.released().trimEnd();
    if (kind !== 'reply' && released.trim()) this.d.log('chat.say_leak', 'PROTOCOL_SAY_LEAK', { chatId });

    const memoryKind = act?.kind === 'memory' && this.d.memory ? act : null;
    if (kind === 'reply' || (kind !== 'react' && !(kind === 'job' && this.d.jobs) && !memoryKind && released.trim())) {
      if (fooId) {
        // P1 T6: the follow-ups the reply's own `Suggestions:` line held (the gate kept the line out of the bubble).
        const trailer = kind === 'reply' ? splitSuggestions(parsed.say) : null;
        const suggestions = trailer?.suggestions ?? null;
        // R1 T7: the action chips the reply's own `Actions:` line held (04-2 §21.7; the gate kept it out of the bubble too).
        const actions = trailer ? splitActions(trailer.text).actions : null;
        await this.tx([
          {
            op: 'update',
            table: 'messages',
            id: fooId,
            set: { text: released, status: 'complete', ...(suggestions ? { suggestions } : {}), ...(actions ? { actions } : {}) },
          },
        ]);
        // C1 T2 (04 §13.7): the one-sentence reply, then the app-built Capabilities card.
        if (kind === 'reply' && !side && tags.includes('intent_capabilities')) await this.capabilitiesCard(chatId, helper);
      } else {
        // Nothing passed the filters: 08-4 §25.5 item 6 (F-092).
        await this.emptyReply(chatId, messageId, message, helper, who, providerNote);
      }
    } else if (act && act.kind === 'job' && this.d.jobs) {
      // 08-2 §5.3.3: the runner takes over; its checklist and result are what the user sees next (ART-22).
      if (fooId) await this.tx([{ op: 'update', table: 'messages', id: fooId, set: { text: released, status: 'complete' } }]);
      await this.d.jobs.createJob({
        chatId,
        userMessageId: messageId,
        decision: act,
        askedText: message.textForAi ?? message.text,
        helperId: helper?.id ?? null,
      });
    } else if (memoryKind && this.d.memory) {
      // M6 T5 (08-4 §25.5 item 5): text already released stands; the reaction, chip or card follows it.
      if (fooId) await this.tx([{ op: 'update', table: 'messages', id: fooId, set: { text: released, status: 'complete' } }]);
      await this.d.memory.decide(chat, helper, message, memoryKind);
    } else if (act && act.kind === 'react') {
      // Words that already showed past the hold stay as a finished bubble (they cannot be taken back); the 👍 still goes on.
      if (fooId) await this.tx([{ op: 'update', table: 'messages', id: fooId, set: { text: released, status: 'complete' } }]);
      await this.react(messageId, act.emoji, helper);
    } else {
      // Kinds built in later milestones (see the header).
      this.d.log('chat.kind_not_built', undefined, { chatId });
      await this.post(chatId, messageId, t('thread.reply.empty'), helper, providerNote);
    }
    this.typing(chatId, false, who);
    await this.recordUses(chatId, usedMemoryIds, built.factIds ?? [], memory);
    // M6 T5 (08-3 §12.5): "Used: {fact} ✕" under the reply, for the offered facts the AI named.
    if (kind === 'reply' && fooId && this.d.memory) {
      const used = usedFacts(usedMemoryIds, built.factIds ?? [], memory);
      if (used.length) await this.d.memory.used(chatId, fooId, used);
    }
    await this.turnRow(turnId, chatId, pick, startedAt, result, 'ok');
    this.d.memory?.answered(chatId);
  }

  /**
   * 04 §17.5: the side question as the AI reads it: the words it asks about above the question. Main already folded the
   * picked words in (message:send `quote`); without them the whole replied-to message is the quote. The user's bubble shows
   * only the question.
   */
  private async sideMessage(message: EngineMessage): Promise<EngineMessage> {
    if (isSideAiText(message.textForAi)) return message;
    const quoted = message.replyToId ? await this.messageById(message.replyToId) : null;
    const about = quoted ? (quoted.textForAi ?? quoted.text).trim() : '';
    if (!about) return message;
    const asked = message.textForAi ?? message.text;
    return { ...message, textForAi: sideAiText(about, asked) };
  }

  /** 08-4 §24.16 item 6: each offered id the AI names gets `last_used_at`, `use_count` + 1 and one `memory_uses` row. */
  private async recordUses(chatId: string, named: string[], offered: string[], memory: MemoryParts): Promise<void> {
    const ops = memoryUseOps(named, offered, memory, this.d.clock.now(), { chatId, jobId: null });
    if (!ops.length) return;
    const r = await this.tx(ops);
    if (!r.ok) this.d.log('memory.uses_failed', r.error.kind, { chatId });
  }

  private async emptyReply(
    chatId: string,
    messageId: string,
    message: EngineMessage,
    helper: EngineHelper | null,
    who: string,
    note: string | null,
  ): Promise<void> {
    if (words(message.textForAi ?? message.text) <= 6) await this.react(messageId, '👍', helper);
    else await this.post(chatId, messageId, t('thread.reply.empty'), helper, note);
    this.typing(chatId, false, who);
  }

  /** foo's reaction on the user's bubble takes the badge slot (04 §4.1 rule 5); no message is posted (AT-027). */
  async react(messageId: string, emoji: '👍' | '❤️', helper: EngineHelper | null): Promise<void> {
    await this.tx([
      { op: 'insert', table: 'reactions', row: { message_id: messageId, by: helper?.id ?? 'foo', emoji, created_at: this.d.clock.now() } },
      { op: 'update', table: 'messages', id: messageId, set: { badge: null } },
    ]);
  }

  /**
   * 04 §13.7: a kit card (05 §0.1) with the rows the app's state allows now; the words are resolved here, so an older card
   * keeps its rows when the state changes and asking again posts a fresh card. 08-1 §4.3.3 insert order: message, then card.
   */
  private async capabilitiesCard(chatId: string, helper: EngineHelper | null): Promise<void> {
    const state = this.d.capabilityState?.() ?? { gmailConnected: false, whatsappLinked: false };
    const cardId = this.d.newId('k');
    const messageId = this.d.newId('m');
    const now = this.d.clock.now();
    const r = await this.tx([
      {
        op: 'insert',
        table: 'messages',
        row: {
          id: messageId,
          chat_id: chatId,
          author_kind: helper ? 'helper' : 'foo',
          author_id: helper?.id ?? null,
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
          type: 'kit',
          state: 'shown',
          payload: { app: CAPABILITIES_APP, capabilities: capabilitiesSurface(state) },
          nonce: newNonce(),
          created_at: now,
        },
      },
    ]);
    if (!r.ok) this.d.log('chat.capabilities_failed', r.error.kind, { chatId });
  }

  async post(chatId: string, messageId: string, text: string, helper: EngineHelper | null, note: string | null): Promise<void> {
    const id = this.d.newId('m');
    this.answered.set(id, messageId);
    await this.tx([
      {
        op: 'insert',
        table: 'messages',
        row: {
          id,
          chat_id: chatId,
          author_kind: helper ? 'helper' : 'foo',
          author_id: helper?.id ?? null,
          kind: 'text',
          text,
          status: 'complete',
          provider_note: note,
          created_at: this.d.clock.now(),
          ...(this.sideTurns.has(messageId) ? { side: 1 } : {}),
        },
      },
      { op: 'update', table: 'messages', id: messageId, set: { badge: null } },
    ]);
  }

  /** 04 §19.4: the partial text stays (or an empty foo bubble), status `failed`; the user's 👀 goes. */
  private async cutOff(
    chatId: string,
    messageId: string,
    fooId: string | null,
    who: string,
    released: string,
    helper: EngineHelper | null,
    note: string | null,
  ): Promise<void> {
    this.typing(chatId, false, who);
    if (fooId) {
      await this.tx([
        { op: 'update', table: 'messages', id: fooId, set: { text: released, status: 'failed' } },
        { op: 'update', table: 'messages', id: messageId, set: { badge: null } },
      ]);
      return;
    }
    const id = this.d.newId('m');
    this.answered.set(id, messageId);
    await this.tx([
      {
        op: 'insert',
        table: 'messages',
        row: {
          id,
          chat_id: chatId,
          author_kind: helper ? 'helper' : 'foo',
          author_id: helper?.id ?? null,
          kind: 'text',
          text: '',
          status: 'failed',
          provider_note: note,
          created_at: this.d.clock.now(),
          ...(this.sideTurns.has(messageId) ? { side: 1 } : {}),
        },
      },
      { op: 'update', table: 'messages', id: messageId, set: { badge: null } },
    ]);
  }

  private async turnRow(
    turnId: string,
    chatId: string,
    pick: { providerId: ProviderId; billing: 'plan' | 'key' | 'local' },
    startedAt: number,
    r: TurnResult,
    outcome: 'ok' | 'error' | 'cancelled' | 'timeout',
  ): Promise<void> {
    const cost = this.d.ai.costPaise(pick.providerId, r.usage, r.modelReported);
    await this.tx([
      {
        op: 'insert',
        table: 'ai_turns',
        row: {
          id: turnId,
          chat_id: chatId,
          purpose: 'intake',
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
          duration_ms: this.d.clock.now() - startedAt,
          outcome,
          error_kind: outcome === 'ok' ? null : (r.errorKind ?? 'UNKNOWN'),
          started_at: startedAt,
        },
      },
    ]);
  }
}

export function emptyUsage(): AiUsage {
  return { tokensIn: null, tokensOut: null, cacheRead: null, cacheWrite: null, costUsd: null };
}
