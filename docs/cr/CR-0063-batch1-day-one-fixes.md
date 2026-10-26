# CR-0063: the batch-1 day-one fixes (F21, F22)

- **Asked by:** the QA re-test of PR #157 (26 Oct, 19:36Z), relayed by the coordinator under Vikas's 06:00Z "fix all the
  bugs … one baseline of the full app". Vikas is likely to install in the evening (IST), so both show on his first launch.
- **Why:** two S3 findings on the batch-1 build:
  - **F21**: right after setup foo's face is faded and asleep and the header says "Quiet until 7:00 AM".
  - **F22**: the "1 new message" line stays on screen through the whole of setup.
- **Spec sections:** 08-0 §A `notifications.quiet` (default on, 22:00 to 07:00), 02-2 §F15.9.3 (the `asleep` mood), 03-shell-2
  §3.6.2.1 (status row 11), 02-3 §F22 (sounds), 03-shell-2 §3.6.5 (the unread divider), CR-0054 (feature switches; `notify`
  is batch 5); DECISIONS X-220; 10-acceptance-2 AT-453.
- **Status:** Approved by Vikas's approve-on-my-behalf rule (independent review, every check green; no spec clash),
  DECISIONS X-220.

## (a) Picks

1. **F21, quiet hours in batch 1.** Quiet hours are part of notifications (`notify`, batch 5): they hold unprompted items
   and silence sounds. Batch 1 has no unprompted items and no Notifications page, so the user can neither see nor change
   them. While `notify` is off the renderer treats them as off (`quietHours()` in `src/renderer/store/live.ts`): the face
   is never asleep for them, there is no "Quiet until" status line, and sounds are not silenced by them. The stored setting
   is untouched, so turning `notify` on later brings quiet hours back as they were.
2. **F22, the unread divider during setup.** §3.6.5 removes the divider when the user sends a message, but setup is answered
   with its own cards (name, face, talk style), so it never went. Setup is the user talking with foo step by step, so none
   of its messages is "new": while `setup.complete` is false there is no divider, and it does not come back when setup ends.

## (b) Trace rows

`AT-453` → `test/e2e/qa-b1-dayone.spec.ts`, the sweep `QA-B1-085`: batch 1 set up at 22:30 IST (inside the default quiet
hours), checked at the welcome, the name step, the face step and after setup for an asleep face, "Quiet until" and the
divider. The window's clock starts at 22:30 in the runner's zone through `FOO_TEST_NOW` (FOO_TEST runs only, read where the
fake clock is made, `src/main/deps.ts`), because the renderer reads main's clock once at start and `test:clock` does not
reach it. Run with `TZ=Asia/Kolkata`, so the default test epoch (9:00 AM IST) would not be in quiet hours: with both fixes
reverted the sweep reports 7 problems (asleep twice, "Quiet until" once, the divider four times); with them, none.
The face rule also has a unit case (`test/unit/face/moods.test.ts`).

Neighbours re-tested: the QA-B1-080 / QA-B1-083 sweeps (qa-b1-sweep), the about sweep (qa-b1-about), first run
(cr-0026-first-run, p1-first-run), the unread divider and chat open (m1-shell-main, m2-messages), the face moods and quiet
hours with every feature on (unit and p1 face tests).

## (c) Review

Tier **medium**: one independent reviewer (Fable), read-only, on the working-tree diff.

| #   | Finding                                                                                                    | Outcome                                                                      |
| --- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1   | The e2e set the clock after launch; the renderer never sees `test:clock`, so the quiet half was not proven | Fixed: `FOO_TEST_NOW` starts the fake clock at 22:30 local; re-proven in IST |
| 2   | `useSounds` read the rule through an inline function; `live.ts` header still named the direct read (nits)  | Fixed                                                                        |

No production must-fix: every renderer reader of quiet hours goes through `quietHours()`; a normal launch keeps its
divider (settings not loaded reads as "not in setup"); X-220 clashes with no DECISIONS row.
