import { defineConfig } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

const testDir = defineBddConfig({
  features: 'features/**/*.feature',
  steps: ['steps/fixture.ts', 'steps/steps.ts'],
  outputDir: 'generated',
});

export default defineConfig({
  testDir,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'results/playwright.json' }]],
});
