# 10 · Acceptance (the QA constitution) · part 2 of 2

Part 2 of chapter 10. Part 1 (`10-acceptance-1.md`) holds §A Definition of done and §B Acceptance tests AT-001 to AT-157 and AT-200 to AT-224 (AT-158…AT-199: J24–J30 in `12-features-r25-r31-*.md`). This part holds §C Per-surface checklists, §D Article compliance tests, §E Performance tests, §F Stranger test, §G Evidence.

---

## §C Per-surface checklists

### C.0 How to use these checklists

C.0.1 **The owning chapter wins.** These rows are a QA aid that summarises 03–06 and 09. Where a row disagrees with 03–06, 09 or 08-0 (a shortcut, a button label, a date format, a state name), the chapter is right and the row is a typo: builders never implement from this checklist, and the tester checks against the chapter (FE-19).

C.0.2 **Finding elements.** Every surface and control is reached in tests by its `data-testid` from `src/shared/testids.ts` (08-0 §C, X-58): screens `screen-{slug}`, dialogs `dialog-c-{nn}`, settings rows `settings-row-{page}-{rowId}`, cards `card-{type}` with buttons `card-{type}-{action}`; identity and state come from `data-chat-id`, `data-card-id`, `data-card-type`, `data-card-state`, `data-state`. "States to verify" use the 08-0 values (badge §F; card states §G.2; approval and payment `ApprovalState`).

C.0.3 **Copy.** Quoted copy is checked through its 08-0 §D key in `src/shared/copy/en-IN.json` (X-59). Words per 08-0 §G.15: "cap" for foo's caps, "notification" on screen (never "toast"), "Change" on Approval and Draft cards (X-79). In this chapter "toast" is a test word for a Windows notification, never screen copy.

### C.1 Universal checks (apply to EVERY row in C.2–C.7)

Every surface MUST pass all ten. The rows below list only what is **specific** to that surface; they never replace these.

| # | Check | Pass rule |
|---|---|---|
| U-1 | States | rest, hover, pressed (scale 0.97), focus ring, disabled, loading, empty, error, offline: each one built and screenshot (Article 25, F8). |
| U-2 | Keyboard | Tab reaches every control in visual order; Enter/Space activates; Esc closes overlays and returns focus to the opener; arrows move inside lists, chips and menus; no focus trap; focus ring = 2px `--focus-outer` + 1px `--focus-inner` (F8). |
| U-3 | Narrator | Every control has role, name and state; nothing reads as "button" or "graphic" alone; live changes are announced politely (assertive only for NEEDS YOU) (F9). |
| U-4 | 225 % text | Windows Settings → Accessibility → Text size 225 %: rows grow, nothing clips or overlaps, no horizontal page scroll; body never below 15px at 100 % (F1, F9). |
| U-5 | 100–300 % scale | Display scale 100, 125, 150, 200, 300 %: crisp, aligned, hit areas ≥ 40×40 px (F5, Article 27). |
| U-6 | High contrast | Each Windows contrast theme: system colours only, bubbles and cards bordered, every status = icon + word (F9). |
| U-7 | Reduced motion | Animation effects off: no movement or scale, fades ≤ 83ms, static Thinking face instead of typing dots (X-36), static face poses (§F15.9.5), "◔" spinner (F7). |
| U-8 | Dark mode | Light, dark and "Same as Windows" (switch Windows theme while foo is open: foo follows within 1 s with no restart) (F0, F2). |
| U-9 | Offline | Internet off and AI unreachable: the surface shows its offline state from 03–06; nothing is lost; one line, one fix button (Article 29). |
| U-10 | Tokens and copy | Passes ART-02a, ART-21a, ART-21c and ART-24a scans; copy matches spec + 07 §7.5 amendments. |

### C.2 Shell (03)

| Surface | States to verify | Keyboard | Narrator says | 225 % / HC / motion / dark / offline specifics |
|---|---|---|---|---|
| Window | first open 1280 × 800 centred, clamped to 90 % of the work area (R-34.2); restored size and position on relaunch; minimum size; maximised; snapped half/quarter | Win+Arrow snap; Alt+F4 = close to tray (J20) | "foo" window title | 300 % scale on 1366×768 still shows chat list + chat; offline: window opens and shows all chats (Article 29) |
| Title bar | active / inactive; light / dark; caption buttons rest/hover/pressed; Snap Layouts flyout on maximise hover | Alt+Space system menu | "Minimise", "Maximise", "Close" | HC: system caption colours; title bar `--bg-sidebar` |
| Left shell: chat list | empty (first run: greyed "foo" row), 1 chat, 200 chats, unread, pinned, muted, selected (`--bg-selected` + 3px accent bar), pills "Working", "Needs you", "Paused", "Done" (fades after 24 h), group (stacked faces), WhatsApp mirror mark (`chatlist-row-source`, 03-shell-1 §3.4.5.1, X-128), helper paused | ↑ ↓ moves selection, Enter opens, Ctrl+K search, Ctrl+N new helper, Ctrl+Shift+N new group (09 §9.17) | "{name}, {pill}, {n} unread, last message {preview}, {time}" | 225 %: 72px row grows, 2-line preview stays 2 lines with ellipsis; pills = icon + word in HC; offline: list still loads from disk |
| Filter chips + "Search chats" box | All · Needs you · Working · Done; empty result; typing | Tab into chips, arrows between chips | "Filter, Needs you, selected" | 225 %: chips wrap, never clip |
| Headers (left + main) | 60px aligned; chat name, typing line, setup pill "Step n of 4", Details toggle (PanelRight 20, `aria-pressed`; "Show details (Ctrl+Shift+D)" / "Hide details (Ctrl+Shift+D)", 03-2 §3.6.2.2), ⋮ menu, muted icon | ⋮ opens with Enter, arrows in menu | "{name}, typing" when typing; pill read as "Setup step 2 of 4" | HC: pill bordered; both headers stay aligned at 225 % |
| Main shell + banner strip | empty chat, date separators ("Today, Fri 16 Oct", "Yesterday, Thu 15 Oct", "Wed 14 Oct"; 03-2 §3.6.5), 5,000 messages, jump-to-bottom, restored draft after crash; banner strip types 1–7 (one at a time, priority order), offline banner with [ Try again ] and **no** bar above the composer (R-34.8) | PgUp/PgDn, Home/End in history, Ctrl+F find | each message as list item "{sender}, {time}: {text}" | 225 %: bubble max 72 % / 620px respected; side padding 24px ≥ 900 px, 16px below |
| Right shell | Doing now (0–3 jobs, `ArrowMaximize` IconButton "Open the window" (06 §0.11, `app-panel-doing-open`, X-138), right-click Stop), Using (AI, apps), What I know (top 3, See all), Spent this month as two meters, AI ₹1,000 and purchases ₹25,000 (amber at 80 %, plan-based text) (R-10, R-34.10), settings panel replacing it, hidden and shown by the Details toggle | Ctrl+Shift+D shows / hides details (09 §9.17; Ctrl+Shift+P is pin / unpin chat); right-click menu by Shift+F10 | "Spent this month, your AI ₹800 of ₹1,000, warning" | HC: amber state = Warning icon + "80 % used"; slide 340px at `--m-slow`, none in reduced motion |
| Resizing | sidebar drag 300–460px; window narrow → right shell collapses; very wide → column max 760px centred | sidebar splitter resizable by keyboard (arrows) | "Resize chat list, 340 pixels" | 300 % scale: splitter hit area ≥ 40px |

### C.3 Messages and composer (04)

