// Spec: 08-2 §8.3.1 (`playwright-core`, no downloaded browsers, launches the installed Microsoft Edge with
// `chromium.launchPersistentContext('{DATA}\\browser\\profile', { channel:'msedge', headless:false, viewport:null,
// acceptDownloads:true, args:[…five args…] })`; fallback `channel:'chrome'` with `{DATA}\browser\profile-chrome\`; neither →
// BROWSER_MISSING), §8.3.2 (one browser process, a window per job via CDP `Target.createTarget({ url:'about:blank',
// newWindow:true, background:true })` then adopt the page, max 3; foo adds no title prefix), §8.2 `browser.open` (http/https only;
// file:, chrome:, edge:, about: except blank, localhost and private/link-local IP ranges blocked; test builds:
// FOO_TEST_ALLOW_HOSTS, 08-4 §27.6), §8.3.10 (hand-back sites → SITE_HANDBACK), §8.6 `browser.ensure`. CR-0013 (M9 T1):
// `BrowserHandle` is the seam; on Linux (container, CI) Playwright's Chromium stands in for Edge behind it (M9 tickets map).
import { join } from 'node:path';
import type { BrowserContext, CDPSession, Page } from 'playwright-core';
import { fail, ok, type Result } from '../../../shared/errors';
import type { HostMatcher } from '../../../shared/handback';
import type { BrowserHandle, CdpSession, JobWindow } from './types';
import { WindowPool } from './windows';

export const EDGE_ARGS = [
  '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--no-first-run',
  '--no-default-browser-check',
] as const;

/** Playwright's own Chromium in the cloud container (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers). */
export const LINUX_CHROMIUM = '/opt/pw-browsers/chromium';

export interface LaunchOptions {
  headless: boolean;
  viewport: null;
  acceptDownloads: true;
  args: string[];
  channel?: 'msedge' | 'chrome';
  executablePath?: string;
}
export interface LaunchStep {
  channel: 'msedge' | 'chrome' | 'chromium';
  userDataDir: string;
  options: LaunchOptions;
}

/**
 * The launch attempts in order. Windows: Edge with the foo profile, then Chrome with `profile-chrome`. Linux (only the container
 * and CI run there): Playwright's Chromium when present, then an installed Chrome. `headless` is for tests; the app never sets it.
 */
export function launchPlan(o: {
  platform: NodeJS.Platform;
  dataDir: string;
  exists(path: string): boolean;
  headless?: boolean;
}): LaunchStep[] {
  const base = { headless: o.headless ?? false, viewport: null, acceptDownloads: true as const, args: [...EDGE_ARGS] };
  const edge: LaunchStep = {
    channel: 'msedge',
    userDataDir: join(o.dataDir, 'browser', 'profile'),
    options: { ...base, channel: 'msedge' },
  };
  const chrome: LaunchStep = {
    channel: 'chrome',
    userDataDir: join(o.dataDir, 'browser', 'profile-chrome'),
    options: { ...base, channel: 'chrome' },
  };
  if (o.platform === 'win32') return [edge, chrome];
  const steps: LaunchStep[] = [];
  if (o.exists(LINUX_CHROMIUM))
    steps.push({
      channel: 'chromium',
      userDataDir: join(o.dataDir, 'browser', 'profile'),
      options: { ...base, executablePath: LINUX_CHROMIUM },
    });
  steps.push(chrome);
  return steps;
}

export interface UrlPolicy {
  handback: HostMatcher;
  /** FOO_TEST_ALLOW_HOSTS (test builds only, 08-4 §27.6): host names that skip the localhost / private-range block. */
  allowHosts: readonly string[];
}

