// Spec: 10-acceptance-2 §E PERF-07 (send → 👀 painted ≤ 1 s, C1), PERF-08 (job start → checklist painted, no earlier than
// 1.5 s and by 2 s, J5), PERF-11 (network cut → WAITING + offline banner strip ≤ 10 s, J19); 08-3 §20 (the e2e lane), 08-2
// §5.4.2 (checklist after 1.5 s when step_count ≥ 2), 03-shell-1 §3.3 (banner). One run each on the fake clock and the fake
// AI (08-3 §22.3): a smoke of the budget like PERF-01/03, not the E.1 reference-laptop p95 (that is the release check).
import { expect, test, type Page } from '@playwright/test';
import type {} from '../../src/shared/ipc';
import { TID } from '../../src/shared/testids';
import { byTid, openChat, openWorld, windowSize } from '../fidelity/capture';
import { settleSeededJobs } from './m4-start';
import { envelope, launchWithFakeAi, VERIFY_OK, type FakeLine } from './fakeAi';

const ASK = 'Find my bills due this week';
/** A plain question: 👀 stays until foo's first word, so it lasts past the 700 ms badge debounce (04 §4.2) and paints. */
const QUESTION = 'when is the next holiday?';
const act = (decision: Record<string, unknown>) => `<say></say><act>${JSON.stringify({ decision, usedMemoryIds: [] })}</act>`;
const SCRIPT: FakeLine[] = [
  VERIFY_OK,
  { match: { purpose: 'intake', promptIncludes: QUESTION }, reply: envelope('Diwali is on Sun 8 Nov.'), delayMs: 5_000 },
  {
    match: { purpose: 'intake', promptIncludes: ASK },
    reply: act({
      kind: 'job',
      title: 'Bills',
      plan: [
        { phraseKey: 'read_email', slots: {}, route: 'api' },
        { phraseKey: 'look_for', slots: { what: 'bills due this week' }, route: 'api' },
      ],
      estimate: { minutes: 1 },
      routeHint: ['api'],
      needsApps: [],
    }),
  },
  // Held so the job is still running when the checklist is due and when the network drops.
  { match: { purpose: 'step' }, reply: act({ kind: 'step_done', idx: 0 }), delayMs: 30_000 },
  { match: { purpose: 'step' }, reply: act({ kind: 'done', result: 'Two bills are due this week.', unverified: true }) },
];

/** The fake clock in small steps, so each held AI turn starts its own delay after the one before it ends. */
async function advance(page: Page, ms: number, by = 500): Promise<void> {
  for (let at = 0; at < ms; at += by) {
    await page.evaluate((n) => window.__fooTest!.clock.advance(n), by);
    await page.waitForTimeout(20);
  }
}

async function start(text = ASK) {
  const { app } = await launchWithFakeAi(SCRIPT);
  const page = await app.firstWindow();
  // The seeded Goa stay job is live in foo's chat; end it so the ask starts a job instead of steering it (08-2 §5.2).
  await settleSeededJobs(page, await openWorld(app, page));
  await windowSize(app, page, 1440, 900);
  await openChat(page, 'foo');
  const log = page.getByTestId(TID.threadLog);
  const badge = log.locator(byTid(TID.bubbleMe), { hasText: text }).last().locator('xpath=..').getByTestId(TID.bubbleBadge);
  await page.getByTestId(TID.composerField).focus();
  await page.keyboard.type(text);
  return { app, page, log, badge };
}

test('PERF-07: send → 👀 painted within 1 s', async () => {
  const { app, page, badge } = await start(QUESTION);
  // Timed inside the window: Enter's keydown → the first frame after the new bubble's badge shows 👀. No Playwright polling
  // in the measured span. (A job's 👀 is replaced by 🛠 within 700 ms, so the debounce skips it: a question is the case.)
  await page.evaluate((sel) => {
    const w = window as unknown as { __perf07: { sentAt?: number; paintedAt?: number } };
    w.__perf07 = {};
    addEventListener('keydown', (e) => e.key === 'Enter' && (w.__perf07.sentAt ??= performance.now()), { capture: true, once: true });
    const before = new Set(document.querySelectorAll(sel));
    const seen = () => [...document.querySelectorAll(sel)].some((b) => !before.has(b) && b.getAttribute('data-state') === 'seen');
    new MutationObserver((_, obs) => {
      if (w.__perf07.sentAt === undefined || !seen()) return;
      obs.disconnect();
      requestAnimationFrame(() => (w.__perf07.paintedAt = performance.now()));
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-state'] });
  }, byTid(TID.bubbleBadge));
  await page.keyboard.press('Enter');
  await expect(badge).toHaveAttribute('data-state', 'seen');
  const { sentAt, paintedAt } = await page
    .waitForFunction(() => {
      const p = (window as unknown as { __perf07: { sentAt?: number; paintedAt?: number } }).__perf07;
      return p.paintedAt !== undefined && p;
    })
    .then((h) => h.jsonValue() as Promise<{ sentAt: number; paintedAt: number }>);
  const ms = Math.round(paintedAt - sentAt);
  console.log(`PERF-07 smoke: ${ms} ms`);
  expect(ms).toBeLessThanOrEqual(1_000);
  await app.close();
});

test('PERF-08: job start → checklist painted no earlier than 1.5 s and by 2 s', async () => {
  const { app, page, log, badge } = await start();
  await page.keyboard.press('Enter');
  await expect(badge).toHaveAttribute('data-state', 'working');
  // foo's chat already holds the seeded Goa job's checklist (and the log is virtualised), so find this job's by its step.
  const checklist = log.getByTestId(TID.cardChecklist).filter({ hasText: 'bills due this week' });
  await advance(page, 1_400, 100);
  await expect(checklist).toHaveCount(0);
  await advance(page, 600, 100);
  await expect(checklist).toHaveCount(1);
  await app.close();
});

test('PERF-11: network cut → WAITING + offline banner strip within 10 s', async () => {
  const { app, page, badge } = await start();
  await page.keyboard.press('Enter');
  await expect(badge).toHaveAttribute('data-state', 'working');
  await advance(page, 2_000);
  await page.evaluate(() => window.__fooTest!.setOnline(false));
  await advance(page, 10_000);
  await expect(page.getByTestId(TID.bannerStrip)).toHaveAttribute('data-state', 'offline');
  await expect(page.getByTestId(TID.appPanelDoingRow).and(page.locator('[data-state="waiting"]'))).toHaveCount(1);
  await app.close();
});
