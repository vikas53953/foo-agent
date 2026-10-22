# CR-0049: A repair turn sees what it repairs

- **Asked by:** Vikas, 2026-10-21 07:14Z (project chat): "keep on doing the end-to-end testing until you see that everything is
  working … Do not wait for any go or approval from me". The real-AI run 30 on main 04f01dd (Claude CLI, journey B07) found
  it. The coordinator passed it on 2026-10-22 at 01:14Z.
- **Why:** "Open the Indian Railways IRCTC website and check the train timings from New Delhi to Agra tomorrow morning" got
  "I didn't get that. Say it another way?". The app log shows `job.steer_check new` and then `chat.intake_kind reply`
  twice, with an 11.6 s intake turn each time.
  - The Claude CLI's real answer to the same prompt plans a job. It did so in 15 of 15 replays (default model, Sonnet and
    Haiku), and every answer passes zod.
  - When an answer's `<act>` fails zod, 08-2 §7.5 runs one repair turn "in the same session". foo keeps no AI session
    between turns, so the repair turn carried `repair.md` and nothing else. The AI never saw the message.
  - The CLI's real answer to `repair.md` alone is kind `reply` with "I can't see your last message on my side…" (3 of 3
    replays). A repair turn's `<say>` is ignored after streaming (08-4 §25.5 item 3), so the reply was empty. CR-0041 then
    ran the turn once more, the same thing happened, and the fallback line was posted.
  - Step turns repair the same way (`JobRunner.stepTurn`), so a step with a bad `<act>` was repaired blind too.
  - The run cannot show which part of the first `<act>` failed, because a repaired act logs nothing. Any slip that zod
    refuses leads to the same end: a non-string slot, a route outside the list, or an unknown key.
- **Spec sections:** 08-4 §24.1 `repair` row; 08-2 §7.5 (a pointer only); DECISIONS X-207.
- **Status:** Approved by Vikas's approve-on-my-behalf rule, DECISIONS X-207 (his messages 2026-10-18 14:56Z and 14:59Z,
  and 2026-10-21 07:14Z), after the independent review in §(d).
- **Change:** the sections above, as listed in §(b).
- **Manifest:** `pnpm tsx scripts/spec-verify.ts --write` runs in the same commit. `repair.md` itself is unchanged.

## (a) Trace rows

None. The tests are in `test/integration/repair-context.test.ts` ("CR-0049 · …"), with the CLI's real answers.

## (b) Spec before → after

| #   | What the run saw                                     | Spec before                                      | Spec after                                                                                            |
| --- | ---------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| 1   | The repair turn could not see the message it repairs | §24.1 repair: "same session", prompt `repair.md` | the failed turn's system; prompt = its prompt, `Your last reply:` + that reply (≤ 4,000), `repair.md` |

## (c) Proof

- **Real CLI replays.** These used the B07 intake prompt as foo builds it, with run 30's chat history and the system from
  `PromptBuilder.buildIntake`.
  - The intake answer was a job 15 of 15 times.
  - `repair.md` alone gave kind `reply` 3 of 3 times. That is the run 30 failure.
  - The new repair prompt (the B07 prompt, a broken answer with an object in a slot, then `repair.md`) gave a valid job 3
    of 3 times.
- **Tests.** `test/integration/repair-context.test.ts` fails on main and passes with the change:
  - The B07 intake gets the job, not the fallback line, and the repair prompt carries the message, the bad reply and the
    issue.
  - A step whose `<act>` fails is repaired into its result.

## (d) Review

Pending.
