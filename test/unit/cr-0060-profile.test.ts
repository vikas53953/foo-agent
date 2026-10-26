// Spec: CR-0060 (X-217): foo's profile writes (06-1 §4.2: name ≤ 20 as setup, face with its colour, vibe as Card 2c), a
// glyph face's colour (06-1 §2.3 Card 2b), Clear messages (06-4 C-1) and the answer an edit rewrites (04 §6.2).
import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { t } from '../../src/shared/copy/t';
import { settingsDefaults } from '../../src/shared/settingsDefaults';
import type { Settings } from '../../src/shared/settings';
import { ensureSetupCard, faceColour } from '../../src/main/setup/firstRun';
import { setFooFace, setFooName, setFooVibe } from '../../src/main/setup/fooProfile';
import { migrate, type Db } from '../../src/main/store/db';
import { answerAfter, clearChat, ensureFooChat, messageList } from '../../src/main/store/queries';

let db: Db;
let s: Settings;
const port = { get: () => s, update: (f: (x: Settings) => Settings) => void (s = f(s)) };
const T = Date.UTC(2026, 9, 26, 8, 0);
const chat = () => db.prepare("SELECT title, avatar_ref, color_token, rev FROM chats WHERE id = 'c_foo'").get() as Record<string, unknown>;
const add = (id: string, seq: number, author: string, kind = 'text', status = 'complete') =>
  db
    .prepare('INSERT INTO messages (id, chat_id, seq, author_kind, kind, text, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, 'c_foo', seq, author, kind, `text ${id}`, status, T + seq);

beforeEach(() => {
  db = new Database(':memory:');
  migrate(db, 'src/main/store/migrations');
  ensureFooChat(db, T, 'foo', 'c_foo');
  s = structuredClone(settingsDefaults);
});

describe('CR-0060 profile writes', () => {
  it('a name change renames foo and its chat; a bad name writes nothing', () => {
    expect(setFooName(db, port, '  Kiwi ').ok).toBe(true);
    expect(s.identity.agentName).toBe('Kiwi');
    expect(chat().title).toBe('Kiwi');
    expect(setFooName(db, port, '!!!')).toEqual({ ok: false, error: 'no_letter' });
    expect(setFooName(db, port, 'x'.repeat(21))).toEqual({ ok: false, error: 'too_long' });
    expect(s.identity.agentName).toBe('Kiwi');
    expect(chat().title).toBe('Kiwi');
  });

  it('a glyph face keeps a known colour; the living face and unknown colours keep none', () => {
    expect(faceColour('glyph:◐︎', '--h-green')).toBe('--h-green');
    expect(faceColour('glyph:◐︎', '--h-nope')).toBeNull();
    expect(faceColour('living:default', '--h-green')).toBeNull();
    expect(setFooFace(db, 'glyph:◐︎', '--h-green')).not.toBeNull();
    expect(chat()).toMatchObject({ avatar_ref: 'glyph:◐︎', color_token: '--h-green' });
    expect(setFooFace(db, 'living:default', '--h-green')).not.toBeNull();
    expect(chat()).toMatchObject({ avatar_ref: 'living:default', color_token: null });
    expect(setFooFace(db, 'glyph:☠', '--h-green')).toBeNull();
    expect(chat().avatar_ref).toBe('living:default');
  });

  it('the vibe takes a setup choice or the user’s own words, and refuses anything else', () => {
    expect(setFooVibe(port, { optionId: 'o2' })).toBe(true);
    expect(s.identity).toMatchObject({ vibe: 'direct', vibeLine: t('setup.vibe.line.direct') });
    expect(setFooVibe(port, { optionId: 'o9' })).toBe(false);
    expect(setFooVibe(port, { words: '   ' })).toBe(false);
    expect(s.identity.vibe).toBe('direct');
    expect(setFooVibe(port, { words: 'like a cricket commentator' })).toBe(true);
    expect(s.identity).toMatchObject({ vibe: 'custom', vibeLine: t('setup.vibe.line.custom', { words: 'like a cricket commentator' }) });
  });
});

describe('CR-0060 chat writes', () => {
  it('Clear messages removes every message of the chat, its unread count, and bumps its rev', () => {
    add('m1', 1, 'user');
    add('m2', 2, 'foo');
    db.prepare("UPDATE chats SET unread_count = 3 WHERE id = 'c_foo'").run();
    const rev = Number(chat().rev);
    expect((clearChat(db, 'c_foo', T + 10) ?? []).map((m) => m.id).sort()).toEqual(['m1', 'm2']);
    expect(messageList(db, 'c_foo', 50).filter((m) => !m.deletedAt)).toEqual([]);
    expect(Number(chat().rev)).toBe(rev + 1);
    expect(db.prepare("SELECT unread_count FROM chats WHERE id = 'c_foo'").pluck().get()).toBe(0);
    expect(clearChat(db, 'c_foo', T + 11)).toEqual([]);
    expect(clearChat(db, 'c_nope', T + 12)).toBeNull();
  });

  it('a private chat is not cleared here (C-23 ends it); setup cards stay while setup runs', () => {
    db.prepare("UPDATE chats SET private = 1 WHERE id = 'c_foo'").run();
    expect(clearChat(db, 'c_foo', T)).toBeNull();
    db.prepare("UPDATE chats SET private = 0 WHERE id = 'c_foo'").run();
    s = { ...s, ai: { ...s.ai, primary: 'claude-cli' }, setup: { complete: false, step: 2 } };
    ensureSetupCard(db, port, T);
    add('m9', 90, 'user');
    const live = () => db.prepare("SELECT COUNT(*) FROM cards WHERE chat_id = 'c_foo' AND deleted_at IS NULL").pluck().get();
    const before = live();
    expect(before).toBeGreaterThan(0);
    expect((clearChat(db, 'c_foo', T + 1, { keepSetup: true }) ?? []).map((m) => m.id)).toEqual(['m9']);
    expect(live()).toBe(before);
  });

  it('an edit rewrites only the complete foo text answer right after it', () => {
    add('u1', 1, 'user');
    add('f1', 2, 'foo');
    add('u2', 3, 'user');
    add('u3', 4, 'user');
    add('f3', 5, 'foo', 'text', 'failed');
    expect(answerAfter(db, 'u1')).toBe('f1');
    expect(answerAfter(db, 'u2')).toBeNull();
    expect(answerAfter(db, 'u3')).toBeNull();
    expect(answerAfter(db, 'nope')).toBeNull();
    db.prepare("UPDATE messages SET deleted_at = ? WHERE id = 'f1'").run(T);
    expect(answerAfter(db, 'u1')).toBeNull();
  });
});
