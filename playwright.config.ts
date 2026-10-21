// Spec: foo-plan §4 (E2E with Playwright for Electron); 11-fidelity §11.2.4 (Tier B settings, no retries for pictures),
// FID-06 (snapshots are never updated outside scripts/golden-bless.ts).
import { defineConfig } from '@playwright/test';

const blessing = process.env.FOO_GOLDEN_BLESS === '1';
const updating = process.argv.some((a) => a === '-u' || a.startsWith('--update-snapshots'));
if (updating && !blessing) {
  throw new Error('FID-06: --update-snapshots is blocked. Baselines change only through scripts/golden-bless.ts with a CR id.');
}

export default defineConfig({
  testDir: 'test',
  // E2E specs, and the Blueprint and walkthrough capture specs that trace.csv names under test/fidelity/bp and
  // test/fidelity/ux (11-fidelity §11.2.3, §11.10).
  testMatch: ['e2e/**/*.spec.ts', 'fidelity/bp/**/*.spec.ts', 'fidelity/ux/**/*.spec.ts'],
  timeout: 60_000,
  workers: 1,
  retries: 0,
  // On CI the github reporter also files each failure as a check annotation, which the public API serves without a sign-in.
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/e2e.json' }],
    ...(process.env.CI ? [['github'] as ['github']] : []),
  ],
  snapshotPathTemplate: 'golden/app/{arg}{ext}',
  updateSnapshots: blessing ? 'all' : 'none',
  expect: {
    toHaveScreenshot: { threshold: 0.1, maxDiffPixelRatio: 0.001, animations: 'disabled', caret: 'hide', scale: 'css' },
  },
});
