# 05 · Cards, part 1 of 3 (shared rules, §5.1–§5.4)

Every card that appears inside a chat. A card is a rich message from foo or a helper that the user can tap. Bubbles, markdown and the composer are in `04-messages-and-composer.md`; pages, windows and dialogs (live view, sign-in window frame, Windows Hello flow) are in `06-screens*.md`. This chapter owns every card's anatomy, copy, states, keys, Narrator text, motion, group behaviour, toast form and log lines.

| Part | Sections |
|---|---|
| `05-cards-1.md` | §0 shared rules · §5.1 Morning brief · §5.2 Checklist · §5.3 Choice card · §5.4 Option tiles |
| `05-cards-2.md` | §5.5 Approval card · §5.6 Payment card · §5.7 Draft card · §5.8 Secret box · §5.9 Paste catcher |
| `05-cards-3.md` | §5.10 Sign-in-here card + sign-in window · §5.11 Connect card · §5.12 Plan card · §5.13 Routine created card · §5.14 Routine suggestion · §5.15 Proof chip + receipt footer · §5.16 "Not checked live" chip · §5.17 Memory chip · §5.18 Handoff marker + job link card · §5.19 Stuck card · §5.20 Error card · §5.21 Spend-cap card · §5.22 Table card · §5.23 File and link preview · §5.24 Place card (location) · §5.25 Voice note · §5.26 New tokens requested · §5.27 Conflicts and resolutions · §5.28 Source index · §5.29 Bill card |

Evidence keys: as `02-foundations.md` (**MSG**, **AIC**, **HRM**, **OCL**, **AGT**, **WIN**, **BP1**) plus **JRN** = `research/journeys-1..4.md` (C1–C17 components, §4 job and §5 approval state machines, J1–J23), **GRK** = `../../personal-agent-re/grok/04-deep-dive.md`, **INS** = `../../personal-agent-re/instinct/04-deep-dive.md`, **06** = `06-screens.md`.

Words: MUST / MUST NOT are binding. "Gated card" = Approval card (§5.5) or Payment card (§5.6), the only cards whose tap authorises an action (Articles 5, 6, 7). Every size is CSS px at 100% scaling; code uses rem (1rem = 16px).

---

## §0. Shared rules for every card

### 0.1 Card catalogue

| § | Card | Owner chat | In groups? | Gated? | Toast when window not focused | Journey | `cards.type` (08-0 §G.1) |
|---|---|---|---|---|---|---|---|
| 5.1 | Morning brief | foo 1:1 | never | no | yes (J6) | J6 | `brief` |
| 5.2 | Checklist | job owner 1:1 | never (group gets §5.18 job link card) | no | no (taskbar progress only) | C2 | `checklist` |
| 5.3 | Choice card | any | yes, if no option holds private data | no (typed answers and reactions count) | yes, ≤ 2 buttons | C3, J8 | `choice` |
| 5.4 | Option tiles | any | yes, same rule | no | yes (as §5.3) | J9, J10 | `tiles` |
| 5.5 | Approval card | job owner 1:1 | never | **yes** | yes, [ Review ] [ Not now ] only | C4, §5 SM | `approval` (`variant`: `standard` / `deadline_reminder`) |
| 5.6 | Payment card | job owner 1:1 | never | **yes** | yes, [ Review ] [ Not now ] only | C5, J10, J11 | `payment` |
| 5.7 | Draft card | job owner 1:1 | never | Send tap = approval for known recipients | yes, [ Review ] [ Not now ] [settled: X-02, X-04] | C6, J12 | `draft` |
| 5.8 | Secret box | 1:1 | never | no | yes, [ Open ] | C7, J13 | `secret` (`secretKind`) |
| 5.9 | Paste catcher | composer dock | n/a | no | never | C8 | — (composer state, never a card, 04) |
| 5.10 | Sign-in-here card | job owner 1:1 | never | no | yes, [ Open ] | C9, J13 | `signin` (`mode`) |
| 5.11 | Connect card | 1:1 | never | no | only on return from browser | C10, J4 | `connect` |
| 5.12 | Plan card | job owner 1:1 | never | no | yes, [ Open ] | C11 | `plan` |
| 5.13 | Routine created card | routine owner 1:1 | never | no | no | C13, J14 | `routine` |
| 5.14 | Routine suggestion | 1:1 | never | no | counts toward interruption budget | J11, J14 | `routine_offer` |
| 5.15 | Proof chip + receipt footer | under a result | yes (shareable results only) | no | no | C12 | — (drawn from `jobs.proof`) |
| 5.16 | "Not checked live" chip | under a result | yes | no | no | C12 | — (part of the result message) |
| 5.17 | Memory chip | under a foo message | never | no | no | C14, J17 | — (`messages.kind='marker'`, `marker_kind='memory_chip'`) |
| 5.18 | Handoff marker + job link card | any | yes | no | no | C15, J15 | `job_link` (the marker is `marker_kind='handoff'`) |
| 5.19 | Stuck card | job owner 1:1 | never | no | yes, [ Open ] | J19.4 | `stuck` |
| 5.20 | Error card | where the user is | only group-level errors | no | per J19 table | C16, J19 | `error` (`variant`: `error` / `recovery`) |
| 5.21 | Spend-cap card | foo 1:1 | never | no | yes, [ Raise cap ] | J19.3 | `spend_cap` |
| 5.22 | Table card | any | yes | no | no | foo decision | `table` |
| 5.23 | File / link preview | any | yes | no | as the message it belongs to | AGT A13, MSG §7 | `file` / `link_preview` |
| 5.24 | Place card | any | yes, unless the place is the user's home | no | no | foo decision | `place` |
| 5.25 | Voice note | any | yes | no | "🎙 Voice note (0:12)" | J7 | — (`messages.kind='voice'`) |
| 5.29 | Bill card | Money 1:1 (foo 1:1 when there is no Money helper) | never | no ("Pay now" leads to the §5.6 Payment card) | yes, [ Open ] | J11, UJ-01, UX-06 | `bill` (`duplicate`, `scam`) |
| 5.30 | Face explainer (spec in 06-1 §2.3.4) | foo 1:1 | never | no | no | J3, UX-07 | `face_explainer` |
| 06-1 §2 | Setup card | foo 1:1 (setup mode) | never | no | never | J1–J4 | `setup` (`setupCard`) |
| — | Catch-up card (R28, J27) | layout and copy: 12-2 §12.27.4 (file `cards/CatchUp.tsx`, payload `CatchUpPayload`, 08-0 §B.3) | per 12-2 §12.27.4 | no | per 12-2 §12.27.4 | R28, J27 | `catch_up` |

**Types, sub-kinds and states are 08-0 §G.1–§G.2 (X-56); this chapter points there and adds no type of its own** (the 25th type, `setup`, is X-119: the first-run surfaces of 06-1 §2.1–§2.4 that are not Choice/Connect cards, `SetupCardPayload` 08-5 §4.1, states `shown | answered | skipped`, test id `card-setup` + `data-row-id` = `setupCard`). The 25 `cards.type` values are the column above. Sub-kinds are payload fields, not types: `secret.secretKind` (ai_key, voice_key, web_key, login, card, otp, cvv), `signin.mode` (sign_in_here, take_over), `choice.purpose` (job, setup, memory_confirm, app_use, stop_which, conflict, file_in, photo_notice; §5.3), `approval.variant` (standard, deadline_reminder), `error.variant` (error, recovery), `bill.duplicate`, `bill.scam`. `messages.kind` is `text | voice | card | marker`; a brief, a job link and an error are **always** `kind='card'` with a `cards` row, never a message kind. Setup interview cards (06-1 §2.4) reuse these types with `payload.setupCard: 'A'…'H'`. Types that no longer exist (do not build): code, cvv, takeover, recovery, memory_confirm, link, feedback, helper_form, group_form, paste, voice, spendcap. Card components live in `src/renderer/cards/` (08-0 §E.3); `registry.ts` maps `CardType` → component: brief→Brief, checklist→Checklist, choice→Choice, tiles→OptionTiles, approval→Approval, payment→Payment, bill→Bill, draft→Draft, secret→SecretBox, signin→SignIn, connect→Connect, plan→Plan, routine→RoutineCreated, routine_offer→RoutineSuggestion, stuck→Stuck, error→ErrorCard, spend_cap→SpendCap, table→TableCard, file→FileCard, link_preview→LinkPreview, job_link→JobLink, place→PlaceCard, face_explainer→FaceExplainer, catch_up→CatchUp, setup→SetupCard.

