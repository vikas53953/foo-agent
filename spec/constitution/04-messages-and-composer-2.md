# 04 · Messages and composer (part 2)

Continues `04-messages-and-composer.md` (§0–§19). Same authority, evidence tags and words (see that file's §0).

---

# Part C · Composer

## §20. Shape decision and frame

### 20.1 Decision: one WhatsApp pill, not a 2-row box

The composer **MUST** be a single row: a round "+" button, a pill text field, and one round morphing button (mic ↔ send ↔ stop), exactly as BP1 draws it. Everything else (attachment chips, reply strip, link preview) stacks **inside the pill above the text**, and banners and the pending-card strip stack **above the pill** inside the composer bar. The pill grows upward; the two round buttons stay pinned to the bottom row.

`[BP1 exact: .comp = .round(+) · .box(pill) · .round.mic]` `[MSG §8 WA floating pill with mic↔send swap]` `[foo decision: AIC recommends 2-row (rec #13); rejected because BP1 is approved and the 2-row box reads as an AI tool, not a messenger]`

### 20.2 Composer bar

Test id: `composer` (the bar). Component `Composer` (`src/renderer/composer/`, 02-3 §F32.4).

| Item | Value | Evidence |
|---|---|---|
| Position | Bottom of the main shell, full main-shell width; never scrolls with the list | 03-shell |
| Background | `--bg-app` | BP1 `.comp` |
| Top border | 1px `--line` | BP1 `.comp` border-top |
| Padding | 12px top, 12px bottom (`--s2`); content column = the message column (§1.1: max 760px, side padding 24px ≥ 900px / 16px below) | BP1 10px 16px → grid |
| Row | `display:flex; align-items:flex-end; gap: 8px` (`--s1`) | BP1 gap 9 → grid |
| Stack above the row | Up to two items, 8px apart, 8px above the row: (1) one banner (§23.2), (2) one strip: the pending-card strip (§23.4) **or** the paste-catcher panel (§22.4) **or** the composer notice (§22.7). Order top to bottom: banner, strip | `[foo decision]` |
| Icons in the stack | 16px in the composer notice (§22.7), the composer banners (§23.2) and the pending-card strip (§23.4), because each is a one-line `--t-small` strip; page and app banners (03 §3.3, 06 §0.6) use 20px. Intentional; do not align them [UX-28] | `[foo decision]` |
| Bottom-row slots | Each round button sits in a 46px-tall slot (`align-items:center` inside the slot), so it is centred on a one-line pill and stays on the last line when the pill grows | `[foo decision]` |

### 20.3 The pill (text field)

Test id: `composer-field`. Component `Pill`.

| Item | Value | Evidence |
|---|---|---|
| Element | `contenteditable` region (needed for mention chips), `role="textbox"`, `aria-multiline="true"`, `aria-label="Message {chat name}"` | HRM §8 contenteditable |
| Min height | 46px (text line 22 + 12px top + 12px bottom padding) | `[foo decision; MSG WA 46–52; BP1 ≈38 at 13.5px text, re-based on 15px body]` |
| Padding | 12px top/bottom (`--s2`), 16px left/right (`--s3`) | BP1 `.box` 9px 16px → grid |
| Text | `--t-body` 15/22, `--fg-1`; caret colour `--accent`; Hindi/Punjabi lines use `--t-body-indic` (§10.8) when the draft's script ratio says so | 02 F1 |
| Radius | `--r-composer` 24px (one-line pill is fully round; when it grows, corners stay 24px) | 02 F4 |
| Fill / border / shadow | `--bg-raised`, 1px `--line`, `--shadow-4` (dark: no shadow, border only) | 02 F4 "composer" |
| Hover | border `--line-strong` | 06 §0.4 text field |
| Focus (mouse or keyboard) | border `--line-strong`; keyboard focus (`:focus-visible` on the field) adds the F8 ring following the 24px radius | 02 F8; AIC §17 (big apps lack a ring; foo adds it) |
| Auto-grow | Text area grows line by line up to **6 lines** (132px of text → pill 156px), then scrolls inside with the thin overlay scrollbar; growth is instant (no animation) | `[exact: OCL composer-surface.css:367-372 six lines]`; MSG WA ≈6 lines |
| Max total pill height | min(6 text lines + inner stacks, 50% of the main shell height). When the cap is hit, the inner stacks (chips, preview, strip) keep their size and the text area shrinks to a minimum of 2 lines | `[foo decision]` |
| Spellcheck | On, using the Windows spell-check languages (Electron `session.setSpellCheckerLanguages` from Windows); suggestions in the right-click menu | `[foo decision]` |
| Rich paste | Always flattened to plain text (§22.5) | |
| Width | Flexible: bar content width − 36 − 36 − 16 = 624px at a 712px column | |

### 20.4 Placeholder (exact copy)

Placeholder: `--t-body` `--fg-3`, one line, ellipsis.

| Situation | Placeholder |
|---|---|
| foo's chat | "Message {agentName}, or hold {talkKey} to talk" `[BP1 exact]` |
| A helper's chat | "Message {Helper}, or hold {talkKey} to talk" |
| A group | "Message {group name}. Type @ to ask a helper" |
| Private chat | "Nothing here is remembered. What do you need?" (`composer.placeholder.private`; 12-2 §12.30, X-128) |
| WhatsApp mirror chat | "Draft a message for {group}" (`composer.placeholder.wa_mirror`; 04 §10.11, X-128) |
| Pill narrower than 360px (any chat) | "Message {chat name}" |
| One or more attachments, no text | "Add a message, or press Enter to send" `[OCL en.ts "Add a message or paste more images..."]` |
| foo still starting (first 2 s after launch) | "Starting {agentName}…" (typing allowed; sends wait) |
| Offline (03 banner type 1) | "You're offline. I'll send when you're back." |
| Your AI not answering or signed out (03 types 2–3) | "{AI} isn't answering. I'll send when it's back." |
| AI cap reached (03 type 4) | "AI cap reached. Messages wait until you raise it." |
| Plan limit (03 type 5) | "{AI}'s limit is reached. Messages wait." |
| Your AI not set up (first run, 06 §2) | "Connect your AI first" (field disabled) |

`{talkKey}` is "Ctrl+Space", or "Ctrl+Shift+Space" when a Chinese, Japanese or Korean keyboard layout is installed, or the key chosen in Settings → Chat and voice (09-windows). Every tooltip and hint in this chapter that names the talk key uses `{talkKey}`.

### 20.5 Inner stacks (inside the pill, above the text)

Order top to bottom, each separated by 8px; the text area always comes last:
1. Reply strip **or** edit strip (§21.6).
2. Attachment chips row (§21.4).
3. Link preview row (§21.5).

When any inner stack is present, the pill's top padding becomes 8px and the stacks span the pill's inner width (pill width − 32px).

---

## §21. Buttons, chips and strips in the composer

Components (all in `src/renderer/composer/`, names fixed by 02-3 §F32.4 [FE-33]): `Composer` (bar), `Pill` (field), `MorphButton` (§21.2), `AttachMenu` (§21.1), `AttachmentChips` (§21.4), `LinkPreviewRow` (§21.5), `ReplyStrip` and `EditStrip` (§21.6), `VoiceRecorder` (§22.1), `PasteCatcher` (§22.4), `ComposerNotice` (§22.7), `MentionMenu` (§22.8), `ComposerBanner` (§23.2), `PendingStrip` (§23.4), `DropOverlay` (§22.6).

### 21.1 "+" button

Test id: `composer-attach` (`aria-expanded`).

| Item | Value | Evidence |
|---|---|---|
| Size | 36×36px circle (`--btn-round`), hit area padded to 40×40 | 02 F5; BP1 `.round` 36px |
| Rest | transparent fill, 1px `--line` border, `Add` 20px `--fg-2` | BP1 `.round` border `--line`, colour muted |
| Hover / pressed | `--bg-hover`, icon `--fg-1` / `--bg-pressed`, scale 0.97 | 02 F8 |
| Open | while its menu is open: fill `--bg-pressed`, icon swaps to `Dismiss` 20px (swap, no rotation; 02 F7 lists no rotation) | OCL rotates +→×; motion not allowed here |
| Tooltip / Narrator | "Add photos, files and more" | |
| Disabled | §23.3 | |

**"+" menu** (shared menu shape, §9.1; width 240px; opens upward, left edge aligned with the button, 8px gap):

| Item (final copy) | Icon | Hint at right (`--t-caption` `--fg-3`) | Does | Test id |
|---|---|---|---|---|
| "Photos and files" | `Attach` | "Ctrl+U" | Windows file picker, multi-select, filter = allowed types (§22.6) | `composer-attach-menu-files` |
| "Take a screenshot" | `Screenshot` (new icon) | — | Opens Windows' own snipping overlay (`ms-screenclip:`). When an image lands on the clipboard within 60 s, it is added as an image chip. Nothing lands → nothing happens | `composer-attach-menu-screenshot` |
| "Password or key" | `Key` | — | Posts a Secret box card (C7, 05-cards) in this chat with an empty name field (the Your key variant, 05-2 §5.8.4, CR-0057). The value never touches the composer | `composer-attach-menu-secret` |
| "Emoji" | `Emoji` (new icon) | "Win+." | Focuses the field and opens the Windows emoji panel (`app.showEmojiPanel()`) | `composer-attach-menu-emoji` |

`[foo decision: no "Create image", "Deep research" or mode items (AIC CG4) — non-technical users never choose modes]`

### 21.2 The morphing round button

One 36×36px circle (`--btn-round`; hit area 40×40) at the right of the pill, component `MorphButton`, test id `composer-send` with `data-state` = `RoundButtonState`. The mic, send and stop are this one button (there is no `composer-mic`). It always shows exactly one of these states:

| State | Condition (checked in this order) | Fill | Icon (20px) | Tooltip / Narrator | Click / Enter | Test id |
|---|---|---|---|---|---|---|
| Disabled | composer disabled (§23.3) | `--bg-sunken` | per state, `--fg-disabled` | "Connect your AI first" | nothing | `composer-send` `data-state="disabled"` |
| Save edit | edit mode (§6.2) | `--accent` | `Checkmark` `--on-accent` | "Save edit (Enter)" | saves the edit | `composer-send` `data-state="save_edit"` |
| Send voice note | recording, locked mode (§22.1) | `--accent` | `Send` `--on-accent` | "Send voice note (Enter)" | stops and sends | `composer-send` `data-state="send_voice"` |
| Recording (hold) | recording, hold mode | `--bad` | `Mic` `--on-bad` (06 token) | "Recording. Let go to send" | — | `composer-send` `data-state="recording"` |
| Send | field has any non-space text **or** ≥ 1 attachment chip | `--accent` | `Send` `--on-accent` | "Send (Enter)" | sends | `composer-send` `data-state="send"` |
| Stop | field empty **and** foo is showing a status line, typing bubble or streaming bubble for a reply in this chat | `--fg-1` | `Stop` `--bg-app` | "Stop (Esc)" | stops that reply (§14.4). It never stops a job: jobs stop from the checklist card's "Stop" or by typing "stop" (Article 18, C2) | `composer-send` `data-state="stop"` |
| Mic | otherwise | `--fg-1` | `Mic` `--bg-app` | "Hold to record a voice note ({talkKey})" | §22.1 | `composer-send` `data-state="mic"` |

- Hover: `--accent` fills → `--accent-hover`; `--fg-1` fills → `--fg-2`. Pressed: `--accent-pressed` / `--fg-2`, scale 0.97 for 83ms (02 F7).
- Change between states: fill colour `--m-fast`, icon cross-fade `--m-normal`; reduced motion: instant.
- `[BP1 exact: .round.mic background var(--fg)]` `[AIC rec #17 / CG1: one morphing button; Stop takes the send slot (OCL composer-surface.css:796-804)]` `[F2: send uses --accent]`

### 21.3 Sending

- On Send: the bubble appears at once with ✓ (§3.3); the field, chips, preview and reply strip clear; the draft is deleted; focus stays in the field; the list jumps to the end (§1.6).
- Text is trimmed of leading/trailing blank lines (inner blank lines kept). A message of only spaces never sends.
- Sending while foo streams or a job runs is allowed (Article 18).

### 21.4 Attachment chips (inside the pill)

| Item | Value | Evidence | Test id |
|---|---|---|---|
| Row | Horizontal row, 8px gaps, horizontal scroll when wider than the pill, with a 24px fade (`--bg-raised` to transparent) at the scrolling edge | `[exact: OCL composer.css:1437-1510 rail + edge fade]` | — (each chip is `composer-chip`) |
| Image chip | 72×72px tile, `--r-md`, `object-fit: cover`, 1px `--line` | AIC rec #21 | `composer-chip` `data-state="image"` (`data-index`) |
| File chip | height 56px, width 240px, `--r-md`, fill `--bg-sunken`, padding 8px 12px; 40×40px icon tile (`--r-sm`, `--bg-raised`, `Document` 20px `--fg-2`) + 12px + name `--t-body-strong` `--fg-1` (middle ellipsis) over "{TYPE} · {size}" `--t-caption` `--fg-2` | AGT A13 | `composer-chip` `data-state="file"` (`data-index`) |
| Pasted text chip | File chip with name "Pasted text" and second line "{n} characters" (§22.5) | OCL big paste | `composer-chip` `data-state="pasted"` (`data-index`) |
| Remove button | 24×24px circle on the chip's top-right corner (offset −6px, −6px), fill `--fg-1`, `Dismiss` 16px `--bg-app`; hit area 40×40; tooltip "Remove {file name}" | AIC CG3 ✕ on the corner | `composer-chip-remove` (`data-index`) |
| Preparing | While the file is being copied into foo's data folder: `--scrim` over the tile/icon with the F7 spinner ring 20px. Send is allowed; the message waits (✓ shows after the copies finish) | OCL upload spinner | — |
| Failed | Chip border 1px `--bad`, `ErrorCircle` 16px `--bad` over the icon, tooltip with the reason (§22.6 copy); Send is blocked until it is removed | `[foo decision]` | — |
| Keyboard | Chips are one Tab stop (←/→ between chips, Delete or Backspace removes the focused chip, Enter opens a preview in the attachment viewer 06 §13) | 06 §0.7 | — |
| Narrator | "Photo, {name}" / "File, {name}, {type}, {size}"; remove button "Remove {name}" | | — |

### 21.5 Link preview row (inside the pill)

Test ids: `composer-preview`, its remove button `composer-preview-remove`.

- Appears when the text contains a URL and the preview fetch succeeds; only the **first** URL; it updates when that URL changes.
- Fetch rules: done by foo's main process, no cookies, 3 s timeout, `http`/`https` only, only public hosts (never `localhost`, `127.*`, `10.*`, `172.16–31.*`, `192.168.*`, `*.local`, or a bare IP). Reads `og:title`, `og:description`, `og:image`, else `<title>`. Fetch failure → no row, no message. `[foo decision: privacy and safety]`
- Row: height 56px, `--r-md`, fill `--bg-sunken`, padding 8px 12px: 40×40px image (`--r-sm`, omitted if none) + 12px + title `--t-caption-strong` (no uppercase) `--fg-1` 1 line over domain `--t-caption` `--fg-3`; remove button 24×24 (`Dismiss` 16px `--fg-2`, hover `--bg-hover`, hit area 40) at the right. Removing it keeps the URL text and sends no preview.
- While fetching: nothing shows (no skeleton, to avoid jumps for failed fetches).

### 21.6 Reply strip and edit strip (inside the pill)

| Item | Reply strip | Edit strip |
|---|---|---|
| Trigger | menu "Reply", Ctrl+Shift+R, or "Something else…" on a Choice card (C3) with its question as the quote | ↑ in an empty field, or menu "Edit" (§6.2) |
| Shape | height 52px, `--r-sm`, fill `--bg-sunken`, padding 8px 12px 8px 16px, 4px left bar in the quoted sender's colour (foo `--fg-1`, helper `--h-*`, user `--accent`) | height 36px, no fill, padding 0 4px |
| Content | sender name `--t-caption-strong` (no uppercase) in the bar colour (dark theme: `--fg-1` for helpers, §12.4) over 1-line text `--t-small` `--fg-2`; image quotes add a 40×40 thumbnail at the right | `Edit` 16px `--fg-2` + 8px + "Editing your message" `--t-caption-strong` (no uppercase) `--fg-2` |
| Close | `Dismiss` 16px button at the right (24px visual, 40px hit), tooltip "Cancel reply (Esc)" | tooltip "Cancel edit (Esc)" — cancel restores the field to its previous draft |
| Evidence | `[MSG §8 WA reply strip with 4px bar and ✕]` | `[MSG Signal ↑ edits the last message]` |
| Test id | `composer-reply`; close `composer-reply-close` | `composer-edit`; close `composer-edit-close` |

---

### 21.7 Suggestion chips [X-179, CR-0021 pick 10]

One row of `Chip`s (06 §0.4) above the pill, `role="group"` named "Suggestions" (`composer.suggest.label`), test id `composer-suggestions`, each chip `composer-suggestion-chip`.

| Rule | Value |
|---|---|
| Starters | An empty chat (no messages yet) shows 3: foo's chat "Plan my day", "What needs me?", "Pay a bill"; a helper's chat "What can you do?", "Show what you're working on", "Help me with something" (`composer.suggest.starter.{foo,helper}.{1,2,3}`). |
| Follow-ups | Up to 3, only from the latest foo or helper reply's own `suggestions` (the AI ends its reply with `Suggestions: a \| b \| c`; the engine strips that line from the bubble, keeps ≤ 3 of ≤ 40 characters that pass Article 2's word filter, and stores them in `messages.suggestions`). The app never invents one. |
| Look (CR-0024 F8) | Each chip: 32px tall, a 16px Fluent icon `--s1` (8px) before the words, words `--t-small` `--fg-1`, 1px `--line-strong` outline on `--bg-app`, hover `--bg-hover`. The icon comes from a fixed word map, first match wins: mail/email/inbox → `Mail`; calendar/day/meeting → `CalendarLtr`; price/pay/bill/₹ → `Money`; compare/find/search/look → `Search`; remind/later/tomorrow → `Clock`; WhatsApp/group/family → `People`; else `Edit`. Every icon is in the 02 F6 list. |
| Click | Fills the field with the chip's text and focuses it. **Never sends.** |
| Hidden | on the first keystroke; while recording; in groups, WhatsApp mirrors and private chats; when the latest reply holds an Approval, Payment, Draft or Secret card or its job touched money. |
| Motion | chips rise in 60ms apart with `--ease-spring`; fade on the first keystroke (§F7.1). |
| Action chips [X-180, CR-0022] | Beside the reply chips, after the same reply: at most 3 action chips (`bubble-action-chips`, each `bubble-action-chip`), each a Fluent icon + label in `--accent` (Call, Open map, Add to calendar, Open link). Stored as JSON `ActionChip[]` (`{ kind: 'call' | 'map' | 'calendar' | 'link'; label; value }`) in the reply's `messages.actions` (08-1 §4.2 item 6). Call, Open map and Open link first show C-26 (a call reads "This calls {number}. Call?" with the button "Call", `bubble.actions.call_confirm`). An action chip that acts for the user goes through the normal gates (Article 6). Never shown after an Approval or Payment card. |

