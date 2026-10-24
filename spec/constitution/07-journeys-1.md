# 07 · Journeys (the official index) · part 1 of 2

Part 1 (this file): §7.0–§7.3, rules, surface keys and the J1–J23 index. Part 2 (`07-journeys-2.md`): §7.4 state machines, §7.5 reconciliation, §7.6 behaviour constants, §7.7 decision register. Read both; they are one chapter.

This chapter is the official index of foo's 23 end-to-end journeys. It does four things:

1. Points to the full, normative text of every journey (J1–J23) in `research/journeys-1..4.md`, with a summary, the surfaces each touches and a step strip.
2. Carries the **two state machines** (job, approval card) verbatim. They are authoritative.
3. **Reconciles** every place where the journeys disagree with `01-articles.md` or `02-foundations.md`. The articles and foundations win; §7.5 states the exact resolution the builder MUST use.
4. Lists every `[foo decision]` made in the journeys (§7.7) so Vikas can see and veto them.

Status: written 16 Oct 2026. Rank: behaviour spec (README order of authority, level 5). Copy in "double quotes" is final unless §7.5 amends it.

---

## 7.0 Rules for using this chapter

7.0.1 The journey text in `research/journeys-N.md` is **normative** for behaviour, copy, branches, storage and notifications. It is not "evidence only": the README rule that research never overrides a spec does not demote it, because this chapter adopts it as spec.

7.0.2 Where a journey conflicts with an article (01) or a foundation token or rule (02), the builder MUST apply the resolution in §7.5. A journey sentence amended by §7.5 is read as amended everywhere it appears, including in the shared components C1–C17 and the global rules G1–G17.

7.0.3 Where a journey conflicts with a surface spec (03–06) on a visual value, the surface spec wins. Where they conflict on behaviour (what happens, when, in what order), this chapter wins. Log every such conflict in `GAPS.md`.

7.0.4 Global rules G1–G17 restate articles. The article is the binding text; the G-rule is a pointer:

| G | Article | G | Article | G | Article |
|---|---|---|---|---|---|
| G1 One voice | 1 | G7 Proof | 11 | G13 Interruption budget | 19 |
| G2 No tech words | 2 | G8 Fresh yes | 9 | G14 Absolute times | 21 |
| G3 Check ≠ do | 3 | G9 Status on bubble | 16 | G15 Never offer twice | 20 |
| G4 Draft ≠ permission | 4 | G10 One checklist | 17 | G16 Taps not words | 6 |
| G5 Approval card | 5 | G11 Talk over it | 18 | G17 Second look | 10 |
| G6 Secrets | 8 | G12 Real status | 12 | | |

7.0.5 Shared components C1–C17 (journeys-1 §2) map to these surfaces: C1 status badge → 04; C2 checklist, C3 choice, C4 approval, C5 payment, C6 draft, C7 secret box, C8 paste catcher, C9 sign-in, C10 connect, C11 plan, C12 proof, C13 routine, C14 memory chip, C16 error → 05; C15 handoff marker → 04; C17 toast → 06 and 09.

7.0.6 Example dates in this constitution follow the **2026** calendar (Fri 16 Oct, Sun 18 Oct, Sat 12 Dec) [settled: X-10]. Code MUST compute weekdays from the real date. Tests that compare copy MUST pin the clock to **Fri 16 Oct 2026, 9:00 AM IST** so the examples match (R-08). The research journeys (`research/journeys-1..4.md`) still show 2025 weekdays; where they differ, this chapter's 2026 examples win.

7.0.7 **Canonical names win over journey wording** (review Phase 1, X-53…X-80). Where a journey or this chapter names a setting, card type, card state, badge value, activity entry, permission value, file or test id, the name in `08-0-canonical-names.md` is the one to build: settings paths 08-0 §A; card types and states §G.1–§G.2 (a brief, a job link and an error are always cards; a memory chip and a handoff marker are `messages.kind='marker'` lines, not cards; the paste catcher is part of the composer, not a card); permissions Always · Ask · Never only §G.3 (no autonomy dial, X-54); badge values §F (X-61); Activity log `kind`/`event` §G.4 (X-62); Draft card lifecycle §G.7 (X-65); Watch live and sign-in windows §G.8 (X-66); words "cap", "notification", "Change" §G.15 (X-79); Stop on a stuck card §G.16 (X-80). Copy quoted here is stored under a copy key per 08-0 §D (X-59); test ids per 08-0 §C (X-58).

7.0.8 **Flights in v1 (compare and open)** [owner Q1 default (a); UJ-05]. foo searches and compares flights (J8 Choice card, AT-034) and, on the user's tap, opens the chosen airline or travel-site page in Edge and hands over (08-2 hand-back). foo does not fill passenger details, book or pay for flights in v1; no Payment card or booking Approval card is ever created for a flight. When the user asks foo to book a flight, foo replies with the fixed copy "I can find and compare flights, and open the booking page for you. Filling in passengers and paying for flights comes in a later version." [ Compare flights ] link "Not now" (copy key `thread.flight_scope.body`, buttons `thread.flight_scope.button.compare` / `thread.flight_scope.button.not_now`). Flight booking and paying arrive in v1.1 (PRD R38). Trains: R26, journey J25 (`12-features-r25-r31-1.md`). Test: AT-157.

---

## 7.1 Surface keys

Each journey lists the surfaces it touches using these keys. A key names the chapter and the section that chapter uses. If a chapter renames a section, update this table only.

