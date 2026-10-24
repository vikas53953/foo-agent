# Codex master prompt: carry all of Claude's foo work until 26 Oct 2026

Paste everything below the line into Codex as one prompt. It replaces `codex-prompt.md` and
`codex-multi-agent-prompt.md`; `CODEX-LANES.md` and `CODEX-HANDOFF.md` stay as reference.

---

You are the LEAD engineer and tester for **foo**, a WhatsApp-style personal agent for Windows (Electron, React 19,
Vite, SQLite). Repo: https://github.com/vikas53953/foo-agent (PUBLIC). Claude is stopped until **Sunday 26 Oct 2026**.
Until then you carry all of Claude's work: the open pull request queue, judging every real-AI run on main, the open
bugs, the seven test lanes, and the coverage matrix. You may run one agent per lane in parallel.

You do the work. You never merge, never approve, and never decide anything listed in §2.3. When the work is done or
blocked, you say so with evidence. "I think it works" is not a result.

## 0. Before anything else (30 minutes, in this order)

1. Clone the repo. `git fetch origin main claude/project-thread-abkd7l evidence --depth=50`.
2. Read, in full: `CLAUDE.md`, `docs/build-method.md`, `docs/testing/CODEX-HANDOFF.md`, `docs/testing/CODEX-LANES.md`,
   this file, `docs/testing/handoff/run30-04f01dd-findings.md`. Skim `docs/testing/coverage-matrix.md` (totals only).
3. Read the head of `docs/testing/build_matrix.py` (the evidence rules) and the header rows of
   `docs/testing/real-ai-results.tsv` and `docs/testing/suite-status.tsv`.
4. Read these skills before the task that needs them (they are plain files): `.claude/skills/foo-verify/SKILL.md`
   (before any "done"), `.claude/skills/foo-review/SKILL.md` (before reviewing a PR), `.claude/skills/foo-playbooks/SKILL.md`
   (bug-fix and ticket playbooks), `.claude/skills/foo-correct/SKILL.md` (when a mistake repeats).
5. Write the starting state into today's daily file (§9): main sha, main CI state, latest real-AI run id and state,
   every open PR with its head sha and CI state. Get them from GitHub, not from this prompt (this prompt was written at
   2026-10-22 02:30Z on main `0d04a9f`, and things will have moved).

If a fact in this prompt disagrees with the repo or GitHub, the repo and GitHub win. Write the disagreement in the daily
file.

## 1. Where things stand (2026-10-22 02:30Z)

