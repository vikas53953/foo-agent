# 02 · Foundations, part 2 (F11–F20: layout, layers, scrolling, icons, brand, faces, empty states, pictures, emoji, numbers and dates, loading)

**What this adds.** `02-foundations.md` (F0–F10) covers the tokens Vikas named (type, colour, spacing, shape, motion) plus icons, focus, accessibility and writing in short form. A production design system also has to decide how screens are laid out and stacked, how things scroll, which icon means what, how the brand mark and every face are drawn, what an empty screen looks like, how pictures load and break, how emoji, money, dates and charts are shown, how waiting looks, how foo tells you something worked, what it sounds like (and what it never plays), how it talks, how Hindi and Punjabi render, what every control looks like in every state, what the pointer, selection, tooltips and menus do, how dark mode and the Windows accent colour really work, and how the token file is written so the build agent and Paper/Figma read the same values. Parts 2 and 3 add all of that as F11–F31. They reuse F0–F10 tokens everywhere; every new shared value is a new token (listed in §F29.6). Where something here disagrees with an existing chapter, the existing chapter stays as written until the editor rules; the disagreement is listed in part 3, "Conflicts for the editor".

Authority: same level as `02-foundations.md` (00-README order 3). F0–F10 win over F11–F31 if they ever disagree.

Evidence keys as in F0, plus: **MSI** = Microsoft "App icon construction" (learn.microsoft.com/windows/apps/design/iconography/app-icon-construction), **FLU** = Fluent 2 design system (fluent2.microsoft.design), **M3** = Material 3, **HIG** = Apple Human Interface Guidelines, **WAD** = WhatsApp Desktop (Windows), **TGD** = Telegram Desktop. Ratios marked "computed" were calculated for this file with the WCAG 2.x relative-luminance formula.

## Coverage table

| Area | Was it in `02-foundations.md`? | Now covered in |
|---|---|---|
| Layout grid, breakpoints, density, alignment, pixel snapping | Partly (F3 spacing, F0 one density; breakpoints only in 03 §3.1.3) | §F11 |
| Elevation levels and z-index layers | Partly (F4 shadows only) | §F12 |
| Scrolling, scrollbars, scroll restoration | No (03 one line "native overlay scrollbars") | §F13.1–F13.4 |
| Dividers and separators | Partly (F2 `--line`) | §F13.5 |
| Iconography in depth (sizes, glyph rules, Regular vs Filled, action → icon map, custom glyphs) | Partly (F6 list) | §F14.1–F14.6 |
| App, tray, taskbar, toast and installer icon sizes (.ico) | No (09 §9.2/§9.8 only) | §F14.7 |
| Brand: mark, wordmark, lockup, clear space, misuse | Partly (F0 wordmark line) | §F15.1–F15.3 |
| Avatar and face system (letters, glyph faces, emoji faces, photos, groups, user, helper identity, living face) | Partly (F2 helper colours, F5 sizes) | §F15.4–F15.9 |
| Illustration policy and onboarding imagery | No | §F16.1 |
| Every empty state (catalogue) | No (scattered in 03, 06) | §F16.2–F16.3 |
| Imagery: ratios, thumbnails, loading, broken, logos, edges | No (04 §10.1 only) | §F17 |
| Emoji rendering, sizes, where allowed, reaction set | Partly (F1 font, F6 "content") | §F18 |
| Numbers, money (lakh/crore), dates, times, durations, units, phone numbers, plurals, truncation | Partly (F10 two lines) | §F19.1–F19.7 |
| Lists, tables, meters and bars (charts) | No | §F19.8–F19.9 |
| Loading: timing ladder, skeletons, spinners, progress bars, button busy, streaming, optimistic UI | Partly (F7 motion) | §F20 |
| Feedback: inline confirmation, undo bar, banners, validation, which surface for which news | No | part 3 §F21 |
| Sound (and haptics) | No | part 3 §F22 |
| Voice and tone in depth, with do/don't | Partly (F10) | part 3 §F23 |
| Localisation: Devanagari, Gurmukhi, Hinglish, digits, text expansion, RTL | Partly (F1 fallback, `--t-body-indic`) | part 3 §F24 |
| Accessibility depth: contrast tables, Narrator patterns, focus map, reduced motion, contrast themes, text scaling, colour-blind safety | Partly (F9) | part 3 §F25 |
| Component state matrix (every control × every state) | Partly (F8, 06 §0.4) | part 3 §F26 |
| Pointer, cursors, text selection, drag and drop, context menus, tooltips | Partly (F8 cursor line) | part 3 §F27 |
| Dark mode beyond swaps, Windows accent colour, no Mica, theme switching | Partly (F0 accent setting) | part 3 §F28 |
| Token file format, naming, JSON export for Paper/Figma, lint | No | part 3 §F29 |
| Typographic details, keyboard key caps, copy/paste formats, printing, window title | No | part 3 §F30 |
| Polish bar (Linear/Arc-level checks) | No | part 3 §F31 |
| Conflicts with existing chapters | — | part 3, end |

---

## F11. Layout grid, breakpoints and density

### F11.1 The grid

| Rule | Value | Evidence |
|---|---|---|
| Base unit | 4px. Every width, height, padding, margin and gap is a multiple of 4, **except** the X-146 list (card padding 14, composer pill 46, checklist step row 30, Thinking row 38: sizes made of a text line-height plus grid padding), 1px and 1.5px borders, 2px (`--s-1`) hairline gaps (grouped bubbles, image grids, chat-row line gap) and the 6px/10px glyph-internal values already written in 04 (e.g. tail corner 6px). | WIN §13 grid 4 `[exact]`; F3 |
| Layout model | No 12-column grid. foo is a **three-pane shell** (left, main, right; 03 §3.1.3) with **one centred content column** inside the main pane. | WAD, TGD, Signal all use panes, not grids `[reported: MSG §1]`; `[foo decision]` |
| Content column | `--column-max` 760px for messages and Pages; cards use `--card-w` 440 / `--card-w-wide` 600; dialogs `--dialog-sm/md/lg`. Nothing else sets a max width. | F5 |
| Side gutter | `--gutter` = 24px (`--s5`) when the pane is ≥ 900px wide, 16px (`--s3`) below. One token, switched by a container query on the pane (`@container pane (min-width: 900px)`), not by window width. | F3 rule "Conversation side padding"; 06 §0.1 `[foo decision: container query so the right shell opening does not change the gutter of a narrow pane incorrectly]` |
| Vertical rhythm | Block gaps inside a surface: 8px between related lines, 12px between a title and its body, 16px between groups, 24px between sections, 32px above an empty state. | WIN §13 "Title/Subtitle/Body block gap 12, surface edge↔text 16" `[exact]`; 06 §0.4 section label 24/8 |
| Icon → text gap | 8px for 16–20px icons in buttons, rows and menus; 4px inside chips and pills; 12px between a 48px avatar and text (03). | WIN button↔button 8 `[exact]`; 03 §3.4.5 |
| Nested radius | Inner radius = outer radius − padding, never below `--r-xs` 4px. Example: an image with 4px padding inside an 18px bubble uses 14px → rounded to `--r-md` 12px (04 §10.1 already does this). | FLU, HIG "concentric corners" `[reported]`; `[foo decision: round down to the nearest radius token]` |

### F11.2 Breakpoints (single source)

Breakpoints are owned by 03 §3.1.3; this table makes them tokens so CSS, TypeScript and the design file read one source. CSS custom properties cannot be used inside `@media`, so these are build-time constants generated into both `tokens.css` (as comments and in generated media queries) and `tokens.ts` (§F29).

| Token | Value | Meaning |
|---|---|---|
| `--bp-s` | 640px | below = XS (one pane at a time) |
| `--bp-m` | 1008px | S → M (right shell overlays below L) |
| `--bp-l` | 1280px | M → L (right shell pushes, open by default) |
| `--bp-gutter` | 900px | pane width at which `--gutter` becomes 24px (container query) |

Rules:
- F11.2.1 Only these four values may appear in media or container queries. A component that needs to reflow does so with flex/grid wrapping, never with its own breakpoint. `[foo decision]`
- F11.2.2 Breakpoints compare **CSS px of the window content**, so at 150% Windows scaling a 1920-pixel-wide screen is 1280 CSS px (L). `[WIN §1.1 exact S6]`
- F11.2.3 Windows text scaling (100–225%) changes `rem`, not the breakpoints. A layout that fits at 100% text must still fit at 225% text by growing rows and wrapping, never by switching breakpoint. `[WIN MUST]`

### F11.3 Density

- One density (F0). Row heights in F5 (`--row-chat` 72, settings rows 56, menu items 40) are **min-heights**: they grow with text scaling and wrapped text; they never clip. `[foo decision]`
- No "compact mode", no font-size picker inside foo: text size comes from Windows Settings → Accessibility → Text size, which Chromium applies through the default font size, so `1rem` follows it. `[WIN M15]`
- Minimum touch/click target 40×40px (F5) at every density and scale.

### F11.4 Alignment and pixel snapping

| Rule | Value |
|---|---|
| Header alignment | Left header and main header bottoms align (both `--header-h` 60px; 03). Page headers (06 §0.2) use the same 60px so the line under them is one continuous line across panes. |
| Left edges | In a pane, text starts at the gutter. Icons in rows sit in a box the same width as the avatar column above or below them (e.g. 48px), so text left edges line up. |
| Baselines | Times, ticks and counts sit on the text baseline of the line they belong to (`align-items: baseline`), not centred. |
| Optical centring | Play and Send glyphs shift 1px right in round buttons; the logo's eyes sit on the §F15.9.1 Resting geometry (§F15.1). Everything else is geometric. `[foo decision; HIG optical alignment reported]` |
| Pixel snapping | Never `transform: translate()` by fractional px at rest. Animations may use fractions; their end state is a whole px. Borders are 1 CSS px and are allowed to render as 1–2 device pixels at 125–175% scaling. No `scale()` at rest (only the 0.97 press, F7). `[foo decision: crisp text under ClearType]` |
| Layout shift | Zero layout shift after first paint: every image has width/height (or aspect-ratio) before it loads; skeletons match real row heights; hover never changes size or weight; a button's width is locked while it shows a busy state (§F20.5). |

---

## F12. Elevation and layers

### F12.1 Elevation levels

| Level | Surfaces | Light | Dark |
|---|---|---|---|
| 0 · Base | `--bg-app` (main shell, right shell), `--bg-sidebar` (left shell, title bar) | no shadow | no shadow |
| 1 · Resting content | bubbles; cards; row groups; composer field | bubbles `--shadow-1`; cards none (1px `--line`); composer `--shadow-4` | no shadow; cards and composer 1px `--line` on `--bg-raised` |
| 2 · Hover lift | cards on hover only when the whole card is clickable (job link card, option tiles) | `--shadow-4` | 1px `--line-strong` instead |
| 3 · Floating | menus, popovers, tooltips, reaction picker, undo bar, sticky date chip, scroll-to-bottom button, right shell in overlay mode | `--shadow-16` | `--shadow-16` dark values + 1px `--line` |
| 4 · Modal | dialogs, Search overlay, Shortcuts sheet, live window | `--shadow-28` over `--scrim` | `--shadow-28` dark + 1px `--line`, over dark `--scrim` |
| 5 · Media | attachment viewer | none; `--scrim-media` fills the window | same |

