// Spec: 11-fidelity §11.2.4 (Tier R app side), 06-3 §11.1–§11.2 (BP-SCR-13 Watch live: foo's live window, live.html, a
// masked picture of foo's browser with LIVE, [ Take over ] [ Stop ]), 06-3 §11.3 + 09 §9.27.3 + X-66 (BP-SCR-14 Sign-in
// window: the real Edge with foo's docked banner; the drawn 720 × 640 "Chromium view" is withdrawn, so a drawing that shows
// it is a dispute row, not an app change, CR-0013), CR-0013 (BP_M9 screens). The live window is test/e2e/m9-live.spec.ts's
// world (ux-world, the fake AI, FOO_FAKE_BROWSER frames); the banner is opened through main's `signinBanners()` as the
// sign-in lanes open it (test/e2e/m9-signin-ui.spec.ts's sign-in card, irctc.co.in), docked to a fixed Edge rectangle (no
// Edge in the container), state `waiting`. Light and dark. Captures land in golden/out/app.
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { t } from '../../../src/shared/copy/t';
import { TID } from '../../../src/shared/testids';
import { advance } from '../../e2e/m4-start';
import { EDGE, openBanner, openLive, setThemeBoth, startLive } from '../../e2e/m9-live-world';
import { byTid, captureBp, THEMES } from '../capture';

const M9_SCREENS = ['BP-SCR-13', 'BP-SCR-14'] as const;

test('M9 Blueprint captures for Tier R: BP-SCR-13 (Watch live window) and BP-SCR-14 (Sign-in window: docked banner over Edge), light and dark', async () => {
  test.setTimeout(120_000);
  const manifest = JSON.parse(readFileSync(join('golden', 'manifest.json'), 'utf8')) as {
    bp: { id: string; drawn: boolean; milestone: string }[];
  };
  // BP-CARD-10 / BP-CARD-17 are M9's card minis (test/fidelity/bp/BP-cards-m9.spec.ts); this spec owns the screens.
  const due = manifest.bp.filter((b) => b.milestone === 'M9' && b.drawn && b.id.startsWith('BP-SCR')).map((b) => b.id);
  expect([...M9_SCREENS].sort()).toEqual([...due].sort());

  const w = await startLive();
  const { app, page, refs } = w;
  try {
    // BP-SCR-13: the live window in `live`, a masked frame showing.
    const live = await openLive(app, page, refs.goaJob!);
    const root = live.getByTestId(TID.liveRoot);
    for (let i = 0; i < 20 && (await root.getAttribute('data-state')) !== 'live'; i++) {
      await advance(page, 250);
      await live.waitForTimeout(150);
    }
    await expect(root).toHaveAttribute('data-state', 'live');
    await expect(live.getByTestId(TID.livePill)).toHaveText(t('live.window.pill.live'));
    await expect(live.getByTestId(TID.livePicture).locator('img')).toBeVisible();
    await expect(live.getByTestId(TID.livePicture)).toHaveAttribute('data-masked', 'true');
    await expect(live.getByTestId(TID.liveTakeOver)).toHaveText(t('live.window.take_over'));
    await expect(live.getByTestId(TID.liveStop)).toHaveText(t('live.window.stop'));
    await live.mouse.move(1, 1);
    await live.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    for (const theme of THEMES) {
      await setThemeBoth(page, live, theme);
      await captureBp(live, 'BP-SCR-13', byTid(TID.liveRoot), theme);
    }
    await setThemeBoth(page, live, 'light');

    // BP-SCR-14: the docked banner over Edge, waiting for the user to sign in (X-66: no foo-drawn sign-in window).
    const banner = await openBanner(app, { jobId: refs.goaJob!, mode: 'sign_in_here', url: 'https://www.irctc.co.in/nget/signin' });
    const root14 = banner.getByTestId(TID.signinBanner);
    await expect(root14).toHaveAttribute('data-state', 'waiting');
    await expect(banner.getByTestId(TID.signinBannerAddress)).toContainText('irctc.co.in');
    await expect(root14).toContainText(t('signin_banner.waiting.text', { agentName: 'foo' }));
    await expect(banner.getByTestId(TID.signinBannerDone)).toHaveText(t('signin_banner.done.label'));
    // docked at Edge's width, 72 high (address row 32 + banner 40), under Edge's toolbar
    await expect.poll(() => banner.evaluate(() => [window.innerWidth, window.innerHeight])).toEqual([EDGE.width, 72]);
    // the drawings show the resting state: no focus ring on I'm done (the banner takes focus when shown)
    await banner.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    for (const theme of THEMES) {
      await setThemeBoth(page, banner, theme);
      await captureBp(banner, 'BP-SCR-14', byTid(TID.signinBanner), theme);
    }
  } finally {
    await w.close();
  }
});
