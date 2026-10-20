// Spec: 06-3 §11.2 (the Watch live window), 09 §9.27.1–§9.27.3 (live.html, the docked sign-in banner), 08-3 §22.3 (fakes
// only). Shared start for the M9 close-out captures (test/fidelity/ux/UX-15.live.spec.ts, test/fidelity/bp/BP-screens-m9.spec.ts):
// the same world as test/e2e/m9-live.spec.ts (ux-world seed, the fake AI, FOO_FAKE_BROWSER frames that are masked at source),
// plus the other windows' theme and the banner opened the way the sign-in lanes open it (main's `signinBanners()`, a fixed
// Edge rectangle; there is no Edge in the container).
import type { ElectronApplication, Page } from '@playwright/test';
import Database from 'better-sqlite3';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { TID } from '../../src/shared/testids';
import { openChat, openWorld, settle, setTheme, windowSize, type Theme } from '../fidelity/capture';
import { fakeTurns, VERIFY_OK, type FakeLine } from './fakeAi';
import { launch, testDirs } from './launch';
import { jobState } from './m4-start';

const FRAMES = resolve(__dirname, '..', 'fixtures', 'live-frames');

export interface LiveWorld {
  app: ElectronApplication;
  page: Page;
  refs: Record<string, string>;
  /** The run's foo.db, read-only (WAL readers see each commit). */
  db(): Database.Database;
  close(): Promise<void>;
}

/** The m9-live world at `at` (main window 1280 × 800), with the engine up (the fake answered a verify). */
export async function startLive(
  at = '2026-10-16T09:41:00+05:30',
  lines: FakeLine[] = [VERIFY_OK],
  env: Record<string, string> = {},
): Promise<LiveWorld> {
  const dirs = testDirs();
  const script = join(dirname(dirs.FOO_DATA_DIR), 'fake-ai.jsonl');
  mkdirSync(dirname(script), { recursive: true });
  writeFileSync(script, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  // Its own Electron userData on Linux (the single-instance lock lives there), so parallel local runs never collide.
  const xdg = { XDG_CONFIG_HOME: join(dirname(dirs.FOO_DATA_DIR), 'config') };
  const app = await launch(dirs, [], { FOO_FAKE_AI: script, FOO_FAKE_BROWSER: FRAMES, ...xdg, ...env });
  const page = await app.firstWindow();
  const refs = await openWorld(app, page, at);
  await windowSize(app, page, 1280, 800);
  for (let i = 0; i < 50 && !fakeTurns(dirs).some((x) => x.purpose === 'verify'); i++) {
    await page.evaluate(() => window.foo.invoke('ai:verify', { providerId: 'fake' }));
    await page.waitForTimeout(200);
  }
  let db: Database.Database | null = null;
  return {
    app,
    page,
    refs,
    db: () => (db ??= new Database(join(dirs.FOO_DATA_DIR, 'data', 'foo.db'), { readonly: true, fileMustExist: true })),
    async close() {
      db?.close();
      await app.close();
    },
  };
}

/** Sets the job working, opens its chat and taps Watch live in the header; the live window's page. */
export async function openLive(app: ElectronApplication, page: Page, jobId: string, chat = 'foo'): Promise<Page> {
  await jobState(page, jobId, 'working');
  await openChat(page, chat);
  const opened = app.waitForEvent('window', (w) => w.url().includes('/windows/live.html'));
  await page.getByTestId(TID.chatHeaderWatchLive).click();
  const live = await opened;
  await live.getByTestId(TID.liveRoot).waitFor();
  return live;
}

/** Sizes another window's content (by its page URL) and waits until its page has that size. */
export async function sizeWindow(app: ElectronApplication, win: Page, part: string, width: number, height: number): Promise<void> {
  await app.evaluate(
    ({ BrowserWindow }, [p, w, h]) =>
      BrowserWindow.getAllWindows()
        .find((x) => x.webContents.getURL().includes(p as string))!
        .setContentSize(w as number, h as number),
    [part, width, height] as const,
  );
  await win.waitForFunction(([w, h]) => window.innerWidth === w && window.innerHeight === h, [width, height]);
}

/** main → live window `live:state`, as main sends it (the engine side of take over is T7's). */
export const sendLiveState = (app: ElectronApplication, jobId: string, state: string) =>
  app.evaluate(
    ({ BrowserWindow }, [id, s]) =>
      BrowserWindow.getAllWindows()
        .find((x) => x.webContents.getURL().includes('/windows/live.html'))!
        .webContents.send('live:state', { jobId: id, state: s }),
    [jobId, state] as const,
  );

/**
 * The theme for the main window and another window: the test channel switches nativeTheme (every window follows it on
 * Windows); Linux has no desktop theme bridge, so the other page's colour scheme is emulated too, as setTheme does.
 */
export async function setThemeBoth(page: Page, other: Page, theme: Theme): Promise<void> {
  await setTheme(page, theme);
  if (process.platform !== 'win32') await other.emulateMedia({ colorScheme: theme });
  await other.waitForFunction((t) => document.documentElement.dataset.theme === t, theme);
  await other.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
  await settle(other);
}

/** A fixed Edge rectangle (09 §9.27.3 docks the banner under Edge's toolbar at Edge's width). */
export const EDGE = { x: 80, y: 60, width: 1100, height: 700, chromeTop: 84, minimised: false };

/** Opens a banner through main's SigninBanners, as the sign-in lanes call it (the journey test/verify/m9-t6-signin does the same). */
export async function openBanner(
  app: ElectronApplication,
  a: { jobId: string; mode: 'sign_in_here' | 'take_over'; url: string },
): Promise<Page> {
  await app.evaluate(
    (_e, [arg, edge, file]) => {
      const m = (process as unknown as { mainModule: NodeJS.Module }).mainModule.require(file) as {
        signinBanners(): { open(x: unknown): void } | null;
      };
      // No arrow here: tsx's keepNames would wrap it in a __name() call main does not have.
      m.signinBanners()!.open({ jobId: arg.jobId, mode: arg.mode, url: arg.url, readBounds: Promise.resolve.bind(Promise, edge) });
    },
    [a, EDGE, resolve('out/main/main/jobs/signinIpc.js')] as const,
  );
  for (let i = 0; i < 50; i++) {
    const p = app.windows().find((w) => w.url().includes('signin-banner.html'));
    if (p) {
      await p.getByTestId(TID.signinBanner).waitFor();
      return p;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('the sign-in banner window did not open');
}
