// Spec: 08-3 §22.8 (mutation runner uses isolated deterministic tests); this is the Lane F test subset, not a new product test.
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: path.resolve(__dirname, '../..'),
    include: [
      'test/unit/redactor/patterns.test.ts',
      'test/unit/redactor/context.test.ts',
      'test/unit/redactor/techlog.test.ts',
      'test/unit/m3-redactor-extra.test.ts',
      'test/unit/m2r-redactor.test.ts',
      'test/unit/m3-prompt-envelope.test.ts',
      'test/unit/m3-adapters-parsers.test.ts',
      'scripts/audit/mutation-report.test.ts',
      'scripts/audit/cloud-outbound.test.ts',
    ],
    environment: 'node',
    hookTimeout: 60_000,
    testTimeout: 20_000,
  },
});
