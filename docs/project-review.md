# foo project review (28 Oct 2026)

Independent review by Fable, run in the project thread "Find why answers got worse". Mandate: Vikas's
"Project Sovereignty, Critical Thinking, and Continuous Learning Review" message of 28 Oct 2026 18:49Z.
Companion files: `docs/project-lessons.md` (reusable lessons) and `docs/project-review-handoff.md`
(next-session start). This review proposes; it changes no code, memory or project instructions.

Reading key: **Confirmed** = supported by evidence I read myself. **Suspected** = plausible, needs
validation. **Reasonable then** = sound at the time, worth revisiting. **Disagreement** = needs a
decision. **Risk** = has not happened yet. **Inferred** marks a cause I did not observe directly.

## A. Project understanding and review coverage

**Objective.** foo is a WhatsApp-style personal agent for Windows (Electron, React 19, SQLite) for one
user, Vikas, modelled on Instinct and the Grok bot after an Omnibot teardown (15 to 16 Oct). The approved
spec is `spec/constitution/` (3.4 MB, DECISIONS wins). Success as Vikas now defines it (24 Oct, "go" at
05:45Z): ship features in batches of 5 behind switches, installer per batch, he uses it for a day, his
notes become tests, fix, next batch.

**Current state (verified live, 28 Oct 18:30Z).**

