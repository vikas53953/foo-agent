// Spec: 11-fidelity §11.2.3 (one spec per chapter, one test.step per walkthrough step named with its id; the s and f facts by
// hand, then the Tier R capture), 06-3 §11.2 (the Watch live window: "{job} · foo", the bar "{job} · step n of m", LIVE,
// [ Take over ] [ Stop ], the picture is never the page, the in-control bar with only [ Hand back to {agentName} ] and Stop),
// 08-2 §5.7 (stop: halt, CANCELLED, approvals WITHDRAWN, the report built only from activity rows), 08-4 §26.9 (a typed
// "stop" / "Stop everything"), X-95, X-121, X-135, AT-079, AT-080, AT-272, CR-0013 (UX-15-03…09; UX-15-01 superseded by
// 06 §0.11, UX-15-02 by X-95, UX-15-10 is M13's replay).
// The world is test/e2e/m9-live.spec.ts's (ux-world, the fake AI, FOO_FAKE_BROWSER frames already masked at source, through
// the real screencast → main → live.html); UX-15-07 adds the fake Google of the M8 drafts world so the email is really sent
// by the job before the stop. Frames are drawn on Fri 16 Oct from 9:41 AM (11:06 AM for UX-15-07).
// Drawing-vs-app gaps (R1/R2 disputes go to a CR, never into code):
// - fake world names: the drawn "Delhi flights" chat is the ux-world's Trips "Flights for 12 Dec" job; the drawn three jobs of
//   UX-15-09 are Goa stay, Airtel bill ₹1,179 and Gas cylinder here; the drawn makemytrip.com page is the fixture frame;
// - UX-15-03: the drawn tooltip words are 06-3 §11.2's ("This is a picture of foo's browser. Take over to use the page
//   yourself."); the drawn "Live" is the LIVE pill;
// - UX-15-04: the drawn "✋ You're in control. foo is paused." is X-121's control bar "You're in control in Edge. foo is
//   paused." (foo's live window is a picture; the user works in the real Edge);
// - UX-15-06: the drawn "Nothing was booked or paid." is 08-2 §5.7's report "Stopped. Nothing was booked, paid or sent.";
// - UX-15-07: 08-2 §5.7 puts the activity summary into the report as written, and 06-3 §9.4's summary is "Sent an email to
//   {name}", so the report reads "I'd already Sent an email to Rakesh Sharma at 11:06 AM" (spec gap for the CR).
// This seeded world has no live browser behind the job, so the engine's job.takeOver cannot answer here: UX-15-04's in-control
// state is sent the way main sends it (`live:state taken_over`, as AT-272 does), and UX-15-05 runs in its own test on a real
// browser job (test/e2e/m9-lanes.ts) where Take over adds the checklist row "You took over" and Hand back posts "Carrying on
// from here." (CR-0030 pick 3). UX-15-08 is foo's chat ⋯ → "Stop everything…" → dialog C-13 (06-3 §14, CR-0030 pick 2);
// UX-15-09 is the combined report in foo's chat (CR-0030 pick 1). App gap (reported): no "Pause all routines" link under the
// report, because `routine:pauseAll` (08-1 §3.2, J14 / J20) belongs to the paused M7 / M11.
import { expect, test, type Page } from '@playwright/test';
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { t } from '../../../src/shared/copy/t';
import { TID } from '../../../src/shared/testids';
import type { FakeLine } from '../../e2e/fakeAi';
import { advance, jobState } from '../../e2e/m4-start';
import { ASK_LANDLORD, draftsGoogle, LANDLORD, LANDLORD_BODY, waitForDraft } from '../../e2e/m8-drafts-world';
import { say } from '../../e2e/m9-booking-world';
import { fooSaid, laneRun, tool } from '../../e2e/m9-lanes';
import { openLive, sendLiveState, setThemeBoth, sizeWindow, startLive } from '../../e2e/m9-live-world';
import { byTid, captureUx, openChat, quoted, rest, setTheme, settle, step, THEMES } from '../capture';

const LIVE = '/windows/live.html';

