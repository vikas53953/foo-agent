// Spec: 08-2 §8.3.6 (mask stylesheet `[data-foo-secret], input[type=password], input[autocomplete^="cc-"],
// input[autocomplete="one-time-code"] { filter: blur(10px) !important; }` present while foo controls the page, removed on take-over;
// fill functions add data-foo-secret), §8.3.7 (computed-style check on every sensitive element of every frame, cached per DOM
// mutation; unverifiable → the frame is dropped), §8.3.8 + §11.6 (step screenshots: masked JPEG, never on OTP / 3-D Secure pages,
// none when screenshotDays is 0 or disk < 500 MB; pruned per screenshotDays), 10-2 ART-08a (no canary in a step picture's page).
import { existsSync, readdirSync, statSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MASK_CSS } from '../../../src/engine/tools/browser/walker';
import { StepShots, shotAllowed, MIN_FREE_BYTES } from '../../../src/engine/tools/browser/stepShots';
import { createNoCapture } from '../../../src/shared/handback';
import { browserHarness, html, okResult, type BrowserHarness } from './harness';

let h: BrowserHarness;
const filterOf = (sel: string) => async () => {
  const page = await h.page();
  return page.locator(sel).evaluate((el) => getComputedStyle(el).filter);
};

beforeAll(async () => {
  h = await browserHarness();
  h.route(
    '/form',
    html(`<form><input id="pw" type="password"><input id="cc" autocomplete="cc-number"><input id="otp" autocomplete="one-time-code">
      <input id="pin" name="pin"><input id="mark" data-foo-secret><input id="plain" name="city"></form>
      <div id="host"></div><script>host.attachShadow({mode:'open'}).innerHTML='<input type="password" id="spw">'</script>`),
  );
  h.route('/frame', html(`<input id="fcvv" name="cvv">`));
  h.route(
    '/outer',
    html(`<iframe id="ifr"></iframe><script>ifr.src=location.href.replace('127.0.0.1','localhost').replace('/outer','/frame')</script>`),
  );
  h.route('/otp', html(`<p>Enter the code we sent</p><input autocomplete="one-time-code">`));
  h.route('/3ds', html(`<h2>Verified by Visa</h2><p>Approve the payment in your bank app.</p>`));
  h.route('/plain', html(`<p>Menu for today</p><input type="password" id="p2">`));
}, 60_000);
afterAll(() => h.close());

describe('08-2 §8.3.6 masker', { timeout: 60_000 }, () => {
  it('the stylesheet is exactly the spec rule', () => {
    expect(MASK_CSS).toBe(
      '[data-foo-secret], input[type=password], input[autocomplete^="cc-"], input[autocomplete="one-time-code"] { filter: blur(10px) !important; }',
    );
  });

  it('every sensitive field computes blur(10px) while foo controls the page; plain fields do not', async () => {
    okResult(await h.run('browser.open', { url: `${h.origin}/form` }));
    for (const id of ['#pw', '#cc', '#otp', '#pin', '#mark']) expect(await filterOf(id)()).toBe('blur(10px)');
    expect(await filterOf('#plain')()).toBe('none');
    expect(await (await h.page()).locator('#spw').evaluate((el) => getComputedStyle(el).filter)).toBe('blur(10px)');
    expect(await h.runtime.masker.verifyPage(await h.page())).toBe(true);
  });

  it('the check is cached until the DOM changes, and a new sensitive field is checked too', async () => {
    const page = await h.page();
    expect(await h.runtime.masker.verifyPage(page)).toBe(true);
    await page.evaluate(() => {
      const i = document.createElement('input');
      i.name = 'security_code';
      document.body.appendChild(i);
    });
    expect(await h.runtime.masker.verifyPage(page)).toBe(true);
    expect(await page.locator('[name=security_code]').evaluate((el) => getComputedStyle(el).filter)).toBe('blur(10px)');
  });

  it('a page that unblurs a field fails the check (the frame would be dropped)', async () => {
    const page = await h.page();
    await page.evaluate(() => {
      const s = document.createElement('style');
      s.textContent = '#pw { filter: none !important; }';
      document.body.appendChild(s);
      (document.getElementById('pw') as HTMLInputElement).style.setProperty('filter', 'none', 'important');
    });
    expect(await h.runtime.masker.verifyPage(page)).toBe(false);
  });

  it('take-over removes the mask, and an unmasked page never verifies', async () => {
    okResult(await h.run('browser.open', { url: `${h.origin}/form` }));
    const page = await h.page();
    await h.runtime.masker.remove(page);
    expect(await filterOf('#pw')()).toBe('none');
    expect(await h.runtime.masker.verifyPage(page)).toBe(false);
    await h.runtime.masker.apply(page);
    expect(await filterOf('#pw')()).toBe('blur(10px)');
  });

  it('cross-origin frames are masked and checked', async () => {
    okResult(await h.run('browser.open', { url: `${h.origin}/outer` }));
    const page = await h.page();
    const frame = await (await page.waitForSelector('iframe')).contentFrame();
    await frame!.waitForSelector('#fcvv');
    await expect.poll(() => frame!.locator('#fcvv').evaluate((el) => getComputedStyle(el).filter)).toBe('blur(10px)');
    expect(await h.runtime.masker.verifyPage(page)).toBe(true);
  });
});

