# CR-0060: the batch-1 exploratory QA fixes

- **Asked by:** Vikas, 2026-10-26 06:00Z ("fix all the bugs … so that we can have one baseline of the full app", and a
  framework that finds bugs without him reporting them), applied to the exploratory QA run on the batch-1 app the same day
  (`/mnt/project-files/foo/qa-explore/2026-10-26/findings.md`, findings F01–F23, reviewed by Fable).
- **Why:** each finding below was reproduced in the real Electron app (fake AI) before the fix; the new bug-finder sweep
  `QA-B1-083` reports them on main c232e9e and none on this branch.
- **Spec sections:** 06-1 §2.3–§2.5 (name, face, vibe), 06-2 §6.2 (zoom line), §6.10 (Keyboard shortcuts), §6.11 (About),
  06-3 §19 (shortcuts sheet), 06-4 C-1 (Clear messages), 04 §6.2 (edit), 07 foo profile, 09 §9.17; CR-0054 (feature
  switches); DECISIONS X-217; 10-acceptance-2 AT-450.
- **Status:** Approved by Vikas's approve-on-my-behalf rule (two independent reviews, every check green), DECISIONS X-217.
- **Manifest:** `pnpm tsx scripts/spec-verify.ts --write` run in the same commit.

## (a) Trace rows

`AT-450` → `test/e2e/qa-b1-pages.spec.ts`, status `live`.

## (b) Findings → outcome

| Finding                                         | Outcome                                                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| F06 S1 profile is a blank screen                | built: foo's profile, batch-1 part (hero, Message foo, name, face, vibe)                               |
| F14 S1 the talk style never reaches the AI      | fixed: the engine passes `identity.vibeLine` to intake and replies (integration test fails before)     |
| F07 Shortcuts and About pages empty             | built: the §6.10 list; About shows the version (the other §6.11 rows come with their features)         |
| F15 Ctrl+/ and the menu item do nothing         | built: the 06-3 §19 sheet, with its filter                                                             |
| F05 hover buttons outside the pane              | fixed: a rich bubble leaves room for its toolbar inside the pane                                       |
| F03 face colour lost                            | fixed: a glyph face keeps its colour in `chats.color_token` (header, list, bubbles, sender name)       |
| F13 "change it in Settings"                     | copy: "on my profile: click my face at the top", which now exists                                      |
| F09 submenu covers its menu                     | fixed: a submenu opens beside its parent's edge, flipping left when it would leave the window          |
| F19 zoom line uses the AI's name                | fixed: says "foo", as 06-2 §6.2 writes it                                                              |
| F20 edit not told to the AI                     | fixed: editing a message that foo answered rewrites that answer (04 §6.2), through the X-216 rewrite   |
| F23 face answer is a bare glyph                 | fixed: "Face ◐ (half moon)"                                                                            |
| F17 job words in batch 1                        | the welcome line and Backup AI row drop the job words while `jobs` is off (chips: CR-0059); KEPT stays |
| sweep: Clear messages did nothing               | built: confirm C-1; the chat empties                                                                   |
| sweep: Ctrl+Shift+M, Ctrl+I, Ctrl+W do nothing  | wired: the ⋯ menu (or unmute), the profile, close the window                                           |
| F04, F12                                        | fixed in CR-0059                                                                                       |
| F02 name cut at 20                              | no change: 06-1 §2.3 sets 20                                                                           |
| F08 empty "Draft:"                              | not reproduced; the sweep checks for it                                                                |
| F01, F11, F22 (S3); F10, F18, F21 (design); F16 | not in this change; listed for the next pass (F16 is a spec gap, needs its own CR)                     |

## (c) Picks where the spec is silent

1. **The shortcuts list is gated.** A row shows only when the feature it opens is on (CR-0054), so batch 1 never lists a
   key that does nothing; the sweep presses every listed key that can be pressed alone and checks something changed.
2. **Profile, batch-1 part.** "Run setup again" and the memory, routines and files sections are not built (their features
   are off). Name, face and vibe write through new channels `profile:setName`, `profile:setFace`, `profile:setVibe`, with
   the same checks as setup; a name change also renames the chat.
3. **About** shows the wordmark and "Version {v}" (`app.getVersion()` in the bootstrap). The other §6.11 rows wait.
4. **Clear messages** soft-deletes every message and card of the chat in one write (`chat:clear`, `confirm: true`) and
   bumps the chat rev. The C-1 activity row is not written yet.
5. **Ctrl+Shift+M** unmutes a muted chat, else opens the chat ⋯ menu (the submenu is one more key). **Ctrl+I** opens the
   profile unless text is selected in a field, where it stays italic.
6. **Edit → rewrite.** After an edit, if the next message is foo's (or a helper's) complete text answer, it is rewritten
   in place by the X-216 rule (atomic, a plain reply, the old words kept on failure).

7. **The first script stays in its budget** (AT-322, 1,024 KB; 1,021.4 KB before this change). The new copy (2.8 KB) has
   to be in it, so foo's profile, the Ctrl+/ sheet, C-1 and the two cap dialogs (C-21, the AI finder's) now load on first
   open, or when the window is idle with the pages: 1,022.5 KB after. The budget is unchanged.

## (d) Review

Tier **high**: two independent reviewers (Fable and Opus), same diff, read-only. Findings and outcomes are recorded below.

| Finding (raised by) | Bucket | Outcome |
| ------------------- | ------ | ------- |
