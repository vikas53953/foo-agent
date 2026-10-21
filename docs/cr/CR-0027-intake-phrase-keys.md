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
- **Spec sections:** 08-4 §24.5 (`intake.md` and the note under it); part 2: 08-4 §26.1 (slot cleaning).
- **Status:** Approved by Vikas on his behalf, DECISIONS X-185 (his rule 2026-10-18 14:56Z and his 2026-10-21 07:14Z
  message; after the independent review in §(c)).
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
- What the tests prove: only the first test fails without this change (the list is in the intake prompt). The other
  three are regression cover for the path from a CLI-shaped reply to the Plan rows; the real proof is the next real-PC run.
- Residual risk: fixed by part 2, §(d).
- Budget: the list adds about 590 characters to intake part 4 (never trimmed). The §24.15 budget tests' fixtures shrink by
  that much; the trim order they check is unchanged.

## (b) Picks

1. The line sits after the `intent_capabilities` line and before `Helpers you can hand off to: {helperList}`, so the
   multi-line helper list stays last, as before.
2. "Plan steps use only these phrase keys" (not `step.md`'s "Steps the user has not seen yet"): at intake no step has
   been seen.

## (c) Independent review

Fable reviewer, 2026-10-21 ~07:30Z, read-only, against 08-4 §24.0, §24.5, §24.6, §24.15, §25.1, §26.1, 08-2 §5.3.3 and the
diff; ran the three affected test files, typecheck and spec:verify. **Verdict: PASS WITH FIXES** (docs only); applied:

- Act: the budget figure (about 590 characters, not 950); the residual slot-rule risk added to §(a).
- Consider: §(a) now says which test proves the fix. Kept: the catalogue-order check (keys change only by CR).
- Noted, no issue: the root cause; every downstream path resolves before storing and re-resolves stored keys without a
  second fallback; replan uses `step.md`, which already had the list; budget well under 24,000 for local AI.

Recorded as approved on Vikas's behalf under his standing rule; listed for his later review.

## (d) Part 2: slots are cleaned, not dropped

- **Asked:** 2026-10-21 08:13Z, after the first part merged (PR #88): the real-AI journeys are blocked for a while, and a
  real Claude often writes step details over 40 characters or with `?`, `!`, `;`, quotes or an en dash. Under §26.1 each
  such row still read "Work on it". Same topic and decision row (X-185), so it stays in this CR.
- **Change:** 08-4 §26.1: before the slot rule, each slot is cleaned. Curly quotes become `'`, en and em dashes `-`, `;`
  becomes `, `, any other character outside the rule a space; spaces collapse and the ends are trimmed; text still over
  40 characters is cut at the last space within the first 41 (else at 40), and trailing spaces and `.,:&/(<+-` go. A slot
  with nothing left, or one that fails the banned-word filter, still falls back to `generic_working`. Code: `cleanSlot`
  in `src/shared/phrases.ts`, used by `resolvePhrase` (so the runner stores cleaned slots and every later read is the
  same; cleaning is idempotent).
- **Not changed:** the slot rule itself, the banned-word filter, the title hint (08-4 §26.2, `title.ts`), the catalogue.
- **Tests:** `test/unit/slot-cleaning.test.ts` (eight real-shaped details, idempotence, word-boundary cuts, the
  fallbacks); `test/integration/jobs/plan-phrases.test.ts` (a CLI-shaped plan with long and punctuated details reads its
  own words). Two old checks that a 41-character slot and `x; rm -rf` fall back now check that `?!;` and blanks do.
- **Pick:** cut at a word break with no `…` (the slot rule has no ellipsis character), so a cut reads as a shorter phrase.
- **Review:** see §(e).

- **Slot rule widened by `\p{M}`:** the rule had `\p{L}` but not combining marks, so a Hindi or Punjabi detail
  (`दिल्ली मुंबई`) always failed, and with cleaning it would have been split into bare letters. `\p{M}` joins the rule
  (and the cleaner), so Indic details show as written. The title hint (§26.2, `title.ts`) uses the same rule and gains
  the same.
- **Tool-argument-looking text** (`x; rm -rf`) now shows as words ("Check x, rm -rf"). It is display text inside a `t()`
  phrase, never run; the banned-word filter still runs on the cleaned text before the runner stores it (08-2 §5.4.3).
- Lengths count code points, as the rule does.

## (e) Independent review of part 2

Fable reviewer, 2026-10-21 ~08:25Z, read-only; ran the four test files and typecheck, fuzzed `cleanSlot` on 200k strings
(no idempotence or rule failures). **Verdict: PASS WITH FIXES**; applied:

- Act: the cut counted UTF-16 units and could split an astral letter at position 40; it now counts code points (test
  added). Indic vowel signs were turned into spaces; `\p{M}` joins the rule (test added).
- Consider: the spec says `;` becomes `, ` (as the code does); the tool-argument sentence above.
- Noted: spec text matches the code; stored slots are the cleaned ones, re-resolved to the same text; tests honest. An
  unbalanced `(` after a cut is cosmetic and stays.

Recorded as approved on Vikas's behalf under his standing rule (2026-10-18 14:56Z, 2026-10-21 07:14Z); listed for his
later review.
