// Spec: 10-acceptance-2 §C.8 AT-301 (Basic and Off: no transform, scale, rotation or height animation, fades only),
// AT-302 (chat and page changes slide 18px with `--ease-spring-soft` and cross-fade; back reverses; the old view leaves in
// ≤ 167ms), AT-303 (dialog 0.92 → 1 with `--ease-spring` and `--shadow-28`; the shell behind 0.96 + 2px blur; menus scale
// from the opening button), AT-326 (skeleton shimmer, tooltip after 500ms, toggle knob spring, segmented and Settings pill
// slide), AT-327 (the primary button's lip flattens in 83ms; other buttons keep the 0.97 press); 02 §F7.1, CR-0021 picks 1–5, 18.
// Frames are read with every CSS animation paused at its start (a test-only style tag), so nothing depends on timing.
import { expect, test, type Locator, type Page } from '@playwright/test';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { launchWithFakeAi, VERIFY_OK } from './fakeAi';
import { openPanelChat, startWorld } from './m4-start';
import { openChat, openWorld, windowSize } from '../fidelity/capture';

type Level = 'full' | 'basic' | 'off';

const setMotion = (page: Page, level: Level) => page.evaluate((l) => (document.documentElement.dataset.motion = l), level);

/** Holds every CSS animation at its first frame until `release()` (transitions still run). */
async function holdAnimations(page: Page): Promise<() => Promise<void>> {
  const tag = await page.addStyleTag({ content: '*, *::before, *::after { animation-play-state: paused !important; }' });
  return () => tag.evaluate((n) => (n as Element).remove());
}

interface Frame {
  names: string[];
  durations: string;
  easing: string;
  transform: string;
  opacity: string;
}

/** The computed style of `loc` (or its `::before`) at the start of its running animations. */
const frameOf = (loc: Locator, pseudo: string | null = null): Promise<Frame> =>
  loc.evaluate((el, p) => {
    for (const a of el.getAnimations()) a.currentTime = 0;
    const cs = getComputedStyle(el, p);
    return {
      names: cs.animationName.split(', '),
      durations: cs.animationDuration,
      easing: cs.animationTimingFunction,
      transform: cs.transform,
      opacity: cs.opacity,
    };
  }, pseudo);

/** A token's easing as Chromium serialises it in a computed animation-timing-function. */
const easingOf = (page: Page, token: string) =>
  page.evaluate((tk) => {
    const probe = document.createElement('div');
    probe.style.animationTimingFunction = `var(${tk})`;
    document.body.append(probe);
    const v = getComputedStyle(probe).animationTimingFunction;
    probe.remove();
    return v;
  }, token);

/** translateX / scale from a computed `matrix(a, b, c, d, e, f)` (or `none`). */
function matrix(transform: string): { scale: number; x: number; y: number } {
  if (transform === 'none') return { scale: 1, x: 0, y: 0 };
  const [a, , , , e, f] = /matrix\(([^)]+)\)/.exec(transform)![1]!.split(',').map(Number) as number[];
  return { scale: a!, x: e!, y: f! };
}

/** The main cell's view wrapper (the element that slides) holding `inner`. */
const viewOf = (inner: Locator) => inner.locator('xpath=..');

interface Ghost {
  name: string;
  duration: string;
  text: string;
  testIds: number;
  hidden: string | null;
}

/** The still copy of the old view that fades out over the main cell (ViewFrame), read while animations are held. */
const ghostOf = (inner: Locator): Promise<Ghost | null> =>
  viewOf(inner)
    .locator('xpath=..')
    .evaluate((cell) => {
      const g = cell.querySelector<HTMLElement>(':scope > [inert]');
      if (!g) return null;
      const cs = getComputedStyle(g);
      return {
        name: cs.animationName,
        duration: cs.animationDuration,
        text: g.textContent ?? '',
        testIds: g.querySelectorAll('[data-testid], [id]').length,
        hidden: g.getAttribute('aria-hidden'),
      };
    });