**Test ids (08-0 §C, X-58).** Every card root carries `data-testid="card-{type}"` (the `cards.type` value in kebab-case: `card-spend-cap`, `card-routine-offer`, `card-job-link`, `card-link-preview`, `card-face-explainer`) plus `data-card-id`, `data-card-type` and `data-card-state` (= its `cards.state`, 08-0 §G.2). Buttons are `card-{type}-{action}` (kebab-case of the action word, e.g. `card-approval-approve`, `card-approval-change`, `card-approval-not-now`). Repeated parts add `data-index`. The ids each card uses are listed in its "Test id" column or "Test ids" line; all of them are registered in `src/shared/testids.ts` (no literal ids in components).

### 0.2 Card frame (every card except chips §5.15–§5.17 and the marker §5.18)

```
            │◄──────────────────── 440 (--card-w) or 600 (--card-w-wide) ────────────────────►│
            ┌───────────────────────────────────────────────────────────────────────────────────┐  ┬ 12 (--s2)
            │ [icon 20] Title (--t-body-strong, --fg-1)               label (--t-caption --fg-3)│  ┼ 22
            │                                                                                   │  ┼ 8 (--s1)
            │ Body (--t-body --fg-1)                                                            │
            │                                                                                   │  ┼ 8
            │ [ Primary 40 ]  [ Secondary 40 ]                                                  │  ┼ 40
            │                                                                                   │  ┼ 8
            │ Footer (--t-caption --fg-3)                                            9:41 AM    │  ┼ 16
            └───────────────────────────────────────────────────────────────────────────────────┘  ┴ 12
             ↑14                                                                             14↑
```

| Part | Value | Test id |
|---|---|---|
| Width | `--card-w` 440px (standard) or `--card-w-wide` 600px (§5.1, §5.4, §5.22). Always `min(token, 100% of the message column's content width)`. New tokens, §5.26 `[measured: BP1 card = 82% of a ≈536px column ≈ 440px]` | `card-{type}` (root) |
| Background | `--bg-raised` | — |
| Border | 1px solid `--line` on all sides; plus the **status edge** (0.5) on the top edge only | — |
| Radius | `--r-lg` 16px `[02 F4]` | — |
| Padding | 12px top/bottom (`--s2`), 14px left/right `[02 F3 "card inner padding", BP1]` | — |
| Gap between rows | 8px (`--s1`) `[02 F3]` | — |
| Shadow | none at rest. `--shadow-4` on hover **only** for cards whose whole surface is one button (§5.4 tiles, §5.18 job link card, §5.23 file/link) `[02 F4]` | — |
| Side | Always the incoming side (left), aligned to foo's bubble edge. Cards never appear on the user's side | — |
| Spacing | 4px below a bubble from the same sender (`--s0`); 12px (`--s2`) otherwise `[02 F3]` | — |
| Time | Post time `--t-caption` `--fg-3`, right-aligned on the card's last row, format "9:41 AM" (04 owns time format; hover tooltip shows the full "Fri 16 Oct, 9:41 AM") | `card-time` |
| Group sender | In a group, the card carries the same sender row as a bubble (avatar `--avatar-inline` 26px + name in the helper colour, 04) | `card-sender` |
| Container query | Each card is a CSS container (`container-type: inline-size`). Layout switches stated per card use the card's **inner** width, so they follow Windows text scaling | — |
| Data rule | Text on gated cards (§5.5, §5.6), Draft headers (§5.7), Plan (§5.12), Routine (§5.13), Stuck (§5.19), Spend-cap (§5.21) is assembled by the app from structured job fields. The AI MUST NOT supply free text for these parts, except the draft body (§5.7) and plan step phrases from the fixed phrase list (08) `[MUS §9.1 via JRN C4]` | — |

**Header row.** Height 22px (line-height). Icon 20px Fluent Regular, colour `--fg-2` unless the state table says a status colour; 8px (`--s1`) gap to the title. Title `--t-body-strong`, wraps (`text-wrap: balance`), never ellipsised. Right label `--t-caption` `--fg-3`, one line, never wraps, sits top-right.

**Label/value rows** (§5.6, §5.13, §5.19): CSS grid `max-content 1fr`, column gap 16px (`--s3`), row gap 4px (`--s0`). Label `--t-small` `--fg-2`; value `--t-body` `--fg-1`. Money values right-aligned, `font-variant-numeric: tabular-nums`.

**Leading emoji in drafted copy.** In JRN copy, system cards start with an emoji ("💳 Approve this payment"). Emoji are content, never icons `[02 F6]`. Therefore: on system cards (§5.5–§5.8, §5.10–§5.13, §5.19–§5.21) the leading emoji is **rendered as the mapped Fluent icon** in the header icon slot and is removed from the text; the words stay exactly as drafted. Emoji inside foo-authored message text (the brief greeting, chat replies) stay emoji.

### 0.3 Buttons and controls inside cards

| Control | Size | Rest | Hover (`--m-fast`) | Pressed | Keyboard focus | Disabled | Test id |
|---|---|---|---|---|---|---|---|
| **Primary** | height `--btn-h` 40px (X-92), padding 0 16px, `--r-full`, label `--t-body-strong`, optional leading icon 16px + 4px gap | bg `--accent`, text `--on-accent` | `--accent-hover` | `--accent-pressed`, scale 0.97 for 83ms | ring (02 F8), follows `--r-full` | bg `--bg-sunken`, text `--fg-disabled`, `aria-disabled="true"`, no hover | `card-{type}-{action}` |
| **Secondary** | same | bg `--bg-raised`, 1px `--line-strong`, text `--fg-1` | bg `--bg-hover` | `--bg-pressed`, scale 0.97 | ring | text `--fg-disabled`, border `--line` | `card-{type}-{action}` |
| **Destructive** | same | bg `--bad`, text `--on-bad` (06 §0.11) | bg `--bad`, `filter: brightness(.92)` (06 §0.4) | brightness .85, scale 0.97 | ring | as Primary disabled | `card-{type}-{action}` |
| **Link button** | 40px hit area (text box + transparent padding), `--t-small` | text `--accent` | underline | `--accent-pressed` | ring | `--fg-disabled` | `card-{type}-{action}` |
| **Icon button** | `IconButton size="lg"` (contract: 02-3 §F32.4, X-119): 40×40 hit, icon 20px (cards use `lg` 40, not `md` 36, to meet the 40px target rule, 02 F5; 06 §0.4) | icon `--fg-2` | bg `--bg-hover`, icon `--fg-1`, `--r-full` (round icon buttons everywhere; `--r-sm` only for an icon button inside a Text field or a table cell, UX-08) | `--bg-pressed` | ring | icon `--fg-disabled` | `card-{type}-{action}` |
| **Segmented control** | exactly 06 §0.4 (32px visual, 40px hit) | | | | | | `card-{type}-{control}` (per card) |
| **Text field** | `TextField size="sm"` (contract: 02-3 §F32.4, X-119): height `--field-h` 36px inside cards (pages and dialogs use `size="md"` 40px, 06 §0.4), hit area padded to 40px; `--r-sm`, `--bg-sunken`, border 1px `--line-input` (X-25, UX-09); hover, focus (border 1px `--accent` + ring on keyboard focus), error and disabled exactly as 06 §0.4 | | | | | | `card-{type}-field` (per card) |
| **Chip** (proof, memory, status) | visual height 24px = 16px icon + 2 × `--s0`; padding 0 8px; `--r-full`; `--t-caption`; hit area padded to 40px with a transparent `::before` (inset −8px) | per section | | | ring on the visual pill | | per chip section (§5.15–§5.17) |

