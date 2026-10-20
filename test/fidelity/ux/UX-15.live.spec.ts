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
// App gaps (reported, not faked): the engine side of take over / hand back (job.takeOver / job.handBack, T7) is not on this
// branch, so UX-15-04's in-control state is sent the way main sends it (`live:state taken_over`, as AT-272 does) and UX-15-05
// has no "You took over" / "Carrying on from here." checklist rows; dialog C-13 (06-3 §14, "Stop all {3} jobs that are
// running?") is not built and the header ⋯ has no "Stop everything", so UX-15-08 and UX-15-09 use the typed "Stop everything"
// (08-4 §26.9, no confirm) and there is no combined report in foo's chat and no "Pause all routines" link.
import { expect, test, type Page } from '@playwright/test';
import { t } from '../../../src/shared/copy/t';
import { TID } from '../../../src/shared/testids';
import type { FakeLine } from '../../e2e/fakeAi';
import { advance, jobState } from '../../e2e/m4-start';
import { ASK_LANDLORD, draftsGoogle, LANDLORD, LANDLORD_BODY, waitForDraft } from '../../e2e/m8-drafts-world';
import { say } from '../../e2e/m9-booking-world';
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

test('UX-15 · Watch live, take over, stop: steps UX-15-03, UX-15-04, UX-15-05, UX-15-06, UX-15-08 and UX-15-09, light and dark', async () => {
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
      // main tells the window foo is paused because the user took over (the engine side is T7's; AT-272 seeds it the same way)
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

    await test.step('UX-15-05 · Hand back: foo carries on from the page; the checklist is the one card, edited in place', async () => {
      const s = step('UX-15-05');
      expect(s.s).toContain('Carrying on from here.');
      await live.getByTestId(TID.liveHandBack).click();
      await sendLiveState(app, goa, 'running');
      await expect(live.getByTestId(TID.liveRoot)).toHaveAttribute('data-state', 'live');
      await expect(live.getByTestId(TID.liveTakeOver)).toBeVisible();
      // back in foo's chat: the job keeps working and its checklist is still the one card (no new message).
      await page.bringToFront();
      await openChat(page, 'foo');
      const checklist = page.getByTestId(TID.threadLog).locator(byTid(TID.cardChecklist)).filter({ hasText: 'Goa stay' });
      await expect(checklist).toHaveCount(1);
      expect(w.db().prepare('SELECT state FROM jobs WHERE id = ?').pluck().get(goa)).toBe('working');
      const row = checklist.locator('xpath=ancestor-or-self::*[@data-message-id][1]');
      await shoot(
        page,
        'UX-15-05',
        `${byTid(TID.threadLog)} [data-message-id="${await row.getAttribute('data-message-id')}"] ${byTid(TID.cardChecklist)}`,
      );
    });

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
    let stopAllSel = '';
    await test.step('UX-15-08 · "Stop everything" stops only jobs; routines keep their schedule', async () => {
      const s = step('UX-15-08');
      expect(s.f).toContain('Routines carry on');
      expect(before).toBeTruthy();
      // three jobs running: Goa stay (foo), Airtel bill (Money), Gas cylinder (Home)
      await jobState(page, refs.moneyJob!, 'working');
      await jobState(page, refs.homeJob!, 'working');
      await openChat(page, 'foo');
      await say(page, 'Stop everything');
      const mine = page.getByTestId(TID.threadLog).locator(byTid(TID.bubbleMe), { hasText: 'Stop everything' }).last();
      await mine.waitFor();
      const row = mine.locator('xpath=ancestor-or-self::*[@data-message-id][1]');
      stopAllSel = `${byTid(TID.threadLog)} [data-message-id="${await row.getAttribute('data-message-id')}"]`;
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
      await shoot(page, 'UX-15-08', stopAllSel);
    });

    await test.step('UX-15-09 · the report of what stopped; the approvals of those jobs are withdrawn', async () => {
      const s = step('UX-15-09');
      expect(s.f).toContain('Approvals for those jobs are withdrawn');
      // Goa stay's Payment approval (₹14,600) is WITHDRAWN, never left open.
      await expect
        .poll(() => w.db().prepare('SELECT state FROM approvals WHERE job_id = ? ORDER BY created_at DESC LIMIT 1').pluck().get(goa))
        .toBe('WITHDRAWN');
      // the report in foo's chat comes from the activity log: nothing was done by these jobs
      await expect(lastText(page, t('thread.stop.report.nothing'))).toBeVisible({ timeout: 15_000 });
      expect(routine()).toEqual(before);
      await shoot(page, 'UX-15-09', stopAllSel);
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
