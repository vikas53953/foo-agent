// Spec: 06-2 §6.2 as amended by X-179, 09 §9.14.3, 02-3 §F22 / §F28.4 as amended; CR-0021 picks 20–22 (P1 T9 proof).
// Open Settings → Appearance, change theme, zoom with Ctrl+=, toggle Sounds and Show foo's eyes, read the Mica decision in a
// FOO_TEST run (solid).
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/p1-09-appearance.journey.ts
import type { Verify } from '../../scripts/foo-verify';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import type { PublicSettings } from '../../src/shared/types';
import { openWorld, settle } from '../fidelity/capture';

export default async function journey(v: Verify): Promise<void> {
  const { app, page } = await v.launch();
  await openWorld(app, page);
  const settings = async () => ((await page.evaluate(() => window.foo!.invoke('settings:get', {}))) as { value: PublicSettings }).value;
  const until = async (what: string, ok: () => Promise<boolean>) => {
    for (let i = 0; i < 50; i++) {
      if (await ok()) return;
      await page.waitForTimeout(100);
    }
    throw new Error(`timed out: ${what}`);
  };

  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.webContents.send('navigate', { view: { kind: 'settings', page: 'appearance' } }),
  );
  await page.getByTestId(TID.settingsRowAppearanceTheme).waitFor();
  await settle(page);
  await v.shot('appearance-page');
  const rows = await page.locator('[data-testid^="settings-row-appearance-"]').count();
  v.note(`Appearance page open with ${rows} rows (theme, accent, zoom, animations, sounds, see-through sidebar, eyes, preview)`);

  await page
    .getByTestId(TID.settingsRowAppearanceTheme)
    .getByRole('radio', { name: t('settings.appearance.theme.dark') })
    .click();
  await until('dark theme', async () => (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark');
  await settle(page);
  await v.shot('appearance-dark');
  v.note(`Theme → Dark: settings.appearance.theme = ${(await settings()).appearance.theme}, <html data-theme="dark"> live`);

  await page.keyboard.press('Control+Equal');
  await until('zoom 110', async () => (await settings()).zoom === 110);
  const factor = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.getZoomFactor());
  await settle(page);
  await v.shot('appearance-zoom-110');
  v.note(
    `Ctrl+= → zoom 110, webContents zoom factor ${factor}, Zoom row reads "${await page.getByTestId(TID.settingsRowAppearanceZoom).getByRole('button').innerText()}"`,
  );
  await page.keyboard.press('Control+0');
  await until('zoom 100', async () => (await settings()).zoom === 100);
  v.note('Ctrl+0 → zoom 100');

  const sounds = page.getByTestId(TID.settingsRowAppearanceSounds).getByRole('switch');
  const before = (await settings()).appearance.sounds;
  await sounds.click();
  await until('sounds on', async () => (await settings()).appearance.sounds === true);
  v.note(`Sounds: default ${before ? 'on' : 'off'} → on (aria-checked ${await sounds.getAttribute('aria-checked')})`);

  const eyes = page.getByTestId(TID.settingsRowAppearanceFaceMotion).getByRole('switch');
  await eyes.click();
  await until('eyes off', async () => (await settings()).appearance.faceMotion === false);
  v.note(`Show foo's eyes: on → off (aria-checked ${await eyes.getAttribute('aria-checked')})`);
  await settle(page);
  await v.shot('appearance-toggled');

  const mica = await page.evaluate(() => ({
    on: document.documentElement.hasAttribute('data-mica'),
    row: document.documentElement.dataset.micaRow,
  }));
  if (mica.on) throw new Error('Mica is on in a FOO_TEST run');
  v.note(`Mica decision in a FOO_TEST run: solid (data-mica absent, row "${mica.row}", setting ${(await settings()).appearance.mica})`);
}
