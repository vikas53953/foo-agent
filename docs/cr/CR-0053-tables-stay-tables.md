# CR-0053: tables in replies stay tables

- **Asked by:** Vikas, 2026-10-24 03:55Z ("tables OK"), answering the clash found by the real-AI run on main 62d419e.
- **Why:** journey R1 ("Make a table comparing 3 budget phones under 20000 rupees") never showed a table. Two rules stopped
  it: `rules.md` (08-4 §24.3) told the AI "Never a table", and 08-2 §7.6 step 3 had the engine turn any table into
  "label: value" lines. Both predate CR-0022 (rich replies), which made tables a first-class reply (04 §13.2 draws them with
  rules, numeric columns, "Show all {n} rows" and "Copy table"). The renderer already draws them; the engine threw them away
  before it could.
- **Spec sections:** 08-4 §24.3; 08-2 §7.6 step 3; 04 §13.2; 07-journeys-1 J7 summary; 10-acceptance-2 foo-bubble row and
  new AT-444; `spec/trace.csv` one row; DECISIONS X-210.
- **Status:** Approved by Vikas, DECISIONS X-210 (his message 2026-10-24 03:55Z, "tables OK").
- **Change:** the sections above, as listed in §(b). `resources/prompts/rules.md` and its sha in
  `resources/prompts/MANIFEST.json` follow 08-4 §24.3.
- **Manifest:** `pnpm tsx scripts/spec-verify.ts --write` run in the same commit.

## (a) Trace rows

`AT-444` → `test/unit/m3-prompt-filters.test.ts` (M9, live). It failed before this change (the table came out as lines)
and passes after it. The old `tablesToLines` tests are removed with the function.

## (b) Spec before → after

| #   | Where                   | Before                                                                                                     | After                                                                                                                                   |
| --- | ----------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 08-4 §24.3 (`rules.md`) | "… or when the user needs to compare things. Never a table."                                               | "… Use a table when the user asks for one, or when you compare three or more things on the same points; keep it to 5 columns or fewer." |
| 2   | 08-2 §7.6 step 3        | "The engine only turns tables into "label: value" lines."                                                  | "The engine leaves tables as they are; the renderer draws them (04 §13.2, CR-0053)."                                                    |
| 3   | 04 §13.2 last line      | "In chat mode the engine turns tables into "label: value" lines (J7); tables only appear in rich bubbles." | "Tables show in any foo bubble, chat mode or stream mode (§12.3); the engine passes them through unchanged."                            |
| 4   | 07 J7 summary           | "tables become "label: value" lines"                                                                       | "tables stay tables (CR-0053)"                                                                                                          |
| 5   | 10-2 foo-bubble row     | "table as "label: value""                                                                                  | "table as a table (CR-0053)"; new AT-444                                                                                                |

## (c) Picks where the spec is silent

1. **When to use a table.** When the user asks for one, or when comparing three or more things on the same points. Two
   things stay a short list, so casual chat stays chat-like.
2. **Column limit 5.** Five 96 px minimum columns (04 §13.2) fit the rich bubble; a wider table still scrolls with the
   §13.2 right fade.
3. **No flattening fallback.** A table the renderer cannot parse shows as its text, the same as any other markdown.
   `research/journeys-2.md` and the blueprint keep their old wording, since they record the research as it was.
