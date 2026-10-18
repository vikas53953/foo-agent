// Spec: 10-acceptance-1 AT-225 (J7): the composer sends message:send twice with the same clientId (a retry after a timeout)
// → exactly one message row exists and both calls return the same messageId; 08-1 §3.2 message:send (unique index
// messages_client), §3.1.0 (only message:send retries, once, with the same clientId).
// spec/trace.csv routes AT-225 to this file (CR-0003).
import Database from 'better-sqlite3';
import { beforeAll, describe, expect, it } from 'vitest';
import { migrate, type Db } from '../../src/main/store/db';
import { sendMessage, type SendContext } from '../../src/main/store/composerQueries';
import { SeedWriter, ist } from '../../src/main/test/seed/writer';

const NOW = ist(2026, 10, 16, 9, 0);

describe('AT-225 · message:send is idempotent on (chatId, clientId)', () => {
  let db: Db;
  let chat = '';
  let n = 0;
  const ctx = (): SendContext => ({ now: NOW, newId: () => `m_test_${++n}`, waiting: false, attachment: () => undefined });

  beforeAll(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    migrate(db);
    const w = new SeedWriter(db, 1);
    db.transaction(() => {
      chat = w.chat({ kind: 'foo', title: 'foo', at: NOW }).chatId;
    })();
    w.finish(NOW);
  });

  it('the same clientId twice gives one row and the same messageId both times', () => {
    const req = { chatId: chat, clientId: '4b1d0b6e-2f7c-4a8e-9b51-0c7a9f3e2d11', text: 'book the Goa hotel' };
    const a = sendMessage(db, req, ctx());
    const b = sendMessage(db, req, ctx());
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(b.messageId).toBe(a.messageId);
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.queued).toBe(a.queued);
    const rows = db.prepare('SELECT COUNT(*) FROM messages WHERE chat_id = ? AND client_id = ?').pluck().get(chat, req.clientId);
    expect(rows).toBe(1);
  });

  it('a different clientId is a new message', () => {
    const a = sendMessage(db, { chatId: chat, clientId: 'c-1', text: 'one' }, ctx());
    const b = sendMessage(db, { chatId: chat, clientId: 'c-2', text: 'one' }, ctx());
    expect(a.ok && b.ok && a.messageId !== b.messageId).toBe(true);
  });
});
