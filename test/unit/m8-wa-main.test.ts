// M8 T3: main's WhatsApp writes on a migrated SQLite db. Expected values from the spec: ingest is INSERT OR IGNORE on
// 'wa_' + chat_jid + ':' + key.id and updates the mirror's last_activity_at / unread_count, never last_message_id
// (08-3 §16.4.3, X-129); 7-day retention deletes rows and leaves the chat (J16); only groups become wa_mirror chats, muted
// 'forever' (§16.4.3); the connection row carries the masked number (08-1 §4.3.10) and Activity `connected` /
// `disconnected` "Disconnected WhatsApp" (06-3 C-11, 08-0 §G.4); unlink and read=false delete wa_messages + wa_contacts;
// chat:archive sets archived and hiddenJids in one step, VALIDATION for any other chat kind (08-1 §3.2); chat:open returns
// the newest 200 (AT-270).
import Database from 'better-sqlite3';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DbOp } from '../../src/engine/protocol';
import { applyDbOps } from '../../src/main/engine-supervisor/engineHost';
import { migrate, type Db } from '../../src/main/store/db';
import { chatOpen } from '../../src/main/store/queries';
import { applyWaReport, archiveMirror, bridgeWanted, deleteWaData, startupWhatsApp, unlinkWhatsApp } from '../../src/main/whatsapp/waStore';
import { settingsDefaults } from '../../src/shared/settingsDefaults';
import type { Settings } from '../../src/shared/settings';

const NOW = 1_792_121_400_000;
const DAY = 86_400_000;
const FAMILY = '120363000000000001@g.us';
const SOCIETY = '120363000000000002@g.us';

let db: Db;
let settings: Settings;
const store = {
  get: () => settings,
  update: (fn: (s: Settings) => Settings) => {
    settings = fn(settings);
  },
};
const tx = (ops: DbOp[], now = NOW) => applyDbOps(db, ops, { now, dataDir: mkdtempSync(join(tmpdir(), 'foo-wa-')) });
const waRow = (key: string, o: { at?: number; fromMe?: boolean; sender?: string; jid?: string } = {}): DbOp => ({
  op: 'insert',
  table: 'wa_messages',
  row: {
    id: `wa_${o.jid ?? FAMILY}:${key}`,
    chat_jid: o.jid ?? FAMILY,
    from_me: o.fromMe ? 1 : 0,
    sender_label: o.fromMe ? 'You' : (o.sender ?? 'Mom'),
    text: `message ${key}`,
    at: o.at ?? NOW,
    starred: 0,
    mentions_me: 0,
  },
  redact: ['text'],
});
const chat = (jid: string) =>
  db.prepare('SELECT * FROM chats WHERE wa_jid = ? AND deleted_at IS NULL').get(jid) as Record<string, unknown> | undefined;
const count = (sql: string) => (db.prepare(sql).pluck().get() as number) ?? 0;
const linked = () => applyWaReport(db, store, { event: 'linked', accountLabel: '+91 98••• ••210', accountHash: 'h1' }, NOW);
const groups = () =>
  applyWaReport(
    db,
    store,
    {
      event: 'groups',
      groups: [
        { jid: FAMILY, title: 'Family group' },
        { jid: SOCIETY, title: 'Society committee' },
      ],
    },
    NOW,
  );

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db);
  settings = structuredClone(settingsDefaults);
});

