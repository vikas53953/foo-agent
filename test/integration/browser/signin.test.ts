// Spec: 08-2 §8.4 (lane chooser; Sign in here: NEEDS_YOU, Edge to the front with the banner, capture paused, success
// detected; timers 10 min / 2 h), §8.3.3 (no snapshot, screenshot or click while the sign-in page is in front; only the URL and
// the password / code field, every 1 s), 05-3 §5.10.2 (states waiting → live → signed_in | skipped | timed_out; passkey lane),
// 09 §9.27.3 (closing Edge during sign-in leaves the card `waiting`), 10-1 AT-060 (2 h → cancelled, nothing booked, Start again).
// M9 T7, on the T2 sign-in site.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CANCEL_MS, REMIND_MS, chooseSignInLane, maskPhone } from '../../../src/engine/tools/browser/signinLanes';
import { t } from '../../../src/shared/copy/t';
import { bannerOps, cardStates, laneHarness, liveStates, type LaneHarness } from './lanes';

let h: LaneHarness;

beforeAll(async () => {
  h = await laneHarness();
});
afterAll(async () => {
  await h.close();
});
afterEach(() => {
  h.lanes.jobEnded(h.job.id);
  for (const a of [h.sent, h.ops, h.answers, h.stops, h.needsYou, h.halted, h.launched, h.vaultCalls]) a.length = 0;
  h.toggles.signin.method = 'otp';
  h.toggles.signin.passkeyApproved = false;
});

/** Opens the sign-in page and runs the AI's `job.needSignIn`, then posts the card it asks for. */
async function needSignIn(kind: string, url = h.signin()): Promise<string> {
  expect((await h.run('browser.open', { url })).kind).toBe('ok');
  const r = await h.run('job.needSignIn', { site: 'RailPass', kind });
  if (r.kind !== 'needs_user') throw new Error(`expected needs_user, got ${r.kind}`);
  return h.post(r.card);
}

describe('08-2 §8.6 chooseSignInLane', () => {
  it('maps every need to its lane and card reason (G-M9-10)', () => {
    expect(chooseSignInLane('railpass.test', 'password', { savedLogin: true })).toEqual({ lane: 'saved_login', reason: null });
    expect(chooseSignInLane('railpass.test', 'password')).toEqual({ lane: 'sign_in_here', reason: 'sign_in' });
    expect(chooseSignInLane('railpass.test', 'password', { savedFailed: true })).toEqual({
      lane: 'sign_in_here',
      reason: 'saved_login_failed',
    });
    expect(chooseSignInLane('railpass.test', 'otp')).toEqual({ lane: 'sign_in_here', reason: 'sign_in' });
    expect(chooseSignInLane('captcha.test', 'captcha')).toEqual({ lane: 'take_over', reason: 'captcha' });
    expect(chooseSignInLane('irctc.co.in', 'captcha', { knownPuzzle: true })).toEqual({ lane: 'take_over', reason: 'known_puzzle' });
    expect(chooseSignInLane('railpass.test', 'passkey')).toEqual({ lane: 'take_over', reason: 'passkey' });
    expect(chooseSignInLane('netbanking.sandbank.test', '3ds')).toEqual({ lane: 'take_over', reason: 'bank_3ds' });
    expect(chooseSignInLane('accounts.google.com', 'password').lane).toBe('connect');
  });

  it('masks the bank lane number to the 05-3 §5.10.2 shape', () => {
    expect(maskPhone('+91 98765 43210')).toBe('+91 98••• ••210');
    expect(maskPhone('9876543210')).toBe('98••• ••210');
    expect(maskPhone('12345')).toBeNull();
  });
});

