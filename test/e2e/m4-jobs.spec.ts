// Spec: 10-acceptance-2 §E PERF-07 (send → foo's "seen" painted ≤ 1 s, C1; CR-0059 row 4 / X-216: the ✓✓ read tick, set in the
// same write as 👀, which itself waits 2 s), PERF-08 (job start → checklist painted, no earlier than
// 1.5 s and by 2 s, J5), PERF-11 (network cut → WAITING + offline banner strip ≤ 10 s, J19); §E.1 (each test runs 20 times;
// the 95th percentile must meet the budget); 08-3 §20 (the e2e lane), 08-2 §5.4.2 (checklist after 1.5 s when step_count ≥ 2),
// 03-shell-1 §3.3 (banner). M5 T10 (CR-0008 (j) row 11): 20 runs each in one window, p95 against the budget; PERF-07 on the job
// path (the ask's intake is held, so 👀 lasts past the 700 ms badge debounce of 04 §4.2 and paints). PERF-07 is wall-clock
// time inside the window; PERF-08 is fake-clock time (08-3 §22.3), the clock the runner's timers use. PERF-11 is the
// 10 s offline confirm (OFFLINE_CONFIRM_MS, a fake-clock design delay that meets the budget by construction) plus the
// wall-clock paint lag after it fires, held to the 1 s paint budget of C1. The E.1
// reference-laptop run of the release build stays the release check.
import { expect, test, type Page } from '@playwright/test';
import type {} from '../../src/shared/ipc';
import { TID } from '../../src/shared/testids';
import { OFFLINE_CONFIRM_MS } from '../../src/main/net/netMonitor';
import { byTid, openChat, openWorld, windowSize } from '../fidelity/capture';
import { settleSeededJobs } from './m4-start';
import { launchWithFakeAi, VERIFY_OK, type FakeLine } from './fakeAi';
import { typeInComposer } from './typeInComposer';

const RUNS = 20;
/** Run tags with no tag inside another, so each run's intake line matches only its own ask (earlier lines are used up). */
const TAGS = Array.from({ length: RUNS }, (_, i) => `run${String.fromCharCode(97 + i)}q`);
const ask = (tag: string) => `Find my bills due this week ${tag}`;
const act = (decision: Record<string, unknown>) => `<say></say><act>${JSON.stringify({ decision, usedMemoryIds: [] })}</act>`;

/** One job per run; its first step turn is held so the job is still running when the checklist is due and the network drops. */
function script(o: { intakeDelayMs?: number } = {}): FakeLine[] {
  return [
    VERIFY_OK,
    ...TAGS.map((tag): FakeLine => ({
      match: { purpose: 'intake', promptIncludes: tag },
      reply: act({
        kind: 'job',
        title: 'Bills',
        plan: [
          { phraseKey: 'read_email', slots: {}, route: 'api' },
          { phraseKey: 'look_for', slots: { what: `bills ${tag}` }, route: 'api' },
        ],
        estimate: { minutes: 1 },
        routeHint: ['api'],
        needsApps: [],
      }),
      ...(o.intakeDelayMs ? { delayMs: o.intakeDelayMs } : {}),
    })),
    { match: { purpose: 'step' }, reply: act({ kind: 'step_done', idx: 0 }), delayMs: 600_000, once: false },
  ];
}

/** §E.1: the 95th percentile of the runs (nearest rank). */
function p95(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(0.95 * sorted.length) - 1]!;
}

const tick = (page: Page, ms: number) => page.evaluate((n) => window.__fooTest!.clock.advance(n), ms);

/**
 * Starting and stopping a run's job is set-up between timed spans, not a timed step: a busy Windows runner can take longer
 * than the default 5 s for either.
 */
const SETUP_MS = 15_000;

