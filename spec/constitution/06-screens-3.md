# 06 · Screens, part 3 of 3: activity, spend, watch live, search, viewer, confirms, Hello, updates, crash, shortcuts

Read `06-screens.md` §0 first. Behaviour owned by 09 (`09-windows.md`: Hello §9.19, updates §9.20, crash and safe mode §9.21, tray and first close §9.8, shortcuts §9.17) is referenced, not repeated; 06 draws the screens those sections name. Cards are 05 (`05-cards-1.md`, `05-cards-2.md`, `05-cards-3.md`).

---

## §9. Activity log

### 9.1 Purpose and entry
One honest list of everything foo did that touched the outside world or the user's data: sent, paid, booked, posted, deleted, connected, signed in, permission changes, stops, forgets; each with who approved it and the proof (Article 11, 15; APL §9.7; AGT A15). Read from the DB `activity` table (08-0 §G.4, X-62; the `{DATA}\activity.jsonl` mirror is only for rebuild and export), never from the AI's words (Article 12), through `activity:list { kind?, actor?, chatId?, jobId?, from, to, q?, beforeAt?, limit } → { rows: ActivityRow[]; more }` (X-124); the page's filters map 1:1 (Kind chip → `kind`, Who → `actor`, When → `from`/`to`, Search → `q`, a chat filter → `chatId`; lazy months page with `beforeAt`). **Entry:** left shell ⋯ menu → "Activity log"; right shell Doing now "See all ({n})" (filtered to that chat; foo's chat: unfiltered, 03 §3.7.3.1); Settings → Privacy → "Activity log"; Settings → Money → "Paid this month" (filter Paid, this month); helper profile "See what {Trips} did"; a proof chip's ⋯ → "See in activity log"; Ctrl+H.

