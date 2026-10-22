# 04 · Messages and composer

Everything inside the open conversation that is **not** a card: the user's bubble (input text), foo's and helpers' bubbles (output text), markdown, streaming, reactions, separators, and the composer. Cards (Choice, Approval, Payment, Draft, Secret box, Checklist, Plan, Error…) are in `05-cards.md`; this chapter only says where they sit between bubbles. The main-shell frame, chat header, banner slots and the global offline banner are in `03-shell.md`. Pages, dialogs and the attachment viewer are in `06-screens.md`.

Authority: Articles (`01`) and Foundations (`02`) override this chapter. Journey text in `research/journeys-1..4.md` was the draft; where this chapter changes a journey value, the change is listed in §25 (conflicts) and this chapter wins over the journey.

## Parts

| File | Sections |
|---|---|
| `04-messages-and-composer.md` (this file) | §0 how to read · §1 the message list (column, runs, rhythm, motion, Narrator, selection) · **Part A Input text** §2–§10 · **Part B Output text** §11–§19 |
| `04-messages-and-composer-2.md` | **Part C Composer** §20–§23 · **Part D Wireframes** §24 · §25 conflicts · §26 new tokens requested · §27 acceptance hooks · §28 copy keys |

---

## §0. How to read this chapter

- Values are CSS px at 100% Windows scaling; build in rem (`1rem = 16px`).
- Every value names a token from `02-foundations.md` (F1–F10). A value that is a component size (a 280px voice player, a 72px image tile) is written in px and is binding as written. A value that needs a token Foundations does not have is marked **(new token, §26)**.
- Evidence tags: `[exact: …]` read from source, `[measured]` from screenshots (±4px), `[reported]`, `[foo decision]`. Keys: **MSG** messenger-shell.md, **AIC** ai-chat-apps.md, **OCL** openclaw-ui-1/2.md, **HRM** hermes-desktop-1/2.md, **AGT** agent-surfaces-1/2.md, **BP1** approved blueprint, **C1–C17 / G1–G17 / J1–J23** = `research/journeys-1..4.md`.
- "MUST" is binding. "Never" is binding. Copy in "double quotes" is final; `{name}` is a variable; `{agentName}` is foo's current name (default "foo").
- Test ids follow 03 §3.0.6: a "Test id" column in element tables, a "Test id:" line for a section about one element; every id is in 02-3 §F32.2 (08-0 §C). Copy keys are §28 (08-0 §D). Shared types, enums and IPC names are 08-0 and are not restated here.

Words used only in this chapter:

| Word | Meaning |
|---|---|
| Message row | One full-width row in the list holding one bubble (or one card, separator or marker). Hover and focus belong to the row. |
| Run | Consecutive bubbles from the same sender that are grouped (§1.3). |
| Meta | The time + ticks (+ "Edited") block inside a bubble's bottom-right corner. |
| Badge | The status emoji on the user's bubble (§4). |
| Plain bubble | foo's default bubble, max `--bubble-max` (§12.1). |
| Rich bubble | foo's wide bubble for structured answers, fixed to the rich cap (§12.1). |
| Job | One piece of work with a checklist (C2, 05-cards). |

---

## §1. The message list

### 1.1 Column

Test id: the list is `thread-log` (03 §3.6.4); every row carries `data-index`, and message rows `data-message-id`.

| Item | Value | Evidence |
|---|---|---|
| Column width | `--column-max` 760px, centred in the main shell | 02 F5 |
| Side padding | 24px (`--s5`) when the main shell is ≥ 900px wide, 16px (`--s3`) below | 02 F3 |
| Top padding | 16px (`--s3`) below the chat header | BP1 `.msgs` padding 16px |
| Bottom padding | 16px (`--s3`) above the composer bar | `[foo decision]` |
| Background | `--bg-app`. No wallpaper, no doodle | 02 F0 |
| List element | Virtualised (Article 28: 60 fps with 5,000 messages). Rows keep measured heights; images reserve their box from stored width/height before load | Article 28; MSG §4 |
| Load older, start of history | Owned by 03-shell §3.6.7 | 03 |

### 1.2 Rhythm (vertical spacing between rows)

| Between | Gap | Evidence |
|---|---|---|
| Two bubbles in the same run | 2px (`--s-1`) | 02 F3; MSG §4 WA 2px |
| Two bubbles in different runs (other sender, or > 3 min apart) | 12px (`--s2`) | 02 F3 |
| A bubble and a card from the same sender | 4px (`--s0`) | 02 F3 |
| Any row and a date separator | 16px (`--s3`) above and below | 02 F3 |
| Any row and an unread divider (03 §3.6.5), handoff marker or system line | 12px (`--s2`) above and below | 03; `[foo decision]` |
| Below a bubble that carries a badge or a reaction chip | 16px (`--s3`), replacing the 2px or 12px gap (the badge hangs 10px below the bubble, §4.3); 24px (`--s5`) under a reaction chip, which hangs 18px below (§8, CR-0024 B2) | BP1 `.react`; CR-0024 |
| Below foo's latest answer when its action row shows (§17) | action row 4px below the bubble, then the normal gap below the row | `[foo decision]` |

### 1.3 Runs (grouping)

A bubble joins the previous bubble's run when **all** are true; otherwise it starts a new run:
1. Same sender (the user, foo, or the same helper).
2. Sent ≤ 3 minutes (180 s) after the previous bubble. `[exact: MSG Signal timelineUtil.std.ts:22 COLLAPSE_WITHIN = 3 * MINUTE]`
3. No date separator, unread divider, handoff marker, system line or card between them.
4. Neither bubble is deleted (§10.4).
5. Both are on the same calendar day, and the earlier bubble carries no reaction chip (§8) and no status badge (§4); the unread divider always breaks a run (X-151).

Emoji-only messages (§11.3) join runs for spacing but draw no bubble, so they have no corners.

### 1.4 Bubble corners (both sides; one rule)

All bubbles use `--r-bubble` 18px with a **6px tail corner** (02 F4). The tail corner is always on the **sender's side** (right for the user, left for foo and helpers). The first bubble of a run is the only one whose top sender-side corner is round; every other sender-side corner in the run is 6px, so the run reads as one block that "starts" at the first bubble. `[BP1 exact: .b.me border-bottom-right-radius:6px; .b.them border-bottom-left-radius:6px; MSG Signal inner-corner rule _modules.scss:306-343]` `[foo decision: 6px instead of Signal's 4px, per F4]`

User bubble (right side; mirror left/right for foo and helpers):

| Position in run | Top-left | Top-right | Bottom-right | Bottom-left |
|---|---|---|---|---|
| Single (run of 1) | 18 | 18 | **6** | 18 |
| First of 2+ | 18 | 18 | **6** | 18 |
| Middle | 18 | **6** | **6** | 18 |
| Last of 2+ | 18 | **6** | **6** | 18 |

foo / helper bubble (left side):

| Position in run | Top-left | Top-right | Bottom-right | Bottom-left |
|---|---|---|---|---|
| Single | 18 | 18 | 18 | **6** |
| First of 2+ | 18 | 18 | 18 | **6** |
| Middle | **6** | 18 | 18 | **6** |
| Last of 2+ | **6** | 18 | 18 | **6** |

No SVG tail is drawn. Corners animate never (they are fixed at render).

### 1.5 New-message motion

- A new row (any sender) fades in and rises 8px, `--m-slow` `--ease-in` (02 F7). Rows that load from history (scroll-back, chat open) appear without motion.
- `prefers-reduced-motion: reduce`: opacity fade ≤ 83ms, no rise.

### 1.6 Sticking to the bottom (autoscroll)

| Rule | Value | Evidence |
|---|---|---|
| Base rule | 03-shell §3.6.4: within **15px** of the bottom (X-152) → stay pinned (`useStickToBottom` calls the virtualiser's `scrollToIndex(last)`; no `overflow-anchor`) [FE-15]; otherwise the list does not move and the scroll-to-bottom button (03 §3.6.6) counts new messages | 03; AIC rec #25 |
| Streaming answer while at bottom | Pinned to the end **until** the top of the streaming bubble reaches 16px below the chat header; then the list stops following so the user reads from the first line | `[foo decision; AIC §15 "scroll user message to top" pattern]` |
| User sends a message | Always jumps to the end (instant, no smooth scroll) | MSG §4 |
| Marking read (X-152) | A chat's unread count clears only after its newest message has been inside the visible list for 1 s while the window is focused; scrolling past it faster does not mark it read | Signal Timeline.dom.tsx |
| Opening a chat | Per 03-shell §3.6.5 (unread divider 1/3 down the list, else the end) | 03 |

### 1.7 Scroll-to-bottom button

Owned by 03-shell §3.6.6 (40px circle, count badge, "Go to newest message"). This chapter adds nothing.

### 1.8 Narrator and keyboard (all rows)

- List semantics and list keys are 03-shell §3.6.4 (`role="log"`, one Tab stop, ↑/↓, PageUp/PageDown, Ctrl+Home/Ctrl+End, Enter on a card moves into the card). Each row is a list item with `tabindex="-1"`.
- Each bubble's accessible name: "{sender}, {Ddd D Mmm, h:mm AM}: {text}. {state}" where state is the tick state for the user (§3.4) plus the badge tooltip (§4) when present. Example: "You, Fri 16 Oct, 10:42 PM: book the Goa hotel. Read by foo. Done." (02 F9)
- Focused row: the F8 focus ring is drawn around the **bubble** (following its corners), not the row.
- On a focused **bubble** row: Enter, Shift+F10 or the Menu key opens the message menu (§9.1); Ctrl+Shift+R = Reply; Ctrl+Shift+E = React (foo/helper bubbles only); Ctrl+C = Copy message. These are listed in 09-windows; 09 wins on a clash.
- New rows from foo are announced with `announce()` (02-3 §F25.2; the one app `<Announcer>`, not a live region per chat): "{sender}: {first 140 characters}". Streaming text is announced once, when the bubble finishes, never per word. The list itself has no `aria-live` (03 §3.6.4).

### 1.9 Text selection and copy

- Text in every bubble is selectable with the mouse (`user-select: text`), including across bubbles. Meta (time, ticks), badges, chips, buttons and avatars are `user-select: none` and never enter a selection.
- Ctrl+C on a selection copies **plain text only**: bubble texts joined by one blank line, markdown markers removed, links as their visible text followed by " ({url})".
- Ask about this [X-180, CR-0022 pick 6]: a selection inside one foo or helper bubble shows a pill "Ask about this" (Chip, 06 §0.4, 8px above the selection's end, `bubble-ask-pill`); click opens the side-question strip of §17.5 quoting the selected words. Copy is unchanged.
- Selection colour: inside the user's bubble, background `--accent`, text `--on-accent`; everywhere else, background `--accent-soft`, text `--fg-1`.
- Multi-select mode: message menu → "Select". A 20px checkbox (`--r-xs`, 1px `--line-strong`; checked `--accent` + `Checkmark` 16px `--on-accent`) appears 8px left of every row; clicking a row toggles it. The chat header is replaced by the selection bar, which is owned by 03-shell §3.6.2.3 (same 60px header box, not the banner strip) [FE-16]: "{n} selected" + "Copy" + "Delete" (opens **C-25**, `dialog-c-25`, copy keys `dialog.c_25.*`: the §6.3 dialog with title "Delete {count} messages?" and the same body and buttons) + "Cancel" (Esc). Copy uses the plain-text rule above, each message prefixed "{sender}, {time}: ". Selected ids live in `ui.selection`. Test id: checkbox `bubble-select-check` (`aria-checked`; the row carries `data-message-id`).

### 1.10 In-chat find (Ctrl+F)

Owned by 03-shell §3.6.3 (find bar, match highlight `--warn-soft`, current match 2px `--accent` outline). Inside the user's bubble the match highlight keeps `--warn-soft` as background with `--fg-1` text so it stays readable on `--bubble-me`. A jump to a match uses the jump highlight of §6.4 on the row.

---

# Part A · Input text (the user's own bubble)

## §2. Bubble

Test id: `bubble-me` (`data-message-id`, `data-index`); meta `bubble-meta`, tick `bubble-tick` (§3.3).

| Item | Value | Evidence |
|---|---|---|
| Alignment | Right edge of the column. Row is `justify-content: flex-end` | MSG §5 all three apps |
| Fill | `--bubble-me` (light `#0B0B10`, dark `#2C359A` deep indigo, X-145, CR-0024 F6) | 02 F2; BP1 near-black "me"; X-145 (CR-0004) |
| Text | `--on-bubble-me`, `--t-body` 15/22 400, `text-wrap: pretty`, `white-space: pre-wrap`, `overflow-wrap: anywhere` | 02 F1; MSG §6 long message |
| Padding | 8px top, 12px right, 8px bottom, 12px left (`--s1` / `--s2`) | BP1 `.b` padding 8px 12px |
| Max width | `--bubble-max`: 72% of the column, capped at 620px | 02 F5 |
| Min width | meta width + 24px (so the time never overflows a one-character message) | `[foo decision]` |
| Corners | §1.4 | |
| Shadow | `--shadow-1` in light; none in dark | 02 F4 |
| High contrast | 1px `CanvasText` border, fill `Canvas`, text `CanvasText` | 02 F9 |
| Hover | No colour change on the bubble. Hover shows the hover toolbar (§9.2) | MSG §5 hover actions |
| Pressed | none (the bubble is not a button) | |
| Language | If ≥ 30% of the letters are Devanagari, the bubble gets `lang="hi"`; Gurmukhi, `lang="pa"`; else it inherits the document's `en-IN`. Narrator then reads it in the right voice. The document is `<html lang="en-IN">`; `t()` and `Intl` calls use `'en-IN'` (08-0 §D, X-128) | `[foo decision; Article 23]` |

