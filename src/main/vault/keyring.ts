// Spec: 08-2 §11.2 (Credential Manager through `@napi-rs/keyring` `Entry.withTarget(target, 'foo', name)`, Generic
// credentials, per-user DPAPI; write-only: a value is never read back to the renderer), 09 §9.18 (Credential Manager for
// values ≤ 2,560 bytes, Electron safeStorage blobs for larger ones; `isEncryptionAvailable()` false → refuse to save, never a
// plaintext fallback), 08-3 §22.2 (FOO_TEST runs inject an in-memory Vault with the same API and purpose checks). The two
// stores behind SecretVault; the real ones exist only on Windows, every other run uses the in-memory pair.
import { createRequire } from 'node:module';

/** Windows CRED_MAX_CREDENTIAL_BLOB_SIZE (5 × 512 bytes, 09 §9.18). Measured as UTF-16, how Windows stores a password. */
export const CREDMAN_MAX_BYTES = 2_560;

export const fitsCredman = (value: string): boolean => Buffer.byteLength(value, 'utf16le') <= CREDMAN_MAX_BYTES;

/** Credential Manager (or its in-memory fake). `target` is always `foo/{kind}/{name}` (08-0 §E.8). */
export interface Keyring {
  set(target: string, value: string): void;
  get(target: string): string | null;
  /** True when an entry was there to delete. */
  delete(target: string): boolean;
}

/** Electron safeStorage (DPAPI) as the vault uses it (09 §9.18). */
export interface SafeStore {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(blob: Buffer): string;
}

/** The in-memory keyring FOO_TEST runs and unit tests use (08-3 §22.2). `failNext` makes the next write throw. */
export function memoryKeyring(): Keyring & { readonly entries: Map<string, string>; failNext: boolean } {
  const entries = new Map<string, string>();
  const k = {
    entries,
    failNext: false,
    set(target: string, value: string) {
      if (k.failNext) {
        k.failNext = false;
        throw new Error('keyring write failed');
      }
      entries.set(target, value);
    },
    get: (target: string) => entries.get(target) ?? null,
    delete: (target: string) => entries.delete(target),
  };
  return k;
}

/** The in-memory safeStorage: a reversible byte flip so a test can see the blob is not the plain value. */
export function memorySafeStore(available = true): SafeStore & { available: boolean } {
  const flip = (b: Buffer) => Buffer.from(b.map((x) => x ^ 0x5a));
  const s = {
    available,
    isEncryptionAvailable: () => s.available,
    encryptString: (value: string) => flip(Buffer.from(value, 'utf8')),
    decryptString: (blob: Buffer) => flip(blob).toString('utf8'),
  };
  return s;
}

interface NapiEntry {
  setPassword(value: string): void;
  getPassword(): string | null | undefined;
  deletePassword(): boolean;
}
interface NapiKeyring {
  Entry: { withTarget(target: string, service: string, user: string): NapiEntry };
}

/**
 * The real Credential Manager through `@napi-rs/keyring` (08-2 §11.2). Null when the module is not installed or cannot load
 * (then SecretVault refuses to save: 05-2 §5.8.3 Disabled). Only Windows production runs call this.
 */
export function napiKeyring(): Keyring | null {
  let mod: NapiKeyring;
  try {
    mod = createRequire(__filename)('@napi-rs/keyring') as NapiKeyring;
  } catch {
    return null;
  }
  const entry = (target: string) => mod.Entry.withTarget(target, 'foo', target.slice(target.lastIndexOf('/') + 1));
  return {
    set: (target, value) => entry(target).setPassword(value),
    get: (target) => {
      try {
        return entry(target).getPassword() ?? null;
      } catch {
        return null;
      }
    },
    delete: (target) => {
      try {
        return entry(target).deletePassword();
      } catch {
        return false;
      }
    },
  };
}
