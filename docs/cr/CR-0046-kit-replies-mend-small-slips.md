# CR-0046: kit replies mend small slips, the prompt teaches the limits

- **Asked by:** the coordinator for Vikas, 2026-10-21 21:49Z, after the real-AI runs 16 (main 0665cf6) and 21 (main
  a087f3c) on the Claude CLI. Vikas's standing rule (2026-10-21 07:14Z): "keep on doing the end-to-end testing until you see
  that everything is working … Do not wait for any go or approval from me".
- **Why:** two real kit replies drew nothing but "Couldn't show part of this":
  - Run 16, journey B09-kit step 1, "Make an EMI calculator for a home loan of 50 lakh at 8.5% for 20 years": the words
    were right (₹43,391 a month), the Calculator under them was dropped.
  - Run 21, journey R1-rich, "Make a table comparing 3 budget phones under 20000 rupees": the AI said "I can't draw a plain
    table here" (08-4 §24.3 says "Never a table"), sent a Compare instead, and the Compare was dropped too.

  In both, the surface was created and only its root component failed the check (the caption and Keep showed, nothing
  else). The runs saved only the drawn words, not the AI's raw block, so the exact slip is not known. The catalog in
  `src/shared/kit/catalog.ts` is strict: an extra key, a `null` on an optional key, `8` where text goes or `"5000000"` where a
  number goes each drop the whole piece. The generated prompt showed none of the limits behind those checks (text lengths,
  minimum item counts, the Calculator input-name pattern, "no other keys"), so a real AI has no way to know them.

- **Spec sections:** 04 §13.5; 08-4 §24.5 (kit section); 10-acceptance-2 §C.10 new AT-441, AT-442;
  `spec/trace.csv` two rows; DECISIONS X-204.
- **Status:** Approved by Vikas's approve-on-my-behalf rule, DECISIONS X-204 (his messages 2026-10-18 14:56Z and 14:59Z, and
  2026-10-21 07:14Z; after the independent review in §(d)).
- **Change:** the sections above, as listed in §(b).
- **Manifest:** `pnpm tsx scripts/spec-verify.ts --write` run in the same commit.
- **Not in this CR:** "Never a table" (08-4 §24.3) is a design rule of Vikas's; allowing a table when the user asks is in
  its own commit, `CR-0046 part 2`, for his call.

## (a) Trace rows

`AT-441`, `AT-442` → `test/unit/kit-real-replies.test.ts` (M9, live). The test reads every cassette in
`test/fixtures/kit-replies/`. The two there now are rebuilt from the runs' words (README there); from this CR on, each
journey `dump` step also saves `<name>-raw.json` with foo's fenced replies as the AI wrote them, so the next run gives real
cassettes.

## (b) Spec before → after

| #   | What the runs saw                    | Spec before                                | Spec after                                                                                                                                                                                                                    |
| --- | ------------------------------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Calculator and Compare dropped whole | 04 §13.5: an invalid component is dropped  | First mended: an unknown key or a `null` left out; a number where text goes becomes text; a plain number written as text becomes a number; an over-long label, title, text, sub, note, why or alt cut with "…". Nothing else. |
| 2   | (the AI could not know the limits)   | 08-4 §24.5: one line per catalog component | Each line names its limits (`≤N` characters or items, `N–M` items, the input-name pattern, number ranges); the section says to use only the keys shown and to leave an unused optional key out instead of writing null.       |
| 3   | (no test)                            | AT-354 only                                | AT-441 (mended slips draw; the rest still drops), AT-442 (the prompt teaches the limits)                                                                                                                                      |

## (c) Picks where the spec is silent

1. **Mend, never guess.** Only slips whose meaning is plain are mended. An unknown component, a missing key, a value outside
   its list (a ShortForm field of type `password` stays refused), a wrong count, a bad input name, a formula, an image
   source and any action (`composer.fill` stays refused) are not touched, so no mend can widen what a surface may do.
2. **No retry turn.** Asking the AI again for a broken block would cost a second turn on every slip and delay the words; the
   mend is local and instant. The caption stays for what cannot be mended.
3. **Cut text only.** Lists over their limit are not cut (a chart cut to its first 60 points would mislead); only words a
   person reads are cut, with "…".
4. **Raw replies in evidence.** The driver's `dump` step saves foo's fenced replies (test-only code; the evidence push already
   scans every file for the key).

## (d) Review

Two independent Fable reviews of this CR and its diff (AI output handling is a high-risk path), recorded in the PR and in
`docs/decisions/real-pc.tsv` ("approved on Vikas's behalf" on pass).

Both passed (mend safety: PASS WITH FIXES, no act items, no way found to widen what a surface may do; spec and prompt:
PASS). Considers applied: the cut counts code points like zod (an emoji is never split); a number is read as text only
where words go, never in an id, input name, formula, image source, binding or action; a `null` inside a message stays, so
an `updateDataModel` with `path: null` is still refused; X-204 wording; the prompt says `N–M` is also a number range.
Part 1 approved on Vikas's behalf; part 2 (the table rule) waits for Vikas.
