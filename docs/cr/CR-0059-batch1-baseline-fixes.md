# CR-0059: the batch-1 baseline fixes

- **Asked by:** Vikas, 2026-10-26 06:00Z, after a day of using the batch-1 app: "Go ahead and fix it and fix all the bugs …
  fix it and merge it from here so that we can have one baseline of the full app." He also asked for a framework that
  finds these bugs without him reporting them.
- **Why:** six things he saw in the batch-1 app (install, ai, name, chat, settings), each reproduced on the fake AI in the
  real Electron app before the fix:
  1. "Write this answer again" did nothing on a finished answer (`message:retry` only handled a failed reply).
  2. An older answer's Copy / Try again / 👍 / 👎 row (CR-0024 pick: absolutely placed below the bubble) drew over the next
     bubble, and opening ⋯ put the React button over the words.
  3. With `jobs` off, the chat list still showed the job filter chips and the sidebar the "₹0 of ₹1,000" spend line.
  4. 👀 showed on every message, even ones answered at once, as a flat glyph.
  5. Deleting a message left a "You deleted this message" bubble.
  6. Asked "did you book my cab?", foo said it had "no record" of it instead of saying it cannot do tasks yet; off-feature
     replies said "later batch".
- **Spec sections:** 04 §4.2 (`seen`), §6.3 and §10.4 (deleted bubble), §17.1 (Try again); 03-shell-1 §3 (filter chips,
  sidebar footer); CR-0024 (older-answer row); CR-0054 (feature switches); 10-acceptance-2 PERF-07; DECISIONS X-216;
  10-acceptance-2 AT-449.
- **Status:** Approved by Vikas's approve-on-my-behalf rule (two independent reviews, every check green), DECISIONS X-216.
- **Change:** DECISIONS X-216 states the six rules and wins over the chapter text; AT-449 added; `golden/manifest.json`
  marks UX-05-02 and UX-12-01 superseded (X-216) for the 👀 picture.
- **Manifest:** `pnpm tsx scripts/spec-verify.ts --write` run in the same commit; `pnpm golden:manifest` regenerated.

## (a) Trace rows

`AT-449` → `test/e2e/qa-b1-sweep.spec.ts`, status `live`. The sweep is also scenario `QA-B1-080` in `pnpm qa`.

## (b) Spec before → after

| #   | What Vikas saw                              | Before                                                    | After (X-216)                                                                                                |
| --- | ------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1   | Try again does nothing                      | 04 §17.1 rewrite in place, not built for a finished reply | built: same bubble, new words, "Rewritten", "Show earlier answer" (`messages.earlier_text`, migration 0006)  |
| 2   | Buttons over the next message               | CR-0024: every answer keeps its action row on hover       | only the newest answer shows the row; older answers use the ⋯ menu                                           |
| 3   | Job filters and ₹ line in batch 1           | always shown                                              | chips hidden while `jobs` is off; the spend line hidden while `spend` is off on a key-billed AI              |
| 4   | 👀 on every message                         | 04 §4.2: on the first byte, ≤ 1 s (PERF-07)               | only after foo has been on it 2 s, as blinking 3D eyes; PERF-07 times send → ✓✓ read (the same write) ≤ 1 s  |
| 5   | "You deleted this message" left behind      | 04 §6.3 / §10.4 tombstone bubble                          | the bubble leaves the chat; the chat-list preview moves to the message before                                |
| 6   | "No record of booking a cab"; "later batch" | feature-off lines named batches; intake silent            | plain lines; with `jobs` off intake is told foo cannot do tasks yet and must say so when asked if it did one |

## (c) Picks where the spec is silent

1. **Chat-list preview.** The sweep found that the chat list kept the old answer after Try again: a message update did not
   bump the chat's rev, so the window dropped the chat:upsert as stale. A change to the last message's words now bumps the
   chat rev in all three places that make one: the engine's `updateRow`, `editMessage` and `deleteMessages`.
2. **The eyes picture** is Microsoft's Fluent Emoji 3D "eyes" (MIT, `@lobehub/fluent-emoji-3d` 1.1.0), served from
   `src/renderer/public/emoji/eyes-3d.webp` (3.6 KB) so the first-script budget (AT-322) is untouched. Blink: one scaleY
   dip per `--m-face-blink-slow`; with reduced motion (`--motion-move` 0) the eyes stay open.
