// Spec: AT-449, CR-0059 (X-216, the batch-1 baseline fixes) rows 1–6, row 4 as CR-0066 changes it; CR-0054 (X-211, batch 1 = install, ai, name, chat, settings);
// 04 §5 (hover toolbar and More menu), §17.1 (Try again rewrites in place: "Rewritten", "Show earlier answer"), §10.4 (delete);
// Vikas's QA ask of 2026-10-26 ("a framework that finds these bugs rather than me telling you"). The bug-finder sweep on the
// batch-1 build: every action in a bubble's menu and action row must visibly do something, no hover control may cover
// another bubble's words, switched-off features leave no trace on screen, and a plain message never shows 👀 (CR-0066).
// Each finding is listed by name in the failure message, with a screenshot per step for `pnpm qa`.
import { expect, test, type ElectronApplication, type Locator, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {} from '../../src/shared/ipc';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { aiHome, finderRow } from './ai-step-world';
import { VERIFY_OK, type FakeLine } from './fakeAi';
import { launch, testDirs } from './launch';

const BATCH_1 = 'install,ai,name,chat,settings';
const LONG =
  'Here is a longer answer that fills the bubble across the whole width of the chat, so the hover toolbar and the More menu ' +
  'sit right next to the words of the bubbles around it. It keeps going for a while to wrap onto several lines.';
const say = (text: string, delayMs?: number): Omit<FakeLine, 'match'> => ({
  chunks: [{ text: `<say>${text}</say>`, ...(delayMs ? { delayMs } : {}) }],
});
const LINES: FakeLine[] = [
  VERIFY_OK,
  { match: { purpose: 'intake', promptIncludes: 'quick one' }, ...say('Quick answer.') },
  { match: { purpose: 'intake', promptIncludes: 'slow one' }, ...say('That took a while.', 4_000) },
  { match: { purpose: 'intake', promptIncludes: 'long one' }, ...say(LONG) },
  { match: { purpose: 'intake', promptIncludes: 'short one' }, ...say('Short.') },
  { match: { purpose: 'intake' }, ...say('Okay.') },
  // Try again on the older long answer, from its ⋯ menu (after the catch-all above is used up by the first Try again).
  { match: { purpose: 'intake', promptIncludes: 'long one' }, ...say('A new take on the long one.') },
];

const out = () => process.env.QA_EVIDENCE_DIR;
async function shot(page: Page, name: string) {
  const dir = out();
  if (!dir) return;
  mkdirSync(join(dir, 'shots'), { recursive: true });
  await page.screenshot({ path: join(dir, 'shots', `QA-B1-080-${name}.png`) });
}
const advance = (page: Page, ms: number) => page.evaluate((n) => window.__fooTest!.clock.advance(n), ms);
const byTid = (id: string) => `[data-testid="${id}"]`;

/** Sends `text` and moves the test clock until foo's answer has finished streaming. */
async function send(page: Page, text: string) {
  const foo = page.getByTestId(TID.bubbleFoo);
  const before = await foo.count();
  await page.getByTestId(TID.composerField).fill(text);
  await page.keyboard.press('Enter');
  await expect
    .poll(
      async () => {
        await advance(page, 500);
        return foo.count();
      },
      { timeout: 30_000 },
    )
    .toBeGreaterThan(before);
  await advance(page, 2_000);
  await page.waitForTimeout(300);
}

/**
 * What the user can see change, read with no menu open: the window's words, the open dialogs, pickers and popovers, the
 * pressed and checked states, the composer and the clipboard. Hover-only toolbars and the menu itself are left out, so
 * closing a menu is not a change.
 */
async function visible(app: ElectronApplication, page: Page): Promise<string> {
  const dom = await page.evaluate((fieldSel) => {
    const states = Array.from(document.querySelectorAll('[data-state],[aria-pressed],[aria-checked]'))
      .map(
        (e) =>
          `${e.getAttribute('data-testid') ?? ''}:${e.getAttribute('data-state') ?? ''}${e.getAttribute('aria-pressed') ?? ''}${e.getAttribute('aria-checked') ?? ''}`,
      )
      .join('|');
    const open = document.querySelectorAll('[role=dialog],[role=alertdialog],[role=listbox],[popover]:popover-open').length;
    const field = (document.querySelector(fieldSel) as HTMLTextAreaElement | null)?.value ?? '';
    return `${document.body.innerText}\n${states}\n${open}\n${field}`;
  }, byTid(TID.composerField));
  const clip = await app.evaluate(({ clipboard }) => clipboard.readText());
  return `${dom}\n${clip}`;
}

/**
 * `visible` once foo's face has stopped listening: it drops from "listening" 5 s after the last key (LISTEN_MS; to resting,
 * or to asleep in quiet hours), and that change is nobody's menu item.
 */
async function settled(app: ElectronApplication, page: Page): Promise<string> {
  await expect
    .poll(() => page.locator('[data-state="listening"]').count(), { timeout: 8_000 })
    .toBe(0)
    .catch(() => undefined);
  return visible(app, page);
}

/** The More button in `bubble`'s own row. */
const rowOf = (bubble: Locator) => bubble.locator('xpath=ancestor::*[@data-message-id][1]');
const moreOf = (bubble: Locator) => rowOf(bubble).getByTestId(TID.bubbleToolbarMore);

/** Puts the pointer on a bubble so its hover toolbar shows. */
async function hover(page: Page, bubble: Locator) {
  await bubble.scrollIntoViewIfNeeded();
  await bubble.hover();
  await page.waitForTimeout(250);
}

/** Boxes of the words of every bubble other than `own`, for the overlap check. */
async function otherBubbleBoxes(page: Page, own: Locator) {
  const ownId = await own.evaluate((e) => e.closest('[data-message-id]')?.getAttribute('data-message-id') ?? '');
  return page.evaluate(
    ({ ownId, sel }) =>
      Array.from(document.querySelectorAll(sel))
        .filter((b) => b.closest('[data-message-id]')?.getAttribute('data-message-id') !== ownId)
        .map((b) => {
          const r = b.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height, text: (b.textContent ?? '').slice(0, 40) };
        })
        .filter((r) => r.w > 0 && r.h > 0),
    { ownId, sel: `${byTid(TID.bubbleFoo)}, ${byTid(TID.bubbleMe)}` },
  );
}

