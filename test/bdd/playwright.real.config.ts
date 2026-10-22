import { defineConfig } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

const testDir = defineBddConfig({
  features: 'features/real/**/*.feature',
  steps: ['steps/real-fixture.ts', 'steps/real-steps.ts'],
  outputDir: 'generated-real',
});

export default defineConfig({
  testDir,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'results/real-playwright.json' }]],
});