### 9.2 Layout (Page)
```
┌─ page header 60 ─────────────────────────────────────────────────────────────────────────────┐
│ [←]  Activity log                         [⌕ Search activity        ]  [ Save the log ]        │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ content column (max 760)                                                                     │
│ ( All ) ( Sent ) ( Paid ) ( Booked ) ( Deleted ) ( Connected ) ( Stopped ) ( Changed )        │ 32px chips, wrap
│ Who: [ Everyone ▾ ]   When: [ This month ▾ ]                                  Menus 32px     │
│ 16                                                                                           │
│ TODAY · THU 16 OCT                                                       section label        │
│ ┌──────────────────────────────────────────────────────────────────────────────────────────┐│
│ │ (₹) Paid ₹14,600 to Taj Holiday Village                          9:42 AM   ✓ Proof   ›  ││ row 64
│ │     Trips · approved by you with Windows Hello                                           ││
│ ├──────────────────────────────────────────────────────────────────────────────────────────┤│
│ │ (✉) Sent an email to Rakesh Sharma                               9:14 AM   ✓ Proof   ›  ││
│ │     foo · approved by you · "Just this once"                                             ││
│ ├──────────────────────────────────────────────────────────────────────────────────────────┤│
│ │ (⛔) Stopped "Delhi flights"                                      8:55 AM             ›  ││
│ │     Trips · stopped by you · nothing was booked or paid                                  ││
│ └──────────────────────────────────────────────────────────────────────────────────────────┘│
│ YESTERDAY · WED 15 OCT                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 9.3 Elements
| Element | Spec | Copy | Test id |
|---|---|---|---|
| Search | §0.4 page search, 240px; local; matches summary, payee, recipient, chat name, confirmation number | placeholder "Search activity" | `activity-search` |
| Save the log | Secondary 32 → Windows "Save as" dialog, default name `foo-activity-{Oct-2026}.csv`, calls `activity:saveCsv { folder, fileName, filter } → { path }` (X-124; UTF-8 BOM, CRLF, RFC 4180) with the rows currently filtered (time, who, what, to, amount, approved how, proof). Never includes message bodies, secrets or card numbers beyond last 4. Done: status line "Saved." + Link "Show in folder" | "Save the log" | `activity-save` |
| Kind chips | 32px single-select: All · Sent · Paid · Booked · Deleted · Connected · Stopped · Changed; each chip is one `activity.kind` value (08-0 §G.4: `sent`, `paid`, `booked`, `deleted`, `connected`, `stopped`, `changed`) | "All" "Sent" "Paid" "Booked" "Deleted" "Connected" "Stopped" "Changed" | `activity-filter` |
| Who | Menu: "Everyone", "foo", each helper | — | `activity-who` |
| When | Menu: "Today", "This week", "This month", "Last month", "Everything" | default This month | `activity-when` |
| Day label | "TODAY · THU 16 OCT", "YESTERDAY · WED 15 OCT", else "MON 13 OCT" (`--t-caption-strong`) | — | `activity-day` |
| Row | min-height 64, padding 12/16. Left: 40px disc `--bg-sunken` with Fluent icon 20 (`Send`→Mail, Money, Calendar, Delete, PlugConnected, Stop, Settings, Brain). Line 1 `--t-body` `--fg-1` (summary, built from fields, never AI text). Line 2 `--t-small` `--fg-2`: "{chat} · {how approved} · {result note}", where {how approved} comes from `approved_how` (table below). Right: time `--t-small` tabular, proof chip (05 §5.15 compact: `Checkmark` 16 + "Proof", or `Warning` 16 `--warn` + "Not checked live"), `ChevronRight` 16. | see table 9.4 | `activity-row` |
| Expanded row (Enter / click) | Expands in place (not a new page): rows "To", "From", "Amount" (tabular), "Approved" ("by you at 9:41 AM · Windows Hello" / "· typed the amount" / "· from a rule: Let Trips use Calendar without asking" [X-03: rules never cover sends]), "Proof" (confirmation number in `--t-mono` with Copy icon button; screenshot thumbnail 160×100 `--r-md` → §13 viewer; "Email from {sender}" Link → opens the email in the default mail app or browser), "Job" Link "See the job" (opens the job's chat at its checklist). | — | `activity-row-detail` |

### 9.4 Row summaries (final, built from the log fields)
Line 1 is chosen by `event` and `outcome` (08-0 §G.4, closed lists); copy key `activity.row.{event}[.{outcome}]`. Events not listed here never appear on this page (05 "Logged" lines that are not §G.4 events go to the tech log only).

| Kind (chip) | `event` | Line 1 (outcome `done`) | Line 2 example |
|---|---|---|---|
| sent | `sent_email` | "Sent an email to {Rakesh Sharma}" | "foo · approved by you · just this once" |
| sent | `sent_whatsapp` | "Sent a WhatsApp message to {Family group}" | "foo · approved by you" |
| sent | `opened_x_draft` | "Opened an X post for you to send" | "foo · you" |
| sent | `shared_personal` | "Shared your {phone number} with {irctc.co.in}" | "Trips · approved by you" |
| paid | `paid` | "Paid ₹{14,600} to {Taj Holiday Village}" · failed: "Payment to {Airtel} didn't go through" · unknown: "Checking a payment to {Airtel}" | "Trips · approved by you with Windows Hello" · failed: "Money · no money was taken" · unknown: "Money · checking your email and the site" |
| booked | `booked` | "Booked {Pizza by the Bay}, {Sun 18 Oct, 8:00 PM}" | "foo · approved by you · no charge now" |
| booked | `cancelled_booking` | "Cancelled {Pizza by the Bay}, {Sun 18 Oct, 8:00 PM}" | "foo · approved by you" |
| deleted | `deleted_files` | "Deleted {14 files} from {Downloads}" | "foo · approved by you" |
| deleted | `deleted_email` | "Deleted {3} emails" | "foo · approved by you" |
| deleted | `deleted_chats` | "Deleted {Trips} and its chat" · private chat ended (12-2 §12.30.7): "Ended a private chat" (`activity.row.ended_private_chat`) | "you" · private: "a private chat · you" |
| deleted | `deleted_messages` | "Deleted {1,240} messages in {6} chats" / "Cleared messages in {Trips}" | "you" |
| connected | `connected` / `disconnected` | "Connected {Gmail} ({v***@gmail.com})" / "Disconnected Google" | "you" |
| connected | `signed_in_site` / `signed_out_site` | "Signed in to {irctc.co.in}" / "Signed out of {irctc.co.in}" | "you" |
| connected | `saved_login` / `removed_login` | "Saved your login for {irctc.co.in}" / "Removed your saved login for {irctc.co.in}" | "you" |
| stopped | `stopped_job` | "Stopped "{Goa stay}"" | "Trips · stopped by you · nothing was booked or paid" (or "· the email to Rakesh was already sent at 9:14 AM") |
| stopped | `stopped_all` | "Stopped {3} jobs" | "you" |
| stopped | `paused_routines` / `resumed_routines` | "Paused {4} routines" / "Turned {4} routines back on" | "you" |
| changed | `permission_changed` | "Changed {Send emails and messages} to {Never}" | "you" |
| changed | `cap_changed` | "Raised your purchase cap to ₹{40,000}" / "Changed your AI cap to ₹{1,500}" | "you" |
| changed | `setting_changed` | "Changed {Calendar} to {off}" | "you" |
| changed | `rule_added` / `rule_removed` | "Added a rule: {Let Trips use Calendar without asking}" / "Removed a rule: {…}" | "you" |
| changed | `forgot_facts` | "Forgot {23} things from {Gmail}" | "you" |
| changed | `secret_saved` / `secret_replaced` / `secret_removed` | "Saved your {OpenAI key}" / "Replaced your {OpenAI key}" / "Removed your {Visa ••4242}" | "you" |
| changed | `switched_route` | "Switched {Faster search} to {this PC}" | "foo" |
| changed | `exported` | "Exported everything to {Documents › foo-export-16-Oct-2026.zip}" | "you" |

**{how approved}** from `approved_how`: `card_once` "approved by you · just this once" · `card_chat` "approved by you for this chat" · `card_always` "approved by you · always" · `rule` "from a rule: {rule text}" · `hello` "approved by you with Windows Hello" · `typed_amount` "approved by you · typed the amount" · `user` "you" · `none` (nothing shown). Outcome `failed` rows show `ErrorCircle` 16 `--bad` in place of the proof chip; `unknown` rows show "Checking" `--warn`.

**Private chats (owner Q2, default (a)).** A row whose chat is private still appears (Art. 13), but {chat} reads "a private chat" (`chat_title = 'a private chat'`, `activity.row.private_chat_label`; no names of the chat or its people), Line 1 is the event phrase with names and text removed ("Sent an email", "Sent a WhatsApp message", "Paid ₹{14,600}", "Booked something", "Deleted {14 files}"), and the expanded row shows only Amount, Approved and Proof (no To/From, no screenshot). Search never matches the hidden text.

Posting in public is not in v1 (`permissions.actions.post` = never), so no "Posted" chip or event exists.

### 9.5 States
| State | Copy |
|---|---|
| First time | Empty block, icon History 24: title "Nothing yet", body "When I send, pay, book or delete something for you, it's listed here with its proof." |
| Filter empty | "Nothing here for these filters." + Link "Clear filters" |
| Loading | skeleton rows; months load lazily as the user scrolls ("Loading September…" `--t-small` `--fg-3` at the bottom) |
| Error | 05 Error card "I couldn't read the activity log. Nothing in it was changed." [ Try again ] |
| Offline | unchanged (local); email proof links open when back online |
Rows are read-only: the log can't be edited or deleted except by "Delete everything" (§14 C-16).
**Test ids.** Root `screen-activity`; `activity-search`, `activity-save`, `activity-filter` (`data-row-id` = kind or `all`), `activity-who`, `activity-when`, day label `activity-day`, row `activity-row` (`data-row-id` = activity id, `data-state` = outcome), expanded panel `activity-row-detail`, "See the job" `activity-row-job`.
**Keyboard / Narrator.** Ctrl+H opens; Ctrl+F search; list one Tab stop; Enter expands; Ctrl+C on a focused row copies its line 1 + time. Row name: "{Paid ₹14,600 to Taj Holiday Village}, {9:42 AM}, {Trips}, {approved by you with Windows Hello}, proof available".
**Credits.** Autopilot audit log (APL §9.7); ChatGPT dots Activity (AGT A15); Tab proof (TAB §9.3); Perplexity receipt (PPX §9.3).

---

## §10. Spend

### 10.1 Purpose and entry
Show both caps and where the money went this month: AI cost (key-based AI) and purchases (Article 13). **Entry:** right shell "Spent this month" section title or "Change caps" (03 §3.7.3.4; "Change caps" goes to Settings → Money, the title opens Spend); Settings → Money → "See spending"; 05 Spend-cap card secondary link "See spending".

### 10.2 Layout (Page)
```
┌─ page header 60 ──────────────────────────────────────────────────────────────────────┐
│ [←]  Spending                                           [‹]  October 2026  [›]         │ month switcher
├────────────────────────────────────────────────────────────────────────────────────────┤
│ ┌──────────── AI ─────────────────┐ 16 ┌──────────── Purchases ──────────────┐          │ two tiles, each
│ │ ₹212                --t-title    │    │ ₹15,779               --t-title     │          │ (760−16)/2 wide,
│ │ of ₹1,000 cap       --t-small    │    │ of ₹25,000 cap                       │          │ padding 16, --r-lg,
│ │ ▬▬▬░░░░░░░░░░░░░░  4px meter     │    │ ▬▬▬▬▬▬▬▬▬▬░░░░░░░                    │          │ 1px --line
│ │ about, from your OpenAI key      │    │ 6 payments                           │          │
│ │ Change cap                       │    │ Change cap                           │          │ Link buttons
│ └──────────────────────────────────┘    └──────────────────────────────────────┘          │
│ AI BY CHAT                                                                               │
│ │ (f) foo          ▬▬▬▬▬▬▬▬▬▬▬▬▬           ₹98                                       │ │ bars 8px, --accent
│ │ (✈) Trips        ▬▬▬▬▬▬▬▬                 ₹71                                       │ │
│ AI BY ROUTINE                                                                            │
│ │ BTC below ₹55,00,000 (55 lakh)   Every 30 min                                      ₹24            │ │
│ PURCHASES                                                                                │
│ │ Taj Holiday Village · Fri 16 Oct · Trips                            ₹14,600  ›        │ │ → Activity row
│ │ Airtel · Wed 14 Oct · Money                                          ₹1,179  ›        │ │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```
| Element | Rule | Copy | Test id |
|---|---|---|---|
| Month switcher | `ChevronLeft`/`ChevronRight` icon buttons + month `--t-body-strong`; next disabled on the current month; earliest = `SpendSummary.earliestMonth` (prev disabled there); each switch calls `spend:month { month } → SpendSummary` (X-124) | "{October 2026}" | `spend-month-prev / spend-month-next` |
| AI tile | key AI: spent (tabular, "about" prefix in line 4 because it is an estimate), cap, meter (03 §3.7.3.4 colours: 80–99% `--warn`, ≥100% `--bad` + "Cap reached"). Plan AI: amount replaced by "Uses your {Claude} plan" and, when known, "{Claude} plan: {80}% used this week"; no meter, no Change cap | "about, from your {OpenAI} key" | `spend-tile-ai` |
| Purchases tile | spent, cap, meter, "{6} payments" | — | `spend-tile-purchases` |
| Change cap | → Settings → Money at `cap-ai` / `cap-buy` | "Change cap" | `spend-change-cap-ai / spend-change-cap-purchases` |
| AI by chat / by routine | grouping per 08-4 §26.12 (`ai_turns.chat_id` / `routine_id`); AI spend from private chats (live or ended, `chat_id` NULL after purge) is one group "Private chats" (`screen.spend.row.private_chats`, 12-2 §12.30.6), never the chat's name; rows 48px; label left, 8px bar (`--accent` on `--bg-sunken`, length ∝ share, `--r-full`), amount right tabular; sorted high→low; max 8 + "Show all" | — | `spend-row` |
| Purchases | rows 56px from `payments` (the same rows as Activity `paid`); click → Activity log row expanded | — | `spend-row` |
**States.** First time / nothing spent: tiles show "₹0" and lists show "Nothing spent in {October}." Loading: skeleton tiles. Error: 05 Error card "I couldn't add up your spending. Nothing was changed." [ Try again ]. Offline: unchanged.
**Narrator.** Meters `role="meter"` named "AI spend in October, about ₹212 of ₹1,000". Bars are hidden from Narrator; each row reads "{Trips}, about ₹71".
**Reads.** `SpendSummary` (08-0 §B; from `app:getBootstrap` and the `spend:update` event: AI cost from `ai_turns`, purchases from `payments` counting `submitted` and `checking` as spent, `byChat`, `byRoutine`), caps from `money.purchaseCapPaise`, `money.aiCapPaise`, `money.warnAt80` (08-0 §A). Writes nothing. Test ids: root `screen-spend`; `spend-month-prev`, `spend-month-next`, tiles `spend-tile-ai`, `spend-tile-purchases`, "Change cap" `spend-change-cap-ai` / `spend-change-cap-purchases`, rows `spend-row` (`data-row-id` = chat, routine or payment id).
**Credits.** Perplexity cost before/after (PPX §9.1, §9.3); OpenClaw cost per routine (OCL §9.8); Autopilot hard caps (APL §9.11); Cue wallet with budget (MNS); BP1 "Spent this month".

---

## §11. Watch live and foo's browser windows

### 11.1 (removed, X-95)

11.1 (removed, X-95): there is no in-panel live view. Every Watch live entry (checklist "Watch live" 05 §5.2, chat header "Watch live", right-shell Doing now window button, Ctrl+Shift+L) opens the live window (11.2).

### 11.2 Watch live window (`live.html`, X-66)

**Purpose.** Watch the job's browser full size. It is foo's own window showing a **picture** of the external Edge window; it is never interactive and never a browser (08-0 §G.8; the earlier "Chromium view" is withdrawn). Taking over happens in the real Edge window (11.3). **Entry:** checklist "Watch live" (05 §5.2); chat header "Watch live" (03 §3.6.2.2, shown only while a job in that chat has the browser open); right-shell Doing now window button; Ctrl+Shift+L (the most recent job using the browser; none → `announce('Nothing to watch right now.')` only; nothing visible changes (06 §0.10, X-121)); taskbar (grouped under foo's taskbar button). One window per job that uses the browser; a second request focuses it (09 §9.27.2).

```
┌─ title bar 32 (03 §3.2 rules; window title "{Goa stay} · foo") ───────────────── ─ ☐ ✕ ┐
├─ foo bar 48 ─────────────────────────────────────────────────────────────────────────────┤
│ 16 (f26) Goa stay · step 3 of 4   ● LIVE        makemytrip.com     [ Take over ] [ Stop ] │ bg --bg-sidebar,
├──────────────────────────────────────────────────────────────────────────────────────────┤ 1px --line bottom
│                                                                                          │
│              picture of foo's Edge window (masked frames, letterboxed on --bg-sunken)     │
│                                                                                          │
├─ control bar 48 (only while the user is in control in Edge) ──────────────────────────────┤
│ ✋ You're in control in Edge. foo is paused.             [ Hand back to foo ]  [ Stop ] │ bg --warn,
└──────────────────────────────────────────────────────────────────────────────────────────┘ text --on-warn
```
| Element | Rule | Copy (key `live.window.*`) | Test id |
|---|---|---|---|
| Window | default 1024×720, min 640×480, centred on foo's main window display; remembers last size per session; `live.html`; the root carries `data-state` (09 §9.27.2 state word) | title "{Goa stay} · foo" | `live-root` |
| foo bar | 48px, padding 0 16; job avatar 26; title `--t-body-strong`; LIVE pill (below); site domain `--t-small` `--fg-2` (never the full URL); buttons `--btn-h-sm` 32. No address bar, tabs or back/forward. | — | `live-bar` |
| LIVE pill | LIVE pill: 8px dot + "LIVE", `--live`, `--t-caption-strong` (`--live` = `--bad` values). Other states replace it: "Needs you" `--warn`; "YOU'RE IN CONTROL" `--warn`; "PAUSED" `--fg-3`; "✓ Done" `--ok` | "LIVE" / "Needs you" / "YOU'RE IN CONTROL" / "PAUSED" / "✓ Done" | `live-pill` |
| Picture | `live:frame` CDP screencast frames, masked in main before they reach the renderer (password, card and code fields, and `no-capture-hosts.json` sites, are blanked); scaled to fit, letterboxed on `--bg-sunken`. A click or key on it does nothing except show a 03-style tooltip at the pointer. | tooltip "This is a picture of foo's browser. Take over to use the page yourself." | `live-picture` |
| Take over | foo pauses all clicks and AI calls for this job (J13, J18); brings the real Edge window to the front and docks the take-over banner (11.3); this window shows the control bar; checklist line "✋ You took over" | "Take over" | `live-take-over` |
| Control bar | 48px, bg `--warn`, text and `HandRight` 20 icon `--on-warn`, `--t-body-strong`; buttons "Hand back to foo" (bg `--on-warn`, text `--warn`) and "Stop" (1px `--on-warn` border, text `--on-warn`) | "You're in control in Edge. foo is paused." | `live-control-bar` |
| Hand back | same as the banner's hand back (05 §5.10.3): foo re-reads the page and carries on; chat line "Carrying on from here." | "Hand back to foo" | `live-hand-back` |
| Stop | stops the job (J18); this window closes after 1s | "Stop" | `live-stop` |
| Close (✕) | closes only this picture window; the job keeps running (Stop is the explicit control, X-95; 09 §9.27.2). Closing foo's Edge window is handled by 09 §9.27. | — | `titlebar-close` |

The control bar row, the `in_control` state and their copy are canonical (X-121): on Take over this window stays open in `in_control`; 09 §9.27 owns only window creation, size, focus and docking. Replay of a finished job's steps is not this window: Replay → 06-3 §13 Replay mode (X-128).

**States** (`data-state` on the window root `live-root`, values = 09 §9.27.2 state words: `starting` / `live` / `needs_you` / `in_control` / `paused` / `done` / `cant_show`):
| State | Shows | Copy |
|---|---|---|
| Starting | picture area `--bg-sunken` + spinner ring 20 | "Getting the browser ready…" |
| Live | as drawn; Now line under the picture: current step phrase from 05 §5.2's fixed phrase list | "Now: {Filling guest details on makemytrip.com}" |
| Needs you (sign-in, CAPTCHA) | `--warn` pill "Needs you" replaces LIVE; Now line becomes the card's question; Primary "Take over" | "Now: {IRCTC} wants you to sign in." |
| In control | pill "YOU'RE IN CONTROL" `--warn`; control bar shown | "You're in control in Edge. foo is paused." |
| Paused (AI offline / limit / cap, offline) | pill "PAUSED" `--fg-3`; picture frozen | "Paused: {your AI isn't answering}." |
| Done | picture frozen on the final screen; pill "✓ Done" `--ok`; window closes 5s after DONE unless it is focused | "Final screen · {Booked, #HP82731}" |
| Can't show | picture area replaced by text (J18) | "I can't show the live picture right now. The job is still running." |
| Site blocks foo | 05 Error card in chat; "Open the page myself" = Take over | — |
Closing the live window never stops anything (X-95). Step changes are announced politely ("Step 4 of 4: paying on makemytrip.com"), never per frame.
**Keyboard:** Tab moves only through the foo bar and control bar; Esc never stops the job. **Narrator:** window name "{Goa stay}, picture of foo's browser"; mode change announced: "You're in control in Edge. foo is paused." / "foo is back in control."
**Writes:** masked step screenshots to `{DATA}\jobs\{jobId}\steps\` (kept for `privacy.screenshotDays`). Take over and hand back are checklist lines and tech-log lines, not Activity rows (08-0 §G.4). **Credits:** Manus computer and replay (MNS §5, §9.2, §9.3); ChatGPT take over / return control (GPT §9.5); Gemini View live (GEM §5); Muse take over pauses (MUS §9.8); Grok "Watching until you press Take control" (AGT A8).

### 11.3 Sign-in and take-over banner (`signin-banner.html`, X-66)
Sign-in and take-over both use the **real Edge window** brought to the front plus one docked, always-on-top, frameless `signin-banner.html` window (address row + "I'm done" / "Hand back to foo", Alt+D), positioned by `foo-native` wintrack. Content, copy and test ids (`signin-banner`, `signin-banner-address`, `signin-banner-done`, `signin-banner-success`, `signin-banner-hand-back`) are 05 §5.10.3; window behaviour, docking and focus are 09 §9.27. Not redefined here.

### 11.4 Receipt window (removed)

There is no receipt window [settled: X-02]. Approval and Payment toasts carry only [ Review ] [ Not now ] (09 §9.9.3); Review brings the main window to the front with the card focused, and Windows Hello runs from the main window. Nothing outside the card can pay or approve.

---

## §12. Search (Ctrl+K)

### 12.1 Purpose and entry
Find anything on this PC: chats, messages, jobs, files, routines, memory, settings; or ask foo about it (J22; GRK2 Ctrl+K; HRM §7). Runs locally; nothing goes to the AI unless Ctrl+Enter. **Entry:** Ctrl+K anywhere in the main window; left shell search empty state "Search all messages" (03 §3.4.10, opens with the query); helper profile "See all" files (opens with Files filter).

### 12.2 Layout (Overlay)
```
                 72px from the top of the window content (below title bar + banner)
          ┌──────────────────────── --palette-w 640 ─────────────────────────┐  --bg-raised, --r-lg,
          │ (⌕)  Search chats, messages, files, routines, memory, settings │  --shadow-28, over --scrim
          │      input 48px, --t-body, icon 20, clear ✕ when text           │
          ├────────────────────────────────────────────────────────────────┤
          │ ( All ) ( Messages ) ( Files ) ( Jobs ) ( Routines ) ( Memory ) │ 32px chips, 8px pad
          │ ( Settings )                                                    │
          ├────────────────────────────────────────────────────────────────┤
          │ CHATS & HELPERS                                                 │ section label
          │  (✈) Trips                                   Helper            │ rows 48
          │ MESSAGES                                                        │
          │  (f) foo · Thu 15 Oct                                           │ rows 64:
          │      …book the **Taj** for 12–14 Dec under ₹8k…                 │ snippet --t-small
          │ JOBS                                                            │
          │  Goa stay · Done · Fri 16 Oct                                   │
          │ FILES · ROUTINES · WHAT I KNOW · SETTINGS                       │
          │  See all 12 messages                                            │ Link per group
          ├────────────────────────────────────────────────────────────────┤
          │ ↑↓ move · Enter open · Ctrl+Enter ask foo · Esc close          │ 32px, --t-caption --fg-3
          └────────────────────────────────────────────────────────────────┘
            max height min(560px, window content height − 144px); results scroll
            at widths < 672px: full width minus 16px each side