| Key | Chapter | Section |
|---|---|---|
| **SH·Window** | 03 shell | Window (size, first open, single instance) |
| **SH·Title** | 03 shell | Title bar |
| **SH·Left** | 03 shell | Left shell: chat list, filter chips, "+ New helper", footer (gear, Routines) |
| **SH·Header** | 03 shell | Headers (chat header, setup step pill, ⋮ menu, ⓘ button) |
| **SH·Banner** | 03 shell | Banner strip under the title bar (offline, AI, cap, notifications blocked, update); the only place offline shows (R-34.8) |
| **SH·Main** | 03 shell | Main shell (conversation pane, date dividers) |
| **SH·Right** | 03 shell | Right shell: Doing now, Using, What I know, Spent this month |
| **MS·Me** | 04 messages & composer | Input text (your bubble) incl. status badge (C1) |
| **MS·Foo** | 04 messages & composer | Output text (foo's / helper's bubble), chunking, typing line |
| **MS·Voice** | 04 messages & composer | Voice-note bubbles (in and out) |
| **MS·React** | 04 messages & composer | Reactions |
| **MS·Marker** | 04 messages & composer | System lines (`messages.kind='marker'`, `marker_kind` per 08-0 §G.1): handoff marker (C15), memory chip, helper notice, date divider, "Why am I getting this?" footer |
| **MS·Composer** | 04 messages & composer | Composer (incl. recording bar, paste catcher trigger, disabled state, queued sends while offline) |
| **CD·Choice** | 05 cards | Choice card (C3), stepper, multi-select, photo options |
| **CD·Approval** | 05 cards | Approval card (C4) |
| **CD·Payment** | 05 cards | Payment card (C5) |
| **CD·Draft** | 05 cards | Draft card (C6) |
| **CD·Secret** | 05 cards | Secret box (C7, type `secret`; code box and card form are `secret.secretKind` `otp` / `card` / `cvv`) |
| **CD·Paste** | 04 / 05 | Paste catcher (C8): part of the composer, not a card type (`paste` removed, 08-0 §G.1); masked span "••••" (08-0 §H) |
| **CD·SignIn** | 05 cards | Sign-in-here / take-over card (C9, type `signin`, `signin.mode` ∈ sign_in_here \| take_over) |
| **CD·Connect** | 05 cards | Connect card (C10), WhatsApp QR card |
| **CD·Plan** | 05 cards | Plan card (C11) |
| **CD·Checklist** | 05 cards | Checklist card (C2, type `checklist`) and job link card (type `job_link`, mirror in foo chat) |
| **CD·Proof** | 05 cards | Proof chip and receipt footer (C12) |
| **CD·Routine** | 05 cards | Routine card (C13) |
| **CD·Memory** | 04 messages & composer / 05 cards | Memory chip (C14): a `marker` line with `marker_kind='memory_chip'`, not a card type (08-0 §G.1); 05 owns its look |
| **CD·Error** | 05 cards | Error card (C16, type `error`; recovery card = `error.variant='recovery'`), stuck card (type `stuck`), spend-cap card (type `spend_cap`) |
| **CD·Setup** | 05 cards | Welcome card, AI-finder card, name/face/vibe cards, interview cards: existing card types with `payload.setupCard: 'A'…'H'` (08-0 §G.1), no setup-only types |
| **CD·Brief** | 05 cards | Morning brief (type `brief`; always a card, never a message kind) |
| **CD·Bill** | 05 cards | Bill card (type `bill`, Money; `duplicate`, `scam` payload flags) |
| **CD·Helper** | 06 screens | New helper / New group forms: dialogs in 06 (SC·Helpers), not card types (`helper_form`, `group_form` removed, 08-0 §G.1) |
| **SC·FirstRun** | 06 screens | First run |
| **SC·Settings** | 06 screens | Settings (all 11 sections) |
| **SC·Memory** | 06 screens | Memory page |
| **SC·Helpers** | 06 screens | Helper profile, group |
| **SC·Routines** | 06 screens | Routines screen and routine detail |
| **SC·Search** | 06 screens | Search palette (Ctrl+K), find in chat |
| **SC·Live** | 06 screens / 09 §9.27 | Watch live window (`live.html`, masked CDP frames) and take-over / sign-in = the real Edge window plus the docked `signin-banner.html` (08-0 §G.8, X-66) |
| **SC·Toasts** | 06 screens | Toasts (content) |
| **SC·Tray** | 06 screens | Tray menu (content) |
| **SC·Receipt** | — | **Withdrawn** (R-34.4): payment review from a toast opens the main window at the card |
| **SC·Dialogs** | 06 screens | Confirm dialogs and sheets (typed confirm, first-close dialog) |
| **EN·Jobs** | 08 functions & engine | Job runner and job state machine |
| **EN·Approvals** | 08 functions & engine | Approval engine, second look, rules |
| **EN·AI** | 08 functions & engine | Your-AI engine (detect, verify, fallback, meter) |
| **EN·Conn** | 08 functions & engine | Connectors (Gmail, Calendar, Outlook, WhatsApp) |
| **EN·Browser** | 08 functions & engine | foo's browser, site notes, masking |
| **EN·Routines** | 08 functions & engine | Routines runner |
| **EN·Memory** | 08 functions & engine | Memory files, tidy, tombstones |
| **EN·Secrets** | 08 functions & engine | Security: vault, redaction, paste patterns |
| **EN·Store** | 08 functions & engine | Data model and storage map |
| **EN·Search** | 08 functions & engine | Local full-text search |
| **EN·Voice** | 08 functions & engine | Speech to text, text to speech |
| **EN·Log** | 08 functions & engine | Activity log (`kind`/`event` closed lists, 08-0 §G.4) and tech log |
| **WN·Install** | 09 windows | Installer, updater, uninstaller |
| **WN·Toasts** | 09 windows | Notifications (Windows delivery, buttons, quiet hours, Focus). No inline reply box in v1 (owner Q3 default): [ Open ] [ Mark as read ]; approvals [ Review ] [ Not now ] (X-02). On screen the word is "notification", never "toast" (X-79) |
| **WN·Taskbar** | 09 windows | Taskbar badge, progress, jump list |
| **WN·Tray** | 09 windows | Tray icon, tooltip |
| **WN·Startup** | 09 windows | Start at login, single instance, close-to-tray, power and sleep |
| **WN·Hello** | 09 windows | Windows Hello |
| **WN·Keys** | 09 windows | Keyboard shortcuts |
| **WN·Vault** | 09 windows | Credential Manager |
| **WN·Scale** | 09 windows | Scaling, text size, high contrast, reduced motion |