| Surface | States to verify | Keyboard | Narrator says | Specifics |
|---|---|---|---|---|
| Your bubble + status badge | sending, sent, read tick (`--tick-read`), badge values exactly 08-0 §F (`seen` 👀, `working` 🛠 incl. slow tooltip "Taking longer than usual", `waiting` ⏳, `done` ✅, `done_unverified` ✅ "Done · Not checked live", `failed` ❌, `stopped` ⛔; never ⚠), queued offline = Clock tick and no badge (R-01, X-61), reply-quote, edited, voice, attachment | Shift+F10 / menu key opens message menu (Reply, Copy, React) | "You, Fri 16 Oct 9:02 AM: {text}. Status: waiting for you" | badge cross-fade `--m-normal`; RM: no fade > 83ms; HC: badge has text tooltip and is announced |
| foo / helper bubble | typing line, streaming (words fade 150ms, no cursor), one bubble per reply (CR-0024), list in one bubble, markdown (H1/H2 at 20px max, code block mono), table as a table (CR-0053), memory chip, proof chip, "Why am I getting this?" footer, voice-preferred reply, "answered with ChatGPT while Claude rests" label | arrow through messages; Enter on a link opens it | "foo, 9:03 AM: {text}" and once streaming ends, not word by word | 225 %: no line over 72 characters at 100 %; dark: `--bubble-foo` dark value; offline: older messages readable |
| Voice-note bubble | recording bar ("Release to send · Esc to cancel"), < 0.5 s discarded ("Hold to record"), 5:00 max, sent, transcript collapsed/expanded, transcript failed, low-confidence "I heard…", foo voice reply with speed chip and word highlight, never autoplay | hold Ctrl+Space to record, Esc cancels; Space play/pause on focused bubble | "Voice note, 0:14, transcript: {text}" | RM: waveform static; HC: waveform drawn with system colour |
| Reactions | add, remove, foo's 👍 on user's bubble, 1️⃣–4️⃣ answering a Choice card, 👍 on an Approval card (does nothing, Article 6) | reaction picker reachable from message menu | "Reacted thumbs up" | — |
| System lines | handoff marker, date divider, "Opened in Trips", "Not saving this one" chip, held-items line in brief | not focusable unless it has a link | read as plain text, centred lines read once | HC: grey text becomes CanvasText |
| Composer | empty, typing, multi-line (grows), disabled before AI ("Connect your AI first, then we can talk."), paste catcher trigger, attach (≤ 25 MB, 6 files), "Something else…" hint, offline (composer stays usable, messages queue; the notice is the banner strip only, R-34.8), restored draft, send button 36px | Enter sends, Shift+Enter new line, Esc clears reply-quote, Ctrl+Space hold to talk | "Message foo, edit text" / "Send" | typing latency (PERF-02); 225 %: composer grows upward, never covers last message |

### C.4 Cards (05)

All cards: `role="group"` labelled with the card name (F9); buttons say action + object (R-06); one primary button on error cards (R-03); icons per R-05.

| Card | States to verify | Keyboard | Narrator says | Specifics |
|---|---|---|---|---|
| Choice (C3) | 2, 3, 4 options; Best fit tag; photo options; stepper "1 of 3" with Back; multi-select + Done; answered (collapsed "question → answer"); reminder; auto-picked note; expired/cancelled | arrows between options, Enter picks, digits 1–4 pick | "Question: {q}. Option 1 of 3, Best fit, {text}" | answers from typing and reactions (AT-035); 225 %: photos scale, text wraps |
| Approval (C4) | PENDING (1.5px accent top edge, LockClosed, countdown), APPROVED/RUNNING, HELD, COMPLETED, DECLINED, EXPIRED + Ask me again, SUPERSEDED (struck-through), WITHDRAWN, FAILED, CHECKING; hard-limit footer "I'll always ask for this one."; app-use scope chips only (R-13) | Tab order: impact line → primary → Change → Not now | "Approval needed. Book table at Pizza by the Bay, Sun 18 Oct, 8:00 PM, 4 people. No-show fee ₹1,000. Button: Book table" | typed "yes" never approves (ART-06a); HC: state words visible ("Pending", "Expired"); RM: countdown text only |
| Payment (C5) | PENDING with 10:00 countdown and absolute end (R-07), Windows Hello sheet, typed-amount field (R-15), APPROVED, UPI waiting "Waiting… 4:58", HELD, SUPERSEDED, DECLINED, EXPIRED, FAILED, CHECKING, COMPLETED; non-refundable warning; card picker; no-card → card form | primary "Approve ₹14,600" reachable, Hello sheet keyboard PIN | "Payment. Taj Holiday Village, 2 nights. Total charged once ₹14,600. Button: Approve ₹14,600" | amounts tabular-nums; 225 %: amounts never truncated; offline: Approve disabled with reason |
| Draft (C6) | email / WhatsApp / X variants; known recipient (approval frame + impact line, R-14); new recipient → full Approval; editing inline ("edited" label); Undo bar 5 s; sent + proof; failed; offline queue question; X counter + over-limit; "Opened in X · not posted by foo" | Change enters edit mode; Ctrl+Enter does **not** send (only the button) | "Draft, not sent. Email to Rakesh Sharma. Subject…" | X counter red = `--bad` + "Too long for X by 34 characters" |
| Secret box (C7) + code box + card form | empty, typing (masked), show toggle (resets to hidden on open), saving, saved ("· saved {date}", Replace only), failed ("That didn't save. Try again."); code box 6 digits; card form (CVV never saved) | `card-secret-eye` (`Eye`/`EyeOff`, 05 §5.8.1) by keyboard; Enter saves | "OpenAI key, secret, edit text, hidden" — never reads the value | value never in screenshot frames (canary, ART-08a) |
| Paste catcher (C8) | each pattern (sk-, sk-proj-, AIza, ghp_, xoxb-, Luhn card, 32+ high entropy, 4–8 digits after code request); Move to secret box; Send anyway → "•••• (hidden)" | focus moves to the catcher; Esc dismisses the catcher and the caught span stays masked "••••" in the composer; the next Enter re-runs detection (05-2 §5.9.3, 08-0 §H) | "Warning. That looks like a password or key." | — |
| Sign-in (C9) | waiting, LIVE, signed in (green banner, `--ok-soft` + word), reminder at 10 min, cancelled at 2 h, Skip → another route, saved login failed | I'm done, Take over, Skip reachable | "{Site} wants you to sign in. Live." | — |
| Connect (C10) + WhatsApp QR | rest, opening browser, connected as masked email, wrong account, denied, link expired → Reopen, partial permission, offline (buttons disabled), QR live / expired (blurred) / failed 3 times | — | "Connect Gmail and Calendar. Button: Connect" | QR has text steps (1–3) for Narrator |
| Plan (C11) | `pending`, `go`, `changed`, `withdrawn`; "This is a big one.", plan-based cost wording | "Go", "Change plan" (05-3) | "My plan, Goa stay, 3 steps, about 6 minutes" | — |
| Checklist (C2) + link card | appears after 1.5 s (2+ steps), current step spinner, slow tooltip, Watch live (browser only), Stop, done collapsed "✓ Done · {n} steps · {m} min · Details", failed expanded, "You took over" (HandRight), link card mirror in foo chat updating live | Details expands; Stop reachable | announces only step changes, politely | spinner → "◔" in RM; one message id for life of job (ART-17) |
| Proof chip + receipt footer (C12) | proof (number / screenshot / email), "⚠ Not checked live" + Check for real, footer with time, steps, cost | Enter opens proof | "Proof: confirmation PB-4471" | numbers in `--t-mono` |
| Routine (C13) | created, changed line highlighted ("was every 30 min"), paused, failing (Fix), cost wording key vs plan | Run once now, Change, Pause | "Routine created. Checks… Next run Fri 16 Oct, 10:15 AM" | — |
| Memory chip (C14) | I'll remember · Undo, I'll remember · I guessed · Undo, Used ✕, Forgot it, Not saving this one [X-05] | Undo and ✕ reachable | "Memory: I'll remember, Allergic to peanuts. Button: Undo" (05 §5.17) | — |
| Error (C16) / stuck / recovery | every J19 error kind; `error` states shown, asking, fixed, resumed, stopped, dismissed (recovery = `error.variant='recovery'`); `stuck` states asking, other_way, taken_over, stopped, timed_out, ⚠ in the stuck header only; Stop on stuck → job CANCELLED ⛔ (X-80); stuck with cost + 3 options; second-route stuck (2 options); recovery with mid-payment CHECKING; safe mode; edited-in-place "Back on it…" | primary first in tab order | "{what happened}. {what is safe}. Button: {fix}" | exactly one primary button (ART-02c) |
| Setup cards | welcome, AI finder rows (Testing… / ✓ works / not found / failure labels), name (≤ 20 chars message), face grid (generated / presets / own picture / too big), vibe, interview A–H, summary | grid by arrows; "Surprise me" button | "Step 2 of 4. What should I call myself? Edit text" | — |
| Brief | 3–5 cards, light day, late note, skipped, short brief (AI off / cap), "Stop showing…?" question, dimmed expired, Monday learned line | 👍 👎 per card reachable | "Morning brief, 3 items. Item 1 of 3…" | — |
| Bill (Money, type `bill`) | states `waiting`, `reminded`, `paying`, `paid`, `already_paid`, `expired`; overdue (Warning + word), duplicate fold ("Also received {date}"), scam (`scam: true`, no Pay), already paid (found / "⚠ Not checked live", R-17) | Pay now, Remind me, I already paid reachable | — | AT-151…AT-154 |
| New helper / New group dialogs (06, not cards) | templates, name taken, 8-helper maximum, Payments ticked note, 2–6 members | — | dialog name "New helper" | — |
| Spend-cap card (type `spend_cap`, AI and purchase rows, R-10) | `shown`, `raised`, `dismissed`; purchase row: would pass the cap | "Raise cap", "Not now" | "Spending cap: {line 1}" | — |

