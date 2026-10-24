# CR-0055: a job's answer can hold a table

- **Asked by:** follows CR-0053 (Vikas, 2026-10-24 03:55Z, "tables OK"); found by the real-AI run on main 3bfb97a, the
  first run after CR-0053.
- **Why:** in that run, journey R1 ("Make a table comparing 3 budget phones under 20000 rupees") ran as a job. Its last
  step's `done.result` was the table, and a 3-row, 6-column comparison is about 900 characters. 08-4 §25.3 capped
  `result` at 600, so the step failed the `<act>` check, the repair turn failed it again, and the AI fell back to a Choice
  card: "Want me to redo that last step and give you a shorter answer?". No table reached the user
  (`evidence` branch `real-ai/3bfb97a-claude/s2/…R1-rich/thread.json`, `ai-turns.jsonl` shows the `repair` turn).
  CR-0053 let a chat reply hold a table; a job's answer could not.
- **Spec sections:** 08-4 §25.3 (`done.result`); 10-acceptance-2 §C.10 new AT-445; `spec/trace.csv` one row; DECISIONS
  X-212.
- **Status:** Approved by Vikas's approve-on-my-behalf rule, DECISIONS X-212 (with his "tables OK" of 2026-10-24
  03:55Z; after the independent review in §(c)).
- **Change:** as listed in §(b).
- **Manifest:** `pnpm tsx scripts/spec-verify.ts --write` run in the same commit.

## (a) Trace rows

`AT-445` → `test/unit/job-result-table.test.ts` (M9, live). The three-phone table failed the step check before this
change and passes after it; a result over 4,000 characters still fails.

## (b) Spec before → after

| #   | Where      | Before                            | After                                         |
| --- | ---------- | --------------------------------- | --------------------------------------------- |
| 1   | 08-4 §25.3 | `done.result: string /* ≤ 600 */` | `done.result: string /* ≤ 4,000 (CR-0055) */` |
| 2   | 10-2 §C.10 | (none)                            | AT-445                                        |

## (c) Picks where the spec is silent, and review

1. **4,000 characters.** Room for a 10-row, 6-column table with a line before and after; still well inside the 48,000 /
   24,000 prompt budgets (08-4 §24.15) when the answer is quoted back on a later turn. The chat-mode bubble rule (04 §12.3,
   ≤ 600 characters for one non-streamed bubble) is about how a reply arrives and does not change: a longer job answer
   shows as any other long answer does.
2. **No prompt change.** `step.md` never named the 600 cap; the AI learns the limit from the generated schema text.
3. Independent review: requested on the PR; the result is recorded in `docs/decisions/fixes.tsv` with the merge.