---

## 7.2 How each journey entry is written

Every entry in §7.3 has: **Summary** (one paragraph), **Touches** (surface keys from §7.1, grouped by chapter), **Strip** (one box per step, in order; `-->` = next step; a branch is not drawn), **Full text** (file and exact heading). The strip uses the journeys' own words; copy in the strip is shortened and is **not** final copy. Final copy is in the full text, as amended by §7.5.

---

## 7.3 Journey index

### J1 · Install and first launch

**Summary.** The user runs a code-signed, per-user installer (no admin prompt) on Windows 10 22H2 (build 19045) or Windows 11. Three installer screens ("Install foo", progress, "foo is ready."), then a silent readiness check (Windows version, 2 GB free, Edge or Chrome, `%APPDATA%` not on a network drive, Documents not an online-only OneDrive folder, sleep settings). The first window opens at 1280 × 800 (R-34.2; the journey said 1100×720) with an empty chat list (greyed "foo" row) and the welcome card "Hi, I'm foo." Setup J2–J5 then runs as cards inside foo's chat with a header pill "Step n of 4". Closing the window before "Let's go" leaves foo in the tray; the next open resumes at the unfinished step (`setup.step`), and inside the interview at the exact card (`setup.interviewCard`, 08-0 §A.1; earlier answers kept).

**Touches.** 03: SH·Window, SH·Left, SH·Header · 05: CD·Setup · 06: SC·FirstRun, SC·Settings (Files, Privacy link) · 08: EN·Store · 09: WN·Install, WN·Startup, WN·Tray, WN·Toasts (registration).

**Strip.**
```
[1 Run foo-setup.exe]-->[2 "Install foo" · Install]-->[3 "Installing…"]-->[4 Readiness check]
-->[5 "foo is ready." · auto-open 3 s]-->[6 First window · welcome card]-->[7 Let's go --> J2]
```
**Full text.** `research/journeys-1.md` → `## J1. Install and first launch`

### J2 · Finding and connecting the user's AI

**Summary.** foo looks for an AI the user already has, in a fixed ladder (Claude sign-in, ChatGPT sign-in, Gemini sign-in, saved keys, a free AI on this PC), tests every one it finds with one tiny real request (20 s limit), and picks the first that works. It says whether this uses a plan or a key (and the ₹1,000 monthly cap for keys). Nothing found → a Choice card of sign-in options or "I have a key" → Secret box. Chat stays locked ("Connect your AI first, then we can talk.") until one AI passes. Keys pasted in the composer trigger the paste catcher.

**Touches.** 03: SH·Header (step pill), SH·Right (Using) · 04: MS·Composer (disabled hint) · 05: CD·Setup, CD·Choice, CD·Secret, CD·Paste, CD·Error · 06: SC·Settings (Your AI) · 08: EN·AI, EN·Secrets, EN·Log · 09: WN·Vault, WN·Toasts.

**Strip.**
```
[1 AI-finder card · ladder rows]-->[2 Test each: "Testing…" --> "✓ works"]-->[3 Pick first working · Use / Pick another]
-->[4 Plan-or-key note]-->[5 "✓ Using Claude (your AI)" · Step 2 of 4 --> J3]
```
**Full text.** `research/journeys-1.md` → `## J2. Finding and connecting the user's AI (detect + verify)`

### J3 · Naming foo, avatar and vibe

**Summary.** foo asks "What should I call myself?" and never suggests a name in its own text; only the 🎲 button fills one (200-name list, no repeats per session). It answers in three words or fewer ("{Name} it is."), offers four faces (generated if the AI can make images, else four presets) or the user's own picture, then a vibe Choice card. The new name and face update the chat list, header, toasts and jump list within 1 s. A real task typed first is done first; the ritual resumes after.

**Touches.** 03: SH·Left, SH·Header · 04: MS·Foo · 05: CD·Setup, CD·Choice · 06: SC·Settings (Chat and voice → Talk style) · 08: EN·Memory (identity.md), EN·Store · 09: WN·Taskbar (jump list), WN·Toasts.

**Strip.**
```
[1 Step 2 of 4 pill]-->[2 "What should I call myself?" · Keep "foo" / Surprise me]-->[3 "{Name} it is."]
-->[4 "Pick a face." 2×2]-->[5 Vibe choice card]-->[6 One line in the vibe]-->[7 Step 3 of 4 --> J4]
```
**Full text.** `research/journeys-1.md` → `## J3. Naming foo, avatar and vibe`

### J4 · Interview and connecting Gmail, Calendar, WhatsApp

**Summary.** Eight one-question cards (A–H): what to call the user, consent to peek at installed apps (not files), which apps they use, Gmail + Calendar Connect card (Google sign-in in the default browser; read, draft, send-after-approval, calendar), WhatsApp link by QR (optional, fragile, read + send-after-approval only), who matters most, morning-brief time, how much to do alone ("Check with me first" is default; Card H writes only the Always · Ask · Never rows of `permissions` per 08-0 §G.3, X-54, and never sets send, book, pay, delete or share to Always). Every card has Skip; typing answers a card exactly as a tap does; an off-topic question is answered in one line and the card returns. foo ends with "Here's what I've got… Fix anything?"

**Touches.** 03: SH·Header, SH·Right (Using) · 04: MS·Foo · 05: CD·Setup, CD·Choice, CD·Connect, CD·Error · 06: SC·Settings (Apps, Notifications) · 08: EN·Conn, EN·Memory, EN·Secrets, EN·Log · 09: WN·Vault, WN·Toasts.