### C.5 Screens (06)

| Screen | States to verify | Keyboard | Narrator says | Specifics |
|---|---|---|---|---|
| First run | welcome, step pills 1–4, resume after close, "skip setup", Privacy details link | full flow keyboard-only (ART-26b) | step announced on change | offline: AI test card "You're offline…" |
| Settings | all 11 sections; search (found / "Nothing called that…"); locked chips with tooltip; changed-by-chat mini line "Changed: {row label} → {value}. [ Undo ]" (`settings:undo`); purchase cap row `cap-buy` (R-10); Permissions rows Always · Ask · Never with send/book/pay/delete/share Ask or Never only and post locked Never (X-54); "Unprompted messages per day" 0–3 (R-11); Windows Hello row wording (R-15); export progress / done; typed confirms | Ctrl+, opens; search focused first | "Permissions, Pay, Ask, Always not available" | 225 %: 56px rows grow; dark/HC |
| Memory page | empty, filters, search, row edit, forget + 5 s Undo, by-source confirm with count, Forget everything (type FORGET), unreadable lines notice, helpers' notes | Ctrl+M opens; row actions by keyboard | "Vegetarian on Tuesdays, you said, 2 Oct. Buttons: edit, forget" | — |
| Helper profile / group | edit fields, its routines, files, paused, delete with running job, group members | — | — | — |
| Routines screen | list, detail with 20-run history, Pause all / Resume all, suggestions (max 3, dismiss forever), 25-routine maximum | Ctrl+R opens | "BTC below ₹55,00,000, on, next run…" | — |
| Search palette + find in chat | empty with recents, results by group (max 5 + See all), no results + Ask foo instead, filters, highlight 2 s | Ctrl+K, ↑ ↓, Enter, Esc, Ctrl+Enter; Ctrl+F in chat with ↑ ↓ | "{n} results in Messages" | PERF-05 |
| Watch live window (`live.html`, 08-0 §G.8) | loading, live, can't load ("I can't show the live view right now…"), Take over, Stop; frames not interactive | — | "Live view, Goa stay, step 3 of 4" | fields blurred every frame (AT-079) |
| Sign-in / take-over: real Edge window + docked `signin-banner.html` (08-0 §G.8, 09 §9.27) | waiting banner (`--warn-soft`), success (`--ok-soft`), Edge closed = Skip; "I'm done" (Alt+D); take-over "You're in control. foo is paused." | Hand back reachable | banner text read on open | capture paused (AT-056) |
| Dialogs | first-close tray dialog, confirm (Keep {object}), typed DELETE/FORGET (button disabled until typed), quit with running jobs, stop all | Esc = the keep/decline choice | dialog title read first | `--shadow-28`, `--scrim` |
| Toasts (content) | every 09 §9.9.3 type; merged "{n} updates"; quiet-hours summary; Approval and Payment toasts only [ Review ] [ Not now ], never Approve; Review opens the main window at the card (R-34.4) | Win+N reaches them | title = chat name, one line | no secrets (AT-090) |
| Tray menu | all-quiet, jobs running, needs you; every item; quit confirm | menu key / arrows | tooltip states read | — |

### C.6 Windows integration (09)

| Area | Verify | Pass |
|---|---|---|
| Installer / updater / uninstaller | per-user, no admin, signed publisher, refuses below Windows 10 22H2 (build 19045) with the J1 copy (R-34.3), every J1 and J23 branch, rollback, offline install, update keeps data | AT-001–004, AT-100–104; screens at 225 % and HC |
| Title bar and Snap | Snap Layouts on maximise hover, Win+Z, drag to edges, dark/light caption | flyout appears on Windows 11 |
| Single instance | second launch focuses the running window; second click on a toast never starts a second process | one process in Task Manager |
| Start at login, close to tray | start-with-Windows flag honoured; ✕ keeps foo in tray; Quit stops it | tray icon present after reboot |
| Toasts | AUMID `com.foo.desktop` (R-34.1), title = chat name, face, ≤ 2 buttons, no inline reply box in v1 ([ Open ] [ Mark as read ]; owner Q3 default), Focus/Do not disturb respected, notifications-blocked bar, lock screen shows only "foo · 1 thing needs you" | J20 tests |
| Taskbar | amber "needs you" overlay ≤ 2 s; green done ✓ 30 min; **no overlay for plain unread**; progress bar; jump list = static tasks with **no counts** (09 §9.11) (R-34.6–7) | AT-087 |
| Tray | icon = foo's face, tooltips, menu items | C.5 tray row |
| Windows Hello | face / fingerprint / PIN; cancel and fail keep card PENDING; not set up → typed amount (R-15); threshold ₹0 (`money.bigPaymentPaise` 0–1,000,000) | AT-042, AT-095 |
| Credential Manager | entries `foo/{kind}/{name}` only (08-0 §E.8); nothing readable back into the UI; removed on Delete everything | AT-008, AT-100 |
| Keyboard | every shortcut in 09 works and is listed; no clash with Windows (Win+…) or IME (Ctrl+Space hold vs language switch documented in 09) | ART-26b |
| Scaling, text size, contrast, animations | 100–300 % scale × 100/225 % text × light/dark/HC × animations on/off: spot matrix of 12 combinations on 5 key surfaces | U-4 to U-8 |
| Power | keep-awake only while a job is WORKING with tooltip "foo · keeping your PC awake for {n} jobs"; on sign-out/shutdown foo saves every job's state and **never blocks or delays shutdown** (no shutdown reason, R-34.5); sleep → WAITING | 09 §9.22 |
| Hindi / Punjabi | Nirmala UI fallback renders Devanagari and Gurmukhi in bubbles, chat rows, toasts | screenshot evidence |
| Toasts from a closed app, muted chats, live windows | the checks 09 §9.25.13–§9.25.17 (Review from Notification Center with foo closed, Message toast buttons, muted-chat toasts, private-chat toast body, closing `live.html` keeps the job) and 09 §9.27.4 (Watch live window, Take over banner, sign-in window) | each check passes as written in 09 |

### C.7 Living face (02 §F15.9) [X-35]

Applies to foo's and every helper's default face in rows, headers, the typing indicator, toasts and the tray. Fixture: sandbox job runner, card store and connection monitor driven by the test harness; pinned clock (X-10).

