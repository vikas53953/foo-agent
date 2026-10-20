// Spec: 04 §13.6 (main serves an AI page from its own privileged scheme `foo-page://{pageId}` with the response header CSP
// PAGE_CSP; main's `webRequest.onBeforeRequest` denies every request from that frame except the one `foo-page://{pageId}`
// document, so self-navigation and refresh tricks fail too), 08-0 §E.4 (the `foo-page` scheme beside `app`), CR-0022
// AT-357, AT-358, X-180. The scheme is registered privileged in windows/protocol.ts (before ready).
import { protocol, type WebContents } from 'electron';
import { PAGE_CSP, PAGE_SCHEME, PageIdSchema } from '../../shared/kit/page';
import { logEvent } from '../log/techLog';
import { pages, pageUrl, type PageRegistry } from './pages';

/** The headers every page document is served with: its own CSP, never cached, never sniffed. */
export const PAGE_HEADERS: Readonly<Record<string, string>> = {
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': PAGE_CSP,
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

/** The page id a `foo-page://` URL names when it is exactly a page's document (`foo-page://{pageId}/`), else null. */
export function pageIdOf(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== `${PAGE_SCHEME}:` || u.pathname !== '/' || u.search || u.username || u.password || u.port) return null;
  return PageIdSchema.safeParse(u.hostname).success ? u.hostname : null;
}

export interface PageRequest {
  url: string;
  resourceType: string;
  /** The URL of the frame the request came from (or is navigating), when Electron names one. */
  frameUrl?: string;
}

/**
 * 04 §13.6 rule for one request in the main window's session. foo's own window has no other frames, so every frame
 * navigation must be a page document foo is serving, and nothing may leave a page's frame except its own document again.
 * Requests that are neither from a page frame nor a frame load (the app's own) are left alone.
 */
export function pageRequestVerdict(req: PageRequest, registry: PageRegistry = pages): 'allow' | 'deny' {
  const target = req.url.startsWith(`${PAGE_SCHEME}:`) ? pageIdOf(req.url) : null;
  const fromPage = !!req.frameUrl?.startsWith(`${PAGE_SCHEME}:`);
  if (req.url.startsWith(`${PAGE_SCHEME}:`)) {
    if (!target || req.resourceType !== 'subFrame' || !registry.get(target)) return 'deny';
    // A page may reload its own document, never open another one.
    return fromPage && pageIdOf(req.frameUrl!) !== target ? 'deny' : 'allow';
  }
  if (fromPage || req.resourceType === 'subFrame') return 'deny';
  return 'allow';
}

/** Answers `foo-page://{pageId}/` with the page's HTML and PAGE_HEADERS; anything else is a 404. */
export function handlePageScheme(registry: PageRegistry = pages): void {
  protocol.handle(PAGE_SCHEME, (request) => {
    const id = pageIdOf(request.url);
    const page = id ? registry.get(id) : undefined;
    if (!page) return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
    return new Response(page.html, { status: 200, headers: PAGE_HEADERS });
  });
}

/** A frame's URL; a frame Electron already disposed throws on read, and counts as no frame. */
function frameUrlOf(frame: { url: string } | null | undefined): string | undefined {
  try {
    return frame?.url;
  } catch {
    return undefined;
  }
}

/** One denied request, logged without its URL (it may carry page text). */
function logDenied(how: string, url: string): void {
  let scheme = 'unknown';
  try {
    scheme = new URL(url).protocol.replace(':', '');
  } catch {
    // keep 'unknown'
  }
  logEvent({ lvl: 'warn', mod: 'page', evt: 'PAGE_REQUEST_DENIED', kind: `${how} ${scheme}` });
}

/** Chromium's console line when a page's CSP (or the app's `frame-src`) blocks a load. */
const CSP_REFUSED = /violates the following Content Security Policy directive|^Refused to (connect|load|frame|navigate|send form)/;

/**
 * Installs the 04 §13.6 deny rule on the main window: `webRequest.onBeforeRequest` on its session, plus the frame
 * navigation check. A page's own CSP and the app's `frame-src` stop most loads before any request exists; main sees
 * those as the frame's CSP console line and logs them too, so every denied request leaves a line.
 */
export function denyPageRequests(contents: WebContents, registry: PageRegistry = pages): void {
  contents.session.webRequest.onBeforeRequest((details, callback) => {
    const verdict = pageRequestVerdict(
      { url: details.url, resourceType: details.resourceType, frameUrl: frameUrlOf(details.frame) },
      registry,
    );
    if (verdict === 'deny') logDenied(`request ${details.resourceType}`, details.url);
    callback({ cancel: verdict === 'deny' });
  });
  contents.on('will-frame-navigate', (details) => {
    if (details.isMainFrame) return;
    const verdict = pageRequestVerdict({ url: details.url, resourceType: 'subFrame', frameUrl: frameUrlOf(details.frame) }, registry);
    if (verdict === 'allow') return;
    details.preventDefault();
    logDenied('navigation', details.url);
  });
  contents.on('console-message', (details) => {
    if (!CSP_REFUSED.test(details.message)) return;
    const frameUrl = frameUrlOf(details.frame) ?? '';
    const fromPage = frameUrl.startsWith(`${PAGE_SCHEME}:`) || details.sourceId.startsWith(`${PAGE_SCHEME}:`);
    if (fromPage || /frame-src/.test(details.message)) logDenied('csp', frameUrl || details.sourceId);
  });
}

export { pageUrl };