**Strip.**
```
[1 Step 3 of 4]-->[A Your name]-->[B Peek at apps?]-->[C Which apps]-->[D Connect Gmail + Calendar]
-->[E Link WhatsApp · QR]-->[F Who matters]-->[G Brief time]-->[H How much on my own]-->[10 Summary · Fix anything?]-->[11 Step 4 of 4 --> J5]
```
**Full text.** `research/journeys-1.md` → `## J4. Interview + connecting Gmail, Calendar and WhatsApp`

### J5 · First real task inside a minute

**Summary.** foo offers up to four first jobs (≤ 32 characters each) filtered by what was connected. The user taps one; the badge goes 👀 → 🛠, the checklist appears within 2 s, a result with a Proof chip arrives within 60 s, then a feedback card ("Looks right / Change something / Take it further"; a reminder offered under "Take it further" follows D-41). foo closes setup by stating the first brief time with an absolute date. Bills found are not saved as memory.

**Touches.** 03: SH·Header (pill disappears), SH·Left · 04: MS·Me (status), MS·Foo · 05: CD·Choice, CD·Checklist, CD·Proof, CD·Error, CD·Routine · 08: EN·Jobs, EN·Conn, EN·Log · 09: WN·Toasts.

**Strip.**
```
[1 Step 4 of 4]-->[2 Offer 4 first jobs]-->[3 Tap · 👀 --> 🛠]-->[4 Checklist ≤ 2 s]-->[5 Result + Proof ≤ 60 s]
-->[6 How does this look?]-->[7 "…first morning brief." · setup complete]
```
**Full text.** `research/journeys-1.md` → `## J5. First real task inside a minute`

### J6 · Daily morning brief and feedback

**Summary.** At 07:45 a background job reads calendar, Gmail, WhatsApp mentions, open jobs, routine findings, helper notes and weather; at the brief time (default 8:00 AM) foo posts one message with 1–5 scored cards (cap from Settings → Brief, default 5) (needs-you today, money due ≤ 3 days, birthdays ≤ 7 days, trips ≤ 7 days, one nice-to-know), each with at most one action and 👍 👎, ending "That's all for today". Zero items → the one-line light-day brief (05 §5.1 `cards.brief.light_day`). Feedback tunes tomorrow; 👎 twice on a kind → one "Stop showing…?" question. Late, skipped, offline, cap and expiry branches are fixed.

**Touches.** 03: SH·Left (unread), SH·Main (date divider) · 04: MS·Foo, MS·React, MS·Marker · 05: CD·Brief, CD·Error · 06: SC·Routines (Morning brief), SC·Toasts · 08: EN·Routines, EN·Jobs, EN·Memory (brief.md) · 09: WN·Toasts, WN·Startup (wake).

**Strip.**
```
[1 07:45 background job]-->[2 Score · keep 1–5]-->[3 Post brief at brief time]-->[4 Toast if not focused]
-->[5 👍 👎 / more-of less-of]-->[6 Light day: one line]-->[7 Unopened: dims after 12 h]
```
**Full text.** `research/journeys-2.md` → `## J6. Daily morning brief and feedback`

### J7 · Casual chat, including voice notes in and out

**Summary.** Plain talk is not a job. Noise replies ("thanks!") get a 👍 reaction and no message. Otherwise "typing…", then 1–3 short bubbles 0.8–2.5 s apart; lists stay whole; tables stay tables (CR-0053). foo mirrors the user's style without copying their emojis and never uses filler. Voice in: hold Ctrl+Space or the mic button, release to send, local transcript within 3 s. Voice out: default "When I send voice", voice bubble plus text, never auto-plays. Mic blocked, no mic, short or long recordings, low-confidence transcripts, memory chips and files have fixed branches.

**Touches.** 03: SH·Header (typing line) · 04: MS·Me, MS·Foo, MS·Voice, MS·React, MS·Composer (recording bar) · 05: CD·Memory, CD·Paste, CD·Error · 06: SC·Settings (Chat and voice) · 08: EN·Voice, EN·Memory, EN·AI · 09: WN·Keys, WN·Toasts.

**Strip.**
```
[1 Send · 👀 ≤ 1 s]-->[2 Noise? react 👍, stop]-->[3 typing… then one bubble]-->[4 Voice in: hold, release, transcript]
-->[5 Voice out: voice + text, no autoplay]
```
**Full text.** `research/journeys-2.md` → `## J7. Casual chat, including voice notes in and out`

### J8 · Asking a question with choice chips

**Summary.** Inside a job foo fills what it can from memory, then asks one Choice card per missing item: 2–4 options, option 1 tagged "Best fit", "Something else…" and Skip; it never lists the options in its own text. Tap, typing "2", typing the option text, or reacting 2️⃣ all answer. Up to 3 questions become a stepper; multi-select uses checkboxes + Done. Timeouts: reversible preferences auto-pick Best fit after 15 min and say so; real-world choices never auto-pick and cancel after 24 h; live prices are re-checked after 30 min.

**Touches.** 03: SH·Left (Needs you pill) · 04: MS·Me (status), MS·React, MS·Composer (hint) · 05: CD·Choice, CD·Memory, CD·Checklist · 06: SC·Toasts · 08: EN·Jobs, EN·Memory · 09: WN·Toasts, WN·Taskbar.

**Strip.**
```
[1 Job --> NEEDS YOU · status waiting]-->[2 Choice card · Best fit first]-->[3 Tap / type / react]
-->[4 Card collapses "question → answer"]-->[5 Job --> WORKING]
```
**Full text.** `research/journeys-2.md` → `## J8. Asking a question with choice chips`

### J9 · Restaurant booking