Button heights come only from the tokens (X-92, 08-0 §H): `--btn-h` 40 (every card button), `--btn-h-sm` 32 (small Secondary/Link buttons outside the card body, never a Primary), `--btn-round` 36 (round buttons such as the voice-note Play); no literal button height.

Button row: left-aligned, gap 8px (`--s1`), wraps to a second line when needed (never shrinks a label, never ellipsises). Order is always **Primary, then Secondary, then text/link buttons**. The safe/decline button is never the Primary. `[foo decision; BP1 button order]`

Buttons radius: `--r-full` (pill) in cards, as in BP1 (`.btn{border-radius:999px}`). Pages, dialogs, settings and banners use the same pills [settled: X-01].

Button labels follow 02 F10: action + object ("Approve ₹14,600", "Send email"); the soft decline is "Not now"; stopping a running thing is "Cancel" or "Stop".

### 0.4 Shared copy rules

- `{agentName}` replaces "foo" whenever foo the agent speaks of itself ("{agentName} never sees your card"). `{userName}` is the name from J4. `{helperName}` is a helper's name.
- Times: absolute, "Fri 16 Oct, 9:41 AM" `[Article 21]`. Countdowns ("Expires in 9:59") are durations and are allowed; the absolute time is in the tooltip and the Narrator label.
- Money: "₹14,600", "₹1,23,450" `[02 F10]`, tabular numerals.
- Masking: phone "+91 98••• ••210"; card "Visa ••4242"; email of a third party in toasts "r.s•••@gmail.com" (J20); UPI in UI "vik•••@okhdfc".
- Every gated card's footer states what happens if the user does nothing ("If you don't answer, I won't do it.").
- **Words (X-79, 08-0 §G.15).** "cap" is used only for foo's two caps; "limit" only for the AI plan's own usage limit. The word "toast" never appears on screen (say "notification"). Approval and Draft cards say "Change", never "Edit".
- **Copy keys (X-59, 08-0 §D).** Every quoted string in 05 lives in `src/shared/copy/en-IN.json` under the key `cards.{type}.{slot}[.{state}]`, built mechanically: `{type}` = the card's `cards.type` (§0.1); `{slot}` = the lower_snake form of the row name in the card's Copy/Slot/Part/Kind/Case column (e.g. "Right label" → `right_label`, "Primary" → `primary`, "Big payment line" → `big_payment_line`); `{state}` = the lower_snake `cards.state` or row name in a States table (e.g. Approval EXPIRED body → `cards.approval.body.expired`; Payment "Footer (UPI)" → `cards.payment.footer_upi`). Rules shared by all cards (§0.4, §0.5, §0.9) use `cards.common.{slot}` (e.g. `cards.common.gated_typed_yes`, `cards.common.offline_line`, `cards.common.group_private_line`). Chips that are not cards use `cards.proof_chip.*`, `cards.not_live_chip.*` and `memory_chip.*`; the paste catcher uses `composer.paste_catcher.*`. Where a section names a key explicitly, that key wins. Variables keep their `{name}`; money is pre-formatted by `formatInr()` (08-0 §D).
- Typing "yes", "ok", "send it", or reacting 👍 to a gated card does nothing to the card. foo replies once, in plain text: "Tap Approve on the card so I know it's really you." (Approval/Payment) or "Tap Send on the draft so I know it's really you." (Draft) `[Article 6; JRN J12]`.

### 0.5 Universal states (the visual treatment every card uses; each card's own table gives the copy)

| State | Container | Content | Buttons | Narrator (polite unless stated) |
|---|---|---|---|---|
| **Pending** (rest) | as 0.2. Gated cards add the **status edge**: top border 1.5px `--accent` `[02 F4]` | full | all enabled | on arrival: "{sender} sent {card name}: {title}" |
| **Hover** | no change, except whole-surface cards (`--shadow-4`, border `--line-strong`) | — | per 0.3 | — |
| **Focused** | when the card itself (the group) has keyboard focus: ring (02 F8) around the card following `--r-lg` | — | — | reads the card label (0.7) |
| **Submitting** | unchanged; `aria-busy="true"` | unchanged | the tapped button shows a 16px spinner ring (2px stroke, `currentColor`, 1s linear rotation, 02 F7) in place of its icon and its "-ing" label ("Sending…", "Saving…"); every other button disabled | "{-ing label}" |
| **Done / approved / answered** | collapses to the **summary row** (below) | summary copy | none | "{summary copy}" |
| **Declined** | summary row; bg `--bg-sunken`; all text `--fg-2` | "You said no…" copy | none | copy |
| **Expired** | as Declined | expiry copy | one Link button "Ask me again" where the card allows | copy |
| **Superseded** | as Declined; the changed value is shown struck through (`text-decoration: line-through`, `--fg-3`) | "…so I stopped. See the new card below." | Link button "See the new card" scrolls to and focuses the new card | copy |
| **Withdrawn** | as Declined | "No longer needed. The job was stopped." | none | copy |
| **Failed** | status edge: top border 1.5px `--bad`; header icon `ErrorCircle` `--bad` | failure copy | exactly one fix button (Primary) + at most one Link button `[Article 2]` | assertive: copy |
| **Held / Checking** | status edge 1.5px `--warn`; a strip row inside the card: bg `--warn-soft`, `--r-sm`, padding 8px 12px, `Warning` 16px `--warn` + `--t-small` `--fg-1` | strip copy | per card | assertive: strip copy |
| **Disabled** | unchanged | a reason line `--t-caption` `--fg-2` above the buttons | affected buttons disabled (0.3) | reason line |
| **Offline** | unchanged | reason line "You're offline. I'll do this when you're back." `--t-caption` `--fg-2` with `Globe` 16px `--fg-3` | buttons that need the internet are disabled; "Not now", "Cancel", "Skip", "Discard" stay enabled. Countdowns keep running | reason line, once |
| **Read-only in history** | any card in a terminal state, any card shown in Search results (06 §12) or an export | summary row | none; "Details" Link button only where stated | summary copy |

**State names.** The rows above are visual treatments, not stored states. The stored state of every card is its `cards.state` value from 08-0 §G.2 (Approval and Payment use `ApprovalState`); each card section maps its own states onto these treatments, and the root exposes it as `data-card-state` / `data-state` (FE-34). New `cards` columns `resolved_by` (tap, keyboard, toast, typed, reaction, auto, system), `resolved_at`, `supersedes_id`, `deleted_at` (08-0 §G.2) record who ended a card and which card it replaced.

**Summary row** (the collapsed form): same container and padding; one row, min-height 40px; `CheckmarkCircle` (done, `--ok`) / `Dismiss` (declined, `--fg-3`) / `Clock` (expired, `--fg-3`) / `ErrorCircle` (failed, `--bad`) 16px + 8px + copy `--t-small` + time right. The full card stays available: clicking the summary row (or Enter on it) toggles a read-only expanded view of the card as it was at decision time, with the decision line at the bottom ("Approved by you at 9:12 AM").

### 0.6 Keyboard (all cards)