```

### 12.3 Groups and rows
| Group (order) | Row content | Enter / click |
|---|---|---|
| Chats & helpers | avatar 26, name, type "Helper" / "Group" / "WhatsApp group" | opens the chat; → action "Profile" |
| Messages | avatar 26, "{chat} · {date}", snippet with match in `--t-body-strong` (2-line clamp) | opens the chat scrolled to the message, highlighted 2s (`--accent-soft` fade) |
| Jobs | "{Goa stay} · {Done} · {Fri 16 Oct}" | opens the job's chat at its checklist and proof |
| Files | type icon 20, file name (middle ellipsis), "{PDF} · {16 Oct}" | opens in the default app; → actions "Show in folder", "Show in chat" |
| Routines | "{BTC below ₹55,00,000 (55 lakh)} · {On}" | Routines page at that routine |
| What I know | fact + "You said" / "I guessed" | Memory page at that fact; → actions Edit, Forget (inline, with undo) |
| Settings | "{Quiet hours} · {Notifications}" | Settings at that row |
**Private chats are excluded** (12-2 §12.30.6, 08-0 §G.17): search never shows a private chat, its messages, jobs, files or cards (`messages_fts` skips them); Activity rows from a private chat are matched only on their "a private chat" label. Max 5 rows per group; "See all {12} messages" switches the chip to that group. Matching starts at 2 characters after 150ms debounce; first results ≤ 300ms (J22 acceptance). Selected row: `--bg-hover` + 3px `--accent` left bar.

### 12.4 States
| State | Shows (final copy) |
|---|---|
| Opened, no text | "RECENT" label + last 10 searches (rows 40, `Clock` 16) + Link "Clear recent"; none: "Search everything on this PC. Nothing is sent anywhere." `--t-small` `--fg-3` |
| Typing (< 2 chars) | recent list stays |
| Loading (> 300ms) | 3 skeleton rows |
| No results | "Nothing found for "{query}"." + Primary `--btn-h` 40 "Ask foo instead" (= Ctrl+Enter) |
| Query looks like a secret (05 paste-catcher patterns) | searched, but never saved to recent |
| Error | "Search isn't working right now. Your chats are fine." + Link "Try again" |
| Offline | unchanged; "Ask foo instead" queues the question (04 offline rules) |

### 12.5 Keyboard and Narrator
↑/↓ move across groups; Tab moves input → chips → results; ← / → on a result reach its actions; Enter opens; Ctrl+Enter closes the overlay and sends "{query}" to foo's chat as the user's message with the hint that foo should answer from search ("What did I book in Goa?"), foo cites the messages/files used (J22); Esc clears text, a second Esc closes. Focus returns to where it was. Narrator: input `role="combobox"` + `aria-expanded`, results `role="listbox"` with group labels; after typing pauses, status "{24} results"; each option "{Trips}, helper" / "{message snippet}, in {foo}, {15 October}".
**Writes:** recent searches (last 10) in `search.recent` (08-0 §A; a query that looks like a secret is never saved; "Clear recent" = `search:clearRecent`). **Test ids:** `search-overlay`, `search-input`, `search-clear`, `search-filter` (`data-row-id` = 08-0 `SearchFilter` value), group label `search-group` (`data-row-id`), result `search-result` (`data-row-id` = item id, `data-index`), `search-see-all`, `search-recent` rows, `search-recent-clear`, `search-ask`. **Credits:** Grok Ctrl+K palette (GRK2); Hermes local full-text search (HRM §7); Gemini status filter (GEM §9.1).

---

## §13. Attachment viewer

### 13.1 Purpose and entry
Look at a picture, a proof screenshot or pasted text at full size; save, copy, find it in the chat. **Entry:** click an image or photo tile (04), a proof screenshot (05 §5.15, §9 Activity), a step picture in a job replay (Replay mode below), a composer attachment chip (04 §21, preview before sending), the "Pasted text" chip (04). Documents (PDF, Word, Excel) are **not** shown here; they open in the user's default Windows app `[foo decision: Windows apps do it better]`.

### 13.2 Layout (Overlay, full window below the title bar)
The overlay always renders with dark-theme token values (`data-theme="dark"` on the overlay) on `--scrim-media`, in both themes.
```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ (f26) foo · Fri 16 Oct, 9:42 AM        [−] [+] [⤢ Fit] [⭳ Save as] [⧉ Copy] [💬 Show in chat] [✕] │ top bar 56, pad 0 16
│                                                                                          │ icon buttons 36
│  (‹)                                                                              (›)    │ 48px round buttons,
│                        image, fit to 90% width × 80% height                              │ --bg-raised (dark),
│                                                                                          │ 24px from edges
│                                                                                          │
│                Proof · Goa stay · Fri 16 Oct, 9:42 AM · confirmation.png                 │ caption --t-small
└──────────────────────────────────────────────────────────────────────────────────────────┘ 24px from bottom
```
| Element | Rule | Copy (tooltips / Narrator) | Test id |
|---|---|---|---|
| Sender line | avatar 26 + "{sender} · {Fri 16 Oct, 9:42 AM}" `--t-small` `--fg-1` (dark) | — | `screen-viewer-sender` |
| Zoom − / + | 25%–400% in steps 25, 50, 75, 100, 150, 200, 300, 400; Ctrl+wheel; double-click toggles Fit ↔ 100% at the pointer; when larger than the view, drag to pan (cursor grab) | "Zoom out (Ctrl+-)", "Zoom in (Ctrl+=)" | `screen-viewer-zoom-out / screen-viewer-zoom-in` |
| Fit | back to fit | "Fit to window (Ctrl+0)" | `screen-viewer-fit` |
| Save as | Windows Save dialog, original file name | "Save as (Ctrl+S)" | `screen-viewer-save` |
| Copy | copies the image to the clipboard; status "Copied." | "Copy picture (Ctrl+C)" | `screen-viewer-copy` |
| Show in chat | closes and scrolls the chat to the message, 2s highlight | "Show in chat" | `screen-viewer-show-in-chat` |
| Prev / Next | other images in the same chat (or other steps of the same job), oldest → newest; hidden at the ends | "Previous picture (←)", "Next picture (→)" | `screen-viewer-prev / screen-viewer-next` |
| Caption | proof: "Proof · {job} · {time}"; step: "Step {3} of {4} · {Filling guest details}"; else the file name | — | `screen-viewer-caption` |
| Composer preview mode | Save as / Show in chat replaced by "Remove" (removes the attachment from the composer) | "Remove from message" | `screen-viewer-remove` |
| Pasted text mode | a read-only text panel, max 760 wide, `--bg-raised` (dark), `--r-lg`, padding 24, `--t-body`, scrolls; top bar shows "Pasted text · {4,210} characters" and only Copy and ✕ | — | `screen-viewer-text` |
**Replay mode** (X-128; entry: checklist Details → "Replay", 05 §5.2.2). The attachment viewer opens on step 1's masked screenshot of that job; caption "Step {1} of {4} · {Checked Booking.com}" (`screen.viewer.replay.caption`, "Step {1} of {4} · {phrase}"; the 05 §5.2 phrase, `done` form); Prev/Next move through the job's steps; a 4px step bar under the top bar (`--bg-sunken` track, `--accent` fill, one segment per step, current segment `--accent`, failed `--bad`); no autoplay, no video. Missing screenshot (purged after `privacy.screenshotDays`): the §13 "no longer on this PC" line with the step phrase kept. Test ids `screen-viewer-replay-bar`, `screen-viewer-replay-step` (`data-index`). Not a window; never interactive (X-95).
**States.** Loading: spinner ring 20 centred. Can't open: "I can't open this picture." + Secondary "Open with another app" (Windows "Open with"). File gone (deleted from disk): "This picture is no longer on this PC." Offline: no change. Masked: proof and step pictures are stored already masked (J18); the viewer adds nothing.
**Keyboard.** Esc closes; ←/→ prev/next; Ctrl+= / Ctrl+- / Ctrl+0 zoom (inside the viewer only); Ctrl+S, Ctrl+C; Tab cycles top-bar buttons → prev → next. Focus returns to the item that opened it. **Narrator.** `role="dialog"` named "Picture from {foo}, {16 October}, {1 of 5}"; image alt = caption.
**Test ids.** Root `screen-viewer`; `screen-viewer-zoom-out`, `screen-viewer-zoom-in`, `screen-viewer-fit`, `screen-viewer-save`, `screen-viewer-copy`, `screen-viewer-show-in-chat`, `screen-viewer-remove`, `screen-viewer-prev`, `screen-viewer-next`, `screen-viewer-close`, `screen-viewer-image`; Replay mode `screen-viewer-replay-bar`, `screen-viewer-replay-step` (`data-index`).
**Credits.** WhatsApp / Signal media viewer (MSG §7); Hermes lightbox (HRM-1 §6); Manus step replay (MNS §9.3).

---

## §14. Confirm dialogs (catalogue)

All use §0.3 (Dialog sm unless stated; destructive order `[ Destructive ] [ Cancel ]`, Cancel holds focus; `role="alertdialog"`). Copy is final. `{}` are variables. Typed confirms: a Text field (40px, `--t-mono`) labelled as shown; the destructive button stays disabled until the field equals the word exactly (case-sensitive, trimmed); Enter does nothing until then. Test ids: dialog root `dialog-c-{nn}` (`dialog-c-01` … `dialog-c-26`, `dialog-c-13b`), buttons `dialog-primary` (the destructive or confirming button) and `dialog-secondary`, typed field `dialog-confirm-field` (06 §0.3). Copy keys `dialog.c_{nn}.{title|body|primary|secondary|field_label}`. The copy of C-24, C-25 and C-26 is written in 04 and stored under `dialog.c_24.*`, `dialog.c_25.*`, `dialog.c_26.*` (04 keeps a pointer here; X-102). "Activity" in the After column names the 08-0 §G.4 `event`; deletes are soft deletes then purge (08-0 §G.5, X-63).

| Id | Trigger | Title | Body | Buttons (destructive first) | After | Test id |
|---|---|---|---|---|---|---|
| C-1 | Chat options → "Clear messages…" (03 §3.6.2.2); the brief's "delete chat" for foo and helpers | "Clear messages in {Trips}?" | "Messages, cards and files in this chat are removed from your PC. Bookings, payments and your activity log stay. This can't be undone." + if a job runs here: "The job that's running keeps going." | [ Clear messages ] [ Cancel ] | messages and cards get `deleted_at` (purged in the same transaction); chat shows only a date separator and the composer; Activity `deleted_messages` "Cleared messages in {Trips}" | `dialog-c-01` |
| C-3 | Memory ⋯ → "Forget everything from {Gmail}" | "Forget {23} things I learned from your {Gmail}?" | "{Gmail} stays connected. I just forget what I learned." | [ Forget {23} things ] [ Cancel ] | status "Forgot {23} things." (no undo) | `dialog-c-03` |
| C-4 | Memory ⋯ / Privacy → "Forget everything" | "Forget everything I know about you?" | "This deletes everything I know about you, including helpers' notes. Your chats stay." Field label "Type FORGET to confirm" | [ Forget everything ] [ Cancel ] | Memory page empty state (§7.5) | `dialog-c-04` |
| C-5 | Helper profile / chat options → "Delete {Trips}" | "Delete {Trips}?" | "Its chat and notes go. Its routines stop. Bookings it made stay booked." | [ Delete {Trips} ] [ Keep {Trips} ] | `helpers.deleted_at` and its chat `deleted_at` (soft delete, 08-0 §G.5); its routines stop; Activity rows stay; Activity `deleted_chats` "Deleted {Trips} and its chat"; foo's chat; marker "You deleted {Trips}. Bookings it made stay booked." | `dialog-c-05` |
| C-6 | Same, while the helper has a job QUEUED/WORKING/NEEDS YOU/WAITING | "{Trips} is still working on {1} job" | "Stop it first? Nothing that's already done is undone." | [ Stop and delete ] [ Cancel ] | J18 stop report in Trips' chat, then C-5's result | `dialog-c-06` |
| C-7 | Group profile / chat options → "Delete group…" | "Delete the {Goa trip} group?" | "Helpers keep their own chats." | [ Delete group ] [ Cancel ] | chat `deleted_at` (soft delete); left shell row removed; Activity `deleted_chats` "Deleted the {Goa trip} group" | `dialog-c-07` |
| C-8 | WhatsApp group profile → "Hide from foo" | "Hide {Family group} from foo?" | "It stays in WhatsApp. I'll stop reading it." | [ Hide ] [ Cancel ] | row removed; can be shown again in Settings → Connections → WhatsApp | `dialog-c-08` |
| C-9 | Routines → "Delete" | "Delete the {BTC below ₹55,00,000 (55 lakh)} routine?" | "Its history goes too. This can't be undone." | [ Delete routine ] [ Keep it ] | routine soft-deleted (08-0 §G.5); not an Activity event; list selection moves to the next routine | `dialog-c-09` |
| C-10 | Connections → "Disconnect Google" (08-0 §G.12) | "Disconnect Google?" | "I'll stop reading your Gmail, Calendar and Contacts. What I already learned stays unless you forget it in Memory." + per routine using any of them: "Your "{Airtel bill}" routine uses {Gmail}. It will stop working." | [ Disconnect Google ] [ Cancel ] | Gmail, Calendar and Contacts rows show "Not connected"; vault `foo/conn_token/google` deleted; access revoked at Google (now, or when back online); Activity `disconnected` "Disconnected Google" | `dialog-c-10` |
| C-11 | Connections → WhatsApp "Unlink" | "Unlink WhatsApp?" | "I'll stop reading your chats and can't draft WhatsApp messages. Your phone keeps everything." | [ Unlink ] [ Cancel ] | linked device logged out; `{DATA}\vault\wa-session.bin` deleted; Activity `disconnected` "Disconnected WhatsApp" | `dialog-c-11` |
| C-12 | Money → payment method ⋯ "Remove" | "Remove {Visa ••4242}?" | "I'll ask for a payment method next time a payment needs one." | [ Remove ] [ Cancel ] | vault entry `foo/card/{last4}` deleted; Activity `secret_removed` | `dialog-c-12` |
| C-13 | Tray / ⋯ → "Stop everything" (J18) | "Stop all {3} jobs that are running?" | "Routines keep their schedule. Nothing that's already done is undone." | [ Stop all ] [ Cancel ] | J18 combined stop report in foo's chat + Link "Pause all routines"; Activity `stopped_all` | `dialog-c-13` |
| C-13b | Chat options → "Stop all jobs in this chat…" (03) | "Stop {2} jobs in {Trips}?" | same body | [ Stop jobs ] [ Cancel ] | J18 report in that chat; Activity `stopped_job` per job | `dialog-c-13b` |
| C-15 | New helper dialog: Esc / Cancel / ✕ after typing | "Discard this helper?" | "What you typed will be lost." | [ Discard ] [ Keep editing ] | dialog closes | `dialog-c-15` |
| C-16 | Privacy → "Delete everything" (J23 A) | "Delete everything foo has on this PC?" (Dialog md) | "Chats, memory, routines, helpers, saved logins, cards and keys. Your Gmail, Calendar and WhatsApp will be disconnected. Files in Documents\foo stay. This can't be undone." Field label "Type DELETE to confirm". Under the field, Link "Export everything first" (runs §6.6 export, then returns here) | [ Delete everything ] [ Cancel ] | full-window screen: "Deleting everything…" with a determinate 240×4 bar (§1.3 style); jobs stopped, connections revoked, vault `foo/*` and `{DATA}` (including the `activity` table and `activity.jsonl`) cleared (J23 B.4 steps 1–4; 08-0 §G.5); then foo restarts at §2.1 Welcome. Offline: same, plus a foo chat line after restart "I couldn't reach Google to disconnect foo. You can remove it yourself in your Google account under Security → Third-party access." | `dialog-c-16` |
| C-17 | Privacy → "Delete chats older than"; opens with `data:deleteOlderThan { dryRun: true }` for its counts (X-124) | "Delete messages older than {90 days}?" | "{1,240} messages in {6} chats. Bookings, payments and your activity log stay. This can't be undone." | [ Delete messages ] [ Cancel ] | messages soft-deleted then purged nightly (08-0 §G.5); status "Deleted {1,240} messages."; Activity `deleted_messages` | `dialog-c-17` |
| C-18 | First close | owned by 09 §9.8.2 (Dialog sm, 06 style) | | | | `dialog-c-18` |
| C-19 | Connections → Browser → "Sign out" | "Sign out of {irctc.co.in}?" | "I'll need you to sign in next time a job uses it. A saved login stays unless you remove it." | [ Sign out ] [ Cancel ] | cookies for that site cleared; Activity `signed_out_site` | `dialog-c-19` |
| C-20 | Money → raising the purchase cap; Spend-cap card (purchase) "Raise cap" (non-destructive: `role="dialog"`, Primary right) | "Raise your purchase cap to ₹{40,000}?" | "Bookings and payments can add up to this much this month. Each one still asks you first." From the Spend-cap card the body starts with "Now ₹{25,000}. New cap:" and an amount field (`dialog-confirm-field`, ₹ prefix, minimum the current cap + ₹1,000); the title then reads "Raise your purchase cap?" | [ Cancel ] [ Raise cap ] | `money.purchaseCapPaise`; Activity `cap_changed` "Raised your purchase cap to ₹{40,000}"; a Spend-cap card turns Raised | `dialog-c-20` |
| C-21 | Money → raising the AI cap; Spend-cap card (AI) "Raise cap" (UJ-12; non-destructive: `role="dialog"`, Primary right) | "Raise this month's AI cap?" | "Now ₹{1,000}. New cap:" + amount field (`dialog-confirm-field`, ₹ prefix, `--t-mono`, prefilled with the value typed in Settings, else empty). Minimum the current cap + ₹100, maximum ₹1,00,000 (08-0 §A.2). Errors: "The new cap has to be at least ₹{1,100}." · "The highest AI cap is ₹1,00,000." · not a number "Type an amount in rupees." | [ Not now ] [ Raise to ₹{1,500} ] (Primary, disabled until the field is valid) | `money.aiCapPaise`; Activity `cap_changed` "Changed your AI cap to ₹{1,500}"; jobs and routines paused by the cap resume; a Spend-cap card turns Raised (05 §5.21) | `dialog-c-21` |
| C-22 | A saved secret's "Remove" (05 §5.8.1 saved row, UX-12; Settings → Account & your AI key; Connections → Internet keys use their own no-confirm rule, §6.8) | "Remove your saved {OpenAI key}?" | "I'll ask you for it again the next time a job needs it." | [ Remove ] [ Cancel ] | vault entry `foo/{kind}/{name}` deleted (08-0 §E.8); Activity `secret_removed` "Removed your {OpenAI key}"; the card collapses to "Removed. {agentName} can't use it any more." | `dialog-c-22` |
| C-23 | Private chat header toggle (on) or "End private chat…" (12-2 §12.30.5) | "End this private chat?" (`dialog.c_23.title`) | "Its messages, cards and files are deleted from your PC. Anything I sent, paid, booked or deleted stays in your activity log. This can't be undone." (`dialog.c_23.body`) + if a job runs here: "The job that's running here will be stopped." (`dialog.c_23.body_job`) | [ End and delete ] (`dialog.c_23.button.confirm`) [ Cancel ] | destructive; running jobs stop (`stop_reason='chat_deleted'`), the chat is deleted (12-2 §12.30.3 step 4); foo's chat opens; no undo | `dialog-c-23` |
| C-24 | Message menu → "Delete" (04 §6.3) | "Delete this message?" | 04's body text ("It's removed from this chat on your PC. Anything {agentName} already did because of it stays done.") | [ Delete ] [ Cancel ] | destructive; owned by 04 §6.3 | `dialog-c-24` |
| C-25 | Selection bar → "Delete" (03 §3.6.2.3, 04 §1.9) | "Delete {n} messages?" | 04's body text (same as C-24) | [ Delete ] [ Cancel ] | destructive; owned by 04 §1.9 | `dialog-c-25` |
| C-26 | A link to another domain than its text shows (04 link rule, 04 §13) | "Open {domain}?" | "The link says {shown} but goes to {domain}." | [ Open {domain} ] (`dialog.c_26.primary`) [ Not now ] (`dialog.c_26.secondary`) (X-128) | non-destructive: `role="dialog"`, Primary right; opens the link in the default browser | `dialog-c-26` |
| — | Quit with running jobs | owned by 09 §9.8.4 | | | | — |
| — | Restart for update | owned by 09 §9.20.4 | | | | — |
Forgetting **one** memory fact and removing one rule use the 5s undo bar, not a dialog (§7.4). **Credits:** Cowork hard gate before deleting (CWK §9.5); Grok no undo on delete (GRK §4.5); ChatGPT reset and per-source forget (GPT §4, §9.13); J14–J23 copy.

---

## §15. Windows Hello surfaces

Flow, result handling and the type-the-amount dialog copy are **09 §9.19** (Hello for payments at or over the Settings → Money amount, default ₹10,000; message "Approve paying {amount} to {payee}"). 06 adds only these screen rules:

| Surface | Rule |
|---|---|
| Payment card while waiting | 05 §5.6 shows "Waiting for Windows Hello…" (09 §9.19.3 step 1) |
| Which window | the main window (also when the user came from a toast's Review [settled: X-02]); it is shown and restored before the prompt (09 step 5) |
| Type-the-amount dialog | Dialog sm, §0.3 frame. Field: 40px, `--t-mono`, `inputmode="decimal"`, placeholder = the amount digits, prefix "₹" inside the field at 12px left. Button "Approve {₹14,600}" is Primary and disabled until the field matches (09 §9.19.4 matching rules). On Enter with a non-matching value: field error "That's not the amount on the card." After 3 non-matching tries the dialog closes (09). Under the field, `--t-small` `--fg-2`: "Windows Hello isn't set up on this PC." + Link "Set it up" (`ms-settings:signinoptions`) — shown only for `NotConfiguredForUser`. |
| Narrator | dialog name "Confirm this payment"; description reads the payee and amount; the field is named "Amount to approve". |
Copy keys: `dialog.type_amount.*` (this dialog, `dialog-type-amount`: `title`, `body`, `field_label`, `primary`, `secondary`, `mismatch`, and `not_set_up` / `set_up_link` for the "Windows Hello isn't set up" line and its Settings link, 09 §9.19.4) and `cards.payment.hello.*` (card lines) (X-118, X-141); 09 §9.19 owns the words, this table the keys.
Conflict: 05 §5.6.2 lists the Hello text as "Confirm it's you to pay ₹{total} to {payee}"; 09 §9.19.3 says "Approve paying {amount} to {payee}". 09 owns the system prompt; 05 aligned [settled: X-08].

---

## §16. Updates and What's new

- **Update states and copy:** 03 §3.3.2 type 7 banner and 09 §9.20.3 (About row), restart rules 09 §9.20.4. 06 draws the About row (§6.11) and the restart dialog in §0.3 style (Dialog sm, `[ Wait until they finish ]` Primary/default on the right, `[ Restart now ]` Secondary).
- **What's new dialog** (Dialog md, `dialog-whats-new`; restart dialog `dialog-restart`). Opened only from Settings → About → "What's new with me" (09: no chat message after an update).
```
┌──────────────────────────── 520 ─────────────────────────────┐
│ What's new with me                                       [✕] │
│ Version {1.0.4} · {Fri 16 Oct 2026}         --t-small --fg-2  │
│ 16                                                            │
│ • I can now book trains on IRCTC.            --t-body, 8px gap│
│ • Routines tell you when they keep failing.                   │
│ • Search finds files I made.                                  │
│ 16                                                            │
│ Earlier versions                                         ›    │ Link: older entries expand below
│ 24                                                            │
│                                                  [ Got it ]   │
└───────────────────────────────────────────────────────────────┘
```
Entries are written in foo's first person, 3–6 bullets, no tech words (TAB §9.5). States: no notes for this version → "Small fixes to keep things running smoothly." Offline: unchanged (notes ship inside the app).

---

## §17. Crash recovery surfaces

Behaviour is 09 §9.21. 06 draws:

| # | Surface | Spec |
|---|---|---|
| 17.1 | "Hiccup" line after an automatic window reload (`screen-hiccup`) | 32px line under the chat header, full main-shell width, `ArrowClockwise` 16 + `--t-small` `--fg-2`, bg `--bg-app`, 1px `--line` bottom; 4s, then fades `--m-normal`; `role="status"`. Copy from 09: "foo had a hiccup and reopened. Nothing was lost." |
| 17.2 | "Can't open chats" screen (from §1.4; `screen-cant-open`, buttons `screen-cant-open-retry`, `screen-cant-open-report`) | Window content below the title bar, centred block like §1.3: `ErrorCircle` 24 `--bad`, title "I can't open your chats." (`--t-title`), body "Your chats are still on this PC. Restarting your PC fixes this most of the time." (`--t-body` `--fg-2`, max 420px), Primary "Try again" (re-opens the store), Link "Send a report" (§18.2). After 2 failed tries a second line: "If this keeps happening, reinstalling foo keeps your chats." No paths or codes (Article 2). |
| 17.3 | Second window failure within 60s | native Windows dialog (09); no 06 surface |
| 17.4 | Recovery after a whole-app crash | one 05 recovery card per unfinished job (09 §9.21 copy); payment mid-flight shows the 05 CHECKING state; unsent composer text restored (04) |

---

## §18. Safe mode card and Send a report

### 18.1 Safe mode
Trigger (08-0 §G.14, X-77): 3 unclean launches within 10 minutes, or 3 engine crashes in one launch, counted in `{DATA}\launches.json`; copy: 09 §9.21. Test ids: the card is `card-error` with `data-card-type="error"` and payload `variant: recovery`; "Start normally" `card-error-start-normally`, "Send a report" `card-error-report`. Surface: foo's chat opens with the 05 Error card (title "foo had trouble starting.", line "I've paused everything so nothing runs twice.", Primary "Start normally", Link "Send a report"). While in safe mode: every job shows the 03 "Paused" pill; routines show "Paused" on the Routines page with a page banner (Warn) "Safe mode: routines are held until you start normally." [ Start normally ]; the right shell Doing now shows "Paused: safe mode". "Start normally" relaunches foo in normal mode.

### 18.2 Send a report (Dialog lg)
```
┌──────────────────────────────────────── 720 ─────────────────────────────────────────┐
│ Send a report                                                                    [✕] │
│ This is what will be saved. It has no messages, keys or passwords.    --t-body        │
│ 12                                                                                   │
│ ┌──────────────────────────────────────────────────────────────────────────────────┐ │
│ │ foo 1.0.3 · Windows 11 23H2 · 16 Oct 2026 09:42                                   │ │ --bg-sunken, --r-md,
│ │ window stopped: render process gone (crashed) ×2                                  │ │ --t-mono, 320px tall,
│ │ …                                                                                 │ │ scrolls, selectable,
│ └──────────────────────────────────────────────────────────────────────────────────┘ │ read-only
│ 8                                                                                    │
│ {48 KB} · Add a note (optional)                                                      │ Link opens a 2-line field
│ 24                                                                                   │
│                                                        [ Not now ]  [ Save report ]   │
└──────────────────────────────────────────────────────────────────────────────────────┘
```
| State | Shows |
|---|---|
| Preparing | preview box with spinner + "Getting the report ready…" |
| Ready | as drawn; the preview is exactly the redacted logs that will be saved. Nothing is ever uploaded [settled: X-12] |
| Saving | Save report shows spinner, "Saving…" |
| Saved | foo writes a .zip of the redacted logs to `Documents\foo\reports\`, opens that folder in File Explorer with the file selected, and the dialog body becomes "Report saved. You can attach it to an email if you want help."; the dialog closes after 2s [settled: X-12] |
| Failed | Bad line "That didn't save. Try again." + Save report re-enabled |
| Offline | works the same (nothing goes online) |
The preview box is technical content, the one place tech words may appear, because it shows the exact file (Article 15 "see everything"). Where the report goes: saved locally only, never uploaded [settled: X-12]. Narrator: preview is a read-only `textbox` named "Report contents". Test ids: `dialog-report`, `dialog-report-preview`, `dialog-report-note`, `dialog-primary` (Save report), `dialog-secondary` (Not now).

---

## §19. Keyboard shortcuts sheet

**Entry:** Ctrl+/; left shell ⋯ → "Keyboard shortcuts"; Settings → Keyboard shortcuts → "Show as a sheet". **Surface:** Dialog md (`dialog-shortcuts`), body scrolls (max height window − 64px). Key caps as §6.10 (no "+" drawn between caps, 02 §F30.2). Filter field `dialog-shortcuts-filter`; rows `dialog-shortcuts-row` (`data-row-id` = action id).

Content (order final; values from 09 §9.17, 06 §0.10 and 04 §22.2):

| Group | Rows ("action" — keys) |
|---|---|
| Getting around | "Search everything" — Ctrl+K · "Search chats" — Ctrl+Shift+F · "Find in this chat or page" — Ctrl+F · "Next / previous area" — F6 / Shift+F6 · "Show or hide details" — Ctrl+Shift+D · "Jump to what needs you" — Ctrl+J · "Close or go back" — Esc · "Zoom in / out / reset" — Ctrl+= / Ctrl+- / Ctrl+0 · "Close the window" — Ctrl+W |
| Chats | "Next / previous chat" — Ctrl+Tab / Ctrl+Shift+Tab · "Next chat that needs you" — Alt+Shift+↓ · "Open chat 1 to 9" — Ctrl+1…9 · "Pin" — Ctrl+Shift+P · "Mute" — Ctrl+Shift+M · "Mark unread" — Ctrl+Shift+U · "Profile of this chat" — Ctrl+I |
| Make and open | "New helper" — Ctrl+N · "New group" — Ctrl+Shift+N · "Settings" — Ctrl+, · "What I know about you" — Ctrl+M · "Routines" — Ctrl+R · "Activity log" — Ctrl+H · "This list" — Ctrl+/ |
| Talking and jobs | "Hold to talk" — {Ctrl+Space} (hold) · "Type with your voice (Windows)" — Win+H · "Send" — Enter · "New line" — Shift+Enter · "Watch live" — Ctrl+Shift+L |
| Cards | line, not a shortcut: "Approve and Pay never have a shortcut. Tab to the button and press Enter." (09 §9.17.4) |
Filter with no match (02 §F16.3 E-26): one line "No shortcut matches "{query}"." [X-33]

Ctrl+I, Ctrl+M, Ctrl+R, Ctrl+H, Ctrl+J and Alt+D are listed in 09 §9.17.1 [settled: X-09, X-21]; the sheet shows all rows. Narrator: each group is a heading + table; a row reads "{New helper}, Control plus N".