describe('connection row (08-1 §4.3.10 status machine)', () => {
  it('linkStart makes a connecting row; a scan turns it into the linked row with the masked number', () => {
    const pending = applyWaReport(db, store, { event: 'status', status: 'connecting', errorKind: null }, NOW).connection!;
    expect(db.prepare("SELECT status FROM connections WHERE app = 'whatsapp'").pluck().all()).toEqual(['connecting']);
    const r = linked();
    expect(r.connection).toMatchObject({ app: 'whatsapp', status: 'connected', accountLabel: '+91 98••• ••210', lastErrorKind: null });
    // the same row (id kept, rev up), so the renderer's connection:upsert replaces the connecting one
    expect(r.connection).toMatchObject({ id: pending.id, rev: pending.rev + 1 });
    expect(count("SELECT COUNT(*) FROM connections WHERE app = 'whatsapp'")).toBe(1);
    expect(db.prepare("SELECT vault_name FROM connections WHERE app = 'whatsapp'").pluck().get()).toBe('wa-session');
    const act = db.prepare("SELECT kind, event, summary FROM activity WHERE event = 'connected'").get();
    expect(act).toEqual({ kind: 'connected', event: 'connected', summary: 'Connected WhatsApp (+91 98••• ••210)' });
  });

  it('the third failed link leaves it disconnected with WA_LINK_FAILED', () => {
    applyWaReport(db, store, { event: 'status', status: 'connecting', errorKind: null }, NOW);
    const r = applyWaReport(db, store, { event: 'status', status: 'disconnected', errorKind: 'WA_LINK_FAILED' }, NOW);
    expect(r.connection).toMatchObject({ status: 'disconnected', lastErrorKind: 'WA_LINK_FAILED' });
  });

  it('the phone unlinking foo marks the linked row unlinked', () => {
    linked();
    const r = applyWaReport(db, store, { event: 'status', status: 'unlinked', errorKind: 'WA_UNLINKED' }, NOW);
    expect(r.connection).toMatchObject({ status: 'unlinked', lastErrorKind: 'WA_UNLINKED' });
  });

  it('at startup a connecting row becomes disconnected, and only a live row starts the bridge', () => {
    applyWaReport(db, store, { event: 'status', status: 'connecting', errorKind: null }, NOW);
    expect(bridgeWanted(db)).toBe(false);
    startupWhatsApp(db, NOW);
    expect(db.prepare("SELECT status FROM connections WHERE app = 'whatsapp'").pluck().get()).toBe('disconnected');
    linked();
    expect(bridgeWanted(db)).toBe(true);
  });
});

describe('group mirrors (08-3 §16.4.3)', () => {
  it('every group becomes one muted wa_mirror chat; a second report adds nothing', () => {
    linked();
    const r = groups();
    expect(r.chatIds).toHaveLength(2);
    groups();
    expect(count("SELECT COUNT(*) FROM chats WHERE kind = 'wa_mirror'")).toBe(2);
    const fam = chat(FAMILY)!;
    expect(fam).toMatchObject({ kind: 'wa_mirror', title: 'Family group', archived: 0, last_message_id: null });
    expect(settings.notifications.mutedChats[String(fam.id)]).toBe('forever');
  });

  it('a group hidden before stays archived when it is mirrored again', () => {
    settings.connections.whatsapp.hiddenJids = [SOCIETY];
    groups();
    expect(chat(SOCIETY)?.archived).toBe(1);
  });
});

