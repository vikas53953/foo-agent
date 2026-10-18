// Spec: 08-2 §5.2 (every user message gets one intake turn), §6.9 (chat lane: 1 per chat, 2 in total), §7.2–§7.6 (prompt,
// FOO/1 envelope, repair once, output filters), 08-4 §24.1 (intake parts), §25.2 (IntakeAct), §25.5 (release gate; what is
// posted per kind, F-095; empty reply → 👍 or "I didn't get that. Say it another way?", F-092), §30.1 (intake: 60 s, stream),
// §30.7 (at 60 s the turn is cancelled and no late text is posted), 04 §3.3 (ticks: ✓✓ delivered when the lane accepts the
// message, read on the first byte), §4.1 rule 4 (a plain answer's badge is `seen` and goes when the first word appears),
// §14.3 (Thinking row only while a request is really in flight: chat:typing), §19.4 (cut-off reply: partial text stays,
// bubble status `failed`), 08-1 §4.3.5 (ai_turns row per turn), Art. 12 (AI words never move a status), Art. 16, 22.
// M3 builds `reply` and `react`; the other intake kinds (job, ask, handoff, routine, memory, setting, catch_up) arrive with
// M4–M8. Until then their unreleased `<say>` is discarded and foo posts the empty-reply line so it never goes silent
// (GAPS.md 2026-10-18 "intake kinds before their milestone").
import { t } from '../../shared/copy/t';
import type { Clock } from '../../shared/clock';
import type { Result } from '../../shared/errors';
import type { Settings } from '../../shared/settings';
import type { ProviderId } from '../../shared/types';
import type { EngineChat, EngineHelper, EngineMessage } from '../../main/db/queries';
import type { DbOp, DbTxReply, MainLink } from '../protocol';
import type { AiErrorKind, AiUsage, TurnRequest, TurnResult, TurnSink } from '../ai/types';

/** The your-AI service the lane talks to (Engine wires AiService). */
export interface LaneAi {
  /** The provider a chat turn uses now (primary, or the backup while the primary rests, 08-4 §30.9), or null. */
  pick(): { providerId: ProviderId; billing: 'plan' | 'key' | 'local'; backup: boolean } | null;
  turnParams(
    providerId: ProviderId,
    purpose: 'intake' | 'repair' | 'rewrite',
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
}

/** The reply protocol (builder B's modules, wired by Engine). */
export interface LaneProtocol {
  buildIntake(input: IntakeInput): { system: string; prompt: string };
  buildRepair(issues: string): string;
  /** Parse the whole reply: the `<say>` text and the validated IntakeAct, or the zod issues. */
  parse(text: string): { say: string; act: IntakeDecisionView | null; issues: string | null };
  parseAct(text: string): { act: IntakeDecisionView | null; issues: string | null };
  /** The release gate for one streamed turn (08-4 §25.5 item 2). */
  gate(onRelease: (text: string, mode: 'whole' | 'sentence') => void): LaneGate;
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
export type IntakeDecisionView =
  | { kind: 'reply' }
  | { kind: 'react'; emoji: '👍' | '❤️' }
  | { kind: 'ask' | 'handoff' | 'job' | 'routine' | 'memory' | 'setting' | 'catch_up' };

export interface LaneDeps {
  link: MainLink;
  clock: Clock;
  newId(prefix: 'm' | 't'): string;
  settings(): Settings;
  ai: LaneAi;
  protocol: LaneProtocol;
  log(evt: string, kind?: string, ids?: { chatId?: string }): void;
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
  private aborts = new Map<string, AbortController>();
  /** foo reply id → the user message it answered (04 §19.4 Try again). */
  private answered = new Map<string, string>();
  /** Resolves when every queued turn has finished (tests). */
  private idleWaiters: (() => void)[] = [];

  constructor(private d: LaneDeps) {}

  /** A user message main stored (MainToEngine user.message). */
  enqueue(chatId: string, messageId: string): void {
    const q = this.queues.get(chatId) ?? [];
    if (!q.includes(messageId)) q.push(messageId);
    this.queues.set(chatId, q);
    this.pump(chatId);
  }

