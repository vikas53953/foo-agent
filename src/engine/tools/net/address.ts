// Spec: 08-2 §8.2 (`browser.open`: blocks `localhost` and private/link-local IP ranges; `web.fetch`: URL policy as
// `browser.open`, re-checked on every redirect), 08-4 §27.6 (FOO_TEST_ALLOW_HOSTS, test builds only), CR-0047 (the block is
// on the address a name resolves to, checked where the connection is made: a public name pointing at 127.0.0.1 or 10.x is
// refused like the address itself). One rule for the browser and the web tools.
import { lookup as dnsLookup } from 'node:dns/promises';

/** Every address a host name resolves to (A and AAAA). */
export type Resolve = (host: string) => Promise<string[]>;

export const systemResolve: Resolve = async (host) => (await dnsLookup(host, { all: true, order: 'verbatim' })).map((a) => a.address);

function v4Private(h: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 0 || // "this network", 0.0.0.0
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // shared address space: CGNAT, Tailscale
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a >= 224 // multicast, reserved, broadcast
  );
}

/** The IPv4 address carried in the last 32 bits of an IPv6 address, written dotted or as two hex groups. */
function v4Tail(tail: string): string | null {
  if (tail.includes('.')) return tail;
  const parts = tail.split(':').map((x) => parseInt(x, 16));
  if (parts.length !== 2 || !parts.every((n) => Number.isFinite(n))) return null;
  return [parts[0]! >> 8, parts[0]! & 255, parts[1]! >> 8, parts[1]! & 255].join('.');
}

function v6Private(v: string): boolean {
  if (v === '::' || v === '::1') return true;
  // Unique local fc00::/7, link-local fe80::/10, old site-local fec0::/10, multicast ff00::/8.
  if (/^f[cdf]/.test(v) || /^fe[89a-f]/.test(v)) return true;
  // IPv4-mapped (::ffff:a.b.c.d, ::ffff:0:a.b.c.d), NAT64 (64:ff9b::a.b.c.d): the IPv4 address inside decides.
  const embedded = /^(?:::ffff:(?:0:)?|64:ff9b::)(.+)$/.exec(v);
  if (embedded?.[1]) {
    const v4 = v4Tail(embedded[1]);
    return v4 ? v4Private(v4) : false;
  }
  // 6to4 (2002:AABB:CCDD::): the IPv4 address is the next 32 bits.
  const six = /^2002:([0-9a-f]{1,4}):([0-9a-f]{1,4})(?::|$)/.exec(v);
  if (six) return v4Private(v4Tail(`${six[1]}:${six[2]}`) ?? '');
  return false;
}

/** The host as the checks compare it: lower case, no URL brackets, no trailing dot (`localhost.` is `localhost`). */
export function bareHost(host: string): string {
  return host
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.+$/, '');
}

/** A loopback, private, shared, link-local, multicast or reserved address, IPv4 or IPv6 (with or without the URL's brackets). */
export function isPrivateIp(addr: string): boolean {
  const a = bareHost(addr);
  return a.includes(':') ? v6Private(a) : v4Private(a);
}

/** `localhost` and `*.localhost`: Chromium answers them with loopback itself, without asking DNS. */
export function isLocalName(host: string): boolean {
  const h = bareHost(host);
  return h === 'localhost' || h.endsWith('.localhost');
}

/** True when the connection to `address` for `host` must not be made: a private address, unless the host is a test host. */
export function blockedAddress(host: string, address: string, allowHosts: readonly string[]): boolean {
  return isPrivateIp(address) && !allowHosts.includes(bareHost(host));
}

/** How long a lookup may take before the check gives up on it (the load then fails or passes on its own). */
const RESOLVE_MS = 3_000;

/** The host is, or resolves to, a private address. A name that does not resolve is not refused here: it fails on its own. */
export async function resolvesPrivate(host: string, resolve: Resolve): Promise<boolean> {
  const h = bareHost(host);
  if (isLocalName(h)) return true;
  if (/^[\d.]+$/.test(h) || h.includes(':')) return isPrivateIp(h);
  const all = await withTimeout(resolve(h), RESOLVE_MS).catch(() => [] as string[]);
  return all.some(isPrivateIp);
}

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<T>((_, no) => {
    timer = setTimeout(() => no(new Error('ETIMEOUT')), ms);
    timer.unref?.();
  });
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}
