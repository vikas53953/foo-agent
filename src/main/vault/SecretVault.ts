// Spec: 08-2 §11.1–§11.3 (what a secret is; storage table: `foo/ai_key/{providerId}` UTF-8, `foo/login/{host}` JSON {u,p},
// `foo/card/{last4}` JSON {number, expMonth, expYear, name}, `foo/conn_token/{google|outlook}` JSON {refresh_token, scope,
// issued_at}, `foo/web_key/{provider}` UTF-8, `foo/hub_key/composio` JSON {key, userId, issued_at}, the WhatsApp session as a
// safeStorage blob; `vault.use` purpose checks: `fill_card` needs an APPROVED/RUNNING `pay` approval of the job, `fill_login`
// a running job on the login's domain; the value goes only to the engine, registered in the SecretRegistry first), §11.7
// (`vault.save` → VAULT_WRITE_FAILED; `vault.use` → VAULT_PURPOSE_DENIED, VAULT_MISSING; `vault.delete` / `wipeAll` →
// `{ failed }`), 08-0 §E.8 (vault names, X-73; one `openai-key` entry for voice and the provider, X-114; two cards with the
// same last 4 → SECRET_EXISTS, X-129), §B.3 `secrets_index` (never a value), 08-1 §3.2 `secret:save` (every other kind
// replaces and logs `secret_replaced`), 09 §9.18 (≤ 2,560 bytes Credential Manager, larger safeStorage blobs in
// `{DATA}\vault\{name}.bin`; encryption unavailable → refuse), CR-0009 G-M5-16 (name rule per kind). CR-0057 (X-214): a key the
// user names is `foo/user_key/{userKeyName(name)}` UTF-8, labelled with the name as typed, Credential Manager only, and no
// purpose reads it.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Clock } from '../../shared/clock';
import { fail, ok, type Result } from '../../shared/errors';
import { isKeyProviderId } from '../../shared/settings';
import type { VaultOff } from '../../shared/ipc';
import { safeName } from '../../shared/safeName';
import type { SecretIndexRow, SecretKind, VaultUseRequest } from '../../shared/types';
import type { RegisterOptions } from '../secrets/registerValue';
import type { Db } from '../store/db';
import { fitsCredman, type Keyring, type SafeStore } from './keyring';
import { secretLabel } from './labels';

/** G-M5-16: the `{name}` part each kind accepts; anything else is VALIDATION. */
const NAME_RULES: Record<SecretKind, (name: string) => boolean> = {
  ai_key: isKeyProviderId,
  web_key: (n) => ['exa', 'tavily', 'firecrawl', 'browseruse'].includes(n),
  conn_token: (n) => n === 'google' || n === 'outlook',
  hub_key: (n) => n === 'composio',
  login: (n) => n.length <= 253 && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(n),
  card: (n) => /^\d{4}$/.test(n),
  wa_session: (n) => n === 'whatsapp',
  user_key: (n) => n.length >= 1 && n.length <= 40 && /^[a-z0-9]/.test(n),
};

/** CR-0057: the name a user typed, as people read it ("GitHub key"): trimmed, inner spaces collapsed. */
export const userKeyLabel = (name: string): string => name.trim().replace(/\s+/g, ' ');

/** CR-0057 (08-0 §E.8: no space in a vault name): "GitHub key" → `github-key`, via safeName (08-1 §0.7.1). */
export const userKeyName = (name: string): string =>
  // safeName turns an empty name into `file`; an empty or over-long name has no vault name.
  !userKeyLabel(name) || userKeyLabel(name).length > 40
    ? ''
    : safeName(userKeyLabel(name)).toLowerCase().replace(/[ .]+/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '');

/** 08-2 §11.3: which secret kind each purpose may read. */
/** CR-0057: no purpose reads a `user_key` (the AI never uses a key the user named, until a CR says how). */
const PURPOSE_KIND: Record<VaultUseRequest['purpose'], Exclude<SecretKind, 'user_key'>> = {
  fill_login: 'login',
  fill_card: 'card',
  ai_call: 'ai_key',
  voice_call: 'ai_key',
  connector_refresh: 'conn_token',
  wa_session: 'wa_session',
  web_tool: 'web_key',
  hub_call: 'hub_key',
};

