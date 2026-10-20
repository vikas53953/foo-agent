// Shared harness for the M9 T3 browser integration tests: the real browser tools (createBrowserTools) over playwright-core,
// headless, with Playwright's Chromium in the container, Chrome on ubuntu CI and Edge on windows-latest (08-2 §8.3.1 launch plan),
// the engine Redactor, and a local HTTP server (two origins: 127.0.0.1 and localhost) for pages and cross-origin frames.
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Page } from 'playwright-core';
import { FakeClock } from '../../../src/shared/clock';
import { settingsDefaults } from '../../../src/shared/settingsDefaults';
import { Redactor } from '../../../src/engine/redact/Redactor';
import type { ToolOutcome } from '../../../src/engine/tools/ToolLayer';
import { createBrowserTools, type BrowserRuntime } from '../../../src/engine/tools/browser/tools';
import type { ToolRegistry } from '../../../src/engine/tools/ToolLayer';
import type { Settings } from '../../../src/shared/settings';

/** A sandbox host the harness puts on the hand-back list. */
export const BANK_HOST = 'bank.localhost';

export type Route = (req: IncomingMessage, res: ServerResponse) => void;

export interface BrowserHarness {
  tools: ToolRegistry;
  runtime: BrowserRuntime;
  redactor: Redactor;
  settings: Settings;
  dataDir: string;
  /** http://127.0.0.1:{port} */
  origin: string;
  /** http://localhost:{port}: a different site, so its frames are cross-origin. */
  other: string;
  /** http://bank.localhost:{port}: on the hand-back list. */
  bank: string;
  route(path: string, r: Route | string): void;
  run(tool: string, args?: Record<string, unknown>, jobId?: string): Promise<ToolOutcome>;
  page(jobId?: string): Promise<Page>;
  close(): Promise<void>;
}

export const html = (body: string, head = '') =>
  `<!doctype html><html><head><meta charset="utf-8">${head}</head><body>${body}</body></html>`;

export async function browserHarness(o: { settleMaxMs?: number } = {}): Promise<BrowserHarness> {
  const routes = new Map<string, Route>();
  const server: Server = createServer((req, res) => {
    const r = routes.get((req.url ?? '/').split('?')[0] ?? '/');
    if (!r) {
      res.writeHead(404).end('not found');
      return;
    }
    r(req, res);
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const port = (server.address() as AddressInfo).port;
  const dataDir = mkdtempSync(join(tmpdir(), 'foo-browser-'));
  // The real resource lists plus one sandbox host on the hand-back list (Chromium resolves *.localhost to loopback), so a
  // redirect onto a hand-back site can be tested without any request leaving the machine.
  const real = resolve(__dirname, '../../../resources');
  const resourcesDir = join(dataDir, 'resources');
  mkdirSync(resourcesDir);
  copyFileSync(join(real, 'no-capture-hosts.json'), join(resourcesDir, 'no-capture-hosts.json'));
  const sites = JSON.parse(readFileSync(join(real, 'handback-sites.json'), 'utf8')) as { categories: { netbanking: string[] } };
  sites.categories.netbanking.push(BANK_HOST);
  writeFileSync(join(resourcesDir, 'handback-sites.json'), JSON.stringify(sites));
  const clock = new FakeClock();
  const redactor = new Redactor({ clock, log: () => undefined });
  const settings = structuredClone(settingsDefaults);
  const { registry, runtime } = createBrowserTools({
    dataDir,
    resourcesDir,
    platform: process.platform,
    env: { FOO_TEST_ALLOW_HOSTS: `127.0.0.1,localhost,${BANK_HOST}` },
    testRun: true,
    scrub: (t) => redactor.scrub(t).text,
    registryHit: (t) => redactor.registry.forms().some((f) => t.includes(f.form)),
    settings: () => settings,
    now: () => Date.now(),
    log: () => undefined,
    headless: true,
    timing: { idleMs: 150, settleMaxMs: o.settleMaxMs ?? 5_000, actionableMs: 2_000 },
  });
  const ac = new AbortController();
  const h: BrowserHarness = {
    tools: registry,
    runtime,
    redactor,
    settings,
    dataDir,
    origin: `http://127.0.0.1:${port}`,
    other: `http://localhost:${port}`,
    bank: `http://${BANK_HOST}:${port}`,
    route(path, r) {
      routes.set(
        path,
        typeof r === 'string'
          ? (_q, res) => {
              res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(r);
            }
          : r,
      );
    },
    async run(tool, args = {}, jobId = 'job_1') {
      const def = registry[tool];
      if (!def) throw new Error(`no tool ${tool}`);
      return def.run(args, { jobId, signal: ac.signal, now: clock.now() });
    },
    async page(jobId = 'job_1') {
      const w = await runtime.browser.openWindow(jobId);
      if (!w.ok) throw new Error(w.error.kind);
      const p = runtime.page(jobId);
      if (!p) throw new Error('no page');
      return p;
    },
    async close() {
      ac.abort();
      await runtime.browser.shutdown();
      await new Promise<void>((ok) => server.close(() => ok()));
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
  return h;
}

/** The ok result of a tool call (fails the test with the error kind otherwise). */
export function okResult(r: ToolOutcome): Record<string, unknown> {
  if (r.kind !== 'ok') throw new Error(`expected ok, got ${r.kind}${r.kind === 'error' ? ` ${r.errorKind}` : ''}`);
  return r.result as Record<string, unknown>;
}
