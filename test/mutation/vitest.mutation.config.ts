// Spec: project testing rule §4–10 (Vikas 2026-10-21); release gate, Grok practice 16 (mutation testing): the tests Stryker runs
// against each mutant of the files in stryker.config.json. Only tests that import those files, so a run takes minutes.
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: path.resolve(__dirname, '../..'),
    include: [
      'test/unit/slot-cleaning.test.ts',
      'test/unit/m4-contracts.test.ts',
      'test/unit/p1-time-saved.test.ts',
      'test/unit/m3-prompt-envelope.test.ts',
      'test/unit/m3-adapters-parsers.test.ts',
      'test/integration/jobs/plan-phrases.test.ts',
    ],
    environment: 'node',
    hookTimeout: 60_000,
    testTimeout: 20_000,
  },
});
