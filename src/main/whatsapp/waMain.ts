// Spec: 08-1 §3.2 (`whatsapp:linkStart` / `linkCancel` / `unlink` `{}` → void, QR on `whatsapp:qr`; `chat:archive`
// `{ chatId; on }` → ChatRow, wa_mirror only), §3.3 (`connection:upsert`, `chat:upsert`, `chat:removed`), §2.1 row
// wa-bridge (main forks it only when a whatsapp row exists or on linkStart; at +20 s after start when a row exists, §2.2
// step 7), §2.4 (`connection.cmd`, `vault.encrypt` / `vault.decrypt` for 'wa-session'), 08-3 §16.4 (read=false deletes the
// stored messages), 06-3 C-11 (Unlink: the device is logged out, the session file deleted, Activity `disconnected`).
// Main's half of WhatsApp: IPC handlers, the engine's `wa.report`, the session store, and the settings watch.
import { ok, fail, type Result } from '../../shared/errors';
import type { Settings } from '../../shared/settings';
import type { EventChannel, EventPayload } from '../../shared/ipc';
import type { WaReport } from '../../engine/protocol';
import type { EngineBridge } from '../engine-supervisor/EngineBridge';
import type { Db } from '../store/db';
import type { WaSessionStore } from '../vault/waSessionMemory';
import { applyWaReport, archiveMirror, bridgeWanted, deleteWaData, startupWhatsApp, unlinkWhatsApp, type WaEffects } from './waStore';

/** The supervisor's bridge controls (EngineSupervisor in the app, a fake in tests). */
export interface BridgeControl {
  startBridge(): void;
  stopBridge(): void;
}

export interface WaMainContext {
  db: Db;
  settings: { get(): Settings; update(fn: (s: Settings) => Settings): void; onChange(fn: (s: Settings) => void): () => void };
  engine: EngineBridge;
  bridge: BridgeControl;
  session: WaSessionStore;
  emit<E extends EventChannel>(event: E, payload: EventPayload[E]): void;
  emitChat(chatId: string): void;
  emitSettings(): void;
  chatRow(chatId: string): EventPayload['chat:upsert'] | null;
  now(): number;
  dataDir?: string;
  /** Real-time delay before the bridge is stopped after Unlink, so the logout reaches WhatsApp. */
  unlinkGraceMs?: number;
}

/** 08-1 §2.2 step 7: the bridge is forked +20 s after start when a whatsapp row exists. */
export const BRIDGE_START_DELAY_MS = 20_000;

export class WhatsAppMain {
  private reading: boolean;

  constructor(private c: WaMainContext) {
    this.reading = c.settings.get().connections.whatsapp.read;
    c.settings.onChange((s) => this.settingsChanged(s));
  }

  /** Startup (08-1 §2.2 step 3 for the row rule, step 7 for the bridge). Returns whether a bridge start is due. */
  startup(): boolean {
    startupWhatsApp(this.c.db, this.c.now());
    return bridgeWanted(this.c.db);
  }

  private apply(fx: WaEffects): void {
    if (fx.connection) this.c.emit('connection:upsert', fx.connection);
    for (const id of fx.chatIds) this.c.emitChat(id);
    for (const id of fx.removedChatIds) this.c.emit('chat:removed', { chatId: id });
  }

  /** `wa.report` from the engine. */
  report(r: WaReport): void {
    const before = JSON.stringify(this.c.settings.get().notifications.mutedChats);
    this.apply(applyWaReport(this.c.db, this.c.settings, r, this.c.now(), this.c.dataDir));
    if (JSON.stringify(this.c.settings.get().notifications.mutedChats) !== before) this.c.emitSettings();
  }

  /** `vault.encrypt` / `vault.decrypt` with blobRef 'wa-session'. */
  vault(req: { kind: 'vault.encrypt'; bytes: Uint8Array } | { kind: 'vault.decrypt' }): Result<unknown> {
    if (req.kind === 'vault.decrypt') return ok({ bytes: this.c.session.read() });
    this.c.session.write(req.bytes);
    return ok(undefined);
  }

  linkStart(): Result<void> {
    if (!this.c.engine.live) return fail('UNKNOWN', 'no engine');
    this.c.bridge.startBridge();
    this.c.engine.send('connection.cmd', { target: 'whatsapp', cmd: 'linkStart' });
    return ok(undefined);
  }

  linkCancel(): Result<void> {
    this.c.engine.send('connection.cmd', { target: 'whatsapp', cmd: 'linkCancel' });
    return ok(undefined);
  }

  /** 06-3 C-11 confirmed. */
  unlink(): Result<void> {
    this.c.engine.send('connection.cmd', { target: 'whatsapp', cmd: 'unlink' });
    this.c.session.delete();
    this.apply(unlinkWhatsApp(this.c.db, this.c.now(), this.c.dataDir));
    setTimeout(() => this.c.bridge.stopBridge(), this.c.unlinkGraceMs ?? 3_000);
    return ok(undefined);
  }

  archive(chatId: string, on: boolean): Result<EventPayload['chat:upsert']> {
    const r = archiveMirror(this.c.db, this.c.settings, chatId, on);
    if (!r.ok) return r;
    this.c.emitSettings();
    const row = this.c.chatRow(chatId);
    if (!row) return fail('NOT_FOUND');
    // The chat list shows no archived chat: a hidden mirror leaves it, a shown one comes back.
    if (on) this.c.emit('chat:removed', { chatId });
    else this.c.emit('chat:upsert', row);
    return ok(row);
  }

  /** 08-3 §16.4: read=false stops ingest (the engine sees the setting) and deletes what was stored. */
  private settingsChanged(s: Settings): void {
    const now = s.connections.whatsapp.read;
    if (this.reading && !now) {
      deleteWaData(this.c.db);
      const mirrors = this.c.db.prepare("SELECT id FROM chats WHERE kind = 'wa_mirror' AND deleted_at IS NULL").pluck().all() as string[];
      for (const id of mirrors) this.c.emitChat(id);
    }
    this.reading = now;
  }
}
