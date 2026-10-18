// Spec: 11-fidelity §11.2.4 (Tier R app side), §11.12 item 8 M2 fidelity exit (BP-MSG-*, BP-COMP-*: the Blueprint's four
// message minis and nine composer states, ids fixed by CR-0003), §11.2.3 data rule (the world comes from the ux-world seed;
// the words typed in "Typing" come from the frozen Blueprint itself, never from this file). 04 §2–§19, 04-2 §20–§23.
// BP-MSG-02 (status line and typing dots) and BP-COMP-03 (Stop while foo replies) need the engine's reply stream: M3, with
// the fake AI (08-3 §22.3) answering words read from the frozen Blueprint (the "Your message" mini's question and the
// "foo's message" mini's two bubbles). The Thinking face stands where the drawing has typing dots (X-36, 04 §14.3). The
// drawing's status line ("Checking your calendar…") comes from the job runner's step label (04 §14.2) and is shown
// instead of the Thinking row, never with it: it is not in this capture (Tier R R1 reports it).
// The minis are drawn in 350px panels, so R1 (glyphs, the drawing's own words) and R2 (sizes) are disputed under CR-0003;
// R3 and R4 count. Captures land in golden/out/app; the golden lane's Tier R step compares them with golden/ref/bp.
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { t } from '../../../src/shared/copy/t';
import type {} from '../../../src/shared/ipc';
import { TID } from '../../../src/shared/testids';
import { intake, launchWithFakeAi } from '../../e2e/fakeAi';
import { launch } from '../../e2e/launch';
import {
  blueprintBubbles,
  blueprintComposerText,
  byTid,
  captureBp,
  captureBpRange,
  FAKE_MIC,
  frameAt,
  openChat,
  openWorld,
  rest,
  rowOf,
  setTheme,
  settle,
  THEMES,
  windowSize,
  type Theme,
} from '../capture';

/** The file a user picks for "With a photo". A picked file is the user's action, not world state; the seed has no PNG. */
const PHOTO = join('resources', 'icons', 'foo-256.png');
const COMPOSER = byTid(TID.composer);

/** The drawn M2 Blueprint ids this spec captures (CR-0003 table). */
const M2_CAPTURED = [
  'BP-MSG-01',
  'BP-MSG-03',
  'BP-MSG-04',
  'BP-COMP-01',
  'BP-COMP-02',
  'BP-COMP-04',
  'BP-COMP-05',
  'BP-COMP-06',
  'BP-COMP-07',
  'BP-COMP-08',
  'BP-COMP-09',
] as const;

/** The drawn M3 Blueprint ids this spec captures (CR-0003 table). */
const M3_CAPTURED = ['BP-MSG-02', 'BP-COMP-03'] as const;

async function both(page: Page, id: string, sel: string, before?: (theme: Theme) => Promise<void>): Promise<void> {
  for (const theme of THEMES) {
    await setTheme(page, theme);
    if (before) await before(theme);
    await settle(page);
    await captureBp(page, id, sel, theme);
  }
  await setTheme(page, 'light');
}

const field = (page: Page) => page.getByTestId(TID.composerField);

async function clearField(page: Page): Promise<void> {
  await field(page).focus();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
  await expect(field(page)).toHaveText('');
}

/** Holds {talkKey} (Ctrl+Space here) until the timer reads `at`, captures, then Esc cancels: nothing is sent. */
async function recordingShot(page: Page, id: string, at: string, theme: Theme): Promise<void> {
  await page.keyboard.down('Control');
  await page.keyboard.down('Space');
  await expect(page.getByTestId(TID.composerRecording)).toBeVisible();
  await expect(page.getByTestId(TID.composerRecordingTimer)).toHaveText(at, { timeout: 15_000 });
  await captureBp(page, id, COMPOSER, theme);
  await page.keyboard.press('Escape');
  await page.keyboard.up('Space');
  await page.keyboard.up('Control');
  await expect(page.getByTestId(TID.composerRecording)).toHaveCount(0);
}

