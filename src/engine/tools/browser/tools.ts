// Spec: 08-2 §8.2 (the tool catalogue is the only list, X-137: the read/prepare `browser.*` tools with their args and classes),
// §9.2 (classes: open, snapshot, click (non-commit), screenshot, download are `read`; type, select, check, press, scroll, back,
// wait are `prepare`), 08-4 §27.1 (descriptions shown to the AI, exact; `{args}` printed `name: type`, optional `?`, limits `≤ n`;
// `browser.submit`, `browser.fillCard` are engine-only and never listed), §8.3 (Edge window per job, masked snapshot, checked
// actions, watchdogs, step screenshots), §8.3.10 (hand-back sites), 08-4 §27.6 (FOO_TEST_ALLOW_HOSTS). CR-0008 G-M4-05: M9's
// browser plugs into M4's ToolLayer here. Not here: `browser.fillSecret` (needs the M5 vault; T7), `browser.fillPersonal` (needs
// M6 memory), `screen.open` (screen/screen.ts; needs a main opener).
// M9 T8: `browser.submit` (submit.ts; engine-only, reached through ToolLayer.executeApproved, never listed to the AI).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from 'playwright-core';
import { z } from 'zod';
import { createHandback, createNoCapture, handbackSitesSchema, hostListSchema, type HostMatcher } from '../../../shared/handback';
import type { Settings } from '../../../shared/settings';
import type { ToolContext, ToolDef, ToolOutcome, ToolRegistry } from '../ToolLayer';
import { Actions, type ActionRefusal, type ActionResult } from './actions';
import { PlaywrightBrowser, allowHostsFrom, checkUrl, testBrowserArgs, type DriverWindow, type LaunchOptions } from './browser';
import { Masker } from './masker';
import { RefRouter, SnapshotDiffer, needsScreenshot, snapshotText, takeSnapshot } from './snapshot';
import { StepShots } from './stepShots';
import { createSubmitTool } from './submit'; // M9 T8
import { readLiveTerms, type LiveRead } from './readLiveTerms'; // M9 T8
import type { ApprovalDraft } from '../../../shared/types';
import type { CaptureGuard } from './types';
import { Watchdogs, isChallengePage } from './watchdogs';
import { RecipeRecorder } from './recipes/recipe'; // M9 T8

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
  /** M9 T8: tests shorten the outcome watch after `browser.submit` (08-2 §10.4: 120 s, every 2 s, waits 5 min). */
  submitTiming?: { maxMs?: number; pollMs?: number; waitMaxMs?: number };
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
  // M9 T8
  /** `handback.check(url)` over the shipped list (08-4 §27.4). */
  handback(url: string): boolean;
  /** 08-2 §8.3.11: what the job did on the page by role + name (saved as a recipe after DONE with proof) and the replay match. */
  recipes: RecipeRecorder;
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
        // M9 T8: test runs only, the sandbox's names and key (empty otherwise).
        const extra = testBrowserArgs(d.env, d.testRun);
        return chromium.launchPersistentContext(dir, extra.length ? { ...options, args: [...options.args, ...extra] } : options);
      }),
    log: d.log,
    onWindow: (win: DriverWindow) => {
      watchdogs.start(win);
      void masker.apply(win.page()).catch(() => undefined);
    },
  });
  // M9 T8 (08-2 §8.3.11): a successful click, type, select or check is written down by role + name, never its value.
  const recipes = new RecipeRecorder();
  const acted = (jobId: string, tool: string, ref: string, r: ActionResult): ToolOutcome => {
    if (r.ok) recipes.act(jobId, tool, ref);
    return out(r);
  };
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
    before?: (a: z.infer<S>) => ToolOutcome | null,
  ): ToolDef {
    return {
      name,
      actionClass,
      args,
      description,
      async run(raw, ctx) {
        const a = schema.safeParse(raw ?? {});
        if (!a.success) return { kind: 'error', errorKind: 'VALIDATION' };
        // M9 T8: an address the policy refuses never opens a window.
        const refusedEarly = before?.(a.data as z.infer<S>);
        if (refusedEarly) return refusedEarly;
        const p = await pageFor(ctx);
        return 'refused' in p ? p.refused : run(a.data as z.infer<S>, p.page, ctx);
      },
    };
  }

  // M9 T7: the left page's own load can still fail after the first `about:blank` (its error page commits over it), so
  // try once more until the window really is blank.
  const blank = async (page: Page) => {
    for (let i = 0; i < 3; i++) {
      await page.goto('about:blank').catch(() => null);
      await page.waitForTimeout(50).catch(() => null);
      if (page.url() === 'about:blank') return;
    }
  };

  /** A failed `goto` as a short code for the tech log: `net::ERR_…`, `timeout`, `interrupted`, or `other`. */
  const openFailure = (message: string): string =>
    /net::ERR_[A-Z_]+/.exec(message)?.[0] ??
    (/Timeout \d+ms/.test(message) ? 'timeout' : /interrupted by another navigation/.test(message) ? 'interrupted' : 'other');

  const defs: ToolDef[] = [
    tool(
      'browser.open',
      'read',
      'url: string',
      "Open a web page in foo's own browser.",
      ARGS.open,
      async (a, page, ctx) => {
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
          // The reason without the address (08-3 logging carries no URLs): Chromium's net error code, or the 15 s timeout.
          d.log('browser.open_failed', openFailure(failed));
          await blank(page);
          return {
            kind: 'error',
            errorKind: /ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED/.test(failed) ? 'NET_OFFLINE' : 'SITE_TIMEOUT',
          };
        }
        // Redirects are checked again where they landed: a hand-back or private address is left at once.
        const landedUrl = page.url();
        const landed = checkUrl(landedUrl, { handback: m().handback, allowHosts });
        if (!landed.ok) {
          await blank(page);
          // M9 T8: the hand-back card names the page foo was sent to (08-2 §8.3.10).
          return landed.error.kind === 'SITE_HANDBACK'
            ? { kind: 'error', errorKind: 'SITE_HANDBACK', result: { url: landedUrl } }
            : { kind: 'error', errorKind: landed.error.kind };
        }
        if (miss) return err(miss);
        if (BLOCKED_STATUS.has(status)) return { kind: 'error', errorKind: 'SITE_BLOCKED', result: { status } };
        if (await isChallengePage(page)) return { kind: 'error', errorKind: 'SITE_CAPTCHA' };
        differ.reset(ctx.jobId);
        return { kind: 'ok', result: { url: page.url(), title: await page.title().catch(() => '') } };
      },
      // M9 T8 (08-2 §8.3.10): a hand-back or refused address is answered before any window opens.
      (a) => {
        const rule = checkUrl(a.url, { handback: m().handback, allowHosts });
        if (rule.ok) return null;
        return rule.error.kind === 'SITE_HANDBACK'
          ? { kind: 'error', errorKind: 'SITE_HANDBACK', result: { url: a.url } }
          : { kind: 'error', errorKind: rule.error.kind };
      },
    ),
    tool(
      'browser.snapshot',
      'read',
      'scope?: "page" | "form"',
      'See what is on the page: every control with a number [ref] and the visible text.',
      ARGS.snapshot,
      async (a, page, ctx) => {
        if (paused(ctx.jobId)) return { kind: 'error', errorKind: 'VALIDATION', result: { reason: 'sign_in_in_front' } };
        if (page.url() !== 'about:blank' && handback(page.url())) return { kind: 'error', errorKind: 'SITE_HANDBACK' };
        // 08-2 §8.3.5: the challenge watchdog runs for every job page, also one that turned into a bot check after open (a
        // slow page, or a site that puts one up later); its text never reaches the AI as something to work on (§8.4).
        if (await isChallengePage(page)) return { kind: 'error', errorKind: 'SITE_CAPTCHA' };
        const s = await takeSnapshot(page, router);
        recipes.seen(ctx.jobId, s.url, s.elements); // M9 T8
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
      async (a, page, ctx) => acted(ctx.jobId, 'browser.click', a.ref, await actions.click(ctx.jobId, page, a.ref)),
    ),
    tool(
      'browser.type',
      'prepare',
      'ref: string, text: string',
      'Type text into a field by [ref]. Never passwords, card numbers or codes.',
      ARGS.type,
      async (a, page, ctx) => acted(ctx.jobId, 'browser.type', a.ref, await actions.type(ctx.jobId, page, a.ref, a.text)),
    ),
    tool(
      'browser.select',
      'prepare',
      'ref: string, value: string',
      'Choose an option in a list by [ref].',
      ARGS.select,
      async (a, page, ctx) => acted(ctx.jobId, 'browser.select', a.ref, await actions.select(ctx.jobId, page, a.ref, a.value)),
    ),
    tool('browser.check', 'prepare', 'ref: string, value?: boolean', 'Tick or untick a box by [ref].', ARGS.check, async (a, page, ctx) =>
      acted(ctx.jobId, 'browser.check', a.ref, await actions.check(ctx.jobId, page, a.ref, a.value ?? true)),
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
      // 08-2 §8.3.5: a page that settles into a challenge after the wait is the watchdog's, never the AI's.
      if (a.ms !== undefined) {
        const r = await actions.wait(page, a.ms);
        return !paused(ctx.jobId) && (await isChallengePage(page)) ? { kind: 'error', errorKind: 'SITE_CAPTCHA' } : out(r);
      }
      const miss = await actions.settled(ctx.jobId, page, async () => undefined);
      if (miss) return err(miss);
      return !paused(ctx.jobId) && (await isChallengePage(page))
        ? { kind: 'error', errorKind: 'SITE_CAPTCHA' }
        : { kind: 'ok', result: { url: page.url() } };
    }),
    tool(
      'browser.screenshot',
      'read',
      '',
      'Get a picture of the page. Sensitive fields are hidden.',
      ARGS.screenshot,
      async (_a, page, ctx) => {
        // Not while a sign-in page is in front (§8.3.3): the page is the person's then.
        if (!paused(ctx.jobId) && (await isChallengePage(page))) return { kind: 'error', errorKind: 'SITE_CAPTCHA' };
        const path = await shots.capture(ctx.jobId, page, 'shot');
        return path
          ? { kind: 'ok', result: { screenshot: path } }
          : { kind: 'ok', result: { screenshot: null, reason: 'not_allowed_here' } };
      },
    ),
    tool('browser.download', 'read', 'ref: string', 'Download the file behind a link.', ARGS.download, async (a, page, ctx) =>
      out(await actions.download(ctx.jobId, page, a.ref)),
    ),
    // M9 T8
    createSubmitTool({
      actions,
      shots,
      page: (jobId) => browser.window(jobId)?.page() ?? null,
      now: () => Date.now(),
      handback: (url) => url !== 'about:blank' && handback(url),
      ...(d.submitTiming ? { timing: d.submitTiming } : {}),
    }),
  ];

  const runtime: BrowserRuntime = {
    recipes, // M9 T8
    browser,
    masker,
    shots,
    actions,
    differ,
    stepStarted: (jobId) => differ.reset(jobId),
    async jobEnded(jobId) {
      differ.reset(jobId);
      recipes.forget(jobId); // M9 T8
      actions.forget(jobId);
      watchdogs.forget(jobId);
      await browser.closeWindow(jobId);
    },
    page: (jobId) => browser.window(jobId)?.page() ?? null,
    handback, // M9 T8
  };
  return { registry: Object.fromEntries(defs.map((t) => [t.name, t])), runtime };
}

/** M9 T8: the runner's live-terms read (08-2 §9.4.2) on the job's page. */
export function liveTermsReader(rt: BrowserRuntime): (jobId: string, draft: ApprovalDraft) => Promise<LiveRead> {
  return (jobId, draft) => readLiveTerms(rt.page(jobId), draft, { handback: (url) => rt.handback(url) });
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
