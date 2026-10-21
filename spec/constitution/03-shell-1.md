# 03 · Shell, part 1 of 2 (window, title bar, banners, left shell, main shell frame)

This chapter fixes the frame every other surface sits in. Message bubbles and the composer are in `04`, cards in `05`, full pages and dialogs in `06`, OS behaviour (tray, toasts, taskbar, shortcuts) in `09`. Every value here uses a token from `02-foundations.md`; the few values that need a new token are listed in §3.12.

Evidence keys (same as `02`): **MSG** `messenger-shell.md`, **AIC** `ai-chat-apps.md`, **HRM** `hermes-desktop-1/2.md`, **OCL** `openclaw-ui-1/2.md`, **AGT** `agent-surfaces-1/2.md`, **WIN** `windows-platform.md`, **BP1** Blueprint v1 window mock, **J** `research/journeys-1..4.md`. All evidence paths are under `/mnt/project-files/personal-agent-re/ui-evidence/` except BP1 and J.

---

## 3.0 Laws for this chapter

| # | Rule |
|---|---|
| 3.0.1 | The shell MUST use only tokens from `02` plus the ones requested in §3.12. A raw hex, px or ms in shell CSS is a bug. |
| 3.0.2 | The shell MUST read job and approval state from the job runner (Article 12). Pills, counts, status lines and the right shell MUST NOT be derived from AI text. |
| 3.0.3 | Every element in this chapter ships with the states listed for it. A state not listed uses F8 (rest, hover, pressed, focus, disabled). |
| 3.0.4 | All sizes are CSS px at 100 % Windows scaling and MUST be authored in `rem` (`1rem = 16px`) so text scaling 100–225 % grows them (F9). Fixed-height rows (72px row, 60px header) MUST become `min-height` so text never clips at 225 %. |
| 3.0.5 | Copy in "double quotes" is final. `{agentName}` defaults to "foo". `{You}` is the user's first name (`settings.user.firstName`). `{AI}` is the user's AI display name from 08-0 §B.4 ("Claude", "ChatGPT", "Gemini", "OpenAI key", "Anthropic key", "Google key", "AI on this PC"; X-78). Every quoted string has a copy key in 03-shell-2 §3.14 (08-0 §D, X-59). |
| 3.0.6 | Test ids (08-0 §C, X-58): every table whose rows are separate elements has a "Test id" column; a table that describes one element's properties gives that element's id in a "Test id:" line under it. Ids come only from 02-3 §F32.2; `—` means the row is not a separate element. State is read from `data-state` and ARIA attributes (02-3 §F26), never from class names. |
| 3.0.7 | Shared names: rows and settings use 08-0 names only (`ChatRow`, `JobRow`, `settings.window.*`, `BadgeValue`, `View`). The renderer reads job, card and connection state from the store slices of 08-0 §G.10 (3.9.6), which apply patches by `rev` (08-0 §B.1). |

---

## 3.1 Window

### 3.1.1 Size

| Item | Value | Evidence |
|---|---|---|
| Default size (first launch) | **1280 × 800**, centred on the primary display's work area. If the work area is smaller than 1280 × 800 + 5 %, use **90 %** of the work area width and height, centred. | AGT §1 recommends 1280×800 `[reported]`; WIN §1.1 90 % clamp `[reported]`; 1280 is the L breakpoint so BP1's three columns show on a 1920×1080 screen `[foo decision]` |
| Minimum size | **360 × 500** (`minWidth: 360, minHeight: 500`) | WIN §1.1 `[reported]`: one column with a 48 avatar, name and time still fits at 360 |
| Resizable / maximizable / minimizable | yes / yes / yes; `thickFrame: true` | WIN §1.1 `[exact: E2]` |
| Window corners | Windows draws them (8px on Win11, 0 when maximized or snapped, square on Win10). foo draws no corner of its own. | WIN §1.1 `[exact: S2]` |
| First paint | `show: false`, then `show()` on `ready-to-show`. `backgroundColor` = the current theme's `--bg-sidebar` (`#F5F5F8` light / `#131318` dark). | WIN §1.1 `[exact: E3]`; colour `[foo decision]` so the first frame matches the title bar |
| Material | **No Mica, no Acrylic in v1.** `backgroundMaterial: 'none'`. Surfaces are the solid `02` tokens. | `[foo decision]`: BP1 is solid; Mica tints would break F2 contrast ratios. Conflict with WIN M5 logged in §3.13. |

J1 step 6 says the first window opens at 1100 × 720. This chapter overrides it (see §3.13).

### 3.1.2 Restore

On every `resize`, `move`, `maximize`, `unmaximize` and `close`, debounced 500 ms, foo MUST save to `settings.json → window` (keys exactly as 08-0 §A `window`, X-53):

| Key (`settings.window.*`) | Value |
|---|---|
| `bounds` | `getNormalBounds()` `{ x, y, width, height }` (the un-maximized rect, so un-maximize returns to it) |
| `maximized` | boolean |
| `displayId` | `String(screen.getDisplayMatching(bounds).id)` |
| `sidebarWidth` | current left shell width (§3.4.1); default 340, range 300–460 |
| `rightShellOpen` | right shell open at L (§3.7.1); default `true` (the L layout opens with the right shell, BP1) |
| `lastChatId` | the open chat |

On launch:
1. If the saved rect is less than 50 % inside some display's `workArea`, ignore it and use the default size (§3.1.1). Same on the `display-removed` event while running. `[WIN §16.6, reported]`
2. Restore `maximized` after `ready-to-show`.
3. Open `lastChatId`. If that chat no longer exists, open foo's chat.
4. Each chat restores its own scroll position for the session. On launch every chat opens at the bottom, or at the unread divider if it has unread messages (§3.6.5).
5. Launch with `--hidden` (start at login, `09`) creates the window but does not show it.

### 3.1.3 Breakpoints

Breakpoints are measured on the **window's content width** (CSS `100vw`), not the screen. `[WIN §1.1 exact S6: design for the window]`

