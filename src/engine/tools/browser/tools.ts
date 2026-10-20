// Spec: 08-2 §8.2 (the tool catalogue is the only list, X-137: the read/prepare `browser.*` tools with their args and classes),
// §9.2 (classes: open, snapshot, click (non-commit), screenshot, download are `read`; type, select, check, press, scroll, back,
// wait are `prepare`), 08-4 §27.1 (descriptions shown to the AI, exact; `{args}` printed `name: type`, optional `?`, limits `≤ n`;
// `browser.submit`, `browser.fillCard` are engine-only and never listed), §8.3 (Edge window per job, masked snapshot, checked
// actions, watchdogs, step screenshots), §8.3.10 (hand-back sites), 08-4 §27.6 (FOO_TEST_ALLOW_HOSTS). CR-0008 G-M4-05: M9's
// browser plugs into M4's ToolLayer here. Not here: `browser.fillSecret` (needs the M5 vault; T7), `browser.fillPersonal` (needs
// M6 memory), `browser.submit` (T8 adds its line after T3 merges), `screen.open` (screen/screen.ts; needs a main opener).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from 'playwright-core';
import { z } from 'zod';
import { createHandback, createNoCapture, handbackSitesSchema, hostListSchema, type HostMatcher } from '../../../shared/handback';
import type { Settings } from '../../../shared/settings';
import type { ToolContext, ToolDef, ToolOutcome, ToolRegistry } from '../ToolLayer';
import { Actions, type ActionRefusal, type ActionResult } from './actions';
import { PlaywrightBrowser, allowHostsFrom, checkUrl, type DriverWindow, type LaunchOptions } from './browser';
import { Masker } from './masker';
import { RefRouter, SnapshotDiffer, needsScreenshot, snapshotText, takeSnapshot } from './snapshot';
import { StepShots } from './stepShots';
import type { CaptureGuard } from './types';
import { Watchdogs, isChallengePage } from './watchdogs';

export interface BrowserToolsDeps {
  dataDir: string;
  resourcesDir: string;
  platform: NodeJS.Platform;
  env: Record<string, string | undefined>;
  testRun: boolean;
  /** The engine Redactor (R5): registry + pattern scrub over the snapshot text. */
  scrub(text: string): string;
  /** SecretRegistry lookup for `browser.type` (§11.5). */
  registryHit(text: string): boolean;
  settings(): Settings;
  now(): number;
  log(evt: string, kind?: string): void;
  /** T7 owns the sign-in pause state; until it lands nothing is paused. */
  captureGuard?: CaptureGuard;
  /** Tests: headless, a launcher, shorter idle waits. */
  headless?: boolean;
  launch?(userDataDir: string, options: LaunchOptions): Promise<import('playwright-core').BrowserContext>;
  timing?: { idleMs?: number; settleMaxMs?: number; actionableMs?: number };
}

/** What other M9 parts use: the handle (T5 screencast, T7 sign-in, T8 submit), the masker (FrameVerifier), the step pictures. */
export interface BrowserRuntime {
  browser: PlaywrightBrowser;
  masker: Masker;
  shots: StepShots;
  actions: Actions;
  differ: SnapshotDiffer;
  /** The runner calls this when a step starts: the next snapshot is sent whole (§8.3.4). */
  stepStarted(jobId: string): void;
  /** The runner calls this on every terminal state (08-4 §26.8 item 5). */
  jobEnded(jobId: string): Promise<void>;
  /** The job's page, when it has a window. */
  page(jobId: string): Page | null;
}

const BLOCKED_STATUS = new Set([403, 429]);

const err = (r: ActionRefusal): ToolOutcome =>
  r.detail ? { kind: 'error', errorKind: r.kind, result: { reason: r.detail } } : { kind: 'error', errorKind: r.kind };
const out = (r: ActionResult): ToolOutcome => (r.ok ? { kind: 'ok', result: r.value } : err(r));

