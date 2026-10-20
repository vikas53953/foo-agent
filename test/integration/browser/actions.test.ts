// Spec: 08-2 §8.3.5 (actions on `[data-foo-ref]` locators, 10 s actionability; wait for load or 2 s network idle, max 15 s; two
// misses in a row → SITE_TIMEOUT; expected change, no change → one retry → stuck rules; watchdogs: alert auto-dismissed, confirm
// treated as a commit control, pop-ups adopted, downloads saved), §11.5 (SECRET_IN_TYPE: text hitting the secret patterns or the
// SecretRegistry; masked fields take no AI typing), §8.2 `browser.open` URL rule and §8.3.10 hand-back sites, 08-4 §26.8
// (≤ 3 job windows, a 4th waits).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { browserHarness, html, okResult, type BrowserHarness } from './harness';

let h: BrowserHarness;
const refOf = async (pattern: RegExp) => {
  h.runtime.stepStarted('job_1');
  const text = okResult(await h.run('browser.snapshot')).snapshot as string;
  const m = pattern.exec(text);
  if (!m?.[1]) throw new Error(`no ref for ${pattern} in\n${text}`);
  return m[1];
};
const counter = (name: string) => async () => (await h.page()).evaluate(`window.${name} || 0`) as Promise<number>;

beforeAll(async () => {
  h = await browserHarness({ settleMaxMs: 1_500 });
  h.route(
    '/home',
    html(`<a href="/menu">Menu</a>
      <button id="noop" onclick="window.clicks=(window.clicks||0)+1">Nothing</button>
      <button id="ask" onclick="window.asked=confirm('Sure?')?'yes':'no'">Remove item</button>
      <button id="al" onclick="alert('Hi'); window.alerted=1">Hello</button>
      <a id="pop" href="/menu" target="_blank">Open menu</a>
      <a id="dl" href="/file.txt" download>Get file</a>
      <input id="city" name="city" placeholder="City">
      <input id="pw" type="password" placeholder="Password">
      <select id="sel"><option>Lunch</option><option>Dinner</option></select>
      <label><input id="veg" type="checkbox"> Veg only</label>
      <form id="search" onsubmit="event.preventDefault(); window.searched=(window.searched||0)+1"><input id="q" placeholder="Search"><button>Search</button></form>
      <form id="payf" onsubmit="event.preventDefault(); window.paid=(window.paid||0)+1"><input id="amt" placeholder="Amount"><button>Pay now</button></form>`),
  );
  h.route('/menu', html(`<h1>Menu</h1>`));
  h.route('/file.txt', (_q, res) => {
    res.writeHead(200, { 'content-type': 'text/plain', 'content-disposition': 'attachment; filename="menu.txt"' }).end('dal, roti');
  });
  h.route('/slow', (_q, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.write('<!doctype html><html><body><p>still loading');
    // never ends: `load` never fires
  });
  h.route('/forbidden', (_q, res) => res.writeHead(403, { 'content-type': 'text/html' }).end(html('<p>Access denied</p>')));
  h.route('/captcha', html(`<h1>Please verify you are human</h1>`));
  h.route('/to-bank', (_q, res) => res.writeHead(302, { location: `${h.bank}/login` }).end());
  h.route('/login', html('<p>Bank sign-in</p>'));
}, 60_000);
afterAll(() => h.close());