async function start(o: { intakeDelayMs?: number } = {}) {
  const { app } = await launchWithFakeAi(script(o));
  const page = await app.firstWindow();
  // The seeded Goa stay job is live in foo's chat; end it so the ask starts a job instead of steering it (08-2 §5.2).
  await settleSeededJobs(page, await openWorld(app, page));
  await windowSize(app, page, 1440, 900);
  await openChat(page, 'foo');
  const log = page.getByTestId(TID.threadLog);
  const badgeOf = (text: string) =>
    log.locator(byTid(TID.bubbleMe), { hasText: text }).last().locator('xpath=..').getByTestId(TID.bubbleBadge);
  // The log keeps only rows near the viewport in the DOM, so pin it to the newest row before each look.
  // The virtualiser re-measures rows after a jump, so the jump repeats for a few frames until the bottom holds.
  const toNewest = () =>
    log.evaluate(async (el) => {
      for (let i = 0; i < 6; i++) {
        el.scrollTop = el.scrollHeight;
        await new Promise((r) => requestAnimationFrame(r));
      }
    });
  /** The run's ask badge, looked at with the log pinned to the newest row each time (the row may be out of the DOM). */
  const expectBadge = (tag: string, state: string, timeout?: number) =>
    expect
      .poll(
        async () => {
          await toNewest();
          return badgeOf(ask(tag))
            .getAttribute('data-state', { timeout: 500 })
            .catch(() => null);
        },
        timeout ? { timeout } : {},
      )
      .toBe(state);
  const type = async (text: string) => {
    await typeInComposer(page, text);
  };
  const send = async (text: string) => {
    await type(text);
    await page.keyboard.press('Enter');
  };
  /** Ends the run's job with the stop word, so the next ask starts its own job (08-2 §5.2: a live job would be steered). */
  const stopJob = async (tag: string) => {
    await send('stop');
    try {
      await expectBadge(tag, 'stopped', SETUP_MS);
    } catch (e) {
      // What foo's chat shows when the stop word did not stop the run's job (the newest rows), for the failure report.
      await toNewest();
      console.log(`stopJob ${tag}: chat ends with:\n${(await log.innerText()).slice(-1500)}`);
      throw e;
    }
  };
  return { app, page, log, badgeOf, expectBadge, toNewest, type, send, stopJob };
}

