# CR-0021: P1 Polish: quiet-premium motion, the living face in the app, suggestion chips, Mica, Sounds and the 104 details

- **Asked by:** Vikas, 2026-10-20 07:42Z (thread "Premium polish for foo"): "okay we are good to proceed with all changes ...
  under Milestone .. create tickets and do start implementing alongside". He picked level **A · Quiet premium** on the
  plan's card (calm delight; Windows "Animation effects" off and foo's Animations Basic / Off stay fully calm). Plan:
  https://claude.ai/artifact/6gt9xG3TJq3zaT2sF8MdPN (v3); research in the project's `foo/polish/re/`.
- **Why:** the audit scored foo 10/15 on the premium rules (execution 1/5). The cause is the spec, not the code: 02 §F7
  lists "what animates (and nothing else)" with no spring, §F16.1 bans mascots so the face never reaches empty states, §F22
  bans every sound and 02-3 §F28.4 bans Mica. Every face is a letter in a circle because the living face (§F15.9) never
  merged. This CR relaxes those rules just enough for "quiet premium" and lists the 104 small details as the new §F7 list.
- **Spec sections:** 02 §F1, §F4, §F7; 02-2 §F15.9.1 (brand-mark row), §F15.9, §F16.1–§F16.3; 02-3 §F22, §F25.4, §F28.4; 04 composer (§19, §21, §22);
  05 checklist and Approval (05-1, 05-2); 06-1 §1.3, §2.2; 06-2 §6.2; 09 §9.14.3; 10-acceptance-2 §C.7, §C.8 (new), §E.
