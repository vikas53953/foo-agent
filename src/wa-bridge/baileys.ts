// Spec: 08-3 §16.4.1 (Baileys pinned at M8; `makeWASocket({ auth, version, browser: ['foo', 'Desktop', '{appVersion}'],
// syncFullHistory: false, markOnlineOnConnect: false, printQRInTerminal: false, generateHighQualityLinkPreview: false })`;
// contact and group names kept in memory and sent as `wa.contacts`; the bridge never requests media), §16.4 (auth state
// lives in the bridge's memory; every change goes out as `wa.creds` for main to encrypt; `loggedOut` → unlinked),
// CR-0012 pick 6 / G-M8-06 (on 7.0.0-rc14 `fetchLatestBaileysVersion()` reads raw.githubusercontent.com, a non-WhatsApp
// host, so it is never called: the version pinned in the package is used). The only host this opens is
// wss://web.whatsapp.com/ws/chat (implementation-notes "M8 T3"). Never loaded in FOO_TEST runs (fakeSocket.ts is).
// M8 T7: `sendMessage(jid, { text }, { messageId })` (text only; the key id is the Draft card's), `onWhatsApp`, and the
// status of this device's own messages from `messages.update` as ack levels (SERVER_ACK 2 → 1, DELIVERY_ACK 3 → 2, READ /
// PLAYED → 3).
import type { AuthenticationCreds, SignalDataTypeMap, WAMessage } from '@whiskeysockets/baileys';
import type { IncomingWaMessage, SocketFactory, WaContact, WaSocket, WaSocketEvents } from './core';

type Baileys = typeof import('@whiskeysockets/baileys');
type Keys = { [T in keyof SignalDataTypeMap]?: Record<string, SignalDataTypeMap[T]> };

