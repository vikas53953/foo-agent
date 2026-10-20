// Spec: 08-3 §16.4 (engine side of the wa-bridge port: link, read into `wa_messages`, `wa_contacts` for names, settings
// `connections.whatsapp.read=false` stops ingest, `hiddenJids` stops it per group, `loggedOut` → unlinked + WA_UNLINKED, each
// `wa.creds` → `vault.encrypt` → `{DATA}\vault\wa-session.bin`), §16.4.3 (only groups become mirrors, all on link),
// §16.4.4 (the engine renders the PNG, `qrcode` 1.5.x, 200 px, margin 2, and forwards `whatsapp:qr { png, expiresAt }`;
// 60 s after linkStart with no scan → linkCancel; 3 failed links → WA_LINK_FAILED), 08-1 §2.4 (`connection.cmd`,
// `bridge.port`, `vault.decrypt` at bridge start), §2.4.2 (zod on receipt).
// M8 T7: the send path (`whatsapp.send` is engine-only, 08-2 §8.2: main asks after the Draft card's tap): one FIFO queue,
// ≥ 3 s between sends (08-3 §16.4 Send; the wait is never an error), each send waits for the server's ack or the bridge's
// SEND_FAILED; delivery acks ≥ 2 go to main as the `wa_delivered` proof; `wa.onWhatsApp` for the recipient check (§16.4.2,
// null while the bridge is not open: "I can't check that number right now.").
import QRCode from 'qrcode';
import type { Clock, TimerId } from '../../../shared/clock';
import { fail, ok, type Result } from '../../../shared/errors';
import type { Settings } from '../../../shared/settings';
import type { WaMessageRow } from '../../../shared/types';
import {
  bridgeToEngineSchema,
  isGroupJid,
  MAX_FAILED_LINKS,
  QR_LIFETIME_MS,
  type BridgePayload,
  type BridgeToEngine,
  type EngineToBridge,
  WA_ACK_DELIVERED,
  waMessageId,
  waSendKeyId,
  type WaState,
} from '../../../shared/waBridge';
import type { DbOp, MainLink, WaReport } from '../../protocol';

export interface WaPortLike {
  postMessage(msg: unknown): void;
  on(event: 'message', fn: (e: { data: unknown }) => void): void;
  start(): void;
}

export type WaCommand = 'linkStart' | 'linkCancel' | 'unlink';

type Cmd = { [K in EngineToBridge['kind']]: { kind: K; payload: Extract<EngineToBridge, { kind: K }>['payload'] } }[EngineToBridge['kind']];

/** 05-3 §5.11.1: `--qr-size` 200px; 08-3 §16.4.4 margin 2. */
const QR_OPTS = { width: 200, margin: 2, errorCorrectionLevel: 'M' } as const;

// M8 T7
/** 08-3 §16.4 Send: at least 3 s between two sends `[foo decision: lower ban risk on an unofficial link]`. */
export const WA_SEND_GAP_MS = 3_000;
/** How long one send waits for the bridge's ack or SEND_FAILED before it counts as failed. */
const SEND_WAIT_MS = 30_000;
/** How long a number check waits for `wa.onWhatsApp.result`. */
const CHECK_WAIT_MS = 10_000;

export interface WaSendRequest {
  jid: string;
  text: string;
  draftCardId: string;
}

export class WhatsAppConnector {
  private port: WaPortLike | null = null;
  private queued: WaCommand[] = [];
  private seq = 0;
  private expiry: TimerId | null = null;
  private failedLinks = 0;
  private unlinking = false;
  // M8 T7
  private state: WaState | null = null;
  /** The send queue's tail; each send starts after the one before it ended and the 3 s gap. */
  private queue: Promise<unknown> = Promise.resolve();
  private lastSendAt: number | null = null;
  /** The send in flight: the message id it waits for. */
  private inFlight: { id: string; done(r: Result<{ waMessageId: string }>): void } | null = null;
  private checks: { jid: string; done(exists: boolean | null): void }[] = [];
  private delivered = new Set<string>();

  constructor(
    private o: {
      link: MainLink;
      clock: Clock;
      settings: () => Settings;
      log?: (evt: string, kind?: string) => void;
    },
  ) {}