## §22. Input methods and guards

### 22.1 Voice notes (recording UI)

**Start**

| Way | Rule |
|---|---|
| Hold the mic button | Pointer down on the Mic state, held ≥ 150ms → **hold mode** starts. Release ends it. `[exact: OCL composer-dictation.ts:7-8 arm after 150ms]` |
| Click the mic button | Pointer down and up in < 150ms → **locked mode** (recording continues hands-free until Send or cancel). |
| Hold `{talkKey}` | While foo's window is focused (field focused or not): `{talkKey}` (Ctrl+Space by default; Ctrl+Shift+Space when a Chinese/Japanese/Korean keyboard is installed, 09-windows) held ≥ 150ms → hold mode; releasing Space or Ctrl ends it. A tap < 150ms does nothing and the key event passes through. `[BP1 placeholder; J7 step 1; 09-windows talk key]` |
| Keyboard on the focused mic button | Space or Enter → locked mode |

**Recording bar** (replaces the "+" button and the pill; the round button stays; component `VoiceRecorder`, test id `composer-recording`):

```
[ ✕ ]  ( ●  0:03   ▁▃▅▇▅▃▁▂▄▆▅▃   Release to send · slide left to cancel )  [ ● ]
 36       pill 46px tall, same fill/border/radius as §20.3                  36
```

