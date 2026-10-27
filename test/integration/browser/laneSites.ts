// The T2 sign-in and CAPTCHA sites (08-3 §22.5) on plain HTTP for the M9 T7 lane tests and e2e runs: their own handlers and
// toggles, served on two loopback names so each keeps its own root paths and cookies (127.0.0.1 = the sign-in site,
// localhost = the CAPTCHA site; both on FOO_TEST_ALLOW_HOSTS, 08-4 §27.6). A test changes a toggle to stand in for the person
// (a phone approval arriving, a puzzle solved), never to sign foo in.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Site, SiteRequest, Toggles } from '../../sites/site';
import signinSite from '../../sites/signin';
import captchaSite from '../../sites/captcha';

export interface LaneSites {
  port: number;
  toggles: { signin: Toggles; captcha: Toggles };
  counts: Record<string, number>;
  /** Whether the sites also answer on [::1] (no when the machine has no IPv6 loopback), and how many ports were skipped
   * because something else already held [::1] on them. */
  ipv6: boolean;
  v6Collisions: number;
  /** Every request the sites got, in order: when (ms since the sites started), the Host header and the loopback it came in
   * on, so a page that never arrived says whether the browser asked at all. */
  requests: { ms: number; host: string; family: string; path: string }[];
  /** `Date.now()` when the sites started (the zero of `requests[].ms`). */
  started: number;
  signin(path?: string): string;
  captcha(path?: string): string;
  close(): Promise<void>;
}

function mount<T extends Toggles, D>(site: Site<T, D>, counts: Record<string, number>) {
  const toggles = site.initialToggles();
  const data = site.initialData();
  return {
    toggles,
    serve: (req: SiteRequest) => site.handle(req, { toggles, data, count: (n) => (counts[n] = (counts[n] ?? 0) + 1) }),
  };
}

export async function serveLaneSites(): Promise<LaneSites> {
  const counts: Record<string, number> = {};
  const sites = { signin: mount(signinSite, counts), captcha: mount(captchaSite, counts) };
  const started = Date.now();
  const requests: LaneSites['requests'] = [];
  const handler = (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    requests.push({ ms: Date.now() - started, host: req.headers.host ?? '', family: req.socket.remoteFamily ?? '', path: url.pathname });
    const site = (req.headers.host ?? '').startsWith('localhost') ? sites.captcha : sites.signin;
    let body = '';
    req.on('data', (c: Buffer) => (body += c.toString('utf8')));
    req.on('end', () => {
      const cookies = Object.fromEntries(
        (req.headers.cookie ?? '')
          .split(';')
          .map((p) => p.trim().split('='))
          .filter((kv): kv is [string, string] => kv.length === 2),
      );
      const out = site.serve({
        method: req.method ?? 'GET',
        path: url.pathname,
        query: url.searchParams,
        form: new URLSearchParams(body),
        cookies,
      });
      res.writeHead(out.status, { 'content-type': out.type ?? 'text/html; charset=utf-8', ...(out.headers ?? {}) }).end(out.body);
    });
  };
  // The browser reaches `localhost` on [::1] first where the machine has IPv6 (Windows does), so the sites answer there on
  // the same port too. A port whose [::1] side another program holds is skipped: that program, not these sites, would
  // answer the CAPTCHA page (UX-14-09 on windows-latest: browser.open timed out on http://localhost, never on 127.0.0.1).
  const servers: Server[] = [];
  let port = 0;
  let ipv6 = false;
  let v6Collisions = 0;
  for (;;) {
    const v4 = createServer(handler);
    await new Promise<void>((ok) => v4.listen(0, '127.0.0.1', ok));
    port = (v4.address() as AddressInfo).port;
    const v6 = createServer(handler);
    const got = await new Promise<string>((ok) => {
      v6.once('error', (e: NodeJS.ErrnoException) => ok(e.code ?? 'error'));
      v6.listen(port, '::1', () => ok('ok'));
    });
    if (got === 'ok') {
      servers.push(v4, v6);
      ipv6 = true;
      break;
    }
    if (got === 'EADDRINUSE' && v6Collisions < 20) {
      v6Collisions += 1;
      await new Promise<void>((ok) => v4.close(() => ok()));
      continue;
    }
    // No IPv6 loopback here (EAFNOSUPPORT, EADDRNOTAVAIL): `localhost` is 127.0.0.1 only.
    servers.push(v4);
    break;
  }
  return {
    port,
    ipv6,
    v6Collisions,
    requests,
    started,
    toggles: { signin: sites.signin.toggles, captcha: sites.captcha.toggles },
    counts,
    signin: (p = '/login') => `http://127.0.0.1:${port}${p}`,
    captcha: (p = '/') => `http://localhost:${port}${p}`,
    // server.close() waits for every open keep-alive socket, and foo's browser may still hold some; close them first so a
    // test's clean-up can never hang on them (as test/sites/server.ts does).
    close: () =>
      Promise.all(
        servers.map(
          (server) =>
            new Promise<void>((ok) => {
              server.closeAllConnections();
              server.close(() => ok());
            }),
        ),
      ).then(() => undefined),
  };
}
