// Shared start for the M4 shell e2e specs (m4-panel, m4-list, m4-notices): the ux-world seed at Fri 16 Oct 2026 9:41 AM IST,
// 1440 × 900 so the right shell is open (03-shell-2 §3.7.1), and the job-state hook that writes the job row and emits
// job:upsert / chat:upsert as the runner's db.tx does (08-3 §22.8 test:jobState).
import { expect, type ElectronApplication, type Page } from '@playwright/test';
import type {} from '../../src/shared/ipc';
import type { JobState } from '../../src/shared/types';
import { TID } from '../../src/shared/testids';
import { openChat, openWorld, windowSize } from '../fidelity/capture';
import { launch } from './launch';

export async function startWorld(): Promise<{ app: ElectronApplication; page: Page; refs: Record<string, string> }> {
  const app = await launch();
  const page = await app.firstWindow();
  const refs = await openWorld(app, page);
  await windowSize(app, page, 1440, 900);
  return { app, page, refs };
}

export const jobState = (page: Page, jobId: string, state: JobState) =>
  page.evaluate(([id, s]) => window.__fooTest!.jobState(id, s), [jobId, state] as const);

export const advance = (page: Page, ms: number) => page.evaluate((n) => window.__fooTest!.clock.advance(n), ms);

/** Main's clock moved: a reload re-reads the bootstrap and the renderer takes main's clock again (08-3 §22.2). */
export async function reloadAt(page: Page): Promise<void> {
  await page.reload();
  await page.getByTestId(TID.chatlistRow).first().waitFor();
}

export const listRow = (page: Page, name: string) =>
  page.getByTestId(TID.chatlistRow).filter({ has: page.getByTestId(TID.chatlistRowName).getByText(name, { exact: true }) });

export async function openPanelChat(page: Page, name: string): Promise<void> {
  await openChat(page, name);
  await expect(page.getByTestId(TID.appPanel)).toHaveAttribute('data-state', 'open');
}
