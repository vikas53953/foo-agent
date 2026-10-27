// Spec: 11-fidelity §11.2.3 (one spec per chapter, one test.step per walkthrough step named with its id; assertions: the s
// and f facts by hand, then the Tier R capture), §11.12 item 8 M2 fidelity exit (UX-08, chapter 8 "Just chatting, in your
// language", J7 · R1 · R24), 04 §1–§13 (bubbles, reactions, reply-quote, Hindi/Punjabi, rich answers).
// M2 has no engine, so foo's replies cannot be produced by the steps' actions: the chapter's state is the ux-world seed's
// chapter 8 scene (built from the walkthrough's state objects, test/seed/ux-world.ts), and each step frames the walkthrough's
// highlighted message as the newest row. M3 re-runs the chapter with replies from the fake AI (§11.12 M3): the second test
// does steps 1 to 5 through the real UI, the fake answering the walkthrough's own words (read from golden/manifest.json),
// and captures UX-08-02 (the Thinking face and the Stop button while foo replies, CR-0003), which only a live reply shows.
// The live run starts from the world at 8:06 AM with foo's chat ending at the cake line (seed set ux-world-ch8-live), so
// its rows are the walkthrough's. Steps 1 and 3 to 7 keep their captures from the whole seeded scene. Steps 6 and 7 are not re-run live: the
// walkthrough's result for 6 carries a 🛠 job badge (job runner, M4) and 7's source pill comes from engine entities, not
// from reply text.
// The quoted strings asserted below are read from golden/manifest.json (the frozen walkthrough's own s/f texts).
import { expect, test } from '@playwright/test';
import type {} from '../../../src/shared/ipc';
import { TID } from '../../../src/shared/testids';
import { t } from '../../../src/shared/copy/t';
import { intake, launchWithFakeAi } from '../../e2e/fakeAi';
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

