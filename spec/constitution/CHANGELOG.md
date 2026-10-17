# Changelog (editor pass, 2026-10-16)

Every edit the editor made to align the chapters with `DECISIONS.md` (X-01…X-21), `01-articles.md` and `02-foundations.md`. Long texts are shortened with "…"; "(removed)" means the text was deleted. Reason IDs: X-nn = DECISIONS row; "task n" = the editor brief; "coordinator" = a direct instruction from the coordinator during the pass.

## Summary

| File | Edits |
|---|---|
| `00-README.md` | 3 |
| `02-foundations.md` | 9 |
| `DECISIONS.md` | 1 |
| `03-shell-1.md` | 5 |
| `03-shell-2.md` | 11 |
| `04-messages-and-composer.md` | 5 |
| `04-messages-and-composer-2.md` | 6 |
| `05-cards-1.md` | 5 |
| `05-cards-2.md` | 8 |
| `05-cards-3.md` | 18 |
| `06-screens.md` | 13 |
| `06-screens-1.md` | 2 |
| `06-screens-2.md` | 10 |
| `06-screens-3.md` | 14 |
| `07-journeys-1.md` | 5 |
| `07-journeys-2.md` | 14 |
| `08-functions-and-engine-1.md` | 12 |
| `08-functions-and-engine-2.md` | 10 |
| `08-functions-and-engine-3.md` | 13 |
| `09-windows.md` | 18 |
| `10-acceptance-1.md` | 4 |
| `10-acceptance-2.md` | 4 |
| `GAPS.md` | 13 lines appended (see GAPS.md) |
| `CHANGELOG.md` | new file |
| **Total** | **190** logged edits (date fixes count once per distinct date per file) |

## `00-README.md`

| # | Section | Before → After | Reason |
|---|---|---|---|
| 1 | Files + Read in this order | "## Files ⏎  ⏎ \| File \| What it decides \| ⏎ \|---\|---\| ⏎ \| `00-README.md` \| This page: how to use the constitution \| ⏎ \| `01-articles.md` \| The 30 laws foo must never break \| ⏎ \| `02-foundations.md` \| Design …" → "## Files ⏎  ⏎ \| File \| What it decides \| ⏎ \|---\|---\| ⏎ \| `00-README.md` \| This page: how to use the constitution \| ⏎ \| `01-articles.md` \| The 30 laws foo must never break \| ⏎ \| `02-foundations.md` \| Design …" | task 4 |
| 2 | Order of authority | "6. `10-acceptance.md` (how we prove each part is done)." → "6. `10-acceptance-1.md`, `10-acceptance-2.md` (how we prove each part is done)." | task 4 |
| 3 | Order of authority | "2. **Articles** in `01-articles.md` (the laws: safety, trust, words)." → "2. **Articles** in `01-articles.md` (the laws: safety, trust, words), then **`DECISIONS.md`** (binding cross-chapter decisions X-nn; they override any chapter text that disagrees)." | task 4 |

## `02-foundations.md`

| # | Section | Before → After | Reason |
|---|---|---|---|
| 1 | F4 Shape --r-sm | "\| `--r-sm` \| 8px \| buttons in headers, chat rows (inset), menu items, inputs inside cards \|" → "\| `--r-sm` \| 8px \| chat rows (inset), menu items, inputs and text fields, icon-button hover fill \|" | X-01 |
| 2 | F4 Shape --r-full | "\| `--r-full` \| 999px \| pills, avatars, badges, round buttons \|" → "\| `--r-full` \| 999px \| every text button (cards, dialogs, pages, settings, banners: X-01), pills, avatars, badges, round buttons \|" | X-01 |
| 3 | examples (dates) | "Fri 12 Dec" → "Sat 12 Dec" (×2) | X-10 |
| 4 | F2 Status table (new on-fill rows) | "\| `--info` / `--info-soft` \| = `--accent` / `--accent-soft` \| \| working, in progress \|" → "\| `--info` / `--info-soft` \| = `--accent` / `--accent-soft` \| \| working, in progress \| ⏎ \| `--live` \| = `--bad` (`#B03224`) \| = `--bad` (`#FF7B6B`) \| the "● LIVE" dot and word only (an alias, so `--bad` keeps me…" | task 1: tokens requested by 05/06 |
| 5 | F5 Sizes (new rows) | "\| touch target \| ≥ 40×40px for every clickable thing `[WIN MUST]` \|" → "\| touch target \| ≥ 40×40px for every clickable thing `[WIN MUST]` \| ⏎ \| `--card-w` \| 440px standard in-chat card width (05 §0.2) `[BP1 measured]` \| ⏎ \| `--card-w-wide` \| 600px brief, option tiles, table card (und…" | task 1: tokens requested by 05/06 |
| 6 | F7 Motion (new row) | "\| `--ease-standard` \| `cubic-bezier(0.33, 1, 0.68, 1)` \| everything else \|" → "\| `--ease-standard` \| `cubic-bezier(0.33, 1, 0.68, 1)` \| everything else \| ⏎ \| `--m-card` \| = `--m-normal` (167ms) with `--ease-standard` \| card state change: content cross-fade + height (05 §0.8, motion M-1); red…" | task 1: --m-card |
| 7 | F7 what animates | "- Status-line shimmer (`--m-shimmer`), live mic level (updates every 100ms), jump-to-message highlight (fade in 167ms, hold 1600ms, fade out 250ms)." → "- Status-line shimmer (`--m-shimmer`), live mic level (updates every 100ms), jump-to-message highlight (fade in 167ms, hold 1600ms, fade out 250ms). ⏎ - Card state change (`--m-card`): content cross-fade + height change …" | task 1: --m-card |
| 8 | F6 Icons | "- Required icon names: Add, Mic," → "- Extra icons for cards and screens (05 §5.26, 06 §0.11): TaskListLtr, Location, PaintBrush, ShieldCheckmark, PlugConnected, Keyboard, History, ArrowMaximize, ArrowDownload, ZoomIn, ZoomOut, ChevronLeft. Custom SVGs (not…" | task 1: icons requested by 04/05/06 |
| 9 | F6 Icons required list | "ArrowLeft, ChevronUp, AlertOff, CloudOff, ArrowSync." → "ArrowLeft, ChevronUp, AlertOff, CloudOff, ArrowSync, ArrowReply, Edit, Delete, Emoji, Play, Pause, Screenshot, Info, TaskListLtr, Location, PaintBrush, ShieldCheckmark, PlugConnected, Keyboard, History, ArrowMaximize, Ar…" | task 1: icons |

## `DECISIONS.md`

| # | Section | Before → After | Reason |
|---|---|---|---|
| 1 | table | "\| X-20 \| The banned-word scan exempts only the body of the crash-report preview (it shows the user's own file). Logged in GAPS. \|" → "\| X-20 \| The banned-word scan exempts only the body of the crash-report preview (it shows the user's own file). Logged in GAPS. \| ⏎ \| X-21 \| Ctrl+J is "jump to the card that needs you" (X-09). The right shell (Detai…" | X-21 (coordinator) |

## `03-shell-1.md`

| # | Section | Before → After | Reason |
|---|---|---|---|
| 1 | §3.4 chat row avatar | "letter white `#FFFFFF` in both themes" → "letter `--on-helper` (white in both themes)" | Article 24 tokens; 06 §0.11 --on-helper |
| 2 | §3.5 footer avatar | "fill `--h-slate`, letter `#FFFFFF` (helper-palette rule)" → "fill `--h-slate`, letter `--on-helper` (helper-palette rule)" | Article 24 tokens |
| 3 | §3.3.1 banner anatomy Button | "\| Button \| `--btn-h` 32px, padding 0 `--s2`, radius `--r-sm`, `--t-body-strong`" → "\| Button \| `--btn-h` 32px, padding 0 `--s2`, radius `--r-full` (pill) [settled: X-01], `--t-body-strong`" | X-01 |
| 4 | §3.3.2 banner type 4 | ""Raise cap" → Settings → AI spend \|" → ""Raise cap" → Settings → Money (AI spend section) [settled: X-07] \|" | X-07 |
| 5 | §3.5 footer status button | "action: Settings → Your AI \|" → "action: Settings → Account & your AI [settled: X-07] \|" | X-07 |

## `03-shell-2.md`

| # | Section | Before → After | Reason |
|---|---|---|---|
| 1 | §3.6.2.2 header buttons | ""Show details (Ctrl+J)" or "Hide details (Ctrl+J)"" → ""Show details (Ctrl+Shift+D)" or "Hide details (Ctrl+Shift+D)" [settled: X-21]" | X-21 |
| 2 | §3.7 right shell opened by | "\| Opened by \| header Panel toggle; Ctrl+J;" → "\| Opened by \| header Panel toggle; Ctrl+Shift+D [settled: X-21];" | X-21 |
| 3 | §3.7 right shell closed by | "\| Closed by \| Panel toggle; Ctrl+J;" → "\| Closed by \| Panel toggle; Ctrl+Shift+D;" | X-21 |
| 4 | 3.11.2 acceptance | "when Ctrl+J is pressed, then the right shell overlays" → "when Ctrl+Shift+D is pressed, then the right shell overlays" | X-21 |
| 5 | §3.7 Using chips click | "opens Settings → Apps at that app (`06`); the AI chip opens Settings → Your AI \|" → "opens Settings → Connections at that app (`06`); the AI chip opens Settings → Account & your AI [settled: X-07] \|" | X-07 |
| 6 | §3.7 Spent action | "text link "Change caps" → Settings → AI spend \|" → "text link "Change caps" → Settings → Money [settled: X-07] \|" | X-07 |
| 7 | §3.6.5 date chip copy | "other year: "Wed 14 Oct 2025"" → "other year: "Tue 14 Oct 2025"" | X-10 (weekday computed from the real date: 14 Oct 2025 was a Tuesday) |
| 8 | §3.13 #4 | "\| Article 13 requires both caps visible; BP1 number was an example of a raised cap (J21 §6) \|" → "\| Article 13 requires both caps visible; BP1 number was an example of a raised cap (J21 §6) [settled: X-15] \|" | X-15 |
| 9 | §3.13 #5 | "\| Article 29 "one line with one fix button" \|" → "\| Article 29 "one line with one fix button" [settled: X-13] \|" | X-13 |
| 10 | §3.13 #2 | "\| lands in L so BP1's three columns show on common 1920×1080 screens \|" → "\| lands in L so BP1's three columns show on common 1920×1080 screens [settled: X-14] \|" | X-14 |
| 11 | §3.12 | "## 3.12 New tokens requested ⏎ " → "## 3.12 New tokens requested ⏎  ⏎ [settled: all present in `02-foundations.md` (F1, F5, F6, F7) as of 2026-10-16] ⏎ " | task 1 |

## `04-messages-and-composer.md`

| # | Section | Before → After | Reason |
|---|---|---|---|
| 1 | voice replies | "Sent when Settings → Chat → Voice replies allows it" → "Sent when Settings → Chat and voice → Voice replies allows it [X-07]" | X-07 |
| 2 | examples (dates) | "Thu 16 Oct" → "Fri 16 Oct" (×3) | X-10 |
| 3 | examples (dates) | "Fri 12 Dec" → "Sat 12 Dec" | X-10 |
| 4 | examples (dates) | "Fri 17 Oct" → "Sat 17 Oct" | X-10 |
| 5 | examples (dates) | "Mon 6 Oct" → "Tue 6 Oct" | X-10 |

## `04-messages-and-composer-2.md`

