// Spec: 08-2 §8.4 Saved login lane (`vault.use('fill_login')` username + password straight into the page; on failure → Sign in
// here "Your saved {site} login didn't work…"), §11.3 (fill_login is allowed only for a running job on the login's domain, so
// the job's site is set first; the value goes only to the filler), §8.3.6 (filled fields carry `data-foo-secret`), 10-1 AT-059
// (the login is filled directly into the page and the AI only knows "your {site} login"). M9 T7, on the T2 sign-in site.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { laneHarness, type LaneHarness } from './lanes';

let h: LaneHarness;
const USER = 'sandbox-user';
const PASS = 'sandbox-pass';

beforeAll(async () => {
  h = await laneHarness();
  h.toggles.signin.method = 'passkey';
  h.toggles.signin.passkeyApproved = true;
});
afterAll(async () => {
  await h.close();
});
afterEach(() => {
  h.lanes.jobEnded(h.job.id);
  for (const a of [h.sent, h.ops, h.answers, h.needsYou, h.vaultCalls]) a.length = 0;
  h.login = null;
});

describe('08-2 §8.4 saved login', { timeout: 60_000 }, () => {
  it('AT-059 a saved login is filled directly into the page and the AI only knows "your {site} login"', async () => {
    h.login = { u: USER, p: PASS };
    expect((await h.run('browser.open', { url: h.signin() })).kind).toBe('ok');
    const r = await h.run('job.needSignIn', { site: 'RailPass', kind: 'password' });
    expect(r).toEqual({
      kind: 'ok',
      result: { signedIn: true, login: 'your 127.0.0.1 login', url: expect.stringMatching(/\/account$/) as unknown },
    });
    // The AI sees none of it: no value, no field.
    expect(JSON.stringify(r)).not.toContain(USER);
    expect(JSON.stringify(r)).not.toContain(PASS);
    // The vault was asked for this site's login, for this job, after the job's site was set to it (§11.3 purpose check).
    expect(h.vaultCalls).toEqual([{ purpose: 'fill_login', name: '127.0.0.1', jobId: 'job_1' }]);
    expect(h.ops).toContainEqual({ op: 'update', table: 'jobs', id: 'job_1', set: { site_domain: '127.0.0.1' } });
    // The page signed in for real, with no card and no pause.
    expect((await h.page()).url()).toMatch(/\/account$/);
    expect(h.needsYou).toEqual([]);
    expect(h.lanes.paused(h.job.id)).toBe(false);
  });

  it('a saved login that does not work → the Sign-in card "Your saved {site} login didn\'t work"', async () => {
    h.login = { u: USER, p: 'wrong-password' };
    expect((await h.run('browser.open', { url: h.signin() })).kind).toBe('ok');
    const r = await h.run('job.needSignIn', { site: 'RailPass', kind: 'password' });
    expect(r).toMatchObject({
      kind: 'needs_user',
      card: { type: 'signin', state: 'waiting', payload: { reason: 'saved_login_failed', mode: 'sign_in_here', site: '127.0.0.1' } },
    });
    expect(JSON.stringify(r)).not.toContain('wrong-password');
    // What is left in the form reads [hidden] to the AI, the username too (AT-056).
    const page = await h.page();
    expect(await page.locator('input[name=username]').getAttribute('data-foo-secret')).toBe('');
    expect(await page.locator('input[name=password]').getAttribute('data-foo-secret')).toBe('');
  });

  it('no saved login → the plain Sign-in card, and nothing was typed', async () => {
    expect((await h.run('browser.open', { url: h.signin() })).kind).toBe('ok');
    const r = await h.run('job.needSignIn', { site: 'RailPass', kind: 'password' });
    expect(r).toMatchObject({ kind: 'needs_user', card: { payload: { reason: 'sign_in' } } });
    expect(await (await h.page()).locator('input[name=username]').inputValue()).toBe('');
  });

  it('an app account (Google, Microsoft) is the Connect lane, not a page foo waits on', async () => {
    const r = await h.lanes.need(h.job.id, { site: 'accounts.google.com', kind: 'password' });
    // The open page is the sign-in site, so the host is the page's: only a Google page itself is Connect.
    expect(r.kind).toBe('needs_user');
    const page = await h.page();
    await page.goto('about:blank');
    expect(await h.lanes.need(h.job.id, { site: 'accounts.google.com', kind: 'password' })).toEqual({
      kind: 'error',
      errorKind: 'ROUTE_ORDER',
    });
  });
});
