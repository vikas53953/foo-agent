// Spec: 11-fidelity §11.2.3 (one spec per chapter, one test.step per walkthrough step named with its id; the s and f facts
// by hand, then the Tier R capture), §11.12 M4 fidelity exit (UX-23 steps 1–6, 9 and 11 first tested in M4), 05-3 §5.19
// (Stuck card), §5.20 (Error card and its recovery variant; offline shows no card, X-13), 08-3 §21.2 (error words and the one
// button per kind), 03-shell-1 §3.3 (banner strip), 04 §3.3 (the Clock tick while a message waits), 08-2 §5.6 (watchdog),
// §5.9 (crash recovery), §6.7 (AI error → WAITING), 04-2 §23.5 (the draft survives a restart).
// Every card here comes from the real job runner on the fake AI (08-3 §22.3), in the Trips chat where chapter 23 is drawn,
// with the ux-world's own jobs settled first. Each scene has its own app run, so one outage never leaks into the next.
// Drawing-vs-app gaps (R1/R2 disputes go to a CR, never into code):
// - The world: chapter 23 draws Trips holding only the Goa stay checklist; the ux-world's Trips chat also holds its M2
//   bubble gallery and its flights job, so the frame's other words differ. The job's rows are catalogue phrases (08-4 §26.1).
// - UX-23-04: the drawn card's "Use ChatGPT instead" link needs a verified backup AI; the fake AI is one provider and the
//   M4 card carries only its one button, so hl is "Try again" (cardErrorFix).
// - UX-23-05: the fake AI reports AI_LIMIT with no reset time, so the card reads the no-reset words (08-3 §21.2) instead of
//   "until Fri 16 Oct, 3:00 PM"; a backup-AI reply cannot be produced live (one provider), so hl is the ux-world's seeded
//   backup-marked bubble (04 §12.5, "answered with ChatGPT while Claude rests"), framed as the newest row.
// - UX-23-06: the drawn stuck card is the 3-minute no-progress rule on MakeMyTrip with "about ₹6 · 9 minutes"; M4 has no
//   browser (M9), so the fail-streak rule fires (three unusable step answers in a row) and the card's words are the runner's;
//   "Take over" is drawn only for a browser job (05-3 §5.19), so the card has Try another way and Stop.
// - UX-23-09: the restart is a real kill and relaunch on the same data folders; a fresh run's clock starts at the PC's time,
//   so the recovery card's own time label is the test clock's start (9:00 AM), not the drawn 9:42 AM; its "closed at
//   9:42 AM" line is the job's last progress, as drawn.
// - UX-23-11: the drawn one-liners are connector and site problems (Gmail expired, WhatsApp unlinked: M8; a blocked site
//   needs the M9 browser's SITE_BLOCKED). M4's runner raises the one-line UNKNOWN card ("Nothing was booked, paid or sent",
//   one fixing button), captured with its button as hl.
import { expect, test, type ElectronApplication, type Locator, type Page } from '@playwright/test';
import type {} from '../../../src/shared/ipc';
import { t } from '../../../src/shared/copy/t';
import type { PlanStep } from '../../../src/shared/schemas';
import { TID } from '../../../src/shared/testids';
import { launchWithFakeAi, VERIFY_OK, type FakeLine } from '../../e2e/fakeAi';
import type { testDirs } from '../../e2e/launch';
import { settleSeededJobs } from '../../e2e/m4-start';
import {
  byTid,
  captureUx,
  frameAt,
  openChat,
  openWorld,
  quoted,
  rest,
  rowOf,
  setTheme,
  settle,
  step,
  THEMES,
  windowSize,
} from '../capture';

type Dirs = ReturnType<typeof testDirs>;
/** The Goa ask the ux-world's chapter 1 line makes (test/seed/ux-world.ts, foo's chat). */
const GOA_ASK = 'ok book the Goa hotel then, under ₹8,000 a night, near the beach';
const act = (decision: Record<string, unknown>) => `<say></say><act>${JSON.stringify({ decision, usedMemoryIds: [] })}</act>`;
const GOA_PLAN: PlanStep[] = [
  { phraseKey: 'check_sites', slots: { sites: '3 hotel sites' }, route: 'api' },
  { phraseKey: 'shortlist', slots: { n: '3', what: 'hotels', rule: 'your budget' }, route: 'api' },
  { phraseKey: 'fill_details', slots: { site: 'makemytrip.com' }, route: 'api' },
  { phraseKey: 'wait_approve', slots: {}, route: 'api' },
];
/** Under the Plan card's threshold (08-2 §5.3.2), so the job starts at once as the drawn one has. */
const jobLine = (ask: string, title: string, plan = GOA_PLAN): FakeLine => ({
  match: { purpose: 'intake', promptIncludes: ask },
  reply: act({ kind: 'job', title, plan, estimate: { minutes: 2 }, routeHint: ['api'], needsApps: [] }),
});
const stepLine = (decision: Record<string, unknown>, delayMs = 500, extra: Partial<FakeLine> = {}): FakeLine => ({
  match: { purpose: 'step' },
  reply: act(decision),
  delayMs,
  ...extra,
});
/** A step turn that never ends inside the test (the job stays WORKING on that step). */
const HOLD: FakeLine = { match: { purpose: 'step' }, reply: act({ kind: 'step_done', idx: 3 }), delayMs: 3_600_000 };

