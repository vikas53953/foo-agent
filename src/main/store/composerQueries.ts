// Spec: 08-1 §3.2 message:send (`{ chatId; clientId; text; replyToId?; attachmentIds?; secretOverride? }` → `{ messageId;
// queued }`, idempotent on `(chat_id, client_id)` through the unique index `messages_client`: a repeat creates nothing and
// returns the stored id and its current `queued`; `SECRET_SUSPECTED` returns the `PasteCatch`), composer:saveDraft (upsert
// the chat's `drafts` row, text redacted; empty text, no attachments and no reply target deletes it), voice:submit
// (`VOICE_TOO_SHORT`), §4.3.2 (messages, drafts DDL), §4.6 rule 2 (stored text goes through the Redactor, 08-2 §11.4 R1/R2),
// §0.6 / §0.7.1 (ids, safeName), 04 §3.3 (a message that cannot reach the job runner is saved as Waiting to send, `queued`;
// otherwise ✓ Sent once written), 04-2 §21.3 (text trimmed of leading/trailing blank lines; spaces only never sends; the
// draft is deleted on Send), §22.4 ("Send anyway": the span shows as "•••• (hidden)"; the AI text is the hidden note), §23.5,
// 08-2 §11.5, AT-225. No AI turn is started here (M3).
import type { Db } from './db';
import { draftRow, type DbRow } from '../db/rows';
import { messageGet } from './queries';
import { t } from '../../shared/copy/t';
import { checkSecret, redactSecrets } from '../../shared/redactor';
import type { Attachment, DraftRow, MessageRow, PasteCatch } from '../../shared/types';

/** 04-2 §22.4 / 08-2 §11.5: what the AI receives in place of a hidden secret (a prompt string, not copy; 08-0 §D). */
export const HIDDEN_FOR_AI = '[the user typed a secret; it was hidden]';
/** 04-2 §22.1: a voice note shorter than this is discarded. */
export const VOICE_MIN_MS = 500;
/** 04-2 §22.1 / J7: recording stops at 5:00. */
export const VOICE_MAX_MS = 5 * 60_000;
/** 04-2 §23.6. */
export const SEND_TEXT_LIMIT = 10_000;

export interface SendRequest {
  chatId: string;
  clientId: string;
  text: string;
  replyToId?: string;
  attachmentIds?: string[];
  secretOverride?: boolean;
}

export type SendResult =
  | { ok: true; messageId: string; queued: boolean; created: boolean; row: MessageRow }
  | { ok: false; reason: 'not_found' | 'empty' | 'too_long' | 'attachment_missing' | 'secret'; paste?: PasteCatch };

export interface SendContext {
  now: number;
  newId: () => string;
  /** 04 §3.3: offline, your AI not answering, signed out, at its limit or the spend cap → Waiting to send. */
  waiting: boolean;
  /** Attachments staged this run or kept with the chat's draft. */
  attachment: (id: string) => Attachment | undefined;
  /** P16 context (04-2 §22.4). */
  askedForCode?: boolean;
}

/** 04-2 §21.3: leading and trailing blank lines go, inner blank lines stay; trailing spaces on the ends go too. */
export function trimBlankLines(text: string): string {
  return text
    .replace(/^(?:[ \t]*\r?\n)+/, '')
    .replace(/(?:\r?\n[ \t]*)+$/, '')
    .replace(/^\s+$/, '');
}

/** 04 §2 / 08-4 §25.7: ≥ 30 % Devanagari letters → 'hi', Gurmukhi → 'pa', else 'en'. */
export function textLang(text: string): 'en' | 'hi' | 'pa' {
  const all = text.match(/\p{L}/gu)?.length ?? 0;
  if (!all) return 'en';
  const letter = (c: string) => /\p{L}|\p{M}/u.test(c);
  const d = (text.match(/\p{Script=Devanagari}/gu) ?? []).filter(letter).length;
  const g = (text.match(/\p{Script=Gurmukhi}/gu) ?? []).filter(letter).length;
  if (d / all >= 0.3 && d >= g) return 'hi';
  if (g / all >= 0.3) return 'pa';
  return 'en';
}

function existing(db: Db, chatId: string, clientId: string): DbRow | undefined {
  return db.prepare('SELECT id, status FROM messages WHERE chat_id = ? AND client_id = ?').get(chatId, clientId) as DbRow | undefined;
}