| Name | Width | Left shell | Main shell | Right shell |
|---|---|---|---|---|
| **L** | ≥ 1280 | 340 default, resizable 300–460 | flex, min 480 | 340, **pushes** main; open by default |
| **M** | 1008–1279 | 340 default, resizable 300–400 | flex, min 520 | 340, **overlays** main; closed by default |
| **S** | 640–1007 | **300 fixed** (no resize handle) | flex, min 340 | 340, overlays main; closed by default |
| **XS** | < 640 | full width **or** hidden | full width **or** hidden | full window page |

`[foo decision]` from: WIN §1.1 breakpoints 640/1008 `[exact: S6]`; WA reflows to one pane below ≈750–900 (MSG §1 `[reported]`); TG main column min 380 (MSG §1 `[exact: window.style:36]`); J §0 "under 900 px the side panel collapses behind a button".

Rules:
- 3.1.3.1 At L, if `sidebarWidth + 340 + 480 > window width`, the left shell shrinks (never below 300) before the right shell closes. If it still does not fit, the right shell switches to overlay mode for that width.
- 3.1.3.2 Crossing a breakpoint MUST NOT lose state: the open chat, composer text, scroll position and panel-open choice survive.
- 3.1.3.3 At XS the app shows exactly one of: **list view** (left shell) or **chat view** (main shell). Launch at XS shows chat view of `lastChatId` with a back button. Resizing M/S → XS keeps the open chat in chat view.
- 3.1.3.4 Layout uses CSS grid on `<body>`: `grid-template-rows: var(--titlebar-h) auto 1fr` (title bar, banner strip, content). Content columns per table above. The window never scrolls; only the chat list, message list and right shell scroll (`html, body { overflow: hidden }`, HRM §1 `[exact: S/styles.css:796-804]`).

---

## 3.2 Title bar

### 3.2.1 Frame

| Item | Value | Evidence |
|---|---|---|
| Height | **`--titlebar-h` 32px** at 100 % zoom. When app zoom (`09` §9.14.3) is not 100 %, overlay height = `round(32 × zoomFactor)` and the CSS height follows `env(titlebar-area-height)`. | `02` F5; WIN §1.2 standard height `[exact: S3]`; HRM §1 scales the overlay with zoom `[exact: E/titlebar-overlay-width.ts:69-80]` |
| Electron options | `titleBarStyle: 'hidden'`, `titleBarOverlay: { color: <--bg-sidebar>, symbolColor: <--fg-1>, height: 32 }` | WIN §1.2 `[exact: E1]` |
| Caption buttons | Native, drawn by Windows through `titleBarOverlay` (min, max/restore, close; ≈ 46 × 32 each, ≈ 138px total). foo MUST NOT draw HTML caption buttons (they break Snap Layouts). | WIN §1.2 `[exact: S3; inferred Snap Layouts]` |
| Reserved width | Content MUST stop at `env(titlebar-area-x)` + `env(titlebar-area-width)`; never hard-code 138. Fallback when env is missing: 144px. | WIN §1.2 `[exact: E1]`; HRM §1 144 fallback `[exact]` |
| Theme change | On `nativeTheme 'updated'` or a theme setting change, call `win.setTitleBarOverlay({ color, symbolColor, height })` with the new `--bg-sidebar` / `--fg-1` values. High contrast: `color` = system `ButtonFace`, `symbolColor` = system `ButtonText` (read via `systemPreferences.getColor('3d-face')` / `('button-text')`). | WIN §1.2 `[exact]` |
| Background | `--bg-sidebar` across the full width | `02` F2 "title bar background"; BP1 `.titlebar` uses the sidebar tone `[exact: BP1 CSS]` |
| Bottom edge | 1px `--line` | BP1 `.titlebar{border-bottom:1px solid var(--line)}` `[exact: BP1 CSS]` |

### 3.2.2 Contents

The title bar is an **empty drag strip** in v1. It holds no icon, no title text, no search and no buttons.

| Item | Decision | Why |
|---|---|---|
| App icon / title text | none | The "foo" wordmark sits 32px lower in the left shell header (§3.4.2); BP1 shows only the caption buttons `[exact: BP1 .titlebar]`; a second "foo" would duplicate it `[foo decision]` |
| Search | none (search lives in the left shell, §3.4.3, and in the Ctrl+K palette, `06`) | WIN §1.2 wanted 48px with search; `02` F5 fixes 32px `[foo decision]` |
| `document.title` | always "foo" (never a chat name, so Alt+Tab and taskbar previews do not show who you are talking to) | `[foo decision: privacy]` |

### 3.2.3 Drag regions

| Region | `app-region` |
|---|---|
| The whole title bar strip (0 → `titlebar-area-width`) | `drag` |
| Left shell header (§3.4.2) empty space and wordmark | `drag` |
| Main shell chat header (§3.6.2) empty space, name and status text | `drag` |
| Every button, field, chip, menu, avatar and link anywhere | `no-drag` |

- Double-click on any drag region toggles maximize; right-click opens the Windows system menu. foo MUST NOT `preventDefault` `system-context-menu`. `[WIN §1.2 exact S3, E3]`
- Dragging the chat header name or the wordmark moves the window; clicking them does nothing else.

### 3.2.4 States

| State | Treatment |
|---|---|
| Active window | as above |
| Inactive window | unchanged colours (the strip has no text to dim); caption glyph dimming is done by Windows |
| Maximized | unchanged; Windows removes the corner radius |
| High contrast | strip `Canvas`, bottom edge 1px `CanvasText` |

### 3.2.5 Narrator

The strip has no accessible element. The window's accessible name is "foo".

Test id: `titlebar-strip` (the drag strip element; tests use it to check height and drag behaviour).

---

## 3.3 Banner strip (offline, AI, cap, notifications, update)

One strip directly under the title bar, **full window width**, above all three columns. It is the only place that shows app-wide conditions. At most **one** banner shows; the highest priority wins; when it clears, the next one shows.

