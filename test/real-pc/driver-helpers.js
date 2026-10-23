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

// A waitReply end-state check is allowed to recover a genuinely late answer,
// but a global expectTid/expectJs selector is not evidence by itself: it may
// match the answer from the preceding turn. Require the current DOM snapshot
// to contain a reply after the wait's recorded baseline, and preserve explicit
// reply/kit failures.
function canLatePromoteWaitReply(result, observed, hasLaterCausalAction = false) {
  if (result?.do !== 'waitReply') return true;
  if (hasLaterCausalAction) return false;
  if (result.didntGetThat || result.kitMissing || result.kitDropped || result.stillWorking || result.blocked) return false;
  const before = Number(result.before);
  const newBubbles = Number(result.newBubbles);
  const observedCount = typeof observed === 'number' ? observed : observed?.n;
  if (!Number.isFinite(before) || !Number.isFinite(newBubbles) || newBubbles <= 0 || !Number.isFinite(observedCount)) return false;
  if (observedCount !== before + newBubbles) return false;
  const expectedTexts = Array.isArray(result.replyTexts) ? result.replyTexts : null;
  const observedTexts = typeof observed === 'object' && Array.isArray(observed.texts) ? observed.texts.slice(before) : null;
  return !!expectedTexts && !!observedTexts && JSON.stringify(expectedTexts) === JSON.stringify(observedTexts);
}

function previousReplyBaseline({
  explicitBefore,
  previousSend,
  previousAction,
  previousSendIndex = -1,
  previousActionIndex = -1,
  currentCount,
}) {
  if (Number.isFinite(explicitBefore)) return explicitBefore;
  if (previousAction?.clicked && previousActionIndex > previousSendIndex && Number.isFinite(previousAction.before))
    return previousAction.before;
  if (previousSend && Number.isFinite(previousSend.before)) return previousSend.before;
  if (previousAction?.clicked && Number.isFinite(previousAction.before)) return previousAction.before;
  return currentCount;
}

module.exports = {
  LIVE_WINDOW_PATH,
  isLiveWindow,
  waitForWindowAfterClick,
  waitForPageClose,
  canLatePromoteWaitReply,
  previousReplyBaseline,
};