/** Both themes of a main-window frame, the log at its end. */
async function shoot(page: Page, id: string, sel: string): Promise<void> {
  await page.getByTestId(TID.threadLog).evaluate((el) => (el.scrollTop = el.scrollHeight));
  await rest(page);
  for (const theme of THEMES) {
    await setTheme(page, theme);
    await settle(page);
    await captureUx(page, id, sel, theme);
  }
  await setTheme(page, 'light');
}

/** Both themes of a live-window frame (1280 × 800, as the walkthrough draws it). */
async function shootLive(page: Page, live: Page, id: string, sel: string): Promise<void> {
  await live.mouse.move(1, 1);
  await live.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (const theme of THEMES) {
    await setThemeBoth(page, live, theme);
    await captureUx(live, id, sel, theme);
  }
  await setThemeBoth(page, live, 'light');
}

const lastText = (page: Page, text: string) => page.getByTestId(TID.threadLog).getByText(text, { exact: true }).last();

test('UX-15 · Watch live, take over, stop: steps UX-15-03, UX-15-04, UX-15-06, UX-15-08 and UX-15-09, light and dark', async () => {
  test.setTimeout(240_000);
  const w = await startLive();
  const { app, page, refs } = w;
  try {
    const goa = refs.goaJob!;
    const agentName = await page.evaluate(async () => {
      const r = await window.foo.invoke('settings:get', {});
      return r.ok ? r.value.identity.agentName : 'foo';
    });
    const live = await openLive(app, page, goa);
    await sizeWindow(app, live, LIVE, 1280, 800);

    await test.step('UX-15-03 · Watch live opens the real window: "Goa stay · foo", LIVE, Take over · Stop; the picture takes no clicks', async () => {
      const s = step('UX-15-03');
      expect(s.s).toContain('Take over · Stop');
      // a normal window in the taskbar, titled "{job} · foo"
      expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((x) => x.getTitle()))).toContain(
        t('live.window.title', { job: 'Goa stay' }),
      );
      expect(quoted(s.s)[0]).toBe(t('live.window.title', { job: 'Goa stay' }));
      const root = live.getByTestId(TID.liveRoot);
      for (let i = 0; i < 20 && (await root.getAttribute('data-state')) !== 'live'; i++) {
        await advance(page, 250);
        await live.waitForTimeout(150);
      }
      await expect(root).toHaveAttribute('data-state', 'live');
      await expect(live.getByTestId(TID.liveBar)).toContainText('Goa stay');
      await expect(live.getByTestId(TID.livePill)).toHaveText(t('live.window.pill.live'));
      await expect(live.getByTestId(TID.livePicture).locator('img')).toBeVisible();
      await expect(live.getByTestId(TID.livePicture)).toHaveAttribute('data-masked', 'true');
      await expect(live.getByTestId(TID.liveTakeOver)).toHaveText(t('live.window.take_over'));
      await expect(live.getByTestId(TID.liveStop)).toHaveText(t('live.window.stop'));
      await shootLive(page, live, 'UX-15-03', byTid(TID.liveTakeOver));
      // f: a click on the page is not a click on the page; it only says why.
      await live.getByTestId(TID.livePicture).click({ position: { x: 300, y: 300 } });
      await expect(live.getByRole('tooltip')).toHaveText(t('live.window.picture_tooltip'));
      await expect(root).toHaveAttribute('data-state', 'live');
    });

    await test.step('UX-15-04 · Take over: the in-control bar with only Hand back to foo · Stop', async () => {
      const s = step('UX-15-04');
      expect(s.s).toContain('Hand back to foo · Stop');
      await live.getByTestId(TID.liveTakeOver).click();
      // main tells the window foo is paused because the user took over (no live browser here for T7's job.takeOver; AT-272 seeds it the same way)
      await sendLiveState(app, goa, 'taken_over');
      await expect(live.getByTestId(TID.liveRoot)).toHaveAttribute('data-state', 'in_control');
      await expect(live.getByTestId(TID.livePill)).toHaveText(t('live.window.pill.in_control'));
      await expect(live.getByTestId(TID.liveControlBar)).toContainText(t('live.window.control_bar', { agentName }));
      await expect(live.getByTestId(TID.liveHandBack)).toHaveText(t('live.window.hand_back', { agentName }));
      await expect(live.getByTestId(TID.liveTakeOver)).toHaveCount(0);
      await expect(live.getByRole('button')).toHaveCount(2);
      // f: foo makes no clicks until you hand back: the job is still working, not stopped.
      expect(w.db().prepare('SELECT state FROM jobs WHERE id = ?').pluck().get(goa)).toBe('working');
      await shootLive(page, live, 'UX-15-04', byTid(TID.liveHandBack));
    });

    // UX-15-05 runs on a real browser job below (the seeded Goa stay has no browser behind it for job.takeOver).
    await live.getByTestId(TID.liveHandBack).click();
    await sendLiveState(app, goa, 'running');
    await expect(live.getByTestId(TID.liveRoot)).toHaveAttribute('data-state', 'live');
    await page.bringToFront();

    await test.step('UX-15-06 · typing "stop" in a job’s chat: ⛔ and "Stopped. Nothing was booked, paid or sent."', async () => {
      const s = step('UX-15-06');
      expect(quoted(s.s)[0]).toBe('stop');
      await openChat(page, 'Trips');
      await say(page, 'stop');
      const report = lastText(page, t('thread.stop.report.nothing'));
      await expect(report).toBeVisible({ timeout: 15_000 });
      await expect(
        page
          .getByTestId(TID.threadLog)
          .locator(`${byTid(TID.bubbleBadge)}[data-state="stopped"]`)
          .first(),
      ).toBeVisible();
      // f: halted at once, from the activity log (it has nothing done for this job), the job CANCELLED by the user's word.
      expect(w.db().prepare('SELECT state, stop_reason FROM jobs WHERE id = ?').get(refs.tripsJob!)).toEqual({
        state: 'cancelled',
        stop_reason: 'user_word',
      });
      const row = report.locator('xpath=ancestor-or-self::*[@data-message-id][1]');
      await shoot(page, 'UX-15-06', `${byTid(TID.threadLog)} [data-message-id="${await row.getAttribute('data-message-id')}"]`);
    });

    const routine = () => w.db().prepare("SELECT state, next_run_at, schedule FROM routines WHERE title = 'Morning brief'").get();
    const before = routine();
    await test.step('UX-15-08 · "Stop everything" (header ⋯) asks once: Stop all · Cancel; only jobs stop, routines keep their schedule', async () => {
      const s = step('UX-15-08');
      expect(s.f).toContain('Routines carry on');
      expect(before).toBeTruthy();
      // three jobs running: Goa stay (foo), Airtel bill (Money), Gas cylinder (Home)
      await jobState(page, refs.moneyJob!, 'working');
      await jobState(page, refs.homeJob!, 'working');
      await openChat(page, 'foo');
      const running = w
        .db()
        .prepare("SELECT COUNT(*) FROM jobs WHERE state IN ('queued', 'working', 'needs_you', 'waiting')")
        .pluck()
        .get() as number;
      expect(running).toBeGreaterThanOrEqual(3);
      // CR-0030 pick 2: foo's chat ⋯ → "Stop everything…" → C-13 (06-3 §14).
      await page.getByTestId(TID.chatHeaderMore).click();
      await page.getByTestId(TID.chatHeaderMenuStopEverything).click();
      const dialog = page.getByTestId(TID.dialogC13);
      await expect(dialog).toContainText(t('dialog.c_13.title', { count: running }));
      await expect(dialog).toContainText(t('dialog.c_13.body'));
      await expect(dialog.getByTestId(TID.dialogPrimary)).toHaveText(t('dialog.c_13.primary'));
      await expect(dialog.getByTestId(TID.dialogSecondary)).toHaveText(t('dialog.c_13.secondary'));
      // f: asking stops nothing.
      expect(w.db().prepare('SELECT state FROM jobs WHERE id = ?').pluck().get(goa)).toBe('working');
      await shoot(page, 'UX-15-08', byTid(TID.dialogC13));
      await dialog.getByTestId(TID.dialogPrimary).click();
      await expect
        .poll(
          () =>
            w
              .db()
              .prepare('SELECT id FROM jobs WHERE id IN (?, ?, ?) AND state = ? AND stop_reason = ?')
              .pluck()
              .all(goa, refs.moneyJob!, refs.homeJob!, 'cancelled', 'stop_all').length,
        )
        .toBe(3);
      expect(routine()).toEqual(before);
    });

    await test.step('UX-15-09 · one plain report in foo’s chat of what stopped; the approvals of those jobs are withdrawn', async () => {
      const s = step('UX-15-09');
      expect(s.f).toContain('Approvals for those jobs are withdrawn');
      // Goa stay's Payment approval (₹14,600) is WITHDRAWN, never left open.
      await expect
        .poll(() => w.db().prepare('SELECT state FROM approvals WHERE job_id = ? ORDER BY created_at DESC LIMIT 1').pluck().get(goa))
        .toBe('WITHDRAWN');
      // The combined report (J18, C-13; CR-0030 pick 1) from the stopped jobs' activity rows: nothing was done by them.
      const titles = w.db().prepare("SELECT title FROM jobs WHERE stop_reason = 'stop_all'").pluck().all() as string[];
      // First the database: the line is written in foo's chat (the engine's last write of the stop), then the thread shows it.
      const lead = `Stopped ${titles.length} jobs:`;
      const written = () =>
        w
          .db()
          .prepare(
            "SELECT m.text FROM messages m JOIN chats c ON c.id = m.chat_id WHERE c.kind = 'foo' AND c.private = 0 AND m.text LIKE ? ORDER BY m.seq DESC LIMIT 1",
          )
          .pluck()
          .get(`${lead}%`) as string | undefined;
      await expect.poll(written, { timeout: 15_000, message: 'the combined report is written in foo’s chat' }).toBeTruthy();
      await openChat(page, 'foo');
      const report = page.getByTestId(TID.threadLog).locator(byTid(TID.bubbleFoo), { hasText: lead }).last();
      await expect(report).toBeVisible({ timeout: 15_000 });
      await expect(report).toContainText(lead);
      for (const title of titles) await expect(report).toContainText(title);
      await expect(report).toContainText(t('thread.stop.all.nothing'));
      expect(w.db().prepare("SELECT COUNT(*) FROM activity WHERE event = 'stopped_all'").pluck().get()).toBe(1);
      expect(routine()).toEqual(before);
      const row = report.locator('xpath=ancestor-or-self::*[@data-message-id][1]');
      await shoot(page, 'UX-15-09', `${byTid(TID.threadLog)} [data-message-id="${await row.getAttribute('data-message-id')}"]`);
    });
  } finally {
    await w.close();
  }
});

