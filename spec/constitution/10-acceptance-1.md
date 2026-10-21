# 10 · Acceptance (the QA constitution) · part 1 of 2

This chapter decides when any part of foo is **done** and how that is proved. Nothing ships on "it works on my machine". A surface, journey or build is done only when every test that applies to it passes and the evidence in §G is filed.

- **Part 1 (this file):** §A Definition of done · §B Acceptance tests AT-001 to AT-157 and AT-200 to AT-226 (AT-134…AT-150 added for the owner's answers, B.5; AT-151…AT-157 and AT-200…AT-226 added in review Phase 1, B.7; AT-267…AT-288 added 2026-10-17 for round 2, X-142, the Look Book and the real-app changes, B.10). AT-158…AT-199 and AT-230…AT-266 are the J24–J30 tests in `12-features-r25-r31-*.md`, listed by pointer in §B.9 (12-* is the source).
- **Part 2 (`10-acceptance-2.md`):** §C Per-surface checklists · §D Article compliance tests · §E Performance tests · §F Stranger test · §G Evidence.

Rank: level 6 in the README order of authority. Tests check the specs; they never change them. If a test and a spec disagree, the spec wins, the test is fixed, and the disagreement is logged in `GAPS.md`.

---

## §A Definition of done

A.1 **Scope.** "Surface" means any window, screen, panel, card, bubble, bar, dialog, toast, tray menu or Windows integration listed in 03–06 and 09. "Journey" means J1–J23 (07) and J24–J30 (12-1, 12-2).

A.2 **A surface is done only when ALL of these are true.** Each item is pass/fail; one fail = not done.

| # | Requirement | Proved by |
|---|---|---|
| A.2.1 | Every state named for it in 03–06 is built: rest, hover, pressed, focus, disabled, loading, empty, error, offline, plus its own states (e.g. an approval card's 10 states). A missing state is a bug (Article 25). | §C checklist row + screenshot per state (§G) |
| A.2.2 | Only tokens from `02-foundations.md` are used for colour, size, font, radius, shadow and motion (Article 24). | ART-24a automated scan |
| A.2.3 | Copy matches the spec word for word, with §7.5 amendments applied (07-journeys-2). Every user-visible string is rendered with `t(key, vars)` from `src/shared/copy/en-IN.json` under its 08-0 §D key (X-59); `scripts/check-copy.ts` and the lint `foo/no-literal-copy` pass. No banned word (Article 2). Times and money in the F10 formats (Articles 21; F10). Words per 08-0 §G.15 ("cap", "notification", "Change"; X-79). | ART-02a, ART-21a, ART-21b scans, FID-07…09 |
| A.2.4 | Fully usable by keyboard alone: reachable, operable, visible focus ring (F8), logical order, Esc closes overlays, no trap (Article 26). | §C keyboard column, manual |
| A.2.5 | Narrator reads it meaningfully: role, name, state, value; messages read "{sender}, {time}: {text}"; cards are labelled groups; buttons say what they do (F9). | §C Narrator column, Narrator transcript (§G) |
| A.2.6 | Works at Windows text size 225 % and display scale 100–300 % with no clipping, overlap or horizontal page scroll (F9, Article 27). | §C, screenshots at 225 % and 300 % |
| A.2.7 | Works in high contrast (`forced-colors: active`): system colours, borders on bubbles, status by icon + word (F9). | §C, screenshot in a Windows contrast theme |
| A.2.8 | Respects reduced motion (Windows "Animation effects" off): no movement or scale, fades ≤ 83ms, static "typing…" and "◔" (F7). | §C, recording |
| A.2.9 | Correct in light and dark, and follows "Same as Windows" live when Windows switches (F0). | §C, screenshots in both |
| A.2.10 | Behaves as specified offline and with the AI unreachable (Article 29). | §C offline column |
| A.2.11 | All acceptance tests in §B tagged with a journey that uses this surface pass. | test run report |
| A.2.12 | No open P0 item in `GAPS.md` that names this surface. | GAPS review |
| A.2.13 | Every element named in its 03–06 element table carries the `data-testid` from `src/shared/testids.ts` (`TID`, 08-0 §C, X-58) and exposes its state as `data-state` with 08-0 §F/§G values. Automated tests locate elements only by these ids and data attributes, never by class names or visible text. | lint `foo/testid-from-registry`, E2E run |

A.3 **A journey is done** when every AT tagged with it passes, every branch row in its research table has been exercised at least once (manual or automated), and its end-to-end recording (§G.3) is filed.

A.4 **A build is releasable** when: all P0 tests pass; ≥ 95 % of P1 tests pass and every failing P1 has a `GAPS.md` line and an owner; all article tests (§D) pass; all 18 PERF budgets (PERF-01…PERF-18, §E, X-130) pass on the reference laptop; the stranger test (§F) passes with 3 of 3 testers; evidence (§G) is complete.

A.5 **Priorities.** **P0 = must ship**: safety, money, secrets, approvals, data ownership, core flow; a P0 failure blocks release with no exception. **P1 = should ship**: quality and comfort; a P1 failure may ship only with a `GAPS.md` line.

A.6 **Test environment (fixed).**
- Reference laptop: Intel Core i5 (11th gen or newer, 4 cores), 8 GB RAM, SSD, Windows 11 23H2 and Windows 10 22H2, 1920×1080 at 125 % scale, battery mode "Balanced".
- Clock pinned to **Fri 16 Oct 2026, 9:00 AM IST** [settled: X-10] for copy-comparison tests (07 §7.0.6, R-08); real clock for all others.
- Fixtures: a test AI double ("fake AI") that can answer, fail, rate-limit, go slow, and claim false progress on command; sandbox booking and checkout sites with controllable prices, taxes, OTP, CAPTCHA, blocks and confirmation emails; a test Gmail account; test cards and a UPI simulator. **No test may move real money.**
- Accounts: a standard (non-admin) Windows user.
- Test overrides (08-0 §E.6): `FOO_DATA_DIR`, `FOO_LOCAL_DIR`, `FOO_OUT_DIR` point every test at a fresh folder; `FOO_FAKE_AI` selects the fake AI (`ProviderId 'fake'`, shown as "Test AI").
- Names used in Then-clauses (settings paths, card types and states, badge values, Activity `kind`/`event`, `stop_reason`) are the 08-0 names; where a test below and 08-0 differ, 08-0 wins and the test is corrected.

A.7 **How to read a test.** "Given / When / Then" is the contract. Where a journey sentence was amended by 07 §7.5, the test below already uses the amended behaviour and names the R-row.

---

## §B Acceptance tests

B.1 Source: every Given/When/Then in J1–J23 (`research/journeys-1..4.md`), deduplicated (107 found → 104 kept; merged pairs are noted), plus one test per row of the two state machines (07-journeys-2 §7.4) as AT-105 to AT-133. Articles are the ones the test proves. Copy in quotes is checked exactly.

### B.2 Journey tests

| ID | J | Given → When → Then | Art. | P |
|---|---|---|---|---|
| AT-001 | J1 | **Given** a standard (non-admin) Windows 11 user, **when** they run the installer and tap Install, **then** foo installs with no admin prompt, the window opens at 1280 × 800 (clamped to 90 % of the work area) and the welcome card is visible within 90 s; a toast sent at first launch is shown (AUMID `com.foo.desktop`) (R-34.1–2). | 27 | P0 |
| AT-002 | J1 | **Given** Documents is an online-only OneDrive folder, **when** install finishes, **then** the output folder is `%USERPROFILE%\foo files` and Settings → Permissions → "Where I save files" shows "{foo files} · Saved here because your Documents folder is online-only." (06 §6.4 `f-save`) [X-07] | 30 | P1 |
| AT-003 | J1 | **Given** the user closes the first window before "Let's go", **when** they reopen foo from the tray, **then** the welcome card is shown again and no setup step is skipped. | 25 | P1 |
| AT-004 | J1 | **Given** any install failure (low disk, old Windows, failure midway), **then** the message has no file path, code or banned word and exactly one primary button (R-03). | 2 | P0 |
| AT-005 | J2 | **Given** Claude and ChatGPT sign-ins exist, **when** detection runs, **then** both are tested with a real request and Claude is pre-selected. | 12 | P0 |
| AT-006 | J2 | **Given** no AI passes a test, **then** the composer stays disabled with "Connect your AI first, then we can talk." and no step after J2 is reachable. | 12, 29 | P0 |
| AT-007 | J2 | **Given** the user pastes `sk-proj-…` (or a Luhn-valid 16-digit number, or a code right after foo asked for one) into the composer, **when** they press Enter, **then** nothing is sent and the paste catcher appears. *(also covers J7, J13 branches)* | 8 | P0 |
| AT-008 | J2 | **Given** a key saved through the Secret box, **then** the key value appears in no row of `foo.db`, no log, no screenshot and no AI request body. | 8 | P0 |
| AT-009 | J2 | **Given** a key that fails the test, **then** the row offers "Replace key" and the old value is never shown. | 8 | P1 |
| AT-010 | J3 | **Given** the naming card, **then** foo's own text never contains a suggested name; only the "Surprise me" button fills one (R-05). | 23 | P1 |
| AT-011 | J3 | **Given** the user picks face 3, **then** the chat list, chat header, toasts and taskbar jump list use that face within 1 s. | 27 | P1 |
| AT-012 | J3 | **Given** the user's first message is "book a table for 2 tonight", **then** foo starts J9 at once and asks for its name only after that job ends. | 18 | P1 |
| AT-013 | J3 | **Given** "Surprise me" is tapped 5 times, **then** 5 different names are offered with no repeats in the session. | — | P1 |
| AT-014 | J4 | **Given** the user ticks Gmail + Calendar and completes Google sign-in, **then** the card shows "✓ Connected as" with a masked address within 3 s of the browser returning. | 8 | P1 |
| AT-015 | J4 | **Given** the user declined the send permission on Google's page, **then** foo never offers "Send email" on Gmail drafts and offers "Open in Gmail" instead. | 4, 5 | P0 |
| AT-016 | J4 | **Given** any interview card, **when** the user types an answer, **then** the card collapses to "question → answer" exactly as a tap would. | 6 | P1 |
| AT-017 | J4 | **Given** the app peek was declined, **then** foo reads no installed-apps list and Card C starts unticked. | 15 | P0 |
| AT-018 | J4 | **Given** WhatsApp is linked, **then** foo never sends a WhatsApp message without a Draft card and a Send tap. | 4, 5 | P0 |
| AT-019 | J5 | **Given** Gmail is connected, **when** the user taps "Find bills due this week", **then** a checklist is visible within 2 s and a first result line within 60 s. | 12, 17, 28 | P0 |
| AT-020 | J5 | **Given** the result, **then** it carries a Proof chip linking to the actual emails, or "⚠ Not checked live" if no email was opened. | 11 | P0 |
| AT-021 | J5 | **Given** nothing was connected, **then** none of the offered first jobs needs Gmail, Calendar or WhatsApp. | — | P1 |
| AT-022 | J5 | **Given** the first task finishes, **then** foo states the first brief time in visible text as "tomorrow, Sat 17 Oct, 8:00 AM" (R-07; not only in a tooltip). | 21 | P1 |
| AT-023 | J6 | **Given** 9 candidate items, **then** the brief shows at most 5 cards and always ends with "That's all for today". | 22 | P1 |
| AT-024 | J6 | **Given** the user taps 👎 on the weather card on two days within a week, **then** foo asks once whether to stop showing weather, and never asks again if the answer is "Keep it". | 20 | P1 |
| AT-025 | J6 | **Given** the PC was asleep at 8:00 AM and wakes at 9:10 AM, **then** the brief arrives within 2 min of wake and says it is late and why. | 12 | P1 |
| AT-026 | J6 | **Given** a brief card has an action button, **when** the user does nothing, **then** no job starts. | 3 | P0 |
| AT-027 | J7 | **Given** the user sends "thanks!", **then** foo adds a 👍 reaction and posts no message. | 23 | P1 |
| AT-028 | J7 | **Given** the user holds Ctrl+Space for 4 s and releases, **then** a voice bubble and its transcript appear, and foo's reply is a voice bubble plus text (default setting). | 23 | P1 |
| AT-029 | J7 | **Given** Windows blocks the microphone, **then** the card has one button that opens the exact Windows microphone privacy page. | 2, 27 | P1 |
| AT-030 | J7 | **Given** a 200-word answer, **then** it arrives as one bubble (CR-0024 F2), with no list split. | 23 | P1 |
| AT-031 | J7 | **Given** any foo reply, **then** it contains none of the filler phrases ("Great question", "How can I help you", "I apologize for the confusion"). | 23 | P1 |
| AT-032 | J8 | **Given** foo has 3 options, **then** the card shows exactly 3 options plus "Something else…" and Skip, with option 1 tagged "Best fit". | 3 | P0 |
| AT-033 | J8 | **Given** a reversible-preference question with no answer for 15 min, **then** foo picks Best fit and says so in one line. | 22 | P1 |
| AT-034 | J8 | **Given** a flight-choice question with no answer, **then** foo never picks for the user and cancels after 24 h with a "Search again" button. | 3, 5 | P0 |
| AT-035 | J8 | **Given** a Choice card, **when** the user types "2" (or reacts 2️⃣), **then** the card collapses exactly as if option 2 had been tapped. | 6 | P0 |
| AT-036 | J9 | **Given** "are there tables at an Italian place in Bandra Saturday", **then** foo shows options and never shows a booking Approval card until the user says "book" or taps an option and then "Book table". | 3 | P0 |
| AT-037 | J9 | **Given** the user taps "Book table", **then** the booking is submitted at most once and the result carries a confirmation number or screenshot. | 7, 11 | P0 |
| AT-038 | J9 | **Given** the no-show fee changes between card and submit, **then** nothing is booked and a new card shows the new fee. | 7 | P0 |
| AT-039 | J9 | **Given** all booking sites block foo, **then** foo offers [ Open the page ] with the link "Email the restaurant" (R-03), and never emails without a fresh Approval tap. | 9, 2 | P0 |
| AT-040 | J9 | **Given** a booking with a free-cancel cutoff, **then** a reminder arrives 2 h before the cutoff, with an absolute time. | 21 | P1 |
| AT-041 | J10 | **Given** an approved total of ₹14,600, **when** checkout shows ₹14,601, **then** nothing is paid and a new Payment card shows ₹14,601. | 7 | P0 |
| AT-042 | J10 | **Given** a total of ₹10,000 or more, **when** Approve is tapped, **then** Windows Hello (or typing the amount when Hello is not set up, R-15) is required before any payment is submitted. | 7 | P0 |
| AT-043 | J10 | **Given** the Pay click succeeded but the confirmation page never loaded, **then** foo never clicks Pay again and enters CHECKING. | 7 | P0 |
| AT-044 | J10 | **Given** a completed payment, **then** the Activity log has exactly one row with `kind='paid'`, `event='paid'`, `outcome='done'` and the approval id (08-0 §G.4), and the result carries a booking number or confirmation email. | 7, 11 | P0 |
| AT-045 | J10 | **Given** any screen, log, screenshot, page snapshot, toast or export, **then** no full card number, CVV or OTP appears anywhere. | 8 | P0 |
| AT-046 | J11 | **Given** a bill email for ₹1,179 and the site shows ₹1,279, **then** the Payment card shows ₹1,279 and says why. | 7 | P0 |
| AT-047 | J11 | **Given** the user paid the same bill 2 days ago, **then** foo shows the duplicate warning before any Payment card. | 7 | P0 |
| AT-048 | J11, J14 | **Given** a routine that prepares a payment (monthly bill habit or "every month pay Airtel"), **then** every firing produces a Payment card and never a payment. *(merges J11 #3 and J14 #4)* | 5, 7 | P0 |
| AT-049 | J11 | **Given** a bill email asking to pay through a non-biller link, **then** foo offers no Pay button. | 5 | P0 |
| AT-050 | J11 | **Given** "No thanks" to the habit offer, **then** the offer never appears again for that bill. | 20 | P1 |
| AT-051 | J12 | **Given** "draft a reply to my landlord", **then** a Draft card appears and no email is sent until the user taps "Send email". | 4 | P0 |
| AT-052 | J12 | **Given** a recipient the user has never emailed, **when** Send is tapped, **then** a full Approval card with "You haven't emailed her before" appears and there are no scope chips. | 5 | P0 |
| AT-053 | J12 | **Given** the user taps Undo within 5 s, **then** Gmail has no sent message. | 4 | P0 |
| AT-054 | J12 | **Given** an X post draft, **then** foo never posts to X; it only opens X's compose page with the text. | 5 | P0 |
| AT-055 | J12 | **Given** approval of one email, **then** a second email in the same chat still needs its own Send tap, with no per-person exception (R-13). | 4 | P0 |
| AT-056 | J13 | **Given** a sign-in page, **then** the AI never receives the typed username or password, and no screenshot or page text is captured while the sign-in window is in front. | 8 | P0 |
| AT-057 | J13 | **Given** the user signs in and the page changes, **then** foo continues without the user tapping "I'm done". | — | P1 |
| AT-058 | J13, J18 | **Given** the user taps "Take over" (CAPTCHA or any live job), **then** foo makes no click until "Hand back to foo". *(merges J13 #3 and J18 #3)* | 18 | P0 |
| AT-059 | J13 | **Given** a saved login, **then** it is filled directly into the page and the AI only knows "your IRCTC login". | 8 | P0 |
| AT-060 | J13 | **Given** no response to a sign-in card for 2 h, **then** the job is cancelled with nothing booked and a "Start again" button. | 12 | P1 |
| AT-061 | J14 | **Given** "tell me when BTC drops below ₹55 lakh", **then** foo runs one check immediately and posts a Routine card with what, how often, tells-you-only-if (shown as "₹55,00,000 (55 lakh)", R-09), where and an absolute next run. | 21 | P1 |
| AT-062 | J14 | **Given** 50 runs where the price stays above the line, **then** the user receives no message and no toast. | 19, 22 | P0 |
| AT-063 | J14 | **Given** the PC slept through 8 runs, **then** on wake there is at most one catch-up run and at most one message. | 19 | P1 |
| AT-064 | J14 | **Given** the user pauses a routine, **then** no run happens until it is resumed, and the routine row shows "Paused". | 12 | P1 |
| AT-065 | J15 | **Given** "+ New helper" with the Trips template, **then** a Trips contact appears with its own colour and face and posts a first message that names something real from the user's data, or a plain intro if none. | 1 | P1 |
| AT-066 | J15 | **Given** a travel request in the foo chat, **then** the job runs in Trips, and the foo chat shows one line, a handoff marker and a status link card that updates live. | 1 | P0 |
| AT-067 | J15 | **Given** a payment arising in a Trips job, **then** the Payment card appears in the Trips chat, and Money receives only a receipt note after payment. | 1, 14 | P0 |
| AT-068 | J15 | **Given** Trips is deleted, **then** its routines stop, and bookings it made remain in the calendar and activity log. | 15 | P1 |
| AT-069 | J16 | **Given** a group with Trips and Money, **then** no Draft, Approval, Payment, Secret box or sign-in card is ever rendered in it; a booking approval shows only the "stays private" line in the group and the card in Trips' 1:1 chat. *(merges J16 #1 and #2)* | 14 | P0 |
| AT-070 | J16 | **Given** a WhatsApp group mirror, **then** foo cannot send into it without a full Approval card and a tap. | 5 | P0 |
| AT-071 | J16 | **Given** 6 helper messages without any user message, **then** the group pauses and says "We're going in circles. Pausing until you reply." | 13 | P1 |
| AT-072 | J17 | **Given** any fact, **then** it shows "You said" or "I guessed" (with the reason) and a date. | 15 | P1 |
| AT-073 | J17 | **Given** "Forget everything from Gmail", **then** every fact whose origin is Gmail is deleted from disk and Gmail stays connected. | 15 | P0 |
| AT-074 | J17 | **Given** a forgotten fact, **then** foo does not use it in any later reply, and does not re-learn it from the same email within 90 days. | 15 | P0 |
| AT-075 | J17 | **Given** the user edits `about-you.md` in Notepad, **then** the next foo reply uses the edited fact. | 15 | P1 |
| AT-076 | J17 | **Given** a guessed health or money fact, **then** it is never saved unless the user said it. | 15 | P0 |
| AT-077 | J18 | **Given** a running booking job, **when** the user types "stop", **then** no further click or AI call for that job happens after 1 s, and the reply lists exactly what was already done, read from the activity log. | 18, 12 | P0 |
| AT-078 | J18 | **Given** the user closes the job's Edge window (08-0 §G.8), **then** the job is cancelled with the same report. | 18 | P0 |
| AT-079 | J18 | **Given** the Watch live window (`live.html`, 08-0 §G.8), **then** password, card and OTP fields are blurred in every frame and the window takes no clicks. | 8 | P0 |
| AT-080 | J18 | **Given** "Stop everything", **then** all running jobs stop, open approval cards become WITHDRAWN, and routines keep their schedules. | 18 | P0 |
| AT-081 | J19 | **Given** the internet drops mid-job, **then** within 10 s the job shows WAITING and the banner strip shows "You're offline. Your jobs are saved and I'll carry on when you're back." with [ Try again ] and there is no extra bar above the composer (R-21, R-34.8); **when** the internet returns, **then** the job resumes from the same step without redoing finished steps. | 29, 12 | P0 |
| AT-082 | J19 | **Given** foo crashes after the Pay click and before proof, **then** on relaunch the payment is not re-submitted and the card says it is checking. | 7 | P0 |
| AT-083 | J19 | **Given** the AI spend cap is reached, **then** no further AI call is made for jobs or routines until the cap is raised or the month changes. | 13 | P0 |
| AT-084 | J19 | **Given** the same step fails 3 times, **then** a stuck card appears with cost so far and three buttons, and the job does not keep trying on its own. | 12, 13 | P0 |
| AT-085 | J19 | **Given** any error card, **then** it has exactly one primary button, at most one secondary link, and no banned word. | 2 | P0 |
| AT-086 | J20 | **Given** the window is closed and a Payment card (or any send, book, post, delete or share approval, R-12) appears, **then** the toast shows [ Review ] [ Not now ] (never Approve), Review opens the main window with focus on the card (no separate receipt window), and there is no way to approve from any toast (R-34.4); the toast is sent even when the chat is muted (09 §9.9.4). | 5, 6 | P0 |
| AT-087 | J20 | **Given** a job enters NEEDS YOU, **then** the taskbar "needs you" overlay appears within 2 s and clears when nothing waits; a plain unread message never sets an overlay (R-34.7). | 27, 12 | P0 |
| AT-088 | J20 | **Given** quiet hours, **then** every toast is held (no banner, no sound) until they end, followed by one "Quiet-hours summary" toast; an unprompted item inside quiet hours is neither posted nor toasted but written to `held_items` (delivery `held_quiet_item`) and delivered as a line in the next morning brief (09 §9.9.4, 08-3 §15.2 step 5, §15.6); held Needs-you cards still wait in the app. | 19 | P0 |
| AT-089 | J20 | **Given** the user quits foo with running jobs, **then** the jobs are saved as WAITING and resume on next open. | 29 | P0 |
| AT-090 | J20 | **Given** any toast body, **then** it never contains a full email address of a third party, an OTP, a card number or a key. | 8 | P0 |
| AT-091 | J21 | **Given** Settings → Permissions, **then** for `p-pay`, `p-book`, `p-send`, `p-delete` and `p-share` only Ask and Never can be selected (Always is disabled), `p-post` is locked to Never, and `settings:set` of any of them to `'always'` (or of post to anything but `'never'`) returns `SETTING_LOCKED` (08-0 §A.2, §G.3, X-54). | 5 | P0 |
| AT-092 | J21 | **Given** "Export everything", **then** the zip contains chats, memory, routines and the activity log, and searching it for any saved key or card value finds nothing. | 15, 8 | P0 |
| AT-093 | J21 | **Given** the user disconnects Gmail, **then** foo makes no further Gmail requests and the right shell "Using" drops Gmail. | 15, 12 | P0 |
| AT-094 | J21 | **Given** "turn off voice replies" typed in chat, **then** `chat.voiceReplies` becomes `'never'` and foo posts "Changed: Voice replies → Never. [ Undo ]"; Undo calls `settings:undo { changeId }` and restores the old value. **Given** "set my purchase cap to ₹50,000" typed, **then** nothing changes and foo replies "That's one for you to change. [ Open Settings ]" (08-0 §A.3 allow-list). | 6 | P1 |
| AT-095 | J21 | **Given** the Windows Hello threshold is set to ₹0, **then** every payment requires Windows Hello. | 7 | P0 |
| AT-096 | J22 | **Given** 50,000 messages (seeded with `test:seed { set: 'perf' }`, 08-3 §22.8–§22.9), **when** the user types "taj", **then** first results show within 300 ms, grouped as specified. | 28 | P1 |
| AT-097 | J22 | **Given** Enter on a message result, **then** the chat opens scrolled to that message with a 2 s highlight. | — | P1 |
| AT-098 | J22 | **Given** a plain search, **then** no request is sent to the AI. | 15 | P0 |
| AT-099 | J22 | **Given** Ctrl+Enter, **then** foo answers in its chat and cites the messages or files it used. | 11 | P1 |
| AT-100 | J23 | **Given** "Delete everything", **then** after uninstall there is no `%APPDATA%\foo` folder and no Credential Manager entry starting with `foo/`. | 15, 8 | P0 |
| AT-101 | J23 | **Given** "Delete everything" while online, **then** the Google connection is revoked and the WhatsApp linked device is logged out. | 15 | P0 |
| AT-102 | J23 | **Given** "Keep my data" and a reinstall, **then** chats, memory and routines reappear and setup is skipped if the AI test passes. | 15 | P1 |
| AT-103 | J23 | **Given** files in `Documents\foo`, **then** uninstall never deletes them. | 15 | P0 |
| AT-104 | J23 | **Given** running jobs, **then** the uninstaller warns and states that nothing will be paid. | 7 | P0 |

### B.3 State-machine tests (07-journeys-2 §7.4, with amendments SM-A1…A10)

| ID | Machine | Given → When → Then | Art. | P |
|---|---|---|---|---|
| AT-105 | Job | **Given** 3 jobs WORKING, **when** a 4th is created, **then** it is QUEUED, the badge is 👀 and its checklist reads "Waiting for another job to finish"; no 4th job ever runs at once. | 12 | P0 |
| AT-106 | Job | **Given** a QUEUED job and an AI not verified in the last 10 min, **when** a slot frees, **then** a one-word test runs first, then the job is WORKING with badge 🛠 and the checklist appears after 1.5 s. | 12 | P0 |
| AT-107 | Job | **Given** a job in QUEUED, WORKING, NEEDS YOU or WAITING, **when** the user taps Stop, **then** it is CANCELLED with the matching `stop_reason` (`user_button` / `user_word`), badge ⛔ (`stopped`), checklist line "Stopped by you", and the message names what was done or "Nothing was booked, paid or sent." | 18 | P0 |
| AT-108 | Job | **Given** a WORKING job, **when** it needs a choice, approval, payment, sign-in or code, **then** it is NEEDS YOU, badge ⏳ (SM-A1), chat-row pill "Needs you", taskbar overlay, toast if not focused. | 16 | P0 |
| AT-109 | Job | **Given** NEEDS YOU, **when** the user answers, approves or taps "I'm done", **then** WORKING, badge 🛠, and the card collapses to its answered state. | 17 | P0 |
| AT-110 | Job | **Given** NEEDS YOU, **when** the user declines, **then** CANCELLED (or WORKING if another route exists) with "Okay, I won't. {next step or 'Nothing else to do here.'}" | 5 | P0 |
| AT-111 | Job | **Given** NEEDS YOU on a payment or booking card, **when** the card expires, **then** CANCELLED; on a choice card, it stays NEEDS YOU with one reminder. | 5 | P0 |
| AT-112 | Job | **Given** WORKING, **when** the AI stops answering, a plan limit or AI spend cap is hit, or the PC sleeps, **then** WAITING, one error card, pill "Paused". | 12, 13 | P0 |
| AT-113 | Job | **Given** WAITING, **when** the condition clears, **then** WORKING and the error card is edited in place to "Back on it. Picking up from step {n}." (SM-A10); no new message. | 17, 22 | P1 |
| AT-114 | Job | **Given** WORKING, **when** all steps finish with a proof object, **then** DONE, badge ✅, Proof chip and receipt footer. | 11 | P0 |
| AT-115 | Job | **Given** WORKING, **when** all steps finish with no proof possible, **then** DONE (unverified): badge value `done_unverified` (✅, tooltip "Done · Not checked live") and "⚠ Not checked live" on the result's proof line; no ⚠ on the bubble (SM-A12, 08-0 §F). | 11 | P0 |
| AT-116 | Job | **Given** WORKING, **when** no step finishes for 3 min, or a step fails 3 times, or cost passes 2× estimate, **then** NEEDS YOU with the stuck card and badge ⏳ (SM-A2), ⚠ only in the stuck card header; **when** Stop is tapped on it, **then** CANCELLED, badge ⛔, `stop_reason='stuck_stop'`, stuck card state `stopped` (SM-A11, X-80); **when** nobody answers for 15 min, **then** FAILED ❌ and stuck card state `timed_out`. | 12, 13, 16 | P0 |
| AT-117 | Job | **Given** WORKING, **when** the site blocks foo and no other route exists, **then** FAILED, badge ❌, error card with one alternative. | 2 | P0 |
| AT-118 | Job | **Given** any non-final job, **when** the app is killed or Windows restarts, **then** on next launch it is restored from `state.json` with a recovery card. | 29 | P0 |
| AT-119 | Job | **Given** the fake AI replies "All done!" without a proof object or `unverified` flag, **then** the job is not DONE; the badge and checklist keep showing the runner's real state. | 12, 11 | P0 |
| AT-120 | Job | **Given** a FAILED or CANCELLED job, **when** the user taps "Try again", **then** a new linked job "Trying again: {title}" is created and the old job never returns to WORKING. | 12 | P0 |
| AT-121 | Approval | **Given** a PENDING card, **then** its timer is 10 min (payment), 15 min (booking, no charge now) or 60 min (send, post, delete, share), keeps running while the window is closed, and the toast shows the same expiry. | 5, 21 | P0 |
| AT-122 | Approval | **Given** PENDING, **when** Approve is tapped (with Hello or typed amount when required), **then** APPROVED → RUNNING and the card reads "Approved by you at {Fri 16 Oct, 9:48 AM}. Doing it now…" (SM-A6). | 6, 7 | P0 |
| AT-123 | Approval | **Given** APPROVED, **when** the second look finds a mismatch, **then** HELD with the `--warn-soft` strip and "Before I do this, one check: you asked for {X}, this is {Y}. Which one?" and choice chips; the pick leads to APPROVED or DECLINED. | 10 | P0 |
| AT-124 | Approval | **Given** PENDING, **when** price, time or recipient changes before Approve, **then** SUPERSEDED (grey, struck-through amount, "The price changed, so I stopped. See the new card below.") and a new PENDING card. | 7 | P0 |
| AT-125 | Approval | **Given** RUNNING, **when** the checkout total differs from the approved total by any amount, **then** SUPERSEDED, nothing paid, new PENDING card. | 7 | P0 |
| AT-126 | Approval | **Given** PENDING, **when** the user taps "Not now", **then** DECLINED: "You said no. Nothing was {sent / booked / paid}." and no auto-retry. | 5 | P0 |
| AT-127 | Approval | **Given** PENDING, **when** the timer ends, **then** EXPIRED with the absolute time and [ Ask me again ]; **when** tapped, **then** live terms are re-checked before a fresh card. | 5, 21 | P0 |
| AT-128 | Approval | **Given** PENDING, **when** the job is stopped elsewhere, **then** WITHDRAWN: "No longer needed. The job was stopped." | 18 | P0 |
| AT-129 | Approval | **Given** RUNNING, **when** the bank declines, **then** FAILED with a `--bad` edge and icon, "Your bank said no. No money was taken." and one fix button. | 7, 2 | P0 |
| AT-130 | Approval | **Given** RUNNING, **when** the submit result is unknown (crash, network drop), **then** CHECKING, never re-submitted; after 15 min with no proof, FAILED with "I couldn't confirm it. Check your bank app before trying again." [ I checked, try again ]. | 7 | P0 |
| AT-131 | Approval | **Given** RUNNING, **when** proof is found, **then** COMPLETED with "✓ {Sent / Booked / Paid ₹{total}} · {absolute time}" and a Proof chip. | 11 | P0 |
| AT-132 | Approval | **Given** an approval answered "Always" (app-use only, SM-A7; rules exist only for `use_app`, `calendar_write`, `mail_organise`, 08-0 §G.3), **then** no rule ever skips a Payment card, a hard-limit card, or any send, book, post, delete or share card. | 4, 5 | P0 |
| AT-133 | Approval | **Given** a known-recipient Draft card (SM-A8), **then** an `approvals` row exists from the moment the draft is created (PENDING, expiry 60 min), the card shows the approval frame and the impact line for as long as it is pending, and it moves through the approval states like any approval card; **when** "Send email" is tapped, **then** the approval is APPROVED with `approved_via='card'`, the 5 s Undo runs, then the second look, then Gmail `drafts.send`; Change uses `drafts.update` and Discard uses `drafts.delete` (08-0 §G.7, X-65). | 4, 5 | P0 |

B.4 **Totals.** 133 acceptance tests: 104 journey tests + 29 state-machine tests. P0: 95. P1: 38. (Before the 2026-10-16 owner answers; see B.6.)

### B.5 Owner-answer tests (2026-10-16, X-39…X-52)

| ID | Area | Given → When → Then | Art. | P |
|---|---|---|---|---|
| AT-134 | Voice [X-43] | **Given** an OpenAI key in the vault and "Turn my voice notes into text" = "OpenAI", **when** the user sends a 15 s Hindi voice note, **then** the fake OpenAI endpoint receives the WebM file with `model=gpt-4o-mini-transcribe`, the transcript appears under the voice bubble, no voice pack is downloaded, and one `ai_turns` row with `purpose='voice'` and a ₹ cost is written. | 13, 23 | P1 |
| AT-135 | Voice [X-43] | **Given** no OpenAI key and a first voice note, **then** the voice key card shows "Add an OpenAI key for faster voice notes. Your voice goes to OpenAI to become text, and nowhere else." with [ Save securely ] [ Use this PC instead ]; **when** "Use this PC instead" is tapped, **then** "Setting up voice notes… {n}%" shows, then the transcript; **and** on the next voice notes the card never appears again. | 8, 20 | P1 |
| AT-136 | Voice [X-43] | **Given** an OpenAI key and OpenAI unreachable (or the key refused, or the AI cap reached), **when** a voice note is sent, **then** it is transcribed on this PC (downloading the pack first if needed) and the voice note is never lost; a refused key shows "OpenAI didn't accept this key." in Settings → Chat and voice only. | 13, 29 | P1 |
| AT-137 | Voice and web privacy [X-43, X-46] | **Given** a network capture during voice notes and web jobs, **then** voice audio goes only to `api.openai.com` and only when "OpenAI" is selected; search, page and browse traffic goes only to the services whose keys are saved; and Settings → Privacy "What leaves this PC" names exactly the services that are on. | 15 | P0 |
| AT-138 | Web search [X-46] | **Given** an Exa key, **when** a job searches, **then** the fake Exa endpoint is called once and results reach the AI wrapped as untrusted; **when** Exa returns 401, 429 or 5xx, **then** the same search runs on Bing in foo's window with no message to the user, and a used-up key adds one line to the next brief. | 29 | P1 |
| AT-139 | Web, no keys [X-46] | **Given** no web tool keys, **when** a job searches and reads a news page and a script-heavy results page, **then** no request goes to any cloud tool host, the news page is read by Readability on this PC, and the script-heavy page is read in foo's window (`needsBrowser`). | 15, 29 | P1 |
| AT-140 | Web, secrets [X-46] | **Given** canary secrets in the vault and in the job's text, **when** cloud search, read and browse calls run, **then** no canary appears in any outbound payload; a canary in a URL host or path blocks that call (`CLOUD_SECRET_BLOCKED`) and the local path is used. | 8 | P0 |
| AT-141 | Cloud browser [X-46] | **Given** a Browser Use key, **then** `web.browseCloud` is refused (`USE_EDGE` / `SITE_HANDBACK`) for a signed-in site, IRCTC, a biller, a hand-back domain and any goal that types, books, buys, pays, sends or posts; **and** when the cloud result proposes a booking, the step runs in foo's Edge and stops at an Approval card. | 4, 5, 7, 10 | P0 |
| AT-142 | Hand-back sites [X-46] | **Given** a job that reaches a net-banking, UPI web, trading or password-manager domain, **then** foo never types, clicks or reads in it and shows "This is your bank's site. I'll open it for you, and you do this part." [ Open {site} ], which opens the default browser. | 7, 8 | P0 |
| AT-143 | Web cost [X-46] | **Given** an AI cap of ₹1,000 with ₹999 spent, **when** a cloud search or read would cross the cap, **then** it is not called, the local path is used, and the Spent meter includes every earlier cloud call. | 13 | P1 |
| AT-144 | Site recipes [X-46] | **Given** a saved recipe for a sandbox biller, **when** the job replays it, **then** every step is matched by role and name before acting, no value (name, date, card data) is stored in the recipe, and the final pay click is never replayed: it goes through `browser.submit` with this job's own approval. | 7, 10 | P0 |
| AT-145 | Contacts [X-48] | **Given** Contacts connected with two "Priya" entries, **when** the user says "email Priya the photos", **then** a Choice card "Which Priya?" with masked addresses appears; **given** one match, the draft uses it; **given** no match and no sent mail or chat, **then** the draft card is the full Approval card for someone new. | 5 | P1 |
| AT-146 | Hub, v1.1 only (`flags.hub`) [X-49] | **Given** a connected hub app, **then** every tool that writes, sends, books, buys, pays, posts or deletes stops at an Approval (or Payment) card; a finance app is never listed; a tool not in foo's manifest is refused; a changed tool description pauses the app with "🔌 {Zomato} changed how it works. I've paused it until I check."; no screen shows the words MCP, server or hub. | 2, 4, 5, 7 | P0 |
| AT-147 | Accent [X-51] | **Given** a fresh install, **then** buttons, links and the send button use indigo `#2B3FD6` (light) / `#8C9BFF` (dark); **when** "Use my Windows accent colour" is turned on, **then** they switch live to the Windows accent, and back to indigo when off; with high contrast on, the row is disabled. | 24 | P1 |
| AT-148 | Cursor [X-51] | **Given** any screen, **then** buttons, toggles, chips, rows and menu items show the arrow cursor, links and clickable pictures show the hand, text fields show the text cursor, and disabled controls show the arrow (02-3 §F27.1). | 27 | P1 |
| AT-149 | Line drawings [X-51] | **Given** the first-time Memory, Routines and Activity log pages, **then** each shows its line drawing (L-1, L-2, L-3) at 120 × 96 with `aria-hidden="true"`, in `--fg-3` strokes (`CanvasText` in high contrast), drawn from the supplied masters `foo/look-book/assets/L-1-memory.svg`, `L-2-routines.svg`, `L-3-activity.svg` with one `--accent` detail (X-144; the 24px icon fallback is withdrawn); no other surface shows a drawing. | 24, 26 | P1 |
| AT-150 | Tester build [X-44] | **Given** a release build meant for people outside the named test group, **then** the installer, `foo.exe` and native addons carry a valid signature; an unsigned build is allowed only for the named test group and is labelled "tester build" in About. | 27 | P1 |

B.6 **Totals after the owner answers.** 150 acceptance tests (AT-001…AT-150): 104 journey + 29 state-machine + 17 owner-answer tests. P0: 101. P1: 49. AT-146 runs only when `flags.hub` is on (v1.1); the v1 release counts 149. R25–R31 (X-45): their journeys J24–J30 and tests AT-158…AT-199 are in `12-features-r25-r31-*.md` (plan M15). B.6 is superseded by B.8.

### B.7 Review Phase 1 tests (2026-10-16; UJ-01, UJ-02, UJ-03, UJ-05, UJ-17, UJ-30)

Numbering (X-104): AT-151…AT-157 and AT-200…AT-226 are written here (group F); AT-158…AT-199 (12-1, J24–J26) and AT-230…AT-266 (12-2, J27–J30; AT-263…AT-266 photo check, X-98) live in `12-features-r25-r31-1.md` / `-2.md` and are listed by pointer in §B.9; AT-227…AT-229 are unused; the FID-18 trace accepts the gaps. Rows with a letter suffix (AT-035a…) are sub-tests of the test they extend. Names follow 08-0 (card types and states §G.1–§G.2, settings §A). Research steps are cited as `research/journeys-N.md` J-step or branch row.

| ID | J | Given → When → Then | Art. | P |
|---|---|---|---|---|
| AT-151 | J11 | **Given** a bill email from a sandbox biller for ₹1,179 due Fri 23 Oct, **when** the `bill_watch` builtin fires (X-115), **then** one `bill` card (state `waiting`) appears in Money's chat (foo's chat if no Money helper) titled "{Biller} bill ₹1,179 due Fri 23 Oct." with [ Pay now ] [ Remind me Thursday ] and the link "I already paid", and no Payment card exists until Pay now is tapped (05 §5.29.2). | 3, 21 | P1 |
| AT-152 | J11 | **Given** that `bill` card, **when** "Remind me Thursday" is tapped, **then** the card state is `reminded`, its summary row reads "Reminder set · Thu 22 Oct, 9:00 AM" (`cards.bill.summary.reminded`), and one routine with schedule `{ kind: 'once' }` at that time is created in the same chat, `created_from='asked'` (D-41). **And when** that routine fires, the card returns to `waiting` with its buttons and the footer "I reminded you on Thu 22 Oct." (`cards.bill.footer.reminded_on`, X-115). | 21 | P1 |
| AT-153 | J11 | **Given** that `bill` card, **when** "I already paid" is tapped, **then** the card state is `already_paid`, the `bill_watch` builtin marks this bill as handled (X-115), and no reminder, brief item or card about this bill appears again. | 20 | P1 |
| AT-154 | J11 | **Given** a second bill email with the same biller and amount within 3 days of the first, **then** it is folded into the first `bill` card as the line "Also received Sat 17 Oct" and no second card is created; **and** a bill already paid 2 days ago shows the duplicate warning before any Payment card (AT-047). | 7 | P0 |
| AT-155 | J2 | **Given** ChatGPT is picked and no ChatGPT helper is installed, **then** foo opens the maker's page in the default browser, downloads, runs and installs nothing (X-42), and the block shows "Waiting for the ChatGPT helper… I'll notice when it's installed."; **when** the fake helper appears on PATH, **then** the flow continues within 5 s. | 2, 15 | P0 |
| AT-156 | J21 | **Given** Settings → Notifications row `unprompted`, **then** the stepper range is 0–3 and never shows 4 (`notifications.unpromptedPerDay`, 08-0 §A.2 lock); **given** the value 0, **then** no unprompted message or notification is delivered that day, unprompted routine fires (`created_from` `suggested` or `habit`) are held for the next morning brief (08-3 §13), and routines the user asked for still post with the "Why am I getting this?" footer. | 19 | P0 |
| AT-157 | J8, J10 | **Given** "book me a flight to Goa on Sat 12 Dec", **then** foo replies "I can find and compare flights, and open the booking page for you. Filling in passengers and paying for flights comes in a later version." with [ Compare flights ] and the link "Not now"; **when** Compare flights is tapped and an option picked, **then** foo opens that airline or travel-site page in Edge and hands over; no Payment card, no booking Approval card and no `paid`/`booked` Activity row is ever created for a flight in v1 (07-1 §7.0.8, owner Q1 default). | 3, 5, 7 | P0 |
| AT-200 | J4 | **Given** first run quit while interview Card E is showing (`setup.interviewCard='E'`), **when** foo is relaunched, **then** the system line "Picking up where we left off." is posted, Card E is shown, and the Card A–D answers are present (UJ-17; 08-0 §A.1). | 25 | P1 |
| AT-201 | J3 | **Given** the face step, **when** "Use my own picture" is tapped and a 6 MB JPG is picked, **then** "That picture is too big. Pick one under 5 MB." shows and nothing is saved; **when** a 3 MB PNG is picked, **then** it is cropped to a circle, stored ≤ 2 MB at `{DATA}\avatars\{chatId}.png`, and the face is `FaceRef` `file:{chatId}` everywhere within 1 s (`research/journeys-1.md` J3 branch "Use my own picture"). | 27 | P1 |
| AT-202 | J4 | **Given** Google sign-in completes with an account other than the one the user meant, **then** the Connect card shows "Connected as {v•••@gmail.com}. Wrong account?" with [ Use a different one ]; **when** tapped, **then** the first Google connection is removed and the sign-in opens again (J4 branch "Signed in to the wrong Google account"). | 8, 15 | P1 |
| AT-203 | J4 | **Given** the WhatsApp link fails 3 times, **then** the card reads "WhatsApp didn't link. You can try later in Settings → Apps." with [ Skip for now ], and the interview continues to Card F (J4 branch "WhatsApp link fails 3 times"). | 2 | P1 |
| AT-204 | J6 | **Given** 0 brief candidates, **then** the brief is the single line "☀️ Good morning, {firstName}. Nothing needs you today. Enjoy it." with 👍 👎 and no cards; **given** 1 candidate, **then** exactly that one card is shown with no padding item (J6 step 6; 08-3 §14.3). | 22 | P1 |
| AT-205 | J6 | **Given** the PC was off at the brief time and wakes after 12:00 PM, **then** no brief is posted and foo posts the one line "I skipped this morning's brief because your PC was off. Want it now?" [ Yes ] [ Skip today ] with the "Why am I getting this?" footer, counted in the daily budget (J6 branch; R-11). | 19, 21 | P1 |
| AT-206 | J7 | **Given** the fake transcriber returns a low-confidence result, **then** foo answers and shows "I heard: '{text}'. Right?" [ Yes ] [ No, let me retype ]; **when** "No, let me retype" is tapped, **then** the composer gets focus and nothing is acted on (J7 branch "Transcription is low-confidence"). | 3, 23 | P1 |
| AT-207 | J9 | **Given** a booked table with a free-cancel cutoff of Sat 17 Oct, 6:00 PM, **then** at Sat 17 Oct, 4:00 PM the reminder "Dinner at {place} tonight, Sat 17 Oct, 8:00 PM. Free to cancel until 6:00 PM." with [ Keep it ] [ Cancel booking ] arrives; **when** "Cancel booking" is tapped, **then** an Approval card with verb `delete` appears and nothing is cancelled until it is approved (X-55; J9 step 9). | 5, 21 | P0 |
| AT-208 | J11 | **Given** "I already paid" is tapped, **then** the card collapses to state `already_paid` with summary "Noted. I won't mention this bill again." and the chip "⚠ Not checked live", no receipt search runs, no proof is attached, no activity row is written, and the same biller+period never produces another `bill` card or brief item (05 §5.29 rule 4, X-115). | 11 | P1 |
| AT-209 | J11 | **Given** no UPI ID saved, **when** Pay now is tapped on a UPI bill, **then** foo asks once "Which UPI ID should I use?" with a plain field and [ Save ]; the value is stored in `money.upiId`, shown masked ("vik•••@okhdfc") everywhere, and the Payment card names the biller as payee and charges the shown total once (J11 branch "No UPI ID saved"). | 7, 8 | P0 |
| AT-210 | J10, J13 | **Given** a bank code box, **when** a code is typed and "Use code" tapped, **then** the code is typed into the page and appears in no DB row, log, screenshot or AI request; **given** no code within 5 min, **then** the payment is FAILED with "Your bank's code ran out of time. No money was taken." and one button, and nothing is charged (R-02; J13 "Steps (Code box)"). | 7, 8 | P0 |
| AT-211 | J13 | **Given** a site asks for a passkey or a phone approval, **then** a `signin` card with `mode='take_over'` reads "{Site} sent an approval to your phone. Approve it there, then tap I'm done.", foo makes no click until "I'm done", and capture stays paused (J13 branch "Passkey / phone approval"). | 8, 18 | P1 |
| AT-212 | J14 | **Given** a routine "BTC below ₹55,00,000 (55 lakh)" exists, **when** the user asks for the same routine again, **then** no second routine is created and foo shows "You already have this: 'BTC below ₹55,00,000 (55 lakh)'. Change it instead?" [ Change it ] [ Make another anyway ] (J14 branch "Same routine already exists"). | 20 | P1 |
| AT-213 | J14 | **Given** 25 routines, **when** a 26th is asked for, **then** none is created and foo shows "That's 25 routines, the most I can look after. Delete one to add this." (J14 branch "Over 25 routines"). | 13 | P1 |
| AT-214 | J14 | **Given** `routines.pauseWhenAway` = true and foo not opened for 7 days, **then** every routine is `paused_away` and runs nothing (no AI call, no cost); **when** foo is opened, **then** one line "I paused {3} routines while you were away (since {Tue 6 Oct}). Turn them back on?" [ Resume all ] [ Choose ] appears and nothing resumes without a tap (J14 branch "User away 7+ days"). | 13, 19 | P0 |
| AT-215 | J14 | **Given** a routine that found nothing for 30 days, **then** foo asks once "Your '{Weekly deals}' routine hasn't found anything in 4 weeks. Keep it?" [ Keep ] [ Pause ] [ Delete ] with the "Why am I getting this?" footer, counted in the daily budget, and never asks again for that routine (suggestion key per 08-0 §G.13). | 19, 20 | P1 |
| AT-216 | J15 | **Given** helpers Trips and Money and a request that fits both, **then** foo shows a `choice` card "Who should take this?" with Trips tagged "Best fit" and Money, and no job starts until it is answered (J15 branch "Request fits two helpers"). | 1, 3 | P1 |
| AT-217 | J15 | **Given** Trips is paused, **when** the user messages Trips, **then** the line "Trips is paused. [ Turn on ] or ask foo instead." appears, no job starts and Trips' routines run nothing (J15 branch "Helper paused"). | 1 | P1 |
| AT-218 | J16 | **Given** a group with Trips and Money, **when** the user writes "@Trips find a stay in Goa", **then** Trips owns the job and Money posts nothing; **when** the user @mentions Home, who is not in the group, **then** "Home isn't in this group. [ Add Home ] or ask in Home's chat." appears and no job starts (J16 step 2 and branch). | 1 | P1 |
| AT-219 | J17 | **Given** facts "Lives in Mumbai" and a newer "Lives in Pune" (both You said), **then** the nightly tidy keeps the newer one and asks at most once "Do you live in Pune now, or Mumbai?" [ Pune ] [ Mumbai ] as a `choice` card (`purpose='memory_confirm'`) with the "Why am I getting this?" footer, counted in the daily budget (J17 branch; R-11). | 15, 19 | P1 |
| AT-220 | J19 | **Given** the Gmail connection expires, **then** jobs that need Gmail go to WAITING, one `error` card "Your Gmail connection expired. Bills and drafts are on hold." with the single button [ Reconnect ] appears, and Settings → Connections shows "Needs sign-in"; **when** reconnected, **then** the error card is edited in place and the jobs resume from the same step (J19.6; SM-A10). | 2, 29 | P1 |
| AT-221 | J20 | **Given** the PC is locked and a card needs the user, **then** the lock screen shows only "{agentName} · 1 thing needs you" (no chat text, names, amounts or buttons) and the full notification waits in Action Center (D-37). | 8, 14 | P1 |
| AT-222 | J21 | **Given** ₹2,140 of AI spend this month, **when** the AI cap is set to ₹2,000, **then** it applies at once: AI work pauses (jobs WAITING, routines `paused_cap`), the line "You've already spent ₹2,140 this month, so I'll pause AI work until Sun 1 Nov or until you raise the cap." appears, and no AI call is made until the cap is raised or the month changes; a value under ₹100 is refused (`money.aiCapPaise` ≥ 10,000, 08-0 §A.2) (J21 branch "Cap set below what's already spent"). | 13 | P0 |
| AT-223 | J22 | **Given** the user pastes a key-like string into search, **then** it is not saved in recent searches (`search.recent`), no result shows any secret value (secrets are never indexed), and no request goes to the AI (J22 branch "Query looks like a secret"). | 8 | P1 |
| AT-224 | J23 | **Given** "Delete everything" while offline, **then** the local wipe still completes (no `%APPDATA%\foo`, no `foo/` Credential Manager entry) and the done screen adds "I couldn't reach Google to disconnect foo. You can remove it yourself at myaccount.google.com → Security → Third-party access." (J23 branch "Offline during uninstall"). | 15 | P0 |
| AT-225 | J7 | **Given** the composer sends `message:send` twice with the same `clientId` (a retry after a timeout), **then** exactly one message row exists and both calls return the same `messageId` (idempotent; 08-1 §3 `message:send`). | — | P0 |
| AT-226 | J21 | **Given** a chat with a paid payment, a sent email and their approvals, **when** `chat:delete` runs, **then** the chat, its messages and cards are purged, the `approvals`, `payments` and `activity` rows stay (FKs `ON DELETE RESTRICT`, 08-0 §G.5), and `PRAGMA foreign_key_check` returns no rows afterwards. | 11, 15 | P0 |
| AT-035a | J8 | **Given** two Choice cards open in one chat and a typed answer that resolves on both, **then** the answer goes to the newest card and the other stays open; **given** one card where two options match by words (rule 3), **then** it is not an answer: the card stays open and foo posts "Did you mean {a} or {b}?" (`thread.choice_typed.tie`; 08-4 §26.6). | 6 | P1 |
| AT-077a | J18 | **Given** two jobs running in one chat, **when** the user types "stop", **then** a Choice card (`purpose: 'stop_which'`) "Stop which one?" shows the two job titles plus "Both" ("All of them" for three) and nothing stops until it is answered; unanswered for 15 min → `expired`, nothing stopped (08-4 §26.9). | 18 | P1 |
| AT-077b | J18 | **Given** a job in NEEDS YOU with a PENDING Approval card, **when** the user sends a steer ("make it 2 rooms"), **then** the card becomes SUPERSEDED with the footer "You changed something, so I stopped. See the new card below." (`cards.approval.line.superseded_steer`), the job returns to WORKING, and any new card replaces the old one; a later steer supersedes the card made for the earlier one the same way (08-4 §26.5). | 5, 18 | P0 |
| AT-114a | J9, J10 | **Given** a restaurant or hotel booking whose confirmation page shows a 6-character booking code next to the word "code" ("Booking code TJ8821"), **then** `finish()` finds it in the pre-redaction result, the job is DONE (not `done_unverified`) and the Proof chip shows the code; the OTP rule does not hide it (08-4 §26.11). Flights are never booked in v1 (AT-157). | 11 | P0 |
| AT-116a | J18 | **Given** a WORKING job with no progress for 60 s (`JobRow.slow`), **then** the bubble badge stays 🛠 `working` with the tooltip "Taking longer than usual" (08-0 §F); no `slow` badge value and no ⏳ until the stuck card (AT-116). | 12, 16 | P1 |
| AT-118a | J19 | **Given** `foo.db` fails `PRAGMA quick_check` at startup, **then** it is renamed `foo-damaged-{yyyy-mm-dd-HHmm}.db`, a fresh database is rebuilt from the mirrors (08-1 §4.1.1), and one `error` card (`DB_REBUILT`) in the new foo chat reads "I lost my copy of your older chats after a problem on this PC." / "Your memory, routines, helpers and activity log are safe." [ OK ] (keys `errors.db_rebuilt.what_happened`, `.what_is_safe`, `.button`); an approval rebuilt as RUNNING with `submitted_at` set becomes CHECKING and is never re-submitted. | 7, 29 | P0 |
| AT-155a | J2 | **Given** the AI picker, **then** the helper apps foo knows are exactly `claude-cli`, `codex-cli` and `gemini-cli` (`resources/maker-pages.json`, 08-0 §E.5); each one only opens its maker's page; no install, download or run path exists for any of them (X-42). AT-155's wording is unchanged. | 2, 15 | P1 |

B.8 **Totals after review Phase 1.** 184 acceptance tests in this file: AT-001…AT-157 (157) and AT-200…AT-226 (27). P0: 113. P1: 71. Plus 7 sub-tests (AT-035a, AT-077a, AT-077b, AT-114a, AT-116a, AT-118a, AT-155a; P0: 3, P1: 4). AT-146 runs only when `flags.hub` is on (v1.1); the v1 release counts 183 (+ 7 sub-tests). J24–J30 tests (AT-158…AT-199: 42; AT-230…AT-266: 37) are counted in `12-features-r25-r31-*.md` and listed by pointer in §B.9.

### B.9 R25–R31 tests (pointers)

The J24–J30 tests live only in `12-features-r25-r31-1.md` §12.A (AT-158…AT-199, J24–J26) and `12-features-r25-r31-2.md` §12.31 (AT-230…AT-266, J27–J30; AT-263…AT-266 photo check, 08-0 §G.18, X-98). **12-* is the source of truth**: this table only points there and holds no test text; run each test exactly as its 12-* row says. Titles here are labels for finding the row; if a title or priority here differs from 12-*, 12-* wins and this table is fixed.

| ID | J | Title | P | Lives in |
|---|---|---|---|---|
| AT-158 | J24 | Ideas page opens | P1 | `12-features-r25-r31-1.md` §12.A (J24 §12.24) |
| AT-159 | J24 | Ideas chips filter | P1 | `12-features-r25-r31-1.md` §12.A (J24 §12.24) |
| AT-160 | J24 | Idea needs Gmail / Google | P1 | `12-features-r25-r31-1.md` §12.A (J24 §12.24) |
| AT-161 | J24 | Watch my PNR offer card | P1 | `12-features-r25-r31-1.md` §12.A (J24 §12.24) |
| AT-162 | J24 | Start it creates routine | P1 | `12-features-r25-r31-1.md` §12.A (J24 §12.24) |
| AT-163 | J24 | Not now on idea offer | P1 | `12-features-r25-r31-1.md` §12.A (J24 §12.24) |
| AT-164 | J24 | Idea routines are prompted | P1 | `12-features-r25-r31-1.md` §12.A (J24 §12.24) |
| AT-165 | J24 | See ideas and "what can you do?" | P1 | `12-features-r25-r31-1.md` §12.A (J24 §12.24) |
| AT-166 | J24 | Start disabled offline / at 25 routines | P1 | `12-features-r25-r31-1.md` §12.A (J24 §12.24) |
| AT-167 | J24 | Medicine reminder privacy | P1 | `12-features-r25-r31-1.md` §12.A (J24 §12.24) |
| AT-168 | J25 | Train search Choice card | P1 | `12-features-r25-r31-1.md` §12.A (J25 §12.25) |
| AT-169 | J25 | Tapping a train starts booking | P1 | `12-features-r25-r31-1.md` §12.A (J25 §12.25) |
| AT-170 | J25 | IRCTC sign-in puzzle | P1 | `12-features-r25-r31-1.md` §12.A (J25 §12.25) |
| AT-171 | J25 | Train Payment card lines | P1 | `12-features-r25-r31-1.md` §12.A (J25 §12.25) |
| AT-171a | J25 | Cancel row and refund are estimates | P1 | `12-features-r25-r31-1.md` §12.A (J25 §12.25) |
| AT-172 | J25 | Booked once with PNR proof | P1 | `12-features-r25-r31-1.md` §12.A (J25 §12.25) |
| AT-173 | J25 | Fare changed after Approve | P1 | `12-features-r25-r31-1.md` §12.A (J25 §12.25) |
| AT-174 | J25 | Waitlist booking | P1 | `12-features-r25-r31-1.md` §12.A (J25 §12.25) |
| AT-175 | J25 | PNR watch status change | P1 | `12-features-r25-r31-1.md` §12.A (J25 §12.25) |
| AT-176 | J25 | Chart prepared, still waitlisted | P1 | `12-features-r25-r31-1.md` §12.A (J25 §12.25) |
| AT-176a | J25 | PNR watch signed out, no polling | P1 | `12-features-r25-r31-1.md` §12.A (J25 §12.25) |
| AT-177 | J25 | Tatkal Plan card | P1 | `12-features-r25-r31-1.md` §12.A (J25 §12.25) |
| AT-178 | J25 | Tatkal reminder at 9:50 AM | P1 | `12-features-r25-r31-1.md` §12.A (J25 §12.25) |
| AT-178a | J25 | Tatkal reminder in quiet hours | P1 | `12-features-r25-r31-1.md` §12.A (J25 §12.25) |
| AT-179 | J25 | Tatkal Payment card expires | P0 | `12-features-r25-r31-1.md` §12.A (J25 §12.25) |
| AT-180 | J25 | Tatkal sign-in not done by 10:15 AM | P1 | `12-features-r25-r31-1.md` §12.A (J25 §12.25) |
| AT-181 | J25 | Tatkal opening time (non-AC, 11:00) | P1 | `12-features-r25-r31-1.md` §12.A (J25 §12.25) |
| AT-182 | J25 | Confirmed seats only, sold out | P1 | `12-features-r25-r31-1.md` §12.A (J25 §12.25) |
| AT-183 | J25 | Clock wrong blocks Tatkal | P1 | `12-features-r25-r31-1.md` §12.A (J25 §12.25) |
| AT-184 | J25 | Departure reminder time | P1 | `12-features-r25-r31-1.md` §12.A (J25 §12.25) |
| AT-185 | J25 | Bookings open 60 days ahead | P1 | `12-features-r25-r31-1.md` §12.A (J25 §12.25) |
| AT-185a | J25 | Booking-opens reminder at 08:00 IST | P1 | `12-features-r25-r31-1.md` §12.A (J25 §12.25) |
| AT-186 | J25 | Booking not allowed | P0 | `12-features-r25-r31-1.md` §12.A (J25 §12.25) |
| AT-187 | J25 | Aadhaar OTP never in chat | P0 | `12-features-r25-r31-1.md` §12.A (J25 §12.25) |
| AT-188 | J26 | Recharge plan Choice card | P1 | `12-features-r25-r31-1.md` §12.A (J26 §12.26) |
| AT-189 | J26 | Recharge Payment card | P1 | `12-features-r25-r31-1.md` §12.A (J26 §12.26) |
| AT-190 | J26 | Show plans is read-only | P1 | `12-features-r25-r31-1.md` §12.A (J26 §12.26) |
| AT-191 | J26 | Which number? (masked) | P1 | `12-features-r25-r31-1.md` §12.A (J26 §12.26) |
| AT-192 | J26 | Unknown biller site | P0 | `12-features-r25-r31-1.md` §12.A (J26 §12.26) |
| AT-193 | J26 | FASTag hand-back site | P0 | `12-features-r25-r31-1.md` §12.A (J26 §12.26) |
| AT-194 | J26 | Electricity bill via Bill card | P1 | `12-features-r25-r31-1.md` §12.A (J26 §12.26) |
| AT-195 | J26 | Recharge reminder offer | P1 | `12-features-r25-r31-1.md` §12.A (J26 §12.26) |
| AT-196 | J26 | Duplicate recharge warning | P1 | `12-features-r25-r31-1.md` §12.A (J26 §12.26) |
| AT-197 | J26 | Gas refill too soon | P1 | `12-features-r25-r31-1.md` §12.A (J26 §12.26) |
| AT-198 | J26 | Convenience fee and total change | P1 | `12-features-r25-r31-1.md` §12.A (J26 §12.26) |
| AT-199 | J26 | Paying not allowed | P0 | `12-features-r25-r31-1.md` §12.A (J26 §12.26) |
| AT-230 | J27 | Catch me up | P1 | `12-features-r25-r31-2.md` §12.31 (J27 §12.27) |
| AT-231 | J27 | read-only | P1 | `12-features-r25-r31-2.md` §12.31 (J27 §12.27) |
| AT-232 | J27 | privacy | P1 | `12-features-r25-r31-2.md` §12.31 (J27 §12.27) |
| AT-233 | J27 | in a group | P1 | `12-features-r25-r31-2.md` §12.31 (J27 §12.27) |
| AT-234 | J27 | reply | P1 | `12-features-r25-r31-2.md` §12.31 (J27 §12.27) |
| AT-235 | J27 | calendar | P1 | `12-features-r25-r31-2.md` §12.31 (J27 §12.27) |
| AT-236 | J27 | nothing new | P1 | `12-features-r25-r31-2.md` §12.31 (J27 §12.27) |
| AT-237 | J27 | window | P1 | `12-features-r25-r31-2.md` §12.31 (J27 §12.27) |
| AT-238 | J27 | not linked / hidden | P1 | `12-features-r25-r31-2.md` §12.31 (J27 §12.27) |
| AT-239 | J27 | validation | P1 | `12-features-r25-r31-2.md` §12.31 (J27 §12.27) |
| AT-240 | J28 | bill photo | P1 | `12-features-r25-r31-2.md` §12.31 (J28 §12.28) |
| AT-241 | J28 | paper amount differs | P1 | `12-features-r25-r31-2.md` §12.31 (J28 §12.28) |
| AT-242 | J28 | no vision | P1 | `12-features-r25-r31-2.md` §12.31 (J28 §12.28) |
| AT-243 | J28 | PDF pages (X-109) | P1 | `12-features-r25-r31-2.md` §12.31 (J28 §12.28) |
| AT-244 | J28 | ticket | P1 | `12-features-r25-r31-2.md` §12.31 (J28 §12.28) |
| AT-245 | J28 | calendar always | P1 | `12-features-r25-r31-2.md` §12.31 (J28 §12.28) |
| AT-246 | J28 | missing field | P1 | `12-features-r25-r31-2.md` §12.31 (J28 §12.28) |
| AT-247 | J28 | secret in picture | P0 | `12-features-r25-r31-2.md` §12.31 (J28 §12.28) |
| AT-248 | J28 | no memory | P1 | `12-features-r25-r31-2.md` §12.31 (J28 §12.28) |
| AT-249 | J29 | Explorer | P1 | `12-features-r25-r31-2.md` §12.31 (J29 §12.29) |
| AT-250 | J29 | nothing starts | P1 | `12-features-r25-r31-2.md` §12.31 (J29 §12.29) |
| AT-251 | J29 | cold start | P1 | `12-features-r25-r31-2.md` §12.31 (J29 §12.29) |
| AT-252 | J29 | limits | P1 | `12-features-r25-r31-2.md` §12.31 (J29 §12.29) |
| AT-253 | J29 | keep | P1 | `12-features-r25-r31-2.md` §12.31 (J29 §12.29) |
| AT-254 | J29 | setup not done | P1 | `12-features-r25-r31-2.md` §12.31 (J29 §12.29) |
| AT-255 | J29 | install | P1 | `12-features-r25-r31-2.md` §12.31 (J29 §12.29) |
| AT-256 | J30 | start | P1 | `12-features-r25-r31-2.md` §12.31 (J30 §12.30) |
| AT-257 | J30 | no memory | P0 | `12-features-r25-r31-2.md` §12.31 (J30 §12.30) |
| AT-258 | J30 | cards unchanged | P0 | `12-features-r25-r31-2.md` §12.31 (J30 §12.30) |
| AT-259 | J30 | end | P0 | `12-features-r25-r31-2.md` §12.31 (J30 §12.30) |
| AT-260 | J30 | activity | P0 | `12-features-r25-r31-2.md` §12.31 (J30 §12.30) |
| AT-261 | J30 | search, brief, notifications | P1 | `12-features-r25-r31-2.md` §12.31 (J30 §12.30) |
| AT-262 | J30 | busy | P1 | `12-features-r25-r31-2.md` §12.31 (J30 §12.30) |
| AT-263 | J28 | photo check | P0 | `12-features-r25-r31-2.md` §12.31 (J28 §12.28) |
| AT-264 | J28 | photo check | P0 | `12-features-r25-r31-2.md` §12.31 (J28 §12.28) |
| AT-265 | J28 | no OCR | P0 | `12-features-r25-r31-2.md` §12.31 (J28 §12.28) |
| AT-266 | J28 | PDF pages | P1 | `12-features-r25-r31-2.md` §12.31 (J28 §12.28) |

B.9.1 **Totals (counted in 12-*, not in B.8).** AT-158…AT-199: 42 (plus sub-tests AT-171a, AT-176a, AT-178a, AT-185a); AT-230…AT-266: 37.

### B.10 Round-2, owner-ruling, Look Book and real-app tests (2026-10-17; X-128…X-155)

Added by the acceptance lane after the lean check (`review/lean-check/notes.md`: "10-acceptance has no AT for round-2 additions"). Numbering continues at AT-267 (AT-227…AT-229 stay unused). Every row cites the decision and the spec section it checks; where they differ, the spec section wins (rank rule above) and the row is fixed. Same table format as B.7.

| ID | J | Given → When → Then | Art. | P |
|---|---|---|---|---|
| AT-267 | J11 | **Given** a sandbox email from a sender whose domain is in `resources/billers.json`, holding "₹842" and no date, received Sat 17 Oct, **when** `bill_watch` runs, **then** one `bill` card appears with `dueOn` = Sat 24 Oct (received + 7 days) and its due line replaced by "Due date not in the email" in `--t-caption` `--fg-3` (`cards.bill.no_due_date`); "Remind me" sets the reminder for 9:00 AM the day before `dueOn` (X-136, X-115 (7); 08-4 §26.14; 05-3 §5.29.2). | 3, 21 | P1 |
| AT-268 | J11, J28 | **Given** a photographed or filed bill whose `dueOn` ≤ today, **then** its `bill` card shows [ Pay now ] and the Link "I already paid" (`cards.bill.already_paid`) and no "Mark paid" chip exists anywhere in the app; **when** "I already paid" is tapped, **then** the state is `already_paid` exactly as AT-153 (X-140). | 2, 20 | P1 |
| AT-269 | J16 | **Given** a mirrored WhatsApp group (`chats.kind='wa_mirror'`), **then** the composer placeholder is "Draft a message for {group}" (`composer.placeholder.wa_mirror`); **when** text is sent there, **then** a `whatsapp.draft` Draft card for that group appears in **foo's chat**, the mirror shows the marker "Draft ready in {agentName}'s chat." (`thread.wa_mirror.draft_made`) with Link "Open" (`thread.wa_mirror.open`), Open shows foo's chat scrolled to that Draft card, and no WhatsApp send call is made from the mirror (fake WhatsApp records 0 outbound messages) (X-128, X-138; 04 §10.11). | 4 | P0 |
| AT-270 | J16 | **Given** a mirror chat with 250 stored WhatsApp messages from 3 senders plus the user, **when** it opens, **then** only the newest 200 render, the top line reads "I keep 7 days of WhatsApp messages." (`thread.wa_mirror.retention`), the user's own messages sit on the right in `--bubble-me` with no ticks, every other bubble shows its sender name coloured by `hash(jid) mod 10` into the ten 02 F2 helper colours in F2 order (`--fg-1` in dark), and no reaction, reply or select action is offered; the chat-list row shows the letter avatar with the 16px WhatsApp mark, preview "{sender_label}: {text}", no pill, muted by default (X-128, X-138; 04 §10.11; 03-1 §3.4.5.1). | 4, 24 | P1 |
| AT-271 | J20 | **Given** foo's face `living:warm`, **when** the renderer sends `face:raster` (via `FooBridge.send`, the only renderer → main event), **then** the file is written as `{DATA}\avatars\raster\living-warm-{size}-{mood}.png` (no `:` in any raster file name; `safeName()`), sizes are only 16, 20, 24, 32 or 48, the toast logo uses the 48 PNG with its mood ring, and with the taskbar at 100 / 125 / 150 / 200 % the tray uses the 16 / 20 / 24 / 32 PNG unscaled and without a ring (X-135; 02-2 §F15.9.9; 09 §9.8.1). | 24, 27 | P1 |
| AT-272 | J13, J18 | **Given** a job in the live window in state `in_control`, **then** the only hand-back control is [ Hand back to {agentName} ] (plus Stop); **when** it is tapped, **then** main sends `job.handBack { jobId }` with no `mode` field, foo re-reads the page and carries on, and no "I'll finish this myself" option appears anywhere (X-135, owner item 8). | 2, 5 | P1 |
| AT-273 | J19 | **Given** Claude Code is not answering and the backup AI ChatGPT answers a plain reply, **then** that bubble's footer shows `ArrowSync` 12 + "Answered with ChatGPT while Claude rests" (`bubble.backup_mark.text`, test id `bubble-backup-mark`) and Narrator reads the bubble with the suffix ", answered with ChatGPT" (`bubble.backup_mark.accessible_suffix`); job messages and cards answered by the backup never show the mark (X-128, X-138; 04 §12.5). | 9, 26 | P1 |
| AT-274 | J3, J4 | **Given** a clean first run, **then** the welcome, AI finder, name, face and apps cards are `cards.type 'setup'` with `SetupCard` ∈ `welcome \| ai_finder \| name \| face \| apps` (no `whatsapp_link` value exists), and Card E is `cards.type 'connect'` with `ConnectPayload { variant: 'whatsapp', setupCard: 'E' }`, root `card-connect` with `data-row-id="E"` and QR panel `setup-whatsapp-link`; the card-type registry holds exactly 25 types (X-119, X-139; 08-0 §B.2). | 25 | P1 |
| AT-275 | J28 | **Given** the AI is `claude-cli` (same for `codex-cli`, `gemini-cli`) and the user sends a photo of an electricity bill showing "Amount ₹1,240 Due 28 Oct", **then** main reads the words with Windows built-in OCR (`Windows.Media.Ocr`) with the network blocked and no request leaves the PC during the read, the turn carries no image part, its text includes "Text read from the picture:" followed by the read words after the photo check (AT-263, AT-264 masking applies), no `AI_NO_VISION` is raised, and the flow continues at 12-2 §12.28 step 3 (X-142; 08-4 §30.10). | 8, 15 | P0 |
| AT-276 | J28 | **Given** a CLI AI and a photo with no readable words (a face, or a chart with no text), **then** `AI_NO_VISION` is raised, the job goes NEEDS_YOU and the 12-2 §12.28.6 ask line is posted ("Your AI can't read pictures. Can you type the amount and due date?" for a bill); **given** an HTTP AI with `vision = true`, **then** the picture is sent as an image part and no OCR text prefix is added (X-142, X-123). | 2, 8 | P1 |
| AT-277 | J1 | **Given** the installed app, **then** the app icon (.ico at 16, 24, 32, 48, 256), taskbar button, installer, splash lockup and About all show the two-eyes face in its static Resting pose matching `foo/look-book/assets/logo-face.svg` (disc `--fg-1`, eyes `--bg-app`; .ico uses the light pair plus the §F15.1 rim), no lowercase "f" mark appears anywhere, and none of these animate; `FooMark.tsx` renders the face (X-143; 02-2 §F15.1; 11-fidelity screenshot compare). | 24, 27 | P1 |
| AT-278 | All | **Given** the dark theme, **then** the user's own bubble fill is `#2C359A` (`--bubble-me`, CR-0024 F6), its text `#FFFFFF` (`--on-bubble-me`, measured contrast ≥ 7:1), its time and secondary text `#C9D0FF` (`--on-bubble-me-2`), read ticks `#FFFFFF` (`--tick-read-on-me`) and its soft fill `#232B7E`; **given** the light theme, **then** all five tokens equal the 02 F2 light values unchanged (X-145). | 24, 26 | P1 |
| AT-279 | All | **Given** the ART-24 size scan (§D), **then** every width, height, padding, margin and gap is a multiple of 4 except 1px/1.5px borders, 2px (`--s-1`) and exactly these four: card padding 14 (02 F3), composer pill 46 (04 §20.3), checklist step row 30 (05 §5.2.1), Thinking row 38 (04 §14.3); any other non-multiple of 4 fails (X-146; 02-2 §F11.1). | 24 | P1 |
| AT-280 | J10, J12 | **Given** Approval cards for sending an email, sending a WhatsApp message, a payment, a booking and a delete, **then** none shows the scope control `card-approval-scope`, each shows "I'll always ask for this one."; **given** a calendar-add card or a "let a helper use an app" card, **then** the scope control shows with "Just this once" selected; **given** Settings → Permissions, **then** the Always segment of `p-send`, `p-book`, `p-pay`, `p-delete` and `p-post` is disabled with its tooltip, and no "Always" or "For this chat" rule for a send or spend kind can be created from any surface (X-147; 05-2 §5.5.3; 06-2 §6.4). | 4, 5 | P0 |
| AT-281 | J15 | **Given** a helper chat with 2 jobs WORKING, 1 routine and 3 jobs finished in the last 7 days (one 8 days ago), **when** the details panel opens, **then** "DOING NOW" is followed by the 3-segment control "In progress" (selected) / "Scheduled" / "Done" (`app-panel-jobs-tab`, `data-state` `progress\|scheduled\|done`); Scheduled shows "{routine name} · next {Sat 17 Oct, 9:00 AM}" and click opens Routines at it; Done shows the 3 recent jobs newest first and not the 8-day-old one; each empty tab shows its line ("Nothing running. Ask me to do something and you'll see it here." / "No routines in this chat yet." / "Nothing finished in the last 7 days.") (X-148; 03-2 §3.7.3.1). | 6 | P1 |
| AT-282 | J19 | **Given** two chat-specific failures in one chat (a message not sent, then a job failed), **then** two notices stack above the composer, newest on top, each with `ErrorCircle`, the same sentence as the in-chat error, "Copy code" and Dismiss, and "Clear all" at the right of the top notice; **when** Copy code is tapped, **then** the clipboard holds `{ErrorKind}-{6-char id}` and the link shows "Copied" for 2 s; **when** Dismiss or Clear all is used, **then** only the notices go: the job state, message row and Activity log are byte-identical before and after; with 5 notices only 3 show plus "+2 more"; notices are gone after 24 h away from the chat (X-149; 04-2 §23.2a). | 2, 25 | P1 |
| AT-283 | All | **Given** Settings → Appearance → "Animations", **then** it offers "Full" / "Basic" / "Off" (`settings.appearance.animations`); a first run on a PC with ≤ 4 logical CPUs or < 8 GB RAM stores "Basic", otherwise "Full"; with Windows "Animation effects" off the picker shows "Off · set by Windows" and is disabled, and turning it back on applies without restart; `<html data-motion>` follows the value; in "Basic" no element moves, scales, rotates, animates height or shimmers and every fade lasts 200 ms `cubic-bezier(.4,0,.2,1)` (`--m-basic`) (X-150; 02 F7). | 26, 28 | P1 |
| AT-284 | All | **Given** three helper bubbles within 3 minutes, **then** they group with the 2px gap only when they are on the same calendar day, the earlier bubble has no reaction chip and no status badge, and no unread divider lies between them; each of those three conditions alone breaks the run (X-151; 04 §1.3 rule 5). | 24 | P1 |
| AT-285 | All | **Given** an open chat scrolled 14px above the bottom, **when** a message arrives, **then** the list stays pinned to the bottom; **given** 16px or more above, **then** the list does not move and the jump button widens to "↓ {n} new" (`thread-jump-latest-count`, "99+" cap); the chat's unread count clears only after the newest message has been in view for 1 s with the window focused, and scrolling past it faster leaves it unread (X-152; 04 §1.6; 03-2 §3.6.6). | 24 | P1 |
| AT-286 | J15 | **Given** a helper chat whose last job ended DONE 25 h ago with nothing queued, working, waiting or pending, no unread, not pinned, **then** its row is one 44px line (26px face, name, " · Done {Thu}", time) with `chatlist-row` `data-folded="true"` and its place in the order unchanged; at 23 h, or with any of those conditions broken, or for foo's chat, it is not folded; a new message, job or card unfolds it (X-153; 03-1 §3.4.7). | 6 | P1 |
| AT-287 | J15 | **Given** a helper chat with a job WORKING and no higher-priority preview (03-1 §3.4.6 rules 1–3), **then** the row preview reads "Working on {job title}…" in `--fg-2` with no animation, and "Waiting to start {job title}…" while the job is QUEUED; it returns to the normal preview when the job ends (X-154; 03-1 §3.4.6 rule 3a). | 6 | P1 |
| AT-288 | J8 | **Given** a Choice card with 3 questions, **then** the header shows "1 of 3" (`card-choice-pager`), tapping a row advances after `--m-card` with no Next button, "Back" (`card-choice-back`) shows from question 2; **when** the keys 1–4 are pressed with the card focused, **then** they pick that option directly (X-155; 05-1 §5.3.1, §5.3.5). | 2, 26 | P1 |

B.10.1 **Totals for B.10.** 22 tests, AT-267…AT-288 (P0: 3 — AT-269, AT-275, AT-280; P1: 19). Running total in this file: 206 acceptance tests (184 + 22) plus 7 sub-tests; v1 release counts 205 (AT-146 is v1.1).

B.10.2 **Spec drift found while writing (for the owning thread, not changed here).** (1) 12-2 §12.28 step 1 and §12.28.6 still say any picture with `vision = false` raises `AI_NO_VISION`; X-142 and 08-4 §30.10 now read the words first, and AT-275 follows 08-4. (2) 02-2 lines in §F15.9 ("The 'f' mark (§F15.1) stays the app icon and logo"; the Brand mark row) still describe the "f" mark; X-143 supersedes them and AT-277 follows X-143. (3) 06 Settings → Appearance has no "Animations" row yet (X-150 adds it); AT-283 uses 02 F7's wording until it lands. **Fixed 2026-10-17 by the Look Book thread:** (1) 12-2 §12.28 step 1, §12.28.6, §12.28.7 and AT-242 now read the words first (X-142); (2) 02-2 §F15.1, §F15.3, §F14.7, §F15.9 and 09 §9.2, 06-1 §2.1 now describe the two-eyes logo (X-143); (3) 06-2 §6.2 has the "Animations" row and 08-0 has `appearance.animations` (X-150).
