// Spec: 10-1 AT-056 (the AI never receives the typed username or password; no screenshot or page text is captured while the
// sign-in window is in front), AT-057 (the page changes after sign-in → foo carries on without "I'm done"), AT-211 (passkey /
// phone approval: the take_over card "{Site} sent an approval to your phone…", no foo click until I'm done, capture paused),
// 08-2 §8.4 Sign in here, 05-3 §5.10.2–§5.10.3, 09 §9.27.3 (the banner). M9 T7, on the T2 sign-in site in the real app.
import { expect, test } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { browserJob, done, fooSaid, laneRun, signinCard, tool, type LaneRun } from './m9-lanes';

const ASK = 'Find my train bookings on RailPass';
const USER = 'CANARY-user-71c3';
const PASS = 'CANARY-pw-a90f2e';
const RESULT = 'You have no train trips booked on RailPass yet.';

/** Every step picture foo kept in this run: {data}/jobs/{jobId}/steps/*.jpg (08-2 §8.3.5). */
function shots(dataDir: string): number {
  return [join(dataDir, 'jobs'), join(dataDir, 'data', 'jobs')]
    .filter((d) => existsSync(d))
    .flatMap((d) => readdirSync(d, { recursive: true, encoding: 'utf8' }))
    .filter((f) => f.endsWith('.jpg')).length;
}

const steps = (run: LaneRun) => run.turns().filter((x) => x.purpose === 'step').length;
const state = (run: LaneRun) =>
  signinCard(run.page)
    // A bounded read: with no timeout, getAttribute waits for a card that only comes once `until` moves the clock, and the
    // catch swallowed the test timeout's error, so AT-058 hung 3 min with nothing named (as m4-jobs already does).
    .getAttribute('data-state', { timeout: 500 })
    .catch(() => null);

test.describe.configure({ timeout: 180_000 });

test('AT-056 AT-057 the person signs in on the page; the AI gets none of it, nothing is captured, and foo carries on by itself', async () => {
  const run = await laneRun((sites) => {
    sites.toggles.signin.username = USER;
    sites.toggles.signin.password = PASS;
    return [
      ...browserJob(ASK, 'Train bookings'),
      tool('browser.open', { url: sites.signin() }),
      tool('job.needSignIn', { site: 'RailPass', kind: 'password' }),
      done(RESULT),
    ];
  });
  try {
    await run.ask(ASK);
    await run.until(async () => (await state(run)) === 'live', 'the Sign-in card goes live');
    const card = signinCard(run.page);
    await expect(card).toContainText(t('cards.signin.title.sign_in', { site: '127.0.0.1' }));
    await expect(card.getByTestId(TID.cardSigninLive)).toBeVisible();
    const stepsAtPause = steps(run);
    const shotsAtPause = shots(run.dirs.FOO_DATA_DIR);

    // The person types on the page in foo's browser window, not through foo.
    const site = await run.person('127.0.0.1');
    await site.locator('input[name=username]').fill(USER);
    await site.locator('input[name=password]').fill(PASS);
    await site.locator('button[type=submit]').click();
    await site.waitForURL(/\/otp$/);
    // A code page is still the sign-in: the card stays live and the AI is not asked anything.
    await run.page.evaluate(() => window.__fooTest!.clock.advance(3_000));
    expect(await state(run)).toBe('live');
    await site.locator('input[name=otp]').fill('123456');
    await site.locator('button[type=submit]').click();
    await site.waitForURL(/\/account$/);

    // AT-057: the page moved on, so foo sees the success without "I'm done".
    await run.until(async () => (await state(run)) === 'signed_in', 'the card reads signed in');
    await expect(signinCard(run.page)).toContainText('Signed in to 127.0.0.1');
    await run.until(() => fooSaid(run.page, RESULT).isVisible(), 'the job carries on to its result');

    // While the sign-in was in front: no AI step, no step picture (AT-056, 08-2 §8.3.3).
    const turns = run.turns();
    const resumed = turns.filter((x) => x.purpose === 'step').slice(stepsAtPause);
    expect(resumed.length).toBe(1);
    expect(resumed[0]!.prompt).toContain('- Sign-in on 127.0.0.1 → done');
    expect(shots(run.dirs.FOO_DATA_DIR)).toBeLessThanOrEqual(shotsAtPause + 1);
    for (const x of turns) {
      expect(x.prompt).not.toContain(USER);
      expect(x.prompt).not.toContain(PASS);
      expect(x.prompt).not.toContain('123456');
    }
  } finally {
    await run.close();
  }
});

test('AT-211 a phone approval is the take-over card; foo clicks nothing until I am done, and capture stays paused', async () => {
  const run = await laneRun((sites) => {
    sites.toggles.signin.method = 'passkey';
    return [
      ...browserJob(ASK, 'Train bookings'),
      tool('browser.open', { url: sites.signin() }),
      tool('job.needSignIn', { site: 'RailPass', kind: 'password' }),
      tool('job.needSignIn', { site: 'RailPass', kind: 'passkey' }),
      done(RESULT),
    ];
  });
  try {
    await run.ask(ASK);
    await run.until(async () => (await state(run)) === 'live', 'the password card goes live');
    const site = await run.person('127.0.0.1');
    await site.locator('input[name=username]').fill('sandbox-user');
    await site.locator('input[name=password]').fill('sandbox-pass');
    await site.locator('button[type=submit]').click();
    await site.waitForURL(/\/passkey$/);
    // The sign-in field is gone, so the first card ends by itself; the AI then asks for the phone approval.
    await run.until(
      async () => (await signinCard(run.page).textContent())?.includes('sent an approval to your phone') ?? false,
      'the passkey card posts',
    );
    const card = signinCard(run.page);
    await expect(card).toContainText(t('cards.signin.title.passkey', { site: '127.0.0.1' }));
    await expect(card.getByTestId(TID.cardSigninDone)).toBeVisible();
    await expect(card.getByTestId(TID.cardSigninSkip)).toBeVisible();
    const stepsAtPause = steps(run);
    const shotsAtPause = shots(run.dirs.FOO_DATA_DIR);

    // The person approves on the phone; the page moves on, but a take-over card waits for I'm done.
    run.sites.toggles.signin.passkeyApproved = true;
    await site.waitForURL(/\/account$/, { timeout: 20_000 });
    for (let i = 0; i < 10; i++) await run.page.evaluate(() => window.__fooTest!.clock.advance(1_000));
    expect(await state(run)).not.toBe('signed_in');
    expect(steps(run)).toBe(stepsAtPause);
    expect(shots(run.dirs.FOO_DATA_DIR)).toBe(shotsAtPause);

    await card.getByTestId(TID.cardSigninDone).click();
    await run.until(async () => (await state(run)) === 'signed_in', 'I am done ends the card signed in');
    await run.until(() => fooSaid(run.page, RESULT).isVisible(), 'the job carries on to its result');
  } finally {
    await run.close();
  }
});