| Part | Value | Test id |
|---|---|---|
| Cancel button | 36px circle in the "+" slot, transparent fill, 1px `--line`, `Dismiss` 20px `--bad`; tooltip "Cancel (Esc)" | `composer-recording-cancel` |
| Dot | 8px circle `--bad`, static (02 F7 lists no pulse) | — |
| Timer | "0:03" `--t-body` `--fg-1` tabular-nums, 12px after the dot. From 4:30 the timer turns `--warn`. At 5:00 recording stops and the note is **sent** automatically; the bar shows "5:00 max" for that moment (J7) | `composer-recording-timer` |
| Live level | Bars 2px wide, 2px gaps, height 4–24px from the microphone level sampled every 100ms, newest at the right, older bars shifting left, `--fg-2` (motion rule request, §26) | — |
| Hint (right-aligned, `--t-small` `--fg-3`) | Mouse hold: "Release to send · slide left to cancel" · Keyboard hold: "Release to send · Esc to cancel" (J7) · Locked: "Press Enter to send · Esc to cancel" | — |
| Slide to cancel (mouse hold) | Pointer moved ≥ 120px left of where it went down → hint becomes "Let go to cancel" in `--bad` and the dot turns `--fg-3`; releasing there cancels; moving back right restores | — |
| Round button | Hold mode: Recording state (`--bad`, §21.2). Locked mode: Send voice note state | `composer-send` (`recording` / `send_voice`) |
| Esc | Cancels in both modes | — |
| Too short | Shorter than 0.5 s: discarded, no bubble; the mic shows tooltip "Hold to record" for 2 s (J7) | — |
| Cancel result | Nothing saved, nothing sent; Narrator "Voice note cancelled" | — |
| Send result | A voice-note bubble (§10.3) with ✓; transcription starts (J7 step 3) | — |
| File | Ogg Opus, 48 kHz mono, stored per J7 (`data\voice\`) `[exact: OCL whatsapp.md:434-444 PTT Ogg/Opus]` | — |
| Typing while recording | Disabled (keys other than Esc, Enter, Space-release are ignored) | — |
| Narrator | On start: "Recording voice note." On send: "Voice note sent, {length}." | — |
| Reduced motion | Live level bars still update (they show sound, not decoration) | — |

**Microphone problems** (shown as a banner above the composer, §23.2, tone Warn; recording does not start; `data-state` values are `ComposerBannerType`):

| Case | Copy | Button | Test id |
|---|---|---|---|
| Windows blocks the mic for foo | "I can't hear you. Windows is blocking the microphone for foo." | "Open microphone settings" (`ms-settings:privacy-microphone`) | `composer-banner` `data-state="mic_blocked"` |
| No microphone | "I can't find a microphone. Plug one in and try again." | "Try again" | `composer-banner` `data-state="no_mic"` |
| Mic in use by another app and it fails to open | "Another app is using the microphone. Close it and try again." | "Try again" | `composer-banner` `data-state="mic_busy"` |

### 22.2 Dictation (speech to text into the field)

foo builds no dictation of its own. Windows voice typing (**Win+H**) works in the field because it is a standard editable region; the Keyboard shortcuts sheet (06 §19) lists it as "Type with your voice (Windows)". The mic button always records a voice note. `[foo decision: one meaning per button; Windows already ships dictation]`

### 22.3 Emoji

foo builds no emoji picker for the composer. Win+. or "+" → "Emoji" opens the Windows emoji panel, which types into the field. `:shortcode:` text is not converted. `[foo decision; F6 "emoji are content"]`

### 22.4 Paste catcher (secrets; C8, Article 8)

**When it runs:** (1) on every paste into the field, before the text is inserted; (2) on every Send, over the whole text; (3) on a typed draft, 800ms after typing stops. Text is checked after Unicode NFKC normalisation with zero-width characters removed. It also runs on "Pasted text" chips (§22.5) and on the transcript of a voice note before it goes to your AI.

**Patterns** (JavaScript regex, `u` flag; case-sensitive unless `(?i)` noted, implemented with the `i` flag):

| # | Catches | Pattern | Extra check |
|---|---|---|---|
| P1 | OpenAI / Anthropic / generic `sk-` keys | `\bsk-(?:proj-\|ant-\|svcacct-\|admin-)?[A-Za-z0-9_-]{20,}` | — |
| P2 | Google API key | `\bAIza[0-9A-Za-z_-]{35}\b` | — |
| P3 | Google sign-in token | `\bya29\.[0-9A-Za-z_-]{20,}` | — |
| P4 | GitHub token | `\b(?:gh[pousr]_[A-Za-z0-9]{36,}\|github_pat_[A-Za-z0-9_]{22,})\b` | — |
| P5 | Slack token | `\bxox[abprs]-[A-Za-z0-9-]{10,}` | — |
| P6 | Stripe key | `\b(?:sk\|rk\|pk)_(?:live\|test)_[A-Za-z0-9]{16,}\b` | `pk_` only when ≥ 24 chars (publishable keys are not secret, but users cannot tell) |
| P7 | AWS access key | `\b(?:AKIA\|ASIA)[0-9A-Z]{16}\b` | — |
| P8 | Other AI keys | `\b(?:hf_[A-Za-z0-9]{30,}\|gsk_[A-Za-z0-9]{40,}\|xai-[A-Za-z0-9]{40,}\|AIzaSy[0-9A-Za-z_-]{33})\b` | — |
| P9 | Sign-in token (JWT) | `\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}` | — |
| P10 | Private key block | `-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----` | — |
| P11 | Labelled password | `(?i)\b(?:password\|passwd\|pwd\|passcode\|pass)\s*(?:is\|:\|=\|-)\s*\S{4,}` and `(?:पासवर्ड\|ਪਾਸਵਰਡ)\s*(?:है\|:\|=\|-)?\s*\S{4,}` | — |
| P12 | Card number | `(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)` | 13–19 digits after removing spaces/dashes, first digit 2–6, **passes Luhn** |
| P13 | Card security code | `(?i)\b(?:cvv2?\|cvc2?\|security code)\b\D{0,6}\d{3,4}\b` | — |
| P14 | UPI / ATM PIN | `(?i)\b(?:upi\s*pin\|mpin\|atm\s*pin\|pin)\b\D{0,6}\d{4,6}\b` | — |
| P15 | OTP with a label | `(?i)\b(?:otp\|one[ -]time (?:password\|code)\|verification code\|login code)\b\D{0,12}\d{4,8}\b` | — |
| P16 | OTP by context | the whole message is `^\s*\d{4,8}\s*$` (spaces allowed between digit groups) | foo, a helper or a card in this chat asked for a code in the last 10 minutes |
| P17 | High-entropy string | `(?<![A-Za-z0-9+/_=.-])[A-Za-z0-9+/_=-]{32,}(?![A-Za-z0-9+/_=-])` | Shannon entropy ≥ 4.0 bits per character; has ≥ 1 digit and ≥ 1 letter; not inside a URL; not a WhatsApp/UPI transaction reference already shown by foo in this chat |

Not caught (by design): Aadhaar, PAN, phone numbers, addresses (Article 14 handles their sharing; they are not secrets in Article 8's list).

**Panel** (docked above the pill in the strip slot, §20.2; it replaces the pending-card strip while open). Component `PasteCatcher`, the only implementation; 05-2 §5.9 points here for masking, triggers and panel copy [FE-12, UX-14, 08-0 §H]. The catch is a `PasteCatch` `{ start; end; kind; mask: '••••' }` (08-0 §B):

| Part | Value | Test id |
|---|---|---|
| Shape | `--bg-raised`, 1px `--warn` border, `--r-lg`, padding 12px 14px (card padding, 02 F3), `--shadow-16` (08-0 §H: a card-class surface) | `composer-paste` |
| Title | `Warning` 16px `--warn` + 8px + "That looks like a password or key" `--t-body-strong` `--fg-1` `[C8 exact; BP1 card]` | — |
| Body | "You were about to send it as a normal message. Save it in the secret box instead?" `--t-small` `--fg-2` (8px below the title) | — |
| Buttons (12px below, 8px gap) | "Move to secret box" (Primary, `--btn-h` 40) · "Send anyway" (Secondary, `--btn-h` 40) (02 F5: a Primary is never 32) | — |
| While open | The matched span in the field is masked as exactly "••••" (atomic, not editable; never any real character of the secret, whatever its length); Enter does not send; the round button is disabled with tooltip "Choose an option above first" | — |
| Move to secret box | The matched span is removed from the field; a Secret box card (C7) is posted in this chat with the value already in its masked field and a suggested name ("OpenAI key" for P1 `sk-`, "Google key" for P2, "Card number" for P12, "Password" for P11, "One-time code" for P15/P16, "Key" otherwise); the rest of the text stays in the field. Focus moves to the card's name field | `composer-paste-move` |
| Send anyway | Sends. The bubble and the chat store show the span as "•••• (hidden)"; your AI receives "[the user typed a secret; it was hidden]" (C8). The real value is not kept anywhere | `composer-paste-send` |
| Esc | Dismisses the catch: the panel closes, **the span stays masked** "••••" (it is never unmasked), nothing is sent, and the round button is enabled again. Backspace deletes the masked span as one unit. The next Send runs the check again, so the panel reopens until the user picks "Move to secret box" or "Send anyway" or deletes the span (08-0 §H) [F-131] | — |
| Draft | A draft with an unresolved match is not written to disk (§23.5) | — |
| Narrator | `role="alertdialog"`, name = the title; focus moves to "Move to secret box"; on Esc focus returns to the field | — |

### 22.5 Paste rules

| Pasted thing | Result | Evidence |
|---|---|---|
| Plain or rich text ≤ 2,000 characters and ≤ 40 lines | Inserted as plain text (formatting, images inside HTML and links' targets dropped; link text kept) | `[foo decision]` |
| Text 2,001–10,000 characters **or** > 40 lines | Not inserted; becomes a "Pasted text · {n} characters" chip (§21.4). Your AI gets the full text. Click the chip → attachment viewer shows it read-only | `[OCL chat-attachments.ts:17,175 over 1,000 chars → attachment]` `[foo decision: 2,000 so a pasted email body stays text]` |
| Text > 10,000 characters [X-180, CR-0022 pick 7] | Saved as `pasted-{time}.txt` in the chat's files and shown as a 04 §10.2 file chip; counts under the §22.6 limits | `[CR-0022: ChatGPT's 10,000-character threshold, docs]` |
| An image on the clipboard | Image chip | AIC paste image |
| Files copied in File Explorer | File chips (limits §22.6) | |
| A URL alone | Inserted as text; preview row per §21.5 | |
| Anything matching §22.4 | Paste catcher first, over the whole pasted text in every band; insertion waits for the choice | C8 |

### 22.6 Attachment limits and drag-drop

**Limits** (J7 values):

| Limit | Value | Copy when broken (composer notice, §22.7) |
|---|---|---|
| Files per message | 6 | "I can take up to 6 files at a time. I added the first 6." |
| Size per file | 25 MB | "{file name} is over 25 MB. Send a smaller copy." |
| Images | jpg, jpeg, png, webp, gif, bmp, heic, heif. Sent to your AI resized to 2,048px on the long edge; the original stays in the chat | — |
| Documents | pdf, doc, docx, xls, xlsx, csv, ppt, pptx, odt, ods, txt, md, rtf | — |
| PDFs, photos and scanned pages | PDFs are read page by page and never sent as PDF; images and scanned pages go through the photo check (08-0 §G.18; X-98, X-109). At most the first 10 pages of a PDF are read | over 10 pages: "I read the first 10 pages." (`thread.papers.first_pages`) |
| Audio / video | m4a, mp3, wav, ogg, opus / mp4, mov | — |
| Blocked: programs | exe, msi, bat, cmd, com, ps1, vbs, js, jse, wsf, scr, lnk, dll, sys, reg, hta, cpl, jar, appx, msix | "{agentName} doesn't open programs. Send a photo or document instead." |
| Blocked: zipped folders | zip, rar, 7z, tar, gz | "I can't open zipped folders. Unzip it and send the files inside." |
| Unreadable file | any | "I couldn't read {file name}. Try saving it again." |

**Drag-drop overlay** (component `DropOverlay`, test id `thread-drop`)

| Item | Value |
|---|---|
| Trigger | Files dragged over foo's window while a chat is open (`dataTransfer.types` contains `Files`) `[exact: OCL chat-attachments.ts:19-21]` |
| Area | Covers the main shell below the chat header (list + composer), inset 16px (`--s3`) |
| Shape | 1.5px dashed `--accent` border, `--r-lg`, fill `--accent-soft`, fade in/out `--m-normal` |
| Content (centred) | `Attach` 24px `--accent`; 8px; "Drop to add to your message" `--t-title` `--accent`; 4px; "Photos and files, up to 25 MB each" `--t-small` `--fg-2` |
| Some files not allowed | Subline becomes "Some of these can't be added. I'll add the rest." |
| No file allowed | Border `--bad`, fill `--bad-soft`, title "{agentName} can't take these files" `--bad`, subline is the matching copy from the limits table |
| Drop | Allowed files become chips in the pill, focus moves to the field; blocked files produce one composer notice |
| Not shown when | A dialog, page or overlay is open; recording; composer disabled (then the overlay shows "Connect your AI first" in the Bad style and drops nothing) |
| Left shell | No drop target |

### 22.7 Composer notice

A one-line message in the strip slot (§20.2) for short-lived problems: `ErrorCircle` 16px `--bad` (or `Info` 16px `--accent` for info) + 8px + text `--t-small` `--fg-1`; no fill; height 24px; disappears after 8 s or on the next input. The 16px icon is intentional: the notice is a one-line strip of `--t-small` (§20.2) `[foo decision]` [UX-28]. Narrator: `announce(text)` (polite, 02-3 §F25.2). Used by §22.6 and §23.6, and for the Windows accent fallback notice, whose trigger and copy are owned by 09 §9.12. Component `ComposerNotice`, test id `composer-notice`.

### 22.8 @ mention menu (no slash menu)

- **Decision:** `@helper` mentions **on**; `/` slash menus **off** (a `/` is just a character). `[foo decision: Article 2 bans "command"; AGT A14 @mention picker in groups; HRM/OCL slash menus are developer tools]`
- Where: foo's chat and group chats. Not in a helper's own 1:1 chat (Article 1: helpers do not call each other there).
- Trigger: "@" typed at the start of the field or after a space or newline.
- Popover: above the field, left edge at the caret's x (kept inside the window), width 280px, `--bg-raised`, `--r-md`, `--shadow-16`, padding 4px; rows 40px, padding 0 8px, `--r-sm`: 26px avatar + 8px + name `--t-body-strong` `--fg-1` + 8px + job `--t-small` `--fg-2` (e.g. "plans trips"). Max 6 rows visible, then the list scrolls. Selected row `--bg-hover`.
- Filter: case-insensitive match on the start of the name, then anywhere in the name; no match → the popover shows one line "No helper called "{text}"." `--t-small` `--fg-2` (02 §F16.3 E-28) [X-33].
- Keys: ↑/↓ move, Enter or Tab inserts, Esc closes (keeps the "@"), Space with no match closes.
- Inserted token: "@{Helper}" as one atomic chip in the text, `--t-body-strong`, colour = the helper's `--h-*` (dark theme `--fg-1`); Backspace deletes the whole token.
- Meaning: in a group, the message is addressed to that helper, who answers in the group. In foo's chat, foo hands the task to that helper and a handoff marker appears (§19.3).
- No helpers yet: one row "You have no helpers yet" `--t-small` `--fg-2` + Link button "Make a helper" (opens 06 §3).
- Narrator: `role="listbox"` with `aria-activedescendant`; the field has `aria-expanded="true"` while open.
- Test ids: `composer-mention`, rows `composer-mention-row` (`data-index`), "Make a helper" `composer-mention-make`.

### 22.9 Keyboard in the composer

| Keys | Action | Evidence |
|---|---|---|
| Enter | Send (or Save edit, or Send voice note in locked mode). **Not** while an IME composition is active (`event.isComposing` or keyCode 229) and **not** on key-repeat (`event.repeat`) | `[exact: AIC Vercel prompt-input.tsx:855-859; OCL chat-composer-keydown.ts]` |
| Shift+Enter | New line | MSG; AIC |
| Ctrl+Enter | Send (same as Enter; for users used to it) | AGT Grok desktop |
| ↑ in an empty field | Edit last message (§6.2); otherwise moves the caret | MSG Signal |
| Esc | First applicable, in order: close menu/popover → dismiss the paste catch (§22.4; the span stays masked) → cancel recording → cancel edit or reply strip → stop the streaming reply (§14.4). Esc never clears typed text and never stops a job | 06 §0.7 layering |
| Backspace in an empty field with chips | First press focuses the last chip (ring); second press removes it | `[foo decision; AIC Vercel removes on first press — too easy to lose a file]` |
| Ctrl+U | "Photos and files" picker | MSG Signal Ctrl+U |
| `{talkKey}` (hold ≥ 150ms) | Record a voice note (§22.1) | BP1; 09-windows |
| Ctrl+B / Ctrl+I / Ctrl+Shift+X | Wrap the selection in `*…*` / `_…_` / `~…~` (WhatsApp markers, §10.10) | MSG Signal/WA |
| Win+. | Windows emoji panel | Windows |
| Win+H | Windows voice typing | Windows |
| Tab | Moves focus to the next control (round button); never inserts a tab character (except accepting a mention) | `[foo decision]` |
| Typing a printable key while the message list has focus | Focus jumps to the field and the character is typed | MSG WA behaviour |
| Shift+Esc (anywhere in the window) | Focus the composer | AIC ChatGPT; 09 wins on a clash |

All composer shortcuts are listed in 09-windows and the Keyboard shortcuts sheet (06 §19); 09 wins on a clash.

---

## §23. Composer states, banners, pending strip, drafts, limits

### 23.1 State table

| State | Pill | "+" | Round button | Above the pill |
|---|---|---|---|---|
| Rest | §20.3 rest, placeholder per §20.4 | rest | Mic | — |
| Hover | border `--line-strong` | — | — | — |
| Focused | border `--line-strong` (+ ring if keyboard) | — | — | — |
| Has text | grows to 6 lines | rest | Send | — |
| Has attachments | chips row inside | rest | Send | — |
| Replying / editing | strip inside | rest | Send / Save edit | — |
| foo replying, field empty | rest | rest | Stop | — |
| foo replying, field has text | rest | rest | Send (sending folds in, Article 18) | — |
| Recording | recording bar (§22.1) | becomes Cancel | Recording / Send voice note | — |
| Secret caught | span masked | rest | Disabled | paste-catcher panel |
| Card waiting, scrolled away | rest | rest | per text | pending-card strip (§23.4) |
| Offline | enabled; placeholder per §20.4 | rest | per text | nothing (03-shell §3.3 banner only; Article 29) |
| foo starting | enabled; placeholder "Starting {agentName}…" | rest | per text | — |
| Your AI not answering / signed out / plan limit | enabled; placeholder per §20.4 | rest | per text | nothing (03-shell §3.3 banner only) |
| AI cap reached | enabled; placeholder per §20.4 | rest | per text | nothing (03-shell §3.3 banner only) |
| Helper paused | enabled | rest | per text | banner |
| Your AI not set up | **disabled**, placeholder "Connect your AI first" | disabled | Disabled | nothing (first run, 06 §2, leads the user) |

Messages sent while offline, while the AI is not answering or signed out, while the AI cap or plan limit is reached, or to a paused helper are saved and show the Clock tick (§3.3); they go out automatically, in order, when the cause clears.

### 23.2 Banners above the composer (chat-specific only)

App-wide states (offline, your AI not answering, signed out, AI cap, plan limit, update) are shown **only** in 03-shell's banner strip under the title bar (03 §3.3). The composer **MUST NOT** add its own bar for them; it only changes its placeholder (§20.4). `[03-shell §3.3.2.2; Article 29]`

The composer's banner slot holds only these chat-specific banners (06 §0.6 shape: `--banner-h` 40px, padding 0 12px, icon 16 + 8px + `--t-small` one line + one `--btn-h-sm` 32 Secondary button), one at a time, in this priority:

| Priority | Situation | Tone | Copy | Button (one, Article 2) | Test id |
|---|---|---|---|---|---|
| 1 | Microphone problem (§22.1) | Warn | per §22.1 | per §22.1 | `composer-banner` `data-state` = `mic_blocked` \| `no_mic` \| `mic_busy`; button `composer-banner-action`, Dismiss `composer-banner-dismiss` |
| 2 | This helper is paused | Info | "{Helper} is paused. Messages wait until you turn it back on." | "Turn on" | `composer-banner` `data-state="helper_paused"`; button `composer-banner-action` |

- Banner 1 has a `Dismiss` button (24px visual, 40px hit) and closes after the next successful recording start; banner 2 stays until the helper is turned on.
- Narrator: `announce(text)` once when shown (polite, 02-3 §F25.2).

### 23.2a Error notices (X-149)

Chat-specific errors (a message not sent, a job that failed, a voice note that could not be made, an attachment refused) also post a notice in a stack above the composer row, above the banner slot (§20.2). Each notice: min-height 40, `--r-md`, fill `--bad-soft`, `ErrorCircle` 16 `--bad`, `--t-small` `--fg-1` one line (the same sentence as the in-chat error), Link button "Copy code" (copies `{ErrorKind}-{6-char id}`, 08-0 errors.ts; shows "Copied" 2 s), Dismiss 16 (40 hit). Newest on top; max 3 shown, then "+{n} more" Link that expands. With 2+ notices a Link "Clear all" sits at the right of the top notice. Dismissing or clearing removes the notice only: it never undoes, retries or deletes anything. Notices also clear when the user leaves the chat for 24 h. App-wide states stay in the banner strip (03 §3.3). Test ids `composer-error` (`data-row-id`), `composer-error-copy`, `composer-error-dismiss`, `composer-errors-clear`. Narrator: assertive once on arrival.

### 23.3 Disabled look

Pill fill `--bg-sunken`, border `--line`, placeholder `--fg-disabled`, not focusable; "+" and the round button: fill `--bg-sunken`, icon `--fg-disabled`, `aria-disabled="true"`, `cursor: default`, tooltip "Connect your AI first". (02 F8; 06 §0.4 disabled)

### 23.4 Pending-card strip (a waiting card is scrolled out of view)

Test ids: `composer-pending`, its Show button `composer-pending-show`.

| Item | Value |
|---|---|
| Shows when | This chat has ≥ 1 card waiting for the user — Approval (C4), Payment (C5), Choice (C3), Secret box (C7) or Sign-in (C9) — **and** less than 50% of the oldest such card is visible in the list viewport (IntersectionObserver, threshold 0.5) |
| Hides when | That card is ≥ 50% visible, answered, expired or cancelled; or the paste-catcher panel opens (it takes the slot) |
| Shape | height 40px (`--banner-h`), `--bg-raised`, 1.5px `--accent` border (02 F4 pending approval edge), `--r-md`, padding 0 12px, `--shadow-4` |
| Left | Approval/Payment: `LockClosed` 16px `--accent`; other cards: `Clock` 16px `--warn`; 8px gap |
| Text (`--t-small` `--fg-1`, one line, ellipsis) | Approval: "Waiting for your OK: {card verb phrase}" (e.g. "Waiting for your OK: Send this email to your landlord?") · Payment: "Waiting for your OK: ₹{total} to {payee}" · Choice/Secret/Sign-in: "Waiting for your answer: {card question}" · 2+ cards: "{n} things are waiting for you" |
| Right | When the soonest expiry is < 10 minutes: "{m}:{ss} left" `--t-caption` `--warn` tabular-nums; then Secondary button `--btn-h-sm` 32 "Show" |
| Show / click anywhere on the strip | Smooth-scrolls (`--m-slow`; reduced motion: instant) the oldest waiting card to the vertical centre of the list and moves focus to the **card group** (not to its Approve button, so Enter cannot approve by accident) |
| Never | An Approve, Pay or Send button on the strip. Approvals happen on the full card only (Article 6) |
| Narrator | `announce()` once when it appears: "{text}. Show button." |
| Evidence | `[AGT Manus step chip above composer; AIC PX1 card docked to composer; foo decision: strip points to the card instead of duplicating it]` |

### 23.5 Draft persistence (per chat) (08-0 §G.11, X-69) [F-024]

Storage is the `drafts` table (one row per chat; DDL 08-1 §4.3) and its `DraftRow` (08-0 §B). There is no `chats.draft_text`. This section fixes only when the composer saves and restores.

- What is saved (the `composer:saveDraft` payload, 08-1 §3): `{ chatId; text; attachmentIds; replyToId?; linkPreviewRemoved }` = field text (mention chips stored as `@{helperId}` tokens), the attachment chips (files already copied to `data\drafts\{chatId}\`), the reply target, and whether the link preview was removed. Main redacts `text` before storing.
- When: 500ms after the last change (debounced in the renderer), and at once on chat switch and window close. Edit mode and recordings are never saved as drafts.
- Restored: `chat:open` returns `draft: DraftRow | null`; the composer refills from it when the chat opens (inside the 100ms chat-switch budget, Article 28) and after an app restart; caret at the end.
- Not saved: while a paste catch is unresolved (§22.4); the last saved draft without the secret stays.
- Left shell: a chat with a draft shows "Draft: {first line}" as its preview, with "Draft:" in `--accent` (`ChatRow.hasDraft` / `lastLine`, 08-1 §3; 03-shell §3.4.6).
- Cleared: on Send, or when the field and stacks are emptied (a save with empty text, no attachments and no reply target deletes the row and its files).

### 23.6 Character limit

- 10,000 characters of text per message (attachments not counted; "Pasted text" chips not counted).
- From 9,000 characters, a counter (`composer-counter`) shows at the right of the composer notice slot: "{n} left" `--t-caption` `--fg-3` (tabular).
- Over 10,000: counter "{n} too many" `--t-caption` `--bad`; the round button is Disabled with tooltip "Too long to send. Shorten it, or paste it to send it as a file."
- `[foo decision: no evidence app caps desktop composers; 10,000 keeps one message readable and inside every AI's input]`

### 23.7 Narrator for the composer

- Field: "Message {chat name}, edit, multi-line" + the placeholder as its description.
- "+": "Add photos, files and more, button, collapsed/expanded".
- Round button: its tooltip text per state (§21.2), announced on state change only when it has focus.
- On send: `announce("Sent.")` (polite, once).

---

# Part D · Wireframes

All widths at a 1280px window: left shell 340px, right shell closed, main shell 940px → column 760px, side padding 24px, **content 712px**. `--bubble-max` = 72% × 712 = **512px**; rich cap = **680px**.

## §24.1 A full message pair (user → foo, 1:1)

```
x: 0 (content left)                                                            712 (content right)
│                                                                                    │
│                                        ┌─────────────────────────────────────┐  ◀── 18  TL/TR/BL
│                                        │ ok book the Goa hotel then, under   │      8 top pad
│                                        │ ₹8k a night, near the beach         │      12 side pad
│                                        │                    10:42 PM ✓✓      │◀ 6 (tail corner BR)
│                                     ╭──┴─╮───────────────────────────────────┘      meta: right 12, bottom 6
│                                     │ ✅ │ badge 24×24, left −8, bottom −10         time 12/16 --on-bubble-me-2
│                                     ╰────╯                                           ✓✓ 16×11 --tick-read-on-me
│                                        ◀────────── max 512 (72%) ───────────▶   fill --bubble-me
│                      ↕ 16 (badge rule: replaces 12)                             text --t-body 15/22
│ ┌────────────────────────────────────────────────┐
│ │ Found 3 stays under ₹8,000 near the beach.     │  plain bubble --bubble-foo, pad 8/12
│ │ Pick one below.                    10:42 PM    │  meta: time only, --fg-3
│ └────────────────────────────────────────────────┘  corners 18/18/18, BL 6 (tail)
│  ↕ 4
│ [⧉] [↻] [👍] [👎]   action row: 32 visual / 40 hit, gap 4, latest answer (older on hover)
│  ↕ 4 (bubble → card, same sender)
│ ┌──────────────────── card (05-cards) ────────────────┐
```

## §24.2 A grouped run (3 user bubbles within 3 minutes, then 2 foo bubbles)

```
                                     ┌──────────────────────────────┐  first: TL18 TR18 BR6 BL18
                                     │ also check flights   10:40 PM ✓✓│
                                     └──────────────────────────────┤
                                       ↕ 2                           │
                                ┌───────────────────────────────────┤  middle: TR6 BR6
                                │ for 12 to 14 Dec          10:41 PM ✓✓│
                                └───────────────────────────────────┤
                                       ↕ 2                           │
                        ┌───────────────────────────────────────────┤  last: TR6 BR6
                        │ window seat if possible         10:41 PM ✓✓│
                     ╭──┴─╮─────────────────────────────────────────┘
                     │ 👀 │  badge on the LAST bubble of the run (the one foo began reading)
                     ╰────╯
       ↕ 16
├────────────────────────────────────┐  first: TL18 TR18 BR18 BL6
│ Sure. Looking at flights now.      │
│                           10:41 PM │
├────────────────────────────────────┘
│ ↕ 2   (chat mode: 0.8–2.5 s after the first)
├───────────────────────────────────────────┐  last: TL6 TR18 BR18 BL6
│ Window seats cost ₹350 extra on IndiGo.   │
│                                  10:41 PM │
└───────────────────────────────────────────┘
```

Group variant (foo + helper in a group): a 26px avatar + name label sits 4px above the first bubble of each helper run; bubbles indent 34px:

```
(T) Trips                         ← 26 avatar --h-steel, name --t-caption-strong (light: --h-steel; dark: --fg-1)
    ┌──────────────────────────────┐
    │ IndiGo 6E 2134 has 3 window  │
    │ seats left.         10:43 PM │
    └──────────────────────────────┘
◀34▶
```

## §24.3 A rich answer (heading, list, table card, code block, citation, worked line)

```
┌──────────────────────────────────────── rich bubble 680 (fixed) ──────────────────────────────────┐
│ 12 pad                                                                                             │
│ 16 ▶ Your Goa options                                       H2: --t-title 20/28 600               │
│      4                                                                                             │
│      All three are under ₹8,000 and within 5 minutes of the beach. [Booking.com +2]  ← pill 20h    │
│      8                                                                                             │
│      •  Free cancellation on all three           bullets: indent 20, gap 4                        │
│      •  Taj has breakfast included                                                                 │
│      8                                                                                             │
│      ┌─────────────────────────── table card (--bg-raised, 1px --line, r12) ──────────────────────┐│
│      │ HOTEL               │ PER NIGHT │ WALK TO BEACH     header --t-caption-strong --fg-2        ││
│      │─────────────────────┼───────────┼──────────────── 1px --line-strong                         ││
│      │ Taj Holiday Village │   ₹7,300  │ 2 min             cells 8/12 pad, --t-small 13/18         ││
│      │ W Goa               │   ₹7,950  │ 4 min             numbers right-aligned, tabular          ││
│      │ Ronil Beach         │   ₹4,100  │ 3 min             no vertical lines, no zebra            ││
│      └────────────────────────────────────────────────────────────────────────── ▸ fade 24 if wide┘│
│      8                                                                                             │
│      ┌ Text ─────────────────────────────────────────────── [⧉ Copy] ┐ header 32                     │
│      │ TAJ-GOA-1214-2N                                               │ --t-mono 13/20, pad 12/16     │
│      └───────────────────────────────────────────────────────────────┘                               │
│      8                                                                                             │
│      Worked for 12s ›                                     --t-caption --fg-2                       │
│      Sources (3) ›                                        --t-caption --accent                     │
│                                                                                         10:44 PM   │
│ 12 pad                                                                                             │
└────────────────────────────────────────────────────────────────────────────────────────────────────┘
  ↕ 4
[⧉] [↻] [👍] [👎]
```

Before the first word of the same answer:

```
◔  Checking Booking.com…        16px ring --accent + --t-small --fg-2 with shimmer (1500ms)
```

## §24.4 The composer in each state

Bar content width 712: "+" 36 · gap 8 · pill 624 · gap 8 · round 36. Bar padding 12 top/bottom; top border 1px `--line`.

**Rest (foo's chat)**

```
──────────────────────────────────────────────────────────────────────────────────── 1px --line
 ( + )  ╭──────────────────────────────────────────────────────────────────────╮  (●🎙)
  36    │ Message foo, or hold Ctrl+Space to talk                              │   36 --fg-1 fill
        ╰──────────────────────────────────────────────────────────────────────╯
         46 tall · r24 · --bg-raised · 1px --line · --shadow-4 · pad 12/16
```

**Typing, 3 lines (grows up; buttons stay on the bottom row)**

```
        ╭──────────────────────────────────────────────────────────────────────╮
        │ book the Goa hotel then, under ₹8k a night,                          │
        │ near the beach, and add it to my calendar                            │
 ( + )  │ thanks|                                                              │  (➤)  --accent
        ╰──────────────────────────────────────────────────────────────────────╯
         90 tall (3 × 22 + 24) · max 6 lines = 156, then scrolls inside
```

**Reply strip + attachments + link preview**

```
        ╭──────────────────────────────────────────────────────────────────────╮
        │ ▌foo                                                            [✕]  │ reply strip 52, --bg-sunken, 4px bar
        │ ▌Found 3 stays under ₹8,000 near the beach…                          │
        │  8                                                                   │
        │ ┌──────┐ ┌──────┐ ┌──────────────────────────────┐                   │ chips row: 72×72 images,
        │ │ img ⓧ│ │ img ⓧ│ │ ▤  ticket.pdf             ⓧ │                   │ file chip 56×240
        │ └──────┘ └──────┘ │    PDF · 240 KB              │                   │
        │                   └──────────────────────────────┘                   │
        │  8                                                                   │
        │ ┌ ▣  Taj Holiday Village Goa · tajhotels.com                    [✕] ┐ │ preview row 56
        │ └──────────────────────────────────────────────────────────────────┘ │
        │  8                                                                   │
 ( + )  │ this one?                                                            │  (➤)
        ╰──────────────────────────────────────────────────────────────────────╯
```

**foo replying, field empty (Stop)**

```
 ( + )  ╭──────────────────────────────────────────────────────────────────────╮  (■)  --fg-1 fill, Stop icon
        │ Message foo, or hold Ctrl+Space to talk                              │       "Stop (Esc)"
        ╰──────────────────────────────────────────────────────────────────────╯
```

**Recording, hold mode (mouse)**

```
 ( ✕ )  ╭──────────────────────────────────────────────────────────────────────╮  (●)  --bad fill, Mic icon
 --bad  │ ●  0:03   ▁▃▅▇▅▃▁▂▄▆▅▃          Release to send · slide left to cancel │
        ╰──────────────────────────────────────────────────────────────────────╯
          dot 8 --bad · timer --t-body tabular · level bars 2/2, 4–24 tall · hint --t-small --fg-3
```

**Recording, locked mode (clicked the mic)**

```
 ( ✕ )  ╭──────────────────────────────────────────────────────────────────────╮  (➤)  --accent "Send voice note"
        │ ●  1:12   ▂▄▆▅▃▁▃▅▇▆▄▂            Press Enter to send · Esc to cancel │
        ╰──────────────────────────────────────────────────────────────────────╯
```

**Paste catcher**

```
        ┌──────────────────────────────────────────────────────────────────────┐ 1px --warn, r16, pad 12/14, --shadow-16, buttons 40 tall
        │ ⚠ That looks like a password or key                                  │
        │ You were about to send it as a normal message. Save it in the secret │
        │ box instead?                                                         │
        │ [ Move to secret box ]  [ Send anyway ]                              │
        └──────────────────────────────────────────────────────────────────────┘
          8
 ( + )  ╭──────────────────────────────────────────────────────────────────────╮  (➤) disabled
        │ my key is ••••                                                       │
        ╰──────────────────────────────────────────────────────────────────────╯
```

**Pending-card strip (Approval card scrolled out of view)**

```
        ┌──────────────────────────────────────────────────────────────────────┐ 40 tall, 1.5px --accent, r12
        │ 🔒 Waiting for your OK: Send this email to your landlord?   [ Show ] │
        └──────────────────────────────────────────────────────────────────────┘
          8
 ( + )  ╭──────────────────────────────────────────────────────────────────────╮  (🎙)
        │ Message foo, or hold Ctrl+Space to talk                              │
        ╰──────────────────────────────────────────────────────────────────────╯
```

**Banner + strip together (helper paused, payment waiting)**

```
        ┌──────────────────────────────────────────────────────────────────────┐ banner 40, --accent-soft
        │ ⓘ Money is paused. Messages wait until you turn it back on. [Turn on] │
        └──────────────────────────────────────────────────────────────────────┘
          8
        ┌──────────────────────────────────────────────────────────────────────┐
        │ 🔒 Waiting for your OK: ₹14,600 to Taj Holiday Village  9:12 left [Show] │
        └──────────────────────────────────────────────────────────────────────┘
          8
 ( + )  ╭──────────────────────────────────────────────────────────────────────╮  (🎙)
        ╰──────────────────────────────────────────────────────────────────────╯
```

**Offline (the only offline line is 03-shell's banner under the title bar; the composer changes its placeholder)**

```
 ( + )  ╭──────────────────────────────────────────────────────────────────────╮  (🎙)
        │ You're offline. I'll send when you're back.                          │
        ╰──────────────────────────────────────────────────────────────────────╯
```

**Disabled (your AI not set up; no banner here)**

```
 ( + )  ╭──────────────────────────────────────────────────────────────────────╮  (🎙)
 disabled│ Connect your AI first                       --fg-disabled on --bg-sunken│  disabled
        ╰──────────────────────────────────────────────────────────────────────╯
```

**@ mention menu (group chat)**

```
        ┌──────────────────────────────┐ 280 wide, r12, --shadow-16, rows 40
        │ (T) Trips    plans trips     │ ← selected --bg-hover
        │ (M) Money    pays bills      │
        └──────────────────────────────┘
          8
 ( + )  ╭──────────────────────────────────────────────────────────────────────╮  (➤)
        │ @Tr|                                                                 │
        ╰──────────────────────────────────────────────────────────────────────╯
```

**Drag-drop overlay**

```
┌─ main shell below the header ────────────────────────────────────────────────────────┐
│ 16  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐  16 │
│     │                         📎 (24, --accent)                                │     │
│     │                 Drop to add to your message      --t-title --accent    │     │
│     │              Photos and files, up to 25 MB each   --t-small --fg-2     │     │
│     └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘     │
│      1.5px dashed --accent, r16, fill --accent-soft                                  │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

---

## §25. Conflicts found and how this chapter resolves them

| # | Conflict | Resolution |
|---|---|---|
| 1 | C1 (journeys) uses ✋ for "waiting on you" and ⏳ for "slow"; Article 16 says ⏳ = waiting on you. | Article wins: ⏳ = waiting on you. "Slow" keeps 🛠 and changes only the tooltip (§4.2); values and tooltips are 08-0 §F. [settled: X-17, X-61] |
| 2 | C1 puts the badge at the bubble's bottom-right; BP1 draws it bottom-left. | Bottom-left (BP1 is the approved look, and the bottom-right holds the time and ticks) (§4.3). |
| 3 | 02 F2 says code blocks use `--bg-sunken`, but light `--bg-sunken` (#F0F0F4) equals `--bubble-foo` (#F0F0F4), so a code block or inline code would vanish inside foo's bubble. | Inside foo's bubbles, code blocks, inline code and table cards use `--bg-raised` + 1px `--line` (§13). `--bg-sunken` is still used for code on pages (06). Log in `GAPS.md`. |
| 4 | 02 F2 `--tick-read` on `--bubble-me`: #2B3FD6 on #0B0B10 ≈ 2.2:1 (light) and #8C9BFF on the pre-X-145 dark bubble #F1F1F5 ≈ 2.3:1 (dark; the dark bubble is indigo #2B3FD6 since X-145, CR-0004), both below the 3:1 icon minimum. | New token `--tick-read-on-me` for ticks inside the user's bubble (§26); `--tick-read` stays for ticks on `--bg-app` / `--bg-sidebar` (emoji-only meta, chat-list rows). |
| 5 | 02 F2 helper colours pass with white text, but as **name text** on dark `--bg-app` several fail AA (e.g. `--h-slate` #4B5563 ≈ 2.6:1, `--h-steel` ≈ 3.6:1). | Group sender names and mention tokens use the helper colour in light theme only; dark theme uses `--fg-1`, and the 26px avatar carries the colour (§12.4, §22.8). [settled: X-19] |
| 6 | 02 F5 `--icon-btn` is a 36px hit area, but 02 F5 also says every clickable thing is ≥ 40×40. | Visual sizes stay (32/36px); hit areas are padded to 40×40 (same as 06 §0.4). |
| 7 | 02 F7 "what animates (and nothing else)" has no shimmer, no live microphone level and no jump highlight; the brief and J7 require all three. | Requested as motion additions (§26). Until added, build them exactly as specified here; under reduced motion: no shimmer, no highlight fade (instant on/off), level bars still update. |
| 8 | BP1 uses 8px between all bubbles and 13.5px text; 02 F3/F1 fix 2px/12px and 15px. | Foundations win (Article 24); BP1's look (colours, shapes, positions) is kept. |
| 9 | Article 16 lists 👀 🛠 ✅ ❌ ⏳ only; C1 adds ⛔ "Stopped". | ⛔ kept for user-stopped jobs, because showing ❌ "Didn't work" for a job the user stopped would be untrue (Article 12). Log in `GAPS.md` for an Article 16 amendment. [settled: X-17; Article 16 now lists ⛔ stopped by you] |
| 10 | Ctrl+Space (BP1 placeholder, J7) toggles the input method on Chinese, Japanese and Korean keyboards. | Resolved by 09-windows: the talk key auto-switches to Ctrl+Shift+Space when such a layout is installed; all copy here uses `{talkKey}` (§20.4). A tap < 150ms still passes through. |
| 11 | AIC recommends a 2-row composer and no bubble for foo's answers; BP1 and 02 F0 say WhatsApp structure. | Single pill composer (§20.1) and bubbles on both sides, with a wide rich bubble for structured answers (§12.1). |
| 12 | 02 F6's required icon list lacks icons this chapter needs. | Requested in §26 (all exist in Fluent UI System Icons Regular except the double tick, which is a custom SVG). |
| 14 | First draft of this chapter put offline / AI-not-answering / cap banners above the composer. | Removed: 03-shell §3.3 is the only app-wide status line (Article 29); the composer changes its placeholder only (§23.2). [settled: X-13] |
| 15 | First draft defined date separators ("Today · Fri 16 Oct"), unread divider, scroll-to-bottom, load older and find bar. | 03-shell §3.6.3–§3.6.7 own them; this chapter references them (§1.7, §1.10, §19.1). |
| 13 | 06 §0.5 says skeletons do not shimmer because F7 has no shimmer; this chapter asks for a shimmer on the status line. | Only the before-first-word status line (§14.2) shimmers, once `--m-shimmer` is added; skeletons in 06 stay static. |
| 16 | Paste catcher specified in 04-2 §22.4 and 05-2 §5.9 with different shadow, mask and Esc meaning. | One component `PasteCatcher` here; mask exactly "••••", `--shadow-16`, Esc dismisses and keeps the span masked (§22.4). [08-0 §H, F-131] |
| 17 | §1.9 put the selection bar in "03-shell banner slot", which has no selection type. | The selection bar replaces the chat header in its own 60px box (03 §3.6.2.3). [FE-16, F-134] |
| 18 | Three strings for the start-of-history line (03 §3.6.4, §19.5, 02-2 E-1). | One string, E-1, key `thread.marker.start_of_chat` (§19.5, 03 §3.6.7). [X-33, F-132] |

## §26. New tokens requested (for `02-foundations.md`)

[settled: all present in `02-foundations.md` (F1, F2, F6, F7) as of 2026-10-16]

| Token | Light | Dark | Used for | Why |
|---|---|---|---|---|
| `--tick-read-on-me` | `#8C9BFF` | `#FFFFFF` | "Read by foo" ✓✓ inside the user's bubble | On `--bubble-me`: #8C9BFF on #0B0B10 ≈ 7.6:1; dark (X-145, CR-0004, CR-0024): #FFFFFF on the deep indigo #2C359A bubble ≈ 10:1. `--tick-read` fails there (§25 #4) |
| `--on-bubble-me-soft` | `#26262C` | `#232B7E` | Fill of quote blocks, file chips, link previews and inline code **inside** the user's bubble | A step lighter/darker than `--bubble-me` (dark `#232B7E` on the deep indigo `#2C359A` bubble, X-145, CR-0004, CR-0024); `--on-bubble-me` text on it ≈ 15:1 (light) / ≈ 13:1 (dark); `--on-bubble-me-2` on it ≈ 8.6:1 / 6.3:1 |
| `--t-body-indic` | 15/24, 400, 0 | same | Message and composer text tagged `lang="hi"` / `lang="pa"` | Devanagari and Gurmukhi matras clip at 22px line height in Nirmala UI |
| `--media-scrim` | `linear-gradient(to top, rgba(0,0,0,.55), rgba(0,0,0,0))`, 32px tall | same | Behind the time on image-only bubbles; behind "+{n}" on the 4th grid tile (with `--scrim`) | White time text needs ≥ 4.5:1 on any photo |
| `--on-media` | `#FFFFFF` | `#FFFFFF` | Time, ticks and "+{n}" over photos | Photos are not themed |
| `--m-shimmer` | 1500ms linear infinite | same | Before-first-word status line sweep (§14.2) | AIC CG1 / Vercel shimmer (1–2 s); reduced motion = off |
| Motion rule: jump highlight | `--accent-soft` row background, fade in `--m-normal`, hold 1600ms, fade out `--m-normal` | same | Jump to a quoted message or a search match | Locates the target without movement; reduced motion: instant on/off |
| Motion rule: live mic level | bar heights update every 100ms | same | Recording bar (§22.1) | Functional feedback that the mic hears you (J7) |
| Icons (Fluent Regular) | `ArrowReply`, `Edit`, `Delete`, `Emoji`, `Play`, `Pause`, `Screenshot`, `Info` (03 already added `ArrowLeft`, `ChevronUp`, `AlertOff`, `CloudOff`, `ArrowSync`) | | Reply, edit, delete, react, voice notes, "+" menu, info banners | Missing from 02 F6's list |
| Icon (custom SVG) | `TicksDouble` 16×11px, two 1.5px-stroke checks offset 4px; `TickSingle` 16×11px | | Message ticks (§3.2) | Fluent has no WhatsApp-style double tick |

Tokens this chapter uses that were added by other chapters: `--banner-h`, `--on-bad`, `--on-helper` (06 §0.11); `--delay-sticky-hide` (03, via §19.1 reference).

## §27. Acceptance hooks (for `10-acceptance.md`)

- **Given** three user messages sent at 10:40:00, 10:41:30 and 10:45:00, **then** the first two form one run (2px gap; corners per §1.4) and the third starts a new run (12px gap).
- **Given** a single user bubble, **then** its corners are TL 18, TR 18, BR 6, BL 18 and the meta "h:mm AM ✓" sits inside at right 12 / bottom 6 without overlapping text.
- **Given** the user sends "hi" with the AI reachable, **then** ✓ shows within 50ms, ✓✓ when queued, read ✓✓ in `--tick-read-on-me`, 👀 within 1 s, and 👀 is removed when foo's first word appears.
- **Given** a job with an Approval card, **then** the triggering bubble's badge goes 👀 → 🛠 → ⏳ and, after approval and proof, ✅; no state shorter than 700ms is shown.
- **Given** the user is 200px up the list while foo streams, **then** the list does not move and the scroll-to-bottom button shows a count.
- **Given** a reply containing a table, **then** it renders as a 680px rich bubble with a horizontally scrollable table card and no vertical lines.
- **Given** the user pastes `sk-proj-` followed by 40 characters, **then** the paste-catcher panel appears, the span is masked, Enter does not send, and no draft containing it is written to disk.
- **Given** the user pastes 3,500 characters, **then** a "Pasted text · 3,500 characters" chip appears and the field stays empty.
- **Given** the user holds `{talkKey}` for 4 s and releases, **then** a voice-note bubble is sent; a tap under 150ms records nothing; with a Japanese keyboard installed the placeholder reads "…hold Ctrl+Shift+Space to talk".
- **Given** an Approval card scrolled out of view, **then** the pending strip shows "Waiting for your OK: …" with "Show", and the strip has no Approve button.
- **Given** foo is streaming and the field is empty, **then** the round button is Stop; typing one character turns it into Send.
- **Given** the AI is not set up, **then** the pill, "+" and round button are disabled with placeholder "Connect your AI first", and no banner appears above the composer.
- **Given** the internet is off for 10 s, **then** no bar appears above the composer (only 03-shell's banner), the placeholder reads "You're offline. I'll send when you're back.", and sent messages show the Clock tick.
- **Given** a draft "call mom" in foo's chat, **when** the app restarts, **then** the draft is restored and the chat row shows "Draft: call mom".
- **Given** dark theme in a group, **then** helper sender names render in `--fg-1` and pass 4.5:1.
- **Given** a job whose bubble shows ⏳ and the job goes stuck, **then** `bubble-badge` keeps `data-state="waiting"` and no ⚠ is drawn on any bubble (08-0 §F).
- **Given** a job working with no progress for 60 s, **then** `bubble-badge` stays `data-state="working"` and its tooltip is the 08-0 §F slow text.
- **Given** a caught paste and the user presses Esc, **then** `composer-paste` closes, the field still shows "••••" for the span, and the next Send reopens `composer-paste`.
- **Given** the user picks "Select" on a message, **then** `chat-header-selection` replaces the chat header (no new banner in `banner-strip`), and Esc restores the header.
- **Given** `prefers-reduced-motion`, **then** no row rises, the Thinking face holds its static pose (02 §F15.9.5) [X-36], the status line does not shimmer, and words appear without a fade.

## §28. Copy keys (binding; 08-0 §D) [F-011]

Every user-visible string in `04` (both files) lives in `src/shared/copy/en-IN.json` under these keys and is read with `t()`; the exact English is the "quoted" text in the section named, written once there. Variables use ICU (`{count, plural, …}`, `{name}`); money arrives pre-formatted by `formatInr()` (02-3 §F24). Text sent to your AI (for example the hidden-secret note in §22.4 and the correction note in §6.2) is a prompt string in `resources/prompts/`, not copy (08-0 §D).

| Key prefix | Slots | Strings in |
|---|---|---|
| `bubble` | `accessible_name`, `announce_new` | §1.8 |
| `bubble.meta` | `edited`, `rewritten`, `full_date` | §3.1, §17.1 |
| `bubble.tick` | `waiting`, `sent`, `delivered`, `read`, `not_sent` (= TickState) | §3.3 |
| `bubble.badge.tooltip` | `seen`, `working`, `working_slow`, `waiting`, `done`, `done_unverified`, `failed`, `stopped` (text: 08-0 §F); `waiting_ai`, `reacted` | §4.2 |
| `bubble.menu` | `reply`, `react`, `copy`, `copied`, `edit`, `try_again`, `good`, `bad`, `select`, `delete`, `keep_voice` ("Keep this voice note"), `unkeep_voice` ("Don't keep") | §6.1, §9.1, §17.4 |
| `bubble.edit` | `strip_label`, `saved` | §6.2 |
| `dialog.c_24` | `title`, `body_mine`, `body_other`, `primary`, `secondary` (C-24 delete one message; owned by 04, numbered by 06-3 §14, X-102, X-118) | §6.3, §17.4 |
| `dialog.c_25` | `title`, `body`, `primary`, `secondary` (C-25 delete selected messages; owned by 04, numbered by 06-3 §14, X-102, X-118) | §1.9 (same pattern as §6.3, plural) |
| `bubble.quote` | `deleted` | §6.4 |
| `bubble.not_sent` | `text`, `retry`, `reason.missing`, `reason.queue_full`, `reason.disk_full`, `reason.copy_failed` | §7 |
| `bubble.toolbar` / `bubble.react_picker` | `react`, `more` / `more` | §9.2, §9.3 |
| `bubble.image` | `accessible_name`, `more_count`, `broken`, `alt_default` | §10.1, §13.3 |
| `bubble.file` | `meta`, `menu.open`, `menu.show_in_folder`, `menu.save_as` | §10.2 |
| `bubble.voice` | `accessible_name`, `transcript_working`, `transcript_failed`, `more`, `speed`, `too_long` | §10.3, §18 |
| `bubble.deleted` | `text` | §10.4 |
| `bubble.read_more` | `label` | §10.5 |
| `dialog.c_26` | `title`, `body`, `primary` ("Open {domain}"), `secondary` ("Not now") (C-26 open a link to another domain; owned by 04, numbered by 06-3 §14, X-102, X-118, X-128) | §13 (Link row) |
| `bubble.code` | `copy`, `copied`, `copy_accessible`, `show_all`, `accessible_name`, `language.{python, text, formula, …}` | §13.1 |
| `bubble.table` | `show_all`, `accessible_name`, `copy` | §13.2 |
| `bubble.citation` | `label_many`, `open`, `sources`, `accessible_name` | §13.4 |
| `thread.status_line` | one slot per phrase id of the 08 phrase list (shared with checklist steps, C2) | §14.2 |
| `bubble.stream` | `stopped` | §14.4 |
| `bubble.worked` | `seconds`, `minutes`, `hours`, `accessible_name` | §15 |
| `bubble.autolink.menu` | `open`, `copy_link`, `copy_email`, `write`, `copy_number`, `call`, `calendar`, `copy`, `maps`, `copy_address` | §16.1 |
| `composer.prefill` | `write_email`, `add_to_calendar` | §16.1 |
| `bubble.actions` | `copy`, `retry`, `good`, `bad`, `earlier_answer` | §17.1 |
| `bubble.feedback` | `title`, `chip.wrong`, `chip.not_asked`, `chip.too_long`, `chip.too_short`, `chip.other`, `placeholder`, `send`, `cancel`, `thanks` | §17.2 |
| `bubble.backup_mark` | `text` ("Answered with {ChatGPT} while {Claude} rests"), `accessible_suffix` (", answered with {ChatGPT}") (X-138) | §12.5 (X-128) |
| `thread.wa_mirror` | `retention`, `draft_made`, `open` (X-138) | §10.11 (X-128) |
| `thread.marker.handoff` | `asked`, `back`, `failed` | §19.3 |
| `bubble.error` | `cut_off`, `retry` | §19.4 |
| `thread.marker` | `start_of_chat`, `start_of_chat_foo`, `system_line.new_helper`, `system_line.helper_joined`, `system_line.renamed`, `system_line.history_deleted`, `system_line.cleared` | §19.5 (also 03 §3.6.7) |
| `bubble.why` | `link`, `title`, `stop`, `keep`, `stopped`, `reason.routine_asked`, `reason.routine_suggested`, `reason.suggestion`, `reason.habit_offer`, `reason.housekeeping`, `reason.cap_warning` | §19.6 |
| `composer.field` | `accessible_name` | §20.3, §23.7 |
| `composer.placeholder` | `foo`, `helper`, `group`, `private`, `wa_mirror`, `narrow`, `attachments`, `starting`, `offline`, `ai_not_answering`, `ai_cap`, `plan_limit`, `not_set_up` | §20.4 |
| `composer.attach` | `tooltip`, `accessible_name` | §21.1, §23.7 |
| `composer.attach_menu` | `files`, `files_hint`, `screenshot`, `secret`, `emoji`, `emoji_hint` | §21.1 |
| `composer.send.tooltip` | `disabled`, `save_edit`, `send_voice`, `recording`, `send`, `stop`, `mic` (= RoundButtonState), `too_long`, `choose_first` | §21.2, §22.4, §23.6 |
| `composer.chip` | `remove`, `pasted_name`, `pasted_meta`, `accessible_photo`, `accessible_file` | §21.4 |
| `composer.reply` / `composer.edit` | `close` / `label`, `close` | §21.6 |
| `composer.recording` | `cancel`, `max`, `hint_mouse`, `hint_keyboard`, `hint_locked`, `hint_let_go`, `too_short`, `announce_start`, `announce_sent`, `announce_cancelled` | §22.1 |
| `composer.banner.{ComposerBannerType}` | `text`, `action`; plus `composer.banner.dismiss` | §22.1, §23.2 |
| `composer.paste` | `title`, `body`, `move`, `send_anyway`, `hidden_in_bubble`, `name.openai`, `name.google`, `name.card`, `name.password`, `name.otp`, `name.key` | §22.4 |
| `composer.notice` | `too_many_files`, `too_big`, `programs`, `zipped`, `unreadable` | §22.6 |
| `composer.drop` | `title`, `subline`, `some_blocked`, `none_title` | §22.6 |
| `composer.mention` | `none`, `empty`, `make` | §22.8 |
| `composer.pending` | `approval`, `payment`, `answer`, `many`, `time_left`, `show`, `accessible_name` | §23.4 |
| `composer.counter` | `left`, `too_many` | §23.6 |
| `composer.announce` | `sent` | §23.7 |

The chat-row draft preview ("Draft: {first line}") is `chatlist.row.preview.draft` (03 §3.14). A string added to `04` adds a row here in the same edit; a key not in this table fails `scripts/check-copy.ts` (08-0 §D).