describe('08-2 §8.4 Sign in here', { timeout: 90_000 }, () => {
  it('the card is posted waiting with the page host, Edge comes up with the banner, the card goes live', async () => {
    const cardId = await needSignIn('password');
    expect(h.needsYou[0]).toMatchObject({
      type: 'signin',
      state: 'waiting',
      payload: { mode: 'sign_in_here', site: '127.0.0.1', reason: 'sign_in', jobId: 'job_1' },
    });
    await h.pump(500);
    expect(cardStates(h.ops, cardId)).toEqual(['live']);
    expect(bannerOps(h.sent)[0]).toBe('open:sign_in_here');
    expect(liveStates(h.sent)).toEqual(['paused_signin']);
    expect(h.lanes.paused(h.job.id)).toBe(true);
  });

  it('nothing is captured or clicked while the sign-in page is in front (§8.3.3)', async () => {
    await needSignIn('password');
    const snap = await h.run('browser.snapshot');
    expect(snap).toMatchObject({ kind: 'error', result: { reason: 'sign_in_in_front' } });
    expect(await h.run('browser.screenshot')).toMatchObject({ kind: 'ok', result: { screenshot: null } });
    expect(await h.run('browser.click', { ref: 'e1' })).toMatchObject({ kind: 'error', result: { reason: 'sign_in_in_front' } });
    const page = await h.page();
    expect(await page.evaluate(() => (window as unknown as { __fooNoCapture?: boolean }).__fooNoCapture)).toBe(true);
  });

  it('the page leaving the sign-in form is the success: no "I\'m done" needed (§5.10.3 Detection)', async () => {
    h.toggles.signin.method = 'passkey';
    h.toggles.signin.passkeyApproved = true;
    const cardId = await needSignIn('password');
    await h.pump(1_000);
    // The person signs in on the page (in a real run, by hand in Edge).
    const page = await h.page();
    await page.fill('input[name=username]', 'sandbox-user');
    await page.fill('input[name=password]', 'sandbox-pass');
    await page.click('button[type=submit]');
    await page.waitForURL(/\/account$/);
    expect(await h.until(() => h.answers.length > 0)).toBe(true);
    expect(h.answers).toEqual([{ cardId, answer: { end: 'signed_in' }, resolvedBy: 'auto' }]);
    expect(bannerOps(h.sent)).toContain('signed_in');
    expect(liveStates(h.sent).at(-1)).toBe('running');
    expect(h.lanes.paused(h.job.id)).toBe(false);
    const signedIn = h.ops.find((o) => o.op === 'activity');
    expect(signedIn).toMatchObject({
      op: 'activity',
      row: { kind: 'connected', event: 'signed_in_site', summary: 'Signed in to 127.0.0.1' },
    });
    expect(await page.evaluate(() => (window as unknown as { __fooNoCapture?: boolean }).__fooNoCapture)).toBe(false);
  });

  it('a code page after the password is still the sign-in form: no success until it is gone', async () => {
    const cardId = await needSignIn('password');
    await h.pump(1_000);
    const page = await h.page();
    await page.fill('input[name=username]', 'sandbox-user');
    await page.fill('input[name=password]', 'sandbox-pass');
    await page.click('button[type=submit]');
    await page.waitForURL(/\/otp$/);
    await h.until(() => h.sent.some((x) => x.kind === 'signin.banner' && String(x.payload.url).endsWith('/otp')));
    await h.pump(2_000);
    expect(h.answers).toEqual([]);
    // The address row follows the page.
    expect(h.sent.some((s) => s.kind === 'signin.banner' && s.payload.op === 'url' && String(s.payload.url).endsWith('/otp'))).toBe(true);
    await page.fill('input[name=otp]', '123456');
    await page.click('button[type=submit]');
    await page.waitForURL(/\/account$/);
    expect(await h.until(() => h.answers.length > 0)).toBe(true);
    expect(h.answers).toEqual([{ cardId, answer: { end: 'signed_in' }, resolvedBy: 'auto' }]);
  });

  it("I'm done ends it at once; Skip ends it skipped", async () => {
    let cardId = await needSignIn('password');
    await h.lanes.done(h.job.id);
    expect(h.answers.at(-1)).toEqual({ cardId, answer: { end: 'signed_in' }, resolvedBy: 'tap' });
    cardId = await needSignIn('password');
    await h.lanes.skip(h.job.id);
    expect(h.answers.at(-1)).toEqual({ cardId, answer: { skip: true }, resolvedBy: 'tap' });
    expect(h.lanes.paused(h.job.id)).toBe(false);
  });

  it("closing Edge during the sign-in leaves the card waiting; I'm done opens it again at the sign-in page (09 §9.27.3)", async () => {
    const cardId = await needSignIn('password');
    await h.pump(500);
    await (await h.page()).close();
    await h.pump(500);
    expect(cardStates(h.ops, cardId)).toEqual(['live', 'waiting']);
    expect(bannerOps(h.sent)).toContain('close');
    expect(h.stops).toEqual([]);
    expect(h.lanes.paused(h.job.id)).toBe(true);
    await h.lanes.done(h.job.id);
    expect(cardStates(h.ops, cardId)).toEqual(['live', 'waiting', 'live']);
    expect((await h.page()).url()).toBe(h.signin());
    expect(h.answers).toEqual([]);
  });
});

