// Spec: 08-2 §8.2 (`web.search` local path: Bing, then DuckDuckGo once, "in the job window"; `web.fetch` needsBrowser: the
// engine reads the page in the job window with the same extractor), 08-4 §27.3 (SEARCH_BUSY only after both search pages
// were challenges), M9 T3 `BrowserHandle`. The web tools' PageLoader over foo's own browser: the job's window, opened when
// the job has none (the 3-window cap and queue of 08-4 §26.8 apply as for `browser.open`); 08-2 §8.3.10 (hand-back sites never read);
// §8.3.9 (HTTP 403/429 on the document and bot-check pages are `SITE_BLOCKED`, never read).
import type { Page } from 'playwright-core';
import type { LoadedPage, PageLoader, RefusedPage } from '../web/types';
import type { BrowserRuntime } from './tools';
import { BLOCKED_STATUS, isChallengePage } from './watchdogs';

/** Same wait as `browser.open` (08-2 §8.3.5). */
const LOAD_MS = 15_000;

/** Under this much text a challenge word means a bot-check page; a long article may just have a CAPTCHA on its comment form. */
const INTERSTITIAL_CHARS = 1500;

async function isInterstitial(page: Page): Promise<boolean> {
  if (!(await isChallengePage(page))) return false;
  const text = (await page.evaluate('document.body ? document.body.innerText.length : 0').catch(() => 0)) as number;
  return text < INTERSTITIAL_CHARS;
}

export function jobWindowPages(runtime: () => BrowserRuntime | null): PageLoader {
  return {
    async load(url, jobId, signal) {
      const rt = runtime();
      // A web call outside a job has no window to read in.
      if (!rt || !jobId) return null;
      // The job's stop signal ends a wait in the window queue, so a stopped job never takes a window it would not close.
      if (!rt.page(jobId) && !(await rt.browser.openWindow(jobId, signal)).ok) return null;
      const page = rt.page(jobId);
      // A sign-in in front of the window is the user's: a web call never navigates it (as for `browser.*`).
      if (!page || signal?.aborted || rt.paused(jobId)) return null;
      // The AI may be part-way through a site in this window: it is put back on that page after the read.
      const before = page.url();
      const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: LOAD_MS }).catch(() => null);
      // The page changed under the AI: its next snapshot is sent whole (§8.3.4).
      rt.differ.reset(jobId);
      let got: LoadedPage | RefusedPage | null = null;
      // A redirect may land on a hand-back site: foo never reads inside it (§8.3.10), as `browser.open` re-checks.
      if (res && !rt.handback(page.url())) {
        // A site that blocked foo is never read: its "Access denied" text would look like the page to the AI (run 30).
        if (BLOCKED_STATUS.has(res.status()) || (await isInterstitial(page))) got = { refused: 'SITE_BLOCKED', url: page.url() };
        else {
          const html = await page.content().catch(() => null);
          if (html !== null) got = { url: page.url(), html };
        }
      }
      // Back to where the AI was; a fresh window that landed on a hand-back site or a refusal is left blank.
      if (before !== 'about:blank') await page.goto(before, { timeout: LOAD_MS }).catch(() => null);
      else if ((got && 'refused' in got) || rt.handback(page.url())) await page.goto('about:blank').catch(() => null);
      return got;
    },
  };
}
