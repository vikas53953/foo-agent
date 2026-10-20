# 02 · Foundations (design tokens)

Every visual value in foo comes from this file. Components never use a raw hex, px or ms that is not a token here. Token names below are the CSS custom-property names to use in code (`var(--fg-1)`).

Evidence keys: **MSG** = `../../personal-agent-re/ui-evidence/messenger-shell.md` (WhatsApp/Signal/Telegram), **AIC** = `ai-chat-apps.md` (ChatGPT/Claude/Gemini/Perplexity), **HRM** = `hermes-desktop-1/2.md`, **OCL** = `openclaw-ui-1/2.md`, **AGT** = `agent-surfaces-1/2.md`, **WIN** = `windows-platform.md`, **BP1** = Blueprint v1 (approved look).

## F0. Identity decisions (read first)

| Decision | Value | Why |
|---|---|---|
| Look | **WhatsApp structure, foo's own skin.** Layout, sizes, grouping, ticks and composer behave like WhatsApp; colours and identity come from Blueprint v1 (indigo accent, near-black "me" bubble, cool greys). No WhatsApp green, no beige doodle wallpaper. | Vikas approved BP1's look; copying WhatsApp's brand colours would read as a clone and confuse users [foo decision] |
| Accent | Brand indigo `#2B3FD6` by default. Settings → Appearance → "Use my Windows accent colour" (off by default) swaps `--accent*` for the system accent with derived shades. | WIN asks for system accent; BP1 brand wins by default, the setting honours WIN [foo decision; settled: X-51 "Indigo + option"] |
| Font | **Segoe UI Variable** for everything (Windows-native, ClearType-tuned). Hindi/Punjabi fall back to **Nirmala UI** automatically. Numbers that line up use `font-variant-numeric: tabular-nums`. | WIN exact ramp; AIC #5; Vikas writes in Hindi/Punjabi, Nirmala UI ships with Windows and covers Devanagari + Gurmukhi [foo decision] |
| Wordmark | "foo" in Segoe UI Variable Display 800, letter-spacing −0.05em, lowercase | BP1 |
| Themes | Light, Dark, and "Same as Windows" (default). High-contrast mode overrides everything with system colours (F9). | WIN MUST |
| Density | One density. No compact mode in v1. | Non-technical users [foo decision] |

## F1. Typography

Font stacks:
```css
--font-ui:      "Segoe UI Variable Text", "Segoe UI", "Nirmala UI", system-ui, sans-serif;
--font-display: "Segoe UI Variable Display", "Segoe UI", "Nirmala UI", system-ui, sans-serif;
--font-mono:    "Cascadia Mono", Consolas, "Courier New", monospace;
--font-emoji:   "Segoe UI Emoji", "Segoe UI Symbol";
```
`[exact: WIN §11 font stack; AIC #5]`. Never bundle or load web fonts. Emoji always use Segoe UI Emoji (append `--font-emoji` to every stack).

Type scale (size / line-height / weight / letter-spacing). Use these roles only.

| Token | Size/LH | Weight | Tracking | Used for | Evidence |
|---|---|---|---|---|---|
| `--t-caption` | 12/16 | 400 | 0 | timestamps, card labels, footers, chip text | WIN caption 12/16 exact |
| `--t-caption-strong` | 12/16 | 600 | +0.02em | uppercase section labels (with `text-transform:uppercase`, tracking +0.08em) | WIN |
| `--t-small` | 13/18 | 400 | 0 | chat-row preview, secondary lines in cards, subtitles | MSG row preview 14 → 13 to fit 72px row with 2 lines [foo decision] |
| `--t-body` | 15/22 | 400 | 0 | **message text (input and output)**, card body, settings rows | between WhatsApp 14.2/19 (MSG) and AI apps 16/26 (AIC); 15 reads well at chat density [foo decision] |
| `--t-body-strong` | 15/22 | 600 | 0 | names in chat rows, card titles, button labels in cards | |
| `--t-subtitle` | 17/24 | 600 | −0.01em | chat header name, panel titles, dialog titles | MSG header title 16 w500 → 600 for BP1 crispness; [X-179] 17/24 (was 16/22) so body 15 and subtitle differ by 2px (CR-0021 pick 16) |
| `--t-title` | 20/28 | 600 | −0.015em | page titles in Settings / Memory / Routines, markdown H1–H2 inside messages | WIN subtitle 20/28 |
| `--t-title-large` | 28/36 | 700 | −0.02em | onboarding questions, empty-state greeting | WIN title 28/36 |
| `--t-display` | 40/48 | 800 | −0.04em | wordmark on splash / first run only | BP1 |
| `--t-wordmark` | 24/32 | 800 | −0.05em | "foo" wordmark in the left-shell header (BP1) | requested by 03-shell §3.12 |
| `--t-body-indic` | 15/24 | 400 | 0 | message text detected as Devanagari/Gurmukhi (accents clip at 22) | 04 §26 |
| `--t-mono` | 13/20 | 400 | 0 | code blocks, booking/confirmation numbers, the masked secret field | AIC #9 |

