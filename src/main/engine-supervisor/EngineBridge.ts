// Spec: 08-1 §2.4 (main ⇄ engine messages; every payload zod-validated on receipt; requests get `{ re, result }`), §2.4.1
// (db.tx, db.query), §3.3 (ui.patch forwarded to the renderer as-is), 08-0 §A (main owns settings.json: the engine's
// your-AI results are written here), 08-5 §3.1 (AiStatus), 08-1 §3.3 (job:upsert / card:upsert for rows a db.tx wrote),
// 09 §9.22 (power.keepAwake → powerSaveBlocker in main), 08-2 §5.10 item 3 (the spend meter is updated per turn: a db.tx that
// writes an `ai_turns` row emits `spend:update`, and the 80 % line of §5.10 item 4; M5 T10, CR-0008 (j) rows 1–2), 08-3 §15.2
// step 5 (M6 T7: an engine db.tx's unprompted messages pass the budget first). Electron-free so unit tests drive it with an
// in-process engine.
// M8 T3: `wa.report` and the WhatsApp session's vault.encrypt / vault.decrypt (08-3 §16.4).
// M9 T4: `web.refused` → `connections.web.refused.{provider}` (08-0 §A, X-127).
import {
  engineToMainSchema,
  type DbOp,
  type EngineToMain,
  type MainToEngine,
  type NamedQuery,
  type SigninBannerMsg,
  type WaReport,
} from '../../engine/protocol';
import { fail, type Result } from '../../shared/errors';
import type { EventChannel, EventPayload } from '../../shared/ipc';
import type { Settings } from '../../shared/settings';
import type { AiStatus, ProviderId } from '../../shared/types';
import type { Db } from '../store/db';
import { cardRow, type DbRow } from '../db/rows';
import { jobRows, publicSettings, spendSummary } from '../store/queries';
import { writeWeb } from '../settings/webKeySettings';
import { postCapWarning } from '../jobs/capWarning';
import { gateUnprompted } from '../notify/budget';
import { applyDbOps, runNamedQuery, writeDataFile } from './engineHost';
import { vaultRuntime } from '../vault/vaultRuntime';
import type { ApprovalGate } from '../approvals/ApprovalGate';
import { logEvent } from '../log/techLog';
import type { DraftService } from '../drafts/DraftService';
import type { GoogleConnections } from '../connections/GoogleConnections';

export interface BridgeContext {
  db: Db;
  settings: { get(): Settings; update(fn: (s: Settings) => Settings): void };
  emit<E extends EventChannel>(event: E, payload: EventPayload[E]): void;
  /** message:upsert / chat:upsert for rows a db.tx wrote. */
  emitMessage(messageId: string): void;
  emitChat(chatId: string): void;
  log?(line: unknown): void;
  /** `{DATA}`: where `mirror` ops write `jobs\{id}\state.json|plan.md` and activity ops append `activity.jsonl` (08-1 §4.1). */
  dataDir?: string;
  /** The injected clock (08-3 §22); defaults to Date.now. */
  now?(): number;
  /** 09 §9.22: hold or release powerSaveBlocker('prevent-app-suspension'); M4 T4 (PowerService) fills it. */
  keepAwake?(on: boolean, jobCount: number): void;
  /** 08-3 §15: a toast request. Stub until M11 (logged only). */
  notify?(req: unknown): void;
  // M8 (T3): `wa.report` and the WhatsApp session's `vault.encrypt` / `vault.decrypt` (src/main/whatsapp/waMain.ts).
  whatsapp?: {
    report(r: WaReport): void;
    vault(req: { kind: 'vault.encrypt'; bytes: Uint8Array } | { kind: 'vault.decrypt' }): Result<unknown>;
  };
  // M5
  /** T7: main's ApprovalGate for engine `approval.open` / `approval.transition` (08-2 §9.1, §9.7); lazy, it needs this bridge. */
  approvals?(): Pick<ApprovalGate, 'openFromEngine' | 'transition'>;
  // M8
  /** T5: main's GoogleConnections for engine `connection.google` requests (gap pick T5-01); lazy, it registers after the bridge. */
  google?(): Pick<GoogleConnections, 'forEngine'> | null;
  // M8 T6
  /** Main's DraftService for engine `draft.create` (08-2 §8.2 `gmail.draft`); its answer is posted when Gmail has answered. */
  drafts?(): Pick<DraftService, 'create' | 'openX'>;
  // M9 T7
  /** The engine's sign-in banner reports (signinBannerBridge.ts → SigninBanners, 09 §9.27.3). */
  signinBanner?(m: SigninBannerMsg): void;
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

