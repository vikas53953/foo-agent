# CR-0069: with a feature off, intake gets one second look at a likely wrong kind

- **Asked by:** QA-X-F30 and QA-X-F32, from the real-AI run on main 2467a76 (run 40595003833, B1-batch1 steps 31 and 23).
  Batch-1 bugs under Vikas's 26 Oct 06:00Z ask ("fix all the bugs … one baseline of the full app"); the coordinator set the
  shape (a cheap word check, then one more intake turn).
- **Spec sections:** 08-4 §25.5 (intake kinds), CR-0054 (X-211, the feature-off lines), CR-0058 (a setting ask is a
  setting), CR-0059 row 6 (JOBS_OFF_LINE), CR-0067 (X-224, the off line replaces words already shown).
- **Status:** Approved by Vikas's approve-on-my-behalf rule, DECISIONS X-226 (independent review, every check green; no spec clash).

## (a) What was wrong

- F30: right after "remember that I am vegetarian" got the memory-off line, real Claude labelled "Switch to dark mode"
  `memory`, so foo said "I can't remember things for you yet…" and the theme stayed light, with settings by chat on.
- F32: with jobs off, real Claude answered "Book a table for 2 tonight…" as a `reply` in its own Hinglish words, so the
  batch's jobs line never showed.

The intake prompt already says a dark-mode ask is always a setting (CR-0058); the AI still varies.

## (b) Decision

1. With memory off, every intake turn carries MEMORY_OFF_LINE (like JOBS_OFF_LINE): decide `memory` only when the message
   itself says to remember, note or forget something; a change to how foo looks or works is `setting`.
2. Within the same turn, intake gets one second look, with a line naming its first answer (REASK_MEMORY_LINE or
   REASK_JOB_LINE), when:
   - it answered `memory`, memory is off, and the message has no remember, note or forget word (English, Hinglish,
     Hindi, Punjabi); or
   - it answered `reply`, jobs are off, and the message names a task (book, order, buy, pay, send, call, …).
3. The second look streams nothing; foo acts on its kind. Words the first look already showed stay: a `job` answer's jobs
   line replaces them (CR-0067), a `reply` keeps them (the person has read them). A `memory` first look that turns into a
   `reply` answers with the second look's words, filtered by the release gate.
4. A `memory` answer for a message with no remember word never gets the memory line, even after the second look: foo
   says "I didn't get that. Say it another way?" (`thread.reply.empty`).
5. A real memory ask ("remember…", "yaad rakhna…", "याद रखना…") gets the memory line at once, as before.
6. One second look per message, ever (an empty-answer retry does not get another); none for side questions, Try again,
   or with the feature on. When it fails, hits the spend cap or gives no act, the first look's answer stands. Stop during
   it stops the reply like any other (the shown words stay, with "Stopped."). Cost: one more intake turn, only in these cases.
7. Known limit: words a first look showed for a wrong `memory` answer stay when the second look picks another non-reply
   kind (the prompt asks for an empty `<say>` on every non-reply kind, so this is rare).

## (c) Evidence

| Test                                                                        | main 1748f55 | this change |
| --------------------------------------------------------------------------- | ------------ | ----------- |
| `cr-0069-second-look-kind.test.ts`: dark mode labelled memory, then setting | red          | green       |
| … memory twice with no remember word: never the memory line                 | red          | green       |
| … "Book a table" as reply, then job: jobs line in one bubble                | red          | green       |
| … "Did you book my cab?" stays a reply                                      | red          | green       |
| … real memory asks in 3 languages, plain chat, features on: no second look  | green        | green       |

The real proof is B1-batch1 steps 23 and 31 on the next real-AI run after merge.
