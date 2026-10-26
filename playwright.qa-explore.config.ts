// Spec: Vikas 2026-10-26 (exploratory QA of the running app). Its own config so the exploration and the open-defect
// regressions (red until the builder fixes them) never turn the main e2e suite red. It uses no screenshot baselines.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'test/qa-explore',
  testMatch: ['**/*.spec.ts'],
  timeout: 120_000,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: `${process.env.QA_EXPLORE_DIR ?? 'qa-explore-report/latest'}/playwright.json` }]],
});