  /** 04 §19.4 "Try again" on a cut-off reply. */
  retry(fooMessageId: string): boolean {
    const userId = this.answered.get(fooMessageId);
    if (!userId) return false;
    void this.messageById(userId).then((m) => m && this.enqueue(m.chatId, m.id));
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
    void this.turn(chatId, messageId)
      .catch((e: unknown) => this.d.log('chat.turn_crashed', 'UNKNOWN', { chatId }) ?? console.error(e))
      .finally(() => {
        this.busy.delete(chatId);
        this.running -= 1;
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
    if (!message || message.authorKind !== 'user') return;
    const pick = this.d.ai.pick();
    if (!pick) {
      // 04 §3.3 Waiting to send: foo cannot hand it on now; drained when the AI is back (Engine.drainQueued).
      if (message.status !== 'queued') await this.tx([{ op: 'update', table: 'messages', id: messageId, set: { status: 'queued' } }]);
      return;
    }
    const chat = await this.query<EngineChat>('chatOpen', chatId);
    if (!chat) return;
    const helper = chat.helperId ? await this.query<EngineHelper>('helpers.byId', chat.helperId) : null;
    const history = (await this.query<EngineMessage[]>('messagesBefore', chatId, message.seq, CONVERSATION * 2)) ?? [];
    const conversation = history
      .filter((m) => m.kind !== 'marker' && (m.status === 'complete' || m.status === 'sent'))
      .slice(-CONVERSATION);
    const settings = this.d.settings();
    const who = helper?.name ?? settings.identity.agentName;

    // ✓✓ Delivered: the lane accepted it (04 §3.3).
    await this.tx([{ op: 'update', table: 'messages', id: messageId, set: { status: 'complete' } }]);
    this.typing(chatId, true, who);

    const built = this.d.protocol.buildIntake({ settings, chat, helper, conversation, message, local: pick.billing === 'local' });
    const turnId = this.d.newId('t');
    const startedAt = this.d.clock.now();
    const params = this.d.ai.turnParams(pick.providerId, 'intake');
    const abort = new AbortController();
    this.aborts.set(turnId, abort);

    let fooId: string | null = null;
    let deltaSeq = 0;
    let firstByte = false;
    let pending = Promise.resolve();
    const later = (fn: () => Promise<unknown>) => {
      pending = pending.then(fn).then(() => undefined);
    };
    const providerNote = pick.backup ? 'backup' : null;
    const gate = this.d.protocol.gate((text, mode) => {
      later(async () => {
        if (abort.signal.aborted && !fooId) return;
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
    });
    const sink: TurnSink = {
      onText: (delta) => {
        if (abort.signal.aborted) return; // 08-4 §30.7: nothing after cancel
        if (!firstByte) {
          firstByte = true;
          // Read (04 §3.3) and 👀 (04 §4.2 `seen`).
          later(() => this.tx([{ op: 'update', table: 'messages', id: messageId, set: { badge: 'seen' } }]));
        }
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
    }

    const failed = result.stopReason === 'error' || result.stopReason === 'cancelled';
    if (failed) {
      abort.abort();
      await pending;
      await this.cutOff(chatId, messageId, fooId, who, gate.released(), helper, providerNote);
      this.d.ai.reportError(pick.providerId, result.errorKind ?? 'UNKNOWN', result.resetAt);
      await this.turnRow(turnId, chatId, pick, startedAt, result, result.errorKind === 'AI_TIMEOUT' ? 'timeout' : 'error');
      return;
    }
    this.d.ai.reportOk(pick.providerId);
    await gate.end();
    await pending;

    const parsed = this.d.protocol.parse(result.text);
    let act = parsed.act;
    if (!act) {
      // 08-2 §7.5: one repair turn (same session); its <say> is ignored after streaming (08-4 §25.5 item 3).
      const repairParams = this.d.ai.turnParams(pick.providerId, 'repair');
      const repaired = await this.d.ai
        .runTurn(
          pick.providerId,
          {
            ...repairParams,
            turnId: this.d.newId('t'),
            purpose: 'repair',
            system: built.system,
            prompt: this.d.protocol.buildRepair(parsed.issues ?? ''),
            chatId,
          },
          { onText: () => {}, onSession: () => {} },
          new AbortController().signal,
        )
        .catch(() => null);
      act = repaired && repaired.stopReason === 'end' ? this.d.protocol.parseAct(repaired.text).act : null;
      if (!act) this.d.log('chat.protocol_invalid', 'PROTOCOL_INVALID', { chatId });
      // A valid <say> with a broken <act> is still posted as a plain reply (08-2 §7.5).
      if (!act && parsed.say.trim()) act = { kind: 'reply' };
    }
    const kind = act?.kind ?? 'reply';
    const released = gate.released();
    if (kind !== 'reply' && released.trim()) this.d.log('chat.say_leak', 'PROTOCOL_SAY_LEAK', { chatId });

    if (kind === 'reply' || (kind !== 'react' && released.trim())) {
      if (fooId) {
        await this.tx([{ op: 'update', table: 'messages', id: fooId, set: { text: released, status: 'complete' } }]);
      } else {
        // Nothing passed the filters: 08-4 §25.5 item 6 (F-092).
        await this.emptyReply(chatId, messageId, message, helper, who, providerNote);
      }
    } else if (act && act.kind === 'react') {
      await this.react(messageId, act.emoji, helper);
    } else {
      // Kinds built in later milestones (see the header).
      this.d.log('chat.kind_not_built', undefined, { chatId });
      await this.post(chatId, messageId, t('thread.reply.empty'), helper, providerNote);
    }
    this.typing(chatId, false, who);
    await this.turnRow(turnId, chatId, pick, startedAt, result, 'ok');
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
  private async react(messageId: string, emoji: '👍' | '❤️', helper: EngineHelper | null): Promise<void> {
    await this.tx([
      { op: 'insert', table: 'reactions', row: { message_id: messageId, by: helper?.id ?? 'foo', emoji, created_at: this.d.clock.now() } },
      { op: 'update', table: 'messages', id: messageId, set: { badge: null } },
    ]);
  }

  private async post(chatId: string, messageId: string, text: string, helper: EngineHelper | null, note: string | null): Promise<void> {
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
