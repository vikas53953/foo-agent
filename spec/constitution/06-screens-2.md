# 06 · Screens, part 2 of 3: Settings, Memory, Routines

Read `06-screens.md` §0 first (surface kinds, controls §0.4, states §0.5, keyboard §0.7, Narrator §0.8, Settings names other chapters use §0.11b). Cards (Secret box, Choice, Routine card, Error card) are `05-cards.md`; the banner strip, left shell and right shell are 03 (`03-shell-1.md`, `03-shell-2.md`).

---

## §6. Settings

### 6.0 Frame

**Purpose.** Every setting foo has, in plain words, in one place. Settings in the 08-0 §A.3 list can also be changed by asking foo in chat ("turn off voice replies"); foo answers with the mini line "Changed: {row label} → {value}. [ Undo ]" (06 §0.13; OCL §9.14; J21). Storage paths, locks and ids: 06 §0.13.

**How you get there.** Gear in the left shell footer (03 §3.4.11); footer status button → Account & your AI; left shell ⋯ menu → "Settings"; tray → "Settings" (09); Ctrl+,; any "Settings → …" link in cards, banners or pages (deep link to a page and row). **Leaves to:** back arrow / Esc → the chat it came from.

**Layout (Page, L/M breakpoints).**
```
┌─ page header 60 ────────────────────────────────────────────────────────────────────────────────┐
│ [←]  Settings                                                                                  │
├──────── nav 240 ─────────┬──────────────────── content (max 760, centred, pad 24) ────────────────┤
│ 12                       │ 24                                                                    │
│ [⌕ Search settings   ]   │ Account & your AI                        --t-title (h2)                │
│ 12                       │ 24                                                                    │
│ (👤) Account & your AI ◀ │ YOU                                      section label                 │
│ (🖌) Appearance          │ ┌──────────────────────────────────────────────────────────────────┐ │
│ (🔔) Notifications       │ │ Your name                                         Vikas     ›    │ │ rows 56
│ (🛡) Permissions         │ │ Start foo when I sign in to Windows                    [● on]    │ │
│ (₹) Money                │ └──────────────────────────────────────────────────────────────────┘ │
│ (🔒) Privacy             │ YOUR AI                                                               │
│ (⏰) Routines            │ ┌──────────────────────────────────────────────────────────────────┐ │
│ (🔌) Connections         │ │ Using        Claude (your AI)          [ Test now ] [ Change ]   │ │
│ (🎙) Chat and voice      │ │              ✓ works · checked 2 min ago                          │ │
│ (⌨) Keyboard shortcuts   │ └──────────────────────────────────────────────────────────────────┘ │
│ (ⓘ) About                │                                                                       │
│ nav bg --bg-app,         │ 48 bottom                                                             │
│ 1px --line right border  │                                                                       │
└──────────────────────────┴───────────────────────────────────────────────────────────────────────┘
```
- **Nav** (`--settings-nav-w` 240px, new token): search field (`--field-h`) at 12px insets, then 11 items, 40px tall, padding 0 12px, `--r-sm`, 4px gap, icon 20px + label `--t-body`. Selected item (UX-10; X-28, 02 §F14.3, §F26): bg `--bg-selected`, label `--t-body` weight 600 `--fg-1`, icon the **Filled** variant of the same icon in `--fg-1`, `aria-current="page"`. Unselected: Regular icon `--fg-2`, label `--fg-1` 400. Hover `--bg-hover`. Test ids: search `settings-search`, items `settings-nav-{page}` (page id in brackets in each heading below). The nav is one Tab stop (↑/↓, Enter opens).
- **Narrow layout** (page area < 720px, i.e. breakpoint S or XS): the nav becomes the whole page ("Settings" list); choosing an item drills into that page with a back arrow "Back to Settings". `[foo decision: Windows Settings pattern]`
- **Nav icons** (Fluent, 20px; Regular at rest, Filled when selected): PersonCircle, PaintBrush, Alert, ShieldCheckmark, Money, LockClosed, ArrowRepeatAll (Routines, the same icon as the Routines page, X-29), PlugConnected, Mic, Keyboard, Info. (New icons requested in `06-screens.md` §0.11 list below.)
- **Every row has an id** `settings/{page}/{row}` (ids in each table below); it is the deep-link id. The row's test id is `settings-row-{page}-{row}` (Test id column in each table; 08-0 §C) and its storage key is the Writes column (08-0 §A). Deep links scroll the row to the top third of the content area and flash it: bg `--accent-soft` fading to none over 2s (reduced motion: shown 2s, then removed instantly).
- **Saving:** §0.5 rules (instant for toggles/segments; on Enter/blur for fields).
- Opening Settings with no page named opens the last page used this session, else Account & your AI.

