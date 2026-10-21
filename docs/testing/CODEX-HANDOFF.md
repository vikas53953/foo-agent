# Testing handoff: Claude ↔ Codex

Shared notes for any agent (Claude or Codex) working on proving foo's 160 built features. Read this file first, then `coverage-matrix.md`. Update both before you stop.

## Where things stand

The live numbers are in `coverage-matrix.md` (generated) and on the coverage page. To regenerate after any change:

```bash
python3 docs/testing/build_matrix.py
```

Inputs you may edit by hand:

| File                               | What it holds                                                                                                                    |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `docs/testing/features.tsv`        | the 160 built features (milestone, spec id, spec journey, acceptance text)                                                       |
| `docs/testing/real-ai-results.tsv` | one row per judged real-AI result: id, result (pass/fail/wrong/partial/blocked/unclear), build sha, journey, evidence link, note |
| `docs/testing/suite-status.tsv`    | facts that decide many cells: main CI state and sha, unmerged test PRs                                                           |
| `docs/testing/build_matrix.py`     | the rules that turn evidence into cells (the feature groups at the top)                                                          |

Everything else (`coverage-matrix.md/.tsv/.json`, `coverage-cells.tsv`) is generated. Do not edit it.

## The evidence rule (no exceptions)

- **proven** = a passing run on **current main** is linked. For code tests that is a green main CI run on the current main sha. For real AI it is a judged journey result whose build sha is the current main sha, with a log or screenshot on the `evidence` branch.
- **partial** = passed on a PR branch, on an older build, on a real PC without a log, or the test exists but is not merged or not run.
- **fails** = a real run shows it broken or wrong against the spec.
- **missing** = nothing tests it.
- A driver step that says `"ok": true` is not a pass. The real-AI driver marks a step ok when a reply arrives, even if the reply is the stuck-job card. Look at the reply text and the screenshot.
- Never round up. If unsure, write partial and say why in the note.

## The 15 test types and how each runs

| Type               | How it runs today                                                  | Command or place                                                                                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit               | Vitest                                                             | `pnpm test` (test/unit, test/articles)                                                                                                                                                                              |
| Integration        | Vitest                                                             | `pnpm test` (test/integration)                                                                                                                                                                                      |
| E2E, pretend AI    | Playwright `_electron` with the fake CLI                           | `pnpm build && pnpm exec playwright test test/e2e` (Windows CI runs 4 shards)                                                                                                                                       |
| Real-AI journey    | foo-drive.js drives the built foo.exe with a real Claude key       | `.github/workflows/real-ai-e2e.yml`, runs on every push to main; evidence on branch `evidence` at `real-ai/<sha>-claude/s0..s3/<journey>/log.jsonl, thread.json, *.png`; journeys in `test/real-pc/journeys/*.json` |
| BDD spec           | **not built**                                                      | proposed: `test/bdd/*.feature` (Given/When/Then from `features.tsv`) run by playwright-bdd                                                                                                                          |
| AI eval            | promptfoo judge, 32 asks (PR #97, not merged)                      | `test/judge/promptfooconfig.yaml`; deeper set (routing, plans, tone, safety, Hinglish/Hindi/Punjabi) still to write                                                                                                 |
| Visual regression  | picture checks vs golden Blueprint captures, pretend AI            | `test/fidelity/bp/*.spec.ts`, `golden/`; baselines change only through the bless workflow                                                                                                                           |
| Animation / motion | 5 checks in `test/e2e/p1-motion.spec.ts`                           | 13 motion rules (AT-300..327 range) still unchecked                                                                                                                                                                 |
| Accessibility      | axe sweep of every surface (PR #97, not merged)                    | `test/e2e/a11y-sweep.spec.ts`                                                                                                                                                                                       |
| Performance        | PERF-01..11 timing checks in e2e and `test/perf`                   | Windows CI                                                                                                                                                                                                          |
| Install / upgrade  | install, uninstall, Credential Manager checks (PR #97, not merged) | `test/windows/*`; **upgrade (old build → new build, data kept) not built**                                                                                                                                          |
| Mutation           | Stryker on 4 files at 72% (PR #101, not merged)                    | `pnpm test:mutation` on that branch                                                                                                                                                                                 |
| Smoke              | first-run journey J01-J02 with real Claude on every main merge     | real-ai-e2e.yml                                                                                                                                                                                                     |
| Regression         | the full suite on every PR and main merge                          | `.github/workflows/ci.yml`                                                                                                                                                                                          |
| Usability / UX     | **not done**                                                       | needs real people; meanwhile AI heuristic review vs the Blueprint                                                                                                                                                   |

## What to test next (in this order)

1. Judge the latest finished real-AI run on main (`real-ai/<sha>-claude` on `evidence`) feature by feature, and add rows to `real-ai-results.tsv`. Use the screenshot and reply text, not the `ok` flag.
2. Write BDD feature files for the real-user journeys: one `.feature` per spec journey (J1..J22), every scenario tagged with its AT id, mapped to `features.tsv`.
3. Extend the AI eval set beyond the 32 promptfoo asks: routing, plan quality, tone, safety, bad or unknown AI output, Hinglish, Hindi and Punjabi inputs. Every case names the AT id it proves.
4. Motion checks for the 13 motion rules marked missing.
5. Upgrade test: install the previous release build, create chats, memory and a running job, install the new build over it, check everything is kept.
6. App-wide mutation testing (beyond the 4 files in #101).

The owners already working on parts of this (do not duplicate): real-AI journeys (journey kit, `test/real-pc/`), the test stack PR #97 (judge, axe, chaos, Windows checks), safety checks PR #101 (mutation, spec-coverage guard), pipeline tools PR #102 (nightly pass^3, spend cap).

## Rules for Codex

- The repo is **public**. No secrets, keys, personal names, emails or phone numbers in any file. Use example.com and fake numbers.
- Real-AI runs use your own key in your own environment. Never add a key to the repo or to a workflow.
- Work on a branch named `codex/<topic>-<date>` and open a draft PR. Never push to `main`. Nothing merges without Claude's review.
- Do not edit `spec/` or `golden/`, and do not skip, mask, or loosen any test. Those need a CR (`docs/cr/`).
- Every source file you add opens with its spec section (lint rule `foo/spec-header`). UI words only through `t(key)`, test ids only from `TID`.
- Before pushing, run: `pnpm spec:verify && pnpm check:copy && pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build && pnpm trace:check`.

## How to report back

Write `docs/testing/results/codex-<yyyy-mm-dd>.md` on your branch with, for each feature you tested:

```
| Feature | Test type | Result (pass/fail/wrong/blocked) | Build sha | Evidence (link to a log, screenshot or CI run) | Note |
```

Also add your judged real-AI rows to `real-ai-results.tsv` and re-run `build_matrix.py`. Claude checks every claimed pass against its evidence before the matrix counts it.

## Log

| When (IST)       | Who    | What changed                                                                                                                      |
| ---------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-21 23:50 | Claude | Matrix, generator, results ledger and this handoff created. Main CI on dfe22cf still running; no real-AI run on current main yet. |
