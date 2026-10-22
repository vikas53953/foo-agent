// Production-only BDD fixture: FOO_TEST=0, an isolated Windows profile, and no test hooks or fake AI.
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { test as base } from 'playwright-bdd';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { settingsDefaults } from '../../../src/shared/settingsDefaults';
import { TID } from '../../../src/shared/testids';

export type RealBddRun = {
  app: ElectronApplication;
  page: Page;
  provider: 'claude-cli' | 'codex-cli';
  dataRoot: string;
  fooCountBefore?: number;
};

type Fixtures = { realRun: RealBddRun };

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');

/** Playwright-BDD's generated real tests use only this production fixture. */
export const test = base.extend<Fixtures>({
  // The first fixture argument must remain an object pattern for playwright-bdd's fixture validation.
  // eslint-disable-next-line no-empty-pattern
  realRun: async ({}, provide, testInfo) => {
    const run = await launchProduction(testInfo.testId);
    try {
      await run.page.getByTestId(TID.titlebarStrip).waitFor();
      await provide(run);
    } finally {
      try {
        await testInfo.attach(`real-bdd-screen-${run.provider}`, {
          body: await run.page.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
      } catch (error) {
        testInfo.annotations.push({
          type: 'real-bdd-screenshot-error',
          description: error instanceof Error ? error.message : String(error),
        });
      }
      await run.app.close().catch(() => undefined);
      rmSync(run.dataRoot, { recursive: true, force: true });
    }
  },
});

async function launchProduction(testId: string): Promise<RealBddRun> {
  const provider = process.env.FOO_BDD_REAL_AI_PROVIDER;
  const profile = process.env.FOO_BDD_REAL_AI_HOME;
  if (!profile || !existsSync(profile) || !requireAbsolute(profile)) {
    throw new Error('Real BDD mode requires an existing absolute FOO_BDD_REAL_AI_HOME profile.');
  }
  if (provider !== 'claude-cli' && provider !== 'codex-cli') {
    throw new Error('Real BDD mode requires FOO_BDD_REAL_AI_PROVIDER=claude-cli or codex-cli.');
  }

  const dataRoot = join(profile, 'bdd-runs', safePathSegment(testId));
  const windowsAppData = join(dataRoot, 'AppData');
  const appData = join(windowsAppData, 'Roaming');
  const localAppData = join(windowsAppData, 'Local');
  const productionData = join(appData, 'foo');
  mkdirSync(productionData, { recursive: true });
  mkdirSync(join(localAppData, 'foo'), { recursive: true });
  writeFileSync(
    join(productionData, 'settings.json'),
    JSON.stringify({
      ...settingsDefaults,
      setup: { complete: true, step: 5 },
      ai: {
        ...settingsDefaults.ai,
        primary: provider,
        providers: {
          ...settingsDefaults.ai.providers,
          [provider]: { kind: 'plan', lastVerifiedAt: Date.now(), lastVerifyOk: true },
        },
      },
    }),
  );

  if (process.cwd() !== repoRoot) process.chdir(repoRoot);
  const env = { ...process.env } as Record<string, string>;
  for (const name of ['FOO_DATA_DIR', 'FOO_LOCAL_DIR', 'FOO_OUT_DIR', 'FOO_FAKE_AI', 'FOO_TEST_FIRST_RUN', 'FOO_TEST_AI_HOME']) {
    delete env[name];
  }
  Object.assign(env, {
    FOO_TEST: '0',
    FOO_BDD_AI_MODE: 'real',
    FOO_BDD_REAL_AI_PROVIDER: provider,
    FOO_BDD_REAL_AI_HOME: profile,
    HOME: profile,
    USERPROFILE: profile,
    APPDATA: appData,
    LOCALAPPDATA: localAppData,
    PATH: [join(profile, 'bin'), process.env.PATH ?? ''].join(delimiter),
  });
  const args = ['.'];
  if (process.platform === 'linux') args.push('--no-sandbox');
  const app = await electron.launch({ args, colorScheme: null, env });
  return { app, page: await app.firstWindow(), provider, dataRoot };
}

function requireAbsolute(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\');
}

function safePathSegment(value: string): string {
  const segment = value.replace(/[^A-Za-z0-9_-]/g, '-');
  return segment || 'real-bdd-run';
}
