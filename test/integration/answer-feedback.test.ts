// Spec: AT-452, CR-0062 (X-219): 04 §17.1 👍 "toggles a local note on this answer" and §17.2 👎 "saved on this PC", kept
// across a restart (the store reopened); `null` clears the vote, chips and words; only foo's or a helper's text answer
// takes one, never the user's own message, a system line or a private chat's; the words are redacted (08-1 §4.6 rule 2).
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDb, type Db } from '../../src/main/store/db';
import { ensureFooChat, feedbackMessage, messageGet } from '../../src/main/store/queries';

const DIR = 'src/main/store/migrations';
const T = Date.UTC(2026, 9, 26, 9, 0);
const add = (db: Db, id: string, seq: number, author: string) =>
  db
    .prepare(
      "INSERT INTO messages (id, chat_id, seq, author_kind, kind, text, status, created_at) VALUES (?, 'c_foo', ?, ?, 'text', 'x', 'complete', ?)",
    )
    .run(id, seq, author, T + seq);
const cols = (db: Db, id: string) =>
  db.prepare('SELECT feedback, feedback_chips, feedback_note FROM messages WHERE id = ?').get(id) as Record<string, unknown>;

describe('AT-452 answer feedback is kept on this PC', () => {
  it('AT-452 · 👍 and 👎 with chips and words survive a restart; null clears them; only an answer takes one', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'foo-fb-')), 'data', 'foo.db');
    let db = openDb(file, DIR);
    ensureFooChat(db, T, 'foo', 'c_foo');
    add(db, 'm_user', 1, 'user');
    add(db, 'm_foo', 2, 'foo');
    add(db, 'm_sys', 3, 'system');
    expect(feedbackMessage(db, 'm_foo', 'good').ok).toBe(true);
    db.close();
    db = openDb(file, DIR);
    expect(messageGet(db, 'm_foo')?.feedback).toBe('good');

    const key = 'sk-ant-api03-' + 'a'.repeat(80);
    expect(feedbackMessage(db, 'm_foo', 'bad', ['wrong', 'too_long', 'wrong'], `  it pasted ${key} `).ok).toBe(true);
    const bad = cols(db, 'm_foo');
    expect(bad.feedback).toBe('bad');
    expect(JSON.parse(String(bad.feedback_chips))).toEqual(['wrong', 'too_long']);
    expect(String(bad.feedback_note)).toContain('it pasted');
    expect(String(bad.feedback_note)).not.toContain(key);

    expect(feedbackMessage(db, 'm_foo', 'good', ['wrong'], 'ignored').ok).toBe(true);
    expect(cols(db, 'm_foo')).toEqual({ feedback: 'good', feedback_chips: null, feedback_note: null });
    expect(feedbackMessage(db, 'm_foo', null).ok).toBe(true);
    expect(cols(db, 'm_foo')).toEqual({ feedback: null, feedback_chips: null, feedback_note: null });

    expect(feedbackMessage(db, 'm_user', 'good')).toEqual({ ok: false, reason: 'not_allowed' });
    expect(feedbackMessage(db, 'm_sys', 'bad')).toEqual({ ok: false, reason: 'not_allowed' });
    expect(feedbackMessage(db, 'm_nope', 'good')).toEqual({ ok: false, reason: 'not_found' });
    db.prepare("UPDATE chats SET private = 1 WHERE id = 'c_foo'").run();
    expect(feedbackMessage(db, 'm_foo', 'good')).toEqual({ ok: false, reason: 'not_allowed' });
    db.close();
  });
});
