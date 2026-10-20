// Spec: 08-2 §11.2 (vault row `foo/conn_token/google`, JSON `{refresh_token, scope, issued_at}`), 08-0 §E.8, X-73;
// CR-0012 (M8 T1 seam `ConnTokenStore`). An in-memory store behind the seam, never written to disk. Since M8 T6 the app
// uses the vault (connTokenVault.ts); this one stays as the unit tests' store.
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
