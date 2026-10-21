// Spec: CR-0031 (X-189): the tests Stryker runs against each mutant of the planner and parser files (stryker.config.json).
// Only tests that import those files, so a mutation run takes minutes, not the whole suite.
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: path.resolve(__dirname, '../..'),
    include: [
      'test/unit/slot-cleaning.test.ts',
      'test/unit/m4-contracts.test.ts',
      'test/unit/p1-time-saved.test.ts',
      'test/unit/cli-version-floor.test.ts',
      'test/unit/m3-prompt-envelope.test.ts',
      'test/unit/m3-adapters-parsers.test.ts',
      'test/integration/jobs/plan-phrases.test.ts',
      'test/integration/jobs/plan-keys-repair.test.ts',
    ],
    environment: 'node',
    hookTimeout: 60_000,
    testTimeout: 20_000,
  },
});
