// M9 T5: the Watch live window (06-3 §11.2, 09 §9.27.1–§9.27.2, 08-2 §8.3.7, X-66, X-95, X-121). The engine runs with the fake
// AI and FOO_FAKE_BROWSER (a folder of frames that are already masked at source, standing in for foo's Edge until M9 T3), so
// the frames go through the real screencast → ui.patch → main's frame pass → the live window. The in-control state comes from
// T6/T7 later; here it is seeded the way main will send it (`live:state taken_over`). Pixel-level masking of real pages is
// T3's masker (ART-08a, T9).
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { openChat, openWorld, windowSize } from '../fidelity/capture';
import { fakeTurns, VERIFY_OK } from './fakeAi';
import { launch, testDirs } from './launch';
import { advance, jobState } from './m4-start';

const FRAMES = resolve(__dirname, '..', 'fixtures', 'live-frames');
const FRAME_FILES = ['frame-1.jpg', 'frame-2.jpg'].map((f) => readFileSync(join(FRAMES, f)).toString('base64'));

async function start(): Promise<{ app: ElectronApplication; page: Page; refs: Record<string, string> }> {
  const dirs = testDirs();
  const script = join(dirname(dirs.FOO_DATA_DIR), 'fake-ai.jsonl');
  mkdirSync(dirname(script), { recursive: true });
  writeFileSync(script, JSON.stringify(VERIFY_OK) + '\n');
  const app = await launch(dirs, [], { FOO_FAKE_AI: script, FOO_FAKE_BROWSER: FRAMES });
  const page = await app.firstWindow();
  const refs = await openWorld(app, page);
  await windowSize(app, page, 1440, 900);
  // the engine is up once the fake answered a verify (before that, main answers on its own)
  for (let i = 0; i < 50 && !fakeTurns(dirs).some((x) => x.purpose === 'verify'); i++) {
    await page.evaluate(() => window.foo.invoke('ai:verify', { providerId: 'fake' }));
    await page.waitForTimeout(200);
  }
  return { app, page, refs };
}

async function openLive(app: ElectronApplication, page: Page, jobId: string): Promise<Page> {
  await jobState(page, jobId, 'working');
  await openChat(page, 'foo');
  const opened = app.waitForEvent('window', (w) => w.url().includes('/windows/live.html'));
  await page.getByTestId(TID.chatHeaderWatchLive).click();
  const live = await opened;
  await live.getByTestId(TID.liveRoot).waitFor();
  return live;
}

const windowTitles = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((w) => w.getTitle()));

test('AT-079: Watch live opens foo’s live window with masked frames; the picture takes no clicks; ✕ never stops the job', async () => {
  const { app, page, refs } = await start();
  const live = await openLive(app, page, refs.goaJob!);
  expect(await windowTitles(app)).toContain(t('live.window.title', { job: 'Goa stay' }));
  await expect(live.getByTestId(TID.liveRoot)).toHaveAttribute('aria-label', t('live.window.name', { job: 'Goa stay' }));

  // frames arrive: live, LIVE pill, a picture
  await expect(live.getByTestId(TID.liveRoot)).toHaveAttribute('data-state', 'live');
  await expect(live.getByTestId(TID.livePill)).toHaveText(t('live.window.pill.live'));
  await expect(live.getByTestId(TID.livePicture).locator('img')).toBeVisible();
  await expect(live.getByTestId(TID.livePicture)).toHaveAttribute('data-masked', 'true');

  // every frame the window gets is flagged masked and is the page's own (masked-at-source) frame, unchanged
  await live.evaluate(() => {
    const w = window as unknown as { __frames: { masked: boolean; b64: string }[] };
    w.__frames = [];
    window.foo.on('live:frame', (f) => {
      const bytes = new Uint8Array(f.jpeg);
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      w.__frames.push({ masked: f.masked, b64: btoa(bin) });
    });
  });
  for (let i = 0; i < 4; i++) {
    await advance(page, 250);
    await live.waitForTimeout(300);
  }
  const frames = await live.evaluate(() => (window as unknown as { __frames: { masked: boolean; b64: string }[] }).__frames);
  expect(frames.length).toBeGreaterThanOrEqual(2);
  for (const f of frames) {
    expect(f.masked).toBe(true);
    expect(FRAME_FILES).toContain(f.b64);
  }

  // the picture is not the page: a click shows the tooltip, nothing else changes; the window cannot call other channels
  await live.getByTestId(TID.livePicture).click({ position: { x: 200, y: 200 } });
  await expect(live.getByRole('tooltip')).toHaveText(t('live.window.picture_tooltip'));
  await expect(live.getByTestId(TID.liveRoot)).toHaveAttribute('data-state', 'live');
  const refused = await live.evaluate(() =>
    window.foo.invoke('message:send', { chatId: 'x', text: 'hi', clientId: 'c1' } as never).then(
      () => 'answered',
      () => 'refused',
    ),
  );
  expect(refused).toBe('refused');

  // ✕ closes only the picture (X-95): the job keeps working
  const closed = live.waitForEvent('close');
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().includes('/windows/live.html'))!
      .close(),
  );
  await closed;
  await expect(page.getByTestId(TID.appPanelDoingRow).filter({ hasText: 'Goa stay' }).first()).toHaveAttribute('data-state', 'working');
  await app.close();
});

