// Spec: 08-2 §11.2 (vault row `foo/conn_token/google`, JSON {refresh_token, scope, issued_at}), §11.3 (`connector_refresh`
// reads only a conn_token; the value is registered for redaction before it is used), §11.7 (VAULT_WRITE_FAILED), 09 §9.18
// (encryption unavailable → refuse, never plaintext), 08-0 §E.8 (X-73). CR-0012 pick 14: M8 T6 swaps T2's in-memory
// ConnTokenStore (connTokenMemory.ts) for M5's SecretVault behind the same seam, so the Google sign-in survives a restart.
import type { ConnTokenStore } from '../../engine/tools/connectors/types';
import { vaultTarget, type SecretVault } from './SecretVault';

type Name = 'foo/conn_token/google';
type Stored = { refresh_token: string; scope: string; issued_at: number };

const refused = (kind: string) => Object.assign(new Error(kind), { kind });

export class VaultConnTokenStore implements ConnTokenStore {
  /**
   * The vault is read when used: main builds it once at startup, after this store may have been made. `register` adds the
   * bare refresh token to the SecretRegistry too (the vault registers the stored JSON as a whole), so it is masked alone.
   */
  constructor(
    private readonly vault: () => SecretVault | null,
    private readonly register?: (value: string) => void,
  ) {}

  async read(): Promise<Stored | null> {
    const r = this.vault()?.use({ purpose: 'connector_refresh', name: 'google' });
    if (!r?.ok) return null;
    try {
      const v = JSON.parse(r.value) as Partial<Stored>;
      if (typeof v.refresh_token !== 'string') return null;
      this.register?.(v.refresh_token);
      return { refresh_token: v.refresh_token, scope: String(v.scope ?? ''), issued_at: Number(v.issued_at ?? 0) };
    } catch {
      return null;
    }
  }

  async write(_name: Name, value: Stored): Promise<void> {
    const vault = this.vault();
    if (!vault) throw refused('VAULT_WRITE_FAILED');
    // The vault stamps `issued_at` with its own clock when it saves.
    const r = vault.save('conn_token', 'google', { refresh_token: value.refresh_token, scope: value.scope });
    if (!r.ok) throw refused(r.error.kind);
  }

  async delete(): Promise<void> {
    this.vault()?.delete(vaultTarget('conn_token', 'google'));
  }
}
