// Spec: 08-2 §8.2 (`web.search` with no cloud key: Bing, then DuckDuckGo, "in the job window"; `web.fetch` needsBrowser: the
// engine reads the page in the job window), 08-4 §27.3 (SEARCH_BUSY only when both search pages are challenges). Real-AI CI
// run 21 (J05, B03): every web search ended SEARCH_BUSY because no job window was ever given to the web tools.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebTools } from '../../../src/engine/tools/web/WebTools';
import { jobWindowPages } from '../../../src/engine/tools/browser/webPages';
import { fixture, world } from '../../fakes/web/net';
import { browserHarness, html, type BrowserHarness } from './harness';

let h: BrowserHarness;
beforeAll(async () => {
  h = await browserHarness();
  h.route('/plain', html('<h1>Local page</h1><p>Read in the job window.</p>'));
  // Bing's result page, served locally: the test never reaches the real Bing.
  h.route('/search', (_q, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(fixture('bing.html')));
});
afterAll(() => h.close());

describe("web tools read through the job's own window", () => {
  it("loads a page in the job's window (opening it when the job has none) and gives back its HTML", async () => {
    const pages = jobWindowPages(() => h.runtime);
    const got = await pages.load(`${h.origin}/plain`, 'job_web');
    expect(got?.url).toBe(`${h.origin}/plain`);
    expect(got?.html).toContain('Read in the job window.');
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
});
