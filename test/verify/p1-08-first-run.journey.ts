// Spec: 06-1 §1.3 / §1.4 (splash: the 96px face above the wordmark wakes once, "Getting things ready…" after 3.0 s, hands
// over to the shell), §2.2 + 02-2 §F17.6 (the AI finder: app logos on white tiles, rows tested live), CR-0021 pick 9 and
// §F7.1 First run (X-179), 10-2 §C.8 AT-313 / AT-314. foo-verify journey for P1 T8 with FOO_TEST_FIRST_RUN=1: the splash
// held on screen (main answers app:getBootstrap when the journey says so), its face waking then resting and the Slow line,
// then the finder with logos, the striped pill and a live row test (Testing… shimmers → ✓ works). Run:
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/p1-08-first-run.journey.ts
import type { Verify } from '../../scripts/foo-verify';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { aiHome } from '../e2e/ai-step-world';
import { advance } from '../e2e/m8-drafts-world';
import { byTid, setTheme, settle, windowSize } from '../fidelity/capture';

export default async function journey(v: Verify): Promise<void> {
  const { app, page } = await v.launch({
    fakeAi: [{ match: { purpose: 'verify' }, reply: 'ready', once: false, delayMs: 2_000 }],
    env: { FOO_TEST_FIRST_RUN: '1', FOO_TEST_AI_HOME: aiHome(['claude', 'codex']) },
  });
  await page.getByTestId(TID.titlebarStrip).waitFor();
  await windowSize(app, page, 1280, 800);
  await setTheme(page, 'light');
  await page.evaluate(() => window.foo.invoke('settings:set', { path: 'appearance.animations', value: 'full' }));

  // Hold the bootstrap answer and reload, so the splash stays up long enough to look at.
  await app.evaluate(({ ipcMain }) => {
    type Handler = (...a: unknown[]) => unknown;
    const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, Handler> })._invokeHandlers;
    const g = globalThis as { __fooBoot?: Handler; __fooRelease?: (() => void)[] };
    g.__fooBoot = handlers.get('app:getBootstrap')!;
    g.__fooRelease = [];
    handlers.set('app:getBootstrap', (...a: unknown[]) => new Promise((done) => g.__fooRelease!.push(() => done(g.__fooBoot!(...a)))));
  });
  await page.reload();
  const face = page.getByTestId(TID.splashFace);
  await face.waitFor();
  const eyes = () =>
    face.locator('[data-part="eyes"] rect').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
  const first = await eyes();
  v.note(
    `splash face ${await face.getAttribute('data-state')} at ${Math.round((await face.boundingBox())!.width)}px, eye heights ${first.join('/')}px (opening from a line)`,
  );
  await v.shot('splash-waking');
  await page.locator(`${byTid(TID.splashFace)}[data-state="resting"]`).waitFor();
  v.note(
    `then ${await face.getAttribute('data-state')}, eye heights ${(await eyes()).join('/')}px; status line "${await page.getByTestId(TID.screenSplashStatus).innerText()}"`,
  );
  await page
    .getByTestId(TID.screenSplashStatus)
    .filter({ hasText: t('app.splash.loading') })
    .waitFor({ timeout: 5_000 });
  v.note(`after 3 s: "${await page.getByTestId(TID.screenSplashStatus).innerText()}"`);
  await settle(page);
  await v.shot('splash-slow');
  await app.evaluate(({ ipcMain }) => {
    const g = globalThis as { __fooBoot?: unknown; __fooRelease?: (() => void)[] };
    (ipcMain as unknown as { _invokeHandlers: Map<string, unknown> })._invokeHandlers.set('app:getBootstrap', g.__fooBoot);
    g.__fooRelease!.splice(0).forEach((go) => go());
  });
  await page.getByTestId(TID.screenSplash).waitFor({ state: 'detached' });
  v.note('bootstrap answered → the splash fades out and the shell is underneath');

  // The finder: logos, the pill and a live test.
  const finder = page.locator(`[data-testid="${TID.cardSetup}"][data-row-id="ai_finder"]`).last();
  const claude = finder.locator(`[data-testid="${TID.setupAiRow}"][data-row-id="claude-cli"]`);
  await claude.and(page.locator('[data-state="testing"]')).waitFor({ timeout: 15_000 });
  const logos = await finder
    .locator('[data-logo]')
    .evaluateAll((els) => els.map((el) => `${el.getAttribute('data-logo')}:${getComputedStyle(el).backgroundColor}`));
  v.note(`row tiles ${logos.join(', ')}`);
  const pill = finder.getByTestId(TID.setupProgress);
  v.note(
    `pill ${await pill.getAttribute('aria-label')} (${await pill.getAttribute('aria-valuenow')}/${await pill.getAttribute('aria-valuemax')})`,
  );
  v.note(`Claude row while testing: "${await claude.innerText()}" shimmer=${await claude.locator('[data-shimmer]').count()}`);
  await v.shot('finder-testing', byTid(TID.cardSetup));
  await advance(page, 2_500);
  await claude.and(page.locator('[data-state="works"]')).waitFor({ timeout: 15_000 });
  v.note(`then: "${(await claude.innerText()).replace(/\s+/g, ' ')}"`);
  await settle(page);
  await v.shot('finder-works', byTid(TID.cardSetup));
  await setTheme(page, 'dark');
  await settle(page);
  await v.shot('finder-works-dark', byTid(TID.cardSetup));
}
