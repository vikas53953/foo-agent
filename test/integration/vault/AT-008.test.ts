// AT-008 (10-acceptance-1 §B, J2; Art. 8): a key saved through the Secret box appears in no row of foo.db, no log and no AI
// request body. The key goes through the real handlers into a file-backed foo.db (WAL included) and the in-memory keyring
// (08-3 §22.2); then the engine uses it for an AI call (08-2 §11.3), which mirrors it into the engine's registry first, so a
// prompt that quotes it reaches the AI as [hidden]. The screenshot half is the Secret box e2e (the field is a password box).
import Database from 'better-sqlite3';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Redactor } from '../../../src/engine/redact/Redactor';
import { migrate } from '../../../src/main/store/db';
import { memoryKeyring, memorySafeStore } from '../../../src/main/vault/keyring';
import { registryMirror } from '../../../src/main/vault/registryMirror';
import { secretHandlers } from '../../../src/main/vault/secretIpc';
import { SecretVault } from '../../../src/main/vault/SecretVault';
import { FakeClock } from '../../../src/shared/clock';
import { normalisedForms, SecretRegistry } from '../../../src/shared/redactor';
import type { CardRow } from '../../../src/shared/types';
import { FAKE_KEY, NOW } from '../../unit/vault/harness';

const filesUnder = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? filesUnder(join(dir, e.name)) : [join(dir, e.name)]));

describe('AT-008', () => {
  it('AT-008 a key saved through the Secret box is in no foo.db row, no log and no AI request body', async () => {
    const data = mkdtempSync(join(tmpdir(), 'foo-at008-'));
    const db = new Database(join(data, 'foo.db'));
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    migrate(db, 'src/main/store/migrations');
    db.prepare("INSERT INTO chats (id, kind, title, last_activity_at, created_at) VALUES ('c_1', 'foo', 'foo', ?, ?)").run(NOW, NOW);
    const clock = new FakeClock(NOW);
    const logs: string[] = [];
    const engine = new Redactor({ clock, log: (kind) => logs.push(kind) });
    const mirror = registryMirror({
      registry: new SecretRegistry(clock),
      // The port to the engine: what main posts arrives as `registry:add` (Engine.handle keeps it in its Redactor).
      send: (kind, payload) => {
        logs.push(kind);
        if (kind === 'registry:add') {
          const p = payload as { handle: string; value: string; normalised: string[]; ttlMs: number };
          engine.registry.add({ handle: p.handle, value: p.value, normalised: p.normalised, ttlMs: p.ttlMs || null });
        }
        return true;
      },
      normalisedForms,
      clock,
    });
    const register = (value: string, opts: { kind: string; ttlMs?: number | null }) => mirror.register(value, opts);
    const vault = new SecretVault({
      db,
      keyring: memoryKeyring(),
      safe: memorySafeStore(),
      blobDir: join(data, 'vault'),
      clock,
      register,
      findOpenApproval: () => null,
    });
    const cards: CardRow[] = [];
    const h = secretHandlers({
      db,
      vault,
      register,
      engine: { live: true, send: () => true },
      now: () => clock.now(),
      dataDir: data,
      emitCard: (c) => cards.push(c),
      emitMessage: () => undefined,
      emitChat: () => undefined,
    });

    const box = await h['secret:offer']({ chatId: 'c_1', slot: 'openai' });
    if (!box.ok) throw new Error(box.error.kind);
    const saved = await h['secret:save']({ requestId: box.value.id, kind: 'ai_key', name: 'openai-key', fields: { value: FAKE_KEY } });
    expect(saved.ok).toBe(true);
    const used = vault.use({ purpose: 'ai_call', name: 'openai-key' });
    expect(used.ok && used.value).toBe(FAKE_KEY);

    // An AI request body that quotes the key (a page, a tool result) is scrubbed by the engine's registry.
    const body = engine.redact(`The user's settings page shows ${FAKE_KEY} next to "API key".`);
    expect(body.text).not.toContain(FAKE_KEY);

    db.pragma('wal_checkpoint(PASSIVE)');
    const files = filesUnder(data).filter((f) => !f.includes(`${join('vault', '')}`));
    expect(files.some((f) => f.endsWith('foo.db'))).toBe(true);
    expect(existsSync(join(data, 'activity.jsonl'))).toBe(true);
    for (const f of files) expect(readFileSync(f).includes(FAKE_KEY), f).toBe(false);
    for (const row of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]) {
      expect(JSON.stringify(db.prepare(`SELECT * FROM "${row.name}"`).all()), row.name).not.toContain(FAKE_KEY);
    }
    expect(logs.join('\n')).not.toContain(FAKE_KEY);
    expect(JSON.stringify(cards)).not.toContain(FAKE_KEY);
    db.close();
  });
});