**Summary.** "book a table…" (book = do; "check/find" stops at options and asks). foo fills from memory, runs the route ladder (app → foo's browser on booking sites → restaurant site → email with fresh yes → hand back; no phone calls in v1), shows three photo options, re-checks the slot, then an Approval card with exact terms (charged now, no-show fee, free-cancel cutoff, name and phone shared). After the tap and the second look, it books once, adds a calendar event (covered by the same book approval because the card shows "Adds it to your calendar after booking.", 08-0 §G.3), shows a Proof chip, offers to tell the family group (Draft), and reminds 2 h before the free-cancel cutoff.

**Touches.** 03: SH·Left, SH·Right (Doing now) · 04: MS·Me, MS·Foo · 05: CD·Checklist, CD·Choice (photo options), CD·Approval, CD·Payment (no-show hold), CD·Draft, CD·SignIn, CD·Proof, CD·Error · 06: SC·Live, SC·Toasts · 08: EN·Jobs, EN·Approvals, EN·Browser, EN·Conn (Calendar), EN·Log · 09: WN·Toasts, WN·Taskbar.

**Strip.**
```
[1 Ask · 👀 --> 🛠]-->[2 Checklist · route ladder]-->[3 Pick a table · 3 options]-->[4 Re-check slot]
-->[5 Approval: Book table]-->[6 Tap · second look · book once]-->[7 "Booked." + Proof + calendar]
-->[8 Tell family? Draft]-->[9 Reminder 2 h before cutoff]
```
**Full text.** `research/journeys-2.md` → `## J9. Restaurant booking`

### J10 · Hotel booking with payment approval

**Summary.** foo hands the job to Trips (handoff marker, live link card in foo's chat). A Plan card (job > 2 min) waits for Go; the checklist runs; three stays are offered; foo fills checkout from memory and stops before Pay. A receipt-style Payment card shows payee, items, cancel terms, "Total charged once", masked contact and card, a 10-minute countdown. ₹10,000 or more needs Windows Hello. After the second look foo fills the card from the vault and pays **once**; a bank OTP goes to the Take-over lane; proof is the confirmation page and email. Any price change, late taxes, expiry, decline, unknown result (CHECKING, never re-submit) or non-refundable rate has fixed copy.

**Touches.** 03: SH·Left, SH·Right (Doing now, Spent) · 04: MS·Me, MS·Marker · 05: CD·Plan, CD·Checklist, CD·Choice, CD·Payment, CD·Secret (card form), CD·SignIn, CD·Proof, CD·Error · 06: SC·Live, SC·Toasts, SC·Helpers · 08: EN·Jobs, EN·Approvals, EN·Browser, EN·Secrets, EN·Log · 09: WN·Hello, WN·Vault, WN·Toasts, WN·Taskbar.

**Strip.**
```
[1 Hand to Trips · marker + link card]-->[2 Plan card · Go]-->[3 Checklist]-->[4 Pick a stay]-->[5 Fill checkout, stop before Pay]
-->[6 Payment card ₹14,600 · 10:00]-->[7 Approve + Windows Hello]-->[8 Second look · pay once]-->[9 OTP: take over]
-->[10 Wait for proof]-->[11 "Booked." + Proof + calendar]-->[12 Free-cancel reminder]
```
**Full text.** `research/journeys-2.md` → `## J10. Hotel booking with payment approval`

### J11 · Bill reminder and payment

**Summary.** A bill found in email (or asked for, or a habit) is handed to Money, which posts a bill card with Pay now / Remind me / I already paid and a source proof chip. Pay now checks the live amount on the biller's site and shows a Payment card (UPI by default); the user approves in their UPI app within 5 minutes. Proof is the biller receipt. After the third month in a row, Money offers once to make it a monthly remind-and-prepare routine that never pays by itself. Duplicate payments, changed amounts, overdue bills, scam-looking links and missing Gmail have fixed handling.

**Touches.** 03: SH·Left, SH·Right (Spent) · 04: MS·Marker · 05: CD·Bill, CD·Payment, CD·Proof, CD·Routine, CD·Error · 06: SC·Toasts, SC·Settings (Money and payments) · 08: EN·Jobs, EN·Approvals, EN·Conn, EN·Browser, EN·Routines, EN·Log · 09: WN·Toasts, WN·Taskbar.

**Strip.**
```
[1 Hand to Money · bill card]-->[2 Remind me Thursday (optional)]-->[3 Pay now · live amount · Payment card]
-->[4 Approve · UPI request · 5:00]-->[5 User approves on phone]-->[6 "Paid." + receipt proof]-->[7 Month 3: habit offer once]
```
**Full text.** `research/journeys-2.md` → `## J11. Bill reminder and payment`

### J12 · Drafting and sending an email or an X post

**Summary.** foo finds the thread (asks if the recipient is ambiguous), writes a Draft card in the user's style with their signature, edits in place on "Change" or chat instructions, and sends only on a tap. A known recipient's Draft carries the approval frame (R-14); a new recipient gets a full Approval card ("You haven't emailed her before"), no scope chips. A 5-second Undo bar runs before the hand-off to Gmail; the second look checks recipient and dates; proof is Gmail's Sent folder. Lifecycle per 08-0 §G.7 (X-65): the approval row is created with the draft (PENDING, 60 min); "Send email" approves once; Change edits the Gmail draft in place; Discard deletes it. X posts are draft-only: foo opens X's compose page and the user presses Post. WhatsApp messages follow the email path. Injection in incoming email is ignored and reported.

**Touches.** 04: MS·Foo · 05: CD·Draft, CD·Approval, CD·Choice, CD·Proof, CD·Error · 06: SC·Toasts, SC·Settings (What foo can do, Apps) · 08: EN·Approvals, EN·Conn, EN·Memory (style.md), EN·Log · 09: WN·Toasts.

**Strip.**
```
[1 Find thread / recipient]-->[2 Draft card · not sent]-->[3 Change in place]-->[4 Tap Send email]
-->[5 Undo bar 5 s]-->[6 Second look]-->[7 "✓ Sent" + Proof]      X: [2 Draft]-->[3 Open in X to post]-->[4 "Opened in X · not posted by foo"]
```
**Full text.** `research/journeys-2.md` → `## J12. Drafting and sending an email or an X post`

### J13 · Login handoff: sign in here, OTP, CAPTCHA, take over

**Summary.** When a job hits a wall that needs the person, foo picks a lane: Secret box (keys), saved login filled from the vault, Sign in here (the real Edge window brought to the front with foo's docked sign-in banner above it, 08-0 §G.8 / 09 §9.27; screenshots and page reading paused, "foo is waiting. It can't see what you type here."), Code box (typed into the page, never stored, never shown to the AI), Take over (CAPTCHA, passkey, 3-D Secure; foo makes no clicks until "Hand back to foo"), or Connect for app accounts. foo continues when the page changes, offers once to save the login (re-typed into a Secret box), reminds at 10 min and cancels at 2 h.

**Touches.** 03: SH·Left (Needs you) · 04: MS·Composer (paste catcher) · 05: CD·SignIn, CD·Secret, CD·Connect, CD·Paste, CD·Error · 06: SC·Live (sign-in window, take-over bar), SC·Settings (Privacy → Signed-in sites), SC·Toasts · 08: EN·Browser, EN·Secrets, EN·Conn, EN·Log · 09: WN·Vault, WN·Toasts, WN·Taskbar.

**Strip.**
```
[1 Job --> NEEDS YOU · sign-in card]-->[2 Sign-in window opens · capture paused]-->[3 User signs in on the real page]
-->[4 Page changes · "Looks like you're in."]-->[5 Save login? once per site]-->[6 Job --> WORKING · "✓ Signed in"]
```
**Full text.** `research/journeys-2.md` → `## J13. Login handoff: sign in here, OTP, CAPTCHA, take over`

### J14 · Creating, editing and pausing a routine

**Summary.** A routine is a saved check: what, how often (with time zone), tells you only if…, where, and an approval boundary (routines never send, buy, book, post or delete; they end in a card). Created by asking, by a habit offer, or from "foo suggests" (max 3). foo asks for missing pieces, runs once now, then shows the Routine card with next run and cost. Runs where nothing is true are silent. Edit from the card, the Routines screen (Ctrl+R) or by chat; pause, resume, delete (confirm), pause all. Fixed handling for duplicates, time zones, failures (3 in a row), sleep catch-up, away 7+ days, stale 30 days, spend cap, 25-routine limit, 15-minute minimum.

**Touches.** 03: SH·Left (footer → Routines) · 04: MS·Foo, MS·Marker (why footer) · 05: CD·Choice, CD·Routine, CD·Error · 06: SC·Routines, SC·Toasts, SC·Settings (AI spend → each routine's cost) · 08: EN·Routines, EN·AI (meter), EN·Log · 09: WN·Toasts, WN·Keys, WN·Startup (wake).

**Strip.**
```
[1 Ask in plain words]-->[2 Missing piece? choice card]-->[3 Run once now]-->[4 Routine card]
-->[5 Each run: silent, or message + why footer]-->[6 Edit / pause / resume / delete]
```
**Full text.** `research/journeys-3.md` → `## J14. Creating, editing and pausing a routine`

### J15 · Creating a helper and handing work between helpers

**Summary.** Helpers are contacts with a job (name, job, good result, face, colour, allowed apps; Payments off by default). Created from "+ New helper" (form card with templates), by a one-time offer after a pattern, or by asking. The helper texts first with one useful thing. foo routes requests by the helpers' jobs: one line "Trips will handle this.", a handoff marker and a live link card in foo's chat; the job runs in the helper's chat; one owner per job. Payments stay where the job is; Money gets only a receipt note. Profile lets the user edit, pause or delete (delete needs running jobs stopped first). Max 8 helpers.

**Touches.** 03: SH·Left ("+ New helper", new contact row), SH·Header (helper profile) · 04: MS·Foo, MS·Marker · 05: CD·Helper, CD·Checklist (link card), CD·Choice, CD·Payment · 06: SC·Helpers, SC·Toasts · 08: EN·Jobs (ownership, handoff.md), EN·Memory (helper notes), EN·Log · 09: WN·Toasts.

**Strip.**
```
[1 + New helper · form card]-->[2 Create · contact appears]-->[3 Helper texts first]-->[4 foo routes a request]
-->[5 Marker + link card in foo chat]-->[6 Job runs in helper chat]-->[7 "Trips is back: …"]
```
**Full text.** `research/journeys-3.md` → `## J15. Creating a helper (Trips, Money) and handing work between helpers`

### J16 · Group chat with a helper

**Summary.** A group is a foo-internal chat of the user plus 2–6 helpers (foo optional). One helper owns each job; results in the group are plain text, choices and files only. Approvals, payments, drafts, secret boxes, sign-ins and personal details move to the owner's 1:1 chat with a "stays private" line. Sharing a remembered fact into the group is asked in 1:1 first. A linked WhatsApp group shows read-only as a mirror; foo drafts into it and every send needs a full Approval card. Helper loops (> 6 helper messages with no user message) pause the group.

**Touches.** 03: SH·Left (group row, stacked faces, WhatsApp mark) · 04: MS·Foo (sender labels), MS·Marker · 05: CD·Helper (New group), CD·Choice, CD·Draft, CD·Approval · 06: SC·Helpers, SC·Toasts · 08: EN·Jobs (ownership), EN·Conn (WhatsApp mirror), EN·Store · 09: WN·Toasts.

**Strip.**
```
[1 New group card · 2–6 helpers]-->[2 Owner's first line]-->[3 User asks]-->[4 Owner takes it · markers]
-->[5 Private things move to 1:1]-->[6 Shareable result in group]
```
**Full text.** `research/journeys-3.md` → `## J16. Group chat with a helper`

### J17 · Viewing, editing and forgetting memory

**Summary.** Memory shows in the right shell (top 3), the Memory page (Ctrl+M) and inline chips. Every fact says "You said" or "I guessed" (with the reason) and a date; filters by source. Saving by asking or by noticing; sensitive categories are saved only when the user said them. Edit replaces old facts. Forget one (5 s Undo), from a reply chip, by source (counted confirm), or everything (type FORGET). Memory is plain Markdown the user can open and edit in Notepad. A tombstone stops re-learning a forgotten fact from the same source for 90 days.

**Touches.** 03: SH·Right (What I know), SH·Header (⋮ menu) · 04: MS·Me, MS·React · 05: CD·Memory, CD·Choice · 06: SC·Memory, SC·Dialogs, SC·Settings (Privacy) · 08: EN·Memory, EN·Log · 09: WN·Keys.

**Strip.**
```
[1 Open Memory page]-->[2 Filter / search]-->[3 Save (said or guessed) · chip]-->[4 Edit replaces]
-->[5 Forget one · Undo 5 s]-->[6 Forget by source · confirm]-->[7 Forget everything · type FORGET]
```
**Full text.** `research/journeys-3.md` → `## J17. Viewing, editing and forgetting memory`

### J18 · Watching live and stopping a task

**Summary.** Browser jobs show "Watch live" on the checklist and an eye in Doing now. Watch live opens foo's live window (`live.html`, masked frames, not interactive; password, card and OTP fields blurred) with Take over and Stop (08-0 §G.8, X-66); watching never pauses the job. Take over pauses foo's clicks until "Hand back to foo". Stop (button, typing "stop", closing the job's browser window, right-click in Doing now) halts clicks and AI calls within 1 s, cancels the job, withdraws open approvals and reports what was and wasn't done from the activity log. "Stop everything" stops all jobs; routines keep their schedule. Finished jobs keep a 7-day step replay.

**Touches.** 03: SH·Right (Doing now, live view), SH·Header (⋮ Stop everything) · 04: MS·Me (⛔), MS·Foo · 05: CD·Checklist, CD·Choice (which one?), CD·Approval/CD·Payment (WITHDRAWN) · 06: SC·Live, SC·Tray, SC·Dialogs · 08: EN·Jobs, EN·Browser, EN·Log · 09: WN·Tray, WN·Taskbar.

**Strip.**
```
[1 Watch live]-->[2 Live view · fields blurred]-->[3 Take over · foo paused]-->[4 Hand back · "Carrying on"]
-->[5 Stop · halt ≤ 1 s]-->[6 CANCELLED · approvals WITHDRAWN]-->[7 Report from activity log]
```
**Full text.** `research/journeys-3.md` → `## J18. Watching live and stopping a task`

### J19 · Errors: AI offline, rate limit, spend cap, stuck loop, crash recovery

**Summary.** Every error card says what happened, what is safe, and gives one fix button. AI offline / down / signed out (2 failures in a row) → jobs WAITING, one card plus the banner strip (no bar above the composer, R-34.8), re-tests on a schedule, "Back on it." Plan limit → paused until reset, optional fallback AI for plain chat only. Spend cap (key AI) → amber at 80 %, hard stop at 100 % with Raise cap. Stuck (3 min, 3 fails, 2× cost, same page 5×) → stuck card with cost so far; Stop on it → CANCELLED ⛔ (`stop_reason='stuck_stop'`, X-80); 15 min with no answer → FAILED. Crash → recovery card per unfinished job; mid-payment jobs go to CHECKING, never re-submit; 3 crashes in 10 min → safe mode. Other errors have one-line cards.

**Touches.** 03: SH·Banner, SH·Left (Paused pill), SH·Right (Spent, plan %) · 04: MS·Me (queued state), MS·Composer (restored draft) · 05: CD·Error (error, stuck, recovery), CD·Plan ("This is a big one.") · 06: SC·Settings (AI spend), SC·Toasts, SC·Dialogs (report preview) · 08: EN·AI, EN·Jobs, EN·Approvals (CHECKING), EN·Log, EN·Browser (site notes) · 09: WN·Toasts, WN·Taskbar, WN·Startup.

**Strip.**
```
[1 Detect (real process)]-->[2 Jobs --> WAITING / NEEDS YOU]-->[3 One error card · one fix]-->[4 Re-test / wait / user fixes]
-->[5 Resume from same step]      Crash: [1 Launch]-->[2 Read state.json]-->[3 Recovery card per job]-->[4 CHECKING if mid-payment]
```
**Full text.** `research/journeys-4.md` → `## J19. Errors: AI offline, rate limit, spend cap, stuck loop, crash recovery`

### J20 · Notifications when the window is closed

**Summary.** Closing the window does not quit foo; a one-time dialog explains the tray. The tray tooltip and menu show what is waiting and running, plus pause routines, quiet until morning, Stop everything and Quit (which pauses jobs). The taskbar shows a "needs you" overlay, a green done overlay for 30 min, progress while jobs run, and a jump list. Toasts: title = chat name, one line, no secrets, at most 2 buttons; choices can be answered from a toast; no toast has an Approve button, Approval and Payment toasts show Review / Not now and Review opens the main window at the card (R-12, R-34.4). Jump list has no counts, plain unread never badges the taskbar, and foo never blocks shutdown (R-34.5–7). Quiet hours hold toasts and deliver one summary; Focus is respected; max 1 toast per chat per 2 min; unprompted toasts count toward the daily budget.

**Touches.** 06: SC·Toasts, SC·Tray, SC·Dialogs (first close), SC·Settings (Notifications) · 08: EN·Jobs, EN·Approvals · 09: WN·Toasts, WN·Taskbar, WN·Tray, WN·Startup (close to tray, keep awake, never blocks shutdown), WN·Hello.

**Strip.**
```
[1 First ✕ · tray dialog]-->[2 Tray icon + tooltip]-->[3 Event happens]-->[4 Focused on chat? sound only]
-->[5 Quiet hours? hold for summary]-->[6 Toast · ≤ 2 buttons]-->[7 Taskbar overlay + progress]
```
**Full text.** `research/journeys-4.md` → `## J20. Notifications when the window is closed (toast, taskbar badge, tray)`

### J21 · Settings

**Summary.** A full-height panel (gear, Ctrl+,, tray) with search, and any setting can be changed by asking in chat (changed row shown with Undo). Eleven pages, named as in 06 §6 [settled: X-07]: Account & your AI; Appearance; Notifications (incl. quiet hours); Permissions (Always · Ask · Never per action and app, folders, 08-0 §G.3; paying, booking, sending, deleting and sharing address or phone can never be Always, and posting is locked to Never in v1: foo opens X's compose page instead); Money (cards, UPI, Windows Hello amount, AI cap and purchase cap per R-10); Privacy (incl. "What leaves this PC", activity log, export zip without secrets, delete old chats, forget, delete everything); Routines; Connections; Chat and voice; Keyboard shortcuts; About.

**Touches.** 03: SH·Left (gear), SH·Right (replaced by settings panel) · 05: CD·Secret (add card), mini settings card in chat · 06: SC·Settings, SC·Dialogs · 08: EN·Approvals (rules), EN·AI, EN·Conn, EN·Log, EN·Store (export) · 09: WN·Keys, WN·Hello, WN·Toasts (blocked notifications bar).

**Strip.**
```
[1 Open Settings]-->[2 Search or scroll section]-->[3 Change row (locked rows explain)]-->[4 Saved silently · logged]
      Or: [1 "turn off voice replies"]-->[2 Mini card with changed row]-->[3 Undo available]
```
**Full text.** `research/journeys-4.md` → `## J21. Settings: app permissions, spend cap, quiet hours, privacy, export/delete data`

### J22 · Search

**Summary.** Ctrl+K opens a palette that searches chats, messages, jobs, files, routines, memory and settings locally (SQLite full text), after 2 characters with a 150 ms debounce, grouped (max 5 per group), with filter chips and full keyboard control. Nothing goes to the AI unless the user presses Ctrl+Enter ("Ask foo about this"), which answers in foo's chat with citations. The chat-list box filters by name and last message with chips All · Needs you · Working · Done; Ctrl+F finds in a chat. First results < 300 ms even at 100k messages.

**Touches.** 03: SH·Left (search box, filter chips) · 04: MS·Foo (highlight on jump) · 06: SC·Search · 08: EN·Search, EN·Store · 09: WN·Keys.

**Strip.**
```
[1 Ctrl+K]-->[2 Type ≥ 2 chars · 150 ms]-->[3 Grouped results]-->[4 ↑ ↓ Enter]-->[5 Open at message · 2 s highlight]
      Or: [4 Ctrl+Enter]-->[5 foo answers with citations]
```
**Full text.** `research/journeys-4.md` → `## J22. Search`

### J23 · Uninstall and data wipe

**Summary.** Two entries: "Delete everything" inside foo (typed DELETE; wipes and restarts at the welcome card) and Windows uninstall (choice "Keep my data" or "Delete everything", default Delete everything). Running jobs are warned about and stopped with nothing paid; an export is offered first. The wipe order is fixed: stop jobs and routines, revoke app connections with providers, delete every `foo/` vault entry, delete `%APPDATA%\foo\`, remove Windows registrations; output files in Documents\foo are always kept. Offline revocation, locked files and stuck vault entries have fixed copy. Reinstall after "Keep my data" resumes everything.

**Touches.** 06: SC·Settings (Your data), SC·Dialogs (typed DELETE) · 08: EN·Store, EN·Conn (revoke), EN·Secrets, EN·Jobs · 09: WN·Install (uninstaller), WN·Vault, WN·Startup, WN·Taskbar (jump list removal), WN·Toasts (unregister).

**Strip.**
```
[1 Uninstall chosen]-->[2 Keep or Delete everything]-->[3 Running jobs? warn]-->[4 Export first?]
-->[5 Stop · revoke · vault · files · registrations]-->[6 Done screen · Documents\foo kept]
```
**Full text.** `research/journeys-4.md` → `## J23. Uninstall and data wipe`

### J24–J30 · v1 additions (R25–R31)

Journeys J24 Ideas gallery (R25), J25 Trains (R26), J26 Recharges and billers (R27), J27 Catch me up (R28), J28 Photos and papers in (R29), J29 Send to foo (R30) and J30 Private chat (R31) are written in `12-features-r25-r31-1.md` (J24–J26) and `12-features-r25-r31-2.md` (J27–J30), in this chapter's entry format, with acceptance tests AT-158…AT-199 and AT-230…AT-266. Vikas approved them together (X-100).

### Appendices in the research

- Notification matrix (all journeys): `research/journeys-4.md` → `## Appendix A. Notification matrix (all journeys)`. Normative; amended by R-01, R-04, R-12. **Superseded cells:** Approval and Payment notifications carry [ Review ] [ Not now ] (X-02); every [ Approve ] cell in Appendix A is superseded and must not be built (UJ-32).
- Memory chip copy: research J7 step 4 and J17 step 2 show a "Saved: …" chip. That copy is superseded: the chip reads "I'll remember: {fact}" with "Undo" (X-05, R-20) (UJ-33).
- Coverage checklist: `research/journeys-4.md` → `## Appendix B. Coverage checklist (what the brief asked for → where)`.
- Global rules, shared components, storage map: `research/journeys-1.md` → `## 1. Global rules (apply to every journey)`, `## 2. Shared components (fixed copy, reused by every journey)`, `## 3. Storage map (where everything lives)`.

---

Continued in `07-journeys-2.md` (§7.4 state machines, §7.5 reconciliation, §7.6 constants, §7.7 decisions).
