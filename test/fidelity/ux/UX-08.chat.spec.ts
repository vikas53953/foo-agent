// Spec: 11-fidelity §11.2.3 (one spec per chapter, one test.step per walkthrough step named with its id; assertions: the s
// and f facts by hand, then the Tier R capture), §11.12 item 8 M2 fidelity exit (UX-08, chapter 8 "Just chatting, in your
// language", J7 · R1 · R24), 04 §1–§13 (bubbles, reactions, reply-quote, Hindi/Punjabi, rich answers).
// M2 has no engine, so foo's replies cannot be produced by the steps' actions: the chapter's state is the ux-world seed's
// chapter 8 scene (built from the walkthrough's state objects, test/seed/ux-world.ts), and each step frames the walkthrough's
// highlighted message as the newest row. M3 re-runs the chapter with replies from the fake AI (§11.12 M3). UX-08-02 (the
// typing face and the Stop button while foo replies) needs the reply stream: M3 (CR-0003).
// The quoted strings asserted below are read from golden/manifest.json (the frozen walkthrough's own s/f texts).
import { expect, test } from '@playwright/test';
import type {} from '../../../src/shared/ipc';
import { TID } from '../../../src/shared/testids';
import { launch } from '../../e2e/launch';
import { byTid, captureUx, frameAt, openChat, openWorld, quoted, rest, rowOf, setTheme, settle, step, THEMES } from '../capture';

test('UX-08 · Just chatting, in your language: the seeded chapter 8 scene, steps 1 and 3 to 7, light and dark', async () => {
  test.setTimeout(240_000);
  const app = await launch();
  const page = await app.firstWindow();
  const refs = await openWorld(app, page);
  await openChat(page, 'foo');
  await page.getByTestId(TID.appPanel).waitFor();
  const log = page.getByTestId(TID.threadLog);

  /** Frames the step's message as the newest row, then captures the window in both themes with that bubble as hl. */
  const shoot = async (id: string, messageId: string, bubble: string) => {
    await frameAt(page, rowOf(messageId));
    await rest(page);
    await expect(page.getByTestId(TID.threadDateSticky)).toHaveAttribute('data-state', 'hidden');
    for (const theme of THEMES) {
      await setTheme(page, theme);
      await settle(page);
      await captureUx(page, id, `${rowOf(messageId)} ${byTid(bubble)}`, theme);
    }
    await setTheme(page, 'light');
  };

  await test.step('UX-08-01 · "thanks!" gets a 👍 on the bubble and no reply', async () => {
    const s = step('UX-08-01');
    const thanks = page.locator(rowOf(refs.thanks!));
    await frameAt(page, rowOf(refs.thanks!));
    await expect(thanks.getByTestId(TID.bubbleMe)).toContainText('thanks!');
    await expect(thanks.getByTestId(TID.bubbleReaction).first()).toContainText('👍');
    for (const never of quoted(s.s)) await expect(log).not.toContainText(never);
    await shoot('UX-08-01', refs.thanks!, TID.bubbleMe);
  });

  await test.step('UX-08-03 · a short answer comes as two bubbles, no filler', async () => {
    const e = step('UX-08-03');
    await frameAt(page, rowOf(refs.holidayNext!));
    for (const line of quoted(e.s)) await expect(log).toContainText(line);
    for (const filler of quoted(e.f)) await expect(log).not.toContainText(filler);
    await expect(page.locator(`${rowOf(refs.holidayNext!)} ${byTid(TID.bubbleFoo)}`)).toHaveAttribute('data-pos', 'last');
    await shoot('UX-08-03', refs.holidayNext!, TID.bubbleFoo);
  });

  await test.step('UX-08-04 · Hinglish in, Hinglish out', async () => {
    const [ask, answer] = quoted(step('UX-08-04').s);
    await frameAt(page, rowOf(refs.hinglishAnswer!));
    await expect(page.locator(rowOf(refs.hinglish!))).toContainText(ask!);
    await expect(page.locator(rowOf(refs.hinglishAnswer!))).toContainText(answer!);
    await shoot('UX-08-04', refs.hinglishAnswer!, TID.bubbleFoo);
  });

  await test.step('UX-08-05 · Punjabi in its own script, with the taller Indic line', async () => {
    const [ask, answer] = quoted(step('UX-08-05').s);
    await frameAt(page, rowOf(refs.punjabiAnswer!));
    await expect(page.locator(rowOf(refs.punjabi!))).toContainText(ask!);
    const bubble = page.locator(`${rowOf(refs.punjabiAnswer!)} ${byTid(TID.bubbleFoo)}`);
    await expect(bubble).toContainText(answer!);
    await expect(bubble).toHaveAttribute('lang', 'pa');
    // 02 F1 --t-body-indic (SV-07): "a little more line height so the script never clips".
    expect(await bubble.locator('[data-copy]').evaluate((el) => getComputedStyle(el).lineHeight)).toBe('24px');
    await shoot('UX-08-05', refs.punjabiAnswer!, TID.bubbleFoo);
  });

  await test.step('UX-08-06 · hover a bubble and Reply: the new bubble quotes the cake line', async () => {
    // The action, through the real UI: hover foo's cake line, ⋯ → Reply; the composer shows the quote; Esc drops it.
    await frameAt(page, rowOf(refs.cake!));
    const cake = page.locator(`${rowOf(refs.cake!)} ${byTid(TID.bubbleFoo)}`);
    await cake.hover();
    await page.locator(`${rowOf(refs.cake!)} ${byTid(TID.bubbleToolbarMore)}`).click();
    await page.getByTestId(TID.bubbleMenuReply).click();
    const strip = page.getByTestId(TID.composerReply);
    await expect(strip).toContainText('Cake from Theobroma');
    await page.getByTestId(TID.composerField).focus();
    await page.keyboard.press('Escape');
    await expect(strip).toHaveCount(0);
    // The seeded result: the user's bubble that quotes it (the walkthrough's next frame).
    const rq = page.locator(`${rowOf(refs.replyQuote!)} ${byTid(TID.bubbleMe)}`);
    await frameAt(page, rowOf(refs.replyQuote!));
    await expect(rq.getByTestId(TID.bubbleQuote)).toContainText('Cake from Theobroma');
    await shoot('UX-08-06', refs.replyQuote!, TID.bubbleMe);
  });

  await test.step('UX-08-07 · a longer answer with a heading, a table and a source pill', async () => {
    const [title, source] = quoted(step('UX-08-07').s);
    const rich = page.locator(`${rowOf(refs.richAnswer!)} ${byTid(TID.bubbleFoo)}`);
    await frameAt(page, rowOf(refs.richAnswer!));
    await expect(rich).toHaveAttribute('data-rich', 'true');
    await expect(rich).toContainText(title!);
    await expect(rich.locator('table')).toBeVisible();
    await expect(rich).toContainText(source!);
    await shoot('UX-08-07', refs.richAnswer!, TID.bubbleFoo);
  });
  await app.close();
});
