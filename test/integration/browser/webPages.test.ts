// Spec: 08-2 §8.2 (`web.search` with no cloud key: Bing, then DuckDuckGo, "in the job window"; `web.fetch` needsBrowser: the
// engine reads the page in the job window), 08-4 §27.3 (SEARCH_BUSY only when both search pages are challenges). Real-AI CI
// run 21 (J05, B03): every web search ended SEARCH_BUSY because no job window was ever given to the web tools. 08-2 §8.3.9
// (HTTP 403/429 on the document, "access denied" and bot-check pages are `SITE_BLOCKED`). Real-AI run 30 (B03, J05): pages
// that refused foo were handed to the AI as good reads, so it kept reading until the 25-call budget made the job stuck.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebTools } from '../../../src/engine/tools/web/WebTools';
import { jobWindowPages } from '../../../src/engine/tools/browser/webPages';
import { FakeNet, fixture, world } from '../../fakes/web/net';
import { browserHarness, html, type BrowserHarness } from './harness';

let h: BrowserHarness;
beforeAll(async () => {
  h = await browserHarness();
  h.route('/plain', html('<h1>Local page</h1><p>Read in the job window.</p>'));
  // Bing's result page, served locally: the test never reaches the real Bing.
  h.route('/form', html('<h1>Half-filled form</h1>'));
  // A redirect inside the window onto a hand-back site: foo never reads it.
  h.route('/to-bank', (_q, res) => res.writeHead(302, { location: `${h.bank}/acct` }).end());
  h.route('/acct', html('<p>Balance 12,345</p>'));
  h.route('/search', (_q, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(fixture('bing.html')));
  // Pages that refuse foo, made up here: a 403 and a 429 with a full page of text, and a bot check that answers 200.
  const refusing = (status: number, body: string) => (_q: unknown, r: import('node:http').ServerResponse) =>
    r.writeHead(status, { 'content-type': 'text/html' }).end(html(body));
  const words = '<p>' + 'Reference number 18.4f2a. Automated access to this site is not allowed. '.repeat(20) + '</p>';
  h.route('/denied', refusing(403, `<h1>Access Denied</h1>${words}`));
  h.route('/short-link', (_q, r) => r.writeHead(302, { location: `${h.other}/denied` }).end());
  h.route('/slow-down', refusing(429, `<h1>Too many requests</h1>${words}`));
  h.route('/bot-check', refusing(200, `<h1>Checking your browser before you continue</h1><p>One moment.</p>`));
  // A long article whose comment form says "protected by reCAPTCHA": a real page, not a bot check.
  const article = '<p>' + 'The launch window opens on Thursday and the team is ready for the flight. '.repeat(40) + '</p>';
  h.route('/article', refusing(200, `<h1>Launch this week</h1>${article}<form><p>This form is protected by reCAPTCHA.</p></form>`));
});
afterAll(() => h.close());

describe("web tools read through the job's own window", () => {
  it("loads a page in the job's window (opening it when the job has none) and gives back its HTML", async () => {
    const pages = jobWindowPages(() => h.runtime);
    const got = await pages.load(`${h.origin}/plain`, 'job_web');
    expect(got?.url).toBe(`${h.origin}/plain`);
    expect(got && 'html' in got ? got.html : '').toContain('Read in the job window.');
    expect(h.runtime.page('job_web')?.url()).toBe(`${h.origin}/plain`);
    await h.runtime.jobEnded('job_web');
  });

  it('no job, or no browser, has no window: nothing is loaded', async () => {
    expect(await jobWindowPages(() => h.runtime).load(`${h.origin}/plain`, null)).toBeNull();
    expect(await jobWindowPages(() => null).load(`${h.origin}/plain`, 'job_x')).toBeNull();
  });

  it('web.search with no cloud key gets results from the job window, not SEARCH_BUSY', async () => {
    const real = jobWindowPages(() => h.runtime);
    // Only the host changes: the Bing address foo builds is loaded from the local server instead.
    const page = { load: (url: string, jobId: string | null) => real.load(url.replace('https://www.bing.com', h.origin), jobId) };
    const w = world({ page });
    const r = await new WebTools(w.deps).search({ query: 'ISRO news' }, { chatId: 'c_1', jobId: 'job_search', toolCallId: 'tc_1' });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (r.ok) expect(r.data.length).toBeGreaterThan(0);
    await h.runtime.jobEnded('job_search');
  });

  it('the AI is put back on the page it was on after a web read in its window', async () => {
    const p = await h.page('job_busy');
    await p.goto(`${h.origin}/form`);
    const got = await jobWindowPages(() => h.runtime).load(`${h.origin}/plain`, 'job_busy');
    expect(got && 'html' in got ? got.html : '').toContain('Read in the job window.');
    expect(p.url()).toBe(`${h.origin}/form`);
    await h.runtime.jobEnded('job_busy');
  });

  it('a page that lands on a hand-back site is never read (§8.3.10)', async () => {
    const got = await jobWindowPages(() => h.runtime).load(`${h.origin}/to-bank`, 'job_bank');
    expect(got).toBeNull();
    // The window does not stay on the bank page either.
    expect(h.runtime.page('job_bank')?.url()).toBe('about:blank');
    await h.runtime.jobEnded('job_bank');
  });

  it('a stopped job waiting for one of the 3 windows gives up, and never takes a window later', async () => {
    const held = ['job_a', 'job_b', 'job_c'];
    for (const j of held) await h.page(j);
    const ac = new AbortController();
    const waiting = jobWindowPages(() => h.runtime).load(`${h.origin}/plain`, 'job_late', ac.signal);
    ac.abort();
    expect(await waiting).toBeNull();
    await h.runtime.jobEnded('job_late');
    await h.runtime.jobEnded('job_a');
    // The freed slot is not handed to the stopped job.
    expect(h.runtime.browser.window('job_late')).toBeUndefined();
    for (const j of held.slice(1)) await h.runtime.jobEnded(j);
  });

  it('a 403 or 429 page, or a bot check, is never handed back as a read: it is SITE_BLOCKED (§8.3.9)', async () => {
    const pages = jobWindowPages(() => h.runtime);
    for (const path of ['/denied', '/slow-down', '/bot-check']) {
      const got = await pages.load(`${h.origin}${path}`, 'job_refused');
      expect(got, path).toEqual({ refused: 'SITE_BLOCKED', url: `${h.origin}${path}` });
      expect(h.runtime.page('job_refused')?.url()).toBe('about:blank');
    }
    await h.runtime.jobEnded('job_refused');
  });

  it('a long article that only mentions a CAPTCHA on its comment form is read, not refused', async () => {
    const got = await jobWindowPages(() => h.runtime).load(`${h.origin}/article`, 'job_article');
    expect(got && 'html' in got ? got.html : '').toContain('The launch window opens on Thursday');
    await h.runtime.jobEnded('job_article');
  });

  it('web.fetch of a news page that refuses foo (GET and window) answers SITE_BLOCKED, not the refusal text', async () => {
    const real = jobWindowPages(() => h.runtime);
    const news = 'https://news.example.test';
    // The plain GET is refused too (403), so the page goes to the window, which is served locally.
    const net = new FakeNet().on('news.example.test', () => new Response('<h1>Access Denied</h1>', { status: 403 }));
    const page = { load: (url: string, jobId: string | null) => real.load(url.replace(news, h.origin), jobId) };
    const r = await new WebTools(world({ net, page }).deps).fetch(
      { url: `${news}/denied` },
      { chatId: 'c_1', jobId: 'job_fetch', toolCallId: 'tc_1' },
    );
    expect(r).toEqual({ ok: false, errorKind: 'SITE_BLOCKED', landed: `${h.origin}/denied` });
    await h.runtime.jobEnded('job_fetch');
  });

  it('a link that redirects to a blocking site names where it landed, so the note blames that site', async () => {
    const real = jobWindowPages(() => h.runtime);
    const net = new FakeNet().on('links.example.test', () => new Response('', { status: 403 }));
    const page = { load: (url: string, jobId: string | null) => real.load(url.replace('https://links.example.test', h.origin), jobId) };
    const r = await new WebTools(world({ net, page }).deps).fetch(
      { url: 'https://links.example.test/short-link' },
      { chatId: 'c_1', jobId: 'job_link', toolCallId: 'tc_2' },
    );
    expect(r).toEqual({ ok: false, errorKind: 'SITE_BLOCKED', landed: `${h.other}/denied` });
    await h.runtime.jobEnded('job_link');
  });
});
