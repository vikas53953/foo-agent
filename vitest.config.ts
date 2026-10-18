import { defineConfig } from 'vitest/config';

// CR-0018 G-M14-24: tests see a tester build, as every unsigned build does (vite.config.ts).
export default defineConfig({
  define: { __FOO_TESTER_BUILD__: 'true' },
  test: {
    include: [
      'test/unit/**/*.test.ts',
      'test/integration/**/*.test.ts',
      'test/perf/**/*.test.ts',
      'test/articles/**/*.test.ts',
      'test/fidelity/**/*.test.ts',
    ],
    environment: 'node',
  },
});
