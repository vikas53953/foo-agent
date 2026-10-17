// Spec: 11-fidelity §11.2.3 (one spec per chapter, one test.step per step), §11.12 item 8 M2 fidelity exit ("UX-09 steps not
// needing transcription"; the chapter is completed by M11): UX-09-01 (hold {talkKey}: the recording bar) and UX-09-08
// (Windows blocks the microphone: one button to the right Windows setting). 04-2 §22.1 (recording), §23.2 (mic banners).
// Chapter 9 frames show a chat with only the cake line at 8:30 AM; the ux-world seed is one world for every chapter, so the
// frame's other words differ (CR-0003 disputes R1 for these steps). UX-09-08: the walkthrough draws the problem as a card in
// the thread with other words; the written spec (04-2 §23.2, 05-3 microphone row) makes it the composer banner, so R1/R2 are
// disputed under CR-0003 and the spec's words are asserted here.
import { expect, test } from '@playwright/test';
import { t } from '../../../src/shared/copy/t';
import type {} from '../../../src/shared/ipc';
import { TID } from '../../../src/shared/testids';
import { launch } from '../../e2e/launch';
import { byTid, captureUx, FAKE_MIC, openChat, openWorld, quoted, rest, setTheme, settle, step, THEMES } from '../capture';

test('UX-09 · Voice notes: the steps that need no speech-to-text (1 and 8), light and dark', async () => {
  test.setTimeout(240_000);

  await test.step('UX-09-01 · hold Ctrl+Space and talk: the recording bar with the timer and the hint', async () => {
    const [timer, hint] = quoted(step('UX-09-01').s);
    const app = await launch(undefined, FAKE_MIC);
    const page = await app.firstWindow();
    await openWorld(app, page);
    await openChat(page, 'foo');
    const voiceNotes = page.locator(`${byTid(TID.bubbleMe)}[data-kind="voice"]`);
    const before = await voiceNotes.count();
    for (const theme of THEMES) {
      await setTheme(page, theme);
      await rest(page);
      await page.keyboard.down('Control');
      await page.keyboard.down('Space');
      await expect(page.getByTestId(TID.composerRecording)).toBeVisible();
      await expect(page.getByTestId(TID.composerRecording)).toContainText(hint!);
      await expect(page.getByTestId(TID.composerRecordingTimer)).toHaveText(timer!, { timeout: 15_000 });
      await captureUx(page, 'UX-09-01', byTid(TID.composerSend), theme);
      // f: "Esc throws it away."
      await page.keyboard.press('Escape');
      await page.keyboard.up('Space');
      await page.keyboard.up('Control');
      await expect(page.getByTestId(TID.composerRecording)).toHaveCount(0);
    }
    await expect(voiceNotes).toHaveCount(before);
    await app.close();
  });

  await test.step('UX-09-08 · Windows blocks the microphone: one button opens the right Windows setting', async () => {
    const app = await launch();
    const page = await app.firstWindow();
    // Windows' microphone privacy switch is off for foo: every media request is refused, as Chromium reports it then.
    await app.evaluate(({ session }) => {
      session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission !== 'media'));
      session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission !== 'media');
    });
    await openWorld(app, page);
    await openChat(page, 'foo');
    await page.getByTestId(TID.composerSend).click();
    const banner = page.getByTestId(TID.composerBanner);
    await expect(banner).toHaveAttribute('data-state', 'mic_blocked');
    await expect(banner).toContainText(t('composer.banner.mic_blocked.text'));
    await expect(page.getByTestId(TID.composerBannerAction)).toHaveText(t('composer.banner.mic_blocked.action'));
    await rest(page);
    for (const theme of THEMES) {
      await setTheme(page, theme);
      await settle(page);
      await captureUx(page, 'UX-09-08', byTid(TID.composerBannerAction), theme);
    }
    await app.close();
  });
});
