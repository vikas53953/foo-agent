# CR-0027: Intake lists the phrase keys, so Plan card rows read the AI's own steps

- **Asked by:** the real-PC end-to-end run of 2026-10-21 (main 501aa1a, the Claude CLI signed in on Vikas's laptop), under
  Vikas's ask of 2026-10-21 07:14Z: "keep on doing the end-to-end testing until you see that everything is working ... Do
  not wait for any go or approval from me".
- **Why:** every row of every Plan card read "Work on it" (`cards.checklist.generic_working.next`): "Make a table comparing
  3 budget phones" showed it 4 times, "Book a table for 2 near CP" 3 times. The plan comes from the intake turn, and 08-4
  §24.5 `intake.md` asks for "the steps (each step is a phrase key with its slots)" but never says which keys exist. Only
  `step.md` (§24.6) carries `{phraseKeys}`, and the intake schema types `phraseKey` as any string (§25.1). A real AI so
  invents keys ("search_web", "create_table"), and 08-2 §5.3.3 / 08-4 §26.1 correctly turn each unknown key into
  `generic_working`. The fake AI used in tests writes catalogue keys, so no test saw it.
- **Spec sections:** 08-4 §24.5 (`intake.md` and the note under it).
- **Status:** Pending the independent review in §(c).
- **Change:** `spec/constitution/08-functions-and-engine-4.md` §24.5: `intake.md` gains one line before the helper list,
  "Plan steps use only these phrase keys: {phraseKeys}", and the note says `{phraseKeys}` is the `step.md` list.
  `spec/constitution/DECISIONS.md` row X-185. Code: `resources/prompts/intake.md` and its sha256 in
  `resources/prompts/MANIFEST.json`; `PromptBuilder` fills `{phraseKeys}` for intake from the same `PHRASE_KEY_LIST` as step.
- **Manifest:** `pnpm tsx scripts/spec-verify.ts --write` run in the same commit.

## (a) Not changed

- The fallback: an unknown key, a runner-only key in a plan, or a failing slot still becomes `generic_working` (08-2 §5.3.3).
  The wire still accepts any key (§25.1), so an unknown key is not a repair.
- `group_intake.md` (§24.19): it plans no steps.
- No new trace ids. The test is `test/integration/jobs/plan-phrases.test.ts`: the intake system prompt carries the list,
  and replies shaped like the Claude CLI's (pretty-printed act JSON on its own lines) for the two real-PC requests give
  Plan rows with their own words; invented keys still read "Work on it".
- Budget: the list adds about 950 characters to intake part 4 (never trimmed). The §24.15 budget tests' fixtures shrink by
  that much; the trim order they check is unchanged.

## (b) Picks

1. The line sits after the `intent_capabilities` line and before `Helpers you can hand off to: {helperList}`, so the
   multi-line helper list stays last, as before.
2. "Plan steps use only these phrase keys" (not `step.md`'s "Steps the user has not seen yet"): at intake no step has
   been seen.

## (c) Independent review

Pending.