3. **The bug-finder sweep** (`QA-B1-080`) checks behaviour, not code: every ⋯ menu item must change what the user can see
   (words, open dialogs and pickers, pressed states, the composer or the clipboard, read with no menu open), no hover
   control may overlap another bubble's words, switched-off features leave no trace, 👀 timing, Try again from the action
   row and from an older answer's ⋯ menu, and delete (bubble and chat-list preview). Run on main c232e9e (before this
   change) it reports Vikas's bugs 2–5 and the Try again failure by itself; on this branch it reports none.
4. **A rewrite is atomic.** The new answer is not streamed into the old bubble: the Thinking row shows while the AI
   works, and the old text, chips and status are replaced in one write when the new answer is complete. A failure, Stop,
   the spend cap, no AI or a restart leave the old answer as it was (logged `chat.rewrite_kept` / `chat.rewrite_skipped`).
   The rewrite is always a plain reply (`act` forced to `reply`, as for a side question), so Try again never starts a
   job, saves a memory or changes a setting. A 👍/👎 given to the old words stays on the bubble.

## (d) Review

Tier **high** (`pnpm review:tier`: spec, golden, CR, fidelity gates, AI engine, IPC trust): two independent reviewers
(Fable and Opus), same diff, read-only. Round 1 on d3052aa, round 2 on a117312 (new commit only), fixes in the next commit.

| Finding (raised by)                                                                                      | Bucket    | Outcome                                                                                          |
| -------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------ |
| R1 A streamed rewrite dropped its deltas (renderer delta count) (Fable)                                  | Act on    | fixed: a rewrite no longer streams into the old bubble                                           |
| R1 Old answer wiped before the new one existed; failure / Stop / restart left a failed bubble (both)     | Act on    | fixed: one final write; failure, Stop, cap, no AI, restart keep the old answer                   |
| R1 Retries and early exits lost the rewrite; answered message flipped to "Waiting to send" (both)        | Act on    | fixed: `again()` keeps it; no queued write for a rewrite                                         |
| R1 A rewrite could become a job, memory, setting or a second feature-off line (Opus)                     | Act on    | fixed: `act` forced to `reply`                                                                   |
| R1 Old chips / badge / backup mark stayed under the new words (both)                                     | Act on    | fixed (round 2 added `provider_note`)                                                            |
| R1 The sweep's menu check could never fail (Opus)                                                        | Act on    | fixed; proved by making Copy a no-op: the sweep reported it on both bubbles                      |
| R1 Delete / edit left a stale chat-list preview (Opus); R2 preview went blank, not to the message before | Act on    | fixed: rev bump in all three paths; `last_message_id` moves to the newest message not deleted    |
| R1 IPC accepted any non-user author (both)                                                               | Act on    | fixed: foo or helper only; the §17.1 rule holds because a rewrite is only ever a reply           |
| R1 PERF-07 retarget could count an older row (Opus)                                                      | Act on    | fixed: only the run's own row; PERF-07 spec row updated                                          |
| R1 Unread divider counted deleted rows; older-row code left in place (both)                              | Act on    | fixed: filtered once in the messages memo; `older` path and its CSS removed                      |
| R1 Earlier answer: spec key, Link, formatting, aria-controls (both)                                      | Act on    | fixed: `bubble.actions.earlier_answer`, `Button variant="link"`, the bubble's `Blocks`           |
| R1 Try again from an older answer's ⋯ menu untested; UX-13-01 also draws 👀; ids and wording (Opus)      | Act on    | fixed                                                                                            |
| R2 Restart mid-rewrite left 👀 on the answered message (Fable)                                           | Act on    | fixed: a rewrite turn never sets `seen`                                                          |
| R2 A kept / skipped rewrite was silent (both)                                                            | Act on    | fixed: one line "I couldn’t write a new answer just now, so I kept the one above."               |
| R1 Spend line gated on `spend`, spec said `jobs` (Opus)                                                  | Act on    | fixed in X-216's words (the code was right)                                                      |
| R1 After a restart the asked message is found by seq (Fable)                                             | Consider  | intentional: the same rule cut-off retries use; persisting the link is a schema change for later |
| R2 A rewrite skips the memory "Used:" bookkeeping (both)                                                 | Noted     | memory is off in batch 1; decide when memory ships                                               |
| R2 Rewriting a job's result message when jobs are on (Fable)                                             | Noted     | unreachable in batch 1; the rewrite is a plain reply and runs no action                          |
| R1 Real 2 s timer vs the fake clock in the sweep (Opus)                                                  | Consider  | no-matter for now; the quick answer lands in well under 1 s                                      |
| R1 / R2 nits: optional `earlierText`, `jobsOn` param, one label for the Link                             | Dismissed | no-matter                                                                                        |

Result: found 33, verified by both rounds, fixed 26, wrong 0. Approved on Vikas's behalf once every check is green.