`[foo decision]` from WIN §10 "InfoBar-style strip under the title bar" `[inferred]`, MSG §16 WA yellow offline banner at the top of the list `[reported]`, Article 29 "says so in one line with one fix button".

### 3.3.1 Anatomy

```
x=0                                                                                  W
┌────────────────────────────────────────────────────────────────────────────────────┐
│ [16] (icon 20)  [8] Text, one line, --t-small, ellipsis ......  [Button 32h] [✕36] │ 40px (min-height)
└────────────────────────────────────────────────────────────────────────────────────┘
   1px --line bottom border
```

| Part | Value | Test id |
|---|---|---|
| Height | `--s7` 40px min-height; grows with text scaling; text wraps to a second line at XS instead of truncating | `banner-strip` |
| Padding | 0 `--s3` (16px) | — |
| Icon | 20px, colour per type | — |
| Text | `--t-small` 13/18, `--fg-1` | — |
| Button | `--btn-h-sm` 32px, padding 0 `--s2`, radius `--r-full` (pill) [settled: X-01], `--t-body-strong`, text colour per type, transparent fill, 1px border in the type's colour; hover `--bg-hover`; pressed `--bg-pressed` | `banner-action` |
| Dismiss | only on dismissible types: Dismiss icon 20 in a `--icon-btn` 36 hit area, `aria-label="Hide this message"` | `banner-dismiss` |
| Bottom edge | 1px `--line` | — |
| Enter / exit | height 0 → 40 with `--m-normal` `--ease-in`; exit `--m-normal` `--ease-out`; reduced motion: appears instantly | — |

### 3.3.2 Types (priority order, highest first)

| # | Type | When shown | Fill / icon colour | Icon | Copy | Button → action | Dismissible | Test id |
|---|---|---|---|---|---|---|---|---|
| 1 | Offline | no internet for ≥ 10 s (J19.1) | `--warn-soft` / `--warn` | CloudOff | "You're offline. Your jobs are saved and I'll carry on when you're back." | "Try again" → re-test now | no | `banner-strip` `data-state="offline"` |
| 2 | AI not answering | 2 failed requests to `{AI}` in a row (J19.1) | `--warn-soft` / `--warn` | Warning | "{AI} isn't answering right now. Your jobs are paused, not lost." | "Try again" | no | `banner-strip` `data-state="ai_not_answering"` |
| 3 | AI signed out | `{AI}` reports signed out | `--warn-soft` / `--warn` | Key | "You've been signed out of {AI}." | "Sign in" → J2 sign-in card in foo's chat | no | `banner-strip` `data-state="ai_signed_out"` |
| 4 | AI cap reached | AI spend ≥ cap (Article 13, J19.3) | `--bad-soft` / `--bad` | Money | "You've reached this month's AI cap ({cap}). New work is paused." | "Raise cap" → Settings → Money (AI spend section) [settled: X-07] | no | `banner-strip` `data-state="ai_cap"` |
| 5 | Plan limit | `{AI}` plan limit hit (J19.2) | `--warn-soft` / `--warn` | Clock | "{AI}'s limit resets at {time}. Your jobs are paused, not lost." · no reset time: "{AI}'s limit is reached. I'll check every 15 minutes." | "Remind me at {time}" (only when a time is known; else no button) | no | `banner-strip` `data-state="plan_limit"` |
| 6 | Notifications blocked | Windows reports toasts disabled for foo (`09` §9.9.7) | `--warn-soft` / `--warn` | Alert | "Windows is blocking foo's notifications. You might miss approvals." | "Turn them on" → opens `ms-settings:notifications` | yes, returns after 7 days | `banner-strip` `data-state="notifications_blocked"` |
| 7 | Update ready | an update finished downloading (`09` §9.20) | `--accent-soft` / `--accent` | ArrowSync | "A new version of foo is ready." | "Restart foo" → `09` §9.20.4 | yes ("Later"), returns at next launch | `banner-strip` `data-state="update_ready"` |

- 3.3.2.1 Banner copy MUST name the time absolutely ("3:00 PM"; if not today, "Sat 17 Oct, 3:00 PM"). (Article 21)
- 3.3.2.2 The in-chat error cards of J19 still appear in chats; the banner is the persistent app-wide line. Chapter `04` MUST NOT add a second offline bar above the composer (one line, Article 29); it changes the composer placeholder only.
- 3.3.2.3 High contrast: fill `Canvas`, 1px `CanvasText` bottom border, icon and text `CanvasText`, button `ButtonText` on `ButtonFace`.

### 3.3.3 Keyboard and Narrator

- The banner is the **first** F6 stop when present (§3.9.2).
- Container: `role="status"` (`aria-live="polite"`) for types 1–3, 5–7; `role="alert"` for type 4 (cap reached stops work). Narrator reads the text once when it appears.
- Button names are the visible labels; Dismiss is "Hide this message".

---

## 3.4 Left shell (chat list)

### 3.4.1 Column

| Item | Value | Evidence |
|---|---|---|
| Width | `--sidebar-w` 340 default; drag range 300–460 at L, 300–400 at M; fixed 300 at S; 100 % at XS list view | `02` F5; MSG §3 Signal 280–380 `[exact: leftPaneWidth.std.ts:10-13]`, TG 260–540 `[exact]`; S/M caps `[foo decision]` |
| Background | `--bg-sidebar` | `02` F2; BP1 `.side` `[exact]` |
| Right edge | 1px `--line` | BP1 `.side{border-right}` `[exact]` |
| Vertical layout | header 60 · search 52 · chips 44 · list (flex, scrolls) · footer 64 | §3.4.2–§3.4.10 |
| Scrolling | only the list scrolls; header, search, chips and footer stay fixed. Native overlay scrollbars, never restyled. | WIN §4 `[inferred]` |

