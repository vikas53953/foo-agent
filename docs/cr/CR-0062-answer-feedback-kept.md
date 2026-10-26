# CR-0062: 👍 / 👎 on an answer are kept on this PC

- **Asked by:** the QA re-test of PR #155 (26 Oct, 16:13Z), finding F16: "👍 on an answer is lost after a restart"
  (`test/qa-explore/findings.spec.ts` QA-X-F16). QA marked it as needing a spec change first.
- **Why:** 04 §17.1 says 👍 "toggles a local note on this answer", and §17.2 says the 👎 feedback "is saved on this PC as a
  preference note". The spec names no table, column or channel for either, so the builder kept them in window state only
  (`implementation-notes.md` 2026-10-17, "thumbs feedback has no table or channel"). A restart forgets them.
- **Spec sections:** 04 §17.1, §17.2, §17.4 ("Good answer" / "Not a good answer"); 08-0 §G.1 (`messages`), 08-1 §3.2
  (channels), §4.6 rule 2 (redacted columns); Article 15 (never used to train anything); DECISIONS X-219; AT-452.
- **Status:** Approved by Vikas's approve-on-my-behalf rule (independent reviews, every check green; Fable 2026-10-26: a
  gap fill with no spec clash), DECISIONS X-219.

## (a) Change

1. **Storage.** Migration 0007 adds three columns to `messages`:
   - `feedback TEXT CHECK (feedback IN ('good','bad'))`, NULL when none.
   - `feedback_chips TEXT`: JSON array of the §17.2 chip ids picked with 👎.
   - `feedback_note TEXT`: the optional "Tell me more" words, written through `Store.writeRedacted`.

   The three columns join 08-0 §G.1 `messages`; `feedback_note` joins the 08-1 §4.6 rule 2 list (redacted on write) and
   the rule 3 purge list (blanked with `text`). Chips and words are kept only with 👎.

2. **Channel** `message:feedback { messageId, vote: 'good' | 'bad' | null, chips?, note? }` (08-1 §3.2), for foo's or a
   helper's text answer only (`VALIDATION` for the user's own, a system or a private chat's message, `NOT_FOUND` for an
   unknown id). One UPDATE sets all three columns and bumps `rev`: the latest vote replaces the earlier one and `null`
   clears all three. The reply is `void`; the row reaches the window as `message:upsert`. `MessageRow` (08-5) gains
   `feedback?`.
3. **Reads.** `MessageRow.feedback` drives the pressed 👍 / 👎 on the action row, the ⋯ menu items and the small 16px mark
   on older answers (§17.1), after a restart too.
4. **What it is used for.** Nothing is sent anywhere. The note is not given to the AI in batch 1. Using it as a preference
   note in prompts arrives with `memory` (batch 3) and needs its own line in `intake.md`. Deleting or clearing the message
   hides the feedback with it (the words stay in `foo.db` until the §4.6 rule 3 purge is built, as `text` does), and a
   private chat stores none.
5. **Rewrite.** Try again or an edit rewrites the answer in place (X-216, X-217); the vote stays on the message, as
   CR-0059 pick 4 already says.

## (b) Trace rows

`AT-452` → `test/integration/answer-feedback.test.ts` (the vote and chips survive a reopen of the store; a new vote
replaces the old; `null` clears them; a user, system or private-chat message and an unknown id are refused; the note is
redacted) and the restart check in `test/e2e/qa-b1-about.spec.ts` (QA-B1-084): 👍 is still pressed after the app restarts.

## (c) Review

Tier **high**: two independent reviewers (Fable and Opus), same diff, read-only. Round 1, fixes in the same commit:

| #   | Finding                                                                                               | Outcome                                                                                |
| --- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1   | The 👎 field had no 500-character limit, so a long note failed and the vote fell back silently (Opus) | Fixed: `maxLength={500}`, as the channel                                               |
| 2   | 👍 then 👎 quickly: the first reply cleared the second pending vote (both, nit)                       | Fixed: only the latest call settles                                                    |
| 3   | X-219 and (a)4 said the purge blanks the words; the purge is not built (Opus)                         | Fixed: the text says it joins the purge list and the purge waits (X-217 item 6)        |
| 4   | The e2e restart step checks 👎, not 👍 (Opus)                                                         | Kept: 👎 after 👍 proves the replace and the restart; 👍 alone is the integration test |
| 5   | The schema test runs 0007 on the reference schema too (Opus)                                          | Kept: the same rule as 0006 (X-216); the DECISIONS row is the schema source            |