export const vaultTarget = (kind: SecretKind, name: string): string =>
  kind === 'wa_session' ? 'vault\\wa-session.bin' : `foo/${kind}/${name}`;

export const validSecretName = (kind: SecretKind, name: string): boolean => NAME_RULES[kind](name);

/** Card brand from the number's first digits (05 §0.4 "Visa ••4242"). */
export function cardBrand(number: string): string | null {
  if (/^4/.test(number)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(number)) return 'Mastercard';
  if (/^3[47]/.test(number)) return 'Amex';
  if (/^(60|65|81|82|508)/.test(number)) return 'RuPay';
  return null;
}

/** The stored value for one save, built from the Secret box fields (08-2 §11.2 formats), or null when a field is missing. */
function encode(
  kind: SecretKind,
  f: Record<string, string>,
  now: number,
): { value: string; card?: { last4: string; brand: string | null } } | null {
  const has = (...keys: string[]) => keys.every((k) => (f[k] ?? '').trim() !== '');
  switch (kind) {
    case 'ai_key':
    case 'web_key':
    case 'user_key':
      return has('value') ? { value: f.value!.trim() } : null;
    case 'login':
      return has('username', 'password') ? { value: JSON.stringify({ u: f.username, p: f.password }) } : null;
    case 'card': {
      if (!has('number', 'expiry', 'name')) return null;
      const number = f.number!.replace(/[ -]/g, '');
      const exp = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(f.expiry!.trim());
      if (!/^\d{12,19}$/.test(number) || !exp) return null;
      // The CVV is never saved (05-2 §5.8.4); a `cvv` field is ignored here.
      const value = JSON.stringify({ number, expMonth: Number(exp[1]), expYear: 2000 + Number(exp[2]), name: f.name!.trim() });
      return { value, card: { last4: number.slice(-4), brand: cardBrand(number) } };
    }
    case 'conn_token':
      return has('refresh_token')
        ? { value: JSON.stringify({ refresh_token: f.refresh_token, scope: f.scope ?? '', issued_at: now }) }
        : null;
    case 'hub_key':
      return has('key') ? { value: JSON.stringify({ key: f.key, userId: f.userId ?? '', issued_at: now }) } : null;
    case 'wa_session':
      return has('value') ? { value: f.value! } : null;
  }
}

/** Registers a value in the SecretRegistry of record (and its engine mirror) before anyone uses it (08-2 §11.3). */
export type RegisterFn = (value: string, opts: RegisterOptions) => string;

export interface VaultDeps {
  db: Db;
  /** Credential Manager; null when it cannot load (05-2 §5.8.3 Disabled). */
  keyring: Keyring | null;
  safe: SafeStore;
  /** `{DATA}\vault`, where blobs live (09 §9.18). */
  blobDir: string;
  clock: Clock;
  register: RegisterFn;
  /** T4's ApprovalGate lookup (M5 review fix 4): the open approval of a job for a verb, or null. */
  findOpenApproval: (jobId: string, verb: 'pay') => { id: string; state: string } | null;
}

export interface SaveResult {
  target: string;
  savedAt: number;
  label: string;
  replaced: boolean;
  row: SecretIndexRow;
}

type IndexDbRow = {
  target: string;
  kind: SecretKind;
  name: string;
  label: string;
  domain: string | null;
  brand: string | null;
  last4: string | null;
  storage: 'credman' | 'blob';
  created_at: number;
  updated_at: number;
  last_used_at: number | null;
};

const indexRow = (r: IndexDbRow): SecretIndexRow => ({
  kind: r.kind,
  name: r.name,
  label: r.label,
  domain: r.domain,
  brand: r.brand,
  last4: r.last4,
  storage: r.storage,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  lastUsedAt: r.last_used_at,
});

