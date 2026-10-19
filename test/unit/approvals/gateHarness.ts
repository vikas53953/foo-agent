// Shared harness for the M5-T4 approval gate tests: main's ApprovalGate over an in-memory SQLite db (the real migrations),
// one chat, one needs_you job, a fake clock and a fake engine port that records what main sends (08-1 §2.4).
import Database from 'better-sqlite3';
import { migrate, type Db } from '../../../src/main/store/db';
import { ApprovalGate, type CreateInput, type GateDeps } from '../../../src/main/approvals/ApprovalGate';
import type { TxEffects } from '../../../src/main/engine-supervisor/engineHost';
import type { TechLogEntry } from '../../../src/main/log/techLog';
import type { ApprovalFields, Rule } from '../../../src/shared/types';

/** X-10: Fri 16 Oct 2026, 9:00 AM IST. */
export const T0 = Date.parse('2026-10-16T09:00:00+05:30');

export interface GateHarness {
  db: Db;
  gate: ApprovalGate;
  clock: { now: number };
  rules: Rule[];
  sent: { kind: string; payload: Record<string, unknown> }[];
  changed: TxEffects[];
  logs: TechLogEntry[];
  jobId: string;
  chatId: string;
  /** A new needs_you job in the chat. */
  job(id?: string): string;
  open(over?: Partial<CreateInput>): { approvalId: string; cardId: string; nonce: string };
  approval(id: string): Record<string, unknown>;
  card(id: string): Record<string, unknown>;
}

export const FIELDS: Record<string, ApprovalFields> = {
  book: {
    verb: 'book',
    payee: 'Pizza by the Bay',
    siteDomain: 'example.com',
    partySize: 4,
    cancelTerms: { freeUntil: T0 + 9 * 3_600_000, refundable: true },
    irreversible: false,
  },
  delete: { verb: 'delete', item: '3 emails from Example Mobile', channel: 'email', irreversible: true },
  send: {
    verb: 'send',
    channel: 'email',
    recipients: [{ name: 'Priya Example', address: 'priya@example.com', isNew: true, isGroup: false }],
    irreversible: true,
  },
  use_app: { verb: 'use_app', app: 'calendar', irreversible: false },
  calendar_write: { verb: 'calendar_write', item: 'Train to Mumbai', irreversible: false },
  share: { verb: 'share', siteDomain: 'example.com', personalShared: ['phone'], irreversible: true },
};

let migrated: Buffer | null = null;
/** The migrated empty db, built once and copied per harness (the FID-17 walks open hundreds). */
function template(): Buffer {
  if (!migrated) {
    const db = new Database(':memory:');
    migrate(db as unknown as Db, 'src/main/store/migrations');
    migrated = db.serialize();
    db.close();
  }
  return migrated;
}

export function gateHarness(over: Partial<GateDeps> = {}): GateHarness {
  const db = new Database(template()) as unknown as Db;
  db.pragma('foreign_keys = ON');
  const chatId = 'c_errands';
  db.prepare("INSERT INTO chats (id, kind, title, last_activity_at, created_at) VALUES (?, 'foo', 'Errands', 1, 1)").run(chatId);
  const clock = { now: T0 };
  const h: GateHarness = {
    db,
    clock,
    rules: [],
    sent: [],
    changed: [],
    logs: [],
    chatId,
    jobId: '',
    gate: undefined as unknown as ApprovalGate,
    job(id = `j_${Math.random().toString(36).slice(2)}`) {
      db.prepare(
        `INSERT INTO jobs (id, chat_id, origin_chat_id, owner_kind, title, origin, intent, state, created_at)
         VALUES (?, ?, ?, 'foo', 'Book a table', 'user', 'do', 'needs_you', ?)`,
      ).run(id, chatId, chatId, clock.now);
      return id;
    },
    open(o = {}) {
      const verb = o.verb ?? 'book';
      const r = h.gate.create({
        jobId: h.jobId,
        verb,
        fields: FIELDS[verb]!,
        hardLimit: verb !== 'use_app' && verb !== 'calendar_write',
        title: 'Book this table?',
        impact: 'Pizza by the Bay, Marine Drive · Sun 18 Oct, 8:00 PM · 4 people',
        ...o,
      });
      if (!r.ok) throw new Error(`create refused: ${r.error.kind}`);
      return r.value;
    },
    approval: (id) => db.prepare('SELECT * FROM approvals WHERE id = ?').get(id) as Record<string, unknown>,
    card: (id) => db.prepare('SELECT * FROM cards WHERE id = ?').get(id) as Record<string, unknown>,
  };
  h.jobId = h.job('j_book');
  h.gate = new ApprovalGate({
    db,
    now: () => clock.now,
    timeZone: () => 'Asia/Kolkata',
    rules: { get: () => h.rules, set: (r) => (h.rules = r) },
    changed: (e) => h.changed.push(e),
    engine: { send: (kind, payload) => (h.sent.push({ kind, payload }), true) },
    log: (l) => h.logs.push(l),
    ...over,
  });
  return h;
}