/** The fake clock in small steps, so each held AI turn starts its own delay after the one before it ends. */
async function advance(page: Page, ms: number, by = 250): Promise<void> {
  for (let at = 0; at < ms; at += by) {
    await page.evaluate((n) => window.__fooTest!.clock.advance(n), by);
    await page.waitForTimeout(20);
  }
}

/** The message row (`data-message-id`) that holds a bubble or a card, so a capture selector can name it in CSS. */
async function rowId(el: Locator): Promise<string> {
  const id = await el.locator('xpath=ancestor::*[@data-message-id][1]').getAttribute('data-message-id');
  if (!id) throw new Error('not inside a message row');
  return id;
}

/** The ux-world on the fake AI, its own jobs settled, Trips open (chapter 23's chat). */
async function startTrips(script: FakeLine[], dirs?: Dirs) {
  const run = await launchWithFakeAi([VERIFY_OK, ...script], dirs ? { dirs } : {});
  const page = await run.app.firstWindow();
  const refs = await openWorld(run.app, page);
  await settleSeededJobs(page, refs);
  await openChat(page, 'Trips');
  return { ...run, page, refs, log: page.getByTestId(TID.threadLog) };
}

async function send(page: Page, text: string, enter = true): Promise<void> {
  await page.getByTestId(TID.composerField).focus();
  await page.keyboard.type(text);
  if (enter) await page.keyboard.press('Enter');
}

/** Both themes, the log at its end unless the step framed a row itself. */
async function shoot(page: Page, id: string, sel: string, toEnd = true): Promise<void> {
  if (toEnd) await page.getByTestId(TID.threadLog).evaluate((el) => (el.scrollTop = el.scrollHeight));
  await rest(page);
  for (const theme of THEMES) {
    await setTheme(page, theme);
    await settle(page);
    await captureUx(page, id, sel, theme);
  }
  await setTheme(page, 'light');
}

const close = (app: ElectronApplication) => app.close().catch(() => undefined);

