// Spec: 06-3 §11.2 (Watch live window: states, pill, picture, control bar), 09 §9.27.2 (one window per job, ✕ never stops
// the job, X-95), 08-2 §8.3.7 (masked screencast frames ≤ 5 fps while watched), X-121 (in control: Hand back + Stop only).
// foo-verify journey for M9 T5: a WORKING browser job in foo's chat, Watch live in the chat header → foo's live window opens
// with masked frames from the fake browser (FOO_FAKE_BROWSER, stands in for foo's Edge until T3), a click on the picture only
// shows the tooltip, the in-control state (sent by T6/T7 later; seeded as main sends it), then ✕ and the job still working.
// Run: xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/m9-t5-live.journey.ts
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import type { Verify } from '../../scripts/foo-verify';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { VERIFY_OK } from '../e2e/fakeAi';
import { openChat, openWorld, rest, setTheme, settle, windowSize } from '../fidelity/capture';

const FRAMES = resolve(__dirname, '..', 'fixtures', 'live-frames');

export default async function journey(v: Verify): Promise<void> {
  const { app, page } = await v.launch({ fakeAi: [VERIFY_OK], env: { FOO_FAKE_BROWSER: FRAMES } });
  const refs = await openWorld(app, page);
  await windowSize(app, page, 1440, 900);
  for (let i = 0; i < 50 && !v.fakeTurns().some((x) => (x as { purpose: string }).purpose === 'verify'); i++) {
    await page.evaluate(() => window.foo.invoke('ai:verify', { providerId: 'fake' }));
    await page.waitForTimeout(200);
  }
  const goa = refs.goaJob!;
  await page.evaluate((id) => window.__fooTest!.jobState(id, 'working'), goa);
  await openChat(page, 'foo');
  await setTheme(page, 'light');
  await rest(page);
  await settle(page);
  await v.shot('foo-chat-watch-live');

  const opened = app.waitForEvent('window', (w) => w.url().includes('/windows/live.html'));
  await page.getByTestId(TID.chatHeaderWatchLive).click();
  const live: Page = await opened;
  const root = live.getByTestId(TID.liveRoot);
  await root.waitFor();
  const title = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().includes('/windows/live.html'))!
      .getTitle(),
  );
  if (title !== t('live.window.title', { job: 'Goa stay' })) throw new Error(`live window title "${title}"`);
  v.note(`Watch live (chat header) → a separate foo window titled "${title}"`);

  await live.locator(`[data-testid="${TID.liveRoot}"][data-state="live"]`).waitFor({ timeout: 5_000 });
  await live.getByTestId(TID.livePicture).locator('img').waitFor();
  const masked = await live.getByTestId(TID.livePicture).getAttribute('data-masked');
  if (masked !== 'true') throw new Error('picture not marked masked');
  v.note('frames arrive through the engine screencast → main frame pass: data-state="live", LIVE pill, picture data-masked="true"');
  // the next frame (Guest details, card number and CVV blurred at source) once the engine's clock passes 200 ms
  await page.evaluate(() => window.__fooTest!.clock.advance(250));
  await live.waitForTimeout(400);
  await v.shot('live-window', undefined, live);
  await setTheme(page, 'dark');
  await live.waitForTimeout(200);
  await v.shot('live-window', undefined, live);
  await setTheme(page, 'light');

  await live.getByTestId(TID.livePicture).click({ position: { x: 300, y: 260 } });
  const tip = await live.getByRole('tooltip').textContent();
  if (tip !== t('live.window.picture_tooltip')) throw new Error(`tooltip "${tip}"`);
  if ((await root.getAttribute('data-state')) !== 'live') throw new Error('a click on the picture changed the window');
  v.note(`a click on the picture only shows "${tip}"`);
  await v.shot('live-picture-click', undefined, live);
  await live.getByTestId(TID.liveBar).hover();

  await app.evaluate(({ BrowserWindow }, id) => {
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().includes('/windows/live.html'))!
      .webContents.send('live:state', { jobId: id, state: 'taken_over' });
  }, goa);
  await live.locator(`[data-testid="${TID.liveRoot}"][data-state="in_control"]`).waitFor();
  const buttons = await live.getByRole('button').allTextContents();
  if (buttons.join('|') !== `${t('live.window.hand_back', { agentName: 'foo' })}|${t('live.window.stop')}`)
    throw new Error(`in control buttons: ${buttons.join(' | ')}`);
  v.note(
    `in control (live:state taken_over): pill "${await live.getByTestId(TID.livePill).textContent()}", control bar, buttons ${buttons.join(' + ')} only`,
  );
  await v.shot('live-in-control', undefined, live);
  await setTheme(page, 'dark');
  await live.waitForTimeout(200);
  await v.shot('live-in-control', undefined, live);
  await setTheme(page, 'light');

  await app.evaluate(({ BrowserWindow }, id) => {
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().includes('/windows/live.html'))!
      .webContents.send('live:state', { jobId: id, state: 'running' });
  }, goa);
  await live.locator(`[data-testid="${TID.liveRoot}"][data-state="live"]`).waitFor();
  v.note('handed back (live:state running) → live again');

  const closed = live.waitForEvent('close');
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().includes('/windows/live.html'))!
      .close(),
  );
  await closed;
  await page.waitForTimeout(300);
  const state = await page.getByTestId(TID.appPanelDoingRow).filter({ hasText: 'Goa stay' }).first().getAttribute('data-state');
  if (state !== 'working') throw new Error(`after ✕ the job is ${state}`);
  v.note('✕ closed the live window; Goa stay is still working (X-95)');
  await settle(page);
  await v.shot('after-close');
}
