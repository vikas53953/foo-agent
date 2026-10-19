// Spec: 08-2 §11.2 (vault row `foo/conn_token/google`, JSON `{refresh_token, scope, issued_at}`), 08-0 §E.8, X-73;
// CR-0012 (M8 T1 seam `ConnTokenStore`). Until M5's SecretVault lands, the Google refresh token is held in memory only and is
// never written to disk; a restart forgets it (the rows then show "Your Gmail connection expired.", 06-2 §6.8). Needs M5:
// T6 swaps in the vault behind the same interface.
import type { ConnTokenStore } from '../../engine/tools/connectors/types';

type Stored = { refresh_token: string; scope: string; issued_at: number };

export class MemoryConnTokenStore implements ConnTokenStore {
  private items = new Map<string, Stored>();

  async read(name: 'foo/conn_token/google'): Promise<Stored | null> {
    return this.items.get(name) ?? null;
  }

  async write(name: 'foo/conn_token/google', value: Stored): Promise<void> {
    this.items.set(name, { ...value });
  }

  async delete(name: 'foo/conn_token/google'): Promise<void> {
    this.items.delete(name);
  }
}
