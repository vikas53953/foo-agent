// Spec: 08-3 §22.9 (seed sets generated deterministically from IdGen(seed=1) and a fixed PRNG seeded 1, relative to the
// pinned clock), 08-1 §4.3 (tables and their insert order), 08-0 §E.7 (ids). Test builds only (this folder never ships).
import type { Db } from '../../store/db';
import { recomputePill } from '../../store/queries';
import { uuid7 } from '../../../shared/ids';
import type { IdPrefix } from '../../../shared/ids';
import type { CardType, JobState } from '../../../shared/types';

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;
/** IST is UTC+5:30 all year (no daylight saving). */
const IST_OFFSET = 330 * MIN;

/** mulberry32: small, fast and the same on every machine. */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Epoch ms of a wall-clock time in India: ist(2026, 10, 16, 9, 41) = Fri 16 Oct 2026, 9:41 AM IST. */
export function ist(y: number, month: number, d: number, h = 0, mi = 0): number {
  return Date.UTC(y, month - 1, d, h, mi) - IST_OFFSET;
}

/** Tables a seed writes, children first, so a wipe never trips a foreign key. */
const WIPE_ORDER = [
  'reactions',
  'payments',
  'approvals',
  'tool_calls',
  'steps',
  'ai_turns',
  'drafts',
  'group_members',
  'wa_messages',
  'wa_contacts',
  'cards',
  'messages',
  'jobs',
  'helpers',
  'chats',
];

export interface ChatSpec {
  kind: 'foo' | 'helper' | 'group' | 'wa_mirror';
  title: string;
  at: number;
  helper?: { name: string; color: string; face: string; job: string };
  colorToken?: string | null;
  avatarRef?: string | null;
  waJid?: string;
  archived?: boolean;
  pinnedAt?: number;
  unread?: number;
  createdAt?: number;
}

export interface MessageSpec {
  author: 'user' | 'foo' | 'helper' | 'system';
  helperId?: string;
  text?: string;
  at: number;
  kind?: 'text' | 'voice' | 'card' | 'marker';
  markerKind?: string;
  status?: 'queued' | 'sent' | 'streaming' | 'complete' | 'failed';
  badge?: string | null;
  jobId?: string;
  voiceMs?: number;
  attachments?: { id: string; name: string; mime: string; bytes: number; path: string }[];
}

export interface CardSpec {
  type: CardType;
  state: string;
  payload: Record<string, unknown>;
  at: number;
  jobId?: string;
  expiresAt?: number;
  author?: 'foo' | 'helper';
  helperId?: string;
}

export interface JobSpec {
  chatId: string;
  title: string;
  state: JobState;
  createdAt: number;
  finishedAt?: number;
  lastProgressAt?: number;
  ownerHelperId?: string;
  intent?: 'read_only' | 'do';
  steps?: { text: string; state: 'pending' | 'running' | 'done' | 'failed' | 'skipped' | 'waiting_user' }[];
}

/** Writes seed rows through the real schema (the migrations already ran on `db`). */
export class SeedWriter {
  readonly rand: () => number;
  private counts = { chats: 0, messages: 0 };
  private readonly seq = new Map<string, number>();
  private readonly last = new Map<string, { id: string; at: number }>();

  constructor(
    readonly db: Db,
    seed = 1,
  ) {
    this.rand = prng(seed);
  }

  /** IdGen(seed): UUIDv7 on the row's own time with PRNG randomness. */
  id(prefix: IdPrefix, at: number): string {
    return `${prefix}_${uuid7(at, this.rand)}`;
  }

  pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.rand() * list.length)]!;
  }

  /** Empties the seeded tables. Call outside a transaction: the rows point at each other, so keys are off while it runs. */
  wipe(): void {
    this.db.pragma('foreign_keys = OFF');
    try {
      this.db.transaction(() => {
        for (const table of WIPE_ORDER) this.db.exec(`DELETE FROM ${table}`);
      })();
    } finally {
      this.db.pragma('foreign_keys = ON');
    }
  }

  /** Throws when a seeded row breaks a foreign key (run after the seed's transaction commits). */
  check(): void {
    const bad = this.db.pragma('foreign_key_check') as unknown[];
    if (bad.length) throw new Error(`seed broke ${bad.length} foreign keys: ${JSON.stringify(bad.slice(0, 3))}`);
  }

  chat(spec: ChatSpec): { chatId: string; helperId: string | null } {
    const created = spec.createdAt ?? spec.at;
    const chatId = this.id('c', created);
    const helperId = spec.helper ? this.id('h', created) : null;
    this.db
      .prepare(
        `INSERT INTO chats (id, kind, helper_id, title, avatar_ref, color_token, wa_jid, pinned, archived, unread_count,
           last_activity_at, next_seq, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      )
      .run(
        chatId,
        spec.kind,
        helperId,
        spec.title,
        spec.avatarRef ?? null,
        spec.colorToken ?? spec.helper?.color ?? null,
        spec.waJid ?? null,
        spec.pinnedAt ?? 0,
        spec.archived ? 1 : 0,
        spec.unread ?? 0,
        spec.at,
        created,
      );
    if (spec.helper && helperId) {
      const apps = { gmail: true, gcal: true, contacts: true, whatsapp: false, x: false, outlook: false, browser: true, payments: true };
      this.db
        .prepare(
          `INSERT INTO helpers (id, name, job_text, face_ref, color_token, allowed_apps, chat_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(helperId, spec.helper.name, spec.helper.job, spec.helper.face, spec.helper.color, JSON.stringify(apps), chatId, created);
    }
    this.counts.chats++;
    return { chatId, helperId };
  }

  member(chatId: string, memberId: string, role: 'owner' | 'member', at: number): void {
    this.db.prepare('INSERT INTO group_members (chat_id, member_id, role, added_at) VALUES (?, ?, ?, ?)').run(chatId, memberId, role, at);
  }

  private nextSeq(chatId: string): number {
    const n = (this.seq.get(chatId) ?? 0) + 1;
    this.seq.set(chatId, n);
    return n;
  }

  message(chatId: string, m: MessageSpec, cardId: string | null = null): string {
    const id = this.id('m', m.at);
    const kind = m.kind ?? (cardId ? 'card' : 'text');
    const status = m.status ?? (m.author === 'user' ? 'sent' : 'complete');
    this.db
      .prepare(
        `INSERT INTO messages (id, chat_id, seq, author_kind, author_id, kind, marker_kind, text, status, badge, job_id, card_id,
           voice_ms, attachments, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        chatId,
        this.nextSeq(chatId),
        m.author,
        m.author === 'helper' ? (m.helperId ?? null) : null,
        kind,
        m.markerKind ?? null,
        m.text ?? '',
        status,
        m.badge ?? null,
        m.jobId ?? null,
        cardId,
        m.voiceMs ?? null,
        m.attachments ? JSON.stringify(m.attachments) : null,
        m.at,
      );
    const prev = this.last.get(chatId);
    if (!prev || m.at >= prev.at) this.last.set(chatId, { id, at: m.at });
    this.counts.messages++;
    return id;
  }

  /** A card and the message that carries it (08-1 §4.3.3 insert order: message, then card). */
  card(chatId: string, c: CardSpec): { cardId: string; messageId: string } {
    const cardId = this.id('k', c.at);
    const messageId = this.message(
      chatId,
      { author: c.author ?? 'foo', helperId: c.helperId, at: c.at, kind: 'card', jobId: c.jobId },
      cardId,
    );
    const nonce = Array.from({ length: 32 }, () => Math.floor(this.rand() * 16).toString(16)).join('');
    this.db
      .prepare(
        `INSERT INTO cards (id, chat_id, message_id, job_id, type, state, payload, nonce, expires_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(cardId, chatId, messageId, c.jobId ?? null, c.type, c.state, JSON.stringify(c.payload), nonce, c.expiresAt ?? null, c.at, c.at);
    return { cardId, messageId };
  }

  job(j: JobSpec): string {
    const id = this.id('j', j.createdAt);
    const steps = j.steps ?? [];
    const runningIdx = steps.findIndex((s) => s.state === 'running' || s.state === 'waiting_user');
    this.db
      .prepare(
        `INSERT INTO jobs (id, chat_id, origin_chat_id, owner_kind, owner_id, title, origin, intent, state, step_count, current_step_idx,
           uses_browser, created_at, started_at, last_progress_at, finished_at)
         VALUES (?, ?, ?, ?, ?, ?, 'user', ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
      )
      .run(
        id,
        j.chatId,
        j.chatId,
        j.ownerHelperId ? 'helper' : 'foo',
        j.ownerHelperId ?? null,
        j.title,
        j.intent ?? 'do',
        j.state,
        steps.length,
        runningIdx >= 0 ? runningIdx : null,
        j.createdAt,
        j.createdAt,
        j.lastProgressAt ?? j.finishedAt ?? j.createdAt,
        j.finishedAt ?? null,
      );
    steps.forEach((s, idx) => {
      this.db
        .prepare(`INSERT INTO steps (id, job_id, idx, phrase_key, slots, state) VALUES (?, ?, ?, 'freeform', ?, ?)`)
        .run(this.id('s', j.createdAt), id, idx, JSON.stringify({ text: s.text }), s.state);
    });
    return id;
  }

  linkJob(jobId: string, fields: { userMessageId?: string; needsYouCardId?: string; resultMessageId?: string }): void {
    if (fields.userMessageId) this.db.prepare('UPDATE jobs SET user_message_id = ? WHERE id = ?').run(fields.userMessageId, jobId);
    if (fields.needsYouCardId) this.db.prepare('UPDATE jobs SET needs_you_card_id = ? WHERE id = ?').run(fields.needsYouCardId, jobId);
    if (fields.resultMessageId) this.db.prepare('UPDATE jobs SET result_message_id = ? WHERE id = ?').run(fields.resultMessageId, jobId);
  }

  /** A payment that went through: approval (COMPLETED), payment card and the payments row (08-1 §4.3.6). */
  paid(chatId: string, jobId: string, p: { payee: string; description: string; paise: number; at: number; site: string }): void {
    const { cardId } = this.card(chatId, {
      type: 'payment',
      state: 'COMPLETED',
      jobId,
      at: p.at,
      payload: { title: `Pay ${p.payee}`, payee: p.payee, amountPaise: p.paise, description: p.description },
    });
    const approvalId = this.approval(cardId, jobId, chatId, 'COMPLETED', p, p.at + 10 * MIN);
    this.db
      .prepare(
        `INSERT INTO payments (id, approval_id, job_id, payee, description, amount_paise, method, method_label, site_domain, state,
           submitted_at, confirmed_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'card', 'Visa ••4242', ?, 'succeeded', ?, ?, ?)`,
      )
      .run(this.id('py', p.at), approvalId, jobId, p.payee, p.description, p.paise, p.site, p.at, p.at + MIN, p.at);
  }

  approval(
    cardId: string,
    jobId: string,
    chatId: string,
    state: string,
    p: { payee: string; paise: number; at: number },
    expiresAt: number,
  ): string {
    const id = this.id('ap', p.at);
    const fields = JSON.stringify({ payee: p.payee, amountPaise: p.paise });
    const hash = Array.from({ length: 64 }, () => Math.floor(this.rand() * 16).toString(16)).join('');
    this.db
      .prepare(
        `INSERT INTO approvals (id, card_id, job_id, chat_id, verb, hard_limit, fields, fields_hash, state, expires_at, created_at,
           approved_at, completed_at)
         VALUES (?, ?, ?, ?, 'pay', 1, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        cardId,
        jobId,
        chatId,
        fields,
        hash,
        state,
        expiresAt,
        p.at,
        state === 'PENDING' ? null : p.at,
        state === 'COMPLETED' ? p.at + MIN : null,
      );
    return id;
  }

  aiTurn(chatId: string | null, at: number, paise: number): void {
    this.db
      .prepare(
        `INSERT INTO ai_turns (id, chat_id, purpose, provider_id, cost_paise, cost_source, billing, outcome, started_at)
         VALUES (?, ?, 'chat', 'claude-cli', ?, 'reported', 'key', 'ok', ?)`,
      )
      .run(this.id('t', at), chatId, paise, at);
  }

  waMessage(jid: string, m: { fromMe: boolean; sender: string; text: string; at: number }, n: number): void {
    this.db
      .prepare('INSERT INTO wa_messages (id, chat_jid, from_me, sender_label, text, at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(`wa_${jid}:${n}`, jid, m.fromMe ? 1 : 0, m.sender, m.text, m.at);
  }

  /** Points every chat at its newest message, sets next_seq and derives chats.pill at `now` (call once at the end). */
  finish(now: number): { chats: number; messages: number } {
    const upd = this.db.prepare('UPDATE chats SET last_message_id = ?, next_seq = ? WHERE id = ?');
    for (const [chatId, m] of this.last) upd.run(m.id, (this.seq.get(chatId) ?? 0) + 1, chatId);
    for (const id of this.db.prepare('SELECT id FROM chats').pluck().all() as string[]) recomputePill(this.db, id, now);
    return { ...this.counts };
  }
}