**Resize handle** (L and M only):
- 8px wide invisible strip centred on the right edge, full height below the title bar, `cursor: col-resize`. `[MSG §3 Signal exact: NavSidebar.scss:122-141]`
- Hover: the 1px edge becomes 2px `--line-strong` (colour change `--m-fast`). Dragging: 2px `--accent`.
- Double-click resets to 340.
- Keyboard: the handle is focusable (`role="separator"`, `aria-orientation="vertical"`, `aria-label="Resize chat list"`, `aria-valuemin/max/now`). ← / → change width by 20px (`--s4`); Home = min; End = max.
- Width persists (§3.1.2).

Test id: `sidebar` (the column, `<nav>`), `sidebar-resize` (the handle).

### 3.4.2 Header

```
x=0  16                                                         W-16
┌──────────────────────────────────────────────────────────────────┐
│[16] foo                               [ + New helper ] [8] [⋯]   │ 60px (--header-h)
└──────────────────────────────────────────────────────────────────┘  no bottom border
```

| Part | Value | Evidence | Test id |
|---|---|---|---|
| Height | `--header-h` 60; MUST align with the main chat header | `02` F5; MSG §2 WA 60–62 `[measured ±4]` | — |
| Padding | 0 `--s3` (16) | BP1 `.side .head{padding:16px 16px 10px}` `[exact]` | — |
| Wordmark | "foo" (always the literal app name, never `{agentName}`), `--t-wordmark` (new token, §3.12): Segoe UI Variable Display 24/32, weight 800, tracking −0.05em, lowercase, `--fg-1`. Not a button. `app-region: drag`. | BP1 `.side .head b{font-size:24px;font-weight:800;letter-spacing:-.05em}` `[exact]`; `02` F0 wordmark | — |
| "+ New helper" | button, `--btn-h-sm` 32, padding 0 `--s2`, radius `--r-full`, 1px `--line`, fill `--bg-raised`, Add icon 16 + label "New helper" `--t-body-strong` `--fg-1`, gap `--s0` | BP1 `.btn` pill "+ New helper" `[exact]` | `sidebar-new-helper` |
| Menu | MoreHorizontal 20 in `--icon-btn` 36, radius `--r-full`, `aria-label="More options"` | MSG §2 WA ⋮ `[measured]` | `sidebar-more` |
| Gap button → menu | `--s1` 8 | WIN §13 button↔button 8 `[exact: S5]` | — |

"+ New helper" states: rest; hover `--bg-hover`; pressed `--bg-pressed` + scale 0.97; focus ring; disabled (first-run setup not finished, J1) with tooltip "Finish setting up first". Action: opens New helper (`06`, J15). Tooltip: "New helper (Ctrl+N)".

**Menu style (all shell menus):** fill `--bg-raised`, radius `--r-md` 12, 1px `--line`, `--shadow-16`, padding `--s0` 4; items min-height 40, padding 0 `--s2`, radius `--r-sm`, `--t-body` `--fg-1`, shortcut hint right-aligned in `--t-caption` `--fg-3`; item hover `--bg-hover`; separator 1px `--line` with `--s0` margin; destructive items `--bad`; opens `--m-normal` `--ease-in` (fade + 4px drop), reduced motion: instant. Keys: ↑/↓ move, Enter/Space choose, → opens a submenu, ←/Esc closes. `role="menu"` / `menuitem`.

**More options menu** items, in order:

| Item | Shortcut shown | Action | Test id |
|---|---|---|---|
| "New helper" | Ctrl+N | `06` New helper | `sidebar-menu-new-helper` |
| "New group" | Ctrl+Shift+N | `06` New group (J16) | `sidebar-menu-new-group` |
| — separator — | | | — |
| "Memory" | | `06` Memory | `sidebar-menu-memory` |
| "Routines" | | `06` Routines | `sidebar-menu-routines` |
| "Ideas" | | `06` Ideas (`foo://ideas`, X-110) | `sidebar-menu-ideas` |
| "Activity log" | | `06` Activity | `sidebar-menu-activity` |
| "Settings" | Ctrl+, | `06` Settings | `sidebar-menu-settings` |
| "Keyboard shortcuts" | Ctrl+/ | `06` shortcuts sheet | `sidebar-menu-shortcuts` |
| — separator — | | | — |
| "Quit foo" | | `09` §9.8.4 quit flow | `sidebar-menu-quit` |

### 3.4.3 Search field

| Part | Value | Evidence | Test id |
|---|---|---|---|
| Box | margin 0 `--s3` `--s1` (16 sides, 8 bottom); height `--field-h` 36 (new token); radius `--r-full`; fill `--bg-sunken`; no border at rest | MSG §3 WA pill 36–38 `[measured ±4]`; Signal margin 16/8 `[exact: NavSidebar.scss:184-189]` | `sidebar-search-field` |
| Icon | Search 16, `--fg-3`, 12 from the left | `02` F6 | — |
| Text | `--t-small` 13/18, `--fg-1`; placeholder "Search chats" `--fg-3` | BP1 "Search chats" `[exact]` | — |
| Clear | Dismiss 16 in a 36 hit area at the right when text is present, `aria-label="Clear search"` | `[foo decision]` | `sidebar-search-clear` |

States: rest; hover fill `--bg-hover`; focus: 1px `--accent` border plus the F8 keyboard ring when focused by keyboard; typing: list filters live (no debounce; local data); disabled: never.

Behaviour (J22 step 6):
- Filters the list by chat name and last-message text, case- and accent-insensitive, combined with the active filter chip.
- Enter opens the first match. ↓ moves focus into the list. Esc clears the text; a second Esc returns focus to the list.
- A query with no matching chat shows the search empty state (§3.4.10).
- Ctrl+Shift+F focuses this field (`09` §9.17).

Narrator: `role="searchbox"`, `aria-label="Search chats"`, `aria-controls` = the list; after each change (debounced to one per 2 s) `announce("{n} chats", 'polite')` (02-3 §F25.2).

### 3.4.4 Filter chips

