# foo project lessons

Reusable lessons from the 28 Oct 2026 review (`docs/project-review.md`). Each entry says when it
applies, what we saw, the evidence, the better action, how a future session recognizes it, how to
tell it was followed, and where it does not apply. Durable facts, preferences, workarounds and
hypotheses are marked.

## L1. A rule only holds at the rung that enforces it (durable fact)

- **Situation:** any standing rule written in memory or project instructions.
- **Observation:** the real-AI rule was written three times (19, 21, 28 Oct) and still missed on 27 Oct.
- **Evidence:** memory `feedback-qa-slow-ai`; project rule 6; the 👀 thread 27 Oct.
- **Better action:** when a rule is written, name its enforcer on the same line (a lint, a workflow
  refusal, a test, a hook). If there is none, say "words only" and expect it to be missed.
- **Trigger:** a message that adds or restates a rule.
- **Verification:** the CLAUDE.md rules table has an enforcer for the rule.
- **Limits:** one-off instructions for a single thread do not need an enforcer.

## L2. "Proven" means sha plus record plus picture, in one message (durable fact, Vikas's rule)

- **Situation:** reporting a fix, a pass, or a verdict.
- **Observation:** four claims in two days were withdrawn within minutes (typing stuck, QA5 passed,
  lane green with failures, 👀 verified).
- **Evidence:** gate thread 05:31Z and 05:35Z; `feedback-qa-slow-ai` 06:17Z; status page 04:20Z.
- **Better action:** a "proven" or "fixed" message carries the main sha, the journey step record
  (`thread.json` or `summary.json` line), and the screenshot. Without all three say "pre-check only".
- **Trigger:** typing the words proven, fixed, passed, verified, green.
- **Verification:** `foo-verify` proof block present in the PR or message.
- **Limits:** pure unit tests with no AI call need only the test name and result.

## L3. Judge a real-AI step from the record, then the picture, never one alone (durable fact)

- **Situation:** reading a gate or real-AI run.
- **Observation:** a picture taken 2 s after a click showed "typing…" and was called a bug; a substring
  check called a glued reply a pass.
- **Evidence:** gate thread 05:35Z edit; QA5 miss 06:17Z.
- **Better action:** read the step record first, then the picture; assert what must NOT be in the
  bubble as well as what must.
- **Trigger:** any claim about a journey step.
- **Verification:** the claim cites both the record line and the shot name.

## L4. Stale state must be withdrawn, not only added to (durable fact)

- **Situation:** threads, PRs, memory files, rules.
- **Observation:** 163 threads with 80 unresolved, 21 PRs with 18 stale, 58 memory files, rules added
  six times and never retired. Vikas felt this as "answers got worse".
- **Evidence:** thread list, PR list, memory folder on 28 Oct.
- **Better action:** caps of 3 open threads, 5 open PRs, 10 memory files; weekly prune; retiring a
  rule gets a decision-log line like adding one.
- **Trigger:** any listing that shows more than the cap.
- **Verification:** counts at or under the caps at the start of each week.
- **Limits:** archive, never delete; branches stay when PRs close.

## L5. A blocker only the human can clear is the project's first line (durable fact)

- **Situation:** a secret, a key, a billing or permission issue.
- **Observation:** the refused key was posted inside a blocked builder thread at 11:47Z; six hours later
  nothing had moved.
- **Evidence:** builder thread 28 Oct; CI run list (nothing after 12:13Z).
- **Better action:** post it in the project chat as the single open item with the exact click path,
  and stop reporting anything else until it clears.
- **Trigger:** an auth error, 401/403, "secret", "billing" in a log or run.
- **Verification:** the project chat shows the blocker before any progress message.

## L6. A new thread reads live state before memory (durable fact)

- **Situation:** starting any thread or after a handoff or compaction.
- **Observation:** two threads gave opposite causes for U17; memory pointed at a PR that another thread
  had superseded.
- **Evidence:** memory `foo-status-28oct` vs builder thread 06:28Z.
- **Better action:** first three tool calls: GitHub PR list, latest runs on main, the handoff file.
  Then memory. Where they disagree, say so and trust the live one.
- **Trigger:** the first turn of a thread.
- **Verification:** the first checklist line names the main sha.

## L7. Instant fake AI hides timing bugs (durable fact)

- **Situation:** any test of chat feel, badges, typing rows, debounces.
- **Observation:** 👀 never appeared in QA because replies came in 0 ms.
- **Evidence:** `feedback-qa-slow-ai`, CR-0059.
- **Better action:** real Claude for app-level tests; where a scripted AI is allowed (unit tests),
  delay it by seconds and say "pre-check only".
- **Trigger:** a test that asserts something time-based.
- **Verification:** `QA_SLOW_AI_MS` set; gate refuses `FOO_TEST*`/`FOO_FAKE_*`.

## L8. Separate infrastructure red from app red in the real-AI lane (hypothesis, worth a check)

- **Situation:** all journeys fail within minutes.
- **Observation:** today's key refusal and this week's node-gyp hangs both read as app failures.
- **Evidence:** run 40672497167 (all 8 jobs failed in 5 to 30 min); `foo-ci-flakes-open`.
- **Better action:** one cheap key check at the start of the lane; summary names the cause class.
- **Trigger:** more than half of journeys fail at their first AI step.
- **Verification:** the lane's summary line says "key refused" or "native build failed" by itself.

## L9. Small brief, one goal, fresh thread (successful practice)

- **Situation:** any new piece of work.
- **Observation:** the gate thread and the QA thread were the week's best; the 22-thread fan-out burned
  the limit in 30 minutes.
- **Evidence:** gate thread 27 to 28 Oct; QA thread 26 Oct; chat 18 Oct 18:44Z.
- **Better action:** one lead thread per batch from a one-page handoff; a QA thread separate from the
  builder; no parallel helpers unless asked.
- **Limits:** truly independent tickets may run in parallel inside one batch, at most 3.

## L10. Vikas's corrections are high-signal; act the same day (preference, confirmed by outcomes)

- **Situation:** Vikas reports a bug or says the process is wrong.
- **Observation:** usage burn (17 Oct), test the product (26 Oct), 👀 (27 Oct), fake AI (28 Oct) were
  all confirmed by evidence afterwards.
- **Better action:** treat his report as a failing test: reproduce it under his conditions (real
  Claude, packaged build, his words), add the test kind that would have caught it, then fix.
- **Verification:** each report maps to a journey id in the gate or QA set.

## Temporary workarounds (not lessons)

- Threads get 403 on `workflow_dispatch` and re-run; merge main in for a fresh run.
- The evidence branch is force-pushed by other workflows; `git ls-remote` before fetching.
- Container cannot download artifact blobs; send Vikas the GitHub artifact link.