describe('08-2 §8.2 browser.open', { timeout: 60_000 }, () => {
  it('opens an allowed page in the job window', async () => {
    const r = okResult(await h.run('browser.open', { url: `${h.origin}/home` }));
    expect(r.url).toBe(`${h.origin}/home`);
  });
  it('refuses blocked addresses and hand-back sites before any navigation', async () => {
    expect(await h.run('browser.open', { url: 'file:///etc/passwd' })).toEqual({ kind: 'error', errorKind: 'URL_NOT_ALLOWED' });
    expect(await h.run('browser.open', { url: 'http://192.168.1.1/' })).toEqual({ kind: 'error', errorKind: 'URL_NOT_ALLOWED' });
    expect(await h.run('browser.open', { url: 'https://netbanking.hdfcbank.com/' })).toEqual({ kind: 'error', errorKind: 'SITE_HANDBACK' });
    expect((await h.page()).url()).toBe(`${h.origin}/home`);
  });
  it('a redirect onto a hand-back site is left at once', async () => {
    expect(await h.run('browser.open', { url: `${h.origin}/to-bank` })).toEqual({ kind: 'error', errorKind: 'SITE_HANDBACK' });
    expect((await h.page()).url()).toBe('about:blank');
  });
  it('403 → SITE_BLOCKED; a bot-check page → SITE_CAPTCHA (never solved)', async () => {
    expect(await h.run('browser.open', { url: `${h.origin}/forbidden` })).toMatchObject({ kind: 'error', errorKind: 'SITE_BLOCKED' });
    expect(await h.run('browser.open', { url: `${h.origin}/captcha` })).toEqual({ kind: 'error', errorKind: 'SITE_CAPTCHA' });
  });
  it('two load misses in a row → SITE_TIMEOUT', async () => {
    const first = await h.run('browser.open', { url: `${h.origin}/slow` }, 'job_slow');
    expect(first.kind).toBe('ok');
    expect(await h.run('browser.open', { url: `${h.origin}/slow` }, 'job_slow')).toEqual({ kind: 'error', errorKind: 'SITE_TIMEOUT' });
    await h.runtime.jobEnded('job_slow');
  });
});

