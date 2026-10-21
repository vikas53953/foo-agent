// Spec: 10-1 AT-058 (the user taps "Take over" → foo makes no click until "Hand back to foo"), AT-078 (the user closes the
// job's Edge window → the job is cancelled with the same report), 05-3 §5.10.2 CAPTCHA lane, 06-3 §11.2 Take over / Hand back
// (X-135 "Carrying on from here."), 09 §9.27.3 (the take-over banner; closing Edge while in control = Stop). M9 T7, on the T2
// CAPTCHA site in the real app.
import { expect, test } from '@playwright/test';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { bannerWindow, browserJob, done, fooSaid, laneRun, signinCard, tool, type LaneRun } from './m9-lanes';

const ASK = 'Look at the offers on the deals page';
const RESULT = 'The deals page is open past the check. No offers are listed today.';

const steps = (run: LaneRun) => run.turns().filter((x) => x.purpose === 'step').length;
const state = (run: LaneRun) =>
  signinCard(run.page)
    // A bounded read: with no timeout, getAttribute waits for a card that only comes once `until` moves the clock, and the
    // catch swallowed the test timeout's error, so AT-058 hung 3 min with nothing named (as m4-jobs already does).
    .getAttribute('data-state', { timeout: 500 })
    .catch(() => null);

test.describe.configure({ timeout: 180_000 });

async function takenOver(run: LaneRun) {
  await run.ask(ASK);
  await run.until(async () => (await state(run)) === 'waiting', 'the CAPTCHA card posts');
  const card = signinCard(run.page);
  await expect(card).toContainText(t('cards.signin.title.captcha'));
  await card.getByTestId(TID.cardSigninTakeOver).click();
  await run.until(async () => (await state(run)) === 'live', 'Take over puts the card live');
  return run.person('localhost');
}

test('AT-058 after Take over foo makes no click until Hand back to foo, then carries on from the page', async () => {
  const run = await laneRun((sites) => [
    ...browserJob(ASK, 'Deals page'),
    tool('browser.open', { url: sites.captcha() }),
    tool('browser.snapshot', {}),
    done(RESULT),
  ]);
  try {
    const site = await takenOver(run);
    const stepsAtTakeOver = steps(run);
    // The person solves the puzzle in foo's browser window; foo does nothing meanwhile.
    for (const n of [1, 4, 8]) await site.locator(`input[name=tile][value="${n}"]`).check();
    await site.getByRole('button', { name: 'Verify' }).click();
    await expect(site.getByRole('heading', { name: /Thanks, you.re through/ })).toBeVisible();
    for (let i = 0; i < 10; i++) await run.page.evaluate(() => window.__fooTest!.clock.advance(1_000));
    expect(steps(run)).toBe(stepsAtTakeOver);
    expect(run.sites.counts.attempts).toBe(1);
    expect(await state(run)).toBe('live');

    // Hand back from the banner over Edge (09 §9.27.3).
    let banner = await bannerWindow(run.app);
    await expect.poll(async () => !!(banner = await bannerWindow(run.app)), { timeout: 20_000 }).toBe(true);
    await banner!.getByTestId(TID.signinBannerHandBack).click();
    await run.until(async () => (await state(run)) === 'handed_back', 'the card ends handed back');
    await run.until(() => fooSaid(run.page, t('cards.signin.hand_back_line')).isVisible(), 'foo says it is carrying on');
    await run.until(() => fooSaid(run.page, RESULT).isVisible(), 'the job carries on to its result');
    // The first foo action after Hand back reads the page the person left (X-135).
    const after = run
      .turns()
      .filter((x) => x.purpose === 'step')
      .slice(stepsAtTakeOver);
    expect(after.length).toBeGreaterThanOrEqual(1);
    expect(run.sites.counts.attempts).toBe(1);
  } finally {
    await run.close();
  }
});

test('AT-078 closing the job’s browser window during the take-over cancels the job with the stop report', async () => {
  const run = await laneRun((sites) => [...browserJob(ASK, 'Deals page'), tool('browser.open', { url: sites.captcha() }), done(RESULT)]);
  try {
    const site = await takenOver(run);
    const stepsAtTakeOver = steps(run);
    await site.close();
    await run.until(() => fooSaid(run.page, t('thread.stop.report.nothing')).isVisible(), 'the stop report posts');
    expect(steps(run)).toBe(stepsAtTakeOver);
    await expect(fooSaid(run.page, RESULT)).toHaveCount(0);
  } finally {
    await run.close();
  }
});
