// Spec: 11-fidelity §11.2.4 (Tier R app side), 05-3 §5.10 (BP-CARD-10 Sign in here: the `sign_in` lane `waiting`, "{site}
// wants you to sign in. Do it here and I'll carry on." [ I'm done ] [ Take over ] [ Skip ]), §5.18 (BP-CARD-17 Handoff: the
// handoff marker row "foo asked Trips to …", the helper's name a link), CR-0013 (BP_M9 ids; card minis are drawn in 350px
// panels, so their R2 boxes are disputed by construction, CR-0003 §b). The app side is the m9-signin seed (M9 T6: seeded
// card and marker rows, no engine), light and dark. Fake sites only. BP-SCR-13 / -14 are BP-screens-m9.spec.ts.
// Captures land in golden/out/app; the golden lane's Tier R step compares them with golden/ref/bp.
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { t } from '../../../src/shared/copy/t';
import { TID } from '../../../src/shared/testids';
import { launch } from '../../e2e/launch';
import { byTid, captureBp, openChat, rest, setTheme, settle, THEMES, windowSize } from '../capture';

const M9_CAPTURED = ['BP-CARD-10', 'BP-CARD-17'] as const;

test('M9 Blueprint captures for Tier R: BP-CARD-10 (Sign in here card) and BP-CARD-17 (Handoff marker), light and dark', async () => {
  const manifest = JSON.parse(readFileSync(join('golden', 'manifest.json'), 'utf8')) as {
    bp: { id: string; drawn: boolean; milestone: string }[];
  };
  const due = manifest.bp.filter((b) => b.milestone === 'M9' && b.drawn && b.id.startsWith('BP-CARD-')).map((b) => b.id);
  expect([...M9_CAPTURED].sort()).toEqual([...due].sort());

  const app = await launch();
  try {
    const page = await app.firstWindow();
    await page.getByTestId(TID.titlebarStrip).waitFor();
    await page.evaluate(async () => {
      await window.__fooTest!.clock.set('2026-10-16T09:41:00+05:30');
      await window.__fooTest!.seed('m9-signin');
    });
    await page.reload();
    await page.getByTestId(TID.titlebarStrip).waitFor();
    await windowSize(app, page, 1280, 800);

    await openChat(page, 'Trips');
    const signinSel = `${byTid(TID.cardSignin)}[data-state="waiting"]`;
    const signin = page.locator(signinSel);
    await expect(signin).toContainText(t('cards.signin.title.sign_in', { site: 'irctc.co.in' }));
    await expect(signin.getByRole('button')).toHaveText([
      t('cards.signin.button.done'),
      t('cards.signin.button.take_over'),
      t('cards.signin.button.skip'),
    ]);
    await signin.scrollIntoViewIfNeeded();
    await rest(page);
    for (const theme of THEMES) {
      await setTheme(page, theme);
      await settle(page);
      await captureBp(page, 'BP-CARD-10', signinSel, theme);
    }
    await setTheme(page, 'light');

    await openChat(page, 'foo');
    const markerSel = `${byTid(TID.threadMarker)}[data-state="handoff"]`;
    const marker = page.locator(markerSel).first();
    await expect(marker).toHaveText('foo asked Trips to find flights to Delhi on Fri 23 Oct');
    await expect(marker.getByTestId(TID.threadMarkerLink)).toHaveText(['Trips']);
    await marker.scrollIntoViewIfNeeded();
    await rest(page);
    for (const theme of THEMES) {
      await setTheme(page, theme);
      await settle(page);
      await captureBp(page, 'BP-CARD-17', markerSel, theme);
    }
  } finally {
    await app.close();
  }
});
