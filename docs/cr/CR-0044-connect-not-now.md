# CR-0044: Not now on a Connect card from intake runs the job without the app

- **Asked by:** Vikas, 2026-10-21 07:14Z (project chat): "keep on doing the end-to-end testing until you see that everything is
  working … Do not wait for any go or approval from me". The real-AI run on main 0665cf6 (Claude CLI, run 39663772762,
  journey U25) found it. The coordinator gave the number on 2026-10-21 at 20:43Z and asked that the card say why it asks.
- **Why:** "Pay my electricity bill now" got a Connect Gmail card: intake planned a job that reads the bill from email
  (`needsApps: ["gmail"]`, 1 of 4 CLI replays; the other 3 planned it without Gmail). CR-0040 shows that card before any job.
  But on that card **Not now** only changed the buttons in the window: nothing reached the engine, so the message stayed
  "Needs you" and no job ever ran. The line "So I can read your email for this." also did not say which job needed it.
- **Spec sections:** 08-2 §5.3.3 (CR-0044 amendment), 05-3 §5.11 (the `one_app` row); DECISIONS X-202.
- **Status:** Approved by Vikas's approve-on-my-behalf rule, DECISIONS X-202 (his messages 2026-10-18 14:56Z and 14:59Z,
  and 2026-10-21 07:14Z; after the independent review in §(d))
- **Change:** the sections above, as listed in §(b).
- **Manifest:** `pnpm tsx scripts/spec-verify.ts --write` run in the same commit.

## (a) Trace rows

None. The tests are in `test/integration/connect-first.test.ts` ("CR-0044 · …"), with the CLI's real answer.

## (b) Spec before → after

| #   | What the run saw                                       | Spec before                              | Spec after                                                                                         |
| --- | ------------------------------------------------------ | ---------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1   | Not now left the message "Needs you" with no job       | silent (the card's own Not now is local) | Not now → `card:answer { skip: true }` → card `skipped` → one new intake turn, job without the app |
| 2   | "So I can read your email for this." (which job?)      | fixed line per app                       | the line names the job and says Not now works                                                      |
| 3   | No way to tell from a run why a message got its answer | silent                                   | tech log `chat.intake_kind` (enum) and `job.steer_effect` (enum, `default_folded` when missing)    |

## (c) Picks where the spec is silent

1. **Not now means "go ahead without it".** The job's steps then ask for what they lack (run 15 asked "Which electricity
   provider should I pay?"); a job that truly cannot work without the app says so through its own step, as before.
2. **Once per message, in engine RAM**, like the CR-0028 answers: after a restart the user asks again.
3. **The title is the AI's hint**, filtered and cut as a job title (08-4 §26.2 item 4), so the line reads naturally ("for
   “Pay electricity bill”"); none → the generic phrase.
4. **The two log lines carry enums only** (no message words), so they are safe in the evidence the e2e runs publish. They
   answer the open questions from the same run ("I didn't get that" for a table booking; "Got it, I'll fold that in" for new
   asks during a running job), which need the app's own record to root-cause.

## (d) Review

An independent Fable review of this CR and its diff, recorded in the PR and in `docs/decisions/real-pc.tsv` ("approved on
Vikas's behalf" on pass).

Result (2026-10-21): independent Fable review, high tier, **PASS** with one act item: an old intake Connect card could start a
second job (Not now after Connect, or after the wait ran out). Fixed: Connect marks the card `connected`, the lane keeps the
waiting message by card, and Not now runs the message again only while it is still waiting (test "a Not now after connecting
is stale and starts no second job"). Consider applied: the card goes back to its buttons when `card:answer` fails. Approved on
Vikas's behalf.
