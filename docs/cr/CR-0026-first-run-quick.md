# CR-0026: A quick first run: Welcome, name and face, a warm hello

- **Asked by:** Vikas, 2026-10-21 06:10Z (thread "AI setup and onboarding bugs", "see how bad the xperience is"): after the
  AI step his first run showed "Step 2 of 4 · Name it and pick a face" and then plain chat. Nothing asked his AI's name, there
  was no welcome, and the pill promised steps that never came. The real e2e test (2026-10-21 06:44Z) found the same on a fresh
  profile: the header said "Step 2 of 4" for hours, the chat row said "Setting up…", and "+ New helper" stayed locked.
- **Why:** only the splash and step 1 (CR-0020) were built. The Welcome card and steps 2–4 (06-1 §2.1, §2.3–§2.6) had no view.
  They were parked with M12 and then with P2 Feel T4 (CR-0023, waiting for his go).
- **Choice:** option A on the compare page "Your first five minutes with foo" (2026-10-21; `foo/first-run/`): the Welcome
  card, step 2 (name, face, vibe), a short warm hello with three things to try, and a step pill that counts only real steps.
  The interview and the first real job stay with P2 T4.
- **Spec sections:** 06-1 §2.0 (setup mode, step pill, "Skip the rest", rules 5 and 8), §2.1 Welcome, §2.3 Cards 2a, 2b and
  2c, 02 §F15.5 (face types), 08-5 §4.1 SetupCardPayload, 08-0 §A (identity).
- **Status:** Approved by Vikas, DECISIONS X-184: he said 2026-10-21 07:14Z "do not wait for any go or approval from me", so
  option A (my recommendation on the compare page) is approved on his behalf after the independent review in §(d)
- **Change:** code, tests and the DECISIONS row X-184.

## (a) Picks

1. **First run is welcome, then the AI, then step 2, then the hello.** `setup.step` 0 → Welcome card; "Let's go" →
   `setup.step = 1` and the AI finder; after "Use …" → `setup.step = 2` and Card 2a; then Card 2b; then Card 2c (a 05 Choice
   card, `purpose: 'setup'`, `setupCard: 'vibe'`). After the vibe line, or after "Skip the rest", `setup.complete = true`
   and `setup.step = 5`. foo then says "All set. I'm {name}, and I'm here whenever you need me. Ask me anything, or try one
   of these." with three suggestion chips (P1's reply chips): "What can you do?", "Help me write a message", "Plan my day
   with me". Setup completing unlocks "+ New helper" and ends "Setting up" in the chat row, header and footer.
2. **The step pill counts only the steps that exist:** "Step 1 of 2 · foo finds your AI", "Step 2 of 2 · Name it and pick a
   face"; the status line reads "Setting up · step {n} of 2" and the finder's striped pill fills half. The keys for steps 3
   and 4 are removed until P2 T4 builds them.
3. **Welcome** as §2.1, except: the card sits in the message column, not centred vertically, and "Privacy details" (the
   dialog) is not built yet, so the line under the card is just "Nothing leaves this PC unless you say so." Once answered,
   the welcome collapses to "Hi, I'm foo. → Let's go".
4. **Card 2a** as §2.3: 20 characters, counter from 16, both errors, "That's it" (Enter), Keep "foo" (blank = "foo"), and
   🎲 Surprise me with no repeat in a session. The list has 100 names, not 200. foo replies "{Name} it is."; the name goes
   to `identity.agentName` and foo's chat title at once.
5. **Card 2b** as §2.3: a 2 × 2 radiogroup; tile 1 is the living face ("Living face · Default", preselected); tiles 2–4
   start as ✿ on terracotta, ◐ on green and ★ on violet; 🎲 Surprise me redraws tiles 2–4 from 8 glyphs × 6 helper colours
   and never repeats a pair on screen. The chosen face is foo's chat `avatar_ref` (`living:default` or `glyph:{g}` with
   U+FE0E). Not built yet: "Use my own picture" and the §2.3.4 face explainer card.
