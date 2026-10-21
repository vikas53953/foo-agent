// The AI step's first-run world (CR-0020): a FOO_TEST run with no AI chosen (FOO_TEST_FIRST_RUN=1, so main posts the 06-1 §2.2
// finder), the fake AI answering every test (08-3 §22.3), and a stand-in home whose helpers are fakes (FOO_TEST_AI_HOME,
// CR-0020 (b) pick 8): `{home}/bin/{claude|codex}` plus its sign-in file, never the machine's own.
import type { ElectronApplication, Page } from '@playwright/test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TID } from '../../src/shared/testids';
import { VERIFY_OK, type FakeLine } from './fakeAi';
import { launch, testDirs } from './launch';

type Helper = 'claude' | 'codex';
const SIGN_IN: Record<Helper, string[]> = { claude: ['.claude', '.credentials.json'], codex: ['.codex', 'auth.json'] };

/** A stand-in home with the named helpers installed and signed in. */
export function aiHome(helpers: Helper[]): string {
  const home = mkdtempSync(join(tmpdir(), 'foo-ai-home-'));
  mkdirSync(join(home, 'bin'), { recursive: true });
  for (const h of helpers) addHelper(home, h);
  return home;
}

export function addHelper(home: string, h: Helper): void {
  const bin = join(home, 'bin', process.platform === 'win32' ? `${h}.exe` : h);
  writeFileSync(bin, '');
  const [dir, file] = SIGN_IN[h] as [string, string];
  mkdirSync(join(home, dir), { recursive: true });
  writeFileSync(join(home, dir, file), '{}');
}

export interface Run {
  app: ElectronApplication;
  page: Page;
}

/** A fresh first run. CR-0026: it opens on the Welcome card; `stayOnWelcome` keeps it there, otherwise "Let's go" is tapped. */
export async function firstRun(home: string, lines: FakeLine[] = [VERIFY_OK], o: { stayOnWelcome?: boolean } = {}): Promise<Run> {
  const dirs = testDirs();
  const script = join(dirs.FOO_DATA_DIR, '..', 'fake-ai.jsonl');
  mkdirSync(join(dirs.FOO_DATA_DIR, '..'), { recursive: true });
  writeFileSync(script, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  const app = await launch(dirs, [], { FOO_FAKE_AI: script, FOO_TEST_FIRST_RUN: '1', FOO_TEST_AI_HOME: home });
  const page = await app.firstWindow();
  await page.getByTestId(TID.titlebarStrip).waitFor();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1280, 800));
  await page.waitForFunction(() => window.innerWidth === 1280 && window.innerHeight === 800);
  if (!o.stayOnWelcome) await page.getByTestId(TID.setupWelcomeStart).click();
  return { app, page };
}

/** The newest "Find your AI" card in foo's chat, and one of its rows. */
export const finder = (page: Page) => page.locator(`[data-testid="${TID.cardSetup}"][data-row-id="ai_finder"]`).last();
export const finderRow = (page: Page, id: string) => finder(page).locator(`[data-testid="${TID.setupAiRow}"][data-row-id="${id}"]`);
