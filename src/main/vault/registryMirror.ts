// Spec: 08-2 §11.4 item 1 (the SecretRegistry of record is in main: RAM only, per app run; every addition is mirrored to the
// engine), 08-0 §G.6 + X-93 (`registry:add { handle, hash, len, value, normalised, ttlMs }`, `registry:remove { handles }`),
// §11.2 X-114 (`otp` registry only, TTL 10 min; `cvv` for the payment job), 08-1 §2.4 (the engine port; a restarted engine
// gets the live entries again). M5 review fix 10: T2 fills T3's `registerValue` port with this and mirrors from main's
// registry; there is no second registry. The payloads carry values and are never logged.
import { createHash } from 'node:crypto';
import type { Clock } from '../../shared/clock';
import type { MainToEngine } from '../../engine/protocol';

type AddPayload = Extract<MainToEngine, { kind: 'registry:add' }>['payload'];

/** The registry of record as this file uses it (main's SecretRegistry). */
export interface RegistryOfRecord {
  add(e: { handle: string; value: string; normalised?: string[]; ttlMs?: number | null }): void;
  remove(handles: readonly string[]): void;
}

export interface MirrorDeps {
  registry: RegistryOfRecord;
  /** `EngineBridge.send` (false while no engine runs; the replay on start covers it). */
  send: <K extends 'registry:add' | 'registry:remove'>(kind: K, payload: Extract<MainToEngine, { kind: K }>['payload']) => boolean;
  normalisedForms: (value: string) => string[];
  clock: Clock;
}

/** The registry port T3 defines (`registerSecretValue(value, { kind, ttlMs })` → handle). */
export interface RegistryMirror {
  register(value: string, opts: { kind: string; ttlMs?: number | null }): string;
  remove(handles: readonly string[]): void;
  /** Re-sends every live entry (a new or restarted engine starts with an empty registry). */
  replay(): void;
  /** Live handles (tests and the size check). */
  handles(): string[];
}

export function registryMirror(d: MirrorDeps): RegistryMirror {
  // Main's copy for the replay: payload + absolute expiry. Same RAM-only rule as the registry itself.
  const live = new Map<string, { p: AddPayload; expiresAt: number | null }>();
  let seq = 0;
  const purge = () => {
    const now = d.clock.now();
    for (const [h, e] of live) if (e.expiresAt !== null && e.expiresAt <= now) live.delete(h);
  };
  return {
    register(value, opts) {
      seq += 1;
      const handle = `reg_${opts.kind}_${seq}`;
      const ttlMs = opts.ttlMs ?? null;
      const normalised = d.normalisedForms(value);
      d.registry.add({ handle, value, normalised, ttlMs });
      const p: AddPayload = {
        handle,
        hash: createHash('sha256').update(value).digest('hex'),
        len: value.length,
        value,
        normalised,
        ttlMs: ttlMs ?? 0,
      };
      live.set(handle, { p, expiresAt: ttlMs === null ? null : d.clock.now() + ttlMs });
      // The registry keeps at most 256 values (LRU); the replay list follows it.
      while (live.size > 256) live.delete(live.keys().next().value!);
      d.send('registry:add', p);
      return handle;
    },
    remove(handles) {
      d.registry.remove(handles);
      for (const h of handles) live.delete(h);
      d.send('registry:remove', { handles: [...handles] });
    },
    replay() {
      purge();
      const now = d.clock.now();
      for (const { p, expiresAt } of live.values())
        d.send('registry:add', { ...p, ttlMs: expiresAt === null ? 0 : Math.max(1, expiresAt - now) });
    },
    handles() {
      purge();
      return [...live.keys()];
    },
  };
}
