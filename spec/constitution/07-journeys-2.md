# 07 · Journeys · part 2 of 2

Part 2 of chapter 07. Part 1 (`07-journeys-1.md`) holds §7.0–§7.3 (rules, surface keys, the J1–J23 index). References such as R-01, SM-A1, D-01 are defined in this file.

---

## 7.4 State machines (authoritative)

7.4.1 The text below is a **verbatim copy** of `research/journeys-1.md` §4 and §5. Only the heading levels were lowered by one. It is authoritative: the job runner (EN·Jobs) and the approval engine (EN·Approvals) MUST implement exactly these states, events and transitions, and no others.

7.4.2 The amendments in §7.4.3 (from the reconciliation in §7.5) apply on top of the copy. Where the copy and an amendment differ, the amendment wins.

### 4. State machine: a JOB

A job is anything foo does that takes a tool step (read Gmail, open a site, book, pay). Plain chat replies are not jobs.

```
                       user asks / routine fires / helper hands off
                                        │
                                        ▼
                                  ┌──────────┐  user taps Stop / "stop"
                                  │  QUEUED  │──────────────────────────────┐
                                  └────┬─────┘                              │
              AI available & a slot free (max 3 jobs at once)               │
                                        ▼                                   │
     ┌──────────────────────────► ┌──────────┐ ──── step needs a person ──┐│
     │  user answered / approved   │ WORKING  │      (choice, approval,     ││
     │  / signed in / "I'm done"   └──┬──┬──┬─┘       sign-in, payment)     ││
     │                                │  │  │                             ▼▼
     │                                │  │  │                       ┌──────────────┐
     │                                │  │  └── AI offline / limit ─►│   WAITING    │
     │                                │  │      hit / spend cap /    │ (not on you) │
     │                                │  │      PC went to sleep     └──────┬───────┘
     │                                │  │                    AI back /    │ cap raised /
     │                                │  │                    resume tapped│ limit reset
     │                                │  │◄──────────────────────────────── ┘
     │                                │  │
     │                ┌───────────────┘  └────────────┐
     │                ▼                               ▼
     │        ┌──────────────┐                ┌──────────────┐
     └────────│  NEEDS YOU   │                │     DONE     │  (proof attached, or
              └──┬───────┬───┘                └──────────────┘   "Not checked live")
     no answer   │       │ user taps No / Stop / declines payment
     by expiry   │       ▼
     (see §5)    │  ┌──────────────┐        ┌──────────────┐
                 └─►│  CANCELLED   │        │    FAILED    │◄── from WORKING: same step
                    └──────────────┘        └──────────────┘    failed 3 times / stuck 3 min
                                                                 and user chose "Stop" /
                                                                 site blocked with no fallback
```

| From | Event | To | What the user sees |
|---|---|---|---|
| (none) | job created | QUEUED | Badge 👀. If 3 jobs already running: checklist shows "Waiting for another job to finish" |
| QUEUED | slot free and AI verified in last 10 min (else a 1-word test first) | WORKING | Badge 🛠, checklist appears after 1.5 s |
| QUEUED / WORKING / NEEDS YOU / WAITING | Stop | CANCELLED | Badge ⛔, checklist line "Stopped by you", message "Stopped. {what was already done, or 'Nothing was booked, paid or sent.'}" |
| WORKING | needs a choice, approval, payment, sign-in, code | NEEDS YOU | Badge ⏳ [settled: X-17, SM-A1], chat row pill "Needs you", taskbar yellow, toast (J20) |
| NEEDS YOU | answered / approved / "I'm done" | WORKING | Badge 🛠, card collapses to its answered state |
| NEEDS YOU | declined (No / Not now) | CANCELLED, or WORKING if foo has another route | "Okay, I won't. {next step or 'Nothing else to do here.'}" |
| NEEDS YOU | card expired | CANCELLED (payment, booking) or stays NEEDS YOU with a reminder (choice cards) | See §5 |
| WORKING | AI not answering, AI limit hit, spend cap hit, PC asleep | WAITING | Error card (J19). Chat row pill "Paused" |
| WAITING | condition clears | WORKING | One line: "Back on it. Picking up from step {n}." |
| WORKING | all steps done, proof found | DONE | Badge ✅, Proof chip, receipt footer |
| WORKING | all steps done, no proof possible | DONE (unverified) | Badge ✅ (`done_unverified`, tooltip "Done · Not checked live") plus "⚠ Not checked live" on the result's proof line, never on the bubble (SM-A12) |
| WORKING | stuck (no step for 3 min, or same step failed 3 times, or spend > 2× estimate) | NEEDS YOU (stuck card) | J19 stuck card; Stop on it → **CANCELLED** ⛔ (`stop_reason='stuck_stop'`; SM-A11, X-80); no answer for 15 min → FAILED |
| WORKING | unrecoverable (site blocks, no other route) | FAILED | Badge ❌, error card with one alternative |
| any | app crash / PC restart | restored from `state.json` on next launch | J19 crash recovery |

