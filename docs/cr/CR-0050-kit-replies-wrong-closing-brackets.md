# CR-0050: kit replies with wrong or missing closing brackets still draw

- **Asked by:** the coordinator for Vikas, 2026-10-22 01:16Z, after the real-AI run 30 (main 04f01dd, after CR-0046) on the
  Claude CLI. Vikas's standing rule (2026-10-21 07:14Z): "keep on doing the end-to-end testing until you see that everything
  is working … Do not wait for any go or approval from me".
- **Why:** in run 30, journey B09-kit, the EMI calculator (AT-347), the Jaipur map (AT-341) and the GDP chart (AT-340) still
  showed their words and "Couldn't show part of this" with nothing drawn, the same failure as run 21's table. Run 30 is the
  first run that saved the AI's raw replies (`evidence` branch `real-ai/04f01dd-claude/s3/2026-10-22T00-30-31-763Z-B09-kit/thread-raw.json`). They show the cause: in each, the
  root component ends in a list of objects, and the AI got the closing brackets wrong:
  - EMI Calculator: ends `"unit":"rupees"}]}}]}` where `}]}]}}` is due (`]` and `}` swapped).
  - Jaipur MapStops: ends `."}]}}`, two closers short, so the message never closes.
  - GDP LineChart: ends `6.5}]}]}}]}` where `}]}]}]}}` is due (the same count, `}` and `]` swapped near the end).

  Each fails `JSON.parse` (or never ends), so the whole `updateComponents` message was dropped before the catalog check;
  CR-0046's mends never saw it. Compare, TimedChecklist and ShortForm in the same run were well formed and drew. The
  driver's B09 steps passed on the words alone, so the run did not fail.

- **Spec sections:** 04 §13.5; 10-acceptance-2 §C.10 new AT-443; `spec/trace.csv` one row; DECISIONS X-208.
- **Status:** Approved by Vikas's approve-on-my-behalf rule, DECISIONS X-208 (his messages 2026-10-18 14:56Z and 14:59Z, and
  2026-10-21 07:14Z; after the independent review in §(d)).
- **Change:** the sections above, as listed in §(b).
- **Manifest:** `pnpm tsx scripts/spec-verify.ts --write` run in the same commit.

## (a) Trace rows

`AT-443` → `test/unit/kit-real-replies.test.ts` (M9, live). The six run-30 replies are now real cassettes in
`test/fixtures/kit-replies/real-run30-b09-*.txt`; the EMI, map and chart ones failed before this change and pass after it.

## (b) Spec before → after

| #   | What run 30 saw                               | Spec before                                               | Spec after                                                                                                                                                                      |
| --- | --------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | EMI and chart: `]` and `}` swapped at the end | 04 §13.5: a message that is not valid JSON is dropped     | Inside a kit message a closer is read as the one due (`]` for `}` and the other way round); brackets inside text are never touched; the result is still checked by the catalog. |
| 2   | Map: the last closers left out                | 04 §13.5: when the reply ends, an open message is dropped | When the reply ends, an open message is closed with the brackets it still needs and checked; one that ends inside a text value is still dropped. Streaming still holds it back. |
| 3   | (a later message after an unclosed one)       | (silent)                                                  | A line that starts a new message (`{"createSurface"`, `{"updateComponents"`, `{"updateDataModel"`, `{"deleteSurface"`) ends the one before it.                                  |
| 4   | (no test; the driver passed on words alone)   | AT-354, AT-441                                            | AT-443; the real-PC driver fails a step whose reply shows "Couldn't show part of this", and each B09 step names the kit piece it must draw (`expectKit`).                       |

## (c) Picks where the spec is silent

1. **Read brackets by what is due, never by guessing content.** The repair only decides which closer a `}` or `]` stands
   for and adds missing ones at the end; it never moves, adds or removes a key or value. Whatever comes out is checked by the
   same catalog, so nothing a surface may do is widened: an unknown component, a bad action or a web image is still dropped.
2. **Cut inside text stays dropped.** Closing a text value would mean guessing where the words end.
3. **No retry turn.** As in CR-0046: asking the AI again would cost a turn and delay the words.
4. **Driver checks the drawn piece.** Testing rule §10: a step passes on its end state, not the words. `waitReply` now records
   the kit test ids in the new reply (`kit`), fails on `kit-dropped` unless the step sets `allowKitDropped`, and fails when
   `expectKit` is missing (`kitMissing`).

## (d) Review

Two independent Fable reviews of this CR and its diff (AI output handling is a high-risk path), recorded in the PR and in
`docs/decisions/real-pc.tsv` ("approved on Vikas's behalf" on pass).

Both passed with fixes. Parser safety: no way found to widen what a surface may do (the repair never crosses a text value and
the catalog still checks every message); act item fixed: a surplus `}` after a complete message showed the caption, unlike
before (now left out as before, with a test); considers applied: the new-message cut needs the key followed by an object, so
a data value that only looks like a message is not cut (test), and it looks 120 characters ahead. Spec and driver: the
cassettes byte-match the run-30 evidence, the tests fail on main's parser and pass now, the driver check is scoped to the new
reply; act item fixed (code comments named CR-0047, which is PR #132's); considers applied (the chart is a swap, not a
surplus; AT-443 names the new-message rule). Approved on Vikas's behalf.
