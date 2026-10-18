// Spec: 08-1 §2.4.1 (NamedQuery: named, prepared, read-only; the names are exactly this file's exported keys; every query adds
// `deleted_at IS NULL` for chats and messages), 08-2 §7.2 part 7 (the conversation the chat lane sends: the last 20
// completed messages of the chat, `text_for_ai ?? text`), 04 §3.3 (messages waiting to send). M3 has the queries the chat
// lane uses; later milestones add their names here (a new name is a constitution change, 08-1 §2.4.1).
import type { Db } from '../store/db';
import type { DbRow } from './rows';

export interface EngineChat {
  id: string;
  kind: 'foo' | 'helper' | 'group' | 'wa_mirror';
  title: string;
  helperId: string | null;
  private: boolean;
}
export interface EngineMessage {
  id: string;
  chatId: string;
  seq: number;
  authorKind: 'user' | 'foo' | 'helper' | 'system';
  authorId: string | null;
  kind: 'text' | 'voice' | 'card' | 'marker';
  text: string;
  textForAi: string | null;
  status: 'queued' | 'sent' | 'streaming' | 'complete' | 'failed';
  badge: string | null;
  createdAt: number;
  transcript: string | null;
  attachments: number;
}
export interface EngineHelper {
  id: string;
  name: string;
  jobText: string;
  goodResult: string | null;
  paused: boolean;
}

function chat(r: DbRow): EngineChat {
  return {
    id: String(r.id),
    kind: r.kind as EngineChat['kind'],
    title: String(r.title),
    helperId: (r.helper_id as string | null) ?? null,
    private: r.private === 1,
  };
}
function message(r: DbRow): EngineMessage {
  const atts = r.attachments ? (JSON.parse(String(r.attachments)) as unknown[]) : [];
  return {
    id: String(r.id),
    chatId: String(r.chat_id),
    seq: Number(r.seq),
    authorKind: r.author_kind as EngineMessage['authorKind'],
    authorId: (r.author_id as string | null) ?? null,
    kind: r.kind as EngineMessage['kind'],
    text: String(r.text),
    textForAi: (r.text_for_ai as string | null) ?? null,
    status: r.status as EngineMessage['status'],
    badge: (r.badge as string | null) ?? null,
    createdAt: Number(r.created_at),
    transcript: (r.transcript as string | null) ?? null,
    attachments: atts.length,
  };
}

/** Every named query: `(db, ...args) => result`. */
export const NAMED_QUERIES = {
  chatOpen: (db: Db, chatId: unknown): EngineChat | null => {
    const r = db.prepare('SELECT * FROM chats WHERE id = ? AND deleted_at IS NULL').get(String(chatId)) as DbRow | undefined;
    return r ? chat(r) : null;
  },
  /** The newest `limit` messages before `beforeSeq` (or the newest of all), oldest first. */
  messagesBefore: (db: Db, chatId: unknown, beforeSeq: unknown, limit: unknown): EngineMessage[] => {
    const rows = db
      .prepare(
        `SELECT * FROM messages WHERE chat_id = ? AND deleted_at IS NULL AND seq < ? ORDER BY seq DESC LIMIT ?`,
      )
      .all(String(chatId), beforeSeq === null || beforeSeq === undefined ? Number.MAX_SAFE_INTEGER : Number(beforeSeq), Number(limit ?? 20)) as DbRow[];
    return rows.reverse().map(message);
  },
  messageById: (db: Db, messageId: unknown): EngineMessage | null => {
    const r = db.prepare('SELECT * FROM messages WHERE id = ? AND deleted_at IS NULL').get(String(messageId)) as DbRow | undefined;
    return r ? message(r) : null;
  },
  /** 04 §3.3 Waiting to send: user messages saved while foo could not hand them on, oldest first. */
  messagesQueued: (db: Db): EngineMessage[] =>
    (
      db
        .prepare(
          `SELECT m.* FROM messages m JOIN chats c ON c.id = m.chat_id
            WHERE m.status = 'queued' AND m.author_kind = 'user' AND m.deleted_at IS NULL AND c.deleted_at IS NULL
            ORDER BY m.created_at, m.seq`,
        )
        .all() as DbRow[]
    ).map(message),
  'helpers.byId': (db: Db, helperId: unknown): EngineHelper | null => {
    const r = db.prepare('SELECT * FROM helpers WHERE id = ? AND deleted_at IS NULL').get(String(helperId)) as DbRow | undefined;
    return r
      ? { id: String(r.id), name: String(r.name), jobText: String(r.job_text), goodResult: (r.good_result as string | null) ?? null, paused: r.paused === 1 }
      : null;
  },
} as const;