## §3. Time and ticks (meta)

### 3.1 Placement

- Meta sits **inside** the bubble at the bottom-right: absolutely positioned, right 12px, bottom 6px, on one line: "{h:mm AM}" then 4px gap then the tick glyph. When the message was edited: "Edited" + 4px + time + 4px + ticks.
- The text reserves room for the meta: an invisible inline spacer of width = meta width + 8px is appended to the last text line, so short messages keep the meta on the same line and long last lines push the meta to its own line. `[measured: MSG §5 WA "text reserves trailing space"]`
- Time text: `--t-caption` 12/16, `--on-bubble-me-2`, `font-variant-numeric: tabular-nums`. Format "10:42 PM" per Windows region (12-hour default, F10).
- Hover on the meta: tooltip with the full date "Fri 16 Oct 2026, 10:42:07 PM" (Article 21).

### 3.2 Tick glyphs

Ticks are a custom 16×11px SVG pair drawn with 1.5px strokes (single ✓ = one check, ✓✓ = two overlapping checks offset 4px): `TickSingle` and `TicksDouble` in `src/renderer/icons/custom/` (02-2 §F14.6) **(new icon, §26)**. Clock and ErrorCircle are Fluent icons at 16px.

### 3.3 Tick states (exact meaning in a local app)

| State | Glyph | Colour | Exact trigger | Narrator / tooltip | Test id |
|---|---|---|---|---|---|
| Waiting to send | `Clock` 16px | `--on-bubble-me-2` | Saved on this PC, but foo cannot hand it to the job runner: offline, your AI not answering, spend cap reached, or foo still starting | "Waiting to send" | `bubble-tick` `data-state="waiting"` |
| Sent | ✓ | `--on-bubble-me-2` | Written to the local chat store (`foo.db`), normally < 50ms | "Sent" | `bubble-tick` `data-state="sent"` |
| Delivered | ✓✓ | `--on-bubble-me-2` | The job runner accepted it into this chat's queue | "Delivered to {agentName}" | `bubble-tick` `data-state="delivered"` |
| Read | ✓✓ | `--tick-read-on-me` **(new token, §26)** | Your AI has started on it: the first request that includes this message returned its first byte | "Read by {agentName}" | `bubble-tick` `data-state="read"` |
| Not sent | none inside; see §7 | — | §7 | "Not sent" | `bubble-tick` `data-state="not_sent"` |

Rules:
- Tick changes cross-fade `--m-normal` (02 F7 tick changes).
- A message folded into a running job (Article 18) still goes ✓ → ✓✓ → read.
- Ticks appear on every user bubble, not only the last. `[MSG §5 WA]`
- The chat-row preview in the left shell shows the same tick glyph before "You: {text}" when the last message is mine, in `--fg-3` / `--tick-read`; a Not sent last message shows "Not sent: {text}" in `--bad` and no tick. 03-shell §3.4.6 rule 5 owns that row [FE-29, UX-25].

## §4. Status badge (👀 🛠 ⏳ ✅ ❌ ⛔; values 08-0 §F)

The badge is the only status signal for work started by a message. foo never sends "ok, on it" (Article 16, 22).

### 4.1 Which bubble carries it

1. The badge goes on the bubble that **started** the work: the last bubble of the user's run at the moment foo began reading (✓✓ read). Earlier bubbles in that run carry no badge.
2. A bubble that is folded into an already running job (steer, Article 18) carries its own badge, which mirrors the job's badge from then on.
3. A badge on an older bubble stays after newer messages arrive (BP1 shows ✅ on an earlier bubble). Final values (`done`, `done_unverified`, `failed`, `stopped`) are permanent.
4. For a plain answer with no job, the badge is `seen` only, and it fades out `--m-normal` when foo's first reply word appears (C1). Exception: a message that opened a `choice` card with `purpose: file_in` (J29) keeps `seen` while the card is `asking`; it becomes `done` when any option other than 'Not now' is tapped, and returns to `seen` when the card expires after 24 h (12-2 §12.29.4). No other badge ever re-appears. (08-0 §F, X-128)
5. When foo answers with a reaction instead of words (J7: "thanks!", "ok"), the reaction emoji (👍 or ❤️) replaces 👀 in the same slot and stays (it is a reaction, not a badge value; §4.2).

### 4.2 States and exact rules (values: 08-0 §F, X-61) [F-016]

The badge values, glyphs and base tooltips are **08-0 §F** and nowhere else: `BadgeValue` = `seen` · `working` · `waiting` · `done` · `done_unverified` · `failed` · `stopped`. The glyph map is `src/shared/badges.ts` (the only place a badge emoji is written); `<StatusBadge value>` renders it, and main sends changes as `message:badge { messageId; badge: BadgeValue | null }` (08-1 §3). This table adds only *when* each value shows (job runner state, never AI words; Article 12) and the chapter's extra tooltip variants.

| Value | Shows when | Replaced when | Tooltip variants this chapter adds (key, 04-2 §28) | Test id |
|---|---|---|---|---|
| `seen` | Tick reaches Read (§3.3). Must show ≤ 1 s after send when your AI is reachable | first job step starts (→ `working`), or the first reply word appears (badge removed), or foo reacts (§4.1 rule 5) | — | `bubble-badge` `data-state="seen"` |
| `working` | The job's first step starts | job needs the user (→ `waiting`), ends (→ `done` `done_unverified` `failed` `stopped`) | Slow is not a value: while `JobRow.slow` is true (working, no progress for 60 s; 08-1 §3) the tooltip is "Taking longer than usual" (`bubble.badge.tooltip.working_slow`; 08-0 §F, `JobRow.slow` 08-0 §B.1), glyph unchanged | `bubble-badge` `data-state="working"` |
| `waiting` | Job enters Needs you (a Choice, Approval, Payment, Secret box or Sign-in card is waiting); a stuck job (05 Stuck card) also stays `waiting`; or the PC is online, the message is queued and your AI is not answering (J7) | user answers (→ `working`), job ends | AI not answering: "Waiting for your AI to come back" (`bubble.badge.tooltip.waiting_ai`) | `bubble-badge` `data-state="waiting"` |
| `done` | Job reached Done **with** proof (Article 11) | never | — | `bubble-badge` `data-state="done"` |
| `done_unverified` | Job reached Done but its proof was not checked live | never | — | `bubble-badge` `data-state="done_unverified"` |
| `failed` | Job reached Failed | never (a retry starts a new job on a new message) | — | `bubble-badge` `data-state="failed"` |
| `stopped` | Job cancelled by the user ("stop", Stop button) | never | — | `bubble-badge` `data-state="stopped"` |

- **⚠ never appears on a bubble.** It appears only in the Stuck card header (05). A stuck job's bubble stays ⏳ `waiting` (08-0 §F).
- A foo reaction in the badge slot (§4.1 rule 5: 👍 or ❤️, tooltip "{agentName} reacted {emoji name}", key `bubble.badge.tooltip.reacted`) is **not** a `BadgeValue`: it is the message's reaction drawn in the badge position, test id `bubble-reaction`, and `bubble-badge` is absent.
- Debounce: a value that would last < 700ms is skipped (no flicker); the next value shows directly. `[exact: OCL status-reactions.ts:29-51 debounce 700ms]`
- A message waiting to send **because the PC is offline** shows the Clock tick and **no badge** (08-0 §F): Clock tick + ⏳ would say the same thing twice. The `waiting` AI-not-answering variant is used only when the PC is online but the AI is not answering.
- The Narrator name of the bubble appends the shown tooltip (§1.8).

