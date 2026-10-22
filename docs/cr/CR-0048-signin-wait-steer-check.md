# CR-0048: A job waiting on a sign-in card does not hold the next, unrelated ask

- **Asked by:** Vikas, 2026-10-21 07:14Z (project chat): "keep on doing the end-to-end testing until you see that everything is
  working … Do not wait for any go or approval from me". The real-AI run 23 on main 0056624 (Claude CLI, run 39688102383,
  journey J12) found it. The coordinator gave the number on 2026-10-21 at 23:41Z.
- **Why:** an ISRO web job waited on a "This page wants to check you're a person" card for www.thehindu.com. The next message,
  "Draft an email to someone@example.com saying I'll be 15 minutes late to tomorrow's meeting", was steered into that job
  (08-2 §5.2, one live job), and 08-4 §26.5 item 2 queues a steer behind a sign-in in progress. Nothing answered it in 180 s.
  CR-0035 covers Stuck and Secret box cards only; CR-0045 checks Choice, tiles, approval, payment and draft cards only.
- **Spec sections:** 08-4 §26.5 item 2b; DECISIONS X-206.
- **Status:** Approved by Vikas's approve-on-my-behalf rule, DECISIONS X-206 (his messages 2026-10-18 14:56Z and 14:59Z,
  and 2026-10-21 07:14Z; after the independent review in §(d))
- **Change:** the CR-0045 steer check (`steer_check.md`) also runs when the only live job waits on its sign-in card. "new" →
  the intake turn, the sign-in card stays; "job" → the steer waits for the sign-in as before.
- **Manifest:** `pnpm tsx scripts/spec-verify.ts --write` run in the same commit.

## (a) Trace rows

None. The tests are in `test/integration/jobs/steer-check.test.ts` ("CR-0048 · …").

## (b) Spec before → after

| #   | What the run saw                                                      | Spec before                             | Spec after                                                |
| --- | --------------------------------------------------------------------- | --------------------------------------- | --------------------------------------------------------- |
| 1   | A draft-email ask waited behind another job's "are you a person" card | item 2: every steer waits for a sign-in | item 2b: the steer check runs first; "new" goes to intake |

## (c) Proof

- Claude CLI replays (protocol.md + steer_check.md, `--tools ''`), the ISRO job waiting on a check at www.thehindu.com, 6 of
  6 right. "new": the draft email, "Switch to dark mode", "What is my favourite food?". "job": "use the Hindu's print
  edition instead", "skip that site, try another", "why is it asking me that?".
- Without the change, the J12 test fails (no reply; the message is held behind the sign-in card).
- Run 23's U17 ("Switch to dark mode", no reply) is not an app fault: the screenshot shows the theme dark and "Changed: Theme
  → Dark. Undo". The driver counts only bubbles and cards, not this marker line, and the journey taps `app-undo-action` (the
  app-wide undo toast) instead of the line's link.

## (d) Review

An independent Fable review of this CR and its diff, recorded in the PR and in `docs/decisions/real-pc.tsv` ("approved on
Vikas's behalf" on pass).

Result (2026-10-21): independent Fable review, high tier, **PASS** (codes typed in chat are masked and a code box goes
through `code.submit`, never a steer; a second job opens a background window). Considers applied: the check runs only while
the sign-in card is still `waiting` for the user's tap (a `live` or taken-over sign-in keeps item 2, so no new job starts
while the user types a bank code); the "about: job" test now proves the check ran; the test header names CR-0048. Approved on
Vikas's behalf.