/** Main's vault (08-2 §11.7). Values live only in Credential Manager or DPAPI blobs; foo.db holds names, never values. */
export class SecretVault {
  constructor(private readonly d: VaultDeps) {}

  /** Why nothing can be saved safely right now, or null (09 §9.18 "Never": no plaintext fallback). */
  off(): VaultOff | null {
    if (this.d.keyring === null) return 'keyring_unavailable';
    return this.d.safe.isEncryptionAvailable() ? null : 'encryption_unavailable';
  }

  available(): boolean {
    return this.off() === null;
  }

  private blobPath(name: string): string {
    return join(this.d.blobDir, name === 'whatsapp' ? 'wa-session.bin' : `${name}.bin`);
  }

  private find(target: string): IndexDbRow | undefined {
    return this.d.db.prepare('SELECT * FROM secrets_index WHERE target = ?').get(target) as IndexDbRow | undefined;
  }

  save(kind: SecretKind, typed: string, fields: Record<string, string>): Result<SaveResult> {
    const now = this.d.clock.now();
    // CR-0057: a user key arrives with the name the user typed; the vault names it without spaces.
    const name = kind === 'user_key' ? userKeyName(typed) : typed;
    const enc = encode(kind, fields, now);
    if (!enc) return fail('VALIDATION');
    // A card is named by its last 4 (08-0 §E.8); the name it came with must agree.
    if (enc.card && name !== enc.card.last4) return fail('VALIDATION');
    if (!validSecretName(kind, name)) return fail('VALIDATION');
    const off = this.off();
    if (off) return fail('VAULT_WRITE_FAILED', off);
    const target = vaultTarget(kind, name);
    const before = this.find(target);
    if (before && kind === 'card') return fail('SECRET_EXISTS');
    const storage = kind !== 'wa_session' && fitsCredman(enc.value) ? 'credman' : 'blob';
    // CR-0057: a user key never becomes a blob (its name could match another kind's blob file).
    if (kind === 'user_key' && storage === 'blob') return fail('VALIDATION');
    try {
      if (storage === 'credman') this.d.keyring!.set(target, enc.value);
      else {
        mkdirSync(this.d.blobDir, { recursive: true });
        writeFileSync(this.blobPath(name), this.d.safe.encryptString(enc.value));
      }
    } catch {
      return fail('VAULT_WRITE_FAILED');
    }
    const label = kind === 'user_key' ? userKeyLabel(typed) : secretLabel(kind, name, enc.card?.brand ?? null);
    const row: IndexDbRow = {
      target,
      kind,
      name,
      label,
      domain: kind === 'login' ? name : null,
      brand: enc.card?.brand ?? null,
      last4: enc.card?.last4 ?? null,
      storage,
      created_at: before?.created_at ?? now,
      updated_at: now,
      last_used_at: before?.last_used_at ?? null,
    };
    try {
      this.d.db
        .prepare(
          `INSERT INTO secrets_index (target, kind, name, label, domain, brand, last4, storage, created_at, updated_at, last_used_at)
           VALUES (@target, @kind, @name, @label, @domain, @brand, @last4, @storage, @created_at, @updated_at, @last_used_at)
           ON CONFLICT(target) DO UPDATE SET label = excluded.label, domain = excluded.domain, brand = excluded.brand,
             last4 = excluded.last4, storage = excluded.storage, updated_at = excluded.updated_at`,
        )
        .run(row);
    } catch {
      // M6 T9: no value without its index row (an orphan the user could never see or remove). A new value, or one written
      // to a different store than its row names, is taken back; a same-store replace keeps the row that already names it.
      if (!before || before.storage !== storage) this.dropValue(target, name, storage);
      return fail('VAULT_WRITE_FAILED');
    }
    // A value that moved between stores leaves nothing behind in the old one (only once the row names the new store).
    if (before && before.storage !== storage) this.dropValue(target, name, before.storage);
    return ok({ target, savedAt: now, label, replaced: before !== undefined, row: indexRow(row) });
  }

