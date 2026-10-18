---
name: foo-correct
description: Turn a builder mistake that keeps coming back in foo-agent into something the repo enforces (structure, a type, a foo eslint rule, a CI check, a test) before any prompt text. Use when a reviewer, checker or Vikas corrects the same kind of mistake a second time.
---

# foo-correct (the correction ladder)

Adapted for foo-agent from pstack `correct` (MIT, Lauren Tan; see `.claude/skills/NOTICE.md`).

Assume every builder is an agent that sees only the files it opened, copies the nearest example, and takes the shortest path that compiles. A rule that lives only in a brief is forgotten by the next fresh session. So a mistake that happened **twice** gets fixed in the repo, at the highest rung that works:

| Rung | What it looks like in foo-agent | Examples already here |
| --- | --- | --- |
| 1. Structure | one owner per piece of state, one supported way, the wrong import fails | `TID` registry (`src/shared/testids.ts`), copy keys (`src/shared/copy/en-IN.json` via `t()`), tokens (`design/tokens.json` → generated) |
| 2. Types | the bad state cannot be written | `src/shared/types.ts` unions (`JobState`, `ChatPill`), `FooTestBridge` |
| 3. Lint or CI check whose error names the fix | `eslint-rules/index.js`, `scripts/*.ts` run by `ci.yml` | `foo/no-literal-copy`, `foo/testid-from-registry`, `foo/no-raw-design-values`, `foo/spec-header`; `fid-guard` (FID-02/06/19), `trace-check` (FID-18), `check-copy`, `spec-verify` |
| 4. Test of the behaviour | vitest or E2E that fails when the behaviour breaks, not when internals move | `test/unit`, `test/e2e`, `test/articles` |
| 5. Words (last) | a line in `CLAUDE.md` or `docs/build-method.md`, only for judgement calls | the build method itself |

## Steps

1. **Find the class.** Read the correction, recent review comments, reverts and `implementation-notes.md`. Name the class in one line ("builders hand-type copy in tests"). It counts once it has happened twice.
2. **Pick the highest rung that works** and say why the rungs above it do not.
3. **Prove the check bites.** Re-create the real past mistake (or check out the commit that had it) and show the new rule failing on it, then passing on the fix. Paste both outputs in the PR. A check that was never seen failing is a wish.
4. **Same command locally and in CI.** New lint rules go in `eslint-rules/index.js` and are switched on in `eslint.config.mjs`; new scripts get a `ci.yml` step in the fast lane. If the pattern is already common, fail only on new occurrences.
5. **Exceptions** sit on the line, with the reason and the CR or decision id that allows it.
6. **Update the rule table** in `CLAUDE.md` ("Rules and what enforces them"): the rule, and the rung that enforces it. A rule that was already in the table with nothing enforcing it is a repeat: move it up a rung in this same change. Drop a row once its mistake can no longer happen.

## Limits

- Spec and golden files never change in a correction PR without a CR (FID-02). If the "mistake" is really a spec gap, it goes to `docs/cr/`, not into a rule.
- One class per commit. Keep correction PRs separate from milestone code unless the milestone's own builder made the mistake.

**Reply:** each class, its evidence (links to the two corrections), the rung picked and why the higher rungs did not work, and the failing-then-passing output.