| # | Verify | Pass |
|---|---|---|
| C.7.1 | **Moods follow real state.** Drive one chat through: message sent (👀) → reply request in flight → QUEUED → WORKING → NEEDS YOU with an Approval card off screen → card scrolled into view → approved → WORKING → DONE with proof; then a FAILED job, a Stop, a DONE "⚠ Not checked live", the offline line, quiet hours. Record the 40px header and 48px row. | Each mood of §F15.9.3 shows exactly while its trigger is true (Noticed, Thinking, Working, Needs you, Waiting on you, Working, Happy; Sorry, Stopped, no Happy for unverified, Offline then Waking up, Asleep); mood changes within 200 ms of the state change; header and row always show the same mood (§F15.9.3e) |
| C.7.2 | **Priority.** Make two or more triggers true at once (offline + WORKING; NEEDS YOU + WORKING; stuck card + WORKING; quiet hours + WORKING) | the face shows the first in Offline → Needs you → Stuck → Working → Waiting on you → Thinking → Listening → Asleep → Resting |
| C.7.3 | **Only real sources.** Fake AI writes "Done! 🎉", "thinking…", "working on it" with the runner idle and no request in flight (ART-12c) | face stays Resting; no Thinking, Working, Happy or Celebrating |
| C.7.4 | **Typing indicator.** Reply in flight, no word yet, in a 1:1 chat and a group | the 26px Thinking face sits where the next bubble appears (group: static pose on the sender-label row); no typing dots anywhere; the first bubble takes its place with no layout jump; nothing shows when no request is in flight (04 §14.3, X-36) |
| C.7.5 | **Reduced motion** (Animation effects off) | no blink, drift, scan, nod, pop, wake, ring turning or spark movement; Working ring is a still quarter-arc; mood cross-fades ≤ 83 ms; Speaking bars still follow the audio level (§F15.9.5) |
| C.7.6 | **High contrast**, all four Windows contrast themes | disc `Canvas` with a `CanvasText` edge, eyes `CanvasText`, every ring `Highlight`; Working / Stuck / Needs you / Waiting on you rings still tell apart by shape (turning arc, still arc, full, dashed) (§F15.9.7) |
| C.7.7 | **Tray states.** 16, 20, 24, 32 px × light and dark taskbar × scale 100/125/150/200 %: Resting, Working, Needs you, Paused, Done, Offline, Quiet hours, Setting up, high contrast | each matches 09 §9.8.1 pixel for pixel against the reference PNGs; at 16 px the eyes are whole-pixel 2 × 5 px; the dot is drawn in the right colour with its knock-out ring; the tray icon never animates; Done clears after 10 s |
| C.7.8 | **26 px legibility.** Render all 18 moods at 26 px at 100 % scale, light and dark, on `--bg-app`, `--bg-sidebar` and `--bg-selected` | both eyes render as two separate shapes with at least 1 px between them in every pose; each ring is visible outside the disc and clear of neighbouring text; 3 of 3 stranger testers (§F) tell Resting, Working, Needs you, Waiting on you and Offline apart from the 26 px renders alone |
| C.7.9 | **Brand mark.** App icon, taskbar button, installer, About, Welcome card | the logo is the two-eyes face in its static Resting pose (X-143, master `foo/look-book/assets/logo-face.svg`; no "f" mark anywhere) and never animates; only in-app faces animate (AT-277) |
| C.7.10 | **Toast logo.** Done, card and failure toasts for foo and a helper | 48 × 48 PNG of that chat's face in Happy, Needs you and Sorry respectively, with its ring (09 §9.9.2) |
| C.7.11 | **Other faces.** Picture, glyph and emoji faces for a helper | the face itself is never altered; mood shows only through rings, the Sorry flash, Offline greyscale, Asleep opacity and the 👍/❤️ badge (§F15.9.4) |
| C.7.12 | **Narrator** | the face is never read where the name is beside it; no mood words are spoken; a standalone face is read as "{name}" |
| C.7.13 | **Groups** | faces show only the Working and Needs you rings; no one-time animation plays (§F15.9.3d) |

---

### C.8 Quiet premium polish (X-179, CR-0021)

Fixture: FOO_TEST world, fake AI, pinned clock; motion checked at `data-motion` "full", "basic" and "off" by computed style (animation name, duration, timing function, transform), never by timed pictures.

| ID | Verify | Pass |
|---|---|---|
| AT-300 | Spring tokens | `--ease-spring` / `--ease-spring-soft` are CSS `linear()`; overshoot ≤ 4 %; every exit duration ≤ every entrance duration; no animation library or Web Animations API in the bundle |
| AT-301 | Basic and Off over every surface | Basic: no transform, scale, rotation or height animation, fades `--m-basic`; Off: §F25.4 table, nothing moves |
| AT-302 | Chat and page changes | the new view slides 18px with `--ease-spring-soft` and cross-fades; back reverses; the old view leaves in ≤ 167ms |
| AT-303 | Dialogs and menus | dialog 0.92 → 1 with `--ease-spring` and `--shadow-28`; shell behind 0.96 + 2px blur; menus scale from the opening button |
| AT-304 | Living face in the app | no letter face for foo or a default helper; Resting blinks every 2–6 s; ≥ 40px bobs; idle stops while the window is hidden; "Show foo's eyes" off → still poses, rings still shown |
| AT-305 | Thinking row | the 26px Thinking face only while a request is in flight (C.7.4) |
| AT-306 | Empty-state poses | Memory empty states show the 64px face in its pose, `aria-hidden`, no ring |
| AT-307 | Starter chips | empty chat: 3 starters; click fills and focuses the field, sends nothing; hidden on the first keystroke |
| AT-308 | Follow-up chips | ≤ 3, only from the reply's stored suggestions (banned words dropped, line stripped from the bubble); none after Approval / Payment / Draft / Secret or money; none in groups, mirrors or private chats |
| AT-309 | Composer states | hold mic floods the button; send → ✓ for 2s on delivery; Stop while working; "Add details…" while a job works |
| AT-310 | Checklist | named steps with their `StepKind` icon; live step shimmers; ✓ overshoot; sources pile (≤ 5, "+n" after 3) |
| AT-311 | Approve card | springs in with `--shadow-28`; amounts in `--weight-money` tabular digits; primary lip; no sparks or celebration on any money card |
| AT-312 | Job done | DONE with proof → Happy; first of the day → Celebrating; the card line "{job title} · saved you about {n} min." from the fixed table, hidden under 5 min; DONE "⚠ Not checked live" shows none of it |
| AT-313 | Splash | the 96px face's eyes open once; logo never animates; Off: eyes already open |
| AT-314 | AI finder polish | striped 4-step pill; rows test live (shimmer → ✓ works); app logos on white tiles |
| AT-315 | One icon set | no "✓" text glyph in `en-IN.json` or renderer JSX (comments skipped); Fluent `Checkmark` 16 instead |
| AT-316 | Type | `--t-subtitle` 17/24; weight 700 only through `--weight-money` |
| AT-317 | Dark depth | dark `--shadow-4/16/28` = 1px edge ring + two layers; light unchanged |
| AT-318 | Sounds | default off; on: only Approve and Done tones; never in quiet hours or while hidden |
| AT-319 | Mica | `backgroundMaterial: 'mica'` only on Windows 11 + transparency on + setting on, not high contrast, not FOO_TEST; otherwise solid |
| AT-320 | Appearance page | every row of 06-2 §6.2 writes its setting and applies live, without restart |
| AT-321 | Zoom | Ctrl+= / Ctrl+- / Ctrl+0 / Ctrl+wheel and the Zoom row share `zoom`; overlay height = round(32 × zoom) |
| AT-322 | First script | the renderer entry chunk ≤ 500 KB minified; a lazily loaded page shows its skeleton within 150ms |
| AT-323 | Chat list details (§F7.1) | each built detail animates at Full, fades at Basic, is still at Off |
| AT-324 | Message details (§F7.1) | as AT-323, and no layout jump in the virtual list |
| AT-325 | Composer details (§F7.1) | as AT-323 |
| AT-326 | Pages and panels details | skeleton shimmer, tooltip after 500ms, toggle knob spring, segmented and Settings pill slide |
| AT-327 | Lip | `Button variant="primary"` lip flattens on press in 83ms; other buttons keep the 0.97 press |

