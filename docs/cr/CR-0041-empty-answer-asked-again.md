# CR-0041: an empty intake answer is asked again, never a 👍

- **Asked by:** Vikas, 2026-10-21 07:14Z (project chat): "keep on doing the end-to-end testing until you see that everything is
  working … Do not wait for any go or approval from me". The real-AI run 13 (Claude CLI, main 3a35be0) found it. The coordinator
  gave the number and the direction (a 👍 only for an ack, one retry, then the visible line).
- **Why:** "Order me a pizza from Dominos" got a 👍 reaction and then nothing for 3 minutes. 08-4 §25.5 item 6 (F-092) said
  an intake answer whose filtered `<say>` is empty gets a 👍 when the message has ≤ 6 words. On a real ask, that 👍 reads as
  "on it" while nothing happens. The run had no app log, so why that one turn came back empty is not known. Replayed 9 times
  through the Claude CLI with the run's chat history, the same message always planned a job, so a second turn is very likely
  to get the job.
- **Spec sections:** 08-4 §25.5 item 6; 10-acceptance-2 new AT-440; `spec/trace.csv` one row; DECISIONS X-199.
- **Status:** Approved by Vikas's approve-on-my-behalf rule, DECISIONS X-199 (his messages 2026-10-18 14:56Z and 14:59Z, and
  2026-10-21 07:14Z; after the independent review in §(d))
- **Change:** the sections above, as listed in §(b).
- **Manifest:** `pnpm tsx scripts/spec-verify.ts --write` run in the same commit.

## (a) Trace rows

`AT-440` → `test/integration/empty-reply.test.ts` (M9, live), next to the other chat-feel rows of 10-acceptance-2 §C.10.

## (b) Spec before → after

| #   | What the run saw                                         | Spec before                                                       | Spec after                                                                                                                                                        |
| --- | -------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 👍 on "Order me a pizza from Dominos", then 3 min silent | 08-4 §25.5 item 6: empty `<say>` → 👍 if ≤ 6 words, else the line | One more intake turn with nothing shown; a second empty answer → "I didn't get that. Say it another way?" whatever the length; 👍 only from kind `react` (AT-027) |
| 2   | (no test)                                                | no AT for the empty answer                                        | AT-440 in 10-acceptance-2 §C.10                                                                                                                                   |

## (c) Picks where the spec is silent

1. **One retry, then the line.** The same as the tool-use retry of 08-2 §6.5: the message gets one more intake turn, never
   more, so a broken AI cannot loop. Engine RAM only; a restart's cut-off handling is unchanged.
2. **Nothing shows during the retry.** The 👀 stays on the bubble and the Thinking row runs as for any turn; no "let me try
   again" words (Art. 16, 22).
3. **The answers stay.** A message answering an intake question (CR-0028) keeps its `Decisions:` lines for the retried turn.

## (d) Review

An independent Fable review of this CR and its diff, recorded in the PR and in `docs/decisions/real-pc.tsv` ("approved on
Vikas's behalf" on pass).

Passed with one act item, now fixed: the changed plan (Change plan, 08-2 §5.3.3) was taken before the retry was decided, so
the retried turn had no old plan. It is now taken only after a turn that answered, and the test "after Change plan, the
retried turn still carries the old plan" covers it. Three "consider" items are done as well: the retry keeps a message's
intake-only mark (a steer's `new_job` is not steered again), the Thinking row stays on across the retry, and no memory uses
are recorded for the answer that was thrown away.
