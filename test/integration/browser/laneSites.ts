// The T2 sign-in and CAPTCHA sites (08-3 §22.5) on plain HTTP for the M9 T7 lane tests and e2e runs: their own handlers and
// toggles, served on two loopback names so each keeps its own root paths and cookies (127.0.0.1 = the sign-in site,
// localhost = the CAPTCHA site; both on FOO_TEST_ALLOW_HOSTS, 08-4 §27.6). A test changes a toggle to stand in for the person
// (a phone approval arriving, a puzzle solved), never to sign foo in.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Site, SiteRequest, Toggles } from '../../sites/site';
import signinSite from '../../sites/signin';
import captchaSite from '../../sites/captcha';

export interface LaneSites {
  port: number;
  toggles: { signin: Toggles; captcha: Toggles };
  counts: Record<string, number>;
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
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
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
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const port = (server.address() as AddressInfo).port;
  return {
    port,
    toggles: { signin: sites.signin.toggles, captcha: sites.captcha.toggles },
    counts,
    signin: (p = '/login') => `http://127.0.0.1:${port}${p}`,
    captcha: (p = '/') => `http://localhost:${port}${p}`,
    close: () => new Promise<void>((ok) => server.close(() => ok())),
  };
}