| Key | Where focus is | Action |
|---|---|---|
| Tab / Shift+Tab | anywhere | moves through the card's controls in visual order: content controls top→bottom, then buttons left→right, then footer links |
| ↑ / ↓ | message list (04) | moves message by message; a card is one stop; Enter or Tab enters it |
| Enter / Space | a button | activates it |
| **Ctrl+Enter** | focus anywhere **inside** a card | activates that card's Primary button. Never fires from the composer or from outside the card `[AIC #20; OCL §7.2 Allow once Ctrl+Enter; foo decision: scoped to the focused card so no approval happens by accident]`. Exception: on Approval, Payment and Draft cards Ctrl+Enter never triggers Approve / Pay / Send (Tab to the button and press Enter or Space) [settled: 09 §9.17.4] |
| Esc | inside a card | leaves the card and returns focus to the composer. Esc never declines, never cancels, never expires anything |
| **Ctrl+J** [settled: X-09, X-21] | anywhere in a chat | jumps focus to the oldest card in this chat that needs the user (pending gated card, choice, sign-in, secret, plan, stuck, bill in `waiting`). None: Narrator "Nothing needs you here." `[foo decision; to be listed in 09-windows; 09 wins on a clash]` |
| 1–4 | inside §5.3 / §5.4 | picks that option |
| Shift+F10 / context-menu key | a tile or file card | opens its context menu |

Gated cards: the Primary button MUST NOT be the element that receives focus automatically when the card arrives. Focus never moves into a card on its own; arrival is announced only (0.7).

### 0.7 Narrator (all cards)

- Each card is `role="group"` with `aria-labelledby` = its title and `aria-describedby` = its impact/body line and footer. Its accessible name is "{card name}: {title}", card names in the table below.
- Arrival is announced through the message list's polite live region (04): "{sender} sent {card name}: {title}". Gated cards add ", needs you".
- State changes are announced politely with the state's copy; Failed and Held are assertive.
- Countdowns: the ticking text is `aria-live="off"`; the card announces "{n} minutes left to answer" at 5:00 and 1:00, and "Expired" at 0:00.
- Buttons carry their full meaning: "Approve ₹14,600 to Taj Holiday Village", "Send email to Rakesh Sharma", "Not now, don't pay".
- High contrast (`forced-colors: active`): card border 1px `CanvasText`; status edges `Highlight`; Primary buttons `ButtonText` on `ButtonFace` with 2px border; every status keeps its icon + word `[02 F9]`.

| Card | Narrator card name |
|---|---|
| §5.1 | "Morning brief" |
| §5.2 | "Job checklist" |
| §5.3 / §5.4 | "Question" |
| §5.5 | "Approval needed" |
| §5.6 | "Payment approval" |
| §5.7 | "Draft, not sent" |
| §5.8 | "Secret box" |
| §5.9 | "Warning" |
| §5.10 | "Sign-in needed" |
| §5.11 | "Connect an app" |
| §5.12 | "Plan" |
| §5.13 | "Routine" |
| §5.14 | "Suggestion" |
| §5.19 | "Stuck" |
| §5.20 | "Problem" |
| §5.21 | "Spending cap" |
| §5.22 | "Table" |
| §5.23 | "File" / "Link" |
| §5.24 | "Place" |
| §5.25 | "Voice note" |
| §5.29 | "Bill" |
| 06-1 §2.3.4 (face explainer) | "About my face" |

### 0.8 Motion (all cards)

| What | Motion | Token |
|---|---|---|
| Card arrives | fade in + rise 8px | `--m-slow`, `--ease-in` `[02 F7 "new message"]` |
| Button press | scale 0.97 | 83ms `[02 F7]` |
| Hover colour | colour change | `--m-fast` |
| Chip changes (proof, memory, scope selection) | colour change | `--m-normal` `[02 F7 "chip changes"]` |
| Checklist step done | ring → ✓ scale 0.6→1 | 167ms `[02 F7]` |
| **Card state change** (pending → summary, edit mode, superseded) | content cross-fade + height change | `--m-normal`, `--ease-standard`. **Not yet in 02 F7's list; requested as motion M-1 (§5.26).** Until approved, the swap is instant |
| Countdown, LIVE dot, waveform | no animation (text/number swaps only) | — |
| Reduced motion | no movement or scale; fades ≤ 83ms; spinner rings become static "◔" | `[02 F7]` |

### 0.9 Groups (Article 14)

- Cards marked "never" in 0.1 MUST NOT render in a group. When a job in a group reaches one of them, the card is posted in the **owner helper's 1:1 chat**, and the group shows one plain line from that helper:
  "{privateThings} stay private. I've asked {userName} in their own chat." + Link button "Open {helperName}".
  `{privateThings}` is built from what moved, joined with "and": "Payment", "The draft", "Your address", "Mom's address", "Your password", "The sign-in". Example: "Payment and Mom's address stay private. I've asked Vikas in their own chat." `[JRN J16 step 4; "his" → "their" so no gender is guessed]`
- Choice cards and option tiles may render in a group only when none of their options shows an address, phone number, amount owed by the user, or a memory fact marked private. Otherwise they move to 1:1 with the same line.
- Answering a choice in a group answers it for the job; the collapsed card in the group reads the same as in 1:1.

### 0.10 Toasts (J20 rules apply to all cards)

Format: app foo; title = chat name ("foo", "Trips", "Goa trip · Trips"); image = that chat's avatar; body = one line, ≤ 2 buttons; never a secret, OTP, full card number or a third party's full email. Max 1 toast per chat per 2 minutes (extra events merge: "{chat} · 3 updates"). No toast if the window is focused on that chat. Quiet hours hold toasts until they end. Each card section lists its own toast; a card with "no" in 0.1 never toasts. Notification buttons are only the ones each card names ([ Open ]; [ Review ] [ Not now ] for gated and draft cards, X-02; one answer button on a Choice card). There is no inline Reply box in v1 (owner question Q3, recommended default).

### 0.11 What is logged (all cards)

**Card row.** Table `cards` in `{DATA}\data\foo.db` (08-1 §4.3); type list 08-0 §G.1; state list 08-0 §G.2; columns `state`, `answer`, `resolved_by`, `resolved_at`, `supersedes_id`, `deleted_at`, `rev` are the card's record of what happened. `payload` holds only the `CardPayload` fields of 08-1 §4.5 for the type (secrets never); there is no `payload.events`, `payload.steps` or `payload.answer`: state history is the tech log (`card.state` lines with `{ cardId, from, to, by }`), checklist steps are the `steps` table, answers are `cards.answer` (X-129). Card state changes are **not** activity rows.

**Activity log** (X-62, 08-0 §G.4). One DB `activity` row per action that changed the world, a connection or a permission; mirrored to `{DATA}\activity.jsonl` with camelCase fields; the Activity page (06-3 §9) reads the DB. A row carries `kind` (sent, paid, booked, deleted, connected, stopped, changed), one `event` from the closed list of 08-0 §G.4, `outcome` (done, failed, unknown) and `approvedHow` (card_once, card_chat, card_always, rule, hello, typed_amount, user, none), plus `proofKind`/`proofRef`. Example mirror line (field names are exactly the `activity` columns camelCased, 08-1 §4.1; X-129):
```json
{"id":"act_0192…","at":1792128243000,"kind":"sent","event":"sent_email","actor":"foo","chatId":"c_0192…","chatTitle":"foo","jobId":"j_0192…","approvalId":"ap_0192…","summary":"Sent an email to Rakesh Sharma","toLabel":"r.s•••@gmail.com","amountPaise":null,"approvedHow":"card_once","proofKind":"sent_folder","proofRef":"18c2…","outcome":"done","fields":null}
```
Card lifecycle words (shown, held, declined, expired, superseded, caught, offered…) are never activity events: they live in the tech log `{DATA}\logs\app-*.log` (`card.state` lines, redacted). Secrets, OTPs, card numbers and draft bodies are never written to either log. Each section's "Logged" line names its activity events from the §G.4 list, or says "none".

---

## §5.1 Morning brief

**Purpose.** One finite daily message that tells the user the 1–5 things that matter today, then ends. Never a feed. `[JRN J6; GPT Pulse "that's it for today"; BP1 pin 3]`