const ref = z.string().min(1).max(32);
const ARGS = {
  open: z.object({ url: z.string().min(1).max(4096) }).strict(),
  snapshot: z.object({ scope: z.enum(['page', 'form']).optional() }).strict(),
  click: z.object({ ref }).strict(),
  type: z.object({ ref, text: z.string().max(4000) }).strict(),
  select: z.object({ ref, value: z.string().min(1).max(500) }).strict(),
  check: z.object({ ref, value: z.boolean().optional() }).strict(),
  press: z.object({ key: z.string().min(1).max(40), ref: ref.optional() }).strict(),
  scroll: z.object({ ref: ref.optional(), value: z.enum(['up', 'down']).optional() }).strict(),
  back: z.object({}).strict(),
  wait: z.object({ ms: z.number().int().min(0).max(15_000).optional() }).strict(),
  screenshot: z.object({}).strict(),
  download: z.object({ ref }).strict(),
};

function loadMatchers(resourcesDir: string): { handback: HostMatcher; noCapture: HostMatcher } {
  const read = (f: string) => JSON.parse(readFileSync(join(resourcesDir, f), 'utf8')) as unknown;
  return {
    handback: createHandback(handbackSitesSchema.parse(read('handback-sites.json'))),
    noCapture: createNoCapture(hostListSchema.parse(read('no-capture-hosts.json'))),
  };
}