export function nextSeq(db: Db, chatId: string): number {
  const r = db
    .prepare('SELECT next_seq, (SELECT COALESCE(MAX(seq), 0) FROM messages WHERE chat_id = ?) AS top FROM chats WHERE id = ?')
    .get(chatId, chatId) as DbRow;
  return Math.max(Number(r.next_seq), Number(r.top) + 1);
}

/** Writes one message row and moves the chat forward (next_seq, last message, activity time, rev). */
function insertUserMessage(
  db: Db,
  m: {
    id: string;
    chatId: string;
    clientId: string | null;
    kind: 'text' | 'voice';
    text: string;
    textForAi: string | null;
    status: 'queued' | 'sent';
    replyToId: string | null;
    attachments: Attachment[] | null;
    voicePath: string | null;
    voiceMs: number | null;
    now: number;
  },
): void {
  const seq = nextSeq(db, m.chatId);
  db.prepare(
    `INSERT INTO messages (id, chat_id, seq, author_kind, kind, client_id, text, text_for_ai, status, reply_to_id, lang,
       voice_path, voice_ms, attachments, created_at)
     VALUES (?, ?, ?, 'user', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    m.id,
    m.chatId,
    seq,
    m.kind,
    m.clientId,
    m.text,
    m.textForAi,
    m.status,
    m.replyToId,
    m.kind === 'text' ? textLang(m.text) : null,
    m.voicePath,
    m.voiceMs,
    m.attachments?.length ? JSON.stringify(m.attachments) : null,
    m.now,
  );
  db.prepare('UPDATE chats SET next_seq = ?, last_message_id = ?, last_activity_at = ?, unread_count = 0, rev = rev + 1 WHERE id = ?').run(
    seq + 1,
    m.id,
    m.now,
    m.chatId,
  );
}

/** message:send (08-1 §3.2). Idempotent on (chatId, clientId) (AT-225). */
export function sendMessage(db: Db, req: SendRequest, ctx: SendContext): SendResult {
  const chat = db.prepare('SELECT id FROM chats WHERE id = ? AND deleted_at IS NULL').get(req.chatId) as DbRow | undefined;
  if (!chat) return { ok: false, reason: 'not_found' };
  const known = existing(db, req.chatId, req.clientId);
  if (known) {
    const row = messageGet(db, String(known.id))!;
    return { ok: true, messageId: row.id, queued: row.status === 'queued', created: false, row };
  }
  const text = trimBlankLines(req.text);
  const attachments: Attachment[] = [];
  for (const id of req.attachmentIds ?? []) {
    const a = ctx.attachment(id);
    if (!a) return { ok: false, reason: 'attachment_missing' };
    attachments.push(a);
  }
  if (!text.trim() && !attachments.length) return { ok: false, reason: 'empty' };
  if ([...text].length > SEND_TEXT_LIMIT) return { ok: false, reason: 'too_long' };
  // R1: main re-checks what the composer's paste catcher saw. "Send anyway" arrives with the spans already hidden.
  let stored = text;
  let forAi: string | null = null;
  if (req.secretOverride) {
    const hidden = t('composer.paste.hidden_in_bubble');
    stored = redactSecrets(text, hidden, { askedForCode: ctx.askedForCode }).text;
    if (stored.includes(hidden)) forAi = stored.split(hidden).join(HIDDEN_FOR_AI);
  } else {
    const paste = checkSecret(text, { askedForCode: ctx.askedForCode });
    if (paste) return { ok: false, reason: 'secret', paste };
  }
  if (req.replyToId) {
    const target = db.prepare('SELECT chat_id FROM messages WHERE id = ?').get(req.replyToId) as DbRow | undefined;
    if (!target || target.chat_id !== req.chatId) return { ok: false, reason: 'not_found' };
  }
  const id = ctx.newId();
  const status = ctx.waiting ? 'queued' : 'sent';
  db.transaction(() => {
    insertUserMessage(db, {
      id,
      chatId: req.chatId,
      clientId: req.clientId,
      kind: 'text',
      text: stored,
      textForAi: forAi,
      status,
      replyToId: req.replyToId ?? null,
      attachments,
      voicePath: null,
      voiceMs: null,
      now: ctx.now,
    });
    deleteDraftRow(db, req.chatId);
  })();
  return { ok: true, messageId: id, queued: status === 'queued', created: true, row: messageGet(db, id)! };
}

export interface DraftRequest {
  chatId: string;
  text: string;
  attachmentIds: string[];
  replyToId?: string;
  linkPreviewRemoved: boolean;
}

function deleteDraftRow(db: Db, chatId: string): boolean {
  return db.prepare('DELETE FROM drafts WHERE chat_id = ?').run(chatId).changes > 0;
}

/**
 * composer:saveDraft (08-1 §3.2, 04-2 §23.5): upserts the chat's draft with its text redacted; an empty draft deletes the
 * row. Returns whether the stored draft changed (the chat row's "Draft: …" preview then changes too).
 */
export function saveDraft(
  db: Db,
  req: DraftRequest,
  ctx: { now: number; newId: () => string; attachment: (id: string) => Attachment | undefined },
): { changed: boolean; draft: DraftRow | null } | null {
  const chat = db.prepare('SELECT id FROM chats WHERE id = ? AND deleted_at IS NULL').get(req.chatId) as DbRow | undefined;
  if (!chat) return null;
  const attachments = req.attachmentIds.map(ctx.attachment).filter((a): a is Attachment => !!a);
  const text = redactSecrets(req.text).text;
  if (!text.trim() && !attachments.length && !req.replyToId) return { changed: deleteDraftRow(db, req.chatId), draft: null };
  const before = db.prepare('SELECT text, attachments, reply_to_id, link_preview_removed FROM drafts WHERE chat_id = ?').get(req.chatId) as
    DbRow | undefined;
  const json = JSON.stringify(attachments);
  const reply = req.replyToId ?? null;
  const removed = req.linkPreviewRemoved ? 1 : 0;
  if (
    before &&
    before.text === text &&
    before.attachments === json &&
    before.reply_to_id === reply &&
    before.link_preview_removed === removed
  )
    return { changed: false, draft: draftRow(db.prepare('SELECT * FROM drafts WHERE chat_id = ?').get(req.chatId) as DbRow) };
  db.prepare(
    `INSERT INTO drafts (id, chat_id, text, attachments, reply_to_id, link_preview_removed, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(chat_id) DO UPDATE SET text = excluded.text, attachments = excluded.attachments, reply_to_id = excluded.reply_to_id,
       link_preview_removed = excluded.link_preview_removed, updated_at = excluded.updated_at`,
  ).run(ctx.newId(), req.chatId, text, json, reply, removed, ctx.now);
  db.prepare('UPDATE chats SET rev = rev + 1 WHERE id = ?').run(req.chatId);
  return { changed: true, draft: draftRow(db.prepare('SELECT * FROM drafts WHERE chat_id = ?').get(req.chatId) as DbRow) };
}

/** The attachments kept with a chat's draft (they outlive this run's staging map). */
export function draftAttachments(db: Db, chatId: string): Attachment[] {
  const r = db.prepare('SELECT attachments FROM drafts WHERE chat_id = ?').get(chatId) as DbRow | undefined;
  return r ? draftRow({ ...r, id: '', chat_id: chatId, updated_at: 0 }).attachments : [];
}

export type VoiceResult = { ok: true; row: MessageRow } | { ok: false; reason: 'not_found' | 'too_short' };

/** voice:submit (08-1 §3.2, 04-2 §22.1): a voice-note message whose file is already at `voicePath` (under {DATA}). */
export function submitVoice(
  db: Db,
  req: { chatId: string; messageId: string; voicePath: string; durationMs: number },
  ctx: { now: number; waiting: boolean },
): VoiceResult {
  const chat = db.prepare('SELECT id FROM chats WHERE id = ? AND deleted_at IS NULL').get(req.chatId) as DbRow | undefined;
  if (!chat) return { ok: false, reason: 'not_found' };
  if (req.durationMs < VOICE_MIN_MS) return { ok: false, reason: 'too_short' };
  db.transaction(() =>
    insertUserMessage(db, {
      id: req.messageId,
      chatId: req.chatId,
      clientId: null,
      kind: 'voice',
      text: '',
      textForAi: null,
      status: ctx.waiting ? 'queued' : 'sent',
      replyToId: null,
      attachments: null,
      voicePath: req.voicePath,
      voiceMs: Math.min(req.durationMs, VOICE_MAX_MS),
      now: ctx.now,
    }),
  )();
  return { ok: true, row: messageGet(db, req.messageId)! };
}

/** helper:pause (08-1 §3.2) for the composer's "Turn on" (04-2 §23.2 banner 2). */
export function pauseHelper(db: Db, helperId: string, on: boolean): boolean {
  return (
    db.prepare('UPDATE helpers SET paused = ?, rev = rev + 1 WHERE id = ? AND deleted_at IS NULL').run(on ? 1 : 0, helperId).changes > 0
  );
}
