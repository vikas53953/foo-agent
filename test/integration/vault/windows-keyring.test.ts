// Spec: 08-2 §11.2 (Credential Manager through `@napi-rs/keyring`, `new Entry('foo', target)` per CR-0025 pick 10), §11.3 (`vault.use`
// purpose `ai_call` reads `foo/ai_key/{providerId}`), CR-0025 (on Vikas's PC a saved Anthropic key was marked "didn't work"
// 0.04 s after saving, before any network call: the read-back is proven here against the real Windows store).
// Windows only: other platforms have no Credential Manager. The values are fake (public repo).
import Database from 'better-sqlite3';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrate, type Db } from '../../../src/main/store/db';
import { memorySafeStore, napiKeyring } from '../../../src/main/vault/keyring';
import { SecretVault } from '../../../src/main/vault/SecretVault';
import { FakeClock } from '../../../src/shared/clock';

const FAKE = 'fake-key-cr0025-not-a-real-key';

// CI runners only: on a developer's PC the second test would touch the real `foo/ai_key/anthropic-key` entry.
describe.skipIf(process.platform !== 'win32' || !process.env.CI)('CR-0025: Credential Manager round trip (Windows)', () => {
  it('napiKeyring: set, get and delete one dummy target', () => {
    const k = napiKeyring();
    expect(k).not.toBeNull();
    const target = 'foo/ai_key/cr0025-test';
    k!.set(target, 'dummy-value');
    expect(k!.get(target)).toBe('dummy-value');
    expect(k!.delete(target)).toBe(true);
    expect(k!.get(target)).toBeNull();
  });

  it('delete also removes an entry an earlier build saved through Entry.withTarget', async () => {
    const { createRequire } = await import('node:module');
    const m = createRequire(__filename)('@napi-rs/keyring') as {
      Entry: { withTarget(t: string, s: string, u: string): { setPassword(v: string): void } };
    };
    const target = 'foo/ai_key/cr0025-legacy';
    m.Entry.withTarget(target, 'foo', 'cr0025-legacy').setPassword('dummy-value');
    // Only the first delete is checked: on Windows a `withTarget` delete reports true even when nothing is left.
    expect(napiKeyring()!.delete(target)).toBe(true);
  });

  it('a key saved through the Secret box path is read back by vault.use(ai_call)', () => {
    const db: Db = new Database(':memory:');
    migrate(db, 'src/main/store/migrations');
    const vault = new SecretVault({
      db,
      keyring: napiKeyring(),
      safe: memorySafeStore(),
      blobDir: join(mkdtempSync(join(tmpdir(), 'foo-cr24-')), 'vault'),
      clock: new FakeClock(Date.UTC(2026, 9, 21, 6, 0)),
      register: () => 'h',
      findOpenApproval: () => null,
    });
    // Never overwrite a real saved key, even on a runner.
    expect(napiKeyring()!.get('foo/ai_key/anthropic-key')).toBeNull();
    try {
      expect(vault.save('ai_key', 'anthropic-key', { value: FAKE }).ok).toBe(true);
      const r = vault.use({ purpose: 'ai_call', name: 'anthropic-key' });
      expect(r).toEqual({ ok: true, value: FAKE });
    } finally {
      vault.delete('foo/ai_key/anthropic-key');
    }
  });
});
