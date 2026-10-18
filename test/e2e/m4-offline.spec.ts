// Spec: AT-081 (the internet drops mid-job → within 10 s the job shows WAITING and the banner strip says "You're offline…"
// with [ Try again ], no extra bar above the composer; back online → the job resumes from the same step without redoing
// finished steps), PERF-11 (network cut → WAITING + banner ≤ 10 s on the fake clock), 03-shell-1 §3.3 (banner), 05-3 §5.20
// (offline shows no error card, X-13), 03-shell-2 §3.7.3 (Doing now "Paused · you're offline"). The job is driven by the fake AI (08-3 §22.3).
import { expect, test, type Page } from '@playwright/test';
import type {} from '../../src/shared/ipc';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { byTid, openChat, openWorld, windowSize } from '../fidelity/capture';
import { settleSeededJobs } from './m4-start';
import { launchWithFakeAi, VERIFY_OK, type FakeLine } from './fakeAi';

const ASK = 'Find my bills due this week';
const RESULT = 'Two bills are due this week.';
const act = (decision: Record<string, unknown>) => `<say></say><act>${JSON.stringify({ decision, usedMemoryIds: [] })}</act>`;
const SCRIPT: FakeLine[] = [
  VERIFY_OK,
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
  { match: { purpose: 'step' }, reply: act({ kind: 'step_done', idx: 0 }), delayMs: 2_000 },
  // Held long enough for the network to drop while this turn is in flight.
  { match: { purpose: 'step' }, reply: act({ kind: 'step_done', idx: 1 }), delayMs: 30_000 },
  { match: { purpose: 'step' }, reply: act({ kind: 'done', result: RESULT, unverified: true }), delayMs: 1_000 },
];

/** The fake clock in small steps, so each held AI turn starts its own delay after the one before it ends. */
async function advance(page: Page, ms: number): Promise<void> {
  for (let at = 0; at < ms; at += 500) {
    await page.evaluate(() => window.__fooTest!.clock.advance(500));
    await page.waitForTimeout(20);
  }
}

test('AT-081: offline mid-job → WAITING + banner within 10 s, no card, no composer bar; back online → resumes, ✅', async () => {
  const { app } = await launchWithFakeAi(SCRIPT);
  const page = await app.firstWindow();
  // The seeded Goa stay job is live in foo's chat; end it so the ask starts a job instead of steering it (08-2 §5.2).
  await settleSeededJobs(page, await openWorld(app, page));
  await windowSize(app, page, 1440, 900); // the right panel is open from 1440 px (03-shell-2 §3.7.1)
  await openChat(page, 'foo');
  const log = page.getByTestId(TID.threadLog);
  // The badge sits beside my bubble in its holder (Bubble.tsx `.hold`).
  const badge = log.locator(byTid(TID.bubbleMe), { hasText: ASK }).last().locator('xpath=..').getByTestId(TID.bubbleBadge);
  // 03-shell-2 §3.7.3: the Doing-now row carries the job state and its "Paused · {reason}" line.
  const doing = page.getByTestId(TID.appPanelDoingRow);
  const errorCards = log.locator(`[data-card-type="error"], ${byTid(TID.cardError)}`);

  await page.getByTestId(TID.composerField).focus();
  await page.keyboard.type(ASK);
  await page.keyboard.press('Enter');
  await expect(badge).toHaveAttribute('data-state', 'working');
  await advance(page, 3_000); // step 1 done, step 2's turn in flight

  await page.evaluate(() => window.__fooTest!.setOnline(false));
  await advance(page, 10_000);
  await expect(page.getByTestId(TID.bannerStrip)).toHaveAttribute('data-state', 'offline');
  await expect(page.getByTestId(TID.bannerAction)).toHaveText(t('banner.offline.action'));
  const paused = doing.and(page.locator('[data-state="waiting"]'));
  await expect(paused).toHaveCount(1);
  await expect(paused).toContainText(t('app.panel.doing.line.waiting', { reason: t('app.panel.doing.reason.offline') }));
  await expect(errorCards).toHaveCount(0);
  await expect(page.getByTestId(TID.composerError)).toHaveCount(0);
  await expect(badge).toHaveAttribute('data-state', 'working');

  await page.evaluate(() => window.__fooTest!.setOnline(true));
  await expect(page.getByTestId(TID.bannerStrip)).toHaveCount(0);
  await advance(page, 35_000);
  await expect(log.locator(byTid(TID.bubbleFoo), { hasText: RESULT })).toHaveCount(1);
  await expect(badge).toHaveAttribute('data-state', 'done_unverified');
  await expect(errorCards).toHaveCount(0);
  await expect(doing.and(page.locator('[data-state="waiting"]'))).toHaveCount(0);
  await app.close();
});