const silent = {
  level: 'silent',
  child: () => silent,
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

const MEDIA_KEYS = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage', 'ptvMessage'] as const;

function seconds(ts: WAMessage['messageTimestamp']): number {
  if (typeof ts === 'number') return ts * 1000;
  if (ts && typeof ts === 'object' && 'toNumber' in ts) return (ts as { toNumber(): number }).toNumber() * 1000;
  return Date.now();
}

function unwrap(b: Baileys, m: WAMessage, me: string): IncomingWaMessage | null {
  const chatJid = m.key.remoteJid;
  if (!chatJid || !m.key.id || chatJid === 'status@broadcast') return null;
  const content = b.normalizeMessageContent(m.message);
  if (!content) return null;
  const media = MEDIA_KEYS.some((k) => Boolean(content[k]));
  const text = content.conversation ?? content.extendedTextMessage?.text ?? undefined;
  const mentioned = content.extendedTextMessage?.contextInfo?.mentionedJid ?? [];
  return {
    chatJid,
    keyId: m.key.id,
    fromMe: Boolean(m.key.fromMe),
    participant: m.key.participant ?? chatJid,
    ...(m.pushName ? { pushName: m.pushName } : {}),
    ...(text ? { text } : {}),
    media,
    at: seconds(m.messageTimestamp),
    starred: Boolean(m.starred),
    mentionsMe: Boolean(me) && mentioned.includes(me),
  };
}

/** The real socket. `appVersion` fills the Linked devices label "foo" (Desktop). */
export function baileysSocket(appVersion: string): SocketFactory {
  return async ({ session, events }) => {
    const b: Baileys = await import('@whiskeysockets/baileys');
    const saved = session
      ? (JSON.parse(Buffer.from(session).toString('utf8'), b.BufferJSON.reviver) as { creds: AuthenticationCreds; keys: Keys })
      : null;
    const state = saved ?? { creds: b.initAuthCreds(), keys: {} as Keys };
    const persist = () => events.creds(new Uint8Array(Buffer.from(JSON.stringify(state, b.BufferJSON.replacer), 'utf8')));
    const auth = {
      creds: state.creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
          const bucket = (state.keys[type] ?? {}) as Record<string, SignalDataTypeMap[T]>;
          const out: Record<string, SignalDataTypeMap[T]> = {};
          for (const id of ids) {
            let v = bucket[id];
            if (v && type === 'app-state-sync-key')
              v = b.proto.Message.AppStateSyncKeyData.fromObject(v as Record<string, unknown>) as unknown as SignalDataTypeMap[T];
            if (v) out[id] = v;
          }
          return out;
        },
        set: async (data: Partial<{ [T in keyof SignalDataTypeMap]: Record<string, SignalDataTypeMap[T] | null> }>) => {
          for (const [type, rows] of Object.entries(data) as [keyof SignalDataTypeMap, Record<string, unknown>][]) {
            const bucket = ((state.keys as Record<string, Record<string, unknown>>)[type] ??= {});
            for (const [id, v] of Object.entries(rows ?? {})) {
              if (v === null) delete bucket[id];
              else bucket[id] = v;
            }
          }
          persist();
        },
      },
    };

    let sock: ReturnType<Baileys['makeWASocket']> | null = null;
    let me = '';
    const names = new Map<string, string>();
    const contacts = (list: WaContact[]) => {
      const fresh = list.filter((c) => c.name && names.get(c.jid) !== c.name);
      for (const c of fresh) names.set(c.jid, c.name!);
      if (fresh.length) events.contacts(fresh);
    };

    const start = () => {
      const s = b.makeWASocket({
        auth,
        version: b.DEFAULT_CONNECTION_CONFIG.version,
        browser: ['foo', 'Desktop', appVersion],
        syncFullHistory: false,
        markOnlineOnConnect: false,
        printQRInTerminal: false,
        generateHighQualityLinkPreview: false,
        logger: silent as never,
      });
      sock = s;
      s.ev.on('creds.update', persist);
      s.ev.on('connection.update', (u) => {
        if (u.qr) events.qr(u.qr);
        if (u.connection === 'open') {
          me = b.jidNormalizedUser(s.user?.id);
          events.open({ jid: s.user?.id ?? '' });
          void s
            .groupFetchAllParticipating()
            .then((groups) => contacts(Object.values(groups).map((g) => ({ jid: g.id, name: g.subject }))))
            .catch(() => undefined);
        }
        if (u.connection === 'close') {
          const code = (u.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
          // After a scan WhatsApp asks for one restart with the new creds: the same link attempt, not a drop.
          if (code === b.DisconnectReason.restartRequired) start();
          else events.close({ loggedOut: code === b.DisconnectReason.loggedOut });
        }
      });
      s.ev.on('messages.upsert', ({ messages }) => {
        const list = messages.map((m) => unwrap(b, m, me)).filter((m): m is IncomingWaMessage => m !== null);
        if (list.length) events.messages(list);
      });
      s.ev.on('contacts.upsert', (list) =>
        contacts(list.map((c) => ({ jid: c.id, ...(c.name || c.notify ? { name: c.name ?? c.notify! } : {}) }))),
      );
      s.ev.on('groups.upsert', (list) => contacts(list.map((g) => ({ jid: g.id, name: g.subject }))));
      // M8 T7
      s.ev.on('messages.update', (list) => {
        const acks = list
          .filter((u) => u.key.fromMe && u.key.remoteJid && u.key.id && typeof u.update.status === 'number')
          .map((u) => ({ chatJid: u.key.remoteJid!, keyId: u.key.id!, level: Math.min(Number(u.update.status) - 1, 3) }))
          .filter((a) => a.level >= 1);
        if (acks.length) events.acks(acks);
      });
    };
    start();

    const socket: WaSocket = {
      logout: async () => {
        await sock?.logout();
      },
      end: () => sock?.end(undefined),
      // M8 T7
      sendText: async (jid, text, keyId) => {
        if (!sock) throw new Error('closed');
        const sent = await sock.sendMessage(jid, { text }, { messageId: keyId });
        if (!sent) throw new Error('not sent');
      },
      onWhatsApp: async (jids) => {
        if (!sock) return [];
        const found = (await sock.onWhatsApp(...jids)) ?? [];
        return jids.map((jid) => ({ jid, exists: found.some((f) => f.exists && b.jidNormalizedUser(f.jid) === jid) }));
      },
    };
    return socket;
  };
}

export type { WaSocketEvents };