### C.9 Rich replies (X-180, CR-0022)

Fixture: FOO_TEST world, fake AI replies with ```a2ui and ```page blocks, pinned clock, motion off for pictures. Every piece row also covers keyboard, Narrator, and light, dark and high contrast.

| ID | Verify | Pass |
|---|---|---|
| AT-340 | LineChart (line, area, bar) | the three variants draw from one series and from 3; one hue; axis labels and values follow 02 number and money rules; legend only with 2+ series |
| AT-341 | MapStops | numbered stops to scale on a plain panel with a dashed route and the stops list; "Open in Maps" is an action chip; no network request leaves the PC while it draws |
| AT-342 | Stepper and Slider binding | + / − and arrow keys change the value within min/max; every component bound to the same path updates at once |
| AT-343 | Compare | 2–3 columns; the highlighted column is outlined with its one-line why |
| AT-344 | Timeline | items in date order; amounts in money format |
| AT-345 | WeekCalendar | busy and free slots for 7 days; Narrator reads each slot |
| AT-346 | TimedChecklist | a timer runs in the renderer; ticks are kept in the surface's data model |
| AT-347 | Calculator | outputs recompute from the inputs (+ − × ÷ ^, min, max, round, pmt); a bad formula shows "Can't work this out" |
| AT-348 | GoalRing | arc proportional to value / target, "{value} of {target}" in the middle, `role="meter"` |
| AT-349 | ListPick | the pick counts as a Choice answer; a reaction counts too (05 §5.3.4) |
| AT-350 | TimePick | the picked slot goes back to foo, who confirms it |
| AT-351 | ShortForm | up to 6 fields; submit sends one action with the values |
| AT-352 | LiveStamp + Refresh | "Data as of {time}" shows; Refresh sends `kit:refresh` |
| AT-353 | Streaming | each complete A2UI message draws while the reply streams; an incomplete one is held back |
| AT-354 | Invalid component | an invalid or unknown component is dropped, "Couldn't show part of this" shows, the words stay |
| AT-355 | Action round trip | a Button action reaches the engine as `kit.action` and the surface updates from the reply |
| AT-356 | Gated Button | a Button whose action sends, books, pays, deletes or shares opens an approval, never acts directly |
| AT-357 | AI page sealed | a fetch, an image URL or a navigation inside the page fails; main logs the denied request |
| AT-358 | AI page sandbox | the frame has `sandbox="allow-scripts"` only: no same-origin, popups or forms |
| AT-359 | AI page caps | a page over 512 KB shows "This page is too big to open"; height stops at 600px and the page scrolls inside |
| AT-360 | AI page bridge | messages from other sources, bad schema and more than 10 calls per second are refused; every call is logged through `page:rpc` |
| AT-361 | AI page actions | `requestAction` goes through the gate; `openLink` always shows C-26; secret text in any call is refused and the Secret box posts |
| AT-362 | AI page first view | a kit piece or the status line shows before the page is ready |
| AT-363 | "foo read:" | the line shows the people, places, dates, times and amounts understood, and never a secret |
| AT-364 | Ask about this | a side question is answered while a running job keeps running (its checklist does not stop or re-plan) |
| AT-365 | Paste bands | ≤ 2,000 inline; 2,001–10,000 "Pasted text" chip; > 10,000 `pasted-{time}.txt` file chip; the paste catcher runs first in every band |
| AT-366 | Visuals = Mostly words | the same question answers without kit pieces or AI pages unless the user asks for one |
| AT-367 | Reply vs action chips | reply chips fill the composer; ≤ 3 action chips act through the gates; none after an approval or payment card |
| AT-368 | Refresh | Refresh updates the surface's data model and "Data as of" |
| AT-369 | Keep | Keep saves a `kept_items` row listed in the chat's Files tab; a kept AI page reopens only in the sealed box; no `.html` file is written |
| AT-370 | Secret-like values | ShortForm and TextField refuse values that match 04-2 §22.4 and offer the Secret box |
| AT-371 | Calculator never runs code | formulas go through `shared/kit/evaluate.ts`; no `eval`, `Function` or dynamic import in the kit bundle |

AT-372 to AT-379 are reserved for R1.

### C.10 Chat feel fast patch (X-182, CR-0024)

Fixture: FOO_TEST world, fake AI, pinned clock, motion off for pictures.

| ID | Verify | Pass |
|---|---|---|
| AT-420 | Two messages during a job, one answer | both queued messages marked `answered` by one step turn → foo's answer posts once; two folded → "Got it, I'll fold that in." once |
| AT-421 | Reaction chip | a 👎 on a reply whose last line ends near the left edge never overlaps the text; the next row sits 24px below |
| AT-422 | Sentence case | the `rules.md` sent to the AI says "Always write in normal sentence case" and no longer says "Mirror the user's casing" |
| AT-423 | Voice | the foo and helper identity blocks carry the "How you sound" line; the foo block is one paragraph |
| AT-424 | Answer first | `rules.md` asks for the answer in the first sentence and allows a short list for three or more things |
| AT-425 | Capabilities card | a reply tagged `intent_capabilities` posts the one-sentence reply and the card; rows follow 04 §13.7 order and connection state; Try it fills the field and sends nothing |
| AT-426 | Capabilities footer | the safety line always shows; while the Ideas page is a placeholder no ideas link line shows (once it is built: at most once per chat per local day) |
| AT-427 | One bubble | a 3-paragraph chat-mode reply of ≤ 600 characters shows as one bubble with one time |
| AT-428 | Sender label in own chats | foo's chat and a helper's chat show the face and name above the first bubble of each output run |
| AT-429 | Your bubble colour | dark theme user bubble is `#2C359A`; light stays `#0B0B10` |
| AT-430 | Reply actions on older answers | the action row shows under the latest answer, and under an older answer on hover or focus only |
| AT-431 | Chip icons | each suggestion chip shows the icon its words map to (04-2 §21.7 Look); unknown words get `Edit` |
| AT-432 | Answered steer tick | a message answered while a job runs shows ✓✓ read, not ⏳, once its answer posts |
| AT-433 | Trying another way | a failed tool call with the job carrying on shows "Slow here, trying another way" under the current step until the next successful call |

| AT-434 | Memory note wording | the intake rules ask for a memory fact as a short note without "the user" or their name |
| AT-435 | Drafts are jobs | the intake rules make writing, sending or replying to an email or a message a job that needs that app, never a draft in `<say>` |

AT-436 to AT-439 are reserved for this patch.

**Empty intake answers (CR-0041, X-199; 08-4 §25.5 item 6).**

| ID | Verify | Pass |
|---|---|---|
| AT-440 | Empty answer, asked again | an intake answer with no words left gets one more intake turn with nothing shown; if that one plans a job its card follows, and if it is empty too foo posts "I didn't get that. Say it another way?"; a short real ask ("Order me a pizza from Dominos") never gets a 👍; an ack still does (AT-027) |

**Kit replies from real AIs (CR-0046, X-204; 04 §13.5, 08-4 §24.3, §24.5).**

| ID | Verify | Pass |
|---|---|---|
| AT-441 | Small slips mended | a real AI's kit reply with an unknown key, a `null`, a number written as text or text as a plain number, or an over-long label draws with no "Couldn't show part of this"; an unknown component, a missing key, a value outside its list, too few items, a bad input name, `composer.fill` or a web image is still dropped (AT-354) |
| AT-442 | The prompt teaches the limits | each catalog line names its text lengths, item counts and the Calculator input-name pattern, the kit section says to use only the keys shown and to leave an unused optional key out |
| AT-443 | Wrong or missing closing brackets (CR-0050, X-208) | the recorded run-30 EMI Calculator, Jaipur map and GDP chart replies, whose closing brackets are swapped or left out, draw with no "Couldn't show part of this"; a line that starts a new message ends an open one before it; valid replies read the same; a reply cut inside a text value, or a piece the catalog refuses, is still dropped; while streaming an open message is still held back |