```
[16] ( All ) [8] ( Needs you 1 ) [8] ( Working 2 ) [8] ( Done )      height 32, row 44 incl. 4 top / 8 bottom
```

| Part | Value | Evidence | Test id |
|---|---|---|---|
| Row | padding `--s0` `--s3` `--s1` (4 top, 16 sides, 8 bottom); gap `--s1` 8; `flex-wrap: wrap` (wraps only under large text scaling) | BP1 `.filters{gap:6px;padding:0 14px 10px;flex-wrap:wrap}` `[exact]` rounded to the 4px grid | `chatlist-filters` (the radiogroup, X-128; chips `chatlist-filter-*`) |
| Chip | height `--btn-h-sm` 32; padding 0 `--s2` (12); radius `--r-full`; `--t-caption` 12/16 | MSG §3 WA chips 28–32, 12 padding `[measured]` | — |
| Unselected | fill `--bg-app`, 1px `--line`, text `--fg-2`; hover fill `--bg-hover`; pressed `--bg-pressed` | BP1 `.filters span` `[exact]` | — |
| Selected | fill `--fg-1`, text `--bg-app`, border `--fg-1`; the label adds a Checkmark 16 before it in high contrast only | BP1 `.filters span.on{background:var(--fg);color:var(--bg)}` `[exact]` | — |
| Count | after the label, separated by `--s0`: the number in the same style, `tabular-nums` | BP1 "Needs you · 1" `[exact]`; dot dropped for Narrator clarity `[foo decision]` | inside each chip |

Chips (final copy, in order):

| Chip | Shows | Count shown | Test id |
|---|---|---|---|
| "All" | every chat | never | `chatlist-filter-all` |
| "Needs you" | chats with ≥ 1 job in NEEDS YOU or a PENDING/HELD approval or choice card, or a Plan card waiting for Go (CR-0028, X-186) | when ≥ 1 | `chatlist-filter-needs-you` |
| "Working" | chats with ≥ 1 job QUEUED, WORKING or WAITING; a QUEUED job whose Plan card waits for Go does not count (CR-0028, X-186) | when ≥ 1 | `chatlist-filter-working` |
| "Done" | chats with a job DONE in the last 7 days, newest finish first | never | `chatlist-filter-done` |

`[foo decision]` from BP1 chips `[exact]`; GEM Ready/Needs attention/In progress (J22 step 6 `[reported]`).

- Exactly one chip is selected. "All" is selected on launch (not persisted).
- Counts update within 1 s of a job state change (Article 12).
- Keyboard: the row is one Tab stop; ← / → move; Space or Enter selects. Ctrl+1…9 is reserved for chats, so chips have no shortcut.
- Narrator: `role="radiogroup"` on the container `chatlist-filters`, `aria-label="Show chats"`; each chip `role="radio"`, name "{label}, {n} chats" (e.g. "Needs you, 1 chat"; "All" and "Done" without count).

### 3.4.5 Chat row anatomy

```
inset 8                                                                    inset 8
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │[12](avatar 48)[12] Name (--t-body-strong) ··············· 9:41 AM (--t-caption)│  72px
 │                    Preview (--t-small, 1 line, ellipsis)  [pill][4][badge][4][📌][🔕]│
 └─────────────────────────────────────────────────────────────────────────────┘
   radius --r-sm 8 · selected: --bg-selected + 3×24 accent bar at the left edge
```

| Part | Value | Evidence | Test id |
|---|---|---|---|
| Row | min-height `--row-chat` 72; margin 0 `--s1` (8px inset each side); 0 vertical gap between rows; radius `--r-sm`; padding 0 `--s2` (12); no separators | `02` F5; MSG §3 Signal 72 `[exact: _modules.scss:3952]`, WA 2024 inset ≈8, radius ≈8, no separators `[measured]`. BP1 drew 1px row separators; `02` inset rows win (§3.13) | `chatlist-row` (`data-chat-id`, `data-index`, `data-chat-kind`) |
| Avatar | `--avatar-list` 48, `--r-full`, rendered by `Avatar`/`Face` (02-2 §F15.9.9) from `ChatRow.face` (a `FaceRef`, 08-0 §E.7) with `mood = selectChatMood(chatId)`. Default face for foo and every helper: the living face (`02` §F15.9 [X-35, X-38]) with its mood ring for this chat's real state (§F15.9.3); the ring may overhang the 48 box into the 12px gap. Letter faces (user-picked or the user's own): foo: fill `--fg-1`, letter `--bg-app`. Helper: fill = its `--h-*` colour, letter `--on-helper` (white in both themes) (helper fills do not change with theme; F2 "white text ≥ 4.96:1"). Letter: first letter of the name, `--t-title` 20/28 600. A custom face image (J3/J15) replaces the letter. Group: up to 3 member avatars of `--avatar-inline` 26 clustered inside the 48 box (top-left, top-right, bottom-centre), each with a 2px `--bg-sidebar` ring. | `02` F2, F5; AGT §A1 cluster `[reported]` | `chatlist-row-avatar` |
| Avatar → text | `--s2` 12 | MSG §3 Signal 12 `[exact: _modules.scss:4195]` | — |
| Line 1 | name `--t-body-strong` 15/22 `--fg-1`, 1 line, ellipsis; time right-aligned `--t-caption` 12/16 `--fg-3`, `tabular-nums`, `--s1` gap. The private chat's row shows the private mark: `EyeOff` 16 `--fg-2` before the title "Private chat" (12-2 §12.30) | `02` F1 | `chatlist-row-name`, `chatlist-row-time`, `chatlist-private-mark` |
| Line 2 | preview `--t-small` 13/18 `--fg-2`, 1 line, ellipsis; right slot (status pill, unread badge, pin, mute) with `--s0` gaps | `02` F1 "chat-row preview" | `chatlist-row-preview` |
| Line gap | 2px (`--s-1`) | 22+2+18 = 42 inside 72 `[foo decision]` | — |

**Time format** (row only; full times elsewhere, Article 21):

