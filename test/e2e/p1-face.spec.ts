// P1 T2 (CR-0021, X-179): the living face in the real app (02-2 §F15.9). AT-304 (no letter face for foo; Resting blinks on
// a 2–6 s cycle; 40px+ bobs; idle stops while the window is hidden; "Show foo's eyes" off → still poses, rings still shown),
// AT-305 (the 26px Thinking face only while a request is in flight, 10-2 §C.7.4), AT-306 (Memory empty states show the 64px
// face in its pose, `aria-hidden`, no ring). Also §C.7.1 / C.7.2 moods from seeded rows (Working / Needs you rings from real
// jobs, Offline from the connection, Asleep in quiet hours), §F15.9.3e (row and header agree), §C.7.5 reduced motion,
// §C.7.6 forced colours, §F7.1 Memory details (a new fact glows once; Forget folds the row and Undo brings it back), and the
// `face:raster` send side (§F15.9.9: 16 / 20 / 24 / 32 / 48 PNGs from the hidden `<FaceRaster>`; main's writer and AT-271
// are M11's). No letter mark is drawn for foo (X-143).
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import type {} from '../../src/shared/ipc';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { openChat, openWorld, windowSize } from '../fidelity/capture';
import { intake, launchWithFakeAi, VERIFY_OK } from './fakeAi';
import { launch } from './launch';
import { settleSeededJobs } from './m4-start';

const row = (page: Page, name: string) =>
  page.getByTestId(TID.chatlistRow).filter({ has: page.getByTestId(TID.chatlistRowName).getByText(name, { exact: true }) });
const rowFace = (page: Page, name: string) => row(page, name).getByTestId(TID.chatlistRowAvatar);

async function start(): Promise<{ app: ElectronApplication; page: Page; refs: Record<string, string> }> {
  const app = await launch();
  // Collect the renderer → main face rasters before the shell paints.
  await app.evaluate(({ ipcMain }) => {
    const g = globalThis as unknown as { __rasters: { faceRef: string; size: number; mood: string; bytes: number; png: string }[] };
    g.__rasters = [];
    ipcMain.on('face:raster', (_e, p: { faceRef: string; size: number; mood: string; png: ArrayBuffer }) => {
      const b = Buffer.from(p.png);
      g.__rasters.push({ faceRef: p.faceRef, size: p.size, mood: p.mood, bytes: b.length, png: b.subarray(1, 4).toString('latin1') });
    });
  });
  const page = await app.firstWindow();
  await page.getByTestId(TID.titlebarStrip).waitFor();
  const reply = await page.evaluate(() => window.__fooTest!.seed('ux-world'));
  await expect(page.getByTestId(TID.chatlistRow).first()).toBeVisible();
  return { app, page, refs: reply.refs ?? {} };
}

test('AT-304 foo\'s face is the living two-eyes face, not a letter; it blinks every 2–6 s, bobs at 40px+, pauses when hidden, and holds still with "Show foo\'s eyes" off', async () => {
  const { app, page, refs } = await start();
  const face = rowFace(page, 'foo');
  await expect(face.locator('[data-part="body"]')).toHaveCount(1);
  await expect(face).toHaveAttribute('data-face', /^living:/);
  await expect(face).not.toHaveText(/f/);
  await row(page, 'foo').click();
  const header = page.getByTestId(TID.chatHeaderAvatar).locator('[data-state]');
  await expect(header).toHaveAttribute('data-size', '40');
  await expect(face).toHaveAttribute('data-size', '48');

  // Resting blinks on its own random 2–6 s cycle (CR-0021 pick 7); at 48 and 40 it bobs, the ring does not. Only Resting
  // bobs: a face with something to show holds its place.
  const blinkMs = await face.evaluate((el) => parseFloat((el as HTMLElement).style.getPropertyValue('--face-blink')));
  expect(blinkMs).toBeGreaterThanOrEqual(2000);
  expect(blinkMs).toBeLessThanOrEqual(6000);
  const bob = (loc: typeof face) => loc.evaluate((el) => getComputedStyle(el.querySelector('[data-part="body"]')!).animationName);
  await expect(face).toHaveAttribute('data-state', /^(needs_you|waiting)$/);
  expect(await bob(face)).toBe('none');
  await page.evaluate((id) => window.__fooTest!.jobState(id, 'done'), refs.goaJob!);
  await expect(face).toHaveAttribute('data-state', 'resting');
  await expect(header).toHaveAttribute('data-state', 'resting');
  expect(await bob(face)).toMatch(/bob/);
  expect(await bob(header)).toMatch(/bob/);

  // Hidden or minimised: every face animation pauses (§F15.9.8).
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('html')).toHaveAttribute('data-face-paused', '');
  expect(await face.evaluate((el) => getComputedStyle(el.querySelector('[data-part="body"]')!).animationPlayState)).toBe('paused');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('html')).not.toHaveAttribute('data-face-paused', '');

  // "Show foo's eyes" off (appearance.faceMotion): still poses everywhere, the mood ring still shows (CR-0021 pick 8).
  await page.evaluate(() => window.foo.invoke('settings:set', { path: 'appearance.faceMotion', value: false }));
  await expect(face).toHaveAttribute('data-motion-face', 'off');
  await expect(header).toHaveAttribute('data-motion-face', 'off');
  expect(await bob(face)).toBe('none');
  await page.evaluate((id) => window.__fooTest!.jobState(id, 'working'), refs.goaJob!);
  await expect(face).toHaveAttribute('data-state', 'working');
  await expect(face.locator('[data-ring]')).toHaveAttribute('data-ring', 'arc_turning');
  await page.evaluate(() => window.foo.invoke('settings:set', { path: 'appearance.faceMotion', value: true }));
  await expect(face).toHaveAttribute('data-motion-face', 'on');
  await app.close();
});