**Tables in replies (CR-0053, X-210; 04 §13.2, 08-2 §7.6, 08-4 §24.3).**

| ID | Verify | Pass |
|---|---|---|
| AT-444 | A table stays a table | a reply holding a markdown table reaches the bubble with the table unchanged (no "label: value" lines), chat mode or stream mode; `rules.md` lets the AI use a table when asked for one or when comparing three or more things on the same points |

**Job answers with tables (CR-0055, X-212; 08-4 §25.3).**

| ID | Verify | Pass |
|---|---|---|
| AT-445 | A job's answer can hold a table | a step's `done` with a `result` holding a three-row comparison table (over 600 characters) passes the step check; a `result` over 4,000 characters still fails it |

---

## §D Article compliance tests

D.1 Every article has at least one test. **Auto** = runs in CI on every build. **Manual** = run before every release. A failing article test blocks release (A.4).

| ID | Art. | Test | Method | Pass |
|---|---|---|---|---|
| ART-01a | 1 | After the full AT suite, scan `foo.db`: every bubble's sender is the chat's owner, a member of that group, or the user. No bubble from a worker, tool or a helper outside its chats. | Auto | 0 violations |
| ART-01b | 1 | Helper result in foo's chat appears only as marker + link card, never as a copy of the helper's bubble (R-18). | Auto | — |
| ART-02a | 2 | **String scan.** Extract every UI string (resource files, card templates, toasts, tray, installer, uninstaller, shutdown reason, jump list, Narrator labels, tooltips). Case-insensitive whole-word regex over Article 2's 19 terms and their forms: `\b(api|tokens?|cli|oauth|servers?|cron|webhooks?|mcp|json|prompts?|models?|terminals?|commands?|error codes?|stack|time ?-?outs?|timed out|localhost|llms?|agent loops?)\b`. | Auto | 0 hits (the report-preview body, which shows the user's own file verbatim, is excluded and logged in `GAPS.md`) |
| ART-02b | 2 | **AI-reply post-processing.** Feed the reply pipeline 300 fixture replies that contain banned terms (in English, Hindi, Hinglish, and in Devanagari and Gurmukhi script forms such as टोकन, सर्वर, एपीआई, ਸਰਵਰ per 08-4 §25.8). Check the text that reaches the bubble, the toast and Narrator. | Auto | 0 banned terms displayed; meaning kept (spot-check 30 manually) |
| ART-02c | 2 | Render every error card kind (J1, J2, J4, J9–J13, J19.1–19.6): count primary buttons and secondary links. | Auto | exactly 1 primary, ≤ 1 link (R-03) |
| ART-02d | 2 | **Word rules (X-79, 08-0 §G.15).** Over the same extracted strings as ART-02a: flag `\btoasts?\b` anywhere on screen; flag "limit" in any string about foo's AI cap or purchase cap (allowed only for the AI plan's own usage limit, e.g. "You've hit your Claude plan's limit"); flag "Edit" as a button label on Approval and Draft cards. | Auto | 0 hits |
| ART-03 | 3 | 40 read-only requests ("check…", "find…", "look at…", "see if…", "compare…", "is there…") across tables, hotels, flights, bills. | Auto | 0 approval or payment cards, 0 submissions; options shown + "Want me to book one?" |
| ART-04a | 4 | Every Activity row with `kind='sent'` (`sent_email`, `sent_whatsapp`) has a Draft card id and an `approvals` row created before it (08-0 §G.4, §G.7). | Auto | 100 % |
| ART-04b | 4 | Approve email 1, then ask for email 2 to the same person in the same chat. | Auto | email 2 waits for its own tap (AT-055) |
| ART-05a | 5 | Connector and browser layer refuses any send, buy, book, post or delete without an APPROVED approval id (unit + integration, including a fake AI that calls the action directly). | Auto | 100 % refused |
| ART-05b | 5 | Set every permission chip to its most permissive allowed value and add every allowed "Always" rule; trigger each hard limit (address, phone, payment, irreversible, public post, new person). | Auto | every one shows a card with "I'll always ask for this one." |
| ART-06a | 6 | With an Approval card, a Payment card and a Draft card pending, send: "yes", "Yes!", "ok do it", "approve", "go ahead", "send it", "हाँ", "haan kar do", "👍", "✅"; react 👍 and ✅ on each card; answer by voice "yes". | Auto | every card stays PENDING; foo replies "Tap Approve on the card so I know it's really you." (Draft: "Tap Send on the draft so I know it's really you.") |
| ART-06b | 6 | Positive control: the same typed answers and reactions **do** answer Choice cards. | Auto | Choice cards collapse correctly |
| ART-07a | 7 | **Charge-once fault injection** on the sandbox checkout: kill foo, drop network, close window, time out the page at each of 6 points from Approve to proof. | Auto | sandbox ledger shows ≤ 1 charge per approval in every run; CHECKING when unknown |
| ART-07b | 7 | Total changes by +₹1, −₹1, late tax, currency rounding. | Auto | nothing charged; new card each time |
| ART-07c | 7 | Boundary: ₹9,999 (no Hello), ₹10,000 (Hello), Hello not set up (typed amount must match exactly; ₹10000, ₹10,000 and 10000 accepted; ₹1,000 rejected). | Auto + Manual | as stated |
| ART-08a | 8 | **Canary secrets.** Seed unique canaries as AI key, site password, card number, CVV, OTP. Run the full suite. Search every file under `%APPDATA%\foo`, logs, OCR of all screenshots and live-view frames, captured AI request bodies, toasts, crash reports, the export zip. | Auto | 0 canary hits outside Credential Manager |
| ART-08b | 8 | Paste catcher triggers on every C8 pattern and not on 200 normal messages (phone numbers, prices, dates). | Auto | 100 % caught, ≤ 1 false positive |
| ART-08c | 8 | In every AI request, secrets appear only as their names ("OpenAI key", "your IRCTC login"). Gmail text is redacted for codes before it reaches the AI (R-16). | Auto | 100 % |
| ART-09 | 9 | Inside an approved booking, force a switch to email, a new site and a new person. | Auto | a new Approval card before each switch |
| ART-10 | 10 | 40 mismatch fixtures (recipient, amount, date, item) and 40 matching ones. A separate check call is made before the action (captured). | Auto | all mismatches HELD with exact copy; all matches proceed |
| ART-11 | 11 | Every DONE job in `foo.db` has a proof object or shows "⚠ Not checked live"; fake AI claims "Booked!" with no proof. | Auto | 100 %; AT-119 |
| ART-12a | 12 | Fake AI streams "Step 3 done… step 4 done…" while the runner is idle. | Auto | badge, checklist and right shell unchanged |
| ART-12b | 12 | Freeze a step for 3 min (clock skew). | Auto | stuck card at 3:00 ± 5 s |
| ART-12c | 12 | **Face follows real state.** Fake AI streams "Done! 🎉", "I'm thinking…", "working on it" while the runner is idle and no reply request is in flight; then the runner goes WORKING with the AI silent (02 §F15.9.3a). | Auto | face stays Resting in the first case and turns Working in the second; 0 face moods without a matching runner, card, connection, composer or clock event in the face log |
| ART-12d | 12, 11 | **No unbacked joy.** DONE "⚠ Not checked live"; 5 approved bookings DONE with proof in one day; one in quiet hours; one in a group. | Auto | no Happy for the unverified job; Celebrating at most once that day, never in quiet hours or the group (Happy instead outside groups) |
| ART-12e | 12 | **Stuck face.** Freeze a step for 3 min, see the stuck card. | Auto | face shows Needs you until the card is seen, then Stuck (scan + still `--warn` arc) until it is answered |
| ART-13a | 13 | AI cap hit at ₹1,000: no further AI calls (network capture) for jobs or routines. | Auto | 0 calls; AT-083 |
| ART-13b | 13 | Purchase cap ₹25,000: payment that would pass it → `spend_cap` card (purchase row), no Payment card (R-10); right shell shows both caps always. | Auto | as stated |
| ART-13c | 13 | Loop: 3 failures in a row; cost 2× estimate. | Auto | job stops and tells the user |
| ART-13d | 13 | Purchase cap words (X-79): trigger a payment that would pass the purchase cap. | Auto | the card reads "This would go over your ₹{cap} monthly cap for purchases. Raise it?" [ Raise cap ] [ Not now ] (`cards.choice.question.purchase_cap`, 08-2 §5.10.5); the word "limit" never appears |
| ART-14 | 14 | In a group, trigger a payment, an address, a password request, a private memory fact. | Auto | none rendered in the group; "stays private" line; card in 1:1 |
| ART-15a | 15 | Export contents complete; Delete everything leaves nothing (AT-092, AT-100). | Auto | — |
| ART-15b | 15 | Network capture through all journeys: traffic only to the user's AI, connected apps and sites the user asked for, plus OpenAI (voice) and the web tools whose keys the user saved (X-43, X-46; AT-137), and the voice-pack host pinned in `resources/voice-pack.json` (`huggingface.co`, `cdn-lfs.huggingface.co`, only on the first voice note when "This PC" voice is used and the pack is not yet downloaded; F-101); none to any foo-owned host (D-38). | Auto | 0 other hosts |
| ART-15c | 15 | Memory folder opens in Explorer; every file is readable Markdown in Notepad; Privacy shows "foo never uses your data to train anything." (R-22). | Manual | — |
| ART-16 | 16 | Badge sequence for every job path matches §7.4 + SM-A1/A2/A11/A12, and every badge value is one of 08-0 §F (`seen, working, waiting, done, done_unverified, failed, stopped`; no `slow`, no `cancelled`, no ⚠); scan foo's messages for standalone acknowledgements ("ok", "okay", "on it", "sure", "will do"). | Auto | sequence exact; 0 acknowledgement messages |
| ART-17 | 17 | A 6-step job produces exactly one checklist message id, edited in place; message count in the chat rises by 1 for the checklist and 1 for the result. | Auto | as stated |
| ART-18a | 18 | Mid-job "actually make it 12–15" → "Got it, I'll fold that in." and the same job continues. | Auto | same job id |
| ART-18b | 18 | "stop", "stop that", "cancel", spoken "stop" → AT-077. User message sent during a job is answered before the next progress line. | Auto | ordering holds in 50 runs |
| ART-19a | 19 | Simulated day with 6 unprompted triggers outside quiet hours. | Auto | 3 delivered, each with "Why am I getting this?"; the rest are held (`held_items`) and appear in the next morning brief (08-3 §15.6; AT-156) (R-11) |
| ART-19b | 19 | Same triggers inside quiet hours (10:00 PM–7:00 AM). | Auto | 0 delivered; the items are held (`held_items`, `held_quiet_item`) and appear in the next morning brief (08-3 §15.6; AT-156); summary toast at 7:00 AM |
| ART-19c | 19 | Settings range for unprompted messages (`notifications.unpromptedPerDay`). | Auto | 0–3 only; `settings:set` of 4 returns `SETTING_LOCKED` (AT-156) |
| ART-20 | 20 | Dismiss each suggestion type (routine offer, connector, helper, habit, brief card kind); simulate 60 days of triggers. | Auto | never offered again; "Show dismissed suggestions" restores them |
| ART-21a | 21 | **Time scan.** Snapshot every rendered string with the pinned clock. Flag: a clock time without weekday + day + month (except bubble meta and routine-history rows, R-07); any 24-hour time; a relative word ("today", "tomorrow", "tonight", "yesterday", weekday names alone) with no absolute date beside it. | Auto | 0 flags |
| ART-21b | 21 | Change Windows region to en-US and en-GB: times follow the region but keep the day and date. | Manual | — |
| ART-21c | F10 | **Money scan.** Flag "₹" amounts without Indian grouping, "k"/"K" amounts, lakh/crore words not preceded by a full figure (R-09). | Auto | 0 flags |
| ART-22 | 22 | During any job, count foo messages between start and result. | Auto | 0 except cards, questions and the result |
| ART-23a | 23 | Ack messages ("thanks", "ok", "cool", "👍") → reaction only (AT-027). | Auto | — |
| ART-23b | 23 | Write to foo in Hindi, Punjabi (Gurmukhi), Hinglish; send a voice note. | Manual | reply in the same language and script; voice reply when voice was sent |
| ART-24a | 24 | Static scan of styles and components: no raw hex, rgb(), px, ms or font family outside the token file. Allowed literals: 0, 1px and 1.5px borders (F4), 100 %, 50 %. | Auto | 0 hits |
| ART-24b | 24 | Runtime audit: every computed colour, font size, radius and transition in the rendered app belongs to the token set (light, dark). | Auto | 100 % |
| ART-25 | 25 | State coverage: the component harness renders every component in all nine states plus its own states (C.2–C.5). | Auto | 0 missing states; screenshots filed |
| ART-26a | 26 | Automated accessibility audit (axe-core or equivalent) on every surface and state. | Auto | 0 serious or critical issues |
| ART-26b | 26 | Keyboard-only run of J1–J5, J8–J10, J12, J17, J18, J21, J22. | Manual | all complete with no mouse |
| ART-26c | 26 | Narrator script: 20 messages, every card type, every toast kind. | Manual | transcript matches C.2–C.5 "Narrator says" |
| ART-27 | 27 | C.6 checklist on Windows 10 22H2 and Windows 11. | Manual | all rows pass |
| ART-28 | 28 | §E budgets. | Auto | all pass |
| ART-29 | 29 | Airplane mode, cold start. | Auto + Manual | opens, shows all chats and memory, queues messages, one banner-strip line with one fix button (R-34.8) |
| ART-30 | 30 | Review `GAPS.md` against the code: every place the build chose a default not written in the constitution has a line. Search the code for guess markers (TODO, FIXME, "assume"). | Manual | every default logged; 0 unlogged guesses |

