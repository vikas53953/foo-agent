// Spec: 08-3 §22.5 (test sites: a local HTTPS server in `test/sites/`), 08-4 §27.6 + 08-0 §E.6 (the sandbox names go in
// FOO_TEST_ALLOW_HOSTS and map onto 127.0.0.1). One HTTPS server, a self-signed certificate made at start, sites picked
// by Host header. Every host also answers `/__control`: GET → toggles, counters and data; POST JSON → change toggles
// (known keys, same types); POST `/__control/reset` → back to the start state.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer } from 'node:https';
import type { AddressInfo } from 'node:net';
import botcheck from './botcheck';
import captcha from './captcha';
import { makeSandboxCert, type SandboxCert } from './cert';
import handback from './handback';
import { SITE_HOSTS, SITE_NAMES, type SiteName } from './hosts';
import injection from './injection';
import news from './news';
import restaurant from './restaurant';
import signin from './signin';
import type { Counters, Site, SiteRequest, Toggles } from './site';

const SITES: Record<SiteName, Site<Toggles, unknown>> = { restaurant, signin, captcha, botcheck, injection, handback, news };

interface Live {
  toggles: Toggles;
  data: unknown;
  counters: Counters;
}

export interface Sandbox {
  port: number;
  hosts: typeof SITE_HOSTS;
  cert: SandboxCert;
  /** `https://{host}:{port}{path}` for a site. */
  url(site: SiteName, path?: string): string;
  /** Value for FOO_TEST_ALLOW_HOSTS. */
  allowHosts: string;
  /** Value for Chromium's `--host-resolver-rules`. */
  resolverRules: string;
  close(): Promise<void>;
}

const MAX_BODY = 64 * 1024;

const fresh = (s: Site<Toggles, unknown>): Live => ({ toggles: s.initialToggles(), data: s.initialData(), counters: {} });

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) reject(new Error('body too large'));
      else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const cookiesOf = (header: string | undefined): Record<string, string> =>
  Object.fromEntries(
    (header ?? '')
      .split(';')
      .map((p) => p.trim().split('='))
      .filter((kv): kv is [string, string] => kv.length === 2 && kv[0] !== ''),
  );

function send(res: ServerResponse, status: number, body: string, type: string, headers: Record<string, string> = {}) {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', ...headers });
  res.end(body);
}

const json = (res: ServerResponse, status: number, body: unknown) =>
  send(res, status, JSON.stringify(body), 'application/json; charset=utf-8');

/** Checks a control patch against the start toggles: known keys only, same scalar type. */
function applyPatch(live: Live, initial: Toggles, patch: unknown): string | null {
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) return 'patch must be a JSON object';
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in initial)) return `unknown toggle ${k}`;
    if (typeof v !== typeof initial[k]) return `toggle ${k} must be a ${typeof initial[k]}`;
  }
  Object.assign(live.toggles, patch);
  return null;
}

export async function startSandbox(o: { port?: number } = {}): Promise<Sandbox> {
  const hostToSite = new Map<string, SiteName>(SITE_NAMES.map((n) => [SITE_HOSTS[n], n]));
  const cert = makeSandboxCert(Object.values(SITE_HOSTS));
  const live = Object.fromEntries(SITE_NAMES.map((n) => [n, fresh(SITES[n])])) as Record<SiteName, Live>;

  const server = createServer({ key: cert.key, cert: cert.cert }, (req, res) => {
    void (async () => {
      const hostname = (req.headers.host ?? '').toLowerCase().replace(/:\d+$/, '');
      const name = hostToSite.get(hostname);
      if (!name) return send(res, 421, `unknown sandbox host ${hostname}`, 'text/plain; charset=utf-8');
      const site = SITES[name];
      const url = new URL(req.url ?? '/', `https://${hostname}`);
      const method = req.method ?? 'GET';
      const raw = method === 'POST' ? await readBody(req) : '';

      if (url.pathname === '/__control/reset' && method === 'POST') {
        live[name] = fresh(site);
        return json(res, 200, { ok: true });
      }
      if (url.pathname === '/__control') {
        const l = live[name];
        if (method === 'GET') return json(res, 200, { toggles: l.toggles, counters: l.counters, data: l.data });
        if (method === 'POST') {
          let patch: unknown;
          try {
            patch = JSON.parse(raw);
          } catch {
            return json(res, 400, { error: 'body must be JSON' });
          }
          const err = applyPatch(l, site.initialToggles(), patch);
          return err ? json(res, 400, { error: err }) : json(res, 200, { toggles: l.toggles });
        }
        return json(res, 405, { error: 'GET or POST' });
      }

      const l = live[name];
      const count = (c: string) => {
        l.counters[c] = (l.counters[c] ?? 0) + 1;
      };
      count('requests');
      const request: SiteRequest = {
        method,
        path: url.pathname,
        query: url.searchParams,
        form: new URLSearchParams(method === 'POST' ? raw : ''),
        cookies: cookiesOf(req.headers.cookie),
      };
      const r = site.handle(request, { toggles: l.toggles, data: l.data, count });
      send(res, r.status, r.body, r.type ?? 'text/html; charset=utf-8', r.headers);
    })().catch((e: unknown) => {
      if (!res.headersSent) send(res, 500, String(e), 'text/plain; charset=utf-8');
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(o.port ?? 0, '127.0.0.1', () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  const hosts = Object.values(SITE_HOSTS);
  return {
    port,
    hosts: SITE_HOSTS,
    cert,
    url: (site, path = '/') => `https://${SITE_HOSTS[site]}:${port}${path}`,
    allowHosts: hosts.join(','),
    resolverRules: hosts.map((h) => `MAP ${h} 127.0.0.1`).join(','),
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