test('AT-305 the Thinking row shows the 26px Thinking face only while a request is in flight', async () => {
  const say = 'Two things today: the dentist at 4 PM and the cake pickup at 6.';
  const { app } = await launchWithFakeAi([intake('on today', say, { delayMs: 3_000 })]);
  const page = await app.firstWindow();
  await page.getByTestId(TID.titlebarStrip).waitFor();
  const { refs } = await page.evaluate(() => window.__fooTest!.seed('ux-world'));
  await expect(page.getByTestId(TID.chatlistRow).first()).toBeVisible();
  // A live job in foo's chat would take the message as a steer; settle them so it goes to intake (as m3-replies does).
  await settleSeededJobs(page, refs);
  await openChat(page, 'foo');
  const thinking = page.getByTestId(TID.threadThinking);
  await expect(thinking).toHaveCount(0);
  await page.getByTestId(TID.composerField).focus();
  await page.keyboard.type('What is on today?');
  await page.keyboard.press('Enter');
  await expect(thinking).toBeVisible();
  const f = thinking.locator('[data-face]');
  await expect(f).toHaveAttribute('data-state', 'thinking');
  await expect(f).toHaveAttribute('data-size', '26');
  await expect(f).toHaveAttribute('data-face', /^living:/);
  await expect(thinking).not.toContainText('f');
  // No typing dots anywhere (X-36); the reply (on the fake clock) takes the row's place.
  const bubble = page.getByTestId(TID.bubbleFoo).filter({ hasText: say });
  await expect
    .poll(
      async () => {
        await page.evaluate(() => window.__fooTest!.clock.advance(1_000));
        return bubble.count();
      },
      { timeout: 20_000 },
    )
    .toBeGreaterThan(0);
  await expect(thinking).toHaveCount(0);
  await app.close();
});

test('AT-306 Memory empty states show the 64px face in its pose, aria-hidden, with no ring', async () => {
  const { app } = await launchWithFakeAi([VERIFY_OK]);
  const page = await app.firstWindow();
  await openWorld(app, page);
  await windowSize(app, page, 1440, 900);
  await page.getByTestId(TID.sidebarMore).click();
  await page.getByTestId(TID.sidebarMenuMemory).click();
  const screen = page.getByTestId(TID.screenMemory);
  await expect(screen).toHaveAttribute('data-state', 'list');
  const empty = page.getByTestId(TID.screenEmpty);

  // No results: the face scans (CR-0021 pick 6).
  await page.getByTestId(TID.memorySearch).fill('zzqx');
  await expect(empty).toHaveAttribute('data-state', 'filter_empty');
  const scan = empty.locator('[data-pose]');
  await expect(scan).toHaveAttribute('data-pose', 'scan');
  await expect(scan).toHaveAttribute('aria-hidden', 'true');
  await expect(scan).toHaveAttribute('data-size', '64');
  await expect(scan).not.toHaveAttribute('data-state', /.+/);
  await expect(scan.locator('[data-ring]')).toHaveCount(0);
  expect(await scan.evaluate((el) => getComputedStyle(el.querySelector('[data-part="eyes"]')!).animationName)).toMatch(/scan/);
  await page.getByRole('button', { name: t('screen.memory.no_match.clear') }).click();

  // A forgotten list: the Noticed eyes.
  await page.getByTestId(TID.memoryMenu).click();
  await page.getByRole('menuitem', { name: t('screen.memory.menu.forget_all'), exact: true }).click();
  const c4 = page.getByTestId(TID.dialogC04);
  await c4.getByTestId(TID.dialogConfirmField).fill('FORGET');
  await c4.getByTestId(TID.dialogPrimary).click();
  await expect(screen).toContainText(t('screen.memory.forgotten.title'));
  await expect(empty.locator('[data-pose]')).toHaveAttribute('data-pose', 'noticed');
  await expect(empty.locator('[data-ring]')).toHaveCount(0);
  await app.close();
});