---

## §E Performance tests (Article 28)

E.1 Run on the reference laptop (A.6), Windows 10 and 11, release build, after a reboot, with this data set: **200 chats, 50,000 messages (one chat with 5,000), 300 memory facts, 25 routines, 8 helpers.** Each test runs 20 times; the **95th percentile** must meet the budget. Repeat PERF-01 to PERF-04 at text size 225 %.

| ID | Budget | Start → end of measurement | Pass |
|---|---|---|---|
| PERF-01 | Cold start < **2.0 s** | process start (double-click, after reboot) → chat list painted and accepting input | p95 < 2.0 s |
| PERF-02 | Typing latency < **16 ms** | keydown in composer → character painted, with the 5,000-message chat open and a job running | p95 < 16 ms |
| PERF-03 | Switch chats < **100 ms** | click or Enter on a chat row → that chat's last messages painted | p95 < 100 ms |
| PERF-04 | Scroll **60 fps** with 5,000 messages | fling from bottom to top and back, mixed bubbles, cards and images | ≤ 1 % frames over 16.7 ms; DOM message nodes bounded (virtualised list) |
| PERF-05 | Search first page < **300 ms** (J22) | last keystroke + 150 ms debounce → first results painted, at 50,000 and at 100,000 messages | p95 < 300 ms |
| PERF-06 | Stop < **1 s** (J18) | "stop" sent → last click or AI call for that job | 0 events after 1 s |
| PERF-07 | Seen badge ≤ **1 s** (C1) | send → 👀 painted | p95 ≤ 1 s |
| PERF-08 | Checklist ≤ **2 s** (J5) | job start → checklist painted (appears no earlier than 1.5 s) | 1.5 s ≤ p95 ≤ 2 s |
| PERF-09 | Taskbar overlay ≤ **2 s** (J20) | job enters NEEDS YOU → overlay shown | p95 ≤ 2 s |
| PERF-10 | Face/name update ≤ **1 s** (J3) | face tapped → chat list, header, jump list updated | p95 ≤ 1 s |
| PERF-11 | Offline shown ≤ **10 s** (J19) | network cut → WAITING + offline banner strip | p95 ≤ 10 s |
| PERF-12 | Welcome card ≤ **90 s** from Install tap (J1) | Install tapped → welcome card | p95 ≤ 90 s |
| PERF-13 | Living faces idle < **1 % CPU** (02 §F15.9.8) | chat list with 200 chats visible, every face resting, window focused, 60 s; then minimised and session locked, 60 s | average process CPU < 1 %; 0 running face animations while minimised, locked or scrolled out of view |
| PERF-14 | SQLite single-row write < **5 ms** (X-130) | one `DbOp` single-row insert/update in main → transaction committed | p95 < 5 ms |
| PERF-15 | IPC patch < **64 KB** (X-130) | any main → renderer delta patch during the E.1 data set's busiest step | p95 < 64 KB |
| PERF-16 | Main + renderer idle < **400 MB** (X-130) | app idle 60 s after PERF-01, window focused, E.1 data set | p95 resident memory (main + renderer) < 400 MB |
| PERF-17 | Engine idle < **250 MB** (X-130) | engine process idle 60 s, no job running, E.1 data set | p95 resident memory < 250 MB |
| PERF-18 | Voice transcript ≤ **3 s** per 15-s note (X-130) | end of a 15-s voice note → transcript shown | p95 ≤ 3 s |