| # | Section | Before → After | Reason |
|---|---|---|---|
| 1 | examples (dates) | "Thu 16 Oct" → "Fri 16 Oct" | X-10 |
| 2 | §25 #9 | "Log in `GAPS.md` for an Article 16 amendment. \|" → "Log in `GAPS.md` for an Article 16 amendment. [settled: X-17; Article 16 now lists ⛔ stopped by you] \|" | X-17 |
| 3 | §25 #5 | "and the 26px avatar carries the colour (§12.4, §22.8). \|" → "and the 26px avatar carries the colour (§12.4, §22.8). [settled: X-19] \|" | X-19 |
| 4 | §25 #14 | "the composer changes its placeholder only (§23.2). \|" → "the composer changes its placeholder only (§23.2). [settled: X-13] \|" | X-13 |
| 5 | §25 #1 | ""Slow" keeps 🛠 and changes only the tooltip (§4.2). \|" → ""Slow" keeps 🛠 and changes only the tooltip (§4.2). [settled: X-17] \|" | X-17 |
| 6 | §26 | "## §26. New tokens requested (for `02-foundations.md`) ⏎ " → "## §26. New tokens requested (for `02-foundations.md`) ⏎  ⏎ [settled: all present in `02-foundations.md` (F1, F2, F6, F7) as of 2026-10-16] ⏎ " | task 1 |

## `05-cards-1.md`

| # | Section | Before → After | Reason |
|---|---|---|---|
| 1 | §0 keyboard Ctrl+J | "\| **Ctrl+J** \| anywhere in a chat \|" → "\| **Ctrl+J** [settled: X-09, X-21] \| anywhere in a chat \|" | X-21 |
| 2 | §0 keyboard Ctrl+Enter | "foo decision: scoped to the focused card so no approval happens by accident]` \|" → "foo decision: scoped to the focused card so no approval happens by accident]`. Exception: on Approval, Payment and Draft cards Ctrl+Enter never triggers Approve / Pay / Send (Tab to the button and press Enter or Space) […" | 09 §9.17.4 wins on shortcuts; Article 6 |
| 3 | §0.3 buttons radius | "Buttons radius: `--r-full` (pill) in cards, as in BP1 (`.btn{border-radius:999px}`). 06 §0.4 uses `--r-sm` for page/dialog buttons; see conflict §5.27 #1." → "Buttons radius: `--r-full` (pill) in cards, as in BP1 (`.btn{border-radius:999px}`). Pages, dialogs, settings and banners use the same pills [settled: X-01]." | X-01 |
| 4 | §0.1 catalogue Draft row | "\| yes, [ Review ] [ Later ] \| C6, J12 \|" → "\| yes, [ Review ] [ Not now ] [settled: X-02, X-04] \| C6, J12 \|" | X-02, X-04 |
| 5 | §5.3 Choice states | "\| Asking (pending) \| as anatomy; job NEEDS YOU; badge ✋ on the user's bubble (04) \|" → "\| Asking (pending) \| as anatomy; job NEEDS YOU; badge ⏳ on the user's bubble (04) [settled: X-17] \|" | X-17 |

## `05-cards-2.md`

| # | Section | Before → After | Reason |
|---|---|---|---|
| 1 | §5.5 keyboard | "Ctrl+Enter inside the card = Primary." → "Ctrl+Enter inside the card does nothing; Approve has no shortcut [settled: 09 §9.17.4]." | 09 §9.17.4 |
| 2 | §5.6.4 keyboard | "Ctrl+Enter = Approve, which then still requires Hello or the typed amount." → "Ctrl+Enter does nothing; Approve has no shortcut [settled: 09 §9.17.4]." | 09 §9.17.4 |
| 3 | §5.7 keyboard | "Ctrl+Enter = Send (non-edit) or Save changes (edit)." → "Ctrl+Enter = Save changes (edit mode only); it never sends [settled: 09 §9.17.4]." | 09 §9.17.4; R-14 (draft is an approval) |
| 4 | §5.6 copy table Hello prompt | "\| Windows Hello prompt text (06 §15) \| "Confirm it's you to pay ₹{total} to {payee}" \|" → "\| Windows Hello prompt text (owned by 09 §9.19) \| "Approve paying {amount} to {payee}" [settled: X-08] \|" | X-08 |
| 5 | §5.6 copy table typed confirm | "button "Confirm ₹{total}" (enabled only on an exact match)" → "button "Approve ₹{total}" (enabled only on an exact match; dialog per 09 §9.19.4) [settled: X-08, X-04]" | X-08, X-04 |
| 6 | §5.6 copy table typed confirm | "\| Typed confirm (no Hello) \| field label "Type the amount to confirm"; placeholder" → "\| Typed confirm (no Hello) \| dialog owned by 09 §9.19.4: title "Confirm this payment", body "Type the amount to approve paying {payee}.", field name "Amount to approve" (06 §15); placeholder" | X-08 |
| 7 | §5.7 toast | ""{agentName} · Draft ready for {Rakesh}" [ Review ] [ Later ];" → ""{agentName} · Draft ready for {Rakesh}" [ Review ] [ Not now ] [settled: X-02, X-04];" | X-02, X-04 |
| 8 | §5.8 trigger | "Settings → Passwords "Add" uses the same component." → "Settings → Money "Add a card" and Settings → Account & your AI (keys) use the same component [X-07]." | X-07 |

## `05-cards-3.md`

| # | Section | Before → After | Reason |
|---|---|---|---|
| 1 | §5.27 #17 | "\| Listed here; 09-windows must list them and wins on a clash. \|" → "\| Listed here; 09-windows must list them and wins on a clash. [settled: X-09, X-21: 09 §9.17.1 lists both; the Details toggle moved to Ctrl+Shift+D] \|" | X-09, X-21 |
| 2 | §5.27 #1 | "06 dialogs/pages may keep `--r-sm`; **main must decide** whether to unify. Logged here, not guessed further. \|" → "06 dialogs/pages may keep `--r-sm`; **main must decide** whether to unify. Logged here, not guessed further. [settled: X-01: pills everywhere] \|" | X-01 |
| 3 | §5.17 memory chip sketch | "[🧠 Saved: Allergic to peanuts · Undo]" → "[🧠 I'll remember: Allergic to peanuts · Undo]" | X-05 |
| 4 | §5.17 copy table | "\| Saved (you said) \| "Saved: {fact}" + "Undo" \|" → "\| Saved (you said) \| "I'll remember: {fact}" + "Undo" [settled: X-05] \|" | X-05 |
| 5 | §5.17 copy table | "\| Guessed \| "I noticed {you pick window seats}. Saved" + "Undo" \| same \|" → "\| Guessed \| "I'll remember: {you pick window seats} · I guessed" + "Undo" [settled: X-05] \| same \|" | X-05 |
| 6 | §5.17 after 24h | "after that the chip reads "Saved: {fact}" + Link "See in memory"" → "after that the chip reads "I'll remember: {fact}" + Link "See in memory"" | X-05 |
| 7 | §5.17 Narrator | "Narrator: "Memory: Saved, {fact}. Button: Undo."" → "Narrator: "Memory: I'll remember, {fact}. Button: Undo."" | X-05 |
| 8 | §5.27 #8 | "Main may switch with one string change. \|" → "Main may switch with one string change. [settled: X-05: "I'll remember: {fact}" + "Undo"; §5.17 updated] \|" | X-05 |
| 9 | §5.11 WhatsApp failed | ""WhatsApp didn't link. You can try later in Settings → Apps."" → ""WhatsApp didn't link. You can try later in Settings → Connections." [X-07]" | X-07 |
| 10 | §5.11 Not now | ""Not connected. You can do this later in Settings → Apps."" → ""Not connected. You can do this later in Settings → Connections." [X-07]" | X-07 |
| 11 | §5.25 voice trigger | "Settings → Chat → "Voice replies"" → "Settings → Chat and voice → "Voice replies" [X-07]" | X-07 |
| 12 | §5.27 #11 | "in 2026 these are Fri 16 Oct, Sun 18 Oct, Thu 10 Dec. \| Examples here use 2026 weekdays. Copy templates are unaffected. \|" → "in 2026 these are Fri 16 Oct, Sun 18 Oct, Thu 10 Dec. \| Examples here use 2026 weekdays. Copy templates are unaffected. [settled: X-10] \|" | X-10 |
| 13 | §5.21 spend-cap raise | "- Raising either cap requires Windows Hello, or typing the new amount when Hello is not set up (06 §15) `[foo decision: same protection as a big payment, Article 7 spirit]`. Hello text: "Confirm it's you to raise your {A…" → "- Raising either cap is a plain confirm dialog (06 §14 C-20); Windows Hello is only for single payments ≥ ₹10,000 [settled: X-15]." | X-15 |
| 14 | §5.21 logging | "`cap_raised` (old, new, hello)" → "`cap_raised` (old, new)" | X-15 |
| 15 | §5.27 #18 | "06 §11.4 "Receipt window" should be removed. \|" → "06 §11.4 "Receipt window" should be removed. [settled: X-02; 06 §11.4 removed] \|" | X-02 |
| 16 | §5.27 #2 | "J12 step 7 ("Next time, send emails to Rakesh without asking?") is dropped. \|" → "J12 step 7 ("Next time, send emails to Rakesh without asking?") is dropped. [settled: X-03] \|" | X-03 |
| 17 | §5.27 #3 | ""Go" (Plan) and "I'm done / Take over / Skip" (Sign-in) are kept as drafted. \|" → ""Go" (Plan) and "I'm done / Take over / Skip" (Sign-in) are kept as drafted. [settled: X-04] \|" | X-04 |
| 18 | §5.26 | "## §5.26 New tokens requested (for `02-foundations.md`) ⏎ " → "## §5.26 New tokens requested (for `02-foundations.md`) ⏎  ⏎ [settled: all tokens and icons below were added to `02-foundations.md` F2/F5/F6/F7 on 2026-10-16] ⏎ " | task 1 |

## `06-screens.md`