| Item                                        | State                                                                                                             | Evidence                                                            |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| main                                        | `4e11747` (release gate, #163, merged 07:11Z)                                                                     | GitHub                                                              |
| Review baseline                             | branch `claude/project-thread-serr0j` at `4e11747`, clean tree, shallow clone (depth 21)                          | `git status`, `.git/shallow`                                        |
| Batch 1 (install, ai, name, chat, settings) | built; 👀, say tags, memory line proven fixed on real Claude; no installer has passed the gate                    | memory `foo-qa-explore`, gate thread 08:36Z                         |
| Release gate, first main run                | FAIL: 5 of 11 journeys clean; 5 app bugs listed                                                                   | gate thread 09:16Z, run 40648494242                                 |
| Live PRs                                    | #169 (builder, CI 7/7 green, real-AI red), #171 (QA, red until CR-0070), #172 (gate fixes, shard 4 node-gyp hang) | PR list, runs 886/100, 885, 878/879                                 |
| Stale PRs                                   | 18 open since 21 to 23 Oct (11 Codex lane drafts, 7 Claude)                                                       | PR list                                                             |
| Blocker                                     | `ANTHROPIC_API_KEY` secret refused since ~10:30Z; last good 10:14Z; nothing has run since 12:13Z                  | builder thread 11:47Z; all 8 journey jobs of run 40672497167 failed |
| Repo size                                   | 86k lines TS/TSX in `src/`, 674 test files, 51 CRs, 533 decision-log rows, 6 workflows, 1,015 CI runs             | local counts, GitHub                                                |

**Coverage map.**

- Reviewed in full: PR list, latest 30 workflow runs, job list and one job log of run 40672497167, the 163
  thread listings, the 24 Oct Fable review thread, the batch-1 thread, the burn-down thread (last 15
  messages), the builder thread (last 30), the gate thread (last 30), 10 memory files, CLAUDE.md,
  `docs/build-method.md` (first 40 lines), `docs/testing/qa.md` (head), `docs/decisions/*.tsv` sizes.
- Sampled: coordinator chat, 15 to 19 Oct only (about 300 messages). 19 to 28 Oct was not read; it was
  too long to page through within a lean budget.
- Unavailable: the exact 401 line for the key (log tail did not include it); artifact blobs (403 from
  the container); pre-21 Oct git history (shallow clone, so the "702 commits" figure is the 24 Oct
  review's, not re-verified).
- Not examined: the spec text itself, source code quality, individual test files, the evidence branch,
  Codex PR contents.

Effect on conclusions: findings about product state rest on GitHub and thread records and are firm.
Findings about collaboration drift rest on thread and memory records; the 19 to 28 Oct coordinator chat
could add cases but is unlikely to remove the ones listed, since each is backed by a thread or memory
entry written at the time.

## B. What we have learned and what is working

1. **A fresh thread with a small brief produces the best work.** The gate thread (27 to 28 Oct) built the
   release gate, got an independent review, merged it and gave a FAIL verdict with pictures in one day.
   The QA thread (26 Oct) found 25 defects with a repeatable command. Both started from a short brief and
   one goal. Keep this shape.
2. **Real-Claude runs find bugs no scripted test finds.** Empty-say replies, the glued cut-off reply after
   reopen, F30 dark-mode-after-memory, "flight card with jobs off" all came from real runs (builder thread
   28 Oct). The real-AI lane and the gate are the right instruments.
3. **Red-first and "say what was not covered" work when used.** `Red-first:` trailers, the "pre-check
   only" wording, and the strike-and-[Edit] correction habit each caught a wrong claim within minutes
   (gate thread 05:31Z to 05:35Z). Keep them and move them up the enforcement ladder where possible.
4. **Feature switches and batches put a human in the loop.** The 24 Oct decision turned a spec-conformance
   project into one with a user. Batch 1 is the first thing Vikas actually ran. Keep batches.
5. **Vikas's corrections were right each time.** Usage burn (17 Oct), "test the product not the spec"
   (26 Oct), 👀 still showing (27 Oct), "who told you to use fake AI" (28 Oct). Each was later confirmed
   by evidence. The signal from the human is high quality; the system was slow to act on it.

## C. Mistakes and weaknesses

### C1. Confirmed: the real-AI rule was set three times and still not followed

- **What:** "Real AI, not only pretend AI" entered memory on 19 Oct and project rule 6 on 21 Oct. On
  27 Oct QA reported 👀 "verified fixed" from an instant fake-AI run; Vikas found 👀 still on every
  message (18:26Z). The rule was restated 28 Oct 03:53Z and again 04:15Z, angrily.
- **Evidence:** memory `feedback-qa-slow-ai`, `foo-real-ai-testing`; project instructions rule 6; the
  👀 thread.
- **Assumption involved:** that a rule written in memory reaches every thread. It did not: recall shows
  only 4 KB per file and the index was at its cap.
- **Impact:** lost trust, one wasted day, an app sent to Vikas with the bug he had already reported.
- **Causes (inferred):** rule 6 itself still says "the pretend AI is for speed only", which a thread can
  read as permission; the QA harness defaulted to instant replies; nobody checked timing.
- **Better:** one rules page, deduplicated, with each rule's enforcer; the gate's `FOO_REAL_AI_ONLY`
  refusal (already built 28 Oct) is the right rung. Rewrite rule 6 to match.
- **Confidence:** high.

### C2. Confirmed: "fixed" or "passed" claims withdrawn within minutes, four times in two days

- "typing… stays on, 3 of 3 rounds" (gate thread 05:31Z) struck out at 05:35Z as the gate's own picture
  timing. QA5 "passed" (06:17Z) while the reply had the old cut-off text glued on. The real-AI lane was
  green on main while 8 of 53 journeys failed (status page 04:20Z). 👀 "verified fixed" (27 Oct).
- **Impact:** every withdrawn claim costs a coordinator relay, a builder detour and Vikas's attention.
- **Cause (inferred):** claims were made from a single signal (one picture, one substring, one exit
  code) instead of from the record plus the picture. The team already knows this; the fix is structural
  (see lessons L2, L3).
- **Confidence:** high; the corrections are in the threads themselves.

### C3. Confirmed: state that nobody withdraws

- 163 threads, about 80 never resolved, 12 marked "blocked on Vikas" from 17 to 22 Oct (plugin install,
  mission board, M6 memory page, Codex overnight review) that are obsolete. 21 open PRs, 18 untouched
  for a week. 58 memory files, 142 KB, 20 of them per-milestone lead notes for paused work. Rules were
  added on 18, 21, 22, 26, 27 and 28 Oct; none retired.
- **Impact:** every listing is mostly noise; a coordinator that reboots re-learns from stale config.
  This is the mechanism behind Vikas's "answers got worse" (his hypothesis, confirmed in shape).
- **Confidence:** high on the counts; medium on how much each contributes to drift.

### C4. Confirmed: contradictions left unreconciled

- Memory (28 Oct 04:20Z): U17 fails because fix PR #131 has sat open since 21 Oct. Builder thread
  (28 Oct 06:28Z): U17 was a test-design fault, fixed by running the batch set on shipped features.
  #131 is still open. Both may be partly true; no one closed the loop.
- Three scoreboards that measure different things: "4 of 190 proven" (23 Oct), "B1 passed 34 of 34"
  (24 Oct), "5 of 11 gate journeys clean" (28 Oct).
- **Impact:** Vikas cannot tell where the project stands from any one number.
- **Confidence:** high.

### C5. Confirmed: the blocker sat in the wrong place for 6 hours

- The refused key was reported at 11:47Z inside the builder thread, which is in "blocked" state. By
  18:18Z nothing had moved. Whether the coordinator relayed it to the project chat is not verified (chat
  not read for that period). Either way the single item only Vikas can clear was not the first line of
  the project.
- **Better:** a blocker only the human can clear goes to the project chat as the one open item, and
  nothing else is reported until it is cleared.

### C6. Reasonable then, revisit now: parallel milestone fan-out (18 Oct)

- 22 threads at once was Vikas's own ask ("use the weekly limit"). It burned the limit in 30 minutes and
  produced the M4 to M14 lead notes that still sit in memory. Given what was known then (plenty of limit,
  spec approved) it was defensible. It is no longer the right shape; batches of 5 features with one
  builder and one QA thread is.

### C7. Reasonable then, revisit now: the spec-first "fidelity" build

- 30 laws, 69 CRs, fid:guard, trace:check, spec headers on every file. It made builders conform to a
  spec with no user. The 24 Oct review said so; Vikas chose batches. The machinery stays useful for
  what is shipped, but each new rule now needs a cost line.

### C8. Suspected: the Codex lanes produced little that merged

- 11 Codex draft PRs (21 to 23 Oct) have had no change since 23 Oct; three daily merge passes found
  nothing ready (burn-down thread 24 to 26 Oct). Memory records "57 commits, 32 docs-only, 2 touch src".
  I did not read the PR contents, so the value of the audits inside them is unverified.

### C9. Unresolved disagreement: what "proven" means

- Project rule 6 (fake AI for speed), the 28 Oct standing rule (real AI only), the QA runbook
  ("nondeterministic scenarios need their last 3 runs"), and the gate ("pass^3, zero retries") each
  define proof differently. A decision is needed (section F).

### C10. Collaboration pattern: rules as the response to each miss

- Each correction from Vikas became a new rule or skill (15 principles, 10 testing rules, 12 standing
  rules, 6 skills). The intent was right; the effect is that a new session's first job is reading
  rules, and the rules now clash (C1, C9). Fewer rules, each enforced by a check, would hold better.

### What is not the cause

The model. The same drift appears in threads on Opus and on Fable, and in the coordinator. Fresh threads
on either model did well. There is no evidence of degraded model quality.

## D. Likely future failures (pre-mortem, ranked)

1. **The next installer goes out with a bug Vikas already reported.** Mechanism: a fix proven on a PR
   branch, merged, then regressed by another merge; gate not re-run on the exact head. Warning sign: a
   "proven" claim without a main sha. Prevention: the gate's verdict on main is the only release signal;
   the app Vikas gets is the `foo-windows-app-gated` artifact and nothing else. Recovery: the previous
   gated build stays downloadable.
2. **Context drift repeats after the reset.** Mechanism: threads and memory grow again; nobody retires
   state. Warning sign: more than 3 open threads or 10 memory files. Prevention: caps written into the
   coordinator's instructions; a weekly 10-minute prune. Evidence that reduces uncertainty: one week
   with no withdrawn claim.
3. **The real-AI lane goes red for reasons outside the code (key, Claude outage, node-gyp, runner).**
   Mechanism: seen today (key) and twice this week (node-gyp). Warning sign: all journeys fail within
   minutes. Prevention: the lane's first step verifies the key with one cheap call and fails with a
   named reason; the summary names "infrastructure" vs "app". Recovery: re-run after the fix, no code
   change.
4. **Real Claude changes its answers without any code change.** Mechanism: model-side variation; U01,
   R1 and U02 already flip run to run. Warning sign: a journey that passes 2 of 3. Prevention: pass^3 is
   already the rule; keep it; the daily sentinel (decision pending) catches model-side change.
5. **Vikas loses trust after one more "fixed" that is not.** Mechanism: C2. Warning sign: a claim
   without a screenshot plus a record. Prevention: lesson L2 as a check in `foo-verify`.
6. **The 18 stale PRs are reopened or merged later with conflicts.** Mechanism: nobody owns them.
   Prevention: close them now; branches stay.

## E. A better way of working

Each item maps to a finding.

- **Requirements:** one `foo-status` file rewritten after every merge (main sha, open PRs, gate verdict,
  blocker). It replaces three scoreboards (C4).
- **Decisions:** keep `docs/decisions/*.tsv`; add one line per retired rule so rules can be withdrawn,
  not only added (C10).
- **Implementation:** one builder thread and one QA thread per batch; no parallel helpers unless the
  lead asks; a thread reads live GitHub before memory (C3, C6).
- **Verification:** a "proven" claim needs three things in one message: the main sha, the journey
  record line, the picture. Anything less is "pre-check only" (C2). Rule 6 rewritten to match the
  28 Oct rule (C1).
- **Delegation:** the coordinator routes and posts blockers; it does not plan builds (C5).
- **Handoffs:** every thread ends with a handoff file of at most one page in `/mnt/project-files/handoff/`;
  a new thread starts from it and verifies its three most important lines against GitHub first (C4).
- **Pruning:** caps of 3 open threads, 5 open PRs, 10 memory files; a weekly prune.

## F. Decisions that need Vikas

1. **Approve the reset?** (card posted 18:40Z in this thread.) Options: full reset; threads and memory
   only; fix #169 first. Recommendation: full reset. Trade-off: one session of no feature work.
2. **One definition of "proven".** Options: (a) gate verdict on main, pass^3, zero retries, picture plus
   record, as the only proof; fake AI allowed in unit tests only; (b) keep today's mixed definitions.
   Recommendation: (a), and rewrite project rule 6 to say so. Trade-off: slower, honest.
3. **Daily real-Claude sentinel** (card posted 28 Oct 05:31Z in the gate thread, unanswered). Options:
   daily, weekly, not now. Recommendation: weekly, Monday 07:00 IST, before the batch pick; the cost is
   unmeasured and the gate already runs on every merge.
4. **Codex lanes.** Options: close the 11 drafts (branches stay) or keep them for later triage.
   Recommendation: close.

## G. Prioritized next steps

| #   | Action                                                                           | Purpose                                 | Owner                         | Depends on | Done when                                        |
| --- | -------------------------------------------------------------------------------- | --------------------------------------- | ----------------------------- | ---------- | ------------------------------------------------ |
| 1   | Check and update the `ANTHROPIC_API_KEY` secret                                  | unblocks every real-Claude run          | Vikas                         | none       | a real-AI run on #169 passes its first key check |
| 2   | Decide F1 to F4                                                                  | authorizes the reset and the proof rule | Vikas                         | none       | cards answered                                   |
| 3   | Resolve stale threads, close stale PRs, archive memory to 8 files                | remove stale state (C3)                 | coordinator                   | F1         | counts under caps; archive folder written        |
| 4   | Rewrite project rule 6 and merge the standing rules into one page                | remove the clash (C1, C9)               | coordinator, with Vikas's yes | F2         | one rules page; old copies deleted               |
| 5   | Write `/mnt/project-files/handoff/foo-lead-2026-10-29.md`; start one lead thread | lean restart                            | coordinator                   | 3          | thread open, reads GitHub first                  |
| 6   | #169 real-Claude green, merge; #172 merge; gate run on main                      | batch-1 fixes land                      | lead                          | 1          | gate verdict posted with sha                     |
| 7   | First gated installer to Vikas                                                   | human in the loop                       | lead                          | 6          | `foo-windows-app-gated` link sent                |
| 8   | Add the key pre-check to the real-AI lane                                        | D3                                      | lead                          | 6          | lane fails fast with "key refused"               |

Work actually performed in this review: investigation, this document, `docs/project-lessons.md`,
`docs/project-review-handoff.md`, a review page, one decision card. Nothing else changed. Results verified:
the live state in section A. Not verified: the 401 log line; the 19 to 28 Oct coordinator chat.

## H. Durable records and next-session handoff

- Created: `docs/project-review.md` (this), `docs/project-lessons.md`, `docs/project-review-handoff.md`,
  copies under `/mnt/project-files/foo/project-review/`, and the page "foo Project Review".
- Proposed instruction changes (not applied): rewrite project rule 6; add the caps and the "proven"
  definition to CLAUDE.md's rules table with their enforcers; retire per-milestone memory files.
- How future sessions load the lessons: the handoff file points to `docs/project-lessons.md`; the
  coordinator's instructions should name it as the first read for a new lead thread. A file alone does
  not make an agent read it; the pointer in the handoff and the coordinator rule do.

## Self-check

- Weakest conclusion: C5 (the blocker's visibility), since I did not read the coordinator chat for
  28 Oct. Weak also: C8, PR contents unread.
- Hindsight risk: C6 and C7 are judged with today's knowledge; I have labelled them "reasonable then".
- Complexity risk: the caps and the status file add process. They replace three scoreboards and 50
  memory files, so net complexity falls, but if they are not kept they become more stale state.
- Preference vs requirement: "full reset first" is my recommendation, not a requirement. Vikas decides.
- No check is implied that was not run: the key error line was not seen; the shallow clone prevented
  re-counting commits.
