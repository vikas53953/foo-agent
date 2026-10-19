// 08-3 §12.9 style stats (M6 T7): the engine's numbers over the last 20 user text messages, written at every 20th user
// message in foo's chat as `guessed` lines in preferences/style.md with the reason "from your last 20 messages", replacing
// the previous ones; never in other chats, never while memory is off (G-M6-06). Seam: `computeStyle`, `StyleStatsRunner`.
import { describe, expect, it } from 'vitest';
import { StyleStatsRunner, computeStyle, styleLines } from '../../src/engine/memory/styleStats';
import type { MainLink, NamedQuery } from '../../src/engine/protocol';
import { runNamedQuery } from '../../src/main/engine-supervisor/engineHost';
import type { Result } from '../../src/shared/errors';
import type { Settings } from '../../src/shared/settings';
import { settingsDefaults } from '../../src/shared/settingsDefaults';
import { storeHarness } from '../integration/m6-store-harness';

const twenty = (f: (i: number) => string) => Array.from({ length: 20 }, (_, i) => f(i));

describe('08-3 §12.9 computeStyle', () => {
  it('lower casing at ≥ 80 % without a capital, average length, emoji per message to one decimal, greeting and sign-off at ≥ 5 of 20', () => {
    const texts = twenty((i) => (i < 6 ? 'hey can you book it thanks 🙏' : i < 17 ? 'ok sounds good' : 'Fine.'));
    // 6 × 28 + 11 × 14 + 3 × 5 = 337 code points / 20 = 16.85 → 17; emoji 6 / 20 = 0.3.
    expect(computeStyle(texts)).toEqual({ avgChars: 17, casing: 'lower', emojiRate: 0.3, greeting: 'ok', signoff: 'good' });
  });

  it('sentence casing at ≥ 80 % starting with a capital; mixed otherwise; no greeting under 5 of 20', () => {
    expect(computeStyle(twenty((i) => (i < 16 ? `Please check ${i}` : 'what now'))).casing).toBe('sentence');
    expect(computeStyle(twenty((i) => (i < 10 ? 'Please check' : 'what now'))).casing).toBe('mixed');
    expect(computeStyle(twenty((i) => `word${i} middle end${i}`))).toMatchObject({ greeting: null, signoff: null });
  });

  it('lines: length, casing, emoji, then one greeting / sign-off line only when one qualifies', () => {
    expect(styleLines({ avgChars: 17, casing: 'lower', emojiRate: 0.3, greeting: 'ok', signoff: 'good' })).toEqual([
      'Writes about 17 characters per message',
      'Writes in small letters',
      'Uses about 0.3 emoji per message',
      'Often starts with “ok” and ends with “good”',
    ]);
    expect(styleLines({ avgChars: 5, casing: 'mixed', emojiRate: 0, greeting: null, signoff: null })).toHaveLength(3);
  });
});

function runner(o: { rememberOn?: boolean } = {}) {
  const h = storeHarness();
  const now = h.clock.now();
  h.db.prepare("INSERT INTO chats (id, kind, title, last_activity_at, created_at) VALUES ('c_foo', 'foo', 'foo', ?, ?)").run(now, now);
  h.db.prepare("INSERT INTO chats (id, kind, title, last_activity_at, created_at) VALUES ('c_g', 'group', 'Goa', ?, ?)").run(now, now);
  let seq = 1;
  const say = (chatId: string, text: string) =>
    h.db
      .prepare(
        "INSERT INTO messages (id, chat_id, seq, author_kind, kind, text, status, created_at) VALUES (?, ?, ?, 'user', 'text', ?, 'sent', ?)",
      )
      .run(`m_${seq}`, chatId, seq++, text, now + seq);
  const settings: Settings = { ...settingsDefaults, privacy: { ...settingsDefaults.privacy, rememberOn: o.rememberOn ?? true } };
  const link: MainLink = {
    request<T>(_kind: string, payload: unknown): Promise<Result<T>> {
      const p = payload as { q: NamedQuery; args: unknown[] };
      return Promise.resolve(runNamedQuery(h.db, p.q, p.args, h.clock.now()) as Result<T>);
    },
    send() {},
  };
  const style = new StyleStatsRunner({ link, memory: h.svc, settings: () => settings, log: () => {} });
  return { h, say, style };
}

describe('08-3 §12.9 StyleStatsRunner', () => {
  it('writes at the 20th user message in foo’s chat, not the 19th; guessed, reason “from your last 20 messages”', async () => {
    const { h, say, style } = runner();
    for (let i = 0; i < 19; i++) say('c_foo', 'ok sounds good');
    expect(await style.onUserMessage('c_foo')).toEqual({ ok: true, value: { written: 0 } });
    say('c_foo', 'ok sounds good');
    expect(await style.onUserMessage('c_foo')).toEqual({ ok: true, value: { written: 4 } });
    const rows = h.rows();
    expect(rows.map((r) => r.file)).toEqual(Array(4).fill('memory/preferences/style.md'));
    expect(rows.every((r) => r.provenance === 'guessed' && r.reason === 'from your last 20 messages')).toBe(true);
    expect(h.read('memory/preferences/style.md')).toContain(
      '- Writes about 14 characters per message  {I guessed · 2026-10-16 · chat · from your last 20 messages · ',
    );
  });

  it('the 40th message replaces the previous lines (supersede, not append); a line the user said stays', async () => {
    const { h, say, style } = runner();
    await h.svc.learn({
      text: 'Likes short replies',
      provenance: 'said',
      originKind: 'manual',
      origin: 'manual',
      category: 'style',
      kind: 'preference',
      scope: 'global',
      private: false,
    });
    for (let i = 0; i < 20; i++) say('c_foo', 'ok sounds good');
    await style.onUserMessage('c_foo');
    for (let i = 0; i < 20; i++) say('c_foo', 'Hello there, please book');
    await style.onUserMessage('c_foo');
    const texts = h.rows().map((r) => r.text);
    expect(texts).toHaveLength(5);
    expect(texts).toContain('Likes short replies');
    expect(texts).toContain('Starts messages with a capital letter');
    expect(texts).not.toContain('Writes in small letters');
  });

  it('never in a group or any other chat, and never while memory is off', async () => {
    const a = runner();
    for (let i = 0; i < 20; i++) a.say('c_g', 'ok sounds good');
    expect(await a.style.onUserMessage('c_g')).toEqual({ ok: true, value: { written: 0 } });
    const b = runner({ rememberOn: false });
    for (let i = 0; i < 20; i++) b.say('c_foo', 'ok sounds good');
    expect(await b.style.onUserMessage('c_foo')).toEqual({ ok: true, value: { written: 0 } });
    expect(b.h.rows()).toEqual([]);
  });

  it('the style lines reach foo’s chat prompts but never a group’s (§12.1 “never in groups”)', async () => {
    const { h, say, style } = runner();
    for (let i = 0; i < 20; i++) say('c_foo', 'ok sounds good');
    await style.onUserMessage('c_foo');
    const inChat = (chatId: string) => {
      const r = runNamedQuery(h.db, 'memoryByScope', [chatId], h.clock.now()) as Result<{ file: string }[]>;
      return r.ok ? r.value : [];
    };
    expect(inChat('c_foo').filter((f) => f.file === 'memory/preferences/style.md')).toHaveLength(4);
    expect(inChat('c_g').filter((f) => f.file === 'memory/preferences/style.md')).toEqual([]);
  });
});
