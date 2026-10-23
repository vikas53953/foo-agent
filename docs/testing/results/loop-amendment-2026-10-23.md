# Codex: amendment to your running loop (from Claude, 23 Oct 2026, 11:00 IST)

This AMENDS your current loop and the master prompt (`/mnt/project-files/foo/coverage/codex-master-prompt.md`). It does
not replace them. Still in force: §2 rules, §2.3 reserved-for-Vikas, §3 evidence rule, §11.2 Way 1, the daily file,
the 26 Oct stop date. Where this message and the old text differ, this message wins.

## Why we are changing it (read once)

In 2 days the number that counts, "features proven with real AI on main", went 0 → 6 → 4 and has been 4 of 190 for
27 hours. Main is still `0d04a9f`. Your work is careful, but it cannot raise that number, because:

1. Every run tests a branch, and only main counts (§3). Nothing of yours has reached main.
2. 57 commits on `codex/evidence-audit-2026-10-22`: 32 docs-only, 2 touch `src/` (6 lines). One product fix (#139).
3. Journey files and the driver changed between runs 42 and 43 with the same app code; clean journeys fell 42 → 26.
   A moving ruler means nobody can see progress.
4. Each loop runs all 62 journeys and reviews 450+ screenshots. One fix takes 2 to 3 hours to judge.

New goal: **raise "proven on main" by 10 features a day.** You do that by fixing, proving small, and handing over
PRs that someone else merges at 21:00 IST. The merge starts the full real-AI run on main by itself (push trigger in
`real-ai-e2e.yml`). That run is the scoreboard.

## Step 0, today, in this order (about 2 hours)

1. **Start no new full run.** Let run 39897913189 (branch 819c781) finish. Do NOT review its screenshots. Record
   only its strict clean count with the script in Step 3d, one line in the status file, marked "branch, not counted".
2. **Judge the three focused runs** already started: 39900827513 (#139, J07/R1), 39901848029 (B02), 39901998316
   (J05/B14). Use Step 3d. Write each result as a fix-queue row (Step 1).
3. **Freeze the ruler.** Make the ruler PR (Step 2). This is the only full branch run you may start today.
4. **Split #138.** Every app fix on #138 moves to its own branch off main (Step 3a). #138 keeps only docs, the
   matrix and the two new files below. Do not close #138.
5. **Seed the fix queue** (Step 1) with the items in the table below, then start Step 3 on the top APP item.

## Step 1. The fix queue: `docs/testing/fix-queue.tsv` (lead branch #138 only)

Columns, tab-separated, one row per problem (not per feature):

```
rank	class	problem	journeys	features	fix_branch	pr	run1	run2	run3	passes	note
```

- `class` is exactly one of: `APP` (foo is wrong), `TEST` (journey or driver is wrong), `BLOCKED` (site, captcha or
  account outside foo), `NOTBUILT`, `VIKAS` (needs his decision).
- `features` = the AT ids this one fix would turn proven. Rank by that count, biggest first. Ties: P0 first.
- `passes` = `yes` only when all 3 focused runs pass Step 3d. Otherwise `no` or empty. Never "pending" for more than
  one loop.

Seed rows (you fill `features` from `docs/testing/features.tsv` and `real-ai-results.tsv`):

| class                      | problem                                                                    | journeys                                             | evidence                      |
| -------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------- |
| APP                        | web job ends `job.stuck.budget`, never gives sources                       | J05-web B03-web-local B07-live B14-restart-mid-reply | run33 findings, run 43 s0 J05 |
| APP                        | empty Claude terminal result drops the streamed answer                     | J07-chat R1-rich                                     | draft #139                    |
| APP                        | choice asked as prose, no Choice card; Something else → `PROTOCOL_INVALID` | J08-choice U12-choice-variants B02-choice            | run33 findings                |
| TEST or APP (triage first) | R-approvals 35–42 failed steps, R-jobs 38–40                               | R-approvals R-jobs                                   | fix-mode-baseline.md          |
| TEST or APP (triage first) | R-kit-2 21–29 failed steps, R-ai-pages 17                                  | R-kit-2 R-ai-pages                                   | fix-mode-baseline.md          |
| TEST                       | a journey inherits the last journey's job or card                          | U09-plan-checklist J15-helper B05-restart            | review39842693012 s0/s1       |
| BLOCKED                    | Booking.com captcha, sites 403 on CI                                       | J09-J18-booking J10-hotel                            | run33 findings                |
| BLOCKED                    | no Gmail account on CI                                                     | J12-draft                                            | run33 findings                |
| VIKAS                      | AT-027 red heart vs thumbs-up                                              | B01-chat-rules U02-reactions-thanks                  | already asked 22 Oct          |
| NOTBUILT                   | AT-040, GAP-17.1, GAP-6.2                                                  | none                                                 | coverage-matrix.md            |

Triage rule for "TEST or APP": open the failing step's screenshot and `thread.json`. If a real user would see foo
do the wrong thing, it is `APP`. If foo did the right thing and the driver looked for the wrong `tid`, text or
timing, it is `TEST`. Write the one-line reason in `note`.

## Step 2. The ruler PR (once, today)

The test kit is frozen after this PR. Any later kit change is a new ruler PR, never part of a fix PR.

```bash
git fetch origin main codex/evidence-audit-2026-10-22
git switch -c codex/ruler-v1 origin/main
git checkout origin/codex/evidence-audit-2026-10-22 -- test/real-pc test/unit/real-pc-driver.test.ts \
  test/unit/real-pc-journeys.test.ts test/unit/real-pc-settle.test.ts
git status        # only test/real-pc/** and those 3 test files may be changed; anything else: git restore it
pnpm vitest run test/unit/real-pc-driver.test.ts test/unit/real-pc-journeys.test.ts test/unit/real-pc-settle.test.ts
# then the full gate from CLAUDE.md "Before every push", every command must exit 0
git commit -m "test(real-pc): ruler v1, kit fixes from #138" -m "Fidelity-CR: none"
git push -u origin codex/ruler-v1
gh pr create --draft --base main --head codex/ruler-v1 --title "Real-PC kit: ruler v1"
gh workflow run real-ai-e2e.yml --ref codex/ruler-v1 -f ref=codex/ruler-v1 -f journeys=all \
  -f max_journeys=80 -f shards=4 -f ai=claude -f model=claude-sonnet-5-5
```

This branch has main's app code and the new kit, so it is a fair old-vs-new test: old kit on the same app = run
39710797010 (run 33, main 0d04a9f). In the PR body, write one table: journey | run 33 result | ruler-v1 result |
why it changed (`driver fix`, `stricter check`, `flaky`). Every journey that got worse needs a reason. Mark the PR
ready when that table is complete and CI is green.

Done-check: the PR exists, is ready, its diff touches only `test/real-pc/**` and the 3 test files, and every
journey whose result changed has a reason. If any row has no reason, the step is not done.

## Step 3. The fix loop (repeat all day, top APP row first)

**3a. Branch off main, never off #138.**

```bash
git fetch origin main
git switch -c codex/fix-<short-name> origin/main
```

**3b. Red test first.** Write a unit, integration or pretend-AI e2e test that fails for this bug.

```bash
pnpm vitest run <your test file>      # MUST fail; paste the failing line into the PR body
git commit -m "test: red for <bug>" -m "Fidelity-CR: none"
```

**3c. Fix.** Smallest change in `src/`. Then the test passes, then the full gate from CLAUDE.md, every command
exit 0. Do not edit `test/real-pc/**` in a fix PR. Push, open a draft PR against main.

**3d. Prove with 3 focused real-AI runs.** Only the journeys in the fix-queue row. Ids exactly as in
`test/real-pc/journeys.txt`. Do not list `J01-J02-first-run`; it always runs first.

```bash
gh workflow run real-ai-e2e.yml --ref codex/fix-<short-name> -f ref=codex/fix-<short-name> \
  -f journeys="<id> <id>" -f max_journeys=10 -f shards=1 -f ai=claude -f model=claude-sonnet-5-5
gh run list --workflow real-ai-e2e.yml --limit 3      # run id
gh run watch <run-id>
```

Start run 2 only after run 1 finishes, and run 3 after run 2. The workflow keeps only one pending run per branch,
so starting 3 at once silently drops one.

Judge each run (strict, the same rule as fix-mode-baseline.md):

```bash
git fetch origin evidence
SHA=<first 7 of the tested commit>
git ls-tree -d --name-only origin/evidence real-ai/$SHA-claude/s0/ | grep -v J01-J02
for d in <each journey folder>; do
  git show origin/evidence:$d/log.jsonl | python3 -c "import sys,json; r=[json.loads(l) for l in sys.stdin if l.strip()]; \
bad=[x for x in r if isinstance(x.get('i'),int) and 'step' not in x and x.get('ok') is False]; print('$d', 'CLEAN' if not bad else 'FAIL', [x['i'] for x in bad])"
done
```

A journey passes only if it is CLEAN **and** you opened every PNG of it and the thing the AT asks for is on screen
(the `tid` from `src/shared/testids.ts`, the right reply, the card). Write in the fix-queue row: the 3 run links and
`passes: yes` only if all 3 pass. 2 of 3 = `no`, note "flaky", and the item stays at the top.

**3e. Hand over.** When `passes: yes` and CI is green: mark the PR ready (Windows CI runs then). Its body has: the
fix-queue row, the red test line, the 3 run links, one screenshot link per journey. Someone else merges it at
21:00 IST. You never merge.

**3f.** Next row. If one row fails 3 fix attempts, set its note "stuck: <why>", put it under "Needs Vikas" only if it
needs his decision, otherwise move to the next row.

## Step 4. Every morning after a main run

When a merge has started the real-AI run on main and it has finished:

1. Judge every journey of that run with Step 3d (this is the only run where you open all screenshots).
2. Add the `real-ai-results.tsv` rows, run `python3 docs/testing/build_matrix.py`.
3. Add one row to `docs/testing/burndown.tsv`:

```
date_ist	main_sha	main_run	proven	partial	fail	no_journey	prs_merged	prs_ready	delta	stuck_because
```

4. If `delta` < 5 on a day that had merges: start no new fix. Write `stuck_because` (one line, with evidence), and
   put it first in the status file. That is the alarm.

## Step 5. Status file: max 25 lines

Replace the long `docs/testing/results/codex-status.md` each loop with: proven on main (number + run link), the
burn-down row, top 5 fix-queue rows, PRs ready to merge (links), Needs Vikas, Could not do and why. Older text goes
to `history/`. One docs commit per loop, no more.

## Paused until told otherwise

Lanes B (BDD), C (AI eval / CR-0052), E (soak, observer), F (mutation), new Group R journeys, and the native
Windows lane except for `BLOCKED` rows. Leave their PRs open and untouched.

## Forbidden (each one stops the task)

- A full real-AI run on any branch except the one ruler-v1 run.
- Editing `test/real-pc/**` inside a fix PR, or changing a journey so it passes.
- Calling anything "proven" from a branch run, a green workflow, `ok: true`, or a summary file alone.
- Skipping, weakening, `.only`, thresholds, waivers, known-red entries.
- Stacking a fix on #138 or on another fix branch.
- Merging, approving, closing PRs, or re-running a run to make it green.
- Writing the key anywhere; personal data in test text.

## Stop and ask (write under "Needs Vikas" in the daily file, then keep going with the next row)

- A fix needs a spec change (that is a CR, Vikas decides).
- A row needs an account or site access CI cannot have.
- The workflow refuses to start (403 or skipped) twice.

## Done-check for the day (your work fails it if any line is false)

- [ ] `fix-queue.tsv` exists, ranked, every row has a class.
- [ ] The ruler PR is ready with its old-vs-new table.
- [ ] At least 3 fix PRs are ready, each with 3 focused run links and `passes: yes`.
- [ ] No full branch run other than ruler-v1 was started.
- [ ] The status file is 25 lines or fewer.
- [ ] Every claim in the status file has a link.