| Last activity | Shown |
|---|---|
| Today | "9:41 AM" (Windows region short time) |
| 1–6 days ago | weekday "Thu" |
| Older, this year | "12 Dec" |
| Older, other year | "12 Dec 2025" |

The word "Yesterday" is never used alone (Article 21). Narrator always gets the full "Thu 15 Oct, 9:41 AM".

**Right slot items** (left to right; each present only when it applies):

| Item | Spec | Test id |
|---|---|---|
| Status pill | height 20 (`--t-caption` 12/16 + 2px `--s-1` vertical padding), padding 0 `--s1`, radius `--r-full`, weight 600 via `--t-caption-strong` **without** uppercase. Colours below. | `chatlist-row-pill` |
| Unread badge | min 20 × 20, padding 0 `--s0`, radius `--r-full`, fill `--accent`, text `--on-accent` `--t-caption-strong` (no uppercase), `tabular-nums`; "1"…"99", then "99+". Muted chat: fill `--bg-pressed`, text `--fg-2`. Marked-unread with no count: a 12 × 12 (`--s2`) `--accent` dot. MSG §3 WA ≈20, Signal 18 `[exact]` | `chatlist-row-unread` |
| Pinned | Pin icon 16, `--fg-3`. MSG §3 WA pin on line 2 `[reported]` | `chatlist-row-pin` |
| Muted | AlertOff icon 16 (new icon, §3.12), `--fg-3`. MSG §3 WA bell-slash `[reported]` | `chatlist-row-mute` |

**Status pill colours and copy** (one pill at most; precedence top to bottom):

| Pill | When | Fill / text | Test id |
|---|---|---|---|
| "Needs you" | any NEEDS YOU job or PENDING/HELD card in the chat | `--warn-soft` / `--warn` | `chatlist-row-pill` `data-state="needs_you"` |
| "Paused" | any job WAITING (offline, AI down, limit, cap) and none needs you | `--bg-sunken` / `--fg-2` | `chatlist-row-pill` `data-state="paused"` |
| "Working" | any job QUEUED or WORKING | `--accent-soft` / `--accent` | `chatlist-row-pill` `data-state="working"` |
| "Done" | a job turned DONE in the last 24 h and nothing above applies | `--ok-soft` / `--ok` | `chatlist-row-pill` `data-state="done"` |

`[exact: BP1 .st.need / .st.work]`; "Paused", "Done" and 24 h fade from J Appendix A `[foo decision]`.

When the time is shown in an unread chat it uses `--accent` instead of `--fg-3` (MSG §3 WA green time when unread `[reported]`).

#### 3.4.5.1 WhatsApp mirror row (X-128)

A mirrored WhatsApp group (`chats.kind='wa_mirror'`, 08-3 §16.4.3) uses the row above with these differences: avatar = `letter:{first letter of subject}` on fill `--bg-sunken`, letter `--fg-1`, with a 16px WhatsApp mark (bundled SVG, `--logo` tile, 2px inset) bottom-right of the 48 box; name = group subject; preview = `"{sender_label}: {text}"` of the newest `wa_messages` row (`[photo]` as stored; Redactor channel `preview`), rule 6 of §3.4.6; **never a status pill** (mirror chats run no jobs); unread badge = `chats.unread_count` written by ingest (08-3 §16.4.3), muted look by default (`mutedChats[chatId]='forever'` on link, so the badge is `--bg-pressed`/`--fg-2` and the AlertOff icon shows); time = `last_activity_at`; order = block 3 only (never Needs you or Pinned; pinning a mirror is not offered in the context menu). `sender_label` = `wa_contacts.name` ?? `pushName` ?? masked number, "You" for `from_me` (08-0 §H.2). The thread it opens is 04 §10.11.

| Part | Test id |
|---|---|
| Row | `chatlist-row` with `data-chat-kind="wa_mirror"` |
| WhatsApp mark on the avatar | `chatlist-row-source` (`data-state="whatsapp"`) |

### 3.4.6 Preview line content

The preview shows the first rule that applies:

| # | Case | Preview text | Style |
|---|---|---|---|
| 1 | foo or the helper is writing a reply in this chat right now | "typing…" | `--accent` |
| 2 | Unsent composer text exists and this chat is not open | "Draft: " + the draft text | "Draft:" in `--accent`, rest `--fg-2` |
| 3a | A job of this chat is WORKING or QUEUED and nothing above applies (X-154) | "Working on {job title}…" (QUEUED: "Waiting to start {job title}…") | `--fg-2`, no animation |
| 3 | A card waits on the user | approval/payment: "Needs your OK: {card title}"; choice: "Pick one: {question}"; sign-in: "Sign in to {site}"; stuck: "I'm stuck on {job title}" | `--fg-2` |
| 4 | The latest job FAILED in the last 24 h | ErrorCircle 16 `--bad` + foo's failure line ("{site} didn't accept it. Nothing was booked.") | text `--fg-2` |
| 5 | Last message is the user's | its tick glyph (04 §3.3: `Clock` 16 when waiting to send, `TickSingle` sent, `TicksDouble` delivered, all `--fg-3`; `TicksDouble` in `--tick-read` when read) + 4px + "You: {text}". Not sent (04 §7): `ErrorCircle` 16 `--bad` + 4px + "Not sent: {text}" [FE-29, UX-25] | `--fg-2` |
| 6 | Last message is from foo or a helper in a group | "{sender}: {text}" (BP1 "foo: Mom's cake is ordered 🎂" `[exact]`) | `--fg-2` |
| 7 | Last message is from foo / the helper in its own chat | "{text}" | `--fg-2` |

Non-text last messages render as: card → "{card label}: {title}" using the card's label from `05` (e.g. "Payment: ₹14,600 to Taj Holiday Village", "Checklist: Booking your Goa stay · 2 of 4"); voice note → Mic 16 + "Voice message ({m:ss})"; photo → Image 16 + "Photo"; file → Document 16 + "{file name}". Markdown is stripped; line breaks become spaces. Secrets are never in previews (Article 8). Emoji are kept (BP1 `[exact]`).

