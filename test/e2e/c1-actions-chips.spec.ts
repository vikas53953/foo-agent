// Spec: 10-acceptance-2 §C.10 AT-430 (the action row shows under the latest answer, and under an older answer on hover or
// focus only; 04 §17.1, §17.3), AT-431 (each suggestion chip shows the icon its words map to, unknown words get `Edit`;
// 04-2 §21.7 Look); CR-0024 F7, F8. Every reply comes from the fake AI (08-3 §22.3).
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Locator, type Page } from '@playwright/test';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { openChat, openWorld } from '../fidelity/capture';
import { intake, launchWithFakeAi, VERIFY_OK } from './fakeAi';
import type { testDirs } from './launch';
import { settleSeededJobs } from './m4-start';

const ASK_1 = 'when does my train leave';
const SAY_1 = 'Your train leaves at 9:00 AM from Pune.';
const ASK_2 = 'and the platform';
const SAY_2 = 'It leaves from platform 4.';

let app: ElectronApplication;
let page: Page;
let dirs: ReturnType<typeof testDirs>;
let refs: Record<string, string>;

const chips = () => page.getByTestId(TID.composerSuggestionChip);
const field = () => page.getByTestId(TID.composerField);
/** The list row (RowFrame) of the helper's answer holding `text` (News & X is a helper chat). */
const answerRow = (text: string): Locator =>
  page.locator('[data-message-id]').filter({ has: page.getByTestId(TID.bubbleHelper).filter({ hasText: text }) });
const opacityOf = (l: Locator) => l.evaluate((el) => getComputedStyle(el).opacity);
/** The action row's wrapper: the toolbar's parent. */
const actionsOf = (row: Locator) => row.getByRole('toolbar').locator('xpath=..');

/** Empties one seeded chat in foo.db (the seed has no empty chat; a new helper chat starts like this). */
function emptyChat(chatId: string): void {
  const db = new Database(join(dirs.FOO_DATA_DIR, 'data', 'foo.db'));
  try {
    db.pragma('foreign_keys = OFF');
    for (const table of ['cards', 'messages', 'jobs']) db.prepare(`DELETE FROM ${table} WHERE chat_id = ?`).run(chatId);
  } finally {
    db.close();
  }
}

async function ask(text: string, say: string): Promise<void> {
  await field().pressSequentially(text);
  await field().press('Enter');
  await expect(page.getByTestId(TID.bubbleHelper).filter({ hasText: say })).toBeVisible();
}

test.beforeAll(async () => {
  const run = await launchWithFakeAi([
    VERIFY_OK,
    intake(ASK_1, `${SAY_1}\nSuggestions: Check my inbox | Plan my day | Help me write it`),
    intake(ASK_2, SAY_2),
  ]);
  app = run.app;
  dirs = run.dirs;
  page = await app.firstWindow();
  refs = await openWorld(app, page);
  await settleSeededJobs(page, refs);
  emptyChat(refs.news!);
});
test.afterAll(async () => app?.close());

