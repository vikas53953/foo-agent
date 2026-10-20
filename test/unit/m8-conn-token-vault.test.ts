// Spec: 08-2 §11.2 (vault row `foo/conn_token/google`, JSON {refresh_token, scope, issued_at}), §11.3 (`connector_refresh`
// reads only a conn_token, and the value is registered for redaction before use), 09 §9.18 (no plaintext fallback: an
// unavailable store refuses), 08-3 §16.1 Tokens (one refresh token for the Google account; deleted with the last row).
// M8 T6: T2's `ConnTokenStore` seam over M5's SecretVault (CR-0012 pick 14, the "needs M5" swap). Fake values only.
import { describe, expect, it } from 'vitest';
import { VaultConnTokenStore } from '../../src/main/vault/connTokenVault';
import type { ConnTokenStore } from '../../src/engine/tools/connectors/types';
import { vaultHarness, NOW } from './vault/harness';

const NAME = 'foo/conn_token/google' as const;
const TOKEN = {
  refresh_token: '1//fake-refresh-T6-0123456789',
  scope: 'openid email https://www.googleapis.com/auth/gmail.compose',
  issued_at: 1,
};

describe('M8 T6 · the Google refresh token lives in the vault', () => {
  it('write → read gives the token back, from Credential Manager, named foo/conn_token/google', async () => {
    const h = vaultHarness();
    const store: ConnTokenStore = new VaultConnTokenStore(
      () => h.vault,
      (v) => h.mirror.register(v, { kind: 'conn_token' }),
    );
    expect(await store.read(NAME)).toBeNull();
    await store.write(NAME, TOKEN);
    expect(await store.read(NAME)).toEqual({ refresh_token: TOKEN.refresh_token, scope: TOKEN.scope, issued_at: NOW });
    expect(h.keyring.entries.has(NAME)).toBe(true);
    // foo.db holds the name only, never the value.
    const row = h.db.prepare('SELECT * FROM secrets_index WHERE target = ?').get(NAME) as Record<string, unknown>;
    expect(row).toMatchObject({ kind: 'conn_token', name: 'google' });
    expect(JSON.stringify(row)).not.toContain(TOKEN.refresh_token);
    // Read registers the value, so logs and the engine mask it (08-2 §11.3).
    expect(h.registry.forms().some((f) => f.form === TOKEN.refresh_token)).toBe(true);
  });

  it('a second sign-in replaces it; delete removes it and its index row', async () => {
    const h = vaultHarness();
    const store: ConnTokenStore = new VaultConnTokenStore(() => h.vault);
    await store.write(NAME, TOKEN);
    await store.write(NAME, { ...TOKEN, refresh_token: '1//fake-refresh-T6-second' });
    expect((await store.read(NAME))?.refresh_token).toBe('1//fake-refresh-T6-second');
    await store.delete(NAME);
    expect(await store.read(NAME)).toBeNull();
    expect(h.db.prepare('SELECT COUNT(*) FROM secrets_index').pluck().get()).toBe(0);
  });

  it('with no safe store the write is refused (no plaintext fallback), and nothing is kept', async () => {
    const h = vaultHarness({ noKeyring: true });
    const store: ConnTokenStore = new VaultConnTokenStore(() => h.vault);
    await expect(store.write(NAME, TOKEN)).rejects.toMatchObject({ kind: 'VAULT_WRITE_FAILED' });
    expect(await store.read(NAME)).toBeNull();
  });

  it('before the vault exists, read is empty and write is refused', async () => {
    const store: ConnTokenStore = new VaultConnTokenStore(() => null);
    expect(await store.read(NAME)).toBeNull();
    await expect(store.write(NAME, TOKEN)).rejects.toMatchObject({ kind: 'VAULT_WRITE_FAILED' });
    await expect(store.delete(NAME)).resolves.toBeUndefined();
  });
});