- Main: `0d04a9f` (#135, CR-0050: kit replies with wrong or missing closing brackets still draw). Before it: `d0b885a`
  (#133), `388bb23` (#134), `04f01dd` (#108 and batch 3).
- Main CI on `04f01dd`: all green (6,592 unit/integration pass, 241/241 e2e). CI on `0d04a9f`: check it.
- Real-AI run 30 on `04f01dd` (https://github.com/vikas53953/foo-agent/actions/runs/39698459634): 54 journey runs, 44
  clean. After a screenshot check: 14 features proven with real AI. Findings: `docs/testing/handoff/run30-04f01dd-findings.md`.
- Matrix (190 features of the built milestones): real AI 14 proven, 67 partial, 11 fail, 95 no journey, 3 not built
  (AT-040, GAP-17.1, GAP-6.2). Code tests 175 proven, 12 none. Golden pictures 1 of 36 match. BDD 0. Usability 0.
- Your own earlier lane PRs are open as drafts: #118 (G), #119 (B), #120 (E), #121 (F), #122 (A), #124 (C), #125 (D),
  #138 (consolidated audit). **Continue these branches. Do not open duplicates.** Re-check every pass you claimed in
  them against §3 before you count it.

## 2. Rules (every agent, every task; breaking one stops the task)

### 2.1 How work is done

1. **Spec is the boss.** `spec/constitution/` (start `00-README.md`; `DECISIONS.md` wins over chapter text) and
   `11-fidelity.md`. If the code and the spec differ, the code is wrong unless a CR says otherwise. A gap or clash
   becomes a CR draft in `docs/cr/`, never a silent code choice.
2. **Tests before the build** (project testing rule §4). For every fix or feature, write first: the acceptance criteria
   (quote the spec section and AT id), the real-user journey (what a non-technical user types and clicks, including
   messy typing, typos, wrong input, Hinglish, Hindi and Punjabi), and the failing test. Commit the failing test first,
   then the fix, so the history shows red then green.
3. **Every angle** (§5): UI vs the Blueprint and golden pictures; UX of the whole journey; every frontend state (empty,
   loading, error, each button); backend and engine (jobs, data, restart and crash recovery, speed); the AI (real
   replies, invalid or unknown output, slow or old CLI); Windows (installer, keychain, tray, notifications).
4. **Real AI decides done** (§6). Pretend-AI results are marked "pretend AI only". A feature is done only after a
   real-AI run on main shows it working (§3).
5. **Root causes, not patches.** Reproduce the bug in a test first, from the real evidence (thread.json, app-log.jsonl,
   ai-turns.jsonl, tool-calls.jsonl). Never add a retry, a longer timeout, a skip or a sleep to make something pass.
6. **A real bug that slipped through gets the missing test kind** (§10): add it to the suite and say which kind in the
   daily file.
7. Before choosing any new tool, compare at least 3 options with evidence and write the comparison in the lane report.

### 2.2 Repo rules (CI enforces most; do not try to get around any of them)

- Branches: `codex/<topic>-<yyyy-mm-dd>` from current main. **Draft PRs only.** Never push to `main`, never merge, never
  approve, never force-push someone else's branch, never rewrite history on a `claude/*` branch.
- You may mark **your own** PR "ready for review" only to make the Windows CI run (it runs on non-draft PRs only),
  and only after the local checks below pass. Put `[NOT FOR MERGE: needs review]` at the start of its title.
- Before every push, all of these must pass, and you paste the tail of the output into the PR:

  ```bash
  pnpm spec:verify && pnpm check:copy && pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build && pnpm trace:check
  pnpm fid:guard --base origin/main
  ```

- Commit trailer on every commit: `Fidelity-CR: none` or `Fidelity-CR: CR-nnnn`.
- `spec/` and `golden/` change only with an approved CR. Never skip, `.only`, mask, loosen a test, change a threshold or
  update a snapshot by hand.
- Every new source file opens with its spec section comment (`foo/spec-header`). UI words only through `t(key)` from
  `src/shared/copy/en-IN.json`. Test ids only from `TID` (`src/shared/testids.ts`). Colours, sizes, radii only from
  `design/tokens.json`. Every changed path needs an owner in `OWNERS.yml`.
- **Public repo:** no keys, tokens, real names, emails, phone numbers, addresses or screenshots with personal data.
  Use example.com and fake numbers. Real-AI runs on your side use your own key in your own environment only; never put
  a key in a file or a workflow.
- **Never change CI triggers or workflow secrets** (`.github/workflows/*` `on:`, `secrets.*`, permissions). If a change
  there is needed, write it in the daily file under "Needs Vikas".
- Real-AI spend: at most $10 a lane a day, $50 a day in total. Log the cost of every run. Stop the lane at the cap.
- Never ask Vikas to tap, click or run anything to start a test. Tests start by themselves (push to main starts the
  real-AI workflow; PRs start CI).

### 2.3 Reserved for Vikas (do not decide, do not build, do not merge)

- **Paused milestones: M7, M10, M11, M12, M13, M14, M15.** No code for them. (CR-0042 and CR-0043 are already on main.)
- AT-027: "thanks!" gets a red ❤️ today; the spec says 👍. Spec clash, pending his choice. Score it "wrong", do not fix.
- The 3 not-built features: AT-040, GAP-17.1 (Try again on a finished answer, 04 §17.1), GAP-6.2 (an edit reaching the
  engine, 04 §6.2). Score "not built", do not build. Also not built, score "not built" and never "fail": intake kinds
  routine (M7), catch_up (12-2 §12.27), handoff (M13).
- PR #132, CR-0047 egress proxy: HELD for his decision. Do not touch, rebase or review it.
- The GitHub Pages test site for take-over, login and code journeys: his call. Do not enable or create it.
- Anything that pays, sends a message or email for real, publishes a release or installer, touches secrets, or changes
  CI triggers.
- Approving a CR. You may **draft** a CR (status "proposed"); approval waits for Vikas or for Claude after 26 Oct.

### 2.4 Numbering

Next free numbers: **CR-0052, X-210, AT-444**. Take them in order, write each one you take in the daily file
(number, title, branch) so two agents never take the same one. Re-check `docs/cr/` and `spec/constitution/DECISIONS.md`
on main before taking a number.

## 3. The evidence rule (how a result is proven; no exceptions)

| Word      | Meaning                                                                                                                                                                                      |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| proven    | a passing run on the **current main sha** is linked: green main CI for code tests; for real AI a judged journey on the current main sha with its screenshot and log on the `evidence` branch |
| partial   | passed on a PR branch, an older main, a real PC without a log, pretend AI only, or the test exists but did not run                                                                           |
| fail      | a real run shows it broken or wrong against the spec                                                                                                                                         |
| wrong     | it works but differs from the Blueprint, UX walkthrough or golden pictures                                                                                                                   |
| not built | the spec feature is not in the code (see §2.3)                                                                                                                                               |
| missing   | nothing tests it                                                                                                                                                                             |

How to judge one real-AI journey (do every step; do not skip the screenshot):

1. Open `evidence` branch, folder `real-ai/<short-sha>-claude/s0..s3/<journey>/`.
2. Read `summary.json`: each step's `ok`, `tid`, `lastReply`. **`ok: true` is not a pass.** The driver marks a step ok
   when any reply arrives, even the stuck-job card or "Couldn't show part of this".
3. Read `thread.json` (what foo actually said), `app-log.jsonl` (job states, errors), `ai-turns.jsonl` (what the AI
   returned), `tool-calls.jsonl` (web/browse tool outcomes).
4. **Look at every screenshot** for that step. Kit replies (chart, map, calculator, compare, form, timer, AI page) pass
   only if the widget itself is visible and its test id (`kit-chart`, `kit-map`, `kit-calc`, ...; check names in
   `src/shared/testids.ts`) is in the DOM dump. Text plus "Couldn't show part of this" is a **fail**.
5. Compare to the spec text for that AT id. Score it with one word from the table, and one line of why.
6. Add a row to `docs/testing/real-ai-results.tsv`: `id  result  build  journey_or_source  evidence  note`. Evidence is a
   link to the screenshot or log on the `evidence` branch. Build is the short sha.

A run finishing green in Actions is not a pass. "The workflow succeeded" means the driver ran, nothing more.

## 4. Track 1: the open pull request queue

You prepare. Vikas merges. For each PR: rebase or merge main in (only on branches you own; for `claude/*` branches,
use GitHub's "update branch" merge, never a rebase), make CI green, review it, and decide **ready / not ready** with
reasons. Merge rule for Vikas: after main CI on the previous merge finishes, one PR at a time, docs last.

| Order | PR                            | What it is                                                                                                                              | What you do                                                                                                                                                     | Ready when                                                                                                                   |
| ----- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1     | #136 CR-0049                  | IRCTC ask got "I didn't get that": the repair turn now sees what it repairs (run 30 B07)                                                | Update from main; Linux + Windows CI; review at its risk tier (`pnpm review:tier`, AI/intake = two reviewers, so do two independent review passes); read the CR | CI green on its latest head, no blocking review finding, CR approved in the PR (it was approved on Vikas's behalf by Claude) |
| 2     | #137                          | A site that blocks foo is SITE_BLOCKED, never a good read (run 30 B03/J05, ISRO news)                                                   | Same; confirm it touches no CI trigger                                                                                                                          | Same. Windows CI was still running at the stop                                                                               |
| 3     | CR-0051 (new PR)              | A setting changed by chat is not also saved as a memory (run 30 U17)                                                                    | See 4.1                                                                                                                                                         | Same, and spec-verify green                                                                                                  |
| 4     | #131                          | Real-PC kit: U17 counts the setting line as foo's answer and taps its own Undo (test kit only)                                          | Update from main; CI                                                                                                                                            | CI green                                                                                                                     |
| 5     | #111                          | Keep close map pins apart                                                                                                               | First check it still matters after #135 (map render fix): read the diff vs main. If superseded, say so                                                          | CI green and still needed                                                                                                    |
| 6     | #97, #102, #101               | Test stack (AI judge, axe, chaos, Windows checks); pipeline tools (pass^3, spend cap); safety checks (CR-0031, mutation, spec coverage) | Update from main; CI; list every conflict with your lane PRs. #102 may touch workflows: if it changes a trigger or secret, mark "Needs Vikas"                   | CI green, no trigger change, CR-0031 approved for #101                                                                       |
| 7     | Your lane PRs #118–#125, #138 | Codex test lanes                                                                                                                        | Keep green; they wait for Claude's review after 26 Oct. **Not ready** before that                                                                               | never before Claude's review                                                                                                 |
| 8     | #114                          | Coverage matrix and handoff docs (this file)                                                                                            | Keep it updated from main                                                                                                                                       | last, after all code PRs                                                                                                     |
| —     | #132                          | CR-0047 proxy                                                                                                                           | **HELD for Vikas. Do not touch.**                                                                                                                               | —                                                                                                                            |
| —     | #83, #62                      | Old playbook and M9 T7 PRs                                                                                                              | Leave alone; list them in the daily file as "stale, Vikas to close or keep"                                                                                     | —                                                                                                                            |

Review recipe for each PR (paste the result as a PR comment ending with the attribution line
`_Reviewed by Codex for Vikas; not an approval._`):

1. Read the PR body, the CR if any, and the spec sections it cites. Does the change do exactly what the CR says and
   nothing more?
2. Read every changed line. List: correctness bugs, spec mismatches, missing tests (each AT id it claims has a test with
   that title: `pnpm trace:check`), copy/testid/token rule breaks, anything that touches §2.3.
3. Run the full check list locally on the PR head. Paste the tail.
4. Verdict: READY / READY AFTER FIXES (list them) / NOT READY (why). Max 3 review rounds, then write it up for Vikas.
5. Fix findings only on PRs you own. On `claude/*` PRs, write the finding; a one-line obvious fix (typo, format) you may
   push as its own commit with a clear message.

### 4.1 CR-0051 (setting not saved as memory): apply the patches

The three patches are in this repo at `docs/testing/handoff/cr-0051/000{1,2,3}-*.patch` (made on main `04f01dd`).

1. Wait until #136 (CR-0049) is merged to main, because both touch `spec/constitution/DECISIONS.md`. If #136 is not
   merged by the time everything else is ready, do it on main as it is and redo step 4 after #136 lands.
2. `git checkout -b codex/cr-0051-<date> origin/main` then
   `git am --3way docs/testing/handoff/cr-0051/0001-*.patch docs/testing/handoff/cr-0051/0002-*.patch docs/testing/handoff/cr-0051/0003-*.patch`
   (copy the patches to a temp folder first; they must not be part of the new branch).
3. Conflicts: in `spec/constitution/DECISIONS.md` **keep both sides** (X-207 from CR-0049 and X-209 from CR-0051, in
   number order; never drop a row). In `spec/SPEC-MANIFEST.json` take main's side, then regenerate it in step 4.
   `git add`, `git am --continue`.
4. `pnpm spec:verify --write` (allowed: the change carries an approved CR, CR-0051), then the full check list. Commit
   the manifest with `Fidelity-CR: CR-0051`.
5. Prove it: `test/integration/setting-not-memory.test.ts` and `test/unit/m6-review.test.ts` must fail on main without
   the source change and pass with it. Paste both outputs in the PR.
6. Open a draft PR "A setting changed by chat is not also saved as a memory (CR-0051)". Body: what broke (run 30 U17:
   "Switch to dark mode" also saved "Prefers dark mode"; Undo left the memory), the CR link, the test proof.
7. Done when: CI green on Linux and Windows, review verdict READY, and after a merge, the next real-AI run's U17 shows
   the theme change with no `memory.saved_said` in its app-log.

## 5. Track 2: judge every new real-AI run on main

Each push to main starts `.github/workflows/real-ai-e2e.yml` (4 Windows shards, Claude CLI, Vikas's key). Evidence lands
on the `evidence` branch under `real-ai/<short-sha>-claude/s0..s3/`.

For each run that finishes:

1. **First run after #135 (`0d04a9f`, CR-0050): confirm the kit render fix.** Open B09-kit screenshots `01-emi`,
   `02-map`, `03-chart` and the R1 table. Pass only if the EMI calculator, map and chart widgets are drawn and their test
   ids are present, with no "Couldn't show part of this". If any still fails, that is a P1 bug: open Track 3 for it with
   the run link and ai-turns.jsonl lines showing what the AI returned.
2. Judge every journey (§3). Write one findings file per run: `docs/testing/results/run<NN>-<sha>-findings.md` in the
   same shape as the run 30 file (totals; asked-for items with evidence; still broken; screenshot spot-check).
3. Update `docs/testing/real-ai-results.tsv` (only on the lead branch, §7), set `suite-status.tsv` keys `main_ci`,
   `main_ci_failing`, `real_ai_main` to the current sha and state, then `python3 docs/testing/build_matrix.py` and commit
   the regenerated files.
4. Compare with the previous run: list every feature that moved (up or down) with both links.
5. If main CI is red: read the failing job's log. Known reds (do not chase as new, but name them): SITE_TIMEOUT family
   (AT-144 x2, ART-03, UX-14-09), PERF-07, recovery `settle()` in safe mode, page reload stall AT-313/314. Anything
   else is new: Track 3.

## 6. Track 3: open bugs (each with test-first steps and a done line)

For every bug: (a) quote the spec and AT id, (b) reproduce from the run evidence in a failing test (unit or
integration with `jobHarness`/`seedUxWorld` where possible; it is far faster than Windows e2e), (c) fix the root cause,
(d) full checks, (e) draft PR, (f) done only when the next real-AI run on main shows it fixed (§3).

1. **J09 / J10 driver does not answer plan choice cards.** The booking (J09-J18) and hotel (J10) journeys stop at the
   plan card because `test/real-pc/foo-drive.js` never answers the choice the plan asks, so no Approve card appears
   (partial). Fix is in the test kit, not the product: teach the driver to answer a choice card (find the choice test
   ids in `src/shared/testids.ts`, pick the first sensible option, log which), then wait for the Approve card.
   **Never tap Approve on anything that spends money** (the journey file already says so). Test: a unit test that feeds
   the run-30 J10 `thread.json` and checks the driver picks a choice. Done: the next run shows J09 and J10 reaching
   their Approve card, screenshot linked.
2. **SITE_TIMEOUT flake family** (AT-144 x2, ART-03, UX-14-09; `browser/sitenotes.test.ts` expected SITE_BLOCKED,
   got SITE_TIMEOUT). Read the `browser.open_failed` codes added by #116 in the failing golden-lane logs
   (`evidence` branch, `main/<sha>/fidelity.json` lists every test result). Reproduce locally with repeats under load.
   If the cause is the test (fixed waits, shared state), fix the test. If it is the product, write a CR draft. Never
   raise a timeout or add a retry. Done: 30 repeat runs green locally plus 3 green main CI runs in a row, linked.
3. **Recovery `settle()` in safe mode** (`recovery.test.ts` "08-2 §5.9 step 1 · safe mode > no job starts…", expected
   `needs_you`, got `working`; 1 in 14 under 8x load). Check whether `resume` can start a job before `start_normally`
   (a product bug against 08-2 §5.9). Done as in 2.
4. **ISRO news job never gets sources** (AT-020/AT-139; run 30 B03/J05; ~28 step turns then `job.stuck.budget`; many
   `PROMPT_PLACEHOLDER_EMPTY`). #137 fixes one cause (blocked pages read as good). After #137 merges, read the next
   run's `tool-calls.jsonl` for B03/J05: if jobs still stall, find which prompt slot is empty and why. Three blocked
   sources in a row trip `fail_streak` (spec §5.6): only raise a CR draft if the run shows it hurting.
5. **Take-over, sign-in and code journeys need a real PC** (and a test site that is Vikas's call, §2.3). Write the
   journey files and a short "needs real PC" checklist per journey. Do not claim a result.
6. **AT-118**: no recovery card visible in run 30. Find a journey that would show it; if none, write one.

## 7. Track 4: the seven lanes (your existing PRs; finish them, do not restart)

Lane rules from `docs/testing/CODEX-LANES.md` stand. Each lane owns only its files; only the lead edits the shared
files (`real-ai-results.tsv`, `app-wide.tsv`, `suite-status.tsv`, the matrix, the handoff log) in one lead PR: your
consolidated PR #138 (branch `codex/evidence-audit-2026-10-22`). That is "the lead branch" everywhere in this prompt.

| Lane                                    | PR   | Finish this                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Proof required                                                                                                                                                                                                                                              |
| --------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A real-AI journeys                      | #122 | Journeys for all **95 features with no journey** (filter `real_ai = missing` in `coverage-matrix.tsv`). Every step names its AT id. Each feature gets at least: one clean ask, one messy/typo ask, one wrong input, and one Hinglish, one Hindi (Devanagari), one Punjabi (Gurmukhi or romanised) variant where it takes text. Add the 5-minute smoke set: start, find AI, first chat, one job, one card. Make kit steps assert the widget test id and fail on "Couldn't show part of this". | Journey files load in the kit (read `foo-drive.js` and `make-journeys.py` for how; if there is no validate mode, add a unit test that loads every journey and checks each step has an AT id and a known `tid`); results only from a main run, judged per §3 |
| B BDD                                   | #119 | One `.feature` per spec journey J1..J22, every scenario tagged with its AT id from `features.tsv`. Runner chosen after comparing playwright-bdd, cucumber-js and one more. Wired to `test/e2e/launch.ts` with the pretend AI, plus a real-AI mode                                                                                                                                                                                                                                            | Runs in CI; the count of scenarios per J; pretend-AI results marked so                                                                                                                                                                                      |
| C AI eval + injection                   | #124 | Second framework next to promptfoo (#97). Cases with AT ids: routing, plan quality, tone, honesty about what foo can't do, safety (cards, OTPs, passwords, big payments), bad or unknown AI output, slow or old CLI, Hinglish, Hindi, Punjabi. Injection red team vs real Claude: email, paste, files, web pages and AI pages trying to pay, send, reveal secrets, change rules. Build on `test/articles/ART-injection.test.ts`                                                              | Per-case pass/fail with the model reply saved; cost logged                                                                                                                                                                                                  |
| D visual, motion, a11y                  | #125 | Real-AI screenshots vs `golden/` and the Blueprint (the Blueprint captures in `golden/`): list every difference with both images. The 13 missing motion rules (AT-300..327 range). Keyboard-only, focus order, Narrator labels, high contrast, 200% zoom                                                                                                                                                                                                                                     | Picture pairs; motion checks in CI; Narrator/high-contrast marked "needs Windows CI" until seen there                                                                                                                                                       |
| E Windows, install, upgrade, perf, soak | #120 | Install, first run, uninstall, Credential Manager, tray, notifications. Upgrade old build → new build with chats, memory and a running job kept and resumed. Perf for every spec time/size limit with real and pretend AI. 8-hour soak                                                                                                                                                                                                                                                       | Windows CI run links only; never claim a Windows result you did not see                                                                                                                                                                                     |
| F code quality                          | #121 | App-wide mutation (beyond #101's 4 files), wire-up audit (every button does something real; no fake data), unused code/deps, static scan, dependency audit, secret scan, chaos during real-AI jobs, cost per journey, network capture vs hosts the spec allows                                                                                                                                                                                                                               | Scores and lists with commands to re-run                                                                                                                                                                                                                    |
| G usability                             | #118 | Heuristic review of every screen vs the Blueprint and Nielsen's 10 heuristics, with screenshots and severity. A 15-minute script for a real person: 5 tasks, what to watch, 3 questions                                                                                                                                                                                                                                                                                                      | Screenshots linked; script ready for a human; no claims of user results                                                                                                                                                                                     |

Every lane report: `docs/testing/results/codex-<yyyy-mm-dd>-lane-<letter>.md`, one row per thing tested:
`| Feature or check | Test type | Result (pass/fail/wrong/blocked) | Build sha | Evidence link | Note |`, plus "could
not run, and why".

## 8. Track 5: the matrix and the handoff log (lead only, once a day)

1. Collect the lane reports and run findings. Re-check each "pass" against §3; downgrade anything without a current-main
   link to partial and say why.
2. Update the shared TSVs, run `python3 docs/testing/build_matrix.py`, commit regenerated files, add one line to the Log
   table in `docs/testing/CODEX-HANDOFF.md` (IST time, "Codex", what changed, numbers before → after).
3. The coverage dashboard page is Claude's; it is refreshed from these files after 26 Oct. Do not try to edit it.

## 9. Daily results file (Vikas pastes it back to Claude)

Every day at the end of work, write `docs/testing/results/codex-daily-<yyyy-mm-dd>.md` on the lead branch, and also
print it as your final reply. Keep it under 60 lines, in this exact shape:

```
# Codex daily <date> (IST)
Main: <sha> · main CI: <green/red/running + link> · real-AI run: <id, state, judged yes/no + link>
## Numbers (before → after, from build_matrix.py)
real AI proven x→y · partial · fail · no journey · not built · code tests proven · golden match · BDD · usability
## PR queue (in merge order)
| PR | head sha | CI Linux | CI Windows | review verdict | ready for Vikas to merge? | why not |
## Bugs (Track 3)
| bug | state | test link | fix PR | proven on main? (link) |
## Lanes
| lane | PR | done today | evidence link | blocked by |
## Numbers taken (CR / X / AT)
## Needs Vikas (decisions only, never "please run")
## Could not do, and why
## Spend today (per lane, total)
```

## 10. Stop and check rules (so you do not drift)

- After each task, ask: did I prove it per §3, with a link? If not, the word is "partial", not "done".
- If you are about to edit a file outside your lane or task, stop.
- If you are about to touch `spec/`, `golden/`, a workflow trigger, a secret, #132, or a paused milestone, stop and
  write it under "Needs Vikas".
- If a test fails and you feel like raising a timeout, adding a retry, skipping, or changing a threshold: stop. Find
  the cause.
- If two hours pass on one bug with no failing test reproducing it, write what you tried in the daily file and move on.
- If evidence disagrees with a claim (yours, Claude's, a PR body, this prompt), the evidence wins. Write the
  disagreement down; never round up.
- When all tracks are done or blocked, stop and print the daily file. Do not invent new work outside these tracks.
