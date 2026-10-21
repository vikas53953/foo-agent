# 03 · Shell, part 2 of 2 (main shell contents, right shell, footers, keyboard, wireframes)

Read `03-shell-1.md` first: it holds the laws (§3.0), window (§3.1), title bar (§3.2), banner strip (§3.3), left shell (§3.4) and main shell frame (§3.5). Evidence keys are listed there.

---

## 3.6 Main shell contents

### 3.6.1 Composer area (reserved; owned by `04`)

- The composer is a separate grid row under the message list. Its height is set by `04` (it grows with text). The shell MUST NOT assume a fixed height.
- The message list's bottom padding = `--s3` 16 (the composer row is outside the scroller, so nothing hides under it).
- The scroll-to-bottom button (§3.6.6) is positioned relative to the composer row's top edge.
- The composer has **no footer line** under it in v1. AGT §10 suggested "foo works on your PC…"; AIC #23 says none `[foo decision: no disclaimer; first-run note instead, J1]`.

### 3.6.2 Chat header (lower header)

```
x=0 16                                                                                   W-16
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│[16][←36 XS only](avatar 40)[12] Name (--t-subtitle)    [Watch live][4][ø][4][⌕][4][▯][4][⋯]│ 60px
│                              Status line (--t-caption)                                    │
└──────────────────────────────────────────────────────────────────────────────────────────┘ 1px --line
```

