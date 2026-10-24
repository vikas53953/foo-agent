# 05 · Cards, part 2 of 3 (§5.5–§5.9: the gated and secret cards)

Shared rules (§0: frame, buttons, universal states, keyboard, Narrator, motion, groups, toasts, logging) are in `05-cards-1.md` and apply to every card here. Evidence keys as in `05-cards-1.md`.

---

## §5.5 Approval card (send, book, delete, share, switch route, use an app)

**Purpose.** The app-drawn stop before any action that changes the world `[Article 5]`. One tap approves exactly what is written, once `[Articles 4, 6]`.

**Trigger.** The job runner reaches a gated step (JRN §5 "job reaches a gated step"): book (no charge now), send to a new recipient or a group, delete, share personal data, switch how (Article 9), cancel a booking, let a helper use an app. Payments use §5.6. Sends to a known recipient use the Draft card's Send tap (§5.7) instead.

### 5.5.1 Anatomy (`--card-w` 440px)

```
┌══════════════════════════ 1.5px --accent top edge ══════════════════════════┐
│ [Mail 20] Send this email to Priya Nair?                                     │ 22  --t-body-strong
│ Will send to priya.n@company.com from your Gmail. You haven't emailed her   │     impact --t-body --fg-1
│ before. Can't be unsent.                                                     │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ "Hi Priya, sharing the Goa dates: 12–14 Dec…"                            │ │ quote: --bg-sunken, --r-sm,
│ │                                                         Show all         │ │ padding 8 12, max 6 lines
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ( Just this once | For this chat | Always )         ← only when allowed      │ 32 (40 hit) segmented
│ [ Send email ]  [ Change ]  [ Not now ]                                      │ 40
│ Expires Fri 16 Oct, 10:14 AM · If you don't answer, I won't do it.  9:14 AM │ --t-caption --fg-3
└──────────────────────────────────────────────────────────────────────────────┘
```

Booking variant adds label/value rows between impact and buttons:
```
│ [Calendar 20] Book this table?                                               │
│ Pizza by the Bay, Marine Drive · Sun 18 Oct, 8:00 PM · 4 people              │
│ Booked under   Vikas Sharma · +91 98••• ••210                                │ rows: --t-small label / --t-body value
│ Charged now                                                        ₹0        │ money right, tabular
│ No-show fee                                                     ₹1,000       │
│ Free to cancel until Sun 18 Oct, 6:00 PM                                     │
│ [ Book table ]  [ Change ]  [ Not now ]                                      │
│ I'll always ask for this one.                                                │ hard-limit footer line
│ Expires Fri 16 Oct, 7:52 PM · If you don't answer, I won't book it.          │
```

| Part | Value | Test id |
|---|---|---|
| Status edge | top border 1.5px `--accent` while PENDING `[02 F4]` | — |
| Header icon | per kind (5.5.2), 20px, `--fg-2` | — |
| Impact line | `--t-body` `--fg-1`; built only from structured fields: what happens, to whom, from where, can it be undone `[JRN C4]` | `card-approval-impact` |
| Extra risk lines | `--t-body` `--warn` with `Warning` 16 lead: "This email includes your home address." / "This email agrees to pay ₹25,000." | `card-approval-risk` (`data-index`) |
| Payload quote | only for sends: bg `--bg-sunken`, `--r-sm`, padding 8px 12px, `--t-small` `--fg-1`, max 6 lines then Link button "Show all" `[AGT A4]` | `card-approval-quote`, `card-approval-show-all` |
| Scope control | 06 §0.4 segmented control, full inner width, 3 equal segments; default selection "Just this once"; shown **only** when 5.5.3 allows | `card-approval-scope` (segments `data-index` 0–2) |
| Always confirm line | when "Always" is selected, a line appears under the control, `--t-small` `--fg-2`: "I won't ask again for {verb phrase}. Change this in Settings → Permissions." | `card-approval-always-line` |
| Footer | expiry + promise, `--t-caption` `--fg-3`; hard-limit cards add the line "I'll always ask for this one." above it | `card-approval-footer` (countdown `card-approval-expiry`) |

### 5.5.2 Kinds (title, icon, primary, expiry)

