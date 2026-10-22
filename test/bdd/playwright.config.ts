import { defineConfig } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

const testDir = defineBddConfig({
  // Keep the production-only real subset on its own config and preserve the 22 pretend journeys here.
  features: 'features/J[0-9][0-9]-*.feature',
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