Rules:
- Body text never below 15px. Captions never below 12px. Nothing ever below 12px [foo decision; HRM used 11px, flagged as an avoid].
- Markdown headings inside messages: H1/H2 → `--t-title`; H3–H6 → `--t-body-strong`. Never larger than 20px inside a bubble.
- Max line length inside a bubble: 72 characters (enforced by bubble max width, F5).
- Text colours come only from `--fg-1/2/3` and status tokens.
- Use `text-wrap: pretty` on message text and `balance` on titles.
- Money weight [X-179]: `--weight-money` 700 with `font-variant-numeric: tabular-nums`, used only for money amounts (Approval, Payment, Spend); every other text stays 400 / 600 (and the 800 wordmark) (CR-0021 pick 15).
- Nirmala UI has no 600 or 800 weight, so Indic text in a 600/800 role renders Bold (700); accepted. Base styles set `font-synthesis: none` so no fake bold or italic is drawn (§F24) [X-31].

## F2. Colour tokens

Text pairs pass WCAG AA (4.5:1) and icons and control edges pass 3:1; the computed ratios are in §F25.1 (`02-foundations-3.md`). `--line` and `--line-strong` are decorative edges (below 3:1); the edge of a text field, checkbox, radio or toggle-off track uses `--line-input` [X-24, X-25].

### Neutrals and surfaces

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--bg-app` | `#FFFFFF` | `#0D0D11` | main shell (conversation) background, right shell |
| `--bg-sidebar` | `#F5F5F8` | `#131318` | left shell background, title bar background |
| `--bg-raised` | `#FFFFFF` | `#1B1B22` | cards, menus, dialogs, toasts, composer field |
| `--bg-sunken` | `#F0F0F4` | `#16161C` | search field, input fields inside cards, code blocks, chips. Equals `--bubble-foo` in light mode, so inside foo's bubble use `--bg-raised` + 1px `--line` instead |
| `--bg-hover` | `#EBEBF0` | `#22222A` | hover on rows, icon buttons, menu items |
| `--bg-pressed` | `#E2E2E9` | `#2A2A33` | pressed state |
| `--bg-selected` | `#FFFFFF` | `#1F1F27` | selected chat row (plus 3px accent bar, see 03-shell) |
| `--line` | `#E8E8EE` | `#26262E` | dividers, card borders, header bottom border |
| `--line-strong` | `#D4D4DD` | `#34343E` | secondary button borders, focused-card border base (not field edges) [X-25] |
| `--line-input` | `#85858F` | `#70707C` | edge of text fields, checkboxes, radios and toggle-off tracks (≥ 3.2:1 on app, sunken and sidebar; WCAG 1.4.11) [X-25] |
| `--scrim` | `rgba(11,11,16,.32)` | `rgba(0,0,0,.56)` | behind dialogs and the live window |

### Text

| Token | Light | Dark | Contrast | Used for |
|---|---|---|---|---|
| `--fg-1` | `#0B0B10` | `#F1F1F5` | 19.6 / 17.2 | primary text |
| `--fg-2` | `#5A5A66` | `#B0B0BC` | 6.0 on `--bg-sunken` / 8.0 on raised | secondary text, previews, subtitles |
| `--fg-3` | `#696975` | `#8E8E9A` | 5.41 on white, 4.98 on sidebar, 4.76 on sunken, 4.56 on hover / 6.0 [X-24] | timestamps, placeholders, hints |
| `--fg-disabled` | `#A3A3AE` | `#5C5C68` | (disabled, exempt) | disabled labels |