test('Memory: a new fact glows once; Forget folds the row and Undo brings it back', async () => {
  const { app } = await launchWithFakeAi([VERIFY_OK]);
  const page = await app.firstWindow();
  await openWorld(app, page);
  await windowSize(app, page, 1440, 900);
  await page.getByTestId(TID.sidebarMore).click();
  await page.getByTestId(TID.sidebarMenuMemory).click();
  await expect(page.getByTestId(TID.screenMemory)).toHaveAttribute('data-state', 'list');
  const rows = page.getByTestId(TID.memoryRow);
  // The first list does not glow.
  await expect(page.locator('[data-appear]')).toHaveCount(0);
  const all = await rows.count();

  const first = rows.first();
  const id = (await first.getAttribute('data-row-id'))!;
  const row = page.locator(`[data-testid="${TID.memoryRow}"][data-row-id="${id}"]`);
  // Record every look the row takes (the fold lasts 167 ms, the unfold 250 ms: too short to poll for).
  await page.evaluate((rowId) => {
    const w = window as unknown as { __looks: string[] };
    w.__looks = [];
    new MutationObserver((ms) => {
      const look = (el: HTMLElement) => {
        if (el.dataset?.rowId !== rowId) return;
        if (el.hasAttribute('data-exit')) w.__looks.push(`exit:${getComputedStyle(el).animationName}`);
        if (el.dataset.appear) w.__looks.push(`appear:${el.dataset.appear}`);
      };
      for (const m of ms) {
        look(m.target as HTMLElement);
        for (const n of m.addedNodes) if (n instanceof HTMLElement) [n, ...n.querySelectorAll<HTMLElement>('[data-row-id]')].forEach(look);
      }
    }).observe(document.body, { attributes: true, childList: true, subtree: true, attributeFilter: ['data-exit', 'data-appear'] });
  }, id);
  const looks = () => page.evaluate(() => (window as unknown as { __looks: string[] }).__looks);
  await first.getByTestId(TID.memoryRowForget).click();
  // It folds closed (data-exit, the fold keyframes; a fade under Animations "Basic", CR-0021 pick 3), then leaves.
  await expect(row).toHaveCount(0);
  const basic = (await page.evaluate(() => document.documentElement.dataset.motion)) === 'basic';
  expect(await looks()).toContainEqual(expect.stringMatching(basic ? /^exit:.*fact-fade-out/ : /^exit:.*fact-fold/));
  await page.getByTestId(TID.appUndo).getByTestId(TID.appUndoAction).click();
  await expect(rows).toHaveCount(all);
  // The undone row unfolds back, then rests (the mark clears when its animation ends).
  await expect(row).not.toHaveAttribute('data-appear', /.+/);
  expect(await looks()).toContain('appear:back');

  // A fact added now glows once, then rests.
  await page.getByTestId(TID.memoryAdd).click();
  await page.keyboard.type('I like window seats on trains.');
  await page.getByRole('button', { name: t('screen.memory.add.save') }).click();
  const added = rows.filter({ hasText: 'I like window seats on trains.' });
  await expect(added).toHaveAttribute('data-appear', 'fresh');
  await expect(added).not.toHaveAttribute('data-appear', /.+/, { timeout: 5_000 });
  await app.close();
});