| # | Section | Before → After | Reason |
|---|---|---|---|
| 1 | Parts table | "sign-in window is 05 §5.10; receipt window)" → "sign-in window is 05 §5.10; no receipt window [settled: X-02])" | X-02 |
| 2 | §0.9 inventory | "\| 11.4 \| Receipt window \| Window \| payment toast "Review" \| — \| ⏎ " → "\| 11.4 \| ~~Receipt window~~ removed [settled: X-02]; toast "Review" opens the main window at the card \| — \| — \| — \| ⏎ " | X-02 |
| 3 | §0.4 Primary button | "padding 0 16px, `--r-sm`, label `--t-body-strong` \| bg `--accent`" → "padding 0 16px, `--r-full` (pill) [settled: X-01], label `--t-body-strong` \| bg `--accent`" | X-01 |
| 4 | §0.4 intro | "If 05 defines the same control, the two MUST render identically; 05 wins on a mismatch and the mismatch goes in `GAPS.md`." → "If 05 defines the same control, the two MUST render identically; 05 wins on a mismatch and the mismatch goes in `GAPS.md`. All text buttons (Primary, Secondary, Destructive) are pills `--r-full`; inputs, rows and menus k…" | X-01 |
| 5 | §0.6 page banners | "text `--t-small`, 32px outlined buttons) with `--r-md` corners" → "text `--t-small`, 32px outlined pill buttons, X-01) with `--r-md` corners" | X-01 |
| 6 | §0.11b | "03 (and J21) link to Settings pages by older names. They resolve to these §6 pages; code MUST use the §6 ids." → "03 (and J21) link to Settings pages by older names. They resolve to these §6 pages; code MUST use the §6 ids. [settled: X-07: 03, 05, 09 and 10 now use the §6 names directly]" | X-07 |
| 7 | examples (dates) | "Fri 17 Oct" → "Sat 17 Oct" | X-10 |
| 8 | §0.12 #10 | "\| Tray copy belongs to 09; flagged there. Screens in 06 always add the absolute day. \|" → "\| Tray copy belongs to 09; flagged there. Screens in 06 always add the absolute day. [settled: X-11: 09 §9.8.4 "Quiet until…" options show absolute times] \|" | X-11 |
| 9 | §0.12 #4 | "\| "I guessed" everywhere (§7). One word for one idea; it is the plainer one. \|" → "\| "I guessed" everywhere (§7). One word for one idea; it is the plainer one. [settled: X-05] \|" | X-05 |
| 10 | §0.12 #5 | "\| Typing the amount, exactly as 09 §9.19.4 (§15 references it). \|" → "\| Typing the amount, exactly as 09 §9.19.4 (§15 references it). [settled: X-08] \|" | X-08 |
| 11 | §0.12 #11 | "Raising the purchase cap uses a plain confirm (§14 C-20). \|" → "Raising the purchase cap uses a plain confirm (§14 C-20). [settled: X-15] \|" | X-15 |
| 12 | §0.11 | "### 0.11 New tokens requested (for `02-foundations.md`) ⏎ " → "### 0.11 New tokens requested (for `02-foundations.md`) ⏎  ⏎ [settled: all tokens and icons below were added to `02-foundations.md` F2/F5/F6 on 2026-10-16; contrast re-checked] ⏎ " | task 1 |
| 13 | §0.10 | "### 0.10 Shortcuts this chapter adds (to be listed in 09-windows; 09 wins on a clash)" → "### 0.10 Shortcuts this chapter adds (to be listed in 09-windows; 09 wins on a clash) [settled: X-09; all listed in 09 §9.17.1]" | X-09 |

## `06-screens-1.md`

| # | Section | Before → After | Reason |
|---|---|---|---|
| 1 | §4 profile hero | "\| Hero \| 96px foo mark/face," → "\| Hero \| `--avatar-hero` (96px) foo mark/face," | Article 24 tokens |
| 2 | examples (dates) | "Fri 17 Oct" → "Sat 17 Oct" (×2) | X-10 |

## `06-screens-2.md`

| # | Section | Before → After | Reason |
|---|---|---|---|
| 1 | §6 Appearance | "(main, live window, receipt window)" → "(main, live window, sign-in window)" | X-02 |
| 2 | §6.4 p-send tooltip | ""I ask before each send. To skip asking for one person, tap Always on an approval card."" → ""I'll always ask before sending." [settled: X-03]" | X-03 |
| 3 | §6.4 Rules I follow | "**RULES I FOLLOW** (made when the user taps "Always" on an approval card, MUS §9.14) ⏎ - Each rule is a row: rule text `--t-body` ("Send emails to Rakesh without asking")," → "**RULES I FOLLOW** (made when the user taps "Always" on an approval card that allows scope: using an app, calendar changes, moving or labelling emails (05 §5.5.3); never for sends, bookings, payments, posts or deletes [s…" | X-03 |
| 4 | §6.4 Rules empty | ""No rules yet. When you tap Always on an approval card, it shows up here."" → ""No rules yet. When you tap Always on a card that asks to use an app, it shows up here."" | X-03 |
| 5 | §6.5 hello row | "\| `hello` \| "Confirm with Windows Hello for payments over" \|" → "\| `hello` \| "Confirm with Windows Hello for payments of at least" \|" | Article 7 (≥ ₹10,000), R-15 |
| 6 | examples (dates) | "Thu 16 Oct" → "Fri 16 Oct" (×7) | X-10 |
| 7 | examples (dates) | "Fri 17 Oct" → "Sat 17 Oct" | X-10 |
| 8 | examples (dates) | "Mon 6 Oct" → "Tue 6 Oct" | X-10 |
| 9 | §7.3 Row ⋯ menu | "\| Row ⋯ menu \| "Mark private" / "Not private"," → "\| Row ⋯ menu [X-06] \| "Mark private" / "Not private" (`memory:setPrivate`)," | X-06 |
| 10 | §7.3 Row ⋯ menu Move to | ""Move to…" ▸ People / Preferences / Places / Facts \|" → ""Move to…" ▸ People / Preferences / Places / Facts (sets `kind`, `memory:setKind`) \|" | X-06 |

## `06-screens-3.md`

| # | Section | Before → After | Reason |
|---|---|---|---|
| 1 | §19 shortcuts sheet | ""Show or hide details" — Ctrl+J ·" → ""Show or hide details" — Ctrl+Shift+D · "Jump to what needs you" — Ctrl+J ·" | X-21, X-09 |
| 2 | §19 shortcuts sheet note | "Ctrl+I, Ctrl+M, Ctrl+R and Ctrl+H are requested additions to 09 §9.17.1 (§0.10); until 09 lists them, the sheet hides those four rows." → "Ctrl+I, Ctrl+M, Ctrl+R, Ctrl+H, Ctrl+J and Alt+D are listed in 09 §9.17.1 [settled: X-09, X-21]; the sheet shows all rows." | X-09, X-21 |
| 3 | §11.4 Receipt window | "### 11.4 Receipt window ⏎  ⏎ **Purpose.** Review and approve a payment from a toast without opening the whole app (J20; 05 §5.6.5). **Entry:** payment toast "Review" (09 §9.9.3). One at a time. ⏎  ⏎ ``` ⏎ ┌─ title bar 32…" → "### 11.4 Receipt window (removed) ⏎  ⏎ There is no receipt window [settled: X-02]. Approval and Payment toasts carry only [ Review ] [ Not now ] (09 §9.9.3); Review brings the main window to the front with the card focus…" | X-02 |
| 4 | §15 Hello surfaces: Which window | "\| Which window \| the main window, or the receipt window (§11.4) when approving from a toast; that window is shown and restored before the prompt (09 step 5) \|" → "\| Which window \| the main window (also when the user came from a toast's Review [settled: X-02]); it is shown and restored before the prompt (09 step 5) \|" | X-02 |
| 5 | §15 conflict note | "09 owns the system prompt; 05 should align (logged)." → "09 owns the system prompt; 05 aligned [settled: X-08]." | X-08 |
| 6 | §9 activity expanded row | ""· from a rule: Send emails to Rakesh without asking"" → ""· from a rule: Let Trips use Calendar without asking" [X-03: rules never cover sends]" | X-03 |
| 7 | examples (dates) | "Sat 18 Oct" → "Sun 18 Oct" | X-10 |
| 8 | examples (dates) | "Thu 16 Oct" → "Fri 16 Oct" (×7) | X-10 |
| 9 | examples (dates) | "Tue 14 Oct" → "Wed 14 Oct" | X-10 |
| 10 | examples (dates) | "Wed 15 Oct" → "Thu 15 Oct" | X-10 |
| 11 | §18.2 diagram | "│ This is what will be sent. It has no messages, keys or passwords.     --t-body        │" → "│ This is what will be saved. It has no messages, keys or passwords.    --t-body        │" | X-12 |
| 12 | §18.2 diagram | "│                                                        [ Don't send ]  [ Send ]       │" → "│                                                        [ Not now ]  [ Save report ]   │" | X-12, X-04 |
| 13 | §18.2 states | "\| Ready \| as drawn; the preview is exactly the bytes that will be sent (09: nothing is sent automatically) \| ⏎ \| Sending \| Send shows spinner, "Sending…" \| ⏎ \| Sent \| body replaced by "Sent. Thank you." and the d…" → "\| Ready \| as drawn; the preview is exactly the redacted logs that will be saved. Nothing is ever uploaded [settled: X-12] \| ⏎ \| Saving \| Save report shows spinner, "Saving…" \| ⏎ \| Saved \| foo writes a .zip of the…" | X-12 |
| 14 | §18.2 note | "Where the report goes is not defined in 08/09 (logged as a gap)." → "Where the report goes: saved locally only, never uploaded [settled: X-12]." | X-12 |

## `07-journeys-1.md`

| # | Section | Before → After | Reason |
|---|---|---|---|
| 1 | examples (dates) | "Thu 16 Oct" → "Fri 16 Oct" | X-10 |
| 2 | examples (dates) | "Sat 18 Oct" → "Sun 18 Oct" | X-10 |
| 3 | examples (dates) | "Fri 12 Dec" → "Sat 12 Dec" | X-10 |
| 4 | 7.0.6 | "7.0.6 Example dates in the journeys follow the **2025** calendar (Fri 16 Oct, Sun 18 Oct, Sat 12 Dec). Code MUST compute weekdays from the real date. Tests that compare copy MUST pin the clock to **Thu 16 Oct 2025, 9:00 …" → "7.0.6 Example dates in this constitution follow the **2026** calendar (Fri 16 Oct, Sun 18 Oct, Sat 12 Dec) [settled: X-10]. Code MUST compute weekdays from the real date. Tests that compare copy MUST pin the clock to **F…" | X-10 |
| 5 | J21 summary | "Eleven sections: Your AI; What foo can do on its own (four chips per action; paying and sharing address or phone locked to "Ask me"; sends, bookings and deletes can never be "Do it"); Apps; Folders; Money and payments (c…" → "Eleven pages, named as in 06 §6 [settled: X-07]: Account & your AI; Appearance; Notifications (incl. quiet hours); Permissions (Always · Ask · Never per action and app, folders; paying, booking, sending, deleting and sha…" | X-07 |

## `07-journeys-2.md`

| # | Section | Before → After | Reason |
|---|---|---|---|
| 1 | R-20 | "the memory chip "🧠 Saved: Allergic to peanuts · Undo"" → "the memory chip "🧠 I'll remember: Allergic to peanuts · Undo" [settled: X-05]" | X-05 |
| 2 | R-10 | "(2) Settings → Money and payments gets "Monthly purchase limit"" → "(2) Settings → Money [X-07] gets "Monthly purchase limit"" | X-07 |
| 3 | examples (dates) | "Thu 16 Oct" → "Fri 16 Oct" (×4) | X-10 |
| 4 | examples (dates) | "Fri 12 Dec" → "Sat 12 Dec" | X-10 |
| 5 | examples (dates) | "Sat 18 Oct" → "Sun 18 Oct" (×2) | X-10 |
| 6 | examples (dates) | "Fri 17 Oct" → "Sat 17 Oct" | X-10 |
| 7 | examples (dates) | "Sun 14 Dec" → "Mon 14 Dec" | X-10 |
| 8 | R-08 | "\| R-08 \| Example weekdays follow the 2025 calendar while today is 2026. \| Article 30 (no guessing). \| Weekday names are always computed. Copy-comparison tests pin the clock to Thu 16 Oct 2025, 9:00 AM IST (§7.0.6). \…" → "\| R-08 \| Example weekdays follow the 2025 calendar while today is 2026. \| Article 30 (no guessing). \| Weekday names are always computed. Every example uses the 2026 calendar and copy-comparison tests pin the clock to…" | X-10 |
| 9 | §7.6 summary of new decisions | "R-08 (test clock 2025)" → "R-08 (test clock Fri 16 Oct 2026 [settled: X-10])" | X-10 |
| 10 | D-34 | "\| D-34 \| J19.5 \| Safe mode after 3 crashes in 10 min; report shown redacted before sending \| Adopted \|" → "\| D-34 \| J19.5 \| Safe mode after 3 crashes in 10 min; report shown redacted before saving; saved to `Documents\foo\reports\`, never uploaded [settled: X-12] \| Adopted (amended) \|" | X-12 |
| 11 | job state machine WORKING→NEEDS YOU | "\| NEEDS YOU \| Badge ✋, chat row pill" → "\| NEEDS YOU \| Badge ⏳ [settled: X-17, SM-A1], chat row pill" | X-17 |
| 12 | R-12 | "Choice toasts keep [ {Best fit} ] [ Open ]. See R-34. \| no (decided in 09) \|" → "Choice toasts keep [ {Best fit} ] [ Open ]. See R-34. [settled: X-02] \| no (decided in 09) \|" | X-02 |
| 13 | R-13 | "Journey decision D-20 is withdrawn. \| yes \|" → "Journey decision D-20 is withdrawn. [settled: X-03] \| yes \|" | X-03 |
| 14 | R-21 | "[ Try again ]. See R-34. \| no (decided in 03) \|" → "[ Try again ]. See R-34. [settled: X-13] \| no (decided in 03) \|" | X-13 |

