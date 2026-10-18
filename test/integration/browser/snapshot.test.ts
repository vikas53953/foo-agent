// Spec: 08-2 §8.3.4 (masked snapshot: ≤ 300 interactive elements, ≤ 8,000 chars of visible text, `[{ref}] {role} "{name}"
// {value-or-state}`, refs are data-foo-ref; masked at source: type=password, autocomplete cc-* / one-time-code / current-password /
// new-password, /pass|pwd|cvv|cvc|otp|pin|card.?num|security.?code/i in name/id/label, data-foo-secret → [hidden]; then the
// Redactor; wrapped untrusted; open shadow roots and cross-origin frames included by routing refs; a diff after the first
// snapshot), §11.4 R5, 10-1 AT-056 (data part: the AI never gets the password), 10-2 ART-08a (canary never in a snapshot).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MAX_ELEMENTS, MAX_TEXT_CHARS } from '../../../src/engine/tools/browser/snapshot';
import { browserHarness, html, okResult, type BrowserHarness } from './harness';

const CANARY = 'CANARY-pw-7f3a9c21';
const FORM = html(`
  <h1>Checkout</h1>
  <form id="f">
    <label for="email">Email</label><input id="email" name="email" value="asha@example.com">
    <label for="pw">Password</label><input id="pw" type="password" name="pw">
    <input name="card" autocomplete="cc-number" placeholder="Card">
    <input name="otp_box" placeholder="Code">
    <label>PIN <input name="x1"></label>
    <input name="note" data-foo-secret placeholder="Secret note">
    <input id="cardnumber" placeholder="Number on card">
    <input name="security_code" placeholder="CVV">
    <label><input type="checkbox" name="terms" checked> I agree</label>
    <select name="guests"><option>2</option><option selected>4</option></select>
    <button type="submit">Pay ₹1,240</button>
  </form>
  <a href="/menu">Menu</a>
  <p>Your key is sk-proj-abcdefghijklmnopqrstuvwxyz0123456789ABCD for now.</p>
`);

let h: BrowserHarness;
beforeAll(async () => {
  h = await browserHarness();
  h.route('/form', FORM);
  h.route(
    '/many',
    html(Array.from({ length: 400 }, (_, i) => `<button>b${i}</button>`).join('') + `<p>${'word '.repeat(4000)}</p>`),
  );
  h.route(
    '/shadow',
    html(
      `<div id="host"></div><script>const r=document.getElementById('host').attachShadow({mode:'open'});r.innerHTML='<button>Inside shadow</button><input type="password" id="spw">';</script>`,
    ),
  );
  h.route('/frame', html(`<form><input name="cvv" placeholder="CVV"><button>Next</button></form>`));
  h.route('/outer', html(`<p>Outer page</p><iframe id="ifr" style="width:400px;height:200px"></iframe><script>ifr.src=location.href.replace('127.0.0.1','localhost').replace('/outer','/frame')</script>`));
}, 60_000);
afterAll(() => h.close());

async function fillAll() {
  const page = await h.page();
  for (const sel of ['#pw', '[name=card]', '[name=otp_box]', '[name=x1]', '[name=note]', '#cardnumber', '[name=security_code]'])
    await page.fill(sel, CANARY);
}