Rules:
- Only the **job runner** changes state. The AI can request a change; it cannot set DONE without a proof object or an explicit `unverified` flag (G7, G12).
- A job never goes from FAILED or CANCELLED back to WORKING. "Try again" creates a new job linked to the old one ("Trying again: {title}").
- Max 3 jobs WORKING at once `[foo decision]` (Gemini caps at 15, GEM §2; foo runs on one PC with the user's own AI).

---

### 5. State machine: an APPROVAL CARD (C4 and C5)

```
            job reaches a gated step
                     │
                     ▼
               ┌───────────┐
               │  PENDING  │── expiry timer runs (10 min pay / 15 min book / 60 min other)
               └─┬──┬──┬──┬┘
     Approve tap │  │  │  └──────── job cancelled elsewhere ──────────► WITHDRAWN
     (+ Windows  │  │  └─────────── terms changed before Approve ─────► SUPERSEDED ──► new PENDING card
      Hello if   │  │               (price, time, recipient)
      big pay)   │  └── No / Not now ─────────────────────────────────► DECLINED
                 │      timer ends ─────────────────────────────────── ► EXPIRED
                 ▼
          ┌────────────┐  second look (G17) fails ──────────────────► HELD ──► user picks ──► APPROVED or DECLINED
          │  APPROVED  │
          └─────┬──────┘
                ▼
          ┌────────────┐  checkout total ≠ approved total ─────────► SUPERSEDED ──► new PENDING card
          │  RUNNING   │  bank/site needs code ────────────────────► (stays RUNNING; J13 sign-in card)
          └──┬───┬───┬─┘
   proof ok  │   │   └── submit result unknown (crash, timeout) ──► CHECKING ──► COMPLETED or FAILED
             │   └────── declined by bank / site error ───────────► FAILED
             ▼
       ┌────────────┐
       │ COMPLETED  │
       └────────────┘
```

| State | Card looks like | Copy |
|---|---|---|
| PENDING | full card, live countdown | as C4 / C5 |
| APPROVED → RUNNING | buttons replaced by a spinner line | "Approved by you at {time}. Doing it now…" |
| HELD | yellow strip on the card | "Before I do this, one check: you asked for {X}, this is {Y}. Which one?" + Choice chips |
| COMPLETED | green tick header, proof chip | "✓ {Sent | Booked | Paid ₹{total}} · {time}" |
| DECLINED | grey, collapsed | "You said no. Nothing was {sent | booked | paid}." |
| EXPIRED | grey, collapsed | "This expired at {time}. Nothing was {sent | booked | paid}." + [ Ask me again ] |
| SUPERSEDED | grey, struck-through amount | "The price changed, so I stopped. See the new card below." (or "The time changed…", "The recipient changed…") |
| WITHDRAWN | grey | "No longer needed. The job was stopped." |
| FAILED | red edge | Payment: "Your bank said no. No money was taken." Others: "{Site} didn't accept it. Nothing was {sent | booked}." + one fix button |
| CHECKING | amber | "I'm not sure the payment went through. Checking your email and the site before doing anything else." |

Rules:
- An approval is single-use. "Always" stores a rule in `settings.json → rules[]` that skips **future** C4 cards of the same verb + same recipient/app, never C5 and never G5 hard limits (ChatGPT single-use sends, GPT §9.2; Muse "Allow Always" lesson, MUS §9.3).
- EXPIRED and DECLINED never auto-retry. "Ask me again" re-checks live terms first and builds a fresh card.
- The countdown keeps running while the window is closed; the toast (J20) shows the same expiry.
- A CHECKING card never re-submits a payment. If proof is not found within 15 minutes it becomes FAILED with "I couldn't confirm it. Check your bank app before trying again." and the button "I checked, try again" `[foo decision]` (Tab "submitted once", TAB §2).

### 7.4.3 Amendments to the state machines

| # | Where in the copy | Amendment | Reason |
|---|---|---|---|
| SM-A1 | Job table, row WORKING → NEEDS YOU: "Badge ✋" | Badge is **⏳** ("Waiting for you"). | R-01 (Article 16) |
| SM-A2 | Job table, row WORKING → NEEDS YOU (stuck card) | Badge is **⏳**; the ⚠ appears on the stuck card only, never on the bubble. | R-01 |
| SM-A3 | Job table, row WORKING → WAITING, event list | Event list also includes "**monthly purchase cap would be passed**". For that event the job goes to **NEEDS YOU** (not WAITING) with the purchase-cap card (R-10); no Payment card is created. | Article 13 |
| SM-A4 | Approval table, HELD: "yellow strip" | `--warn-soft` strip with the Warning icon and the word "Check"; never colour alone. | R-04 (F2, F9) |
| SM-A5 | Approval table, COMPLETED "green tick header"; FAILED "red edge"; CHECKING "amber" | COMPLETED: `--ok` CheckmarkCircle icon + word. FAILED: 1.5px `--bad` top edge + ErrorCircle icon. CHECKING: `--warn` Clock icon + word. | R-04 |
| SM-A6 | Approval copy "{time}" in APPROVED, COMPLETED, EXPIRED | `{time}` renders as an absolute day-date-time: "Fri 16 Oct, 9:48 AM". | R-07 (Article 21) |
| SM-A7 | Approval rules, first bullet ("Always" stores a rule… same verb + same recipient/app) | "Always" rules exist **only** for reading or using an app (for example "Let Trips use Calendar"). There is **no** "Always" rule for send, book, buy, pay, post, delete or share. Rules (`settings.rules`, type `Rule`) apply only to `use_app`, `calendar_write` and `mail_organise`; the permission model is Always · Ask · Never per 08-0 §G.3 (X-54). | R-13 (Article 4), X-54 |
| SM-A8 | Approval machine, PENDING | A known-recipient **Draft card** (C6) is an approval card in PENDING with expiry 60 min (R-14). Its Send tap = Approve. Lifecycle per 08-0 §G.7: the `approvals` row is created when the draft is created (PENDING, 60 min); `draft:send` approves once (`approved_via='card'`); then 5 s undo → second look → Gmail `drafts.send` (or the WhatsApp send); Change = `drafts.update`; Discard = `drafts.delete`. Drafts that hit a hard limit (new recipient, money, personal data) use the full Approval card. | R-14 (Article 5), X-65 |
| SM-A9 | Approval machine, APPROVED (Windows Hello "if big pay") | If Windows Hello is not set up, the check is typing the amount (R-15). Applies to UPI payments too. | Article 7 |
| SM-A10 | Job table, WAITING → WORKING "One line: Back on it…" | The line is written by **editing the error card in place** (it collapses to that line), not as a new message. | R-19 (Articles 17, 22) |
| SM-A11 | Job diagram (FAILED "stuck 3 min and user chose Stop") and job table row WORKING → NEEDS YOU (stuck card) "Stop on it → FAILED" | Stop on a stuck card is a stop by the user: the job ends **CANCELLED**, badge ⛔ (`stopped`), `jobs.stop_reason = 'stuck_stop'`, stuck card state `stopped`, message as the Stop row ("Stopped. {what was already done, or 'Nothing was booked, paid or sent.'}"). A stuck card left unanswered for 15 min ends **FAILED** ❌ with stuck card state `timed_out`. Single source: 08-0 §G.16. | X-80 (Article 16 wins over the journey) |
| SM-A12 | Job table, DONE (unverified) | The bubble badge is `done_unverified` (glyph ✅, tooltip "Done · Not checked live", 08-0 §F). "⚠ Not checked live" is shown on the result's proof line only (Article 11). ⚠ never appears on a bubble. | X-61 |
| SM-A13 | Machine state names vs stored values | Job states are stored as `jobs.state` lower_snake values per 08-0 §0 (`queued, working, needs_you, waiting, done, done_unverified, failed, cancelled`, the 08-1 `jobs.state` CHECK list); approval states keep the UPPER `ApprovalState` values of 08-0 §B.2. Card states (`cards.state`) are the per-type lists of 08-0 §G.2; the stuck card states are asking, other_way, taken_over, stopped, timed_out. | X-56, X-57 |

---

## 7.5 Reconciliation (articles and foundations win)

7.5.1 Each row names the conflict, where it is, what 01/02 says, and the **resolution the builder MUST use**. "New decision" = yes means this chapter made a choice that is not written in 01/02 or the journeys; Vikas can veto it (§7.7.2).

### 7.5.2 Words and copy

| ID | Conflict (journey) | 01/02 says | Resolution | New decision |
|---|---|---|---|---|
| R-02 | G2's banned list lacks "LLM" and "agent loop"; J10 copy "Your bank's code timed out." uses a form of "timeout". | Article 2: 19 banned terms incl. LLM, agent loop. | Article 2's list is the only list. Inflected and spaced forms are banned too (tokens, prompts, models, servers, commands, timed out, time-out, time out). "code" alone (bank code, QR code) and "key" are allowed; only "error code" is banned. J10 copy becomes "Your bank's code ran out of time. No money was taken." | no |
| R-02b | J23 copy shows a vault path: "I couldn't remove 1 saved item: 'foo/login/irctc.co.in'." | Article 2; J19 rule "no codes, paths". | Copy becomes "I couldn't remove 1 saved item: your IRCTC login. Remove it in Credential Manager." "Credential Manager" is a Windows app name and is allowed. No `foo/…` name is ever shown. | no |
| R-03 | Error cards with two buttons: J1 disk ([Open storage settings] [Close]), J2 sign-in ([Reopen] [Try again]), J4 Gmail denied ([Try again] [Skip]), J9 all blocked ([Open the page] [Email the restaurant]), J10 declined ([Try another card] [Pay with UPI]), J11 UPI declined ([Try again] [Pay with card]), J14 3 failures ([Fix] [Pause it]), J19.5 safe mode ([Start normally] [Send a report]). J19.6 "File too big" has **no** button. | Article 2: one button that fixes it. | Every error card has exactly **one** primary button (the first one listed) and at most **one** secondary text link (the second). J19.6 file too big gets [ Pick another file ]. Decision cards (stuck card, recovery card, choice cards) are not error cards and keep their options. | yes (file button) |
| R-06 | Approval/decline labels: C4 "[ Send ] [ Edit ] [ No ]", J9 "[ Book it ] [ Change ] [ No ]", C11 "[ Go ]", C7/J15 "[ Cancel ]" on forms, J17/J21 confirms "[ Cancel ]", J18 "[ Stop all ] [ Cancel ]". | F10: buttons say action + object; soft decline "Not now"; "Cancel" only stops something running. | Primary = verb + object: "Send email", "Send message", "Book table", "Book stay", "Delete 14 files", "Approve ₹{total}". The Plan card (C11) keeps "Go" (05-3 §5 Plan, X-04). Decline on any approval/draft/form = "Not now". Confirm dialogs for destructive actions decline with "Keep {object}" ("Keep Gmail", "Keep it", "Keep running"). "Cancel" stays only where something is running (installer, uninstaller, recording, export in progress). The edit button is "Change" everywhere (C4's "Edit" → "Change"). Choice-card options ("Yes", "No thanks", "Pune") are answers, not action buttons, and are exempt. | yes (labels) |
| R-06b | J21 footer (21 words): "Some things always ask, even if you say 'Always': paying, sharing your address or phone, and anything that can't be undone." | F10: sentences under 20 words. | Copy becomes "These always ask, even on 'Always': paying, sharing your address or phone, and anything that can't be undone." (17 words). | no |
| R-25 | "BEST FIT" (J10 options) and "● LIVE" (C9, J18) written in capitals. | F10: sentence case for UI labels; uppercase only via `--t-caption-strong` styling on section labels. | Copy is "Best fit" and "Live". 05 may style them uppercase; Narrator reads the sentence-case copy. | no |
| R-20 | J17 step 1: "remember I'm allergic to peanuts" → foo replies "Got it." + chip. | Article 23: react 👍 instead of sending "ok". | foo reacts 👍 on the user's bubble and attaches the memory chip "🧠 I'll remember: Allergic to peanuts · Undo" [settled: X-05] as a system line under that bubble. No "Got it." bubble. "Got it, I'll fold that in." (Article 18) is unchanged. | no |
| R-22 | J21 Privacy "What leaves this PC" does not say data is never used to train. | Article 15: "Nothing is used to train anything." | Add the sentence "foo never uses your data to train anything." after the existing statement. foo cannot speak for the user's AI provider and MUST NOT claim more. | yes (copy) |

### 7.5.3 Time and money formats

| ID | Conflict (journey) | 01/02 says | Resolution | New decision |
|---|---|---|---|---|
| R-07 | Times without day and date in copy: J9 "Expires 7:52 PM", "tonight at 8"; J10 "This expired at 9:58 AM"; J11 "due tomorrow"; J12 "✓ Sent · 9:14 AM"; J14 "Checked 10:45 AM", "try again at 9:15", history "9:45"; J19 "until 3:00 PM", "Wait until 1 Nov"; J20 "Quiet until tomorrow 7:00 AM"; J6 "Mom's birthday is Saturday", "due Friday", divider "Today 8:00"; J8 "Delhi on Friday"; J6 "asleep at 8:00"; J5 "Tomorrow 8:00 AM" with the date only in a tooltip. 24-hour times in J8 ("10:15", "7:10", "18:40"). Ranges "12–14 Dec". | Article 21, F10: always "Sat 12 Dec, 8:00 PM", 12-hour with day; relative words only in addition. | (1) Every time or date in a sentence, card, toast or tooltip shows weekday + day + month, and a clock time where one exists: "Fri 16 Oct, 7:52 PM". (2) Relative words only before it: "tonight, Sun 18 Oct, 8:00 PM"; "tomorrow, Sat 17 Oct". (3) 12-hour clock always: "10:15 AM", "6:40 PM". (4) Ranges: "Fri 12 – Mon 14 Dec". (5) Countdowns keep the timer and add the absolute end: "Expires in 10:00 (Fri 16 Oct, 9:58 AM)". (6) Date separators read "Today, Fri 16 Oct" (03-2 §3.6.5 owns the format). (7) **Exempt:** the time on a bubble's meta line and a routine-history row, because a date divider or the row's day heading carries the date. (8) Drafts to other people also use absolute dates ("Dinner Sun 18 Oct, 8:00 PM at …"), because the reader may see it on another day. | yes (exemptions 7, 8) |
| R-08 | Example weekdays follow the 2025 calendar while today is 2026. | Article 30 (no guessing). | Weekday names are always computed. Every example uses the 2026 calendar and copy-comparison tests pin the clock to Fri 16 Oct 2026, 9:00 AM IST (§7.0.6) [settled: X-10]. | yes |
| R-09 | "₹8k" (J10 checklist); "₹55 lakh", "₹57.2 lakh", "₹54.8 lakh", "₹54.6 lakh" (J14); "₹₹ / ₹₹₹" price levels (J9). | F10: Indian format with symbol and grouping ("₹1,23,450"). | Amounts are always full grouped figures: "₹8,000", "₹55,00,000", "₹57,20,000". The words lakh/crore may follow **in addition** in brackets: "₹55,00,000 (55 lakh)". Price levels "₹₹" are not amounts; they stay, and Narrator reads "price level 2 of 4". Non-India regions follow the Windows region format. | yes (lakh in brackets) |

### 7.5.4 Visual values (sizes, colours, icons, motion)

| ID | Conflict (journey) | 02 says | Resolution | New decision |
|---|---|---|---|---|
| R-04 | C4 "2 px coloured border"; HELD "yellow strip"; FAILED "red edge"; COMPLETED "green tick header"; CHECKING "amber"; J10 non-refundable "in red"; J12 X counter "goes red"; J13 sign-in banner "yellow" → "green"; J20 taskbar "yellow !" / "green ✓". | F4: 1px `--line` border on cards, **1.5px `--accent` top edge** on a pending approval; F2 status tokens; F9 colour never the only signal. | Pending approval/payment card: 1px `--line` border + 1.5px `--accent` top edge + LockClosed icon. Yellow = `--warn` / `--warn-soft`; green = `--ok` / `--ok-soft`; red = `--bad` / `--bad-soft`; amber = `--warn`. Every coloured state also carries an icon and a word (e.g. Warning + "No free cancellation"). Taskbar overlays are drawn with the light-theme `--warn` and `--ok` values plus a "!" or ✓ glyph. | no |
| R-05 | App-drawn card titles start with emoji: 💳 📝 🔑 ⏰ 🗺 🧠 ✉ 🍽 ❌ ⚠ 📡 😴 🧾 🔌 🚫 💾 🌐 🔁 👁 🔒 ✋ (checklist), and the 🎲 button. | F6: emoji are content, never icons; Fluent Regular icons only; status emoji on the user's bubble are the one exception. | App-drawn glyphs are Fluent icons from F6's list: 💳→Wallet · 📝→Document · 🔑→Key · ⏰→Clock · 🗺→Document · 🧠→Brain · ✉→Mail · 🍽→Calendar · ❌→Dismiss · ⚠→Warning · 📡→Globe · 😴→Bot · 🧾→Money · 🔌→Alert · 🚫→ErrorCircle · 💾→Warning · 🌐→Globe · 🔁→ArrowClockwise · 👁→Eye · 🔒→LockClosed · ✋ (checklist "You took over")→HandRight. The 🎲 buttons become text buttons "Surprise me" / "New faces" with no icon. Emoji in text foo or the user writes (☀️ in the brief greeting, 🌿 in a vibe line, 🍕 in a draft) are content and stay. App logos on Connect cards are content. | yes (mapping) |
| R-01 | C1: ✋ = waiting on you, ⏳ = slow; J19.4: ⚠ badge when stuck; J19.1/J7: ⏳ on messages queued while the AI is away. | Article 16: 👀 seen → 🛠 working → ✅ done / ❌ failed / ⏳ waiting on you. | ⏳ means **only** "waiting on you" (every NEEDS YOU, including stuck). "Slow" has no emoji and is not a badge value: the badge stays 🛠 and its tooltip becomes "Taking longer than usual" (08-0 §F; the checklist's own slow line in 05 is unchanged). ⛔ (`stopped`) for cancelled is kept (Article 16 "⛔ stopped by you"). Badge values are exactly 08-0 §F (X-61); `cancelled` is not a badge value. Messages queued while the AI is away show the Fluent **Clock** icon in the bubble's tick slot with tooltip "I'll answer when your AI is back." | yes (Clock, slow) |
| R-24 | Checklist glyphs ✓ ✱ ○ in C2 and all strips. | F7: spinner ring for the current step; ✓ swap at 167ms; reduced motion → static "◔". | ✱ = spinner ring (current step, `--t-body-strong`), ○ = empty ring, ✓ = Checkmark icon. Reduced motion uses "◔". | no |
| R-23 | Behaviour timers in journeys (bubble pacing 0.8–2.5 s, 150 ms debounce, 2 s highlight, 5 s undo, expiries, retries). | Article 24: no timing outside 02. | Article 24 governs **visual** timing (animation, transitions). Behaviour timers are not motion tokens; they are fixed in §7.6 and owned by 08. Any visual change they trigger animates only with F7 tokens (the 2 s search highlight: `--accent-soft` fill, fades out with `--m-slow`). | yes (interpretation) |
| R-26 | Article 27 "100–300% scaling" vs F9 "text scaling 100–225%". | Both. | Not a conflict: display scaling (100–300 %) and Windows text size (100–225 %) are different settings. Both MUST be tested, also combined (10 §C). | no |
| R-27 | Window sizes in journeys (first window 1100×720; sign-in window 720×640; "small always-on-top receipt window"; side panel collapses "on widths under 900 px"). | 02 sets no window sizes. | 03 and 09 own window sizes and breakpoints. First window is **1280 × 800** centred, clamped to 90 % of the work area (03 §3.1.1). The receipt window does not exist (R-12). The right-shell collapse follows 03's breakpoint table, not "900 px". The J13 "720×640 sign-in window" is withdrawn: sign-in and take-over use the real Edge window brought to the front plus foo's docked sign-in banner, and Watch live is foo's `live.html` window (08-0 §G.8, X-66; owner 09 §9.27). | no (decided in 03) |

### 7.5.5 Safety, approvals and money

| ID | Conflict (journey) | 01 says | Resolution | New decision |
|---|---|---|---|---|
| R-13 | J12 step 7 offers "Next time, send emails to Rakesh without asking?" and stores an "always" send rule; C4 shows scope chips "for sends to a known recipient"; J21 lists "Send emails to Rakesh without asking" under Rules; J12 acceptance "unless a per-person rule exists". | Article 4: "Approving one send never approves the next." | No "Always" rules for send, book, buy, pay, post, delete or share. Remove J12 step 7, remove scope chips from send approvals, remove the per-person exception from J12's acceptance test. Scope chips remain only for **reading or using an app** ("Let Trips use Calendar?" → Just this once / For this chat / Always). J21 "Rules I follow" shows only such rules. Journey decision D-20 is withdrawn. [settled: X-03] | yes |
| R-14 | C6 decision: Send on a known recipient's draft is the approval tap; J12 step 4 shows the approval footer "for 1 s". | Article 5: every send stops for an Approval card. | A known-recipient Draft card **is** an Approval card: it is drawn by the app with the approval frame (R-04), its impact line ("Will send to {address} from your Gmail. Can't be unsent.") is visible **for as long as the card is pending**, it has the 60-minute expiry footer, and it follows the approval state machine. One tap still sends (D-02 kept, amended). | yes |
| R-12 | J20: toast [ Approve ] answers non-hard-limit approvals (e.g. "Send this email to Rakesh?"); Payment "Review" opens a small always-on-top receipt window. | Articles 4, 5, 6, 10: a send is approved only after the user sees the draft; approvals are taps on the card. | **No toast ever carries an Approve button** (09 §9.9.3.1). Every Approval and Payment toast shows **[ Review ] [ Not now ]**; Review opens the **main window** at the card with focus on it; there is **no separate receipt window** (09 §9.9.3.2, conflict 4). Choice toasts keep [ {Best fit} ] [ Open ]. See R-34. [settled: X-02] | no (decided in 09) |
| R-15 | J10/C5 cover Windows Hello but not "Hello not set up"; J11 decision lets UPI phone approval stand in for the second check. | Article 7: ≥ ₹10,000 needs Windows Hello, **or typing the amount** if Hello is not set up. | If Hello is not set up, the Approve tap opens a field "Type the amount to confirm: ₹{total}"; Approve completes only when the typed figure equals the total. UPI phone approval never replaces this check at or above the threshold (D-18 applies only below it). J21 copy "for payments over ₹10,000" becomes "for payments of ₹10,000 or more". | yes (copy) |
| R-10 | No journey mentions the **monthly purchase cap**. | Article 13: purchase cap default ₹25,000, always visible in the right shell; hitting a cap stops new work and asks. | (1) Right shell "Spent this month" always shows two rows: "Your AI ₹{x} of ₹1,000" and "Purchases ₹{y} of ₹25,000" (plan-based AI shows "Your AI · uses your Claude plan"). (2) Settings → Money [X-07] has row `cap-buy` "Monthly purchase cap" [ ₹ ] (default ₹25,000; `money.purchaseCapPaise`, 08-0 §A). (3) A payment that would pass the cap creates no Payment card; the job goes to NEEDS YOU with the spend-cap card (type `spend_cap`, purchase-cap row of 05-3 §5.21): "This payment would go over this month's purchase cap (₹{25,000})." "You've spent ₹{21,300} this month. Nothing was paid." [ Raise cap ] + link "Not now". (4) Raising the cap is done by a tap, never by typed words. Word rule: "cap" for foo's caps, never "limit" (X-79). | yes (copy, flow) |
| R-16 | J13 offers to read OTP codes from Gmail; J5/J6 read Gmail in general. | Article 8: OTPs never in chat; AI only sees a secret's name. | When code reading is allowed, the **job runner** extracts the code locally and types it into the page; the email body is never sent to the AI. All Gmail/WhatsApp text sent to the AI is redacted for OTP-like codes, card numbers and key patterns (C8 patterns) first. | no |
| R-17 | J11 "I already paid" with no receipt: "Okay, marked as paid…" has no proof marker. | Article 11. | The line carries "⚠ Not checked live". | no |
| R-18 | J10 step 11: result "in Trips chat and mirrored in foo chat". | Article 1: helpers speak only in their own chats; foo re-tells. | foo's chat shows only the job link card ("✓ Done · in Trips") and the marker "Trips is back: booked Taj Holiday Village, ₹14,600 paid". It never copies Trips' bubble. | no |
| R-33 | No journey has a "private" mark on memory. | Article 14: "anything from memory marked private" never appears in groups. | Facts in J17's sensitive categories (health, money amounts, religion, politics, other people's phone or address) are **private by default**. The "Mark private" control on other facts is a gap for 06 (SC·Memory); until it exists, every fact is asked in 1:1 before it is shared to a group (J16 branch already does this). | yes |

### 7.5.6 Manners, budget and offline

| ID | Conflict (journey) | 01 says | Resolution | New decision |
|---|---|---|---|---|
| R-11 | J21 "Unprompted messages per day: up to 3" with range **1–5**. Unprompted lines without the "Why am I getting this?" footer: J11 habit offer, J15 helper offer, J14 stale-routine review and away notice, J17 conflicting-fact question, J19.3 80 % cap line, J6 "Stop showing weather?" and "skipped this morning's brief". | Article 19: at most 3 a day, never in quiet hours, each with "Why am I getting this?". | Range is **0–3** (default 3). All listed lines count toward the budget and carry the footer. When the budget is spent, the item waits for the next morning brief as one line. In quiet hours nothing unprompted is delivered. User-created routines are "asked for": they do not count, still carry the footer, and may notify in quiet hours only if the user marked them "Urgent". | yes (wait-for-brief) |
| R-19 | J8 "Checking those prices are still right…", J18 "Carrying on from here.", J19 "Back on it. Picking up from step 3." posted as messages. | Article 22: no narration; Article 17: one checklist edited in place. | The first two are **checklist lines**, not messages. "Back on it…" is written by editing the error card in place (SM-A10). | no |
| R-21 | J19.1 adds a thin bar above the composer "Offline · I'll carry on when you're back." with no button. | Article 29: one line with one fix button. | **No bar above the composer.** Offline shows only in the banner strip (03 §3.3, type 1): "You're offline. Your jobs are saved and I'll carry on when you're back." [ Try again ]. See R-34. [settled: X-13] | no (decided in 03) |

### 7.5.7 Decisions in 03 (shell) and 09 (windows) that override the journeys

R-34. These were decided in `03-shell-1.md` / `03-shell-2.md` and `09-windows.md` (§9.24). They win over the journey text named; the builder MUST follow 03/09.

| # | Journey said | 03 / 09 decides | Source |
|---|---|---|---|
| R-34.1 | J1 Stored: AUMID `foo.app` | AUMID **`com.foo.desktop`** everywhere (installer shortcut, toasts, 08) | 09 §9.2, conflict 1 |
| R-34.2 | J1: first window 1100×720 | **1280 × 800**, centred, clamped to 90 % of the work area | 03 §3.1.1 |
| R-34.3 | J1: Windows 10 22H2 or 11 | Minimum **Windows 10 22H2 (build 19045)** or Windows 11, x64 and ARM64 | 09 §9.1, conflict 10 |
| R-34.4 | J20: toast [ Approve ] for non-hard-limit approvals; Payment Review opens an always-on-top receipt window | **No Approve button on any toast.** Approval and Payment toasts: [ Review ] [ Not now ]; Review opens the main window at the card. **No receipt window.** | 09 §9.9.3, conflicts 3–4 |
| R-34.5 | J20: Windows shutdown screen lists "foo: 1 job running" with a reason | foo saves every job's state and **never blocks or delays shutdown**; no shutdown reason | 09 §9.22, conflict 7 |
| R-34.6 | J20 jump list "Needs you (2)", … | Jump list tasks are static, **no counts** | 09 §9.11, conflict 8 |
| R-34.7 | J20 / Appendix A taskbar | Overlay only for needs-you (amber) and done (green ✓, 30 min). **No taskbar badge for plain unread.** | 09 §9.10.1, conflict 9 |
| R-34.8 | J19.1: thin bar above the composer when offline | **Offline shows only in the banner strip** under the title bar (03 §3.3 type 1) with [ Try again ]; no extra bar above the composer | 03 §3.3 |
| R-34.9 | C5 / J10: Windows Hello only | If Hello is not set up, **type the exact amount** (dialog "Confirm this payment") | 09 Hello section, conflict 6; Article 7 (= R-15) |
| R-34.10 | J19.3 / J21: one AI spend meter | **Two caps shown as two meters**: AI ₹1,000 and purchases ₹25,000 | 03 right shell; Article 13 (= R-10) |

---

## 7.6 Behaviour constants (owned by 08, listed here for tests)

| Constant | Value | From |
|---|---|---|
| Seen badge | ≤ 1 s after send | C1 |
| Checklist appears | job has 2+ steps and runs > 1.5 s | C2 |
| Slow tooltip / stuck | 60 s no step / 3 min no step, same step failed 3×, cost > 2× estimate, same page 5× | C1, J19.4 |
| Stuck card | unanswered 15 min → FAILED; Stop on it → CANCELLED, `stop_reason='stuck_stop'` (X-80) | J19.4, SM-A11 |
| Jobs working at once | max 3 | §4 |
| AI test | 20 s limit; verified within last 10 min before a job | J2, §4 |
| AI failure detect / re-test | 2 failures in a row; offline every 30 s, service down every 2 min for 1 h, then every 15 min | J19.1 |
| Offline shown | ≤ 10 s | J19 AT |
| Approval expiry | payment 10 min; booking with no charge now 15 min; send, post, delete, share 60 min | C4, C5 |
| CHECKING | payment 15 min → FAILED; booking email look 10 min | §5, J9 |
| Choice timeouts | reversible 15 min → Best fit; real-world 24 h → CANCELLED; live prices re-checked after 30 min | J8 |
| Sign-in | reminder 10 min; cancel 2 h; link expiry 10 min; WhatsApp QR 60 s | J13, C10, J4 |
| UPI approval / bank OTP | 5 min each | J10, J11 |
| Send undo | 5 s | J12 |
| Forget undo | 5 s | J17 |
| Brief | job starts 15 min before brief time; AI retry every 5 min until 30 min after; late run allowed until 12:00 PM; dims after 12 h; 1–5 cards | J6 |
| Bubbles | 1–3 per reply, 0.8–2.5 s apart | J7 |
| Voice | min 0.5 s, max 5 min, transcript ≤ 3 s, no voice reply over 60 s of speech | J7 |
| Files in chat | ≤ 25 MB each, 6 at once | J7 |
| Search | after 2 characters, 150 ms debounce, first page < 300 ms, highlight 2 s, 10 recent searches | J22 |
| Toasts | max 1 per chat per 2 min; green done overlay 30 min | J20 |
| Reminders | restaurant: 2 h before free-cancel cutoff; hotel: 10:00 AM the day before cutoff; reminder from a chat offer: 9:00 AM on the named day unless a time is given (D-41) | J9, J10, J5 |
| Routines | min interval 15 min; max 25; active hours 7:00 AM–10:00 PM; 20 runs kept; pause after 7 days away; review after 30 days silent; 3 failures in a row → Fix card | J14 |
| Helpers / groups | max 8 helpers; 2–6 helpers per group; pause after > 6 helper messages without the user | J15, J16 |
| Memory | nightly tidy 3:00 AM; tombstone 90 days | J17 |
| Retention | job screenshots 7 days; voice notes 30 days; tech log 14 days; WhatsApp mirror 7 days | §3, J7, J16 |
| Crash safe mode | 3 unclean launches within 10 min, or 3 engine crashes within one launch (`launches.json`, 08-0 §G.14, X-77) | J19.5 |
| Disk | install needs 2 GB; warn under 500 MB | J1, J19.6 |
| Clock | warn if > 5 min off | J19.6 |
| Money caps and thresholds | Windows Hello at ₹10,000 or more (can be lowered to ₹0); AI cap ₹1,000 (min ₹100), warn 80 %; purchase cap ₹25,000; plan card > 2 min or > ₹5 of AI; "big one" > 20 % of cap | Articles 7, 13; J19, J21 |
| Interruption budget | 0–3 per day (default 3); quiet hours 10:00 PM–7:00 AM | Article 19, R-11 |
| Names and pictures | name ≤ 20 characters; own picture ≤ 5 MB (stored ≤ 2 MB); first-job chips ≤ 32 characters | J3, J5 |

---

## 7.7 Decision register

### 7.7.1 Every `[foo decision]` in the journeys (40)

Status: **Adopted** = build as written · **Amended** = build as amended by the named R-row · **Withdrawn** = do not build.

| ID | Journey / place | Decision | Status |
|---|---|---|---|
| D-01 | C5 (journeys-1 §2) | Windows Hello is the on-device check for big payments | Amended R-15 (typed amount fallback) |
| D-02 | C6 | The Send button on a draft counts as the approval tap for known recipients | Amended R-14 |
| D-03 | C8 | Paste catcher "Send anyway" stores "•••• (hidden)"; the AI gets a placeholder | Adopted |
| D-04 | §3 storage map | All paths under `%APPDATA%\foo\`, layout as listed | Adopted |
| D-05 | §4 job machine | Max 3 jobs WORKING at once | Adopted |
| D-06 | §5 approval machine | CHECKING → FAILED after 15 min; "I checked, try again" | Adopted |
| D-07 | J2 | AI detection ladder order (Claude, ChatGPT, Gemini, keys, local AI) | Adopted |
| D-08 | J4 | WhatsApp v1 = read + send-after-approval via linked device; helpers never join WhatsApp groups | Adopted |
| D-09 | J4 | Installed-apps scan kept for the session only, never saved | Adopted |
| D-10 | J5 | Bills found are not memory; they go to Money's notes once Money exists | Adopted |
| D-11 | J6 | Unopened brief dims after 12 h | Adopted |
| D-12 | J7 | Speech to text runs on the PC first | Amended X-43: OpenAI first when a key is saved, local pack otherwise; the user's AI never receives audio. |
| D-13 | J7 | Voice notes kept 30 days unless pinned | Adopted |
| D-14 | J8 | Choice timeout rules (15 min / 24 h / 30 min re-check) | Adopted |
| D-15 | J9 | A guessed food/area preference only after 2+ similar bookings | Adopted |
| D-16 | J10 | Plan card for jobs estimated > 2 min or > ₹5 of AI | Adopted |
| D-17 | J10 | Card fields masked in screenshots; OTP pages never screenshotted | Adopted |
| D-18 | J11 | UPI phone approval counts as the bank's own second check | Amended R-15 (below ₹10,000 only) |
| D-19 | J12 | 5-second local undo before handing a send to Gmail | Adopted |
| D-20 | J12 | Offer "send to {person} without asking" once per person | **Withdrawn** R-13 |
| D-21 | J13 | foo never reads codes from Gmail on its own | Adopted (R-16 when allowed) |
| D-22 | J13 | Screenshots and page reading paused while the sign-in window is in front | Adopted |
| D-23 | J13 | Never capture typed values from a page; Save login asks the user to retype | Adopted |
| D-24 | J14 | A fired alert does not repeat until the condition resets | Adopted |
| D-25 | J14 | Max 25 routines | Adopted |
| D-26 | J14 | Minimum routine interval 15 min | Adopted |
| D-27 | J15 | Max 8 helpers | Adopted |
| D-28 | J16 | Groups are foo-internal (user + 2–6 helpers); WhatsApp groups mirrored read-only | Adopted |
| D-29 | J16 | Group pauses after > 6 helper messages with no user message | Adopted |
| D-30 | J16 | WhatsApp mirror messages not stored beyond 7 days | Adopted |
| D-31 | J17 | Sensitive categories saved only when the user said them | Adopted (+ private by default, R-33) |
| D-32 | J17 | Forget tombstone blocks re-learning for 90 days | Adopted |
| D-33 | J19.2 | Fallback AI answers plain chat only during a plan limit, never send/buy/book jobs | Amended 08-4 §30.9: chat turns and read-only jobs (no send/book/buy/pay/post/delete in `do_verbs`, no approval in APPROVED/RUNNING/CHECKING) use the backup; every other job waits; the second look never does. |
| D-34 | J19.5 | Safe mode after 3 crashes in 10 min; report shown redacted before saving; saved to `Documents\foo\reports\`, never uploaded [settled: X-12] | Adopted (amended) |
| D-35 | J20 | Payments never approved from a toast; Review opens a receipt window | Amended R-12 / R-34 (no Approve on any toast; Review opens the main window; no receipt window) |
| D-36 | J20 | No extra toast when an approval is about to expire | Adopted |
| D-37 | J20 | Lock screen shows only "foo · 1 thing needs you" | Adopted |
| D-38 | J21 | foo has no cloud of its own in v1 | Adopted |
| D-39 | J22 | Search is local; the AI sees a query only on Ctrl+Enter | Adopted |
| D-40 | J23 | Uninstall defaults to "Delete everything" | Adopted |

### 7.7.2 New decisions made by this chapter (confirmed by Vikas, X-52)

R-01 (Clock icon for queued messages; no "slow" emoji), R-03 ([ Pick another file ]), R-05 (emoji → icon mapping, text "Surprise me"), R-06 (button labels), R-07 (time exemptions; absolute dates in drafts), R-08 (test clock Fri 16 Oct 2026 [settled: X-10]), R-09 (lakh in brackets), R-10 (purchase-cap row, card copy and flow), R-11 (held items go to the next brief), R-13 (no "Always" for sends), R-14 (draft = approval card), R-15 (typed-amount copy), R-22 (training sentence), R-23 (behaviour timers are not motion tokens), R-33 (sensitive facts private by default). **15 new decisions.** The decisions taken in 03 and 09 that override the journeys are listed in R-34 (§7.5.7); they are those chapters' decisions, not this one's. Until Vikas says otherwise they are binding, because each one is the more conservative option (Article 30). **Settled 2026-10-16: Vikas kept all 15 as written [X-52].**

### 7.7.3 Decisions added in review Phase 1 (2026-10-16)

| ID | Journey / place | Decision | Status |
|---|---|---|---|
| D-41 | J5 "Take it further", and any chat offer that ends in a reminder (UJ-25) | A reminder created from a chat offer is a routine with schedule `{ kind: 'once', at }` (08-3 §13) owned by the chat where it was asked. `at` = **9:00 AM local time on the named day** unless the user gives a time (then that time). It is stored with `created_from = 'asked'`, so it is a prompted message (Article 19 "things the user asked for": it never counts toward the daily budget) and always carries the "Why am I getting this?" footer. It always notifies (`deliver_toast` true); quiet hours still hold the notification unless the user marked it "Urgent" (R-11). The Routine card states the absolute time ("Sat 17 Oct, 9:00 AM"). | Adopted |
| D-42 | §7.0.8 flights | Flights in v1 are compare and open only; no Payment or booking Approval card for a flight (owner Q1 default) | Adopted until Vikas answers Q1 |
