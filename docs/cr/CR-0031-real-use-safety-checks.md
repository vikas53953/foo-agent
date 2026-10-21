# CR-0031: Real-use safety checks: the AI's plan is checked in code, the checks are locked, coverage and mutants are counted, an old helper says so

- **Asked by:** Vikas, 2026-10-21 12:56Z ("Yea", thread "Real-use safety checks") to the six new ideas the coordinator drew
  from his X research report on testing apps with real AI models (the ideas the "Build the full test stack" work, PR #97,
  does not cover).
- **Why:** the real-PC run of 2026-10-21 found bugs that every CI check missed because CI only talks to the fake AI:
  invented plan keys ("Work on it" on every row, CR-0027), an out-of-date Codex shown as "slow to answer" (CR-0025), four
  browser screens of a merged milestone never built (CR-0030), and a saved key that never read back (CR-0025). Each item
  below closes one way such a bug gets through.
- **Spec sections:** 08-2 §5.3.3, §7.5 (repair), §6.5–§6.7 (probe, verify, classification), 08-4 §26.1 (catalogue),
  06-1 §2.2 (`needs_update`), 11-fidelity §11.5.3 (FID-18, new FID-21), §11.7.1 (new FID-22), §11.10.
- **Status:** Approved by Vikas on his behalf, DECISIONS X-189 (his "Yea" 2026-10-21 12:56Z and his standing rule of
  2026-10-18 14:56Z; after the independent review in §(d)).
- **Change:** `spec/constitution/08-functions-and-engine-2.md` §5.3.3 (repair before the fallback),
  `spec/constitution/11-fidelity.md` (FID-21 under §11.5.3, FID-22 under §11.7.1, two rows in §11.10),
  `spec/constitution/DECISIONS.md` row X-189, `spec/SPEC-MANIFEST.json`. Code, tests and CI below. This CR names the locked
  check files it changes: `scripts/fid-guard.ts`, `.github/workflows/ci.yml`, `.claude/settings.json`,
  `.claude/hooks/locked-checks.mjs`.

## (a) Picks

1. **The AI's plan is checked in code** (`planKeyIssues`, `src/shared/phrases.ts`; `ChatLane`). An intake `job` whose plan
   has a key outside the catalogue, a runner-only key or a missing slot gets the one §7.5 repair turn, with the issues
   ("step 1: "search_web" is not one of the listed phrase keys; …"). If the repaired plan is a clean `job` it replaces the
   first one; otherwise the first plan stands and each bad step falls back to `generic_working`, as before. One tech-log
   line `chat.plan_keys` `repaired` or `fallback`. A clean plan pays for no extra turn. Slot text is not judged (§26.1
   cleans it). Not done: checks on the meaning of dates and places in the AI's answers; there is no spec rule yet for what
   a wrong date is, so it waits for a real case.
2. **The checks are locked (FID-22).** `fid-guard` fails a PR that changes a `LOCKED` file (the guards, `spec-verify`,
   the vitest and Playwright configs, `OWNERS.yml`, `ci.yml`, the hook and its settings) or removes more test cases
   (`it(` / `test(` and their `.each`, `.only`… forms, across all test files, so a moved test cancels out) than it adds,
   unless a CR is cited. A new id in `docs/fidelity/coverage-gaps.json` is a FID-06 pattern (needs a CR). A Claude Code
   `PreToolUse` hook (`.claude/settings.json` → `.claude/hooks/locked-checks.mjs`) stops an agent before it edits a locked
   file or runs `rm`, `mv`, `git rm` or `git mv` on a test file or a locked file, unless a CR on its branch (committed
   since `origin/main`, or not committed yet) names the path. `skip`/`only` were already FID-06. Not used: CODEOWNERS
   with required review, which would also block the approve-on-behalf merges.
3. **Mutation testing** (Stryker 10.0.0 with its command runner (`@stryker-mutator/vitest-runner` 10.0.0 ran no test per mutant under vitest 5); `stryker.config.json`, `pnpm test:mutation`).
   Mutates `src/shared/phrases.ts`, `src/engine/prompt/envelope.ts`, `src/engine/ai/classify.ts` and
   `src/engine/ai/probe.ts`, running only the tests that import them (`test/mutation/vitest.mutation.config.ts`).
   Workflow `.github/workflows/mutation.yml`: weekly, by hand, and on PRs that touch those files; the HTML report is an
   artifact. The build breaks under the `break` score in `stryker.config.json` (set from the first run, §(c)); it only rises.
4. **Spec coverage (FID-21, `scripts/coverage-check.ts`, `pnpm spec:coverage`, fast lane every push).** A milestone is
   built when its close-out wrote `docs/fidelity/<M>.audit.json` (today M1–M6, M8, M9, P1, R1). Every UX step and BP ref
   of `golden/manifest.json` in a built milestone, and every `trace.csv` row of one, needs a `live` row whose test file
   exists; superseded steps are exempt. The 62 gaps of 2026-10-21 are listed with their reason (39 under the CR-0002 /
   CR-0003 reference disputes, 15 pending rows CR-0013 names, 4 CR-0003 names, 4 no CR names yet; among them UX-14-05/06/08 and UX-15-05/08/09, the screens
   CR-0030 builds). A new gap fails; a listed id that is covered now fails until it is removed.
5. **An old helper app says so.** `KNOWN_GOOD_VERSION` (`src/engine/ai/probe.ts`) = the lowest version seen working on a
   real PC: claude 2.1.282 and codex 0.156.1 (the 2026-10-18 captures). A helper below it whose test times out or fails
   with no known reason classes `AI_CLI_INCOMPATIBLE`, so the finder row reads "needs an update" (CR-0025's
   `needs_update`), not "slow to answer". At or above the floor, or with no floor (gemini), nothing changes; a working old
   helper still works. **Cold start:** no new timer. CR-0025 already gives helper tests 60 s and runs them one after another;
   the slowest real cold start measured was 18 s with two helpers starting at once. A second timer would have no evidence
   behind it.
6. **Real Windows Credential Manager in CI:** already on main (`test/integration/vault/windows-keyring.test.ts`, X-183,
   CR-0025 pick 8): save, read back, delete and `vault.use(ai_call)` through the real `@napi-rs/keyring` on the Windows
   shards. Nothing added.

## (b) Not changed

The §26.1 fallback, the wire schema (`PhraseKeySchema` still accepts any key), step-turn replans (`step.md` already lists
the keys), the finder's timers, the trace matrix itself. No migration, channel, copy key or test id.

## (c) Mutation baseline

Filled from the first full run (see the PR): score per file and the surviving mutants worth a test.

## (d) Independent review

Pending.
