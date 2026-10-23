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
  turns(): { purpose: string; prompt: string }[];
  close(): Promise<void>;
}

export async function laneRun(script: (sites: LaneSites) => FakeLine[]): Promise<LaneRun> {
  const sites = await serveLaneSites();
  const dirs = testDirs();
  const file = join(dirname(dirs.FOO_DATA_DIR), 'fake-ai.jsonl');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    script(sites)
      .map((l) => JSON.stringify(l))
      .join('\n') + '\n',
  );
  const app = await launch(dirs, [], {
    FOO_FAKE_AI: file,
    FOO_TEST_ALLOW_HOSTS: '127.0.0.1,localhost',
    FOO_TEST_BROWSER_DEBUG: '1',
  });
  const page = await app.firstWindow();
  await openWorld(app, page);
  // Home has no live job, so the ask makes a new one (the seeded "Goa stay" in foo's chat would take it as a steer).
  await openChat(page, 'Home');
  await rest(page);
  await settle(page);
  let cdp: Browser | null = null;
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
        `never: ${what} (fake AI turns ${seen.join()}; sites on [::1]: ${sites.ipv6}, ports skipped: ${sites.v6Collisions})${[...observed, ...engine].map((o) => `\n  ${o}`).join('')}`,
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
    turns: () => fakeTurns(dirs),
    async close() {
      await cdp?.close().catch(() => undefined);
      await app.close();
      await sites.close();
    },
  };
  return run;
}

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
