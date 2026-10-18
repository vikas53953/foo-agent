// Spec: 08-2 §8.2.1 (a click on a commit control (commit words in the name or nearby text inside a form, or any control of a form
// with payment / password fields, + the 5.3.1 Hindi forms) is refused with USE_SUBMIT and nothing is clicked; it must go through
// `browser.submit` with an approval id), §8.3.5 (`confirm()` is a commit control), 10-2 ART-03 (read-only work never submits).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { browserHarness, html, okResult, type BrowserHarness } from './harness';

let h: BrowserHarness;
const submits = async () => (await h.page()).evaluate('window.submits || 0') as Promise<number>;
const refOf = async (pattern: RegExp) => {
  h.runtime.stepStarted('job_1');
  const m = pattern.exec(okResult(await h.run('browser.snapshot')).snapshot as string);
  if (!m?.[1]) throw new Error(`no ref for ${pattern}`);
  return m[1];
};
const count = `onsubmit="event.preventDefault(); window.submits=(window.submits||0)+1"`;

beforeAll(async () => {
  h = await browserHarness();
  h.route(
    '/c',
    html(`
      <form ${count}><p>Table for 4 at 8 PM</p><button>Book table</button></form>
      <form ${count}><input type="submit" value="Place order"></form>
      <form ${count}><button>भुगतान करें</button></form>
      <form ${count}><label>Password <input type="password"></label><button>Next</button></form>
      <form ${count}><input autocomplete="cc-number" placeholder="Card"><a href="#" onclick="document.forms[4].requestSubmit()">Continue</a></form>
      <form ${count}><p>Confirm your seat</p><button>Go</button></form>
      <form onsubmit="event.preventDefault(); window.submits=(window.submits||0)+1; document.getElementById('res').textContent='3 results'"><input placeholder="Dish"><button>Search</button></form><p id="res"></p>
      <a href="/menu">Book now</a>`),
  );
  h.route('/menu', html('<h1>Menu</h1>'));
}, 60_000);
afterAll(() => h.close());

describe('08-2 §8.2.1 commit clicks are refused', { timeout: 60_000 }, () => {
  it.each([
    [/\[(e\d+)\] button "Book table"/, 'commit word in the name, inside a form'],
    [/\[(e\d+)\] button "Place order"/, 'input type=submit'],
    [/\[(e\d+)\] button "भुगतान करें"/, 'Hindi form of pay'],
    [/\[(e\d+)\] button "Next"/, 'a form with a password field'],
    [/\[(e\d+)\] link "Continue"/, 'a link in a form with a card field'],
    [/\[(e\d+)\] button "Go"/, 'commit word in the nearby text'],
  ])('%s (%s) → USE_SUBMIT, nothing submitted', async (pattern) => {
    okResult(await h.run('browser.open', { url: `${h.origin}/c` }));
    expect(await h.run('browser.click', { ref: await refOf(pattern) })).toEqual({ kind: 'error', errorKind: 'USE_SUBMIT' });
    expect(await submits()).toBe(0);
  });

  it('a search button in a plain form is a read click', async () => {
    okResult(await h.run('browser.open', { url: `${h.origin}/c` }));
    okResult(await h.run('browser.click', { ref: await refOf(/\[(e\d+)\] button "Search"/) }));
    expect(await submits()).toBe(1);
  });

  it('"Book now" outside any form is a read click (it only opens a page)', async () => {
    okResult(await h.run('browser.open', { url: `${h.origin}/c` }));
    const r = okResult(await h.run('browser.click', { ref: await refOf(/\[(e\d+)\] link "Book now"/) }));
    expect(r.url).toBe(`${h.origin}/menu`);
  });

  it('the click class is read in the catalogue; the commit decision is made per element', () => {
    expect(h.tools['browser.click']?.actionClass).toBe('read');
    expect(h.tools['browser.submit']).toBeUndefined();
    expect(h.tools['browser.fillCard']).toBeUndefined();
  });
});
