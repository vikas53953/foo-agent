// Spec: 11-fidelity §11.2.3 (one spec per chapter, one test.step per walkthrough step named with its id; the s and f facts
// by hand, then the Tier R capture), §11.12 M4 fidelity exit (UX-05 steps 2 to 4 first tested in M4; the chapter is completed
// by M12), 05-1 §5.2 (Checklist: within 2 s, edited in place), 05-3 §5.15–§5.16 (Proof chip / "Not checked live" chip),
// 04 §4.2 (👀 → 🛠 → ✅ badge), 08-2 §5.8 (done only with a proof the runner checked).
// The job is real: the fake AI (08-3 §22.3) answers the walkthrough's own words, the runner plans, ticks and finishes it.
// Drawing-vs-app gaps (R1/R2 disputes go to a CR, never into code):
// - Chapter 5 is drawn on Day 0 (Thu 15 Oct, 7:48 PM) inside onboarding (M12: "Setting up" pill, the first-jobs chips of
//   step 1, the setup card). The ux-world seed is one world (Fri 16 Oct, 9:41 AM, foo's chat full of later chapters), so the
//   frame's other words and the header pill differ. Step 1 (the chips) is M12 and not captured here.
// - Step 3: the drawn rows "Reading your Gmail (last 30 days)" / "… for trips" are not catalogue phrases (08-4 §26.1); the
//   app draws read_app {app: Gmail}, look_for {what: bills and due dates}, check_calendar, word for word from the catalogue.
// - Step 4: the drawing's chip is "✓ Proof: 3 emails · open" with a ✅ badge and a celebrating face. M4 has no connectors
//   (M8), so the runner cannot re-check an emails_read proof (src/engine/jobs/proof.ts): by Art. 11 the job ends
//   DONE unverified, with the "Not checked live" chip (05-3 §5.16) in the Proof chip's place. That chip is captured as hl.
//   The celebration (02 F4 face moods, first win) is not built in M4.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import type {} from '../../../src/shared/ipc';
import { TID } from '../../../src/shared/testids';
import { launchWithFakeAi, VERIFY_OK, type FakeLine } from '../../e2e/fakeAi';
import { settleSeededJobs } from '../../e2e/m4-start';
import { byTid, captureUx, openChat, openWorld, quoted, rest, rowOf, setTheme, settle, step, THEMES } from '../capture';

const WALKTHROUGH = join('spec', 'refs', 'ux', 'foo-ux-walkthrough.html');
const act = (decision: Record<string, unknown>) => `<say></say><act>${JSON.stringify({ decision, usedMemoryIds: [] })}</act>`;

/** foo's result bubble in the walkthrough's step 4 frame (M.foo('Found 2 bills…<br>…')), as plain lines. */
function drawnResult(first: string): string {
  const html = readFileSync(WALKTHROUGH, 'utf8');
  const at = html.indexOf(`M.foo(\`${first}`);
  if (at === -1) throw new Error(`no "${first}" result in ${WALKTHROUGH}`);
  const body = html.slice(at + 'M.foo(`'.length, html.indexOf('`', at + 'M.foo(`'.length));
  return body.replace(/<br>/g, '\n');
}

/** The fake clock in small steps, so each held AI turn starts its own delay after the one before it ends. */
async function advance(page: Page, ms: number, by = 250): Promise<void> {
  for (let at = 0; at < ms; at += by) {
    await page.evaluate((n) => window.__fooTest!.clock.advance(n), by);
    await page.waitForTimeout(20);
  }
}