describe('08-2 §8.3.4 masked snapshot', { timeout: 60_000 }, () => {
  it('AT-056 data part: every masked-at-source field reads [hidden]; the value is in no result', async () => {
    okResult(await h.run('browser.open', { url: `${h.origin}/form` }));
    await fillAll();
    const r = okResult(await h.run('browser.snapshot'));
    const text = r.snapshot as string;
    expect(JSON.stringify(r)).not.toContain(CANARY);
    expect(text).toMatch(/\[e\d+\] textbox "Password" \[hidden\]/);
    expect(text).toMatch(/\[e\d+\] textbox "Card" \[hidden\]/);
    expect(text).toMatch(/\[e\d+\] textbox "Code" \[hidden\]/);
    expect(text).toMatch(/\[e\d+\] textbox "PIN" \[hidden\]/);
    expect(text).toMatch(/\[e\d+\] textbox "Secret note" \[hidden\]/);
    expect(text).toMatch(/\[e\d+\] textbox "Number on card" \[hidden\]/);
    expect(text).toMatch(/\[e\d+\] textbox "CVV" \[hidden\]/);
    expect(text).toMatch(/\[e\d+\] textbox "Email" "asha@example.com"/);
    expect(text).toMatch(/\[e\d+\] checkbox "I agree" checked/);
    expect(text).toMatch(/\[e\d+\] combobox "" "4"/);
    expect(text).toMatch(/\[e\d+\] button "Pay ₹1,240"/);
    expect(text).toMatch(/\[e\d+\] link "Menu"/);
  });

  it('refs are data-foo-ref attributes on the page and stay the same across snapshots', async () => {
    const page = await h.page();
    const refs = await page.$$eval('[data-foo-ref]', (els) => els.map((e) => e.getAttribute('data-foo-ref')));
    expect(refs.length).toBeGreaterThanOrEqual(12);
    const before = await page.getAttribute('a', 'data-foo-ref');
    await h.run('browser.snapshot');
    expect(await page.getAttribute('a', 'data-foo-ref')).toBe(before);
  });

  it('the Redactor runs over the text and the result is wrapped untrusted', async () => {
    h.runtime.stepStarted('job_1');
    const text = okResult(await h.run('browser.snapshot')).snapshot as string;
    expect(text.startsWith('<untrusted source="web" ref="snap-')).toBe(true);
    expect(text.endsWith('</untrusted>')).toBe(true);
    expect(text).not.toContain('sk-proj-abcdefghij');
    expect(text).toContain('[hidden]');
    h.redactor.registry.add({ handle: 'h1', value: 'asha@example.com' });
    h.runtime.stepStarted('job_1');
    expect(okResult(await h.run('browser.snapshot')).snapshot).not.toContain('asha@example.com');
  });

  it('after the first snapshot in a step only a diff is sent; a new step sends it whole', async () => {
    h.runtime.stepStarted('job_1');
    expect(okResult(await h.run('browser.snapshot')).snapshot).toContain('Controls:');
    const page = await h.page();
    await page.fill('#email', 'other@example.com');
    const diff = okResult(await h.run('browser.snapshot')).snapshot as string;
    expect(diff).toMatch(/Changed controls \(\d+ unchanged\):/);
    expect(diff).toContain('other@example.com');
    expect(diff).not.toContain('link "Menu"');
    h.runtime.stepStarted('job_1');
    expect(okResult(await h.run('browser.snapshot')).snapshot).toContain('Controls:');
  });

  it(`at most ${MAX_ELEMENTS} elements and ${MAX_TEXT_CHARS} chars of visible text`, async () => {
    okResult(await h.run('browser.open', { url: `${h.origin}/many` }));
    const r = okResult(await h.run('browser.snapshot'));
    expect(r.elements).toBe(300);
    const text = r.snapshot as string;
    expect((text.match(/^\[e\d+\] button/gm) ?? []).length).toBe(300);
    const visible = text.slice(text.indexOf('\nText:\n') + 7, text.lastIndexOf('</untrusted>'));
    expect(visible.length).toBeLessThanOrEqual(MAX_TEXT_CHARS);
    expect(visible.length).toBeGreaterThan(7_000);
  });

  it('open shadow roots are walked, and their secret fields are masked', async () => {
    okResult(await h.run('browser.open', { url: `${h.origin}/shadow` }));
    const page = await h.page();
    await page.locator('#spw').fill(CANARY);
    const r = okResult(await h.run('browser.snapshot'));
    expect(r.snapshot).toMatch(/\[e\d+\] button "Inside shadow"/);
    expect(r.snapshot).toMatch(/\[e\d+\] textbox "" \[hidden\]/);
    expect(JSON.stringify(r)).not.toContain(CANARY);
  });

  it('cross-origin frames are included; their refs route to the frame that owns them', async () => {
    okResult(await h.run('browser.open', { url: `${h.origin}/outer` }));
    const page = await h.page();
    await page.waitForFunction(() => document.querySelector('iframe')?.contentWindow !== null);
    const frame = await (await page.waitForSelector('iframe')).contentFrame();
    await frame!.waitForSelector('input');
    await frame!.fill('input', CANARY);
    const r = okResult(await h.run('browser.snapshot'));
    expect(r.snapshot).toMatch(/\[f\d+e\d+\] textbox "CVV" \[hidden\]/);
    expect(r.snapshot).toMatch(/\[f\d+e\d+\] button "Next"/);
    expect(JSON.stringify(r)).not.toContain(CANARY);
    const next = /\[(f\d+e\d+)\] button "Next"/.exec(r.snapshot as string)![1]!;
    // The button sits in a form with a card field, so the click is a commit click: routed to the frame and refused there.
    expect(await h.run('browser.click', { ref: next })).toEqual({ kind: 'error', errorKind: 'USE_SUBMIT' });
  });

  it("scope 'form' keeps the controls inside forms and drops the page text", async () => {
    okResult(await h.run('browser.open', { url: `${h.origin}/form` }));
    const text = okResult(await h.run('browser.snapshot', { scope: 'form' })).snapshot as string;
    expect(text).toContain('button "Pay ₹1,240"');
    expect(text).not.toContain('link "Menu"');
    expect(text).not.toContain('Text:');
  });
});