async function switchFrames(page: Page): Promise<{ chat: Frame; page: Frame; back: Frame; ghost: Ghost | null }> {
  await openChat(page, 'Trips');
  let release = await holdAnimations(page);
  await openChat(page, 'foo');
  const chat = await frameOf(viewOf(page.getByTestId(TID.thread)));
  // Chat to chat leaves no copy of the old chat (CR-0021 close-out, PERF-03); only page changes do.
  expect(await ghostOf(page.getByTestId(TID.thread))).toBeNull();
  await release();

  release = await holdAnimations(page);
  await page.keyboard.press('Control+m');
  await expect(page.getByTestId(TID.screenMemory)).toBeVisible();
  const memory = await frameOf(viewOf(page.getByTestId(TID.screenMemory)));
  const ghost = await ghostOf(page.getByTestId(TID.screenMemory));
  expect(await viewOf(page.getByTestId(TID.screenMemory)).getAttribute('data-dir')).toBe('forward');
  await release();

  release = await holdAnimations(page);
  await page.getByTestId(TID.screenMemory).focus();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId(TID.thread)).toBeVisible();
  expect(await viewOf(page.getByTestId(TID.thread)).getAttribute('data-dir')).toBe('back');
  const back = await frameOf(viewOf(page.getByTestId(TID.thread)));
  await release();
  return { chat, page: memory, back, ghost };
}