export function createBrowserTools(d: BrowserToolsDeps): { registry: ToolRegistry; runtime: BrowserRuntime } {
  let matchers: { handback: HostMatcher; noCapture: HostMatcher } | null = null;
  const m = () => (matchers ??= loadMatchers(d.resourcesDir));
  const handback = (url: string) => m().handback.check(url);
  const paused = (jobId: string) => d.captureGuard?.paused(jobId) ?? false;
  const allowHosts = allowHostsFrom(d.env, d.testRun);
  const router = new RefRouter();
  const masker = new Masker();
  const watchdogs = new Watchdogs({ log: d.log, downloadsDir: (jobId) => join(d.dataDir, 'jobs', jobId, 'downloads') });
  const differ = new SnapshotDiffer();
  const browser = new PlaywrightBrowser({
    dataDir: d.dataDir,
    platform: d.platform,
    exists: existsSync,
    ...(d.headless === undefined ? {} : { headless: d.headless }),
    testDebug: d.testRun && d.env.FOO_TEST_BROWSER_DEBUG === '1', // M9 T7
    launch:
      d.launch ??
      (async (dir, options) => {
        const { chromium } = await import('playwright-core');
        return chromium.launchPersistentContext(dir, options);
      }),
    log: d.log,
    onWindow: (win: DriverWindow) => {
      watchdogs.start(win);
      void masker.apply(win.page()).catch(() => undefined);
    },
  });
  const actions = new Actions({
    router,
    watchdogs,
    registryHit: d.registryHit,
    handback: (url) => (url === 'about:blank' ? false : handback(url)),
    paused,
    ...(d.timing ? { timing: d.timing } : {}),
  });
  const shots = new StepShots({
    dataDir: d.dataDir,
    masker,
    get noCaptureHosts() {
      return m().noCapture;
    },
    handback,
    paused,
    screenshotDays: () => d.settings().privacy.screenshotDays,
    now: d.now,
  });
  let snapSeq = 0;

  /** The job's window (opened, and waited for while 3 are open: 08-4 §26.8 item 4). */
  const pageFor = async (ctx: ToolContext): Promise<{ page: Page } | { refused: ToolOutcome }> => {
    const w = await browser.openWindow(ctx.jobId, ctx.signal);
    if (!w.ok) return { refused: { kind: 'error', errorKind: w.error.kind } };
    const win = browser.window(ctx.jobId);
    return win ? { page: win.page() } : { refused: { kind: 'error', errorKind: 'BROWSER_MISSING' } };
  };

  function tool<S extends z.ZodType>(
    name: string,
    actionClass: ToolDef['actionClass'],
    args: string,
    description: string,
    schema: S,
    run: (a: z.infer<S>, page: Page, ctx: ToolContext) => Promise<ToolOutcome>,
  ): ToolDef {
    return {
      name,
      actionClass,
      args,
      description,
      async run(raw, ctx) {
        const a = schema.safeParse(raw ?? {});
        if (!a.success) return { kind: 'error', errorKind: 'VALIDATION' };
        const p = await pageFor(ctx);
        return 'refused' in p ? p.refused : run(a.data as z.infer<S>, p.page, ctx);
      },
    };
  }

  const defs: ToolDef[] = [
    tool('browser.open', 'read', 'url: string', "Open a web page in foo's own browser.", ARGS.open, async (a, page, ctx) => {
      const rule = checkUrl(a.url, { handback: m().handback, allowHosts });
      if (!rule.ok) return { kind: 'error', errorKind: rule.error.kind };
      let status = 0;
      let failed: string | null = null;
      const miss = await actions.settled(ctx.jobId, page, async () => {
        const res = await page.goto(a.url, { waitUntil: 'commit', timeout: 15_000 }).catch((e: unknown) => {
          failed = e instanceof Error ? e.message : String(e);
          return null;
        });
        status = res?.status() ?? 0;
      });
      // The page never arrived (offline, no such host, refused, 15 s): never an `ok` on the old page, never URL_NOT_ALLOWED for
      // Chromium's own error page.
      if (failed !== null) {
        await page.goto('about:blank').catch(() => null);
        return { kind: 'error', errorKind: /ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED/.test(failed) ? 'NET_OFFLINE' : 'SITE_TIMEOUT' };
      }
      // Redirects are checked again where they landed: a hand-back or private address is left at once.
      const landed = checkUrl(page.url(), { handback: m().handback, allowHosts });
      if (!landed.ok) {
        await page.goto('about:blank').catch(() => null);
        return { kind: 'error', errorKind: landed.error.kind };
      }
      if (miss) return err(miss);
      if (BLOCKED_STATUS.has(status)) return { kind: 'error', errorKind: 'SITE_BLOCKED', result: { status } };
      if (await isChallengePage(page)) return { kind: 'error', errorKind: 'SITE_CAPTCHA' };
      differ.reset(ctx.jobId);
      return { kind: 'ok', result: { url: page.url(), title: await page.title().catch(() => '') } };
    }),
    tool(
      'browser.snapshot',
      'read',
      'scope?: "page" | "form"',
      'See what is on the page: every control with a number [ref] and the visible text.',
      ARGS.snapshot,
      async (a, page, ctx) => {
        if (paused(ctx.jobId)) return { kind: 'error', errorKind: 'VALIDATION', result: { reason: 'sign_in_in_front' } };
        if (page.url() !== 'about:blank' && handback(page.url())) return { kind: 'error', errorKind: 'SITE_HANDBACK' };
        const s = await takeSnapshot(page, router);
        const view = differ.view(ctx.jobId, s);
        snapSeq += 1;
        const text = snapshotText(s, view, { scrub: d.scrub, ref: `snap-${snapSeq}`, ...(a.scope ? { scope: a.scope } : {}) });
        const picture = needsScreenshot(s) ? await shots.capture(ctx.jobId, page, 'snap') : null;
        return { kind: 'ok', result: { snapshot: text, elements: s.elements.length, ...(picture ? { screenshot: picture } : {}) } };
      },
    ),
    tool(
      'browser.click',
      'read',
      'ref: string',
      'Click a control by its [ref]. Buttons that pay, book, send or confirm are refused; use request_approval for those.',
      ARGS.click,
      async (a, page, ctx) => out(await actions.click(ctx.jobId, page, a.ref)),
    ),
    tool(
      'browser.type',
      'prepare',
      'ref: string, text: string',
      'Type text into a field by [ref]. Never passwords, card numbers or codes.',
      ARGS.type,
      async (a, page, ctx) => out(await actions.type(ctx.jobId, page, a.ref, a.text)),
    ),
    tool(
      'browser.select',
      'prepare',
      'ref: string, value: string',
      'Choose an option in a list by [ref].',
      ARGS.select,
      async (a, page, ctx) => out(await actions.select(ctx.jobId, page, a.ref, a.value)),
    ),
    tool('browser.check', 'prepare', 'ref: string, value?: boolean', 'Tick or untick a box by [ref].', ARGS.check, async (a, page, ctx) =>
      out(await actions.check(ctx.jobId, page, a.ref, a.value ?? true)),
    ),
    tool('browser.press', 'prepare', 'key: string, ref?: string', 'Press a key on the page.', ARGS.press, async (a, page, ctx) =>
      out(await actions.press(ctx.jobId, page, a.key, a.ref ?? null)),
    ),
    tool(
      'browser.scroll',
      'prepare',
      'ref?: string, value?: "up" | "down"',
      'Scroll the page or a part of it.',
      ARGS.scroll,
      async (a, page, ctx) => out(await actions.scroll(ctx.jobId, page, a.ref ?? null, a.value ?? 'down')),
    ),
    tool('browser.back', 'prepare', '', 'Go back one page.', ARGS.back, async (_a, page, ctx) => out(await actions.back(ctx.jobId, page))),
    tool('browser.wait', 'prepare', 'ms?: number ≤ 15000', 'Wait up to 15 seconds for the page.', ARGS.wait, async (a, page, ctx) => {
      if (a.ms !== undefined) return out(await actions.wait(page, a.ms));
      const miss = await actions.settled(ctx.jobId, page, async () => undefined);
      return miss ? err(miss) : { kind: 'ok', result: { url: page.url() } };
    }),
    tool(
      'browser.screenshot',
      'read',
      '',
      'Get a picture of the page. Sensitive fields are hidden.',
      ARGS.screenshot,
      async (_a, page, ctx) => {
        const path = await shots.capture(ctx.jobId, page, 'shot');
        return path
          ? { kind: 'ok', result: { screenshot: path } }
          : { kind: 'ok', result: { screenshot: null, reason: 'not_allowed_here' } };
      },
    ),
    tool('browser.download', 'read', 'ref: string', 'Download the file behind a link.', ARGS.download, async (a, page, ctx) =>
      out(await actions.download(ctx.jobId, page, a.ref)),
    ),
  ];

  const runtime: BrowserRuntime = {
    browser,
    masker,
    shots,
    actions,
    differ,
    stepStarted: (jobId) => differ.reset(jobId),
    async jobEnded(jobId) {
      differ.reset(jobId);
      actions.forget(jobId);
      watchdogs.forget(jobId);
      await browser.closeWindow(jobId);
    },
    page: (jobId) => browser.window(jobId)?.page() ?? null,
  };
  return { registry: Object.fromEntries(defs.map((t) => [t.name, t])), runtime };
}

/** Engine.ts: the browser tools over the engine's options and Redactor, and the runtime the Engine ends jobs and quits through. */
export function engineBrowserTools(o: {
  dataDir: string;
  resourcesDir: string;
  env: Record<string, string | undefined>;
  testRun: boolean;
  clock: { now(): number };
  redactor: { scrub(text: string): { text: string }; registry: { forms(): { form: string }[] } };
  settings(): Settings;
  log(evt: string, kind?: string): void;
  /** M9 T7: the sign-in lanes' pause (08-2 §8.3.3). */
  captureGuard?: CaptureGuard;
}): { registry: ToolRegistry; runtime: BrowserRuntime } {
  return createBrowserTools({
    dataDir: o.dataDir,
    resourcesDir: o.resourcesDir,
    platform: process.platform,
    env: o.env,
    testRun: o.testRun,
    scrub: (text) => o.redactor.scrub(text).text,
    registryHit: (text) => o.redactor.registry.forms().some((f) => text.includes(f.form)),
    settings: o.settings,
    now: () => o.clock.now(),
    log: o.log,
    ...(o.captureGuard ? { captureGuard: o.captureGuard } : {}),
  });
}
