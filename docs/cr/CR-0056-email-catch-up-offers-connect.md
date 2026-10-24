# CR-0056: an email catch-up offers Connect Gmail while Google is not connected

- **Asked by:** the burn-down of the real-AI runs on main c17269d and 3bfb97a (journeys B13 and U20).
- **Why:** "check my email" (B13) and "Read my latest Gmail" (U20) were sometimes decided as `catch_up` with source `gmail`.
  Catch-ups are not built yet, so foo said "I can't do catch-ups yet. Ask me about one thing, like your latest email, and
  I'll look." The user had just asked about their latest email, so the line read as nonsense, and no Connect card showed
  (both journeys expect one). A job that needs Gmail already gets the Connect card first (CR-0040).
- **Spec sections:** 08-4 §25.5 item 5a; 05-3 §5.11 Trigger; 10-acceptance-2 new AT-446; `spec/trace.csv` one row; DECISIONS X-213.
- **Status:** Approved by Vikas's approve-on-my-behalf rule (independent review and every check green), DECISIONS X-213.
- **Change:** the sections above, as listed in §(b).
- **Manifest:** `pnpm tsx scripts/spec-verify.ts --write` run in the same commit.

## (a) Trace rows

`AT-446` → `test/integration/connect-first.test.ts` (M9, live). The Connect-card, reintake and Not now tests failed before
this change (foo posted the not-built line) and pass after it.

## (b) Spec before → after

| #   | Where              | Before                                    | After                                                                                                                                                                                                                                  |
| --- | ------------------ | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 08-4 §25.5 item 5a | "No job, card or setting change follows." | "… with one exception: a `catch_up` whose source is `gmail` while Google is not connected and `connections` is on posts the Connect card for Gmail instead, as a job that needs Gmail does (CR-0040); after Not now the line follows." |
| 2   | 10-2               | (none)                                    | AT-446                                                                                                                                                                                                                                 |

## (c) Picks where the spec is silent

1. **The card's line.** The Connect card's `why_job.gmail` line needs a job title; a catch-up has none, so it uses the
   `read_email` phrase, "Read your email". No new copy.
2. **Feature switches.** With `connections` off (batch 1) the Connect card is a hidden feature, so the not-built line stands.
3. **After connecting.** The message goes back to intake. If the AI decides the same email catch-up again, the engine runs
   a job of one `read_email` step (route `api`, needs `gmail`), so connecting never ends on "I can't do catch-ups yet".
   Only a message that got this card does this; a fresh catch-up with Google already connected keeps the line, since the
   catch-up itself (12-2 §12.27) is not built.
4. **Not now.** The card says "I'll try without it"; for a catch-up there is nothing to try without Gmail, so the one new
   intake turn (CR-0044) ends on the not-built line. Accepted: it is honest, and the user can still ask again.
5. **Only Gmail.** A WhatsApp group catch-up has no Connect card to offer here, so it keeps the not-built line.

## (d) Review

Two independent reviews of the diff before merge (logins and connections need two). The correctness review traced every
path (one post per turn, released `<say>`, side questions, type widening, feature check) and passed. The spec review asked
for: the after-connect catch-up to end in a job, not the line (done, §(c) 3, with a test); the Not now wording to match
CR-0044 (done in 5a and AT-446); the 05-3 §5.11 trigger and the end of the exception when `catch_up` is built (done); and
this section. It found the card line "I need to read your email for “Read your email”." acceptable with no better key,
and kept the copy as is.