## `08-functions-and-engine-1.md`

| # | Section | Before → After | Reason |
|---|---|---|---|
| 1 | §1.2 process diagram | "│        │  + RENDERER "receipt" (small always-on-top window for payments from toasts, J20) — same preload, receipt:* only         │" → "│        │  (no second renderer: toast "Review" opens the card in the main window [settled: X-02])                                 │" | X-02 (coordinator) |
| 2 | §2.1 process table | "\| Renderer `receipt` \| Main, on toast "Review" for a payment \| 0–1 \| One Payment card \| Closed; card stays PENDING in chat \| ⏎ " → "(removed)" | X-02 (coordinator) |
| 3 | §2.3 Shutdown | "Windows shutdown: `powerMonitor 'shutdown'` + `win.setShutdownBlockReason` text "Finishing the {job title} job" only while a job is WORKING (J20), max 5 s, then same pause path." → "Windows shutdown: on `powerMonitor 'shutdown'` the engine immediately runs `jobs.pauseAll(reason:"windows_shutdown")` → jobs WAITING, without blocking shutdown (no `setShutdownBlockReason`); payments with `submittedAt` s…" | 09 §9.24 #7 (coordinator) |
| 4 | §3.1.1 IPC origin rule | "or whose window is not `main` (except `receipt:*` from the receipt window), or" → "or whose window is not `main`, or" | X-02 |
| 5 | §3 IPC table | "\| `receipt:get` / `receipt:close` \| `{ cardId }` \| `CardRow` / `void` \| — \| J20 \| 7 \| ⏎ " → "(removed)" | X-02 (coordinator) |
| 6 | § DB schema approvals | "approved_via IN ('card','receipt_window','draft_send','rule')" → "approved_via IN ('card','draft_send','rule')" | X-02 |
| 7 | § DB schema jobs.waiting_reason | "'asleep','app_quit','slot')" → "'asleep','app_quit','windows_shutdown','slot')" | 09 §9.24 #7 (coordinator) |
| 8 | §4.3.9 memory_index | "  category TEXT,                                            -- 'food','travel','health','money','people','style',… ⏎ " → "  category TEXT,                                            -- 'food','travel','health','money','people','style',… ⏎   kind TEXT NOT NULL DEFAULT 'fact' CHECK (kind IN ('person','preference','place','fact')),  -- Memory …" | X-06 |
| 9 | §3 IPC memory | "\| `memory:forget` \| `{ factId }` \| `{ undoToken: string }` \| — \| J17 \| 15 \|" → "\| `memory:setPrivate` \| `{ factId; private: boolean }` \| `MemoryRow` \| — \| J17, 06 §7 "Mark private" [X-06] \| 15 \| ⏎ \| `memory:setKind` \| `{ factId; kind: "person" \\| "preference" \\| "place" \\| "fact" }` \| `…" | X-06 |
| 10 | examples (dates) | "Sat 18 Oct" → "Sun 18 Oct" | X-10 |
| 11 | §1.1 stack: speech-to-text | "\| Local speech-to-text \| `whisper.cpp` CLI binary + multilingual `base` model, bundled \| J7 "local first for privacy"; see §18 \|" → "\| Local speech-to-text \| `whisper.cpp` CLI binary bundled; the multilingual `base` model (about 150 MB) downloads on the first voice note, not bundled [settled: X-18] \| J7 "local first for privacy"; see §18 \|" | X-18 (coordinator) |
| 12 | §1.1 stack: packaging | "\| Packaging \| electron-builder NSIS, per-user, no admin \| FOO-PLAN §2; J1 \|" → "\| Packaging \| electron-builder NSIS, per-user, no admin; installer, `foo.exe` and every native addon code-signed (Azure Trusted Signing or EV); an unsigned build MUST NOT ship (09 §9.3 Signing) \| FOO-PLAN §2; J1; 09 \…" | 09 signing rule (coordinator) |

## `08-functions-and-engine-2.md`

| # | Section | Before → After | Reason |
|---|---|---|---|
| 1 | payment state machine | "APPROVED (approved_via card\|receipt_window)" → "APPROVED (approved_via card) [settled: X-02]" | X-02 |
| 2 | §10 payment gate | "foo-native.verifyUser("Confirm it's you to pay ₹{total} to {payee}")   # J10 exact copy" → "foo-native.verifyUser("Approve paying {amount} to {payee}")   # 09 §9.19.3 copy [settled: X-08]" | X-08 |
| 3 | §9.5 Scopes and rules | "Scope chips appear only for non-hard approvals of `send` to a known recipient and for app use (J C4)." → "Scope chips appear only for using an app, adding/changing calendar events and moving or labelling emails (05 §5.5.3); never for send, book, buy, pay, post, delete or share [settled: X-03]." | X-03 |
| 4 | §9.5 Scopes and rules | "`always` = `Rule { id, verb, match: { recipientAddress? , app? }, createdAt, source: 'card' \\| 'offer' }`" → "`always` = `Rule { id, verb, match: { app?, calendarId? }, createdAt, source: 'card' }`" | X-03 |
| 5 | §9.5 Scopes and rules | " The per-person offer "Next time, send emails to {name} without asking?" is shown once per recipient after the first successful send (G15 → `suggestions` table)." → " There is no per-person send offer (J12 step 7 and D-20 withdrawn) [settled: X-03]." | X-03 |
| 6 | § tool table memory.propose | "`{ text; source: "you_said" \\| "i_guessed"; evidenceMessageIds: string[]; category }`" → "`{ text; source: "you_said" \\| "i_guessed"; evidenceMessageIds: string[]; category; kind: "person" \\| "preference" \\| "place" \\| "fact" }` [X-06]" | X-06 |
| 7 | examples (dates) | "Fri 12 Dec" → "Sat 12 Dec" (×2) | X-10 |
| 8 | §6.6 install claude-cli | "\| vendor's official Windows installer, run hidden, target `{LOCAL}\ai-tools\claude\` \|" → "\| no: open the maker's install page; foo never installs silently [settled: X-18]; re-run `detect()` when the window regains focus \|" | X-18 |
| 9 | §6.6 install codex-cli | "\| vendor's standalone Windows release binary; SHA-256 checked against the release manifest \|" → "\| no: open the maker's install page [settled: X-18] \|" | X-18 |
| 10 | §6.6 install gemini-cli | "\| npm package installed with foo's Electron-as-Node into `{LOCAL}\ai-tools\gemini\` \|" → "\| no: open the maker's install page [settled: X-18] \|" | X-18 |

## `08-functions-and-engine-3.md`

| # | Section | Before → After | Reason |
|---|---|---|---|
| 1 | §15.3 toasts | "Review opens the card — for payments the small always-on-top receipt window (`receipt:*`) — where the real tap" → "Review opens the card in the main window [settled: X-02] — where the real tap" | X-02 |
| 2 | §12.2 parser | "optional `from …` reason, optional `private`, and the id." → "optional `from …` reason, optional `kind` (`person`\|`preference`\|`place`\|`fact`; when missing it is derived from the file: `people\` → person, `preferences\` → preference, otherwise fact) [settled: X-06], optional `pr…" | X-06 |
| 3 | §12.3 heading | "### 12.3 Provenance rules ("you said" vs "I concluded"; TAB §9.10)" → "### 12.3 Provenance rules ("You said" vs "I guessed" [settled: X-05]; TAB §9.10)" | X-05 |
| 4 | §12.4 review act | "evidenceMessageIds: string[]; reason?: string; category: string; private: boolean }" → "evidenceMessageIds: string[]; reason?: string; category: string; kind: "person" \| "preference" \| "place" \| "fact"; private: boolean }" | X-06 |
| 5 | §12.4 chip copy | ""🧠 Saved: {fact} · Undo" (you said) or "🧠 I noticed {fact}. Saved · Undo" (I guessed)" → ""I'll remember: {fact} · Undo" (you said) or "I'll remember: {fact} · I guessed · Undo" (I guessed), with the `Brain` icon (05 §5.17) [settled: X-05]" | X-05 |
| 6 | 22.2 injected Clock | "`Clock` (now, timers — fake clock drives expiry, routines, quiet hours, catch-up)" → "`Clock` (now, timers — fake clock drives expiry, routines, quiet hours, catch-up; copy tests start it at Fri 16 Oct 2026, 9:00 AM IST [X-10])" | X-10 |
| 7 | §19 network allowlist | "(d) "Send a report" after the redacted preview (J19.5)." → "("Send a report" uploads nothing: it saves a redacted .zip to `Documents\foo\reports\` [settled: X-12])." | X-12 |
| 8 | §23.1 G-08-01 | "\| 22H2 minimum (binding coordinator decision) \|" → "\| 22H2 minimum (binding coordinator decision) [settled: X-14] \|" | X-14 |
| 9 | §23.1 G-08-04 | "\| `com.foo.desktop` (§15.3) \|" → "\| `com.foo.desktop` (§15.3) [settled: X-14] \|" | X-14 |
| 10 | §23.1 G-08-05 | "\| toasts show [ Review ] [ Not now ] (§15.3) \|" → "\| toasts show [ Review ] [ Not now ] (§15.3) [settled: X-02] \|" | X-02 |
| 11 | §23.1 G-08-03 | "\| treated as "Ask me" (§9.4.1) \|" → "\| treated as "Ask me" (§9.4.1) [settled: X-03; 06 §6.4 has no "Do it when I say"] \|" | X-03 |
| 12 | §18.1 voice in | "Transcription: bundled `whisper-cli.exe` + `ggml-base` multilingual model (Hindi/Punjabi/English)," → "Transcription: bundled `whisper-cli.exe` + `ggml-base` multilingual model (Hindi/Punjabi/English), the model downloaded on the first voice note to `{LOCAL}\voice-model\` (SHA-256 checked; the voice note waits with "Getti…" | X-18 (coordinator) |
| 13 | §23.2 open questions | "### 23.2 Open questions only Vikas can answer" → "### 23.2 Open questions only Vikas can answer ⏎  ⏎ Until Vikas answers, DECISIONS X-18 sets the v1 defaults: O-1 testers only (≤ 100 named), O-2 keep WhatsApp with a plain risk note and one-tap unlink, O-3 Outlook specif…" | X-18 |

## `09-windows.md`