test('UX-23 · When things go wrong: steps UX-23-01 to UX-23-06, UX-23-09 and UX-23-11 from the real runner, light and dark', async () => {
  test.setTimeout(600_000);

  await test.step('UX-23-01, UX-23-02, UX-23-03 · offline: the strip, a kept message with a clock, back online', async () => {
    const queued = 'also check W Goa';
    const { app, page, log } = await startTrips([
      jobLine(GOA_ASK, 'Goa stay'),
      stepLine({ kind: 'step_done', idx: 0 }),
      stepLine({ kind: 'step_done', idx: 1 }),
      // Step 3 of 4 is in flight when the network drops; the resumed job asks again for the same step (held, so the
      // checklist reads step 3 of 4 while it is captured).
      stepLine({ kind: 'step_done', idx: 2 }, 600_000),
      stepLine({ kind: 'step_done', idx: 2 }, 600_000),
    ]);
    await send(page, GOA_ASK);
    const checklist = log.getByTestId(TID.cardChecklist).filter({ hasText: 'makemytrip.com' });
    await advance(page, 3_000);
    await expect(checklist).toHaveCount(1);
    const checklistRow = await rowId(checklist);
    // 05-3 §5.20 / X-13: offline raises no error card (the ux-world's Trips already holds a recovery card of its own).
    const offlineCards = log.getByTestId(TID.cardError).filter({ hasText: t('errors.net_offline.what_happened') });

    // UX-23-01: the strip under the title bar, the composer's offline line, no error card (X-13).
    await page.evaluate(() => window.__fooTest!.setOnline(false));
    await advance(page, 10_000);
    const banner = page.getByTestId(TID.bannerStrip);
    await expect(banner).toHaveAttribute('data-state', 'offline');
    await expect(banner).toContainText(t('banner.offline.text'));
    await expect(page.getByTestId(TID.bannerAction)).toHaveText(t('banner.offline.action'));
    await expect(page.getByText(t('composer.placeholder.offline'))).toBeVisible();
    await expect(offlineCards).toHaveCount(0);
    await shoot(page, 'UX-23-01', byTid(TID.bannerStrip));

    // UX-23-02: typed while offline, kept with the Clock tick and no badge (04 §3.3, 08-0 §F).
    await send(page, queued);
    const mine = log.locator(byTid(TID.bubbleMe), { hasText: queued }).last();
    await expect(mine.getByTestId(TID.bubbleTick)).toHaveAttribute('data-state', 'waiting');
    const queuedRow = await rowId(mine);
    await shoot(page, 'UX-23-02', `${rowOf(queuedRow)} ${byTid(TID.bubbleMe)}`);

    // UX-23-03: back online, the strip goes, the same job carries on from step 3, the kept message is sent and read.
    await page.evaluate(() => window.__fooTest!.setOnline(true));
    await expect(banner).toHaveCount(0);
    await advance(page, 3_000);
    const rows = page.locator(`${rowOf(checklistRow)} ${byTid(TID.cardChecklistStep)}`);
    // From the same step: steps 1 and 2 stay done, step 3 runs again (08-4 §26.10), never a second checklist.
    await expect(rows.nth(0)).toHaveAttribute('data-state', 'done');
    await expect(rows.nth(1)).toHaveAttribute('data-state', 'done');
    await expect(rows.nth(2)).toHaveAttribute('data-state', 'current');
    await expect(checklist).toHaveCount(1);
    // ✓✓ (04 §3.3: Delivered; Read once the steer's turn takes it, which the held step turn has not yet done).
    await expect(page.locator(`${rowOf(queuedRow)} ${byTid(TID.bubbleTick)}`)).toHaveAttribute('data-state', /delivered|read/);
    await expect(offlineCards).toHaveCount(0);
    await shoot(page, 'UX-23-03', `${rowOf(checklistRow)} ${byTid(TID.cardChecklist)}`);
    await close(app);
  });

  await test.step('UX-23-04 · the AI stops answering: the job waits at its step, nothing lost or paid', async () => {
    const { app, page, log } = await startTrips([
      jobLine(GOA_ASK, 'Goa stay'),
      stepLine({ kind: 'step_done', idx: 0 }),
      stepLine({ kind: 'step_done', idx: 1 }),
      // Two failures in a row rest the provider (08-2 §6.7): the job goes WAITING with one error card.
      { match: { purpose: 'step' }, error: 'AI_SERVICE_DOWN', delayMs: 500 },
      { match: { purpose: 'step' }, error: 'AI_SERVICE_DOWN', delayMs: 500 },
      HOLD,
    ]);
    await send(page, GOA_ASK);
    await advance(page, 5_000);
    const card = log.getByTestId(TID.cardError).last();
    await expect(card).toContainText(t('errors.ai_service_down.what_is_safe', { job: 'Goa stay', n: 3 }));
    await expect(card.getByTestId(TID.cardErrorFix)).toHaveText(t('errors.ai_service_down.button'));
    await shoot(page, 'UX-23-04', `${rowOf(await rowId(card))} ${byTid(TID.cardErrorFix)}`);
    await close(app);
  });

  await test.step('UX-23-05 · plan limit: jobs paused, not lost; plain chat answered by the backup AI', async () => {
    const { app, page, log, refs } = await startTrips([
      jobLine(GOA_ASK, 'Goa stay'),
      stepLine({ kind: 'step_done', idx: 0 }),
      { match: { purpose: 'step' }, error: 'AI_LIMIT', delayMs: 500 },
      HOLD,
    ]);
    await send(page, GOA_ASK);
    await advance(page, 4_000);
    const card = log.getByTestId(TID.cardError).last();
    await expect(card).toContainText(t('errors.ai_limit.what_is_safe.no_reset'));
    await expect(card.getByTestId(TID.cardErrorFix)).toHaveText(t('errors.ai_limit.button.no_reset'));
    // The reply marked as the backup AI's (04 §12.5): the ux-world's own, framed as the newest row.
    const rested = `${rowOf(refs.galleryBackup!)} ${byTid(TID.bubbleHelper)}`;
    await frameAt(page, rowOf(refs.galleryBackup!));
    await settle(page);
    await frameAt(page, rowOf(refs.galleryBackup!));
    await expect(page.locator(`${rowOf(refs.galleryBackup!)} ${byTid(TID.bubbleBackupMark)}`)).toBeVisible();
    await shoot(page, 'UX-23-05', rested, false);
    await close(app);
  });

  await test.step('UX-23-06 · stuck: the runner says so, with the cost so far and a way out', async () => {
    const { app, page, log } = await startTrips([
      jobLine(GOA_ASK, 'Goa stay'),
      stepLine({ kind: 'step_done', idx: 0 }),
      // Three answers in a row the runner cannot use (fail_streak ≥ 3, 08-2 §5.6) → the stuck card.
      { match: { purpose: 'step' }, reply: 'I am not sure what to do next.', delayMs: 500, once: false },
    ]);
    await send(page, GOA_ASK);
    await advance(page, 6_000);
    const card = log.getByTestId(TID.cardStuck).last();
    await expect(card).toBeVisible();
    await expect(card.getByTestId(TID.cardStuckOtherWay)).toBeVisible();
    await expect(card.getByTestId(TID.cardStuckStop)).toBeVisible();
    // 05-3 §5.19: Take over is offered only to a job that uses the browser (M9); this job has no browser step.
    await expect(card.getByTestId(TID.cardStuckTakeOver)).toHaveCount(0);
    await shoot(page, 'UX-23-06', `${rowOf(await rowId(card))} ${byTid(TID.cardStuckOtherWay)}`);
    await close(app);
  });

  await test.step('UX-23-09 · after a crash: a recovery card for the unfinished job, the half-typed message back', async () => {
    const [words, draft] = quoted(step('UX-23-09').s);
    const title = /(\S+ \S+) was at step/.exec(words!)![1]!;
    const flights: PlanStep[] = [
      { phraseKey: 'check_sites', slots: { sites: '3 airline sites' }, route: 'api' },
      { phraseKey: 'compare', slots: { what: 'fares' }, route: 'api' },
      { phraseKey: 'shortlist', slots: { n: '3', what: 'flights', rule: 'your times' }, route: 'api' },
      { phraseKey: 'wait_pick', slots: {}, route: 'api' },
    ];
    // A do-ask whose plan has no acting step, so the engine keeps the AI's title hint (08-4 §26.2 items 1–3).
    const ask = 'book flights to Delhi for Fri 18 Dec';
    const first = await startTrips([jobLine(ask, title, flights), stepLine({ kind: 'step_done', idx: 0 }, 60_000), HOLD]);
    await send(first.page, ask);
    await advance(first.page, 61_000); // step 1 done at 9:42 AM, step 2 running
    await send(first.page, draft!, false);
    await first.page.waitForTimeout(1_000); // the draft's 500 ms save (04-2 §23.5)
    // foo closes unexpectedly: the process is killed, no clean quit (08-1 §4.1.3 launches.json stays unclean).
    first.app.process().kill('SIGKILL');
    await first.app.close().catch(() => undefined);

    const { app } = await launchWithFakeAi([VERIFY_OK, HOLD], { dirs: first.dirs });
    const page = await app.firstWindow();
    await page.getByTestId(TID.titlebarStrip).waitFor();
    await windowSize(app, page, 1280, 800);
    await openChat(page, 'Trips');
    const log = page.getByTestId(TID.threadLog);
    const card = log.getByTestId(TID.cardError).filter({ hasText: title }).last();
    await expect(card).toContainText(t('errors.crash_recovery.what_is_safe', { job: title, n: 2, of: 4 }));
    await expect(card).toContainText(words!.split('.')[0]!);
    await expect(card.getByTestId(TID.cardErrorFix)).toHaveText(t('errors.crash_recovery.button'));
    await expect(card.getByTestId(TID.cardErrorLink)).toHaveText(t('errors.crash_recovery.link'));
    await expect(page.getByTestId(TID.composerField)).toContainText(draft!);
    await shoot(page, 'UX-23-09', `${rowOf(await rowId(card))} ${byTid(TID.cardErrorFix)}`);
    await close(app);
  });

  await test.step('UX-23-11 · a smaller problem: one line, one fixing button', async () => {
    const { app, page, log } = await startTrips([
      jobLine(GOA_ASK, 'Goa stay'),
      stepLine({ kind: 'step_done', idx: 0 }),
      stepLine({ kind: 'fail', reason: 'The hotel site would not open.' }),
    ]);
    await send(page, GOA_ASK);
    await advance(page, 4_000);
    const card = log.getByTestId(TID.cardError).last();
    await expect(card).toContainText(t('errors.unknown.what_happened'));
    await expect(card).toContainText(t('errors.unknown.what_is_safe'));
    await expect(card.getByTestId(TID.cardErrorFix)).toHaveText(t('errors.unknown.button'));
    await shoot(page, 'UX-23-11', `${rowOf(await rowId(card))} ${byTid(TID.cardErrorFix)}`);
    await close(app);
  });
});
