# Project map (every file, one line each; kept current every milestone)

| Path                                                                                          | What it is                                                                                 |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `package.json`                                                                                | scripts, pinned Electron 44.9.0, dependencies                                              |
| `tsconfig.base.json` · `tsconfig.main.json` · `tsconfig.renderer.json` · `tsconfig.node.json` | strict TypeScript for main+preload+shared, renderer, scripts+tests                         |
| `vite.config.ts`                                                                              | renderer build (`base: './'`, port 5173 for `FOO_DEV=1`)                                   |
| `vitest.config.ts` · `playwright.config.ts`                                                   | unit/article/fidelity tests · E2E for Electron                                             |
| `eslint.config.mjs` · `eslint-rules/index.js`                                                 | lint + foo rules: no-literal-copy, testid-from-registry, no-raw-design-values, spec-header |
| `.prettierrc` · `.prettierignore` · `.gitignore`                                              | formatting and ignores                                                                     |
| `electron-builder.yml`                                                                        | packaging identity (AUMID `com.foo.desktop`, `foo://`, NSIS per-user)                      |
| `.github/workflows/ci.yml`                                                                    | ubuntu fast lane + windows-latest full suite, E2E, package, asar check                     |
| `OWNERS.yml`                                                                                  | one owner per path (FID-19)                                                                |
| `implementation-notes.md`                                                                     | deviations, picks where the spec is silent, deferrals                                      |
| `docs/cr/CR-0000-template.md`                                                                 | change-request template for spec changes                                                   |
| `design/tokens.json`                                                                          | THE token source (02 F1–F8, 02-2 F11.2, F12.2)                                             |
| `design/tokens.paper.json`                                                                    | generated Paper export                                                                     |
| `scripts/build-tokens.ts`                                                                     | tokens.json → tokens.css, tokens.ts, tokens.paper.json                                     |
| `scripts/build-icon.ts`                                                                       | renders the two-eyes logo (X-143) into `resources/icons/foo.ico`                           |
| `scripts/check-copy.ts`                                                                       | copy keys exist/used, key shape, Article 2 banned words                                    |
| `scripts/spec-verify.ts`                                                                      | FID-01: spec/ equals SPEC-MANIFEST.json                                                    |
| `scripts/copy-migrations.ts`                                                                  | copies `.sql` migrations next to the compiled db.js                                        |
| `spec/`                                                                                       | frozen spec-v1.0: constitution, Look Book assets, `SPEC-MANIFEST.json`                     |
| `resources/icons/foo.ico` · `foo-256.png`                                                     | app icon, 14 sizes (generated)                                                             |
| `src/main/index.ts`                                                                           | startup order 08-1 §2.2 steps 1–5                                                          |
| `src/main/data/paths.ts`                                                                      | `{DATA}`, `{LOCAL}`, test overrides (08-0 §E.6)                                            |
| `src/main/settings/Settings.ts`                                                               | settings.json load, repair, atomic write                                                   |
| `src/main/store/db.ts` · `migrations/0001_init.sql`                                           | SQLite open, pragmas, forward-only migrations · the 08-1 §4.3 DDL verbatim                 |
| `src/main/ipc/IpcRouter.ts`                                                                   | sender-checked IPC (`app:platform`)                                                        |
| `src/main/windows/mainWindow.ts`                                                              | window size/restore, title bar overlay, theme switching                                    |
| `src/main/windows/singleInstance.ts`                                                          | single instance lock and second-launch focus                                               |
| `src/main/windows/protocol.ts`                                                                | `app://foo/` scheme, CSP, trusted URLs                                                     |
| `src/preload/preload.ts`                                                                      | `window.foo.platform`                                                                      |
| `src/shared/tokens.ts`                                                                        | generated token constants                                                                  |
| `src/shared/format.ts`                                                                        | `formatInr`, `formatInrWords`, `parseInr`, `formatTime`, `formatDate`                      |
| `src/shared/canon.ts`                                                                         | `canonicalJson` (RFC 8785)                                                                 |
| `src/shared/settings.ts` · `settingsDefaults.ts`                                              | settings schema (zod) · defaults                                                           |
| `src/shared/testids.ts`                                                                       | `TID` registry                                                                             |
| `src/shared/ipc.ts` · `types.ts`                                                              | IPC and shared types                                                                       |
| `src/shared/copy/en-IN.json` · `t.ts`                                                         | copy file · `t(key, vars)`                                                                 |
| `src/renderer/index.html` · `public/theme-boot.js`                                            | entry · theme before first paint                                                           |
| `src/renderer/main.tsx` · `App.tsx`                                                           | renderer boot · app root                                                                   |
| `src/renderer/styles/tokens.css` · `global.css`                                               | generated tokens · base styles                                                             |
| `src/renderer/shell/Shell.tsx` · `TitleBar.tsx` (+ `.module.css`)                             | window grid · empty drag strip                                                             |
| `test/unit/*`                                                                                 | format, canon, settings repair, window bounds, migrations                                  |
| `test/articles/*`                                                                             | ART-24a, ART-02a/02d, ART-21a/21c                                                          |
| `test/fidelity/*`                                                                             | FID-01, FID-11, FID-12, copy check, icon                                                   |
| `test/e2e/*`                                                                                  | M0 window: PERF-01 smoke, title bar, light/dark, single instance                           |