  private now(): number {
    return this.ctx.now ? this.ctx.now() : Date.now();
  }

  nextId(): string {
    this.seq += 1;
    return `me${this.seq}`;
  }

  /** Fire-and-forget message to the engine; false when it is not running (nothing was sent). */
  send<K extends MainToEngine['kind']>(kind: K, payload: Extract<MainToEngine, { kind: K }>['payload']): boolean {
    if (!this.live) return false;
    this.post({ id: this.nextId(), kind, payload } as MainToEngine);
    return true;
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

  /** M8 T5: a reply `receive` could not give at once (it returned null), posted on the same port when it is ready. */
  private reply(re: string, result: Result<unknown>): void {
    (this.post as (msg: unknown) => void)({ re, result });
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
      logEvent({ lvl: 'warn', mod: 'engine', evt: 'IPC_REJECTED', kind: 'ENGINE_MESSAGE_INVALID' }); // M5 T7 (08-3 §19.1)
      const id = raw && typeof raw === 'object' && 'id' in raw ? String((raw as { id: unknown }).id) : '';
      return id ? { re: id, result: { ok: false, error: { kind: 'IPC_REJECTED' } } } : null;
    }
    const msg = parsed.data;
    switch (msg.kind) {
      case 'db.tx': {
        const now = this.now();
        // M6 T7 (08-3 §15.2 step 5): unprompted messages pass the interruption budget here, before anything is posted.
        const { ops } = gateUnprompted(this.ctx.db, this.ctx.settings.get(), now, msg.payload.ops as DbOp[]);
        const { result, effects } = applyDbOps(this.ctx.db, ops, { now, dataDir: this.ctx.dataDir });
        for (const id of effects.messageIds) this.ctx.emitMessage(id);
        const jobIds = new Set(effects.jobIds);
        for (const id of effects.cardIds) {
          const r = this.ctx.db.prepare('SELECT * FROM cards WHERE id = ?').get(id) as DbRow | undefined;
          if (r) this.ctx.emit('card:upsert', cardRow(r));
          // CR-0028: a Plan card's Go moves its job's `awaitingGo` even while the job stays queued.
          if (r && r.type === 'plan' && r.job_id) jobIds.add(String(r.job_id));
        }
        if (jobIds.size) {
          const ids = [...jobIds];
          for (const job of jobRows(this.ctx.db, `id IN (${ids.map(() => '?').join(', ')})`, ids, now)) this.ctx.emit('job:upsert', job);
        }
        for (const id of effects.chatIds) this.ctx.emitChat(id);
        // M5 T10: 08-2 §5.10 item 3, the Spent meter moves after every AI turn.
        if (result.ok && msg.payload.ops.some((o) => o.op === 'insert' && o.table === 'ai_turns')) {
          const summary = spendSummary(this.ctx.db, this.ctx.settings.get(), now);
          this.ctx.emit('spend:update', summary);
          // Row 2: at 80 % of the AI cap, one line in foo's chat once a month.
          const warned = postCapWarning(this.ctx.db, this.ctx.settings.get(), summary, now, this.ctx.dataDir);
          if (warned) {
            this.ctx.emitMessage(warned.messageId);
            this.ctx.emitChat(warned.chatId);
          }
        }
        return { re: msg.id, result };
      }
      case 'file.write':
        return { re: msg.id, result: writeDataFile(this.ctx.dataDir, msg.payload.relPath, msg.payload.text) };
      case 'db.query':
        return { re: msg.id, result: runNamedQuery(this.ctx.db, msg.payload.q as NamedQuery, msg.payload.args, this.now()) };
      case 'power.keepAwake':
        this.ctx.keepAwake?.(msg.payload.on, msg.payload.jobCount);
        return null;
      case 'notify':
        if (this.ctx.notify) this.ctx.notify(msg.payload);
        else this.ctx.log?.({ t: this.now(), lvl: 'info', mod: 'notify', evt: 'stub', kind: msg.payload.kind });
        return null;
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
      // M8 (T3)
      case 'wa.report':
        this.ctx.whatsapp?.report(msg.payload);
        return null;
      // M9 T4 (X-127): a web key refused on a call; main writes the setting and tells the renderer.
      // M9 T7: the docked banner follows the engine's Edge window.
      case 'signin.banner':
        this.ctx.signinBanner?.(msg.payload);
        return null;
      case 'web.refused': {
        const { provider } = msg.payload;
        if (writeWeb(this.ctx.settings, (w) => ({ ...w, refused: { ...w.refused, [provider]: true } })))
          this.ctx.emit('settings:changed', publicSettings(this.ctx.settings.get()));
        return null;
      }
      case 'vault.encrypt':
        return { re: msg.id, result: this.ctx.whatsapp?.vault({ kind: 'vault.encrypt', bytes: msg.payload.bytes }) ?? fail('UNKNOWN') };
      case 'vault.decrypt':
        return { re: msg.id, result: this.ctx.whatsapp?.vault({ kind: 'vault.decrypt' }) ?? fail('UNKNOWN') };
      // M5 T7 (08-2 §9.1, §9.7; 08-4 §28.1 item 8, §29.1): only main's ApprovalGate writes approvals.state. A verified draft
      // opens its card; the engine's moves are checked against the table (APPROVAL_BAD_TRANSITION, logged).
      case 'approval.open': {
        const gate = this.ctx.approvals?.();
        if (!gate) return { re: msg.id, result: { ok: false, error: { kind: 'VALIDATION', message: 'not_implemented' } } };
        return { re: msg.id, result: gate.openFromEngine(msg.payload) };
      }
      case 'approval.transition': {
        const gate = this.ctx.approvals?.();
        if (!gate) return { re: msg.id, result: { ok: false, error: { kind: 'VALIDATION', message: 'not_implemented' } } };
        const r = gate.transition(msg.payload.approvalId, msg.payload.to, msg.payload.data ?? {});
        return { re: msg.id, result: r.ok ? { ok: true, value: { ok: true } } : r };
      }
      // M5 T2 (08-2 §11.3): purpose checks in main; the value goes back to the engine only, registered first. Never logged.
      case 'vault.use': {
        const vault = vaultRuntime()?.vault;
        return { re: msg.id, result: vault ? vault.use(msg.payload) : { ok: false, error: { kind: 'VAULT_MISSING' } } };
      }
      // M8 T5: answered when main's Google call is done (a refresh is an HTTP call), so the reply is posted later.
      case 'connection.google': {
        const google = this.ctx.google?.();
        if (!google) return { re: msg.id, result: { ok: false, error: { kind: 'VALIDATION', message: 'not_connected' } } };
        const id = msg.id;
        void google
          .forEngine(msg.payload)
          .catch((): Result<unknown> => ({ ok: false, error: { kind: 'UNKNOWN' } }))
          .then((result) => this.reply(id, result));
        return null;
      }
      // M8 T6: the Gmail call is async, so the answer is posted later on the same port; nothing is returned now.
      case 'draft.create': {
        const drafts = this.ctx.drafts?.();
        if (!drafts) return { re: msg.id, result: { ok: false, error: { kind: 'VALIDATION', message: 'not_implemented' } } };
        const { threadId, ...rest } = msg.payload;
        const id = msg.id;
        void drafts
          .create({ ...rest, ...(threadId ? { threadId } : {}) })
          .catch((): Result<unknown> => ({ ok: false, error: { kind: 'UNKNOWN' } }))
          .then((result) => this.reply(id, result));
        return null;
      }
      // M8 T7: `x.openCompose`; only an X Draft card of the asking job opens.
      case 'draft.openX': {
        const drafts = this.ctx.drafts?.();
        if (!drafts) return { re: msg.id, result: { ok: false, error: { kind: 'VALIDATION', message: 'not_implemented' } } };
        const id = msg.id;
        void drafts
          .openX(msg.payload)
          .catch((): Result<unknown> => ({ ok: false, error: { kind: 'UNKNOWN' } }))
          .then((result) => this.reply(id, result));
        return null;
      }
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