test('AT-431 Chip icons: each chip leads with the icon its words map to; unknown words get Edit', async () => {
  await openChat(page, 'News & X');
  // The helper starters name no mapped word.
  await expect(chips()).toHaveText([
    t('composer.suggest.starter.helper.1'),
    t('composer.suggest.starter.helper.2'),
    t('composer.suggest.starter.helper.3'),
  ]);
  await expect(chips().locator('[data-icon]')).toHaveCount(3);
  for (const c of await chips().all()) await expect(c.locator('[data-icon]')).toHaveAttribute('data-icon', 'Edit');
  // Look: 32px, --t-small (13px) --fg-1, a 1px --line-strong outline, a 16px icon 8px before the words.
  const look = await chips()
    .first()
    .evaluate((el) => {
      const c = getComputedStyle(el);
      const root = getComputedStyle(document.documentElement);
      const icon = el.querySelector('[data-icon]')!.getBoundingClientRect();
      const words = getComputedStyle(el.querySelector('span')!);
      return {
        height: el.getBoundingClientRect().height,
        font: c.fontSize,
        border: c.borderTopWidth,
        borderColor: c.borderTopColor,
        lineStrong: root.getPropertyValue('--line-strong').trim(),
        icon: icon.width,
        gap: words.columnGap,
      };
    });
  expect(look).toMatchObject({ height: 32, font: '13px', border: '1px', icon: 16, gap: '8px' });
  const probe = await page.evaluate((v) => {
    const d = document.createElement('div');
    d.style.color = v;
    document.body.append(d);
    const rgb = getComputedStyle(d).color;
    d.remove();
    return rgb;
  }, look.lineStrong);
  expect(look.borderColor).toBe(probe);

  // Follow-ups from the reply: inbox → Mail, day → CalendarLtr, anything else → Edit.
  await ask(ASK_1, SAY_1);
  await expect(chips()).toHaveText(['Check my inbox', 'Plan my day', 'Help me write it']);
  await expect(chips().locator('[data-icon]')).toHaveCount(3);
  const icons = await chips()
    .locator('[data-icon]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-icon')));
  expect(icons).toEqual(['Mail', 'CalendarLtr', 'Edit']);
});

test('AT-430 Reply actions on older answers: always under the latest, under an older one only on hover or focus', async () => {
  await openChat(page, 'News & X');
  if ((await answerRow(SAY_1).count()) === 0) await ask(ASK_1, SAY_1);
  await ask(ASK_2, SAY_2);
  const older = answerRow(SAY_1);
  const latest = answerRow(SAY_2);

  // The latest answer's row shows without hover.
  await page.getByTestId(TID.composerField).hover();
  await expect.poll(() => opacityOf(actionsOf(latest))).toBe('1');
  await expect(latest.getByTestId(TID.bubbleActionsCopy)).toBeVisible();

  // The older answer has the row, hidden until the pointer is over it.
  await expect(older.getByTestId(TID.bubbleActionsCopy)).toHaveCount(1);
  await expect.poll(() => opacityOf(actionsOf(older))).toBe('0');
  await older.getByTestId(TID.bubbleHelper).hover();
  await expect.poll(() => opacityOf(actionsOf(older))).toBe('1');
  // It fades in over 120ms (§17.1).
  const was = await page.evaluate(() => document.documentElement.dataset.motion ?? '');
  const fade = (level: string) =>
    actionsOf(older).evaluate((el, lvl) => {
      document.documentElement.dataset.motion = lvl;
      return getComputedStyle(el).transitionDuration;
    }, level);
  expect(await fade('full')).toBe('0.12s');
  expect(await fade('off')).toBe('0.083s');
  await fade(was);
  await expect(older.getByTestId(TID.bubbleActionsGood)).toBeVisible();

  // Pointer away: hidden again; keyboard focus inside the row shows it.
  await page.getByTestId(TID.composerField).hover();
  await expect.poll(() => opacityOf(actionsOf(older))).toBe('0');
  await older.getByTestId(TID.bubbleActionsCopy).focus();
  await expect.poll(() => opacityOf(actionsOf(older))).toBe('1');

  // 👍 on the older answer works from the hover row.
  await older.getByTestId(TID.bubbleHelper).hover();
  await older.getByTestId(TID.bubbleActionsGood).click();
  await expect(older.getByTestId(TID.bubbleActionsGood)).toHaveAttribute('aria-pressed', 'true');

  // 👎 on the older answer: the row stays while its popover is open and while the thanks caption shows.
  await older.getByTestId(TID.bubbleActionsBad).click();
  const pop = page.getByTestId(TID.bubbleFeedback);
  await expect(pop).toBeVisible();
  await pop.getByTestId(TID.bubbleFeedbackChip).first().click();
  await expect.poll(() => opacityOf(actionsOf(older))).toBe('1');
  await pop.getByTestId(TID.bubbleFeedbackSend).click();
  await page.getByTestId(TID.composerField).hover();
  await expect(older.getByText(t('bubble.feedback.thanks'))).toBeVisible();
  await expect.poll(() => opacityOf(actionsOf(older))).toBe('1');
});