| # | Section | Before → After | Reason |
|---|---|---|---|
| 1 | §9.17.1 App | "\| Ctrl+J \| Show / hide details (right shell) \| HRM §17 `[exact]` \|" → "\| Ctrl+Shift+D \| Show / hide details (right shell) \| HRM §17 used Ctrl+J; moved so Ctrl+J can jump to cards [settled: X-21] \| ⏎ \| Ctrl+J \| Jump focus to the oldest card in this chat that needs you (`05` §0); none: …" | X-09, X-21 |
| 2 | §9.19.4 typed-amount dialog | "Dialog (`06` dialog style, width 400), title "Confirm this payment"" → "Dialog (`06` dialog style, width `--dialog-sm` 400px), title "Confirm this payment"" | Article 24 tokens |
| 3 | §9.8.2 first close | "foo shows a small dialog (`06` dialog style, width 400):" → "foo shows a small dialog (`06` dialog style, width `--dialog-sm` 400px):" | Article 24 tokens |
| 4 | §9.7 start at login settings row | "\| Settings row \| Settings → General: "Open foo when I sign in to Windows" (toggle) \| J21 \|" → "\| Settings row \| Settings → Account & your AI: "Start foo when I sign in to Windows" (toggle, `06` §6.1 `start-login`) [settled: X-07] \| J21 \|" | X-07 |
| 5 | §9.8.2 close choice | "Settings → General row "When I close the window"" → "Settings → Account & your AI row "When I close the window" (`06` §6.1 `close-choice`) [settled: X-07]" | X-07 |
| 6 | §9.9 toast AI cap | "[ Raise cap ] → Settings → AI spend \|" → "[ Raise cap ] → Settings → Money [settled: X-07] \|" | X-07 |
| 7 | §9.19.1 Hello threshold | "Settings → Money and payments: "Confirm with Windows Hello for payments over {amount}" with an amount field;" → "Settings → Money: "Confirm with Windows Hello for payments of at least" + amount field (`06` §6.5 `hello`) [settled: X-07; R-15 "₹10,000 or more"];" | X-07, R-15, Article 7 |
| 8 | §9.21 graphics | "Settings → General shows "Smooth graphics are off because they caused problems on this PC."" → "Settings → Account & your AI (`graphics` row) shows "Smooth graphics are off because they caused problems on this PC." [X-07]" | X-07 |
| 9 | §9.23 uninstall | ""Delete everything" inside foo (Settings → Your data)" → ""Delete everything" inside foo (Settings → Privacy) [X-07]" | X-07 |
| 10 | §9.4 registration | "uninstall entry (Settings → Apps)," → "uninstall entry (Windows Settings → Apps)," | clarity: Windows' own Settings, not foo's (X-07) |
| 11 | §9.8.4 tray menu | "\| "Pause routines for 1 hour" / "Resume routines" \| \| toggles; paused state shows in Routines (`06`) \| ⏎ \| "Quiet until {day date}, 7:00 AM" / "End quiet time" \| \| starts quiet hours now until the next configured …" → "\| "Pause routines until {10:00 AM, Fri 16 Oct}" (now + 1 hour) / "Resume routines" \| \| toggles; paused state shows in Routines (`06`); label uses the absolute time (Article 21) \| ⏎ \| "Quiet until…" ▸ submenu / "End …" | X-11, Article 21 |
| 12 | §9.21 crash reports | ""Send a report" first shows the exact redacted file: "This is what will be sent. It has no messages, keys or passwords." [ Send ] [ Don't send ] (J19.5). Nothing is sent automatically." → ""Send a report" first shows the exact redacted file: "This is what will be saved. It has no messages, keys or passwords." [ Save report ] [ Not now ] (J19.5). It never uploads anything: it saves a .zip with the redacted …" | X-12 |
| 13 | §9.24 #1 | "\| one stable reverse-domain id; `07`/`08` must use the same string \|" → "\| one stable reverse-domain id; `07`/`08` must use the same string [settled: X-14] \|" | X-14 |
| 14 | §9.24 #3 | "\| WIN M26; Article 6 approvals are deliberate taps on the card; the brief: "approval toast opens the card" \|" → "\| WIN M26; Article 6 approvals are deliberate taps on the card; the brief: "approval toast opens the card" [settled: X-02] \|" | X-02 |
| 15 | §9.24 #4 | "\| one place to approve; fewer windows for a non-technical user; `06` need not build a receipt window \|" → "\| one place to approve; fewer windows for a non-technical user; `06` need not build a receipt window [settled: X-02] \|" | X-02 |
| 16 | §9.24 #5 | "UI copy rules in §9.18 still apply. \|" → "UI copy rules in §9.18 still apply. [settled: X-16] \|" | X-16 |
| 17 | §9.24 #6 | "\| 6 \| WIN §16.4 fallback "Type APPROVE" \| type the exact amount \| Article 7 \|" → "\| 6 \| WIN §16.4 fallback "Type APPROVE" \| type the exact amount \| Article 7 [settled: X-08] \|" | X-08 |
| 18 | §9.24 #10 | "\| Win10 22H2+ \| supported Windows only \|" → "\| Win10 22H2+ \| supported Windows only [settled: X-14] \|" | X-14 |

## `10-acceptance-1.md`

| # | Section | Before → After | Reason |
|---|---|---|---|
| 1 | AT-002 | "Settings → Files shows "Saved to {path} because your Documents folder is online-only."" → "Settings → Permissions → "Where I save files" shows "{foo files} · Saved here because your Documents folder is online-only." (06 §6.4 `f-save`) [X-07]" | X-07 |
| 2 | examples (dates) | "Fri 17 Oct" → "Sat 17 Oct" | X-10 |
| 3 | examples (dates) | "Thu 16 Oct" → "Fri 16 Oct" | X-10 |
| 4 | A.6 test environment | "- Clock pinned to **Thu 16 Oct 2025, 9:00 AM IST** for copy-comparison tests" → "- Clock pinned to **Fri 16 Oct 2026, 9:00 AM IST** [settled: X-10] for copy-comparison tests" | X-10 |

## `10-acceptance-2.md`

| # | Section | Before → After | Reason |
|---|---|---|---|
| 1 | surface table Memory chip | "\| Memory chip (C14) \| Saved · Undo, I noticed · Undo, Used ✕, Forgot it, Not saving this one \| Undo and ✕ reachable \| "Saved to memory: Allergic to peanuts. Button: Undo" \| — \|" → "\| Memory chip (C14) \| I'll remember · Undo, I'll remember · I guessed · Undo, Used ✕, Forgot it, Not saving this one [X-05] \| Undo and ✕ reachable \| "Memory: I'll remember, Allergic to peanuts. Button: Undo" (05 §5.1…" | X-05 |
| 2 | G.14 | "Toasts, Settings → What foo can do)" → "Toasts, Settings → Permissions [X-07])" | X-07 |
| 3 | examples (dates) | "Thu 16 Oct" → "Fri 16 Oct" (×3) | X-10 |
| 4 | examples (dates) | "Sat 18 Oct" → "Sun 18 Oct" | X-10 |

## `GAPS.md`

Appended 13 entries dated 2026-10-16 (trains/flights, PRD metrics 6–10, Article 21 example date, X-11 time order, tray quiet options, voice-model download copy, Ctrl+I, Ctrl+Enter on approval cards, raw component px, rule example copy, Cancel vs Not now, memory `kind` default, "[Lock 16]" diagram shorthand).

## Coordinator follow-ups
- 01-articles Art. 21 example → "Sat 12 Dec"; Art. 24 clarified [X-23]
- DECISIONS X-11 day-first tray times; added X-22, X-23
- 09/08 tray times day-first; voice download copy [X-22]
- 2026-10-16 · New files `02-foundations-2.md` (F11–F20) and `02-foundations-3.md` (F21–F31 + "Conflicts for the editor", 13 rows; owner taste choices): layout, layers, scrolling, icons, brand and faces, empty states, pictures, emoji, numbers/money/dates, loading, feedback, sound, voice and tone, languages, accessibility depth, state matrix, pointer/tooltips, theming/accent, token files; no existing chapter edited

## Editor pass 2 (2026-10-16): foundations conflicts, X row, README

Applies `02-foundations-3.md` "Conflicts for the editor" rows 1–4, 6–10, 13 (rows 11–12 need no edit; row 5 cursor pending owner choice), the X mismatch (06-2 §6.8 vs 08 §16.3; research/capabilities.md §7 V1-6) and README coverage of `02-foundations-2/3.md` and research files. Reasons: X-24…X-34; "task n" = editor brief.

### `02-foundations.md`

| # | Section | Before → After | Reason |
|---|---|---|---|
| 1 | F2 intro | "All pairs pass WCAG AA (4.5:1 for text, 3:1 for icons/borders that carry meaning); ratios were computed for this file." → "Text pairs pass WCAG AA (4.5:1) and icons and control edges pass 3:1; the computed ratios are in §F25.1 (`02-foundations-3.md`). `--line` and `--line-strong` are decorative edges (below 3:1); the edge of a text field, checkbox, radio or toggle-off track use…" | X-24, X-25 (conflicts 1–2) |
| 2 | F2 Neutrals `--line-strong` / new `--line-input` | "\| `--line-strong` \| `#D4D4DD` \| `#34343E` \| input borders, focused-card border base \|" → "\| `--line-strong` \| `#D4D4DD` \| `#34343E` \| secondary button borders, focused-card border base (not field edges) [X-25] \| ⏎ \| `--line-input` \| `#85858F` \| `#70707C` \| edge of text fields, checkboxes, radios and toggle-off tracks (≥ 3.2:1 on app, su…" | X-25 (conflict 2) |
| 3 | F2 Text `--fg-3` | "\| `--fg-3` \| `#6E6E7A` \| `#8E8E9A` \| 5.0 on white, 4.6 on sidebar / 6.0 \| timestamps, placeholders, hints \|" → "\| `--fg-3` \| `#696975` \| `#8E8E9A` \| 5.41 on white, 4.98 on sidebar, 4.76 on sunken, 4.56 on hover / 6.0 [X-24] \| timestamps, placeholders, hints \|" | X-24 (conflict 1) |
| 4 | F1 Rules | "- Use `text-wrap: pretty` on message text and `balance` on titles." → "- Use `text-wrap: pretty` on message text and `balance` on titles. ⏎ - Nirmala UI has no 600 or 800 weight, so Indic text in a 600/800 role renders Bold (700); accepted. Base styles set `font-synthesis: none` so no fake bold or italic is drawn (§F24) [X-31]." | X-31 (conflict 9) |
| 5 | F6 Set | "Filled variant only for the selected state of a toggle. `[AIC #46; MSG]`" → "Filled variant only where §F14.3 (`02-foundations-2.md`) says: an icon toggle that is on, the selected Settings nav item, and 16px status icons in pills [X-28]. `[AIC #46; MSG]`" | X-28 (conflict 6) |

### `02-foundations-2.md`

| # | Section | Before → After | Reason |
|---|---|---|---|
| 1 | F14.7 App icon evidence | "09 §9.2 lists 8 of them (see Conflicts)" → "09 §9.2 lists all 14 [X-27]" | X-27 (conflict 4) |
| 2 | F16.3 E-13 icon | "`Clock` (06 wording; §F14.5 would use `ArrowRepeatAll`, see Conflicts)" → "`ArrowRepeatAll` [X-29]" | X-29 (conflict 7) |

### `02-foundations-3.md`

