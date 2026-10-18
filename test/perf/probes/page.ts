// Spec: 10-acceptance-2 §E (the PERF steps run in the real window: chat list, chat header, thread log, composer), 08-0 §C
// (test ids), 02-2 §F13.3 (one frame at 60 fps = 16.7 ms).
import type { Page } from '@playwright/test';
import { TID } from '../../../src/shared/testids';

export const FRAME_MS = 16.7;
export const byTid = (id: string) => `[data-testid="${id}"]`;

/** Opens the chat named `name` from the chat list and waits for its messages. */
export async function openChat(page: Page, name: string): Promise<void> {
  const row = page.getByTestId(TID.chatlistRow).filter({ has: page.getByTestId(TID.chatlistRowName).getByText(name, { exact: true }) });
  await row.first().click();
  await page.getByTestId(TID.chatHeaderName).filter({ hasText: name }).waitFor();
  await page
    .locator(`${byTid(TID.threadLog)} [data-index]`)
    .first()
    .waitFor();
}

/** Starts recording every frame's duration (rAF to rAF). */
export async function startFrames(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __perfFrames: number[]; __perfStop: boolean };
    w.__perfFrames = [];
    w.__perfStop = false;
    let last = performance.now();
    const tick = (now: number) => {
      w.__perfFrames.push(now - last);
      last = now;
      if (!w.__perfStop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/** Stops recording and returns the frame durations. */
export async function stopFrames(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const w = window as unknown as { __perfFrames: number[]; __perfStop: boolean };
    w.__perfStop = true;
    return w.__perfFrames.slice(1);
  });
}