Rules:
- F12.1.1 Dark mode shows elevation by **surface lightness + a 1px border**, never by shadow alone: base `#0D0D11` → raised `#1B1B22` → hover `#22222A`. `[F4 dark rule; M3 tonal elevation reported]`
- F12.1.2 A surface never carries both a 1px border and a shadow in light mode, except menus and dialogs in dark mode (above). `[foo decision: one edge signal]`
- F12.1.3 No blur, acrylic, Mica or translucency anywhere (§F28.4).

### F12.2 Z-index tokens

Every `z-index` in the app is one of these tokens. Components never write a number. `[foo decision; FLU and M3 both define fixed layer orders reported]`

| Token | Value | Layer |
|---|---|---|
| `--z-base` | 0 | panes, lists, bubbles |
| `--z-raised` | 2 | things that sit on a neighbour inside a list: status badge and reaction chips over the bubble edge (04 §4.3 already uses 2) |
| `--z-sticky` | 10 | sticky date chip, sticky section labels, list headers, the pending-card strip, composer bar |
| `--z-pane-overlay` | 100 | right shell in overlay mode (M, S), XS slide-in pages, the resize handle while dragging |
| `--z-dropzone` | 200 | the drag-and-drop file overlay (04 §22.6) |
| `--z-undo` | 300 | undo bar (§F21.3) |
| `--z-menu` | 400 | menus, context menus, popovers, the reaction picker, the @ mention menu |
| `--z-scrim` | 500 | `--scrim` behind dialogs and overlays |
| `--z-dialog` | 510 | dialogs, Search overlay, Shortcuts sheet, attachment viewer |
| `--z-confirm` | 520 | a confirm dialog opened on top of a dialog (06 §0.1) |
| `--z-dialog-menu` | 530 | a menu opened from inside a dialog or confirm |
| `--z-tooltip` | 600 | tooltips (always on top) |

- F12.2.1 Menus and tooltips render into one portal at the end of `<body>`, so no parent's `overflow` or stacking context clips them.
- F12.2.2 The title bar has no z-index: it is its own grid row (03 §3.1.3.4) and nothing overlaps it except the Windows caption buttons.

---

## F13. Scrolling, scrollbars and dividers

### F13.1 What scrolls

Exactly these regions scroll; the window and `body` never do (03 §3.1.3.4): chat list, message list, right shell body, Page content, Dialog body, menus taller than the window, Search results, Settings navigation (at 225% text), code blocks and table cards (horizontal), composer text area (after 6 lines, 04).

### F13.2 Scrollbars

| Rule | Value | Evidence |
|---|---|---|
| Look | Native Chromium scrollbars, never restyled: no `::-webkit-scrollbar` rules, no custom width, no custom colour. `color-scheme` is set per theme by `theme-boot.js` (`light` or `dark`), never `light dark` (02-3 §F28.1, X-128); the always-dark viewer sets `color-scheme: dark`; so the native bar matches the theme. | WIN §4 "do not restyle" `[inferred]`, WIN anti-pattern "custom scrollbars"; 03 §3.4.1 |
| Overlay | Chromium on Windows 11 draws thin overlay bars that widen on hover; on Windows 10 classic 17px bars appear. Both are accepted; layout reserves `scrollbar-gutter: stable` on the message list and Page content so text never jumps when a bar appears. | `[foo decision]` |
| Forced colours | system scrollbar colours, untouched | WIN §12 |

### F13.3 Scroll behaviour

| Rule | Value |
|---|---|
| Wheel and touchpad | Native. Never hijacked, never smoothed by script, no momentum code. |
| Programmatic jumps | Jump to a message, card or search hit: `behavior: 'smooth'` when the target is within 3 screen-heights, else instant + the jump highlight (04 §26). Reduced motion: always instant. |
| Overscroll | `overscroll-behavior: contain` on every scroll region so the end of a menu or dialog never scrolls the chat behind it. |
| Scroll padding | `scroll-padding-top` = height of anything sticky above (e.g. 40px for the date chip area) and `scroll-padding-bottom` = composer height, so keyboard focus never lands under a sticky bar. |
| Edge signal | A sticky header that content scrolls under keeps its 1px `--line` bottom border at all times (no "appears on scroll" shadow). Dialog bodies that scroll show a 1px `--line` above the footer only while content remains below. `[foo decision: no moving shadows]` |
| Horizontal | Only code blocks and table cards scroll sideways (Shift+wheel and touchpad). No horizontal page scroll at any width ≥ 320px. |
| Restoration | Each chat keeps its scroll position for the app session (04 §1.6 sticks to bottom); Pages and Dialogs keep theirs (06 §0.1). Reopening the app opens chats at the bottom. |
| Virtual lists | Message list and chat list are virtualised (Article 28) with `@tanstack/react-virtual` (`useVirtualizer`, exact version pinned at M0, `overscan: 8`, `measureElement` on every row). Unmeasured rows use an estimated height and are corrected after measuring with the scroll anchored so nothing visible moves. Estimates: chat row 72px; bubble 56px; marker/system line 40px; date separator 56px; card by `card.type` from `CARD_ESTIMATE` in `src/renderer/cards/registry.ts` [FE-32]: brief 320, checklist 200, choice 240, tiles 360, approval 260, payment 300, bill 220, draft 300, secret 200, signin 180, connect 180, plan 240, routine 160, routine_offer 160, stuck 220, error 140, spend_cap 160, table 280, file 88, link_preview 120, job_link 64, place 200, face_explainer 200, catch_up 240, setup 320 (X-119); any type missing from the map: 160. `[foo decision: estimates only; measuring corrects them]` Stick-to-bottom is 03 §3.6.4 (no `overflow-anchor`: it does not work with absolutely positioned virtual rows). |

### F13.4 Load-more edges

- Top of a message list with more history: older messages load when the user scrolls within 600px of the top; a 20px spinner ring (§F20.3) shows in a 40px row while loading; nothing else. (03 §3.6.7 owns the copy if any.)
- Real start of a chat: the **start-of-chat line** (§F16.2 row E-1) as a 04 §19.5 system line.

### F13.5 Dividers and separators

| Kind | Spec | Used for |
|---|---|---|
| Full-bleed rule | 1px `--line`, edge to edge | header bottoms, footer tops, pane edges |
| Inset rule | 1px `--line`, inset 16px from the left (`--s3`) | between rows inside a Row group (06 §0.4) |
| Avatar-inset rule | 1px `--line`, inset to the text start (16 + avatar + 12) | member lists, file lists with icons (where rows are not inset cards) |
| Menu separator | 1px `--line`, 4px margin top and bottom, full menu width minus 4px padding | menus (03) |
| Table rule | 1px `--line`, horizontal only | table cards (05 §5.22) |
| Pane edge | 1px `--line` vertical between left/main and main/right | shell |
| Date separator / unread divider | owned by 04 §19.1–19.2 | chat |

Rules:
- F13.5.1 Never two lines in a row (a divider directly under a header border, or a divider plus a card border). Use space instead. `[FLU, M3 "use space before lines" reported]`
- F13.5.2 Chat rows have no dividers (03 §3.4.5). Settings rows inside a Row group do.
- F13.5.3 Dividers are decorative: `role="separator"` only inside menus; elsewhere `aria-hidden`.
- F13.5.4 Forced colours: dividers become 1px `CanvasText` only where they separate interactive regions (pane edges, menu separators); elsewhere they may disappear.

---

## F14. Iconography in depth

### F14.1 Library and delivery

| Rule | Value | Evidence |
|---|---|---|
| Set | Fluent UI System Icons (MIT), package `@fluentui/react-icons`, version pinned exactly in `package.json` (no `^`). Import per icon (`Send20Regular`) so unused icons are not bundled. | F6; `[foo decision: per-icon import keeps the bundle small (Article 28)]` |
| Window caption buttons | Not drawn by foo: Windows draws them (`titleBarOverlay`, 03 §3.2). | 03 |
| Size-matched glyphs | Always import the glyph drawn for the size you show (`…16Regular` at 16px, `…20Regular` at 20px, `…24Regular` at 24px, `…32Regular` at 32px). Never scale a glyph to another size. When Fluent has no glyph at a size, use the next larger drawn size and log it in `GAPS.md`. | Fluent draws each size separately for pixel fit `[reported]` |
| Format | Inline SVG, `fill="currentColor"`, `aria-hidden="true"` (the button or text carries the name). | `[foo decision]` |
| Banned | Emoji as UI icons (except §F18.3), icon fonts, "sparkle"/magic-wand icons for AI, robot faces, brand logos as icons (logos are pictures, §F17.6). | `[foo decision: plain, non-technical, no AI clichés]` |

### F14.2 Sizes

| Token | Px | Used for |
|---|---|---|
| `--icon-sm` | 16 | inside chips, pills, menus, captions, field adornments, row indicators (pin, mute), toolbar buttons on bubbles |
| `--icon-md` | 20 | default: headers, composer, icon buttons, banners, navigation, list rows |
| `--icon-lg` | 24 | empty states, attachment viewer controls on media, loading/broken picture tiles |
| `--icon-xl` | 32 | file-type icons in file rows (06-1 §4.1) and the file card |

No other icon sizes. `[F6 sizes + 06 file rows; WIN §14 16 in-app / 20 navigation]`

### F14.3 Regular vs Filled

| Situation | Variant |
|---|---|
| Default, everywhere | **Regular** |
| An icon toggle that is **on**: right shell open (`PanelRight`), Pin when the chat is pinned (in the menu/toolbar, not the row indicator), 👍/👎 feedback given (`ThumbLike`/`ThumbDislike`), voice reply playing (`Pause`) | **Filled**, colour `--accent` |
| The selected item of a navigation list (Settings nav) | **Filled**, colour `--accent`; label `--t-body-strong` |
| Status icons that carry meaning in a pill or banner (`CheckmarkCircle`, `Warning`, `ErrorCircle`, `Info`) | **Filled** at 16px inside pills (Regular strokes are too thin at 16px on tinted fills); Regular at 20px in banners |
| Everything else, including hover and pressed | Regular (state is shown by fill behind the icon, never by swapping glyphs) |

`[F6 "Filled only for selected state of a toggle", extended; FLU "filled = selected/active" reported]`

### F14.4 Colour

| State | Colour |
|---|---|
| Rest | `--fg-2` |
| Hover / pressed | `--fg-1` (fill behind: `--bg-hover` / `--bg-pressed`) |
| On (toggle), selected nav | `--accent` |
| On an accent fill | `--on-accent` |
| Disabled | `--fg-disabled` |
| Status | `--ok`, `--warn`, `--bad`, `--accent` (info) — only when the icon means that status |
| Destructive menu item | `--bad` |
| Over photos | `--on-media` on `--media-scrim` |
| Forced colours | `ButtonText`; selected/on `Highlight`; disabled `GrayText` |

### F14.5 Action → icon map (complete)

