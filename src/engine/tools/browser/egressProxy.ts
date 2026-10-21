// Spec: 08-2 §8.2 (`browser.open` blocks `localhost` and private/link-local IP ranges), 08-4 §27.6 (FOO_TEST_ALLOW_HOSTS and the
// test-only host map, test builds only), CR-0047 (the block is on the address the connection is made to). foo's browser sends
// every request through this proxy on 127.0.0.1 (pages, redirect hops, frames, pop-ups, workers, images, sockets): it makes the
// one lookup that feeds the socket and refuses a private answer, so a name re-pointed between two lookups cannot slip through.
import { request as httpRequest, createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { connect as netConnect, isIP, type AddressInfo, type LookupFunction, type Socket } from 'node:net';
import type { Duplex } from 'node:stream';
import { bareHost, blockedAddress, isLocalName, isPrivateIp, systemResolve, withTimeout, type Resolve } from '../net/address';

const RESOLVE_MS = 3_000;
/** A site that never answers in time is let go (the page load itself gives up at 15 s). */
const CONNECT_MS = 30_000;
/** A name that cannot exist (RFC 6761 `.invalid`): only the launch check asks for it. */
export const PROBE_HOST = 'foo-egress-probe.invalid';
/** Request headers that belong to one hop (RFC 9110 §7.6.1), never passed on. */
const HOP = ['connection', 'keep-alive', 'te', 'trailer', 'upgrade', 'proxy-connection', 'proxy-authorization', 'proxy-authenticate'];

export interface EgressProxy {
  /** For Chromium's `--proxy-server`. */
  readonly url: string;
  /** A counter to read before a load; `refusedSince` says whether the proxy refused anything after it. */
  mark(): number;
  refusedSince(mark: number): boolean;
  /** How many times the launch check reached the proxy. */
  probed(): number;
  close(): Promise<void>;
}

export interface EgressOptions {
  allowHosts: readonly string[];
  resolve?: Resolve;
  /** Test runs only: FOO_TEST_BROWSER_HOST_RULES `MAP name address` pairs (the sandbox's `.test` names). */
  hostMap?: Readonly<Record<string, string>>;
  log(evt: string, kind?: string): void;
}

/** `MAP a.test 127.0.0.1,MAP b.test 127.0.0.1` → { 'a.test': '127.0.0.1', … }. */
export function hostMapFrom(rules: string | undefined): Record<string, string> {
  const map: Record<string, string> = {};
  for (const r of (rules ?? '').split(',')) {
    const m = /^\s*MAP\s+(\S+)\s+(\S+)\s*$/i.exec(r);
    if (m) map[bareHost(m[1]!)] = m[2]!;
  }
  return map;
}

export async function startEgressProxy(o: EgressOptions): Promise<EgressProxy> {
  const resolve = o.resolve ?? systemResolve;
  let refusals = 0;
  let probes = 0;
  const refuse = (): null => {
    refusals += 1;
    o.log('browser.private_address');
    return null;
  };

  /** The vetted addresses to connect to, or null when the host is refused or does not resolve. */
  const pick = async (host: string): Promise<string[] | null> => {
    const h = bareHost(host);
    const allowed = o.allowHosts.includes(h);
    // The launch check (proxyIsUsed): seen here means the browser really sends its traffic through this proxy.
    if (h === PROBE_HOST) {
      probes += 1;
      return null;
    }
    const mapped = o.hostMap?.[h];
    if (mapped) return blockedAddress(h, mapped, o.allowHosts) ? refuse() : [mapped];
    if (isIP(h)) return isPrivateIp(h) && !allowed ? refuse() : [h];
    if (isLocalName(h)) return allowed ? ['127.0.0.1'] : refuse();
    const all = await withTimeout(resolve(h), RESOLVE_MS).catch(() => [] as string[]);
    if (!all.length) return null;
    // Any private answer refuses the host: Chromium could have been given either.
    return all.some((a) => blockedAddress(h, a, o.allowHosts)) ? refuse() : all;
  };

  /** A lookup that only ever hands the socket the vetted addresses (so dual-stack fallback still works). */
  const vetted =
    (addrs: string[]): LookupFunction =>
    (_host, options, cb) => {
      const fam = (a: string) => (a.includes(':') ? 6 : 4);
      const list = options.family === 4 || options.family === 6 ? addrs.filter((a) => fam(a) === options.family) : addrs;
      if (!list.length) return cb(Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }), '', 4);
      if (options.all)
        return (cb as unknown as (e: null, a: { address: string; family: number }[]) => void)(
          null,
          list.map((a) => ({ address: a, family: fam(a) })),
        );
      cb(null, list[0]!, fam(list[0]!));
    };

  /** `host:port` or `[v6]:port` from a CONNECT line; the port is required (WHATWG URL would drop :80 and :443). */
  const authority = (raw: string): { host: string; port: number } | null => {
    const m = /^\[([^\]]+)\]:(\d{1,5})$/.exec(raw) ?? /^([^:[\]/\s]+):(\d{1,5})$/.exec(raw);
    const port = m ? Number(m[2]) : 0;
    return m && port > 0 && port < 65536 ? { host: m[1]!, port } : null;
  };

  // HTTPS, WebSockets (ws:// on port 80 too) and anything else Chromium tunnels.
  const onConnect = (req: IncomingMessage, client: Duplex, head: Buffer) => {
    client.on('error', () => undefined);
    const target = authority(req.url ?? '');
    if (!target) return void client.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    pick(target.host)
      .then((addrs) => {
        if (client.destroyed) return;
        // Refused, or the name does not resolve: Chromium shows its own error for a failed tunnel.
        if (!addrs) return void client.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
        const up: Socket = netConnect({ host: target.host, port: target.port, lookup: vetted(addrs), autoSelectFamily: true }, () => {
          client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
          if (head.length) up.write(head);
          up.pipe(client);
          client.pipe(up);
        });
        up.setTimeout(CONNECT_MS, () => up.destroy());
        up.on('connect', () => up.setTimeout(0));
        up.on('error', () => client.destroy());
        // end, not destroy: what the site already sent still reaches the browser.
        up.on('close', () => client.end());
        client.on('close', () => up.destroy());
      })
      .catch(() => client.destroy());
  };

  // Plain http: Chromium sends the whole address.
  const onRequest = (req: IncomingMessage, res: ServerResponse) => {
    res.on('error', () => undefined);
    let target: URL;
    try {
      target = new URL(req.url ?? '');
    } catch {
      return void res.destroy();
    }
    if (target.protocol !== 'http:') return void res.destroy();
    pick(target.hostname)
      .then((addrs) => {
        if (!addrs || res.destroyed) return void res.destroy();
        const headers = { ...req.headers };
        for (const c of String(req.headers.connection ?? '').split(',')) delete headers[c.trim().toLowerCase()];
        for (const k of HOP) delete headers[k];
        const up = httpRequest(
          {
            host: bareHost(target.hostname),
            port: Number(target.port) || 80,
            path: `${target.pathname}${target.search}`,
            method: req.method,
            headers,
            setHost: false,
            lookup: vetted(addrs),
          },
          (r) => {
            // The connect limit only: a slow download or a long poll is not cut once the answer has started.
            up.setTimeout(0);
            // An origin's 407 would read as this proxy asking for a password: it never reaches the browser as one.
            const status = r.statusCode === 407 ? 502 : (r.statusCode ?? 502);
            const hop = new Set(['proxy-authenticate', 'proxy-connection', 'keep-alive', 'connection', 'transfer-encoding']);
            for (const c of String(r.headers.connection ?? '').split(',')) hop.add(c.trim().toLowerCase());
            const raw: string[] = [];
            for (let i = 0; i + 1 < r.rawHeaders.length; i += 2)
              if (!hop.has(r.rawHeaders[i]!.toLowerCase())) raw.push(r.rawHeaders[i]!, r.rawHeaders[i + 1]!);
            res.writeHead(status, r.statusMessage, raw);
            r.pipe(res);
            r.on('error', () => res.destroy());
          },
        );
        up.setTimeout(CONNECT_MS, () => up.destroy());
        up.on('error', () => res.destroy());
        // A load the browser gave up on lets the site go too.
        res.on('close', () => up.destroy());
        req.pipe(up);
      })
      .catch(() => res.destroy());
  };

  const server = createServer(onRequest);
  server.on('connect', onConnect);
  server.on('clientError', (_e, s) => s.destroy());
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  server.unref();
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    mark: () => refusals,
    probed: () => probes,
    refusedSince: (m) => refusals > m,
    close: () =>
      new Promise<void>((ok) => {
        server.closeAllConnections();
        server.close(() => ok());
      }),
  };
}

/** Chromium switches for the proxy: every request goes through it, loopback included (Chromium skips the proxy for it by default). */
export function proxyArgs(p: EgressProxy): string[] {
  // WebRTC's UDP does not go through an HTTP proxy: it is kept off so a page cannot probe the local network that way.
  return [`--proxy-server=${p.url}`, '--proxy-bypass-list=<-loopback>', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp'];
}

/**
 * Fails closed when the browser ignores `--proxy-server` (a managed PC's proxy policy overrides it): the launch check loads
 * PROBE_HOST once in the start page and the proxy must have seen it, or the browser is not used (`browser.proxy_bypassed`).
 */
export async function proxyIsUsed(p: EgressProxy, page: { goto(url: string, o: { timeout: number }): Promise<unknown> }): Promise<boolean> {
  const before = p.probed();
  await page.goto(`http://${PROBE_HOST}/`, { timeout: 5_000 }).catch(() => undefined);
  await page.goto('about:blank', { timeout: 5_000 }).catch(() => undefined);
  return p.probed() > before;
}