| Kind | Icon | Title (final) | Impact line (final template) | Primary | Expiry |
|---|---|---|---|---|---|
| Send email, new recipient | `Mail` | "Send this email to {name}?" | "Will send to {address} from your {Gmail}. You haven't emailed {them} before. Can't be unsent." | "Send email" | 60 min |
| Send WhatsApp, new number or group | `People` (group) / `Send` (person) | "Send this message to {name}?" | "Will send to {Family group (8 people)} from your WhatsApp. Can't be unsent." | "Send message" | 60 min |
| Book, nothing charged now | `Calendar` | "Book this {table | slot | stay}?" | "{Place}, {area} · {day, time} · {party}" + rows Booked under / Charged now / fee / Free to cancel until | "Book {table | slot | stay}" | 15 min |
| Cancel a booking | `Calendar` | "Cancel your {table} at {place}?" | "Free to cancel until {6:00 PM today, Sun 18 Oct}. After that it costs ₹{1,000}." | "Cancel booking" (Destructive) | 15 min |
| Delete | `Delete` (new icon, §5.26) | "Delete {3 emails from Airtel}?" | "{They'll go to Gmail's Bin for 30 days. | This can't be undone.}" | "Delete {3 emails}" (Destructive) | 60 min |
| Share personal data | `PersonCircle` | "Share your {phone number} with {site}?" | "{site} will see +91 98••• ••210. I can't take it back once it's shared." | "Share {number}" | 60 min |
| Switch how (Article 9) | `Globe` | "{Email the restaurant} instead?" | "The website didn't work. I'd email {name} at {address} from your Gmail. Can't be unsent." | "{Email them}" | 60 min |
| Let a helper use an app (`use_app`; only when the app is not in the helper's `allowedApps`, 06-1 §4.1; an app whose Permissions row is Ask uses the Choice card `purpose: app_use` "Can I use {Gmail} for this?" instead, 08-0 §G.3) | app logo (§5.11) | "Let {Trips} use {Calendar}?" | "{Trips} will {read your events and add trips}. It won't delete anything." | "Allow {Calendar}" | 60 min |
| Reminder before a deadline (`variant: deadline_reminder`, J9, J10; UJ-19) | `Clock` | "Free cancellation ends {Sat 17 Oct, 6:00 PM}" | "Your {Toit} table is still booked." / "Your {Taj} room is still booked." | "Keep it" (Primary); Secondary "Cancel booking" | until the deadline |
| Add to calendar (`approvals.verb = 'calendar_write'`; only when `permissions.actions.calendar = 'ask'`; 12-2 §12.28.5) | `Calendar` | "Add {Train to Mumbai} to your calendar?" (`cards.approval.calendar_add.title`) | "{Sat 17 Oct, 4:30 PM} · {Mumbai Central} · {Google Calendar}" (`cards.approval.calendar_add.impact`) | "Add to calendar" (`cards.approval.calendar_add.button.approve`); Secondary "Not now"; scope chips shown (reversible, §5.5.3) | 60 min |
| Post in public | — | **not in v1**: X posts are draft-only (§5.7) | — | — | — |

**Calendar line** (`cards.approval.line.adds_calendar`, 08-0 §G.3, X-105): on a Book card (and the J25 Payment card, 12-1) whose plan adds a calendar event, a line under the impact, `--t-small` `--fg-2` with `Calendar` 16: "Adds it to your calendar after booking." Shown when `connections.google.calendarOn` is true; approving the card also approves that calendar add (`do_verbs ∋ 'add_calendar'`, 08-4).

Decline is always the Secondary "Not now". "Change" (Secondary; never "Edit", X-79) is present for sends (opens the Draft card in edit mode, `drafts.update`) and bookings (back to the choice).

**Deadline reminder variant** (`approval.variant = 'deadline_reminder'`, 08-0 §G.1). Posted by the job's once-routine before a free-cancellation deadline (J9 "You have a table at {Toit} at {8:00 PM tonight, Fri 16 Oct}"; J10 free cancellation). It is never a Choice card and is never auto-picked (Article 5). Buttons: [ Keep it ] (Primary) closes the card with the footer "Kept." (state COMPLETED, nothing runs); [ Cancel booking ] (Secondary) does **not** cancel: it posts a **new** standard Approval card of kind "Cancel a booking" with title "Cancel your {Taj} booking for {Sat 17 Oct}?", impact "Refund ₹{amount} per the site.", buttons [ Cancel booking ] (Destructive) [ Keep it ], and the reminder card becomes SUPERSEDED. No answer by the deadline: EXPIRED with the footer "Cancellation window closed at {Sat 17 Oct, 6:00 PM}. Booking kept." No scope control, no Ctrl+Enter. Test ids: `card-approval-keep`, `card-approval-cancel-booking`.

### 5.5.3 Scope ("how long this yes lasts")

| Segment | Meaning (stored as a `Rule` in `settings.json → rules[]`, 08-0 §A/§G.3; the action's activity row gets `approvedHow` = `card_once` / `card_chat` / `card_always`) |
|---|---|
| "Just this once" (default) | this card only |
| "For this chat" | skips future cards of the same kind + same app/person in this chat until 11:59 PM today `[foo decision: "session" made concrete, HRM allow-session]` |
| "Always" | skips future cards of the same kind + same app/person everywhere until removed in Settings → Permissions |

Scope is shown **only** for: let a helper use an app; adding/changing calendar events; moving or labelling emails (reversible). It is **hidden** on every card in the hard-limit list, and those cards show "I'll always ask for this one.": any send of any message (Article 4: approving one send never approves the next), any payment, sharing home address or phone number, anything that cannot be undone, posting in public, messaging someone new, deleting `[Articles 4, 5; JRN C4]`. See conflict §5.27 #2 (BP1 shows scope on a send).

### 5.5.4 States (JRN §5 approval state machine; copy final)

| State | Look | Copy |
|---|---|---|
| PENDING | anatomy, live expiry | as 5.5.2 |
| Submitting (tap → second look) | Primary spinner + "Checking…", others disabled, ≤ 3s | — |
| HELD (second look mismatch, Article 10) | Held strip (0.5) above the buttons; buttons replaced by two Secondary buttons, one per value | strip: "Before I do this, one check: you asked for {X}, this is {Y}. Which one?" buttons: "{X}" "{Y}" |
| APPROVED → RUNNING | buttons replaced by a row: spinner 16 + `--t-small` | "Approved by you at {9:14 AM}. Doing it now…" |
| COMPLETED | summary row, `CheckmarkCircle` `--ok`, proof chip under it (§5.15) | "✓ {Sent | Booked | Deleted | Shared | Allowed} · {9:14 AM}" (✓ drawn as the icon) |
| DECLINED | summary, grey | "You said no. Nothing was {sent | booked | deleted | shared}." |
| EXPIRED | summary, grey, Link button "Ask me again" (re-checks live terms, builds a fresh card) | "This expired at {Fri 16 Oct, 10:14 AM}. Nothing was {sent | booked}." |
| SUPERSEDED | summary, grey, struck value | "The {time | recipient | fee} changed, so I stopped. See the new card below." e.g. "The no-show fee changed from ₹1,000 to ₹1,500, so I stopped. See the new card below." |
| WITHDRAWN | summary, grey | "No longer needed. The job was stopped." |
| FAILED | status edge `--bad`, one fix button | "{Site} didn't accept it. Nothing was {sent | booked}." + [ Try again ] |
| CHECKING (SM-A8 path: the result is unknown after Approve: crash, timeout, the site hung) | edge `--warn`; header icon `Clock` 16 `--warn`; Held-style strip; **no buttons**; never re-submits | "Checking whether this went through… Don't tap again." |
| CHECKING → COMPLETED | proof found within 15 min: as COMPLETED | as COMPLETED |
| CHECKING → FAILED | no proof after 15 min: edge `--bad`; two Secondary buttons [ It went through ] [ It didn't ] (J9/J10). Either answer collapses the card ("You said it went through." / "You said it didn't go through.") and sets the action's activity `outcome` to `done` / `failed` with `resolved_by='tap'`; the card state stays FAILED because foo has no proof (Article 11) | "I can't tell if {site} did it. Call them on {phone} or check {site} before trying again." |
| Offline | Primary disabled with the offline line (a stale approval must not run later); Not now enabled; timer keeps running | "You're offline. Approve when you're back." |
| Read-only in history | summary; expanded view shows the card as approved plus "Approved by you at {time} · {just this once}" | — |

Typed "yes"/👍 → reply per 0.4. Toasts never approve (5.5.6). `cards.state` is the `ApprovalState` of the card's `approvals` row (08-0 §B.2): PENDING, APPROVED, RUNNING, COMPLETED, HELD, CHECKING, DECLINED, EXPIRED, SUPERSEDED, WITHDRAWN, FAILED; "Submitting" and "Offline" are looks of PENDING.

### 5.5.5 Keyboard and Narrator

- Tab: Show all → scope segments (←/→ inside) → Primary → Change → Not now → Ask me again. Ctrl+Enter inside the card does nothing; Approve has no shortcut [settled: 09 §9.17.4].
- Card label: "Approval needed: {title}". Description: impact line + extra risk lines + "Expires {absolute time}". Primary: "{Primary label} to {object}" ("Send email to Priya Nair", "Book table at Pizza by the Bay"). Scope group: "How long this yes lasts". Held is assertive.

### 5.5.6 Motion, groups, toast, logged, sources

- Motion: arrival; state change M-1; no pulsing edge.
- Groups: never (0.9).
- Toast: body = title + short impact, e.g. "Send this email to Rakesh? Can't be unsent."; buttons **[ Review ] [ Not now ] for every kind**. Review opens the main window at the card; Not now = DECLINED. No toast button approves anything `[coordinator binding decision from 03/09; overrides JRN J20 "Approve" button]`. A toast on an expired card opens the chat at the expired card.
- Logged: card row (shown, held, declined, expired, superseded and withdrawn are card events and tech-log lines, not activity). Activity (08-0 §G.4), one row when the action runs, with `approvedHow` and `proof`: send → `sent_email` / `sent_whatsapp`; book → `booked`; cancel a booking → `cancelled_booking`; delete → `deleted_email` / `deleted_files`; share → `shared_personal`; switch how → `switched_route`; an "Always" or "For this chat" scope → `rule_added`. Letting a helper use an app writes no activity row unless it adds a rule.
- Test ids: root `card-approval`; `card-approval-approve` (the Primary of every kind), `card-approval-change`, `card-approval-not-now`, `card-approval-ask-again`, `card-approval-held-option` (`data-index` 0–1), `card-approval-went-through`, `card-approval-did-not`; see also the 5.5.1 Test id column.
- Sources: JRN C4, §5; Hermes once/session/always/deny and fail-closed (HRM §7, §9.2); Muse system-drawn approvals and scope (MUS §9.1–9.3); OpenClaw scope line and Ctrl+Enter (OCL §7.2); Grok "Review an action", Expired (GRK §2 row 11); AGT A4 payload quote; BP1 landlord card.

---

## §5.6 Payment card (receipt style)

**Purpose.** Approve one exact amount to one payee, charged once `[Article 7; BP1 pin 7]`.

**Trigger.** A job stops before a pay button with a known final total (checkout, bill, deposit, no-show hold). If no card or UPI ID is saved, the Secret box card variant (§5.8.4) comes first. If the payment would pass the monthly purchase cap, the Spend-cap card (§5.21) comes instead.

### 5.6.1 Anatomy (`--card-w` 440px)

```
┌══════════════════════════ 1.5px --accent top edge ══════════════════════════┐
│ [Wallet 20] Approve this payment                                    one-time │ 22
│ Taj Holiday Village, 2 nights (12–14 Dec)                          ₹14,600  │ receipt grid
│ Taxes and fees                                                ₹0 (included)  │ --t-body, money right
│ Free cancellation until Thu 10 Dec                                      ₹0  │
│ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │ 1px dashed --line, 4px above
│ Total charged once                                                 ₹14,600  │ --t-body-strong
│ Booked under Vikas Sharma · vikas@… · +91 98••• ••210                       │ --t-small --fg-2
│ Pay with: Visa ••4242                                              Change   │ --t-small; Link button
│ You'll confirm it's you with Windows Hello.                                  │ --t-small --fg-2 (≥ ₹10,000 only)
│ [ Approve ₹14,600 ]  [ Not now ]                                             │ 40
│ [Lock 16] {agentName} never sees your card · Expires in 9:59        9:41 AM │ --t-caption; lock --ok
└──────────────────────────────────────────────────────────────────────────────┘
```

| Part | Value | Test id |
|---|---|---|
| Receipt grid | CSS grid `1fr auto`, column gap 16px, row gap 2px; left `--t-body` `--fg-1`; right `--t-body` `tabular-nums`, right-aligned `[BP1 .receipt]` | `card-payment-receipt` |
| Line items | max 5 rows; more → a row "+{n} more items" (Link button) that expands inline | `card-payment-line` (`data-index`), `card-payment-more` |
| Divider | 1px dashed `--line`, padding-top 4px on the total row `[BP1 .receipt .tot]` | — |
| Total row | `--t-body-strong` both columns | `card-payment-total` |
| Cancel terms row | value "₹0" when free; non-refundable: whole row `--bad`: "No free cancellation. If you cancel, you lose ₹{total}." | `card-payment-cancel-terms` |
| Late fee / overdue | row in `--warn`: "Late fee if paid after {Fri 23 Oct}  ₹100"; overdue in `--bad`: "This was due {Fri 23 Oct}. {Airtel} adds ₹100 late fee." | `card-payment-late-fee` |
| Personal data line | the G5 items being shared (name, email, phone) are listed here, masked, so the Approve tap covers them `[JRN J10 step 5]` | `card-payment-personal` |
| Pay with | `--t-small`; method masked; Link button "Change" opens a menu of saved methods + "Add a card" | `card-payment-method`, `card-payment-change-method` |
| Footer | `LockClosed` 16 `--ok` + `--t-caption` `--fg-3`; countdown `tabular-nums` | `card-payment-footer` (countdown `card-payment-expiry`) |

### 5.6.2 Copy (final)

| Slot | Copy |
|---|---|
| Title | "Approve this payment" |
| Right label | "one-time" |
| Total label | "Total charged once" |
| Primary | "Approve ₹{total}" |
| Secondary | "Not now" |
| Footer (card) | "{agentName} never sees your card · Expires in {mm:ss}" |
| Footer (UPI) | "{agentName} never sees your bank details · Expires in {mm:ss}" |
| Big payment line (total ≥ the Hello amount `money.bigPaymentPaise`, default ₹10,000, 08-0 §A) | "You'll confirm it's you with Windows Hello." / Hello not set up: "You'll type the amount to confirm." |
| Windows Hello prompt text (owned by 09 §9.19) | "Approve paying {amount} to {payee}" [settled: X-08] |
| Typed confirm (no Hello) | dialog owned by 09 §9.19.4: title "Confirm this payment", body "Type the amount to approve paying {payee}.", field name "Amount to approve" (06 §15); placeholder "{total digits, e.g. 14600}"; button "Approve ₹{total}" (enabled only on an exact match; dialog per 09 §9.19.4) [settled: X-08, X-04] `[Article 7]` |
| Live amount differs from bill email | line above the grid, `--t-small` `--warn`: "The bill email said ₹1,179; {Airtel}'s site now says ₹1,279 (includes a late fee). I'm using the site's amount." |
| Duplicate risk (same payee + amount in 7 days) | for a bill, the Bill card's duplicate look (§5.29, `bill.duplicate`) is the warning and this row does not apply; for any other payment, shown **before** this card as a §5.3 card: "You paid {Airtel} ₹1,179 on {Mon 12 Oct}. Pay again anyway?" [ Don't pay ] [ Pay again ] |
| Price moved since the user looked (a new card after SUPERSEDED) | under the total row, `--t-small` `--fg-2`: "Up ₹{520} since you looked." / "Down ₹{520} since you looked." (UX-22) |

### 5.6.3 States (JRN §5; copy final)

| State | Look | Copy |
|---|---|---|
| PENDING | anatomy; countdown from 10:00 | — |
| CONFIRMING (Hello open) | buttons disabled; row: spinner + `--t-small` | "Waiting for Windows Hello…" |
| Hello cancelled / failed | stays PENDING; line `--t-small` `--warn` + Link button "Try again" | "I need you to confirm it's you before paying." |
| Submitting (second look, Article 10) | "Checking…" on Primary | — |
| HELD | Held strip | "Before I do this, one check: you asked for {X}, this is {Y}. Which one?" |
| APPROVED → RUNNING | buttons replaced by spinner row | "Approved by you at {time}. Doing it now…" |
| Waiting for UPI | spinner row; countdown 5:00 | "Approve ₹{total} in your UPI app on your phone. Waiting… {4:58}" |
| Bank check (3-D Secure) | spinner row; a §5.10 sign-in card follows below | "Your bank is checking this. Finish on the bank's page." |
| COMPLETED | summary `--ok` + proof chip | receipt line "✓ Paid ₹{total} · {payee} · ref {ref}" (`ref` = the payment's confirmation or UPI transaction reference from its proof; none → the "· ref" part is left out) |
| DECLINED | summary grey | "You said no. Nothing was paid." (J10 adds a foo line: "Okay, I won't pay. The 3 options are still above if you change your mind.") |
| EXPIRED | summary grey + "Ask me again" (re-checks the live price first) | "This expired at {Fri 16 Oct, 9:58 AM}. Nothing was paid." |
| SUPERSEDED | summary grey, old total struck; header right label "Replaced" (`--t-caption-strong`, replaces "one-time") (UX-22) | "The price changed from ₹{old} to ₹{new} at checkout, so I stopped. Nothing was paid." / "Taxes of ₹{x} showed up at the last step, so I stopped. Nothing was paid." / "The amount changed from ₹{old} to ₹{new}, so I stopped. Nothing was paid." New card below with the "Up / Down ₹{n} since you looked." line (5.6.2). The walkthrough's "Replaced: the price changed" phrasing is superseded |
| WITHDRAWN | summary grey | "No longer needed. The job was stopped." |
| FAILED, bank declined | edge `--bad`; [ Try another card ] + Link "Pay with UPI" | "Your bank said no. No money was taken." |
| FAILED, OTP timed out | [ Try again ] | "Your bank's code timed out. No money was taken." |
| FAILED, UPI not approved in 5 min | [ Try again ] | "Your UPI app didn't get an approval in time. No money was taken." |
| CHECKING (result unknown: crash, timeout, window closed) | edge `--warn`, Held-style strip, **no buttons** | "I'm not sure the payment went through. Checking your email and the site before doing anything else." |
| CHECKING → FAILED after 15 min | edge `--bad`; [ I checked, try again ] | "I couldn't confirm it. Check your bank app before trying again." |
| AI down at Approve | stays PENDING, line | "I need your AI back to double-check this before paying. I'll ask again when it's back." |
| Offline | Primary disabled; offline line; countdown runs | "You're offline. Approve when you're back." |
| Read-only in history | summary; expanded receipt + "Approved by you at {time} · Windows Hello used" | — |

`cards.state` is the `ApprovalState` (08-0 §B.2); CONFIRMING, Waiting for UPI, Bank check, Hello cancelled, AI down and Offline are looks of PENDING or RUNNING, not states.

Rules: payment submitted **once**; a CHECKING card never re-submits `[Article 7; JRN §5]`. A new total, by any amount up or down, always means a new card `[JRN C5]`. Never a scope control; never "Always" for money `[AGT A10]`.

### 5.6.4 Keyboard, Narrator, motion

- Tab: +more → Change → (typed-confirm field) → Approve → Not now. Ctrl+Enter does nothing; Approve has no shortcut [settled: 09 §9.17.4].
- Card label: "Payment approval: ₹{total} to {payee}". Description reads every receipt row as "{label}, {amount}", then "Total charged once, {amount}", then "Expires at {absolute time}". Primary: "Approve ₹{total} to {payee}". Countdown announcements per 0.7.
- Motion: arrival; M-1; countdown text swaps only.

### 5.6.5 Groups, toast, logged, sources

- Groups: never; group line "Payment stays private. I've asked {userName} in their own chat." (0.9).
- Toast: body "Pay {payee} ₹{total} from your saved {UPI | card}?"; buttons [ Review ] [ Not now ]. **Review** brings the main window to the front with this card focused; Hello runs from there. There is no separate receipt window `[coordinator binding decision; replaces JRN J20 receipt window]`. A payment can never be approved by a toast button `[APL §9.2]`. Not now = DECLINED. No extra toast when < 2 min remain `[JRN J20]`.
- Logged: card row (line items, total, payee, method last 4 only). Activity (08-0 §G.4): exactly one `paid` row per payment (kind `paid`) with `amountPaise`, `approvedHow` = `hello` / `typed_amount` / `card_once`, `proof`, and `outcome` = `done` (proof), `failed` (bank or site said no) or `unknown` (CHECKING; updated in place when resolved). Shown, held, declined, expired and superseded are card events and tech-log lines. Spend meter (08) adds the amount to the month's purchases (`submitted` and `checking` count as spent, 08-0 §H).
- Test ids: root `card-payment`; `card-payment-approve`, `card-payment-not-now`, `card-payment-ask-again`, `card-payment-try-again`, `card-payment-try-another-card`, `card-payment-pay-upi`, `card-payment-checked-try-again`, `card-payment-hello-retry`; see also the 5.6.1 Test id column.
- Sources: JRN C5, J10, J11, §5; Tab submit once and stop on change (TAB §2); Instinct/Stripe Link 10-minute exact-amount approval and re-approval on raise (INS §1.4; AGT A10); Grok spend card "no charge was made" (GRK §2 row 12); Perplexity on-device authorization (PPX §9.9); BP1 receipt card.

---

## §5.7 Draft card (email, WhatsApp message, X post)

**Purpose.** Every outbound message is shown as a draft first; a draft is never permission `[Article 4]`.

**Trigger.** Any job that would send an email or a WhatsApp message, or write an X post; "draft …" requests; brief action "Draft reply".

### 5.7.1 Anatomy (`--card-w` 440px)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [Document 20] Draft · not sent                                         Email │ 22  label = channel
│ To       Rakesh Sharma <r.sharma@gmail.com>                                  │ rows: --t-small --fg-2 / --t-body
│ Subject  Re: October rent                                                    │ (email only)
│ ──────────────────────────────────────────────────────────────────────────── │ 1px --line
│ Hi Rakesh, I'll pay October's rent on Tuesday 20 Oct. Thanks for your        │ body --t-body, pre-wrap
│ patience. Vikas                                                              │ max 10 lines → "Show all"
│ [Document] lease-renewal.pdf · 240 KB                                        │ attachment chips (§5.23 file, compact)
│ [ Send email ]  [ Change ]  [ Discard ]                                      │ 40
│                                                                     9:12 AM │
└──────────────────────────────────────────────────────────────────────────────┘
```
- X variant: no To/Subject; under the body `--t-caption` `--fg-3` "{n} characters left"; Primary "Open in X to post".
- WhatsApp variant: "To  Mom (WhatsApp)"; Primary "Send message".
- Pending look (07 R-14, X-65): a known-recipient draft **is** an approval card in PENDING. From the moment it is shown, under the body: `--t-small` `--fg-1` "Will send to {address} from your {Gmail}. Can't be unsent." and the footer `--t-caption` `--fg-3` "Expires {Fri 16 Oct, 10:14 AM} · If you don't answer, I won't send it." (60 min). It has no `--accent` status edge (the full Approval card keeps that).
- Gmail signature (owner question Q4, recommended default; mechanics 08-3 §16.1.4): Gmail drafts carry the user's Gmail signature: emails show the user's default Gmail send-as signature under the body, `--t-small` `--fg-2`, 8px above it; it is sent as part of the email, is not editable in the card, and is absent when Gmail has none. WhatsApp and X drafts have no signature.
- Change mode (the "Change" button; X-79): body becomes a textarea (Text field style, 06 §0.4, auto-grow up to 10 lines then scroll); Subject becomes a Text field; **To is not editable in the card** (changing a recipient goes through chat and makes a new card) `[foo decision: recipient changes are the riskiest edit]`. Buttons become [ Save changes ] [ Cancel ].
- "edited" label: after any change, the header right label reads "{Email} · edited" (`--t-caption` `--fg-3`).

### 5.7.2 Copy (final)

| Slot | Copy |
|---|---|
| Title | "Draft · not sent" |
| Right label | "Email" / "WhatsApp" / "X post" |
| Row labels | "To", "Subject" |
| Buttons | "Send email" / "Send message" / "Open in X to post"; "Change"; "Discard" |
| Edit buttons | "Save changes", "Cancel" |
| Send, known recipient | Send **is** the approval tap: `draft:send` approves the draft's `approvals` row once (`approvedVia='card'`; 08-0 §G.7, X-65). The button row becomes: `--t-small` "Sending in {5}…" (counts 5→1 once per second) + Secondary "Undo" `[JRN J12 step 4: 5-second local undo]` |
| Undo tapped (before `undo_until`) | card back to draft (a fresh PENDING approval, expiry reset to 60 min); line "Not sent. The draft is still here." After the 5 s the undo is refused and the countdown has already ended in Sending |
| Expired (60 min, no Send) | summary grey: "This expired at {Fri 16 Oct, 10:14 AM}. Nothing was sent." + Link button "Ask me again" (07 §5) |
| Superseded / withdrawn | 0.5 Superseded ("See the new card") / Withdrawn copy |
| Send, new recipient / group / risky content | Send opens the Approval card (§5.5) under the draft; the draft shows "Waiting for your OK below ›" (Link focuses it) |
| HELD (second look) | Held strip: "Before I send this, one check: you said {Monday}, the draft says {Tuesday 20 Oct}. Which one?" buttons "{Monday 19 Oct}" "{Tuesday 20 Oct}" (Article 10 template, JRN J12 wording) |
| Sent | summary `--ok`: "✓ Sent · {9:14 AM}" + proof chip "Proof: in your Gmail Sent folder · open" (WhatsApp: "Proof: Delivered") |
| Discarded | summary grey "Draft discarded" |
| X opened | summary `--fg-2`: "Opened in X · not posted by {agentName}"; foo line: "It's ready in X. Press Post there when you're happy." No proof chip |
| X too long | counter `--bad`: "Too long for X by {34} characters." Primary disabled; Secondary "Shorten it" added first in the row |
| No send permission | Primary replaced by "Open in Gmail"; line: "I can't send from your Gmail, so I've saved this as a draft there." |
| Failed | edge `--bad`, [ Try again ]: "Gmail didn't send it. Nothing went out." |
| Offline at Send | line + [ Yes, send when online ] [ No, keep the draft ]: "You're offline. Send it as soon as you're back?" |
| WhatsApp daily limit (≥ 30 `sent_whatsapp` activity rows since local midnight, 08-0 §H.2, X-129) | Send disabled, state `pending`; line "I've sent 30 WhatsApp messages today, which is my daily limit. I can send again after {Sat 17 Oct, 12:00 AM}." (`cards.draft.line.wa_daily_limit`). The 3-second gap between sends is the engine's FIFO send queue, never shown as an error |
| WhatsApp number can't be checked (bridge not open, X-124) | Send disabled; line "I can't check that number right now." (`cards.draft.line.wa_cant_check`) |
| Queued | summary `--fg-2` "Will send when you're back online" + Link "Cancel" |
| Updating (user typed "make it shorter") | body stays visible at `--fg-3`; line `--t-caption` "Updating the draft…"; buttons disabled; the same card updates in place (`drafts.update`, same approval, new nonce) `[POK §9.4]` |
| Discard | `drafts.delete`; the approval becomes WITHDRAWN; summary "Draft discarded" |
| Typed "send it" | foo: "Tap Send on the draft so I know it's really you." |

### 5.7.3 States (summary)

| State | Look |
|---|---|
| Draft (pending) | anatomy; no status edge (not gated by itself) |
| Editing | edit mode; Ctrl+Enter = Save changes; Esc = Cancel edit |
| Updating | 5.7.2 |
| Sending countdown | 5.7.2; Undo focused |
| Held | 0.5 Held |
| Sending | Primary spinner "Sending…" |
| Sent / Discarded / Opened in X / Queued | summary rows (5.7.2) |
| Failed | 0.5 Failed |
| Disabled (no permission) | 5.7.2 |
| Offline | 5.7.2 |
| Read-only in history | summary; expanded view shows the final sent text and "Sent by you at {time}" |

`cards.state` (08-0 §G.2): `pending` (Draft), `editing` (Change mode), `undo_window` (the 5 s "Sending in {n}…"), `sending`, `sent`, `discarded`, `opened_in_app` (X opened, or "Open in Gmail" when sending is not allowed), `queued_offline`, `failed`, `expired`, `superseded`, `withdrawn`. Held and Updating are looks of `pending`. Hard-limit drafts (new recipient, group, money, personal data) skip the 5 s undo: the full Approval card (§5.5) is the only tap (08-0 §G.7).

### 5.7.4 Keyboard, Narrator, motion, groups, toast, logged, sources

- Tab: Show all → attachments → Send → Change → Discard. Ctrl+Enter = Save changes (Change mode only); it never sends [settled: 09 §9.17.4]. Countdown: Undo receives focus automatically (it is the safe action) `[foo decision]`.
- Card label: "Draft, not sent: {Email} to {name}". Description: "Subject {subject}. {first 200 characters of body}". Send button: "Send email to {name}".
- Motion: arrival; edit mode M-1.
- Groups: never (drafts for a group are made in 1:1; JRN J16).
- Toast: "{agentName} · Draft ready for {Rakesh}" [ Review ] [ Not now ] [settled: X-02, X-04]; Review opens the chat at the card. Never sends from a toast.
- Logged: card row (body included, local only). Activity (08-0 §G.4): `sent_email` or `sent_whatsapp` (recipient masked, subject, `approvalId`, `proof`, `approvedHow='card_once'`) when it is sent; `opened_x_draft` when X compose opens. Shown, changed, undo, held and discarded are card events and tech-log lines. Body text never goes to the activity log.
- Test ids: root `card-draft`; `card-draft-send` (all three Primary labels), `card-draft-change`, `card-draft-discard`, `card-draft-save`, `card-draft-cancel-edit`, `card-draft-undo`, `card-draft-show-all`, `card-draft-shorten`, `card-draft-open-gmail`, `card-draft-send-when-online`, `card-draft-keep-draft`, `card-draft-cancel-queued`, `card-draft-ask-again`; body `card-draft-body`, subject `card-draft-subject`, countdown `card-draft-countdown`.
- Sources: JRN C6, J12; Poke draft→yes→send, edit in place (POK §4, §9.4); Grok draft card, "Send email / Send message / Discard", "Message not delivered", X draft-only (GRK §2 row 13, §3.1); ChatGPT single-use sends (GPT §9.2); AGT A5; BP1 "Drafts that wait for you".

---

## §5.8 Secret box (key, login, card, one-time code)

**Purpose.** Take a secret without it ever entering chat, logs, screenshots or the AI `[Article 8]`. The value goes straight to Windows Credential Manager under the vault name `foo/{kind}/{name}` of 08-0 §E.8 (X-73; e.g. `foo/ai_key/openai-key`, `foo/login/irctc.co.in`, `foo/card/4242`, `foo/web_key/exa`); the AI only ever gets the plain name.

**Trigger.** A job needs a key, a site login to save, a card, or a code (JRN J13 lane chooser); "Move to secret box" from §5.9; Settings → Money "Add a card" and Settings → Account & your AI (keys) use the same component [X-07].

### 5.8.1 Anatomy (key variant, `--card-w` 440px)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ To use your own AI I need your OpenAI key. Paste it in the box below, not in │ reason --t-body
│ the chat.                                                                    │
│ [Key 20] OpenAI key                                                   secret │ 22
│ ┌──────────────────────────────────────────────────────────────────┬───────┐ │
│ │ ••••••••••••••••••••                                               │  👁   │ │ 36 field (--field-h), --t-mono, eye 40×40
│ └──────────────────────────────────────────────────────────────────┴───────┘ │
│ [ Save securely ]  [ Cancel ]                                                │ 40
│ [Lock 16] Stored on this PC. {agentName}'s AI never sees it.        9:03 AM │ --t-caption --ok
└──────────────────────────────────────────────────────────────────────────────┘
```

| Part | Value | Test id |
|---|---|---|
| Field | Text field (§0.3, `--field-h` 36px) with `font: var(--t-mono)`; `type="password"`; `autocomplete="off"`, `spellcheck="false"`, `autocapitalize="off"`; right padding 40px for the eye | `card-secret-field` |
| Eye toggle | Icon button 40×40, `Eye` / `EyeOff` 20; resets to hidden every time the card renders, after save, and after 30s shown `[OCL §7.1; foo decision 30s]` | `card-secret-eye` |
| Footer | `LockClosed` 16 + text, both `--ok` (`#137044` on `--bg-raised` 6.3:1) `[BP1 .lock]` | — |
| Saved state | the field and buttons are replaced by one row: `Key` 16 + "{Name} · saved {Fri 16 Oct}" `--t-small` + Secondary "Replace" + Link button "Remove" (opens 06-3 §14 C-22). Key and login values are never shown; a card shows brand + last 4 ("{Visa} ••{4242}", 05 §0.4; X-116) | `card-secret-saved`, `card-secret-replace`, `card-secret-remove` |

### 5.8.2 Copy (final)

| Slot | Copy |
|---|---|
| Reason (first line) | "{One line: why I need it}" e.g. "To use your own AI I need your OpenAI key. Paste it in the box below, not in the chat." |
| Title | the plain name: "OpenAI key", "IRCTC login", "Card", never an environment-variable name `[AGT A6]` |
| Right label | "secret" |
| Placeholder | "Paste it here" |
| Eye | Narrator/tooltip "Show secret" / "Hide secret" `[OCL en.ts:3566]` |
| Primary | "Save securely" (disabled while empty) |
| Secondary | "Cancel" |
| Footer | "Stored on this PC. {agentName}'s AI never sees it." |
| Checking (AI keys only) | Primary spinner "Checking the key works…" |
| Saved | summary line "✓ Saved securely. {agentName}'s AI never sees it." then the saved row "{Name} · saved {date}" [ Replace ] |
| Key rejected by the service | edge `--bad`, value kept masked in the field: "{OpenAI} didn't accept that key. Check it and paste it again." [ Try again ] `[GRK v0.54 keep what was typed]` |
| Save failed (vault write) | edge `--bad`, value kept: "That didn't save. Try again." [ Try again ] |
| Card already saved (card kind only: a saved card with the same last 4, `SECRET_EXISTS`, X-129; every other kind replaces and logs `secret_replaced`) | edge `--bad`, state `rejected`, nothing saved: "You already saved a card ending {4242}. Remove it in Settings → Money first." (`cards.secret.line.exists`) [ Open Money ] (`card-secret-open-money`, deep link `foo://settings/money/methods`) |
| Cancelled | summary grey "Skipped. Nothing was saved." |
| Replace | field returns empty with [ Save securely ] [ Cancel ]; a saved value is never read back or shown `[GRK §1.2 write-only]` |
| Remove | 06-3 §14 C-22; after Remove the card collapses to the summary "Removed. {agentName} can't use it any more." |

### 5.8.3 States

| State | Look |
|---|---|
| Requested (pending) | anatomy, field empty, Primary disabled |
| Typing | Primary enabled; field focus (06 §0.4) |
| Shown | eye pressed; value visible in `--t-mono`; auto-hides after 30s |
| Saving / Checking | Primary spinner; field read-only |
| Saved | saved row |
| Failed | 5.8.2; field keeps the value (in memory only) |
| Cancelled | summary |
| Replaced | saved row with the new date; activity log `secret_replaced` |
| Disabled | Credential Manager unavailable: Primary disabled, line "I can't reach this PC's safe storage right now." + [ Try again ] |
| Offline | key variant: saving works offline, "Checking the key works…" waits; line "I'll check the key when you're back online." |
| Read-only in history | saved row or summary only; never any value |

`cards.state` (08-0 §G.2): `asking` (Requested, Typing, Shown), `checking` (Saving / Checking), `saved` (Saved, Replaced), `rejected` (key refused or save failed), `expired` (the job that asked ended without an answer), `withdrawn` (Cancelled, or the job was stopped).

### 5.8.4 Variants

| Variant (`secretKind`, 08-0 §G.1) | Fields (each a Text field, label above in `--t-small` `--fg-2`, 8px gaps) | Title | Saved line | Notes |
|---|---|---|---|---|
| Key (`ai_key`) | Value | "{Service} key" | "✓ Saved securely. {agentName}'s AI never sees it." | — |
| Login (`login`; after a sign-in, J13 step 5) | Username (not masked), Password (masked + eye) | "{Site} login" | "✓ {IRCTC} login saved. I'll fill it in without seeing it." | offered by the question "Save your {IRCTC} login so I can sign in myself next time? It stays on this PC and I fill it in without seeing it." [ Save ] [ Don't save ]; values the user typed on the site are never captured, they type them again here |
| Card (`card`) | Card number (masked, Luhn-checked, groups of 4), Expiry (MM/YY), CVV (masked, 3–4 digits), Name on card | "Card" | "✓ {Visa} ••{4242} saved. {agentName}'s AI never sees it." | reason line "To pay, I need a card. Type it here, not in the chat."; CVV is used for this payment only and **never saved** |
| Code box (`otp`) | one masked numeric field, placeholder "123 456" | — | none (never stored) | reason "Your bank sent a code to {+91 98••• ••210}."; buttons [ Use code ] [ I'll type it on the page ]; foo's browser types it into the page and forgets it `[HRM OTP dialog; JRN J13]` |
| CVV (`cvv`) | one masked numeric field, 3–4 digits, placeholder "123" | "Card code" | none (never stored) | reason "{Site} needs the 3-digit code on the back of your {Visa} ••{4242}."; buttons [ Use code ] [ I'll type it on the page ]; foo's browser types it into the page and forgets it |
| UPI ID (not a secret, so **not** a Secret box) | — | — | — | in chat foo asks with a Choice card (`purpose: job`, typed answer) "What's your UPI ID? It looks like name@bank." and saves it to `money.upiId` (08-0 §A), shown masked "vik•••@okhdfc"; Settings → Money uses the plain "Add a UPI ID" dialog (06-2 §6.5) |
| Voice key (`voice_key`; one time, first voice note without an OpenAI key) [X-43] | Value | "OpenAI key" | "✓ Saved securely. Voice notes now go to OpenAI to become text." | reason line "Add an OpenAI key for faster voice notes. Your voice goes to OpenAI to become text, and nowhere else."; Primary "Save securely", Secondary **"Use this PC instead"** (replaces "Cancel"; summary "Okay. I'll turn voice notes into text on this PC."; the local pack then downloads with the X-22 line); shown once ever (`chat.openAiKeyOffered`), never in groups; the voice note waits until it is answered |
| Your key (`user_key`; "Password or key" in the + menu, 04-2, and a password or unknown key moved from the composer, 04-2 §22.4) [CR-0057, X-214] | Name (not masked, placeholder "Like GitHub key", 40 characters at most), Password or key (masked + eye) | "Key" / "Password" (from the + menu, or the paste catcher's suggested name) | "{GitHub key} saved securely. {agentName}'s AI never sees it."; saved row "{GitHub key} · saved {date}" | Save waits for the value; Save with no name shows "Give it a name, like GitHub key." and writes nothing; saved as `foo/user_key/{name}` (08-0 §E.8); the AI sees only the name and no job reads the value yet |
| Web tool key (`web_key`) [X-46] | Value | "{Exa} key" / "{Firecrawl} key" / "{Browser Use} key" | "✓ Saved securely. {Exa} sees what you search; your AI never sees the key." | opened only from Settings → Connections → Internet (06-2 §6.8), never offered by foo in a chat; reason line "Paste your {Exa} key here, not in the chat." |

Field errors use 06 §0.4 "Field error": "That card number doesn't look right." / "Check the expiry date." / "The code is 4 to 8 digits." / "Give it a name, like GitHub key." / "Keep the name to 40 characters." (CR-0057)

### 5.8.5 Rules the build MUST meet

1. The value travels renderer → main process over one IPC call and is written to Credential Manager; the IPC payload is never logged; the input's value is cleared from the DOM immediately after the write succeeds.
2. The value is never in `foo.db`, logs, crash reports, screenshots, page snapshots, the clipboard history set by foo, or any text sent to the AI. The AI receives only `{name}` (e.g. "OpenAI key").
3. Job screenshots and the live view mask this card's field (blank rectangle `--bg-sunken`).
4. Copy (Ctrl+C) and drag out of the field are blocked while masked.

### 5.8.6 Keyboard, Narrator, motion, groups, toast, logged, sources

- Field gets focus when the user clicks or Tabs in (never automatically). Enter in the field = Save securely. Ctrl+Enter = Save securely. Alt+F8 toggles the eye (same as Windows password boxes) `[WIN]`.
- Card label: "Secret box: {title}". Field label: "{title}, hidden" / "{title}, shown". While hidden, Narrator reads only "{n} characters"; while shown it behaves as a normal edit field (the user asked to see it). On save, Narrator says "Saved securely."
- Motion: arrival; M-1 to the saved row.
- Groups: never; group line "Your password stays private. I've asked {userName} in their own chat."
- Toast: "{chat} · I need your {OpenAI key} to carry on." [ Open ].
- Logged: card row with `payload.name` only. Activity (08-0 §G.4, kind `changed`): `secret_saved`, `secret_replaced`, `secret_removed` (with the name, never the value); a login saved after a sign-in is `saved_login` (kind `connected`). A rejected key is a card event and a tech-log line.
- Test ids: root `card-secret`; `card-secret-save`, `card-secret-cancel`, `card-secret-use-this-pc` (voice key), `card-secret-use-code`, `card-secret-type-on-page`, `card-secret-try-again`; fields `card-secret-field` (`data-index` for multi-field variants); see also the 5.8.1 Test id column.
- Sources: JRN C7, J13; Grok secure secret card, write-only, Replace, keep-on-fail (GRK §1.2, §1.5; AGT A6); OpenClaw secret field with 40px eye (OCL §7.1); Hermes secret/OTP dialogs (HRM §7); Tab card page and masked screenshots (AGT A6); BP1 secret box.

---

## §5.9 Paste catcher

**Purpose.** Stop a secret from being sent as a normal message `[Article 8; JRN C8]`.

**Trigger.** On paste, or at Enter for typed text, the composer text contains: `sk-`, `sk-proj-`, `AIza`, `ghp_`, `xoxb-` prefixes; a 13–19 digit number passing the Luhn check; a 32+ character high-entropy string (Shannon entropy ≥ 4.0 bits/char, no spaces); or a 4–8 digit number while foo's last message asked for a code `[JRN C8]`. Detection runs locally; nothing is sent while the catcher is open.

### 5.9.1 Anatomy (docked above the composer, width = composer field width)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [Warning 20 --warn] That looks like a password or key                        │ 22  --t-body-strong
│ You were about to send it as a normal message. Save it in the secret box     │ --t-body
│ instead?                                                                     │
│ [ Move to secret box ]  [ Send anyway ]                                      │ 40
└──────────────────────────────────────────────────────────────────────────────┘
┌ composer ──────────────────────────────────────────────────────────────────┐
│ here is my key ••••                                                [Send]  │ detected span masked
└────────────────────────────────────────────────────────────────────────────┘
```
- Container: card frame (0.2) with border 1px `--warn` (status meaning: needs you) and `--shadow-16`; radius `--r-lg`; 8px gap above the composer. It is **not** a chat message (nothing was sent) `[OCL §7.1 docked question card]`.
- In the composer, the **whole** detected span is replaced on screen by exactly "••••" in `--fg-2` (`PasteCatch.mask`, 08-0 §B.3; no prefix, no last digits): nothing of the secret shows (08-0 §H ruling; 04 wins over BP1's "sk-proj-7Hc2…"). The real value stays in memory only until the user chooses.

### 5.9.2 Copy (final)

| Slot | Copy |
|---|---|
| Title | "That looks like a password or key" |
| Body | "You were about to send it as a normal message. Save it in the secret box instead?" |
| Primary | "Move to secret box" |
| Secondary | "Send anyway" |
| After "Move to secret box" | the span is removed from the composer; a Secret box (§5.8) appears in the chat, **prefilled** (masked) with the value, title guessed from the pattern: `sk-`/`sk-proj-` → "OpenAI key", `AIza` → "Google key", `ghp_` → "GitHub key", `xoxb-` → "Slack key", Luhn number → Card variant, code → Code box, other → "Password or key" |
| After "Send anyway" | the message is sent with the span replaced: chat shows "•••• (hidden)"; the AI receives "[the user typed a secret; it was hidden]". The value is not stored anywhere |
| During a sign-in (J13) | foo replies after a "Send anyway": "Please type it on the site instead. I've hidden what you sent." |

### 5.9.3 States, keyboard, Narrator, motion

| State | Look / behaviour |
|---|---|
| Shown | composer Send disabled; Enter in the composer does nothing |
| Hover / pressed / focus | 0.3 |
| Dismissed (Esc) | catcher closes; the span **stays masked** "••••" in the composer (08-0 §H); the next Enter re-runs detection and re-opens the catcher |
| Offline | identical (local) |
| History | never stored as a card; no read-only form |

- Focus stays in the composer; Tab reaches "Move to secret box" first. Ctrl+Enter inside the catcher = Move to secret box.
- Narrator (assertive, once): "Warning: That looks like a password or key. Press Tab to choose." Group label "Warning: That looks like a password or key".
- Motion: appears with fade + rise 8px `--m-slow`; leaves with `--ease-out` 167ms.

### 5.9.4 Groups, toast, logged, sources

- Groups: identical (the composer is the same).
- Toast: never.
- Logged: tech log `{DATA}\logs\app-*.log` line "paste catcher shown: {pattern kind}, choice: {move | send_anyway | dismissed}" (no value). No activity row (08-0 §G.4). Never the value.
- Test ids (area `composer`, 08-0 §C): `composer-paste-catcher`, `composer-paste-move`, `composer-paste-send-anyway`. Copy keys `composer.paste_catcher.{slot}`.
- Sources: JRN C8; Grok bearer-token-in-chat lesson (GRK §1.4–1.5); Gemini "don't type passwords here" (GEM §9.4); BP1 "Catch a key before it's sent".

(Continued in `05-cards-3.md`.)
