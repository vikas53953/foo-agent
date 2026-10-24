# CR-0056: an email catch-up offers Connect Gmail while Google is not connected

- **Asked by:** the burn-down of the real-AI runs on main c17269d and 3bfb97a (journeys B13 and U20).
- **Why:** "check my email" (B13) and "Read my latest Gmail" (U20) were sometimes decided as `catch_up` with source `gmail`.
  Catch-ups are not built yet, so foo said "I can't do catch-ups yet. Ask me about one thing, like your latest email, and
  I'll look." The user had just asked about their latest email, so the line read as nonsense, and no Connect card showed
  (both journeys expect one). A job that needs Gmail already gets the Connect card first (CR-0040).
- **Spec sections:** 08-4 §25.5 item 5a; 10-acceptance-2 new AT-446; `spec/trace.csv` one row; DECISIONS X-213.
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
3. **Only Gmail.** A WhatsApp group catch-up has no Connect card to offer here, so it keeps the not-built line. Google
   already connected also keeps the line, since the catch-up itself is still not built.
