// Spec: 08-1 §2.4 (main ⇄ engine messages; every payload zod-validated on receipt; requests get `{ re, result }`), §2.4.1
// (db.tx, db.query), §3.3 (ui.patch forwarded to the renderer as-is), 08-0 §A (main owns settings.json: the engine's
// your-AI results are written here), 08-5 §3.1 (AiStatus). Electron-free so unit tests drive it with an in-process engine.
import { engineToMainSchema, type DbOp, type EngineToMain, type MainToEngine, type NamedQuery } from '../../engine/protocol';
import type { Result } from '../../shared/errors';
import type { EventChannel, EventPayload } from '../../shared/ipc';
import type { Settings } from '../../shared/settings';
import type { AiStatus, ProviderId } from '../../shared/types';
import type { Db } from '../store/db';
import { applyDbOps, runNamedQuery } from './engineHost';

export interface BridgeContext {
  db: Db;
  settings: { get(): Settings; update(fn: (s: Settings) => Settings): void };
  emit<E extends EventChannel>(event: E, payload: EventPayload[E]): void;
  /** message:upsert / chat:upsert for rows a db.tx wrote. */
  emitMessage(messageId: string): void;
  emitChat(chatId: string): void;
  log?(line: unknown): void;
}

type AiStatePayload = Extract<EngineToMain, { kind: 'ai.state' }>['payload'];

/** Main's half of the engine port. `post` is set by the transport (MessagePort in production, a function in tests). */
export class EngineBridge {
  post: (msg: MainToEngine) => void = () => {};
  /** True while an engine process is connected (FOO_TEST runs without FOO_FAKE_AI run no engine: rule 5, no real AI). */
  live = false;
  private seq = 0;
  private waiters = new Map<string, (r: Result<unknown>) => void>();
  /** The engine's last AiStatus (08-2 §6.7 states main cannot see: limit, down, signed out). */
  aiStatus: AiStatus | null = null;

  constructor(private ctx: BridgeContext) {}

  nextId(): string {
    this.seq += 1;
    return `me${this.seq}`;
  }

  /** Fire-and-forget message to the engine. */
  send<K extends MainToEngine['kind']>(kind: K, payload: Extract<MainToEngine, { kind: K }>['payload']): void {
    if (!this.live) return;
    this.post({ id: this.nextId(), kind, payload } as MainToEngine);
  }

  /** A request the engine answers with `{ re, result }` (ai.cmd). */
  request<T, K extends MainToEngine['kind'] = MainToEngine['kind']>(
    kind: K,
    payload: Extract<MainToEngine, { kind: K }>['payload'],
    timeoutMs = 60_000,
  ): Promise<Result<T>> {
    const id = this.nextId();
    if (!this.live) return Promise.resolve({ ok: false, error: { kind: 'UNKNOWN', message: 'no engine' } });
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiters.delete(id);
        resolve({ ok: false, error: { kind: 'UNKNOWN', message: 'engine did not answer' } });
      }, timeoutMs);
      this.waiters.set(id, (r) => {
        clearTimeout(timer);
        resolve(r as Result<T>);
      });
      this.post({ id, kind, payload } as MainToEngine);
    });
  }

  /** The engine is gone (crash, quit): every open request fails at once. */
  failPending(): void {
    for (const [id, w] of this.waiters) {
      this.waiters.delete(id);
      w({ ok: false, error: { kind: 'UNKNOWN', message: 'engine stopped' } });
    }
  }

  /** One message from the engine. Returns the reply to post back (for db.tx / db.query), or null. */
  receive(raw: unknown): { re: string; result: Result<unknown> } | null {
    if (raw && typeof raw === 'object' && 're' in raw) {
      const r = raw as { re: string; result: Result<unknown> };
      this.waiters.get(r.re)?.(r.result);
      this.waiters.delete(r.re);
      return null;
    }
    const parsed = engineToMainSchema.safeParse(raw);
    if (!parsed.success) {
      console.warn('IPC_REJECTED engine message failed validation');
      const id = raw && typeof raw === 'object' && 'id' in raw ? String((raw as { id: unknown }).id) : '';
      return id ? { re: id, result: { ok: false, error: { kind: 'IPC_REJECTED' } } } : null;
    }
    const msg = parsed.data;
    switch (msg.kind) {
      case 'db.tx': {
        const { result, effects } = applyDbOps(this.ctx.db, msg.payload.ops as DbOp[]);
        for (const id of effects.messageIds) this.ctx.emitMessage(id);
        for (const id of effects.chatIds) this.ctx.emitChat(id);
        return { re: msg.id, result };
      }
      case 'db.query':
        return { re: msg.id, result: runNamedQuery(this.ctx.db, msg.payload.q as NamedQuery, msg.payload.args) };
      case 'ui.patch':
        this.ctx.emit(msg.payload.event as EventChannel, msg.payload.payload as never);
        if (msg.payload.event === 'ai:status') this.aiStatus = msg.payload.payload as AiStatus;
        return null;
      case 'log':
        this.ctx.log?.(msg.payload);
        return null;
      case 'ai.state':
        this.applyAiState(msg.payload);
        return null;
    }
  }

  /** 08-0 §A `ai.*`: main writes what the engine verified and chose. */
  private applyAiState(p: AiStatePayload): void {
    this.ctx.settings.update((s) => {
      const providers = { ...s.ai.providers };
      for (const [id, v] of Object.entries(p.providers)) providers[id as ProviderId] = { ...providers[id as ProviderId], ...v };
      return {
        ...s,
        ai: {
          ...s.ai,
          providers,
          ...(p.primary !== undefined ? { primary: p.primary } : {}),
          ...(p.backup !== undefined ? { backup: p.backup } : {}),
        },
      };
    });
  }
}