`[ø]` = Private toggle (`EyeOff`; foo's chat and the private chat only, X-128); `[▯]` = Panel toggle.

| Part | Value | Evidence | Test id |
|---|---|---|---|
| Height | `--header-h` 60; aligns with the left header | `02` F5; MSG §2 WA 60–62 `[measured ±4]` | `chat-header` |
| Fill / border | `--bg-app`; 1px `--line` bottom | MSG §2 WA white header + 1px bottom `[measured]`; BP1 `.conv .ch{border-bottom}` `[exact]` | — |
| Padding | 0 `--s3` 16 | MSG §2 WA ≈16 `[measured]` | — |
| Back (XS only) | ArrowLeft 20 (new icon, §3.12) in `--icon-btn` 36, `aria-label="Back to chats"`, `--s1` gap to the avatar | WIN §3 back button at ≤640 `[exact: S3 E830]` | `chat-header-back` |
| Avatar | `--avatar-header` 40, same face rules as rows (living face with mood ring by default, `02` §F15.9 [X-35]; it shows the same mood as the row, §F15.9.3e; `Avatar`/`Face` per 02-2 §F15.9.9; groups: the §F15.6 cluster, no ring); letter faces `--t-subtitle` 16. Click → open profile (`06`). | MSG §2 WA 40 `[measured]` | `chat-header-avatar` |
| Avatar → text | `--s2` 12 | MSG §2 WA 12–15 `[measured]` | — |
| Name | `--t-subtitle` 16/22 600 `--fg-1`, 1 line, ellipsis; `app-region: drag`. In the private chat the name is "Private chat" with the private mark `EyeOff` 16 `--fg-2` before it (12-2 §12.30) | `02` F1 | `chat-header-name`, `chat-header-private-mark` |
| Status line | `--t-caption` 12/16, colour per §3.6.2.1, 1 line, ellipsis; `app-region: drag` | MSG §2 WA subtitle 13 `[measured]` → 12 caption `[foo decision: 02 roles]` | `chat-header-status` |
| Actions | gap `--s0` 4; order: Watch live (when shown) · Private toggle (foo's chat and the private chat only) · Find · Panel toggle · Options ⋯ (X-128; §3.6.2.2) | BP1 "Watch live" `[exact]`; MSG §2 WA search + ⋮ `[measured]`; AGT §2 live button + details toggle `[reported]` | §3.6.2.2 |

#### 3.6.2.1 Status line wording (final; first matching row wins)

| # | State (from the job runner) | Text | Colour |
|---|---|---|---|
| 1 | First-run setup not finished | "Setting up · step {n} of 4" | `--fg-2` |
| 2 | Any job NEEDS YOU in this chat | "Needs you: {card title}" (2+ cards: "Needs you: {n} things") | `--warn` |
| 3 | User has taken over the browser (J18) | "You're in control of the browser" | `--warn` |
| 4 | Jobs paused: offline | "Paused · you're offline" | `--fg-2` |
| 5 | Jobs paused: AI not answering / signed out | "Paused · {AI} isn't answering" / "Paused · signed out of {AI}" | `--fg-2` |
| 6 | Jobs paused: plan limit | "Paused · {AI} limit until {time}" | `--fg-2` |
| 7 | Jobs paused: AI cap | "Paused · AI cap reached" | `--fg-2` |
| 8 | foo / the helper is writing a reply | "typing…" | `--accent` |
| 9 | Exactly 1 job WORKING | "Working on {job title} · step {n} of {m}" (no step count known: "Working on {job title}") | `--accent` |
| 10 | 2+ jobs WORKING | "Working on {n} jobs" | `--accent` |
| 11 | Quiet hours on and idle | "Quiet until {time}" (not today: "Quiet until {day date}, {time}") | `--fg-2` |
| 12 | Idle, foo's chat | 8px `--ok` dot + "Awake on your PC" | `--ok` |
| 13 | Idle, helper chat | the helper's one-line job from its profile, e.g. "Plans trips and books travel" | `--fg-2` |
| 14 | Idle, group | members: "You, {agentName}, {helper names}" (truncated with "…") | `--fg-2` |

`[foo decision]` from BP1 "● awake on your PC" `[exact]` (sentence case per F10); AGT §16 Grok phrases "Working on your computer", "Waiting for you" `[exact: XCL]`; J19 pause reasons.

In foo's chat, rows 2–10 count jobs in foo's chat only; jobs in helpers' chats show in the right shell (§3.7.4), not here.

#### 3.6.2.2 Header actions

Order, left to right (X-128): Watch live (when shown) · Private toggle (foo's chat and the private chat only) · Find · Panel toggle (X-21) · Options ⋯. The table below is in this order.

| Action | Spec | States | Narrator name / tooltip | Test id |
|---|---|---|---|---|
| Watch live | `Button` `size="sm"`: `--btn-h-sm` 32, padding 0 `--s2`, radius `--r-full`, 1px `--line`, fill `--bg-raised`, `Window` icon 16 (the 02-2 §F14.5 "Watch live" icon) + "Watch live" `--t-body-strong`. **Shown only while a job in this chat has foo's browser open** (`JobRow` with a live browser session); hidden otherwise (no layout shift elsewhere: actions are right-aligned). Action: opens, or brings to the front, that job's **Live window** (`live.html`, a separate foo window; 08-0 §G.8, 09 §9.27) by `invoke('job:watch', { jobId, on: true })`; with 2+ such jobs in the chat it opens the most recently started one. It never replaces the right shell's content [FE-20]. | rest / hover / pressed / focus | "Watch live" / "Watch live (Ctrl+Shift+L)" | `chat-header-watch-live` |
| Private toggle | `EyeOff` 20 in `--icon-btn` 36, left of Find; shown only in foo's chat (off) and the private chat (on: filled icon, `aria-pressed="true"`); spec 12-2 §12.30 | rest / hover / pressed / focus / on / disabled (`data-state` `off` / `on` / `busy`) | per 12-2 §12.30 | `chat-header-private-toggle` |
| Find | Search 20 in `--icon-btn` 36, radius `--r-full` | rest / hover / pressed / focus / **on** (find bar open: fill `--bg-pressed`, `aria-pressed="true"`) | "Find in this chat" / "Find in this chat (Ctrl+F)" | `chat-header-find` |
| Panel toggle | PanelRight 20 in `--icon-btn` 36 | rest / hover / pressed / focus / **on** (right shell open: filled PanelRight icon, `aria-pressed="true"`, `aria-expanded="true"`) | "Details" / "Show details (Ctrl+Shift+D)" or "Hide details (Ctrl+Shift+D)" [settled: X-21] | `chat-header-panel` |
| More | MoreHorizontal 20 in `--icon-btn` 36 | rest / hover / pressed / focus / open | "Chat options" | `chat-header-more` |

**Chat options menu** (style §3.4.2), items in this order:

| Item | Shown when | Action | Test id |
|---|---|---|---|
| "Open profile" / "Group info" | always | `06` profile page | `chat-header-menu-profile` |
| "Mute notifications" ▸ "For 8 hours" · "For 1 week" · "Always" / "Unmute" | always | as §3.4.9 (`chat:mute`) | `chat-header-menu-mute` |
| "Pin to top" / "Unpin" | not on foo's chat | as §3.4.9 (`chat:pin`) | `chat-header-menu-pin` |
| "Stop all jobs in this chat…" | ≥ 1 job QUEUED/WORKING/WAITING/NEEDS YOU | confirm **C-13b** (06-3 §14, `dialog-c-13b`); J18 | `chat-header-menu-stop-all` |
| "Catch me up" | a `wa_mirror` chat (a WhatsApp group or chat foo mirrors) | opens foo's chat and runs Catch me up (12-2 §12.27) | `chat-header-menu-catch-up` |
| — separator — | | | — |
| "End private chat…" | the private chat only ("Clear messages…" is hidden there) | confirm **C-23** (`dialog-c-23`; 12-2 §12.30) | `chat-header-menu-end-private` |
| "Clear messages…" | always | confirm **C-1** (`dialog-c-01`) | `chat-header-menu-clear` |
| "Delete helper…" / "Delete group…" | not on foo's chat | confirm **C-5** / **C-6** / **C-7** as §3.4.9 | `chat-header-menu-delete` |

#### 3.6.2.3 Selection bar (multi-select mode) [FE-16]

While message multi-select mode is on (04 §1.9; `ui.selection` is non-empty or the mode was entered with "Select"), the chat header's 60px area is replaced in place by the selection bar. It is part of the main shell, not the app banner strip (§3.3), so app banners stay where they are.

| Part | Value | Test id |
|---|---|---|
| Bar | height `--header-h` 60, fill `--bg-app`, 1px `--line` bottom, padding 0 `--s3`; `role="toolbar"`, `aria-label="Selected messages"`; it takes the header's grid row so nothing below moves | `chat-header-selection` |
| Count | left: "{n} selected" (`--t-subtitle` `--fg-1`; ICU plural: "1 selected" / "{n} selected"); Narrator announces it politely on change | `chat-header-selection-count` |
| Copy | right group, first: `Button variant="secondary" size="sm"` "Copy"; copies per 04 §1.9; then the inline swap "Copied" for 2 s (02-3 §F21.1 rung 1); disabled while `{n}` = 0 | `chat-header-selection-copy` |
| Delete | `Button variant="destructive" size="sm"` "Delete" → confirm **C-25** (`dialog-c-25`) (04 §1.9); disabled while `{n}` = 0 | `chat-header-selection-delete` |
| Cancel | `IconButton` `Dismiss` 20, `aria-label="Cancel selection"`, tooltip "Cancel (Esc)"; Esc does the same (§3.9.4) | `chat-header-selection-cancel` |

Gaps: `--s1` 8 between the buttons. Leaving the mode (Cancel, Esc, after Delete, or switching chats) clears `ui.selection` and restores the normal header.

### 3.6.3 Find bar (in-chat search)

Opens under the chat header on Ctrl+F or the Find button (J22 step 7).

| Part | Value | Test id |
|---|---|---|
| Strip | height 52 (`--field-h` 36 + `--s1` top and bottom), padding 0 `--s3`, fill `--bg-app`, 1px `--line` bottom | `thread-find` |
| Field | `--field-h` 36, radius `--r-full`, fill `--bg-sunken`, Search 16 icon, placeholder "Find in this chat", `--t-small` | `thread-find-field` |
| Count | "{i} of {n}" `--t-caption` `--fg-2`, `tabular-nums`; no query: hidden; no match: "No matches" `--fg-2` | `thread-find-count` |
| Buttons | ChevronUp (new icon, §3.12) "Previous match", ChevronDown "Next match", each `--icon-btn` 36; Dismiss "Close find" | `thread-find-prev`, `thread-find-next`, `thread-find-close` |
| Match highlight | matched text background `--warn-soft`, current match 2px `--accent` outline radius `--r-xs` | — |

Keys: Enter = next, Shift+Enter = previous, Esc closes and returns focus to the message list. Search runs locally (J22 step 5). The list scrolls the current match to the vertical centre.

### 3.6.4 Message column

| Item | Value | Evidence | Test id |
|---|---|---|---|
| Max width | `--column-max` 760, centred in the main shell | `02` F5; AIC §4 ChatGPT 768, Perplexity 720 `[measured]` | — |
| Side padding | 24 (`--s5`) when the main shell is ≥ 900 wide, else 16 (`--s3`) | `02` F3 | — |
| Top padding | `--s3` 16 | | — |
| Bubble / card rules | `04` and `05` | | — |
| List semantics | `role="log"`, `aria-label="Messages with {name}"` (no `aria-live` on the list: new rows are announced through `announce()`, 02-3 §F25.2, 04 §1.8); each message is a list item named "{sender}, {full time}: {text}" (F9); streaming text is announced once when complete (WIN §17 `[inferred]`) | `02` F9; WIN §17 | `thread-log` |
| Virtualisation | `MessageList` (`src/renderer/messages/MessageList.tsx`) uses `@tanstack/react-virtual` `useVirtualizer` with `overscan: 8`, `measureElement` on every row and the per-kind estimates of 02-2 §F13.3 (bubble 56, card by `CARD_ESTIMATE`, marker 40, date separator 56); 60 fps with 5,000 messages (Article 28) [FE-15, FE-32] | | — |
| Stick to bottom | implemented only in `src/renderer/messages/useStickToBottom.ts`; `overflow-anchor` is **not** used (it does not work with absolutely positioned virtual rows). `atBottom = scrollHeight − scrollTop − clientHeight < 80` (re-checked on every scroll event). When rows are added or a row grows (streaming): if `atBottom` was true just before the change, call `virtualizer.scrollToIndex(lastIndex, { align: 'end' })` (instant); otherwise do not move and add the new rows' count to the scroll-to-bottom button (§3.6.6). The user sending a message always scrolls to the end. Streaming stops following per 04 §1.6 | MSG §4 Signal anchor `[exact: _modules.scss:4958-4986]`; AIC #25 80px `[foo decision]` | — |
| Scroll memory | the chat's `scrollTop` is saved in `ui.scroll[chatId]` when the user leaves the chat and restored when they return in the same session; a chat opened the first time in a session opens per §3.6.5 (unread divider, else the end) [FE-15] | §3.1.2 | — |
| Keyboard | message list is one Tab stop; ↑/↓ move between messages; PageUp/PageDown scroll one screen; Ctrl+Home oldest loaded, Ctrl+End newest; Enter on a card moves focus into the card | WIN §17 `[exact: S16 composite widgets]` | — |

### 3.6.5 Date separators and the unread divider

**Date separator** (one before the first message of each calendar day):

| Part | Value | Evidence | Test id |
|---|---|---|---|
| Chip | centred; height 24 (`--s5`); padding 0 `--s2`; radius `--r-full`; fill `--bg-sunken`; text `--t-caption` `--fg-2` | BP1 `.day` pill on the soft fill `[exact]`; MSG §4 WA chip `[measured]` | `thread-date` (`data-index`) |
| Spacing | `--s3` 16 above and below | `02` F3 | — |
| Copy | today: "Today, Fri 16 Oct"; yesterday: "Yesterday, Thu 15 Oct"; this year: "Wed 14 Oct"; other year: "Tue 14 Oct 2025" | Article 21 (relative word only in addition) | — |
| Sticky | while the user scrolls, the separator of the topmost visible day floats at `--s1` 8 below the header/find bar, fill `--bg-raised`, 1px `--line`, `--shadow-4` (dark: border only). It fades out `--m-normal` after `--delay-sticky-hide` (1500 ms, new token) without scrolling. Reduced motion: hides instantly. | MSG §4 Signal floating header fades `[exact: TimelineFloatingHeader.scss:7-27]`, WA sticky chip `[reported]` | `thread-date-sticky` |
| Narrator | `role="separator"` with the copy as name; the sticky copy is `aria-hidden` | — |

**Unread divider** ("{n} new messages"):

| Part | Value | Test id |
|---|---|---|
| Shown | when a chat opens with unread messages, before the first unread message | — |
| Look | full column width; 1px `--accent` line on both sides of a centred label; label `--t-caption-strong` (no uppercase) `--accent`; `--s2` 12 above and below | `thread-unread-divider` |
| Copy | "1 new message" / "{n} new messages" | — |
| Position on open | the chat opens scrolled so the divider sits 1/3 down the visible list; if all unread fit, scroll to bottom with the divider visible | — |
| Removed | when the user leaves the chat or sends a message in it | — |
| Narrator | `role="separator"`, name = the copy | — |

MSG §4 Signal "last seen" bar `[exact: _modules.scss:5049-5073]`, WA band `[reported]` → `[foo decision]` line + label.

### 3.6.6 Scroll-to-bottom button

| Part | Value | Evidence | Test id |
|---|---|---|---|
| Size | 40 × 40 (`--btn-h` primary 40; meets the 40px target), radius `--r-full` | MSG §4 WA ≈40 `[measured]`; `02` F5 touch target | `thread-jump-latest` |
| Look | fill `--bg-raised`, 1px `--line`, `--shadow-4`; ChevronDown 20 `--fg-2`; hover `--bg-hover`, icon `--fg-1` | MSG §4 Signal shadow `[exact: ScrollDownButton.scss:19-21]` | — |
| Position | right `--s3` 16 from the main shell's right edge; bottom `--s3` 16 above the composer row | MSG §4 Signal 16/12, WA ≈18 `[measured]` | — |
| Shown | when the user is more than one screen height above the bottom; fade `--m-normal` | | — |
| Count | messages that arrived while scrolled up (X-152): the button widens into a pill "↓ {n} new" (height 40, padding 0 `--s3`, `--t-body-strong`, `ChevronDown` 16 + 4px gap), "99+" cap; with no new messages it stays the round 40px button | MSG §4 `[exact/measured]` | `thread-jump-latest-count` |
| Action | smooth-scroll to the newest message (`--m-slow`); reduced motion: jump | | — |
| Narrator | "Go to newest message" / with count "Go to newest message, {n} new" | | — |

### 3.6.7 Load older

| Case | Shown | Test id |
|---|---|---|
| User scrolls within 600px of the top of loaded history | load the previous 50 messages; keep the scroll anchor so nothing jumps | — |
| Loading takes > 150 ms | a 40 × 40 `--bg-raised` circle with the F7 spinner ring (20px, `--accent`) centred `--s2` above the oldest message; Narrator status "Loading older messages" | `thread-load-older` |
| Start of history | the 04 §19.5 system line (`marker_kind = start_of_chat`), centred, `--t-caption` `--fg-3`, 24 above the first date separator: "Start of your chat with {name} · made {Fri 16 Oct 2026}" (foo's chat: "Start of your chat with {agentName}") — the one string of 02-2 §F16.3 E-1 [X-33, FE-13, UX-13] | `thread-marker` `data-state="start_of_chat"` |
| Load failed | system line "I couldn't load older messages." + text button "Try again" | `thread-load-older`; button `thread-load-older-retry` |

MSG §4 WA ↻ circle `[measured]`.

---

## 3.7 Right shell (details panel)

### 3.7.1 Frame and open/close

| Item | Value | Evidence |
|---|---|---|
| Width | `--panel-w` 340, fixed (no resize) | `02` F5 |
| Fill / edge | `--bg-app`; 1px `--line` left edge | BP1 `.rail{border-left;background:var(--bg)}` `[exact]` |
| L (≥ 1280) | third grid column; **pushes** the main shell; open by default (X-91); open/closed state persists in `settings.json → window.rightShellOpen` (08-0 §A); the M/S overlay uses the non-persisted `ui.rightShellOpenOverlay` | BP1 three columns `[exact]`; MSG §9 WA push-in drawer `[measured]` |
| M, S (640–1279) | **overlay** sheet anchored to the right edge under the banner strip, full content height, `--shadow-28` (dark: border only), no scrim; closed by default; not persisted | WIN §9 overlay below 1008 `[inferred]` |
| XS (< 640) | full window page replacing the chat view; header shows ArrowLeft "Back to chat" | |
| Open / close motion | slide 340px, `--m-slow` `--ease-in` to open, `--m-normal` `--ease-out` to close; reduced motion: instant (`02` F7) | `02` F7 |
| Opened by | header Panel toggle; Ctrl+Shift+D [settled: X-21]; tapping a checklist card's "See steps" (`05`), which opens the panel scrolled to Doing now with that job's row focused. Nothing opens a live view inside the panel: Watch live always opens the separate Live window (§3.6.2.2, §3.7.3.1; 08-0 §G.8) [FE-20] | |
| Closed by | Panel toggle; Ctrl+Shift+D; Esc while focus is inside it (all modes); clicking outside it (overlay modes only); Dismiss button in its header | AGT §18 "a right panel that can't close" is an anti-pattern `[reported]` |
| Focus | opening by keyboard moves focus to the panel header title; closing returns focus to the Panel toggle | WIN §17 `[exact: S16]` |
| Landmark | `<aside aria-label="Details for {name}">` | WIN §17 `[inferred]` |
| Content | always about the **open** chat; switching chats re-renders it within the same 100 ms budget | |

### 3.7.2 Panel header

60px (`--header-h`), padding 0 `--s3`, 1px `--line` bottom: title "Details" `--t-subtitle`, Dismiss 20 in `--icon-btn` 36 (`aria-label="Close details"`) at the right. At XS the left of the title shows `ArrowLeft` 20 in `--icon-btn` 36, `aria-label="Back to chat"`.

Test id: `app-panel` (the `<aside>`), `app-panel-close` (Dismiss), `app-panel-back` (XS back). Sections: `app-panel-doing`, `app-panel-using`, `app-panel-know` (or `app-panel-members` in a group, §3.7.4), `app-panel-spent`.

### 3.7.3 Sections

The panel body scrolls. Sections are stacked with padding `--s3` 16 on all sides and a 1px `--line` between sections. Section label: `--t-caption-strong`, `text-transform: uppercase`, tracking +0.08em, `--fg-3`, `--s1` 8 below it. Labels are `<h2>` for Narrator heading navigation.

`[exact: BP1 .rail h4 uppercase tracked small label; .blk sections "Doing now / Using / What I know about you / Spent this month"]`

```
┌─────────────────── 340 ───────────────────┐
│ Details                                ✕  │ 60
├───────────────────────────────────────────┤
│ DOING NOW                                 │
│ ◔ Goa stay                         [■]    │ 48 rows
│   Step 3 of 4 · Waiting for you           │
│ ✓ Mom's cake                              │
│   Done 7:12 AM                            │
│ See all (6)                               │
├───────────────────────────────────────────┤
│ USING                                     │
│ (Gmail) (Calendar) (Browser) (Claude…)    │ 24 chips
├───────────────────────────────────────────┤
│ WHAT I KNOW ABOUT YOU                     │
│ ┌ Likes beach stays, hates early flights ┐│
│ └ You said · 3 Oct · Edit               ┘│
│ ┌ Budget trips under ₹40k               ┐│
│ └ I guessed · from 2 trips · Edit       ┘│
│ See all (24)                              │
├───────────────────────────────────────────┤
│ SPENT THIS MONTH                          │
│ AI          ₹212 of ₹1,000                │
│ ▓▓░░░░░░░░░░░░░░░░░░  (4px meter)         │
│ Purchases   ₹15,779 of ₹25,000            │
│ ▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░                      │
│ Change caps                               │
└───────────────────────────────────────────┘
```

#### 3.7.3.1 Doing now

**Jobs tabs (X-148).** The section label "DOING NOW" is followed by a 3-segment control (06 §0.4 segmented, 32 visual / 40 hit, full width): "In progress" (default; the rows below), "Scheduled" (this chat's routines with their next run, "{routine name} · next {Sat 17 Oct, 9:00 AM}", glyph `ArrowRepeatAll` 16 `--fg-2`, click opens Routines at it) and "Done" (jobs DONE/FAILED/CANCELLED in the last 7 days, newest first, same row style). Each tab keeps the 5-row max and "See all ({n})". Empty lines: "Nothing running. Ask me to do something and you'll see it here." / "No routines in this chat yet." / "Nothing finished in the last 7 days." Test ids `app-panel-jobs-tab` (`data-state` `progress|scheduled|done`). Groups: same tabs, showing all members' jobs in the group.

| Item | Value | Test id |
|---|---|---|
| Content | jobs per §3.7.4, ordered: NEEDS YOU, WORKING, QUEUED, WAITING, then DONE/FAILED finished today | `app-panel-doing` |
| Max | 5 rows (at most 2 of them finished); "See all ({n})" text link (`--accent`, `--t-small`) → `06` Activity filtered to this chat (foo's chat: unfiltered) | `app-panel-doing-see-all` |
| Row | min-height 48 (`--s8`), radius `--r-sm`, padding `--s1` `--s1`, hover `--bg-hover`; glyph 16 · gap `--s1` · two lines · optional Stop | `app-panel-doing-row` (`data-row-id`, `data-index`, `data-state`) |
| Glyph | WORKING: F7 spinner ring 16 `--accent`; QUEUED: Clock 16 `--fg-3`; WAITING: Clock 16 `--fg-2`; NEEDS YOU: Warning 16 `--warn`; DONE: CheckmarkCircle 16 `--ok`; FAILED: ErrorCircle 16 `--bad` | — |
| Line 1 | job title `--t-small` `--fg-1`, ellipsis. In foo's chat, a job that belongs to another chat is prefixed by "{chat name} · " in `--fg-2` | — |
| Line 2 | `--t-caption` `--fg-2`: WORKING "Step {n} of {m} · {current step}"; QUEUED "Waiting for another job to finish" (a QUEUED job whose Plan card waits for Go is shown as NEEDS YOU: Warning glyph, "Needs you: {job title}", `data-state="needs_you"`, ordered with NEEDS YOU; CR-0028, X-186); WAITING "Paused · {reason}"; NEEDS YOU "Needs you: {card title}" in `--warn`; DONE "Done {time}"; FAILED "Didn't finish · {time}" | — |
| Watch live | rows whose job has foo's browser open show `IconButton` `Window` 16 (02-2 §F14.5) at the right, before Stop, on hover or row focus and always while the row is NEEDS YOU for a sign-in; `aria-label="Watch {job title} live"`, tooltip "Watch live (Ctrl+Shift+L)"; opens that job's Live window exactly as the header button (§3.6.2.2) [FE-20] | `app-panel-doing-watch-live` |
| Stop | rows in QUEUED/WORKING/WAITING/NEEDS YOU show Stop 20 in a 36 button at the right on hover or row focus, `aria-label="Stop {job title}"` → J18 confirm | `app-panel-doing-stop` |
| Open the window | the section header's `IconButton` `ArrowMaximize` 16 (06 §0.11, `md` 36) "Open the window" opens the Live window for the first row whose job has foo's browser open (§3.6.2.2); hidden when no row has one | `app-panel-doing-open` (X-138) |
| Click / Enter | opens the job's chat (if different) and scrolls to its checklist card, which flashes `--accent-soft` for 2 s (reduced motion: static `--accent-soft` for 2 s) | — |
| Empty | "Nothing running. Ask me to do something and you'll see it here." `--t-small` `--fg-2` | `app-panel-doing` with `data-empty` |

`[exact: BP1 "Goa stay · step 3 of 4", "Mom's cake · done 7:12"]`; AGT §9 Cowork Progress `[reported]`.

#### 3.7.3.2 Using

| Item | Value | Test id |
|---|---|---|
| Content | `{AI}` chip always first ("{AI} (your AI)"), then every app or tool a job in this chat used in the last 24 h or is using now, most recent first: Gmail, Calendar, WhatsApp, Browser, Files, and so on | `app-panel-using` |
| Chip | height 24 (`--s5`), padding 0 `--s1`, radius `--r-full`, fill `--bg-sunken`, 1px `--line`, app icon 16 + name `--t-caption` `--fg-1`, gap `--s0`; chips wrap with `--s0` gaps | `app-panel-using-chip` (`data-index`) |
| In use now | chip gets an 8px `--accent` dot before the name and Narrator suffix ", in use now" | — |
| Max | 8 chips, then "+{n}" chip that expands the list in place | `app-panel-using-more` |
| Click | opens Settings → Connections at that app (`06`); the AI chip opens Settings → Account & your AI [settled: X-07] | — |
| Empty | only the AI chip, plus the line "No apps used here yet." `--t-caption` `--fg-3` | `app-panel-using` with `data-empty` |

`[exact: BP1 chips "Gmail · Calendar · Browser · Claude (your AI)"]`

#### 3.7.3.3 What I know about you

| Item | Value | Test id |
|---|---|---|
| Label per chat | foo: "What I know about you"; helper: "What {name} knows"; group: hidden (see §3.7.4) | `app-panel-know` |
| Content | up to 3 memory facts most relevant to this chat (most recently used by a job in this chat, then newest) | — |
| Fact | bordered tile: 1px `--line`, radius `--r-md`, padding `--s1` `--s2`, gap 2px (`--s-1`); text `--t-small` `--fg-1`; meta `--t-caption` `--fg-3`: "You said · {d Mon}" or "I guessed · {reason}", then " · " and text link "Edit" (`--accent`) | `app-panel-know-fact` (`data-row-id`) |
| Edit | opens `06` Memory with that fact in edit mode | `app-panel-know-edit` |
| More | "See all ({n})" → `06` Memory | `app-panel-know-see-all` |
| Private facts | facts marked private are never shown in this panel while a group chat is open (Article 14) | — |
| Empty | "Nothing yet. Tell me things like "I'm vegetarian" and I'll remember." `--t-small` `--fg-2` | `app-panel-know` with `data-empty` |

`[exact: BP1 .mem tiles "You said · 3 Oct · edit", "I guessed · from 2 trips · edit"]`; "Edit" capitalised per F10 sentence case.

#### 3.7.3.4 Spent this month

Article 13: both caps are always visible here (except in groups, §3.7.4).

| Item | Value | Test id |
|---|---|---|
| Rows | "AI" and "Purchases". Each: label `--t-small` `--fg-2` left; amount `--t-small` `--fg-1` `tabular-nums` right ("{spent} of {cap}"); under it a meter | `app-panel-spent-ai`, `app-panel-spent-buy` (each the `role="meter"` row) |
| Meter | 4px tall (`--s0`), radius `--r-full`, track `--bg-sunken`, fill `--accent`; 80–99 %: fill `--warn` and amount `--warn`; ≥ 100 %: fill `--bad`, amount replaced by "Cap reached · {cap}" in `--bad` | — |
| Plan-based AI | AI row shows "Uses your {AI} plan" and no meter; when the AI reports usage, a second line "{AI} plan: {p}% used this {period}" `--t-caption` `--fg-2` (J19.2 step 5) | — |
| Action | text link "Change caps" → Settings → Money [settled: X-07] | `app-panel-spent-change` |
| Narrator | each meter `role="meter"` with `aria-valuenow`, `aria-valuemax`, name "AI spend this month, ₹212 of ₹1,000" | — |

BP1 shows "₹2,140 of ₹10,000 cap"; Article 13 defaults are ₹1,000 AI and ₹25,000 purchases (§3.13).

### 3.7.4 Per-chat differences

| Section | foo's chat | Helper chat | Group chat | Test id |
|---|---|---|---|---|
| Doing now | **every** job in every chat (foo oversees all); rows from other chats prefixed "{chat name} · " | this helper's jobs only | jobs started in this group only | `app-panel-doing` |
| Using | apps used by any job in the last 24 h | apps this helper used (limited by its app access, J15) | apps used by jobs in this group | `app-panel-using` |
| What I know | "What I know about you", general facts | "What {name} knows", the helper's notes | replaced by **"In this group"**: one row per member (26 avatar + name; "You" first), and the line "Private things stay in your own chats." (Article 14) | `app-panel-know` / group: `app-panel-members` |
| Spent this month | AI + Purchases | AI + Purchases (global totals) | hidden (money stays out of groups, Article 14) | `app-panel-spent` |

---

## 3.8 Footers and status bar

| Footer | v1 decision | Evidence |
|---|---|---|
| App status bar | **none** | MSG §10 none in WA/Signal/TG `[exact/measured]`; WIN §10 `[inferred]`; HRM's 20px status bar is a developer pattern `[exact]` → not for non-technical users `[foo decision]` |
| Banner strip | §3.3 (the only app-wide status surface) | |
| Sidebar footer | §3.4.11 | |
| Composer area | reserved, owned by `04` (§3.6.1) | |
| Composer footer / disclaimer | none | AIC #23 `[foo decision]` |
| In-app toasts | none in the shell; transient confirmations are visible status lines placed by the surface that caused them and spoken with `announce()` (02-3 §F25.2) (`04`/`05`/`06`) | `[foo decision]` |

---

## 3.9 Keyboard and focus (shell)

### 3.9.1 Tab order

Title bar (none) → banner → left shell (menu buttons, search, chips, list, footer) → main shell (header actions, find bar, message list, composer) → right shell. Tab follows visual order. The chat list, chips, message list and Doing now list are each **one** Tab stop with arrow keys inside (roving tabindex). `[WIN §17 exact: S16]`

### 3.9.2 F6 pane cycle (hand-built)

F6 moves focus forward, Shift+F6 backward, wrapping, skipping panes that are not visible:

| # | Pane | Focus lands on | Test id |
|---|---|---|---|
| 1 | Banner (only if shown) | its button | `banner-action` |
| 2 | Left shell | the selected chat row (or the first row) | `chatlist-row` |
| 3 | Message list | the last focused message, else the newest | `bubble-*` row in `thread-log` |
| 4 | Composer | the text field | `composer-field` |
| 5 | Right shell (only if open) | the panel title | `app-panel` title |

At XS: list view cycles 1 → 2; chat view cycles 1 → 3 → 4 (→ 5 is a separate page). `[WIN §17 exact: S16 "must be implemented manually"]`

### 3.9.3 Chat list keys

| Key | Action |
|---|---|
| ↑ / ↓ | move focus between rows (does not open) |
| Home / End | first / last row |
| Enter or Space | open the focused chat; focus moves to the composer |
| Shift+F10 or Menu key | row context menu (§3.4.9) |
| Type a letter | focus jumps to the next chat whose name starts with it |
| Ctrl+1 … Ctrl+9 | open the chat at that position in the current list (anywhere in the app) |
| Alt+↓ / Alt+↑, Ctrl+Tab / Ctrl+Shift+Tab | open the next / previous chat (anywhere in the app) |
| Alt+Shift+↓ | open the next chat that needs you |

MSG §17 Signal/WA shortcut tables `[exact/reported]`; WIN §3 arrows + Enter `[exact: S16]`. Full table in `09` §9.17.

### 3.9.4 Esc ladder

Esc does exactly one thing, the first that applies: close an open menu, popover or tooltip → close a dialog → leave multi-select mode (§3.6.2.3) → close the find bar → close the right shell (when focus is inside it or it is an overlay) → clear the search field → on a Page (`View.kind` = `settings` or `screen`) go back one step (`back()`, §3.9.6) → at XS chat view, go back to the list. Esc never quits, never closes the window and never approves or declines a card. Composer-owned Esc meanings (04-2 §22.9) run first when focus is in the composer. Implemented once in `useEscLadder` (02-3 §F25.3). `[WIN §17 reported; HRM "one Esc does one thing" exact: DESIGN.md:498-513]`

### 3.9.5 Narrator summary

| Element | Role | Name | Test id |
|---|---|---|---|
| Left shell | `navigation` | "Chats" | `sidebar` |
| Chat list | `listbox` | "Chat list" | `chatlist` |
| Chat row | `option`, `aria-selected` | "{name}, {pill word if any}, {n} unread messages if any, pinned if pinned, muted if muted, {preview}, {full time}" — e.g. "Money, needs you, 1 unread message, Needs your OK: Airtel bill ₹1,179, Fri 16 Oct, 8:02 AM" | `chatlist-row` |
| Main shell | `main` | "Chat with {name}" | `thread` |
| Chat header name | `heading` level 1 | "{name}" | `chat-header-name` |
| Status line | `status` (polite) | the line's text; changes are read once | `chat-header-status` |
| Message list | `log` | "Messages with {name}" | `thread-log` |
| Right shell | `complementary` | "Details for {name}" | `app-panel` |
| Banner | `status` / `alert` | its text | `banner-strip` |
| Icon-only buttons | `button` | as listed in each table, always with a tooltip showing the shortcut | — |

### 3.9.6 Navigation, store and IPC (binding; 08-0 §G.9, §G.10, X-67, X-68) [F-022, F-023]

The shell owns how the renderer moves between places. Names are 08-0's; the routes, the `ui` slice (navigation) and the deep-link map are 08-0 §G.9, §G.10 and 08-5 §5 (X-111).

| Item | Rule |
|---|---|
| Router | **None.** No router library and no URL or hash routes. |
| Where you are | `ui.view: View` in the `ui` slice, `src/renderer/store/ui.ts`. `View = { kind: 'chat'; chatId } \| { kind: 'settings'; page: SettingsPage; row?: string } \| { kind: 'screen'; id: ScreenId; params? }` (FE-06; `SettingsPage` 08-0 §B.2; `ScreenId` 08-0 §B.2, which includes `ideas`). The Ideas page is `{ kind: 'screen', id: 'ideas' }`: the sidebar item "Ideas" calls `navigate({ kind: 'screen', id: 'ideas' })` and `foo://ideas` arrives as the event `navigate { view: { kind: 'screen', id: 'ideas' } }` (X-110). At L/M/S the shell always shows the chat list; `settings` and `screen` views replace the main and right shells (06 Page). |
| Moving | `navigate(view)` pushes the current view onto `ui.back` (max 10; the 11th push drops the oldest) and sets `ui.view`; `back()` pops; with an empty stack, `back()` goes to `{ kind: 'chat', chatId: settings.window.lastChatId ?? fooChatId }`. Opening a chat while the current view is already a chat replaces it without pushing (chat to chat is not "back"). |
| Dialogs and overlays | `ui.dialog` holds at most one dialog id; opening a dialog closes menus and tooltips; a second dialog request waits until the first closes. Dialogs are not views and never enter `ui.back`. |
| Deep links | Main parses `foo://` (08-0 §G.9) and sends the event `navigate { view: View; act?: string }`; the renderer calls `navigate(view)` and then runs `act` (`review`, `not_now`, `read`, `choice:{optionId}`) on the target card. The renderer never parses `foo://` strings. |
| Store | One Zustand store, `src/renderer/store/index.ts`, one file per slice in `src/renderer/store/`: `ui` and `live` (08-0 §G.10) and the data slices `chats`, `messages`, `cards`, `jobs`, `connections`, `spend`, `settings` (08-5 §5, X-117). Rows are 08-0 §B types. A patch event applies only when `patch.rev > stored.rev` (08-0 §B.1); selectors are named `selectX` and live beside their slice. Components never subscribe to the whole store. |
| IPC | Components never touch `window.foo`. They use `invoke(channel, payload)` from `src/renderer/ipc/client.ts` (typed by the 08-1 §3 channel maps, 15 s timeout → `IpcTimeoutError`) and `useFooEvent(channel, handler)` for events (FE-25). |
| Read marks (X-117) | The renderer sends `chat:markRead { chatId, upToSeq }` when all three hold: the chat is selected, the window is focused (`live.windowFocused`) and the message with that `seq` has been ≥ 50 % visible for 500 ms (one IntersectionObserver on the virtual list, `useMarkRead`). It is sent at most once per 2 s per chat with the highest visible `seq`. On window focus the check runs again at once. Main owns the unread count and the 'window is focused on that chat' toast rule from the same call; the renderer never computes unread locally. |
| Slices, sends, deltas, pages | Store slices, optimistic send, deltas and pagination: 08-5 §5. |
| Separate windows | `live.html`, `viewer.html`, `signin-banner.html` (08-0 §E.3 `windows/`) each have their own `main.tsx` and their own small store; they never share the main window's store. |
| Focus and keys | F6 ladder §3.9.2, Esc ladder §3.9.4, focus return and roving tabindex: 02-3 §F25.3. |

---

## 3.10 Wireframes (px at 100 %)

### 3.10.1 L — 1440 × 900, right shell open

```
x=0                     340                                                    1100            1440
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ (drag strip, --bg-sidebar)                                              [ — ][ ☐ ][ ✕ ]    │ 0–32  title bar 32
├──────────────────────────────────────────────────────────────────────────────────────────────┤ (+40 banner when shown)
│ foo        [+ New helper][⋯] │(f40) foo                  [Watch live][ø][⌕][▯][⋯] │ Details      ✕ │ 32–92  headers 60
│                              │      ● Awake on your PC                             │────────────────│
│ ( ⌕ Search chats        ) 36 │─────────────────────────────────────────────────────│ DOING NOW      │
│ (All)(Needs you 1)(Working 1)│        ┌──────── column max 760 ────────┐           │ ◔ Goa stay  ■  │
│ (Done)               chips 32│  24 ←  │      ( Today, Fri 16 Oct )       │ → 24      │  Step 3 of 4   │
│▌(f48) foo           9:41 AM  │        │  ┌ foo bubble / card ┐           │           │ USING          │
│       Pick a stay and…   (2) │        │  └───────────────────┘           │           │ (Gmail)(Cal)…  │
│ (M48) Money         8:02 AM  │        │           ┌ your bubble ┐  ✅    │           │ WHAT I KNOW…   │
│       Needs your OK…[Needs you]│      │           └─────────────┘        │           │ ┌fact tile──┐  │
│ (T48) Trips         9:38 AM  │        │                              (⌄) │ 40 btn    │ └───────────┘  │
│       Comparing… [Working] 📌│        └──────────────────────────────────┘           │ SPENT THIS MON │
│  rows 72, inset 8            │                                                     │ AI ₹212/₹1,000 │
│──────────────────────────────│  (composer area, height from 04)                    │ ▓░░░░░░        │
│(V26) Vikas · ● Claude ready ⚙│                                                     │                │ 836–900 footer 64
│      ₹212 of ₹1,000 AI…      │                                                     │                │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
 left 340 (300–460)              main 760 (min 480)                                    right 340 push
```

### 3.10.2 M — 1100 × 760, right shell opened as overlay

```
x=0                      340                                         760              1100
┌────────────────────────────────────────────────────────────────────────────────────┐
│ (drag strip)                                                        [ — ][ ☐ ][ ✕ ]│ 32
├──────────────────────────┬─────────────────────────────────────────────────────────┤
│ foo     [+ New helper][⋯]│(f40) foo   ● Awake on your PC    ┌──────────── 340 ─────┐│ 60
│ ( ⌕ Search chats )       │──────────────────────────────────│ Details           ✕ ││
│ (All)(Needs you 1)…      │   column = 760 − 2×24 = 712      │ DOING NOW            ││
│ rows 72                  │                                   │ …                    ││ overlay,
│                          │                                   │ --shadow-28, no scrim││ closes on Esc /
│                          │                                   │                      ││ outside click
│ footer 64                │  composer (04)                    └──────────────────────┘│
└──────────────────────────┴─────────────────────────────────────────────────────────┘
 left 340 (300–400)          main 760 (min 520)
```

### 3.10.3 S — 800 × 600

```
x=0              300                                               800
┌────────────────────────────────────────────────────────────────────┐
│ (drag strip)                                       [ — ][ ☐ ][ ✕ ]│ 32
├──────────────────┬─────────────────────────────────────────────────┤
│ foo  [+ New…][⋯] │(f40) Trips                        [⌕][▯][⋯]    │ 60 (Watch live label
│ ( ⌕ Search )     │      Working on Delhi flights · step 2 of 5    │     shows when active)
│ (All)(Needs you)…│─────────────────────────────────────────────────│
│ rows 72          │  side padding 16 (main < 900)                  │
│                  │  column = 500 − 32 = 468                        │
│ footer 64        │  composer (04)                                  │
└──────────────────┴─────────────────────────────────────────────────┘
 left 300 fixed      main 500 (min 340); right shell = 340 overlay
```

At S the "+ New helper" button keeps its label down to a left-shell width of 300; it never collapses to an icon.

### 3.10.4 XS — 400 × 700

```
List view                               Chat view                           Details page
┌──────────────────────────────┐      ┌──────────────────────────────┐    ┌──────────────────────────────┐
│ (drag)          [—][☐][✕]    │ 32   │ (drag)          [—][☐][✕]    │    │ (drag)          [—][☐][✕]    │
│ foo     [+ New helper][⋯]    │ 60   │[←](f40) foo     [ø][⌕][▯][⋯] │ 60 │[←] Details                   │ 60
│ ( ⌕ Search chats )           │      │     ● Awake on your PC       │    │ DOING NOW …                  │
│ (All)(Needs you 1)(Working 1)│      │──────────────────────────────│    │ USING …                      │
│ (Done)                       │      │ padding 16, column 368       │    │ WHAT I KNOW …                │
│ rows 72 full width (inset 8) │      │                              │    │ SPENT THIS MONTH …           │
│ footer 64                    │      │ composer (04)                │    │                              │
└──────────────────────────────┘      └──────────────────────────────┘    └──────────────────────────────┘
 Enter / click → chat view             ← "Back to chats"                    ← "Back to chat"
```

At XS the "Watch live" button shows its icon only (label hidden, name kept for Narrator) when the header is narrower than 440.

---

## 3.11 Acceptance checks for this chapter (feed `10`)

| # | Given / When / Then |
|---|---|
| 3.11.1 | Given a window at 1440 wide, when foo opens, then three columns show at 340 / 760 / 340 and the right shell is open. |
| 3.11.2 | Given 1100 wide, when Ctrl+Shift+D is pressed, then the right shell overlays the chat without moving it, and Esc closes it and returns focus to the Panel toggle. |
| 3.11.3 | Given 600 wide, then only one of list or chat is visible and the chat header shows a back button named "Back to chats". |
| 3.11.4 | Given Money needs you and Trips is pinned, then Money is listed above foo and Trips. |
| 3.11.5 | Given a job enters NEEDS YOU, then within 1 s the row pill reads "Needs you", the chip count rises by 1 and the header status line starts with "Needs you:". |
| 3.11.6 | Given 225 % text size, then no row, header, chip or banner text is clipped (rows grow taller). |
| 3.11.7 | Given the internet is off for 10 s, then exactly one offline line is visible (the banner) and it has one button "Try again". |
| 3.11.8 | Given F6 is pressed repeatedly with the panel open and no banner, then focus visits list → messages → composer → panel → list. |
| 3.11.9 | Given high contrast is on, then every pill, badge and selected row is readable without colour (word or icon present) and no shadow is drawn. |
| 3.11.10 | Given a group chat is open, then the right shell shows "In this group" instead of memory and no "Spent this month" section. |
| 3.11.11 | Given the title bar, then Snap Layouts appear on hovering the maximize button, and double-clicking the empty strip maximizes the window. |

---

## 3.12 New tokens requested

[settled: all present in `02-foundations.md` (F1, F5, F6, F7) as of 2026-10-16]

| Token | Light | Dark | Used for | Reason |
|---|---|---|---|---|
| `--t-wordmark` | Segoe UI Variable Display 24/32, weight 800, tracking −0.05em | same | "foo" wordmark in the left shell header | `02` F0 defines the wordmark style but no size outside splash (`--t-display` 40). BP1 uses 24px `[exact: BP1 .side .head b]`. |
| `--field-h` | 36px | 36px | search field, find-in-chat field | No field-height token in `02`; WA search pill 36–38 `[MSG §3 measured]`. Reusing `--icon-btn` (a hit area) for a field height would mix meanings. |
| `--delay-sticky-hide` | 1500ms | 1500ms | how long the sticky date chip stays after scrolling stops | `02` F7 has durations, not delays; Signal fades its floating header on scroll stop `[MSG §4 exact: TimelineFloatingHeader.scss]` |

**New icons requested** (add to `02` F6 required list; all exist in Fluent UI System Icons Regular):

| Icon | Used for |
|---|---|
| ArrowLeft | XS back buttons ("Back to chats", "Back to chat") |
| ChevronUp | find bar "Previous match" |
| AlertOff | muted chat indicator |
| CloudOff | offline banner |
| ArrowSync | update-ready banner |

---

## 3.13 Conflicts found (spec wins; logged for `GAPS.md`)

| # | Evidence says | This chapter decides | Why |
|---|---|---|---|
| 1 | WIN §1.2: 48px title bar with centred search; Mica (M3, M5) | 32px empty strip, solid `--bg-sidebar`, no Mica | `02` F5 `--titlebar-h` 32 and F2 solid surfaces outrank evidence; BP1 shows a plain strip |
| 2 | J1 step 6: first window 1100 × 720; WIN 1100 × 760; HRM ≥ 1280×820 | 1280 × 800 clamped to 90 % of the work area | lands in L so BP1's three columns show on common 1920×1080 screens [settled: X-14] |
| 3 | BP1: rows full-bleed with 1px separators; selected row = white fill | rows inset 8, radius 8, no separators; selected = `--bg-selected` + 3px accent bar | `02` F2/F4 ("chat rows (inset)", "plus 3px accent bar") |
| 4 | BP1 right rail: "₹2,140 of ₹10,000 cap" (one AI number) | two meters: AI (default cap ₹1,000) and Purchases (default cap ₹25,000) | Article 13 requires both caps visible; BP1 number was an example of a raised cap (J21 §6) [settled: X-15] |
| 5 | J19.1: a second offline bar above the composer | one banner under the title bar only; `04` changes the composer placeholder | Article 29 "one line with one fix button" [settled: X-13] |
| 6 | AIC #33 / AGT §9 right panel 360; WIN §9 320 | 340 (`--panel-w`) | `02` F5 |
| 7 | MSG / WIN sidebar defaults 320–360 | 340 default, 300–460 | `02` F5 `--sidebar-w` |
| 8 | J §0: side panel collapses under 900 px | collapses (overlay) under 1280 | 340 + 340 + 600 main needs 1280 |

## 3.14 Copy keys (binding; 08-0 §D) [F-011]

Every string in this chapter lives in `src/shared/copy/en-IN.json` under these keys and is read with `t()`. The exact English is the "quoted" text in the section named; this table fixes only the key, so the text is written once. Plural and variable strings use ICU (`{count, plural, …}`, `{name}`).

| Key prefix | Slots | Strings in |
|---|---|---|
| `app.window` | `title` | §3.2.2 |
| `banner.{BannerType}` | `text`, `action`; `plan_limit.text.no_time`; `update_ready.dismiss` | §3.3.2 |
| `banner.strip` | `dismiss` | §3.3.1 |
| `sidebar.header` | `wordmark` | §3.4.2 |
| `sidebar.new_helper` | `label`, `tooltip`, `tooltip.disabled` | §3.4.2 |
| `sidebar.more` / `sidebar.menu` | `label`; one slot per menu item (includes `sidebar.menu.ideas` "Ideas") | §3.4.2 |
| `sidebar.resize` | `label` | §3.4.1 |
| `sidebar.search` | `placeholder`, `clear`, `count` (plural) | §3.4.3 |
| `sidebar.landmark` | `label` | §3.9.5 |
| `sidebar.footer.ai` | `ready`, `checking`, `not_answering`, `signed_out`, `plan_limit`, `offline`, `setting_up` | §3.4.11 |
| `sidebar.footer.spend` | `used`, `cap_reached`, `plan` | §3.4.11 |
| `sidebar.footer.settings` / `.status` | `label`, `tooltip` / `name` | §3.4.11 |
| `chatlist` | `label` | §3.4.1 |
| `chatlist.filter` | `all`, `needs_you`, `working`, `done`, `group_label`, `name` | §3.4.4 |
| `chatlist.row.pill` | `needs_you`, `paused`, `working`, `done` | §3.4.5 |
| `chatlist.row` | `unread.overflow`, `accessible_name` | §3.4.5 |
| `chatlist.row.preview` | `typing`, `draft`, `needs_ok`, `pick_one`, `sign_in`, `stuck`, `mine`, `sender`, `not_sent`, `card`, `voice`, `photo`, `setting_up` | §3.4.6 |
| `chatlist.menu` | `pin`, `unpin`, `mark_unread`, `mark_read`, `mute`, `mute_8h`, `mute_1w`, `mute_always`, `unmute`, `profile.foo`, `profile.helper`, `profile.group`, `find`, `clear`, `delete.helper`, `delete.group` | §3.4.9 |
| `chatlist.status` | `pin_limit` | §3.4.9 |
| `chatlist.empty` | `body.{needs_you,working,done,search,load_failed}`, `action.{search,load_failed}` | §3.4.10 |
| `chat_header` | `back.label`, `more.label`, `watch_live.{label,tooltip}`, `find.{label,tooltip}`, `panel.{label,tooltip.show,tooltip.hide}` | §3.6.2 |
| `chat_header.status` | `setting_up`, `needs_you`, `needs_you_many`, `in_control`, `paused_offline`, `paused_ai_down`, `paused_signed_out`, `paused_plan_limit`, `paused_ai_cap`, `typing`, `working_steps`, `working`, `working_many`, `quiet`, `quiet_other_day`, `awake`, `members` | §3.6.2.1 |
| `chat_header.menu` | `profile`, `profile_group`, `mute`, `mute_8h`, `mute_1w`, `mute_always`, `unmute`, `pin`, `unpin`, `stop_all`, `clear`, `delete.helper`, `delete.group` | §3.6.2.2 |
| `chat_header.menu` (X-128) | `end_private`, `catch_up` | 12-2 §12.30.4, §12.27 |
| `chat_header.private_toggle` (X-128) | `tooltip.off`, `tooltip.on`, `tooltip.busy` | 12-2 §12.30.4 |
| `chat_header.private` (X-128) | `title`, `status_idle` | 12-2 §12.30.4 |
| `chat_header.subtitle` (X-128) | `wa_mirror` "WhatsApp group · {n} members" | 04 §10.11 |
| `chat_header.selection` | `label`, `count` (plural), `copy`, `copied`, `delete`, `cancel.label`, `cancel.tooltip` | §3.6.2.3 |
| `thread` | `landmark.label`, `error.body`, `error.action`, `log.label` | §3.6.4 |
| `thread.find` | `placeholder`, `count`, `none`, `prev`, `next`, `close` | §3.6.3 |
| `thread.date` / `thread.unread_divider` | `today`, `yesterday` / `text` | §3.6.5 |
| `thread.jump_latest` | `label`, `label_count` (plural) | §3.6.6 |
| `thread.load_older` | `loading`, `failed`, `retry` | §3.6.7 (the start-of-chat line is `thread.marker.start_of_chat`, listed in `04-2` §28) |
| `app.panel` | `title`, `close`, `back`, `label` | §3.7.2 |
| `app.panel.doing` | `title`, `see_all`, `line.{working,queued,waiting,needs_you,done,failed}`, `chat_prefix`, `stop.label`, `watch_live.{label,tooltip}`, `empty` | §3.7.3.1 |
| `app.panel.using` | `title`, `ai`, `more`, `in_use`, `empty` | §3.7.3.2 |
| `app.panel.know` | `title.foo`, `title.helper`, `meta.said`, `meta.guessed`, `edit`, `see_all`, `empty` | §3.7.3.3 |
| `app.panel.members` | `title`, `you`, `private_note` | §3.7.3 (groups) |
| `app.panel.spent` | `title`, `ai`, `buy`, `amount`, `cap_reached`, `plan`, `plan_usage`, `change`, `meter.ai`, `meter.buy` | §3.7.3.4 |

A string added to this chapter adds a row here in the same edit; a key not in this table fails `scripts/check-copy.ts` (08-0 §D).
