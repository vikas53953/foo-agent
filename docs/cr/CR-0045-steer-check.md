# CR-0045: A message that is not about a waiting job leaves its card alone; a message sent while a job turns stuck is not lost

- **Asked by:** Vikas, 2026-10-21 07:14Z (project chat): "keep on doing the end-to-end testing until you see that everything is
  working … Do not wait for any go or approval from me". The real-AI run 21 on main a087f3c (Claude CLI, run 39673710219,
  journeys U23 and U01) found it. The coordinator gave the number on 2026-10-21 at 21:49Z.
- **Why:**
  - **U23 (cross-talk).** A table booking waited on "Which city should I look in for Sat 24 Oct, 8:00 PM?". The user then
    asked "Make me a simple page that tracks my daily water intake". With one live job, 08-2 §5.2 makes every message a
    steer, and 08-4 §26.5 item 3 withdraws the job's open card at once, before the step turn says what the message was. The
    step turn said `new_job` (the tracker was built), but the card was already "→ you changed the plan" and the job asked
    again ("Which kind of place…?") right under the tracker ask. Earlier, "yes" and a routine ask did the same.
  - **U01 (lost message).** The watchdog halts a job for its Stuck card, then runs the "What's wrong" classify turn
    (seconds) before the job becomes NEEDS_YOU. In that window the job is still `working`, so "Give me one fun fact about
    Delhi" (sent 0.4 s after the stuck log) was steered into a halted job that never reads its steers. No answer came.
- **Spec sections:** 08-4 §24.1 (new `classify` row), §24.13a (new `steer_check.md`), §26.5 items 2a and 2b; DECISIONS X-203.
- **Status:** Approved by Vikas's approve-on-my-behalf rule, DECISIONS X-203 (his messages 2026-10-18 14:56Z and 14:59Z,
  and 2026-10-21 07:14Z; after the independent review in §(d))
- **Change:** the sections above, as listed in §(b).
- **Manifest:** `pnpm tsx scripts/spec-verify.ts --write` run in the same commit; `resources/prompts/MANIFEST.json` has the
  new file's sha256.

## (a) Trace rows

None. The tests are `test/integration/jobs/steer-check.test.ts` ("CR-0045 · …") and the CR-0045 test in
`test/integration/jobs/stuck-chat.test.ts`, with the CLI's real answers.

## (b) Spec before → after

| #   | What the run saw                                               | Spec before                                        | Spec after                                                                           |
| --- | -------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1   | An unrelated ask withdrew a waiting job's card; it asked again | §26.5 item 3: any steer withdraws the card at once | item 2b: one `steer_check.md` classify turn first; "new" → intake, card and job stay |
| 2   | A message during the "What's wrong" turn got no answer         | item 2a: only a posted Stuck or Secret card blocks | item 2a: a job halted for its Stuck card blocks steers from the halt on              |
| 3   | No way to tell from a run why a message was or wasn't a steer  | silent                                             | tech log `job.steer_check` = `job` / `new` / `failed`                                |

## (c) Proof

- Claude CLI replays of the new prompt (protocol.md + steer_check.md, `--tools ''`), 20 messages over 4 waiting jobs (table
  city, shoe size, which Friday, a ₹499 pizza approval): 20 of 20 right. "new": the water tracker, the routine ask, the time
  in London, the Delhi fun fact, a VPN question, a Goa hotel, the electricity bill, "Read my latest Gmail", "dark mode kar
  do". "job": "yes", "Actually make it 9 PM", "Bangalore, Indiranagar side", "is there anything vegetarian?", "make it under
  4000 instead", "I'm usually a 9", "cancel this", "the second one", "morning flights only please", "add a coke too", "is
  that with delivery?".
- Without the steer check, the U23 test and the failed-check test fail. Without the stuck-window fix, the U01 test fails.

## (d) Review

An independent Fable review of this CR and its diff, recorded in the PR and in `docs/decisions/real-pc.tsv` ("approved on
Vikas's behalf" on pass).
