# foo v1: end-to-end user journeys (part 4 of 4)

Journeys 19 to 23, then the notification matrix and a coverage checklist. Read `journeys-1.md` first: it defines the global rules (G1–G17), shared components (C1–C17), the storage map and the job and approval state machines. Source keys map to files in `/mnt/project-files/personal-agent-re/` as listed in `journeys-1.md` §0.

---

## J19. Errors: AI offline, rate limit, spend cap, stuck loop, crash recovery

**Rule for all errors:** C16 shape: what happened, what is safe, one fix button. No codes, paths or tech words (G2). Status comes from the real process (G12). Never retry a money step silently (Tab, TAB §2). Never go quiet (Tab "I don't go quiet", TAB §5; OpenClaw "an empty final is not silence", OCL §8.7).

### 19.1 Your AI is not answering (offline / AI service down / signed out)
**Detect:** a request to the user's AI fails 2 times in a row (connection refused, no internet, service error, signed out).
**Steps:**
1. Running jobs → WAITING (state is saved; nothing is lost). Chat row pill "Paused".
2. One error card in the chat where the user is (or foo's chat if none):
   - No internet: "📡 You're offline. / Your jobs are saved. Nothing was booked, paid or sent while offline. / [ Try again ]". Also a thin bar above the composer: "Offline · I'll carry on when you're back."
   - AI service down: "😴 Claude isn't answering right now. / Your Goa job is saved at step 3. Nothing was booked or paid. / [ Try again ]" + secondary link "Use ChatGPT instead" (only if another AI passed its test in J2).
   - Signed out of the AI: "🔑 You've been signed out of Claude. / Sign in again and I'll carry on. / [ Sign in ]".
3. foo re-tests every 30 s (offline) or every 2 min (service down) for 1 hour, then every 15 min.
4. Back → one line: "Back on it. Picking up from step 3." Jobs → WORKING.
5. While waiting, new user messages are kept and get ⏳ on their bubble: "I'll answer when your AI is back." Typed messages are never lost.
**Branch:** user taps "Use ChatGPT instead" → the waiting jobs continue on ChatGPT, and foo asks once: "Keep using ChatGPT from now on?" [ Just for now ] [ Yes, switch ].
**Branch:** a Payment card that is PENDING keeps its own 10-minute timer; if the AI is down when the user taps Approve, foo still does **not** pay without the second look (G17) and says: "I need your AI back to double-check this before paying. I'll ask again when it's back." Card → EXPIRED after 10 min as usual.

### 19.2 Rate limit / plan limit reached
**Detect:** the AI says its usage limit is reached, with or without a reset time.
**Steps:**
1. Jobs → WAITING. Card: "⏳ You've hit your Claude plan's limit until 3:00 PM. / Your jobs are paused, not lost. / [ Remind me at 3:00 PM ]" + link "Use ChatGPT instead" (if available) (Perplexity pause not cancel, PPX §9.11).
2. If no reset time is known: "…until it resets. I'll check every 15 minutes."
3. At reset: auto-resume, one line "Your Claude limit reset. Back on the Goa job."
4. Plain chat while limited: if a second AI is available, foo answers short questions with it and labels the bubble "answered with ChatGPT while Claude rests" (Poke "never stop responding, degrade", POK §9.8) `[foo decision: only for plain chat, never for jobs that send/buy/book]`.
5. Near the limit (80% used, when the AI reports it): one line in the side panel "Claude plan: 80% used this week" — never a toast (Gemini quota warning, GEM §9.13).

### 19.3 Monthly AI spend cap hit (key-based AI)
**Detect:** foo's own meter (estimated cost of every AI call on a key) reaches the cap in Settings (default ₹1,000/month).
**Steps:**
1. At 80%: side panel "Spent this month ₹800 of ₹1,000 cap" turns amber; one line in foo's chat (not a toast): "You've used ₹800 of your ₹1,000 AI cap this month."
2. At 100%: all AI work stops (jobs WAITING, routines paused). Card: "🧾 You've reached this month's AI cap (₹1,000). / I've paused 2 jobs and 4 routines. Nothing was lost. / [ Raise cap ]" + link "Wait until 1 Nov".
3. Raise cap → inline editor: "New cap for October" [ ₹1,500 ] [ ₹2,000 ] [ Custom ] → "Done. Picking up where I left off."
4. The cap is a **hard stop**, not an alert (Autopilot alert-not-stop complaint, APL §9.11; Perplexity credit black hole, PPX §8).
5. Before a job that alone would cost more than 20% of the cap, the Plan card (C11) shows the estimate and "This is a big one."

### 19.4 Stuck loop
**Detect (any one):** no step finished for 3 minutes; the same step failed 3 times; the job's AI cost passed 2× its estimate; the same page visited 5 times in a row (Perplexity loop rule, PPX §9.2; Hermes stuck warning, HRM §5).
**Steps:**
1. Job → NEEDS YOU. Badge ⚠ replaces 🛠. Stuck card (ChatGPT blocker brief shape, GPT §9.8):
   ```
   ⚠ I'm stuck on the Goa job
   What's wrong   MakeMyTrip keeps sending me back to the search page
   Spent so far   about ₹6 of your AI · 9 minutes
   What I'd do    try Booking.com instead
   [ ★ Try another way ]   [ Take over ]   [ Stop ]
   ```
2. Try another way → new route, counters reset; if stuck again on the new route → only [ Take over ] [ Stop ].
3. Stop → FAILED with "Stopped. Nothing was booked or paid. Here's what I found before I got stuck:" + any partial results.
4. No answer for 15 min → FAILED automatically (fail closed, Hermes, HRM §9.2) with the same report and toast.
5. foo writes a site note: `sites\makemytrip.com.md` "search loop on {date}" (Instinct site notes, INS §5.7).

### 19.5 Crash recovery (app crash, Windows restart, power cut)
**Steps:**
1. On next launch, foo reads every `jobs\*\state.json` that was not DONE/FAILED/CANCELLED.
2. For each, one recovery card in its chat:
   ```
   🔁 I closed unexpectedly at 9:42 AM.
   Goa stay was at step 3 of 4. Nothing was paid.
   [ Pick up where I left off ]   [ Stop it ]
   ```
   - If the job was mid-payment (approval RUNNING): it goes to CHECKING first and the card says "I was in the middle of paying ₹14,600. Checking whether it went through before anything else." Never re-submitted.
   - If the job had sent something: listed from the activity log: "The email to Rakesh was sent at 9:14 AM."
3. Approval cards that expired while foo was closed → EXPIRED with the normal copy.
4. Missed routines → one catch-up run each (J14).
5. If foo crashes 3 times within 10 minutes of launch: safe mode — all jobs and routines held, card "foo had trouble starting. I've paused everything so nothing runs twice. [ Start normally ] [ Send a report ]". "Send a report" shows the exact redacted file first: "This is what will be sent. It has no messages, keys or passwords." [ Send ] [ Don't send ] `[foo decision]`.
6. A pending message the user typed before the crash is restored into the composer (Grok drafts saved per conversation, GRK2).

### 19.6 Other errors (one line each)
| Error | Card copy | Button |
|---|---|---|
| App connection expired (Gmail) | "🔌 Your Gmail connection expired. / Bills and drafts are on hold." | [ Reconnect ] |
| WhatsApp unlinked | "💬 WhatsApp unlinked foo. / I can't read or send WhatsApp messages until you link again." | [ Link again ] |
| Site blocks foo | "🚫 {site} won't let me in. / Nothing was booked." | [ Open the page myself ] |
| File too big / wrong type | "That file is too big. I can take up to 25 MB." | none |
| Disk nearly full (< 500 MB) | "💾 Your PC is almost out of space. / I've stopped saving screenshots." | [ Open storage settings ] |
| Clock wrong (> 5 min off) | "⏰ Your PC's clock looks wrong. / Reminders could fire at the wrong time." | [ Fix the clock ] |
| Browser missing/broken | "🌐 I can't open my browser. / Web jobs are on hold." | [ Repair foo ] |
| Update failed | "foo couldn't update. You're still on {version} and everything works." | [ Try again ] |
| Unknown | "Something went wrong on my side. / Nothing was booked, paid or sent." | [ Try again ] |
"Nothing was booked, paid or sent" is only shown when the activity log confirms it; otherwise the card lists what was done.

### Stored
- `jobs\{id}\state.json` written after every step (atomic write) for recovery.
- Activity log entries for every pause/resume/stop with reason.
- `logs\app-*.log`: error class and time, redacted; kept 14 days.
- Spend meter: `settings.json → spend.{yyyy-mm}`.

### Notifications
| Error | Toast? | Badge |
|---|---|---|
| AI offline > 5 min while a job waits | "{foo} · Claude isn't answering. Your jobs are paused, not lost." | none |
| Plan limit | toast only if a job is waiting | none |
| Spend cap hit | "{foo} · You've reached this month's AI cap. 2 jobs paused." [ Raise cap ] | yellow |
| Stuck | "{foo} · I'm stuck on the Goa job." [ Open ] | yellow |
| Crash recovery | none (shown on launch) | yellow if any card waits |

### Acceptance criteria
- **Given** the internet drops mid-job, **then** within 10 s the job shows WAITING, the composer bar says "Offline", and when the internet returns the job resumes from the same step without re-doing finished steps.
- **Given** foo crashes after the Pay click and before proof, **then** on relaunch the payment is not re-submitted and the card says it is checking.
- **Given** the spend cap is reached, **then** no further AI call is made for jobs or routines until the cap is raised or the month changes.
- **Given** the same step fails 3 times, **then** a stuck card appears with cost so far and three buttons, and the job does not keep trying on its own.
- **Given** any error card, **then** it has exactly one primary button and no technical words.

Sources: OpenClaw runaway cost, stuck queues, terminal-command errors (OCL §8.1, §8.6, §8.7); Perplexity silent credit burn and pause-not-cancel (PPX §8, §9.2, §9.11); Tab honest failure and gap reporting, submit once (TAB §2, §5, §9.7); ChatGPT "says it's working when it isn't" and blocker brief (GPT §8, §9.8, §9.11); Hermes stuck warning and fail closed (HRM §5, §9.2); Poke degrade don't stop (POK §9.8); Autopilot hard caps (APL §9.11); Gemini quota warning (GEM §9.13); Manus todo.md as recovery state (MNS §2).

---

## J20. Notifications when the window is closed (toast, taskbar badge, tray)

**Rule:** closing the window does not quit foo. foo lives in the tray and keeps running jobs and routines (Autopilot taskbar/tray, APL §9.1, §9.2, §9.15; OpenClaw Windows tray app, OCL §5.6).

### Steps (first close)
1. User clicks ✕ for the first time. A one-time card in a small dialog: "foo keeps working in the background so it can do your jobs and morning brief. You'll find me here ↘ (tray)." [ Got it ] [ Quit foo instead ]. Checkbox "Don't show again" (ticked).
2. Tray icon: foo's face. Tooltip states: "foo · all quiet", "foo · 2 jobs running", "foo · 1 thing needs you".

### Tray menu (right-click)
- "Open foo"
- "Needs you (1)" → opens the first waiting card
- "Doing now: Goa stay · step 3 of 4" (one line per running job, up to 3)
- "Pause routines for 1 hour" / "Resume routines"
- "Quiet until tomorrow 7:00 AM" (= quiet hours now)
- "Stop everything" (J18 confirm)
- "Quit foo" → if jobs are running: "Quit foo? 2 jobs are running. They'll pause and pick up when you open foo again. Nothing will be paid while foo is closed." [ Quit ] [ Keep running ]

### Taskbar button (when the window is open or pinned)
- Overlay badge: **yellow "!"** when anything is NEEDS YOU; **green ✓** for 30 min after a job is DONE (cleared when the window is focused); none otherwise (Autopilot badge colours, APL §9.1).
- Progress bar on the taskbar button while jobs run (indeterminate when no step count).
- Jump list: "Needs you (2)", "New message", "Stop everything".

### Toasts
Format: app = foo; title = chat name ("foo", "Trips", "Money", "Goa trip · Trips"); face = that chat's avatar; body = one line, no secrets; at most 2 buttons.

| Event | Body | Buttons | Button behaviour |
|---|---|---|---|
| Choice needed | "Which flight time works for Delhi on Friday?" | [ {Best fit option} ] [ Open ] | Best-fit button answers the card directly (Choice cards are not gated, G16) |
| Approval (send / book / post / delete) | "Send this email to Rakesh? Can't be unsent." | [ Approve ] [ Open ] | Approve = the same tap as on the card **only** for non-hard-limit approvals; hard-limit ones show [ Review ] [ Not now ] |
| Payment | "Pay Airtel ₹1,179 from your saved UPI?" | [ Review ] [ Not now ] | Review opens a small always-on-top receipt window with the full Payment card (and Windows Hello if big). Payments are never approved by a toast button alone `[foo decision: reconciles the blueprint's toast with Autopilot's "never auto-approve payments from the toast", APL §9.2]` |
| Sign-in needed | "IRCTC needs you to sign in." | [ Open ] | Opens the sign-in window directly |
| Job done | "Booked: Taj Holiday Village, 12–14 Dec. ₹14,600 paid." | [ Open ] | — |
| Routine fired | "BTC dropped to ₹54.8 lakh." | [ Open ] | — |
| Morning brief | "Good morning. 3 things today." | [ Open ] | — |
| Stuck / error | "I'm stuck on the Goa job." | [ Open ] | — |
| Reply in chat | first line of the reply | [ Reply ] | Reply = inline text box in the toast (Windows quick reply) (Autopilot reply-from-toast, APL §9.2) |

Rules:
- No toast if foo's window is focused on that chat; a soft sound only (Gemini de-dupe, GEM §9.12).
- Quiet hours (default 10:00 PM to 7:00 AM): toasts held and delivered as one summary at the end: "While you were away: 1 thing needs you, 2 jobs done." Exceptions: none by default; the user can mark a routine "Urgent: notify even in quiet hours".
- Windows Focus / Do not disturb is respected; foo adds nothing on top.
- Expiring approvals: if a Payment card will expire within 2 min and the user hasn't seen it, no extra toast (avoid pressure) `[foo decision]`.
- Max 1 toast per chat per 2 minutes; extra events merge: "Trips · 3 updates".
- Every unprompted toast (not a reply to the user, not a job they started) counts toward the 3-per-day budget (G13).

### Branches
| Case | What happens | Exact copy |
|---|---|---|
| Windows notifications off for foo | Settings → Notifications shows a bar | "Windows is blocking foo's notifications. You might miss approvals. [ Turn them on ]" |
| PC locked | Toasts queue in Action Center; no content on lock screen beyond "foo · 1 thing needs you" `[foo decision: privacy]` | — |
| User clicks a toast for an approval that already expired | Opens the chat at the expired card | "This expired at 9:58 AM. Nothing was paid. [ Ask me again ]" |
| foo not running (quit) at routine time | Nothing runs; on next open: catch-up per J14 | — |
| PC going to sleep while a job runs | foo asks Windows to stay awake only while a job is WORKING (never for routines) and shows the tray tooltip "Keeping your PC awake for 1 job" (Autopilot "never block sleep silently", APL §9.15) | — |
| Shutdown with jobs running | Windows shutdown screen lists "foo: 1 job running" with foo's reason line "Finishing the Goa job" | — |

### Stored
- `settings.json → notifications` (quiet hours, per-chat mute, toast on/off per kind).
- Toast history is Windows' own; foo keeps nothing extra.

### Acceptance criteria
- **Given** the window is closed and a Payment card appears, **then** a toast with [ Review ] [ Not now ] appears, and pressing Review opens the receipt window; there is no way to pay from the toast alone.
- **Given** a job enters NEEDS YOU, **then** the taskbar badge turns yellow within 2 s and clears when nothing waits.
- **Given** quiet hours, **then** no toast sounds until they end, followed by one summary toast.
- **Given** the user quits foo with running jobs, **then** the jobs are saved as WAITING and resume on next open.
- **Given** a toast body, **then** it never contains a full email address of a third party, an OTP, a card number or a key.

Sources: blueprint "Windows toasts and taskbar badges"; Autopilot taskbar badge colours, toasts with Approve/Deny, tray, sleep (APL §5, §9.1, §9.2, §9.15); Gemini notification de-dupe and Halo strip (GEM §9.9, §9.12); Hermes desktop pet "your turn" (HRM §9.14); OpenClaw tray app, active hours (OCL §2.6, §5.6); ChatGPT one "waiting on you" inbox (GPT §9.10).

---

## J21. Settings: app permissions, spend cap, quiet hours, privacy, export/delete data

**Open:** gear icon at the bottom of the chat list, Ctrl+, , tray menu → Open foo → gear. Settings is a full-height panel replacing the side panel, with a search box at the top "Search settings". The user can also change any setting by asking foo in chat ("turn off voice replies"); foo answers with the changed row as a mini card and an Undo (OpenClaw settings by conversation, OCL §9.14).

### Sections and exact rows
1. **Your AI**
   - "Using: Claude (your AI) · ✓ works · checked 2 min ago" [ Change ] [ Test now ]
   - "Backup AI: ChatGPT" [ Change ] [ None ]
   - "Cost: uses your Claude plan" or "Cost: uses your OpenAI key"
2. **What foo can do on its own** (ChatGPT four-level dial, GPT §9.1)
   One row per action, each with 4 chips: **Do it** · **Do it when I say** · **Ask me** · **I'll do it**
   | Action | Default | Locked? |
   |---|---|---|
   | Read emails, calendar, chats | Do it | — |
   | Write drafts | Do it | — |
   | Add to my calendar | Do it when I say | — |
   | Send emails and messages | Ask me | can't be set to "Do it" |
   | Book things | Ask me | can't be set to "Do it" |
   | Pay | Ask me | locked: always Ask me |
   | Post in public | I'll do it | locked in v1 |
   | Delete things | Ask me | can't be set to "Do it" |
   | Share my address or phone | Ask me | locked: always Ask me |
   Footer: "Some things always ask, even if you say 'Always': paying, sharing your address or phone, and anything that can't be undone." (G5)
   "Rules I follow" list below, each removable: "Send emails to Rakesh without asking · added 16 Oct · Remove" (Muse settings-backed rules, MUS §9.14).
3. **Apps** (per app permission; Autopilot connectors page, APL §9.14)
   - Gmail · v***@gmail.com · "Read and draft" / "Read, draft and send" · [ Disconnect ] · "Add another account"
   - Calendar · "See and add events" · [ Disconnect ]
   - WhatsApp · "Linked · +91 98••• ••210" · "Read chats" toggle · "Draft messages" toggle · [ Unlink ]
   - Browser · "Signed-in sites (6)" → list with Sign out per site
   - Per-helper app access is on each helper's profile (J15).
   - Disconnect confirm: "Disconnect Gmail? I'll stop reading it. What I already learned stays unless you forget it in Memory." [ Disconnect ] [ Cancel ]
4. **Folders** (Autopilot/Cowork folder grants, APL §9.3, CWK §9.4): "foo can use these folders" list, each "Always / Ask every time / Never" (default Ask) + [ Add folder ]. Output folder: "{path}" [ Change ]. Deleting files always shows a red card: "Delete 14 files? They won't go to the Recycle Bin." foo prefers moving to a `_to_delete` folder.
5. **Money and payments**
   - "Saved cards: Visa ••4242 (default) · Remove" [ Add a card ] (Secret box)
   - "UPI ID: vik•••@okhdfc" [ Change ]
   - "Confirm with Windows Hello for payments over ₹10,000" [ ₹ field ] (cannot be turned off; can be lowered to ₹0 = every payment)
   - "Payments this month: ₹15,779 · See all" → list from the activity log
6. **AI spend**
   - "Spent this month ₹2,140 of ₹10,000 cap" bar (key-based AI only; example of a user who raised the cap)
   - "Monthly cap" [ ₹ ] (min ₹100; default ₹1,000) · "Warn me at 80%" (on)
   - "Each routine's cost" → list (J14)
7. **Notifications and quiet hours** (J20): Toasts on/off per kind; "Quiet hours 10:00 PM – 7:00 AM" with day picker; "Morning brief time 8:00 AM"; "Unprompted messages per day: up to 3" (1–5); per-chat mute in each chat's header.
8. **Chat and voice**: "Voice replies: When I send voice / Always / Never"; "Hold to talk key: Ctrl+Space" [ Change ]; "Talk style: Calm, a bit funny" [ Change ]; "Show status on my messages" (on).
9. **Privacy**
   - "Learn about me from chats" (on) · "Ask before remembering" (off) (J17)
   - "Keep job screenshots for 7 days" (1 / 7 / 30 days / Don't keep)
   - "Keep voice notes for 30 days"
   - "Show dismissed suggestions" [ Show ]
   - "What leaves this PC": "Your messages and job details go to your AI (Claude). Sites you ask me to use see what you'd send them yourself. Nothing else leaves this PC." (Plain statement; foo has no cloud of its own in v1 `[foo decision from the blueprint "Your Windows PC, your own AI"]`.)
   - "Activity log" → searchable list of every send, buy, book, post, delete, with export (Autopilot audit log, APL §9.7).
10. **Your data**
    - "Export everything" → picks a folder → writes `foo-export-{date}.zip` containing chats (HTML + JSON), memory files, routines, activity log, output files. Keys, passwords and cards are **never** exported. Progress: "Exporting… 40%"; done: "Saved to {path}. Keys and passwords aren't included." [ Show in folder ]
    - "Delete chats older than…" [ 30 days / 90 days / 1 year ] → confirm.
    - "Forget everything I know about you" (→ J17 typed confirm).
    - "Delete everything" (→ J23 wipe, without uninstalling).
11. **About**: version, "What's new with me" (foo's own first-person changelog, Tab, TAB §9.5), [ Check for updates ], "Send a report" (redacted preview first).

### Branches
| Case | What happens | Exact copy |
|---|---|---|
| User tries to set "Pay" to "Do it" | Chip disabled; tooltip | "I'll always ask before paying." |
| Cap set below what's already spent | Applies now; jobs pause | "You've already spent ₹2,140 this month, so I'll pause AI work until 1 Nov or until you raise the cap." |
| Disconnect an app a routine needs | Warning in confirm | "Your 'Airtel bill' routine uses Gmail. It will stop working." |
| Export while jobs run | Allowed; export is a snapshot | — |
| Settings search finds nothing | "Nothing called that. Try asking foo in the chat." | — |
| Changing a setting by chat that is locked | foo explains | "Paying always needs your tap. That one can't change." |

### Stored
- `settings.json` (every row). Rules in `settings.json → rules[]`. Activity log entries for permission changes ("changed Send emails to Ask me").

### Notifications
None (settings changes are silent). Turning notifications off for a kind shows a one-line warning under the toggle: "You might miss approvals."

### Acceptance criteria
- **Given** "Pay" or "Share my address or phone", **then** no chip other than "Ask me" can be selected.
- **Given** "Export everything", **then** the zip contains chats, memory, routines and the activity log, and searching it for any saved key or card value finds nothing.
- **Given** the user disconnects Gmail, **then** foo makes no further Gmail requests and the side panel "Using" drops Gmail.
- **Given** "turn off voice replies" typed in chat, **then** the setting changes and foo shows the changed row with Undo.
- **Given** the Windows Hello threshold is set to ₹0, **then** every payment requires Windows Hello.

Sources: ChatGPT custom rules four behaviours and fixed rules (GPT §5, §9.1); Muse scope, revocable grants and settings-backed rules (MUS §9.2, §9.14); Autopilot folder permissions, connectors page, audit log, hard caps (APL §9.3, §9.7, §9.11, §9.14); Cowork folder grant and delete gate (CWK §9.4, §9.5); OpenClaw settings by conversation (OCL §9.14); Tab first-person changelog (TAB §9.5); Perplexity on-device approval (PPX §9.9); Manus signed-in accounts list (MNS §4).

---

## J22. Search

**Open:** Ctrl+K anywhere, or the "Search chats" box at the top of the chat list (Grok Ctrl+K palette, GRK2 Other screens).

### Steps
1. A palette opens over the window: input "Search chats, messages, files, routines, memory, settings", with recent searches below.
2. Results appear as the user types (after 2 characters, 150 ms debounce), grouped in this order, max 5 per group with "See all":
   - **Chats & helpers** ("Trips", "Family group")
   - **Messages** — snippet with the match in bold, chat name, date; Enter opens the chat scrolled to that message, highlighted for 2 s
   - **Jobs** — "Goa stay · Done · 16 Oct" (opens the job's checklist and proof)
   - **Files** — files foo made or received: name, type icon, [ Open ] [ Show in folder ]
   - **Routines** — "BTC below ₹55 lakh · On"
   - **What I know** — matching memory facts (edit/forget inline)
   - **Settings** — "Quiet hours" (opens that row)
3. Filter chips under the input: [ All ] [ Messages ] [ Files ] [ Jobs ] [ Routines ] [ Memory ] [ Settings ].
4. Keyboard: ↑ ↓ to move, Enter to open, Esc to close, Ctrl+Enter = "Ask foo about this" (sends the query to foo as a question: "What did I book in Goa?" → foo answers using search results and cites them).
5. Search runs locally over `foo.db` and the memory/routine files (SQLite full-text) — never sends the query to the AI unless Ctrl+Enter (Hermes FTS search without AI summary, HRM §7) `[foo decision: privacy and speed]`.
6. Chat list "Search chats" box filters the list by chat name and last message, plus the filter chips All · Needs you · Working · Done (blueprint filter chips; Gemini Ready / Needs attention / In progress, GEM §9.1).
7. In-chat search: Ctrl+F inside a chat → "Find in this chat" bar with ↑ ↓ and match count.

### Branches
| Case | What happens | Exact copy |
|---|---|---|
| No results | — | "Nothing found for '{query}'. [ Ask foo instead ]" |
| Query looks like a secret (paste of a key) | Not stored in recent searches; no results shown from secrets (they aren't in the index) | — |
| Result is in a deleted chat | Not shown | — |
| Memory result | Shows source tag | "Prefers window seats · I guessed" |
| Very large history (> 100k messages) | Results still < 300 ms for first page | — |

### Stored
- Last 10 searches in `settings.json` (can be cleared: "Clear recent").
- Search index inside `foo.db` (full-text table). Secrets are never indexed because they are never stored.

### Notifications
None.

### Acceptance criteria
- **Given** 50,000 messages, **when** the user types "taj", **then** first results show within 300 ms, grouped as specified.
- **Given** Enter on a message result, **then** the chat opens scrolled to that message with a 2 s highlight.
- **Given** a plain search, **then** no request is sent to the AI.
- **Given** Ctrl+Enter, **then** foo answers in its chat and cites the messages or files it used.

Sources: Grok Ctrl+K palette across bots, messages, files, routines, settings (GRK2); Gemini status filter (GEM §9.1); Hermes local full-text session search (HRM §7); Grok per-contact Library (GRK §5.11); Cowork files shelf (CWK §9.6).

---

## J23. Uninstall and data wipe

**Two entry points:**
- A. **Delete everything** inside foo (Settings → Your data): wipes data, keeps the app, returns to J1's welcome card.
- B. **Uninstall** from Windows Settings → Apps → foo → Uninstall (or Start → right-click foo → Uninstall).

### Steps (B: uninstall)
1. Windows starts foo's uninstaller, which shows:
   ```
   Uninstall foo
   What should happen to your foo data?
   ( ) Keep my data on this PC        Chats, memory and settings stay, in case you reinstall.
   (●) Delete everything              Chats, memory, routines, saved logins, cards and keys are erased.
                                     Your Gmail, Calendar and WhatsApp connections are disconnected.
   [ Uninstall ]   [ Cancel ]
   ```
   `[foo decision: default is Delete everything, since secrets would otherwise outlive the app]`
2. If jobs are running: "2 jobs are still running. Uninstalling stops them. Nothing will be paid." [ Stop and uninstall ] [ Cancel ].
3. If "Delete everything", a final line: "This can't be undone. Want a copy first? [ Export everything ]" (runs J21 export, then continues).
4. Uninstall runs (progress bar: "Removing foo…"), in this order:
   1. Stop all jobs (CANCELLED, approvals WITHDRAWN) and routines.
   2. Revoke app connections with each provider where possible (Google: revoke access; WhatsApp: log out the linked device; Microsoft: revoke).
   3. Delete every Credential Manager entry starting with `foo/` (AI keys, logins, cards, connection tokens).
   4. Delete `%APPDATA%\foo\` (chats, memory, helpers, jobs, screenshots, voice notes, logs, browser profile with its cookies, settings).
   5. Remove startup entry, Start menu shortcut, notification registration, jump list, scheduled wake entries.
   6. Leave **output files** in `Documents\foo\` untouched (they are the user's documents) and say so.
5. Done screen: "foo is removed. Your files in Documents\foo were kept. Your Claude and ChatGPT accounts are untouched." [ Close ]
6. If "Keep my data": steps 4.1, 4.5 only; data and secrets remain; done screen: "foo is removed. Your data is kept on this PC. Reinstall foo to pick up where you left off." and reinstall resumes with all chats, skipping J2–J5 if the AI still passes its test.

### Steps (A: Delete everything, inside foo)
1. Settings → Your data → "Delete everything".
2. Confirm sheet: "Delete everything foo has on this PC? Chats, memory, routines, helpers, saved logins, cards and keys. Your Gmail, Calendar and WhatsApp will be disconnected. Files in Documents\foo stay. This can't be undone." Type DELETE to confirm. [ Delete everything ] [ Cancel ]
3. Same wipe as B.4 steps 1–4; then foo restarts at J1's welcome card.

### Branches
| Case | What happens | Exact copy |
|---|---|---|
| Offline during uninstall (can't revoke Google access) | Local wipe still happens; done screen adds a line | "I couldn't reach Google to disconnect foo. You can remove it yourself at myaccount.google.com → Security → Third-party access." |
| A file is locked (foo's browser still open) | Uninstaller closes foo's browser and retries 3 times | If still locked: "A few foo files are in use. They'll be removed when you restart your PC." |
| Credential Manager entry can't be deleted | Listed by name only | "I couldn't remove 1 saved item: 'foo/login/irctc.co.in'. Remove it in Credential Manager." [ Open Credential Manager ] |
| Uninstall cancelled | Nothing changes | — |
| User reinstalls after Keep my data | J1 → foo detects data → "Welcome back, {Vikas}. Everything's where you left it." | — |

### Stored after completion
- Delete everything: nothing from foo on the PC except Documents\foo output files and Windows' own event log of the uninstall.
- Keep my data: `%APPDATA%\foo\` and `foo/…` credentials remain.

### Notifications
None (foo is gone). No "sorry to see you go" toast.

### Acceptance criteria
- **Given** Delete everything, **then** after uninstall there is no `%APPDATA%\foo` folder and no Credential Manager entry starting with `foo/`.
- **Given** Delete everything while online, **then** the Google connection is revoked and the WhatsApp linked device is logged out.
- **Given** Keep my data and a reinstall, **then** chats, memory and routines reappear and setup is skipped if the AI test passes.
- **Given** files in Documents\foo, **then** uninstall never deletes them.
- **Given** running jobs, **then** the uninstaller warns and states that nothing will be paid.

Sources: ChatGPT reset wipes everything and "deleting doesn't recall sent messages" (GPT §4, §5); Tab remove card closes open links (TAB §4); Manus logged-in accounts and clear all (MNS §4); Grok secrets survive resets separately (GRK §1.2); Cowork/Gemini outputs as real files the user owns (CWK §9.6, GEM §9.10); Autopilot quit and tray (APL §9.15).

---

## Appendix A. Notification matrix (all journeys)

| Event | In-chat | Chat-list pill | Toast (window not focused, outside quiet hours) | Taskbar | Tray tooltip |
|---|---|---|---|---|---|
| Job started by user | badge 👀→🛠, checklist | "Working" | — | progress bar | "{n} jobs running" |
| Choice needed | Choice card | "Needs you" | yes, best-fit + Open | yellow ! | "1 thing needs you" |
| Approval needed | Approval card | "Needs you" | yes, Approve/Open (Review/Not now for hard limits) | yellow ! | same |
| Payment needed | Payment card | "Needs you" | yes, Review/Not now | yellow ! | same |
| Sign-in / take over | Sign-in card | "Needs you" | yes, Open | yellow ! | same |
| Job done | result + proof | "Done" (fades after 24 h) | yes, Open | green ✓ 30 min | — |
| Job failed / stuck | error / stuck card | "Needs you" (stuck) or none (failed) | yes, Open | yellow ! (stuck only) | — |
| Routine fired | message | unread count | yes, Open (if routine says toast) | — | — |
| Routine silent run | nothing | — | — | — | — |
| Morning brief | brief message | unread count | yes, Open | — | — |
| Helper reply | message | unread count | yes, Reply | — | — |
| AI offline / limit / cap | error card + composer bar | "Paused" | only if a job waits (cap: always) | yellow if cap | "Paused: {reason}" |
| Crash recovery | recovery card | "Needs you" | — | yellow ! | — |
| Approval expired | collapsed card | — | — | badge cleared if nothing else waits | — |

## Appendix B. Coverage checklist (what the brief asked for → where)

| Asked for | Where |
|---|---|
| Install and first launch | J1 |
| Finding/connecting the user's AI (CLI or key via secret box; detect + verify) | J2, C7, C8 |
| Naming foo, avatar, vibe | J3 |
| Interview + Gmail/Calendar/WhatsApp | J4, C10 |
| First real task inside a minute | J5 |
| Morning brief and feedback | J6 |
| Casual chat incl. voice note in/out | J7 |
| Question with choice chips | J8, C3 |
| Restaurant booking | J9 |
| Hotel booking with payment approval | J10, C5 |
| Bill reminder + payment | J11 |
| Drafting and sending an email/X post | J12, C6 |
| Login handoff (sign in here / OTP / CAPTCHA / take over) | J13, C9 |
| Routines create/edit/pause | J14, C13 |
| Helpers and handoffs | J15, C15 |
| Group chat with a helper | J16 |
| Memory view/edit/forget | J17, C14 |
| Watch live and stop | J18 |
| Errors: AI offline, rate limit, spend cap, stuck loop, crash recovery | J19 |
| Notifications when window closed (toast, badge, tray) | J20, Appendix A |
| Settings (permissions per app, spend cap, quiet hours, privacy, export/delete) | J21 |
| Search | J22 |
| Uninstall/data wipe | J23 |
| Branches: yes/no/cancel/timeout/error/offline/AI not available/site blocked/payment declined/price changed/login needed/2FA | every journey's Branches table; price changed J9/J10/J11; payment declined J10/J11; site blocked J9/J10/J19.6; 2FA J10/J13 |
| Job state machine (queued → working → needs you → done/failed/cancelled) | `journeys-1.md` §4 |
| Approval card state machine | `journeys-1.md` §5 |
| Stored (memory, secrets, logs) per journey | each journey's "Stored"; master map `journeys-1.md` §3 |
| Acceptance criteria (Given/When/Then) | each journey |
| Credit to source app with file path | each pattern inline + Sources line per journey; key table `journeys-1.md` §0 |
