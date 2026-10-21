// Spec: 01-articles Art. 8 and 10-acceptance-2 §D ART-08a (values the person types in foo's browser are in no file foo wrote,
// the browser profile included), 08-2 §8.3.1 (the persistent profile). CR-0034: the profile hygiene in
// src/engine/tools/browser/profileHygiene.ts. The real browser is driven with real keystrokes, as the person types, and held
// open past Chromium's 2.5 s session save timer, so a regression shows every run, not only on a slow machine.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prepareProfile, scrubProfile } from '../../../src/engine/tools/browser/profileHygiene';
import { CANARIES, groupedCard } from '../../canary/canaries';
import { scan, summary } from '../../canary/scan';
import { browserHarness, html, type BrowserHarness } from './harness';

/** Longer than Chromium's session save delay (kSaveDelayMS, 2.5 s). */
const SESSION_SAVE_WAIT_MS = 4_000;
const TYPED = [CANARIES.sitePassword, CANARIES.cardNumber, CANARIES.otp, CANARIES.cvv];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('foo’s browser profile keeps no value the person typed (CR-0034)', () => {
  let h: BrowserHarness;
  const profileScan = (label: string, running = false) => {
    const report = scan({ roots: { BROWSER: join(h.dataDir, 'browser') }, texts: [], canaries: TYPED, skipLocked: running });
    return { files: report.scanned.files, locked: report.locked, hits: report.hits, text: `${label}: ${summary(report)}` };
  };

  beforeAll(async () => {
    h = await browserHarness();
    // A sign-in and pay form (POST: Session_*, Tabs_*, autocomplete) and a look-up form (GET: the values land in the URL,
    // so History and the HTTP cache too).
    h.route(
      '/pay',
      html(`<form method="post" action="/thanks">
        <input name="user" aria-label="User"><input type="password" name="pw" aria-label="Password">
        <input name="card" autocomplete="cc-number" aria-label="Card number">
        <input name="code" aria-label="Code from SMS"><button id="pay">Pay</button></form>`),
    );
    h.route('/thanks', html('<p>Thanks</p>'));
    // A real icon, so Chromium records the page URL (with the GET form's values) in its Favicons store if it records it at all.
    const icon = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYPj/HwADAgH/oS2+NwAAAABJRU5ErkJggg==', 'base64');
    h.route('/favicon.ico', (_q, res) => {
      res.writeHead(200, { 'content-type': 'image/png' }).end(icon);
    });
    h.route('/find', html('<form method="get" action="/thanks"><input name="ref" aria-label="Ref"><button id="go">Find</button></form>'));
  });
  afterAll(() => h.close());

  it('typed values reach no profile file while the browser runs, nor after it closes', async () => {
    const page = await h.page();
    await page.goto(`${h.origin}/pay`);
    await page.getByLabel('User').pressSequentially('sandbox-user');
    await page.getByLabel('Password').pressSequentially(CANARIES.sitePassword.value);
    await page.getByLabel('Card number').pressSequentially(groupedCard(CANARIES.cardNumber.value));
    await page.getByLabel('Code from SMS').pressSequentially(CANARIES.otp.value);
    // Held with the values in the fields, past the save timer, before the form is sent.
    await sleep(SESSION_SAVE_WAIT_MS);
    await page.click('#pay');
    await page.waitForURL(/\/thanks$/);
    await page.goto(`${h.origin}/find`);
    await page.getByLabel('Ref').pressSequentially(CANARIES.cvv.value);
    await page.click('#go');
    await page.waitForURL(/ref=/);
    await sleep(SESSION_SAVE_WAIT_MS);

    // On Windows, Edge holds its lock files open: those few are skipped while it runs, and searched after it closes.
    const running = profileScan('while running', true);
    expect(running.files).toBeGreaterThan(20);
    expect(running.locked.length, running.locked.join(', ')).toBeLessThan(running.files / 4);
    expect(running.hits, running.text).toEqual([]);

    await h.runtime.jobEnded('job_1');
    await sleep(SESSION_SAVE_WAIT_MS);
    await h.runtime.browser.shutdown();
    const closed = profileScan('after close');
    expect(closed.hits, closed.text).toEqual([]);
    // Sign-ins stay: the cookie store is kept; the session and cache folders are the blocking files.
    const profile = join(h.dataDir, 'browser', 'profile', 'Default');
    expect(existsSync(join(profile, 'Cookies'))).toBe(true);
    expect(statSync(join(profile, 'Sessions')).isFile()).toBe(true);
    expect(statSync(join(profile, 'Cache')).isFile()).toBe(true);

    // The browser opens again over the scrubbed profile and still loads pages.
    const again = await h.page('job_2');
    await again.goto(`${h.origin}/thanks`);
    expect(await again.textContent('p')).toBe('Thanks');
  }, 60_000);
});

describe('profile hygiene on a profile an older foo left behind (CR-0034)', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'foo-profile-'));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('before launch the saved sessions, session storage, crash dumps and cache go, other preferences stay', () => {
    const p = join(dir, 'Default');
    const card = groupedCard(CANARIES.cardNumber.value);
    for (const sub of ['Sessions', 'Cache/Cache_Data', 'Session Storage', '../Crashpad/reports'])
      mkdirSync(join(p, sub), { recursive: true });
    writeFileSync(join(p, 'Sessions', 'Session_1'), Buffer.from(card, 'utf16le'));
    writeFileSync(join(p, 'Cache', 'Cache_Data', 'f_0'), card);
    writeFileSync(join(p, 'Session Storage', '000003.log'), card);
    writeFileSync(join(dir, 'Crashpad', 'reports', 'x.dmp'), card);
    writeFileSync(join(p, 'Current Session'), card);
    writeFileSync(join(p, 'Cookies'), 'kept');
    writeFileSync(
      join(p, 'Preferences'),
      JSON.stringify({ intl: { accept_languages: 'en-IN' }, autofill: { profile_enabled: true, x: 1 } }),
    );

    prepareProfile(dir);

    const report = scan({ roots: { PROFILE: dir }, texts: [], canaries: [CANARIES.cardNumber] });
    expect(report.hits, summary(report)).toEqual([]);
    expect(statSync(join(p, 'Sessions')).isFile()).toBe(true);
    expect(statSync(join(p, 'Cache')).isFile()).toBe(true);
    expect(readFileSync(join(p, 'Cookies'), 'utf8')).toBe('kept');
    expect(JSON.parse(readFileSync(join(p, 'Preferences'), 'utf8'))).toEqual({
      intl: { accept_languages: 'en-IN' },
      autofill: { enabled: false, profile_enabled: false, credit_card_enabled: false, x: 1 },
      credentials_enable_service: false,
      profile: { password_manager_enabled: false },
      history: { saving_disabled: true },
    });
    // Run twice: the same result (a launch after every launch).
    prepareProfile(dir);
    scrubProfile(dir);
    expect(statSync(join(p, 'Sessions')).isFile()).toBe(true);
  });

  it('a profile Chromium has not made yet is prepared without error, and a missing one scrubs to nothing', () => {
    const fresh = join(dir, 'fresh');
    scrubProfile(fresh);
    expect(existsSync(fresh)).toBe(false);
    prepareProfile(fresh);
    expect(statSync(join(fresh, 'Default', 'Sessions')).isFile()).toBe(true);
    expect(JSON.parse(readFileSync(join(fresh, 'Default', 'Preferences'), 'utf8'))).toMatchObject({ history: { saving_disabled: true } });
  });
});
