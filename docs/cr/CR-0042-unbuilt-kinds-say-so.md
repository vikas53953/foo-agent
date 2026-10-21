# CR-0042: an intake kind that is not built yet says so

- **Asked by:** Vikas, 2026-10-21 07:14Z (project chat): "keep on doing the end-to-end testing until you see that everything is
  working … Do not wait for any go or approval from me". The real-AI run 13 (Claude CLI, main 3a35be0) found it. The coordinator
  gave the number and approved it on his behalf, 2026-10-21 18:53Z.
- **Why:** "Every weekday at 8 AM tell me the weather in Delhi" got "I didn't get that. Say it another way?". Intake understood
  it: the Claude CLI answers `kind: 'routine'` with a full draft. But the routine kind belongs to M7, which is paused, so the
  chat lane sent it to the "kinds built in later milestones" branch, which posts the empty-reply line. The same branch
  catches `catch_up` and `handoff`. "I didn't get that" tells the user to rephrase a request foo understood perfectly well.
- **Spec sections:** 08-4 §25.5 new item 5a; DECISIONS X-200.
- **Status:** Approved by Vikas's approve-on-my-behalf rule, DECISIONS X-200 (his messages 2026-10-18 14:56Z and 14:59Z, and
  2026-10-21 07:14Z; after the independent review in §(d))
- **Change:** the sections above, as listed in §(b).
- **Manifest:** `pnpm tsx scripts/spec-verify.ts --write` run in the same commit.

## (a) Trace rows

None. The test is `test/integration/not-built-kinds.test.ts`, titled by CR, with the CLI's real `routine` and `catch_up`
answers.

## (b) Spec before → after

| #   | What the run saw                                     | Spec before                                   | Spec after                                                                             |
| --- | ---------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1   | "I didn't get that" for a routine ask foo understood | no rule; the code posted the empty-reply line | 08-4 §25.5 item 5a: one fixed line per unbuilt kind (`routine`, `catch_up`, `handoff`) |

## (c) Picks where the spec is silent

1. **Say what foo can do instead.** Each line names the way that works today: ask each time (routine), ask about one thing
   (catch-up), ask in the helper's chat (hand-off).
2. **`setting` is not here.** Vikas said yes to building it now (CR-0043, X-201), so it gets the real behaviour, not a line.
3. **Lines go with their kind.** When a kind is built, its line and key are removed in that milestone's CR.

## (d) Review

An independent Fable review of this CR and its diff, recorded in the PR and in `docs/decisions/real-pc.tsv` ("approved on
Vikas's behalf" on pass).
