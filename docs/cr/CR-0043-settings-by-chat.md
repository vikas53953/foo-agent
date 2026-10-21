# CR-0043: change settings by chat

- **Asked by:** Vikas, 2026-10-21 18:53Z (project chat), answering "should I pull just 'change settings by chat' forward from
  M13 now?" with "YES". The real-AI run 13 (Claude CLI, main 3a35be0) found the gap. The coordinator gave the number and
  scope: the setting kind only; routines stay paused.
- **Why:** "Switch to dark mode" got "I didn't get that. Say it another way?". Intake understood it (3 of 3 CLI replays:
  `kind: 'setting'`, `appearance.theme`, `dark`), but the setting kind belongs to M13, so the chat lane posted the
  empty-reply line. The CLI replays also showed that the prompt named no paths: 5 of 8 settings asks came back with paths
  that do not exist (`voice.replies`, `purchaseCap`, `notifications.quietHours`, `appearance.textSize`).
- **Spec sections:** 08-4 §25.6 (CR-0043 amendments), §24.5 (`intake.md`, the "setting" line); DECISIONS X-201.
- **Status:** Approved by Vikas's approve-on-my-behalf rule, DECISIONS X-201 (his messages 2026-10-18 14:56Z and 14:59Z,
  2026-10-21 07:14Z, and his "YES" 18:53Z; after the independent review in §(d))
- **Change:** the sections above, as listed in §(b).
- **Manifest:** `pnpm tsx scripts/spec-verify.ts --write` run in the same commit.

## (a) Trace rows

`AT-094` (J21) → `test/integration/settings-by-chat.test.ts`, status `pending`: the dark-mode, Undo and purchase-cap parts
pass, and the voice-replies part waits for `chat.voiceReplies` (today foo says "I can't change that one yet.").

## (b) Spec before → after

| #   | What the run saw                                  | Spec before                                        | Spec after                                                                                             |
| --- | ------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1   | "I didn't get that" for "Switch to dark mode"     | §25.6 (M13, not built)                             | §25.6 built for the paths in this build, with the line, Undo and the refusal                           |
| 2   | The AI guessed paths (`voice.replies`, …)         | `intake.md`: "a change to how foo behaves, like …" | `intake.md` names each path and its values; anything else is still "setting" with a close path         |
| 3   | Allow-list paths whose setting does not exist yet | silent                                             | "I can't change that one yet." (`chat.voiceReplies`, `notifications.kinds.*`, `mutedChats`, `brief.*`) |
| 4   | How the line is stored and what Undo shows        | silent                                             | a system line with `why.settingLine`; "Changed back: …"; too-late wording                              |

## (c) Picks where the spec is silent

1. **Quiet hours in one ask.** "Quiet from 10 PM to 7 AM" is three leaves; `notifications.quiet` takes the parts named, so it
   is one change, one line and one Undo.
2. **Not built ≠ refused.** "That's one for you to change" would send the user to a Settings row that does not exist yet, so
   the paths on the list whose setting is missing say "I can't change that one yet." instead.
3. **Open Settings opens the page**, not the row: the Notifications and Privacy pages have no rows yet (M13). The page comes
   from the path's first part; money words go to Money.
4. **One apply for every caller.** `settings:set` (renderer), the engine's `settings.set` and `settings:undo` share
   `applySetting`, so the change record and checks are the same. Theme and zoom changes from the Appearance page now write
   `setting_changed` rows too, as 08-1 §4.4.2 step 3 already says.
5. **Buttons reuse `thread-marker-link`** (the mirror line's Open), told apart by `data-action`, so no new test id.

## (d) Review

An independent Fable review of this CR and its diff, recorded in the PR and in `docs/decisions/real-pc.tsv` ("approved on
Vikas's behalf" on pass).
