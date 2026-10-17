# 06 · Screens (index and shared rules)

Every page, window, dialog and overlay in foo that is **not** the chat itself. The window frame, left/main/right shells, headers and the banner strip are in `03-shell-1.md` / `03-shell-2.md` (cited as 03 §3.x); bubbles and the composer are in `04-messages-and-composer.md`; every in-chat card (Choice, Approval, Payment, Draft, Secret box, Sign-in, Connect, Plan, Checklist, Routine, Proof, Error) is in `05-cards.md`. This chapter **references** those and never redefines them. Where this chapter needs a value that 03–05 do not give, it is defined here in §0 and is binding for every screen in 06.

Authority: Articles (`01`) and Foundations (`02`) override this chapter. Journey copy in `research/journeys-1..4.md` was the draft; where this chapter changes a journey's copy, the change is listed in §0.12 and this chapter wins.

## Parts

| File | Sections |
|---|---|
| `06-screens.md` (this file) | §0 shared rules: surface kinds, page/dialog/overlay frames, controls, common states, keyboard, Narrator, screen inventory, shortcuts, new tokens requested, conflicts resolved |
| `06-screens-1.md` | §1 Splash and cold start · §2 First run (welcome, find your AI, name + face + vibe, interview + connect, first real task, "see you tomorrow") · §3 New helper dialog · §4 Profile pages (helper, foo, group) · §5 New group dialog |
| `06-screens-2.md` | §6 Settings (every page, every row) · §7 Memory "What I know about you" · §8 Routines |
| `06-screens-3.md` | §9 Activity log · §10 Spend · §11 Watch live (live window; no in-panel live view, X-95; sign-in window is 05 §5.10; no receipt window [settled: X-02]) · §12 Search (Ctrl+K) · §13 Attachment viewer · §14 Confirm dialogs · §15 Windows Hello surfaces (flow in 09 §9.19) · §16 Updates and What's new (states in 09 §9.20) · §17 Crash recovery surfaces (09 §9.21) · §18 Safe mode card and Send a report · §19 Keyboard shortcuts sheet |

---

## §0. Shared rules for every screen

### 0.1 Surface kinds

Every surface in 06 is exactly one of these kinds. A coding agent MUST build each kind once as a reusable component and MUST NOT invent a sixth kind.

| Kind | Where it draws | Size | Frame | Closes with |
|---|---|---|---|---|
| **Page** | Replaces the main shell **and** the right shell at breakpoints L, M and S (03 §3.1.3). The left shell (chat list) stays visible and interactive. At XS (< 640px) the page replaces the whole content area and its back arrow returns to the place it came from. | Fills the area. Content column max `--column-max` (760px), centred. Side padding `--s5` (24px) when the area is ≥ 900px wide, `--s3` (16px) below. | `--bg-app`. Page header 60px (`--header-h`), aligned with the left shell header, 1px `--line` bottom border. | Back button, Esc (when focus is not in an input with text), or clicking any chat in the left shell |
| **Dialog** | Centred over the whole window on `--scrim`. | Width `--dialog-sm` 400px, `--dialog-md` 520px or `--dialog-lg` 720px (new tokens, §0.11); never wider than window width − 32px. Max height window height − 64px; the body scrolls, title and footer stay fixed. | `--bg-raised`, `--r-lg`, `--shadow-28` (dark: + 1px `--line` border). Padding `--s5` (24px). | Esc or the Cancel/secondary button, unless the dialog says "Esc does nothing" |
| **Overlay** | Over the whole window, above dialogs' z-level is never needed (only one overlay or dialog at a time). | Per screen (Search §12, Attachment viewer §13, Shortcuts sheet §19). | Per screen. | Esc |
| **Window** | A separate Windows window (`BrowserWindow`) with native caption buttons (09-windows). | Per screen (§11, §15, §17). | Title bar per 03-shell rules at `--titlebar-h` 32px. | Native close button |
| **Banner** | App-wide conditions use **only** 03's banner strip (03 §3.3: one strip under the title bar, one banner at a time, priority order). Screens in 06 never add a second app-wide bar. A **page banner** (a condition of one page, e.g. "Trips is paused") sits at the top of that page's content column. | App strip: 03 §3.3.1. Page banner: content-column width, min-height 40px (`--s7`). | Per tone, §0.6. | Its own button or Dismiss, per screen |

