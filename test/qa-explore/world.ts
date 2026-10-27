// Spec: CR-0054 (the batch-1 build: install, ai, name, chat, settings); 07-1 J1–J3 (first run); 08-3 §22.3 (the fake AI);
// Vikas 2026-10-26 "test the running product as a real user". The exploratory world: the real Electron build on fresh data
// folders, batch-1 switches, a stand-in home with Claude signed in, and the test clock ticked in real time so the app
// behaves as it does for a person (timers, fades, "typing…") instead of freezing between steps.
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TID } from '../../src/shared/testids';

export const BATCH_1 = 'install,ai,name,chat,settings';
const INPAGE = readFileSync(join(__dirname, 'inpage.js'), 'utf8');

export interface FakeLine {
  match: { purpose: string; promptIncludes?: string };
  reply?: string;
  chunks?: { text: string; delayMs?: number }[];
  error?: string;
  once?: boolean;
}

/** A FOO/1 intake reply. The fake matches the whole prompt (history included), so each token is used once, in send order. */
export const say = (tok: string, text: string, decision: Record<string, unknown> = { kind: 'reply' }): FakeLine => ({
  match: { purpose: 'intake', promptIncludes: tok },
  reply: `<say>${text}</say>\n<act>${JSON.stringify({ decision, usedMemoryIds: [] })}</act>`,
});

export interface World {
  app: ElectronApplication;
  page: Page;
  dirs: { FOO_DATA_DIR: string; FOO_LOCAL_DIR: string; FOO_OUT_DIR: string };
  home: string;
  script: string;
  stop: () => Promise<void>;
}

/** The fake AI's requests so far (08-3 §22.3: {DATA}/test/turns.jsonl). */
export function turns(w: Pick<World, 'dirs'>): { purpose: string; system?: string; prompt: string }[] {
  try {
    return readFileSync(join(w.dirs.FOO_DATA_DIR, 'test', 'turns.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

/** Launches foo. `firstRun` posts the Welcome card; `reuse` relaunches on an earlier world's folders (restart). */
export async function open(lines: FakeLine[], o: { firstRun?: boolean; reuse?: World; size?: [number, number] } = {}): Promise<World> {
  let dirs: World['dirs'];
  let home: string;
  let script: string;
  if (o.reuse) {
    ({ dirs, home, script } = o.reuse);
  } else {
    const base = mkdtempSync(join(tmpdir(), 'foo-qax-'));
    dirs = { FOO_DATA_DIR: join(base, 'data'), FOO_LOCAL_DIR: join(base, 'local'), FOO_OUT_DIR: join(base, 'out') };
    home = join(base, 'home');
    mkdirSync(join(home, 'bin'), { recursive: true });
    mkdirSync(join(home, '.claude'), { recursive: true });
    writeFileSync(join(home, 'bin', process.platform === 'win32' ? 'claude.exe' : 'claude'), '');
    writeFileSync(join(home, '.claude', '.credentials.json'), '{}');
    script = join(base, 'fake-ai.jsonl');
    // Real Claude takes seconds per reply; an instant fake hid 👀 on every message (F27). So every scripted reply waits
    // QA_SLOW_AI_MS (pnpm qa:explore sets 3000) before its first word, unless the line sets its own timing.
    const slowMs = Number(process.env.QA_SLOW_AI_MS ?? 0);
    const slowed = (l: FakeLine): FakeLine =>
      slowMs > 0 && l.reply !== undefined && l.match.purpose === 'intake'
        ? { match: l.match, once: l.once, chunks: [{ text: l.reply, delayMs: slowMs }] }
        : l;
    const all: FakeLine[] = [
      { match: { purpose: 'verify' }, reply: 'ready', once: false },
      ...[...lines, say('', 'Theek hai.')].map(slowed),
    ];
    all[all.length - 1]!.once = false;
    writeFileSync(script, all.map((l) => JSON.stringify(l)).join('\n') + '\n');
  }
  const args = ['.'];
  if (process.platform === 'linux') args.push('--no-sandbox');
  const env: Record<string, string> = { ...(process.env as Record<string, string>), FOO_TEST: '1', ...dirs, FOO_FAKE_AI: script };
  env.FOO_TEST_AI_HOME = home;
  env.FOO_FEATURES = BATCH_1;
  if (o.firstRun) env.FOO_TEST_FIRST_RUN = '1';
  const app = await electron.launch({ args, colorScheme: null, env });
  const page = await app.firstWindow();
  await page.getByTestId(TID.titlebarStrip).waitFor();
  const [w, h] = o.size ?? [1280, 800];
  await app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0]!.setContentSize(w!, h!), [w, h]);
  await page.evaluate(INPAGE);
  // Real-time clock: 100 ms of app time every 100 ms of wall time.
  let ticking = true;
  const tick = (async () => {
    while (ticking) {
      await page.evaluate(() => window.__fooTest?.clock.advance(100)).catch(() => {});
      await new Promise((r) => setTimeout(r, 100));
    }
  })();
  const stop = async () => {
    ticking = false;
    await tick;
    await app.close().catch(() => {});
  };
  return { app, page, dirs, home, script, stop };
}

/** Re-injects the in-page helpers (after a reload or a new window). */
export const inject = (page: Page) => page.evaluate(INPAGE);

/** Welcome → Use Claude → name → face → talk style, as a user does it. */
export async function finishSetup(page: Page, o: { name?: string; face?: number; vibe?: number } = {}): Promise<void> {
  await page.getByTestId(TID.setupWelcomeStart).click();
  await page.getByTestId(TID.setupAiUse).click({ timeout: 20_000 });
  if (o.name === undefined) {
    await page.getByTestId(TID.setupSkipRest).click();
  } else {
    await page.getByTestId(TID.setupNameField).fill(o.name);
    await page.getByTestId(TID.setupNameDone).click();
    await page
      .locator('[data-testid="thread-log"] [role=radio]')
      .nth((o.face ?? 1) - 1)
      .click({ timeout: 10_000 });
    await page.getByText('Use this face').click();
    await page
      .getByTestId(TID.cardChoiceOption)
      .nth((o.vibe ?? 1) - 1)
      .click({ timeout: 10_000 });
  }
  await page.getByTestId(TID.composerField).waitFor();
  await page.waitForTimeout(1500);
}

/** Types a message like a user and waits until foo's answer count grows. */
export async function send(page: Page, text: string): Promise<void> {
  const answers = page.locator(`[data-testid="${TID.bubbleFoo}"]`);
  const before = await answers.count();
  await page.getByTestId(TID.composerField).fill(text);
  await page.keyboard.press('Enter');
  await page
    .waitForFunction((n) => document.querySelectorAll('[data-testid="bubble-foo"]').length > n, before, { timeout: 20_000 })
    .catch(() => {});
  await page.waitForTimeout(600);
}

declare global {
  interface Window {
    __qa: {
      controls(): { tid: string; role: string; name: string; path: string; disabled: boolean; box: number[]; hasAccessibleName: boolean }[];
      invariants(): Record<string, unknown>[];
      overlays(): { role: string | null; tid: string | null; text: string; box: number[] }[];
      visible(el: Element): boolean;
    };
  }
}