describe('ingest (db.tx insert into wa_messages)', () => {
  beforeEach(() => {
    linked();
    groups();
  });

  it('is INSERT OR IGNORE: the same message twice is one row and the tx still succeeds', () => {
    expect(tx([waRow('A1')]).result.ok).toBe(true);
    expect(tx([waRow('A1')]).result.ok).toBe(true);
    expect(count('SELECT COUNT(*) FROM wa_messages')).toBe(1);
  });

  it('updates the mirror row: last_activity_at and unread for others, never last_message_id', () => {
    const before = chat(FAMILY)!;
    const r = tx([waRow('A1', { at: NOW + 5_000 }), waRow('A2', { at: NOW + 6_000, fromMe: true })]);
    expect([...r.effects.chatIds]).toEqual([before.id]);
    expect(chat(FAMILY)).toMatchObject({ last_activity_at: NOW + 6_000, unread_count: 1, last_message_id: null });
  });

  it('a 1:1 chat is stored but gets no chat row', () => {
    tx([waRow('B1', { jid: '919800000001@s.whatsapp.net' })]);
    expect(count('SELECT COUNT(*) FROM wa_messages')).toBe(1);
    expect(chat('919800000001@s.whatsapp.net')).toBeUndefined();
  });

  it('prunes rows older than 7 days on the next write and leaves the chat', () => {
    tx([waRow('OLD', { at: NOW - 7 * DAY - 1 }), waRow('KEEP', { at: NOW - 7 * DAY + 1 })], NOW - 7 * DAY + 2);
    tx([waRow('NEW')], NOW);
    expect(db.prepare('SELECT id FROM wa_messages ORDER BY at').pluck().all()).toEqual([`wa_${FAMILY}:KEEP`, `wa_${FAMILY}:NEW`]);
    expect(chat(FAMILY)).toBeDefined();
  });

  it('wa_contacts is an upsert by jid', () => {
    const c = (name: string): DbOp => ({ op: 'insert', table: 'wa_contacts', row: { jid: 'j1', name, phone: null, updated_at: NOW } });
    expect(tx([c('Mom')]).result.ok).toBe(true);
    expect(tx([c('Mummy')]).result.ok).toBe(true);
    expect(db.prepare('SELECT name FROM wa_contacts').pluck().all()).toEqual(['Mummy']);
  });

  it('ingest side of the 200-message window: 250 stored messages from 3 senders → chat:open gives the newest 200, oldest first', () => {
    const senders = ['Mom', 'Ravi', 'Priya'];
    const ops = Array.from({ length: 250 }, (_, i) => waRow(`M${i}`, { at: NOW - 250_000 + i * 1000, sender: senders[i % 3] }));
    expect(tx(ops).result.ok).toBe(true);
    const open = chatOpen(db, String(chat(FAMILY)!.id), NOW)!;
    expect(open.waMessages).toHaveLength(200);
    expect(open.waMessages![0]!.id).toBe(`wa_${FAMILY}:M50`);
    expect(open.waMessages!.at(-1)!.id).toBe(`wa_${FAMILY}:M249`);
    expect(new Set(open.waMessages!.map((m) => m.senderLabel))).toEqual(new Set(senders));
  });
});

describe('unlink, read=false and Hide from foo', () => {
  beforeEach(() => {
    linked();
    groups();
    tx([waRow('A1'), { op: 'insert', table: 'wa_contacts', row: { jid: 'j1', name: 'Mom', phone: null, updated_at: NOW } }]);
  });

  it('unlink (C-11) deletes the row, the messages, the contacts and the mirrors, and logs "Disconnected WhatsApp"', () => {
    const r = unlinkWhatsApp(db, NOW);
    expect(r.removedChatIds).toHaveLength(2);
    expect(r.connection).toMatchObject({ app: 'whatsapp', status: 'disconnected' });
    expect(count("SELECT COUNT(*) FROM connections WHERE app = 'whatsapp'")).toBe(0);
    expect(count('SELECT COUNT(*) FROM wa_messages') + count('SELECT COUNT(*) FROM wa_contacts')).toBe(0);
    expect(count("SELECT COUNT(*) FROM chats WHERE kind = 'wa_mirror' AND deleted_at IS NULL")).toBe(0);
    expect(db.prepare("SELECT summary FROM activity WHERE event = 'disconnected'").pluck().get()).toBe('Disconnected WhatsApp');
  });

  it('read=false deletes the stored messages and contacts, keeps the link', () => {
    deleteWaData(db);
    expect(count('SELECT COUNT(*) FROM wa_messages') + count('SELECT COUNT(*) FROM wa_contacts')).toBe(0);
    expect(count("SELECT COUNT(*) FROM connections WHERE app = 'whatsapp' AND status = 'connected'")).toBe(1);
  });

  it('chat:archive hides a mirror and adds its jid to hiddenJids in one step, and shows it again', () => {
    const id = String(chat(FAMILY)!.id);
    expect(archiveMirror(db, store, id, true).ok).toBe(true);
    expect(chat(FAMILY)?.archived).toBe(1);
    expect(settings.connections.whatsapp.hiddenJids).toEqual([FAMILY]);
    expect(archiveMirror(db, store, id, false).ok).toBe(true);
    expect(chat(FAMILY)?.archived).toBe(0);
    expect(settings.connections.whatsapp.hiddenJids).toEqual([]);
  });

  it('chat:archive on any other chat kind is VALIDATION', () => {
    db.prepare("INSERT INTO chats (id, kind, title, last_activity_at, created_at) VALUES ('c_foo', 'foo', 'foo', 1, 1)").run();
    const r = archiveMirror(db, store, 'c_foo', true);
    expect(r.ok ? null : r.error.kind).toBe('VALIDATION');
  });
});
