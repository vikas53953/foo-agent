// Spec: 10-acceptance-2 §E PERF-02 (typing latency < 16 ms: keydown in composer → character painted, with the 5,000-message
// chat open and a job running), 08-3 §20, CR-0005 (one key at a time after the last one painted plus a random 0–16.7 ms;
// keydown → first task after the frame that shows the character, less the wait for the screen's next refresh, at most one
// frame). Same method as the M2 e2e test `test/e2e/m2-composer.spec.ts`, which keeps running as it is. A run's number is
// the p95 of its keys. "A job running" needs a job in production: M4 (logged in the trace until then).
import { TID } from '../../../src/shared/testids';
import { p95 } from '../compare';
import { FRAME_MS, openChat } from './page';
import type { SessionProbe } from './types';

const KEYS = 40;

export const probe: SessionProbe = {
  kind: 'session',
  id: 'PERF-02',
  measures: 'keydown in the composer of the 5,000-message chat → character painted (p95 of the run’s keys)',
  budget: { kind: 'lt', max: 16, unit: 'ms' },
  smoke: true,
  textScale: true,
  order: 5,
  measure: async ({ page }) => {
    await openChat(page, 'foo');
    const field = page.getByTestId(TID.composerField);
    await field.focus();
    await page.evaluate((frame) => {
      type Key = { t0: number; mut: number | null; typed: boolean };
      const w = window as unknown as { __perfPaint: number[]; __perfKey: Key | null };
      w.__perfPaint = [];
      w.__perfKey = null;
      new MutationObserver(() => {
        if (w.__perfKey && w.__perfKey.mut === null) w.__perfKey.mut = performance.now();
      }).observe(document.body, { subtree: true, childList: true, characterData: true });
      window.addEventListener(
        'keydown',
        (e) => {
          const key: Key = { t0: e.timeStamp, mut: null, typed: document.activeElement?.getAttribute('contenteditable') === 'true' };
          w.__perfKey = key;
          const onFrame = (ft: number) => {
            if (key.typed && key.mut === null) return requestAnimationFrame(onFrame);
            setTimeout(() => {
              const ready = key.mut ?? key.t0;
              const wait = Math.min(Math.max(ft - ready, 0), frame);
              w.__perfPaint.push(performance.now() - key.t0 - wait);
            }, 0);
          };
          requestAnimationFrame(onFrame);
        },
        true,
      );
    }, FRAME_MS);
    for (let i = 0; i < KEYS; i++) {
      await page.keyboard.press(i % 10 === 9 ? 'Space' : 'KeyA');
      await page.waitForFunction((n) => (window as unknown as { __perfPaint: number[] }).__perfPaint.length >= n, i + 1);
      await page.waitForTimeout(Math.random() * FRAME_MS);
    }
    const keys = await page.evaluate(() => (window as unknown as { __perfPaint: number[] }).__perfPaint.slice());
    // Leave no draft behind for the next probe.
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Backspace');
    return { value: p95(keys), trace: { keys, jobRunning: false, jobRunningNeeds: 'M4' } };
  },
};
