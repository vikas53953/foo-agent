'use strict';

// Small, side-effect-free primitives shared by the real-PC driver and its
// routing regression tests.  URL matching deliberately uses only pathname so
// query strings (which can contain job or user data) never enter driver logs.
const LIVE_WINDOW_PATH = '/windows/live.html';

function isLiveWindow(pageOrUrl) {
  const value = typeof pageOrUrl === 'string' ? pageOrUrl : pageOrUrl?.url?.();
  if (!value) return false;
  try {
    return new URL(value).pathname === LIVE_WINDOW_PATH;
  } catch {
    return false;
  }
}

// The event subscription must be created before the click.  Electron can
// create and paint a BrowserWindow synchronously, so subscribing afterwards
// loses the only reliable routing signal.
async function waitForWindowAfterClick({ app, click, ready, observe, predicate = isLiveWindow }) {
  const opened = app.waitForEvent('window', predicate);
  // A failed click can leave the BrowserWindow wait pending until its timeout.
  // Attach a handler immediately so that later rejection cannot become an
  // unhandled rejection; the original promise is still awaited on success.
  void opened.catch(() => {});
  await click();
  const page = await opened;
  if (observe) await observe(page);
  if (ready) await ready(page);
  return page;
}

function waitForPageClose(page, timeoutMs = 30_000) {
  return page.waitForEvent('close', { timeout: timeoutMs });
}

module.exports = { LIVE_WINDOW_PATH, isLiveWindow, waitForWindowAfterClick, waitForPageClose };