function ipv4Private(h: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function ipv6Private(h: string): boolean {
  if (!h.startsWith('[')) return false;
  const v = h.slice(1, -1).toLowerCase();
  if (v === '::' || v === '::1') return true;
  if (/^f[cd]/.test(v) || /^fe[89ab]/.test(v)) return true;
  const mapped = /^::ffff:(.+)$/.exec(v);
  if (mapped?.[1]) {
    const tail = mapped[1];
    if (tail.includes('.')) return ipv4Private(tail);
    // WHATWG URL writes ::ffff:127.0.0.1 as ::ffff:7f00:1.
    const parts = tail.split(':').map((x) => parseInt(x, 16));
    if (parts.length === 2 && parts.every((n) => Number.isFinite(n)))
      return ipv4Private([parts[0]! >> 8, parts[0]! & 255, parts[1]! >> 8, parts[1]! & 255].join('.'));
  }
  return false;
}

/** 08-2 §8.2 `browser.open` URL rule (also `web.fetch`'s, re-checked on every redirect by T4). */
export function checkUrl(url: string, policy: UrlPolicy): Result<string> {
  if (url === 'about:blank') return ok(url);
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return fail('URL_NOT_ALLOWED');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return fail('URL_NOT_ALLOWED');
  const host = u.hostname.toLowerCase();
  const local = host === 'localhost' || host.endsWith('.localhost') || ipv4Private(host) || ipv6Private(host);
  if (local && !policy.allowHosts.includes(host)) return fail('URL_NOT_ALLOWED');
  if (policy.handback.check(url)) return fail('SITE_HANDBACK');
  return ok(url);
}

/** Reads FOO_TEST_ALLOW_HOSTS; empty outside test runs (production strips the test path, 08-3 §22.1). */
export function allowHostsFrom(env: Record<string, string | undefined>, testRun: boolean): string[] {
  if (!testRun) return [];
  return (env.FOO_TEST_ALLOW_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

/** A job window as the engine drives it: the BrowserHandle `JobWindow` plus the page the actions use. */
export interface DriverWindow extends JobWindow {
  /** The page foo acts on now: the job's own page, or a pop-up adopted into the job (§8.3.5 watchdogs) until it closes. */
  page(): Page;
  adopt(popup: Page): void;
}

class PwJobWindow implements DriverWindow {
  private current: Page;
  private closedCbs = new Set<() => void>();
  constructor(
    readonly jobId: string,
    private readonly ctx: BrowserContext,
    private readonly own: Page,
  ) {
    this.current = own;
    own.on('close', () => {
      for (const cb of this.closedCbs) cb();
    });
  }
  page(): Page {
    return this.current.isClosed() ? this.own : this.current;
  }
  adopt(popup: Page): void {
    this.current = popup;
    popup.on('close', () => {
      if (this.current === popup) this.current = this.own;
    });
  }
  url(): string {
    return this.page().url();
  }
  async cdp(): Promise<CdpSession> {
    const s: CDPSession = await this.ctx.newCDPSession(this.page());
    return {
      send: <T>(method: string, params?: Record<string, unknown>) =>
        (s.send as (m: string, p?: Record<string, unknown>) => Promise<unknown>)(method, params) as Promise<T>,
      on: (event, cb) => {
        const h = (p: unknown) => cb(p);
        (s.on as (e: string, f: (p: unknown) => void) => void)(event, h);
        return () => (s.off as (e: string, f: (p: unknown) => void) => void)(event, h);
      },
      detach: () => s.detach(),
    };
  }
  bringToFront(): Promise<void> {
    return this.own.bringToFront();
  }
  async close(): Promise<void> {
    if (!this.own.isClosed()) await this.own.close();
  }
  onClosed(cb: () => void): () => void {
    this.closedCbs.add(cb);
    return () => this.closedCbs.delete(cb);
  }
}

export interface PlaywrightBrowserDeps {
  dataDir: string;
  platform: NodeJS.Platform;
  exists(path: string): boolean;
  headless?: boolean;
  /** playwright-core's `chromium.launchPersistentContext` (injected so the module loads without a browser). */
  launch(userDataDir: string, options: LaunchOptions): Promise<BrowserContext>;
  log(evt: string, kind?: string): void;
  /** Called for every new job window (watchdogs, masker). */
  onWindow?(win: DriverWindow): void;
}

/** `browser.ensure` and the job windows over playwright-core (08-2 §8.3.1–§8.3.2). */
export class PlaywrightBrowser implements BrowserHandle {
  private ctx: BrowserContext | null = null;
  private starting: Promise<Result<void>> | null = null;
  private readonly wins = new Map<string, PwJobWindow>();
  private readonly opening = new Map<string, Promise<Result<JobWindow>>>();
  readonly pool = new WindowPool();

  constructor(private readonly d: PlaywrightBrowserDeps) {}

  ensure(): Promise<Result<void>> {
    if (this.ctx) return Promise.resolve(ok(undefined));
    this.starting ??= this.start().finally(() => (this.starting = null));
    return this.starting;
  }

  private async start(): Promise<Result<void>> {
    for (const step of launchPlan(this.d)) {
      try {
        const ctx = await this.d.launch(step.userDataDir, step.options);
        ctx.on('close', () => {
          this.ctx = null;
          for (const id of [...this.wins.keys()]) this.forget(id);
        });
        this.ctx = ctx;
        this.d.log('browser.ensure', step.channel);
        return ok(undefined);
      } catch {
        this.d.log('browser.launch_failed', step.channel);
      }
    }
    return fail('BROWSER_MISSING');
  }

  openWindow(jobId: string, signal?: AbortSignal): Promise<Result<JobWindow>> {
    const have = this.wins.get(jobId);
    if (have) return Promise.resolve(ok(have));
    const pending = this.opening.get(jobId);
    if (pending) return pending;
    const p = this.open(jobId, signal).finally(() => this.opening.delete(jobId));
    this.opening.set(jobId, p);
    return p;
  }

  private async open(jobId: string, signal?: AbortSignal): Promise<Result<JobWindow>> {
    const up = await this.ensure();
    if (!up.ok) return up;
    try {
      await this.pool.acquire(jobId, signal);
    } catch {
      return fail('JOB_GONE');
    }
    const ctx = this.ctx;
    if (!ctx) {
      this.pool.release(jobId);
      return fail('BROWSER_MISSING');
    }
    try {
      const page = await this.createWindow(ctx);
      const win = new PwJobWindow(jobId, ctx, page);
      win.onClosed(() => this.forget(jobId));
      this.wins.set(jobId, win);
      this.d.onWindow?.(win);
      return ok(win);
    } catch {
      this.pool.release(jobId);
      return fail('BROWSER_MISSING');
    }
  }

  private readonly targetIds = new WeakMap<Page, string>();

  private async targetIdOf(ctx: BrowserContext, p: Page): Promise<string> {
    const known = this.targetIds.get(p);
    if (known) return known;
    const ps = await ctx.newCDPSession(p);
    try {
      const id = ((await ps.send('Target.getTargetInfo')) as { targetInfo: { targetId: string } }).targetInfo.targetId;
      this.targetIds.set(p, id);
      return id;
    } finally {
      await ps.detach().catch(() => undefined);
    }
  }

  /** §8.3.2: a new background window through CDP, then the Playwright page for that target. */
  private async createWindow(ctx: BrowserContext): Promise<Page> {
    const anchor = ctx.pages()[0] ?? (await ctx.newPage());
    const s = await ctx.newCDPSession(anchor);
    let targetId: string;
    try {
      targetId = ((await s.send('Target.createTarget', { url: 'about:blank', newWindow: true, background: true })) as { targetId: string })
        .targetId;
    } finally {
      await s.detach().catch(() => undefined);
    }
    for (let i = 0; i < 300; i++) {
      for (const p of ctx.pages()) if ((await this.targetIdOf(ctx, p)) === targetId) return p;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('window target not adopted');
  }

  window(jobId: string): DriverWindow | undefined {
    return this.wins.get(jobId);
  }

  async closeWindow(jobId: string): Promise<void> {
    const w = this.wins.get(jobId);
    this.forget(jobId);
    await w?.close().catch(() => undefined);
  }

  private forget(jobId: string): void {
    if (this.wins.delete(jobId)) this.pool.release(jobId);
  }

  /** Engine shutdown: closes the browser process. */
  async shutdown(): Promise<void> {
    const ctx = this.ctx;
    this.ctx = null;
    await ctx?.close().catch(() => undefined);
  }
}
