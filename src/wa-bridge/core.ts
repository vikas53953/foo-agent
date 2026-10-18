// Spec: 08-1 §2.1 row wa-bridge (Baileys linked device in its own utility process), §2.4.2 (EngineToBridge /
// BridgeToEngine), 08-3 §16.4 (read: `messages.upsert` → text only, media as "[photo]"; sender_label = the contact name ??
// pushName ?? masked number, "You" for from_me; `loggedOut` → `WA_UNLINKED`; transient disconnects reconnect with back-off
// and are never shown), §16.4.1 (contact names and group names are kept in the bridge's memory and sent as `wa.contacts`),
// §16.4.4 (a new QR about every 20 s by Baileys; expiresAt = linkStartAt + 60_000 on every code; linkCancel closes the
// socket). The protocol side of the bridge, free of Baileys so tests drive it with a fake socket. No send path (M8 T7).
import { createHash } from 'node:crypto';
import type { Clock, TimerId } from '../shared/clock';
import { maskWaNumber, QR_LIFETIME_MS, WA_MEDIA_TEXT, waMessageId, type BridgeToEngine, type EngineToBridge } from '../shared/waBridge';
import type { WaMessageRow } from '../shared/types';

/** One incoming message as the socket adapter hands it over (Baileys `messages.upsert`, already unwrapped). */
export interface IncomingWaMessage {
  chatJid: string;
  keyId: string;
  fromMe: boolean;
  /** The sender's jid (the participant in a group, the chat jid in a 1:1). */
  participant: string;
  pushName?: string;
  text?: string;
  media: boolean;
  at: number;
  starred: boolean;
  mentionsMe: boolean;
}

export interface WaContact {
  jid: string;
  name?: string;
  phone?: string;
}

export interface WaSocketEvents {
  qr(qr: string): void;
  open(me: { jid: string }): void;
  close(info: { loggedOut: boolean }): void;
  messages(list: IncomingWaMessage[]): void;
  contacts(list: WaContact[]): void;
  creds(bytes: Uint8Array): void;
}

export interface WaSocket {
  logout(): Promise<void>;
  end(): void;
}

/** Opens a socket: `session` null pairs a new device (QR codes follow), otherwise it resumes the saved one. */
export type SocketFactory = (o: { session: Uint8Array | null; events: WaSocketEvents }) => Promise<WaSocket>;

/** Wire message without its id (the core numbers them). */
type Out = { [K in BridgeToEngine['kind']]: { kind: K; payload: Extract<BridgeToEngine, { kind: K }>['payload'] } }[BridgeToEngine['kind']];

/** 08-1 §2.1 back-off for a dropped socket (the process-level restart is main's supervisor, src/main/whatsapp). */
const RECONNECT_MS = 5_000;

/** sender_label (X-129): the contact name, else the pushName, else the masked number; "You" for own messages. */
export function senderLabel(m: Pick<IncomingWaMessage, 'fromMe' | 'participant' | 'pushName'>, names: ReadonlyMap<string, string>): string {
  if (m.fromMe) return 'You';
  return names.get(m.participant) ?? (m.pushName?.trim() || maskWaNumber(m.participant));
}

export function toRow(m: IncomingWaMessage, names: ReadonlyMap<string, string>): WaMessageRow | null {
  const text = m.media ? WA_MEDIA_TEXT : (m.text ?? '').trim();
  if (!text) return null;
  return {
    id: waMessageId(m.chatJid, m.keyId),
    chatJid: m.chatJid,
    fromMe: m.fromMe,
    senderLabel: senderLabel(m, names),
    text,
    at: m.at,
    starred: m.starred,
    mentionsMe: m.mentionsMe,
  };
}

export class BridgeCore {
  private seq = 0;
  private session: Uint8Array | null = null;
  private socket: WaSocket | null = null;
  /** Set while a link attempt runs (Show QR code → linked, cancelled or expired). */
  private linkStartAt: number | null = null;
  private unlinking = false;
  private names = new Map<string, string>();
  private reconnect: TimerId | null = null;
  /** Bumped whenever a socket is replaced, so events from an old one are dropped. */
  private generation = 0;

  constructor(
    private o: {
      clock: Clock;
      send(msg: BridgeToEngine): void;
      socket: SocketFactory;
    },
  ) {}

  private emit(m: Out): void {
    this.seq += 1;
    this.o.send({ id: `b${this.seq}`, ...m } as BridgeToEngine);
  }

  async handle(msg: EngineToBridge): Promise<void> {
    switch (msg.kind) {
      case 'wa.session':
        this.session = msg.payload.bytes;
        if (this.session && !this.socket) await this.open(this.session);
        return;
      case 'wa.linkStart':
        this.close();
        this.session = null;
        this.linkStartAt = this.o.clock.now();
        await this.open(null);
        return;
      case 'wa.linkCancel':
        if (this.linkStartAt === null) return;
        this.linkStartAt = null;
        this.close();
        return;
      case 'wa.unlink':
        this.unlinking = true;
        this.linkStartAt = null;
        try {
          await this.socket?.logout();
        } finally {
          this.close();
          this.session = null;
          this.names.clear();
        }
        return;
    }
  }

  private close(): void {
    this.generation += 1;
    if (this.reconnect !== null) this.o.clock.clearTimeout(this.reconnect);
    this.reconnect = null;
    this.socket?.end();
    this.socket = null;
  }

  private async open(session: Uint8Array | null): Promise<void> {
    const gen = ++this.generation;
    const live = () => gen === this.generation;
    this.unlinking = false;
    this.emit({ kind: 'wa.state', payload: { state: 'connecting' } });
    this.socket = await this.o.socket({
      session,
      events: {
        qr: (qr) => {
          if (!live() || this.linkStartAt === null) return;
          this.emit({ kind: 'wa.qr', payload: { qr, expiresAt: this.linkStartAt + QR_LIFETIME_MS } });
        },
        open: ({ jid }) => {
          if (!live()) return;
          if (this.linkStartAt !== null) {
            this.linkStartAt = null;
            const number = (jid.split('@')[0] ?? '').split(':')[0] ?? '';
            const accountHash = createHash('sha256').update(number).digest('hex');
            this.emit({ kind: 'wa.linked', payload: { jidMasked: maskWaNumber(jid), accountHash } });
          }
          this.emit({ kind: 'wa.state', payload: { state: 'open' } });
        },
        close: ({ loggedOut }) => {
          if (!live()) return;
          this.socket = null;
          if (loggedOut) {
            this.session = null;
            this.emit({ kind: 'wa.state', payload: { state: 'logged_out' } });
            if (!this.unlinking) this.emit({ kind: 'wa.error', payload: { kind: 'WA_UNLINKED' } });
            return;
          }
          this.emit({ kind: 'wa.state', payload: { state: 'closed' } });
          if (this.session && this.linkStartAt === null) {
            this.reconnect = this.o.clock.setTimeout(() => {
              this.reconnect = null;
              if (live() && this.session) void this.open(this.session);
            }, RECONNECT_MS);
          }
        },
        messages: (list) => {
          if (!live()) return;
          for (const m of list) {
            const row = toRow(m, this.names);
            if (row) this.emit({ kind: 'wa.message', payload: row });
          }
        },
        contacts: (list) => {
          if (!live() || !list.length) return;
          for (const c of list) if (c.name) this.names.set(c.jid, c.name);
          this.emit({ kind: 'wa.contacts', payload: { contacts: list } });
        },
        creds: (bytes) => {
          if (!live()) return;
          this.session = bytes;
          this.emit({ kind: 'wa.creds', payload: { bytes } });
        },
      },
    });
  }
}