describe('05-3 §5.10.2 lanes', { timeout: 90_000 }, () => {
  it("passkey: take_over mode, no success from the page, ends only on I'm done (the engine side of the phone-approval acceptance)", async () => {
    h.toggles.signin.method = 'passkey';
    const page = await h.page();
    await page.goto(h.signin());
    await page.fill('input[name=username]', 'sandbox-user');
    await page.fill('input[name=password]', 'sandbox-pass');
    await page.click('button[type=submit]');
    await page.waitForURL(/\/passkey$/);
    const cardId = await needSignIn('passkey', page.url());
    expect(h.needsYou[0]).toMatchObject({ payload: { mode: 'take_over', reason: 'passkey' } });
    await h.pump(500);
    expect(bannerOps(h.sent)[0]).toBe('open:take_over');
    h.toggles.signin.passkeyApproved = true;
    await h.pump(3_000);
    expect(h.answers).toEqual([]);
    expect(await h.run('browser.click', { ref: 'e1' })).toMatchObject({ kind: 'error', result: { reason: 'sign_in_in_front' } });
    await h.lanes.done(h.job.id);
    expect(h.answers).toEqual([{ cardId, answer: { end: 'signed_in' }, resolvedBy: 'tap' }]);
  });

  it('CAPTCHA: the card waits for Take over; Edge stays behind until then', async () => {
    // The watchdog reads the challenge page (SITE_CAPTCHA); the AI may also name it with job.needSignIn.
    expect(await h.run('browser.open', { url: h.captcha() })).toEqual({ kind: 'error', errorKind: 'SITE_CAPTCHA' });
    const r = await h.run('job.needSignIn', { site: 'Captcha', kind: 'captcha' });
    if (r.kind !== 'needs_user') throw new Error(r.kind);
    const cardId = await h.post(r.card);
    await h.pump(1_000);
    expect(cardStates(h.ops, cardId)).toEqual([]);
    expect(bannerOps(h.sent)).toEqual([]);
    expect(await h.lanes.takeOver(h.job.id)).toBe(true);
    expect(cardStates(h.ops, cardId)).toEqual(['live']);
    expect(bannerOps(h.sent)[0]).toBe('open:take_over');
    expect(liveStates(h.sent)).toEqual(['taken_over']);
  });

  it('bank check: its own code box carries the request; a submitted code is typed into the code field, then forgotten', async () => {
    h.toggles.signin.method = 'otp';
    const page = await h.page();
    await page.goto(h.signin());
    await page.fill('input[name=username]', 'sandbox-user');
    await page.fill('input[name=password]', 'sandbox-pass');
    await page.click('button[type=submit]');
    await page.waitForURL(/\/otp$/);
    const r = await h.run('job.needSignIn', { site: 'Bank', kind: '3ds', sentTo: '+91 98765 43210' });
    if (r.kind !== 'needs_user') throw new Error(r.kind);
    expect(r.card.payload).toMatchObject({ reason: 'bank_3ds', mode: 'take_over', phone: '+91 98••• ••210' });
    expect(JSON.stringify(r.card)).not.toContain('43210');
    await h.post(r.card);
    await h.pump(500);
    const box = h.ops.find((o) => o.op === 'insert' && o.table === 'cards' && o.row.type === 'secret');
    expect(box).toMatchObject({ row: { state: 'asking', payload: { secretKind: 'otp', sentTo: '+91 98••• ••210' } } });
    const requestId = (box as unknown as { row: { payload: { requestId: string } } }).row.payload.requestId;
    h.redactor.registry.add({ handle: 'reg_otp_1', value: '123456' });
    expect(await h.lanes.codeSubmitted(requestId, 'reg_otp_1')).toBe(true);
    await page.waitForURL(/\/account$/);
    expect(h.redactor.registry.valueOf('reg_otp_1')).toBeNull();
    expect(await h.lanes.codeSubmitted('unknown-request', 'reg_otp_1')).toBe(false);
  });
});