test('AT-272: in control the live window shows only [ Hand back to {agentName} ] and Stop; hand back sends { jobId } with no mode', async () => {
  const { app, page, refs } = await start();
  const jobId = refs.goaJob!;
  const live = await openLive(app, page, jobId);
  await expect(live.getByTestId(TID.liveRoot)).toHaveAttribute('data-state', 'live');
  const agentName = await page.evaluate(async () => {
    const r = await window.foo.invoke('settings:get', {});
    return r.ok ? r.value.identity.agentName : 'foo';
  });

  // main tells the window foo is paused because the user took over (T6/T7 send this; seeded here as main sends it)
  await app.evaluate(({ BrowserWindow }, id) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('/windows/live.html'))!;
    w.webContents.send('live:state', { jobId: id, state: 'taken_over' });
  }, jobId);
  await expect(live.getByTestId(TID.liveRoot)).toHaveAttribute('data-state', 'in_control');
  await expect(live.getByTestId(TID.livePill)).toHaveText(t('live.window.pill.in_control'));
  const bar = live.getByTestId(TID.liveControlBar);
  await expect(bar).toContainText(t('live.window.control_bar', { agentName }));
  await expect(live.getByTestId(TID.liveHandBack)).toHaveText(t('live.window.hand_back', { agentName }));
  await expect(live.getByTestId(TID.liveTakeOver)).toHaveCount(0);
  await expect(live.getByTestId(TID.liveStop)).toHaveCount(1);
  await expect(bar.getByTestId(TID.liveStop)).toBeVisible();
  await expect(live.getByRole('button')).toHaveCount(2);
  await expect(live.locator('body')).not.toContainText('finish this myself');

  // Hand back: the window calls job:handBack with exactly { jobId } (T6/T7 own the handler; recorded here)
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('job:handBack');
    ipcMain.handle('job:handBack', (_e, arg) => {
      (globalThis as unknown as { __handBack: unknown }).__handBack = arg;
      return { ok: true, value: undefined };
    });
  });
  await live.getByTestId(TID.liveHandBack).click();
  await expect.poll(() => app.evaluate(() => (globalThis as unknown as { __handBack?: unknown }).__handBack)).toEqual({ jobId });

  // Stop: the job stops and the window closes 1 s later
  const closed = live.waitForEvent('close');
  await live.getByTestId(TID.liveStop).click();
  await expect(page.getByTestId(TID.appPanelDoingRow).filter({ hasText: 'Goa stay' })).toHaveCount(0);
  await advance(page, 1_000);
  await closed;
  await app.close();
});