test('AT-302: chat and page changes slide 18px with the soft spring and cross-fade; back slides the other way', async () => {
  const { app, page } = await startWorld();
  await setMotion(page, 'full');
  const soft = await easingOf(page, '--ease-spring-soft');
  expect(soft).toMatch(/^linear\(/);
  const f = await switchFrames(page);
  for (const [frame, x] of [
    [f.chat, 18],
    [f.page, 18],
    [f.back, -18],
  ] as const) {
    expect(frame.names.some((n) => n.includes('view-in'))).toBe(true);
    expect(frame.durations).toBe('0.4s');
    expect(frame.easing).toBe(soft);
    expect(frame.opacity).toBe('0');
    expect(matrix(frame.transform).x).toBeCloseTo(x, 0);
  }
  // Cross-fade: a still copy of foo's chat (no ids, hidden from readers) fades out over Memory in --m-normal (167ms), faster
  // than the 400ms entrance; the live old view is already gone and the copy is removed when its fade ends.
  expect(f.ghost).toMatchObject({ duration: '0.167s', testIds: 0, hidden: 'true' });
  expect(f.ghost!.name).toContain('view-out');
  expect(f.ghost!.text.length).toBeGreaterThan(0);
  await expect(page.getByTestId(TID.screenMemory)).toHaveCount(0);
  await expect(page.locator('[inert][aria-hidden="true"]')).toHaveCount(0);
  await app.close();
});

test('AT-303: a dialog lands 0.92 → 1 with the spring and --shadow-28; the shell steps back to 0.96 under a 2px blur; menus scale from their button', async () => {
  const { app, page } = await startWorld();
  await setMotion(page, 'full');
  const spring = await easingOf(page, '--ease-spring');
  await page.keyboard.press('Control+m');
  await expect(page.getByTestId(TID.screenMemory)).toHaveAttribute('data-state', 'list');

  // Menu: scales in from the ⋯ button that opened it.
  let release = await holdAnimations(page);
  const opener = page.getByTestId(TID.memoryMenu);
  await opener.click();
  const menu = page.getByRole('menu');
  const mf = await frameOf(menu);
  expect(mf.names.some((n) => n.includes('menu-in'))).toBe(true);
  expect(matrix(mf.transform).scale).toBeCloseTo(0.94, 2);
  // Untransformed layout box (a held frame is scaled, so its bounding box is not the placed box).
  const [ob, mb] = await Promise.all([
    opener.boundingBox(),
    menu.evaluate((el) => {
      const m = el as HTMLElement;
      const o = getComputedStyle(m).transformOrigin.split(' ').map(parseFloat);
      return { x: m.offsetLeft, y: m.offsetTop, width: m.offsetWidth, height: m.offsetHeight, ox: o[0]!, oy: o[1]! };
    }),
  ]);
  const centre = { x: ob!.x + ob!.width / 2, y: ob!.y + ob!.height / 2 };
  // The origin is the point of the menu nearest the button's centre.
  expect(mb.x + mb.ox).toBeCloseTo(Math.min(Math.max(centre.x, mb.x), mb.x + mb.width), 0);
  expect(mb.y + mb.oy).toBeCloseTo(Math.min(Math.max(centre.y, mb.y), mb.y + mb.height), 0);
  await release();

  // Dialog: C-4 from the same menu.
  release = await holdAnimations(page);
  await page.getByRole('menuitem', { name: t('screen.memory.menu.forget_all'), exact: true }).click();
  const dialog = page.getByTestId(TID.dialogC04);
  const df = await frameOf(dialog);
  expect(df.names.some((n) => n.includes('dialog-in'))).toBe(true);
  expect(df.durations.split(', ')[0]).toBe('0.4s');
  expect(df.easing.split(/, (?=[a-z])/)[0]).toBe(spring);
  expect(matrix(df.transform).scale).toBeCloseTo(0.92, 2);
  const shadow = await dialog.evaluate((el) => {
    const probe = document.createElement('div');
    probe.style.boxShadow = 'var(--shadow-28)';
    document.body.append(probe);
    const want = getComputedStyle(probe).boxShadow;
    probe.remove();
    return { want, got: getComputedStyle(el).boxShadow };
  });
  expect(shadow.got).toBe(shadow.want);
  await release();

  await expect(page.locator('html')).toHaveAttribute('data-dialog-open', '');
  const shell = page.getByTestId(TID.titlebarStrip).locator('xpath=..');
  await expect.poll(async () => matrix(await shell.evaluate((el) => getComputedStyle(el).transform)).scale).toBeCloseTo(0.96, 3);
  // The blur eases in beside the scale, so wait for its end value too (the scale can be within 0.0005 while the blur is not).
  await expect.poll(() => shell.evaluate((el) => getComputedStyle(el).filter)).toBe('blur(2px)');

  // Leaving is faster than arriving: the shell comes back in --m-normal with --ease-out.
  await dialog.getByTestId(TID.dialogSecondary).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveAttribute('data-dialog-open', '');
  expect(await shell.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0.167s, 0.167s');
  await expect.poll(() => shell.evaluate((el) => getComputedStyle(el).transform)).toBe('none');
  await app.close();
});

test('AT-301: at Basic and Off nothing moves: slides, dialogs, menus and the shell keep only fades', async () => {
  const { app, page } = await startWorld();
  for (const level of ['basic', 'off'] as const) {
    await setMotion(page, level);
    const f = await switchFrames(page);
    for (const frame of [f.chat, f.page, f.back]) {
      expect(matrix(frame.transform)).toEqual({ scale: 1, x: 0, y: 0 });
      expect(frame.durations).toBe(level === 'basic' ? '0.2s' : '0.083s');
    }
    // Basic keeps the cross-fade copy (a fade); Off swaps at once.
    expect(f.ghost === null).toBe(level === 'off');
    await page.keyboard.press('Control+m');
    const release = await holdAnimations(page);
    await page.getByTestId(TID.memoryMenu).click();
    expect(matrix((await frameOf(page.getByRole('menu'))).transform).scale).toBe(1);
    await page.getByRole('menuitem', { name: t('screen.memory.menu.forget_all'), exact: true }).click();
    const dialog = page.getByTestId(TID.dialogC04);
    expect(matrix((await frameOf(dialog)).transform).scale).toBe(1);
    await release();
    const shell = page.getByTestId(TID.titlebarStrip).locator('xpath=..');
    const [transform, filter] = await shell.evaluate((el) => [getComputedStyle(el).transform, getComputedStyle(el).filter]);
    expect(matrix(transform!)).toEqual({ scale: 1, x: 0, y: 0 });
    expect(filter).toBe('blur(0px)');
    await dialog.getByTestId(TID.dialogSecondary).click();
    await page.keyboard.press('Escape');

    // The details panel's sections rise with no stagger or movement; the Doing now highlight jumps.
    const held = await holdAnimations(page);
    await openChat(page, 'Trips');
    const panel = page.getByTestId(TID.appPanel);
    const sections = await panel.evaluate((p) =>
      Array.from(p.querySelectorAll<HTMLElement>('[class*="_section_"]')).map((s) => {
        for (const a of s.getAnimations()) a.currentTime = 0;
        const cs = getComputedStyle(s);
        return { transform: cs.transform, delay: cs.animationDelay };
      }),
    );
    await held();
    expect(sections.length).toBeGreaterThan(1);
    for (const s of sections) {
      expect(matrix(s.transform)).toEqual({ scale: 1, x: 0, y: 0 });
      expect(s.delay).toBe('0s');
    }
    const seg = panel.getByRole('radiogroup').first();
    expect(await seg.evaluate((el) => getComputedStyle(el, '::before').transitionDuration)).toBe('0s');
  }
  await app.close();
});

test('AT-326: the segmented highlight and the Settings pill slide, the skeleton shimmers, tooltips wait 500ms, toggle knobs spring', async () => {
  const { app } = await launchWithFakeAi([VERIFY_OK]);
  const page = await app.firstWindow();
  await openWorld(app, page);
  await windowSize(app, page, 1440, 900);
  await setMotion(page, 'full');
  const soft = await easingOf(page, '--ease-spring-soft');
  const spring = await easingOf(page, '--ease-spring');

  // Segmented (Doing now tabs): one highlight under the chosen option, moved by --seg-i with the soft spring.
  await openPanelChat(page, 'foo');
  const seg = page.getByTestId(TID.appPanel).getByRole('radiogroup').first();
  const before = await seg.evaluate((el) => {
    const cs = getComputedStyle(el, '::before');
    return { transition: cs.transitionTimingFunction, duration: cs.transitionDuration, x: cs.transform };
  });
  expect(before.transition).toBe(soft);
  expect(before.duration).toBe('0.4s');
  await seg.getByRole('radio').nth(1).click();
  await expect(seg.getByRole('radio').nth(1)).toHaveAttribute('aria-checked', 'true');
  const [segBox, optBox] = await Promise.all([seg.boundingBox(), seg.getByRole('radio').nth(1).boundingBox()]);
  await expect
    .poll(async () => matrix(await seg.evaluate((el) => getComputedStyle(el, '::before').transform)).x)
    .toBeCloseTo(optBox!.x - segBox!.x - 2, 0);

  // Tooltip: none at 300ms of hover, shown by 500ms, and it fades in.
  const icon = page.getByTestId(TID.sidebarNewHelper);
  await icon.hover();
  await page.waitForTimeout(300);
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await expect(page.getByRole('tooltip')).toBeVisible();
  expect(await page.getByRole('tooltip').evaluate((el) => getComputedStyle(el).animationName)).toContain('tip-in');
  await page.mouse.move(640, 16);
  await expect(page.getByRole('tooltip')).toHaveCount(0);

  // Settings: the selection pill sits under the chosen item and slides to the next one.
  await page.keyboard.press('Control+,');
  const nav = page.getByRole('navigation', { name: t('settings.page.nav_label') });
  const pillY = () => nav.evaluate((el) => getComputedStyle(el, '::before').transform);
  expect(await nav.evaluate((el) => getComputedStyle(el, '::before').transitionTimingFunction)).toBe(soft);
  expect(matrix(await pillY()).y).toBe(0);
  await page.getByTestId(TID.settingsNavConnections).click();
  const [navBox, itemBox] = await Promise.all([nav.boundingBox(), page.getByTestId(TID.settingsNavConnections).boundingBox()]);
  await expect.poll(async () => matrix(await pillY()).y).toBeCloseTo(itemBox!.y - navBox!.y - 12, 0);
  await expect(page.getByTestId(TID.settingsNavConnections)).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

  // Toggle: link the fake WhatsApp so the "Read my chats" switch exists; its knob glides with --ease-spring.
  const row = page.getByTestId(TID.settingsRowConnectionsWhatsapp);
  await row.getByRole('button', { name: t('settings.connections.whatsapp.link') }).click();
  const link = page.getByTestId(TID.dialogLinkWhatsapp);
  await expect(link.getByTestId(TID.cardConnectQr)).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => (await page.evaluate(() => window.__fooTest!.wa({ op: 'scan' }))).delivered).toBe(true);
  await expect(link).toBeHidden({ timeout: 15_000 });
  const toggle = page.getByRole('switch', { name: t('settings.connections.whatsapp.read') });
  const knob = toggle.locator('span');
  const timing = await knob.evaluate((el) => ({
    fn: getComputedStyle(el).transitionTimingFunction,
    d: getComputedStyle(el).transitionDuration,
  }));
  expect(timing.fn.split(/, (?=[a-z])/)[0]).toBe(spring);
  expect(timing.d.split(', ')[0]).toBe('0.4s');
  const onLeft = await knob.evaluate((el) => el.getBoundingClientRect().left);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect.poll(() => knob.evaluate((el) => el.getBoundingClientRect().left)).toBeLessThan(onLeft - 10);

  // Skeleton: the Skeleton part's band sweeps with --m-shimmer at Full and is gone at Basic and Off. No list is loading
  // in a seeded world, so a probe takes the part's class from the loaded style sheet.
  const shimmer = (level: Level) =>
    page.evaluate((l) => {
      document.documentElement.dataset.motion = l;
      const rules = Array.from(document.styleSheets).flatMap((sh) => Array.from(sh.cssRules));
      const sel = rules.map((r) => (r as CSSStyleRule).selectorText ?? '').find((x) => /^\._skeleton_\w+_\d+::?after$/.test(x))!;
      const probe = document.createElement('span');
      probe.className = sel.replace(/::?after$/, '').slice(1);
      document.body.append(probe);
      const cs = getComputedStyle(probe, '::after');
      const out = { name: cs.animationName, display: cs.display, duration: cs.animationDuration };
      probe.remove();
      return out;
    }, level);
  expect(await shimmer('full')).toEqual({ name: expect.stringContaining('shimmer'), display: 'block', duration: '1.5s' });
  expect((await shimmer('basic')).display).toBe('none');
  expect((await shimmer('off')).display).toBe('none');
  await app.close();
});

test('AT-327: the primary button has a 2px lip that flattens in 83ms on press; other buttons keep the 0.97 press', async () => {
  const { app, page } = await startWorld();
  await setMotion(page, 'full');
  await page.keyboard.press('Control+,');
  await page.getByTestId(TID.settingsNavConnections).click();
  const primary = page
    .getByTestId(TID.settingsRowConnectionsWhatsapp)
    .getByRole('button', { name: t('settings.connections.whatsapp.link') });
  const lip = () => primary.evaluate((el) => getComputedStyle(el, '::before').boxShadow);
  expect(await lip()).toMatch(/0px -2px 0px 0px inset$/);
  expect(await primary.evaluate((el) => getComputedStyle(el, '::before').transitionDuration)).toBe('0.083s, 0.083s');

  const box = await primary.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await expect.poll(lip).toMatch(/0px 0px 0px 0px inset$/);
  expect(await primary.evaluate((el) => getComputedStyle(el).transform)).toBe('none');
  await page.mouse.move(0, 0);
  await page.mouse.up();

  // Any other button keeps the 0.97 press (the Settings header's back button).
  const other = page.getByTestId(TID.screenBack);
  const ob = await other.boundingBox();
  await page.mouse.move(ob!.x + ob!.width / 2, ob!.y + ob!.height / 2);
  await page.mouse.down();
  await expect.poll(async () => matrix(await other.evaluate((el) => getComputedStyle(el).transform)).scale).toBeCloseTo(0.97, 3);
  await page.mouse.move(0, 0);
  await page.mouse.up();
  await app.close();
});