**Trigger.** The built-in "Morning brief" routine fires at the set time (default 8:00 AM; J4 Card G); the background job starts 15 minutes earlier. Light-day, late, skipped and short variants per J6 branches. The brief is exempt from the 3-a-day interruption budget (Article 19) but obeys quiet hours.

### 5.1.1 Anatomy (`--card-w-wide` 600px)

```
│◄──────────────────────────────────── 600 ────────────────────────────────────►│
┌───────────────────────────────────────────────────────────────────────────────┐
│ ☀️ Good morning, Vikas                                          morning brief │ 22 header (emoji is content here)
│ ───────────────────────────────────────────────────────────────────────────── │ 1px --line
│ Mom's birthday is Saturday. Cake ordered?                                     │ item text --t-body
│ [ Yes, from Theobroma ]                                          [👍] [👎]   │ 40 row: one action + 2 icon buttons
│ ───────────────────────────────────────────────────────────────────────────── │ 1px --line
│ Airtel bill ₹1,179 due Fri 23 Oct. Sent to Money.                             │
│ [ Open Money ]                                                   [👍] [👎]   │
│ ───────────────────────────────────────────────────────────────────────────── │
│ Goa: hotel prices dropped 18% for 12 Dec.                                     │
│ [ Show me ]                                                      [👍] [👎]   │
│ ───────────────────────────────────────────────────────────────────────────── │
│ That's all for today                                             [👍] [👎]   │ --t-body-strong
│ [ Tomorrow, more of / less of…                                             ]  │ 40 text field
│                                                                     8:00 AM   │
└───────────────────────────────────────────────────────────────────────────────┘
```
- Item block: padding 8px 0 (`--s1`); text and its button row stacked; dividers 1px `--line`, full inner width.
- Item text wraps to at most 2 lines (`-webkit-line-clamp: 2`); the full text is in the tooltip and Narrator.
- Action button: Secondary (0.3), at most **one** per item. Items with no action show only the thumbs on the text line's right.
- Thumbs: Icon buttons 40×40, `ThumbLike` / `ThumbDislike` 20px; selected = Filled icon variant (02 F6 toggle exception), colour `--accent`, `aria-pressed="true"`.
- Field: Text field (06 §0.4), placeholder "Tomorrow, more of / less of…".
- Card name in chat list preview: "☀️ Good morning, Vikas".

### 5.1.2 Tokens

`--bg-raised`, `--line`, `--r-lg`, `--card-w-wide`, `--t-body-strong` (header, closing line), `--t-body` (items), `--t-caption` `--fg-3` (label "morning brief", time), `--accent` (selected thumbs), `--bg-sunken` / `--line-strong` / `--fg-3` (field), `--s1`, `--s2`.

### 5.1.3 Copy (final)