6. **Card 2c** as §2.3: "Calm, a bit funny" (Best fit), "Straight to the point", "Warm and chatty", plus the Choice card's
   own "Something else…". foo answers with the vibe line. `identity.vibe` and `identity.vibeLine` are written; `identity.md`
   in memory and `identity.emoji` are not written yet.
7. **No per-card Skip yet** (§2.0 rule 2): Keep "foo" and the preselected living face are the defaults, and "Skip the
   rest" in the header (shown from step 2) skips every open card, says "Okay, skipping. You can change any of this in
   Settings." and completes.
8. **Resume** (§2.0 rule 8): every launch with `setup.complete = false` shows the card for `setup.step`. In step 2 that is
   the first of name, face and vibe not yet answered; nothing is asked twice. The "Picking up where we left off." line is not
   built yet.
9. **Using chip:** before an AI is chosen, the Details panel's Using list shows no AI chip (it showed an empty "(your AI)").
10. **New IPC channels** `setup:welcome`, `setup:name {name}`, `setup:face {face}`, `setup:skipRest`. The vibe uses
    `card:answer`.
11. **The sticky date follows scrolling only** (03-shell-2 §3.6.5): a tap on a card inside the thread, or a key typed into
    its field, no longer counts as scrolling, so the follow-scroll after an answer does not float a second "Today" pill over
    the inline one (real-PC test bug 13).

## (b) Not changed

Step 3 (the interview, §2.4), step 4 (the first real job, §2.5) and "See you tomorrow at 8" (§2.6) stay with P2 T4. No
migration.

## (c) Open items for the spec-keeper

06-1 §2.0: the pill and status line count 2 steps until §2.4–§2.6 ship. §2.0 gains the hello and its three tries as the end
of first run until then. 08-1 §3.2 gains the four `setup:*` channels. 08-0 §A `identity` gains `vibe` and `vibeLine` (the
spec's `avatarRef` lives on foo's chat row). `identity.agentName` is checked as 20 graphemes and stored up to 80 UTF-16
units, so an emoji or Devanagari name of 20 characters fits.

Known gaps against §2.3, left for P2 T4 or a later CR:

- A glyph face keeps its glyph but not its tile colour: `glyph:{g}` has no colour, so foo's avatar uses its usual colour.
- No live preview of a picked face in the header before "Use this face".
- Typed answers in the composer do not answer setup cards (§2.0 rule 3); per-card Skip (rule 2) and rule 4 are not built.
- The vibe Choice card has no `data-row-id` (it is a 05 Choice card, not a `card-setup`).
- The Surprise list should be checked for brand or trademark names before a public release.

## (d) Independent review

An independent reviewer read the change against 06-1 §2.0–§2.3, 08-0 §A, 08-1 §3.2 and 08-5 §4.1: **PASS WITH FIXES**.
Applied:

1. The vibe card completes first run however it is answered: `AnswerDeps.onAnswered` runs after every jobless answer (tap,
   keyboard, reaction, toast), not only `card:answer`. Test: the toast answer.
2. One name rule: 20 graphemes in main and in the field; settings are written before the rows and rolled back if the rows
   fail. "Something else…" words are cut at whole characters to 160 UTF-16 units so the vibe line fits 200. Tests: emoji and
   Devanagari names, long custom words.
3. "Skip the rest" writes the Best fit vibe when none was picked. Test: skip from the face card.
4. Considered and applied: a face outside the pool is refused; an open welcome is answered once the AI is chosen another
   way; Enter does nothing while a name is being saved; Home and End in the face grid.

A second reviewer re-checked the fixes: all in, no import cycle, no double firing. Its one new finding (the custom-word cut
counted graphemes, not UTF-16 units) was already fixed by the 160-unit cut above. The first-run cards load as their own
script to keep the first script inside the P1 budget (AT-322).
