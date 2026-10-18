// Spec: 08-2 §5.4.1 (a job starts only with an AI verified in the last 10 min; a failed verify → WAITING, T2 carry), §6.7,
// 10-1 AT-112 / AT-113 (WAITING, one error card; the condition clears → WORKING, the card edited in place, no new message),
// AT-081 (offline mid-job → WAITING + the banner, no card; back → resumes), 03-shell-2 §3.7.3 (Doing now "Paused · …").
// foo-verify journey for M4 T4, light and dark. The error card's drawing and its button are T5's: until T5 lands the card
// shows as the M1 placeholder (data-card-type="error"), and the AI re-test goes through `ai:verify`, the channel the
// Settings page's "Test again" uses. Run:
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/m4-t4-waiting.journey.ts
import type { Page } from '@playwright/test';
import type { Verify } from '../../scripts/foo-verify';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import type { FakeLine } from '../e2e/fakeAi';
import { byTid, openChat, openWorld, rest, setTheme, settle, windowSize } from '../fidelity/capture';

const ASK = 'Find my bills due this week';
const ASK2 = 'Check my calendar for tomorrow';
const RESULT = 'Two bills are due this week.';
const RESULT2 = 'Tomorrow is free after 2 PM.';
const act = (decision: Record<string, unknown>) => `<say></say><act>${JSON.stringify({ decision, usedMemoryIds: [] })}</act>`;
const job = (ask: string, what: string): FakeLine => ({
  match: { purpose: 'intake', promptIncludes: ask },
  reply: act({
    kind: 'job',
    title: what,
    plan: [
      { phraseKey: 'read_email', slots: {}, route: 'api' },
      { phraseKey: 'look_for', slots: { what }, route: 'api' },
    ],
    estimate: { minutes: 1 },
    routeHint: ['api'],
    needsApps: [],
  }),
});
const SCRIPT: FakeLine[] = [
  // The first verify fails (the AI is down when the job wants to start); every later one passes.
  { match: { purpose: 'verify' }, error: 'AI_SERVICE_DOWN' },
  { match: { purpose: 'verify' }, reply: 'ready', once: false },
  job(ASK, 'bills due this week'),
  job(ASK2, 'free time tomorrow'),
  { match: { purpose: 'step', promptIncludes: 'bills due' }, reply: act({ kind: 'step_done', idx: 0 }), delayMs: 1_000 },
  { match: { purpose: 'step', promptIncludes: 'bills due' }, reply: act({ kind: 'step_done', idx: 1 }), delayMs: 1_000 },
  {
    match: { purpose: 'step', promptIncludes: 'bills due' },
    reply: act({ kind: 'done', result: RESULT, unverified: true }),
    delayMs: 1_000,
  },
  { match: { purpose: 'step', promptIncludes: 'free time' }, reply: act({ kind: 'step_done', idx: 0 }), delayMs: 2_000 },
  { match: { purpose: 'step', promptIncludes: 'free time' }, reply: act({ kind: 'step_done', idx: 1 }), delayMs: 30_000 },
  {
    match: { purpose: 'step', promptIncludes: 'free time' },
    reply: act({ kind: 'done', result: RESULT2, unverified: true }),
    delayMs: 1_000,
  },
];

async function advance(page: Page, ms: number): Promise<void> {
  for (let at = 0; at < ms; at += 500) {
    await page.evaluate(() => window.__fooTest!.clock.advance(500));
    await page.waitForTimeout(20);
  }
}

async function ask(page: Page, text: string): Promise<void> {
  await page.getByTestId(TID.composerField).focus();
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
  await page
    .locator(`${byTid(TID.threadLog)} ${byTid(TID.bubbleMe)}`, { hasText: text })
    .first()
    .waitFor();
}

