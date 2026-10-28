### Bug fix

**Reproduce first. Every shipped line traces to evidence.** Source: pstack `bug-fix` + `tdd`.

1. **Reproduce it yourself** in the real app with a foo-verify journey (`test/verify/bug-<slug>.journey.ts`) that fails on the bug. Ask Vikas only with a stated reason the app cannot reach it, after driving it as far as it goes. If it will not reproduce, tighten conditions (seed, clock, fake AI script, window size) until it does.
2. **Find the cause by elimination.** List the candidate causes, then rule them out with runtime evidence (logs, the fake AI's turns, DB rows, `git log -S`) until one survives. Do not guess; "might help" changes do not ship.
3. **Failing test first** when there is a cheap seam (unit or E2E), committed before the fix so history shows red then green. Skip only when the test would be brittle mocks, and say so.
4. **Lock the tests** before touching the fix: `echo <bug id> > .claude/fix.lock`. While it exists, the `.claude/hooks/locked-checks.mjs` hook refuses any edit, write, delete or move under `test/`, `golden/` and `stryker.config.json`, and the lock file itself. If the test is wrong, stop and tell the lead; only the lead removes the lock.
5. **Fix the root cause** (`principle-fix-root-causes`), the smallest change the evidence justifies. No symptom guards.
6. **Verify on the same journey:** before FAIL, after PASS (`foo-verify` §4). "Inconclusive" is not a pass.
7. **Red first in the gate:** put `Red-first: <gate journey file name>` in the fix commit's message. When it reaches main, the release gate builds the commit before the fix, runs that journey once with real Claude, and is red unless that run fails.
8. If this kind of bug happened before, run `foo-correct`.

**Reply:** what was broken, root cause, fix, proof: the failing-then-passing output pasted verbatim and the before/after proof block.