test('UX-05 · First real job, inside a minute: steps UX-05-02, UX-05-03 and UX-05-04 live on the fake AI, light and dark', async () => {
  test.setTimeout(240_000);
  // "Find bills due this week": the step 2 bubble, from the walkthrough's own s text.
  const ask = quoted(step('UX-05-02').s)[0]!;
  const [summary] = quoted(step('UX-05-04').s);
  const result = drawnResult(summary!);
  const script: FakeLine[] = [
    VERIFY_OK,
    {
      match: { purpose: 'intake', promptIncludes: ask },
      reply: act({
        kind: 'job',
        title: 'Bills',
        plan: [
          { phraseKey: 'read_app', slots: { app: 'Gmail' }, route: 'api' },
          { phraseKey: 'look_for', slots: { what: 'bills and due dates' }, route: 'api' },
          { phraseKey: 'check_calendar', slots: {}, route: 'api' },
        ],
        estimate: { minutes: 1 },
        routeHint: ['api'],
        needsApps: [],
      }),
      // Held on the fake clock, so 👀 outlasts the 700 ms badge debounce (04 §4.2) and the step 2 frame can be taken.
      delayMs: 1_000,
    },
    { match: { purpose: 'step' }, reply: act({ kind: 'step_done', idx: 0 }), delayMs: 500 },
    // Held so the checklist reads step 2 of 3 while it is captured.
    { match: { purpose: 'step' }, reply: act({ kind: 'step_done', idx: 1 }), delayMs: 20_000 },
    { match: { purpose: 'step' }, reply: act({ kind: 'step_done', idx: 2 }), delayMs: 2_000 },
    {
      match: { purpose: 'step' },
      reply: act({ kind: 'done', result, proof: { kind: 'emails_read', count: 3, messageIds: ['m-airtel', 'm-tata', 'm-indigo'] } }),
      delayMs: 1_000,
    },
  ];
  const { app } = await launchWithFakeAi(script);
  const page = await app.firstWindow();
  // The seeded Goa stay job is live in foo's chat; end it so the ask starts a job instead of steering it (08-2 §5.2).
  await settleSeededJobs(page, await openWorld(app, page));
  await openChat(page, 'foo');
  const log = page.getByTestId(TID.threadLog);
  const mine = log.locator(byTid(TID.bubbleMe), { hasText: ask }).last();
  const badge = mine.locator('xpath=..').getByTestId(TID.bubbleBadge);
  const checklist = log.getByTestId(TID.cardChecklist).filter({ hasText: 'bills and due dates' });
  let checklistRow = '';
  const shoot = async (id: string, sel: string) => {
    await log.evaluate((el) => (el.scrollTop = el.scrollHeight));
    await rest(page);
    for (const theme of THEMES) {
      await setTheme(page, theme);
      await settle(page);
      await captureUx(page, id, sel, theme);
    }
    await setTheme(page, 'light');
  };

  await test.step('UX-05-02 · the ask becomes your bubble with 👀 within a second', async () => {
    await page.getByTestId(TID.composerField).focus();
    await page.keyboard.type(ask);
    await page.keyboard.press('Enter');
    await expect(mine).toBeVisible();
    // CR-0066 (X-223): while foo's Thinking row is up the bubble shows no 👀, also past CR-0059's 2 s hold (real time).
    await expect(page.getByTestId(TID.threadThinking)).toBeVisible();
    await page.waitForTimeout(3_000);
    await expect(page.getByTestId(TID.threadThinking)).toBeVisible();
    await expect(badge.and(page.locator('[data-state="seen"]'))).toHaveCount(0);
    await expect(page.getByTestId(TID.composerSend)).toHaveAttribute('data-state', 'stop');
    await shoot('UX-05-02', `${rowOf(await rowId(mine))} ${byTid(TID.bubbleMe)}`);
  });

  await test.step('UX-05-03 · a checklist within 2 s that ticks itself off; the badge turns to 🛠', async () => {
    await advance(page, 1_000); // the intake answers: a job starts
    await expect(badge).toHaveAttribute('data-state', 'working');
    // 08-2 §5.4.2: the checklist is posted 1.5 s after the start (step_count ≥ 2), by 2 s (PERF-08); step 1 ends at 0.5 s.
    // The log is virtual: keep it at its end so the new card's row is in the DOM.
    const toEnd = () => log.evaluate((el) => (el.scrollTop = el.scrollHeight));
    for (let ms = 0; ms < 2_000 && (await toEnd(), await checklist.count()) === 0; ms += 250) await advance(page, 250);
    await toEnd();
    await expect(checklist).toHaveCount(1);
    const rows = checklist.getByTestId(TID.cardChecklistStep);
    await expect(rows.nth(0)).toHaveAttribute('data-state', 'done');
    await expect(rows.nth(1)).toHaveAttribute('data-state', 'current');
    await expect(rows.nth(2)).toHaveAttribute('data-state', 'next');
    // f: no "ok, on it" messages: nothing but the checklist was added under the ask.
    for (const never of quoted(step('UX-05-03').f)) await expect(log).not.toContainText(never);
    checklistRow = await rowId(checklist);
    await shoot('UX-05-03', `${rowOf(checklistRow)} ${byTid(TID.cardChecklist)}`);
  });

  await test.step('UX-05-04 · inside a minute: the result with its proof chip; the checklist edited in place', async () => {
    await advance(page, 24_000);
    const answer = log.locator(byTid(TID.bubbleFoo), { hasText: summary! }).last();
    await expect(answer).toBeVisible();
    for (const line of quoted(step('UX-05-04').s).slice(0, 1)) await expect(answer).toContainText(line);
    await expect(answer).toContainText('Airtel ₹1,179');
    // The same checklist, edited in place: DONE collapses it to its summary row (05-1 §5.2), no second card.
    await expect(page.locator(`${rowOf(checklistRow)} ${byTid(TID.cardChecklist)}`)).toHaveAttribute('data-state', 'done_unverified');
    await expect(log.getByTestId(TID.cardChecklist).filter({ hasText: 'bills and due dates' })).toHaveCount(0);
    // M4 cannot re-check an emails_read proof (no connectors until M8): DONE unverified, the "Not checked live" chip (Art. 11).
    await expect(badge).toHaveAttribute('data-state', 'done_unverified');
    await expect(log.getByTestId(TID.threadNotLiveChip)).toHaveCount(1);
    await expect(log.getByTestId(TID.threadProofChip)).toHaveCount(0);
    await shoot('UX-05-04', byTid(TID.threadNotLiveChip));
  });
  await app.close();
});

/** The message row (`data-message-id`) that holds a bubble or a card, so a capture selector can name it in CSS. */
async function rowId(el: Locator): Promise<string> {
  const id = await el.locator('xpath=ancestor::*[@data-message-id][1]').getAttribute('data-message-id');
  if (!id) throw new Error('not inside a message row');
  return id;
}
