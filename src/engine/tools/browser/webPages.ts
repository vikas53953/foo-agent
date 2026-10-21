// Spec: 08-2 §8.2 (`web.search` local path: Bing, then DuckDuckGo once, "in the job window"; `web.fetch` needsBrowser: the
// engine reads the page in the job window with the same extractor), 08-4 §27.3 (SEARCH_BUSY only after both search pages
// were challenges), M9 T3 `BrowserHandle`. The web tools' PageLoader over foo's own browser: the job's window, opened when
// the job has none (the 3-window cap and queue of 08-4 §26.8 apply as for `browser.open`).
import type { PageLoader } from '../web/types';
import type { BrowserRuntime } from './tools';

/** Same wait as `browser.open` (08-2 §8.3.5). */
const LOAD_MS = 15_000;

export function jobWindowPages(runtime: () => BrowserRuntime | null): PageLoader {
  return {
    async load(url, jobId) {
      const rt = runtime();
      // A web call outside a job has no window to read in.
      if (!rt || !jobId) return null;
      if (!rt.page(jobId) && !(await rt.browser.openWindow(jobId)).ok) return null;
      const page = rt.page(jobId);
      if (!page) return null;
      const res = await page.goto(url, { waitUntil: 'load', timeout: LOAD_MS }).catch(() => null);
      if (!res) return null;
      // The page changed under the AI: its next snapshot is sent whole (§8.3.4).
      rt.differ.reset(jobId);
      return { url: page.url(), html: await page.content() };
    },
  };
}
