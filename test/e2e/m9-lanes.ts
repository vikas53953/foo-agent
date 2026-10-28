// Shared steps for the M9 T7 e2e runs (08-2 §8.4 sign-in lanes, 06-3 §11.2 take over): the T2 sign-in and CAPTCHA sites on
// 127.0.0.1 / localhost, the app with the fake AI (08-3 §22.3), and a CDP connection to foo's own browser (FOO_TEST runs with
// FOO_TEST_BROWSER_DEBUG=1 only) so the test can stand in for the person: type on the sign-in page, solve the puzzle, close
// the window. The test never types through foo, and foo's AI never sees what the person types.
import { chromium, expect, type Browser, type ElectronApplication, type Page } from '@playwright/test';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { TID } from '../../src/shared/testids';
import { byTid, openChat, openWorld, rest, settle } from '../fidelity/capture';
import { serveLaneSites, type LaneSites } from '../integration/browser/laneSites';
import { fakeTurns, type FakeLine } from './fakeAi';
import { launch, testDirs } from './launch';
import { typeInComposer } from './typeInComposer';

export const act = (decision: Record<string, unknown>) => `<say></say><act>${JSON.stringify({ decision, usedMemoryIds: [] })}</act>`;
export const tool = (name: string, args: Record<string, unknown>): FakeLine => ({
  match: { purpose: 'step' },
  reply: act({ kind: 'tool', call: { tool: name, args }, why: 'next' }),
});
export const done = (result: string): FakeLine => ({ match: { purpose: 'step' }, reply: act({ kind: 'done', result, unverified: true }) });

/** The intake that makes a one-step browser job. */
export const browserJob = (ask: string, title: string): FakeLine[] => [
  { match: { purpose: 'verify' }, reply: 'ready', once: false },
  {
    match: { purpose: 'intake', promptIncludes: ask },
    reply: act({
      kind: 'job',
      title,
      plan: [{ phraseKey: 'check_site', slots: { site: 'the site' }, route: 'browser' }],
      estimate: { minutes: 1 },
      routeHint: ['browser'],
      needsApps: [],
    }),
  },
];

export interface LaneRun {
  app: ElectronApplication;
  page: Page;
  sites: LaneSites;
  dirs: ReturnType<typeof testDirs>;
  /** Sends the ask in the Home chat. */
  ask(text: string): Promise<void>;
  /** Moves the fake clock in 500 ms steps until `cond` holds (the 1 s sign-in poll runs on it). */
  until(cond: () => Promise<boolean>, what: string, steps?: number): Promise<void>;
  /** foo's own browser, as the person sees it, and the job's page on `host`. */
  person(host: string): Promise<Page>;
  /** The fake AI's turns since the warm-up job ended (all of them without `warm`). */
  turns(): { purpose: string; prompt: string }[];
  /** With `warm`: ms from the warm-up ask to the site seeing foo's browser's first request (unset when it never arrived). */
  coldOpenMs?: number;
  close(): Promise<void>;
}

/** The warm-up job (laneRun): its own intake and two steps. They are the script's first lines and each is used once, so the
 * warm-up job's steps (the first steps of the run) take them and the test's job gets its own. */
const WARM_ASK = 'open the warm-up page';
const WARM_TITLE = 'Warm-up page';
const warmLines = (sites: LaneSites): FakeLine[] => [
  { match: { purpose: 'verify' }, reply: 'ready', once: false },
  {
    match: { purpose: 'intake', promptIncludes: WARM_ASK },
    reply: act({
      kind: 'job',
      title: WARM_TITLE,
      plan: [{ phraseKey: 'check_site', slots: { site: 'the site' }, route: 'browser' }],
      estimate: { minutes: 1 },
      routeHint: ['browser'],
      needsApps: [],
    }),
  },
  tool('browser.open', { url: sites.signin('/warm') }),
  done('Warmed up.'),
];
/** The 1-based script lines of the warm-up job's two steps. */
const WARM_STEPS = [3, 4];

/**
 * `warm` (default): before the test's ask, a warm-up job in the Money chat opens one page in foo's browser. Each run starts a
 * fresh browser profile, and on windows-latest its first page has taken longer than browser.open's 15 s (08-2 §8.3.5), so
 * the test's own open failed with SITE_TIMEOUT and the next step met a blank page ("this site wants you to sign in",
 * UX-14-01; UX-14-09). `coldOpenMs` is that first page's time, from the ask to the site seeing the request. The cold time
 * itself is measured, never hidden, by m9-cold-open.spec.ts.
 */
