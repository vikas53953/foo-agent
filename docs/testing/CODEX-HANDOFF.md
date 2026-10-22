# Testing handoff: Claude ↔ Codex

Shared notes for any agent (Claude or Codex) working on proving foo's 190-feature inventory (including three not-built rows). Read this file first, then `coverage-matrix.md`. Update both before you stop.

## Where things stand

The live numbers are in `coverage-matrix.md` (generated) and on the coverage page. To regenerate after any change:

```bash
python3 docs/testing/build_matrix.py
```

Inputs you may edit by hand:

| File                               | What it holds                                                                                                                    |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `docs/testing/features.tsv`        | 190 features (milestone, spec id, journey, acceptance text, built state)                                                         |
| `docs/testing/real-ai-results.tsv` | one row per judged real-AI result: id, result (pass/fail/wrong/partial/blocked/unclear), build sha, journey, evidence link, note |
| `docs/testing/suite-status.tsv`    | facts that decide many cells: main CI state and sha, unmerged test PRs                                                           |
| `docs/testing/lane-coverage.tsv`   | explicit feature/test mappings pinned to lane commits; can fill missing cells as partial only, never prove acceptance            |
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

## Historical backlog (subject to the current runbook)

The 22 October user runbook controls this backlog: current-main judgment first; no local full suite; Lane A only its eight prescribed journeys; no paused milestone code; no installer packaging or eight-hour soak. The strict matrix now has 126 missing real-AI rows because metadata-only references no longer count. The 62 n/a proposals are unapproved and do not alter scoring.

Every feature gets a score per test type, and an overall score: **works / works but wrong vs design / broken / not built**. "Wrong vs design" is judged against the Blueprint, the UX walkthrough and the golden pictures in `golden/`.