Rules:
- **Layers (FE-26).** Dialogs, Overlays, confirms, menus and tooltips render through React portals into one element `<div id="layers">` placed right after `#root` in `index.html`; nothing portals into `document.body`. Their z-order uses only the 02-2 §F12 tokens: `--z-undo` (undo bar), `--z-menu` (menus, popovers), `--z-scrim` (the scrim), `--z-dialog` (Dialogs, Search, Shortcuts sheet, attachment viewer), `--z-confirm` (a confirm on top of a Dialog), `--z-dialog-menu` (a menu inside a dialog), `--z-tooltip`. Notifications are Windows' own and have no z-index in the app. Opening a Dialog or Overlay closes every open menu and tooltip.
- **Single instance.** Only one interactive Dialog or Overlay exists at a time (08-0 §G.10 navigation model). Opening a second one closes the first, except confirm dialogs (§14), which may open on top of a Dialog at `--z-confirm`; then the first Dialog is inert (`inert` attribute) until the confirm closes. A second request for a dialog that is already open focuses it instead of opening a copy.
- A Page never opens on top of a Dialog. Opening a Page from a Dialog closes the Dialog first.
- Every Page and Dialog keeps its scroll position and unsaved field values for the life of the app session (not across restarts), so leaving to a chat and coming back loses nothing.
- Pages animate in with a fade `--m-normal` `--ease-in` (no slide). Dialogs: fade + scale 0.96→1, `--m-slow` `--ease-in`; exit fade `--m-normal` `--ease-out`. `prefers-reduced-motion`: fades ≤ 83ms, no scale (02 F7).

### 0.2 Page header (all Pages)