| # | Section | Before → After | Reason |
|---|---|---|---|
| 1 | F25.1 `--fg-3` on app | "\| `--fg-3` on `--bg-app` / `--bg-raised` \| 5.03 \| 5.29 \| yes \|" → "\| `--fg-3` on `--bg-app` / `--bg-raised` \| 5.41 \| 5.29 \| yes \|" | X-24 |
| 2 | F25.1 `--fg-3` on sidebar | "\| `--fg-3` on `--bg-sidebar` \| 4.62 \| 5.72 \| yes \|" → "\| `--fg-3` on `--bg-sidebar` \| 4.98 \| 5.72 \| yes \|" | X-24 |
| 3 | F25.1 `--fg-3` on sunken | "\| **`--fg-3` on `--bubble-foo` / `--bg-sunken`** (foo bubble time, field placeholders) \| **4.43** \| 4.99 \| **light fails** (Conflict 1) \|" → "\| `--fg-3` on `--bubble-foo` / `--bg-sunken` (foo bubble time, field placeholders) \| 4.76 \| 4.99 \| yes (was 4.43 with `#6E6E7A`; fixed by X-24) \|" | X-24 |
| 4 | F25.1 `--fg-3` on hover | "\| **`--fg-3` on `--bg-hover`** (row time on hover) \| **4.23** \| 4.88 \| **light fails** (Conflict 1) \|" → "\| `--fg-3` on `--bg-hover` (row time on hover) \| 4.56 \| 4.88 \| yes (was 4.23 with `#6E6E7A`; fixed by X-24) \|" | X-24 |
| 5 | F25.1 `--line-strong` edge | "\| **`--line-strong` as the only edge of a text field, toggle track or checkbox** \| **1.47** \| **1.58** \| **fails 3:1** (Conflict 2) \|" → "\| `--line-strong` as the only edge of a text field, toggle track or checkbox \| 1.47 \| 1.58 \| fails 3:1, so not used there (X-25) \|" | X-25 |
| 6 | F25.1 `--line-input` | "\| New `--line-input` (`#85858F` / `#70707C`) on app / sunken / sidebar \|" → "\| `--line-input` (`#85858F` / `#70707C`) on app / sunken / sidebar [X-25] \|" | X-25 |
| 7 | F26 footnote | "\* `--line-input` and the `--fg-3` light value depend on Conflicts 1 and 2; until the editor rules, build with `--line-strong` and the current `--fg-3`, behind the token names so the fix is one line." → "\* `--line-input` and the light `--fg-3` value `#696975` are settled (Conflicts 1 and 2) [X-24, X-25]." | X-24, X-25 |
| 8 | F29.3 tokens.json example | ""$value": "#6E6E7A"," → ""$value": "#696975"," | X-24 |
| 9 | F29.3 generated CSS example | "  --fg-3: #6E6E7A;" → "  --fg-3: #696975;" | X-24 |
| 10 | F29.6 `--line-input` | "\| `--line-input` (pending Conflict 2) \|" → "\| `--line-input` [X-25] \|" | X-25 |
| 11 | Conflicts for the editor (ruling line) | "\| 13 \| New copy rows E-1, E-2, E-26, E-27, E-28 in §F16.3 \| Owned by 04, 06-3 and 06-1, which have no such states yet. \| Editor copies them into the owning chapters as written. \|" → "\| 13 \| New copy rows E-1, E-2, E-26, E-27, E-28 in §F16.3 \| Owned by 04, 06-3 and 06-1, which have no such states yet. \| Editor copies them into the owning chapters as written. \| ⏎  ⏎ Editor ruling (2026-10-16): rows 1–4, 6–10 and 13 applied [X-24…X-33…" | task 1 |

### `06-screens.md`

| # | Section | Before → After | Reason |
|---|---|---|---|
| 1 | §0.4 Text field | "bg `--bg-sunken`, 1px `--line-strong`, text `--fg-1`, placeholder `--fg-3`" → "bg `--bg-sunken`, 1px `--line-input` [X-25], text `--fg-1`, placeholder `--fg-3`" | X-25 (conflict 2) |
| 2 | §0.4 Toggle (off) | "off: bg `--bg-sunken`, 1px `--line-strong`, knob 12px" → "off: bg `--bg-sunken`, 1px `--line-input` [X-25], knob 12px" | X-25 (conflict 2) |
| 3 | §0.4 new Checkbox and Radio rows | "\| **Segmented control** (e.g. Always / Ask / Never)" → "\| **Checkbox** \| 20×20px box, `--r-xs`; hit area padded to 40×40 \| 1px `--line-input` [X-25], bg `--bg-app` · checked: bg `--accent`, `Checkmark` 16px `--on-accent` \| border `--fg-3` \| `--bg-pressed` fill \| ring around the box \| border `--fg-disabled…" | X-25 (conflict 2; values from 02 §F26) |

### `06-screens-1.md`

| # | Section | Before → After | Reason |
|---|---|---|---|
| 1 | §3 Face | "4 face buttons 48px (`--r-full`, glyph `--font-display` 24px in `--on-helper` on the chosen colour)" → "4 face buttons 48px (`--r-full`, on the chosen colour; symbol faces such as ✈ stored with U+FE0E, `--font-display` 24px in `--on-helper`; emoji faces such as 🧳 🌴 stored with U+FE0F, full colour, `--font-emoji` 24px; 02 §F15.5 types 2–3) [X-30]" | X-30 (conflict 8) |
| 2 | §4.3 Group profile, new Files row | "\| Privacy note \| Static row, `--t-small` `--fg-2` \|" → "\| Files \| as 4.1 "Files {Helper} made", for files made in this group \| Empty: "Files this group makes will show here." (02 §F16.3 E-27) [X-33] \| ⏎ \| Privacy note \| Static row, `--t-small` `--fg-2` \|" | X-33 (conflict 13) |

### `06-screens-2.md`

| # | Section | Before → After | Reason |
|---|---|---|---|
| 1 | §6.4 rules list | "(no confirm; 5s undo line "Removed. Undo" as §7.4)" → "(no confirm; the undo bar of 02 §F21.3: "Removed {rule}." + Link "Undo") [X-32]" | X-32 (conflict 10) |
| 2 | §7.4 Forget (one) | "undo bar appears at the bottom-centre of the content column for 5s: 48px, `--bg-raised`, `--shadow-16`, `--r-md`, text `--t-body` "Forgot "{Prefers window seats}"." + Link "Undo"." → "the undo bar of 02 §F21.3 (`--undo-h`, `--dur-undo`, `--z-undo`) shows "Forgot "{Prefers window seats}"." + Link "Undo" [X-32]." | X-32 (conflict 10) |
| 3 | §8.4 First time | "\| First time \| Empty block: icon Clock 24," → "\| First time \| Empty block: icon `ArrowRepeatAll` 24 [X-29]," | X-29 (conflict 7) |
| 4 | §6.8 X row | "\| **X** \| "{@handle} · Read posts and trends" / "Not connected" \| "Disconnect" / "Connect" \| note "Posting isn't in this version. I'll draft posts and you post them in X." \|" → "\| **X** \| "Drafts only" \| — (no Connect: X has no account connection, 08 §16.3) [X-34] \| note "Posting isn't in this version. I'll draft posts and you post them in X." \|" | X-34 (task 2; research/capabilities.md §7 V1-6) |

### `06-screens-3.md`

| # | Section | Before → After | Reason |
|---|---|---|---|
| 1 | §19 shortcuts sheet | "Ctrl+I, Ctrl+M, Ctrl+R, Ctrl+H, Ctrl+J and Alt+D are listed in 09 §9.17.1" → "Filter with no match (02 §F16.3 E-26): one line "No shortcut matches "{query}"." [X-33] ⏎  ⏎ Ctrl+I, Ctrl+M, Ctrl+R, Ctrl+H, Ctrl+J and Alt+D are listed in 09 §9.17.1" | X-33 (conflict 13) |

### `04-messages-and-composer.md`

| # | Section | Before → After | Reason |
|---|---|---|---|
| 1 | §9.1 Message menu | "padding 4px; items 36px tall, padding 0 12px" → "padding 4px; items min-height 40px (02 §F27.4) [X-26], padding 0 12px" | X-26 (conflict 3) |
| 2 | §19.5 System line | ""Messages from before Fri 16 Oct were deleted on this PC". Final copy" → ""Messages from before Fri 16 Oct were deleted on this PC", "Start of your chat with {name} · made {Fri 16 Oct 2026}" at the top of every chat's history (foo's chat: "Start of your chat with {agentName}"), and "Messages cleared on {Fri 16 Oct}. Running jobs …" | X-33 (conflict 13) |

### `04-messages-and-composer-2.md`

| # | Section | Before → After | Reason |
|---|---|---|---|
| 1 | §22.8 Filter | "then anywhere in the name; no match → the popover closes." → "then anywhere in the name; no match → the popover shows one line "No helper called "{text}"." `--t-small` `--fg-2` (02 §F16.3 E-28) [X-33]." | X-33 (conflict 13) |

### `03-shell-1.md`

| # | Section | Before → After | Reason |
|---|---|---|---|
| 1 | §3.4.9 Clear messages | "buttons "Clear messages" (`--bad`) / "Cancel" \|" → "buttons "Clear messages" (`--bad`) / "Cancel"; after clearing, the chat shows the 04 §19.5 system line "Messages cleared on {Fri 16 Oct}. Running jobs kept going." [X-33] \|" | X-33 (conflict 13) |

### `09-windows.md`

| # | Section | Before → After | Reason |
|---|---|---|---|
| 1 | §9.2 App icon | "\| App icon \| multi-size `.ico` with 16, 20, 24, 32, 40, 48, 64, 256 px: the foo "f" mark, `--fg-1` light value `#0B0B10` disc with a `#FFFFFF` "f" (the BP1 foo avatar) \| WIN §14 `[inferred sizes]`;" → "\| App icon \| multi-size `.ico` with 16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72, 80, 96, 256 px [X-27]: the foo "f" mark, `--fg-1` light value `#0B0B10` disc with a `#FFFFFF` "f" (the BP1 foo avatar), plus a `#3A3A44` rim (1px at 32px, 2px at 64px and up, …" | X-27 (conflict 4) |

### `00-README.md`

| # | Section | Before → After | Reason |
|---|---|---|---|
| 1 | Order of authority 3 | "3. **Foundations** in `02-foundations.md` (every token" → "3. **Foundations** in `02-foundations.md`, then `02-foundations-2.md` and `02-foundations-3.md` (F11–F31) (every token" | task 3 |
| 2 | Order of authority 7 | "7. Research evidence in `research/` and" → "7. Research evidence in `research/` (including `research/capabilities.md` and `research/features-catalogue.md`) and" | task 3 |
| 3 | Files table | "\| `02-foundations.md` \| Design tokens: every colour, size, font, radius, shadow, timing, icon \|" → "\| `02-foundations.md` \| Design tokens: every colour, size, font, radius, shadow, timing, icon \| ⏎ \| `02-foundations-2.md`, `02-foundations-3.md` \| Foundations F11–F31: layout grid, layers, scrolling, icons in depth, brand and faces, empty states, pictu…" | task 3 |
| 4 | Files table (research) | "\| `GAPS.md` \| Gaps found while writing or building (append only) \|" → "\| `research/capabilities.md`, `research/features-catalogue.md` \| Research evidence: computer use, browser use, connections and other capabilities (with proposed spec deltas); the features catalogue. Evidence only, never overrides a spec value \| ⏎ \| `GAP…" | task 3 |
| 5 | Read in this order 4 | "4. `02-foundations.md`: build the token file first (CSS custom properties, light and dark)." → "4. `02-foundations.md` → `02-foundations-2.md` → `02-foundations-3.md`: build the token file first (CSS custom properties, light and dark), then the F11–F31 rules (state matrix, empty states, icons, feedback, accessibility)." | task 3 |
| 6 | Read in this order 13 | "13. `GAPS.md` and `CHANGELOG.md`: known gaps and what the editor changed." → "13. `GAPS.md` and `CHANGELOG.md`: known gaps and what the editor changed. ⏎ 14. When you need the why behind a value: `research/capabilities.md` and `research/features-catalogue.md` (evidence only)." | task 3 |

