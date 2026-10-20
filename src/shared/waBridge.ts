// Spec: 08-1 §2.4.2 (engine ⇄ wa-bridge messages `{ id; kind; payload }`, zod-validated on receipt: the EngineToBridge /
// BridgeToEngine unions), 08-3 §16.4 (read: text only, media as "[photo]"; sender_label = wa_contacts.name ?? pushName ??
// masked number, "You" for from_me; X-129), §16.4.4 (expiresAt = linkStartAt + 60_000 on every code), 0001 `wa_messages.id`
// = 'wa_' + chat_jid + ':' + Baileys key.id. M8 T3 carries the link and read rows; `wa.send`, `wa.readRecent` and
// `wa.onWhatsApp` are added with the send path (M8 T7), so this bridge cannot send.
import { z } from 'zod';

/** 08-3 §16.4.4: a link attempt's codes all expire 60 s after Show QR code. */
export const QR_LIFETIME_MS = 60_000;
/** 08-3 §16.4.4: the third failed link attempt raises `WA_LINK_FAILED`. */
export const MAX_FAILED_LINKS = 3;
/** 08-3 §16.4 / J16: wa_messages keeps 7 days. */
export const WA_RETENTION_MS = 7 * 86_400_000;
/** 08-3 §16.4: media is stored as this text. */
export const WA_MEDIA_TEXT = '[photo]';

/** The wa_messages row id (0001_init: ingest is INSERT OR IGNORE on it, X-129). */
export const waMessageId = (chatJid: string, keyId: string): string => `wa_${chatJid}:${keyId}`;

/** Group chats end in `@g.us`; only they become wa_mirror chats (08-3 §16.4.3). */
export const isGroupJid = (jid: string): boolean => jid.endsWith('@g.us');

/** "+91 98••• ••210" (08-1 §4.3.10 account_label, 06-2 §6.8, 05-3 §5.11.2) from a WhatsApp user jid or number. */
export function maskWaNumber(jidOrNumber: string): string {
  const digits = (jidOrNumber.split('@')[0] ?? '').split(':')[0]!.replace(/\D/g, '');
  if (digits.length < 6) return '••••';
  const national = digits.length > 10 ? digits.slice(-10) : digits;
  const cc = digits.length > 10 ? digits.slice(0, digits.length - 10) : '';
  return `${cc ? `+${cc} ` : ''}${national.slice(0, 2)}••• ••${national.slice(-3)}`;
}

const waMessageRowSchema = z
  .object({
    id: z.string().min(1),
    chatJid: z.string().min(1),
    fromMe: z.boolean(),
    senderLabel: z.string().nullable(),
    text: z.string(),
    at: z.number(),
    starred: z.boolean(),
    mentionsMe: z.boolean(),
  })
  .strict();

const bytes = z.custom<Uint8Array>((v) => v instanceof Uint8Array);
const msg = <K extends string, P extends z.ZodType>(kind: K, payload: P) =>
  z.object({ id: z.string(), kind: z.literal(kind), payload }).strict();
const none = z.object({}).strict();

export const engineToBridgeSchema = z.discriminatedUnion('kind', [
  msg('wa.linkStart', none),
  msg('wa.linkCancel', none),
  msg('wa.unlink', none),
  msg('wa.session', z.object({ bytes: bytes.nullable() }).strict()),
]);
export type EngineToBridge = z.infer<typeof engineToBridgeSchema>;

export const WA_STATES = ['connecting', 'open', 'closed', 'logged_out'] as const;
export type WaState = (typeof WA_STATES)[number];

export const bridgeToEngineSchema = z.discriminatedUnion('kind', [
  msg('wa.qr', z.object({ qr: z.string().min(1), expiresAt: z.number() }).strict()),
  msg('wa.linked', z.object({ jidMasked: z.string(), accountHash: z.string().min(1) }).strict()),
  msg('wa.message', waMessageRowSchema),
  msg('wa.state', z.object({ state: z.enum(WA_STATES), reason: z.string().optional() }).strict()),
  msg('wa.creds', z.object({ bytes }).strict()),
  msg('wa.error', z.object({ kind: z.enum(['WA_LINK_FAILED', 'WA_UNLINKED', 'SEND_FAILED']) }).strict()),
  msg(
    'wa.contacts',
    z
      .object({
        contacts: z.array(z.object({ jid: z.string().min(1), name: z.string().optional(), phone: z.string().optional() }).strict()),
      })
      .strict(),
  ),
]);
export type BridgeToEngine = z.infer<typeof bridgeToEngineSchema>;

type Payload<U extends { kind: string; payload: unknown }, K extends U['kind']> = Extract<U, { kind: K }>['payload'];
export type BridgePayload<K extends BridgeToEngine['kind']> = Payload<BridgeToEngine, K>;
export type EnginePayload<K extends EngineToBridge['kind']> = Payload<EngineToBridge, K>;

/**
 * FOO_TEST runs only (08-3 §22): main's control line to the bridge process, so a test can play the phone. `scan` links the
 * fake account, `message` delivers a group message, `logout` is the phone removing foo from Linked devices.
 */
export const bridgeTestSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('scan') }).strict(),
  z
    .object({
      op: z.literal('message'),
      chatJid: z.string().min(1),
      keyId: z.string().min(1),
      sender: z.string().min(1),
      pushName: z.string().optional(),
      text: z.string().optional(),
      media: z.boolean().optional(),
      at: z.number(),
    })
    .strict(),
  z.object({ op: z.literal('logout') }).strict(),
  z.object({ op: z.literal('fail') }).strict(),
]);
export type BridgeTestOp = z.infer<typeof bridgeTestSchema>;