| Slot | Copy |
|---|---|
| Header | "☀️ Good morning, {userName}" |
| Right label | "morning brief" |
| Items | foo-authored one-liners, ≤ 90 characters, absolute dates (Article 21). Fixed scoring order and 1–5 items per 08-3 §14.3; zero items → light-day brief (X-131) |
| Closing | "That's all for today" |
| Field placeholder | "Tomorrow, more of / less of…" |
| After the field is sent | the field is replaced by the line "You said: {text}" `--t-small` `--fg-2` with a 👍 reaction pill on it (foo's acknowledgement, no message) `[JRN J6 step 5; INS reaction instead of reply]` |
| Light day (no cards) | "☀️ Good morning, {userName}. Nothing needs you today. Enjoy it." + closing thumbs |
| Late | header "☀️ Good morning, {userName} · late because your PC was asleep at {8:00 AM}" |
| Skipped (PC woke after 12:00 PM) | plain message, not a brief card: "I skipped this morning's brief because your PC was off. Want it now?" [ Yes ] [ Skip today ] |
| Gmail expired | last item: "I couldn't read your Gmail today." [ Reconnect Gmail ] |
| Short brief, AI offline | footer above the time: "Short brief today: your AI wasn't answering." |
| Short brief, cap reached | footer: "Short brief today: you've reached this month's AI cap." + Link button "Change cap" |
| Stop-a-kind offer (👎 twice in 7 days on one kind) | inline row under the closing line: "Stop showing {weather} in your brief?" [ Yes, stop ] [ Keep it ] (asked once, Article 20) |
| Expired (12 h after posting, unopened) | whole card `--fg-2`, header right label becomes "Expired · open anyway" (Link button) |
| Handoff by action | the action opens the right chat; foo's chat gets the marker (§5.18) "Opened in {helperName}" |

### 5.1.4 States

| State | Look / behaviour |
|---|---|
| Unread | normal; chat row unread count 1 |
| Read | normal |
| Thumb hover / pressed / focus | 0.3 Icon button |
| Thumb selected | Filled icon, `--accent`; tapping again clears it |
| Action tapped (submitting) | that button shows the spinner for ≤ 1s while the target chat opens; nothing else changes. The action **starts a normal job or opens a chat; it never acts by itself** `[JRN J6]` |
| Field focused | Text field focus (06 §0.4) |
| Field sent | "You said: …" line (5.1.3) |
| Offline | actions that need the internet disabled with the offline line; thumbs and field still work (stored locally) |
| Expired | 5.1.3; actions still work and re-check live data first |
| Read-only in history | thumbs show their saved state but are not editable after 7 days `[foo decision]`; action buttons remain |
| Disabled (brief paused in Routines) | no card is posted |

### 5.1.5 Keyboard and Narrator

- Tab order: item 1 action → 👍 → 👎 → item 2… → closing 👍 → 👎 → field. Enter in the field saves it.
- Card label: "Morning brief: Good morning, Vikas. 3 things." Each item is a `role="listitem"` in a `role="list"`; thumbs: "Useful" / "Not useful" (`aria-pressed`). Field label: "Tell me what you want more or less of tomorrow".

### 5.1.6 Motion, groups, toast, logged, sources

- Motion: arrival only (0.8). Thumbs: chip change `--m-normal`.
- Groups: never.
- Toast (window not focused, outside quiet hours): title "{agentName}", body "Good morning. {n} things today." [ Open ]. Light day: "Good morning. Nothing needs you today." [ Open ].
- Logged: card row (`cards.state`: `open` while today's brief is live, `expired` 12 h after posting, 08-0 §G.2); activity: none (tech log line "brief sent, {n} items"); thumbs and "more of / less of" text to `memory\preferences\brief.md` (verbatim text).
- Test ids: root `card-brief`; item action `card-brief-action` and thumbs `card-brief-thumb-up` / `card-brief-thumb-down` (each with `data-index`; the closing row uses `data-index="closing"`); field `card-brief-field`; stop-a-kind buttons `card-brief-stop-kind` / `card-brief-keep-kind`; "Expired · open anyway" `card-brief-open-anyway`.
- Sources: JRN J6; ChatGPT Pulse finite cards + thumbs (GPT §5, §9.9); Gemini Daily Brief (GEM §9.8); Instinct 7am brief (INS §3); BP1 hero pin 3 and "Morning brief that ends".

---

## §5.2 Checklist (job progress)

**Purpose.** One message per job that shows real progress, edited in place, never one message per step `[Article 17]`. Status comes only from the job runner `[Article 12]`.

**Trigger.** A job has ≥ 2 steps **and** has been WORKING for > 1.5s `[JRN C2; OCL §5.3]`. It is posted in the job owner's chat directly below the user's request (or below the Plan card when there is one). If the job is owned by a helper, the chat that asked shows a job link card instead (§5.18).

### 5.2.1 Anatomy (`--card-w` 440px)

```
┌──────────────────────────────────────────────────────────────┐
│ Booking your Goa stay                         live checklist │ 22  header: no icon
│ [✓] Checked Booking.com, MakeMyTrip, hotel sites              │ 30  step row
│ [✓] Kept 3 that fit ₹8k and beach under 5 min                 │ 30
│ [✋] Waiting for you to pick one ›                             │ 30  current: --t-body-strong
│ [○] Book and add to your calendar                             │ 30
│ [Window Watch live]  [Stop Stop]       4 min · uses about ₹3 of your AI │ 40
└──────────────────────────────────────────────────────────────┘
```
- Step row: min-height 30px = line 22 + 2 × `--s0`; icon 16px in a 16px column, 8px gap, text `--t-body`, wraps to 2 lines max (each step phrase is ≤ 60 characters by the phrase list, 08).
- Max 6 rows visible. With more than 6 steps, finished steps fold into one top row "✓ {n} steps done · Show" (Link button).
- Footer: buttons left; right side `--t-caption` `--fg-3`, `tabular-nums`. When the footer can't fit one line, the text moves under the buttons.

| Mark | Icon | Colour | Meaning |
|---|---|---|---|
| Done | `CheckmarkCircle` 16 | `--ok` | step finished |
| Current | spinner ring 16px, 2px stroke `--accent` (`--info`) with one transparent quarter, 1s linear rotation `[02 F7]` | `--accent` | running now |
| Waiting on you | `HandRight` 16 | `--warn` | job is NEEDS YOU |
| Next | circle 16px, 1.5px stroke | `--fg-3` | not started |
| Failed | `ErrorCircle` 16 | `--bad` | this step failed |
| Stopped | `Stop` 16 | `--fg-2` | stopped by the user |
| Took over | `HandRight` 16 | `--fg-2` | user had control |

### 5.2.2 Copy (final)

| Slot | Copy |
|---|---|
| Title | "{Job title}" from the runner (e.g. "Booking your Goa stay", "Table for 4 · Sun 18 Oct, 8:00 PM") |
| Right label | "live checklist"; while WAITING: "Paused" (pill: `--warn-soft` bg, `--warn` text, `Clock` 16); FAILED: "Didn't finish" (`--bad` text) |
| Step text | the three forms of the 08-4 §26.1 phrase catalogue (the only phrase list; keys `cards.checklist.{key}.next|running|done`): `next` for not-started rows ("Check {site}"), `running` for the current row ("Checking {site}"), `done` for finished rows ("Checked {site}") `[JRN C2; HRM §5 curated phrases]`. An unknown key or a bad slot uses `generic_working`. Never tool names or arguments |
| Waiting step | "Waiting for you to pick one ›" / "Waiting for you to approve ›" / "Waiting for you to sign in ›"; the row is a Link button that focuses the card that needs the user |
| Queued | single row: "Waiting for another job to finish" |
| Slow (no step for 60 s) | under the current step, `--t-caption` `--fg-3`: "Still working, this one takes a while" |
| Paused (WAITING) | under the current step: "Paused: {your AI isn't answering | you've reached this month's AI cap | your PC went to sleep}" |
| Resumed | the paused line disappears; foo posts one line: "Back on it. Picking up from step {n}." |
| Took over | row "You took over" |
| Stopped | last row "Stopped by you" |
| Footer text | "{n} min · uses about ₹{x} of your AI" where n = whole minutes since WORKING (real clock) and x = metered AI cost so far (spend meter, 08). Plan-based AI: "{n} min · about {p}% of your Claude plan". Under 1 min: "under 1 min" |
| Watch live | "Watch live" (only while the job uses foo's browser, J18) |
| Stop | "Stop" |
| Done (collapsed) | "Done · {n} steps · {m} min" + Link button "Details" |
| Details (expanded, read-only) | all steps + Link button "Replay" when step screenshots exist (kept for `privacy.screenshotDays`, J18); Replay → 06-3 §13 Replay mode (X-128) |

### 5.2.3 States

| Job state (JRN §4) | Checklist |
|---|---|
| QUEUED | "Waiting for another job to finish"; buttons: Stop |
| WORKING | as anatomy; current step spinner |
| NEEDS YOU | current row = waiting row (`HandRight` `--warn`) |
| WAITING | right label "Paused"; paused line; Stop stays enabled; Watch live hidden |
| DONE | collapses to the summary row (0.5) with `CheckmarkCircle` `--ok`: "Done · 4 steps · 6 min · Details"; the result message, proof chip and receipt footer follow (§5.15) |
| DONE unverified | same summary; the result carries "Not checked live" (§5.16) |
| FAILED | stays **expanded**; failed row `ErrorCircle` `--bad`; buttons removed; the error card follows (§5.20) `[HRM cleanup_progress via JRN C2]` |
| CANCELLED | stays expanded, buttons removed, last row "Stopped by you"; foo's stop report follows (J18) |
| Stop tapped (submitting) | Stop shows spinner + "Stopping…" for ≤ 1s (runner halts within 1s, J18) |
| Offline | job goes WAITING (paused line "Paused: you're offline") |
| Read-only in history | the collapsed summary; "Details" still opens the read-only list |

`cards.state` (08-0 §G.2): `live` (QUEUED, WORKING, NEEDS YOU, WAITING), `done` (DONE), `done_unverified` (DONE unverified), `failed` (FAILED), `stopped` (CANCELLED, including a Stop on a stuck card, X-80).

### 5.2.4 Keyboard, Narrator, motion

- Tab: waiting row link (if any) → Watch live → Stop → Details. Ctrl+Enter inside the card does **nothing** (no Primary on a checklist; Stop is never triggered by Ctrl+Enter) `[foo decision]`.
- Card label: "Job checklist: {title}, step {k} of {n}". Steps are a `role="list"`; each item reads "{state word}, {text}" ("Done, Checked Booking.com"; "Working, Checking MakeMyTrip"; "Needs you, Waiting for you to pick one"). Progress updates are announced politely, coalesced to at most one announcement per 5s `[foo decision]`.
- Motion: step done ring → ✓ scale 0.6→1, 167ms; reduced motion: static "◔" for the ring, no scale.

### 5.2.5 Groups, toast, logged, sources

- Groups: never; the group shows the job link card (§5.18).
- Toast: none for progress. Taskbar progress bar while jobs run (09). NEEDS YOU and DONE toasts come from the cards and results, not the checklist.
- Logged: card row only (steps live in the `steps` table, §0.11). The runner writes `jobs\{id}\state.json` and `plan.md` (08); the activity log gets the actions inside the job, not the checklist.
- Test ids: root `card-checklist`; step rows `card-checklist-step` (`data-index`, `data-state` = done / current / waiting / next / failed / stopped / took_over); waiting-row link `card-checklist-waiting-link`; `card-checklist-watch-live`, `card-checklist-stop`, `card-checklist-details`, `card-checklist-replay`, `card-checklist-show-done`.
- Sources: JRN C2, §4; Cowork progress rail (CWK §5); Perplexity done/current/planned rows (AIC §6.3); Manus todo.md (MNS §9.12); AGT A3 step chip and status phrases; SELF checklist schema (AGT A3); BP1 pin 5.

---

## §5.3 Choice card

**Purpose.** Ask one question with 2–4 tappable answers, foo's pick first, so the user taps instead of typing `[JRN C3, J8]`.

**Trigger.** Inside a job, foo lacks one piece of information it cannot fill from memory, or there are 2+ reasonable routes. One question per missing item; up to 3 questions per card as a stepper. foo's text above the card never repeats the options `[HRM §6]`.

### 5.3.1 Anatomy (`--card-w` 440px)

```
┌──────────────────────────────────────────────────────────────┐
│ Which flight time works for Delhi on Friday?          1 of 3 │ 22  question --t-body-strong; pager --t-caption --fg-3
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ [1] 10:15 · IndiGo · ₹5,240                     BEST FIT │ │ 56  row: 1.5px --accent, bg --accent-soft
│ │     No early start, you said you hate those               │ │
│ └──────────────────────────────────────────────────────────┘ │ 8 gap
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ [2] 7:10 · Air India · ₹4,890                             │ │ 56  row: 1px --line, bg --bg-raised
│ │     Cheapest, leaves early                                │ │
│ └──────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ [3] 18:40 · Vistara · ₹6,100                              │ │
│ └──────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │     Something else…                                       │ │ 40  --fg-2
│ └──────────────────────────────────────────────────────────┘ │
│ 🧠 Used: hates early flights ✕                 Skip   9:02 AM │ chip (§5.17) · Link button · time
└──────────────────────────────────────────────────────────────┘
```

| Part | Value | Test id |
|---|---|---|
| Option row | a single button; min-height 56px; padding 8px 12px (`--s1` `--s2`); radius `--r-md` 12px; border 1px `--line`; bg `--bg-raised`; gap 8px between rows `[OCL §7.1 option rows, AGT A11 56 DIP]` | `card-choice-option` (`data-index` 1–4) |
| Number badge | 20×20px, `--r-xs`, bg `--bg-sunken`, `--t-caption` `--fg-2`, centred; left of the label with 8px gap (keyboard hint 1–4) `[AIC PX1 numbered rows]` | — |
| Label | `--t-body` `--fg-1`, one line, wraps to 2 if needed | — |
| Detail | `--t-small` `--fg-2`, one line, ellipsis (full text in tooltip/Narrator) | — |
| Best-fit row | border 1.5px `--accent`, bg `--accent-soft` `[02 F2, F4]`; tag "Best fit" right-aligned, `--t-caption-strong` uppercase, tracking +0.08em, `--accent` | `card-choice-option` with `data-index="1"` |
| Something else… | 40px row, same border/radius, label `--fg-2`, no badge | `card-choice-something-else` |
| Skip | Link button, right of the bottom row | `card-choice-skip` |
| Multi-select variant | each row gets a 20×20 checkbox (`--r-xs`, 1.5px `--line-input` (X-25; same box as 06 §0.4); checked: bg `--accent`, `Checkmark` 16 `--on-accent`) instead of the badge; a Primary "Done" button under the rows, disabled until ≥ 1 row is ticked | checkbox = the `card-choice-option` row; `card-choice-done` |
| Stepper | pager "{k} of {n}" in the header's right label; tapping a row selects it and advances to the next question after `--m-card` (167ms); there is **no Next button**. From question 2 on, a Link button "Back" sits left of Skip. The walkthrough's "Back · Next" drawing is superseded by this text (UX-19) | `card-choice-pager`, `card-choice-back` |

### 5.3.2 Copy (final)

| Slot | Copy |
|---|---|
| Question | one sentence, ≤ 300 characters, ends with "?" `[AGT A11 schema]` |
| Option label | ≤ 40 characters; detail ≤ 80 characters |
| Tag | "Best fit" (always option 1) |
| Last row | "Something else…" → focuses the composer with placeholder "Tell me what you want instead" |
| Skip | "Skip"; on a reversible question the card collapses to the footer "Skipped. I'll go with {Best fit}." and option 1 is used (state `skipped`, UJ-35) |
| Multi-select button | "Done" |
| Back | "Back" |
| Answered (summary row) | "{question} → {answer}"; multi-select: "{question} → {A}, {B} and {C}" (commas, then "and" before the last; no Oxford comma) (UJ-36) |
| Answered by typing | "{question} → {typed text}" |
| Auto-picked (reversible preference, 15 min) | summary "{question} → {option}"; foo then posts: "I went with {option} since I didn't hear back. Say the word if you want another." |
| Reminder (real-world option, 15 min) | toast only: "{chat} · Still need your pick for {Delhi flights}." |
| Cancelled after 24 h | summary `--fg-2` "{question} → no answer"; foo posts: "I stopped the {Delhi flight search} because I didn't hear back. Options change fast, so ask me again when you're ready." [ Search again ] |
| Skip on a non-reversible question | foo posts: "Okay. Should I stop this job, or do you want to decide later?" [ Decide later ] [ Stop it ] |
| Superseded (an option vanished) | summary `--fg-2`: "These options changed. See the new ones below." + Link button "See the new card"; the new card's question starts "That {10:15 flight} just sold out. Here's what's left:" |
| Late answer on live prices (> 30 min) | foo posts one line before continuing: "Checking those prices are still right…" |

### 5.3.3 States

| State | Look |
|---|---|
| Asking (pending) | as anatomy; job NEEDS YOU; badge ⏳ on the user's bubble (04) [settled: X-17] |
| Row hover | bg `--bg-hover` (Best-fit row: `--accent-soft` stays, border `--accent-hover`) |
| Row pressed | bg `--bg-pressed`, scale 0.97 |
| Row focused | ring (02 F8) on the row, following `--r-md` |
| Submitting | tapped row shows the spinner in place of its badge; other rows disabled; ≤ 1s |
| Answered | summary row (0.5) with `CheckmarkCircle` `--ok` |
| Auto-picked | summary row with `Clock` `--fg-3` |
| Cancelled / expired | summary row `--fg-2` |
| Superseded | 0.5 Superseded |
| Disabled | when the job was stopped: summary "No longer needed. The job was stopped." (WITHDRAWN) |
| Offline | rows stay enabled (the answer is stored and used when back); offline line shown |
| Read-only in history | summary row; expanded view shows all options with the chosen one ticked |

`cards.state` (08-0 §G.2; the same list for §5.4 tiles): `asking` (pending), `answered` (tap, typed, reaction or notification button), `auto_picked` (reversible preference, 15 min), `skipped` (Skip), `expired` (no answer 24 h), `superseded` (options changed or asked again below), `withdrawn` (job stopped).

**Purposes** (`payload.purpose`, 08-0 §B.2 `ChoicePurpose`: `job | setup | memory_confirm | app_use | stop_which | conflict | file_in | photo_notice`; the root `card-choice` carries `data-purpose` = the purpose, 08-0 §C.3):
- `file_in` (12-2 §12.29.4): a file or photo arrived with no clear ask. No "Best fit" tag and no accent row, no Skip, no reminder toast and no auto-pick; the card is not part of a job until answered (`cards.job_id` NULL; the answer creates the job). Question and options are 12-2 §12.29.4's (`cards.choice.file_in.*`), last row "Something else…".
- `photo_notice` (08-0 §G.18 step 5; shown once, only while this PC can't check pictures): the same rules as `file_in` (no Best fit, no Skip, no reminder or auto-pick). Question `thread.papers.photo_notice.body` "I can't check pictures for card numbers or codes on this PC, so your AI would see this photo as it is. Don't send photos of cards, codes or Aadhaar."; options `thread.papers.photo_notice.send` "Send it" / `thread.papers.photo_notice.not_now` "Not now"; no "Something else…" row. Send it → `privacy.photoCheckNoticeShown = true` and the turn continues; Not now → nothing is sent, the job ends CANCELLED (`stop_reason='user_button'`) and foo posts `thread.papers.photo_notice.not_sent` "Okay, I didn't send it."

### 5.3.4 Answers that count (Article 6: choice cards are not gated)

Tap or Enter on a row · typing "2", "two" or the option text (matched by 08-4 §26.6 `answersCard`) in the composer · reacting 1️⃣–4️⃣ on the card · the toast's best-fit button. All produce the identical summary; `resolved_by` records which. Typed answers are matched by 08-4 §26.6 (`answersCard`; a tie between options on one card is not an answer and foo asks "Did you mean {a} or {b}?"). **Two cards waiting for one typed answer** (two open Choice or tiles cards in the chat that the same text answers): the answer goes to the newest card; the other card stays open (`asking`). A typed question instead of an answer ("which one has free meals?") gets one answer bubble and the same card re-posted below; the old card becomes Superseded with copy "Asked again below." `[JRN J8]`

### 5.3.5 Keyboard and Narrator

- Option list is `role="radiogroup"` (single) or `role="group"` of checkboxes (multi). ↑/↓ move between rows, 1–4 pick directly, Enter picks the focused row, Ctrl+Enter = "Done" in multi-select.
- Card label: "Question: {question}". Rows: "{n} of {total}, {label}, {detail}{, best fit}". Answered: "You chose {answer}."

### 5.3.6 Motion, groups, toast, logged, sources

- Motion: arrival; state change (M-1).
- Groups: allowed per 0.9.
- Toast: body "{question}" (one line, ellipsis at 120 chars), buttons [ {best-fit label, ≤ 20 chars} ] [ Open ]. The first button answers the card directly.
- Logged: card row with `cards.answer`, `resolved_by` (§0.11). Activity log: none (no world change). `jobs\{id}\plan.md` gets the decision.
- Test ids: root `card-choice` (`data-purpose`); see the Test id column of 5.3.1.
- Sources: JRN C3, J8; OpenClaw ask_user card, stepper, "Other" row (OCL §7.1); Hermes clarify (HRM §7); Cowork decision card (CWK §5); Perplexity numbered rows (AIC §7 PX1); AGT A11 schema; BP1 "Questions as tap-able choices".

---

## §5.4 Option tiles with photos (hotels, restaurants, salons)

**Purpose.** A choice card whose options are real places or things, shown as photo tiles with the facts that decide the pick `[JRN J9 step 3, J10 step 4; INS §1.3 photos of options; BP1 pin 6]`.

**Trigger.** Same as §5.3, when every option has a photo and a price or time (bookings, purchases). 2–4 options.

### 5.4.1 Anatomy (`--card-w-wide` 600px)

Wide layout (card inner width ≥ 520px): one row of tiles, 2 → 2 columns, 3 → 3 columns, 4 → 2 × 2. Gap 8px.

```
│◄──────────────────────────────────── 600 ───────────────────────────────────►│
┌──────────────────────────────────────────────────────────────────────────────┐
│ Pick a stay · 12–14 Dec                                                      │ 22
│ ┌────────────────────────┐ ┌────────────────────────┐ ┌────────────────────────┐ │
│ │┌──────────────────────┐│ │┌──────────────────────┐│ │┌──────────────────────┐│ │ tile ≈185 wide
│ ││   photo 4:3, r 8     ││ ││       photo          ││ ││       photo          ││ │
│ │└──────────────────────┘│ │└──────────────────────┘│ │└──────────────────────┘│ │
│ │ BEST FIT               │ │                        │ │                        │ │ --t-caption-strong --accent
│ │ Taj Holiday Village    │ │ W Goa                  │ │ Ronil Beach            │ │ --t-body-strong, 1 line
│ │ ₹7,300/night           │ │ ₹7,950/night           │ │ ₹4,100/night           │ │ --t-small --fg-1 tabular
│ │ 2 min walk · free canc…│ │ 4 min walk             │ │ 3 min walk             │ │ --t-small --fg-2, 2 lines
│ └────────────────────────┘ └────────────────────────┘ └────────────────────────┘ │
│ [ Something else… ]                                              Skip  9:20 AM │
└──────────────────────────────────────────────────────────────────────────────┘
```

Narrow layout (inner width < 520px): tiles stack as rows, min-height 88px = 72px thumb + 2 × `--s1`; thumb `--thumb` 72 × 72px, `--r-sm`, left; text column right with 12px gap.

| Part | Value | Test id |
|---|---|---|
| Tile | one button; border 1px `--line`; radius `--r-md` 12px; padding 8px; bg `--bg-raised`; rows inside gap 4px `[BP1 .opt]` | `card-tiles-option` (`data-index` 1–4) |
| Photo | `aspect-ratio: 4 / 3`, `object-fit: cover`, radius `--r-sm` 8px; `alt` = "{name} photo" | `card-tiles-photo` |
| Photo loading | bg `--bg-sunken`, no shimmer | — |
| Photo missing/failed | bg `--bg-sunken` + `Image` 24px `--fg-3` centred | — |
| Best-fit tile | border 1.5px `--accent`; tag line "Best fit" above the name | `card-tiles-option` with `data-index="1"` |
| Name | `--t-body-strong`, one line, ellipsis | — |
| Price / time | `--t-small` `--fg-1`, `tabular-nums` | — |
| Facts | `--t-small` `--fg-2`, ≤ 2 lines clamp; facts in this order: distance or time, cancel terms, rating ("4.4★") | — |
| Non-refundable fact | `--bad` text: "No free cancellation" | — |

Photos are downloaded by foo during the job into `jobs\{id}\media\` and shown from disk; tiles never hot-link a site's image `[foo decision: works offline in history, no tracking]`.

### 5.4.2 Copy (final)

| Slot | Copy |
|---|---|
| Title | "Pick a {stay | table | salon | …} · {dates or day}" e.g. "Pick a stay · 12–14 Dec", "Pick a table · Sun 18 Oct" |
| Tag | "Best fit" |
| Price | "₹7,300/night", "₹₹ · 4.4★", "8:00 PM" as the job supplies |
| Facts | "2 min walk", "free cancellation", "No free cancellation" |
| Something else / Skip / answered / superseded / timeouts | exactly as §5.3.2 (summary: "Pick a stay · 12–14 Dec → Taj Holiday Village") |
| User said "check" / "find" (Article 3) | foo's text above the card: "These have tables. Want me to book one?"; tapping a tile then leads to the Approval or Payment card, never straight to a booking |
| Context menu | "Pick this", "Open on {site}", "Copy link" |

### 5.4.3 States

| State | Look |
|---|---|
| Pending | as anatomy |
| Tile hover | `--shadow-4`, border `--line-strong` (best fit keeps 1.5px `--accent`, colour `--accent-hover`) |
| Tile pressed | scale 0.97, 83ms |
| Tile focused | ring following `--r-md` |
| Submitting (re-checking the slot is still free, ≤ 10s) | tapped tile shows a strip under the photo: spinner 16 + "Checking it's still free…" `--t-caption`; other tiles disabled |
| Answered | summary row with a 40 × 40 thumb of the chosen photo (`--r-sm`) before the text |
| Superseded ("That 8:00 table just went. Here's what's left:") | 0.5 Superseded |
| Offline | tiles enabled from the cached data; the answer waits for the internet; offline line |
| Read-only in history | summary; expanded view keeps tiles visible, chosen tile ticked (`CheckmarkCircle` 16 `--ok` top-right of the photo, 8px inset) |

### 5.4.4 Keyboard, Narrator, motion, groups, toast, logged, sources

- Tiles are a `role="radiogroup"`; ←/→ and ↑/↓ move, 1–4 pick, Enter picks, Shift+F10 opens the context menu.
- Tile label: "{n} of {total}, {name}, {price}, {facts}{, best fit}". Photo `alt` is not repeated (the tile label already names it; `alt=""` on the image).
- Motion: arrival; tile hover shadow at `--m-fast`.
- Groups: allowed per 0.9 (restaurant picks in "Goa trip"); tapping a tile whose next step is gated moves that step to 1:1.
- Toast: as §5.3 (best-fit button label = place name, ≤ 20 chars).
- Logged: as §5.3; photos stay in `jobs\{id}\media\` for 7 days with the job's screenshots. States: as §5.3 (`asking` … `withdrawn`).
- Test ids: root `card-tiles`; tiles `card-tiles-option` (`data-index`); `card-tiles-something-else`, `card-tiles-skip`; context menu items `card-tiles-menu-pick`, `card-tiles-menu-open-site`, `card-tiles-menu-copy-link`.
- Sources: JRN J9, J10; Instinct option photos (INS §1.3, steal #9); Perplexity one-action cards (PPX §9.4); OpenClaw 64px option thumbnails (OCL §7.1); BP1 `.opts` tiles.

---

(Continued in `05-cards-2.md`.)