export async function laneRun(script: (sites: LaneSites) => FakeLine[], o: { warm?: boolean } = {}): Promise<LaneRun> {
  const warm = o.warm ?? true;
  const sites = await serveLaneSites();
  const dirs = testDirs();
  const file = join(dirname(dirs.FOO_DATA_DIR), 'fake-ai.jsonl');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, [...(warm ? warmLines(sites) : []), ...script(sites)].map((l) => JSON.stringify(l)).join('\n') + '\n');
  const app = await launch(dirs, [], {
    FOO_FAKE_AI: file,
    FOO_TEST_ALLOW_HOSTS: '127.0.0.1,localhost',
    FOO_TEST_BROWSER_DEBUG: '1',
  });
  const page = await app.firstWindow();
  await openWorld(app, page);
  let cdp: Browser | null = null;
  let warmTurns = 0;
  const run: LaneRun = {
    app,
    page,
    sites,
    dirs,
    async ask(text) {
      await typeInComposer(page, text);
      await page.keyboard.press('Enter');
    },
    async until(cond, what, steps = 400) {
      for (let i = 0; i < steps; i++) {
        if (await cond()) return;
        await page.evaluate(() => window.__fooTest!.clock.advance(500));
        await page.waitForTimeout(100);
      }
      const turns = fakeTurns(dirs);
      const seen = turns.map((t) => `${t.purpose}:${t.matchedLine}`);
      // Each step prompt's "Last observation" is the tool result the AI was shown, so a run that went another way says why.
      const observed = turns
        .filter((t) => t.purpose === 'step' && t.prompt.includes('Last observation'))
        .map((t) => t.prompt.slice(t.prompt.indexOf('Last observation')).split('\n').slice(0, 2).join(' ').slice(0, 300));
      // And the engine's browser and sign-in log lines (codes only, never an address).
      const logDir = join(dirs.FOO_DATA_DIR, 'logs');
      const engine = existsSync(logDir)
        ? readdirSync(logDir)
            .flatMap((f) => readFileSync(join(logDir, f), 'utf8').split('\n'))
            .filter((l) => /"evt":"(browser|signin)\./.test(l))
        : [];
      throw new Error(
        `never: ${what} (fake AI turns ${seen.join()}; sites on [::1]: ${sites.ipv6}, ports skipped: ${sites.v6Collisions}; requests: ${sites.requests.map((r) => `${r.ms}ms ${r.host} ${r.family} ${r.path}`).join(', ') || 'none'})${[...observed, ...engine].map((o) => `\n  ${o}`).join('')}`,
      );
    },
    async person(host) {
      if (!cdp) {
        const portFile = join(dirs.FOO_DATA_DIR, 'browser', 'profile', 'DevToolsActivePort');
        await expect.poll(() => existsSync(portFile), { timeout: 20_000 }).toBe(true);
        const port = readFileSync(portFile, 'utf8').split('\n')[0]!.trim();
        cdp = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
      }
      let found: Page | undefined;
      await expect
        .poll(
          () => {
            found = cdp!
              .contexts()
              .flatMap((c) => c.pages())
              .find((p) => p.url().includes(host));
            return !!found;
          },
          { timeout: 20_000 },
        )
        .toBe(true);
      return found!;
    },
    turns: () => fakeTurns(dirs).slice(warmTurns),
    async close() {
      await cdp?.close().catch(() => undefined);
      await app.close();
      await sites.close();
    },
  };
  if (warm) {
    await openChat(page, 'Money');
    const askedAt = Date.now() - sites.started;
    await run.ask(WARM_ASK);
    const go = page.getByTestId(TID.cardPlanGo);
    const seen = () => sites.requests.find((r) => r.path === '/warm');
    const warmed = () => WARM_STEPS.every((n) => fakeTurns(dirs).some((t) => t.matchedLine === n));
    // Done when both warm-up steps ran, whether or not the page arrived: a first page past 15 s ends the warm-up with
    // SITE_TIMEOUT, and the test's own page then meets a browser that is up.
    await run.until(async () => {
      if (!warmed() && (await go.count()))
        await go
          .last()
          .click()
          .catch(() => undefined);
      return warmed();
    }, 'the warm-up job runs both its steps');
    const first = seen();
    if (first) run.coldOpenMs = first.ms - askedAt;
    warmTurns = fakeTurns(dirs).length;
  }
  // Home has no live job, so the ask makes a new one (the seeded "Goa stay" in foo's chat would take it as a steer).
  await openChat(page, 'Home');
  await rest(page);
  await settle(page);
  return run;
}

/** The job checklist posts 1.5 s of fake time after the job starts (CHECKLIST_AFTER_MS). With the browser warm (the warm-up
 * above) a job can reach a held step or a Sign-in card before the clock has moved that far, so move it on until the
 * checklist is up: at most 5 s, far short of any hold or sign-in timeout. */
export const checklistUp = (run: LaneRun, title?: string): Promise<void> =>
  run.until(
    async () => {
      const all = run.page.getByTestId(TID.threadLog).locator(byTid(TID.cardChecklist));
      return (await (title ? all.filter({ hasText: title }) : all).count()) > 0;
    },
    'the checklist is up',
    10,
  );

/** The newest Sign-in card in the open chat. */
export const signinCard = (page: Page) => page.locator(byTid(TID.cardSignin)).last();

/** A foo / helper bubble with this text. */
export const fooSaid = (page: Page, text: string) =>
  page
    .getByTestId(TID.threadLog)
    .locator(`${byTid(TID.bubbleFoo)}, ${byTid(TID.bubbleHelper)}`, { hasText: text })
    .first();

/** The docked banner window, when main opened it (09 §9.27.3). */
export async function bannerWindow(app: ElectronApplication): Promise<Page | null> {
  return app.windows().find((w) => w.url().includes('signin-banner')) ?? null;
}
