// Spec: 08-3 §22.2 (fakes for every outside service; no real host or key in tests), 08-4 §27.3 (the four wire contracts the
// fakes answer), AT-137 (network capture), AT-140 (canaries). A fake network: every request the web tools make goes through
// FakeNet.fetch, is recorded (host, path, headers, body) and answered by the handler registered for its host.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FakeClock } from '../../../src/shared/clock';
import { Redactor } from '../../../src/engine/redact/Redactor';
import type {
  HttpFetch,
  PageLoader,
  WebKeys,
  WebProvider,
  WebSettings,
  WebToolDeps,
  WebToolsResource,
  WebTurnRow,
} from '../../../src/engine/tools/web/types';

/** A vault value (registry) and a key-shaped string in the job's text (pattern P1). Lower case so a URL host keeps it. */
export const CANARY_VAULT = 'canaryvault7q2xk9';
export const CANARY_KEY = 'sk-proj-CANARYabcdefghij1234567890KLMNOP';

export function makeRedactor(): Redactor {
  const r = new Redactor({ clock: new FakeClock(), log: () => undefined });
  r.registry.add({ handle: 'sec_canary', value: CANARY_VAULT });
  return r;
}

/** 08-4 §27.3 resource as seeded (the fakes answer these bases). */
export const RESOURCE: WebToolsResource = {
  version: '2026.10',
  exa: { base: 'https://api.exa.ai' },
  tavily: { base: 'https://api.tavily.com' },
  firecrawl: { base: 'https://api.firecrawl.dev/v2' },
  browseruse: { base: 'https://api.browser-use.com/api/v2' },
};

export const CLOUD_HOSTS: Record<WebProvider, string> = {
  exa: 'api.exa.ai',
  tavily: 'api.tavily.com',
  firecrawl: 'api.firecrawl.dev',
  browseruse: 'api.browser-use.com',
};

export interface Captured {
  method: string;
  url: string;
  host: string;
  path: string;
  headers: Record<string, string>;
  body: string;
}

export type Handler = (req: Captured) => Response | Promise<Response>;

export function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

export function html(body: string, status = 200, contentType = 'text/html; charset=utf-8'): Response {
  return new Response(body, { status, headers: { 'content-type': contentType } });
}

export class FakeNet {
  readonly requests: Captured[] = [];
  private readonly handlers = new Map<string, Handler>();

  on(host: string, h: Handler): this {
    this.handlers.set(host, h);
    return this;
  }

  hosts(): string[] {
    return [...new Set(this.requests.map((r) => r.host))];
  }

  to(host: string): Captured[] {
    return this.requests.filter((r) => r.host === host);
  }

  readonly fetch: HttpFetch = async (url, init) => {
    const u = new URL(url);
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((v, k) => (headers[k] = v));
    const req: Captured = {
      method: init.method ?? 'GET',
      url,
      host: u.host,
      path: u.pathname,
      headers,
      body: typeof init.body === 'string' ? init.body : '',
    };
    this.requests.push(req);
    const h = this.handlers.get(u.host);
    if (!h) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
    return h(req);
  };
}

/** foo's job window, faked: serves fixture HTML by URL prefix and records every load. */
export class FakePage implements PageLoader {
  readonly loads: string[] = [];
  constructor(private readonly pages: (url: string) => string | null) {}
  async load(url: string): Promise<{ url: string; html: string } | null> {
    this.loads.push(url);
    const h = this.pages(url);
    return h === null ? null : { url, html: h };
  }
}

export function keys(saved: Partial<Record<WebProvider, string>>): WebKeys & { used: WebProvider[] } {
  const used: WebProvider[] = [];
  return {
    used,
    async use(p) {
      used.push(p);
      return saved[p] ?? null;
    },
  };
}

export const NO_KEYS_SETTINGS: WebSettings = {
  search: 'this_pc',
  read: 'this_pc',
  cloudBrowser: false,
  refused: { exa: false, tavily: false, firecrawl: false, browseruse: false },
};

/** Test world: every dependency faked, overridable per test. */
export function world(over: Partial<WebToolDeps> & { net?: FakeNet } = {}): {
  deps: WebToolDeps;
  net: FakeNet;
  clock: FakeClock;
  turns: WebTurnRow[];
  logs: string[];
  quota: WebProvider[];
  refused: WebProvider[];
} {
  const net = over.net ?? new FakeNet();
  const clock = new FakeClock();
  const turns: WebTurnRow[] = [];
  const logs: string[] = [];
  const quota: WebProvider[] = [];
  const refused: WebProvider[] = [];
  const red = makeRedactor();
  let n = 0;
  const deps: WebToolDeps = {
    clock,
    sleep: (ms) => {
      clock.advance(ms);
      return Promise.resolve();
    },
    fetch: net.fetch,
    resource: RESOURCE,
    pricing: {
      usdToInr: 88,
      web: {
        exa: { perCallUsd: 0.005 },
        tavily: { perCallUsd: 0.008 },
        firecrawl: { perCallUsd: 0.001 },
        browseruse: { perStepUsd: 0.01 },
      },
    },
    settings: () => NO_KEYS_SETTINGS,
    keys: keys({}),
    meter: { wouldCross: () => false },
    recordTurn: (row) => void turns.push(row),
    online: () => true,
    scrub: (t) => red.scrub(t),
    isHandback: () => false,
    routeOrder: () => null,
    urlAllowed: () => true,
    isBillerSite: () => false,
    newId: () => `t_web${++n}`,
    log: (kind) => void logs.push(kind),
    onQuota: (p) => void quota.push(p),
    onRefused: (p) => void refused.push(p),
    ...over,
  };
  return { deps, net, clock, turns, logs, quota, refused };
}

/** A fixture page from test/fakes/web/pages (hand-made, no real site content). */
export function fixture(name: string): string {
  return readFileSync(join(__dirname, 'pages', name), 'utf8');
}

export const EXA_KEY_SETTINGS: WebSettings = { ...NO_KEYS_SETTINGS, search: 'exa' };