One meaning, one icon, everywhere. New names (not yet in F6) are marked **new**; all exist in Fluent UI System Icons Regular and Filled.

| Meaning | Fluent name | Notes |
|---|---|---|
| Send | `Send` | composer round button |
| Stop a running reply / job | `Stop` | |
| Record voice | `Mic` | |
| Voice off / microphone blocked | `MicOff` **new** | permission line, 04 |
| Add / attach menu / new | `Add` | "+" |
| Attach a file | `Attach` | |
| Picture | `Image` | |
| Document / file | `Document` | `--icon-xl` in file rows |
| Search | `Search` | |
| Filter | `Filter` | |
| More options | `MoreHorizontal` | always horizontal (WIN), never vertical |
| Close / remove / clear | `Dismiss` | |
| Back | `ArrowLeft` | |
| Expand / collapse | `ChevronDown` / `ChevronUp` | |
| Go into / submenu | `ChevronRight` | |
| Previous (viewer, month) | `ChevronLeft` | |
| Done / selected | `Checkmark` (inline), `CheckmarkCircle` (status) | |
| Waiting / time / routine time | `Clock` | |
| Needs you / warning | `Warning` | |
| Failed / error | `ErrorCircle` | |
| Information | `Info` | |
| Secret, private, payment safety | `LockClosed` | |
| Key | `Key` | |
| Show / hide secret | `Eye` / `EyeOff` | |
| Copy | `Copy` | |
| Retry / try again | `ArrowClockwise` | |
| Undo | `ArrowUndo` **new** | undo bar is text-only; icon used only in menus |
| Sync / checking connection | `ArrowSync` | |
| Reply | `ArrowReply` | |
| Edit | `Edit` | |
| Delete / forget | `Delete` | always `--bad` in menus |
| React | `Emoji` | |
| Good / bad answer | `ThumbLike` / `ThumbDislike` | |
| Play / pause | `Play` / `Pause` | |
| Screenshot / proof picture | `Screenshot` | |
| Receipt / proof of payment | `Receipt` **new** | proof chip of a payment |
| Calendar | `Calendar` | |
| Email | `Mail` | |
| Website / browser | `Globe` | |
| Open in browser / external app | `Open` **new** | auto-link menu |
| Link / copy link | `Link` **new** | |
| Call from your phone | `Call` **new** | auto-link menu |
| Map / place | `Location` (pin), `Map` **new** (open in maps) | |
| Save as | `Save` **new** | viewer |
| Download | `ArrowDownload` | |
| Show in folder | `FolderOpen` **new** | files |
| Watch live | `Window` | |
| Take over | `HandRight` | |
| Open bigger window | `ArrowMaximize` | |
| Zoom | `ZoomIn` / `ZoomOut` | |
| Settings | `Settings` | |
| You / profile | `PersonCircle` | |
| Helpers / group | `People` | |
| New helper | `PersonAdd` **new** | |
| New group | `PeopleAdd` **new** | |
| foo / a helper (generic, when no face) | `Bot` | only in Settings lists; chats always show faces |
| Memory | `Brain` | |
| Money / spend | `Money` | |
| Payment method | `Wallet` | |
| Routine (repeats) | `ArrowRepeatAll` **new** | |
| Morning brief | `WeatherSunny` **new** | |
| Quiet hours | `WeatherMoon` **new** | |
| Notifications on / off (mute) | `Alert` / `AlertOff` | |
| Pin | `Pin` | |
| Archive | `Archive` | |
| Details panel | `PanelRight` | |
| Offline | `CloudOff` | |
| Connection / connected app | `PlugConnected` | |
| Permissions / safety | `ShieldCheckmark` | |
| Appearance | `PaintBrush` | |
| Keyboard shortcuts | `Keyboard` | |
| Activity log | `History` | |
| Job checklist | `TaskListLtr` | |
| Speaker / voice replies | `Speaker2` **new** | Settings → Chat and voice |
| Language | `LocalLanguage` **new** | Settings → Chat and voice |

Rules: F14.5.1 an icon not in this table (or F6) needs a row here first. F14.5.2 two different meanings never share an icon (e.g. `Clock` is never "history"; history is `History`).

### F14.6 Custom glyphs (not Fluent)

| Glyph | Spec |
|---|---|
| `TickSingle`, `TicksDouble` | 16×11px, 1.5px stroke, round caps and joins, double offset 4px (F6, 04 §26) |
| Spinner ring | §F20.3 |
| foo mark | §F15.1 |