type Box = { x: number; y: number; w: number; h: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;

test('AT-449 QA-B1-080 · bug-finder sweep: every bubble action does something, nothing covers a bubble, off features leave no trace', async () => {
  test.setTimeout(300_000);
  const findings: string[] = [];
  const dirs = testDirs();
  const script = join(dirs.FOO_DATA_DIR, '..', 'fake-ai.jsonl');
  mkdirSync(join(dirs.FOO_DATA_DIR, '..'), { recursive: true });
  writeFileSync(script, LINES.map((l) => JSON.stringify(l)).join('\n') + '\n');
  const app = await launch(dirs, [], {
    FOO_FAKE_AI: script,
    FOO_TEST_FIRST_RUN: '1',
    FOO_TEST_AI_HOME: aiHome(['claude']),
    FOO_FEATURES: BATCH_1,
  });
  const page = await app.firstWindow();
  await page.getByTestId(TID.titlebarStrip).waitFor();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1280, 800));
  await page.getByTestId(TID.setupWelcomeStart).click();
  await expect(finderRow(page, 'claude-cli')).toHaveAttribute('data-state', 'works', { timeout: 20_000 });
  const use = page.getByTestId(TID.setupAiUse);
  if (await use.count()) await use.first().click();
  await page.getByTestId(TID.setupSkipRest).click();
  await expect(page.getByTestId(TID.composerField)).toBeEnabled({ timeout: 20_000 });

  // 1. Switched-off features leave nothing on screen (CR-0059 row 3): no job filters, no spend line.
  if (await page.getByTestId(TID.chatlistFilters).count()) findings.push('off feature on screen: the job filter buttons show');
  const footer = (await page.getByTestId(TID.sidebarFooterStatus).allInnerTexts()).join(' ');
  if (/₹/.test(footer)) findings.push(`off feature on screen: the sidebar shows a spend line ("${footer.trim()}")`);
  await shot(page, '1-home');

  // 2. No 👀 on a plain message, quick or slow (CR-0066): foo's Thinking row already says foo is on it, and a real AI takes
  // more than CR-0059's 2 s on every message, so 👀 showed on all of them (Vikas, 27 Oct).
  const log = page.getByTestId(TID.threadLog);
  const eyesSeen: string[] = [];
  await page.exposeFunction('__qaEyes', (s: string) => eyesSeen.push(s));
  await page.evaluate(
    (sel) => {
      new MutationObserver(() => {
        for (const b of Array.from(document.querySelectorAll(sel)))
          (window as unknown as { __qaEyes: (s: string) => void }).__qaEyes(
            b.closest('[data-message-id]')?.textContent?.slice(0, 30) ?? '',
          );
      }).observe(document.body, { subtree: true, childList: true, attributes: true });
    },
    `${byTid(TID.bubbleBadge)}[data-state="seen"]`,
  );
  await send(page, 'quick one');
  if (eyesSeen.length) findings.push(`👀 shown on a quick answer: ${eyesSeen[0]}`);
  await page.getByTestId(TID.composerField).fill('slow one');
  await page.keyboard.press('Enter');
  // Past CR-0059's 2 s hold while foo still thinks (the scripted answer waits 4 s of the fake clock).
  await page.getByTestId(TID.threadThinking).waitFor();
  await page.waitForTimeout(3_000);
  if (eyesSeen.length) findings.push(`👀 shown while foo took 4 s: ${eyesSeen[0]}`);
  await shot(page, '2-eyes');
  await advance(page, 5_000);
  await expect(log.getByText('That took a while.')).toBeVisible({ timeout: 10_000 });
  if (eyesSeen.length) findings.push(`👀 shown on a slow answer: ${eyesSeen[0]}`);

  await send(page, 'long one');
  await send(page, 'short one');

  // 3. Hover controls never cover another bubble's words (CR-0059 row 2: only the latest answer keeps its action row).
  const bubbles = log.locator(`${byTid(TID.bubbleFoo)}, ${byTid(TID.bubbleMe)}`);
  for (let i = 0; i < (await bubbles.count()); i++) {
    const b = bubbles.nth(i);
    await hover(page, b);
    const others = await otherBubbleBoxes(page, b);
    const controls = await page
      .locator(
        `${byTid(TID.bubbleToolbarReact)}, ${byTid(TID.bubbleToolbarMore)}, ${byTid(TID.bubbleActionsCopy)}, ${byTid(TID.bubbleActionsRetry)}`,
      )
      .evaluateAll((els) =>
        els
          .filter((e) => (e as HTMLElement).offsetParent !== null)
          .map((e) => {
            const r = e.getBoundingClientRect();
            return { x: r.x, y: r.y, w: r.width, h: r.height, id: e.getAttribute('data-testid') ?? '' };
          }),
      );
    for (const c of controls)
      for (const o of others) if (overlaps(c, o)) findings.push(`${c.id} covers the words of another message ("${o.text}")`);
  }
  await shot(page, '3-hover');

  // 4. Every item in each bubble's More menu does something the user can see.
  const fooLast = log.getByTestId(TID.bubbleFoo).last();
  const meLast = log.getByTestId(TID.bubbleMe).last();
  for (const [who, bubble] of [
    ['foo', fooLast],
    ['me', meLast],
  ] as const) {
    await hover(page, bubble);
    await moreOf(bubble).click();
    const items = await page
      .locator('[role=menuitem]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid') ?? e.textContent ?? ''));
    await page.keyboard.press('Escape');
    for (const id of items) {
      if (id === TID.bubbleMenuDelete || id === TID.bubbleMenuTryAgain) continue; // proved on their own below
      await page.mouse.move(0, 0);
      await page.waitForTimeout(300);
      const before = await settled(app, page);
      // The check itself can see "no change": two reads with nothing done in between agree.
      expect(await visible(app, page), 'the sweep reads a still window the same twice').toBe(before);
      await hover(page, bubble);
      await moreOf(bubble).click();
      await page.getByTestId(id).click();
      await page.waitForTimeout(600);
      await page.mouse.move(0, 0);
      await page.waitForTimeout(300);
      const after = await visible(app, page);
      if (after === before) findings.push(`dead menu item on ${who}'s bubble: ${id} changed nothing on screen`);
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }
  }

  // 5. Try again rewrites the answer in place (CR-0059 row 1): new words, "Rewritten", the earlier answer one tap away.
  const latest = log.getByTestId(TID.bubbleFoo).filter({ hasText: 'Short.' });
  const fooCount = await log.getByTestId(TID.bubbleFoo).count();
  await hover(page, latest);
  await rowOf(latest).getByTestId(TID.bubbleActionsRetry).click();
  for (let i = 0; i < 20 && (await latest.count()); i++) await advance(page, 500);
  await advance(page, 2_000);
  await page.waitForTimeout(400);
  await shot(page, '5-rewritten');
  if (await latest.count()) findings.push('Try again: the answer did not change');
  const fooAfter = await log.getByTestId(TID.bubbleFoo).count();
  if (fooAfter !== fooCount) findings.push(`Try again: ${fooAfter - fooCount} new bubble(s) instead of rewriting the answer in place`);
  const preview = await page.getByTestId(TID.chatlistRowPreview).first().innerText();
  if (preview.includes('Short.')) findings.push(`Try again: the chat list still shows the old answer ("${preview}")`);
  const earlier = log.getByTestId(TID.bubbleEarlierAnswer);
  if (!(await earlier.count())) findings.push('Try again: no "Show earlier answer" after the rewrite');
  else {
    if (!(await log.innerText()).includes(t('bubble.meta.rewritten'))) findings.push('Try again: no "Rewritten" mark');
    await earlier.click();
    if (!(await log.innerText()).includes('Short.')) findings.push('Try again: "Show earlier answer" does not show it');
  }

  // 5b. An older answer has no action row (row 2), so its Try again is in the ⋯ menu; it rewrites in place too.
  const older = log.getByTestId(TID.bubbleFoo).filter({ hasText: 'Here is a longer answer' });
  await hover(page, older);
  await moreOf(older).click();
  await page.getByTestId(TID.bubbleMenuTryAgain).click();
  for (let i = 0; i < 20 && (await older.count()); i++) await advance(page, 500);
  await advance(page, 2_000);
  await page.waitForTimeout(400);
  if (await older.count()) findings.push('Try again from the ⋯ menu on an older answer: the answer did not change');
  if ((await log.getByTestId(TID.bubbleFoo).count()) !== fooCount)
    findings.push('Try again from the ⋯ menu: a new bubble instead of a rewrite');
  if (!(await log.getByTestId(TID.bubbleFoo).filter({ hasText: 'A new take on the long one.' }).count()))
    findings.push('Try again from the ⋯ menu: the new answer is not in the old bubble');

  // 6. Delete removes the bubble from the chat (CR-0059 row 5): no "You deleted this message" left behind.
  const doomed = log.getByTestId(TID.bubbleMe).filter({ hasText: 'quick one' });
  await hover(page, doomed);
  await moreOf(doomed).click();
  await page.getByTestId(TID.bubbleMenuDelete).click();
  await page
    .locator('[role=dialog],[role=alertdialog]')
    .getByRole('button', { name: t('dialog.c_24.primary'), exact: true })
    .click();
  await page.waitForTimeout(1_000);
  if (await doomed.count()) findings.push('delete: the deleted message is still in the chat');
  if ((await log.innerText()).includes(t('bubble.deleted.text'))) findings.push('delete: the chat still shows "You deleted this message"');
  await shot(page, '6-deleted');
  // Deleting the newest message moves the chat-list preview back to the one before it.
  const newest = log.getByTestId(TID.bubbleFoo).last();
  const newestText = (await newest.innerText()).split('\n')[0]!.trim();
  await hover(page, newest);
  await moreOf(newest).click();
  await page.getByTestId(TID.bubbleMenuDelete).click();
  await page
    .locator('[role=dialog],[role=alertdialog]')
    .getByRole('button', { name: t('dialog.c_24.primary'), exact: true })
    .click();
  await page.waitForTimeout(1_000);
  const afterDelete = await page.getByTestId(TID.chatlistRowPreview).first().innerText();
  if (newestText && afterDelete.includes(newestText))
    findings.push(`delete: the chat list still shows the deleted message ("${afterDelete}")`);
  else if (!afterDelete.includes('short one'))
    findings.push(`delete: the chat list does not move to the message before ("${afterDelete}")`);

  const unique = [...new Set(findings)];
  if (out()) writeFileSync(join(out()!, 'QA-B1-080-findings.json'), JSON.stringify(unique, null, 2));
  expect(unique, `bug-finder sweep findings:\n${unique.join('\n')}`).toEqual([]);
  await app.close();
});