test('Needs you until the card is seen, then Waiting on you; Working from real job rows; row and header agree', async () => {
  const { app, page, refs } = await start();
  // The seeded Goa stay is NEEDS YOU with a payment card nobody has seen yet (§F15.9.3 #8).
  await expect(rowFace(page, 'foo')).toHaveAttribute('data-state', 'needs_you');
  await expect(rowFace(page, 'foo').locator('[data-ring]')).toHaveAttribute('data-ring', 'full');
  await row(page, 'foo').click();
  const header = page.getByTestId(TID.chatHeaderAvatar).locator('[data-state]');
  // The card shows in the open chat; after 1 s in view it counts as seen: Waiting on you, dashed ring (#9, C.7.1).
  await expect(rowFace(page, 'foo')).toHaveAttribute('data-state', 'waiting');
  await expect(header).toHaveAttribute('data-state', 'waiting');
  await expect(rowFace(page, 'foo').locator('[data-ring]')).toHaveAttribute('data-ring', 'dashed');
  await page.evaluate((id) => window.__fooTest!.jobState(id, 'working'), refs.goaJob!);
  await expect(rowFace(page, 'foo')).toHaveAttribute('data-state', 'working');
  await expect(header).toHaveAttribute('data-state', 'working');
  await expect(rowFace(page, 'foo').locator('[data-ring]')).toHaveAttribute('data-ring', 'arc_turning');
  await page.evaluate((id) => window.__fooTest!.jobState(id, 'needs_you'), refs.goaJob!);
  await expect(header).toHaveAttribute('data-state', 'waiting');
  await page.evaluate((id) => window.__fooTest!.jobState(id, 'done'), refs.goaJob!);
  await expect(rowFace(page, 'foo')).toHaveAttribute('data-state', 'resting');
  await expect(header).toHaveAttribute('data-state', 'resting');
  await expect(rowFace(page, 'foo').locator('[data-ring]')).toHaveCount(0);
  await app.close();
});

test('the face goes Offline while the offline line shows, and comes back', async () => {
  const { app, page } = await start();
  await page.evaluate(() => window.__fooTest!.setOnline(false));
  await page.evaluate(() => window.__fooTest!.clock.advance(10_000));
  await expect(page.getByTestId(TID.bannerStrip)).toHaveAttribute('data-state', 'offline');
  await expect(rowFace(page, 'foo')).toHaveAttribute('data-state', 'offline');
  await page.evaluate(() => window.__fooTest!.setOnline(true));
  await expect(rowFace(page, 'foo')).not.toHaveAttribute('data-state', 'offline');
  await app.close();
});

test('the face closes its eyes in quiet hours (10 PM – 7 AM by default)', async () => {
  const { app, page, refs } = await start();
  await page.evaluate((id) => window.__fooTest!.jobState(id, 'done'), refs.goaJob!);
  await page.evaluate(() => window.__fooTest!.clock.set('2026-10-16T23:30:00+05:30'));
  // The renderer takes main's clock at start (08-3 §22.2), so reload to pick up the new time.
  await page.reload();
  await expect(page.getByTestId(TID.chatlistRow).first()).toBeVisible();
  await expect(rowFace(page, 'foo')).toHaveAttribute('data-state', 'asleep');
  await expect(rowFace(page, 'foo').locator('[data-part="z"]')).toHaveCount(1);
  await app.close();
});

test('it blinks normally and holds a static pose under reduced motion', async () => {
  const { app, page, refs } = await start();
  await page.evaluate((id) => window.__fooTest!.jobState(id, 'done'), refs.goaJob!);
  const eye = rowFace(page, 'foo').locator('rect').first();
  await expect(rowFace(page, 'foo')).toHaveAttribute('data-state', 'resting');
  // One blink per random 2–6 s cycle; between blinks the eyes draw nothing.
  await expect.poll(() => eye.evaluate((el) => getComputedStyle(el).animationName), { timeout: 8_000 }).toMatch(/blink/);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => eye.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  await app.close();
});

test('forced colours draw the disc in Canvas with CanvasText eyes', async () => {
  const { app, page } = await start();
  await page.emulateMedia({ forcedColors: 'active' });
  const face = rowFace(page, 'foo');
  const [disc, canvas] = await face.evaluate((el) => {
    const probe = document.createElement('span');
    probe.style.color = 'Canvas';
    document.body.append(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return [getComputedStyle(el.querySelector('circle:not([data-ring])')!).fill, c];
  });
  expect(disc).toBe(canvas);
  await app.close();
});

test('the raster send side: <FaceRaster> sends 16 / 20 / 24 / 32 / 48 PNGs of the living face through face:raster', async () => {
  const { app } = await start();
  type R = { faceRef: string; size: number; mood: string; bytes: number; png: string };
  const rasters = () => app.evaluate(() => (globalThis as unknown as { __rasters: R[] }).__rasters);
  await expect.poll(async () => new Set((await rasters()).map((r) => r.size)).size, { timeout: 10_000 }).toBe(5);
  const all = await rasters();
  expect([...new Set(all.map((r) => r.size))].sort((a, b) => a - b)).toEqual([16, 20, 24, 32, 48]);
  for (const r of all) {
    expect(r.faceRef).toMatch(/^living:/);
    expect(r.png).toBe('PNG');
    expect(r.bytes).toBeGreaterThan(50);
  }
  await app.close();
});
