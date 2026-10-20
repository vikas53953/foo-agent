import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'test/unit/**/*.test.ts',
      'test/integration/**/*.test.ts',
      'test/perf/**/*.test.ts',
      'test/articles/**/*.test.ts',
      'test/fidelity/**/*.test.ts',
    ],
    environment: 'node',
    // The M9 browser suites start and stop a real Chromium in their hooks; on the Windows runner a close alone can pass
    // the 10 s default (masker.test.ts afterAll, close-out CI), so hooks get the same minute the browser tests do.
    hookTimeout: 60_000,
    // A busy Windows runner ran carryover.test.ts's "opens_at tick" (three settles and a poll) past the 5 s default.
    testTimeout: 20_000,
  },
});