### Accent

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--accent` | `#2B3FD6` | `#8C9BFF` | primary buttons, links, selected bar, unread badge, focus-adjacent highlights, send button |
| `--accent-hover` | `#2334B8` | `#A3AFFF` | |
| `--accent-pressed` | `#1C2A96` | `#7484F5` | |
| `--accent-soft` | `#E6E9FF` | `#1F2452` | selected chips, recommended option fill, "Working" pill bg |
| `--on-accent` | `#FFFFFF` | `#0D0D11` | text/icons on `--accent` (7.5 / 7.6) |

### Messages

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--bubble-me` | `#0B0B10` | `#2B3FD6` | the user's own bubble (BP1; dark = indigo, X-145) |
| `--on-bubble-me` | `#FFFFFF` | `#FFFFFF` | text in the user's bubble (dark 7.54:1, X-145) |
| `--on-bubble-me-2` | `#B5BDC9` | `#C9D0FF` | time + ticks inside the user's bubble (10.4:1 / 5.01:1; X-145) |
| `--bubble-foo` | `#F0F0F4` | `#202028` | foo's and helpers' bubbles (BP1) |
| `--on-bubble-foo` | `#0B0B10` | `#F1F1F5` | text in foo's bubble |
| `--tick-read` | `#2B3FD6` | `#8C9BFF` | "read by foo" double tick on light surfaces |
| `--tick-read-on-me` | `#8C9BFF` | `#FFFFFF` | read ticks inside the user's bubble (3:1+; X-145) |
| `--on-bubble-me-soft` | `#26262C` | `#2334B8` | quote, file-chip and link-preview fill inside the user's bubble |
| `--media-scrim` | `linear-gradient(to top, rgba(0,0,0,.55), rgba(0,0,0,0)) 32px` | same | under time/ticks over photos |
| `--on-media` | `#FFFFFF` | `#FFFFFF` | time, ticks, "+n" over photos |

### Status (semantic; never used as decoration)

| Token | Light | Dark | Meaning |
|---|---|---|---|
| `--ok` / `--ok-soft` | `#137044` / `#E3F5EA` | `#4ADE80` / `#12301F` | done, proof, connected |
| `--warn` / `--warn-soft` | `#A04807` / `#FDF0DD` | `#F5B041` / `#3A2A10` | needs you, waiting, pending approval, "not checked live" |
| `--bad` / `--bad-soft` | `#B03224` / `#FDE8E5` | `#FF7B6B` / `#3A1714` | failed, declined, error, destructive buttons |
| `--info` / `--info-soft` | = `--accent` / `--accent-soft` | | working, in progress |
| `--live` | = `--bad` (`#B03224`) | = `--bad` (`#FF7B6B`) | the "● LIVE" dot and word only (an alias, so `--bad` keeps meaning "failed"); 6.3:1 on `--bg-app` light, 7.7:1 dark `[requested by 06 §0.11, 05 §5.26]` |

### Text on fills and special surfaces

Ratios computed for this file (WCAG 2.x relative luminance).