`[foo decision]` from AGT §A1 preview priority `[reported]`; MSG §3 WA typing/draft `[reported]`.

Test id: every case renders inside `chatlist-row-preview`; the tick glyph of rule 5 carries `data-state` = TickState.

### 3.4.7 Row states

| State | Treatment |
|---|---|
| Rest | transparent fill |
| Hover | `--bg-hover`, `--m-fast` |
| Pressed | `--bg-pressed` (no scale on rows) |
| Selected (the open chat) | `--bg-selected` + a 3 × 24px `--accent` bar, radius `--r-full`, vertically centred on the row's left edge (x = 0 of the row box). Hover on a selected row keeps `--bg-selected`. `02` F2; WIN §3 accent pill `[inferred]` |
| Keyboard focus | F8 ring drawn **inside** the row (inset 2px) so it is not clipped by the list |
| Unread | time in `--accent`, unread badge |
| Needs you / Paused / Working / Done | pill per §3.4.5 |
| Typing | preview "typing…" |
| Draft | preview "Draft: …" |
| Failed | preview rule 4 |
| Pinned | Pin icon; position per §3.4.8 |
| Folded (X-153) | A helper chat folds to one 44px line when all hold: no job QUEUED, WORKING, WAITING or NEEDS YOU; no PENDING card; no unread; its last job ended DONE more than 24 h ago; not pinned; not foo's chat. Line: `--avatar-inline` 26 face, `--s2` gap, name `--t-small` `--fg-1`, then " · Done {Thu}" `--t-caption` `--fg-3`, time at right. Click opens the chat as usual; any new message, job or card unfolds it. Order unchanged (§3.4.8). Test id `chatlist-row` with `data-folded="true"` |
| Muted | AlertOff icon; neutral badge |
| Disabled (first run, J1) | foo row only, `--fg-disabled` name and preview "Setting up…", not clickable |
| Loading | skeleton: 48 circle + two bars (60 % and 85 % width, 12px tall, `--r-xs`) in `--bg-sunken`; no shimmer |
| High contrast | selected = `Highlight` fill + `HighlightText`; pills = 1px `CanvasText` border + word; badge = `Highlight` / `HighlightText` |

In code (02-3 §F26): selected = `aria-selected="true"` on `chatlist-row`; disabled = `aria-disabled="true"`; loading rows render `Skeleton` with `data-loading`; unread = `chatlist-row-unread` present; the pill's `data-state` carries the pill word.

### 3.4.8 Order rules (final)

The list is sorted into three blocks, top to bottom, with **no section labels**:

1. **Needs you** — every chat whose pill is "Needs you". Inside: soonest card expiry first (J §5 timers), then longest waiting first.
2. **Pinned** — foo's chat first (always pinned; cannot be unpinned), then up to **3** user-pinned chats in the order they were pinned. A chat that is pinned **and** needs you appears only in block 1.
3. **Everything else** — by last message time, newest first. Card state changes inside a chat (checklist ticks, card collapse) do **not** move a chat; a new message does.

`[foo decision]`: AGT §A1 "Needs you pins to the top in its own group" `[reported]`; WA pins max 3 (MSG §3 `[reported]`); approvals expire in 10–60 min (J §5), so they must never be below the fold.

- 3.4.8.1 Re-sorting is instant (no animation; F7 lists none). Keyboard focus and selection follow the chat id, never the row index.
- 3.4.8.2 Muted chats are not moved down.
- 3.4.8.3 Archive is not in v1 (no "Archived" row). `[foo decision: fewer places for a non-technical user to lose a chat]`
- 3.4.8.4 The private chat (12-2 §12.30), while it exists, sits directly under foo's row regardless of time or unread; it cannot be pinned or muted (menu items hidden). (X-128)
- 3.4.8.5 A WhatsApp mirror row (§3.4.5.1) sorts in block 3 only. (X-128)

### 3.4.9 Context menu

Opened by right-click, Shift+F10 or the Menu key on a row. Menu style as §3.4.2. Items (final copy; only those that apply show):

| Item | foo's chat | Helper | Group | Action | Test id |
|---|---|---|---|---|---|
| "Pin to top" / "Unpin" | — (always pinned) | ✓ | ✓ | toggles; a 4th pin shows "You can pin up to 3 chats." as a 4 s in-app status line under the list header (`role="status"`, `chatlist-status`) | `chatlist-menu-pin` |
| "Mark as unread" / "Mark as read" | ✓ | ✓ | ✓ | toggles the unread dot | `chatlist-menu-unread` |
| "Mute notifications" ▸ "For 8 hours" · "For 1 week" · "Always" / "Unmute" | ✓ | ✓ | ✓ | writes `settings.notifications.mutedChats[chatId]` (08-0 §A: until epoch ms for 8 hours / 1 week, `'forever'` for Always; Unmute deletes the entry); mutes message, routine and brief toasts; **never** mutes Needs-you toasts (approvals, payments, sign-ins, stuck) `[foo decision: Article 5/7 cards must reach the user]` | `chatlist-menu-mute` › `chatlist-menu-mute-8h`, `chatlist-menu-mute-1w`, `chatlist-menu-mute-always` |
| "Open profile" | "Open {agentName}'s profile" | "Open {name}'s profile" | "Group info" | `06` | `chatlist-menu-profile` |
| "Search in this chat" | ✓ | ✓ | ✓ | opens the chat with Find (§3.6.3) | `chatlist-menu-find` |
| — separator — | | | | | — |
| "Clear messages…" | ✓ | ✓ | ✓ | opens confirm **C-1** (06-3 §14; copy owned there, `dialog-c-01`); after clearing, the chat shows the 04 §19.5 system line "Messages cleared on {Fri 16 Oct}. Running jobs kept going." (`marker_kind = system_line`) [X-33] | `chatlist-menu-clear` |
| "Delete helper…" / "Delete group…" | — | ✓ | ✓ | opens confirm **C-5** (or **C-6** when the helper has a job QUEUED/WORKING/NEEDS YOU/WAITING) / **C-7** (06-3 §14; `dialog-c-05`, `dialog-c-06`, `dialog-c-07`) | `chatlist-menu-delete` |