test('M2 Blueprint captures for Tier R: BP-MSG-01, BP-MSG-03, BP-MSG-04, BP-COMP-01, BP-COMP-02, BP-COMP-04, BP-COMP-05, BP-COMP-06, BP-COMP-07, BP-COMP-08, BP-COMP-09, light and dark', async () => {
  test.setTimeout(300_000);
  const manifest = JSON.parse(readFileSync(join('golden', 'manifest.json'), 'utf8')) as {
    bp: { id: string; drawn: boolean; milestone: string }[];
  };
  const due = manifest.bp.filter((b) => b.milestone === 'M2' && b.drawn).map((b) => b.id);
  expect([...M2_CAPTURED].sort()).toEqual([...due].sort());

  const app: ElectronApplication = await launch(undefined, FAKE_MIC);
  const page = await app.firstWindow();

  // BP-COMP-09 "Not set up" (only during first run): a fresh install has no AI yet (08-0 §A ai.primary null).
  await page.getByTestId(TID.titlebarStrip).waitFor();
  await windowSize(app, page, 1280, 800);
  // During first run foo's row is already the open chat and is disabled (03-shell-1 §3.4, ChatRow), so it is not clicked.
  await expect(page.getByTestId(TID.chatlistRow).first()).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId(TID.composerSend)).toHaveAttribute('data-state', 'disabled');
  await rest(page);
  await both(page, 'BP-COMP-09', COMPOSER);

  // The Blueprint world (Fri 16 Oct 9:41 AM, ux-world).
  const refs = await openWorld(app, page);
  await openChat(page, 'foo');
  await expect(page.getByTestId(TID.composerSend)).toHaveAttribute('data-state', 'mic');

  // BP-COMP-01 Rest.
  await rest(page);
  await both(page, 'BP-COMP-01', COMPOSER);

  // BP-COMP-02 Typing: the words the Blueprint draws in the pill.
  await field(page).focus();
  await page.keyboard.type(blueprintComposerText('Typing'));
  await expect(page.getByTestId(TID.composerSend)).toHaveAttribute('data-state', 'send');
  await rest(page);
  await both(page, 'BP-COMP-02', COMPOSER);
  await clearField(page);

  // BP-COMP-06 Secret caught: a pasted key is masked and the catcher panel opens above the bar.
  await field(page).focus();
  await field(page).evaluate((el) => {
    const dt = new DataTransfer();
    // A key-shaped value for P1 (04-2 §22.4); the drawing shows only its masked form.
    dt.setData('text/plain', ['sk', 'proj', 'AbCdEfGhIjKlMnOpQrStUvWx1234'].join('-'));
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await expect(page.getByTestId(TID.composerPaste)).toBeVisible();
  await page.mouse.move(640, 16);
  await both(page, 'BP-COMP-06', COMPOSER);
  await page.getByTestId(TID.composerPasteMove).click();
  await expect(page.getByTestId(TID.composerPaste)).toHaveCount(0);
  await clearField(page);

  // BP-COMP-05 With a photo: one picked image becomes a chip; the placeholder asks for a message.
  await page.locator(`${COMPOSER} input[type="file"]`).setInputFiles(PHOTO);
  await expect(page.getByTestId(TID.composerChip)).toHaveCount(1);
  await rest(page);
  await both(page, 'BP-COMP-05', COMPOSER);
  await page.getByTestId(TID.composerChipRemove).click();
  await expect(page.getByTestId(TID.composerChip)).toHaveCount(0);

  // BP-COMP-04 Recording (hold {talkKey}): the drawing's timer reads 0:07.
  for (const theme of THEMES) {
    await setTheme(page, theme);
    await rest(page);
    await recordingShot(page, 'BP-COMP-04', '0:07', theme);
  }
  await setTheme(page, 'light');

  // BP-COMP-07 Card waiting above: the Goa stay approval scrolls away and the pending-card strip shows.
  await page.getByTestId(TID.threadLog).evaluate(async (el) => {
    for (let i = 0; i < 40 && !document.querySelector('[data-testid="composer-pending"]'); i++) {
      el.scrollTop = Math.max(0, el.scrollTop - 200);
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    }
  });
  await expect(page.getByTestId(TID.composerPending)).toBeVisible();
  await rest(page);
  await both(page, 'BP-COMP-07', COMPOSER);
  await page.getByTestId(TID.threadLog).evaluate((el) => (el.scrollTop = el.scrollHeight));

  // BP-COMP-08 Offline: after the 10 s grace the banner strip shows and only the placeholder changes.
  await page.evaluate(() => window.__fooTest!.setOnline(false));
  await page.evaluate(() => window.__fooTest!.clock.advance(10_000));
  await expect(page.getByTestId(TID.bannerStrip)).toBeVisible();
  await expect(page.locator(COMPOSER)).toContainText(t('composer.placeholder.offline'));
  await rest(page);
  await both(page, 'BP-COMP-08', COMPOSER);
  await page.evaluate(() => window.__fooTest!.setOnline(true));
  await expect(page.getByTestId(TID.bannerStrip)).toHaveCount(0);

  // BP-MSG-01 Your message: the user's bubble with the 🛠 badge (the chapter 8 reply-quote, UX-08-06).
  await frameAt(page, rowOf(refs.replyQuote!));
  await rest(page);
  await both(page, 'BP-MSG-01', rowOf(refs.replyQuote!));

  // BP-MSG-03 Rich answer: "Goa flights, Sat 12 Dec" with its table and sources (UX-08-07).
  await frameAt(page, rowOf(refs.richAnswer!));
  await rest(page);
  await both(page, 'BP-MSG-03', rowOf(refs.richAnswer!));

  // BP-MSG-04 Around the messages: an unprompted answer with "Why am I getting this?" (Trips).
  await openChat(page, 'Trips');
  await frameAt(page, rowOf(refs.galleryWhy!));
  await rest(page);
  await both(page, 'BP-MSG-04', rowOf(refs.galleryWhy!));
  await app.close();
});

test('M3 Blueprint captures for Tier R: BP-MSG-02, BP-COMP-03, light and dark', async () => {
  test.setTimeout(180_000);
  const manifest = JSON.parse(readFileSync(join('golden', 'manifest.json'), 'utf8')) as {
    bp: { id: string; drawn: boolean; milestone: string }[];
  };
  const due = manifest.bp.filter((b) => b.milestone === 'M3' && b.drawn).map((b) => b.id);
  expect([...M3_CAPTURED].sort()).toEqual([...due].sort());

  // The words come from the Blueprint: the user's two lines (BP-MSG-01) and foo's two bubbles (BP-MSG-02).
  const [ask, more] = blueprintBubbles('Your message (input)', 'me');
  const answer = blueprintBubbles("foo's message (output)", 'foo');
  expect(answer).toHaveLength(2);
  // The first reply comes on the fake clock inside the 1.5 s hold (chat mode, 2 bubbles); the second never comes.
  const { app } = await launchWithFakeAi([
    intake(ask!, answer.join('\n\n'), { delayMs: 1_000 }),
    intake(more!, 'never shown', { delayMs: 3_600_000 }),
  ]);
  const page = await app.firstWindow();
  await openWorld(app, page);
  await openChat(page, 'foo');

  await field(page).focus();
  await page.keyboard.type(ask!);
  await page.keyboard.press('Enter');
  await field(page).focus();
  await page.keyboard.type(more!);
  await page.keyboard.press('Enter');
  const thinking = page.getByTestId(TID.threadThinking);
  await expect(thinking).toBeVisible();

  // BP-COMP-03 foo is replying: the field is empty and the round button is Stop.
  await expect(page.getByTestId(TID.composerSend)).toHaveAttribute('data-state', 'stop');
  await rest(page);
  await both(page, 'BP-COMP-03', COMPOSER);

  // BP-MSG-02: the first answer arrives (two bubbles a moment apart, then the action row) and the Thinking row follows
  // for the second question.
  await page.evaluate(() => window.__fooTest!.clock.advance(1_000));
  const first = page.getByTestId(TID.bubbleFoo).filter({ hasText: answer[0]! }).last();
  const second = page.getByTestId(TID.bubbleFoo).filter({ hasText: answer[1]! }).last();
  await expect(first).toBeVisible();
  await expect(second).toBeVisible({ timeout: 5_000 });
  await expect(page.getByTestId(TID.bubbleActionsCopy).last()).toBeVisible();
  await expect(thinking).toBeVisible();
  await page.getByTestId(TID.threadLog).evaluate((el) => (el.scrollTop = el.scrollHeight));
  await rest(page);
  const row = (loc: typeof first) => loc.locator('xpath=ancestor::*[@data-message-id][1]');
  const firstRow = await row(first).getAttribute('data-message-id');
  for (const theme of THEMES) {
    await setTheme(page, theme);
    await settle(page);
    await captureBpRange(page, 'BP-MSG-02', rowOf(firstRow!), byTid(TID.threadThinking), theme);
  }
  await setTheme(page, 'light');
  await app.close();
});