  /** `bridge.port`: a (re)started bridge. The saved session goes over first (08-1 §2.4.2 `wa.session`). */
  async attach(port: WaPortLike): Promise<void> {
    this.port = port;
    port.on('message', (e) => void this.receive(e.data));
    port.start();
    const r = await this.o.link.request<{ bytes: Uint8Array | null }>('vault.decrypt', { blobRef: 'wa-session' });
    if (this.port !== port) return;
    this.post({ kind: 'wa.session', payload: { bytes: r.ok ? r.value.bytes : null } });
    const queued = this.queued;
    this.queued = [];
    for (const c of queued) this.command(c);
  }

  /** `connection.cmd { target: 'whatsapp' }`. Commands that arrive before the bridge port wait for it. */
  command(cmd: WaCommand): void {
    if (!this.port) {
      this.queued.push(cmd);
      return;
    }
    switch (cmd) {
      case 'linkStart':
        this.stopExpiry();
        this.unlinking = false;
        this.post({ kind: 'wa.linkStart', payload: {} });
        this.report({ event: 'status', status: 'connecting', errorKind: null });
        this.expiry = this.o.clock.setTimeout(() => this.linkFailed(), QR_LIFETIME_MS);
        return;
      case 'linkCancel':
        this.stopExpiry();
        this.post({ kind: 'wa.linkCancel', payload: {} });
        return;
      case 'unlink':
        this.stopExpiry();
        this.unlinking = true;
        this.failedLinks = 0;
        this.post({ kind: 'wa.unlink', payload: {} });
        return;
    }
  }

  private post(m: Cmd): void {
    this.seq += 1;
    this.port?.postMessage({ id: `ew${this.seq}`, ...m });
  }

  private report(r: WaReport): void {
    this.o.link.send('wa.report', r);
  }

  private stopExpiry(): void {
    if (this.expiry !== null) this.o.clock.clearTimeout(this.expiry);
    this.expiry = null;
  }

  /** 60 s with no scan, or the bridge gave up: one failed link; the third is WA_LINK_FAILED. */
  private linkFailed(): void {
    this.stopExpiry();
    this.post({ kind: 'wa.linkCancel', payload: {} });
    this.failedLinks += 1;
    const failed = this.failedLinks >= MAX_FAILED_LINKS;
    if (failed) this.failedLinks = 0;
    this.report({ event: 'status', status: 'disconnected', errorKind: failed ? 'WA_LINK_FAILED' : null });
  }

  private async receive(raw: unknown): Promise<void> {
    const parsed = bridgeToEngineSchema.safeParse(raw);
    if (!parsed.success) {
      this.o.log?.('wa.rejected');
      return;
    }
    await this.on(parsed.data);
  }

  private async on(m: BridgeToEngine): Promise<void> {
    switch (m.kind) {
      case 'wa.qr': {
        const png = await QRCode.toDataURL(m.payload.qr, QR_OPTS);
        this.o.link.send('ui.patch', { event: 'whatsapp:qr', payload: { png, expiresAt: m.payload.expiresAt } });
        return;
      }
      case 'wa.linked':
        this.stopExpiry();
        this.failedLinks = 0;
        this.report({ event: 'linked', accountLabel: m.payload.jidMasked, accountHash: m.payload.accountHash });
        return;
      case 'wa.creds':
        await this.o.link.request('vault.encrypt', { blobRef: 'wa-session', bytes: m.payload.bytes });
        return;
      case 'wa.error':
        // M8 T7: the send in flight did not go out.
        if (m.payload.kind === 'SEND_FAILED') this.inFlight?.done(fail('SEND_FAILED'));
        if (m.payload.kind === 'WA_UNLINKED' && !this.unlinking)
          this.report({ event: 'status', status: 'unlinked', errorKind: 'WA_UNLINKED' });
        if (m.payload.kind === 'WA_LINK_FAILED' && this.expiry !== null) this.linkFailed();
        return;
      case 'wa.state': {
        const was = this.state;
        this.state = m.payload.state;
        if (m.payload.state === 'open' && was !== 'open') this.report({ event: 'open' });
        if (m.payload.state !== 'open') for (const c of this.checks.splice(0)) c.done(null);
        return;
      }
      // M8 T7
      case 'wa.ack':
        if (this.inFlight?.id === m.payload.waMessageId) this.inFlight.done(ok({ waMessageId: m.payload.waMessageId }));
        if (m.payload.level >= WA_ACK_DELIVERED && !this.delivered.has(m.payload.waMessageId)) {
          // Delivered then read: one proof. The set only needs this session's sends.
          if (this.delivered.size > 500) this.delivered.clear();
          this.delivered.add(m.payload.waMessageId);
          this.report({ event: 'delivered', waMessageId: m.payload.waMessageId });
        }
        return;
      case 'wa.onWhatsApp.result':
        for (const r of m.payload.results) {
          const i = this.checks.findIndex((c) => c.jid === r.jid);
          if (i >= 0) this.checks.splice(i, 1)[0]!.done(r.exists);
        }
        return;
      case 'wa.contacts':
        return this.contacts(m.payload.contacts);
      case 'wa.message':
        return this.ingest(m.payload);
    }
  }

