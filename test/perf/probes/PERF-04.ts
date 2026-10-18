// Spec: 10-acceptance-2 §E PERF-04 (scroll 60 fps with 5,000 messages: fling from bottom to top and back, mixed bubbles,
// cards and images; ≤ 1 % frames over 16.7 ms; DOM message nodes bounded), 08-3 §20, CR-0006. Same fling as the M2 e2e
// test `test/e2e/m2-messages.spec.ts`, which keeps running as it is. A run's number is its share of long frames in %.
import { TID } from '../../../src/shared/testids';
import { byTid, FRAME_MS, openChat, startFrames, stopFrames } from './page';
import type { SessionProbe } from './types';
import type { Page } from '@playwright/test';

/** Wheel flings until the log reaches its end, measuring every frame meanwhile. */
async function fling(page: Page, dir: -1 | 1): Promise<number[]> {
  const log = page.getByTestId(TID.threadLog);
  const box = (await log.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await startFrames(page);
  for (let i = 0; i < 400; i++) {
    await page.mouse.wheel(0, dir * 1200);
    const edge = await log.evaluate((el, d) => (d < 0 ? el.scrollTop <= 0 : el.scrollHeight - el.scrollTop - el.clientHeight < 2), dir);
    const loading = await page.getByTestId(TID.threadLoadOlder).count();
    if (edge && !loading) break;
  }
  return stopFrames(page);
}

export const probe: SessionProbe = {
  kind: 'session',
  id: 'PERF-04',
  measures: 'fling the 5,000-message chat to the top and back → share of frames over 16.7 ms',
  budget: { kind: 'le', max: 1, unit: '%' },
  smoke: true,
  textScale: true,
  order: 6,
  measure: async ({ page }) => {
    await openChat(page, 'foo');
    const up = await fling(page, -1);
    const down = await fling(page, 1);
    const frames = [...up, ...down];
    const long = frames.filter((f) => f > FRAME_MS).length;
    const rowsInDom = await page.locator(`${byTid(TID.threadLog)} [data-index]`).count();
    return { value: (100 * long) / Math.max(1, frames.length), trace: { frames: frames.length, long, rowsInDom } };
  },
};