**Search settings.** Typing filters live (local, no AI). Results replace the content: one row per matching setting, "{Row label} · {Page}" (`--t-body` / `--t-small` `--fg-2`); Enter or click opens the page at that row. Matching uses row labels, second lines and these synonyms: "dark"→Theme, "font"/"bigger"/"text size"→Zoom (`appearance/zoom`, UX-16), "do not disturb"/"night"→Quiet hours, "card"/"UPI"→Payment methods, "limit"→caps, "key"→Your AI, "Gmail"/"WhatsApp"/"X"→Connections, "delete"/"export"→Your data. No result: "Nothing called that. Try asking foo in the chat." + Link "Ask foo" (opens foo's chat with the query in the composer).

**States (whole page).** Loading: skeleton rows (§0.5). Error reading settings: 05 Error card "I couldn't read your settings. Your chats are fine." [ Try again ]. Offline: per-row (rows that need the internet show the offline tooltip).
**Keyboard.** Ctrl+, opens; F6: left shell → nav → content. Ctrl+F focuses "Search settings".
**Narrator.** Page name "Settings"; nav is `role="navigation"` "Settings pages"; each page's title is heading level 2.
**Credits.** Windows Settings two-pane and search (WIN); Grok desktop settings sections and shortcuts list (AGT A19); Hermes settings sections (HRM-1 §2); OpenClaw settings by conversation (OCL §9.14); J21.

Common controls in the tables below: **Toggle**, **Segmented**, **Field** (text/amount field §0.4), **Menu** (button showing the value with `ChevronDown` 16px, opens a 03-style menu), **Time** (Menu of times in 15-minute steps, 12:00 AM–11:45 PM, type-ahead), **›** (whole row is a button that opens a sub-view or another page), **Button** (Secondary 32px unless marked Destructive).

---

### 6.1 Account & your AI (`account`)

| Id | Row label (final) | Second line (final) | Control | Default | Writes | Test id |
|---|---|---|---|---|---|---|
| `you-name` | "Your name" | — | Field (max 30) | Windows first name, or the name given in setup | `user.firstName` + `{DATA}\memory\about-you.md` name line (`said`) | `settings-row-account-you-name` |
| `start-login` | "Start foo when I sign in to Windows" | "foo starts quietly in the tray." | Toggle | installer choice (on) | `install.startWithWindows` + Windows login item (09) | `settings-row-account-start-login` |
| `close-choice` | "When I close the window" | — | Menu "Keep foo running in the tray" · "Quit foo" (09 §9.8.2) | Keep foo running in the tray | `app.closeToTray` | `settings-row-account-close-choice` |
| `graphics` | "Smooth graphics" | shown only after 09 §9.21 turned them off: "Smooth graphics are off because they caused problems on this PC." | Button "Turn back on" | — | `app.hardwareAcceleration` | `settings-row-account-graphics` |
| `ai-using` | "Using" | "{Claude} (your AI)" and a status line (below) | Buttons "Test now", "Change" | from setup | `ai.primary`, `ai.providers.{providerId}` | `settings-row-account-ai-using` |
| `ai-backup` | "Backup AI" | "Used only for plain chat when {Claude} is resting. Never for jobs that send, buy or book." | Menu: each other AI that passed a test, and "None" | first other working AI from setup, else "None" | `ai.backup` (null = None) | `settings-row-account-ai-backup` |
| `ai-paid` | "How it's paid" | plan: "Uses your {Claude} plan" · key: "Uses your {OpenAI} key · saved {16 Oct}" | key only: Button "Replace key" | — | vault `foo/ai_key/{providerId}`; Activity `secret_replaced` | `settings-row-account-ai-paid` |
| `ai-add` | "Add another AI" | — | › | — | — | `settings-row-account-ai-add` |
| `setup-again` | "Run setup again" | "Name, face, interview and a first job. Your AI stays." | › | — | `setup.step` = 2 (06-1 §2.0) | `settings-row-account-setup-again` |
| `foo-profile` | "{foo}'s name, face and vibe" | — | › (opens §4.2) | — | — | `settings-row-account-foo-profile` |

**"Using" status line** (`--t-small`; icon 16 + words):
| State | Copy | Tone |
|---|---|---|
| Works | "✓ works · checked {2 min ago}" (tooltip: absolute time "Fri 16 Oct, 9:40 AM") | `--ok` |
| Testing | "Testing…" with spinner ring 16 | `--fg-3` |
| Not answering | "Not answering right now." | `--bad` |
| Signed out | "Signed out." + Link "Sign in" | `--bad` |
| Plan limit | "Plan limit reached until {3:00 PM}." | `--warn` |
| Key didn't work | "Your key didn't work." + Link "Replace key" | `--bad` |
| Offline | "You're offline." | `--warn` |
- "Test now" runs the J2 one-word test (20s limit) and updates the line. Disabled offline.
- "Change" and "Add another AI" switch to foo's chat and post the §2.2 card (without the step pill).
- "Replace key" opens the **Secret box dialog**: Dialog sm (`dialog-replace-key`, X-118) containing the 05 Secret box component for that key name, title "Replace your {OpenAI} key", lead line "Paste the new key below. The old one is removed when the new one works." The old key is kept until the new one passes the test; then removed.

### 6.2 Appearance (`appearance`)

| Id | Row label | Second line | Control | Default | Writes | Test id |
|---|---|---|---|---|---|---|
| `theme` | "Theme" | — | Segmented: "Same as Windows" · "Light" · "Dark" | Same as Windows | `appearance.theme` | `settings-row-appearance-theme` |
| `accent` | "Use my Windows accent colour" | "Changes buttons and highlights to your Windows colour." + a 20px swatch of the current accent at the end of the line | Toggle | off (02 F0) | `appearance.useWindowsAccent` | `settings-row-appearance-accent` |
| `zoom` | "Zoom" | "Makes everything in foo bigger or smaller. Windows text size also applies (Settings → Accessibility → Text size)." | Menu of the 09 §9.14.3 steps: 80% · 90% · 100% · 110% · 125% · 150% · 175% · 200% | 100% | `zoom` (same value as Ctrl+= / Ctrl+- / Ctrl+0) | `settings-row-appearance-zoom` |
| `animations` | "Animations" | "Basic uses gentle fades only, for slower PCs." When Windows animation effects are off: "Off · set by Windows" | Segmented: "Full" · "Basic" · "Off"; disabled while Windows animation effects are off | Full (first run on a PC with ≤ 4 logical CPUs or < 8 GB RAM: Basic; 02 F7) | `appearance.animations` | `settings-row-appearance-animations` |
| `sounds` [X-179] | "Sounds" | "A soft sound when you approve something and when a job is done." | Toggle | off | `appearance.sounds` | `settings-row-appearance-sounds` |
| `mica` [X-179] | "See-through sidebar" | "Lets your Windows 11 wallpaper tint the sidebar." Hidden on Windows 10; disabled while Windows "Transparency effects" or high contrast is on | Toggle | on | `appearance.mica` | `settings-row-appearance-mica` |
| `face-motion` [X-179] | "Show {agentName}'s eyes" | "Faces blink and look around. Off keeps them still." | Toggle | on | `appearance.faceMotion` | `settings-row-appearance-face-motion` |
| `visuals` [X-180] | "Visuals" | "How often {agentName} shows charts, maps and small tools in replies." | Segmented: "Mostly words" · "Balanced" · "Show me visuals" | Balanced | `appearance.visuals` | `settings-row-appearance-visuals` |
| `preview` | (no label) | — | Preview tile: a foo bubble and a user bubble (04 styles) at the chosen theme and size, saying "This is how messages will look." / "Looks good" | — | — | `settings-row-appearance-preview` |

- Ctrl+= / Ctrl+- / Ctrl+0 change the same `zoom` value (09 §9.14.3); this row updates live.
- Theme and accent apply instantly to every open window (main, live window, sign-in window).
- Main colour [settled: X-51, Vikas chose "Indigo + option"]: indigo (`--accent`, 02 F0) is the default; the `accent` toggle is the only other choice in v1. Off → indigo everywhere; on → the Windows accent with derived shades, live.
- Animations [X-150; 02 F7]: applies instantly as `<html data-motion>`, no restart; turning Windows animation effects back on re-enables the picker with the stored value.
- Visuals [X-180, CR-0022 pick 8]: Mostly words means no kit pieces and no AI pages unless the user asks for one in that message; tables still show (04 §13.2). The engine reads the level for the next reply.
- High contrast on (`forced-colors: active`): Theme and accent rows are disabled; a page banner (Info) says "Windows high contrast is on, so foo uses your contrast colours." Zoom still works.

### 6.3 Notifications (`notifications`)

Page banner (Warn) when Windows blocks foo's toasts: "Windows is blocking foo's notifications. You might miss approvals." [ Turn them on ] (opens `ms-settings:notifications`). Shown on this page even when the 03 strip banner was dismissed.

| Id | Row label | Second line | Control | Default | Writes | Test id |
|---|---|---|---|---|---|---|
| **TELL ME WHEN** | | | | |  |  |
| `n-needs-you` | "Something needs my answer" | "Choices, approvals, payments and sign-ins." | Toggle | on | `notifications.kinds.needsYou` | `settings-row-notifications-n-needs-you` |
| `n-done` | "A job is done" | — | Toggle | on | `notifications.kinds.done` | `settings-row-notifications-n-done` |
| `n-routine` | "A routine finds something" | "Each routine also has its own setting." | Toggle | on | `notifications.kinds.routine` | `settings-row-notifications-n-routine` |
| `n-brief` | "Morning brief is ready" | — | Toggle | on | `notifications.kinds.brief` | `settings-row-notifications-n-brief` |
| `n-helper` | "A helper replies" | — | Toggle | on | `notifications.kinds.helper` | `settings-row-notifications-n-helper` |
| `n-problem` | "Something went wrong" | "Stuck jobs and things that stopped." | Toggle | on | `notifications.kinds.problem` | `settings-row-notifications-n-problem` |
| `n-sound` | "Play a sound" | — | Toggle | on | `notifications.sound` | `settings-row-notifications-n-sound` |
| **QUIET HOURS** | | | | |  |  |
| `quiet-on` | "Quiet hours" | "Notifications wait until quiet hours end, then come as one summary." | Toggle | on | `notifications.quiet.on` | `settings-row-notifications-quiet-on` |
| `quiet-from` | "From" | — | Time | 10:00 PM | `notifications.quiet.from` | `settings-row-notifications-quiet-from` |
| `quiet-to` | "Until" | — | Time | 7:00 AM | `notifications.quiet.to` | `settings-row-notifications-quiet-to` |
| `quiet-days` | "Days" | — | 7 Chips (32px): Mon Tue Wed Thu Fri Sat Sun, multi-select | all | `notifications.quiet.days` (0=Sun…6=Sat) | `settings-row-notifications-quiet-days` |
| `quiet-urgent` | "Urgent routines" | "A routine marked Urgent can notify you in quiet hours. Mark it on the Routines page." | › (Routines page) | — | — (per routine `urgent`) | `settings-row-notifications-quiet-urgent` |
| **HOW OFTEN I MESSAGE FIRST** | | | | |  |  |
| `unprompted` | "Messages I start on my own" | 1–3: "Up to {3} a day, outside your morning brief and things you asked for." · 0: "None. I'll only message you for your morning brief and things you asked for." | Stepper: [−] value [+] (32px buttons, value `--t-body-strong` tabular, range 0–3; [+] disabled at 3, [−] at 0; X-53, Article 19, R-11) | 3 (Article 19) | `notifications.unpromptedPerDay` | `settings-row-notifications-unprompted` |
| `brief-time` | "Morning brief" | "Every day at this time." | Time + Toggle (off = no brief) | 8:00 AM, on | `brief.at`, `brief.enabled` | `settings-row-notifications-brief-time` |
| `mute-note` | (info row) "To mute one chat, use the ⋯ menu in that chat." | — | none | — | — | `settings-row-notifications-mute-note` |

- Turning off `n-needs-you` shows the warning line under the toggle, `--t-small` `--warn` with `Warning` 16: "You might miss approvals." (J21). Approvals still appear in the chat and on the taskbar.
- Morning brief (`brief-time`, `brief.at` / `brief.enabled`, the one key pair also used by the Routines page, UJ-39): the brief card holds 1–5 items ("Cards: 1–5"; 1 or 2 candidates are shown as they are, 08-3 §14.3) and expires at `at + 12 h` whether or not it was opened (08-3 §14.4, UJ-14).
- Message notifications (a foo or helper message that is not a card, `NotificationKind 'reply'`, governed by `n-helper` for helpers) carry exactly [ Open ] [ Mark as read ] and no reply box (09 §9.9); in a private chat the body is "Open foo to see it."
- Quiet hours "From" equal to "Until" shows field error "Pick two different times."
- Writes per the Writes column (08-0 §A); `notifications.unpromptedPerDay` is locked to 0–3 (`SETTING_LOCKED` above 3). Windows Focus is respected regardless (WIN §16.1).

### 6.4 Permissions (`permissions`)

Intro line under the page title (`--t-body` `--fg-2`): "Choose what I can do without asking you first." Then a fixed note row (`--t-small`, `LockClosed` 16): "Some things always ask, even if you say Always: paying, sharing your address or phone, and anything that can't be undone." (Article 5)

The one control on this page is the Segmented **Always · Ask · Never**:
- **Always** — foo does it without a card.
- **Ask** — foo shows a card every time (05 Approval/Choice).
- **Never** — foo won't do it and says so: "I'm not allowed to {send emails}. You can change that in Settings → Permissions." [ Open Permissions ].

**WHAT I DO ON MY OWN**

| Id | Row label | Default | Always allowed? | Never allowed? | Tooltip on a disabled segment (final) | Writes | Test id |
|---|---|---|---|---|---|---|---|
| `p-read` | "Read my emails, calendar and chats" | Always | yes | yes | — | `permissions.actions.read` | `settings-row-permissions-p-read` |
| `p-drafts` | "Write drafts" | Always | yes | yes | — | `permissions.actions.drafts` | `settings-row-permissions-p-drafts` |
| `p-calendar` | "Add things to my calendar" | Ask; Always if setup card H was "Go ahead with small things" | yes | yes | — | `permissions.actions.calendar` | `settings-row-permissions-p-calendar` |
| `p-send` | "Send emails and messages" | Ask | no | yes | "I'll always ask before sending." [settled: X-03] | `permissions.actions.send` | `settings-row-permissions-p-send` |
| `p-book` | "Book things" | Ask | no | yes | "I'll always ask before booking." | `permissions.actions.book` | `settings-row-permissions-p-book` |
| `p-pay` | "Pay" | Ask | no | yes | "I'll always ask before paying." | `permissions.actions.pay` | `settings-row-permissions-p-pay` |
| `p-post` | "Post in public" | Never | no | locked | "Posting isn't in this version. I'll draft and you post." (Ask disabled too) | `permissions.actions.post` | `settings-row-permissions-p-post` |
| `p-delete` | "Delete things" | Ask | no | yes | "I'll always ask before deleting." | `permissions.actions.delete` | `settings-row-permissions-p-delete` |
| `p-share` | "Share my address or phone" | Ask | no | yes | "I'll always ask before sharing these." | `permissions.actions.share` | `settings-row-permissions-p-share` |

**APPS** — "Using an app" means opening it for a job. Connecting an app (Connections page) is separate.

| Id | Row label | Second line | Default | Writes | Test id |
|---|---|---|---|---|---|
| `a-gmail` | "Gmail" | "{v***@gmail.com}" | Always | `permissions.apps.gmail` | `settings-row-permissions-a-gmail` |
| `a-calendar` | "Calendar" | — | Always | `permissions.apps.calendar` | `settings-row-permissions-a-calendar` |
| `a-contacts` | "Contacts" | "Finds the right person for emails and messages." | Always | `permissions.apps.contacts` | `settings-row-permissions-a-contacts` |
| `a-outlook` | "Outlook" — rendered only when `flags.outlook` is true (v1.1); omitted in v1 (X-41) | — | Always | `permissions.apps.outlook` | `settings-row-permissions-a-outlook` |
| `a-whatsapp` | "WhatsApp" | — | Always | `permissions.apps.whatsapp` | `settings-row-permissions-a-whatsapp` |
| `a-browser` | "Websites, in my browser window" | "Bookings, bills and sign-ins happen here." | Always | `permissions.apps.browser` | `settings-row-permissions-a-browser` |
There is no X row: X has no connection and foo only opens X drafts (X-34, INT-19). An app that is not connected shows "Not connected" + Link "Connect" (→ Connections) in place of the control. Ask on an app shows a 05 Choice card at the first step that needs it in each job: "Can I use {Gmail} for this?" [ Yes ] [ Not this time ].

**FOLDERS**

| Id | Row | Control | Default | Writes | Test id |
|---|---|---|---|---|---|
| `f-save` | "Where I save files" · second line "{Documents › foo}" (or, when Documents is online-only: "{foo files} · Saved here because your Documents folder is online-only.") | Button "Change" (Windows folder picker) | `Documents\foo` (J1) | `files.outputFolder` (+ `files.outputFolderReason`) | `settings-row-permissions-f-save` |
| `f-{n}` | one row per folder the user added: friendly path "{Documents › Bills}" | Segmented Always · Ask · Never + ⋯ menu "Remove" | Ask | `permissions.folders[]` (`{ path, mode }`) | `settings-row-permissions-f-{n}` |
| `f-add` | "Add a folder" | Button "Add folder" (Windows folder picker) | — | `permissions.folders[]` (append, mode `ask`) | `settings-row-permissions-f-add` |
| `f-delete-note` | (info row) "I always ask before deleting files, and I move them to a folder called _to_delete instead of erasing them." | none | — | — | `settings-row-permissions-f-delete-note` |

**RULES I FOLLOW** (made when the user taps "Always" on an approval card that allows scope: using an app, calendar changes, moving or labelling emails (05 §5.5.3); never for sends, bookings, payments, posts or deletes [settled: X-03], MUS §9.14)
- Each rule is a row: rule text `--t-body` ("Let Trips use Calendar without asking"), second line "Added {16 Oct}", Button "Remove" (no confirm; the undo bar of 02 §F21.3: "Removed {rule}." + Link "Undo") [X-32].
- Empty: "No rules yet. When you tap Always on a card that asks to use an app, it shows up here."

**Branches.** A locked segment clicked → tooltip only, nothing changes. Asking in chat to unlock (e.g. "let yourself pay without asking") → foo: "Paying always needs your tap. That one can't change." (J21). Writes per the Writes columns and `rules[]` (08-0 §A); `permissions.actions.{send, book, pay, delete, share}` accept only `ask`/`never` and `post` only `never` (08-0 §A.2). Each change adds one Activity row (08-0 §G.4): kind `changed`, event `permission_changed`, summary "Changed {Send emails and messages} to {Never}"; removing a rule: event `rule_removed`; a rule made from a card: `rule_added`. Rule rows: test id `settings-row-permissions-rule` with `data-row-id` = rule id.
**Credits.** ChatGPT per-action levels (GPT §9.1); Autopilot folder Always/Ask/Never (APL §9.3); Cowork folder grant and delete gate (CWK §9.4, §9.5); Muse settings-backed rules and hard limits (MUS §9.3, §9.14).

### 6.5 Money (`money`)

| Id | Row label | Second line | Control | Default | Writes | Test id |
|---|---|---|---|---|---|---|
| **SPENDING CAPS** | | | | | |  |
| `cap-buy` | "Monthly purchase cap" | "Bookings and payments stop and ask when this month would go over." | Amount field (₹ prefix, 160px, tabular) | ₹25,000 (Article 13) | `money.purchaseCapPaise` | `settings-row-money-cap-buy` |
| `cap-buy-meter` | (meter row) "₹{15,779} of ₹{25,000} this month" | — | 4px meter as 03 §3.7.3.4 | — | — | `settings-row-money-cap-buy-meter` |
| `cap-ai` | "Monthly AI cap" | key: "When your AI's cost reaches this, I stop and ask." · plan: "Your AI uses your {Claude} plan, so there's no AI cost to cap." (field hidden) | Amount field, minimum ₹100, maximum ₹1,00,000 | ₹1,000 (Article 13) | `money.aiCapPaise` | `settings-row-money-cap-ai` |
| `cap-ai-meter` | (meter row) "₹{212} of ₹{1,000} this month" | — | meter | — | — | `settings-row-money-cap-ai-meter` |
| `cap-warn` | "Tell me at 80%" | — | Toggle | on | `money.warnAt80` | `settings-row-money-cap-warn` |
| `spend` | "See spending" | — | › (§10) | — | — | `settings-row-money-spend` |
| **PAYING** | | | | | |  |
| `hello` | "Confirm with Windows Hello for payments of at least" | "Can't be turned off or set above ₹10,000. Set it to ₹0 to confirm every payment." | Amount field, range ₹0–₹10,000 | ₹10,000 (Article 7; 09 §9.19.1) | `money.bigPaymentPaise` | `settings-row-money-hello` |
| `methods` | "Payment methods" | — | list (below) | — | vault `foo/card/{last4}`, `money.upiId`, `money.defaultMethod` | `settings-row-money-methods` |
| `add-card` | "Add a card" | — | Button | — | — | `settings-row-money-add-card` |
| `add-upi` | "Add a UPI ID" | — | Button | — | — | `settings-row-money-add-upi` |
| **RECEIPTS** | | | | | |  |
| `paid-month` | "Paid this month" | "₹{15,779} · {6} payments" | › (Activity log filtered to Paid, this month) | — | — | `settings-row-money-paid-month` |

**Rules (MUST).**
- **Raising** the purchase cap opens §14 C-20; **raising** the AI cap opens §14 C-21 (UJ-12; the Spend-cap card's "Raise cap" opens the same C-21); lowering either applies at once. Each saved cap change adds one Activity row: kind `changed`, event `cap_changed` (08-0 §G.4). Windows Hello is for payments only (09 §9.19.1). The Hello amount field refuses values above ₹10,000 with the field error "The highest is ₹10,000."
- Cap below this month's spend: saves, then the line under the field: "You've already spent ₹{2,140} this month, so I'll pause {AI work | purchases} until 1 {Nov} or until you raise the cap." (J21).
- Amount field errors: not a number "Type an amount in rupees."; below minimum "The lowest AI cap is ₹100."
- Windows Hello not set up on this PC: the `hello` row second line becomes "Windows Hello isn't set up, so I'll ask you to type the amount instead." + Link "Set up Windows Hello" (`ms-settings:signinoptions`).

**Payment methods list.** One row each: `Wallet` 20 icon, "{Visa} ••{4242}" or "UPI · {vik•••@okhdfc}", "Default" pill (`--accent-soft`/`--accent`, 24px) on the default, ⋯ menu "Make default", "Remove" (→ §14 C-12). Empty: "No payment methods yet. I'll ask when a payment needs one."
- **Add a card** → Dialog sm "Add a card" (`dialog-add-card`, X-118) with the 05 Secret box component holding three masked fields: "Card number", "Expiry (MM/YY)", "Name on card"; footer line "I never save the 3-digit code. Your bank's page asks for it each time." Buttons [ Cancel ] [ Save securely ]. Saved: row appears "{Visa} ••{4242}". The number is never shown again (write-only, GRK §1.2).
- Payment method rows: test id `settings-row-money-method` with `data-row-id` = `card:{last4}` or `upi`. Saving or removing a card adds Activity `secret_saved` / `secret_removed`.
- **Add a UPI ID** (writes `money.upiId`) → Dialog sm "Add a UPI ID" (`dialog-add-upi`, X-118), plain Field (a UPI ID is not a secret, J storage map) placeholder "name@bank", error "That doesn't look like a UPI ID. It looks like name@bank." [ Cancel ] [ Save ].

### 6.6 Privacy (`privacy`)

| Id | Row label | Second line | Control | Default | Writes | Test id |
|---|---|---|---|---|---|---|
| **MEMORY** | | | | |  |  |
| `mem-on` | "Remember things about me" | on: "I keep what you tell me and what I notice, on this PC." · off: "I'm not remembering anything new. What I already know stays until you forget it." | Toggle | on | `privacy.rememberOn` | `settings-row-privacy-mem-on` |
| `mem-learn` | "Learn from my chats" | "Let me notice things, like that you pick window seats. I mark these "I guessed"." | Toggle (disabled when `mem-on` is off) | on | `privacy.learnFromChats` | `settings-row-privacy-mem-learn` |
| `mem-ask` | "Ask before remembering" | "I'll show a card each time instead of saving on my own." | Toggle (disabled when off) | off | `privacy.askBeforeRemembering` | `settings-row-privacy-mem-ask` |
| `mem-page` | "What I know about you" | "{48} things" | › (§7) | — | — | `settings-row-privacy-mem-page` |
| **SUGGESTIONS** | | | | |  |  |
| `dismissed` | "Dismissed suggestions" | "{4} hidden. I never offer these again." | Button "Show" | — | `suggestions` rows (08-0 §G.13) | `settings-row-privacy-dismissed` |
| **KEPT ON THIS PC** | | | | |  |  |
| `keep-shots` | "Job screenshots" | "Pictures of each step, kept as proof." | Segmented "1 day" · "7 days" · "30 days" · "Don't keep" | 7 days | `privacy.screenshotDays` (1 · 7 · 30 · 0) | `settings-row-privacy-keep-shots` |
| `keep-voice` | "Voice notes" | — | Segmented "7 days" · "30 days" · "Keep" | 30 days | `privacy.voiceDays` (7 · 30 · null) | `settings-row-privacy-keep-voice` |
| `sites` | "Signed-in sites" | "{6} sites" | › (Connections → Browser) | — | — | `settings-row-privacy-sites` |
| `leaves` | "What leaves this PC" | "Your messages and job details go to your AI ({Claude}). Sites you ask me to use see what you'd send them yourself." + one sentence per service that is switched on [X-43, X-46, X-49]: "Your voice notes go to OpenAI to become text." · "What you ask me to search goes to {Exa}." · "Pages I read for you go to Firecrawl." · "Public pages I browse for you are opened by Browser Use." · (v1.1) "Apps you connect through 'Connect more apps' go through {Composio}." + last sentence "Nothing else leaves this PC." Passwords, card numbers and codes are never sent to any of them. | none (static, full text wraps) | — | — | `settings-row-privacy-leaves` |
| `leaves-manage` | "Change what leaves this PC" | — | Link → Settings → Chat and voice (voice) and Connections → Internet (search, reading, browsing) | — | — | `settings-row-privacy-leaves-manage` |
| `activity` | "Activity log" | "Everything I sent, paid, booked or deleted." | › (§9) | — | — | `settings-row-privacy-activity` |
| **YOUR DATA** | | | | |  |  |
| `export` | "Export everything" | "Chats, memory, routines and the activity log. Never keys, passwords or cards." | Button "Export" | — | zip in the chosen folder; Activity `exported` | `settings-row-privacy-export` |
| `old-chats` | "Delete chats older than" | — | Menu "30 days" · "90 days" · "1 year" + Destructive Button "Delete" (→ §14 C-17) | 1 year selected, nothing deleted | soft delete of chats (§14 C-17, 08-0 §G.5) | `settings-row-privacy-old-chats` |
| `forget-all` | "Forget everything I know about you" | "Your chats stay." | Destructive Button "Forget everything" (→ §14 C-4) | — | memory files (§14 C-4); Activity `forgot_facts` | `settings-row-privacy-forget-all` |
| `delete-all` | "Delete everything" | "Chats, memory, helpers, routines, saved logins, cards and keys. foo starts fresh." | Destructive Button "Delete everything" (→ §14 C-16) | — | everything (§14 C-16) | `settings-row-privacy-delete-all` |

- **Dismissed suggestions** → Dialog md "Dismissed suggestions" (`dialog-dismissed-suggestions`, X-118), reads `suggestions:listDismissed {} → SuggestionRow[]` (X-124): list rows "{suggestion text}" + second line "Dismissed {12 Oct}" + Button "Bring back"; empty "You haven't dismissed any suggestions." [ Close ]. Bring back removes it from the never-offer list (G15).
- **Export** → Windows folder picker → row shows progress "Exporting… {40}%" (determinate 4px bar under the row) → "Saved to {Documents › foo-export-16-Oct-2026.zip}. Keys and passwords aren't included." + Button "Show in folder". Failure: "The export didn't finish. Nothing was changed." + Button "Try again". Allowed while jobs run (snapshot).
- The `leaves` row text is the single source for the first-run "What leaves this PC" dialog (06-1 §2.1, UJ-15), which adds " (when you turn it on)" to services not on yet and the sentence "foo never uses your data to train anything, and nothing goes to us." (`setup.privacy.no_training`; R-22, X-95); this row shows that sentence too, after "Nothing else leaves this PC."
- Writes per the Writes column; retention changes apply at the nightly housekeeping (08-3 §19.3) and the row says so: "Older screenshots are removed tonight." (`settings.privacy.row.screenshots.tonight`; X-129)

### 6.7 Routines (`routines-settings`)

| Id | Row label | Second line | Control | Default | Writes | Test id |
|---|---|---|---|---|---|---|
| `r-page` | "Routines" | "{4} on · {1} paused" | › (§8) | — | — | `settings-row-routines-settings-r-page` |
| `r-hours` | "Check between" | "For new routines. Each routine can have its own hours." | Time + Time | 7:00 AM – 10:00 PM | `routines.activeFrom`, `routines.activeTo` | `settings-row-routines-settings-r-hours` |
| `r-away` | "Pause routines when I'm away for 7 days" | "I'll ask when you're back." | Toggle | on | `routines.pauseWhenAway` | `settings-row-routines-settings-r-away` |
| `r-catch-up` | "Catch up after my PC was asleep" | "One check when your PC wakes, not one per missed run." | Toggle | on | `routines.catchUp` | `settings-row-routines-settings-r-catch-up` |
| `r-awake` | "Keep my PC awake while a job runs" | "Only while a job is working. Never for routines." | Toggle | on | `routines.keepAwake` | `settings-row-routines-settings-r-awake` |
| `r-housekeeping` | "Tell me about routines that stopped or went quiet" | — | Toggle | on | `routines.housekeepingMessages` ("Stop these" on an away/stale-routine message writes false, 04 §19.6) | `settings-row-routines-settings-r-housekeeping` |
| `r-habits` | "Offer to turn things I see you repeat into routines" | — | Toggle | on | `routines.habitOffers` (D-10, X-92; "Stop these" on a habit offer writes false; checked before any `habit_offer`) | `settings-row-routines-settings-r-habits` |
| `r-pause-all` | "Pause all routines" | — | Button "Pause all" / "Resume all" | — | `routines` rows (`state`); Activity `paused_routines` / `resumed_routines` | `settings-row-routines-settings-r-pause-all` |
Pause all → status line "Paused {4} routines. Turn them back on one by one or with Resume all." (J14).

### 6.8 Connections (`connections`)

Each connection is a row group with a header row (`--t-body-strong` name, status line, buttons) and detail rows.

| Connection | Status line (final copy per state) | Buttons | Detail rows | Test id |
|---|---|---|---|---|
| **Gmail** | Connected: "{v***@gmail.com} · Read, draft and send" or "· Read and draft" · Needs sign-in: "Your Gmail connection expired." (`--warn`) · Not connected: "Not connected" | Connected: "Disconnect Google" (removes Gmail, Calendar and Contacts together; 08-0 §G.12) · Needs sign-in: Primary "Reconnect" · Not connected: Primary "Connect" | One Google account only in v1 (owner Q4; `flags.multiAccount` off): no "Add another account". When send was not granted: "To let me send, allow one more permission." Link "Allow sending" | `settings-row-connections-gmail` |
| **Calendar** | "See and add events" / "Turned off" / "Not connected" · Google connected but the permission was not given (`granted.calendarWrite=false`, X-120/X-127): "Not allowed yet" (`--warn`, `settings.connections.row.not_allowed_yet`) | Google connected: "Turn off" / "Turn on" (`connections.google.calendarOn`) · Not allowed yet: Primary "Allow" (`settings.connections.button.allow`) → `connection:connect { app: 'google', scopes: ['gcal'] }` (incremental consent, `prompt=consent`) · Google not connected: Primary "Connect" (the Google sign-in) | — | `settings-row-connections-calendar` |
| **Contacts** [X-48] | "See your contacts" / "Not connected" · Google connected but the permission was not given (`granted.contactsRead=false`, X-120/X-127): "Not allowed yet" (`--warn`, `settings.connections.row.not_allowed_yet`) | Google connected: "Turn off" / "Turn on" (`connections.google.contactsOn`) · Not allowed yet: Primary "Allow" (`settings.connections.button.allow`) → `connection:connect { app: 'google', scopes: ['contacts'] }` (incremental consent, `prompt=consent`) · Google not connected: Primary "Connect" (same Google sign-in) | — | `settings-row-connections-contacts` |
| **Outlook** — not rendered in v1 (`flags.outlook` off, X-41); the walkthrough's "Outlook coming later" row is not built and the UX-24-10 golden is rendered without it (UX-23). | v1.1: "{v***@outlook.com} · Read, draft and send" / "Not connected" | v1.1: "Disconnect" / "Connect" | — | `settings-row-connections-outlook` |
| **WhatsApp** | "Linked · {+91 98••• ••210}" · "WhatsApp unlinked foo." (`--warn`) · "Not linked" | "Unlink" (→ §14 C-11) / Primary "Link again" / Primary "Link WhatsApp" | Toggle "Read my chats" (on); Toggle "Draft messages for me" (on); row `w-hidden` "Groups I read": one row per linked WhatsApp group with a Toggle (on = I read it; off adds its jid to `connections.whatsapp.hiddenJids`; C-8 "Hide from foo" turns it off; deep link `foo://settings/connections/w-hidden`, 12-2 §12.27), test id `settings-row-connections-w-hidden` (`data-row-id` = jid); note `--t-small` `--fg-2` "WhatsApp may unlink foo now and then. If that happens I'll ask you to scan again." | `settings-row-connections-whatsapp` |
| **X** | "Drafts only" | — (no Connect: X has no account connection, 08 §16.3) [X-34] | note "Posting isn't in this version. I'll draft posts and you post them in X." | `settings-row-connections-x` |
| **Browser** (foo's own browser window) | "Signed in to {6} sites" | — | one row per site: domain `--t-body`, second line "Signed in" or "Signed in · login saved", Button "Sign out" (→ §14 C-19); when a login is saved also Link "Remove saved login". Empty: "You're not signed in to any sites in my browser yet." | `settings-row-connections-browser` |
| **Your AI** | "{Claude} (your AI)" | › (Account & your AI) | — | `settings-row-connections-ai` |
| **Internet** [X-46] (group header; note under it `--t-small` `--fg-2`: "Optional. With your own keys, I search and read faster. Without them, I search and read in my own browser window on this PC.") | per row below | per row below | three rows: | `settings-row-connections-internet` |
| ↳ "Faster search" | key saved: "Using your {Exa} key · {Exa} sees what you search" · none: "On this PC" · refused (`connections.web.refused.{exa\|tavily}` = true, 08-0 §A, X-127): "{Exa} didn't accept the key. I'm searching on this PC." (`--warn`) | none: Secondary "Add key" (menu "Exa" · "Tavily" → Secret box web key variant, 05 §5.8.4) · saved: "Remove key" (resets the row to "On this PC": `connections.web.search` = `this_pc`, `refused.{p}` cleared) · both search keys saved: the one-line switch Link "Use Exa instead" / "Use Tavily instead" (`settings.connections.web.switch_to`, no confirm; writes `connections.web.search`) (X-127) | — | `settings-row-connections-web-search` |
| ↳ "Faster page reading" | "Using your Firecrawl key · Firecrawl sees the pages I read for you" / "On this PC" | "Add key" / "Remove key" | — | `settings-row-connections-web-read` |
| ↳ "Browse public sites online" | "On · Browser Use opens public pages for me. Never for sites you're signed in to, paying, booking or sending." / "Off" | "Add key" (then on) / "Remove key" | — | `settings-row-connections-cloud-browser` |
| **Connect more apps** (v1.1, `flags.hub` [X-49]) | "Zomato, Swiggy, Notion and more" / connected: "{3} apps connected" | › opens the gallery: tiles, each with the app logo, one plain sentence of what foo can do (e.g. "Find restaurants and order food. You pay by scanning a code.") and "Connect"; paused tile "🔌 {Zomato} changed how it works. I've paused it until I check." [ Reconnect ] | bank, UPI, trading, crypto and password apps are never listed | `settings-row-connections-hub` |

- Connect/Reconnect follow the 05 Connect card states inline in the row: "Opening {Gmail} sign-in in your browser…" → "✓ Connected as {v***@gmail.com}"; denied: "{Gmail} isn't connected." Link "Try again"; link expired after 10 min: "That sign-in link expired." Link "Reopen".
- "Link WhatsApp" / "Link again" opens Dialog md "Link WhatsApp" (`dialog-link-whatsapp`, X-118) containing the §2.4 WhatsApp QR panel and its states; closes itself 2s after "✓ WhatsApp linked".
- "Disconnect Google" → §14 C-10 (lists routines that use Gmail, Calendar or Contacts). "Turn off" on Calendar or Contacts applies at once (no confirm) and adds Activity `setting_changed`.
- Internet rows (key rows per 08-4 §27.3): "Add key" opens the 05 Secret box web key variant and runs the 08-4 §27.3 key check (one harmless call: HTTP 200 → saved; 401/403 → the row's "refused" state "{Exa} didn't accept the key. I'm …ing on this PC." `--warn`; anything else → saved, row shows "On this PC" until the first successful call); a key that later fails with 401/403 shows the same refused state; quota or outage never changes the row (foo falls back to this PC; a quota line goes in the next brief). The X row is "Drafts only" with no Connect (X-34). "Remove key" deletes the vault entry `foo/web_key/{exa|tavily|firecrawl|browseruse}` at once (no confirm; Activity `secret_removed`, summary "Removed your {Exa} key"); the row falls back to "On this PC". Cloud tool spend shows in Settings → Money and the Spent meter like AI spend (Art. 13).
- Offline: Connect, Reconnect, Link disabled with the offline tooltip; Disconnect still works locally and revokes at the provider when back online.
- Writes `connections` rows (08-1), `connections.google.calendarOn`, `connections.google.contactsOn`, `connections.whatsapp.read`, `connections.whatsapp.draft`, `connections.web.search`, `connections.web.read`, `connections.web.cloudBrowser` (08-0 §A); vault `foo/conn_token/google`, `foo/web_key/{name}`, WhatsApp `{DATA}\vault\wa-session.bin` (08-0 §E.8). Activity (08-0 §G.4): kind `connected` event `connected` / `disconnected`, summary "Connected {Gmail} ({v***@gmail.com})"; browser "Sign out" → `signed_out_site`, "Remove saved login" → `removed_login`.
- **Credits.** Autopilot connectors page (APL §9.14); Manus logged-in accounts with sign out (MNS §4); Grok Connect states and incremental permission (GRK §1.4).

### 6.9 Chat and voice (`chat`)

| Id | Row label | Second line | Control | Default | Writes | Test id |
|---|---|---|---|---|---|---|
| `voice-replies` | "Voice replies" | "When I answer with a voice note." | Segmented "When I send voice" · "Always" · "Never" | When I send voice | `chat.voiceReplies` | `settings-row-chat-voice-replies` |
| `talk-key` | "Hold to talk" | "{Ctrl+Space}" | Button "Change" | Ctrl+Space | `chat.holdToTalk` | `settings-row-chat-talk-key` |
| `vibe` | "How I talk" | "{Calm, a bit funny}" | › (foo profile §4.2, How I talk) | from setup | `identity.vibe`, `identity.vibeLine` (via §4.2) | `settings-row-chat-vibe` |
| `status-emoji` | "Show status on my messages" | on: "👀 seen, 🛠 working, ✅ done." · off: "Hides the Seen and Working marks. You'll still see Waiting, Done and Didn't work." | Toggle. Off hides 👀 and 🛠 only; ⏳ ✅ ❌ ⛔ always show (UJ-27, Article 16; 08-0 §F) | on | `chat.showStatusOnMyMessages` | `settings-row-chat-status-emoji` |
| **VOICE NOTES TO TEXT** [X-43] | | | | |  |  |
| `voice-text` | "Turn my voice notes into text" | OpenAI selected: "OpenAI does it, using your key. Your voice goes to OpenAI and nowhere else." · This PC selected: "Done on this PC. Nothing leaves it, but it's slower." | Segmented "OpenAI" · "This PC" ("OpenAI" disabled with tooltip "Add an OpenAI key first." when no key) | "OpenAI" when an OpenAI key is saved, else "This PC" | `chat.voiceToText` | `settings-row-chat-voice-text` |
| `voice-key` | "OpenAI key" | saved: "Saved on this PC. Your AI never sees it." · none: "Add one for faster voice notes." · refused: "OpenAI didn't accept this key." (`--warn`) | Button "Add key" (→ Secret box, voice key variant) / "Replace key" | — | vault `foo/ai_key/openai-key` (secretKind `voice_key`); `chat.voiceKeyRefused` | `settings-row-chat-voice-key` |
| `voice-pack` | "Voice pack on this PC" | downloaded: "about {148} MB · Used when OpenAI can't be reached." (size from `voice-pack.json` `bytes`, rounded) · not downloaded: "Not downloaded (about 148 MB). I'll get it the first time it's needed." · downloading: "Setting up voice notes… {40}%" | Button "Remove" (downloaded only) | — | voice pack files (08-0 §E.5 `voice-pack.json`) | `settings-row-chat-voice-pack` |

**Change hold-to-talk key** → Dialog sm "Hold to talk" (`dialog-hold-to-talk`, X-118): body "Press the keys you want to hold." A 56px capture box (`--bg-sunken`, `--r-md`, `--t-mono`) shows the keys as pressed ("Ctrl + Space"). Rules: needs Ctrl or Alt plus one key; Win-key combos refused: "Windows uses that one. Try another." A combo already used (§0.10 / 09 list): "That's already used for {Search}." Buttons [ Cancel ] [ Save ]; Save disabled until a valid combo.

### 6.10 Keyboard shortcuts (`shortcuts`)

The same list as §19, as page rows grouped "Getting around", "Chats", "Pages", "Jobs and cards", each row: action `--t-body` left, keys right as key caps (each key 24px tall, padding 0 8px, `--r-xs`, 1px `--line-strong`, bg `--bg-sunken`, `--t-caption`, 4px gap between caps; no "+" is drawn between caps, 02 §F30.2; Narrator reads "Control plus K"). Read-only except "Hold to talk", which links to §6.9. Rows: test id `settings-row-shortcuts-{actionId}` (action ids of §19). Footer Link "Show as a sheet (Ctrl+/)".

### 6.11 About (`about`)

```
 foo                                   --t-wordmark (03 §3.12)
 Version {1.0.3}                       --t-small --fg-2   (unsigned tester builds: "Version {1.0.3} · tester build" [X-44])
 ┌────────────────────────────────────────────────────────────────┐
 │ Updates     foo is up to date · {1.0.3}      [ Check for updates ]│
 │ What's new with me                                          ›   │
 │ Send a report                                               ›   │
 │ Repair foo  Fixes foo's browser and files. Your chats stay. [ Repair ]│
 │ What leaves this PC                                         ›   │
 │ Open-source parts                                           ›   │
 └────────────────────────────────────────────────────────────────┘
```
| Id | Row | Behaviour |
|---|---|---|
| `update` | "Updates" + the status text of 09 §9.20.3 (up to date / checking / downloading {p}% / ready / failed / waiting for Wi-Fi) | Button per 09 §9.20.3 ("Check for updates", "Restart foo", "Try again", "Download now"); "Restart foo" follows 09 §9.20.4. Downloading shows a 4px determinate meter under the row. |
| `whats-new` | "What's new with me" | opens the §16 dialog for the current version |
| `report` | "Send a report" | opens the §18 dialog |
| `repair` | "Repair foo" · "Fixes foo's browser and files. Your chats stay." | Button "Repair" → row shows "Repairing…" (spinner) → "Repaired." (`--ok`) or "That didn't work. Try again, or reinstall foo from its website." Disabled while a job is WORKING: tooltip "I'll repair when your jobs finish." (target of J19.6 "Repair foo") |
| `leaves` | "What leaves this PC" | the §2.1 "Privacy details" dialog |
| `licences` | "Open-source parts" | Dialog lg (`dialog-licences`, X-118), title "Open-source parts", scrollable list "{name} · {licence}" in `--t-small`, [ Close ] |

Test ids: `settings-row-about-{update|whats-new|report|repair|leaves|licences}`. `leaves` opens the same dialog as 06-1 §2.1 (`dialog-privacy`).
Credits: Tab first-person changelog (TAB §9.5); Grok Updates section (AGT A19); 09 §9.20.

---

## §7. Memory: "What I know about you"

### 7.1 Purpose and entry
See, search, edit, forget and export everything foo remembers, and whether the user said it or foo guessed it (TAB §9.10; OCL §2.4; J17). **Entry:** left shell ⋯ menu → "Memory"; right shell "See all ({n})" or a fact's "Edit" (03 §3.7.3.3; opens with that fact in edit mode); Settings → Privacy → "What I know about you"; helper profile "See all" (filtered to that helper); a 05 memory chip; Ctrl+M. **Leaves to:** back / Esc → previous chat.

### 7.2 Layout (Page)
```
┌─ page header 60 ───────────────────────────────────────────────────────────────────────────────┐
│ [←]  What I know about you            [⌕ Search what I know    ] [ + Add something ] [⋯]      │ search 240w
├────────────────────────────────────────────────────────────────────────────────────────────────┤
│ content column (max 760)                                                                        │
│ 16                                                                                              │
│ ( All ) ( You said ) ( I guessed ) ( From Gmail ) ( From WhatsApp ) ( From chats )   32px chips │
│ 16                                                                                              │
│ ┌ Info strip ─────────────────────────────────────────────────────────────────────────────┐   │
│ │ This week I learned 3 new things.                                     [ See them ]        │   │ only if ≥ 1
│ └──────────────────────────────────────────────────────────────────────────────────────────┘   │
│ PEOPLE · 6                                                            section label + count    │
│ ┌──────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ Brother Rohit lives in Pune                                            Edit · Forget  ⋯  │ │ row min 64
│ │ You said · 28 Sep                                                                        │ │
│ ├──────────────────────────────────────────────────────────────────────────────────────────┤ │
│ │ Mom's birthday is 18 Oct                                               Edit · Forget  ⋯  │ │
│ │ From Gmail · 9 Oct                                                                       │ │
│ └──────────────────────────────────────────────────────────────────────────────────────────┘ │
│ PREFERENCES · 12                                                                               │
│ │ Prefers window seats                                                   Edit · Forget  ⋯  │ │
│ │ I guessed · from 4 bookings · 9 Oct                                                      │ │
│ │ 🔒 Vegetarian on Tuesdays                                              Edit · Forget  ⋯  │ │
│ │ You said · 2 Oct · Private                                                               │ │
│ PLACES · 3                                                                                     │
│ FACTS · 9                                                                                      │
│ HELPERS' NOTES                                                                                 │
│ │ (✈) Trips · 6 notes                                                                 ›   │ │ expands in place
│ │ (₹) Money · 4 notes                                                                 ›   │ │
│ 48                                                                                             │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 7.3 Elements

| Element | Spec | Copy |
|---|---|---|
| Search | §0.4 page search field, 240px, local and instant (no AI). Matches are marked with `--accent-soft` background on the matched text. | placeholder "Search what I know" |
| + Add something | Secondary 32px. Opens an add row at the top of the content: multi-line field (auto-grows to 4 lines) placeholder "Like "I'm allergic to peanuts"", [ Remember ] (Primary `--btn-h` 40) [ Cancel ]. Saved as You said, placed in a group by foo (offline: Facts). | "+ Add something" |
| ⋯ menu | "Export what I know", "Open the memory folder", separator, "Forget everything from Gmail", "Forget everything from WhatsApp", "Forget everything from chats", separator, "Forget everything" (destructive style) | — |
| Filter chips | 32px Chips, single-select; "All" default. "From …" chips appear only when such facts exist. | "All" "You said" "I guessed" "From Gmail" "From WhatsApp" "From chats" |
| Learned strip | Page banner (Info) shown when facts were added in the last 7 days. "See them" filters to those facts (a removable chip "Last 7 days ✕" appears). | "This week I learned {3} new things." |
| Groups | Section labels with count: "PEOPLE", "PREFERENCES", "PLACES", "FACTS", then "HELPERS' NOTES". Group = the fact's `kind` tag (person, preference, place, fact) in the memory files (08). Empty groups are hidden. Order inside a group: most recently used first. | — |
| Fact row | min-height 64px, padding 12px 16px. Line 1: fact `--t-body` `--fg-1` (wraps). Line 2: source `--t-small` `--fg-2`. Right: Link buttons "Edit" and "Forget" (always visible, `--t-small`), then ⋯ icon button. Private facts start with `LockClosed` 16px `--fg-2` and end line 2 with " · Private". A fact with `scope='chat'` (X-112) shows the second line "Only in {chat name}" (`screen.memory.row.only_in_chat`; `{chat name}` = `MemoryFactView.onlyInChatTitle`, 08-5 §3.6). | see source table |
| Row ⋯ menu [X-06] | "Mark private" / "Not private" (`memory:setPrivate`), "Show where I learned it" (opens the chat message or the email's subject card), "Move to…" ▸ People / Preferences / Places / Facts (sets `kind`, `memory:setKind`) | — |
| Helpers' notes | One row per helper (avatar 26, "{Trips} · {6} notes"); expands in place to that helper's fact rows (same anatomy, same actions). | — |

**Source line (final copy).**
| Source | Line 2 |
|---|---|
| User said it | "You said · {2 Oct}" |
| foo noticed it | "I guessed · {from 4 bookings} · {9 Oct}" (reason is required; a guess without a reason is not shown) |
| From an app | "From {Gmail} · {9 Oct}" ("From WhatsApp", "From your calendar") |
| Edited by the user | "You said · {today}" (an edit always makes it "You said") |

### 7.4 Actions and their exact results

| Action | Result (final copy) |
|---|---|
| Edit | Row becomes a multi-line field with the text selected + [ Save ] (Primary `--btn-h` 40) [ Cancel ]. Enter saves (Shift+Enter new line), Esc cancels. Saved: line 2 becomes "You said · {16 Oct}"; status line "Updated." |
| Forget (one) | Row collapses (`--m-normal`); the undo bar of 02 §F21.3 (`--undo-h`, `--dur-undo`, `--z-undo`) shows "Forgot "{Prefers window seats}"." + Link "Undo" [X-32]. Undo restores the row exactly (J17). No dialog. |
| Forget everything from {source} | §14 C-3 |
| Forget everything | §14 C-4 (typed FORGET) |
| Export what I know | Windows folder picker → writes `foo-memory-{16-Oct-2026}.zip` of the memory files → status line "Saved to {Documents › foo-memory-16-Oct-2026.zip}." + Link "Show in folder" |
| Open the memory folder | Opens `{DATA}\memory\` in File Explorer (plain Markdown files, INS §5.3, OCL §9.7) |
| Mark private | Line 2 gains " · Private" and the lock icon; Narrator "Marked private. I won't use this in groups." |

### 7.5 States

| State | Shows (final copy) |
|---|---|
| First time | Empty block: icon Brain 24, title "Nothing yet", body "Tell me things like "I'm vegetarian on Tuesdays" and I'll remember them here.", Secondary "+ Add something" |
| Empty after Forget everything | title "I've forgotten everything", body "Anything you tell me from now on shows up here." |
| Filter / search empty | "Nothing matches "{query}"." + Link "Clear filters" |
| Memory off (Privacy `mem-on` off) | Page banner (Info) at top: "I'm not remembering anything new. What I already know stays until you forget it." [ Turn back on ] |
| Hand-edited file has unreadable lines | Page banner (Warn): "I couldn't read {2} lines in {about-you.md}." [ Show them ] → Dialog md (`dialog-unreadable-lines`, X-118) listing the lines in `--t-mono` with [ Open the file ] [ Close ] |
| Loading | skeleton rows (§0.5) |
| Error | 05 Error card "I couldn't read what I know. Your chats are fine." [ Try again ] |
| Offline | unchanged (all local); "+ Add something" files new facts under Facts |

### 7.6 Keyboard and Narrator
Ctrl+M opens; Ctrl+F focuses search; the rows are one Tab stop per group (↑/↓), → reaches Edit, Forget, ⋯; Delete key on a focused row = Forget (with the undo bar); F2 = Edit. Narrator row name: "{Prefers window seats}. {I guessed, from 4 bookings, 9 October}." The undo bar is `role="status"`.

### 7.7 Reads / writes
Reads/writes `{DATA}\memory\about-you.md`, `{DATA}\memory\people\*.md`, `{DATA}\memory\preferences\*.md`, `{DATA}\helpers\{helperId}\notes.md` (each fact line: text, `kind`, `provenance`, date, origin id, `private`; X-129). Forget deletes the line and writes a tombstone (90 days, J17). Activity (08-0 §G.4): kind `changed`, event `forgot_facts`, summary "Forgot {23} things from Gmail" (never the fact text); a single Forget is not logged.
**Test ids.** Root `screen-memory`; search `memory-search`; add `memory-add`; ⋯ `memory-menu`; filter chips `memory-filter` with `data-row-id` (`all`, `said`, `guessed`, `gmail`, `whatsapp`, `chat`); learned strip `memory-learned`; fact row `memory-row` with `data-row-id` = fact id; row actions `memory-row-edit`, `memory-row-forget`, `memory-row-menu`; helpers' notes row `memory-helper` with `data-row-id` = helper id.
**Credits.** Tab you said / I concluded (TAB §9.10); OpenClaw editable memory files and superseding (OCL §2.4, §9.7); Hermes saved chip and write approval (HRM §9.12); ChatGPT per-source forget (GPT §9.13); Perplexity memories as sources (PPX §9.6); BP1 "Memory you can see and fix".

---

## §8. Routines

### 8.1 Purpose and entry
See every routine with its next run and last result; pause, edit, run now, delete; take up foo's suggestions (J14; GRK §4.5; GPT §9.7). **Entry:** left shell ⋯ menu → "Routines"; 05 Routine card "Edit" (opens with that routine selected and its first row in edit mode); Settings → Routines; helper profile routine row; Search result; Ctrl+R. **Leaves to:** back / Esc → previous chat.

### 8.2 Layout (Page; two panes when the page area is ≥ 900px, else list then drill-in)
```
┌─ page header 60 ─────────────────────────────────────────────────────────────────────────────────┐
│ [←]  Routines                                          [ + New routine ]  [ Pause all ]          │
├──────────── list 360 (scrolls) ────────────┬──────────────── detail (flex, pad 24) ─────────────────┤
│ FOO SUGGESTS                               │ BTC below ₹55,00,000 (55 lakh)                      [● On]         │ --t-title + Toggle
│ ┌────────────────────────────────────────┐ │ (₹) In Money's chat                    --t-small --fg-2 │
│ │ Get the Airtel bill ready each month   │ │ 16                                                      │
│ │ You've paid it 3 months in a row.      │ │ ┌──────────────────────────────────────────────────┐ │
│ │ [ Make it a routine ]  Not interested  │ │ │ Checks       Bitcoin price in rupees (CoinDCX) › │ │
│ └────────────────────────────────────────┘ │ │ How often    Every 30 min                       › │ │
│ YOUR ROUTINES · 5                          │ │ Between      7:00 AM and 10:00 PM (IST)          › │ │
│ ┌────────────────────────────────────────┐ │ │ Tells you    only if it's below ₹55,00,000 (55 lakh)         › │ │
│ │(₹) BTC below ₹55,00,000 (55 lakh)          [● on]  │ │ │ Where        Money chat + notification           › │ │
│ │    Every 30 min · Next: 10:15 AM       │ │ │ Urgent       Notify me even in quiet hours  [○]   │ │
│ │    ✓ 9:45 AM · nothing to tell         │ │ │ Next run     Fri 16 Oct, 10:15 AM                 │ │
│ ├────────────────────────────────────────┤ │ │ Uses about   ₹30 of your AI a month               │ │
│ │(✈) Goa hotel prices          [Paused]  │ │ └──────────────────────────────────────────────────┘ │
│ │    Every day, 9:00 AM                  │ │ [ Run once now ]   [ Delete ]                          │
│ │    ✕ 8:45 AM · couldn't open the site  │ │ LAST 20 RUNS                                           │
│ └────────────────────────────────────────┘ │ ✓ Fri 16 Oct, 9:45 AM   Nothing to tell                │
│                                            │ ✓ Fri 16 Oct, 9:15 AM   Nothing to tell                │
│                                            │ ✕ Fri 16 Oct, 8:45 AM   Couldn't open CoinDCX  [ Fix ] │
└────────────────────────────────────────────┴────────────────────────────────────────────────────────┘
  list: 1px --line right border; selected row bg --bg-selected + 3px --accent bar (03 chat-row rule)
```

### 8.3 Elements

**Header.**
| Element | Behaviour | Copy |
|---|---|---|
| + New routine | Secondary 32. Opens foo's chat (or the open helper's chat when coming from its profile) with the composer focused and its placeholder set to the hint. Routines are made by asking (GRK §2 row 21). At 25 routines: disabled with tooltip. | "+ New routine" · hint "Tell me what to check and when, like "every Friday list bills due next week"" · tooltip "That's 25 routines, the most I can look after. Delete one to add another." |
| Pause all / Resume all | Secondary 32; label flips when all are paused. | "Pause all" → status "Paused {4} routines. Turn them back on one by one or with Resume all." · "Resume all" → "{4} routines are on again." |

**foo suggests** (max 3, GEM §9.7; OCL §9.9): cards 05-frame inside the list, each: suggestion `--t-body-strong`, reason `--t-small` `--fg-2` ("You've paid it 3 months in a row."), Primary `--btn-h` 40 "Make it a routine" (writes `suggestions` row state, 08-0 §G.13; posts the 05 Routine card in the owner chat, already filled, with "Run once now" done first) and Link "Not interested" (dismissed forever, G15; status line "Okay, I won't suggest that again."). Section hidden when empty.

**Routine row** (min-height 72px, padding 12px 16px):
| Part | Spec |
|---|---|
| Owner avatar | 40px, owner chat's face/colour |
| Name | `--t-body-strong`, 1 line |
| Line 2 | "{How often} · Next: {10:15 AM}" (`--t-small` `--fg-2`; next run shows the day when not today: "Next: Sat 17 Oct, 9:00 AM") |
| Line 3 | last result: `Checkmark` 16 `--ok` + "{9:45 AM} · nothing to tell" / "{9:45 AM} · told you" · or `ErrorCircle` 16 `--bad` + "{8:45 AM} · {couldn't open the site}" (`--t-caption`) · never run: "Hasn't run yet" `--fg-3` |
| Right | Toggle (on/off). Paused rows replace it with a "Paused" pill (`--warn-soft`/`--warn`) and the toggle off. Needs-fixing rows (3 failures in a row) show a "Needs fixing" pill (`--bad-soft`/`--bad`) |
| Order | Needs fixing → On (by next run) → Paused (by name) |

**Detail rows** (Settings row style; each › opens an inline editor in place with [ Save ] [ Cancel ]):
| Row | Editor | Notes |
|---|---|---|
| Name (title) | click title → Field (max 40) | — |
| On (title Toggle) | Toggle | off = paused: "Paused. I won't check {BTC} until you turn it back on." · on: "On again. Next run {Fri 16 Oct, 11:00 AM}." |
| Checks | multi-line Field (max 200) "What should I check?" | — |
| How often | Chips: "Every 15 min" "Every 30 min" "Every hour" "Every day" "Every weekday" "Every week" + Time (for day/weekday/week) + day Menu (for week) | Under 15 min is never offered (J14) |
| Between | Time + Time; second line "your time, {IST}" | default from Settings → Routines |
| Tells you | Field "only if…" (max 120); empty = "Every time it runs" | silence when false (OCL NO_REPLY) |
| Where | Menu of chats (foo + helpers, never a group) + Toggle "Also send a notification" | — |
| Urgent | Toggle; second line "Notify me even in quiet hours." | off by default |
| Next run | read-only | absolute day + time |
| Uses about | read-only; key AI "₹{30} of your AI a month"; plan AI "about {2}% of your {Claude} plan a month" | OCL §9.8 |
After any save: status line "Updated. Next run {Fri 16 Oct, 11:00 AM}." and the owner chat gets the changed 05 Routine card with the changed line marked ("How often: Every hour (was every 30 min)", J14).

**Buttons.** "Run once now" (Secondary): row shows "Running…" with spinner, then the result line in the detail ("Checked now: {BTC is ₹57,20,000 (57.2 lakh), above your line}."), and the run is added to history. Disabled offline (offline tooltip) and when the AI cap is reached ("You've reached this month's AI cap."). "Delete" (Destructive secondary style: text `--bad`, border `--bad`) → §14 C-9.

**Last 20 runs.** Rows 40px: result icon + word ("Nothing to tell" `--fg-2`, "Told you" `--ok`, "Didn't work" `--bad`), absolute time, short reason `--t-small`. A "Didn't work" row has Secondary 32 "Fix": opens the owner chat with a 05 Error card for that failure (one fix button). "Told you" rows link to the message in the owner chat ("Show message").

### 8.4 States

| State | Shows (final copy) |
|---|---|
| First time | Empty block: icon `ArrowRepeatAll` 24 [X-29], title "No routines yet", body "Ask me in plain words, like "tell me when BTC drops below ₹55,00,000 (55 lakh)" or "every Friday list bills due next week"." Primary "Make a routine" (= + New routine); under the block a Link button "See ideas" (`routines.empty.see_ideas`) that opens the Ideas Page (`foo://ideas`, 12-1 §12.24.3), test id `routines-empty-ideas` |
| Nothing selected (two-pane) | detail shows `--t-small` `--fg-3` centred: "Pick a routine to see its details." |
| Paused while away | Page banner (Warn): "I paused {3} routines while you were away (since {Tue 6 Oct})." [ Resume all ] |
| AI cap reached | Page banner (Bad): "Routines are paused because you've reached this month's AI cap ({₹1,000})." [ Raise cap ] → Settings → Money |
| Loading | skeleton rows |
| Error | 05 Error card "I couldn't read your routines. They're still saved." [ Try again ] |
| Offline | list and editing work; Run once now disabled; routines skip runs and catch up per J14 |
| Helper paused | its routines show "Paused" with second line "{Trips} is paused." and the toggle disabled with tooltip "Turn {Trips} back on first." |

### 8.5 Keyboard and Narrator
Ctrl+R opens; Ctrl+F focuses a filter field at the top of the list (placeholder "Find a routine"); list is one Tab stop; Enter opens detail; Space toggles on/off; Delete key → C-9. F6: left shell → routines list → detail. Narrator row name: "{BTC below ₹55,00,000 (55 lakh)}, {on}, every 30 minutes, next run {10:15 AM}, last run {9:45 AM}: nothing to tell."
### 8.6 Reads / writes
`routines` and `routine_runs` rows (08-1; mirror `{DATA}\routines\{id}.json`): owner, what, schedule + time zone, active hours, condition, where, notification, urgent, state, last 20 runs, cost estimate. Routines are not Activity events except Pause all / Resume all (`paused_routines` / `resumed_routines`, 08-0 §G.4); Delete is a soft delete (08-0 §G.5).
**Test ids.** Root `screen-routines`; `routines-new`, `routines-pause-all`; suggestion card `routines-suggestion` (`data-row-id` = suggestion key, 08-0 §G.13) with `routines-suggestion-make` and `routines-suggestion-dismiss`; row `routines-row` (`data-row-id` = routine id, `data-state` `on`/`paused`/`needs_fixing`); row toggle `routines-row-toggle`; detail rows `routines-detail-{name|checks|how-often|between|tells-you|where|urgent}`; `routines-run-now`, `routines-delete`; history row `routines-run` with `routines-run-fix`.
**Credits.** Grok routine detail, history and paused-while-away (GRK §4.5, §2 row 23); ChatGPT "tell me only if" and schedule fields (GPT §2, §9.7); Manus run once first and failure alerts (MNS §9.6, §9.15); OpenClaw silent runs, cost per routine, duplicate check (OCL §3.3, §9.8, §9.9); Gemini suggested schedules (GEM §9.7); Poke stale review (POK §9.9).