const act = (decision: Record<string, unknown>) => `<say></say><act>${JSON.stringify({ decision, usedMemoryIds: [] })}</act>`;

test('UX-15 · Watch live, take over, stop: step UX-15-07 (stop after a real send: the report says what was already done), light and dark', async () => {
  test.setTimeout(180_000);
  const google = await draftsGoogle();
  // The job drafts the email, and is still working (its next AI turn is held on the fake clock) when the user sends it and
  // then types "stop": the report is built from the job's activity rows, which hold the real sent_email row.
  const lines: FakeLine[] = [
    { match: { purpose: 'verify' }, reply: 'ready', once: false },
    { match: { purpose: 'second_look' }, reply: `<say></say><act>${JSON.stringify({ match: true })}</act>`, once: false },
    {
      match: { purpose: 'intake', promptIncludes: ASK_LANDLORD },
      reply: act({
        kind: 'job',
        title: 'Reply to landlord',
        plan: [
          { phraseKey: 'draft', slots: { channel: 'email' }, route: 'api' },
          { phraseKey: 'check_calendar', slots: {}, route: 'api' },
        ],
        estimate: { minutes: 2 },
        routeHint: ['api'],
        needsApps: [],
      }),
    },
    {
      match: { purpose: 'step' },
      reply: act({
        kind: 'tool',
        call: { tool: 'gmail.draft', args: { to: [LANDLORD.name], body: LANDLORD_BODY, replyToMessageId: 'm_rent' } },
        why: 'next',
      }),
    },
    { match: { purpose: 'step' }, reply: act({ kind: 'step_done', idx: 0 }), delayMs: 30 * 60_000 },
  ];
  const w = await startLive('2026-10-16T11:06:00+05:30', lines, { FOO_FAKE_GOOGLE: google.url });
  const { page, refs } = w;
  try {
    for (const id of [refs.goaJob, refs.tripsJob]) if (id) await jobState(page, id, 'done');
    await openChat(page, 'Home');
    await say(page, ASK_LANDLORD);
    const cardId = await waitForDraft(page, 0);
    const draft = page.locator(`${byTid(TID.cardDraft)}[data-card-id="${cardId}"]`);

    await test.step('UX-15-07 · "Stopped. I’d already sent the email to Rakesh at 11:06 AM, that can’t be unsent. Nothing else was done."', async () => {
      const s = step('UX-15-07');
      expect(s.s).toContain("that can't be unsent");
      await draft.getByTestId(TID.cardDraftSend).click();
      await expect(draft).toHaveAttribute('data-card-state', 'undo_window');
      for (let i = 0; i < 14 && (await draft.getAttribute('data-card-state')) !== 'sent'; i++) {
        await advance(page, 500);
        await page.waitForTimeout(40);
      }
      await expect(draft).toHaveAttribute('data-card-state', 'sent', { timeout: 10_000 });
      expect(google.drafts.calls.at(-1)).toBe('send:r_1');
      const job = w.db().prepare('SELECT id, state FROM jobs WHERE chat_id = ? ORDER BY created_at DESC LIMIT 1').get(refs.home!) as {
        id: string;
        state: string;
      };
      expect(job.state).toBe('working');

      await say(page, 'stop');
      const said = t('thread.stop.report.partial', { summary: `Sent an email to ${LANDLORD.name}`, time: '11:06 AM' });
      const report = lastText(page, said);
      await expect(report).toBeVisible({ timeout: 15_000 });
      // f: Stop never undoes the send, and the open cards of the job are withdrawn (the sent Draft stays sent).
      expect(w.db().prepare('SELECT state, stop_reason FROM jobs WHERE id = ?').get(job.id)).toEqual({
        state: 'cancelled',
        stop_reason: 'user_word',
      });
      await expect(draft).toHaveAttribute('data-card-state', 'sent');
      expect(google.drafts.sent).toHaveLength(1);
      const row = report.locator('xpath=ancestor-or-self::*[@data-message-id][1]');
      await shoot(page, 'UX-15-07', `${byTid(TID.threadLog)} [data-message-id="${await row.getAttribute('data-message-id')}"]`);
    });
  } finally {
    await w.close();
    await google.close();
  }
});

