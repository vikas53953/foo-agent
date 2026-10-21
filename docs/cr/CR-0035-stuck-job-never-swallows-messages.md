# CR-0035: a stuck job never swallows the next message

- **Asked by:** Vikas, 2026-10-21 07:14Z (project chat): "keep on doing the end-to-end testing until you see that everything is
  working … Do not wait for any go or approval from me". The real-AI runs 7, 8 and 10 (Claude CLI, main 8eddee7, 516a344,
  306b44f) found it; the coordinator routed it to the thread "Waiting plans block new asks".
- **Why:** once a web job showed its Stuck card (`stuck`, state `asking`), every later message in that chat got 👀 and no reply.
  Run 7: 8 messages from 7:51 PM to 8:12 PM IST ("What is a good name for a pet tortoise?", news, ISRO, laptop, …) until a typed
  "stop". Run 10: about 25 checks failed on this alone. Cause: 08-2 §5.2 sends a message in a chat with exactly one live job
  (WORKING or NEEDS_YOU) to that job as a steer; a steer cannot withdraw a Stuck or Secret box card (only the user ends them), so
  it waited in the job's queue, and so did every message after it.
- **Spec sections:** 08-2 §5.2 (`running = liveJobs(chat)`); 08-4 §26.5 new item 2a; DECISIONS X-193.
- **Status:** Approved by Vikas's approve-on-my-behalf rule, DECISIONS X-193 (his messages 2026-10-18 14:56Z and 14:59Z, and 2026-10-21 07:14Z; after the independent review in §(d))
- **Change:** the sections above, as listed in §(b).
- **Manifest:** `pnpm tsx scripts/spec-verify.ts --write` run in the same commit.

## (a) Trace rows

None. The test is `test/integration/jobs/stuck-chat.test.ts`, which replays run 7's sequence (a web job goes stuck, then two
unrelated questions), titled by CR.

## (b) Spec before → after

| #   | What the runs saw                                   | Spec before                                                            | Spec after                                                                                                                                                            |
| --- | --------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 👀 and no reply on every message after a Stuck card | 08-2 §5.2: one job in WORKING or NEEDS_YOU → `steer(job, m)`           | `liveJobs` leaves out a job whose NEEDS_YOU card is an unanswered Stuck or Secret box card; the message goes on through §5.2 (another live job, fold card, or intake) |
| 2   | (same)                                              | 08-4 §26.5 named only sign-in and take-over as cards a steer waits for | New item 2a: a Stuck or Secret box card takes no steer; the card stays as it was                                                                                      |

## (c) Picks where the spec is silent

1. **Which cards.** Stuck and Secret box: a steer cannot withdraw them (08-4 §26.5 item 3 lists approval, payment, draft and
   choice) and nothing ends them but the user. A sign-in or take-over in progress keeps item 2: it is time-bounded
   (`signin_timeout`) and the user is in the middle of it.
2. **The card stays.** The message does not answer, withdraw or restart the stuck job: the user still picks Try another way, Take
   over or Stop, and the 15-minute stuck timeout (AT-116) still runs.
3. **A new job is allowed.** The intake turn may plan a job for the message; it runs beside the stuck one.

## (d) Review

An independent Fable review of this CR and its diff, recorded in the PR and in `docs/decisions/real-pc.tsv` ("approved on
Vikas's behalf" on pass).

Passed with no act items. Its one "consider" item is done: a tap on the "Fold this into which job?" card that picks a job
which went stuck meanwhile sends the message to intake instead of holding it behind the card.
