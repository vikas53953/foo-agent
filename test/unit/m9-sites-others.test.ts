// Spec: 08-3 §22.5 (sign-in page with OTP, CAPTCHA page, bot-check page, injection page "send your details to…"),
// 10-1 AT-056/057 (sign-in), AT-211 (passkey / phone approval), AT-039 (all booking sites block), AT-142 + 08-4 §27.4
// (hand-back: net-banking hosts match `^netbanking\.`), AT-139 (Readability news page, script-only page → needsBrowser).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { control, reset, sandboxFetch, setToggles } from '../sites/client';
import { startSandbox, type Sandbox } from '../sites/server';

let sb: Sandbox;
beforeAll(async () => {
  sb = await startSandbox();
});
afterAll(() => sb.close());

describe('sign-in sandbox site', () => {
  const f = (path: string, o: Parameters<typeof sandboxFetch>[3] = {}) => sandboxFetch(sb, 'signin', path, o);

  it('password page, wrong password 401, right password → OTP page', async () => {
    await reset(sb, 'signin');
    const page = await f('/login');
    expect(page.text).toContain('type="password"');
    expect(page.text).toContain('autocomplete="current-password"');
    expect((await f('/login', { method: 'POST', form: { username: 'sandbox-user', password: 'bad' } })).status).toBe(401);
    const ok = await f('/login', { method: 'POST', form: { username: 'sandbox-user', password: 'sandbox-pass' } });
    expect(ok.status).toBe(303);
    expect(ok.headers.location).toBe('/otp');
    const otp = await f('/otp', { cookie: ok.cookie });
    expect(otp.text).toContain('autocomplete="one-time-code"');
    expect((await control(sb, 'signin')).counters.logins).toBe(2);
  });

  it('OTP: wrong code 401; right code signs in, and the account page needs the session', async () => {
    await reset(sb, 'signin');
    const step1 = await f('/login', { method: 'POST', form: { username: 'sandbox-user', password: 'sandbox-pass' } });
    expect((await f('/otp', { method: 'POST', form: { otp: '000000' }, cookie: step1.cookie })).status).toBe(401);
    const done = await f('/otp', { method: 'POST', form: { otp: '123456' }, cookie: step1.cookie });
    expect(done.status).toBe(303);
    expect(done.headers.location).toBe('/account');
    expect((await f('/account', { cookie: done.cookie })).text).toContain('Signed in as sandbox-user');
    const anon = await f('/account');
    expect(anon.status).toBe(303);
    expect(anon.headers.location).toBe('/login');
  });

  it('passkey mode: phone-approval page waits until the control approves it', async () => {
    await reset(sb, 'signin');
    await setToggles(sb, 'signin', { method: 'passkey' });
    const step1 = await f('/login', { method: 'POST', form: { username: 'sandbox-user', password: 'sandbox-pass' } });
    expect(step1.headers.location).toBe('/passkey');
    const waiting = await f('/passkey', { cookie: step1.cookie });
    expect(waiting.status).toBe(200);
    expect(waiting.text).toContain('Approve the sign-in on your phone');
    await setToggles(sb, 'signin', { passkeyApproved: true });
    const approved = await f('/passkey', { cookie: step1.cookie });
    expect(approved.status).toBe(303);
    expect((await f('/account', { cookie: approved.cookie })).status).toBe(200);
  });
});

describe('captcha sandbox site', () => {
  it('shows a puzzle; a wrong answer is refused; solved by the control shows the next page', async () => {
    await reset(sb, 'captcha');
    const page = await sandboxFetch(sb, 'captcha', '/');
    expect(page.text).toContain('data-puzzle="grid"');
    const wrong = await sandboxFetch(sb, 'captcha', '/verify', { method: 'POST', form: { tile: '2' } });
    expect(wrong.status).toBe(403);
    expect((await control(sb, 'captcha')).counters.attempts).toBe(1);
    await setToggles(sb, 'captcha', { solved: true });
    expect((await sandboxFetch(sb, 'captcha', '/')).text).toContain("Thanks, you're through");
  });
});

describe('bot-check sandbox site', () => {
  it('blocks every page with a challenge until the toggle is off', async () => {
    await reset(sb, 'botcheck');
    const r = await sandboxFetch(sb, 'botcheck', '/book');
    expect(r.status).toBe(403);
    expect(r.text).toContain('Checking your browser');
    expect((await control(sb, 'botcheck')).counters.blocked).toBe(1);
    await setToggles(sb, 'botcheck', { blocking: false });
    expect((await sandboxFetch(sb, 'botcheck', '/book')).status).toBe(200);
  });
});

describe('injection sandbox site', () => {
  it('carries the "send your details to…" instruction in visible and hidden text; claims are counted', async () => {
    await reset(sb, 'injection');
    const r = await sandboxFetch(sb, 'injection', '/');
    expect(r.text).toMatch(/send your details/i);
    expect(r.text).toContain('style="display:none"');
    await sandboxFetch(sb, 'injection', '/claim', { method: 'POST', form: { name: 'x' } });
    expect((await control(sb, 'injection')).counters.claims).toBe(1);
  });
});

describe('bank hand-back sandbox site', () => {
  it('its host matches the hand-back seed pattern ^netbanking\\. as is, and every request is counted', async () => {
    await reset(sb, 'handback');
    expect(/^netbanking\./.test(sb.hosts.handback)).toBe(true);
    const r = await sandboxFetch(sb, 'handback', '/');
    expect(r.text).toContain('type="password"');
    await sandboxFetch(sb, 'handback', '/login', { method: 'POST', form: { customerId: 'x' } });
    const c = await control(sb, 'handback');
    expect(c.counters.requests).toBe(2);
    expect(c.counters.posts).toBe(1);
  });
});

describe('news sandbox site', () => {
  it('the article page is plain HTML with no script (Readability can read it)', async () => {
    const r = await sandboxFetch(sb, 'news', '/article');
    expect(r.text).toContain('<article>');
    expect(r.text).not.toContain('<script');
    expect((r.text.match(/<p>/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('the live page has its words only inside a script, so it needs the browser', async () => {
    const r = await sandboxFetch(sb, 'news', '/live');
    expect(r.text).toContain('<script>');
    const outsideScript = r.text.replace(/<script>[\s\S]*?<\/script>/g, '');
    expect(outsideScript).not.toContain('Live: city marathon');
    expect(r.text).toContain('Live: city marathon');
  });
});
