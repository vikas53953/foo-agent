import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import foo from './eslint-rules/index.js';

export default tseslint.config(
  {
    ignores: [
      'out/',
      'dist/',
      'spec/',
      'node_modules/',
      'test-results/',
      'playwright-report/',
      'src/shared/tokens.ts',
      'src/renderer/public/',
      'reports/',
      '.stryker-tmp/',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    plugins: { foo, 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'foo/no-literal-copy': 'error',
      'foo/testid-from-registry': 'error',
      'foo/spec-header': 'error',
    },
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    rules: { 'foo/no-raw-design-values': 'error' },
  },
  {
    files: ['eslint-rules/**/*.js'],
    languageOptions: { sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