- **Status:** Approved by Vikas's approve-on-my-behalf rule (his messages 2026-10-18 14:56Z and 14:59Z), after the independent review in §(f), DECISIONS X-179
  (the direction itself is Vikas's own approval, 2026-10-20 07:42Z).
- **Change:** `spec/constitution/DECISIONS.md` (row X-179); `02-foundations.md` (§F1 subtitle and money rows, §F4 dark
  shadows, §F7 springs and the new §F7.1 list); `02-foundations-2.md` (§F15.9.1 brand-mark row: the splash shows the living face; §F16.1 the face is the one
  mascot; §F16.2 a face pose may take the icon slot);
  `02-foundations-3.md` (§F22 optional Sounds, §F28.4 optional Mica and the dialog backdrop blur); `04-messages-and-composer-2.md` (§21.7 suggestion
  chips); `06-screens-1.md` (§1.3 splash eyes); `06-screens-2.md` (§6.2 three new rows); `10-acceptance-2.md` (§C.8
  AT-300…AT-327); `spec/trace.csv` (§(a)); `design/tokens.json` and its generated files;
  `docs/fidelity/disputes.json` (§(g), as tickets find them). Golden baselines change only through the bless workflow
  citing this CR.
- **Manifest:** `pnpm tsx scripts/spec-verify.ts --write` run in the same commit.

## (a) Trace rows and the milestone label

P1 is not a plan milestone and trace ids take `M<n>` only. It ships right after M9 (Vikas: "alongside" M9, merged into main
after it), so its rows are labelled **M9** (the CR-0020 pattern). Each ticket adds its own test file; T1 writes the rows as
`pending` and the close-out flips them `live`.

| Ids                                           | Ticket | Test file                          |
| --------------------------------------------- | ------ | ---------------------------------- |
| AT-300, AT-315, AT-316, AT-317                | T1     | `test/unit/p1-contracts.test.ts`   |
| AT-301, AT-302, AT-303, AT-326, AT-327        | T3     | `test/e2e/p1-motion.spec.ts`       |
| AT-304, AT-305, AT-306 (and §C.7 in-app rows) | T2     | `test/e2e/p1-face.spec.ts`         |
| AT-323                                        | T4     | `test/e2e/p1-chatlist.spec.ts`     |
| AT-324                                        | T5     | `test/e2e/p1-messages.spec.ts`     |
| AT-307, AT-308, AT-309, AT-325                | T6     | `test/e2e/p1-composer.spec.ts`     |
| AT-308 (engine half)                          | T6     | `test/unit/p1-suggestions.test.ts` |
| AT-310, AT-311, AT-312                        | T7     | `test/e2e/p1-cards.spec.ts`        |
| AT-312 (time-saved table)                     | T7     | `test/unit/p1-time-saved.test.ts`  |
| AT-313, AT-314                                | T8     | `test/e2e/p1-first-run.spec.ts`    |
| AT-318, AT-319, AT-320, AT-321                | T9     | `test/e2e/p1-appearance.spec.ts`   |
| AT-322                                        | T10    | `test/unit/p1-bundle.test.ts`      |

The living face's own §C.7 rows that are in the app (C.7.1–C.7.6, C.7.8, C.7.11–C.7.13) are built here, early; the tray and
toast rows (C.7.7, C.7.10) stay with M11, which still owns tray, toasts, taskbar badge and progress, and jump list.

## (b) Picks where the spec is silent or forks

1. **Springs are CSS `linear()`.** §F7 gains `--ease-spring` (overshoot 2.6 %, for things that land: dialogs, the Approve
   card, chips, badges) and `--ease-spring-soft` (no overshoot, for things that slide: chat and page changes, panels), with
   `--m-spring` 400ms. The no-library rule stays (no `motion`, `framer-motion`, Web Animations API). Overshoot never
   exceeds 4 % scale or 2px; nothing bounces twice.
2. **Exits are faster than entrances.** Every exit uses `--ease-out` at `--m-normal` (167ms) or less; an entrance is
   `--m-slow` (250ms) or `--m-spring` (400ms).
3. **Basic and Off stay calm.** `data-motion="basic"` turns every spring into a `--m-basic` fade; `"off"` and Windows
   "Animation effects" off follow the 02-3 §F25.4 table. Reduced motion stays in one place, `tokens.css` (FE-24); T1 moves
   the 10 per-file `prefers-reduced-motion` blocks there.
4. **Chat and page changes slide 18px** with `--ease-spring-soft` and a cross-fade; going back slides the other way. The
   old view leaves in `--m-normal`. Pages slide from the right; back slides left.
5. **Weighty dialogs.** Dialogs and the Approve card enter at scale 0.92 → 1 with `--ease-spring` and `--shadow-28`; while a
   dialog is open the shell behind scales to 0.96 with a 2px blur under `--scrim` (§F28.4 amended for this one
   backdrop; none at Basic / Off or in high contrast). Menus and popovers scale from the button
   that opened them (transform-origin at the anchor).
6. **The face is the one mascot** (§F16.1). The living face (§F15.9, from the parked `claude/foo-living-face-taptxv`
   branch) replaces every letter face. Empty states may show a 64px face in a pose instead of the 24px icon (§F16.2 icon slot): no
   results → the scan motion (eyes only), nothing yet → Resting with a slow blink, a cleared filter or forgotten list →
   the Noticed pose. These poses are **decorative illustrations, not moods**: no ring, `aria-hidden="true"`, never in a
   chat row or header, so §F15.9.3a and §C.7.3 (the face shows only real state) still hold. L-1/L-2/L-3 drawings stay where §F16.1 puts them. Still no AI-made, stock or paid art.
7. **Idle life is small.** Resting blinks (`--m-face-blink`, random 2–6 s) and, at 40px and larger, bobs 1px every 4 s.
   Every face pauses when the window is hidden or minimised (`document.visibilityState`), and in groups (§F15.9.3d).
8. **"Show foo's eyes"** (Settings → Appearance, default on, `appearance.faceMotion: boolean`). Off: every living face holds
   its still pose (as reduced motion does) while moods still show by rings. The face is never replaced by a letter.
9. **Splash** (06-1 §1.3): the 96px face sits above the wordmark and its eyes open from a line once (Waking up, 600ms),
   then rest. The still lockup is not used on the splash (§F15.9.1 brand-mark row amended); the app icon,
   taskbar button and installer logo never animate (X-143, AT-277).
10. **Suggestion chips** (04-2 §21.7, new). One row of `Chip`s above the composer field:
    - an empty chat (no messages yet) shows 3 starter chips: foo's chat "Plan my day", "What needs me?",
      "Pay a bill"; a helper's chat "What can you do?", "Show what you're working on", "Help me with something"
      (keys `composer.suggest.starter.{foo,helper}.{1,2,3}`);
    - after foo's or a helper's latest reply that carries suggestions, up to 3 follow-up chips;
    - a click fills the field with the chip's text and focuses it; it **never sends**;
    - the row hides on the first keystroke, while recording, in groups and WhatsApp mirrors, in a private chat, and when
      the latest reply holds an Approval, Payment, Draft or Secret card or the job touched money;
    - follow-ups come from the AI: the reply format allows a last line `Suggestions: a | b | c` (≤ 3, each ≤ 40 chars);
      the engine strips it from the bubble text, runs Article 2's word filter on each and stores them on the message
      (`MessageRow.suggestions: string[] | null`, column `messages.suggestions` JSON, migration 0003). Nothing is invented by the app.
11. **Composer states.** Hold-to-talk floods the round button dark (`--bubble-me`) outward; the send button turns into ✓ on
    delivery for 2s (`--dur-confirm`) and into Stop while foo works (the existing Stop, 04-2 §21.2). Placeholder becomes
    "Add details…" while a job of this chat is WORKING.
12. **Checklist.** Steps keep their runner names and get their 16px Fluent icon by step kind (the `StepKind` enum of
    pick 14). The live step's label shimmers (`--m-shimmer`). Sources the step read appear as small favicon chips
    (site name, no remote images: the letter tile of §F17.6 when there is no bundled logo) and fold into an overlapped pile of
    at most 5 with "+{n}" after 3.
13. **Job-done peak and end card.** A job that turns DONE with proof: the face plays Happy (and Celebrating with its 3 sparks
    on the first such DONE of the day, §F15.9.3 #11 unchanged). The DONE card gains one line "{job title} · saved you about {n} min.",
    built from the job's own title and the runner's finished steps, never from AI text (Article 12) and the composer shows up to 3 follow-up chips (pick 10) as the next step. No confetti, no sparks on a
    money card, nothing on DONE "⚠ Not checked live".
14. **Time saved is a fixed table, never a guess by the AI** (Article 12). One step-kind enum (`StepKind`: search, read,
    fill, send, sign_in, pay, wait) drives both the checklist icons (pick 12) and this table. Per finished step: search 2,
    read (or compare) a page 3, fill a form 6, send a message or email 3, sign in 2, pay or book 5, wait 0 min; summed, rounded
    to the nearest 5 and shown only when ≥ 5 min. The table lives in `src/shared/timeSaved.ts`.
15. **Money weight.** Weight 700 (new `--t-money`, `font-variant-numeric: tabular-nums`) is used only for money amounts
    (Approval, Payment, Spend). Everything else stays 400/600 (and the 800 wordmark).
16. **Subtitle 17.** `--t-subtitle` becomes 17/24 600 so body (15) and subtitle differ by 2px.
17. **Dark depth.** In dark, `--shadow-4`, `--shadow-16` and `--shadow-28` become two layers plus a 1px edge ring
    `rgba(255,255,255,.06)`; light values are unchanged.
18. **Pressable "lip" on primary buttons.** `Button variant="primary"` gets a 2px bottom lip (`--accent-pressed`) that
    flattens on press in `--m-fast`; the 0.97 press scale stays for every other button.
19. **✓ text glyphs go.** The 8 copy strings that start with "✓" and the JSX ✓ in `SecretBox.tsx` become the Fluent
    `Checkmark` 16 icon beside the words (§F6: one icon set). AT-315's scan skips comments (spec headers quote ✓).
20. **Sounds** (§F22, optional). Settings → Appearance "Sounds" (`appearance.sounds`, default **off**). On: two soft sounds,
    made in the renderer with Web Audio (no audio files, no network): Approve (when an Approval or Payment card turns
    APPROVED by the user's tap) and Done (a job of the open chat turns DONE with proof). Never in quiet hours, never while
    the window is hidden, never the only signal. Toast sounds stay Windows' own (09 §9.9.1).
21. **Mica** (§F28.4, optional). Settings → Appearance "See-through sidebar" (`appearance.mica`, default on): on Windows 11
    build ≥ 22000 with Windows "Transparency effects" on, the main window uses `backgroundMaterial: 'mica'` and the left
    shell and title bar draw `--bg-sidebar-surface` (`--bg-sidebar` at 82 %) so Mica shows; everywhere else, in high contrast, on Windows 10, and in
    FOO_TEST runs, surfaces stay solid. The chat column and right shell are always solid.
22. **The Appearance page** (06-2 §6.2) is built whole by T9: Theme, accent, Zoom, Animations, the preview tile, plus the
    three new rows (Sounds, See-through sidebar, Show foo's eyes) under the Animations row. Zoom keys (09 §9.14.3,
    Ctrl+= / Ctrl+- / Ctrl+0 / Ctrl+wheel) come with it so the Zoom row works; M11 drops them from its list.
23. **Kept in their milestones** (the §F7.1 list names them so they ship polished): tray face, taskbar badge and progress,
    face toasts, jump list and Focus mode (M11); Welcome, name, face, interview, first job and "See you tomorrow" (M12);
    Ctrl+K search palette (M13, J22); Spend meters (M10); branded installer (M14); Routines and Activity pages (M10/M13).
24. **A detail whose surface is not built yet** ships with that surface; the ticket that owns its area lists it in its PR.

## (c) Contracts T1 lands

- Tokens (`design/tokens.json` → generated): `ease.spring`, `ease.spring-soft`, `m.spring` 400ms, `t.subtitle` 17/24,
  `t.money`, dark `shadow.4/16/28`, `accent.pressed` lip colour, `face.pose-size` 64px.
- `src/renderer/ui/Presence.tsx` (FE-24 contract, exactly as §F7 states it).
- Reduced motion in one place: `tokens.css` handles `prefers-reduced-motion` and `data-motion`; per-file blocks removed.
- Settings (`08-0 §A`): `appearance.sounds` (false), `appearance.mica` (true), `appearance.faceMotion` (true).
- `MessageRow.suggestions: string[] | null` (08-5 shared types) and migration `0003_message_suggestions.sql` (one nullable
  JSON column `messages.suggestions`, forward-only, 08-1 §4.2). The next milestone's first migration is 0004.
- The renderer → main `face:raster` event of 08-1 §3.3.1 (types and preload `send` only; M11 consumes it).
- Copy keys and test ids every ticket needs, listed in `scripts/copy-pending.json` with their owning ticket; a ticket that
  needs another key asks the lead, who adds it on the milestone branch.
- The 8 "✓" copy strings and `SecretBox.tsx:422` (pick 19).

## (d) Not changed

One migration (0003, a nullable column). No new IPC invoke channel. 09 Windows is unchanged except that zoom is built now (pick 22). M9-owned files
(browser lane, sign-in banner, live window, `aiFinderIpc.ts`) are not touched by this CR.

## (e) Open items for the spec-keeper

04-2 §28 copy register gains the starter chips; 08-2 reply parsing gains the `Suggestions:` line (pick 10); 08-5 gains
`MessageRow.suggestions` and 08-1 §4 the `messages.suggestions` column. M11's ticket list drops zoom keys.

## (f) Independent review

Fable reviewer, 2026-10-20 ~08:00Z, read-only, against the handoff, the cited spec sections, the repo rules and the ticket
map. **Verdict: PASS WITH FIXES**; applied:

- Act: the dialog backdrop blur is added to the §F28.4 amendment (pick 5); §F16.2 and the §F15.9.1 brand-mark row are added
  to the amended sections, and empty-state poses are decorative, never moods, so §F15.9.3a / §C.7.3 hold (picks 6, 9); the
  §F7.1 "typing dots" item became the row's "typing…" word breathing (X-36); 8 ✓ strings, not 6, and AT-315 skips
  comments (pick 19); starter chip words are listed (pick 10); map: T10 blocked by T2, T9 gets its own CSS file, the
  Memory and reply-strip details have owners.
- Consider, applied: the end-card line comes from the job title and runner steps, never AI text (pick 13); one `StepKind`
  enum for icons and minutes (picks 12, 14); T8 waits for M9 on main; T9's main-side file is narrowed to a new
  `appearance.ts`. Kept: 10 tickets (logged in `docs/decisions/P1.tsv`); the M9 label (P1's rows are not on M9's branch).
- Noted, no issue: numbering (CR-0021, X-179, AT-300…327, migration 0003) is free; no Article 2 word in the new strings;
  Article 11 / 12 hold (Happy and the end card only with proof, time saved from a fixed table).

After the review, ART-21 flagged "What needs me today?" (a relative day with no date), so the starter reads "What needs
me?". Recorded as approved on Vikas's behalf under his standing rule (2026-10-18 14:56Z and 14:59Z); the direction itself
is his own approval (2026-10-20 07:42Z).

## (g) Tier R disputes

Motion is off in golden captures, so springs change no picture. The static changes (subtitle 17, money 700, dark shadows,
lips, the face instead of letters, chips above the composer, Mica off in tests) do change pictures. Each ticket that sees a
Tier R check fail because the app now follows this CR adds the step and the failing checks to `docs/fidelity/disputes.json`
with `cr: "CR-0021"` and a row in this table; an app that is simply wrong is fixed instead.

| Steps | Checks | Drawing vs app |
| ----- | ------ | -------------- |
