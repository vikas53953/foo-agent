// Spec: 08-2 §8.3.10 (hand-back sites: `browser.open`, `web.fetch` (cloud path) and `web.browseCloud` on them return
// SITE_HANDBACK; the job posts an `error` card (kind SITE_HANDBACK) "This is your bank's site. I'll open it for you, and you
// do this part." [ Open {site} ] (`errors.site_handback.body`, `errors.site_handback.button`), opened in the user's default
// browser, not foo's window; foo never types, clicks or reads inside these sites), 08-4 §27.4 (the card shape), 08-3 §21.2
// row SITE_HANDBACK (step handed back; fix `open_url`), 08-1 §3.2 (`app:openExternal { target: 'handback_site' }` with the
// card's id and nonce), AT-142. The matcher is the one `handback.check` of src/shared/handback.ts (X-129).
import { t } from '../../../shared/copy/t';
import type { FixAction } from '../../../shared/types';

/** The page address a SITE_HANDBACK result names (the redirect target when it landed there), else the asked-for address. */
export function handbackUrl(result: unknown, args: unknown): string | null {
  for (const v of [(result as { url?: unknown } | null)?.url, (args as { url?: unknown } | null)?.url])
    if (typeof v === 'string' && /^https:\/\//iu.test(v)) return v;
  return null;
}

/** "Open netbanking.examplebank.in": the site is the page's host name. */
export function siteOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** The hand-back card's words and its one button (05-3 §5.20 shape: line 2 is empty, the card has no "what is safe" line). */
export function handbackCopy(url: string): { whatHappened: string; whatIsSafe: string; label: string; action: FixAction } {
  return {
    whatHappened: t('errors.site_handback.body'),
    whatIsSafe: '',
    label: t('errors.site_handback.button', { site: siteOf(url) }),
    action: { kind: 'open_url', url },
  };
}