### 4.3 Badge shape and position

Test id: `bubble-badge` with `data-state` = the `BadgeValue` (§4.2).

| Item | Value | Evidence |
|---|---|---|
| Size | 24×24px circle (`--r-full`) | BP1 `.react` line-height 18 + border; 24 on the grid |
| Fill / border | `--bg-raised`, 1px `--line` | BP1 `.react` |
| Emoji | `--font-emoji`, font-size from `--t-body` (15px), centred | 02 F1 |
| Anchor | Bottom-left corner of the bubble: `left: -8px; bottom: -10px` | `[BP1 exact: .react{bottom:-10px;left:-8px}]` |
| Layer | Above the bubble (`z-index: 2`); never clipped by the row | BP1 |
| Effect on rhythm | Gap below the bubble becomes 16px (§1.2) | |
| Motion | State change: cross-fade `--m-normal` (02 F7). Appear: fade `--m-normal`. No scale, no spin | 02 F7 |
| Reduced motion | fade ≤ 83ms | 02 F7 |
| Hover | Tooltip (§4.2) after 500ms. The badge is not clickable, except `failed` and `waiting`: click scrolls to the related card or error message and focuses it (then it is a `button`) | `[foo decision]` |
| High contrast | 1px `CanvasText` border; tooltip text is also appended to the bubble's Narrator name | 02 F9 |

