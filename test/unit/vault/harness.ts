// M5 T2 test harness: an in-memory foo.db with one foo chat, the in-memory keyring and safeStorage (08-3 §22.2), main's
// registry with the engine mirror recorded, and the secret IPC handlers. Values in these tests are fake (public repo).
import Database from 'better-sqlite3';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock } from '../../../src/shared/clock';
import { normalisedForms, SecretRegistry } from '../../../src/shared/redactor';
import { migrate, type Db } from '../../../src/main/store/db';
import { memoryKeyring, memorySafeStore } from '../../../src/main/vault/keyring';
import { registryMirror } from '../../../src/main/vault/registryMirror';
import { secretHandlers } from '../../../src/main/vault/secretIpc';
import { SecretVault, type VaultDeps } from '../../../src/main/vault/SecretVault';
import type { CardRow } from '../../../src/shared/types';

export const NOW = Date.UTC(2026, 9, 16, 3, 30);
/** A fake OpenAI-style key (never a real one). */
export const FAKE_KEY = 'sk-proj-T2fakeFAKEfake0123456789abcdefABCDEF';

export function vaultHarness(o: { findOpenApproval?: VaultDeps['findOpenApproval']; live?: boolean } = {}) {
  const db: Db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db, 'src/main/store/migrations');
  db.prepare("INSERT INTO chats (id, kind, title, last_activity_at, created_at) VALUES ('c_1', 'foo', 'foo', ?, ?)").run(NOW, NOW);
  const clock = new FakeClock(NOW);
  const keyring = memoryKeyring();
  const safe = memorySafeStore();
  const registry = new SecretRegistry(clock);
  const sent: { kind: string; payload: Record<string, unknown> }[] = [];
  let live = o.live ?? true;
  const send = (kind: string, payload: unknown) => {
    if (!live) return false;
    sent.push({ kind, payload: payload as Record<string, unknown> });
    return true;
  };
  const mirror = registryMirror({ registry, send, normalisedForms, clock });
  const register = (value: string, opts: { kind: string; ttlMs?: number | null }) => mirror.register(value, opts);
  const blobDir = join(mkdtempSync(join(tmpdir(), 'foo-t2-')), 'vault');
  const vault = new SecretVault({
    db,
    keyring,
    safe,
    blobDir,
    clock,
    register,
    findOpenApproval: o.findOpenApproval ?? (() => null),
  });
  const cards: CardRow[] = [];
  const h = secretHandlers({
    db,
    vault,
    register,
    engine: {
      get live() {
        return live;
      },
      send: send as never,
    },
    now: () => clock.now(),
    emitCard: (c) => cards.push(c),
    emitMessage: () => undefined,
    emitChat: () => undefined,
  });
  return {
    db,
    clock,
    keyring,
    safe,
    registry,
    mirror,
    sent,
    vault,
    blobDir,
    cards,
    h,
    setLive: (v: boolean) => (live = v),
  };
}