describe('08-2 §8.3.8 step screenshots', { timeout: 60_000 }, () => {
  const base = { screenshotDays: 7, freeBytes: MIN_FREE_BYTES, paused: false, noCapture: false, handback: false };
  it('the rule: none when days is 0, disk under 500 MB, sign-in in front, no-capture page or hand-back site', () => {
    expect(shotAllowed(base)).toBe(true);
    expect(shotAllowed({ ...base, screenshotDays: 0 })).toBe(false);
    expect(shotAllowed({ ...base, freeBytes: MIN_FREE_BYTES - 1 })).toBe(false);
    expect(shotAllowed({ ...base, paused: true })).toBe(false);
    expect(shotAllowed({ ...base, noCapture: true })).toBe(false);
    expect(shotAllowed({ ...base, handback: true })).toBe(false);
    expect(MIN_FREE_BYTES).toBe(500 * 1024 * 1024);
  });

  const shots = (o: { days?: number; free?: number; hosts?: string[] } = {}) =>
    new StepShots({
      dataDir: h.dataDir,
      masker: h.runtime.masker,
      noCaptureHosts: createNoCapture({ version: 't', hosts: o.hosts ?? [], patterns: [] }),
      handback: () => false,
      paused: () => false,
      screenshotDays: () => o.days ?? 7,
      freeBytes: async () => o.free ?? 10 * MIN_FREE_BYTES,
      now: () => Date.now(),
    });

  it('a normal page gives one masked JPEG at {DATA}/jobs/{id}/steps/{step}-{n}.jpg', async () => {
    okResult(await h.run('browser.open', { url: `${h.origin}/plain` }));
    const path = await shots().capture('job_1', await h.page(), 0);
    expect(path).toBe(join(h.dataDir, 'jobs', 'job_1', 'steps', '0-1.jpg'));
    expect(existsSync(path!)).toBe(true);
    expect(statSync(path!).size).toBeGreaterThan(500);
  });

  it('no picture on an OTP page, a 3-D Secure page, a no-capture host, with 0 days or a full disk', async () => {
    okResult(await h.run('browser.open', { url: `${h.origin}/otp` }));
    expect(await shots().capture('job_1', await h.page(), 1)).toBeNull();
    okResult(await h.run('browser.open', { url: `${h.origin}/3ds` }));
    expect(await shots().capture('job_1', await h.page(), 1)).toBeNull();
    okResult(await h.run('browser.open', { url: `${h.origin}/plain` }));
    expect(await shots({ hosts: ['127.0.0.1'] }).capture('job_1', await h.page(), 1)).toBeNull();
    expect(await shots({ days: 0 }).capture('job_1', await h.page(), 1)).toBeNull();
    expect(await shots({ free: MIN_FREE_BYTES - 1 }).capture('job_1', await h.page(), 1)).toBeNull();
    expect(readdirSync(join(h.dataDir, 'jobs', 'job_1', 'steps')).filter((f) => f.startsWith('1-'))).toEqual([]);
  });

  it('pictures older than screenshotDays are pruned', async () => {
    const s = shots();
    const path = await s.capture('job_2', await h.page(), 3);
    const old = (Date.now() - 8 * 24 * 3600 * 1000) / 1000;
    utimesSync(path!, old, old);
    const fresh = await s.capture('job_2', await h.page(), 4);
    expect(await s.prune()).toBe(1);
    expect(existsSync(path!)).toBe(false);
    expect(existsSync(fresh!)).toBe(true);
  });
});