### `DECISIONS.md`

| # | Section | Before → After | Reason |
|---|---|---|---|
| 1 | table | "(ends at X-23)" → "added X-24 … X-34 (one line each)" | task 4 |

### `GAPS.md`

| # | Section | Before → After | Reason |
|---|---|---|---|
| 1 | append | "(none)" → "3 lines: row 5 cursor pending owner choice; E-26 with no filter field; research X-number clash" | task 4 |

Pass 2 total: 41 logged edits.

- 2026-10-16 · `11-fidelity.md` added (new file, proposed, not yet approved by Vikas): "Build what is written": frozen spec-v1.0 with SHA-256 manifest and Change Requests, 241 UX golden references + Blueprint mocks (two-tier picture tests), copy.json exact-copy tests, token lint and spec-values table, journey/state-machine/traceability tests, milestone fidelity reports with an independent reviewer, drift policy, honest limits, Article 31 proposal and plan edits (foo-plan.md and 01-articles.md not edited). Reason: Vikas asked whether agents will build exactly what was designed.

## Living face pass (2026-10-16): foo's face = A · Two eyes [X-35…X-38]

Source: `research/living-face.md`; owner decision card 2026-10-16 10:23 UTC (Vikas chose A; B and C not adopted).

### `01-articles.md`

| # | Section | Before → After | Reason |
|---|---|---|---|
| 1 | Article 12 | "…No step finished for 3 minutes → "stuck" card. [G12; ChatGPT complaint]" → "…→ "stuck" card. The face too: foo's face shows only what is really running; it never shows a feeling the app's state doesn't back (02 §F15.9). [G12; ChatGPT complaint; X-35]" | X-35 (clarification approved with the face) |

### `02-foundations.md`

| # | Section | Before → After | Reason |
|---|---|---|---|
| 1 | F7 token table | (none) → new row "`--m-face-*` (blink … cross) \| values in §F15.9.2 \| living face moods [X-35]" | X-35 |
| 2 | F7 What animates | "Typing dots: three 6px dots, `--fg-3`, 1600ms loop, 160ms stagger, scale to 1.3 …" → "Living face moods (§F15.9.2 tokens). Typing dots next to foo's bubble are replaced by the 26px Thinking face (§F15.9.3 #5) [X-36]." | X-36 |
| 3 | F7 reduced motion | "typing dots become the static text "typing…"" → "the Thinking face and every other face mood hold a static pose (§F15.9.5; the chat header still says "typing…")" | X-36 |

### `02-foundations-2.md`

| # | Section | Before → After | Reason |
|---|---|---|---|
| 1 | Coverage table | "Avatar and face system (… helper identity) … §F15.4–F15.8" → "(… helper identity, living face) … §F15.4–F15.9" | X-35 |
| 2 | §F14.7 Tray icon | "owned by 09 §9.8.1" → "foo's living face in 6 states (§F15.9.6); owned by 09 §9.8.1 [X-37]" | X-37 |
| 3 | §F14.7 Toast app-logo | "the chat's avatar rendered by §F15.4 at 48px" → "the chat's face … at 48px, in the mood that caused the toast, §F15.9.6 [X-37]" | X-37 |
| 4 | §F15.1 Never | "… or use it as a helper's face." → "… or use it as a helper's face. The living face (§F15.9) is not the mark; the mark itself still never animates." | paste-ready amendment 1 |
| 5 | §F15.5 intro | "Checked in this order; the first that exists is shown." → + "For foo and helpers, a face the user picked (type 1, 2, 3 or 5) is shown; otherwise the living face (type 4) [X-38]." | X-38 |
| 6 | §F15.5 table | types "4 Letter … foo's own default letter is the lowercase "f" mark … drawn as a face" / "5 Fallback → type 4" → "4 **Living face** (default for foo and every helper; §F15.9)" / "5 Letter (the user; foo or a helper only if picked) … The "f" mark … is never used as a face" / "6 Fallback: foo and helpers type 4, the user type 5" | paste-ready amendment 2; X-38 |
| 7 | §F15.5.2 | "Faces never carry status dots in v1 (no online/offline presence; status is the row pill)." → "Faces carry no online/offline presence dots. A mood ring (§F15.9.1) is allowed, only for real job, card and connection state." | paste-ready amendment 3 |
| 8 | §F15.9 (new, after §F15.8) | (none) → "F15.9 Living face": F15.9.1 what it is (geometry, colours, ring, sizes, 26px legibility, brand mark, rename), F15.9.2 tokens, F15.9.3 18 moods with triggers mapped to job states (07-2 §4), card states (07-2 §5), connection, composer, clock; priority; rules a–e, F15.9.4 other faces, F15.9.5 reduced motion, F15.9.6 Windows assets, F15.9.7 accessibility and contrast themes, F15.9.8 performance. Direction A only. Additions to the research text: 26px legibility row, "seen" definition, WAITING has no mood, Speaking plays on top, rule e (row = header; tray = top priority across chats), cross-fade on the Welcome card instead of the splash, tray Paused/Setting up kept from 09 | X-35…X-38; research/living-face.md |
| 9 | §F20.6 | "or the typing dots" → "or the 26px Thinking face (§F15.9.3 #5, replacing the typing dots [X-36])" | X-36 |

### `02-foundations-3.md`

| # | Section | Before → After | Reason |
|---|---|---|---|
| 1 | §F25.4 row | "Typing dots \| bouncing \| static text "typing…"" → "Thinking face (replaces typing dots …) \| drift + slow blink \| static Thinking pose; chat header still says "typing…"" | X-36; amendment 5 |
| 2 | §F25.4 rows | (none) → 6 rows from §F15.9.5 (face blink…wake, Working ring, Happy/Celebrating, mood change, Speaking level, Asleep "z") | paste-ready amendment 5 |
| 3 | §F25.5 | (none) → row "Living face (§F15.9.7) → disc `Canvas` + `CanvasText` edge, eyes `CanvasText`, rings `Highlight` …" | X-35 |
| 4 | §F29.6 | (none) → 9 rows: `--face-eye-w/-h`, `--face-ring/-gap`, `--m-face-blink/-blink-slow`, `--m-face-look/-drift/-orbit/-scan`, `--m-face-once/-wake`, `--m-face-happy/-party/-react`, `--m-face-sorry/-stopped`, `--m-face-level`, `--m-face-cross` | task 2 |

### `03-shell-1.md`, `03-shell-2.md`

| # | Section | Before → After | Reason |
|---|---|---|---|
| 1 | 03-1 §3.4.5 chat row, Avatar | "`--avatar-list` 48, `--r-full`. foo: fill `--fg-1`, letter `--bg-app`. Helper: …" → "… Default face for foo and every helper: the living face (02 §F15.9 [X-35, X-38]) with its mood ring for this chat's real state; the ring may overhang the 48 box into the 12px gap. Letter faces (user-picked or the user's own): foo: …" | X-35, X-38 |
| 2 | 03-2 chat header, Avatar | "`--avatar-header` 40, same fill rules as rows; letter `--t-subtitle` 16." → "… same face rules as rows (living face with mood ring by default …; same mood as the row, §F15.9.3e); letter faces `--t-subtitle` 16." | X-35 |

### `04-messages-and-composer.md`, `04-messages-and-composer-2.md`

| # | Section | Before → After | Reason |
|---|---|---|---|
| 1 | 04 §12.4 Sender label | "26px avatar (`--avatar-inline`, `--r-full`, helper colour fill, initial …)" → "26px avatar (…; default the sender's living face, 02 §F15.9, showing only the Working and Needs you rings, no one-time animations (§F15.9.3d) [X-35]; letter faces: helper colour fill, initial …)" | X-35 |
| 2 | 04 §14.3 | heading "Typing bubble" → "Typing bubble (the Thinking face)"; "A foo bubble … 56×38px … three 6px dots … Reduced motion: the static text "typing…"" → "[X-36] The typing dots are withdrawn. The indicator is the replying speaker's 26px face in the Thinking mood … no bubble behind it, where foo's next bubble will appear (groups: sender-label row, static pose) in a 38px row … `aria-hidden` … only while a reply request is really in flight … Reduced motion: static Thinking pose. Every "typing bubble" in this chapter means this indicator." | X-36 |
| 3 | 04-2 acceptance (reduced motion) | "typing dots become "typing…"" → "the Thinking face holds its static pose (02 §F15.9.5) [X-36]" | X-36 |

### `06-screens-1.md`

| # | Section | Before → After | Reason |
|---|---|---|---|
| 1 | §2.1 Welcome, element row | "foo mark \| 96px circle …" → "foo mark → face \| 96px circle …; once shown, the mark cross-fades into foo's living face (`--m-face-cross` × 2) and plays Waking up once … Reduced motion: 83ms cross-fades, eyes shown open. `aria-hidden`." | X-35; §F15.9.6 |
| 2 | §2.3 Grid | + "Tile 1 is always foo's living face (02 §F15.9, resting with blink) [X-38]." | X-38 |
| 3 | §2.3 Generated faces | "4 generated faces in 4 different styles." → "Tile 1 stays the living face; tiles 2–4 are 3 generated faces in 3 different styles." | X-38 |
| 4 | §2.3 Preset faces | "1 letter-mark "f" (first letter of the chosen name) on `--fg-1` with `--bg-app` letter" → "1 the living face (two eyes) on `--fg-1` with `--bg-app` eyes (02 §F15.9) [X-38]" | X-38 |
| 5 | §2.3 Surprise me | "4 new generated faces, or 4 presets in a new colour order." → "3 new generated faces in tiles 2–4, or presets 2–4 in a new colour order; tile 1 (living face) stays." | X-38 |
| 6 | §2.3 Narrator | "Face {1} of 4, {letter f on dark}" → "Face {1} of 4, {two eyes on dark}" | X-38 |
| 7 | §3 Face row | "4 face buttons 48px …" → "The living face button first and pre-selected (02 §F15.9, eyes in `--on-helper` on the chosen colour) [X-38], then 4 face buttons 48px …" | X-38 |
| 8 | §3 Templates | header "Face options (first is default)" → "Face options (after the living face, which is the default)"; Blank "first letter of the name on the colour" → "the living face, then the first letter …"; + note "Every template's default face is the living face …" | X-38 |
| 9 | §4.2 Hero | "foo mark/face" → "foo's face (the living face by default, 02 §F15.9, never the "f" mark)" | X-38; §F15.1 |

### `09-windows.md`

| # | Section | Before → After | Reason |
|---|---|---|---|
| 1 | §9.8.1 Base mark | "Base mark \| the "f" mark: light taskbar `#0B0B10` disc / `#FFFFFF` f; …" → "Base face \| foo's living face (02 §F15.9.6) [X-37], not the "f" mark …; at 16px eyes 2 × 5px at x 5 and 9, y 4; static frames only; another picked face → that face circle-cropped with the same dots" | X-37 |
| 2 | §9.8.1 State dots | "State dots (bottom-right, 6px at 16 px …) \| Needs you `#F5B041`; Paused `#8E8E9A`; otherwise none" → "States (first match wins, across all chats): Offline (dashed outline, grey eyes) · Needs you `#F5B041` · Working `#8C9BFF` · Paused `#8E8E9A` · Done 10 s `#4ADE80` · Quiet hours (closed eyes) · Resting. Dot radius 2.6px at (13, 13) on the 16 grid, 0.8px knock-out ring" | X-37; §F15.9.6 |
| 3 | §9.8.1 Setting up / High contrast | "the mark at 50 % opacity" / "monochrome mark …" → "the face at 50 % opacity" / "monochrome face (disc outline and eyes) …" | X-37 |
| 4 | §9.9.2 App-logo override | "the chat's avatar rendered to a 48 × 48 PNG …; foo's chat uses the foo mark" → "the chat's face … in the mood that caused the toast, with its ring (Happy / Needs you / Sorry) [X-37], re-rendered per toast; foo's chat uses foo's face, never the "f" mark" | X-37 |
| 5 | §9.16 | "typing dots become "typing…"" → "face moods hold a static pose including the Thinking face that replaces typing dots (02 §F15.9.5) [X-36]" | X-36 |