```
┌──────────────────────────────────────────────────────────────────────────────┐ 60px
│ [←]  Title                                       [secondary actions] [⋯]     │
└──────────────────────────────────────────────────────────────────────────────┘ 1px --line
  16   36   12  --t-title (20/28, 600)                     icon buttons 36×36, gap 4, right pad 16
```
- Back button: `--icon-btn` 36px hit area, Fluent `ArrowLeft` 20px, `--fg-2` (hover `--fg-1`, `--bg-hover`, `--r-sm`). Tooltip "Back (Esc)". Narrator name "Back to {previous place}" (e.g. "Back to chat with foo").
- Title: `--t-title`, `--fg-1`, one line, ellipsis.
- Header actions are icon buttons (36px) or `--btn-h-sm` 32px buttons (§0.4 Secondary), right-aligned, 8px gap.
- Test ids (08-0 §C): the page root is `screen-{slug}` (slugs in §0.9's Test id column), the back button `screen-back`, the title `screen-title`; header buttons use `{area}-{element}` ids given in each screen's table.
- Copy keys (08-0 §D): every quoted string in 06-1…06-3 lives in `src/shared/copy/en-IN.json` under `{area}.{component}.{slot}[.{state}]`, where area is the screen's test-id area (`setup`, `settings`, `screen`, `dialog`, `memory`, `routines`, `activity`, `spend`, `search`, `live`, `profile`), component is the screen or dialog slug in lower_snake (`new_helper`, `c_21`), and slot is the table's Element/Row id in lower_snake. A key written next to a string in a table wins over this rule.

### 0.3 Dialog anatomy (all Dialogs)

```
┌─────────────────────────────────────────────────────┐  --r-lg, --bg-raised, --shadow-28
│ 24                                                   │
│ Title (--t-subtitle 16/22 600)                [✕]    │  ✕ = 36px icon button, top-right 12px inset
│ 8                                                    │
│ Body (--t-body 15/22, --fg-1; secondary --fg-2)      │
│ 24                                                   │
│                       [ Secondary ]  [ Primary ]     │  buttons --btn-h 40, gap 8, right-aligned
│ 24                                                   │
└─────────────────────────────────────────────────────┘
```
- Destructive dialogs: button order is always `[ Destructive ]  [ Cancel ]`, Cancel rightmost, and Cancel holds default focus. Non-destructive dialogs: `[ Secondary ]  [ Primary ]`, Primary holds default focus. `[foo decision: the safe choice is where focus starts and where Enter lands]`
- Enter activates the focused button only. Enter inside a single-line field activates the Primary button if it is enabled. Enter never triggers a Destructive button unless that button has focus.
- Narrator: `role="dialog"` + `aria-modal="true"` + `aria-labelledby` (title) + `aria-describedby` (first body paragraph). Destructive confirms use `role="alertdialog"`. Focus is trapped inside; on close, focus returns to the element that opened the dialog.
- Test ids (08-0 §C.3, X-118): a confirm's root is `dialog-c-{nn}` (two digits, optional one-letter suffix: `dialog-c-05`, `dialog-c-13b`, `dialog-c-21`); every other Dialog's root is `dialog-{slug}` with the slug from the 08-0 §C.3 closed list (§0.9 lists where each is used); inside every dialog `dialog-close` (the ✕), `dialog-primary` (the Primary or Destructive button), `dialog-secondary` (the Secondary or Cancel button) and `dialog-confirm-field` (a typed-confirm or amount field). Copy keys: `dialog.c_{nn}.*` for confirms, `dialog.{slug}.*` (`-` → `_`) for every other Dialog (08-0 §D).

### 0.4 Controls used on screens

Card buttons inside chats are defined in 05-cards; screens use these. If 05 defines the same control, the two MUST render identically; 05 wins on a mismatch and the mismatch goes in `GAPS.md`. All text buttons (Primary, Secondary, Destructive) are pills `--r-full`; inputs, rows and menus keep `--r-sm` [settled: X-01].

| Control | Size | Rest | Hover | Pressed | Focus | Disabled | Test id |
|---|---|---|---|---|---|---|---|
| **Primary button** | height `--btn-h` 40 (dialogs, pages, cards; a Primary is never 32), padding 0 16px, `--r-full` (pill) [settled: X-01], label `--t-body-strong` | bg `--accent`, text `--on-accent` | `--accent-hover` | `--accent-pressed`, scale 0.97 | ring (02 F8) | bg `--bg-sunken`, text `--fg-disabled` | per screen table |
| **Secondary button** | `--btn-h` 40, or `--btn-h-sm` 32 in page headers and rows | bg transparent, 1px `--line-strong`, text `--fg-1` | `--bg-hover` | `--bg-pressed`, scale 0.97 | ring | text `--fg-disabled`, border `--line` | per screen table |
| **Destructive button** | as Secondary | bg `--bad`, text `--on-bad` (new token) | bg `--bad` + 8% black overlay (`filter: brightness(.92)`) | brightness .85, scale 0.97 | ring | as Primary disabled | per screen table |
| **Link button** | hit height 40px (same as 05 §0.3), no padding box; text baseline aligned with the Primary button next to it (UX-09) | text `--accent`, no underline | underline | `--accent-pressed` | ring | `--fg-disabled` | per screen table |
| **Icon button** | sizes per 02-3 §F32.4 (X-119): 06 uses `md` 36 by default; cards use `lg` 40 (05 §0.3); hit area always 40×40; icon 20px (`xs` 16) | icon `--fg-2` | bg `--bg-hover`, icon `--fg-1`; hover/pressed shape `--r-full` for round (36 and 40) icon buttons everywhere; `--r-sm` only for an icon button inside a Text field or a table cell (UX-08) | `--bg-pressed` | ring | icon `--fg-disabled` | per screen table |
| **Text field** | sizes per 02-3 §F32.4 (X-119): 06 uses `md` 40 by default; cards use `sm` 36 (`--field-h`); search fields are `size='sm' shape='search'`; padding 0 12px, `--r-sm`, `--t-body` | bg `--bg-sunken`, 1px `--line-input` [X-25], text `--fg-1`, placeholder `--fg-3` | border `--fg-3` | — | border 1px `--accent` + ring on keyboard focus | text `--fg-disabled`, bg `--bg-sunken`, border `--line` | per screen table |
| **Field error** | — | border 1px `--bad`; below the field 4px gap, `ErrorCircle` 16px + `--t-small` `--bad` message; `aria-invalid="true"`, message linked by `aria-describedby` | | | | | the field's id + error text `{field id}-error` |
| **Toggle** | track `--toggle-w` 40 × `--toggle-h` 20px (new tokens), `--r-full`; row hit area full row height | off: bg `--bg-sunken`, 1px `--line-input` [X-25], knob 12px `--fg-2` at left 4px · on: bg `--accent`, knob 14px `--on-accent` at right 3px | track border `--fg-3` (off) / `--accent-hover` (on) | knob width +4px | ring on track | 40% opacity is **not** used; track `--bg-sunken`, knob `--fg-disabled` | per screen table |
| **Checkbox** | 20×20px box, `--r-xs`; hit area padded to 40×40 | 1.5px `--line-input` [X-25; width as 05 §5.3.1, UX-09], bg `--bg-app` · checked: bg `--accent`, `Checkmark` 16px `--on-accent` | border `--fg-3` | `--bg-pressed` fill | ring around the box | border `--fg-disabled` | per screen table |
| **Radio** | 20px circle; hit area padded to 40×40 | 1px `--line-input` [X-25] · selected: 1px `--accent` border, 10px `--accent` dot | border `--fg-3` | `--bg-pressed` | ring | `--fg-disabled` | per screen table |
| **Segmented control** (e.g. Always / Ask / Never) | height 32px, outer `--r-sm`, bg `--bg-sunken`, 2px inner padding; each segment equal width, min 72px, `--t-body` | unselected text `--fg-2` | `--bg-hover` | `--bg-pressed` | ring on the selected segment | segment text `--fg-disabled`, tooltip explains why | per screen table |
| | | selected: bg `--bg-raised`, `--shadow-1`, text `--fg-1`, `--t-body-strong`, `--r-xs` | | | | | — |
| **Chip** (filter, multi-select) | height 32px (filters) or 40px (first-run answers), padding 0 12px, `--r-full`, `--t-caption` (32px) / `--t-body` (40px) | bg `--bg-sunken`, text `--fg-1` | `--bg-hover` | `--bg-pressed` | ring | `--fg-disabled` | per screen table |
| | | selected: bg `--accent-soft`, text `--accent`, leading `Checkmark` 16px | | | | | — |
| **Settings row** | min-height 56px, padding 0 16px, grows with text | label `--t-body` `--fg-1`; optional second line `--t-small` `--fg-2`; control right-aligned, 16px from edge | `--bg-hover` only when the whole row is clickable | `--bg-pressed` | ring around the row (`--r-sm`) | label `--fg-disabled` | `settings-row-{page}-{rowId}` (§0.13) |
| **Row group** | rows stacked in a box: 1px `--line`, `--r-lg`, bg `--bg-app`; 1px `--line` divider between rows inset 16px left | | | | | | — |
| **Section label** | `--t-caption-strong`, uppercase, tracking +0.08em, `--fg-3`; 24px above, 8px below | | | | | | — |
| **Search field (in pages)** | `TextField size='sm' shape='search'` (02-3 §F32.4, X-119): height `--field-h` (36px, 03 §3.12), `--r-full`, bg `--bg-sunken`, no border, `Search` 16px icon at 12px left, text inset 36px, `--t-body`; `Dismiss` 16px clear button appears when text exists | | | | | | per screen table |

Button heights come only from the tokens (X-92, 08-0 §H): `--btn-h` 40 (Primary, cards, dialogs, pages), `--btn-h-sm` 32 (never a Primary), `--btn-round` 36 (composer round buttons); no literal button height. Every clickable target is ≥ 40×40px (02 F5); `--btn-h-sm` buttons and 36px icon buttons pad their hit area to 40px. Component names and folders are 08-0 §E.3 (X-119): the primitives in `src/renderer/ui/` are exactly the 08-0 §E.3 list (Button, IconButton, TextField, TextArea, Checkbox, Radio, Toggle, Segmented, Chip, Dropdown, Tooltip, Menu, Dialog, ToastPreview, Pill, Stepper, Meter, Avatar, Face, Icon, Spinner, Skeleton, Banner, Kbd, EmptyState, UndoBar, Presence); screen composites (SettingsRow, RowGroup, SectionLabel, PageHeader, PageSearchField) live in `screens/shared/`; settings pages in `src/renderer/screens/settings/{Pascal(id)}Page.tsx`.

**Outlook in v1 (X-41, UJ-06).** While the build flag `flags.outlook` is false, every Outlook element is **omitted, not disabled**: the first-run app chip and the Card B pre-select (06-1 §2.4), the "or Outlook ticked" branch of Card D, the Outlook checkbox in New helper (06-1 §3) and the Outlook toggle on the helper profile (06-1 §4.1), the `a-outlook` Permissions row (06-2 §6.4), the Outlook Connections row (06-2 §6.8) and the Microsoft Connect card (05 §5.11). There is no "coming soon" copy in v1. Lists of apps in v1 are Gmail, Calendar, Contacts, WhatsApp, X (drafts only), Browser and Payments.

### 0.5 Common states (every Page, Dialog and Overlay MUST ship all of these)

| State | Rule | Shape |
|---|---|---|
| **First time** | Shown when the screen has never had content. Explains what will appear and gives one action. | Empty-state block: icon 24px `--fg-3`, title `--t-subtitle` `--fg-1`, body `--t-small` `--fg-2` (max width 360px, centred), one button (Secondary unless stated). 48px above, centred in the content column. |
| **Empty** | The screen had content and now has none (all forgotten, all deleted) or a filter matches nothing. | Same block, different copy per screen. Filter-empty always offers "Clear filters" (Link button). |
| **Loading** | Data from disk not ready within 150ms. | Static skeleton rows: blocks of `--bg-sunken`, `--r-xs`, heights matching real rows. No shimmer (02 F7 lists what animates; shimmer is not on it). After 2s still loading, one line under the skeleton: "Still loading…" `--t-small` `--fg-3`. |
| **Error** | Data could not be read. | C16 shape from 05 (what happened, what is safe, one fix button), placed in the content column. No paths, no codes (Article 2). |
| **Offline** | No internet. Screens still open and show local data (Article 29). | Only controls that need the internet are disabled; each disabled control's tooltip is "You're offline. This needs the internet." The global offline banner is 03-shell's; screens add nothing else. |
| **Saving** | A change is being written. | The changed control shows its new value at once (optimistic). If the write fails within 2s: value reverts and a row-level line appears: "That didn't save. Try again." + Link button "Try again". |

Test ids for these blocks (08-0 §C): `screen-empty` (first time and empty, with `data-state="first_time"` / `"empty"` / `"filter_empty"`), `screen-empty-action`, `screen-loading`, `screen-error` (the 05 Error card inside it keeps `card-error`), `screen-saving-retry`.

Every settings change saves immediately (no Save button) except fields that need typing (names, amounts, text), which save on Enter or on blur, and show "Saved" `--t-caption` `--ok` with `Checkmark` 16px for 2s next to the field. `[foo decision: Windows Settings pattern; nothing to forget to save]`

### 0.6 Banners (tone table)

| Tone | Bg | Text / icon | Use |
|---|---|---|---|
| Info | `--accent-soft` | `--fg-1` / `Info` 20px `--accent` | page notes (e.g. memory is off) |
| Warn | `--warn-soft` | `--fg-1` / `Warning` 20px `--warn` | paused helper, paused routines |
| Bad | `--bad-soft` | `--fg-1` / `ErrorCircle` 20px `--bad` | something on the page failed and stays failed |
| Control | `--warn` | `--on-warn` (new token) / `HandRight` 20px | "You're in control" take-over bar in foo's browser window only (§11) |

Page banners copy the 03 §3.3.1 anatomy (min-height 40px, icon 20, text `--t-small`, 32px outlined pill buttons, X-01) with `--r-md` corners and 16px space below. They use `role="status"`; Bad tone uses `role="alert"`.

App-wide crash, safe-mode and update states are **not** banners of 06: they are owned by 09 §9.20 (update) and §9.21 (crash recovery, safe mode) and 03 §3.3.2 type 7 (update ready). 06 only draws the dialogs those sections name (§16, §17, §18).

### 0.7 Keyboard (all screens)

- Tab order follows visual order, top-left to bottom-right. Lists (chat rows, memory rows, routines, activity rows, search results, settings nav) are **one Tab stop** with ↑/↓ inside, Home/End to ends, Enter to open, and row actions reachable with → (moves into the row's buttons) and ← (back to the row). `[02 F9; WIN §17 composite widgets]`
- Esc closes, in this order: open menu → open inline editor (cancels edit) → Overlay → Dialog → Page (back to the chat it came from). Esc never quits foo and never cancels a running job.
- F6 / Shift+F6 cycle: left shell → page navigation (Settings nav, Routines list) → page content → back. Every region has an accessible name.
- Every shortcut is shown in the tooltip of the control it triggers: "Settings (Ctrl+,)".

### 0.8 Narrator (all screens)

- Page: the content region is `role="main"` with `aria-label="{Page title}"`. On open, focus moves to the page title (`tabindex="-1"`), so Narrator reads "{Title}, heading level 1".
- Row groups are `role="list"`; each row `role="listitem"`; a row's accessible name reads label, then value, then state: "Quiet hours, 10:00 PM to 7:00 AM, button".
- Toggles: `role="switch"` + `aria-checked`. Segmented controls: `role="radiogroup"` with `role="radio"` segments, name = row label.
- Every status that changes on its own (testing, saving, downloading %) is announced through one polite live region per screen (`role="status"`), at most once per 2s.
- Icons never carry meaning alone: every ✓ / ⚠ / ✕ is followed by a word (02 F9).

### 0.9 Screen inventory

| § | Screen | Kind | Opens from | Shortcut | Test id (root, 08-0 §C) |
|---|---|---|---|---|---|
| 1 | Splash / cold start | Window content | app launch | — | `screen-splash` |
| 2 | First run (welcome + 4 pill steps + closing; `setup.step` 0–5) | foo chat in setup mode | first launch, "interview me", Settings → Account & your AI → "Run setup again" | — | area `setup` (`setup-step-pill`, … 06-1 §2) |
| 3 | New helper | Dialog lg | left shell "+ New helper" and ⋯ menu, Ctrl+N, foo's offer card | Ctrl+N | `dialog-new-helper` |
| 4.1 | Helper profile | Page | helper chat header name, helper row right-click → "Profile", search result | Ctrl+I in a helper chat | `screen-helper-profile` |
| 4.2 | foo profile | Page | foo chat header name | Ctrl+I in foo's chat | `screen-foo-profile` |
| 4.3 | Group profile | Page | group chat header name | Ctrl+I in a group | `screen-group-profile` |
| 5 | New group | Dialog md | left shell ⋯ menu → "New group", Ctrl+Shift+N | Ctrl+Shift+N | `dialog-new-group` |
| 6 | Settings (11 pages) | Page | gear in left shell footer, footer status button (→ Account & your AI), ⋯ menu, tray, Ctrl+, | Ctrl+, | `screen-settings` (page body `screen-settings-{page}`) |
| 7 | What I know about you | Page | left shell ⋯ menu → "Memory", right shell "See all" / "Edit", Ctrl+M | Ctrl+M | `screen-memory` |
| 8 | Routines | Page | left shell ⋯ menu → "Routines" (03 §3.4.2), Routine card "Edit", Ctrl+R | Ctrl+R | `screen-routines` |
| — | Ideas (spec 12-1 §12.24.3, X-110) | Page | left shell ⋯ menu → "Ideas", Routines first-time "See ideas", the `thread.ideas.link_line` link, deep link `foo://ideas` (`View { kind: 'screen', id: 'ideas' }`) | — | `screen-ideas` (parts `screen-ideas-*`, e.g. `screen-ideas-start`) |
| 9 | Activity log | Page | left shell ⋯ menu → "Activity log", right shell Doing now "See all", Settings → Privacy → "Activity log", Ctrl+H | Ctrl+H | `screen-activity` |
| 10 | Spend | Page | right shell "Spent this month", Settings → Money → "See spending" | — | `screen-spend` |
| 11.1 | ~~Live view~~ removed (X-95); every Watch live entry opens 11.2 | — | — | — | — |
| 11.2 | Watch live window (`live.html`, masked frames, not interactive) | Window (foo's own; X-66) | checklist "Watch live", chat header "Watch live", right-shell Doing now window button, Ctrl+Shift+L, taskbar | Ctrl+Shift+L | `live-root` (area `live`, 09 §9.27) |
| 11.3 | Sign-in / take-over banner (`signin-banner.html`, docked to the real Edge window) | Window, content owned by 05 §5.10.3, behaviour by 09 §9.27 | Sign-in card (05), "Take over" (live window, stuck card) | Alt+D ("I'm done" / "Hand back") | `signin-banner` |
| 11.4 | ~~Receipt window~~ removed [settled: X-02]; toast "Review" opens the main window at the card | — | — | — | — |
| 12 | Search | Overlay | Ctrl+K, left shell search box → "Search everything" | Ctrl+K | `search-overlay` |
| 13 | Attachment viewer | Overlay | click an image, screenshot or proof picture | — | `screen-viewer` |
| 14 | Confirm dialogs C-1…C-26 | Dialog sm/md | per action | — | `dialog-c-{nn}` |
| 15 | Windows Hello / typed amount | System prompt / Dialog sm (flow and copy owned by 09 §9.19) | Approve on payments ≥ the Hello amount | — | `dialog-type-amount` |
| 16 | Update states, restart dialog, What's new | 03 banner type 7 + 09 §9.20 copy / Dialog md | auto; Settings → About | — | `dialog-whats-new`, `dialog-restart` |
| 17 | Crash recovery surfaces | 09 §9.21 status line, native dialog, 05 recovery cards | window stops; launch after a crash | — | `screen-cant-open`, `screen-hiccup` |
| 18 | Safe mode card / Send a report | 09 §9.21 card / Dialog lg | 3 unclean launches within 10 min, or 3 engine crashes in one launch (08-0 §G.14, X-77) | — | `card-error` (safe mode), `dialog-report` |
| 19 | Keyboard shortcuts sheet | Dialog md | Ctrl+/, Settings → Keyboard shortcuts | Ctrl+/ | `dialog-shortcuts` |

Other Dialogs and their root ids (08-0 §C.3 closed list, X-118): `dialog-replace-key` (06-2 §6.1 "Replace your {OpenAI} key"), `dialog-add-card` and `dialog-add-upi` (06-2 §6.5), `dialog-dismissed-suggestions` (06-2 §6.6), `dialog-hold-to-talk` (06-2 §6.9), `dialog-licences` (06-2 §6.11 "Open-source parts"), `dialog-helper-limit` (06-1 §3 "8 helpers is the most for now"), `dialog-link-whatsapp` (06-2 §6.8), `dialog-unreadable-lines` (06-2 §7.5), `dialog-template-replace` (06-1 §3 template confirm), `dialog-privacy` (06-1 §2.1, 06-2 §6.11); the first-run "Monthly AI cap" dialog is the confirm `dialog-c-21` (06-1 §2.2). No other `dialog-{slug}` exists.

### 0.10 Shortcuts this chapter adds (to be listed in 09-windows; 09 wins on a clash) [settled: X-09; all listed in 09 §9.17.1]

| Keys | Action | Notes |
|---|---|---|
| Ctrl+, | Settings | WIN §17 |
| Ctrl+K | Search | J22 |
| Ctrl+M | What I know about you | J17 |
| Ctrl+R | Routines | J14. Electron's default reload on Ctrl+R MUST be removed from the menu in production builds |
| Ctrl+H | Activity log | `[foo decision: "history" convention]` |
| Ctrl+N | New helper | `[foo decision: in foo a "new chat" is a new helper]` |
| Ctrl+Shift+N | New group | |
| Ctrl+I | Profile of the open chat | `[foo decision: "info"]` |
| Ctrl+Shift+L | Watch live (the most recent job using the browser) | no job uses the browser → `announce('Nothing to watch right now.')` only; nothing visible changes (X-121) |
| Ctrl+/ | Keyboard shortcuts sheet | WIN §17 |
| Ctrl+F | Find in this page (Settings, Memory, Routines, Activity: focuses the page's search field) | same key as in-chat find (04) |
| Esc | Close / back, layered (§0.7) | |

### 0.11 New tokens requested (for `02-foundations.md`)

[settled: all tokens and icons below were added to `02-foundations.md` F2/F5/F6 on 2026-10-16; contrast re-checked]

| Token | Light | Dark | Used for | Why |
|---|---|---|---|---|
| `--dialog-sm` | 400px | same | small confirm dialogs, 09's first-close and type-the-amount dialogs | WIN S5 dialog width 320–548; 09 §9.8.2 and §9.19.4 already say "width 400" |
| `--dialog-md` | 520px | same | New group, What's new, Shortcuts sheet, most confirms | WIN S5 |
| `--dialog-lg` | 720px | same | New helper, Send a report preview | AGT A19 settings modal 720 |
| `--banner-h` | 40px | same | page banners and the composer banner slot (04 uses it) | AGT A18 limit banner 44 → 40 on the 4px grid; equals 03 §3.3.1 min-height |
| `--toggle-w` / `--toggle-h` | 40px / 20px | same | toggles | AGT A19 "toggles 40×20" |
| `--avatar-hero` | 96px | same | profile pages, welcome card, face picker preview | AGT A2/A16 hero 96 |
| `--avatar-pick` | 72px | same | face tiles in the 2×2 picker | foo decision (fits 2×2 in a 360px card) |
| `--settings-nav-w` | 240px | same | Settings left navigation | AGT A19 nav 200 → 240 for 15px labels at 125% text |
| `--palette-w` | 640px | same | Search overlay width | foo decision, Grok Ctrl+K palette (GRK2) |
| `--on-bad` | `#FFFFFF` | `#0D0D11` | text on `--bad` fill (destructive buttons) | `#B03224`/white 6.31:1; `#FF7B6B`/`#0D0D11` 7.66:1 |
| `--on-warn` | `#FFFFFF` | `#0D0D11` | text on `--warn` fill (take-over banner) | `#A04807`/white 6.13:1; `#F5B041`/`#0D0D11` 10.32:1 |
| `--on-helper` | `#FFFFFF` | `#FFFFFF` | letter/glyph on helper colour avatars | 02 F2 says white text ≥ 4.96:1 but names no token |
| `--live` | = `--bad` | = `--bad` | the "● LIVE" dot and word | BP1 `.browser .live{color:var(--bad)}`; an alias keeps `--bad` meaning "failed" |
| `--scrim-media` | `rgba(0,0,0,.88)` | `rgba(0,0,0,.88)` | attachment viewer background | photos need a near-black surround in both themes (WhatsApp/Signal media viewer, MSG) |
| `--qr-bg` / `--qr-fg` | `#FFFFFF` / `#0B0B10` | `#FFFFFF` / `#0B0B10` | WhatsApp link QR code | phones cannot scan a light-on-dark QR reliably |

**New icons requested** (add to 02 F6; all exist in Fluent UI System Icons Regular): PaintBrush, ShieldCheckmark, PlugConnected, Keyboard, Info (Settings nav); History (Activity empty state); ArrowMaximize (right-shell Doing now window button "Open the window"); ArrowDownload (Save as); ZoomIn, ZoomOut, ChevronLeft (viewer, Spend month switcher); Edit, Delete (memory rows, routines); ArrowLeft (shared with 03).

### 0.11b Settings names other chapters use

03 (and J21) link to Settings pages by older names. They resolve to these §6 pages; code MUST use the §6 ids. [settled: X-07: 03, 05, 09 and 10 now use the §6 names directly]

| Name used elsewhere | §6 page (id) |
|---|---|
| "Settings → Your AI" | Account & your AI (`account`) |
| "Settings → Apps" | Connections (`connections`) |
| "Settings → AI spend", "Change caps" | Money (`money`), AI spend section |
| "Settings → Money and payments" | Money (`money`) |
| "Settings → Notifications and quiet hours" | Notifications (`notifications`) |
| "Settings → What foo can do on its own", "Folders" | Permissions (`permissions`) |
| "Settings → Your data", "Privacy" | Privacy (`privacy`) |
| "Settings → Files" (J1) | Permissions (`permissions`), "Where I save files" row |
| "Settings → General" (09 §9.8.2, §9.21) | Account & your AI (`account`), rows `close-choice` and `graphics` |

### 0.12 Conflicts found and how this chapter resolves them

| # | Conflict | Resolution here |
|---|---|---|
| 1 | J15/J16 make "New helper" and "New group" a card inside the foo chat; the brief asks for dialogs. | Dialogs (§3, §5). foo's chat still gets the handoff marker "You made a new helper: {name}". |
| 2 | J21 defines a four-level dial (Do it / Do it when I say / Ask me / I'll do it); the brief asks for Always / Ask / Never per app. | [settled: X-54, 08-0 §G.3] One three-level control everywhere: **Always** (no card), **Ask** (card every time), **Never** (foo won't; it tells you to do it yourself). "Do it when I say" is dropped: every write already needs the user's own words or a tap (Article 3). Locked rows from J21 keep their locks (§6.4). |
| 3 | J5 closing copy "Tomorrow 8:00 AM I'll send your first morning brief." uses a relative day alone (breaks Article 21). | "I'll send your first morning brief tomorrow, {Sat 17 Oct}, at 8:00 AM." (§2.7) |
| 4 | Memory label: BP1 memory card says "I concluded"; BP1 side panel and J17 say "I guessed". | "I guessed" everywhere (§7). One word for one idea; it is the plainer one. [settled: X-05] |
| 5 | WIN §16.4 says Windows Hello fallback is "Type APPROVE"; Article 7 says "typing the amount". | Typing the amount, exactly as 09 §9.19.4 (§15 references it). [settled: X-08] |
| 6 | WIN §16.4 says never name "Credential Manager" in the UI; J23 copy names it. | 06 screens never name it. The uninstaller copy is 09 §9.23's; flagged there. |
| 7 | WIN §1.2 recommends a 48px title bar; 02 F5 fixes `--titlebar-h` 32px. | 32px (Foundations win). Windows in §11 use 32px. |
| 11 | An early draft of this chapter had Settings → Appearance own a 4-step "Text size" and Windows Hello for raising caps. | Removed: text size is Windows' own setting plus 09 §9.14.3 app zoom (80–200 %); Hello is for payments only (09 §9.19.1). Raising the purchase cap uses a plain confirm (§14 C-20). [settled: X-15] |
| 12 | J20/WIN first-close dialog. | Owned by 09 §9.8.2; 06 §14 C-18 points there. |
| 8 | J14 detail view lists "Last 20 runs" inline; J21 has no Routines page in Settings; the brief asks for Settings → Routines. | Settings → Routines holds the global routine rules (active hours, pause while away, pause all); the list itself lives on the Routines page (§8) and Settings links to it. |
| 9 | J21 Privacy has "Learn about me from chats"; the brief asks for "memory on/off". | One master toggle "Remember things about me" (§6.6) plus "Learn from my chats" under it. |
| 13 | 06-3 §11.2 drew a foo window containing a Chromium view of the site. | [settled: X-66, 08-0 §G.8] Edge is always external. Watch live is the foo window `live.html` (masked frames, not interactive); take over and sign-in bring the real Edge window to the front with the docked `signin-banner.html` (05 §5.10.3, 09 §9.27). |
| 14 | Settings "Writes" cells named keys that 08 did not have (`settings.ai.provider`, `settings.money.aiCap`, `systemAccent` …). | [settled: X-53] One schema, 08-0 §A; §0.13. |
| 15 | Outlook was hidden only on the Connections page. | [settled: X-41, UJ-06] Omitted everywhere in v1 (§0.4 "Outlook in v1"). |
| 10 | J20 tray says "Quiet until tomorrow 7:00 AM" (relative). | Tray copy belongs to 09; flagged there. Screens in 06 always add the absolute day. [settled: X-11: 09 §9.8.4 "Quiet until…" options show absolute times] |

### 0.13 Settings storage and ids (X-53, 08-0 §A)

- `settings.json` is exactly 08-0 §A (`schemaVersion: 2`); defaults live only in `src/shared/settingsDefaults.ts`. Every "Writes" cell in 06-1/06-2/06-3 names an 08-0 §A path (or a file, vault name or DB table where the value is not a setting). The 06 row id (`p-send`, `cap-ai`, `close-choice` …) stays the UI and deep-link id; the §A path is the storage key.
- Locks are enforced by `settings:set` (`SETTING_LOCKED`, 08-0 §A.2): `permissions.actions.{send, book, pay, delete, share}` only ask/never; `post` = never in v1; `money.bigPaymentPaise` 0–₹10,000; `money.aiCapPaise` ≥ ₹100; `notifications.unpromptedPerDay` 0–3. A locked segment shows its tooltip and never sends a write.
- Changing a setting by words in chat is allowed only for the 08-0 §A.3 list; foo answers with the mini line "Changed: {row label} → {value}. [ Undo ]" (`settings:undo`). Anything else gets "That's one for you to change. [ Open Settings ]", deep-linking to the row.
- Removed keys never appear in any 06 cell: `autonomy`, `spend`, `notifications.toastKinds`, `notifications.quietFrom/quietTo/quietDays`, `files.grants`, `connections.contacts`, `appearance.systemAccent`, `ai.provider`, `ai.fallback`, `routines.hours`, `setupComplete` (now `setup.complete`).
- Test ids: every settings row is `settings-row-{page}-{rowId}` (page = the 08-0 §B.2 `SettingsPage` value, row = the 06 row id; e.g. `settings-row-permissions-p-send`); the row's control carries the same id plus a suffix `-control` only when a test must reach it separately (`settings-row-money-cap-ai-control`). Settings nav items are `settings-nav-{page}`; the search field is `settings-search`.
