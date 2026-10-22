// Spec: 08-3 §22.3 (isolated FOO_TEST runs), 08-0 §E.6 (test directories).
import { expect, type ElectronApplication, type Page } from '@playwright/test';
import { test as base } from 'playwright-bdd';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, isAbsolute } from 'node:path';
import { delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aiHome } from '../../e2e/ai-step-world';
import { envelope, intake, VERIFY_OK, type FakeLine } from '../../e2e/fakeAi';
import { launch, testDirs } from '../../e2e/launch';
import { TID } from '../../../src/shared/testids';

export type BddRun = {
  app: ElectronApplication;
  page: Page;
  journey: string;
  mode: 'pretend' | 'real';
  dirs?: ReturnType<typeof testDirs>;
  replySeen: boolean;
  refs?: unknown;
  fooCountBefore?: number;
};

type Fixtures = { bddRun: BddRun };

/** Playwright-BDD's generated tests import this fixture so every scenario owns one Electron app. */
export const test = base.extend<Fixtures>({
  // The first fixture argument must remain an object pattern for playwright-bdd's fixture validation.
  // eslint-disable-next-line no-empty-pattern
  bddRun: async ({}, provide, testInfo) => {
    const id = `${testInfo.title}\n${testInfo.file}`.match(/\bJ0?((?:[1-9])|(?:1[0-9])|(?:2[0-2]))\b/);
    const journey = id ? `J${id[1]}` : 'J7';
    const mode = (process.env.FOO_BDD_AI_MODE ?? 'pretend') as BddRun['mode'];
    if (mode !== 'pretend' && mode !== 'real') throw new Error(`FOO_BDD_AI_MODE must be pretend or real, got ${mode}`);

    const run = mode === 'pretend' ? await launchPretend(journey) : await launchReal();
    try {
      await run.page.getByTestId(TID.titlebarStrip).waitFor();
      await provide({ ...run, journey, mode, replySeen: false });
    } finally {
      // Capture the rendered state before teardown so every scenario has a visual receipt, including failures.
      // A crashed page must not replace the scenario's original assertion or teardown failure.
      try {
        await testInfo.attach(`bdd-screen-${journey}`, {
          body: await run.page.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
      } catch (error) {
        testInfo.annotations.push({
          type: 'bdd-screenshot-error',
          description: error instanceof Error ? error.message : String(error),
        });
      }
      await run.app.close().catch(() => undefined);
    }
  },
});

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');

/** test/e2e/launch.ts resolves `.` from the repository root; preserve that contract for the scoped package runner. */
async function launchFromRepo(dirs: ReturnType<typeof testDirs>, env: Record<string, string>): Promise<ElectronApplication> {
  if (process.cwd() !== repoRoot) process.chdir(repoRoot);
  return launch(dirs, [], env);
}

async function launchPretend(
  journey: string,
): Promise<{ app: ElectronApplication; page: Page; dirs: ReturnType<typeof testDirs>; refs?: unknown }> {
  const dirs = testDirs();
  const script = join(dirname(dirs.FOO_DATA_DIR), 'fake-ai.jsonl');
  const jobReply = `<say></say><act>${JSON.stringify({
    decision: {
      kind: 'job',
      title: 'Bills',
      plan: [
        { phraseKey: 'read_email', slots: {}, route: 'api' },
        { phraseKey: 'look_for', slots: { what: 'bills due this week' }, route: 'api' },
      ],
      estimate: { minutes: 1 },
      routeHint: ['api'],
      needsApps: [],
    },
    usedMemoryIds: [],
  })}</act>`;
  const lines: FakeLine[] = [
    VERIFY_OK,
    intake('thanks!', '', { decision: { kind: 'react', emoji: '👍' } }),
    intake('Find my bills due this week', jobReply),
    intake('hello from BDD', envelope('hello from pretend AI')),
    intake('hello', envelope('hello from pretend AI')),
  ];
  mkdirSync(dirname(script), { recursive: true });
  writeFileSync(script, lines.map((line) => JSON.stringify(line)).join('\n') + '\n');
  const firstRun = ['J1', 'J2', 'J3', 'J4', 'J5'].includes(journey);
  const env: Record<string, string> = { FOO_FAKE_AI: script };
  if (firstRun) {
    env.FOO_TEST_FIRST_RUN = '1';
    env.FOO_TEST_AI_HOME = aiHome(['claude', 'codex']);
  }
  const app = await launchFromRepo(dirs, env);
  const page = await app.firstWindow();
  let refs: unknown;
  if (!firstRun) {
    refs = await page.evaluate(() => window.__fooTest!.seed('ux-world'));
    await expect(page.getByTestId(TID.chatlistRow).first()).toBeVisible({ timeout: 15_000 });
  }
  return { app, page, dirs, refs };
}

async function launchReal(): Promise<{ app: ElectronApplication; page: Page }> {
  const provider = process.env.FOO_BDD_REAL_AI_PROVIDER;
  const profile = process.env.FOO_BDD_REAL_AI_HOME;
  const missing = ['FOO_BDD_REAL_AI_PROVIDER', 'FOO_BDD_REAL_AI_HOME'].filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(
      `BDD real-AI mode is blocked: set ${missing.join(', ')} to an isolated provider profile; no credentials are read or created by this test.`,
    );
  }
  if (!provider || !profile || !isAbsolute(profile) || !existsSync(profile)) {
    throw new Error(
      'BDD real-AI mode is blocked: FOO_BDD_REAL_AI_PROVIDER and FOO_BDD_REAL_AI_HOME must name an existing absolute isolated provider profile; no credentials are read or created by this test.',
    );
  }
  if (provider !== 'claude-cli' && provider !== 'codex-cli') {
    throw new Error('BDD real-AI mode is blocked: FOO_BDD_REAL_AI_PROVIDER must be claude-cli or codex-cli.');
  }

  const dirs = testDirs();
  mkdirSync(dirs.FOO_DATA_DIR, { recursive: true });
  // Production mode chooses the provider through the same persisted settings path as the app UI. The
  // profile is isolated by the caller; this seed contains no credential, only the provider selection and
  // the verification state the setup flow would have written after the user's own CLI answered a probe.
  writeFileSync(
    join(dirs.FOO_DATA_DIR, 'settings.json'),
    JSON.stringify({
      schemaVersion: 2,
      setup: { complete: true, step: 5 },
      identity: { agentName: 'foo' },
      ai: {
        primary: provider,
        backup: null,
        providers: { [provider]: { kind: 'plan', lastVerifiedAt: Date.now(), lastVerifyOk: true } },
        plainChatFallback: false,
      },
    }),
  );
  // Electron derives its Windows userData directory from APPDATA. Keep that tree under the
  // explicitly supplied provider profile so real-mode launch never depends on a runner-global path.
  const windowsAppData = join(profile, 'AppData');
  const appData = join(windowsAppData, 'Roaming');
  const localAppData = join(windowsAppData, 'Local');
  mkdirSync(appData, { recursive: true });
  mkdirSync(localAppData, { recursive: true });
  const app = await launchFromRepo(dirs, {
    // launch() is the repository's Electron launcher; 0 keeps its isolated folders while enabling the real engine.
    FOO_TEST: '0',
    FOO_BDD_AI_MODE: 'real',
    FOO_BDD_REAL_AI_PROVIDER: provider,
    FOO_BDD_REAL_AI_HOME: profile,
    HOME: profile,
    USERPROFILE: profile,
    APPDATA: appData,
    LOCALAPPDATA: localAppData,
    // Keep the installed CLI shim discoverable while the provider's auth and Windows app data stay isolated above.
    PATH: [join(profile, 'bin'), process.env.PATH ?? ''].join(delimiter),
  });
  return { app, page: await app.firstWindow() };
}