describe('07-2 §7.6 sign-in timers', { timeout: 90_000 }, () => {
  it('one reminder toast at 10 min', async () => {
    await needSignIn('password');
    h.clock.advance(REMIND_MS);
    const toasts = h.sent.filter((s) => s.kind === 'notify');
    expect(toasts).toEqual([
      {
        kind: 'notify',
        payload: expect.objectContaining({ kind: 'signin', title: 'foo', body: t('cards.signin.reminder_toast', { site: '127.0.0.1' }) }),
      },
    ]);
  });

  it('AT-060 no answer to a sign-in card for 2 h cancels the job with nothing booked and Start again', async () => {
    const before = h.counts.logins ?? 0;
    const cardId = await needSignIn('password');
    h.clock.advance(CANCEL_MS);
    for (let i = 0; i < 50 && h.stops.length === 0; i++) await new Promise((r) => setTimeout(r, 20));
    expect(cardStates(h.ops, cardId).at(-1)).toBe('timed_out');
    expect(h.stops).toEqual([{ jobId: 'job_1', reason: 'signin_timeout', report: false }]);
    const line = h.ops.find((o) => o.op === 'insert' && o.table === 'messages' && o.row.kind === 'text');
    expect(line).toMatchObject({ row: { text: t('cards.signin.timed_out_line', { what: 'train booking' }) } });
    expect(h.lanes.paused(h.job.id)).toBe(false);
    // Nothing was booked: no click ever reached the site's form while it waited.
    expect(h.counts.logins ?? 0).toBe(before);
  });
});

describe('08-2 §8.4 after an engine restart', { timeout: 60_000 }, () => {
  it("I'm done and Skip still answer the job's Sign-in card when the pause was lost", async () => {
    const job = h.job as unknown as { state: string; needsYouCardId: string | null };
    Object.assign(job, { state: 'needs_you', needsYouCardId: 'k_restart' });
    h.cards.k_restart = 'signin';
    try {
      expect(h.lanes.paused(h.job.id)).toBe(false);
      await h.lanes.done(h.job.id);
      await h.lanes.skip(h.job.id);
      expect(h.answers).toEqual([
        { cardId: 'k_restart', answer: { end: 'signed_in' }, resolvedBy: 'tap' },
        { cardId: 'k_restart', answer: { skip: true }, resolvedBy: 'tap' },
      ]);
      // Any other card the job waits on is not the Sign-in card's to answer.
      h.answers.length = 0;
      h.cards.k_restart = 'approval';
      await h.lanes.done(h.job.id);
      expect(h.answers).toEqual([]);
    } finally {
      Object.assign(job, { state: 'working', needsYouCardId: null });
      delete h.cards.k_restart;
    }
  });
});
