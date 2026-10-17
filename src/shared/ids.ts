// Spec: 08-0 §E.7 (ids are `{prefix}_{UUIDv7}`), 08-1 §0.6 (prefix table), 08-3 §22.2 (IdGen is injected; the seeds use a
// deterministic one).

export type IdPrefix =
  'c' | 'm' | 'k' | 'j' | 's' | 'h' | 't' | 'ap' | 'py' | 'dr' | 'cn' | 'tc' | 'r' | 'rr' | 'act' | 'nt' | 'sg' | 'hi' | 'fl' | 'bf' | 'f';

/** A new id on the system clock and crypto randomness (works in main, engine and renderer without imports). */
export function newId(prefix: IdPrefix, now: number = Date.now()): string {
  const buf = new Uint32Array(4);
  globalThis.crypto.getRandomValues(buf);
  let i = 0;
  return `${prefix}_${uuid7(now, () => buf[i++ % 4]! / 2 ** 32)}`;
}

/** Formats 48 bits of time and 74 bits of randomness as a UUIDv7 string (RFC 9562 §5.7). */
export function uuid7(ms: number, rand: () => number): string {
  const hex = (n: number, len: number) => Math.floor(n).toString(16).padStart(len, '0').slice(-len);
  const r = (bits: number) => Math.floor(rand() * 2 ** bits);
  const time = hex(ms, 12);
  return `${time.slice(0, 8)}-${time.slice(8)}-7${hex(r(12), 3)}-${hex(0x8000 | r(14), 4)}-${hex(r(24), 6)}${hex(r(24), 6)}`;
}