### `10-acceptance-2.md`

| # | Section | Before → After | Reason |
|---|---|---|---|
| 1 | C.1 heading | "apply to EVERY row in C.2–C.6" → "… C.2–C.7" | task 5 |
| 2 | U-7 | ""typing…" text" → "static Thinking face instead of typing dots (X-36), static face poses (§F15.9.5)" | X-36 |
| 3 | C.7 (new) | (none) → "C.7 Living face (02 §F15.9)": C.7.1–C.7.13 (moods follow real state, priority, only real sources, typing indicator, reduced motion, high contrast, tray states, 26 px legibility, brand mark, toast logo, other faces, Narrator, groups) | task 5 |
| 4 | §D | (none) → ART-12c (face follows real state), ART-12d (no unbacked joy), ART-12e (stuck face) | task 5; Article 12 |
| 5 | §E | (none) → PERF-13 (living faces idle < 1 % CPU; paused when minimised/locked/out of view) | task 5; §F15.9.8 |
| 6 | §G | G.4 + "typing (Thinking face), every living-face mood"; (none) → G.15 living-face render set | task 5 |

### `DECISIONS.md`, `GAPS.md`, `00-README.md`, `research/living-face.md`

| # | Section | Before → After | Reason |
|---|---|---|---|
| 1 | DECISIONS table | (ends at X-34) → added X-35 (face = A · Two eyes), X-36 (typing dots withdrawn → Thinking face), X-37 (tray and toast faces), X-38 (living face is the default face) | task 6 |
| 2 | GAPS | (none) → 10 lines: group animation and Celebrating cap pending owner; WAITING has no mood; "seen" defined; Speaking priority; Welcome instead of splash; tray with a picked face; picker 3 generated faces; tray dot contrast on light taskbar; 06-1 diagrams not redrawn | task 6 |
| 3 | 00-README files table | "brand and faces" → "brand and faces (including foo's living face, §F15.9)"; research row + `research/living-face.md` | task 6 |
| 4 | research/living-face.md | (none) → status line under the title: "Decided 2026-10-16: Vikas chose A … Adopted as §F15.9 [X-35…X-38]; B and C below are history only." | history kept, marked |

Living face pass total: 45 logged edits.

## Owner answers pass (2026-10-16): Vikas's 13 answers [X-39…X-52]

Source: Vikas's pasted answers from the decision guide (https://claude.ai/artifact/7jJgyhd3txrB7oELA5YCVi), 2026-10-16 11:40 UTC. Where he left details open (voice through OpenAI, cloud internet tools, the connections hub), the coordinator's defaults are recorded and marked "default picked by Claude, Vikas can change" (X-43, X-46, X-49). research/web-tools.md's spec deltas WT-1…WT-11 assumed the all-local option he rejected; they are applied in adapted form (cloud with the user's own keys, local fallback).

| File | Section | Before → After | Reason |
|---|---|---|---|
| `DECISIONS.md` | intro, X-18, X-22, new rows | (ends at X-38) → X-39 Gmail testers first · X-40 WhatsApp kept · X-41 Outlook v1.1 · X-42 AI apps linked · X-43 voice: OpenAI first, local pack backup · X-44 unsigned tester builds · X-45 R25–R31 in v1 · X-46 cloud internet tools, own keys · X-47 apps on screen v1.1 · X-48 Google Contacts v1 · X-49 hub (Composio, Zapier) v1.1 · X-50 phone texting v1.1 · X-51 taste picks · X-52 15 choices kept; X-18 gains "answered by … X-39–X-43, X-47"; X-22 applies only when the local pack is needed | Q1–Q13 |
| `08-functions-and-engine-1.md` | §1.1 stack | "Local speech-to-text: whisper.cpp … downloads on the first voice note" → "Speech-to-text: OpenAI transcription first … whisper.cpp backup downloaded on the first voice note that needs it"; new rows "Web tools" and "Connections hub (v1.1)"; Packaging: "an unsigned build MUST NOT ship" → signed before anyone outside the test group, tester builds may be unsigned | X-43, X-46, X-49, X-44 |
| `08-functions-and-engine-1.md` | §1.2 diagram, §4.3 DDL, §4.4 settings | connectors line + contacts and (v1.1) hub; new `web/` line; `ai_turns.purpose` + 'voice','web','hub'; new table `site_recipes`; `settings.chat.voiceToText/openAiKeyOffered/transcribeModel`, `connections.contacts`, `connections.web`, `flags.{screenHands,hub,outlook}` | X-43, X-46, X-47–X-49 |
| `08-functions-and-engine-2.md` | §5.10, §6.6, §6.8 | new item 6 (voice and web tools counted in the spend meter and cap; local path at the cap); install rows "X-18" → "X-18, confirmed X-42"; `pricing.json` + `voice` and `web` rows | X-42, X-43, X-46 |
| `08-functions-and-engine-2.md` | §8.1, §8.2, §8.3.4, §8.3.5, new §8.3.10–§8.3.12, §8.4, §8.5, §8.6 | ladder adds contacts, hub (v1.1) and public cloud reading; `web.search` Bing-only → Exa/Tavily with silent Bing/DuckDuckGo fallback; `web.fetch` → Firecrawl with Readability fallback; new tools `web.browseCloud`, `contacts.search`, `hub.call` (v1.1); snapshot gains accessibility tree, cross-site frames and diffs; actions gain expected change and watchdogs; new hand-back sites, site recipes (never replay the commit click), cloud web tool rules; no CAPTCHA solving; screen rung v1.1 note; 9 new function rows | X-46, X-47, X-48, X-49; WT-1…WT-7, WT-11 adapted; capabilities V1-2, V1-4 |
| `08-functions-and-engine-2.md` | §9.2, §9.6, §11.2, §11.3, §11.4 | hub tools take the manifest class, cloud tools read only; "page asked" flag; vault rows `foo/web/*`, `foo/conn/hub/*`, OpenAI key shared with voice; `vault.use` purposes + voice_call, web_tool, hub_call; new choke point R11 (cloud requests, voice transcripts) | X-43, X-46, X-49 |
| `08-functions-and-engine-3.md` | §16.1, §16.2, §16.4, new §16.7, §16.8, §16.6 | Google scopes + `contacts.readonly`, testers-only line; Outlook "off until Vikas decides" → "off in v1, on in v1.1"; WhatsApp kept + v1.1 phone texting; new Google Contacts and Connections hub sections; function rows | X-39–X-41, X-48–X-50 |
| `08-functions-and-engine-3.md` | §18.1, §19.2, §23.2 | voice transcription order (OpenAI → this PC → one-time key card); "What leaves the PC" + (b2) voice to OpenAI, (b3) web tools, (b4) hub v1.1; O-1…O-6 marked answered | X-43, X-46, X-49; capabilities V1-10 |
| `05-cards-2.md` | §5.8.4 | new variants "Voice key (one time)" with [ Save securely ] [ Use this PC instead ] and "Web tool key" | X-43, X-46 |
| `05-cards-3.md` | §5.11 | title + Contacts; new copy row "Connect your contacts" | X-48; capabilities V1-8 |
| `06-screens-2.md` | §6.2, §6.6, §6.8, §6.9, §6.11 | accent rule settled (indigo + Windows accent toggle); "What leaves this PC" gains one sentence per service that is on + "Change what leaves this PC" link; Connections: Contacts row, Outlook hidden in v1, Internet group (Faster search, Faster page reading, Browse public sites online), "Connect more apps" (v1.1); Chat and voice: VOICE NOTES TO TEXT rows; About: "tester build" label | X-41, X-43, X-44, X-46, X-48, X-49, X-51 |
| `02-foundations.md` | F0 accent, F8 cursor | accent evidence + "settled: X-51"; "Cursor: pointer on clickable things" → arrow on controls, pointer only on links and clickable pictures (§F27.1) | X-51 |
| `02-foundations-2.md` | §F15.1, §F16.1 | "f" evidence "see owner choices" → settled; Illustrations "None in v1" → three line drawings L-1…L-3 for E-10, E-13, E-14 with tokens `--illo-w/-h/-stroke`; icon fallback until supplied | X-51 |
| `02-foundations-3.md` | §F22, §F24, conflicts row 5 ruling, owner choices | sounds, UI language and dates marked settled; cursor ruling closed; answers line above the owner-choices table | X-51 |
| `07-journeys-2.md` | §7.7.2 | "for Vikas to confirm" → "confirmed by Vikas, X-52" + settled sentence | X-52 |
| `09-windows.md` | §9.3.1 Signing | "An unsigned build MUST NOT ship" → signed before anyone outside the test group; tester builds may be unsigned | X-44 |
| `10-acceptance-1.md` | header, new B.5, B.6 | AT-134…AT-150 (voice via OpenAI, key offer, fallback, privacy hosts, Exa fallback, no-key local path, secrets in cloud calls, cloud browser limits, hand-back sites, web cost cap, recipes, Contacts, hub gating v1.1, accent, cursor, line drawings, tester build); totals 150 (P0 101, P1 49) | X-43–X-51 |
| `10-acceptance-2.md` | ART-15b | allowed hosts + OpenAI and saved web tools | X-43, X-46 |
| `00-README.md` | files table | research row + `research/web-tools.md` | X-46 |
| `GAPS.md` | append | cursor line closed; 13 new lines (signing before public, India coverage of cloud tools, provider retention, voice audio not scrubbable, Hindi voice pass mark, Codex users need a paid OpenAI key, R25–R31 have no spec, line drawings not supplied, hub prices, contacts scope tier, capabilities deltas partly applied, web-tools recommendation superseded, R31 activity-log resolution) | — |

Outside the constitution: `omnibot-re/foo/foo-prd.md` (R16, R18, R21 updated; R25–R31 added; §5, §7, §9, §10, §11, §12, §13, §14), `omnibot-re/foo/foo-plan.md` (authority line, rules §1.3, stack, M8, M9, M11, M13, M14, new M15, order, risks, counts; implementation-ready stays NO), `omnibot-re/foo/PIPELINE.md` (stage 4 row, dated note).

**Article conflicts and how they were resolved.** Art. 15 ("your data is yours"; memory, chats and logs live on the PC): cloud tools and OpenAI voice send queries, pages and audio out, but nothing is stored off the PC by foo; resolved by disclosure (Settings → Privacy names each service that is on), the user's own keys only, no foo server, the "This PC" options, and redaction (GAPS: provider retention). Art. 8 (secrets): every cloud request passes the Redactor (R11); voice audio cannot be scrubbed, disclosed and logged in GAPS. Art. 4–7, 10: cloud browser and hub never approve; commits stay on foo's Edge behind cards; recipes never replay the commit click. Art. 13: voice and web tool costs count in the AI cap. Art. 29: silent local fallback. Art. 2: UI says "key", "connect", "online"; never MCP, server or hub. Articles were not edited.

Owner answers pass total: 21 file-level rows above (about 70 individual edits).