E.2 A regression of more than 10 % on any PERF id between two builds is a P1 bug even when the budget still passes.

---

## §F Stranger test (30 minutes)

F.1 **Who.** Three testers per release candidate. Each: uses WhatsApp daily, has never seen foo, does not work in software, has a Gmail account. At least one prefers Hindi or Punjabi. Signed consent for recording.

F.2 **Setup (before the tester arrives).** Clean Windows 11 laptop (standard user). `foo-setup.exe` on the desktop. The QA build with the sandbox site pack (fake restaurants, hotels, biller, checkout with test cards and test UPI) and a test Gmail account with 3 bill emails and 1 IndiGo email. Claude signed in on the PC. Screen + audio recording on. No real money is reachable.

F.3 **Moderator rules.** Read each task card aloud exactly. Do not hint, point or explain words. The tester thinks aloud. If the tester is stuck for 2 minutes, help and mark the task **Fail**. Note every word the tester says they don't understand.

F.4 **Script.**

| # | Time | Task card (read aloud) | Pass if (all must hold) |
|---|---|---|---|
| 1 | 0:00–3:00 | "Install the app on the desktop and open it." | Installed with no admin prompt and no help; welcome card seen |
| 2 | 3:00–6:00 | "Get it ready to chat." | Reaches "✓ Using Claude (your AI)" unaided |
| 3 | 6:00–8:00 | "Give it a name and a face you like." | Name and face set; tester can say where they changed |
| 4 | 8:00–12:00 | "Let it read your email. Skip anything you don't want." | Gmail connected; tester skipped or completed WhatsApp knowingly; summary confirmed |
| 5 | 12:00–14:00 | "Ask it to find your bills." | Result with proof seen; tester can say what "Proof" means in their own words |
| 6 | 14:00–16:00 | "Ask it something by speaking, not typing." | Voice note sent and answered |
| 7 | 16:00–20:00 | "Ask it to book a table for 4 on Saturday at 8 at an Italian place. Before you tap anything, tell me what will happen." | Tester correctly states place, date, time, people, no-show fee and cancel time from the Approval card; then taps "Not now"; **nothing booked** (sandbox ledger) |
| 8 | 20:00–23:00 | "Ask it to book a hotel in Goa under ₹8,000 a night. When it asks you to pay, tell me how much and how many times you'll be charged. Then type yes in the chat." | Tester states the total and "once"; typing "yes" **does not** pay and foo asks for a tap; tester then taps "Not now"; **₹0 charged** |
| 9 | 23:00–25:00 | "Start another booking, watch what it's doing, then stop it." | Watch live opened; stopped; tester can say what was and wasn't done |
| 10 | 25:00–27:00 | "Find out what it knows about you and make it forget one thing." | Fact forgotten; tester found "You said / I guessed" |
| 11 | 27:00–29:00 | "Find the monthly spending cap, and set quiet hours to start at 11 PM." | Both found; quiet hours changed |
| 12 | 29:00–30:00 | Close the window. Moderator triggers a choice from the sandbox. "Answer it without opening the app." | Answered from the toast; tester knew foo was still running |

F.5 **After the tasks (2 questions, recorded).** (a) "Was there any word you didn't understand?" (b) "Would you let it book something real for you? Why or why not?"

F.6 **Scoring.** A tester **passes** with ≥ 11 of 12 tasks and passes on tasks 7, 8 and 9 (safety tasks, no exceptions). The build **passes** the stranger test when 3 of 3 testers pass, no tester saw money move, and no tester reports a word from Article 2's list. Every other word a tester didn't understand goes into `GAPS.md` as a copy issue (P1).

---

## §G Evidence to collect

G.1 Evidence lives in `qa-evidence/{build}/` and is attached to the release. It MUST contain only test accounts and canary data; a frame that shows a real secret or a canary outside its box is itself a **P0 failure** (Article 8).

| # | Evidence | Format and naming | Covers |
|---|---|---|---|
| G.2 | **Screenshot per state** of every surface in C.2–C.5: light, dark, high contrast, text 225 %; plus display scale 100 % and 300 % for window, chat list, chat, Approval, Payment, Settings | PNG, `{surface}/{state}__{light|dark|hc}__t{100|225}__s{100|300}.png` | A.2.1, A.2.6–A.2.9, ART-25 |
| G.3 | **Recording per journey** J1–J30, end to end, including one branch per journey (offline, decline, expiry or error) | MP4 1080p, `journeys/J{nn}__{path}.mp4`, with on-screen clock | A.3 |
| G.4 | **Reduced-motion recording**: new message, checklist, right shell, status badge, typing (Thinking face), every living-face mood | MP4 | U-7, C.7.5 |
| G.5 | **Keyboard-only recordings**: ART-26b journeys | MP4 with key overlay | ART-26b |
| G.6 | **Narrator transcripts**: ART-26c script | text + audio | ART-26c |
| G.7 | **Test run report** with AT, ART and PERF ids, pass/fail, run time, build id | JUnit XML + HTML | §B, §D, §E |
| G.8 | **Scan reports**: banned words (ART-02a/b), tokens (ART-24a/b), times (ART-21a), money (ART-21c), canary secrets (ART-08a), network hosts (ART-15b) | JSON + summary | §D |
| G.9 | **Money ledger**: sandbox charge log per approval id for ART-07a/b/c and AT-037–AT-048, AT-082, AT-122–AT-131 | CSV | Article 7 |
| G.10 | **Performance traces** per PERF id, 20 runs, p95 table | trace files + CSV | §E |
| G.11 | **Activity-log extracts** for stop, payment and send tests (redacted) | JSONL | AT-044, AT-077 |
| G.12 | **Stranger test pack**: consent forms, screen + think-aloud recordings, scored sheets, word list | MP4 + PDF/CSV | §F |
| G.13 | **GAPS.md diff** for the release, with owners for every open P1 | Markdown | A.2.12, A.4 |
| G.15 | **Living-face set**: 18 moods × 26/40/48/96 px × light/dark/HC renders, and the tray PNGs at 16/20/24/32 × both taskbars | PNG, `face/{mood}__{size}__{light|dark|hc}.png`, `tray/{state}__{size}__{light|dark}.png` | C.7.6–C.7.8 |

G.14 A release is not signed off until a second person (not the builder) has opened every G.2 folder for the P0 surfaces (Approval, Payment, Draft, Secret box, Sign-in, Error, Toasts, Settings → Permissions [X-07]) and confirmed each state against 05/06.