test('PERF-07: send → seen (✓✓ read) painted, p95 ≤ 1 s over 20 runs (job path)', async () => {
  test.setTimeout(300_000);
  const { app, page, expectBadge, type, stopJob } = await start({ intakeDelayMs: 2_000 });
  const ms: number[] = [];
  const split: string[] = [];
  for (const tag of TAGS) {
    await type(ask(tag));
    // Timed inside the window: Enter's keydown → the first frame after the new bubble's tick reads ✓✓ read (the lane's 👀
    // write; CR-0059 row 4 holds the 👀 picture itself back 2 s). No Playwright polling in the measured span.
    await page.evaluate((sel) => {
      const w = window as unknown as { __perf07: { sentAt?: number; bubbleAt?: number; paintedAt?: number } };
      w.__perf07 = {};
      addEventListener('keydown', (e) => e.key === 'Enter' && (w.__perf07.sentAt ??= performance.now()), { capture: true, once: true });
      const before = new Set(Array.from(document.querySelectorAll(sel)));
      const fresh = () => Array.from(document.querySelectorAll(sel)).filter((b) => !before.has(b));
      const seen = () => fresh().some((b) => b.getAttribute('data-state') === 'read');
      new MutationObserver((_, obs) => {
        if (w.__perf07.sentAt === undefined) return;
        // When the new bubble first shows (main has stored it), to split the span: window + main, then the engine's turn.
        if (w.__perf07.bubbleAt === undefined && fresh().length) w.__perf07.bubbleAt = performance.now();
        if (!seen()) return;
        obs.disconnect();
        requestAnimationFrame(() => (w.__perf07.paintedAt = performance.now()));
      }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-state'] });
    }, byTid(TID.bubbleTick));
    await page.keyboard.press('Enter');
    const { sentAt, bubbleAt, paintedAt } = await page
      .waitForFunction(() => {
        const p = (window as unknown as { __perf07: { sentAt?: number; bubbleAt?: number; paintedAt?: number } }).__perf07;
        return p.paintedAt !== undefined && p;
      })
      .then((h) => h.jsonValue() as Promise<{ sentAt: number; bubbleAt?: number; paintedAt: number }>);
    ms.push(Math.round(paintedAt - sentAt));
    split.push(bubbleAt === undefined ? '?' : `${Math.round(bubbleAt - sentAt)}+${Math.round(paintedAt - bubbleAt)}`);
    // The held intake answers: the ask becomes a job (🛠), then the stop word ends it.
    await tick(page, 2_000);
    await expectBadge(tag, 'working', SETUP_MS);
    await stopJob(tag);
  }
  console.log(`PERF-07 runs (ms): ${ms.join(', ')} · p95 ${p95(ms)} ms`);
  console.log(`PERF-07 split (keydown → bubble + bubble → 👀, ms): ${split.join(', ')}`);
  expect(ms).toHaveLength(RUNS);
  expect(p95(ms)).toBeLessThanOrEqual(1_000);
  await app.close();
});

test('PERF-08: job start → checklist painted, 1.5 s ≤ p95 ≤ 2 s over 20 runs', async () => {
  test.setTimeout(300_000);
  const { app, page, log, expectBadge, toNewest, send, stopJob } = await start();
  // The fake-clock time each checklist card reaches the window (card:upsert), read the moment it arrives: no tick runs
  // until the arrival has been seen.
  await page.evaluate(() => {
    const w = window as unknown as { __perf08: string[] };
    w.__perf08 = [];
    const seen = new Set<string>();
    window.foo.on('card:upsert', (c) => {
      if (c.type !== 'checklist' || seen.has(c.id)) return;
      seen.add(c.id);
      w.__perf08.push(c.id);
    });
  });
  const arrived = () => page.evaluate(() => (window as unknown as { __perf08: unknown[] }).__perf08.length);
  const ms: number[] = [];
  for (const tag of TAGS) {
    const checklist = log.getByTestId(TID.cardChecklist).filter({ hasText: `bills ${tag}` });
    const before = await arrived();
    await send(ask(tag));
    await expectBadge(tag, 'working', SETUP_MS);
    // The job started at this fake-clock instant; step the clock until its checklist arrives.
    let at = 0;
    while (at < 3_000) {
      await tick(page, 100);
      at += 100;
      const got = await expect
        .poll(arrived, { timeout: 300, intervals: [20] })
        .toBeGreaterThan(before)
        .then(() => true)
        .catch(() => false);
      if (got) break;
    }
    ms.push(at);
    // Painted: the card shows in the log (the virtualised log is pinned to its newest row first).
    await expect(async () => {
      await toNewest();
      await expect(checklist).toHaveCount(1, { timeout: 200 });
    }).toPass({ timeout: 15_000 });
    await stopJob(tag);
  }
  console.log(`PERF-08 runs (fake-clock ms): ${ms.join(', ')} · p95 ${p95(ms)} ms`);
  expect(ms).toHaveLength(RUNS);
  expect(Math.min(...ms)).toBeGreaterThanOrEqual(1_500);
  expect(p95(ms)).toBeGreaterThanOrEqual(1_500);
  expect(p95(ms)).toBeLessThanOrEqual(2_000);
  await app.close();
});

test('PERF-11: network cut → WAITING + offline banner strip, 10 s design delay + paint lag p95 ≤ 1 s over 20 runs', async () => {
  test.setTimeout(400_000);
  const { app, page, expectBadge, send, stopJob } = await start();
  const offlineBanner = page.locator(`${byTid(TID.bannerStrip)}[data-state="offline"]`);
  const waitingRow = page.getByTestId(TID.appPanelDoingRow).and(page.locator('[data-state="waiting"]'));
  const lag: number[] = [];
  for (const tag of TAGS) {
    await send(ask(tag));
    await expectBadge(tag, 'working', SETUP_MS);
    await tick(page, 2_000);
    await expect(offlineBanner).toHaveCount(0);
    await page.evaluate(() => window.__fooTest!.setOnline(false));
    // The design delay: nothing shows until the cut has lasted OFFLINE_CONFIRM_MS on the fake clock.
    await tick(page, OFFLINE_CONFIRM_MS - 500);
    await expect(offlineBanner).toHaveCount(0);
    await expect(waitingRow).toHaveCount(0);
    // The paint lag: wall-clock time inside the window from the step that fires the confirm to the first frame showing
    // both the offline banner strip and the WAITING row. No Playwright polling in the measured span.
    const ms = await page.evaluate(
      async ({ banner, row }) => {
        const shown = () => !!document.querySelector(banner) && !!document.querySelector(row);
        const painted = new Promise<number>((resolve) => {
          new MutationObserver((_, obs) => {
            if (!shown()) return;
            obs.disconnect();
            requestAnimationFrame(() => resolve(performance.now()));
          }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-state'] });
        });
        const t0 = performance.now();
        await window.__fooTest!.clock.advance(500);
        return (await painted) - t0;
      },
      {
        banner: `${byTid(TID.bannerStrip)}[data-state="offline"]`,
        row: `${byTid(TID.appPanelDoingRow)}[data-state="waiting"]`,
      },
    );
    lag.push(Math.round(ms));
    await stopJob(tag);
    // Back online before the next run: the banner clears and the next job starts on a live network.
    await page.evaluate(() => window.__fooTest!.setOnline(true));
    await expect(async () => {
      await tick(page, 1_000);
      await expect(offlineBanner).toHaveCount(0, { timeout: 200 });
    }).toPass({ timeout: 20_000 });
  }
  console.log(`PERF-11 runs: ${OFFLINE_CONFIRM_MS / 1_000} s design delay + paint lag (ms) ${lag.join(', ')} · p95 ${p95(lag)} ms`);
  expect(lag).toHaveLength(RUNS);
  expect(p95(lag)).toBeLessThanOrEqual(1_000);
  await app.close();
});