describe('08-2 §8.3.5 actions', { timeout: 60_000 }, () => {
  it('a click that navigates is ok and changed', async () => {
    okResult(await h.run('browser.open', { url: `${h.origin}/home` }));
    const r = okResult(await h.run('browser.click', { ref: await refOf(/\[(e\d+)\] link "Menu"/) }));
    expect(r).toMatchObject({ url: `${h.origin}/menu`, changed: true });
  });
  it('no change → exactly one retry → ok with changed:false (the stuck rules take it from there)', async () => {
    okResult(await h.run('browser.open', { url: `${h.origin}/home` }));
    const r = okResult(await h.run('browser.click', { ref: await refOf(/\[(e\d+)\] button "Nothing"/) }));
    expect(r.changed).toBe(false);
    expect(await counter('clicks')()).toBe(2);
  });
  it('a click that raises confirm() is a commit click: the dialog is answered no and USE_SUBMIT returned', async () => {
    const r = await h.run('browser.click', { ref: await refOf(/\[(e\d+)\] button "Remove item"/) });
    expect(r).toEqual({ kind: 'error', errorKind: 'USE_SUBMIT', result: { reason: 'confirm_dialog' } });
    expect(await (await h.page()).evaluate('window.asked')).toBe('no');
  });
  it('alert() is dismissed by the watchdog and the page carries on', async () => {
    okResult(await h.run('browser.click', { ref: await refOf(/\[(e\d+)\] button "Hello"/) }));
    expect(await counter('alerted')()).toBe(1);
  });
  it('type sets the value; secrets and masked fields are refused with SECRET_IN_TYPE', async () => {
    const city = await refOf(/\[(e\d+)\] textbox "City"/);
    okResult(await h.run('browser.type', { ref: city, text: 'Bengaluru' }));
    expect(await (await h.page()).inputValue('#city')).toBe('Bengaluru');
    expect(await h.run('browser.type', { ref: city, text: 'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789ABCD' })).toEqual({
      kind: 'error',
      errorKind: 'SECRET_IN_TYPE',
    });
    expect(await h.run('browser.type', { ref: city, text: '4111 1111 1111 1111' })).toEqual({ kind: 'error', errorKind: 'SECRET_IN_TYPE' });
    h.redactor.registry.add({ handle: 'pw1', value: 'hunter2-garden' });
    expect(await h.run('browser.type', { ref: city, text: 'my hunter2-garden' })).toEqual({ kind: 'error', errorKind: 'SECRET_IN_TYPE' });
    const pw = await refOf(/\[(e\d+)\] textbox "Password"/);
    expect(await h.run('browser.type', { ref: pw, text: 'plain words' })).toEqual({ kind: 'error', errorKind: 'SECRET_IN_TYPE' });
    expect(await (await h.page()).inputValue('#pw')).toBe('');
  });
  it('select and check', async () => {
    okResult(await h.run('browser.select', { ref: await refOf(/\[(e\d+)\] combobox/), value: 'Dinner' }));
    expect(await (await h.page()).inputValue('#sel')).toBe('Dinner');
    okResult(await h.run('browser.check', { ref: await refOf(/\[(e\d+)\] checkbox "Veg only"/) }));
    expect(await (await h.page()).isChecked('#veg')).toBe(true);
    okResult(await h.run('browser.check', { ref: await refOf(/\[(e\d+)\] checkbox "Veg only"/), value: false }));
    expect(await (await h.page()).isChecked('#veg')).toBe(false);
  });
  it('Enter in a search form submits; Enter in a pay form is refused like the Pay click', async () => {
    okResult(await h.run('browser.press', { key: 'Enter', ref: await refOf(/\[(e\d+)\] textbox "Search"/) }));
    expect(await counter('searched')()).toBe(1);
    expect(await h.run('browser.press', { key: 'Enter', ref: await refOf(/\[(e\d+)\] textbox "Amount"/) })).toEqual({
      kind: 'error',
      errorKind: 'USE_SUBMIT',
    });
    expect(await counter('paid')()).toBe(0);
  });
  it('a pop-up is adopted into the job: the next action runs on it', async () => {
    okResult(await h.run('browser.click', { ref: await refOf(/\[(e\d+)\] link "Open menu"/) }));
    await expect.poll(async () => (await h.page()).url()).toBe(`${h.origin}/menu`);
    await (await h.page()).close();
    expect((await h.page()).url()).toBe(`${h.origin}/home`);
  });
  it('download saves into {DATA}/jobs/{id}/downloads/', async () => {
    const r = okResult(await h.run('browser.download', { ref: await refOf(/\[(e\d+)\] link "Get file"/) }));
    expect(r.file).toBe('menu.txt');
    expect(existsSync(join(h.dataDir, 'jobs', 'job_1', 'downloads', 'menu.txt'))).toBe(true);
  });
  it('back and wait (≤ 15 s)', async () => {
    okResult(await h.run('browser.open', { url: `${h.origin}/menu` }));
    expect(okResult(await h.run('browser.back'))).toMatchObject({ url: `${h.origin}/home`, changed: true });
    expect(await h.run('browser.wait', { ms: 20_000 })).toEqual({ kind: 'error', errorKind: 'VALIDATION' });
    okResult(await h.run('browser.wait', { ms: 10 }));
  });
  it('an unknown ref is refused, never guessed', async () => {
    expect(await h.run('browser.click', { ref: 'e99999' })).toMatchObject({ kind: 'error', errorKind: 'SITE_CHANGED' });
    expect(await h.run('browser.click', { ref: '#pay' })).toMatchObject({ kind: 'error', errorKind: 'VALIDATION' });
  });
});

describe('08-4 §26.8 job windows', { timeout: 60_000 }, () => {
  it('each job gets its own window; a 4th waits until one closes', async () => {
    await h.runtime.jobEnded('job_1');
    const pages = await Promise.all(['w1', 'w2', 'w3'].map((j) => h.page(j)));
    expect(new Set(pages).size).toBe(3);
    let fourth = false;
    const p4 = h.page('w4').then(() => (fourth = true));
    await new Promise((r) => setTimeout(r, 300));
    expect(fourth).toBe(false);
    expect(h.runtime.browser.pool.isQueued('w4')).toBe(true);
    await h.runtime.jobEnded('w2');
    await p4;
    expect(fourth).toBe(true);
    for (const j of ['w1', 'w3', 'w4']) await h.runtime.jobEnded(j);
  });
});