| Token | Light | Dark | Used for | Contrast |
|---|---|---|---|---|
| `--on-bad` | `#FFFFFF` | `#0D0D11` | text/icons on a `--bad` fill (destructive buttons) | 6.31 / 7.66 |
| `--on-warn` | `#FFFFFF` | `#0D0D11` | text/icons on a `--warn` fill ("You're in control" bar) | 6.13 / 10.32 |
| `--on-helper` | `#FFFFFF` | `#FFFFFF` | letter/glyph on helper-colour avatars (and the user's `--h-slate` avatar) | 4.96 (`--h-green`, lowest) … 7.56 (`--h-slate`) |
| `--scrim-media` | `rgba(0,0,0,.88)` | `rgba(0,0,0,.88)` | attachment viewer background (photos need a near-black surround in both themes) | — |
| `--qr-bg` / `--qr-fg` | `#FFFFFF` / `#0B0B10` | `#FFFFFF` / `#0B0B10` | WhatsApp link QR code (phones cannot scan light-on-dark QR codes reliably) | 19.63 |

`[requested by 06 §0.11 and 05 §5.26; added by the editor 2026-10-16]`

### Helper colours (avatar fills; white text ≥ 4.96:1)

`--h-terracotta #B54A2F`, `--h-green #17804D`, `--h-violet #6B5BD6`, `--h-raspberry #B8326B`, `--h-steel #2F6F95`, `--h-teal #0F7B7B`, `--h-brown #8A5A2B`, `--h-slate #4B5563`, `--h-purple #7A3FB0`, `--h-ochre #A1600F`. Same values in dark mode. Helper names as text: helper colour in light mode; `--fg-1` in dark mode (the avatar carries the colour) because these fills fail AA as text on dark backgrounds. foo itself uses `--fg-1` fill with `--bg-app` letter (BP1). New helpers get the next unused colour; the user can change it. `[AGT recommends a 10-colour bot palette; Grok Bot has an 11-colour picker]`

## F3. Spacing

4px grid `[exact: WIN §13]`. Tokens: `--s-1: 2px`, `--s0: 4px`, `--s1: 8px`, `--s2: 12px`, `--s3: 16px`, `--s4: 20px`, `--s5: 24px`, `--s6: 32px`, `--s7: 40px`, `--s8: 48px`, `--s9: 64px`.

Fixed rhythm:
- Between bubbles from the same sender within 3 minutes: **2px**. Otherwise: **12px** `[exact: MSG Signal timelineUtil.std.ts:22 grouping rule; MSG WA spacing]`.
- Between a bubble and a card from the same sender: 4px.
- Date separator: 16px above and below.
- Card inner padding: 14px horizontal, 12px vertical (BP1). Gap between card rows: 8px.
- Conversation side padding: 24px at ≥ 900px pane width, 16px below.
- Lists in settings: row height 56px, padding 16px.

## F4. Shape

| Token | Value | Used for |
|---|---|---|
| `--r-xs` | 4px | inline code, small tags, checkbox |
| `--r-sm` | 8px | chat rows (inset), menu items, inputs and text fields, icon-button hover fill |
| `--r-md` | 12px | code blocks, images, toasts, chips that are not pills, hotel option tiles |
| `--r-lg` | 16px | cards, dialogs, the live window, panels' inner cards |
| `--r-bubble` | 18px | message bubbles (tail corner 6px, see 04) |
| `--r-composer` | 24px | composer field (pill) |
| `--r-full` | 999px | every text button (cards, dialogs, pages, settings, banners: X-01), pills, avatars, badges, round buttons |

Borders: 1px solid `--line` on cards, menus, composer; 1.5px `--accent` on the recommended option and on a pending approval card's top edge.

Shadows (Fluent-based) `[exact: WIN §13 Fluent 2 shadows]`:
- `--shadow-1`: `0 1px 2px rgba(11,11,16,.06)` — bubbles (light only; none in dark)
- `--shadow-4`: `0 2px 8px rgba(11,11,16,.08)` — composer, cards on hover
- `--shadow-16`: `0 8px 24px rgba(11,11,16,.14)` — menus, toasts, popovers
- `--shadow-28`: `0 16px 48px rgba(11,11,16,.22)` — dialogs, live window
- Dark depth [X-179]: in dark, `--shadow-4`, `--shadow-16` and `--shadow-28` are a 1px edge ring `rgba(255,255,255,.06)` plus two black layers (values in `design/tokens.json`); light values unchanged (CR-0021 pick 17).
Dark mode uses the same offsets with `rgba(0,0,0,.5)` and adds a 1px `--line` border instead of relying on shadow.

## F5. Sizes (shared)

| Token | Value |
|---|---|
| `--avatar-list` | 48px (chat row) `[MSG: WA ≈49, Signal 48]` |
| `--avatar-header` | 40px |
| `--avatar-inline` | 26px (sender label in groups, toasts) |
| `--row-chat` | 72px `[exact: MSG Signal _modules.scss:3952; WA measured]` |
| `--header-h` | 60px (both left and main headers, must align) `[MSG measured 60–62]` |
| `--titlebar-h` | 32px |
| `--field-h` | 36px: `TextField size='sm'` (cards, search and find fields) (X-119; 02-3 §F32.4) |
| `--btn-h` | 40px: every Primary button and every text button in cards, dialogs and Pages (06 §0.4) [UX-29] |
| `--btn-h-sm` | 32px: small text buttons only: checklist footer, inline Secondary buttons, chip rows, banner buttons (03 §3.3.1), "+ New helper" (03 §3.4.2), "Watch live" (03 §3.6.2.2), filter chips, composer strips. **A Primary button is never 32.** [UX-29] |
| `--btn-round` | 36px: the composer's round buttons ("+", morphing send/mic/stop; 04 §21) |
| `--icon-btn` | 36px visual, padded to a 40px hit area, 20px icon |
| `--bubble-max` | 72% of the message column, capped at 620px; rich bubbles (tables, images, cards) cap at 680px |
| `--column-max` | 760px (message column max width, centred) |
| `--sidebar-w` | 340px default, resizable 300–460 (`settings.window.sidebarWidth`, 08-0 §A; M ≤ 400, S fixed 300; X-91) |
| `--panel-w` | 340px right shell, fixed |
| touch target | ≥ 40×40px for every clickable thing `[WIN MUST]` |
| `--card-w` | 440px standard in-chat card width (05 §0.2) `[BP1 measured]` |
| `--card-w-wide` | 600px brief, option tiles, table card (under the 680px rich-bubble cap) |
| `--thumb` | 72px option photo in the narrow tile layout `[AIC #21]` |
| `--logo` | 32px app logo on Connect cards and permission approvals `[AGT A9]` |
| `--qr-size` | 200px WhatsApp link QR code `[foo decision]` |
| `--dialog-sm` / `--dialog-md` / `--dialog-lg` | 400px / 520px / 720px dialog widths (06 §0.1; 09 first-close and typed-amount dialogs use `--dialog-sm`) `[WIN S5; AGT A19]` |
| `--banner-h` | 40px page banners, banner strip min-height, composer chat-banner slot (03 §3.3.1, 04, 06 §0.6) |
| `--toggle-w` / `--toggle-h` | 40px / 20px toggle track `[AGT A19]` |
| `--avatar-hero` | 96px profile pages, welcome card, face picker preview `[AGT A2/A16]` |
| `--avatar-pick` | 72px face tiles in the 2×2 picker `[foo decision]` |
| `--settings-nav-w` | 240px Settings left navigation |
| `--palette-w` | 640px Search overlay (Ctrl+K) width `[foo decision; GRK2]` |

All sizes above are the same in light and dark themes. `[requested by 05 §5.26 and 06 §0.11]`

## F6. Icons

- Set: **Fluent UI System Icons, Regular** (MIT). Filled variant only where §F14.3 (`02-foundations-2.md`) says: an icon toggle that is on, the selected Settings nav item, and 16px status icons in pills [X-28]. `[AIC #46; MSG]`
- Sizes: 20px default (headers, composer, sidebar), 16px inside chips and captions, 24px on empty states.
- Colour: `--fg-2`; hover `--fg-1`; on accent `--on-accent`.
- Emoji are content, never icons. Status emoji on the user's bubble are the one exception (04 §status).
- Ticks are custom SVGs (not Fluent): `TickSingle` and `TicksDouble`, 16×11px, 1.5px stroke, the double offset 4px (04 §26).
- **Required icon names (the one list, de-duplicated; X-128):** Add, Mic, Send, Stop, Search, Filter, MoreHorizontal, Dismiss, ChevronDown, ChevronRight, ChevronUp, ChevronLeft, Checkmark, CheckmarkCircle, Clock, Warning, ErrorCircle, LockClosed, Key, Eye, EyeOff (private-chat mark, 12-2 §12.30), Copy, ArrowClockwise (retry), ThumbLike, ThumbDislike, Attach, Image, Document, Calendar, Mail, Globe, Window (watch live), HandRight (take over), Settings, PersonCircle, People, Bot, Brain (memory), Money, Alert, AlertOff, PanelRight, Pin, Archive, ArrowLeft, CloudOff, ArrowSync, ArrowReply, Edit, Delete, Emoji, Play, Pause, Screenshot, Info (shell and messages); Location, PaintBrush, ShieldCheckmark, PlugConnected, Keyboard, History, ArrowMaximize, ArrowDownload, ZoomIn, ZoomOut (cards and screens, 05 §5.26, 06 §0.11; TaskListLtr and Wallet are in the Ideas group below); ArrowRepeatAll, Receipt (R25–R31); VehicleSubway, BoxMultiple, Phone, ArrowTrendingDown, Airplane, Sport, CalendarLtr, Gift, Backpack, Pill, Wallet, TaskListLtr (Ideas page, 12-1 §12.24). Each `20Regular` unless §F14.3 or 12-* says Filled.

## F7. Motion

`[exact: WIN §15 Fluent timings; MSG Signal transitions.css]`

| Token | Value | Used for |
|---|---|---|
| `--m-fast` | 83ms | hover colour, press |
| `--m-normal` | 167ms | menus, popovers, chip changes, tick changes |
| `--m-slow` | 250ms | right shell slide, dialogs, cards appearing |
| `--ease-in` (enter) | `cubic-bezier(0, 0, 0, 1)` | things appearing |
| `--ease-out` (exit) | `cubic-bezier(1, 0, 1, 1)` at 167ms | things leaving |
| `--delay-sticky-hide` | 1500ms | floating date chip stays this long after scrolling stops |
| `--m-shimmer` | 1500ms linear infinite | status-line shimmer (off under reduced motion) |
| `--ease-standard` | `cubic-bezier(0.33, 1, 0.68, 1)` | everything else |
| `--ease-spring` [X-179] | CSS `linear()` spring, 2.6 % overshoot (value in `design/tokens.json`) | things that land: dialogs, the Approve card, chips, badges |
| `--ease-spring-soft` [X-179] | CSS `linear()` spring, no overshoot | things that slide: chat and page changes, panels |
| `--m-spring` [X-179] | 400ms | with either spring; Basic → `--m-basic` fade, Off → 83ms fade |
| `--m-card` | = `--m-normal` (167ms) with `--ease-standard` | card state change: content cross-fade + height (05 §0.8, motion M-1); reduced motion: cross-fade ≤ 83ms, no height animation `[requested by 05 §5.26]` |
| `--m-face-*` (blink, blink-slow, look, drift, orbit, scan, once, wake, happy, party, react, sorry, stopped, level, cross) | values in §F15.9.2 (`02-foundations-2.md`) | living face moods [X-35] |

What animates (and nothing else; X-179 adds the §F7.1 list, which wins where they differ):
- New message: fade in + rise 8px, `--m-slow` `--ease-in`.
- Living face moods (§F15.9.2 tokens). Typing dots next to foo's bubble are replaced by the 26px Thinking face (§F15.9.3 #5) [X-36].
- Checklist step: the spinner ring rotates 1s linear; a step turning done swaps ring → ✓ with a 167ms scale 0.6→1.
- Right shell open/close: slide 340px, `--m-slow`.
- Status emoji on the user's bubble: cross-fade `--m-normal`.
- Streaming text: new words fade in 150ms; no blinking cursor `[AIC #25]`.
- Press: scale 0.97 for 83ms on buttons.
- Status-line shimmer (`--m-shimmer`), live mic level (updates every 100ms), jump-to-message highlight (fade in 167ms, hold 1600ms, fade out 250ms).
- Card state change (`--m-card`): content cross-fade + height change when a card collapses, expands or changes state.
- `prefers-reduced-motion: reduce` (Windows "Animation effects" off): no movement or scale; fades ≤ 83ms; the Thinking face and every other face mood hold a static pose (§F15.9.5; the chat header still says "typing…"); spinner becomes a static "◔" `[WIN MUST]`.

**How motion is built (binding) [FE-24].**
- All motion is CSS: `transition` and `@keyframes` using only the `--m-*`, `--ease-*` and `--delay-*` tokens. No animation library (no `motion`, `framer-motion`, `react-spring`, GSAP) and no Web Animations API calls. The only JavaScript timing is in the living face controller (§F15.9.9: blink randomisation, one-time mood queue) and the streaming word fade (04 §14.4), and both read durations from `src/shared/tokens.ts` (§F29.2), never literals.
- Mount and unmount transitions use one wrapper, `src/renderer/ui/Presence.tsx`: `<Presence show={boolean} exitMs={number}>` keeps the child mounted for `exitMs` after `show` turns false and sets `data-exit` on it during that time; CSS keys the exit animation on `[data-exit]`. `exitMs` is always a token value from `tokens.ts` (`motion.normal` = 167 unless the component's row in this table says otherwise).
- Reduced motion is applied in one place: `tokens.css` contains `@media (prefers-reduced-motion: reduce) { :root { … } }`, which sets every movement/scale keyframe to none and every fade duration to 83ms per the table in 02-3 §F25.4. Components never write their own `prefers-reduced-motion` rules.
- JavaScript that needs the flag (face controller, programmatic scroll behaviour, streaming fade) uses `useReducedMotion()` from `src/renderer/a11y/useReducedMotion.ts`. It starts from `window.foo.platform.reducedMotion` (08-1 §3.1, the value at launch) and then follows `matchMedia('(prefers-reduced-motion: reduce)')` `change` events, so turning Windows "Animation effects" on or off applies without a restart [FE-31]. **Animation level (X-150, replaces "no foo setting"):** Settings → Appearance → "Animations": "Full" / "Basic" / "Off" (`settings.appearance.animations: 'full' | 'basic' | 'off'`). Default "Full"; on first run main sets "Basic" when the PC has ≤ 4 logical CPUs or < 8 GB RAM (`os.cpus()`, `os.totalmem()`). Windows "Animation effects" off forces "Off" (the picker shows "Off · set by Windows", disabled). Applied as `<html data-motion="full|basic|off">`; `tokens.css` maps "Off" to the reduced-motion table (02-3 §F25.4), and "Basic" to fades only: no movement, scale, rotation, height animation or shimmer, every fade `--m-basic` 200ms `cubic-bezier(.4,0,.2,1)`, faces cross-fade between static poses. `useReducedMotion()` returns true for "basic" and "off".

### F7.1 Quiet premium: the 104 details [X-179, CR-0021]

Level "Quiet premium" (Vikas, 2026-10-20): overshoot ≤ 4 % scale or 2px, nothing bounces twice, no confetti, nothing playful on money cards, exits faster than entrances (`--ease-out` ≤ `--m-normal`), springs only through `--ease-spring` / `--ease-spring-soft`. Basic: every item is a `--m-basic` fade. Off and Windows "Animation effects" off: the §F25.4 table, nothing moves. The playable list is the plan's details gallery (`foo/polish/details-gallery.js`). An item whose surface is not built yet ships with that surface's milestone (CR-0021 picks 23–24).

- **Chat list (15):** row hover lifts 1px with a soft shadow; unread badge springs in; a new chat slides in at the top while others glide down; a working row's face ring turns and its preview shimmers once; Needs-you pill pulses once then rests; the filter highlight slides between tabs; a pinned chat drops in with a tiny bounce; the search box widens 8px on focus; results stagger 30ms; no results shows the face scanning; the row's "typing…" preview word breathes (no dots, X-36); the muted icon fades in; archive folds the row's height closed; dragging a pin lifts the row and tilts it 1°; the footer "ready" dot breathes when idle.
- **Chat (20):** chat switch slides 18px with the soft spring; a new message rises 8px with the spring; your bubble grows from the send button; ticks draw in when read; the date chip floats then fades after 1.5s; jump to message glows then fades; the "1 new message" line slides in from the left; streaming words fade in 150ms; code copy icon turns into ✓; a link preview fades up after the text; images blur up, never a blank box; the reaction picker springs from the bubble; a picked reaction bounces once; the reply strip slides up from the composer; scroll-to-bottom bounces in with a count; "Show more" grows smoothly; Thinking is the 26px face with drifting eyes; an error bubble shakes 2px once, no red flash; a retry spinner turns into ✓; the header status cross-fades.
- **Composer (15):** suggestion chips rise in 60ms apart; chips fade on the first keystroke; holding the mic floods the button dark; a live level ring circles the mic; send ↔ mic swap with a small rotation; send turns into ✓ on delivery and into Stop while foo works; the field grows in height smoothly; an attachment chip flies in from the drop point; the drop-zone border breathes while dragging; the mention menu springs up from the @; the placeholder says "Add details…" while working; a caught secret blurs and a lock slides in; a long paste folds into a chip; Esc shrinks the voice bar back into the mic; offline dims the field and the cloud icon nods once.
- **Cards (18):** checklist steps are named with their icon; the live step shimmers; a done step's ring turns into ✓ with a small overshoot; sources drop in as chips then fold into a pile; the Approve card springs up with a real shadow; money in `--weight-money` with even-width digits; the Approve button presses flat (lip); a declined card folds into a one-line summary; the picked choice tile grows and the others dim; plan steps reveal one by one; a stuck card's face scans; the Watch live red dot breathes; a collapsing card cross-fades and shrinks; a proof photo zooms open from its thumbnail; the undo bar slides up and its timer line drains; the end card says what was done, time saved and one next step; the first DONE of the day plays Celebrating (3 sparks, §F15.9.3 #11); a finished card tilts 1° on hover.
- **Pages and panels (15):** pages slide in from the right and back slides left; the details panel slides in and its sections stagger; a new memory fact glows once; Forget folds the row and Undo brings it back; the Settings selection pill slides; toggle knobs spring; the segmented highlight slides; spend meters fill from zero; a meter turns amber with a soft colour fade; skeletons shimmer; empty states show the face in a pose plus one action; tooltips fade in after 500ms and leave at once; dialogs blur and step the background back to 0.96; menus scale from the button that opened them; exits are always faster than entrances.
- **First run and Windows (21):** splash eyes open from a blink; Welcome's face says "Hi, I'm foo." in a bubble (M12); a striped progress pill for the 4 steps; AI rows test live (shimmer, then ✓ works); real app logos on white tiles; the name step's face reacts as you type (M12); the finish "See you tomorrow at 8" waves (M12); the tray icon shows the face's mood (M11); taskbar overlay badge for Needs you (M11); taskbar progress for long jobs (M11); toasts with the face and one button (M11); jump list New message, Needs you, Stop all (M11); window restore fades content up 4px; snap resize reflows without jumping; Focus mode: the face sleeps and toasts go quiet (M11); Windows "Animation effects" off: everything goes still; foo's Animations Full / Basic / Off respected; the face pauses when the window is in the background; an optional Sounds setting, off by default (§F22); theme switch cross-fades with no white flash; an accent colour change sweeps across the app.

## F8. Focus and interaction states

- Keyboard focus only (`:focus-visible`): **2px outer ring** `--focus-outer` (light `#0B0B10`, dark `#FFFFFF`) + **1px inner ring** `--focus-inner` (light `#FFFFFF`, dark `#0D0D11`), drawn 1px outside the element, following its radius `[exact: WIN §17 Fluent focus visual]`.
- Every interactive element has five states: rest, hover (`--bg-hover`), pressed (`--bg-pressed` + scale 0.97), focus (ring), disabled (`--fg-disabled`, no hover, `cursor: default`, `aria-disabled`).
- Cursor: arrow (`default`) on buttons and other controls, like Windows apps; `pointer` only on links and clickable pictures; text on text; full table in 02-3 §F27.1 [settled: X-51, Vikas chose "Arrow (Windows)"].

## F9. Accessibility (non-negotiable)

- Contrast AA everywhere (the table values above already pass).
- Windows text scaling 100–225%: layout in rem, rows grow, nothing clips. Test at 225% `[WIN MUST]`.
- High contrast (`forced-colors: active`): use system colours (Canvas, CanvasText, Highlight, ButtonText, LinkText); bubbles get a 1px border; status uses icon + word, never colour alone.
- Colour is never the only signal: every status has an icon and a word ("Needs you", "Working", "Done").
- Screen reader: every message is a list item with "{sender}, {time}: {text}"; cards are `role="group"` with a label naming the card; buttons say what they do ("Approve ₹14,600").
- Every function reachable by keyboard; shortcut list in 09-windows.

## F10. Writing (UI copy)

- Voice: warm, short, plain. Sentences under 20 words. Lowercase is fine in foo's chat messages; UI labels use sentence case.
- Banned words: see Article 2 (`01-articles.md`).
- Buttons say the action and the object: "Approve ₹14,600", "Book table", "Send email", never "OK" or "Submit". Cancel buttons say "Not now" (soft) or "Cancel" (stop something running).
- Times: always "Sat 12 Dec, 8:00 PM" (12-hour, with day) in the user's Windows region format; relative words only in addition ("tomorrow, Sat 12 Dec").
- Money: Indian format with symbol and grouping, "₹14,600", "₹1,23,450"; follows Windows region if not India.
- Where copy lives (binding) [X-59, F-011]: every user-visible string in the UI is a key in `src/shared/copy/en-IN.json`, looked up with `t(key, vars?)`; keys are `{area}.{component}.{slot}[.{state}]` per 08-0 §D; ICU MessageFormat via `intl-messageformat` 10.x; money is pre-formatted by `formatInr()` before it is passed as a variable. Chapters write the final string in "double quotes"; each chapter's copy-key register gives the key for each string (03-shell-2 §3.14, 04-messages-and-composer-2 §28, 02-foundations-3 §F32.3). A quoted string with no key in a register is a gap (log it in `GAPS.md`); never invent a key.