1. **Real-AI journeys, judge.** Judge the latest finished real-AI run on main (`real-ai/<sha>-claude` on branch `evidence`) feature by feature. Use the reply text and the screenshot, not the `ok` flag. Add rows to `real-ai-results.tsv`.
2. **Real-AI journeys, write the missing ones.** 73 features have no journey at all (filter `real_ai = missing` in `coverage-matrix.tsv`). Add journeys to `test/real-pc/journeys/` the way a non-technical user would use foo: messy typing, typos, wrong inputs, Hinglish, Hindi and Punjabi. Every step names its AT id.
3. **BDD.** One `.feature` file per spec journey (J1..J22) in Given/When/Then, every scenario tagged with its AT id and taken from `features.tsv`. Run them with playwright-bdd (compare it with cucumber-js first, see the research rule below).
4. **AI eval.** Go beyond the 32 promptfoo asks in #97. Add a second framework next to promptfoo (DeepEval or similar; compare at least 3 options first). Cover routing, plan quality, tone, honesty about what foo can't do, safety (cards, OTPs, passwords, big payments), bad or unknown AI output, a slow or old AI CLI, and Hinglish, Hindi and Punjabi inputs. Every case names the AT id it proves.
5. **Visual regression with real AI.** Today's picture checks use the pretend AI. Compare real-AI screenshots from the evidence branch against `golden/` and the Blueprint, and list every difference.
6. **Animation and motion.** Add checks for the 13 motion rules marked missing (AT-300..327 range: springs, fades, shimmer, face blink and bob, reduced motion at Basic and Off).
7. **Accessibility.** Beyond the axe sweep in #97: keyboard-only use of every screen, focus order, Narrator labels, high contrast, zoom at 200%.
8. **Performance.** Every time or size limit in the spec (filter `perf` in the matrix), measured on Windows with real AI as well as the pretend AI: startup, first reply, typing lag, chat switch, a long chat, memory use over an hour.
9. **Install and upgrade.** Install, first run, uninstall, Credential Manager, tray and notifications on Windows. Upgrade: install the previous release build, create chats, memory, a routine and a running job, install the new build over it, then check that everything is kept and the job resumes.
10. **Mutation.** App-wide Stryker (beyond the 4 files in #101). Report the score per area and the surviving mutants that matter.
11. **Smoke.** Keep the first-run smoke journey. Propose a 5-minute smoke set covering start, find AI, first chat, one job and one card.
12. **Regression.** Every bug found becomes a test that would have caught it (project testing rule 10).
13. **Usability and UX.** (a) An AI heuristic review of every screen against the Blueprint and Nielsen's 10 heuristics, with screenshots. (b) A short script for real people: 5 tasks, what to watch for, and 3 questions afterwards. the owner or testers run it; never ask the owner to run tests.
14. **Spec map.** Every spec screen and feature maps to a built screen plus a test, or CI fails (the guard in #101). List any gaps you find.

15. **App-wide checks for an AI-built, AI-using app** (`app-wide.tsv`): prompt-injection red team first (email, paste, files and AI pages, against real Claude; build on `test/articles/ART-injection.test.ts`), then wire-up audit, unused code and dependency check, security scan, cost per journey, privacy capture on real AI, an 8-hour soak, and chaos during real-AI jobs. Do not duplicate PR #97 (chaos), #101 (coverage guard, mutation) or #102 (pass^3, spend cap).

Every angle, every time: UI against the design, the UX of the whole journey, every frontend state (empty, loading, error, each button), the backend and engine (jobs, data, restart and crash recovery, speed), bad AI output (invalid, unknown, slow, an old AI CLI), and Windows (installer, keychain, tray, notifications). Never ask the owner to tap, click or run anything.

Research rule: before you pick a tool, compare the options with evidence (at least 3), and write the comparison in your results file.

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

Latest lead closeout: main `0d04a9f9105e42aef0b4a22238285a9007635c3e` has green CI and judged run33. Six complete AT criteria are proven by this real-AI run; partial widget rendering is not full feature acceptance. See [today's daily file](results/codex-daily-2026-10-22.md) and [run33 findings](results/run33-0d04a9f-findings.md). Inventory provenance: PR #114 head `a676e2ea91e62f7cb007a7b865423598ebf0ce0e`; main itself has no testing matrix. Prior log entries remain historical.

| When (IST)       | Who        | What changed                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-21 23:50 | Claude     | Matrix, generator, results ledger and this handoff created. Main CI on dfe22cf still running; no real-AI run on current main yet.                                                                                                                                                                                                                                                                                                       |
| 2026-10-22 02:28 | Codex lead | Collected all seven lane reports and draft PRs; appended judged AI rows, updated app-wide checks and regenerated the matrix with strict provenance and pinned partial coverage. Latest main moved again, so zero new proven cells at closeout. Next: review the seven drafts and shared BDD CI wiring, then judge latest-main CI and real-AI evidence; run the explicitly blocked native Windows, soak, network and real-person checks. |
| 2026-10-22 07:48 | Codex lead | Confirmed final draft PR #138 after the host pause; refreshed latest-main snapshot to d0b885a0ae324905b8509222b57b521cac7d2330 with both runs incomplete. All eight PRs remain draft. Retained the earlier receipts and repeated publication checks; zero new proven cells.                                                                                                                                                             |
| 2026-10-22 07:54 | Codex lead | Final freshness check: main is 0d04a9f9105e42aef0b4a22238285a9007635c3e; CI is in progress and real-AI is pending. Matrix remains zero proven; no older pass is carried forward.                                                                                                                                                                                                                                                        |
| 2026-10-22 09:16 | Codex      | Judged all 54 run33 journeys/302 PNGs; restored 190 inventory with explicit PR114 provenance; excluded metadata-only coverage; retained historical receipts. Source run30 → current run33: real AI proven 14→6, partial 67→45, fail/wrong 11→10, missing 95→126, not built 3→3; code tests 175→176. Lead starting 160-row matrix had zero current-main proven. Matrix regression tests 8/8; n/a62 remains proposal only.                |
