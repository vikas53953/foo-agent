// Spec: 08-2 §11.4 item 1 (the SecretRegistry of record is in main: RAM only, per app run, ≤ 256 values, LRU; every addition
// is mirrored to the engine as `registry:add { handle, hash, len, value, normalised, ttlMs }`, 08-0 §G.6, X-93), §11.2
// `secretKind` → storage (X-114: `otp` registry only for 10 min, `cvv` registry only for the payment job), §11.5 ("Send
// anyway" registers the value). The port M5 T3 defines; T2's SecretRegistry fills it (with the engine mirror) through
// `setRegisterValue` and the main Redactor keeps scrubbing against `mainRegistry()`.
import { systemClock } from '../../shared/clock';
import { SecretRegistry } from '../../shared/redactor';

/** What a registered value is (08-2 §11.2 secret kinds plus the registry-only `otp`, `cvv` and a pasted secret). */
export type RegisterKind = 'ai_key' | 'voice_key' | 'web_key' | 'hub_key' | 'login' | 'card' | 'conn_token' | 'otp' | 'cvv' | 'pasted';

export interface RegisterOptions {
  kind: RegisterKind;
  /** null or absent = until the app quits (or LRU eviction). */
  ttlMs?: number | null;
}

/** Registers a value; returns its handle (never the value). */
export type RegisterValue = (value: string, opts: RegisterOptions) => string;

const registry = new SecretRegistry(systemClock);
let seq = 0;

/** The default port: the in-memory registry main's Redactor scrubs against. */
const inMemory: RegisterValue = (value, opts) => {
  const handle = `reg_${opts.kind}_${++seq}`;
  registry.add({ handle, value, ttlMs: opts.ttlMs ?? null });
  return handle;
};

let port: RegisterValue = inMemory;

export function registerSecretValue(value: string, opts: RegisterOptions): string {
  return port(value, opts);
}

/** T2 wiring: the vault's SecretRegistry (adds to {@link mainRegistry} and mirrors to the engine). */
export function setRegisterValue(next: RegisterValue): void {
  port = next;
}

/** The registry of record in main (08-2 §11.4). */
export function mainRegistry(): SecretRegistry {
  return registry;
}