const STAY_ASK = 'find a beach stay for 2 nights and fill in my details';
const stepDone = (idx: number): FakeLine => ({ match: { purpose: 'step' }, reply: act({ kind: 'step_done', idx }) });
/** A step turn held on the fake clock, so the job stays WORKING at its second step (until the turn's own timeout: the waits
 * below move the clock only until the hold starts). */
const hold: FakeLine = { ...tool('browser.snapshot', {}), delayMs: 6 * 60 * 60_000 };

test('UX-15 · Watch live, take over, stop: step UX-15-05 (take over and hand back on a real browser job), light and dark', async () => {
  test.setTimeout(240_000);
  const run = await laneRun((sites) => [
    { match: { purpose: 'verify' }, reply: 'ready', once: false },
    {
      match: { purpose: 'intake', promptIncludes: STAY_ASK },
      reply: act({
        kind: 'job',
        title: 'Beach stay',
        plan: [
          { phraseKey: 'check_site', slots: { site: 'the stay site' }, route: 'browser' },
          { phraseKey: 'fill_details', slots: { site: '127.0.0.1' }, route: 'browser' },
          { phraseKey: 'look_for', slots: { what: '2 nights by the beach' }, route: 'browser' },
          { phraseKey: 'show_before', slots: { acting: 'booking' }, route: 'browser' },
        ],
        estimate: { minutes: 5 },
        routeHint: ['browser'],
        needsApps: [],
      }),
    },
    tool('browser.open', { url: sites.signin() }),
    stepDone(0),
    hold,
    hold,
  ]);
  const { page } = run;
  const db = new Database(join(run.dirs.FOO_DATA_DIR, 'data', 'foo.db'), { readonly: true, fileMustExist: true });
  try {
    const steps = () => run.turns().filter((x) => x.purpose === 'step').length;
    const checklist = page.getByTestId(TID.threadLog).locator(byTid(TID.cardChecklist)).filter({ hasText: 'Beach stay' });
    const go = page.getByTestId(TID.cardPlanGo);
    // What the database holds, for a failure message: the job and its cards.
    const seen = () =>
      JSON.stringify({
        jobs: db.prepare("SELECT title, state, chat_id FROM jobs WHERE title = 'Beach stay'").all(),
        cards: db
          .prepare("SELECT c.type, c.state, c.chat_id FROM cards c JOIN jobs j ON j.id = c.job_id WHERE j.title = 'Beach stay'")
          .all(),
      });
    await run.ask(STAY_ASK);
    await run.until(async () => steps() >= 1 || (await go.count()) > 0, 'the job starts or its plan asks for Go');
    if ((await go.count()) > 0 && steps() === 0) await go.last().click();
    // The clock moves only until the held turn starts (the third step turn); from here the waits are wall-clock only, so the
    // hold never reaches its timeout.
    await run.until(async () => steps() >= 3, 'the job is at its second step');
    await expect(checklist, `the checklist is up: ${seen()}`).toHaveCount(1, { timeout: 15_000 });
    const jobId = db.prepare("SELECT id FROM jobs WHERE title = 'Beach stay' ORDER BY created_at DESC LIMIT 1").pluck().get() as string;
    expect(db.prepare('SELECT state FROM jobs WHERE id = ?').pluck().get(jobId), seen()).toBe('working');

    await test.step('UX-15-05 · Take over, then hand back: the checklist says "You took over", foo says "Carrying on from here."', async () => {
      const s = step('UX-15-05');
      expect(s.s).toContain('You took over');
      expect(s.s).toContain('Carrying on from here.');
      // Take over from the live window's button (main forwards job:takeOver to the engine, 06-3 §11.2).
      expect(await page.evaluate((id) => window.foo.invoke('job:takeOver', { jobId: id }).then((r) => r.ok), jobId)).toBe(true);
      const took = checklist.locator(`${byTid(TID.cardChecklistStep)}[data-state="took_over"]`);
      await expect(took, `the checklist row "You took over": ${seen()}`).toHaveCount(1, { timeout: 15_000 });
      await expect(took).toHaveText(t('cards.checklist.took_over.done'));
      const stepsInControl = steps();
      for (let i = 0; i < 10; i++) await page.evaluate(() => window.__fooTest!.clock.advance(1_000));
      expect(steps()).toBe(stepsInControl);

      expect(await page.evaluate((id) => window.foo.invoke('job:handBack', { jobId: id }).then((r) => r.ok), jobId)).toBe(true);
      await expect(fooSaid(page, t('cards.signin.hand_back_line')), `foo says it is carrying on: ${seen()}`).toBeVisible({
        timeout: 15_000,
      });
      // f: never repeats a step you already did: the first row stays done, the row you took over at is the current one again.
      expect(s.f).toContain('Never repeats');
      const rows = checklist.getByTestId(TID.cardChecklistStep);
      await expect(rows.nth(0)).toHaveAttribute('data-state', 'done');
      await expect(rows.nth(1)).toHaveAttribute('data-state', 'took_over');
      await expect(rows.nth(2)).toHaveAttribute('data-state', 'current');
      const row = checklist.locator('xpath=ancestor-or-self::*[@data-message-id][1]');
      await shoot(
        page,
        'UX-15-05',
        `${byTid(TID.threadLog)} [data-message-id="${await row.getAttribute('data-message-id')}"] ${byTid(TID.cardChecklist)}`,
      );
    });
  } finally {
    db.close();
    await run.close();
  }
});
