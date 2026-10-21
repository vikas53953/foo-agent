// Spec: CR-0026 (first run option A): 06-1 §2.0 rule 8 (resume at the unfinished card; nothing asked twice), §2.1 ("Let's
// go" → step 1), §2.3 Card 2a (≤ 20 characters, at least one letter or digit; blank keeps "foo"; "{Name} it is."), Card 2b
// (a living or glyph face lands on foo's chat), Card 2c (the vibe line), §2.0 "Skip the rest", then setup complete with the
// hello and its three things to try.
import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { t } from '../../src/shared/copy/t';
import { surpriseName, surpriseTiles, FIRST_TILES } from '../../src/shared/firstRunPools';
import { settingsDefaults } from '../../src/shared/settingsDefaults';
import type { Settings } from '../../src/shared/settings';
import { checkName, ensureSetupCard, faceChosen, nameAnswered, skipRest, vibeAnswered, welcomeStart } from '../../src/main/setup/firstRun';
import { migrate, type Db } from '../../src/main/store/db';
import { ensureFooChat } from '../../src/main/store/queries';
import { cardRow, type DbRow } from '../../src/main/db/rows';
import { answerFromToast, type AnswerDeps } from '../../src/main/cards/answerCard';

let db: Db;
let s: Settings;
const port = { get: () => s, update: (f: (x: Settings) => Settings) => void (s = f(s)) };
const T = Date.UTC(2026, 9, 21, 8, 0);
const cards = () => (db.prepare('SELECT * FROM cards ORDER BY created_at, rowid').all() as DbRow[]).map(cardRow);
const texts = () => db.prepare("SELECT text FROM messages WHERE kind = 'text' ORDER BY created_at, rowid").pluck().all() as string[];
const open = () =>
  cards()
    .filter((c) => c.state === 'shown' || c.state === 'asking')
    .map((c) => (c.payload as { setupCard: string }).setupCard);

beforeEach(() => {
  db = new Database(':memory:');
  migrate(db, 'src/main/store/migrations');
  ensureFooChat(db, T, 'foo', 'c_foo');
  s = structuredClone(settingsDefaults);
});