test('UX-08 · Just chatting, in your language: steps 1 to 5 live with fake-AI replies, UX-08-02 captured, light and dark', async () => {
  test.setTimeout(240_000);
  // The fake AI's script, from the walkthrough's words: "thanks!" gets a 👍; the holiday question is answered in two short
  // paragraphs; the Hinglish and Punjabi questions in their own language.
  const thanks = quoted(step('UX-08-01').c)[0]!;
  const holiday = 'is Mon 2 Nov a holiday?';
  const [no, next] = quoted(step('UX-08-03').s);
  const [hiAsk, hiAnswer] = quoted(step('UX-08-04').s);
  const [paAsk, paAnswer] = quoted(step('UX-08-05').s);
  const { app } = await launchWithFakeAi([
    intake(thanks, '', { decision: { kind: 'react', emoji: '👍' } }),
    // Inside the engine's 1.5 s hold on the fake clock, so the answer is a chat-mode reply (04 §12.3).
    intake(holiday, `${no}\n\n${next}`, { delayMs: 1_000 }),
    intake(hiAsk!, hiAnswer!),
    intake(paAsk!, paAnswer!),
  ]);
  const page = await app.firstWindow();
  // The world at 8:06 AM with foo's chat ending at the cake line (seed set ux-world-ch8-live, CR-0007): steps 1 and 2 are sent
  // at the walkthrough's own times (8:06, 8:10), so the UX-08-02 frame is the one the walkthrough draws.
  await openWorld(app, page, '2026-10-16T08:06:00+05:30', 'ux-world-ch8-live');
  await openChat(page, 'foo');
  await page.getByTestId(TID.appPanel).waitFor();
  const log = page.getByTestId(TID.threadLog);
  const field = page.getByTestId(TID.composerField);
  const sendText = async (text: string) => {
    await field.focus();
    await page.keyboard.type(text);
    await page.keyboard.press('Enter');
  };
  const last = (tid: string, text: string) => page.getByTestId(tid).filter({ hasText: text }).last();

  await test.step('UX-08-01 · "thanks!" gets a 👍 on the bubble and no reply', async () => {
    await sendText(thanks);
    // foo's reaction takes the badge slot on the bubble's row (04 §4.1 rule 5).
    const row = last(TID.bubbleMe, thanks).locator('xpath=ancestor::*[@data-message-id][1]');
    await expect(row.getByTestId(TID.bubbleReaction).first()).toContainText('👍');
    await expect(page.getByTestId(TID.threadThinking)).toHaveCount(0);
    // No reply: the thanks row stays the last row (the list is virtual, so a bubble count can drop as rows unmount).
    const id = await row.getAttribute('data-message-id');
    await expect(log.locator('[data-message-id]').last()).toHaveAttribute('data-message-id', id!);
    for (const never of quoted(step('UX-08-01').s)) await expect(log).not.toContainText(never);
  });

  await test.step('UX-08-02 · a real question: the Thinking face, "typing…" and the Stop button', async () => {
    await page.evaluate(() => window.__fooTest!.clock.set('2026-10-16T08:10:00+05:30'));
    await sendText(holiday);
    await expect(last(TID.bubbleMe, holiday)).toBeVisible();
    const thinking = page.getByTestId(TID.threadThinking);
    await expect(thinking).toBeVisible();
    // 04 §14.3: the speaker's face in the Thinking mood, no bubble behind it.
    await expect(thinking.locator('[data-mood="thinking"]')).toHaveCount(1);
    // "typing…" under foo's name: the chat-list row (03-shell-1 §3.4.6 rule 1).
    const fooRow = page
      .getByTestId(TID.chatlistRow)
      .filter({ has: page.getByTestId(TID.chatlistRowName).getByText('foo', { exact: true }) })
      .first();
    await expect(fooRow.getByTestId(TID.chatlistRowPreview)).toContainText(t('chatlist.row.preview.typing'));
    await expect(page.getByTestId(TID.composerSend)).toHaveAttribute('data-state', 'stop');
    // CR-0066 (X-223): no 👀 on the question while the Thinking row is up, also past CR-0059's 2 s hold (real time).
    const ask = last(TID.bubbleMe, holiday).locator('xpath=ancestor::*[@data-message-id][1]');
    await page.waitForTimeout(3_000);
    await expect(thinking).toBeVisible();
    await expect(ask.locator(`${byTid(TID.bubbleBadge)}[data-state="seen"]`)).toHaveCount(0);
    await log.evaluate((el) => (el.scrollTop = el.scrollHeight));
    await rest(page);
    for (const theme of THEMES) {
      await setTheme(page, theme);
      await settle(page);
      // The walkthrough highlights foo's thinking face itself (28 × 34), not the whole Thinking row.
      await captureUx(page, 'UX-08-02', `${byTid(TID.threadThinking)} [data-mood="thinking"]`, theme);
    }
    await setTheme(page, 'light');
  });

  await test.step('UX-08-03 · a short answer comes as one bubble (CR-0024 F2; the walkthrough drew two), no filler', async () => {
    await page.evaluate(() => window.__fooTest!.clock.advance(1_000));
    await expect(last(TID.bubbleFoo, no!)).toBeVisible();
    // CR-0024 F2: both paragraphs in one bubble, a run of its own under foo's label.
    await expect(last(TID.bubbleFoo, no!)).toContainText(next!);
    await expect(last(TID.bubbleFoo, next!)).toHaveAttribute('data-pos', 'single');
    await expect(page.getByTestId(TID.threadThinking)).toHaveCount(0);
    await expect(page.getByTestId(TID.composerSend)).toHaveAttribute('data-state', 'mic');
    for (const filler of quoted(step('UX-08-03').f)) await expect(log).not.toContainText(filler);
  });

  await test.step('UX-08-04 · Hinglish in, Hinglish out', async () => {
    await sendText(hiAsk!);
    await expect(last(TID.bubbleFoo, hiAnswer!)).toBeVisible();
  });

  await test.step('UX-08-05 · Punjabi in its own script, with the taller Indic line', async () => {
    await sendText(paAsk!);
    const bubble = last(TID.bubbleFoo, paAnswer!);
    await expect(bubble).toBeVisible();
    await expect(bubble).toHaveAttribute('lang', 'pa');
    expect(await bubble.locator('[data-copy]').evaluate((el) => getComputedStyle(el).lineHeight)).toBe('24px');
  });
  await app.close();
});