Why bottom-left (not C1's bottom-right): the bottom-right holds the meta (§3), and BP1, the approved look, draws it bottom-left. `[conflict 2, §25]`

## §5. Reactions on the user's bubble

- The user cannot react to their own bubble (no React item, no hover react button). `[foo decision: WhatsApp allows it; it adds nothing to a 1-to-1 with an agent]`
- foo's reactions (👍 / ❤️ instead of a reply, J7) use the badge slot (§4.1 rule 5). foo never adds a second reaction.
- In a group, helpers never react to the user's bubble (Article 1: one voice; foo reacts for the group).

## §6. Actions on the user's bubble

### 6.1 Message menu items (user bubble)

| Item | Icon | Shown when | Does | Test id |
|---|---|---|---|---|
| "Reply" | `ArrowReply` (new icon) | always | Puts a reply strip in the composer (§21.6) | `bubble-menu-reply` |
| "Copy" | `Copy` | the bubble has text | Copies the text (plain + markdown-stripped). Caption "Copied" replaces the menu item label for 2000ms if the menu is still open; otherwise nothing else shows `[exact: AIC Vercel code-block.tsx:454 2000ms]` | `bubble-menu-copy` |
| "Edit" | `Edit` (new icon) | edit rules in §6.2 are met | Opens edit mode (§6.2) | `bubble-menu-edit` |
| "Select" | `Checkmark` | always | Multi-select mode (§1.9) | `bubble-menu-select` |
| "Delete" | `Delete` (new icon) | always | Confirm (§6.3) | `bubble-menu-delete` |

### 6.2 Edit the last message

- Entry: ↑ in an **empty** composer, or menu "Edit". `[exact: MSG Signal ShortcutGuide.dom.tsx:283-284]`
- Allowed only on the user's **most recent** bubble, only within **15 minutes** of sending, and only if no Approval or Payment card started from it has been approved. Otherwise ↑ moves the caret normally and "Edit" is hidden. `[foo decision: an approved action cannot be "un-asked"]`
- Edit mode: the composer shows the edit strip (§21.6) "Editing your message" with Dismiss; the field is filled with the old text and selected; the round button shows `Checkmark` on `--accent` (tooltip "Save edit (Enter)").
- Save: the bubble text is replaced in place; meta shows "Edited". foo receives the new text as a correction folded into the same job ("The user changed their message to: {text}") and replies only if the answer changes. Esc or Dismiss cancels with no change.
- Narrator after save: "Message edited."

### 6.3 Delete

- Confirm dialog **C-24** (`dialog-c-24`, 06-3 §14, copy keys `dialog.c_24.*`, Dialog sm, destructive order): title "Delete this message?", body "It's removed from this chat on your PC. Anything {agentName} already did because of it stays done.", buttons "Delete" (Destructive) and "Cancel" (default focus).
- After delete: the bubble becomes the deleted state (§10.4) "You deleted this message". foo's memory entries whose source is this message are removed; the job it started is **not** stopped (the user has the Stop button for that).
- Deleting a bubble that is still Waiting to send removes it from the send queue, so it is never sent.

### 6.4 Reply-quote inside the user's bubble

Test id: `bubble-quote`.

- When the user replied to a message, a quote block sits at the top of the bubble, inside the padding: full bubble width, padding 8px 12px, `--r-sm`, fill `--on-bubble-me-soft` **(new token, §26)**, 4px left bar (`--s0`) in the quoted sender's colour (foo: `--on-bubble-me`; helper: its `--h-*` colour; the user: `--on-bubble-me-2`).
- Inside: sender name `--t-caption-strong` (no uppercase) in `--on-bubble-me`; quoted text `--t-small` 13/18 `--on-bubble-me-2`, 2 lines max with ellipsis. A quoted card shows its title ("Approve this payment"). A quoted image shows a 40×40px thumbnail (`--r-xs`) at the right.
- 8px (`--s1`) gap between the quote block and the text.
- Click the quote: scrolls to the original and highlights its row with `--accent-soft` background for 1600ms (fade in and out `--m-normal`; motion request, §26). If the original was deleted: quote text "Deleted message", not clickable.

### 6.5 "foo read:" line [X-180, CR-0022]

Test id: `bubble-read-line`.

- Under the last user bubble only, 4px below it, aligned with the bubble's right edge: "{agentName} read:" then the people, places, dates, times and amounts foo understood from that message (a party size reads "{n} people", `bubble.read.people`), joined by " · ", `--t-caption` `--fg-3`, one line with ellipsis; a tooltip shows the full list. Narrator: "{agentName} understood: {items}".
- Built by the engine from the redacted text (08-2 §11.4) only, so it never shows a secret; stored as JSON `string[]` in `messages.understood` (08-1 §4.2 item 6); hidden when nothing was found, in groups and in WhatsApp mirrors. It is not part of the bubble and is not copied.

## §7. Not sent (failed to send)

A user message fails only when foo cannot even queue it: attachment copy failed, the file disappeared before sending, the send queue is full (> 20 messages waiting), or the disk is full. Offline / AI down / spend cap are **not** failures; they are Waiting to send (§3.3).

| Part | Value | Test id |
|---|---|---|
| Icon | `ErrorCircle` 20px `--bad`, outside the bubble, 8px to its left, vertically centred on the bubble (on `--bg-app`, where `--bad` passes 4.5:1) `[exact: MSG Signal red ⚠ beside the bubble _modules.scss:280-282]` | inside `bubble-not-sent` |
| Line under the bubble | 4px below the bubble, right-aligned: "Not sent." `--t-caption` `--bad` + 8px + Link button "Try again" (06 §0.4, 32px hit area padded to 40) `[exact: OCL en.ts:3511 "Not sent" + Retry]` | `bubble-not-sent` |
| Reason (tooltip on the icon and Narrator) | attachment missing: "{file name} can't be found any more." · queue full: "Too many messages are waiting. Wait for some to send, then try again." · disk full: "Your PC is out of space. Free some space, then try again." · copy failed: "I couldn't copy {file name}." | — |
| Try again | Re-runs the same send with the same text and attachments. On a second failure the reason updates; nothing else changes | `bubble-not-sent-retry` |
| Remove | The message menu keeps "Delete" (no second button on the line; Article 2: one fix button) | — |
| Badge | none | — |

## §8. Reaction chips (shared shape; used on foo's and helpers' bubbles)

Test id: `bubble-reaction` (`data-index`, `aria-pressed` = mine).

| Item | Value | Evidence |
|---|---|---|
| Chip | height 24px, `--r-full`, `--bg-raised`, 1px `--line`, padding 0 6px; emoji 15px (`--t-body` size, `--font-emoji`); count `--t-caption` `--fg-2` 4px after the emoji, shown only when > 1 (groups) | MSG §5 WA chip 22–24px; OCL grouped.css:252-298 |
| Anchor | First chip at the bubble's bottom-left, `left: -8px; bottom: -18px`, so it hangs below the bubble edge and never covers text (CR-0024 B2); more chips flow right with 4px gaps. The gap below such a bubble is 24px (`--s5`) | BP1 `.react`; CR-0024 |
| Mine | A chip the user added: fill `--accent-soft`, border `--accent` 1px | OCL pressed `--accent-subtle` |
| Click a chip | If it is the user's own reaction: removes it. Otherwise: adds the same reaction | MSG WA behaviour |
| Max | 1 reaction per person per bubble; choosing another replaces it | MSG WA |
| Motion | Appear: fade `--m-normal`. No pop or scale (02 F7 lists none) | 02 F7 |

## §9. Hover toolbar and menu (both sides)

### 9.1 Message menu

- Opens from: the hover toolbar's `MoreHorizontal` button, right-click on the bubble, Shift+F10 / Menu key on a focused row.
- Shape: the shared menu (03-shell menus): `--bg-raised`, `--r-md`, `--shadow-16` (dark: + 1px `--line`), padding 4px; items min-height 40px (02 §F27.4) [X-26], padding 0 12px, `--r-sm`, icon 16px `--fg-2` + 8px + label `--t-body`; hover `--bg-hover`; destructive item label and icon `--bad`. Opens `--m-normal` fade, placed above or below the bubble so it never leaves the window.
- Items per bubble type: user §6.1; foo/helper §17.4; cards: "Reply", "Copy" (copies the card's text summary), "Select" only.
- Voice notes (either side) add "Keep this voice note" (when not kept) or "Don't keep" (when kept): IPC `message:pin { messageId; on }` sets `messages.pinned` (08-0 §G.17; retention skips kept notes, 08-3 §18.3).

### 9.2 Hover toolbar

| Item | User bubble | foo / helper bubble | Test id |
|---|---|---|---|
| Appears on | row hover or focus-within, fade `--m-fast` | same | — |
| Position | outside the bubble, on the side away from the sender: 8px left of the bubble's left edge, top-aligned with the bubble | 8px right of the bubble's right edge, top-aligned | — |
| Buttons | [`MoreHorizontal`] | [`Emoji` react (new icon)] [`MoreHorizontal`], 4px gap | `bubble-toolbar-more`; foo / helper also `bubble-toolbar-react` |
| Button | 32×32px visual, `--r-full`, icon 16px `--fg-2`; hit area padded to 40×40px; hover `--bg-hover` + icon `--fg-1`; pressed `--bg-pressed` scale 0.97 | same | — |
| Hidden when | multi-select mode; the bubble is being edited; Narrator users reach the same items through the menu | same | — |

`[MSG §5 WA: react button floats outside the bubble on the far side; Signal hover fade]` `[foo decision: one ⋯ button outside instead of WA's ⌄ inside the bubble, because a 24px chevron inside a bubble cannot meet the 40px target rule]`

Selecting text inside a foo or helper bubble adds the "Ask about this" pill of §1.9 beside the selection; the toolbar itself is unchanged [X-180].

### 9.3 Reaction picker

Test ids: `bubble-react-picker`, each emoji `bubble-react-option` (`data-index`), "+" `bubble-react-more`.

- Opens from the react button or Ctrl+Shift+E. A pill 44px tall, `--r-full`, `--bg-raised`, `--shadow-16`, padding 0 4px, placed 8px above the bubble's top edge (below if no room). `[measured: MSG M-D ≈44px pill]`
- Contents: 6 emoji buttons 36×36px (emoji at `--t-title` size 20px, `--font-emoji`), then a 36px "+" button (`Add` 16px `--fg-2`, tooltip "More emoji").
- Default set, in order: 👍 ❤️ 😂 😮 🙏 👎 `[foo decision: WA set with 😢 swapped for 👎 so a reaction can say "no"]`
- On a Choice card (C3): the first buttons are 1️⃣ 2️⃣ 3️⃣ 4️⃣ (one per option), then 👍 ❤️. Reacting with a number answers the card (C3).
- On an Approval or Payment card: no react button and no React menu item (Article 6: reactions never approve; hiding the picker avoids the trap).
- "+" opens the Windows emoji panel (Electron `app.showEmojiPanel()`) bound to an off-screen 1-character input; the first emoji received becomes the reaction; closing the panel with nothing chosen cancels. foo builds no emoji grid of its own. `[foo decision; WIN native emoji panel]`
- Keyboard: ←/→ move, Enter picks, Esc closes. Focus starts on 👍.

## §10. Attachments, previews and special bubbles (user side)

### 10.1 Images (photos, screenshots)

Test id: each tile `bubble-image` (`data-index`).

| Count | Layout inside the bubble (grid width 320px, 2px gaps `--s-1`) |
|---|---|
| 1 | One image at its aspect ratio, width 320px (or the bubble max if smaller), height clamped 160–400px with `object-fit: cover` |
| 2 | Two 159×200px tiles side by side |
| 3 | One 320×200px tile on top, two 159×159px below |
| 4 | 2×2 grid of 159×159px tiles |
| 5–6 | 2×2 grid; the 4th tile shows a `--scrim` overlay with "+{n}" in `--t-title` `--on-media` (new token) |

- Image-only bubble: padding 4px (`--s0`); images `--r-md` 12px inside the bubble's own corners; the meta overlays the bottom-right of the last image on a `--media-scrim` gradient (new token) in `--on-media`. `[measured: MSG M-A WA 3px padding, time on image]`
- Image + caption: images at the top with 4px padding on top and sides; caption text below with normal bubble padding; meta in the normal place.
- Click a tile: opens the attachment viewer (06 §13) at that image. Each tile is a button: Narrator "Photo {i} of {n}, {file name}".
- Loading (copy to foo's data folder not finished): tile shows `--bg-sunken` with the F7 spinner ring 24px centred. Broken file: tile `--bg-sunken` + `Image` 24px `--fg-3` + "Can't show this photo" `--t-caption` `--fg-2`.

### 10.2 File chip

Test id: `bubble-file` (`data-index`).

- Height 56px, width 280px (or the bubble width minus padding if smaller), `--r-md`, fill `--on-bubble-me-soft` (new token); padding 8px 12px.
- Left: 40×40px tile `--r-sm`, icon `Document` 20px `--on-bubble-me` (type icons: PDF, Word, Excel, PowerPoint, text all use `Document`; audio uses `Mic`; video uses `Image`). 12px gap.
- Name: `--t-body-strong` `--on-bubble-me`, one line, ellipsis in the **middle** (keep the extension). Second line: "{TYPE} · {size}" `--t-caption` `--on-bubble-me-2`, e.g. "PDF · 240 KB". `[AGT A13 file chip]`
- Click: opens the file with its default Windows app (`shell.openPath`). Right-click: "Open", "Show in folder", "Save as…".
- Several files: chips stack with 4px gaps; text (if any) follows below.

### 10.3 Voice note (shared player; foo's version in §18)

| Part | Value | Test id |
|---|---|---|
| Width × height | 280px × 48px content (plus bubble padding) | — |
| Play / Pause | 36px circle (`--btn-round`, 02 F5), fill `--on-bubble-me`, icon `Play` / `Pause` 16px (new icons) in `--bubble-me` | `bubble-voice-play` |
| Waveform | 40 bars, each 2px wide with 2px gaps (160px total), heights 4–24px from the recorded loudness (stored at record time), `--r-full` ends. Played bars `--on-bubble-me`, unplayed `--on-bubble-me-2`. Click or drag on the waveform seeks | `bubble-voice-wave` |
| Time | Under the waveform, left-aligned: while stopped, the length "0:14"; while playing, the elapsed time. `--t-caption` `--on-bubble-me-2`, tabular | — |
| Speed | Not on the user's own notes (only on foo's, §18) | `bubble-voice-speed` (foo side, §18) |
| Transcript | Below the player inside the same bubble, 8px gap: `--t-small` `--on-bubble-me-2`, clamped to 2 lines + Link "more" (expands in place). Appears within 3 s of sending (J7) | — |
| Transcript states | Working: "Writing down what you said…" `--t-small` `--on-bubble-me-2` · Failed: "I couldn't make out that voice note. Try again, or type it." (J7) and the player still plays | — |
| Narrator | "Voice note, 0:14. Play button." Transcript is read after the button | — |
| Keyboard | Space or Enter on the focused player toggles play; ←/→ seek 5 s | — |
| Never | auto-play (J7) | — |

### 10.4 Deleted message (both sides)

- No fill; 1px `--line-strong` border; same corners and padding as the original; text `--t-body` italic `--fg-3` with `Delete` icon 16px `--fg-3` 4px before it. Meta stays (time only, `--fg-3`). `[exact: MSG Signal outline-only deleted bubble _modules.scss:464-470]`
- Copy: user's own: "You deleted this message". foo's/helper's (deleted by the user from their PC): "You deleted this message" as well (only the user can delete anything). `[foo decision]`
- A deleted row breaks the run (§1.3). It has no menu except "Delete" (removes the placeholder too, after the same confirm).

### 10.5 Long text: "Read more"

Test id: `bubble-read-more`.

- A user bubble whose text renders taller than **20 lines** (440px at 22px line height) is clamped to **15 lines** (330px) with a 22px fade from transparent to `--bubble-me` over the last line, and a Link button "Read more" in `--t-caption-strong` (no uppercase) `--on-bubble-me`, underlined, on its own line above the meta.
- "Read more" expands in place, keeps the scroll position of the bubble's top, and does not collapse again. `[reported: MSG WA folds long text with "Read more"; OCL clamps at 5 lines (too short for pasted letters)]`
- Pasted text over the large-paste limit never reaches a bubble as text; it becomes a "Pasted text" file chip (§22.3).

### 10.6 Link preview

Test id: `bubble-link-preview`.

- When the user's message contains a URL and the composer fetched a preview (§21.5), the bubble shows a preview block at the top, inside the padding: full bubble width, `--r-md`, fill `--on-bubble-me-soft`.
- Block: image (if the page has one) 100% wide × max 160px, `object-fit: cover`, top corners `--r-md`; then padding 8px 12px: title `--t-body-strong` `--on-bubble-me` 2 lines max; description `--t-small` `--on-bubble-me-2` 2 lines max; domain `--t-caption` `--on-bubble-me-2` 1 line. `[measured: MSG §7 WA preview; Signal clamp rules]`
- Click: opens the URL in the default browser. The URL itself in the text is underlined in `--on-bubble-me`.
- Only the **first** URL gets a preview. No preview when the user removed it in the composer.

### 10.7 Links inside the user's text

- URLs (`https?://…`, `www.…`), email addresses and phone numbers (§16.1) are underlined in `--on-bubble-me` (1px underline, offset 2px). Click opens them (URL: default browser; email: the actions menu of §16.1).

### 10.8 Hindi, Punjabi and mixed text

- Font stack falls back to Nirmala UI for Devanagari and Gurmukhi (02 F1). Bubbles tagged `lang="hi"` or `lang="pa"` (§2) use `--t-body-indic` 15/24 **(new token, §26)** so matras and the shirorekha are not clipped at 22px line height.
- Romanised Hindi/Punjabi (Hinglish) is ordinary Latin text and uses `--t-body`.
- Digits are shown exactly as typed (Devanagari digits stay Devanagari). Money from foo follows §16.2.
- Mixed lines (Hindi + English) wrap with `word-break: normal` and `line-break: auto`; never break inside a Devanagari conjunct (default browser behaviour; MUST NOT set `word-break: break-all`).

### 10.9 Emoji-only messages (large emoji)

| Content (after trimming spaces) | Render |
|---|---|
| 1 emoji only | No bubble. Emoji at `--t-display` size (40/48), `--font-emoji` |
| 2 or 3 emoji only | No bubble. Emoji at `--t-title-large` size (28/36) |
| 4+ emoji, or emoji + any letter, digit or punctuation | Normal bubble, emoji inline at text size |

- Meta for bubble-less emoji: below the emoji, right-aligned (user) or left-aligned (foo), `--t-caption` `--fg-3` time + ticks in `--fg-3` / `--tick-read` (on `--bg-app`, where `--tick-read` passes). The badge anchors to the emoji box's bottom-left. `[reported: MSG WA large emoji]` `[foo decision: sizes mapped to existing type tokens]`
- An emoji sequence (ZWJ family, skin tone, flag) counts as one emoji. Windows renders flag emoji as letter pairs; that is accepted.

### 10.10 WhatsApp-style formatting in the user's text

The user's own bubble renders only: `*bold*` → 600; `_italic_`; `~strike~`; `` `inline` `` and ```` ```block``` ```` → `--font-mono` with `--on-bubble-me-soft` fill, `--r-xs`, padding 0 4px (block: `--r-sm`, padding 8px 12px). Nothing else (no headings, lists, tables, links-in-brackets). `[exact: MSG §6 WA formatting set]`

### 10.11 WhatsApp mirror thread (X-128)

A mirrored WhatsApp group (`chats.kind='wa_mirror'`; row 03-shell-1 §3.4.5.1) renders `chat:open.waMessages` (newest 200; `message:list` is not used; older history is not loaded — line at the top "I keep 7 days of WhatsApp messages." `thread.wa_mirror.retention`). `from_me=1` → the user's side (right, `--bubble-me`) with no ticks and no badge; others → left, `--bubble-foo` fill, sender name `--t-caption-strong` above every bubble in the helper-name style (X-19 colour rule by hash of jid into the ten `--h-*` helper colours of 02 F2, in F2 order; dark theme `--fg-1` per F2; index = `hash(jid) mod 10`, X-138); time per 04 §3; no reactions, no reply, no selection, no search in this thread (not in `messages_fts`). Composer: placeholder "Draft a message for {group}" (`composer.placeholder.wa_mirror`); Send creates a `whatsapp.draft` for this group in **foo's chat** and the mirror shows the marker line "Draft ready in {agentName}'s chat." (`thread.wa_mirror.draft_made`) with Link "Open" (`thread.wa_mirror.open`, X-138) — nothing is ever sent from the mirror (J16, Art. 4). Header: title = subject, subtitle "WhatsApp group · {n} members" (`chat_header.subtitle.wa_mirror`), menu items: Catch me up (03-shell-2 §3.6), Hide from foo (C-8), Mute/Unmute.

| Part | Test id |
|---|---|
| Each mirrored message bubble (either side) | `bubble-wa` (`data-message-id`, `data-index`, `data-from-me` = `true` \| `false`) |
| Sender name | `bubble-sender` |
| Retention line, draft-made marker | `thread-marker` (`data-state="system_line"`), link `thread-marker-link` |

---

# Part B · Output text (foo's and helpers' messages)

## §11. Who speaks where

- foo speaks in its own chat; helpers speak only in their own chats and in groups (Article 1). Background workers never get a bubble.
- In 1:1 chats (foo or one helper), output bubbles have **no avatar and no name** (the chat header names the speaker). `[MSG §6 WA 1:1]`
- In groups, each output run starts with a sender label (§12.4).
- WhatsApp mirror chats (`kind = 'wa_mirror'`): other people's messages show no ticks; in a WhatsApp group every message shows its sender's name, not only the first of a run. The thread is §10.11.

## §12. The output bubble

### 12.1 Plain bubble vs rich bubble

| | Plain bubble | Rich bubble |
|---|---|---|
| Used when | The message has only paragraphs, bold/italic/strike, links, inline code, lists of ≤ 7 items, quotes, citation pills, auto-links | The message contains **any** of: a heading, a table, a code block, an image, a kit surface or AI page (§13.5, §13.6; X-180), a list with > 7 items, or more than **900 characters** of text |
| Width | shrink-to-fit, max `--bubble-max` (72% of column, ≤ 620px) | fixed width = min(680px, 100% of the column) (02 F5 rich cap) |
| Padding | 8px 12px (same as the user's bubble) | 12px 16px (`--s2` / `--s3`) |
| Corners, fill | §1.4; `--bubble-foo` fill, `--on-bubble-foo` text | same |
| Decided | Once, when the message finishes or when streaming first meets a rich trigger; a bubble that becomes rich widens once with no animation and never shrinks back | |

`[foo decision: WhatsApp structure needs a bubble on both sides (F0); AIC apps use no bubble for long answers, so long/structured answers get the wide bubble instead of no bubble]`

### 12.2 Bubble values

Test id: `bubble-foo` in foo's bubbles, `bubble-helper` in a helper's (each `data-message-id`, `data-index`).

| Item | Value | Evidence |
|---|---|---|
| Alignment | Left edge of the column (in groups: indented 34px, §12.4) | MSG §6 |
| Fill / text | `--bubble-foo` / `--on-bubble-foo`, `--t-body` 15/22 | 02 F2; BP1 `.b.them` |
| Shadow | `--shadow-1` light only | 02 F4 |
| Meta | Time only (no ticks), inside bottom-right, right 12px bottom 6px, `--t-caption` `--fg-3`, same trailing-space rule as §3.1 | MSG §5 |
| Paragraph gap | 8px (`--s1`) between blocks inside a bubble; 16px (`--s3`) above a heading | `[foo decision: AIC 12–16px paragraph gap scaled to 15px body in a bubble]` |
| High contrast | 1px `CanvasText` border | 02 F9 |
| Language tag | Same rule as §2 | |

### 12.3 Chat replies vs streamed answers

The engine's sentence gate holds the first **1.5 s** of every turn (08-4 §25.5, X-122); the renderer only chunks what it receives. `[foo decision]`

| Case | Shown as | Evidence |
|---|---|---|
| The whole reply arrived within 1.5 s **and** is ≤ 600 characters | Chat mode: typing indicator (§14.3) until ready, then **one** complete bubble; its paragraphs sit 8px apart inside it (§13). A reply is never split into several bubbles (CR-0024 F2: one answer, one bubble, one time, as ChatGPT and Claude do) | J7 step 3; CR-0024 |
| Anything else | Stream mode: one bubble that fills as words arrive (§14.4); never split | AIC #25 |

### 12.4 Sender label (groups, and foo's and helpers' own chats)

CR-0024 F2: the label row below also sits above the first bubble of each output run in foo's chat and in a helper's chat, so every answer starts with the face that wrote it.

- Above the first bubble of each output run, a label row: 26px avatar (`--avatar-inline`, `--r-full`; default the sender's living face, 02 §F15.9, showing only the Working and Needs you rings, no one-time animations (§F15.9.3d) [X-35]; letter faces: helper colour fill, initial in `--t-caption-strong` `--on-helper` (06 token); foo: `--fg-1` fill with `--bg-app` letter, 02 F2) + 8px gap + name.
- Name: `--t-caption-strong` (no uppercase). Light theme: the helper's `--h-*` colour (passes 4.96:1 on `--bg-app`). **Dark theme: `--fg-1`**, because several `--h-*` colours fall below 4.5:1 on `--bg-app` dark (e.g. `--h-slate` ≈ 2.6:1); the avatar carries the colour. `[conflict 5, §25]`
- In groups only, bubbles of that sender are indented 34px (26 + 8) so they align with the name (foo's and helpers' own chats keep the bubbles at the column edge, CR-0024 F2); the label row sits 4px above the first bubble.
- The user's own bubbles in groups have no label.
- Narrator: the label is not read separately; the sender is already in each bubble's name (§1.8).
- Thinking row (before the speaker's first word in a run): geometry is §14.3; in groups this label row sits 4px above it [UX-20].
- Test ids: label row `bubble-sender`; its face is `<Face>` (02-2 §F15.9.9) with `ring` on and `animate` off (02-2 §F15.9.3d, owner Q6).

### 12.5 Backup-AI mark (X-128)

**Backup-AI mark.** When a plain-chat reply was produced by `ai.backup` because `ai.primary` is in `plan_limit` or `down` (08-2), the bubble's footer row shows `ArrowSync` 12 `--fg-3` + `--t-caption` `--fg-3` "Answered with {ChatGPT} while {Claude} rests" (`bubble.backup_mark.text`), left of the time; never on job messages or cards (the backup never runs jobs, 06-2 §6.1). Test id `bubble-backup-mark`. Narrator appends ", answered with {ChatGPT}" (`bubble.backup_mark.accessible_suffix`, X-138).

## §13. Markdown subset and styles

foo renders **only** these elements. Anything else (raw HTML outside a `page` block, footnotes, math, task-list checkboxes, nested lists deeper than 2 levels, definition lists) is shown as plain text with its markers removed. The engine (08) tells your AI to use only this subset.

| Element | Style | Evidence | Test id |
|---|---|---|---|
| Paragraph | `--t-body`, block gap 8px | | — |
| **Bold** | weight 600 | AIC §6.2 | — |
| *Italic* | `font-style: italic` (Segoe UI Variable has a true italic) | | — |
| ~~Strike~~ | `text-decoration: line-through` 1px | MSG WA | — |
| Link | `--accent`, underline 1px, offset 2px, **always underlined** (colour is never the only signal, 02 F9); hover `--accent-hover`; pressed `--accent-pressed`; focus ring. Hover tooltip shows the full URL's domain. If the link text names a different domain than the URL, clicking first opens a Dialog sm: "This opens {domain}. Open it?" with "Open {domain}" (Primary, `dialog.c_26.primary`) and "Not now" (Secondary, `dialog.c_26.secondary`; 02 F10: "Cancel" only stops something running; X-128) `[foo decision: anti-phishing]` | OCL text.css:636-660 | `bubble-link`; other-domain dialog **C-26** (`dialog-c-26`, copy keys `dialog.c_26.*`) |
| Bullet list | disc markers, `padding-left: 20px`, 4px (`--s0`) between items, 8px above/below the list; nested level: circle markers, +20px indent | AIC §6.2 (indent ≈20px, item gap ≈4px) | — |
| Numbered list | decimal, numbers hang right-aligned in the 20px indent (`font-variant-numeric: tabular-nums`), same gaps | MSG M-E hanging numbers | — |
| H1, H2 | `--t-title` 20/28 600, 16px above (0 if first block), 4px below (02 F1: never > 20px in a bubble) | 02 F1 | — |
| H3 (and H4–H6) | `--t-body-strong` 15/22 600, 12px above, 4px below | 02 F1 | — |
| Quote | 4px (`--s0`) left bar `--line-strong`, padding 4px 0 4px 12px, text `--fg-2` | OCL text.css:1297-1318 | — |
| Horizontal rule | 1px `--line`, 12px above and below | AIC CG4 | — |
| Inline code | `--font-mono`, 0.93em (≈14px on 15px body), padding 0 4px, `--r-xs`, fill `--bg-raised`, 1px `--line` (not `--bg-sunken`: it equals `--bubble-foo` in light, §25) | AIC #10; HRM inline code | — |
| Code block | §13.1 | | `bubble-code` |
| Table | §13.2 | | `bubble-table` |
| Image | §13.3 | | `bubble-image` |
| Citation / source pill | §13.4 | | `bubble-citation` |
| Kit surface (fenced block `a2ui`) | §13.5 [X-180] | CR-0022 | `kit-surface` |
| AI page (fenced block `page`) | §13.6 [X-180] | CR-0022 | `ai-page` |

### 13.1 Code block

Test ids: `bubble-code`, Copy `bubble-code-copy`, "Show all {n} lines" `bubble-code-expand`.

- Box: full content width of the (rich) bubble, `--r-md`, fill `--bg-raised`, 1px `--line` (§25 conflict 3).
- Header row 32px: padding 0 12px; left: language name in plain words `--t-caption` `--fg-3` ("Python", "Text", "Spreadsheet formula"; never "shell" or "terminal", Article 2: "command" and "terminal" are banned, so shell snippets are labelled "Text"); right: button `Copy` 16px icon + "Copy" `--t-caption-strong` (no uppercase) `--fg-2`, `--btn-h-sm` 32 tall, padding 0 8px, `--r-sm`, hover `--bg-hover`. After click: icon `Checkmark` + "Copied" in `--ok` for 2000ms. `[AIC rec #9 explicit "Copy" text; Vercel 2000ms]`
- Body: 1px `--line` top border; padding 12px 16px; `--t-mono` 13/20; `white-space: pre`; horizontal scroll inside the block (never wraps); no syntax colours in v1 (`--fg-1` text) `[foo decision: non-technical users; no new colour tokens]`.
- Longer than 15 lines: shows 15 lines with a 20px fade to `--bg-raised`, and a full-width `--btn-h-sm` 32 button "Show all {n} lines" `--t-caption-strong` `--accent`. Expanding is permanent for that message.
- Narrator: "Code, {language}, {n} lines" then the text; the Copy button is "Copy code".

### 13.2 Table card

Test ids: `bubble-table`, "Show all {n} rows" `bubble-table-expand`.

- Box: full content width of the rich bubble, `--r-md`, fill `--bg-raised`, 1px `--line`, `overflow-x: auto` (horizontal scroll with the thin Windows overlay scrollbar), `overflow-y: visible`.
- Cells: padding 8px 12px, `--t-small` 13/18 `--fg-1`, `white-space: normal`, min column width 96px, max column width 280px.
- Header row: `--t-caption-strong` (no uppercase) `--fg-2`, bottom border 1px `--line-strong`.
- Rows: 1px `--line` between rows; **no vertical lines, no zebra**; row hover `--bg-hover`. `[AIC §6.2 Claude rules-only tables; rec #8]`
- Numbers and money columns (≥ 80% of cells parse as numbers): right-aligned, `tabular-nums`.
- More than 20 rows: first 10 rows + a `--btn-h-sm` 32 footer button "Show all {n} rows" `--t-caption-strong` `--accent`.
- When the table is wider than the box: a 24px fade at the right edge (`--bg-raised` to transparent) shows there is more; Shift+wheel and ←/→ (when the table is focused) scroll it. The table box is focusable (`tabindex="0"`, focus ring) with Narrator name "Table, {rows} rows, {columns} columns".
- Right-click on a table adds "Copy table" (copies tab-separated text, so it pastes into Excel).
- In chat mode (§12.3) the engine turns tables into "label: value" lines (J7); tables only appear in rich bubbles.

### 13.3 Images in answers

- Width 100% of the rich bubble's content box, max-height 360px, `object-fit: contain` on `--bg-sunken` fill, `--r-md`. Alt text required (engine supplies it; missing alt → "Picture").
- Click: attachment viewer (06 §13). Loading and broken states as §10.1. `[AIC rec #12]`
- Images foo created or downloaded as files appear as file chips (§10.2 shape, fill `--bg-raised` + 1px `--line`, text `--fg-1` / `--fg-2`).

### 13.4 Citations and source pills

Test ids: pill `bubble-citation` (`data-index`), popover `bubble-citation-popover`, its Open links `bubble-citation-open` (`data-index`), "Sources ({n}) ›" `bubble-sources`.

- Inline pill placed after the sentence it supports: height 20px, padding 0 8px, `--r-full`, fill `--bg-raised`, 1px `--line`, label `--t-caption` `--fg-2`: the site's short name ("Booking.com", "MakeMyTrip"), or "{name} +{n}" when several sources back the same sentence. `[AIC CG8 inline grey pills; rec #11]`
- Hover (500ms) or focus: popover (`--bg-raised`, `--r-md`, `--shadow-16`, width 320px, padding 12px) listing each source as a row: favicon 16px (from the local cache only; none if not cached), title `--t-caption-strong` (no uppercase) `--fg-1` 2 lines max, domain `--t-caption` `--fg-3`, and a Link button "Open". Rows are 8px apart. Click "Open" opens the page in the default browser.
- Click on the pill itself = open the popover (not the page).
- A message with ≥ 2 sources ends with a row "Sources ({n}) ›" `--t-caption` `--accent`, 8px above the meta; click opens the same popover listing all sources.
- Narrator: pill name "Source: {name}, {n} more".

### 13.5 Kit surface [X-180, CR-0022]

Test ids: `kit-surface`, the dropped caption `kit-dropped`, one id per foo component (`kit-line-chart` … `kit-live-stamp`, `src/shared/testids.ts`).

- A fenced block with language `a2ui` in foo's text (`side === 'foo'`; a helper's or the user's fence stays a code block) holds A2UI v0.9.1 server messages (`createSurface`, `updateComponents`, `updateDataModel`, `deleteSurface`; one JSON object per message, an outer array and line breaks allowed), restricted to foo's catalog `foo.kit.v1` (CR-0022 §(c): 15 standard parts used as-is, Modal not used, and 13 foo components). The zod schemas in `src/shared/kit/catalog.ts` are the catalog: they check every message and generate the AI's catalog text (08-4 §24.5). A `createSurface` naming another catalog is dropped; unknown keys on it (`theme`, `sendDataModel`) are ignored. A block over 512 KB draws nothing (caption shown); a `data:` image is at most 256 KB of base64.
- Bound values (`{ "path": "/x" }` into the surface's data model) are re-checked with the field's own schema after they resolve; a value that fails is dropped like an invalid component.
- Streaming: each complete message renders at once; an incomplete one is held back (same rule as §14.4). When the reply ends, a still-incomplete message is dropped.
- Before a component or message counts as invalid, the small slips a real AI makes that leave its meaning whole are mended (CR-0046, X-204): an unknown key, or a key set to `null`, is left out; a number written where words go becomes that text (never in an id, input name, formula, image source, binding or action); a plain number written as text (`"12"`, `"8.5"`; not `"50,00,000"`) where a number goes becomes that number; a `label`, `title`, `text`, `sub`, `note`, `why` or `alt` over its limit is cut to fit with "…". Nothing else is mended: an unknown component, a missing key, a value outside its list, too few or too many items, a bad input name, a formula, an image source or an action stay invalid.
- An invalid or unknown component, or an invalid message, is dropped; the surface shows the rest, a quiet caption "Couldn't show part of this" (`kit.surface.dropped`, `--t-caption` `--fg-3`) sits under it, and the reply's words still show. Copy (§1.9) carries the words only.
- The user's own fences are never drawn: a user message's `a2ui` block stays a code block.
- User actions (Button, ListPick, TimePick, ShortForm, control changes that the surface sends) go renderer → main (`kit:action`) → engine as MainToEngine `kit.action` (08-1 §2.4). Any action that would send, book, pay, delete or share is an approval request (Article 6), never a direct action.
- `Image` sources are only `data:` images or a file already in the chat's files (`file:{fileId}`; 08-1 §3.1.2 path rule); web images are never loaded.
- Every `TextField` and `ShortForm` value passes the 04-2 §22.4 secret patterns before it leaves the renderer; a match is refused and the Secret box is offered (Article 8).
- Pieces use the 02 tokens, P1's motion tokens and `Presence` (02 §F7); charts follow 02-2 §F19.9. Light, dark, high contrast and Animations Off/Basic all apply.

### 13.6 AI page [X-180, CR-0022]

Test ids: `ai-page` (`data-state` building | ready | failed | kept), the frame `ai-page-frame`, the status line `ai-page-status`.

- A fenced block with language `page` in foo's text holds one HTML page, ≤ 512 KB (larger: state failed, "This page is too big to open"). A kit piece or the status line "Building your page…" shows first, until the fence closes and the reply ends.
- Main serves the page from its own privileged scheme `foo-page://{pageId}` (`pg_{UUIDv7}`) with the response header CSP `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'; frame-src 'none'; connect-src 'none'`.
- The renderer loads it in `<iframe sandbox="allow-scripts">`: never `allow-same-origin`, `allow-popups`, `allow-forms`, `allow-top-navigation`, `allow-modals` or `allow-downloads`. Main's `webRequest.onBeforeRequest` denies every request from that frame except the one `foo-page://{pageId}` document, so self-navigation and refresh tricks fail too.
- Bridge (MCP Apps SEP-1865 style JSON-RPC 2.0 over `postMessage`): the host accepts a message only when `event.source === frame.contentWindow` (a sandboxed frame's origin is `null`, so origin checks are not used), validates every call with zod (`src/shared/kit/page.ts`), allows 10 calls per second, logs every call through `page:rpc`, and never sends HTML or DOM into the page after the first document. Allowed calls: `reportSize` (height capped at 600px; the page scrolls inside), `draftMessage` (fills the composer, never sends), `openLink` (https only; always the C-26 dialog "This opens {domain}. Open it?", then `app:openExternal` with source `ai_page`), `requestAction` (goes through the gate as if the user typed it).
- Every call's text passes the 04-2 §22.4 patterns and the 08-2 §11.4 Redactor in main first; a secret match refuses the call and posts the Secret box.
- States: building, ready, failed, kept (CR-0022 pick 9: a kept page reopens only in this sealed box).

### 13.7 Capabilities card [CR-0024 F3]

When an intake turn carries the tag `intent_capabilities` (08-4 §25.2), foo's one-sentence reply is followed by a kit card (05 §0.1 type `kit`) that the **engine builds from the app's own state**; the AI writes none of it. Test ids: card `kit-capabilities`, each row `kit-capabilities-row` (`data-key`), each button `kit-capabilities-try`.

| Rule | Value |
|---|---|
| Rows | At most 4, in this order, skipping a row whose condition fails: `email` (always; hint `kit.capabilities.email.hint` "Gmail connected" when Gmail is connected, else `kit.capabilities.email.hint_off` "Connect Gmail to start"), `whatsapp` (only when WhatsApp is linked), `price`, `compare`, `remind`. Copy: `kit.capabilities.{key}.label`, `.hint`, `.fill`. |
| Row look | 24px rounded-square icon tile (`--r-sm`, `--accent-soft`, 16px Fluent icon from the 02 F6 list: `Mail`, `People`, `Money`, `Search`, `Clock`), label `--t-body` `--fg-1`, hint `--t-caption` `--fg-3`, and a Link button "Try it ›" (`kit.capabilities.try`) at the right; rows 1px `--line` apart, inside one framed card (`--bg-raised`, `--r-lg`). |
| Try it | Fills the composer with the row's `.fill` sentence and focuses it, exactly like a suggestion chip (04-2 §21.7). **Never sends.** It is the kit Button action `composer.fill` `{ text }`, handled in the renderer and never sent to the engine. The renderer honours `composer.fill` only on this engine-built card; the AI's kit catalogue never offers it (08-4 §24.5). |
| Footer | `kit.capabilities.safety` "I never send, book or pay until you tap Approve." `--t-caption` `--fg-2`; below it `thread.ideas.link_line` at most once per chat per local day (X-110), **only once the Ideas page is built** (12-1 §12.24.3); while it is a placeholder the footer is the safety line alone, so the card never links to an empty page (CR-0024 §(e) 4). |
| Repeats | Asking again posts a fresh card with the current state; older cards keep their rows. |

## §14. Before the first word, typing, streaming

### 14.1 Order of indicators for one reply

```
user sends ─▶ 👀 badge ─▶ [ status line  OR  typing bubble ] ─▶ streamed / chat bubble ─▶ meta + actions
```

### 14.2 Status line (before the first word, when foo knows what it is doing)

- Shown when the job runner reports a current step label for this reply within **600ms** of ✓✓ read. Otherwise the typing bubble (§14.3) shows.
- Position: where foo's next bubble will appear (left, column edge; groups: indented 34px), 4px below the last row.
- Test id: `thread-status-line`.
- Shape: no bubble. One line: 16px F7 spinner ring (`Spinner` primitive) (static "◔" under reduced motion) `--accent` + 8px + text `--t-small` `--fg-2` with a shimmer that sweeps `--fg-3` → `--fg-1` → `--fg-3` left to right on `--m-shimmer` 1500ms linear infinite **(new motion token, §26)**. Reduced motion: no shimmer, static `--fg-2`. `[AIC CG1 shimmer status; Vercel shimmer.tsx]`
- Copy: the `running` form of the step phrase catalogue 08-4 §26.1 (`cards.checklist.{key}.running`; the checklist uses the same entries' `next` / `running` / `done` forms), followed by "…". Examples (final): "Checking your calendar…", "Reading your email…", "Looking on the web…", "Checking {site}…", "Working on your computer…", "Waiting for {site}…", "Writing…". Never a tool name, never AI words (Article 2, 12).
- Changes in place when the step changes (cross-fade `--m-normal`); at most one change per 1 s.
- Removed when the first reply word appears, or replaced by the checklist (C2) when the job qualifies for one (2+ steps and > 1.5 s).
- Narrator: announced once per change with `announce(text)` (polite, 02-3 §F25.2); the line itself has no live region.

### 14.3 Typing bubble (the Thinking face)

- [X-36] The typing dots are withdrawn. The indicator is the replying speaker's 26px face (`--avatar-inline`) in the **Thinking** mood (02 §F15.9.3 #5: eyes up 8%, height 20%, drift; picture/emoji faces: dotted `--accent` ring, §F15.9.4), with no bubble behind it: `<Face faceRef size={26} mood="thinking">` (02-2 §F15.9.9), test id `thread-thinking`, `aria-hidden` (the header says "typing…").
- Thinking row (binding) [UX-20, F-138]: height **38px**; the 26px face's left edge = the bubble column's left edge (the same x as foo's bubbles; in groups the same 34px indent as the speaker's bubbles, §12.4), vertically centred in the row; **8px (`--s1`)** from the previous row above it; in groups the speaker's name label (§12.4: `--t-caption-strong`, helper colour, X-19) sits **4px** above the row, and the face is the static Thinking pose with no drift (`animate` off, 02-2 §F15.9.3d, owner Q6). Shown only while a reply request is really in flight and no word has arrived (Article 12). Reduced motion: the static Thinking pose (02 §F15.9.5). Every "typing bubble" in this chapter means this indicator.
- Shown in chat mode (§12.3) and in stream mode until the first word, when no status line applies.
- Also: the chat header subtitle shows "typing…" (03-shell) while either indicator shows.
- Replaced in place by the first bubble: no height change, the bubble's first line starts at the same y as the Thinking row's top (no layout jump).
- If no word arrives in 20 s: the typing bubble stays and the badge stays `seen` (👀); after 60 s the inline error of §19.4 appears.

### 14.4 Streaming

| Rule | Value | Evidence |
|---|---|---|
| Unit | Words (split on spaces; a Devanagari word is a word) | |
| Fade | Each new word fades in over **150ms** linear; no movement; no blinking cursor | 02 F7 streaming; AIC #25 |
| Reduced motion | Words appear with no fade | 02 F7 |
| Markdown while streaming | Rendered progressively. An unclosed `**`, `` ` `` or table row is held back (not shown) until it closes or the line ends; a code block shows as a code block from its opening fence | `[foo decision; HRM Streamdown pattern]` |
| Rich switch | When the first rich trigger appears (§12.1), the bubble widens once (no animation) | |
| Autoscroll | §1.6 (only within 80px of the bottom; stops following once the bubble's top reaches the header) | AIC #25 |
| Meta | Appears only when the message finishes | |
| Stop | Composer stop button (§21.3) or Esc (focus in composer or list). Stopped text stays with a caption line "Stopped." `--t-caption` `--fg-3` under the text, inside the bubble | AIC §8.2 stop |
| User sends while streaming | Allowed. The new message is folded in (Article 18); the stream continues; foo answers the new message next. While a job runs, the message is a steer exactly as 08-2 §5.5 (queued, applied at the next loop boundary, "Got it, I'll fold that in."; a steer while the job needs you supersedes its open cards, 08-4 §26.5) | Article 18; OCL steer; 08-2 §5.5 |

## §15. Collapsed work line: "Worked for 12s ›"

Test id: `bubble-worked` (`aria-expanded`).

- Shown under a foo answer (inside the bubble, above the meta, 8px gap) when the answer used at least one step but **no** checklist card was shown (fewer than 2 steps, or ≤ 1.5 s; C2).
- Copy: "Worked for {n}s ›" (n < 60) or "Worked for {m} min ›" (rounded down; 1–59) or "Worked for {h} h {m} min ›". `[AIC CG8 "Thought for 42s ›"; rec #26]`
- Style: Link button, `--t-caption` `--fg-2`, `ChevronRight` 16px; hover `--fg-1`.
- Click: expands in place into the step list (same row style as the C2 checklist: ✓ done rows, `--t-small`, 24px row height), and the chevron turns to `ChevronDown`. Click again collapses.
- Narrator: "Worked for 12 seconds, show steps, button, collapsed".

## §16. Auto-links, money and dates in foo's text

### 16.1 Auto-linked things

Auto-links render as links (§13 link style). Clicking opens a small actions menu (§9.1 shape), never acts directly.

| Thing | Detection | Menu items (final copy) | Test id |
|---|---|---|---|
| Web address | `\bhttps?://[^\s<>()]+` and `\bwww\.[^\s<>()]+\.[a-z]{2,}[^\s<>()]*` (trailing `.,;:!?)` excluded) | "Open in browser" · "Copy link" | `bubble-autolink` `data-state="url"` |
| Email address | `\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b` | "Copy email address" · "Ask {agentName} to write to them" (puts "Write an email to {address}" in the composer; Article 4 makes it a Draft card) | `bubble-autolink` `data-state="email"` |
| Indian mobile / landline | `(?<!\d)(?:\+91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}(?!\d)` and `(?<!\d)0\d{2,4}[\s-]?\d{6,8}(?!\d)` | "Copy number" · "Call from your phone" (`tel:` URI; Windows hands it to Phone Link or the default calling app) | `bubble-autolink` `data-state="phone"` |
| International number | `(?<!\d)\+(?!91)\d{1,3}[\s-]?\d{3,4}[\s-]?\d{3,4}[\s-]?\d{0,4}(?!\d)` with 8–15 digits total | same as above | `bubble-autolink` `data-state="phone"` |
| Date (and time) | foo's own Article-21 format: `\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(?: \d{4})?(?:, \d{1,2}:\d{2} (?:AM|PM))?\b` | "Add to calendar" (puts "Add {date} to my calendar" in the composer; it runs as a normal request with its own card) · "Copy" | `bubble-autolink` `data-state="date"` |
| Address | **Not detected by pattern.** Only addresses the engine marks as a place entity are linked | "Open in Maps" (opens `https://www.google.com/maps/search/?api=1&query={address}` in the default browser) · "Copy address" | `bubble-autolink` `data-state="address"` |

- Menu item test ids: `bubble-autolink-menu-open`, `-copy`, `-write`, `-call`, `-calendar`, `-maps` (02-3 §F32.2).
- No auto-link inside code, inline code, or links.
- Auto-links in **group chats** never include the user's home address or phone number (Article 14: those never appear in groups at all).

### 16.2 Money

- Every amount foo shows is formatted by the app, not by the AI: the engine marks money spans; the renderer formats them in the Windows region format, Indian default: "₹14,600", "₹1,23,450", "₹1,179.50" (paise only when non-zero), with `font-variant-numeric: tabular-nums`. (02 F10)
- "Rs 14600", "INR 14,600", "14600 rupees" are re-written to "₹14,600". Digits are never changed; only grouping and symbol.
- Other currencies keep their symbol and region grouping: "$1,250.00", "€89".
- Amounts in tables are right-aligned (§13.2).

### 16.3 Times

- foo's text must use "Sat 12 Dec, 8:00 PM" (Article 21). If your AI writes a relative-only time ("tomorrow at 8"), the engine adds the absolute part before display: "tomorrow, Sat 17 Oct, 8:00 PM". The renderer never invents a date the engine did not resolve.

## §17. Message actions (foo's and helpers' bubbles)

### 17.1 Action row (latest answer, and older answers on hover)

- Under foo's **latest text answer** in the chat (not under cards), and under an older answer while the pointer is over it or focus is inside it (CR-0024 F7, as ChatGPT), fading in over 120ms (`--ease-out`), 4px below the bubble (below the reaction chip when the bubble carries one, CR-0024 B2), left-aligned with it: four 32×32px icon buttons (hit area padded to 40×40), 4px apart, icon 16px `--fg-2`, `--r-full`, hover `--bg-hover` + `--fg-1`, pressed `--bg-pressed` scale 0.97.
- Order: **Copy · Try again · 👍 · 👎** `[AIC CL6 Claude 4-icon set; rec #28]`
- Copy: every string of this row, its tooltips and the §17.2 popover is a plain slot under `bubble.actions.*` / `bubble.feedback.*` (§28); no string holds HTML or markup. Where a line needs emphasis it carries a `{strong}` placeholder that the component renders (02-3 §F30.4, 08-0 §D, X-128).

| Button | Icon | Tooltip / Narrator | Does | Shown when | Test id |
|---|---|---|---|---|---|
| Copy | `Copy` → `Checkmark` `--ok` for 2000ms | "Copy message" | Copies plain text only (02-3 §F30.4, X-138): markdown as plain text with line breaks, tables tab-separated | always | `bubble-actions-copy` |
| Try again | `ArrowClockwise` | "Write this answer again" | Asks your AI for a new answer to the same message; replaces the bubble's text in place; meta shows "Rewritten"; the old text stays reachable through a Link "Show earlier answer" (`bubble-earlier-answer`) `--t-caption` `--fg-3` under the text | the answer is a text answer **and** its job ran no send/buy/book/post/delete step (Try again never repeats an action) | `bubble-actions-retry` |
| 👍 | `ThumbLike` (filled when on) | "Good answer" | Toggles a local note on this answer | always | `bubble-actions-good` |
| 👎 | `ThumbDislike` (filled when on) | "Not a good answer" | Opens the feedback popover (§17.2) | always | `bubble-actions-bad` |

- The row moves to the new latest answer when one arrives. Older answers keep their 👍/👎 state, visible only as a tiny `ThumbLike`/`ThumbDislike` 16px `--fg-3` next to the meta.

### 17.2 👎 feedback popover

Test ids: `bubble-feedback`, chips `bubble-feedback-chip` (`data-index`, `aria-pressed`), field `bubble-feedback-field`, `bubble-feedback-send`, `bubble-feedback-cancel`.

- Anchored above the 👎 button: `--bg-raised`, `--r-lg`, `--shadow-16`, width 320px, padding 16px.
- Title "What went wrong?" `--t-body-strong`.
- Chips (06 §0.4 Chip, `--btn-h-sm` 32, multi-select): "Wrong", "Not what I asked", "Too long", "Too short", "Something else".
- Text field (06 §0.4) placeholder "Tell me more (optional)", 1–3 lines.
- Buttons: "Send feedback" (Primary, `--btn-h` 40; a Primary is never 32, 02 F5 [UX-29]; disabled until one chip is selected) and "Cancel" (Secondary, `--btn-h` 40). `[AIC CG7 chips + disabled submit; rec #29]`
- After send: the popover closes and a caption "Thanks. I'll keep that in mind." `--t-caption` `--fg-3` shows under the action row for 4 s. The feedback is saved on this PC as a preference note (Article 15: never used to train anything).

### 17.3 Hover on older answers

Older foo bubbles show the hover toolbar (§9.2: react + ⋯) and, while hovered or focused, the §17.1 action row (CR-0024 F7). Try again on an older answer follows the §17.1 "Shown when" rule; it is also in the ⋯ menu.

### 17.4 Message menu items (foo / helper bubble)

Test ids: `bubble-menu-reply`, `bubble-menu-react`, `bubble-menu-copy`, `bubble-menu-try-again`, `bubble-menu-good`, `bubble-menu-bad`, `bubble-menu-select`, `bubble-menu-delete`.

"Reply" · "React" · "Copy" · "Ask about this" (`bubble-menu-ask`, §17.5; X-180) · "Try again" (same rule as §17.1) · "Good answer" / "Not a good answer" · "Select" · "Delete" (same confirm as §6.3, body "It's removed from this chat on your PC.").

### 17.5 Side question (Ask about this) [X-180, CR-0022 pick 6]

Test ids: strip `composer-side-strip`, its close `composer-side-strip-close`.

- Opens from the §1.9 pill or the §17.4 item: the composer's reply strip (§21) quotes the selected words (or the whole message from the menu) and is marked "Side question" (`composer.side.label`).
- Sent as a normal message with `reply_to_id` set and `messages.side = 1`. The engine answers it from context in the same chat (MainToEngine `side.question`) and never cancels or re-plans a running job; foo's answer carries `side = 1` too.

## §18. Voice note replies

- Sent when Settings → Chat and voice → Voice replies allows it [X-07] ("When I send voice" default, J7).
- Bubble: plain bubble containing the player of §10.3 recoloured for the foo side: play button fill `--fg-1`, icon `--bg-app`; played bars `--accent`, unplayed bars `--fg-3`; time `--t-caption` `--fg-3`.
- Speed chip right of the waveform: 32×24px, `--r-full`, 1px `--line`, `--t-caption-strong` "1×" → "1.5×" → "2×" → "1×" on each click. `[J7 step 2]`
- The same text is always under the player, clamped to 2 lines with Link "more" (J7). While playing, the word being spoken gets `--accent-soft` background (word timing from text-to-speech; no highlight if timing is missing). `[AGT Grok voice memo word highlight]`
- Never auto-plays. Playing one note pauses any other.
- Too long to speak (> 60 s, or mostly numbers/links/addresses): text only, starting "(Too long to read out, here it is in text.)" (J7).

## §19. Separators, markers and inline states

### 19.1 Date separator and 19.2 unread divider

Owned by 03-shell §3.6.5 (chip, copy "Today, Fri 16 Oct", sticky chip with `--delay-sticky-hide` 1500ms, unread divider "{n} new messages"). Spacing to neighbouring rows follows §1.2 of this chapter.

### 19.3 Handoff marker (C15)

- Centred line, max width 480px, `--t-caption` `--fg-2`, 12px above and below; a 16px dot (`--r-full`, the helper's `--h-*` colour, no initial) sits 4px before the helper's name.
- Copy (C15): "{agentName} asked {Helper} to {task}" · "{Helper} is back: {one-line result}" · "{Helper} couldn't do it. {agentName} is trying another way."
- The helper's name is a Link button: opens that helper's chat scrolled to the matching message. Narrator: "{copy}, link".

### 19.4 Inline error inside a foo bubble

- When foo's reply stops because something went wrong (your AI stopped answering mid-reply, 60 s with no word, connection dropped): the partial text stays (or, with no text, the typing bubble is replaced by a single-run foo bubble), and a row is added at the bottom inside the bubble: `ErrorCircle` 16px `--bad` + 8px + "That reply got cut off." `--t-small` `--fg-1` + 8px + Link button "Try again" (§13 link style, 40px hit area). `[OCL "one visible failure notice per failed run"; AIC error + retry]`
- Larger failures (job failed, AI not set up, spend cap) are Error cards (C16, 05-cards), not inline rows.
- The user's badge becomes `failed` (❌) only when a **job** failed; a cut-off plain reply leaves the badge at `seen` (👀) → removed.
- Test id: the Try again link is `bubble-error-retry`.

### 19.5 System line

- A system line is a `messages` row with `kind = 'marker'` and `marker_kind = 'system_line'`, except the start-of-history line, which is `marker_kind = 'start_of_chat'` (08-0 §G.1) [F-132]. Test id `thread-marker` with `data-state` = the `marker_kind` (02-3 §F32.2); the C15 handoff marker (§19.3) is the same id with `data-state="handoff"`, and its helper link is `thread-marker-link`.
- Centred, max width 480px, `--t-caption` `--fg-3`, 12px above and below, no chip. Used for: "You made a new helper: {name}", "{Helper} joined the group", "You renamed {old} to {new}", "Messages from before Fri 16 Oct were deleted on this PC", "Start of your chat with {name} · made {Fri 16 Oct 2026}" at the top of every chat's history (foo's chat: "Start of your chat with {agentName}"; key `thread.marker.start_of_chat`, the only start-of-history string, also used by 03 §3.6.7), and "Messages cleared on {Fri 16 Oct}. Running jobs kept going." after Clear messages (03 §3.4.9) (02 §F16.3 E-1, E-2) [X-33]. Final copy for each event is owned by the journey or screen that causes it.

### 19.6 Proactive messages: "Why am I getting this?"

- Every unprompted message (Article 19: not the morning brief, not something the user asked for) has a footer line under the bubble (outside, 4px below, aligned to the bubble's left edge): Link button "Why am I getting this?" `--t-caption` `--fg-3`, underline on hover.
- Click: popover (`--bg-raised`, `--r-lg`, `--shadow-16`, width 320px, padding 16px): title "Why you got this" `--t-body-strong`; body `--t-small` `--fg-2` with the reason line for the message's source (table below; e.g. "You asked me on Tue 6 Oct to watch Goa hotel prices."); buttons "Stop these" (Secondary) and "Keep them" (Primary).
- "Stop these" turns off the source that produced it (table below), never offers it again (Article 20), and adds the caption "Got it. I won't send these again." `--t-caption` `--fg-3` under the footer for 4 s.
- Reason line and the effect of "Stop these", by source [UJ-20, F-140]. The engine records the source with every unprompted message and fills the reason's variables; the reason comes only from `messages.why` (08-0 §G.17), never from free text. Every unprompted message has exactly one of these sources:

| Source | Reason line (copy key) | "Stop these" does |
|---|---|---|
| A routine the user asked for (`created_from = 'asked'`) | "You asked me on {Tue 6 Oct} to {routine title}." (`bubble.why.reason.routine_asked`) | pauses that routine (`routines.state = 'paused'`, 08-1 `routines` table) |
| A routine foo suggested (`created_from` = `'suggested'` or `'habit'`) | "Your {title} routine, which I suggested on {Tue 6 Oct}." (`bubble.why.reason.routine_suggested`) | pauses that routine |
| A suggestion card | "I thought this might help after {what you did}." (`bubble.why.reason.suggestion`) | turns off that suggestion kind (08-3 §12.4) |
| A habit offer (`routine_offer` card from a repeated action) | "You did this {count} times, so I offered to make it a routine." (`bubble.why.reason.habit_offer`) | sets `routines.habitOffers = false` (08-0 §A) |
| Housekeeping for routines (away catch-up, "I paused {n} routines", a stale-routine question, the held-items line) | "Housekeeping for your routines." (`bubble.why.reason.housekeeping`) | sets `routines.housekeepingMessages = false` (08-0 §A; 06-2 §6.7 row "Tell me about routines that stopped or went quiet") |
| A cap warning | "You turned on a warning at 80% of your monthly caps." (`bubble.why.reason.cap_warning`) | sets `money.warnAt80 = false` |

- A routine fire whose routine was created from Ideas shows the `routine_asked` reason.

- Test ids: footer link `bubble-why`, popover `bubble-why-popover`, buttons `bubble-why-stop` and `bubble-why-keep`.

### 19.7 Cards between bubbles

- Cards (05) sit in the list as rows aligned like foo's bubbles (left, group-indented), 4px after a foo bubble of the same run, otherwise 12px. They break runs (§1.3). A card's width, frame and states are 05's.

---

Continued in `04-messages-and-composer-2.md` (Part C Composer, Part D Wireframes, conflicts, new tokens).