Shortcuts shown in the menu: Pin Ctrl+Shift+P, Mark unread Ctrl+Shift+U, Mute Ctrl+Shift+M (`09` §9.17).

### 3.4.10 Empty and error states of the list

The "All" list is never empty: foo's chat always exists.

Every case uses the 02-2 §F16.2 **Block** anatomy as written there for the left shell: 32 top padding (`--s6`), centred, max width 260, icon 24 `--fg-3` (or the colour given) → 12 → body `--t-small` `--fg-2` → 16 → the one button if any. No title in the left shell [UX-26]. Copy rows are 02-2 §F16.3 E-3…E-6.

| Case | Shown in the list area | Test id |
|---|---|---|
| "Needs you" chip, none | icon CheckmarkCircle 24 `--fg-3`; "Nothing needs you right now." | `chatlist-empty` `data-state="needs_you"` |
| "Working" chip, none | icon Clock 24; "Nothing is running right now." | `chatlist-empty` `data-state="working"` |
| "Done" chip, none | icon CheckmarkCircle 24; "Jobs finished in the last 7 days show here." | `chatlist-empty` `data-state="done"` |
| Search, no match | icon Search 24; "No chats match "{query}"." + Link button "Search all messages" (`Button variant="link" size="sm"`, 06 §0.4) → opens the Ctrl+K search overlay with the query (J22) | `chatlist-empty` `data-state="search"`; button `chatlist-empty-action` |
| List failed to load | icon ErrorCircle 24 `--bad`; "I couldn't load your chats. They're safe on this PC." + button "Try again" | `chatlist-empty` `data-state="load_failed"`; button `chatlist-empty-action` |
| First run (J1) | only the disabled foo row (§3.4.7) | `chatlist-row` (disabled) |

Narrator: empty states are `role="status"`.

### 3.4.11 Sidebar footer

```
┌──────────────────────────────────────────────────────────────────┐ 1px --line top
│[12](V 26)[8] Vikas · ● Claude ready                 [⚙ 36][12]   │ 64px
│             ₹212 of ₹1,000 AI this month                         │
└──────────────────────────────────────────────────────────────────┘
```

| Part | Value | Evidence | Test id |
|---|---|---|---|
| Height | `--s9` 64 min-height; 1px `--line` top; fill `--bg-sidebar`; padding 0 `--s2` | OCL §3 footer 53 `[exact]`, AIC §3 account row `[measured]`; 64 on the grid `[foo decision]` | `sidebar-footer-status` (container is the button) |
| Status button | the whole left part (avatar + two lines) is one button, radius `--r-sm`, hover `--bg-hover`; action: Settings → Account & your AI [settled: X-07] | `[foo decision]` | `sidebar-footer-status` |
| Avatar | `--avatar-inline` 26, user's initial, fill `--h-slate`, letter `--on-helper` (helper-palette rule) | `02` F2, F5 | — |
| Line 1 | "{You}" `--t-small` `--fg-1`, then " · ", then an 8px dot + AI status text `--t-small` `--fg-2` | | — |
| Line 2 | spend `--t-caption` `--fg-3` | | — |
| Settings | Settings icon 20 in `--icon-btn` 36, `aria-label="Settings"`, tooltip "Settings (Ctrl+,)" | J21 "gear icon at the bottom of the chat list" | `sidebar-footer-settings` |

AI status (line 1), from the AI connection state in `08`:

| State | Dot | Text |
|---|---|---|
| Verified in the last 10 min | `--ok` | "{AI} ready" |
| Checking | `--fg-3` | "Checking {AI}…" |
| Not answering | `--bad` | "{AI} isn't answering" |
| Signed out | `--bad` | "Signed out of {AI}" |
| Plan limit | `--warn` | "{AI} limit until {time}" |
| Offline | `--warn` | "Offline" |
| Not set up (first run) | `--fg-3` | "Setting up" |

Spend (line 2):

| Case | Text | Colour |
|---|---|---|
| Key-based AI, < 80 % of cap | "{spent} of {cap} AI this month" (e.g. "₹212 of ₹1,000 AI this month") | `--fg-3` |
| Key-based AI, 80–99 % | same text | `--warn` |
| Key-based AI, ≥ 100 % | "AI cap reached · {cap}" | `--bad` |
| Plan-based AI (no key) | "Uses your {AI} plan" | `--fg-3` |

Narrator: status button name "{You}, {AI status text}, {spend text}. Open AI settings."

---

## 3.5 Main shell frame

| Item | Value | Test id |
|---|---|---|
| Background | `--bg-app`, flat; **no wallpaper or pattern** (`02` F0) | — |
| Vertical layout | chat header 60 · optional find bar 52 · message list (flex, scrolls) · composer area (height owned by `04`) | — |
| Landmark | `<main aria-label="Chat with {name}">` | `thread` |
| Chat switch | MUST render the newest 50 cached messages within 100 ms (Article 28). If the cache misses for > 300 ms, show 4 skeleton bubbles (`--bg-sunken`, `--r-bubble`, alternating sides, widths 40/60/30/50 %) | `thread-skeleton` |
| Chat failed to open | centred: ErrorCircle 24 `--bad`, "I couldn't open this chat. Your messages are safe." `--t-body` `--fg-2`, button "Try again" | `thread-error`; button `thread-error-retry` |
| No chat selected | never at L/M/S (launch opens `lastChatId`, §3.1.2). At XS list view the main shell is hidden. | — |

---

---

Continued in `03-shell-2.md` (§3.6 main shell contents, §3.7 right shell, §3.8 footers, §3.9 keyboard, §3.10 wireframes, §3.11 acceptance, §3.12 new tokens, §3.13 conflicts).