  // M8 T7
  /** True while the bridge's socket is open (08-3 §16.4.2). */
  isOpen(): boolean {
    return this.port !== null && this.state === 'open';
  }

  /** `whatsapp.send` (engine-only): queued behind earlier sends and the 3 s gap; never retried here. */
  send(req: WaSendRequest): Promise<Result<{ waMessageId: string }>> {
    const run = this.queue.then(() => this.sendNow(req));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async sendNow(req: WaSendRequest): Promise<Result<{ waMessageId: string }>> {
    if (this.lastSendAt !== null) {
      const wait = this.lastSendAt + WA_SEND_GAP_MS - this.o.clock.now();
      if (wait > 0) await new Promise<void>((res) => this.o.clock.setTimeout(res, wait));
    }
    if (!this.isOpen()) return fail('SEND_FAILED');
    const id = waMessageId(req.jid, waSendKeyId(req.draftCardId));
    this.lastSendAt = this.o.clock.now();
    const r = await new Promise<Result<{ waMessageId: string }>>((resolve) => {
      const timer = this.o.clock.setTimeout(() => finish(fail('SEND_FAILED')), SEND_WAIT_MS);
      const finish = (x: Result<{ waMessageId: string }>) => {
        this.o.clock.clearTimeout(timer);
        if (this.inFlight?.id === id) this.inFlight = null;
        resolve(x);
      };
      this.inFlight = { id, done: finish };
      this.post({ kind: 'wa.send', payload: { jid: req.jid, text: req.text, draftCardId: req.draftCardId } });
    });
    this.lastSendAt = this.o.clock.now();
    if (!r.ok) this.o.log?.('wa.send_failed', r.error.kind);
    return r;
  }

  /** Is this jid on WhatsApp? null while the bridge is not open or does not answer (08-3 §16.4.2). */
  check(jid: string): Promise<boolean | null> {
    if (!this.isOpen()) return Promise.resolve(null);
    return new Promise((resolve) => {
      const entry = {
        jid,
        done: (exists: boolean | null) => {
          this.o.clock.clearTimeout(timer);
          resolve(exists);
        },
      };
      const timer = this.o.clock.setTimeout(() => {
        const i = this.checks.indexOf(entry);
        if (i >= 0) this.checks.splice(i, 1);
        resolve(null);
      }, CHECK_WAIT_MS);
      this.checks.push(entry);
      this.post({ kind: 'wa.onWhatsApp', payload: { jids: [jid] } });
    });
  }

  private reading(): boolean {
    return this.o.settings().connections.whatsapp.read;
  }

  private async tx(ops: DbOp[]): Promise<void> {
    if (!ops.length) return;
    const r = await this.o.link.request('db.tx', { ops });
    if (!r.ok) this.o.log?.('wa.tx_failed', r.error.kind);
  }

  private async contacts(list: BridgePayload<'wa.contacts'>['contacts']): Promise<void> {
    if (!this.reading()) return;
    const now = this.o.clock.now();
    await this.tx(
      list.map((c) => ({
        op: 'insert' as const,
        table: 'wa_contacts' as const,
        row: { jid: c.jid, name: c.name ?? null, phone: c.phone ?? null, updated_at: now },
      })),
    );
    const groups = list.filter((c) => isGroupJid(c.jid) && c.name).map((c) => ({ jid: c.jid, title: c.name! }));
    if (groups.length) this.report({ event: 'groups', groups });
  }

  private async ingest(w: WaMessageRow): Promise<void> {
    if (!this.reading() || this.o.settings().connections.whatsapp.hiddenJids.includes(w.chatJid)) return;
    await this.tx([
      {
        op: 'insert',
        table: 'wa_messages',
        row: {
          id: w.id,
          chat_jid: w.chatJid,
          from_me: w.fromMe ? 1 : 0,
          sender_label: w.senderLabel,
          text: w.text,
          at: w.at,
          starred: w.starred ? 1 : 0,
          mentions_me: w.mentionsMe ? 1 : 0,
        },
        redact: ['text'],
      },
    ]);
  }
}
