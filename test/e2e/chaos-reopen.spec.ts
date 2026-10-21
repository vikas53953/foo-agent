// Kill-and-reopen chaos: foo is killed the hard way (SIGKILL / TerminateProcess, as a crash, a power cut or Task Manager
// does) and opened again on the same data. 08-2 §5.2 (every user message gets one intake turn, also across a restart;
// the J19 restart fix), 04 §19.4 (a cut-off reply), 08-1 (SQLite in WAL mode survives a hard stop). Replies come from the
// fake AI (FOO_FAKE_AI); no test reaches a real AI or the network.
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import Database from 'better-sqlite3';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type {} from '../../src/shared/ipc';
import { TID } from '../../src/shared/testids';
import { openChat, openWorld } from '../fidelity/capture';
import { fakeTurns, intake, launchWithFakeAi, VERIFY_OK, type FakeLine } from './fakeAi';
import { testDirs } from './launch';
import { settleSeededJobs } from './m4-start';

const byTid = (id: string) => `[data-testid="${id}"]`;
const LATER = '2026-10-16T09:55:00+05:30';

/**
 * Kills foo without letting it shut down, and waits until it is gone. On Windows the whole tree goes (taskkill /T /F, as
 * Task Manager's "End process tree"): Chromium's helper processes outlive a killed main for a moment there, and a reopen
 * during that moment found the app's single-instance lock still taken.
 */
async function hardKill(app: ElectronApplication): Promise<void> {
  const proc = app.process();
  const gone = new Promise<void>((r) => (proc.exitCode !== null || proc.signalCode !== null ? r() : proc.once('exit', () => r())));
  if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
  else proc.kill('SIGKILL');
  await gone;
  if (process.platform === 'win32') {
    // One worker runs the e2e suite, so any electron.exe left is this app's.
    const left = () => execFileSync('tasklist', ['/FI', 'IMAGENAME eq electron.exe', '/NH'], { encoding: 'utf8' }).includes('electron.exe');
    await expect.poll(left, { timeout: 15_000 }).toBe(false);
  }
}

async function reopen(lines: FakeLine[], dirs: ReturnType<typeof testDirs>): Promise<{ app: ElectronApplication; page: Page }> {
  const { app } = await launchWithFakeAi(lines, { dirs });
  const page = await app.firstWindow();
  await page.getByTestId(TID.titlebarStrip).waitFor();
  await page.evaluate((iso) => window.__fooTest!.clock.set(iso), LATER);
  await page.getByTestId(TID.chatlistRow).first().waitFor();
  return { app, page };
}

const userBubbles = (page: Page, text: string) => page.locator(`${byTid(TID.threadLog)} ${byTid(TID.bubbleMe)}`, { hasText: text });
const fooBubbles = (page: Page, text: string) => page.locator(`${byTid(TID.threadLog)} ${byTid(TID.bubbleFoo)}`, { hasText: text });

function dbFile(dirs: ReturnType<typeof testDirs>): string {
  const f = [join(dirs.FOO_DATA_DIR, 'data', 'foo.db'), join(dirs.FOO_DATA_DIR, 'foo.db')].find((p) => existsSync(p));
  if (!f) throw new Error('no foo.db under the test data folder');
  return f;
}

test('killed while foo is thinking: after reopening, the message is there once and gets its answer', async () => {
  const ASK = 'chaos: what should I cook tonight?';
  const dirs = testDirs();
  // First life: the AI never answers in time (10 minutes on the fake clock), so foo is mid-turn when it dies.
  const first = await launchWithFakeAi([VERIFY_OK, { ...intake(ASK, 'too late'), delayMs: 600_000 }], { dirs });
  let page = await first.app.firstWindow();
  const refs = await openWorld(first.app, page);
  await settleSeededJobs(page, refs);
  await openChat(page, 'foo');
  await page.getByTestId(TID.composerField).focus();
  await page.keyboard.type(ASK);
  await page.keyboard.press('Enter');
  await expect(userBubbles(page, ASK)).toHaveCount(1);
  await page.evaluate(() => window.__fooTest!.clock.advance(2_000)); // past the engine's 1.5 s release gate
  await expect.poll(() => fakeTurns(dirs).filter((t) => t.purpose === 'intake' && t.prompt.includes(ASK)).length).toBe(1);
  await hardKill(first.app);

  // Second life: the AI answers at once.
  const second = await reopen([VERIFY_OK, intake(ASK, 'Back after the restart: dal and rice?')], dirs);
  page = second.page;
  try {
    await openChat(page, 'foo');
    await page.evaluate(() => window.__fooTest!.clock.advance(2_000));
    await expect(fooBubbles(page, 'Back after the restart')).toHaveCount(1, { timeout: 20_000 });
    await expect(userBubbles(page, ASK)).toHaveCount(1); // kept once, never duplicated
    await expect(fooBubbles(page, 'too late')).toHaveCount(0);
  } finally {
    await second.app.close();
  }
});

test('killed three times in a row while idle: chats and messages are all still there and the database is sound', async () => {
  const dirs = testDirs();
  const first = await launchWithFakeAi([VERIFY_OK], { dirs });
  let page = await first.app.firstWindow();
  const refs = await openWorld(first.app, page);
  await settleSeededJobs(page, refs);
  const names = await page.getByTestId(TID.chatlistRowName).allTextContents();
  await openChat(page, 'foo');
  const lastBefore = await page
    .locator(`${byTid(TID.threadLog)} [data-message-id]`)
    .last()
    .getAttribute('data-message-id');
  expect(names.length).toBeGreaterThan(3);
  await hardKill(first.app);

  let app: ElectronApplication | undefined;
  for (let i = 0; i < 3; i++) {
    ({ app, page } = await reopen([VERIFY_OK], dirs));
    await expect(page.getByTestId(TID.chatlistRowName)).toHaveText(names);
    if (i < 2) await hardKill(app);
  }
  try {
    await openChat(page, 'foo');
    await expect(page.locator(`${byTid(TID.threadLog)} [data-message-id="${lastBefore}"]`)).toHaveCount(1);
  } finally {
    await app!.close();
  }
  const db = new Database(dbFile(dirs), { readonly: true, fileMustExist: true });
  try {
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
    expect(db.pragma('foreign_key_check')).toEqual([]);
  } finally {
    db.close();
  }
});