describe('CR-0026 first run', () => {
  it('names: ≤ 20 characters with a letter or digit; any script', () => {
    expect(checkName('  Sunny ')).toEqual({ ok: true, name: 'Sunny' });
    expect(checkName('सनी')).toEqual({ ok: true, name: 'सनी' });
    expect(checkName('!!!')).toEqual({ ok: false, error: 'no_letter' });
    expect(checkName('x'.repeat(21))).toEqual({ ok: false, error: 'too_long' });
    // Characters as the user sees them: "नमस्ते" is 4, a thumbs-up with a skin tone is 1.
    expect(checkName('नमस्ते'.repeat(5)).ok).toBe(true);
    expect(checkName('a' + '👍🏽'.repeat(19)).ok).toBe(true);
    expect(checkName('a' + '👍🏽'.repeat(20))).toEqual({ ok: false, error: 'too_long' });
  });

  it("an emoji name of 20 characters is stored and titles foo's chat", () => {
    s = { ...s, ai: { ...s.ai, primary: 'claude-cli' }, setup: { complete: false, step: 2 } };
    ensureSetupCard(db, port, T);
    expect(nameAnswered(db, port, 'Sunny ' + '👍🏽'.repeat(14), T + 1).ok).toBe(true);
    expect(s.identity.agentName).toBe('Sunny ' + '👍🏽'.repeat(14));
    expect(db.prepare("SELECT title FROM chats WHERE id = 'c_foo'").pluck().get()).toBe('Sunny ' + '👍🏽'.repeat(14));
  });

  it('the vibe answered from the toast (not a tap) still says the line and completes setup', () => {
    s = { ...s, ai: { ...s.ai, primary: 'claude-cli' }, setup: { complete: false, step: 2 } };
    ensureSetupCard(db, port, T);
    nameAnswered(db, port, 'Kiwi', T + 1);
    faceChosen(db, port, 'living:default', T + 2);
    const vibe = cards().find((c) => (c.payload as { setupCard: string }).setupCard === 'vibe')!;
    const d: AnswerDeps = {
      db,
      now: () => T + 3,
      engine: undefined,
      emitCard: () => undefined,
      emitMessage: () => undefined,
      emitChat: () => undefined,
      onAnswered: (row) => void vibeAnswered(db, port, row, T + 4),
    };
    expect(answerFromToast(d, vibe.id).ok).toBe(true);
    expect(s.setup.complete).toBe(true);
    expect(s.identity.vibe).toBe('calm_funny');
    expect(texts()).toContain(t('setup.vibe.line.calm_funny'));
  });

  it('long "Something else…" words are cut so the vibe line fits', () => {
    s = { ...s, ai: { ...s.ai, primary: 'claude-cli' }, setup: { complete: false, step: 2 } };
    ensureSetupCard(db, port, T);
    nameAnswered(db, port, 'Kiwi', T + 1);
    faceChosen(db, port, 'living:default', T + 2);
    const vibe = cards().find((c) => (c.payload as { setupCard: string }).setupCard === 'vibe')!;
    db.prepare("UPDATE cards SET state = 'answered', answer = ? WHERE id = ?").run(
      JSON.stringify({ text: 'cheeky 🧑🏽‍🚀'.repeat(60) }),
      vibe.id,
    );
    vibeAnswered(
      db,
      port,
      cards().find((c) => c.id === vibe.id)!,
      T + 3,
    );
    expect(s.identity.vibe).toBe('custom');
    expect(s.identity.vibeLine!.length).toBeLessThanOrEqual(200);
    expect(s.setup.complete).toBe(true);
  });

  it('"Skip the rest" from the face card keeps the name and writes the Best fit vibe', () => {
    s = { ...s, ai: { ...s.ai, primary: 'claude-cli' }, setup: { complete: false, step: 2 } };
    ensureSetupCard(db, port, T);
    nameAnswered(db, port, 'Kiwi', T + 1);
    skipRest(db, port, T + 2);
    expect(s.identity.agentName).toBe('Kiwi');
    expect(s.identity.vibe).toBe('calm_funny');
    expect(s.identity.vibeLine).toBe(t('setup.vibe.line.calm_funny'));
    expect(open()).toEqual([]);
  });

  it('an open welcome is answered once the AI was chosen another way (step > 0)', () => {
    ensureSetupCard(db, port, T);
    expect(open()).toEqual(['welcome']);
    s = { ...s, ai: { ...s.ai, primary: 'claude-cli' }, setup: { complete: false, step: 2 } };
    ensureSetupCard(db, port, T + 1);
    expect(open()).toEqual(['name']);
  });

  it('welcome → AI → name → face → vibe → complete, with the bubbles in order', () => {
    ensureSetupCard(db, port, T);
    ensureSetupCard(db, port, T + 1);
    expect(open()).toEqual(['welcome']);
    welcomeStart(db, port, T + 2);
    expect(s.setup.step).toBe(1);
    expect(open()).toEqual(['ai_finder']);
    s = { ...s, ai: { ...s.ai, primary: 'claude-cli' }, setup: { ...s.setup, step: 2 } };
    db.prepare("UPDATE cards SET state = 'answered' WHERE json_extract(payload, '$.setupCard') = 'ai_finder'").run();
    ensureSetupCard(db, port, T + 3);
    expect(open()).toEqual(['name']);
    expect(nameAnswered(db, port, 'Sunny', T + 4).ok).toBe(true);
    expect(s.identity.agentName).toBe('Sunny');
    expect(open()).toEqual(['face']);
    expect(faceChosen(db, port, 'glyph:★︎', T + 5)).not.toBeNull();
    expect(db.prepare("SELECT avatar_ref FROM chats WHERE id = 'c_foo'").pluck().get()).toBe('glyph:★︎');
    expect(open()).toEqual(['vibe']);
    const vibe = cards().find((c) => (c.payload as { setupCard: string }).setupCard === 'vibe')!;
    db.prepare("UPDATE cards SET state = 'answered', answer = ? WHERE id = ?").run(JSON.stringify({ optionId: 'o2' }), vibe.id);
    vibeAnswered(
      db,
      port,
      cards().find((c) => c.id === vibe.id)!,
      T + 6,
    );
    expect(s.setup).toEqual({ complete: true, step: 5 });
    expect(s.identity.vibe).toBe('direct');
    expect(texts()).toEqual([
      t('setup.name.reply', { name: 'Sunny' }),
      t('setup.vibe.line.direct'),
      t('setup.hello.line', { name: 'Sunny' }),
    ]);
    const hello = db
      .prepare("SELECT suggestions FROM messages WHERE kind = 'text' ORDER BY created_at DESC, rowid DESC LIMIT 1")
      .pluck()
      .get() as string;
    expect(JSON.parse(hello)).toEqual([t('setup.hello.try_1'), t('setup.hello.try_2'), t('setup.hello.try_3')]);
    expect(ensureSetupCard(db, port, T + 7)).toBeNull();
  });

  it('a blank name keeps "foo"; a bad name or a face outside the pool is refused', () => {
    s = { ...s, ai: { ...s.ai, primary: 'claude-cli' }, setup: { complete: false, step: 2 } };
    ensureSetupCard(db, port, T);
    expect(nameAnswered(db, port, '!!', T + 1)).toEqual({ ok: false, error: 'no_letter' });
    expect(nameAnswered(db, port, '   ', T + 2).ok).toBe(true);
    expect(s.identity.agentName).toBe('foo');
    expect(faceChosen(db, port, 'file:c_foo', T + 3)).toBeNull();
    expect(open()).toEqual(['face']);
  });

  it('"Skip the rest" skips the open card, keeps the defaults and completes', () => {
    s = { ...s, ai: { ...s.ai, primary: 'claude-cli' }, setup: { complete: false, step: 2 } };
    ensureSetupCard(db, port, T);
    skipRest(db, port, T + 1);
    expect(cards().map((c) => c.state)).toEqual(['skipped']);
    expect(s.setup.complete).toBe(true);
    expect(texts()).toEqual([t('setup.skip_rest.reply'), t('setup.hello.line', { name: 'foo' })]);
  });

  it('a launch resumes at the unfinished card (rule 8)', () => {
    s = { ...s, ai: { ...s.ai, primary: 'claude-cli' }, setup: { complete: false, step: 2 } };
    ensureSetupCard(db, port, T);
    nameAnswered(db, port, 'Kiwi', T + 1);
    ensureSetupCard(db, port, T + 2);
    expect(open()).toEqual(['face']);
  });

  it('surprise: no name twice in a session; three new glyph tiles, none repeating a pair on screen', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const n = surpriseName(seen);
      expect(seen.has(n)).toBe(false);
      seen.add(n);
    }
    const next = surpriseTiles(FIRST_TILES);
    const key = (x: (typeof FIRST_TILES)[number]) => `${x.glyph.id}|${x.colour.id}`;
    expect(next).toHaveLength(3);
    expect(next.some((x) => FIRST_TILES.map(key).includes(key(x)))).toBe(false);
    expect(new Set(next.map((x) => x.glyph.id)).size).toBe(3);
  });
});