There are no typing dots: X-36 replaced them with the 26px Thinking face (§F15.9.3 #5, 04 §14.3) [FE-27]. Custom SVGs live in `src/renderer/icons/custom/` (`TickSingle.tsx`, `TicksDouble.tsx`, `FooMark.tsx`); the spinner ring is drawn by the `Spinner` primitive (`src/renderer/ui/Spinner.tsx`, 08-0 §E.3).

Custom glyph drawing rules: 20×20 canvas with 2px padding (16px live area) for 20px glyphs; 16×16 with 1px padding for 16px; strokes 1.5px at 16–20px, 2px at 24px; round caps and joins; stroke centred on the pixel grid (coordinates at .5 for odd widths) so lines are crisp at 100%. `[FLU icon grid reported; foo decision]`

### F14.7 App, tray, taskbar, toast and installer icons

| Asset | Sizes | Spec | Evidence |
|---|---|---|---|
| App icon `foo.ico` (exe, Start, Alt+Tab, taskbar button, Settings → Apps, installer, uninstaller) | **16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72, 80, 96, 256** px in one .ico (PNG-compressed 256 entry) | the foo mark (two-eyes face, Resting, §F15.1, X-143) on its disc; 16, 20 and 24 hand-tuned (see §F15.1 small sizes) | MSI lists exactly these 14 target sizes and a minimum of 16/24/32/48/256 `[reported: MSI]`; 09 §9.2 lists all 14 [X-27] |
| Tray icon | 16, 20, 24, 32 px, light-taskbar and dark-taskbar variants | foo's living face in 8 tray states (6 drawn in §F15.9.6 + 09 §9.8.1 Paused `--fg-3` dot and Setting up at 50% opacity; X-128); owned by 09 §9.8.1 [X-37] | 09 |
| Taskbar overlay badge | 16, 20, 24, 32 px PNGs | owned by 09 §9.10.1 (amber disc with "1"…"9"/"9+", green disc with a checkmark). The F1 "nothing below 12px" rule covers foo's own UI text, not this Windows bitmap; its digits are hand-drawn pixel glyphs, bold, 10px tall in the 16px disc. | WIN §14 16×16 `[exact: E3]`; 09 |
| Toast app-logo override | 48×48 PNG, circle crop | owned by 09 §9.9.2 (the chat's face rendered by §F15.4 at 48px, in the mood that caused the toast, §F15.9.6) [X-37] | 09 |
| Jump list / tray menu items | no icons | `[foo decision: fewer things to read]` | |

---

## F15. Brand, mark, faces and avatars

### F15.1 The foo mark

| Item | Value | Evidence |
|---|---|---|
| Form | **The two-eyes face in its static Resting pose** [X-143]: a filled circle (disc) with two tall rounded eyes. Master: `foo/look-book/assets/logo-face.svg` (viewBox 100 × 100: disc r 50; eyes 12 × 24, rx 6, at x 30 and 58, y 36). Same face as §F15.9, frozen. `FooMark.tsx` draws it. No letter "f" appears anywhere (the old "f" path is retired). | X-143; Look Book Q1; 09 §9.2 |
| Colours | Light: disc `#0B0B10` (`--fg-1` light), eyes `#FFFFFF`. Dark (in-app dark theme and dark taskbar tray): disc `#F1F1F5`, eyes `#0D0D11`. The .ico app icon uses the light pair only (Windows draws it on both taskbars) plus a 1px rim at 32px (scaled: 0.5px at 16, 2px at 64+) of `#3A3A44` so the dark disc is visible on a dark taskbar. | 02 F2; `[foo decision: rim, because MSI says plated icons must handle both themes themselves]` |
| The eyes | Vector rectangles with fully rounded ends (not live text), exactly the §F15.9.1 Resting geometry; never a mood, lid, ring or pupil in the logo. | X-143; §F15.9.1 |
| Small sizes | 16 and 20px: eyes redrawn on whole pixels (at 16: eyes 2 × 5px at x 5 and 9, y 4, as the tray, 09 §9.8.1), no rim at 16/20. | MSI "exact size match first" `[reported]` |
| Minimum size | 16px. | |
| Clear space | 25% of the disc diameter on every side, free of text and other marks. | `[foo decision; FLU/HIG logo clear space reported]` |
| Never | recolour to accent or helper colours, add gradients, shadows, outlines, 3D, rotate, stretch, draw the eyes without their disc, show a mood or ring in it, or animate it. Only in-app faces (§F15.9) move; the logo is always the still Resting face. | `[foo decision]`; X-35; X-143 |

### F15.2 The wordmark

| Item | Value |
|---|---|
| Text | "foo", always lowercase, never followed by "AI", "app" or a ™ in UI. |
| Type | `--t-wordmark` (24/32, 800, −0.05em) in the left-shell header; `--t-display` (40/48, 800, −0.04em) on splash and first run. No other sizes. |
| Colour | `--fg-1` only. |
| Note | The wordmark is the app name and never shows `{agentName}` (03 §3.4.2). When the user renames their agent ("Sunny"), the wordmark still says "foo". |

### F15.3 Lockup (mark + wordmark)

Used only on the splash, the installer welcome page and the About page: mark (the still two-eyes face, §F15.1, X-143) at 40px, 12px gap, wordmark `--t-display`, vertically centred on the x-height. Never anywhere else. `[foo decision]`

### F15.4 Avatar sizes (one ladder)

| Token | Px | Where | Letter size (weight 600) | Glyph-face size |
|---|---|---|---|---|
| `--avatar-inline` | 26 | footer, group sender labels, members, viewer | 12px (`--t-caption-strong` size) | 14px |
| `--avatar-header` | 40 | chat header, group hero stacks | 16px | 20px |
| `--avatar-list` | 48 | chat rows, toast PNG (48) | 20px (`--t-title` size) | 24px |
| `--avatar-pick` | 72 | face picker tiles | 28px (`--t-title-large` size) | 32px (06-1 §2.3) |
| `--avatar-hero` | 96 | profiles, welcome | 40px (`--t-display` size) | 48px |

The 48px New-helper face buttons (06-1 §3) use the `--avatar-list` row. Avatars are always circles (`--r-full`). `[F5; 03 §3.4.5; 06-1]`

### F15.5 Face types (what can be inside an avatar)

Checked in this order; the first that exists is shown. For foo and helpers, a face the user picked (type 1, 2, 3 or 5) is shown; otherwise the living face (type 4) [X-38].

| # | Type | Render |
|---|---|---|
| 1 | **Picture** (user's own or one your AI made) | Square-cropped, `object-fit: cover`, centred (the crop is chosen at pick time; 06-1 §2.3). Stored 512×512 PNG; a 48px and 96px copy are pre-rendered. A 1px inner edge `--img-edge` (§F17.5) separates it from the background. |
| 2 | **Glyph face** (a symbol: ✿ ◐ ★ ✈) | Helper colour fill, symbol in `--on-helper`, `--font-display`, glyph size from §F15.4. Stored with U+FE0E (text presentation) so Windows draws it monochrome. |
| 3 | **Emoji face** (🧳 🌴 and any emoji the user picks) | Helper colour fill, the emoji in full colour with `--font-emoji` at the glyph size, stored with U+FE0F. |
| 4 | **Living face** (default for foo and every helper; §F15.9) [X-35, X-38] | The two-eyes face of §F15.9 on foo's `--fg-1` disc or the helper's `--h-*` disc. Used whenever the user has not picked a picture, glyph, emoji or letter face. |
| 5 | **Letter** (the user; foo or a helper only if the user picks a letter face) | Fill: foo `--fg-1` (letter `--bg-app`); helpers their `--h-*` colour (letter `--on-helper`); the user `--h-slate` (03 §3.4.11). Letter = the **first grapheme** of the name (`Intl.Segmenter`, so "विक्रम" shows "वि", "ਸੁਖ" shows "ਸੁ"), uppercased for Latin. The "f" mark of §F15.1 is never used as a face; a renamed foo ("Sunny") with a letter face gets "S". |
| 6 | **Fallback** (picture file missing or unreadable) | foo and helpers: type 4 (living face); the user: type 5 for that name. The missing file is logged, nothing is shown to the user. |

Rules:
- F15.5.1 Face changes apply everywhere within 1s (06-1 §2.3): rows, headers, toasts (re-render the 48px PNG), tray (foo only).
- F15.5.2 Faces carry no online/offline presence dots. A mood ring (§F15.9.1) is allowed, only for real job, card and connection state. `[foo decision: helpers are never "offline"; X-35]`
- F15.5.3 Narrator: the avatar is decorative (`aria-hidden`) wherever the name is next to it; where it stands alone (group hero stack) it is named "{name}".
- F15.5.4 Forced colours: picture faces keep their image (`forced-color-adjust: none`) with a 1px `CanvasText` ring; letter and glyph faces become `Canvas` fill, `CanvasText` letter, 1px `CanvasText` ring. `[WIN §12]`

### F15.6 Group avatar composition

| Box | Composition |
|---|---|
| 48 (row) | 03 §3.4.5: up to 3 member faces of 26px: top-left (0,0), top-right (22,0), bottom-centre (11,22); each with a 2px ring in the surface colour behind it (`--bg-sidebar` in the list, `--bg-selected` on the selected row, `--bg-hover` on hover). 2 members: top-left (0,0) and bottom-right (22,22). |
| 40 (header) | Same layout scaled: members 22px at (0,0), (18,0), (9,18); 2px rings in `--bg-app`. |
| 96 (hero) | 06-1 §4.3: up to 3 faces of 40px in a row overlapping 12px. |
| 26 (inline) | Too small to cluster: a `People` 16px icon in `--fg-2` on a `--bg-sunken` disc. |
| Order | Owner first, then by join order. foo, when a member, is always first. |

Member diameter for any other box = round(box × 0.54). `[AGT §A1 cluster reported; foo decision on geometry]`

### F15.7 Helper identity

A helper is recognised by three things that always travel together: **face**, **colour** (`--h-*`, F2), **name**. Rules:
- F15.7.1 Colour appears only as: the avatar fill, the helper's name text in light mode (X-19), the 3px sender bar in group chats if 04 draws one. Never as a bubble fill, button fill, link colour or chart colour. `[foo decision: colour keeps meaning "who"; status keeps meaning "what"]`
- F15.7.2 New helpers take the next unused colour in F2 order; after 10 helpers the order repeats. Two helpers may share a colour only when there are more than 10; their faces must differ (the New helper dialog blocks the same face + colour pair with "Another helper already looks like this. Pick a different face or colour.").
- F15.7.3 Name length: 1–20 characters (06), shown in full in headers; ellipsis only in rows.
- F15.7.4 foo itself has no helper colour: neutral `--fg-1` disc. This is what makes foo read as "the main one".

### F15.8 The user's own identity

The user's avatar (`--h-slate`, first letter of their first name, or their picture) appears only in the sidebar footer, the group member list and the Search "You" results; never next to the user's bubbles (WhatsApp shows no avatar on your own messages). `[WAD reported; 03 §3.4.11]`

### F15.9 Living face

Owner's choice (2026-10-16): **Direction A · Two eyes** [X-35]. Two tall, soft eyes on foo's existing disc. Source: `research/living-face.md` (the other directions there are history, not spec). This is foo's and every helper's default face (§F15.5 type 4) [X-38] in chats, chat rows, headers, toasts and the tray. The logo (§F15.1, X-143) is this same face held still in its Resting pose; it is the app icon and never animates.

#### F15.9.1 What it is

| Item | Value |
|---|---|
| Who has it | foo (default face) and every helper (default face). Not the user (§F15.8). |
| Form | The §F15.4 avatar disc with two vertical rounded-rectangle eyes. No mouth, no brows, no outline, no gradient, no shadow. |
| Geometry (in % of the disc diameter, origin top-left) | Eye width **12%**, eye height **24%**, corner radius = half the eye width (fully round ends). Eye centres at **x 36% / 64%**, **y 48%**. |
| Colours | foo: disc `--fg-1`, eyes `--bg-app` (light `#0B0B10` / `#FFFFFF`; dark `#F1F1F5` / `#0D0D11`). Helper: disc its `--h-*`, eyes `--on-helper`. Lids (used to shape eyes) are drawn in the disc colour. |
| Mood ring | Outside the disc, never inside. Stroke `--face-ring`: **2px** for discs ≤ 48px, **3px** above; gap to the disc `--face-ring-gap`: **1.5px** at 26px, **2px** otherwise. The ring may overhang the avatar box; layouts keep that space clear (rows and headers already have it). |
| Ring colours and shapes | Working `--accent`, 28% arc, turning; Stuck `--warn`, 28% arc, still; Needs you `--warn`, full circle; Waiting on you `--warn`, dashed 5 / 3.3 on a 100-unit path, still; Happy and Celebrating `--ok`, full, fades out; Offline `--fg-3`, dashed (picture and emoji faces only, §F15.9.4). No other ring colours. |
| Sizes | The §F15.4 ladder only: 26, 40, 48, 72, 96. The tray uses the hand-tuned 16/20/24/32 assets of §F15.9.6. |
| 26px legibility | At 26px the eyes are 3.1 × 6.2px; both eyes, the ring and every pose in §F15.9.3 must stay distinguishable at 26px at 100% scale (acceptance C.7). No pose relies on a detail smaller than 1px at 26px except the Asleep "z", which is not drawn below 40px. |
| Brand mark | The logo (§F15.1, X-143) is this same face in its static Resting pose: app icon, taskbar button, installer, About and splash lockup (§F15.3). It never animates. The living face is how foo looks inside conversations, rows, toasts and the tray. Welcome card (06-1 §2.1): the still logo face comes alive once and plays *Waking up* (no cross-fade; it is already the same face). |
| Rename | Renaming foo ("Sunny") changes the name only. The face stays the eyes unless the user picks another face. |

#### F15.9.1a Pose geometry (binding) [UX-01; owner Q5 default (a)]

All values are % of the disc diameter; origin top-left of the disc; the right eye mirrors the left eye about x 50% unless a row says otherwise. Strokes use round caps and joins. Eye colour (foo `--bg-app`, helper `--on-helper`) is used for every eye shape, arc, bar and the "z". These paths, scaled, are the master for the tray and toast assets (§F15.9.6, X-37); hand tuning may change stroke widths at 16 and 20px only. `[foo decision; approved walkthrough drawings]`

| Pose | Left eye (right eye mirrors) | Used by moods (§F15.9.3) |
|---|---|---|
| Base eye | rounded rect 12 w × 24 h, corner radius 6, centre (36, 48) | 1 Resting; blink scales it on Y (`--m-face-blink`) |
| Noticed / Needs you | base eye resized to 13 × 27 (Noticed) or 13 × 26 (Needs you), radius 6.5, same centre | 3, 8 |
| Listening | base eye, centre y 55 (down 7) | 4 |
| Thinking | rounded rect 12 × 20, radius 6, centre y 40 (up 8); drift ±5 on x | 5 |
| Working | rounded rect 12 × 18, radius 6, centre (36, 48) | 6 |
| Happy / Done arc | an upward arc (a "^" per eye): chord 16 wide, rise 7, stroke 6; chord centre at x 36, y 47; the arc's two ends point down | 10, 11, 13 |
| Asleep arc | the Happy arc flipped vertically (ends point up), chord centre y 50 | 18 |
| "z" (Asleep, ≥ 40px discs only) | the letter "z" in `--font-ui`, weight 700, cap height 16, its top-right corner at (74, 26), eye colour at 55% opacity; one glyph only | 18 |
| Half-lidded | the bottom half of the base eye: 12 w × 12 h, straight top edge, bottom corners radius 6, centre y 54 | 9 Waiting on you |
| Sorry | base eye lowered to centre y 53 and shortened to 18 h; its **outer** top corner (left corner of the left eye, right corner of the right eye) cut by a 45° chamfer of 5 on each edge; inner corners unchanged | 15 |
| Wink | left eye = base eye; right eye = Happy arc at x 64 | 12 Thumbs up |
| Stopped | a horizontal bar 12 w × 3 h, radius 1.5, centre (36, 48); no ring | 16 |
| Speaking | base eye at centre y 43 (up 5); 3 level bars under the eyes, each 4 w, centres x 42 / 50 / 58, bottom edge y 78, height follows the audio level from 4 to 14 (`--m-face-level`) | 14 |
| Sparks (Celebrating) | three 4-point stars, each 10 wide and 10 tall, centres (20, 22), (82, 16) and (78, 80); fills `--accent`, `--ok`, `--accent` in that order; timing `--m-face-party` | 11 |
| Offline | base eyes drawn as 1.5px outlines in `--fg-3` (no fill) on a `--bg-sunken` disc with a dashed `--fg-3` edge (dash 5 / 3.3 on a 100-unit path) | 17 |

Note: the reviewer's text gave the sparks `--warn`; status colours are never decoration (F2), so the sparks keep the brand pair `--accent` / `--ok` that this token already used (X-92, 08-0 §H "sparks"). This is the only spark palette.

#### F15.9.2 Tokens

All are listed in §F29.6 and referenced from F7.

| Token | Value | Use |
|---|---|---|
| `--face-eye-w` | 12% of disc | eye width |
| `--face-eye-h` | 24% of disc | eye height (resting) |
| `--face-ring` | 2px (disc ≤ 48), 3px (disc > 48) | mood ring stroke |
| `--face-ring-gap` | 1.5px (26), 2px (others) | gap between disc and ring |
| `--m-face-blink` | random **4000–7000ms** per cycle; the close-open is the last 5% of the cycle (200–350ms, scaleY 1 → 0.08 → 1) | resting blink |
| `--m-face-blink-slow` | 8400ms cycle | listening, thinking, waiting on you |
| `--m-face-look` | 250ms `--ease-standard` | eyes moving to a new pose |
| `--m-face-drift` | 2400ms ease-in-out, alternate, ±5% | thinking |
| `--m-face-orbit` | 1600ms linear, infinite | working ring turn |
| `--m-face-scan` | 4000ms ease-in-out | stuck (eyes look left, right, back) |
| `--m-face-once` | 400ms `--ease-standard` | noticed pop (scale 1 → 1.1 → 1), needs-you nod (−5% then back) |
| `--m-face-wake` | 600ms `--ease-standard` | eyes open from scaleY 0.08 |
| `--m-face-happy` | 2000ms (ring in 150ms, hold, fade out 600ms) | happy |
| `--m-face-party` | 1600ms total; 3 sparks drawn per §F15.9.1a (fixed places, no travel); each spark scales 0 → 1 → 0 over 1360ms, started 0 / 120 / 240ms after the mood starts | celebrating |
| `--m-face-react` | 900ms (badge pops 0 → 1.15 → 1 in 430ms) | 👍 / ❤️ |
| `--m-face-sorry` | 3000ms | sorry |
| `--m-face-stopped` | 1500ms | stopped |
| `--m-face-level` | follows the real audio level, updated every 100ms (same as the live mic level, F7) | speaking (3 bars, each 4% of disc wide, under the eyes) |
| `--m-face-cross` | 167ms (= `--m-normal`); 83ms under reduced motion | every mood change is a cross-fade |

#### F15.9.3 Moods and what triggers them (Article 12: only real state)

Each chat's face (foo and each helper) shows that chat's own jobs and cards. Sources: job states from the job runner (07-2 §4: QUEUED, WORKING, NEEDS YOU, WAITING, DONE, FAILED, CANCELLED), card states from the card store (07-2 §5: PENDING, APPROVED, COMPLETED …), the connection monitor (Article 29 offline line, X-13), the composer and the clock. A card is **seen** once it has been inside the visible part of the focused main window for 1 s.

| # | Mood | Pose | Trigger (real state) | Duration | Where |
|---|---|---|---|---|---|
| 1 | Resting | default eyes, blink (`--m-face-blink`) | None of moods 4–9, 17, 18 is true (app open, nothing for this chat in flight) | default | everywhere |
| 2 | Waking up | eyes open from a line (`--m-face-wake`) | Shell first paint after app start; the offline line clears; quiet hours end | 600ms once | header, row, welcome |
| 3 | Noticed | eyes 13 × 27%, pop (`--m-face-once`) | The user's message is saved and handed to foo or the helper: the same moment the 👀 badge is set (Article 16) | 400ms once | header, row |
| 4 | Listening | eyes move down 7% (toward the composer), slow blink | This chat's composer has focus and a keystroke happened in the last 5 s | while typing + 5 s | header of the open chat only |
| 5 | Thinking | eyes up 8%, height 20%, drift (`--m-face-drift`), slow blink | A reply request for this chat is really in flight to the user's AI and no word has arrived yet. Shown as the 26px typing indicator where the next bubble will appear (04 §14.3) [X-36] | until the first word arrives or the request ends | beside the next bubble, header |
| 6 | Working | eyes height 18% + `--accent` ring turning (`--m-face-orbit`) | A job of this chat is WORKING (badge 🛠) | while WORKING | header, row, tray, beside the checklist |
| 7 | Stuck | eyes scan left / right / back (`--m-face-scan`) + still `--warn` 28% arc | A job of this chat is NEEDS YOU because of a stuck card (no step finished for 3 min, Article 12) and that card has been seen | until the stuck card is answered | header, row, tray |
| 8 | Needs you | eyes 13 × 26%, one nod (`--m-face-once`), full `--warn` ring | A job of this chat is NEEDS YOU and its card (Choice, Approval, Payment, Draft, Sign-in, code, stuck) is PENDING and not yet seen | nod 400ms, then still until seen | header, row, tray, toast |
| 9 | Waiting on you | eyes half-lidded, slow blink, dashed `--warn` ring | The PENDING card has been seen and is not answered (badge ⏳) | until answered | header, row |
| 10 | Happy | eyes become ^ ^ arcs, `--ok` ring fades (`--m-face-happy`) | A job turns DONE **with a proof object** (Proof chip, Article 11). DONE "⚠ Not checked live" (unverified) shows no Happy: the face returns to what is true | 2000ms once, then what is true | header, row, toast |
| 11 | Celebrating | ^ ^ + 3 sparks (§F15.9.1a, `--m-face-party`) | A job turns DONE with proof after the user approved a book, buy, pay, send or post card (card COMPLETED), or foo's first-ever DONE job. Plays only for the **first** such DONE of the local calendar day across all chats (owner Q7 default (a)); every later qualifying DONE that day plays Happy (#10). Never in groups; never in quiet hours (Happy plays instead). The day's use is stored in the renderer `live` slice as `live.celebratedOn: 'YYYY-MM-DD'` and survives chat switches, not restarts (a restart may celebrate once more that day) | 1600ms once | header, toast |
| 12 | Thumbs up | left eye winks + 👍 badge (bottom-right, 36% of disc) (`--m-face-react`) | foo or the helper puts 👍 on the user's bubble (F18.4) | 900ms, then the 👍 lands on the bubble | header |
| 13 | Heart | ^ ^ + ❤️ badge (`--m-face-react`) | foo or the helper puts ❤️ on the user's bubble | 900ms | header |
| 14 | Speaking | eyes up 5% + 3 level bars (`--m-face-level`) | foo's or the helper's voice note is being made or played; the bars follow the real audio level | while the audio plays | header, beside the voice note |
| 15 | Sorry | eyes lower 5%, height 18%, outer top corners cut (inner corners higher) (`--m-face-sorry`) | A job of this chat turns FAILED (badge ❌), or an error card (J19) is posted in this chat | 3000ms once, then what is true | header, row |
| 16 | Stopped | eyes become flat lines (`--m-face-stopped`) | A job of this chat turns CANCELLED by the user's Stop or "stop" (badge ⛔) | 1500ms once, then what is true | header, row |
| 17 | Offline | disc `--bg-sunken` with dashed `--fg-3` edge, eyes outlined `--fg-3`, no motion | The Article 29 offline line (banner strip, X-13) is showing: no internet or the AI unreachable | until it clears, then Waking up | everywhere, tray |
| 18 | Asleep | eyes closed (downward arcs) + small "z" (≥ 40px only, 4000ms fade loop) | Quiet hours are on and the time is inside them (Article 19; default 10:00 PM–7:00 AM, Settings → Notifications) and no job of this chat is QUEUED, WORKING, NEEDS YOU or WAITING | while true | header, row, tray |

**Priority** when several are true: **Offline → Needs you → Stuck → Working → Waiting on you → Thinking → Listening → Asleep → Resting.** One-time moods (2, 3, 10–13, 15, 16) and Speaking (14, for as long as its audio plays) play on top and then return to whatever is true. A job that is WAITING (AI limit, spend cap, PC asleep; row pill "Paused") has no mood of its own: the face shows what else is true (usually Resting) and the pill carries the news.

Rules:
- F15.9.3a The face reads only the job runner, card store, connection monitor, composer and clock. It never reads the AI's words. No *Thinking* without an in-flight request; no *Working* without a WORKING job; no *Happy* without a proof object (Article 12).
- F15.9.3b It never laughs, smirks, rolls its eyes, looks bored or sulks. No 😂 face. Reactions only 👍 ❤️ (F18.4).
- F15.9.3c No mood repeats its one-time animation within 10 s; Celebrating at most once per day (#11).
- F15.9.3d Groups (owner Q6 default (a): rings only): every face inside a group thread (sender labels 04 §12.4, the Thinking row 04 §14.3, the group header and row cluster) renders with `animate={false}` and `ring={true}`: the static Resting pose, no blink, no drift, no one-time moods, no sparks; only the Working ring (turning, `--m-face-orbit`; still quarter-arc under reduced motion) and the Needs you ring (full, still) are drawn, and they come from that speaker's real jobs in this group. The group's own avatar in the chat list and header is the §F15.6 cluster and shows no ring.
- F15.9.3e The chat row (48px) and the header (40px) show the same mood at the same moment. The tray (§F15.9.6) shows foo's face with the highest-priority state across all chats.

#### F15.9.4 Picture, emoji, glyph and letter faces

When the user picks a picture, glyph or emoji (§F15.5 types 1–3) for foo or a helper, the face is never altered. Mood shows only as: the ring (§F15.9.1), plus an `--accent` ring for Listening (55% opacity, still) and Thinking (dotted, 3200ms turn), a `--bad` ring flash for Sorry, a dashed `--fg-3` ring and 60% greyscale for Offline, 55% opacity + "z" for Asleep, and the 👍/❤️ badge. Stopped shows nothing. Letter faces (the user, fallback) never show moods.

#### F15.9.5 Reduced motion

Copied into §F25.4.

| Animation | Normal | Reduced |
|---|---|---|
| Blink, drift, scan, nod, pop, wake | as tokens | none: static pose |
| Working ring | turning | still quarter-arc |
| Happy / Celebrating | ring fade, sparks scale in and out | ring shown; sparks shown at full size (scale 1) for 1600ms, then removed with an 83ms fade |
| Mood change | cross-fade 167ms | cross-fade 83ms |
| Speaking level | follows audio | **still follows audio** (it is information, like the live mic level) |
| Asleep "z" | fades in and out | static |

#### F15.9.6 Windows assets

| Asset | Sizes | Content |
|---|---|---|
| Tray icon (09 §9.8.1) [X-37] | 16, 20, 24, 32 px × light-taskbar and dark-taskbar | 8 tray states (6 drawn here + 09 §9.8.1 Paused `--fg-3` dot and Setting up at 50% opacity; X-128): Resting (eyes), Working (+ `--accent` dot), Needs you (+ `--warn` dot), Done (+ `--ok` dot, 10 s), Offline (dashed outline, grey eyes), Quiet hours (closed eyes, flat 1px lines at 16). Dot: radius 2.6px at (13, 13) on the 16 grid, 0.8px knock-out ring in the taskbar colour. At 16: eyes 2 × 5px at x 5 and 9, y 4, whole pixels. Light taskbar: disc `#0B0B10`, eyes `#FFFFFF`; dark: disc `#F1F1F5`, eyes `#0D0D11`. Static PNG/ICO frames only; no tray animation. 09 §9.8.1 sets the order in which the 8 states win. Face-based frames come from the `face:raster` PNGs (§F15.9.9 Rasters). |
| App icon `.ico`, taskbar button | unchanged | the logo: two-eyes face, Resting, still (§F15.1, §F14.7, X-143). |
| Taskbar overlay (09 §9.10.1) | unchanged | amber count / green check. The face is not used on the taskbar. |
| Toast app logo (09 §9.9.2) [X-37] | 48 × 48 PNG, circle crop | the chat's face rendered at 48 in the mood that caused the toast (Happy for Done, Needs you for a card, Sorry for a failure), with its ring, read from the `face:raster` PNG for that mood (§F15.9.9 Rasters, X-124). |
| Welcome / first run (06-1 §2.1) | 96 | the still logo face comes alive and plays Waking up (X-143). |

#### F15.9.7 Accessibility and contrast themes

- Narrator: the face is `aria-hidden` wherever the name is beside it (§F15.5.3). Every mood already has a spoken counterpart (bubble badge, row pill, card, checklist, offline line), so the face adds nothing to hear. Where the face stands alone it is named "{name}" (no mood words).
- Colour is never alone: each ring also differs in shape (turning arc / still arc / full / dashed), and rows keep their word pills.
- Forced colours (§F25.5): disc `Canvas` with a `CanvasText` edge (4% of the disc, at least 1px), eyes `CanvasText`, all rings `Highlight`, emoji badge `Canvas` / `CanvasText`. `forced-color-adjust: none` on the face, colours set explicitly. Tray: 09 §9.8.1 high-contrast variant.

#### F15.9.8 Performance

- Pure inline SVG + CSS keyframes on `transform` / `opacity` only; no canvas, video, Lottie or images.
- Idle CPU < 1% with every visible face resting (only blinks run) (PERF-13).
- All face animations pause (`animation-play-state: paused`) when the window is minimised, hidden, occluded or the session is locked, and for faces scrolled out of view (IntersectionObserver). Rows in the virtualised list render the static pose until visible.
- Blink timing is randomised per face so a list of faces never blinks in sync.

#### F15.9.9 Component contract (binding) [FE-11]

| Item | Value |
|---|---|
| Component | `src/renderer/ui/Face.tsx` (the `Face` primitive of 08-0 §E.3); the only place a living face is drawn (rows, headers, sender labels, Thinking row, profiles, picker, welcome, the 48px toast PNG render). `Avatar` (`src/renderer/ui/Avatar.tsx`) picks the face type per §F15.5 and renders `Face` for type 4. |
| Props | `<Face faceRef={FaceRef} size={16 \| 26 \| 40 \| 48 \| 72 \| 96} mood={Mood} ring={boolean} animate={boolean} />`. `FaceRef` per 08-0 §E.7 (`living:{style}` \| `glyph:{emoji}` \| `letter:{A-Z}` \| `file:{chatId}`). `ring` default `true`; `animate` default `true`. Groups pass `animate={false}` (§F15.9.3d). Picker tiles and the welcome card pass `ring={false}`. |
| `Mood` | `type Mood = 'resting' \| 'waking' \| 'noticed' \| 'listening' \| 'thinking' \| 'working' \| 'stuck' \| 'needs_you' \| 'waiting' \| 'happy' \| 'celebrating' \| 'thumbs_up' \| 'heart' \| 'speaking' \| 'sorry' \| 'stopped' \| 'offline' \| 'asleep'` in `src/shared/face.ts` (the 18 rows of §F15.9.3 in order). |
| Where mood is computed | Once per chat, in the renderer, by the selector `selectChatMood(chatId): Mood` in `src/renderer/store/live.ts` (slice fields: 08-0 §G.10). Inputs only: that chat's `JobRow`s (state, `slow`), its `CardRow`s (state + the seen-time map `live.cardSeenAt`), `live.connection` (offline line shown), `live.typingChatId` + last keystroke time, `live.replyInFlight[chatId]`, `live.speaking[chatId]`, quiet-hours state from `settings.notifications.quiet`, and the clock. It applies the §F15.9.3 priority order. The tray state is computed in main from the same rules (09 §9.8.1). The mood never comes from AI text (§F15.9.3a). |
| One-time moods | `playOnce(chatId, mood)` in `live.ts` pushes `{ mood, until }` onto `live.faceQueue[chatId]` (max 3 entries; a 4th drops the oldest). `Face` shows the head of the queue for its §F15.9.3 duration, then pops it and returns to `selectChatMood`. Who calls it: the message store on 👀 (Noticed), the job store on DONE (Happy / Celebrating per #11), FAILED (Sorry), CANCELLED (Stopped), the reaction handler (Thumbs up / Heart), app start and offline-cleared (Waking up). The 10 s repeat guard (§F15.9.3c) is checked inside `playOnce`. |
| Same moment everywhere | Row (48) and header (40) read the same selector and queue, so they show the same mood (§F15.9.3e). |
| Reduced motion | `Face` reads `useReducedMotion()` (02 F7) and renders the §F15.9.5 reduced column; `animate={false}` renders the static pose regardless. |
| Test hook | `data-testid` per 02-3 §F32.2 where the face is a control (`chat-header-avatar`); the face root always carries `data-state="{Mood}"` so tests can read the mood. |
| Rasters (X-124) | Main never draws a face. The renderer owns one hidden `<FaceRaster>` that, on `identity`/helper changes and on every `Mood` change debounced 1 s, renders `<Face size={48} mood ring>` and `<Face size={16 | 20 | 24 | 32}>` (no ring) to PNG (`canvas.toBlob`) and sends `face:raster { faceRef, size, mood, png: ArrayBuffer }` through `window.foo.send` (08-1 §3.1, the one renderer → main event, X-135); main writes `{DATA}\avatars\raster\{safeName(faceRef)}-{size}-{mood}.png` and uses those files for toasts (09 §9.9, 48) and the tray (09 §9.8, the size for the taskbar's scale). Missing file → main uses the letter disc PNG shipped in `resources/`. Sizes 16–32 are used only by `<FaceRaster>`; the offscreen canvas is the one exception to §F15.9.8's "no canvas" (it never animates). |

---

## F16. Illustration and empty states

### F16.1 Illustration policy

| Rule | Value |
|---|---|
| Illustrations | **A few line drawings in v1** [settled: X-51, Vikas chose "A few line drawings"]. Exactly three, each replacing the 24px icon in one first-time Block empty state: **L-1** Memory first time (E-10), **L-2** Routines first time (E-13), **L-3** Activity log first time (E-14). Every other empty state, the chat, cards, the left shell and the right shell keep one 24px Fluent icon or no picture. No mascots, 3D blobs, stock photos, gradients or AI-made art anywhere. |
| Why | Windows-native apps (Settings, Outlook, WhatsApp Desktop) use icons, not art, for empty states; art goes stale and looks like "an AI startup". The only pictures with personality are the faces the user picks. `[foo decision; WAD and Windows Settings reported]` |
| Onboarding imagery | First run (06-1 §2) uses: the foo mark at `--avatar-hero` 96px on Welcome, the face tiles, app logos on Connect rows/cards (§F17.6) and the QR code. Nothing else. |
| Splash | the lockup (§F15.3) on `--bg-app`, nothing else (06-1 §1 owns timing). |
| Line-drawing tokens (X-51) | `--illo-w` 120px, `--illo-h` 96px, `--illo-stroke` 1.5px; strokes `--fg-3` with at most one detail in `--accent`; no fills except `--bg-sunken` for one shape; drawn as inline SVG with `currentColor`, `aria-hidden="true"` (decorative; the title and body carry the meaning). High contrast: all strokes `CanvasText`. Light and dark use the same tokens. Block layout: the drawing takes the icon slot, then 12px gap as §F16.2. |
| Drawings supplied (X-144) | Masters: `foo/look-book/assets/L-1-memory.svg`, `L-2-routines.svg`, `L-3-activity.svg`. Builders use these files as-is and never draw or generate their own. |
| Future | Any further art needs a DECISIONS row first. |

### F16.2 Empty-state anatomy (all empty states)

Two shapes only:

| Shape | Use | Spec |
|---|---|---|
| **Block** | a whole page, list or panel is empty | 06 §0.5: 48px above (32px in the left shell list, 03 §3.4.10), centred, max width 360px (260 in the left shell): icon 24px `--fg-3` → 12px → title `--t-subtitle` `--fg-1` (optional) → 4px → body `--t-small` `--fg-2` → 16px → one button (Secondary unless stated) or one Link button. `role="status"`. |
| **Line** | a section inside a page or the right shell is empty | one line `--t-small` `--fg-2` (or `--t-caption` `--fg-3` in the right shell), no icon, no button unless stated. |

Copy rules: say what will appear here and how to make it appear, in one or two short sentences; give an example in quotes when the action is "ask me"; never "No data", "Empty", "Nothing to show", "0 results". `[F10; FLU empty-state guidance reported]`

### F16.3 Empty-state catalogue (every empty state in foo)

Existing copy is quoted from its owning chapter and is not changed here. Rows marked **new** fill gaps; the owning chapter adopts them as written (editor to copy across).

| # | Where | Shape | Icon | Copy (final) | Action | Owner |
|---|---|---|---|---|---|---|
| E-1 | Start of any chat (top of history) **new** | system line (04 §19.5) | — | "Start of your chat with {name} · made {Fri 16 Oct 2026}" (foo's chat: "Start of your chat with {agentName}") | — | 04 |
| E-2 | Chat after "Clear messages" **new** | system line | — | "Messages cleared on {Fri 16 Oct}. Running jobs kept going." | — | 04 / 03 §3.4.9 |
| E-3 | Left shell, "Needs you" filter | Block | `CheckmarkCircle` | "Nothing needs you right now." | — | 03 §3.4.10 |
| E-4 | Left shell, "Working" filter | Block | `Clock` | "Nothing is running right now." | — | 03 |
| E-5 | Left shell, "Done" filter | Block | `CheckmarkCircle` | "Jobs finished in the last 7 days show here." | — | 03 |
| E-6 | Left shell search, no match | Block | `Search` | "No chats match "{query}"." | "Search all messages" | 03 |
| E-7 | Right shell, Doing now | Line | — | "Nothing running. Ask me to do something and you'll see it here." | — | 03 §3.7.3 |
| E-8 | Right shell, Using | Line | — | "No apps used here yet." | — | 03 |
| E-9 | Right shell, What I know | Line | — | "Nothing yet. Tell me things like "I'm vegetarian" and I'll remember." | — | 03 |
| E-10 | Memory page, first time | Block | `Brain` | title "Nothing yet", body "Tell me things like "I'm vegetarian on Tuesdays" and I'll remember them here." | "+ Add something" | 06-2 §7 |
| E-11 | Memory, after Forget everything | Block | `Brain` | title "I've forgotten everything", body "Anything you tell me from now on shows up here." | — | 06-2 |
| E-12 | Memory, filter/search empty | Block (no title) | `Search` | "Nothing matches "{query}"." | Link "Clear filters" | 06-2 |
| E-13 | Routines, first time | Block | `ArrowRepeatAll` [X-29] | title "No routines yet", body "Ask me in plain words, like "tell me when BTC drops below ₹55 lakh" or "every Friday list bills due next week"." | Primary "Make a routine" | 06-2 §8 |
| E-14 | Activity log, first time | Block | `History` | title "Nothing yet", body "When I send, pay, book or delete something for you, it's listed here with its proof." | — | 06-3 §9 |
| E-15 | Activity, filter empty | Block (no title) | `Filter` | "Nothing here for these filters." | Link "Clear filters" | 06-3 |
| E-16 | Spend, nothing spent | tiles show "₹0"; lists Line | — | "Nothing spent in {October}." | — | 06-3 §10 |
| E-17 | Search overlay, opened with no history | Line | — | "Search everything on this PC. Nothing is sent anywhere." | — | 06-3 §12 |
| E-18 | Search overlay, no results | Block (no title) | `Search` | "Nothing found for "{query}"." | Primary 32 "Ask foo instead" | 06-3 |
| E-19 | Helper profile, knows / routines / files | Line | — | as 06-1 §4.1 ("{Trips} hasn't lea…", "No routines yet. Ask {Trips} in its chat…", "Files {Trips} makes will sho…") | — | 06-1 |
| E-20 | New group with < 2 helpers | Block | `People` | "You need at least 2 helpers for a group." | Primary "Make a helper" | 06-1 §5 |
| E-21 | Settings → Permissions, rules | Line | — | as 06-2 §6.4 | — | 06-2 |
| E-22 | Settings → Money, payment methods | Line | — | "No payment methods yet. I'll ask when a payment needs one." | — | 06-2 |
| E-23 | Settings → Privacy, dismissed suggestions | Line | — | "You haven't dismissed any suggestions." | "Close" | 06-2 |
| E-24 | Settings → Connections, browser sites | Line | — | "You're not signed in to any sites in my browser yet." | — | 06-2 |
| E-25 | Attachment viewer, file gone | Block (dark) | `Image` | "This picture is no longer on this PC." | — | 06-3 §13 |
| E-26 | Shortcuts sheet, filter no match **new** | Line | — | "No shortcut matches "{query}"." | — | 06-3 §19 |
| E-27 | Group profile, no files **new** | Line | — | "Files this group makes will show here." | — | 06-1 §4.3 |
| E-28 | Reaction picker / mention menu with no match **new** | Line in the menu | — | "No helper called "{text}"." (@ menu) | — | 04 §22.8 |

Rule F16.3.1: a new list, page or panel cannot ship without a row in this table.

---

## F17. Imagery (pictures)

### F17.1 Kinds of picture

| Kind | Source | Where |
|---|---|---|
| Attachment photo / screenshot | user's file, copied into foo's data folder | user bubble grid (04 §10.1), viewer |
| Answer picture | your AI or the web | rich bubble (04 §13.3) |
| Proof / step picture | foo's browser, masked (Article 8) | proof chip, checklist, viewer |
| Option photo | the website foo searched (hotel, restaurant) | option tiles (05 §5.4) |
| Link preview image | the linked page's preview image | link preview (04 §10.6, 05 §5.23.2) |
| Face | user or your AI | avatars (§F15) |
| App logo | bundled with foo | Connect cards, app chips (§F17.6) |

### F17.2 Aspect ratios and crops

| Use | Ratio | Fit |
|---|---|---|
| Faces, `--thumb` 72 option thumbnails, grid tiles 2–6 | 1:1 | `cover`, centred |
| Single attachment in a bubble | original ratio, height clamped 160–400px (04) | `cover` only when clamped |
| Option tile photo (wide layout) | 4:3 | `cover`, centred |
| Link preview image | 1.91:1 (Open Graph standard) | `cover` |
| Answer picture | original, max-height 360px | `contain` on `--bg-sunken` (04 §13.3) |
| Proof and step pictures | original | **`contain`, never cropped** (proof must show everything) |
| Viewer | original | fit 90% × 80% (06-3 §13) |

`[04, 05, 06; Open Graph 1200×630 reported; foo decision on 4:3 and proof never cropped]`

### F17.3 Files and sizes foo makes

| Copy | Size | Format |
|---|---|---|
| Display copy of an attachment | long edge 1280px (originals kept) | JPEG quality 85 (PNG stays PNG when it has transparency or is a screenshot) |
| Bubble/grid thumbnail | long edge 640px | same |
| Option/link-preview images fetched from the web | long edge 640px, ≤ 3 MB download, else no image | JPEG 80 |
| Face | 512×512, plus 96 and 48 copies | PNG |

`[foo decision; WIN toast image ≤ 3 MB reported]`

### F17.4 Loading, appearing and broken

| State | Treatment |
|---|---|
| Space reserved | width/height (or `aspect-ratio`) set before load; zero layout shift (§F11.4) |
| Loading, first 150ms (`--delay-loading`) | `--bg-sunken` fill only |
| Loading, after 150ms | `--bg-sunken` + 24px spinner ring centred (04 §10.1) |
| Appears | if decode took > 100ms: fade in `--m-normal` (167ms) `--ease-in`; else no fade. Reduced motion: no fade. |
| Blur-up / dominant-colour placeholder | **not used** (local files decode in < 100ms; web images are small) `[foo decision]` |
| Broken / unreadable | `--bg-sunken` + `Image` 24px `--fg-3` + "Can't show this photo" `--t-caption` `--fg-2` (04 §10.1). Web images that fail: the tile shows the place's first letter on `--bg-sunken` in `--fg-3`, `--t-title`, no message. |
| Offline (web image never fetched) | same as broken, no retry button; it retries on reconnect |
| Lazy | images in virtualised lists load when within one screen of view; `decoding="async"` |

### F17.5 Picture edges and dark mode

- `--img-edge`: an inset 1px outline on every picture and picture face: light `rgba(11,11,16,.08)`, dark `rgba(255,255,255,.08)` (`outline: 1px solid var(--img-edge); outline-offset: -1px`). Keeps white screenshots from melting into white backgrounds. `[foo decision; WAD/TGD draw no edge, Fluent image cards do reported]`
- Pictures are never dimmed, tinted or inverted in dark mode. `[M3, HIG reported]`
- Corners: `--r-md` 12px inside bubbles and cards; faces round; viewer square corners.
- Alt text: from the engine (04 §13.3); attachments: file name; faces: decorative; logos: "{App} logo" only when not next to the app's name, otherwise decorative.

### F17.6 App logos

| Rule | Value |
|---|---|
| Size | `--logo` 32px (F5); 20px inside chips (`--icon-md` box) |
| Tile | logo drawn inside a square tile with `--r-sm` 8px corners, fill `--logo-bg` (`#FFFFFF` in both themes), 1px `--line`, logo inset 4px (32) / 2px (20). Brand logos are designed for white; this keeps them correct in dark mode. |
| Source | bundled SVG/PNG files in `resources/logos/` (Gmail, Google Calendar, Outlook, WhatsApp, Claude, ChatGPT, Gemini, and each site foo ships connections for). Never fetched at runtime, never recoloured. |
| Where allowed | Connect cards, permission approvals, the first-run AI and app chips, Settings → Connections. Not in chat rows, not as helper faces (06-1 §2.4 "no brand logos" in lists stays). |

---

## F18. Emoji

### F18.1 Rendering

| Rule | Value | Evidence |
|---|---|---|
| Font | Windows' own **Segoe UI Emoji** (`--font-emoji`, appended to every stack, F1). On Windows 11 it draws the flat Fluent emoji; on Windows 10 the older style. Both accepted. | F1; `[reported: Windows 11 ships Fluent-style Segoe UI Emoji]` |
| No bundled emoji | foo bundles no emoji images (no Fluent 3D PNGs, no Twemoji). What the user types in the Windows emoji panel (Win+.) looks the same in foo. | `[foo decision: native, no download weight, no mismatch]` |
| Presentation | Status badges, reaction chips and the reaction picker append U+FE0F so they always draw in colour. | `[foo decision]` |
| Flags | Windows draws flags as two letters; accepted (04 §10.9). | 04 |
| Line height | Emoji inherit the line's line-height; no vertical nudging. | |
| Narrator | Chromium reads the CLDR name ("thumbs up"); foo adds nothing. | |

### F18.2 Sizes

| Use | Size |
|---|---|
| Inline in text | the text's size |
| Reaction chip | 15px (04 §8) |
| Reaction picker | 20px in 36px buttons (04 §9.3) |
| 2–3 emoji-only message | 28px (`--t-title-large` size) |
| 1 emoji-only message | 40px (`--t-display` size) |
| Status badge on the user's bubble | owned by 04 §4.3 |
| Emoji face | §F15.4 glyph size |

### F18.3 Where emoji may appear

| Place | Allowed |
|---|---|
| User's messages | anything |
| foo's and helpers' messages | per tone rules §F23.6 |
| UI chrome (buttons, labels, menus, settings, dialogs, toasts) | **only**: status badges 👀 🛠 ⏳ ✅ ❌ ⛔ (Article 16, X-17), "🎲 Surprise me", number reactions 1️⃣–4️⃣ on Choice cards, face glyphs, the "⚠ Not checked live" chip (05 §5.16) |
| Error, payment, approval, secret and stuck cards | **never** (other than the status badge on the user's bubble) |

### F18.4 Reactions

- The user's reaction set (04 §9.3): 👍 ❤️ 😂 😮 🙏 👎. "+" opens the Windows emoji panel.
- foo's and helpers' own reactions on the user's bubbles: **only 👍 and ❤️** (J7: 👍 for "ok/cool", ❤️ for warm thanks). Never 😂, never 👎. `[J7; foo decision]`
- Reactions never approve (Article 6); no picker on Approval/Payment cards (04).
- Skin tone: foo never picks a skin tone; it uses the default yellow. The user's own tone choices are kept as typed.

---

## F19. Numbers, money, dates and data display

All formatting is done by the app (renderer), never by the AI (04 §16.2). One helper module `format.ts` owns every function below; components never format by hand. Locale = the Windows region (`app.getSystemLocale()`); the default and test locale is `en-IN`.

### F19.1 Numbers

| Rule | Value |
|---|---|
| Grouping | Windows region. India: 1,23,45,678 (`Intl.NumberFormat('en-IN')`). |
| Figures | `font-variant-numeric: tabular-nums` on every number that sits in a column, meter label, timer, count badge, amount, time in rows. Prose may use proportional figures. |
| Decimals | Max 1 decimal for "about" values (4.5 km), 2 for money paise, 0 for counts. |
| Negative | U+2212 minus "−", never a hyphen. |
| Ranges | en dash, no spaces: "4–6", "₹4,000–₹6,000", "12–14 Dec"; with spaces when either side has a space: "30 Dec – 2 Jan", "8:00 PM – 9:30 PM" → shortened "8:00–9:30 PM" when both share AM/PM. |
| Percent | "80%" (no space). |
| Large counts | "1,204 messages"; badges cap at "99+" (03). Never "1.2k". |
| Zero | Use words: "Nothing spent in October", "No routines yet" (§F16); "0" only inside meters and tiles ("₹0"). |

### F19.2 Money (India first)

| Case | Format | Example |
|---|---|---|
| Any amount in a Payment, Approval, Plan, Spend or receipt context (Article 7) | **exact**, symbol, Indian grouping, paise only when non-zero | "₹14,600", "₹1,23,450", "₹1,179.50" |
| Conversation and routine text, values ≥ ₹1 lakh that are thresholds or rough figures (not something being paid) | words for lakh/crore, max 1 decimal, ".0" dropped | "₹55 lakh", "₹1.2 crore", "₹2 crore" |
| Never | "Rs", "INR", "/-", "L", "Cr", "k", "lac", "lakhs" | — |
| Estimate | prefix "about" | "about ₹212" (06-3 §10) |
| Refund / money back | "Refund ₹1,179" (word, not a minus or colour) | |
| Free | only when the site says so: "Free" | |
| Other currencies | their symbol and the region's grouping, exact as charged: "$1,250.00", "€89", "AED 420" (codes only where the symbol is ambiguous). **No invented conversion.** When the site shows a rupee amount too, it may follow in brackets: "$1,250.00 (₹1,04,375 on the site)". | |
| Amount in a button | "Approve ₹14,600", "Pay ₹1,179" (X-04) — always the exact total |
| Alignment | right-aligned in tables and lists, tabular figures (04 §16.2) |
| Narrator | "₹14,600" is read as "14,600 rupees" by Narrator from the en-IN locale; foo adds no text. Lakh/crore words read naturally. |

`[04 §16.2; F10; Article 7; foo decision on lakh/crore words]`

### F19.3 Dates and times (Article 21)

| Form | Pattern | Example | Used |
|---|---|---|---|
| Full | `EEE d MMM, h:mm a` | "Sat 12 Dec, 8:00 PM" | foo's text, cards, tooltips, Narrator |
| Full, other year | `EEE d MMM yyyy, h:mm a` | "Sat 12 Dec 2027, 8:00 PM" | when not the current year |
| Full with seconds | `EEE d MMM yyyy, h:mm:ss a` | "Fri 16 Oct 2026, 10:42:07 PM" | bubble-time tooltip (04 §3) |
| Date only | `EEE d MMM` | "Fri 16 Oct" | separators, lists |
| Time only | `h:mm a` | "9:41 AM" | bubble meta and rows under a date context |
| Row time | 03 §3.4.5 table | "9:41 AM" / "Thu" / "12 Dec" / "12 Dec 2025" | chat rows only |
| Month | `MMMM yyyy` | "October 2026" | Spend month switcher |
| Date range | `d–d MMM` | "12–14 Dec", "30 Dec – 2 Jan" | |
| With relative word | relative + ", " + full | "tomorrow, Sat 17 Oct, 8:00 PM" | relative only in addition |

Rules:
- F19.3.1 No leading zeros on day or hour ("9:05 AM", "5 Oct"); minutes always 2 digits. "AM"/"PM" uppercase after a space. No ordinals ("12th"). English 3-letter weekdays and months in v1, also when the conversation is in Hindi/Punjabi (§F24.4).
- F19.3.2 12- or 24-hour follows the Windows region short-time setting; India default 12-hour. With 24-hour: "Sat 12 Dec, 20:00".
- F19.3.3 Times are the PC's time zone. An event in another zone shows both: "Sat 12 Dec, 8:00 PM Dubai time (9:30 PM your time)".
- F19.3.4 "Today", "Yesterday", "Tomorrow" never stand alone (03, Article 21). Date separators show "Fri 16 Oct" (04 §19.1).
- F19.3.5 Weekday always computed from the real date (X-10). Test clock: Fri 16 Oct 2026, 9:00 AM IST.

### F19.4 Durations and countdowns

| Kind | Format | Example |
|---|---|---|
| Media length | `m:ss` | "0:14", "12:03" |
| Work time | short | "Worked for 12s" (04 §15), "Worked for 2 min" |
| Waits and estimates | words | "about 2 min", "1 hr 20 min", "3 days" |
| Countdown | `m:ss` after "in" | "Expires in 9:59" (05 §0.4); absolute time in tooltip and Narrator |
| Narrator | words | "14 seconds", "9 minutes 59 seconds" |

### F19.5 Units, phone numbers, addresses

| Thing | Format |
|---|---|
| Distance, weight, temperature | metric, space before unit: "5 km", "800 m", "2 kg"; temperature "31°C" (no space) |
| File size | "2.4 MB", "640 KB" (1 decimal from MB up) |
| Indian phone | "+91 98765 43210"; masked in groups/privacy "+91 ••••• 43210" |
| Other phones | "+971 50 123 4567" (E.164 split by the number's own country pattern) |
| Address | as the user or site wrote it, one line in chips, multi-line in cards; never in group chats (Article 14) |
| Confirmation numbers, booking codes | `--t-mono`, exact characters, no reformatting, selectable |

### F19.6 Plurals and counts in copy

Every count string has `one` and `other` forms (ICU MessageFormat): "1 thing needs you" / "{n} things need you"; "1 job running" / "{n} jobs running". Zero uses its own words (§F19.1). No "(s)".

### F19.7 Truncation

| Rule | Value |
|---|---|
| Character | "…" (U+2026), never "..." |
| End ellipsis | names, previews, titles in rows (1 line) |
| Middle ellipsis | file names ("Goa-booking-co…tion.pdf", keep the extension) |
| Line clamp | 2 lines for checklist items, job text; full text in tooltip and Narrator (05) |
| Never truncated | payee, amount, recipient, date and item on Approval and Payment cards (they wrap; Article 7, 10) |
| Minimum visible | a truncated name always shows ≥ 6 characters before the ellipsis; the slot shrinks other items first |

### F19.8 Lists and tables

| Element | Rule |
|---|---|
| Bulleted list (in messages) | "•" bullets, 20px indent, 4px between items (04 §13 owns styling) |
| Label: value rows (in cards) | label `--t-small` `--fg-2` left, value `--t-small` `--fg-1` right or below; 8px row gap (F3) |
| Table card | 05 §5.22: horizontal rules only, header `--t-caption-strong` uppercase on `--bg-sunken`, numbers right, max 6 columns, 10 rows then "Show all {n} rows" |
| Sorting | tables are not sortable in v1; foo sorts before sending (cheapest first, earliest first) and says which in the title |
| Zebra stripes, vertical rules | never |

### F19.9 Meters and bars (the only charts in v1)

| Element | Spec |
|---|---|
| Meter (cap, progress against a limit) | height `--meter-h` 4px, `--r-full`, track `--bg-sunken`, fill `--accent`; 80–99% `--warn`; ≥ 100% `--bad` (03 §3.7.3, 06-3 §10) |
| Share bar (spend by chat/routine) | height `--bar-h` 8px, `--r-full`, track `--bg-sunken`, fill `--accent`, length ∝ value / largest value in the list (largest = full width) |
| Minimum visible | non-zero values draw at least 4px long |
| Labels | the number is always written next to the bar ("₹71"); bars are `aria-hidden`; meters are `role="meter"` with a full Narrator name (06-3) |
| Colour | one colour per chart (`--accent`); status colours only for thresholds; never helper colours |
| Not in v1 | line charts, pie/donut charts, sparklines, axes, legends |
| Forced colours | track 1px `CanvasText` border, fill `Highlight` |

`[03, 06-3; dataviz rule "label the value, one hue"; foo decision on no other chart types]`

---

## F20. Loading, waiting and progress

### F20.1 Timing ladder

| Token | Value | Rule |
|---|---|---|
| `--delay-loading` | 150ms | show nothing for the first 150ms; then a skeleton (lists, pages) or a ring (single things). (06 §0.5) |
| `--delay-skeleton-chat` | 300ms | opening a chat whose cache missed: 4 skeleton bubbles after 300ms (03 §3.5) |
| `--delay-still-loading` | 2000ms | under a skeleton still showing: "Still loading…" `--t-small` `--fg-3` (06 §0.5) |
| `--dur-confirm` | 2000ms | inline confirmations ("Copied", "Saved") stay 2s (04, 05, 06) |
| `--dur-undo` | 5000ms | undo bar lifetime (06-2 §7.4; §F21.3) |
| `--delay-tooltip` | 500ms | tooltip show delay (§F27.5; 04 §4.3) |

### F20.2 Skeletons

| Rule | Value |
|---|---|
| Fill | `--bg-sunken` blocks, `--r-xs` for text bars, `--r-full` for avatars, `--r-bubble` for bubbles, `--r-lg` for cards |
| Shapes | match the real thing: rows = 48px circle + two bars 12px tall at 60% and 85% width (03); bubbles widths 40/60/30/50% alternating sides (03); cards = one `--r-lg` block of the card's typical height |
| Motion | **static**, no shimmer (06 §0.5). The only shimmer in foo is the before-first-word status line (`--m-shimmer`, 04 §14.2). |
| Count | as many as fill the visible area, max 8 |
| Narrator | the container has `aria-busy="true"`; one polite announcement "Loading" only if loading passes 2s |

### F20.3 Spinner ring

| Item | Value |
|---|---|
| Sizes | `--spinner-sm` 16px (in buttons, chips), `--spinner-md` 20px (rows, viewer), `--spinner-lg` 24px (picture tiles, empty areas) |
| Drawing | SVG circle, stroke 2px, track `--line` full circle, arc `--accent` 25% of the circumference, round caps |
| Motion | arc rotates 360° in 1s linear (F7); reduced motion: static "◔" glyph in `--fg-3` at the ring size (F7) |
| On accent fill | arc `--on-accent`, track `--on-accent` at 30% opacity |
| Narrator | `role="progressbar"` without a value, named for what is loading ("Loading pictures") |

### F20.4 Determinate progress bar

Used only where real progress is known: voice model download (X-22), update download (09), file copy over 1s. Height `--meter-h` 4px, `--r-full`, track `--bg-sunken`, fill `--accent`; text "{n}%" `--t-caption` `--fg-2` `tabular-nums` next to it; updates at most every 250ms; never moves backwards; `role="progressbar"` with `aria-valuenow`. No indeterminate bars (use the ring). `[foo decision]`

### F20.5 Busy buttons

When a button starts something that takes > 150ms (Approve, Try again, Connect):
- Width locked to its rest width; label stays; a 16px ring replaces the leading icon (or appears 8px left of the label when there is no icon); the button is disabled (`aria-disabled`, `aria-busy="true"`); other buttons in the same card are disabled too.
- Approval and Payment buttons show the card's own "Approving…/Paying…" state from the job runner (05); the busy look ends only when the runner reports (Article 12).
- Never a full-screen or full-card blocking spinner.

### F20.6 Waiting for the AI (chat)

Owned by 04 §14 (status line → typing bubble → streaming). Summary for consistency: before the first word, foo shows its status line with the shimmer, or the 26px Thinking face (§F15.9.3 #5, replacing the typing dots [X-36]); words then fade in 150ms each; no blinking cursor (F7); no "thinking…" word on its own. `[04; AIC #25]`

### F20.7 Optimistic UI (what may appear before it is true)

| Action | Optimistic? | Rule |
|---|---|---|
| Sending a message | yes | bubble appears < 16ms with the clock tick (04 §3) |
| Reacting, pinning, muting, marking read | yes | revert + inline line on failure |
| Settings toggles and fields | yes | 06 §0.5 Saving state |
| Forgetting a memory, removing a rule | yes | with the undo bar |
| Approving, paying, sending, booking, posting, deleting outward | **never** | the card waits for the job runner's real state (Article 12) |
| Job progress, badges, checklist | **never** | runner state only (Article 12) |

(continued in `02-foundations-3.md`: F21 feedback, F22 sound, F23 voice and tone, F24 localisation, F25 accessibility depth, F26 component state matrix, F27 pointer and tooltips, F28 theming and accent, F29 token files, F30 typographic details, F31 polish bar, conflicts for the editor)
