# CR-0073: four chat fixes from release gate 10

- **Asked by:** release gate 10 on main a52aa85 (run 43300367063), triaged by the lead thread on 12 Nov 2026. QA's
  tightened gate checks (PR #180) test the same behaviour. Batch-1 bugs under Vikas's 26 Oct 06:00Z ask ("fix all the
  bugs … one baseline of the full app").
- **Spec sections:** 08-4 §24.1 (intake prompt: "7 conversation · the user's message"), 08-2 §7.2 part 7 ("last 20
  completed messages"), 04 §17.1 (action row: Copy · Try again · 👍 · 👎), 04 §19.4 (cut-off reply), 08-4 §25.5 item 5
  and §25.6 / CR-0043 (a `setting` answer: "text already released stands; the setting line follows it").
- **Status:** Approved by Vikas, 13 Nov 2026 12:29Z ("ys" to the four chat fixes in #181). DECISIONS X-229.

## (a) What was wrong (real Claude, packaged Windows app, 3 rounds each)

1. **Pasted message answered with the old story** (G2 s18, 3 of 3). "line one / (blank line) / line three after a blank
   line", sent right after a three-paragraph story, got the story back word for word. The prompt ends with the
   conversation and then the bare message; conversation lines keep their own blank lines, so a multi-line message after a
   multi-paragraph answer reads as more of that answer.
2. **A cut-off question leaks into the next answer** (G3 s12, QA5 s26, 3 of 3). After a reply was cut off by closing foo,
   the user asked something else ("7 aur 8 ka jod? sirf number") and got the sum plus tortoise names for the cut-off
   question, because that question went to the AI in the conversation with no answer after it.
3. **Try again that does nothing** (QA5 s20). The action row offered Try again under the welcome lines ("All set. I'm
   foo…"), which answer no question; tapping it did nothing (`chat.rewrite_skipped no_question`).
4. **A fake "Changed" line before the real one** (G4 s18, QA1 s44). "make the text bigger" showed the AI's own
   "Changed: Text size → 110%" and then foo's real line "Changed: Text size → 110%. Undo"; "Switch to dark mode" showed
   "Done. Dark mode is on." before foo's line. The AI's words claim a change before foo made it, and can disagree with it.
   Today's spec keeps them ("text already released stands").

## (b) Decision

1. When a conversation part comes first, the intake prompt puts one line `New message:` before the user's message (the
   words `steer_check` already uses, 08-4 §24.13a). With no conversation the message stays bare.
2. Part 7 "completed messages" leaves out a user message whose reply was cut off (the next foo text after it is `failed`)
   and not tried again. Try again still answers it: it is that turn's message, not its conversation.
3. Try again (action row and ⋯ menu) shows only under an answer that has a user message before it in the chat.
4. When intake decides `setting`, words the AI already showed are taken back: the bubble is emptied, the chat list does
   not show an empty finished answer, and foo's setting line (with Undo) is the only answer. This amends 08-4 §25.5 item 5
   for `setting` only, as CR-0067 did for a switched-off feature.

## (c) Evidence

| Test                                                                        | main 4ba43ef  | this change   |
| --------------------------------------------------------------------------- | ------------- | ------------- |
| `m3-prompt-builder.test.ts`: conversation · `New message:` · the message    | red           | green         |
| `cut-off-question-history.test.ts`: a cut-off question is not sent along    | red           | green         |
| `m2a-bubbles.test.ts`: Try again only after a user question                 | red           | green         |
| `settings-by-chat.test.ts`: the AI's "Done. Dark mode is on." is taken back | red           | green         |
| `m1b-message-column.test.ts`: an emptied finished answer leaves no row      | red           | green         |
| Release gate G2 s18, G3 s12, G4 s18, QA5 s20/s26 with QA's checks (#180)    | red (gate 10) | next gate run |
