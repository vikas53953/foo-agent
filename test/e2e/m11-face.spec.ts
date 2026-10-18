// Living face in the real app (02-2 §F15.9): moods from seeded rows (§F15.9.3: Working / Needs you rings from real jobs,
// Offline from the connection, Asleep in quiet hours), the same mood on the row and the header (§F15.9.3e), reduced motion
// (§F15.9.5 static poses), forced colours (§F15.9.7), and the `face:raster` send side of AT-271 (§F15.9.9: 16 / 20 / 24 /
// 32 / 48 PNGs from the hidden `<FaceRaster>`; main's writer is M11 T7's). No letter mark is drawn for foo (X-143).
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import type {} from '../../src/shared/ipc';
import { TID } from '../../src/shared/testids';
import { launch } from './launch';

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

test("foo's face is the living two-eyes face, not a letter, on the row and in the header", async () => {
  const { app, page } = await start();
  const face = rowFace(page, 'foo');
  await expect(face.locator('svg')).toHaveCount(1);
  await expect(face).toHaveAttribute('data-face', /^living:/);
  await expect(face).not.toHaveText(/f/);
  await row(page, 'foo').click();
  const header = page.getByTestId(TID.chatHeaderAvatar).locator('[data-state]');
  await expect(header).toHaveAttribute('data-size', '40');
  await expect(face).toHaveAttribute('data-size', '48');
  await app.close();
});

test('Working and Needs you rings come from real job rows, the same on the row and the header', async () => {
  const { app, page, refs } = await start();
  await row(page, 'foo').click();
  const header = page.getByTestId(TID.chatHeaderAvatar).locator('[data-state]');
  // The seeded Goa stay is NEEDS YOU with an unseen payment card.
  await expect(rowFace(page, 'foo')).toHaveAttribute('data-state', 'needs_you');
  await expect(rowFace(page, 'foo').locator('[data-ring]')).toHaveAttribute('data-ring', 'full');
  await page.evaluate((id) => window.__fooTest!.jobState(id, 'working'), refs.goaJob!);
  await expect(rowFace(page, 'foo')).toHaveAttribute('data-state', 'working');
  await expect(header).toHaveAttribute('data-state', 'working');
  await expect(rowFace(page, 'foo').locator('[data-ring]')).toHaveAttribute('data-ring', 'arc_turning');
  await page.evaluate((id) => window.__fooTest!.jobState(id, 'needs_you'), refs.goaJob!);
  await expect(header).toHaveAttribute('data-state', 'needs_you');
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
  expect(await eye.evaluate((el) => getComputedStyle(el).animationName)).toMatch(/blink/);
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

test('AT-271 (renderer half): <FaceRaster> sends 16 / 20 / 24 / 32 / 48 PNGs of the living face through face:raster', async () => {
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