  /** `secret:list` rows: names and hints only (08-5 §3.6). */
  list(): SecretIndexRow[] {
    return (this.d.db.prepare('SELECT * FROM secrets_index ORDER BY created_at, target').all() as IndexDbRow[]).map(indexRow);
  }

  /** The index row for a target (its label for the activity line), or null. */
  entry(target: string): SecretIndexRow | null {
    const r = this.find(target);
    return r ? indexRow(r) : null;
  }

  private dropValue(target: string, name: string, storage: 'credman' | 'blob'): boolean {
    try {
      if (storage === 'credman') return this.d.keyring?.delete(target) ?? false;
      const p = this.blobPath(name);
      if (!existsSync(p)) return false;
      rmSync(p, { force: true });
      return true;
    } catch {
      return false;
    }
  }

  /** `vault.delete`: the value and its index row; false when the value could not be removed (the row stays). */
  delete(target: string): Result<{ removed: SecretIndexRow | null }> {
    const r = this.find(target);
    if (!r) return ok({ removed: null });
    this.dropValue(target, r.name, r.storage);
    // Still there after the delete → the store refused; keep the index row so the user can try again.
    const still = r.storage === 'credman' ? this.d.keyring?.get(target) != null : existsSync(this.blobPath(r.name));
    if (still) return fail('VAULT_WRITE_FAILED');
    this.d.db.prepare('DELETE FROM secrets_index WHERE target = ?').run(target);
    return ok({ removed: indexRow(r) });
  }

  /** `vault.wipeAll` (J21, J23): every entry; the targets that could not be removed. */
  wipeAll(): { failed: string[] } {
    const failed: string[] = [];
    for (const r of this.d.db.prepare('SELECT target FROM secrets_index').all() as { target: string }[]) {
      if (!this.delete(r.target).ok) failed.push(r.target);
    }
    return { failed };
  }

  /** 08-2 §11.3 purpose checks, then the value, registered in the SecretRegistry before it is returned. */
  use(req: VaultUseRequest): Result<string> {
    const kind = PURPOSE_KIND[req.purpose];
    if (req.purpose === 'voice_call' && req.name !== 'openai-key') return fail('VAULT_PURPOSE_DENIED');
    if (!validSecretName(kind, req.name)) return fail('VAULT_PURPOSE_DENIED');
    if (req.purpose === 'fill_card') {
      const a = req.jobId ? this.d.findOpenApproval(req.jobId, 'pay') : null;
      if (!a || !['APPROVED', 'RUNNING'].includes(a.state) || (req.approvalId && req.approvalId !== a.id))
        return fail('VAULT_PURPOSE_DENIED');
    }
    if (req.purpose === 'fill_login') {
      const job = req.jobId
        ? (this.d.db.prepare('SELECT state, site_domain FROM jobs WHERE id = ?').get(req.jobId) as
            { state: string; site_domain: string | null } | undefined)
        : undefined;
      if (!job || job.state !== 'working' || job.site_domain !== req.name) return fail('VAULT_PURPOSE_DENIED');
    }
    const target = vaultTarget(kind, req.name);
    const r = this.find(target);
    if (!r) return fail('VAULT_MISSING');
    let value: string | null;
    try {
      value =
        r.storage === 'credman' ? (this.d.keyring?.get(target) ?? null) : this.d.safe.decryptString(readFileSync(this.blobPath(r.name)));
    } catch {
      value = null;
    }
    // CR-0025: an index row whose value cannot be read back says so (the engine logs it; a plain miss is not logged).
    if (!value) return fail('VAULT_MISSING', 'value_unreadable');
    // T3's register kinds have no WhatsApp session; it is a connection credential like a refresh token.
    this.d.register(value, { kind: kind === 'wa_session' ? 'conn_token' : kind });
    this.d.db.prepare('UPDATE secrets_index SET last_used_at = ? WHERE target = ?').run(this.d.clock.now(), target);
    return ok(value);
  }
}
