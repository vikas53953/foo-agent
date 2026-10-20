// Spec: 10-acceptance-2 §C.8 AT-301, AT-302, AT-303, AT-326, AT-327; 02 §F7.1 "Pages and panels" and "Chat switch";
// CR-0021 picks 1–5, 18. foo-verify journey for P1 T3: at Full, switch chats, open Memory and go back, open a menu and a
// dialog, move the Doing now tabs and the Settings pill, and keep frames caught mid-animation (every CSS animation held
// at 120ms); then the same moves at Basic must show fades only (no transform anywhere). Run:
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/p1-03-motion.journey.ts
import type { Page } from '@playwright/test';
import type { Verify } from '../../scripts/foo-verify';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { byTid, openChat, openWorld, rest, setTheme, settle, windowSize } from '../fidelity/capture';

/**
 * Freezes every running finite CSS animation at `ms` from its start: the frame's transform and opacity are copied inline
 * and the animation is cancelled, so a screenshot (which fast-forwards animations) keeps that frame. Returns the frames.
 */
const holdAt = (page: Page, ms: number) =>
  page.evaluate((at) => {
    const out: string[] = [];
    const held: HTMLElement[] = [];
    for (const a of document.getAnimations()) {
      if (!(a instanceof CSSAnimation) || a.effect?.getComputedTiming().iterations === Infinity) continue;
      const effect = a.effect as KeyframeEffect;
      const el = effect.target as HTMLElement | null;
      if (!el || effect.pseudoElement) continue;
      a.pause();
      a.currentTime = at;
      if (!held.includes(el)) held.push(el);
      out.push(`${a.animationName.replace(/^_|_\w+_\d+$/g, '')}: ${getComputedStyle(el).transform}`);
    }
    for (const el of held) {
      const cs = getComputedStyle(el);
      const frame = { transform: cs.transform, opacity: cs.opacity };
      el.style.animation = 'none';
      el.style.transform = frame.transform;
      el.style.opacity = frame.opacity;
    }
    (window as unknown as { __held: HTMLElement[] }).__held = held;
    return out;
  }, ms);
const releaseAll = (page: Page) =>
  page.evaluate(() => {
    for (const el of (window as unknown as { __held?: HTMLElement[] }).__held ?? []) {
      el.style.transform = '';
      el.style.opacity = '';
    }
  });
const moving = (frames: string[]) => frames.filter((f) => !/: (none|matrix\(1, 0, 0, 1, 0, 0\))$/.test(f));
/** The animations this ticket owns (shell, pages, dialogs, menus, popovers, panel, tooltip); others belong to their tickets. */
const OURS = /^(view-in|dialog-in|menu-in|pop-in|slide-in|section-in|restore-in|tip-in):/;

export default async function journey(v: Verify): Promise<void> {
  const { app, page } = await v.launch();
  await openWorld(app, page);
  await windowSize(app, page, 1440, 900);
  await setTheme(page, 'light');

  for (const level of ['full', 'basic'] as const) {
    await page.evaluate((l) => (document.documentElement.dataset.motion = l), level);
    const seen: string[] = [];

    await openChat(page, 'Trips');
    await settle(page);
    await openChat(page, 'foo');
    seen.push(...(await holdAt(page, 120)));
    await rest(page);
    await v.shot(`${level}-chat-switch-mid`);
    await releaseAll(page);

    await page.keyboard.press('Control+m');
    await page.getByTestId(TID.screenMemory).waitFor();
    seen.push(...(await holdAt(page, 120)));
    await v.shot(`${level}-memory-in-mid`);
    await releaseAll(page);

    await page.getByTestId(TID.memoryMenu).click();
    seen.push(...(await holdAt(page, 80)));
    await v.shot(`${level}-menu-mid`);
    await releaseAll(page);
    await page.getByRole('menuitem', { name: t('screen.memory.menu.forget_all'), exact: true }).click();
    await page.getByTestId(TID.dialogC04).waitFor();
    seen.push(...(await holdAt(page, 120)));
    await v.shot(`${level}-dialog-mid`);
    await releaseAll(page);
    await settle(page);
    await v.shot(`${level}-dialog-landed`);
    await page.getByTestId(TID.dialogSecondary).click();

    await page.getByTestId(TID.screenMemory).focus();
    await page.keyboard.press('Escape');
    await page.getByTestId(TID.thread).waitFor();
    const dir = await page.getByTestId(TID.thread).locator('xpath=..').getAttribute('data-dir');
    const back = await holdAt(page, 120);
    seen.push(...back);
    v.note(`${level}: back frame at 120ms: ${back.filter((f) => f.startsWith('view-in')).join(' | ')}`);
    await v.shot(`${level}-back-mid`);
    await releaseAll(page);

    // Doing now tabs: Tab to the group, → moves the highlight.
    const tabs = page.getByTestId(TID.appPanel).getByRole('radiogroup').first();
    await tabs.getByRole('radio', { checked: true }).focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(120);
    await v.shot(`${level}-tabs-mid`, byTid(TID.appPanel));

    await page.keyboard.press('Control+,');
    await page.getByTestId(TID.settingsNavConnections).click();
    await page.waitForTimeout(120);
    await v.shot(`${level}-settings-pill-mid`);
    await settle(page);
    await v.shot(`${level}-settings-pill-landed`);
    await page.keyboard.press('Escape');

    const moved = moving(seen);
    const ours = moved.filter((f) => OURS.test(f));
    v.note(`${level}: back from Memory slid with data-dir="${dir}"; held frames: ${seen.length}, ours moving: ${ours.length}`);
    if (level === 'full' && ours.length === 0) throw new Error('Full: no frame moved');
    if (level === 'basic' && ours.length) throw new Error(`Basic: frames still move: ${ours.join(' | ')}`);
    const others = [...new Set(moved.filter((f) => !OURS.test(f)).map((f) => f.split(':')[0]))];
    if (level === 'basic' && others.length) v.note(`  outside this ticket, still moving at Basic: ${others.join(', ')}`);
    for (const f of ours.slice(0, 6)) v.note(`  ${f}`);
  }
}
