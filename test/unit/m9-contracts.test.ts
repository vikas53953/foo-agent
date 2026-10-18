// Spec: 08-4 §27.4–§27.5 (hand-back and no-capture matching), 08-1 §2.4 (M9 MainToEngine kinds), §3.2 (M9 channels),
// 08-0 §A (M9 settings defaults), CR-0013 G-M9-10 (sign-in lanes → mode).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createHandback, createNoCapture, handbackSitesSchema, hostListSchema } from '../../src/shared/handback';
import { mainToEngineSchema } from '../../src/engine/protocol';
import { signInModeOf, SignInReasonSchema } from '../../src/shared/schemas';
import { settingsDefaults } from '../../src/shared/settingsDefaults';
import { settingsSchema } from '../../src/shared/settings';
import { EVENT_CHANNELS, INVOKE_CHANNELS } from '../../src/shared/ipc';

const json = (f: string): unknown => JSON.parse(readFileSync(`resources/${f}`, 'utf8'));

describe('M9 contracts', () => {
  const handback = createHandback(handbackSitesSchema.parse(json('handback-sites.json')));
  const noCapture = createNoCapture(hostListSchema.parse(json('no-capture-hosts.json')));

  it('handback.check matches hosts, subdomains, path prefixes and patterns (08-4 §27.4)', () => {
    expect(handback.check('https://kite.zerodha.com/dashboard')).toBe(true);
    expect(handback.check('https://www.groww.in/')).toBe(true);
    expect(handback.check('https://paytm.com/upi/pay')).toBe(true);
    expect(handback.check('https://netbanking.somebank.in/login')).toBe(true);
    expect(handback.check('https://x.npci.org.in/')).toBe(true);
  });

  it('payment gateways and look-alikes are not hand-back', () => {
    expect(handback.check('https://paytm.com/payment')).toBe(false);
    expect(handback.check('https://razorpay.com/checkout')).toBe(false);
    expect(handback.check('https://notgroww.in/')).toBe(false);
    expect(handback.check('not a url')).toBe(false);
  });

  it('no-capture hosts use the same matching (08-4 §27.5)', () => {
    expect(noCapture.check('https://acs2.somebank.com/x')).toBe(true);
    expect(noCapture.check('https://secure.icicibank.com/acs/step')).toBe(true);
    expect(noCapture.check('https://secure.icicibank.com/home')).toBe(false);
  });

  it('web-tools.json has the four providers of 08-4 §27.3', () => {
    expect(Object.keys(json('web-tools.json') as object).sort()).toEqual(['browseruse', 'exa', 'firecrawl', 'tavily', 'version']);
  });

  it('M9 engine messages validate; job.handBack has no mode (X-135)', () => {
    const ok = (kind: string, payload: unknown) => mainToEngineSchema.safeParse({ id: 'm1', kind, payload }).success;
    expect(ok('job.watch', { jobId: 'j1', on: true })).toBe(true);
    expect(ok('job.takeOver', { jobId: 'j1', on: true })).toBe(true);
    expect(ok('job.handBack', { jobId: 'j1' })).toBe(true);
    expect(ok('job.handBack', { jobId: 'j1', mode: 'finish' })).toBe(false);
    expect(ok('signin.done', { jobId: 'j1' })).toBe(true);
    expect(ok('signin.skip', { jobId: 'j1' })).toBe(true);
    expect(ok('code.submit', { requestId: 'r1', codeRef: 'h1' })).toBe(true);
    expect(ok('code.submit', { requestId: 'r1', code: '123456' })).toBe(false);
    expect(ok('webkey.check', { provider: 'exa' })).toBe(true);
    expect(ok('webkey.check', { provider: 'bing' })).toBe(false);
  });

  it('M9 channels are registered (08-1 §3.2, §3.3)', () => {
    for (const c of ['job:openWindow', 'job:takeOver', 'job:handBack', 'signin:done', 'signin:skip', 'code:submit', 'app:openExternal'])
      expect(INVOKE_CHANNELS).toContain(c);
    expect(EVENT_CHANNELS).toContain('live:frame');
    expect(EVENT_CHANNELS).toContain('live:state');
  });

  it('sign-in lanes map to their mode (G-M9-10)', () => {
    expect(SignInReasonSchema.options.map((r) => [r, signInModeOf(r)])).toEqual([
      ['sign_in', 'sign_in_here'],
      ['captcha', 'take_over'],
      ['passkey', 'take_over'],
      ['bank_3ds', 'take_over'],
      ['known_puzzle', 'take_over'],
      ['saved_login_failed', 'sign_in_here'],
    ]);
  });

  it('M9 settings defaults (08-0 §A)', () => {
    expect(settingsSchema.parse(settingsDefaults).privacy.screenshotDays).toBe(7);
    expect(settingsDefaults.connections.web).toEqual({
      search: 'this_pc',
      read: 'this_pc',
      cloudBrowser: false,
      refused: { exa: false, tavily: false, firecrawl: false, browseruse: false },
    });
  });
});
