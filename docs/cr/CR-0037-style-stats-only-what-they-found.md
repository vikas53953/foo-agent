# CR-0037: Style stats write only what they found

- **Asked by:** the real-AI every-feature e2e run 8 (real Claude, 4 Windows parts, main 516a344), scored 2026-10-21: the
  Memory page showed the guessed fact "Uses about 0.0 emoji per message". Thread "Memory shows silly guessed facts", under
  Vikas's rule to approve on his behalf (2026-10-18 14:56Z) and his 2026-10-21 07:14Z "do not wait for any go or approval
  from me".
- **Why (root cause):** 08-3 §12.9 says the engine writes "four lines" after every 20th user message in foo's chat, one per
  measure, whatever the measure found. `styleLines` followed it literally: a person who never types emoji got a `guessed`
  line saying they use 0.0 per message, and one whose casing has no pattern got "Mixes capital and small letters". Both are
  ordinary pinned facts (08-2 §7.2), so they show on the Memory page (06-2 §7.3, "I guessed · from your last 20 messages")
  and go into every prompt of foo's chat. A third gap: the 20th-message counter counts all user messages, but the sample is
  user text messages, so a run with voice notes or blank texts measured fewer than 20 (in the worst case one), and blank
  texts pulled the average length and the shares down.
- **Other derived facts checked:** the only engine-made guesses are these style lines. Guesses from the post-turn review
  (08-3 §12.4, the AI's output) already need ≥ 2 evidence events and a reason (§12.3, `provenanceOk`), are schema-checked
  (text 1–120 characters), pass the sensitive rule and tombstones, and a guess without a reason is never shown (06-2 §7.3).
  `computeStyle` cannot give NaN or Infinity (it divides by `n || 1`) and the length is an integer ≥ 1 on non-blank texts.
- **Spec sections:** 08-3 §12.9 and the §12.8 `memory.styleStats` row; 06-2 §7.3 (Memory page rows).
- **Status:** approved on Vikas's behalf after the independent review in §(c). DECISIONS X-195.
- **Change:** `spec/constitution/08-functions-and-engine-3.md` §12.9 "up to four lines"; a measure that found nothing gives no
  line (no casing line for `mixed`, no emoji line at 0.0); the sample is the last 20 non-blank user text messages (`messages.userTexts` skips blank texts), and no lines are written before there are 20. §12.8 row "up to 4". Copy key `memory.style.casing.mixed` is removed from `en-IN.json` (now unused). Code: `src/engine/memory/styleStats.ts` (`computeStyle` drops blank texts,
  `styleLines` skips the empty measures, `StyleStatsRunner` waits for a full sample; `messages.userTexts` in `src/main/db/queries.ts` skips blank texts). The supersede step is unchanged, so a
  later run that finds no emoji also removes an earlier emoji line.
- **Manifest:** `pnpm tsx scripts/spec-verify.ts --write` run in the same commit.

## (a) Not changed

- The length line, the `lower` / `sentence` lines, the greeting / sign-off rule (≥ 5 of 20), the reason text, the cadence
  (every 20th user message in foo's chat), "never chips, never groups", and `privacy.rememberOn=false` blocking it.
- A "0.0 emoji" line already stored on a PC is removed by the next run (supersede). No installer has gone out, so no
  migration is added.

## (b) Tests

- `test/unit/m6-style.test.ts`: `styleLines` gives no emoji line at 0.0 and no `mixed` line; a 0.1 rate still gives one;
  blank texts are not counted; 20 × "ok sounds good" now writes 3 lines with no emoji line; a run that finds no emoji drops the
  earlier emoji line; 20 user messages with only 5 non-blank texts write nothing; blanks among the last 20 texts are skipped and the lines still refresh. Run against main's code: 9 of the 12 tests fail.
- Real-AI angle: the style lines are computed by the engine, never by the AI (AI-24), so the AI's output cannot cause them.
  The real-AI journey U14 (`test/real-pc/journeys/U14-memory.json`, from `make-journeys.py`) gains a soft check on the
  Memory page, anchored to the style-line shapes (`about (0.0|NaN|Infinity|undefined) (emoji|characters)|Mixes capital`), so a
  real run flags any such line without matching words like "banana".

## (c) Independent review

Fable reviewer, 2026-10-21 ~16:45Z, read-only, against 08-3 §12.1/§12.3/§12.4/§12.8/§12.9, 06-2 §7.3 and the diff; ran the
unit tests, spec:verify, check:copy, lint and trace:check. **Verdict: PASS WITH FIXES**; applied:

- Act: one attachment-only send (a blank `text` row) among the last 20 texts blocked the stats until 20 more texts came, so a
  person who sends a photo every few messages never got a refresh. `messages.userTexts` now skips blank texts; new test.
- Act: the U14 regex matched "banana" (`NaN`, case-insensitive) on any You-said fact; anchored to the style-line shapes.
- Consider (applied): the emoji guard compares the shown number (`toFixed(1) !== '0.0'`), not `>= 0.1`, so it holds for any caller.
- Consider (not applied): name the §12.9 id in the blank-texts test title; this file's titles already sit under a §12.9 describe.
- Noted, no issue: no stale "four lines" / `casing.mixed` references; the only engine-made guesses are the style lines; no
  NaN/Infinity path in `computeStyle`.

Recorded as approved on Vikas's behalf under his standing rule; listed for his later review.
