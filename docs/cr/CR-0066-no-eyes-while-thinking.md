# CR-0066: 👀 never shows while foo's Thinking row is up

- **Asked by:** Vikas, 27 Oct 18:26Z, on the batch-1 app from main 4d7e1f9: "still showing on eery message 👀". Under his
  26 Oct 06:00Z ask ("fix all the bugs … one baseline of the full app").
- **Spec sections:** 04 §4.1 rule 4, §4.2 `seen`; DECISIONS X-216 item 4 (CR-0059 row 4).
- **Status:** Approved by Vikas's approve-on-my-behalf rule, DECISIONS X-223 (independent review, every check green; no spec clash).

## (a) What was wrong

CR-0059 row 4 held 👀 back for 2 s, so a quick answer never showed it. A real AI takes more than 2 s before its first word
on every message, so 👀 still showed on every message. Our tests used an instant fake AI and missed it. QA-X-F27 (QA
thread, fake AI slowed to 3 s) is red on 4d7e1f9; the CR-0059 sweep (AT-449) now sends a 4 s reply and is red there too.

## (b) Decision

1. A message's 👀 is not drawn while foo's Thinking row is up in that chat. The Thinking row already says foo is on it.
2. The 2 s hold of X-216 item 4 stays for the cases with no Thinking row: a queued job and a steer.
3. The engine keeps writing `seen` at intake (job flows and steers read it); only the bubble changes
   (`src/renderer/messages/Bubble.tsx`).

## (c) Evidence (local, Electron under Xvfb)

| Test                                                             | main 4d7e1f9 | this change |
| ---------------------------------------------------------------- | ------------ | ----------- |
| QA-X-F27 (QA branch `claude/project-thread-gzzs6c`, AI slow 3 s) | red          | green       |
| AT-449 QA-B1-080 step 2 (4 s reply: no 👀; quick reply: no 👀)   | red          | green       |