export default async function journey(v: Verify): Promise<void> {
  const { app, page } = await v.launch({ fakeAi: SCRIPT });
  await openWorld(app, page);
  await windowSize(app, page, 1440, 900);
  await openChat(page, 'foo');
  await setTheme(page, 'light');
  await rest(page);
  await settle(page);
  const log = page.getByTestId(TID.threadLog);
  const doing = page.getByTestId(TID.appPanelDoingRow);
  const errorCards = log.locator(`[data-card-type="error"], ${byTid(TID.cardError)}`);
  // A Doing-now row is titled by the job's current step, so the job is found by its WAITING state (the seed has none).
  const waitingRow = doing.and(page.locator('[data-state="waiting"]'));
  const cardsBefore = await errorCards.count();

  // 1 · The AI's last test is over 10 min old, and the new test fails.
  await advance(page, 11 * 60_000);
  await ask(page, ASK);
  await advance(page, 2_000);
  await settle(page);
  const row = waitingRow;
  const n = await row.count();
  await v.shot('verify-failed');
  if (n !== 1) throw new Error(`a job whose AI test failed should be WAITING: ${n} waiting Doing-now rows, expected 1`);
  const line = t('app.panel.doing.line.waiting', { reason: t('app.panel.doing.reason.ai_down', { ai: 'Claude' }) });
  if (!((await row.textContent()) ?? '').includes(line)) throw new Error(`Doing-now line should read "${line}"`);
  v.note(`the AI test failed before the job started → the job is WAITING, Doing now reads "${line}" (was: stuck QUEUED)`);
  const cards = await errorCards.count();
  if (cards !== cardsBefore + 1) throw new Error(`error cards ${cardsBefore} → ${cards}, expected one more`);
  v.note('exactly one new error card in the thread for the job (AT-112)');
  const messages = await log.locator(`${byTid(TID.bubbleFoo)}, ${byTid(TID.bubbleMe)}, [data-card-type]`).count();

  // 2 · The AI answers its test again → the job carries on; the card is edited in place, no new message but the result.
  await page.evaluate(() => window.foo.invoke('ai:verify', { providerId: 'claude-cli' }));
  await advance(page, 5_000);
  await log.locator(byTid(TID.bubbleFoo), { hasText: RESULT }).first().waitFor({ timeout: 10_000 });
  await settle(page);
  const after = await log.locator(`${byTid(TID.bubbleFoo)}, ${byTid(TID.bubbleMe)}, [data-card-type]`).count();
  if (after !== messages + 2) throw new Error(`thread items ${messages} → ${after}: expected only the checklist and the result`);
  if ((await errorCards.count()) !== cards) throw new Error('a second error card appeared on resume');
  v.note(`AI back → the job resumed and finished: "${RESULT}"; no new error card, only the checklist and the result were added`);
  await v.shot('resumed-done');

  // 3 · Offline mid-job (AT-081): the banner, the Doing-now line, no card; back online → resumes.
  await ask(page, ASK2);
  await advance(page, 3_000);
  await page.evaluate(() => window.__fooTest!.setOnline(false));
  await advance(page, 10_000);
  await settle(page);
  const banner = await page.getByTestId(TID.bannerStrip).getAttribute('data-state');
  if (banner !== 'offline') throw new Error(`banner ${banner}, expected offline`);
  const offRow = waitingRow;
  if ((await offRow.count()) !== 1) throw new Error('the offline job should be WAITING');
  const offLine = t('app.panel.doing.line.waiting', { reason: t('app.panel.doing.reason.offline') });
  if (!((await offRow.textContent()) ?? '').includes(offLine)) throw new Error(`Doing-now line should read "${offLine}"`);
  if ((await errorCards.count()) !== cards) throw new Error('offline must not post an error card');
  if ((await page.getByTestId(TID.composerError).count()) !== 0) throw new Error('offline must not show a bar above the composer');
  v.note(`offline 10 s mid-job → banner "offline", Doing now "${offLine}", no error card, no composer bar (AT-081)`);
  await v.shot('offline-waiting');
  await setTheme(page, 'dark');
  await settle(page);
  await v.shot('offline-waiting');
  await setTheme(page, 'light');

  await page.evaluate(() => window.__fooTest!.setOnline(true));
  await advance(page, 35_000);
  await log.locator(byTid(TID.bubbleFoo), { hasText: RESULT2 }).first().waitFor({ timeout: 10_000 });
  v.note(`back online → the banner is gone and the job finished from the same step: "${RESULT2}"`);
  await rest(page);
  await settle(page);
  await v.shot('back-online-done');
  await setTheme(page, 'dark');
  await settle(page);
  await v.shot('back-online-done');
}
