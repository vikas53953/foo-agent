# 12 · New v1 features R25–R31 · part 1 of 2: J24 Ideas gallery, J25 Trains, J26 Recharges and billers

Part 1 (this file): §12.0 rules for this chapter, §12.24 J24 Ideas gallery (R25), §12.25 J25 Trains end to end (R26), §12.26 J26 Recharges and everyday billers (R27), §12.A acceptance tests AT-158…AT-199. Part 2 (`12-features-r25-r31-2.md`): J27 Catch me up, J28 Photos and papers in, J29 Send to foo, J30 Private chat (§12.27–§12.30, AT-230…AT-266). Read both; they are one chapter.

Status: written 2026-10-16 by fixer group G (review Phase 1, F-190 / UJ-07). Rank: behaviour spec, same level as 07 (README order of authority, level 5). Owner approval: Vikas approved R25–R31 (J24–J30) together on 2026-10-16 (X-100; Q9 answered). Builders start M15 Step 2 after M13.

**Binding names.** Every key, type, id, path and enum here follows `08-0-canonical-names.md` (X-53…X-110). All names proposed by this chapter were merged into 08-0 on 2026-10-16 (X-90); there are no open addenda. Copy in "double quotes" is final; each string carries its copy key (08-0 §D) in backticks before it. `{x}` marks a variable; examples follow the 2026 calendar and the pinned test clock **Fri 16 Oct 2026, 9:00 AM IST** (07 §7.0.6).

**Cross-references other chapters must add (one-line pointer each; merged into 08-0 under X-90).**
- 05 (group E): §5.29 Bill card is reused by J26 (states `waiting, reminded, paying, paid, already_paid, expired`); §5.14 Routine suggestion = card type `routine_offer`, gains the `source` payload field and the idea layout of §12.24.5; 05-1 §0.1 catalogue rows point here for J24–J26.
- 06 (group E): new Page **Ideas** (`screen-ideas`) per §12.24.3, added to the 06 §0.9 inventory; 06-2 §8.4 Routines "First time" state gains the Link "See ideas".
- 03 (group D): 03-1 §3.4.2 More options menu gains "Ideas" directly under "Routines"; 02 F6 icon list gains the Fluent icons named in §12.24.3.
- 08-2 (group B): IRCTC recipe and Tatkal timer (§12.25.6), biller payment flow (§12.26), `resources/billers.json`, step phrases for trains and billers, the "wait until it opens" job state.
- 08-3 (group C): routine builtins `pnr_watch` and `recharge_due` (§12.25.8, §12.26.7); `created_from='idea'` is prompted (§12.24.6); `routine_runs.observed` for the `changed` condition.
- 08-1 (group A): `routines.builtin` and `created_from` CHECK values per DB-04 (`pnr_watch`, `idea`) plus `recharge_due`; `jobs.waiting_reason 'opens_at'` and `jobs.wake_at`.
- 08-0 (architect): deep link `foo://ideas` and `View` `{ kind: 'screen', id: 'ideas' }` (X-110); test ids.
- 07 (group F): add J24–J26 to the 07 index with the surface keys in each "Touches" line below; 10: AT-158…AT-199 live in §12.A; GAPS line 2 (trains) and line 37 (R25–R31, part 1) are closed by this file once approved; plan M15 "spec first" points to `12-features-r25-r31-1.md` and `-2.md`.

---

## 12.0 Rules for this chapter

12.0.1 Each journey has: **Summary**, **Touches** (07 §7.1 surface keys), **Strip**, then the normative parts: triggers, steps, branches with exact copy, cards and states (08-0 §G.2), settings keys read or written (08-0 §A only), stored data, notifications, test ids (08-0 §C), and its acceptance tests (§12.A).

12.0.2 Nothing here creates a new card type. J24–J26 use only: `choice`, `table`, `plan`, `checklist`, `signin`, `secret`, `payment`, `bill`, `routine`, `routine_offer`, `connect`, `error`, `stuck`, `spend_cap` (08-0 §G.1). Proof renders from `jobs.proof` (05 §5.15).

12.0.3 Articles win. In particular: Art. 3 (a "find/check/show" ask stops at options), Art. 5 and 7 (every payment is one Payment card, exact total, charged once, Windows Hello at `money.bigPaymentPaise`), Art. 8 (passwords, OTPs, CAPTCHAs never pass through foo: the user does them on the real page), Art. 11 (proof), Art. 13 (purchase cap `money.purchaseCapPaise`), Art. 19 (interruption budget, quiet hours), Art. 20 (offers once), Art. 21 (absolute times).

12.0.4 Copy-key areas used here: `screen.ideas.*` (Ideas page), `thread.{journey}.*` (foo's own lines in the chat for this journey: `thread.ideas`, `thread.trains`, `thread.pnr_watch`, `thread.billers`), `cards.{type}.*` (only where a card slot gets journey-specific copy), `notifications.{journey}.*` (notification bodies). Each key has exactly the 08-0 §D shape `{area}.{component}.{slot}[.{state}]`.

12.0.5 Card-specific copy that 05 already fixes (Payment card title "Approve this payment", sign-in card lanes, Plan card buttons, Routine created rows) is not restated; this file gives only the journey's slot values.

12.0.6 **After-job offers** (`routine_offer.source = 'after_job'`, 08-0 §G.13): the PNR watch offer after a booking or ticket and the recharge reminder offer after a recharge are prompted (answers the job the user asked for), not counted in the interruption budget, at most one per job (X-97). Each is still a `suggestions` row, so it is never offered twice. Tapping Yes creates the routine with `created_from = 'asked'`, so its runs are prompted too. Habit offers (`source = 'habit'`) stay unprompted and keep `created_from = 'suggested'` / `'habit'` as 08-3 sets them.

---

## §12.24 J24 · Ideas gallery: ready-made routines and helpers (R25)

### 12.24.1 Summary
An **Ideas** page shows 12 ready-made routines for everyday Indian life, filtered by six chips. [ Start ] on a tile opens the right chat, asks only for what the idea is missing, and posts a filled-in `routine_offer` card. Nothing is created and nothing runs until the user taps "Start it" on that card; then foo runs it once now, shows the result line and the normal Routine created card (05 §5.13). An idea that needs an app shows "Needs Gmail" (or "Needs Google") on its tile and the Connect card comes first. Ideas are things the user asked for: their runs are prompted (they do not use the interruption budget).

**Touches.** 03: SH·Left (More options menu) · 04: MS·Foo, MS·Marker (why footer) · 05: CD·Choice, CD·Routine (`routine`, `routine_offer`), CD·Connect, CD·Bill (idea 3) · 06: SC·Routines (first-time link), new Page Ideas · 08: EN·Routines, EN·AI (run once), EN·Conn · 09: WN·Toasts (fired runs).

**Strip.**
```
[1 Open Ideas · ⋯ menu / Routines empty / "what can you do?"]-->[2 Pick a chip]-->[3 Start on a tile]
-->[4 Right chat opens · Connect card if needed]-->[5 Missing pieces · Choice cards]-->[6 routine_offer card · Start it]
-->[7 Run once now · result line]-->[8 Routine created card]
```

### 12.24.2 Entry points
| Entry | Behaviour |
|---|---|
| Left shell ⋯ More options menu | item "Ideas" (`sidebar.menu.ideas` "Ideas") directly under "Routines"; opens the Ideas Page. Test id `sidebar-menu-ideas` |
| Routines page, First time state (06-2 §8.4) | Link button under the empty block: `routines.empty.see_ideas` "See ideas"; opens the Ideas Page. Test id `routines-empty-ideas` |
| User asks what foo can do ("what can you do?", "kya kar sakte ho", "help") | foo's reply (AI-written, mirrors the user's language) ends with the fixed line `thread.ideas.link_line` "Here are some things I can keep an eye on for you: [See ideas](foo://ideas)". The link opens the Ideas Page (deep link `foo://ideas`, renderer `navigate({ view: { kind: 'screen', id: 'ideas' } })`). The engine appends the line (not the AI) when the AI's turn is tagged `intent_capabilities` by the intake classifier; it is appended at most once per chat per day |
| Deep link `foo://ideas` | opens the Page (09 jump list does not list it) |

Back / Esc returns to the previous view (08-0 §G.10 back stack).

### 12.24.3 The Ideas Page (06 §0.1 kind: Page)

```
┌─ page header 60 ──────────────────────────────────────────────────────────────┐
│ [←]  Ideas                                                                    │
├───────────────────────────────────────────────────────────────────────────────┤
│ Tap one to start. I'll ask anything I need.                 --t-body --fg-2   │
│ 16                                                                            │
│ ( All ) ( Money ) ( Travel ) ( Home ) ( Family ) ( Fun )   32px filter chips │
│ 16                                                                            │
│ ┌─────────────────────────────────┐ ┌─────────────────────────────────┐       │
│ │ [icon 24]                       │ │ [icon 24]                       │  grid │
│ │ Watch my PNR                    │ │ Parcel near me      Needs Gmail │       │
│ │ Tells you when your train       │ │ Tells you when a parcel is out  │       │
│ │ ticket's status changes.        │ │ for delivery.                   │       │
│ │ [ Start ]                       │ │ [ Start ]                       │       │
│ └─────────────────────────────────┘ └─────────────────────────────────┘       │
└───────────────────────────────────────────────────────────────────────────────┘
```

| Part | Value | Test id |
|---|---|---|
| Page | 06 §0.1 Page; content column `--column-max`; title `screen.ideas.title` "Ideas" | `screen-ideas` |
| Intro line | `screen.ideas.intro` "Tap one to start. I'll ask anything I need." `--t-body` `--fg-2`, 16px below the header | — |
| Chips | 06 §0.4 Chip (filter, 32px), single-select, in this order: `screen.ideas.chip.all` "All" (selected on open), `screen.ideas.chip.money` "Money", `screen.ideas.chip.travel` "Travel", `screen.ideas.chip.home` "Home", `screen.ideas.chip.family` "Family", `screen.ideas.chip.fun` "Fun"; gap 8px; `role="radiogroup"` | `screen-ideas-chip` + `data-row-id="{all\|money\|travel\|home\|family\|fun}"`, `data-state="selected\|rest"` |
| Grid | CSS grid, 2 columns when the content column is ≥ 600px wide, else 1; gap 12px; tiles in the §12.24.4 order, filtered by the chip | — |
| Tile | min-height 136px (local px, `/* local: 12 §12.24.3 */`), padding 16px, `--r-lg`, 1px `--line`, bg `--bg-raised`; stack: icon 24px `--accent` (Fluent Regular, name per §12.24.4), 8px, title `--t-body-strong` `--fg-1` (one line), 4px, line `--t-small` `--fg-2` (max 2 lines, ellipsis), 12px, Secondary 32px button | `screen-ideas-tile` + `data-row-id="{ideaId}"`, `data-index` |
| Needs pill | right of the title when the idea's `needs` app is not connected: 06 Pill, `--warn-soft` / `--fg-1`, `screen.ideas.needs.gmail` "Needs Gmail", `screen.ideas.needs.google` "Needs Google" or `screen.ideas.needs.irctc` "Needs IRCTC sign-in" (tile 1); hidden once connected (IRCTC: shows when `routine:ideaStatus.irctcSignedIn` is false, X-124; the engine's `irctc.isSignedIn()` reads foo's Edge profile) | `screen-ideas-needs` |
| Start | Secondary 32: `screen.ideas.button.start` "Start" | `screen-ideas-start` |
| On pill | idea 3 (`bills_3_days`) only: right of the title while the builtin `bill_watch` routine exists (X-115 (1)), 06 Pill, `--ok-soft` / `--fg-1`, `screen.ideas.pill.on` "On" (X-140); Start stays enabled | `screen-ideas-on` (X-140) |
| Narrator | tile `role="listitem"` in a `role="list"` named "Ideas"; name "{title}. {line}.{ Needs Gmail.}" Start button name "Start {title}" | — |
| Keyboard | chips: ←/→ move, Space/Enter select; grid is one Tab stop, ↑/↓/←/→ move between tiles, Enter = Start; Esc = back (06 §0.7) | — |

States (06 §0.5):
| State | Shows |
|---|---|
| Rest | as drawn |
| Loading (`ideas.json` not read in 150ms) | 4 skeleton tiles |
| Error (`resources/ideas.json` unreadable or fails its zod schema) | 05 Error card shape in the content column: `screen.ideas.error.line1` "I couldn't load the ideas." / `screen.ideas.error.line2` "Your routines are fine." button `screen.ideas.error.button` "Try again"; logged to the tech log `ideas.load_failed` |
| Empty (a chip with no tiles; cannot happen with the shipped file, kept for safety) | empty block title `screen.ideas.empty.title` "No ideas here yet" + Link "Clear filters" (06 §0.5) |
| Offline | tiles shown; every Start button disabled with tooltip "You're offline. This needs the internet." (06 §0.5) |
| AI cap reached (`SPEND_CAP` active) | Start disabled with tooltip `screen.ideas.start.cap` "You've reached this month's AI cap." |
| 25 routines exist | Start disabled with tooltip "That's 25 routines, the most I can look after. Delete one to add another." (06-2 §8.3 copy) |

### 12.24.4 The 12 ideas (`resources/ideas.json`, content)

Format owner: group E (08-0 §E.5). The entry shape is 08-0 §E.5 `ideas.json`; this table is the content and order the file MUST carry. "Owner chat" = the helper with that template id if the user has created it, else foo's 1:1 chat; never a group. "Asks" = the missing pieces asked in the owner chat before the offer card (§12.24.5 step 3). All schedules are in the user's time zone and inside `routines.activeFrom`–`routines.activeTo` (default 07:00–22:00) unless stated.

| # | id | Chip | Icon | Title (`screen.ideas.tile.{id}.title`) | Line (`screen.ideas.tile.{id}.line`) | Needs | Owner chat | Asks | Routine it makes | task.prompt (verbatim; `{slot}` from `askSlots`) |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `pnr_watch` | Travel | `VehicleSubway` | "Watch my PNR" | "Tells you when your train ticket's status changes." | IRCTC sign-in: tag `screen.ideas.needs.irctc` "Needs IRCTC sign-in" (same pill as "Needs Gmail"; no Connect card, sign-in happens in the chat per §12.25.3 step 4) | trips | PNR (10 digits) | builtin `pnr_watch` (§12.25.8) | — (builtin, no prompt) |
| 2 | `parcel_near` | Home | `BoxMultiple` | "Parcel near me" | "Tells you when a parcel is out for delivery." | gmail | home | — | `on_email`, `subjectAny: ["out for delivery","arriving today","will be delivered today"]`; tells every time with the sender and item line | "Read the new emails and tell whether any says a parcel is out for delivery or arriving today. If yes, give the sender and the item in one line." |
| 3 | `bills_3_days` | Money | `Receipt` | "3 days before bills" | "Reminds you 3 days before a bill is due, with Pay now ready." | gmail | money | — | `daily` 09:00 all days; tells only if a bill found in Gmail is due in exactly 3 days; a firing posts a Bill card (05 §5.29), never a payment. If a `bill` card already exists for the same biller and period, this idea posts no card; it instead sends the 05 §5.29 toast at 9:00 AM three days before the due date and bumps the existing card to the bottom of the chat (X-115 (4)) | "Find bills in the user's email whose due date is exactly 3 days from today. For each, give the biller, the amount and the due date." |
| 4 | `recharge_due` | Money | `Phone` | "Recharge before my plan ends" | "Reminds you 2 days before your mobile plan ends, with plans ready." | — | money | which number (Choice from memory); plan end date if foo has no recharge on record | builtin `recharge_due` (§12.26.7) | — (builtin, no prompt) |
| 5 | `price_drop` | Money | `ArrowTrendingDown` | "Price drop on a product" | "Tells you when something you want gets cheaper." | — | money | product link; "Tell you when it's below what price?" | `interval` 360 min; condition `{ metric: 'price_inr', op: '<', value }` | "Open {link} and read the current price of the product." (`metric price_inr`) |
| 6 | `flight_fare` | Travel | `Airplane` | "Flight fare below ₹X" | "Tells you when a flight fare drops below your price." | — | trips | from, to, date, price | `interval` 360 min; condition `price_inr <`; result is a comparison only, flights are not booked in v1 (owner Q1 default (a)) | "Find the cheapest fare from {from} to {to} on {date} and report it as one number in rupees." |
| 7 | `cricket_close` | Fun | `Sport` | "Close cricket finish" | "Tells you when an India match is going down to the wire." | — | foo | which team: Choice "India" (Best fit) / "Something else…" | `interval` 15 min, active hours only; condition null (Path B: the AI judges "last 5 overs and either side can still win"); tells only if true; hysteresis per match | "Check the live score of the India match. Say whether it is in the last 5 overs with either side still able to win." |
| 8 | `tax_dates` | Money | `CalendarLtr` | "ITR and advance-tax dates" | "Reminds you a week before income-tax due dates." | — | money | — | `daily` 09:00; tells only if a due date published on incometax.gov.in is exactly 7 days away | "Read the income-tax due dates published on incometax.gov.in and tell whether any falls exactly 7 days from today." |
| 9 | `birthdays_week` | Family | `Gift` | "Birthdays this week" | "Every Monday, tells you whose birthday is coming up." | google (Contacts or Calendar) | family | — | `daily` 08:00, `days: [1]`; tells only if at least one birthday falls Mon–Sun of this week | "List every birthday from the user's contacts and calendar that falls from this Monday to Sunday." |
| 10 | `school_mails` | Family | `Backpack` | "School mails summary" | "Every evening, sums up new mails from your child's school." | gmail | family | the school's email address or domain | `daily` 18:00; tells only if new mail from that sender arrived since the last run | "Summarise new emails from {school} since the last check in at most 5 lines." |
| 11 | `medicine` | Home | `Pill` | "Medicine reminder" | "Reminds you to take a medicine on time." | — | foo | medicine name; time: Choice "8:00 AM" (Best fit) / "9:00 PM" / "Both" / "Something else…" | one `daily` routine per chosen time, tells every time; title "{medicine} · {8:00 AM}"; `urgent = false`; health is a private category (R-33): the name never appears in a group or a notification body (notification reads `notifications.ideas.medicine` "Time for your medicine.") | "Remind the user to take {medicine}." (fires every time; the AI turn is skipped and the fixed message `thread.ideas.medicine_line` "Time for your {medicine}." is posted, name only in the 1:1 chat) |
| 12 | `weekly_spend` | Money | `Wallet` | "Weekly \"what did I spend\"" | "Every Sunday evening, adds up what you spent this week." | gmail | money | — | `daily` 19:00, `days: [0]`; tells every time: foo's own payments this week plus bank and UPI alert emails | "Add up what the user paid this week from foo's own payments and from bank or UPI alert emails, and give the total and the three largest items." |

Each non-builtin idea's `routine` is a `RoutineDraftTemplate` (08-5 §4.3); its `task.prompt` is the last column, verbatim (X-111). Ideas 1 and 4 are builtins (`{ builtin }`) and have no prompt.

Chip membership: Money = 3, 4, 5, 8, 12 · Travel = 1, 6 · Home = 2, 11 · Family = 9, 10 · Fun = 7.

### 12.24.5 Steps
1. **Open.** The Page opens with "All" selected and focus on the title (06 §0.8).
2. **Start.** Tap Start on a tile. The renderer calls `routine:startIdea { ideaId }`; main navigates to the owner chat (§12.24.4) and the engine posts foo's line `thread.ideas.started` "Let's set up \"{Watch my PNR}\"." The Ideas Page stays in the back stack.
3. **Needs an app.** If the idea's `needs` app is not connected, a Connect card (05 §5.11) comes first. Connected → continue at step 4. Skip or no answer in 24 h → foo line `thread.ideas.needs_skipped` "Okay. This idea needs {Gmail}, so I haven't started it." and the job ends; no routine, no `routine_offer` card.
4. **Missing pieces.** One Choice card per missing piece (05 §5.3, `purpose: 'job'`, stepper when more than one), in the order of the "Asks" column. Pieces foo can fill from memory are not asked (memory chip shows what was used). Free-text pieces (PNR, product link, price, school address, medicine name) use the Choice card's "Something else…" row or a plain question bubble answered in the composer; validation per idea (PNR = exactly 10 digits, else `thread.ideas.pnr_invalid` "A PNR has 10 digits. Check your ticket and send it again."; link = an http(s) URL; price = `parseInr` non-null).
5. **Offer.** foo posts a `routine_offer` card with `payload.source = 'idea'`, state `offered`:
   ```
   ┌────────────────────────────────────────────────────────────────┐
   │ [ArrowRepeatAll 20] Watch my PNR                               │
   │ Checks       Status of PNR 2134567890                          │
   │ How often    Every 2 hours, then every 30 min on the last day  │
   │ Tells you    only when it changes                              │
   │ Where        Trips chat + notification                         │
   │ Uses about   ₹6 of your AI a month                             │
   │ [ Start it ]  [ Not now ]                                      │
   └────────────────────────────────────────────────────────────────┘
   ```
   Rows and their labels are the 05 §5.13 rows (same copy keys); title = the idea title; buttons `cards.routine_offer.button.start_it` "Start it" (Primary) and `cards.routine_offer.button.not_now` "Not now" (Secondary). Test ids `card-routine-offer`, `card-routine-offer-start-it`, `card-routine-offer-not-now`.
6. **Start it** → card state `accepted`, summary `cards.routine_offer.summary.accepted` "Started · {9:04 AM}". The engine calls `routines.create` with `created_from = 'idea'` (DB-04), runs it once now (08-3 §13.5 first run: the result is always shown, e.g. "Right now PNR 2134567890 is Waitlist 12. Here's what the routine will do:") and posts the Routine created card (05 §5.13, type `routine`, state `shown`).
7. **Not now** → state `dismissed`, summary `cards.routine_offer.summary.dismissed_idea` "Not started. It's still in Ideas if you want it later." No `suggestions` row is written: an idea the user opened is not an offer, so Art. 20 does not block starting it again from the gallery.
8. No answer on the offer card in 24 h → state `dismissed`, same summary.

### 12.24.6 Rules
- **Prompted.** Runs of routines with `created_from = 'idea'` are "things the user asked for" (Art. 19): they do not count toward `notifications.unpromptedPerDay`, and quiet hours apply as for `asked` routines (08-3 §13.5). Cross-ref C.
- **Duplicates.** Starting an idea whose routine already exists with the same `task_spec` + `condition` gets the 05 §5.13 Duplicate line instead of an offer card ("You already have this: '{title}'. Change it instead?"). Two PNR watches with different PNRs, or two medicine times, are not duplicates.
- **Limits.** 25 routines, 15-minute minimum (08-3 §13.1) apply; at the limit Start is disabled (§12.24.3).
- **Never acts.** Every idea routine is read-only (`intent='read_only'` forced, 08-3 §13.1); ideas 3 and 4 end in a Bill card or a Choice card of plans, never a payment.
- **Settings read.** `routines.activeFrom`, `routines.activeTo`, `notifications.kinds.routine`, `notifications.quiet`, `money.aiCapPaise` (cap state). Nothing written.
- **Stored.** `routines` row + `routines\{id}.json` mirror (08-3 §13); `cards` rows; activity: none (routines are not world changes, 08-0 §G.4; the tech log records `routine_created`).

### 12.24.7 Branches
| Case | What happens | Exact copy |
|---|---|---|
| Start tapped while offline | Start is disabled (§12.24.3) | tooltip "You're offline. This needs the internet." |
| AI goes down during step 4–6 | the Choice/offer cards stay; Start it stays enabled; on tap the job goes WAITING `ai_down` and the run once happens when the AI is back (05 §5.20 card) | 08-3 §21.2 `AI_SERVICE_DOWN` copy |
| First run fails | Routine created card still posted; its last-run row reads "Didn't finish · See why" (05 §5.13.2) | `thread.ideas.first_run_failed` "I couldn't check right now, but the routine is saved. Next run {Fri 16 Oct, 11:00 AM}." (P-17 (d)) |
| User types instead of tapping Start it ("yes start it") | Choice-style typed answers do **not** apply: `routine_offer` is answered only by its buttons [foo decision: one tap, mirrors §5.14] | `thread.ideas.tap_to_start` "Tap Start it on the card and I'll set it up." |
| Helper for the owner chat is paused | the offer is posted in foo's chat instead, with "Where" = foo's chat | — |

### 12.24.8 Notifications
- Offer card: no notification (the user is in the app; they just tapped Start).
- Fired runs: per 08-3 §13.5 and §15 with `notifications.kinds.routine`; body `notifications.ideas.fired` "{Trips} · {Watch my PNR}: {first line of the message}" except idea 11 (fixed body above).

---

## §12.25 J25 · Trains end to end: IRCTC search, booking, Tatkal-ready, PNR watch (R26)

### 12.25.1 Summary
"find trains to Jaipur on Friday" shows a Choice card of up to three trains (time, class, fare, seats or waitlist), Best fit first; it books nothing. "book…" or a tap on a train moves to booking: IRCTC always runs in foo's own Edge window (08-2 §8.3.12 (d), X-46). foo signs in with a saved login or the user's own sign-in (J13); IRCTC's puzzle and every OTP are always the user's (Take over / code lane). foo fills passengers from memory, stops before Pay, and shows one Payment card with the exact fare (UPI by default). After the tap and the second look it pays once; proof is the PNR on the confirmation page. foo adds the trip to Calendar (covered by the book approval), sets a departure reminder, and, when the ticket is not confirmed, offers once to watch the PNR. **Tatkal:** foo shows a Plan card with the opening time; on Go it waits, signs in with the user five minutes before, fills everything the moment Tatkal opens and waits for the Payment tap. It never pays by itself.

**Touches.** 03: SH·Left (Needs you), SH·Right (Doing now, Spent) · 04: MS·Me (badge), MS·Foo · 05: CD·Choice, CD·Plan, CD·Checklist, CD·SignIn, CD·Secret (code box, login), CD·Payment, CD·Proof, CD·Routine (`routine_offer`, `routine`), CD·Error · 06: SC·Live (sign-in banner, Watch live), SC·Toasts, SC·Routines · 08: EN·Jobs, EN·Approvals, EN·Browser, EN·Secrets, EN·Conn (Calendar), EN·Routines, EN·Log · 09: WN·Hello, WN·Toasts, WN·Taskbar, WN·Startup (sleep).

**Strip.**
```
[1 Ask · 👀 → 🛠]-->[2 Missing pieces · Choice]-->[3 Trains · Choice (Best fit)]-->[4 IRCTC sign-in · puzzle is yours]
-->[5 Fill passengers · stop before Pay]-->[6 Payment card · exact fare]-->[7 Tap (+ Hello ≥ ₹10,000) · second look · pay once]
-->[8 "Booked." + PNR proof + calendar]-->[9 Departure reminder]-->[10 Not confirmed? Offer: watch PNR]
Tatkal: [Plan card · opens Sat 10:00 AM]-->[Go · waiting]-->[9:50 notification]-->[9:55 sign in with you]-->[10:00:00 fill]-->[Payment card]-->…
```

### 12.25.2 Triggers and intent
| Ask | Intent (Art. 3) | Goes to |
|---|---|---|
| "find / check / show trains …", "is there a train …" | `read_only` | step 3 Choice card with the "look" question; a tap on a train is a card tap and moves the job to `do` with `do_verbs ['book','pay']` (Art. 3 "or a tap on a card") |
| "book a train / ticket …", "book tatkal …" | `do`, `do_verbs ['book','pay','add_calendar']` | step 3 with the "book" question; Tatkal per §12.25.6 |
| Ideas tile "Watch my PNR", "watch PNR 2134567890", "tell me when my ticket confirms" | routine | §12.25.8 |

Permissions (08-0 §G.3): `permissions.actions.book` and `permissions.actions.pay` must both be `ask`; if either is `never`, foo refuses before opening IRCTC with the G.3 line "I'm not allowed to {book}. You can change that in Settings → Permissions. [ Open Permissions ]". `permissions.apps.browser = 'never'` refuses the same way with row "use the browser". Owner chat: the Trips helper if it exists (handoff marker 05 §5.18), else foo's chat.

### 12.25.3 Steps (normal quota)
1. **Ask.** "book a train from Delhi to Jaipur on Fri 23 Oct". Badge 👀 → 🛠. Checklist (05 §5.2) with step phrases (B owns the phrase keys): "Finding trains on IRCTC", "Signing in to IRCTC", "Filling in passengers", "Getting the fare", "Booking" (the last two appear only in `do` jobs).
2. **Missing pieces** (one Choice card, stepper ≤ 3 questions, 05 §5.3). Asked only when memory cannot fill them:
   - Station, when a city has several: `thread.trains.q_station` "Which station in {Delhi}?" options = up to 3 stations served on that route by the most trains, Best fit = the one in memory (`place` fact) else the one with most trains on the route; label "{New Delhi} ({NDLS})".
   - Who travels (multi-select): `thread.trains.q_who` "Who's travelling?" options = the user and up to 3 `person` facts with a known age, no Best fit (multi-select, X-133; its reminder toast is [ Open ] per 05 §5.8); "Something else…" lets the user type a name and age. Each traveller needs name, age and gender; a missing one is asked in a plain question bubble `thread.trains.q_details` "What are {Neha}'s age and gender, as on her ID?" and saved as a `person` fact (`provenance: 'said'`).
   - Class: `thread.trains.q_class` "Which class?" options from the trains' classes, Best fit = the `preference` fact for train class, else "3A" for trips over 6 hours and "CC" for day trains under 6 hours when offered, else the cheapest reserved class; labels use IRCTC's codes with words: "3A · AC 3 tier", "2A · AC 2 tier", "1A · AC first class", "SL · Sleeper", "CC · AC chair car", "EC · Executive chair car", "2S · Second sitting", "3E · AC 3 economy".
3. **Trains** (Choice card, `purpose: 'job'`). Question: book jobs `thread.trains.q_which_train` "Which train should I book?"; read jobs `thread.trains.q_which_train_look` "Here's what's running. Want me to book one?". Up to 3 options + "Something else…":
   - Label (≤ 40 chars): `thread.trains.option_label` "{Ajmer Shatabdi} · {6:10 AM} → {10:40 AM}" (train name shortened to fit; number in detail).
   - Detail (≤ 80 chars): `thread.trains.option_detail` "{12015} · {CC} · ₹{1,045} · {64 seats left} · {4h 30m}". Availability words: available n → `thread.trains.avail_seats` "{64} seats left"; RAC n → `thread.trains.avail_rac` "RAC {5} (shared berth)"; waitlist n → `thread.trains.avail_wl` "Waitlist {12}". "REGRET" / "NOT AVAILABLE" / departed trains are never offered.
   - Order and Best fit (deterministic, engine): (1) has seats, (2) RAC, (3) waitlist (lower first); within a group, closest to the user's time `preference` fact, else earliest departure after 6:00 AM; option 1 is Best fit.
   - Fare shown = IRCTC's fare for one traveller in that class; the Payment card shows the full total.
   - Data source: IRCTC's own search in foo's Edge (`irctc.co.in`), signed out when IRCTC allows it; if IRCTC asks to sign in to show availability, step 4 runs first. Never a cloud browser (X-46); a cloud search key may be used only to read public timetable pages, never availability or fares.
4. **Sign in** (J13 lanes, 08-2 §8.4). Saved login (`foo/login/irctc.co.in`) → foo fills username and password; IRCTC's puzzle always follows → foo's line `cards.signin.known_puzzle_site` (05 §5.10.2 "Known puzzle site") "IRCTC always asks for a puzzle, so I'll need you for a few seconds." then a `signin` card `mode: 'take_over'` (CAPTCHA lane). No saved login → `signin` card `mode: 'sign_in_here'`. After the first success foo offers once to save the login (05 §5.10.2; suggestions key `save_login:irctc.co.in`). foo never reads, solves or forwards the puzzle (08-2 §8.4).
5. **Fill and stop before Pay.** foo opens the chosen train and class, fills each traveller (name, age, gender, berth preference from memory: `preference` fact, else "No preference"), keeps IRCTC's mobile number and email as they are on the account, answers IRCTC's options with fixed defaults: travel insurance **No** unless the user said yes in this job; "Book only if confirmed berths are allotted" **off** for normal quota (the user saw the availability on the card); "Consider for auto upgradation" **on** (it never costs more). The booking page's own puzzle → Take over lane again. foo stops on IRCTC's payment page with the total read by `parseInr` from the total element (08-2 §10.3).
6. **Payment card** (05 §5.6; `payments.prepareCard`): duplicate guard, purchase cap and bigPayment per 08-2 §10.2. Receipt lines, in this order (`thread.trains.*` labels; values from IRCTC's page):
   | Line | Label key and text | Value |
   |---|---|---|
   | 1 | `thread.trains.pay_line_ticket` "{Ajmer Shatabdi} {12015} · {CC} · {Fri 23 Oct, 6:10 AM} · {2} travellers" | ticket fare total |
   | 2 | `thread.trains.pay_line_fee` "IRCTC convenience fee" | as shown (incl. GST) |
   | 3 | `thread.trains.pay_line_insurance` "Travel insurance" | "₹0 (not taken)" or the amount when the user asked for it |
   | 4 (only when not all seats confirmed) | `thread.trains.pay_line_status` "Status now: {Waitlist 12, 13}" shown in `--warn` | "—" |
   | cancel terms row | `thread.trains.pay_line_cancel` "Cancel 72 h or more before: IRCTC keeps about ₹{180} a traveller. Later, more is kept. (An estimate; IRCTC decides.)" (slabs: ≥ 72 h flat charge per class; 72–24 h 25 % of fare; 24–8 h 50 %; under 8 h no refund; each slab never below the flat charge; + GST on AC classes; values from `rail-rules.json`); Tatkal: `thread.trains.pay_line_cancel_tatkal` "Tatkal: no refund if you cancel a confirmed ticket." in `--bad` | ₹0 |
   Personal-data line (05 §5.6.1): `thread.trains.pay_people` "Booked for {Vikas Sharma (34), Neha Sharma (32)} · IRCTC account {vik•••}". Calendar line under it: `cards.approval.line.adds_calendar` "Adds it to your calendar after booking." (08-0 §G.3; shown when `connections.google.calendarOn` is true and `permissions.actions.calendar` is not `never`). Pay with: `money.defaultMethod`, else UPI (`money.upiId`), else the Secret box card/UPI step first (05 §5.6 Trigger). Countdown 10:00.
7. **Approve.** 05 §5.6 states. Total ≥ `money.bigPaymentPaise` (default ₹10,000) → Windows Hello (09 §9.19). Second look (08-2 §9.6) compares train number, date, class, traveller names and total with the user's words and the card. Then 08-2 §10.4 exactly once: UPI → "Approve ₹{2,145} in your UPI app on your phone. Waiting… {4:58}"; card → bank 3-D Secure lane (05 §5.10.2 "Bank check").
8. **Result.** Success page with a 10-digit PNR → job DONE, proof `{ kind: 'confirmation', ref: '{PNR}' }` plus the masked screenshot. foo's result bubble:
   - all confirmed: `thread.trains.booked` "Booked. {Ajmer Shatabdi 12015}, {Fri 23 Oct, 6:10 AM} from {New Delhi}, {2} travellers, {CC}, coach {C4} seats {32, 33}. ₹{2,145} paid. Added to your calendar."
   - not all confirmed: `thread.trains.booked_wl` "Booked on the waitlist. {Ajmer Shatabdi 12015}, {Fri 23 Oct, 6:10 AM}, {2} travellers, {Waitlist 12, 13}. ₹{2,145} paid. If it's still waitlisted when the chart is made, IRCTC cancels it and refunds you."
   - Proof chip `cards.proof_chip.chip.pnr` "Proof: PNR {2134567890}" (chip variant `pnr`; the proof itself is `ProofKind` `confirmation`, 08-0 §B.2). Receipt footer per 05 §5.15. "Added to your calendar." appears only when the event was created.
   - Activity (08-0 §G.4): one `paid`/`paid` row and one `booked`/`booked` row, both with the same `approval_id`, `approved_how` = `card_once` or `hello` / `typed_amount`, `outcome` = `done`.
9. **Calendar.** Event "{Ajmer Shatabdi 12015} · {NDLS} → {JP}" from departure to arrival in the user's time zone, description "PNR {2134567890} · coach {C4} seats {32, 33}" (no fare, no names beyond the user). Covered by the book approval; no separate card.
10. **Departure reminder.** A `once` routine (`created_from 'asked'`: part of the booking the user asked for, prompted; owner = the job's chat, `deliver_toast` true, title "{Ajmer Shatabdi} reminder") at departure − 3 h; if that time is inside quiet hours (`notifications.quiet`), at quiet-hours start − 60 min on the day before (default 9:00 PM). Message `thread.trains.reminder` "Your {Ajmer Shatabdi} leaves {New Delhi} at {6:10 AM} on {Fri 23 Oct}. PNR {2134567890}, coach {C4} seats {32, 33}." Deleted automatically if the booking is cancelled through foo.
11. **PNR watch offer.** Only when at least one traveller is not confirmed: directly under the result, a `routine_offer` card `source: 'after_job'`, body `thread.trains.offer_pnr_watch` "Want me to watch PNR {2134567890} and tell you when it changes?" buttons `cards.routine_offer.button.yes_watch` "Yes, watch it" / `cards.routine_offer.button.no_thanks` "No thanks". Suggestions key `routine_offer:pnr_watch:{pnr}` (08-0 §G.13): "No thanks" or 7 days without an answer → `dismissed`, never offered again for that PNR. It is part of the job's answer (posted in the same turn, in the chat the user is in) and follows §12.0.6 (prompted, not counted in the interruption budget, at most one per job, X-97); it sends no notification. Yes → §12.25.8 with `created_from 'asked'` (the user tapped Yes on an `after_job` offer: prompted, X-97).

### 12.25.4 Branches
| Case | What happens | Exact copy |
|---|---|---|
| No train on that date | read-only answer, no card | `thread.trains.none` "No trains run from {Delhi} to {Jaipur} on {Fri 23 Oct}. Want me to look at {Thu 22 Oct} or {Sat 24 Oct}?" |
| Only waitlist left on all trains, date > 1 day away | Choice card as normal; a line above it | `thread.trains.only_wl` "Every train is on the waitlist for {Fri 23 Oct}. Here are the shortest waitlists:" |
| Only waitlist, journey tomorrow, Tatkal not open yet | Choice card before the trains card | `thread.trains.q_tatkal` "Seats are on the waitlist. Tatkal for {Fri 23 Oct} opens {Thu 22 Oct, 10:00 AM}. Want me to try Tatkal then?" options "Try Tatkal at {10:00 AM}" (Best fit) / "Book the waitlist now" / "Show me other trains" → §12.25.6 |
| Date not open yet (more than 60 days ahead) | Plan card per §12.25.6; opening = journey date − 60 days at 08:00 IST; a 'booking opens' reminder (prompted, `urgent`) fires at 08:00 IST that day | `thread.trains.not_open` "Bookings for {Fri 15 Jan} open on {Mon 16 Nov, 8:00 AM}. I can be ready then; you tap Pay." Second line, shown in the same Plan card: `thread.trains.aadhaar_verify_first` "On the first day only Aadhaar-verified IRCTC accounts can book. If yours isn't verified yet, do that on IRCTC first." |
| The chosen train fills or its fare changes before the Payment card | the Choice card becomes Superseded (05 §5.3.2) | "That {Ajmer Shatabdi} just filled up. Here's what's left:" |
| Fare or status changes after Approve, before submit | Payment card SUPERSEDED (05 §5.6.3) + new card; a status change from seats to waitlist counts as a change | 05 copy; status: `thread.trains.status_changed` "The seats went while I was booking. It's now {Waitlist 3}, so I stopped. Nothing was paid." |
| IRCTC signs foo out mid-job (session timeout) | sign-in lane again; job continues where it stopped; a Payment card already shown stays PENDING only if IRCTC kept the booking page, else WITHDRAWN and a new one follows | `thread.trains.signed_out` "IRCTC signed me out. Sign in again and I'll pick up where I was." |
| IRCTC is down or in its nightly maintenance (11:45 PM–12:20 AM `[verify before M15]`) | job WAITING; retried every 5 min for 30 min, then FAILED with `SITE_BLOCKED` card | `thread.trains.irctc_down` "IRCTC isn't taking bookings right now. I'll try again at {12:25 AM}." |
| Hand-back: the payment page sends to net banking | net banking is never used: foo picks UPI or card on IRCTC's page; if neither is offered → hand-back card (08-2 §8.3.10) | "This is your bank's site. I'll open it for you, and you do this part." [ Open {site} ] |
| A traveller is under 5 | not a ticket holder on IRCTC; foo adds them as a child "no seat" only when the user says so | `thread.trains.child` "{Aarav} is under 5, so he travels free without his own seat. Want a seat for him anyway?" options "No seat (free)" (Best fit) / "Book a seat" |
| Senior concession | not offered by IRCTC since 2020 `[verify before M15]`; never mentioned | — |
| User says "cancel my train" | separate job, verb `delete` (X-55 cancel = delete): Approval card with the refund read from IRCTC's own cancel page when shown, else `railRefundEstimate` (08-2 §8.3.11); confirmed Tatkal → refund line `thread.trains.pay_line_cancel_tatkal` "Tatkal: no refund if you cancel a confirmed ticket." and the Approval still asks; activity `booked`/`cancelled_booking` | Approval title per 05 §5.5.2 delete kind; refund line `thread.trains.cancel_refund` "IRCTC should refund about ₹{1,725} to how you paid. That's an estimate; IRCTC decides the final amount." |

### 12.25.5 What foo never does on IRCTC
Solves, reads or forwards a puzzle; reads an OTP (unless `privacy.readCodesFromGmail` includes `irctc.co.in`, J13); uses a cloud browser; uses net banking; books Premium Tatkal (dynamic fares) unless the user says "premium tatkal" in this job; changes the IRCTC account's saved passenger list, mobile or email; pays when a Payment card is not APPROVED.

### 12.25.6 Tatkal
**Rule (values in `resources/rail-rules.json`, 08-0 §E.5/§G.19; `src/engine/tools/browser/irctc.ts`, group B, reads them and holds no rail constant):** Tatkal for journey date D opens on D − 1 (counted from the train's origin station) at **10:00 IST** for AC classes (1A, 2A, 3A, 3E, CC, EC) and **11:00 IST** for non-AC (SL, 2S). Tatkal needs an **Aadhaar-verified IRCTC account**, and IRCTC sends an **Aadhaar OTP** at booking: the user types it into IRCTC's page (Art. 8); foo never reads, forwards or works around it. General bookings open 60 days ahead (journey day excluded) at 08:00 IST; on the opening day only Aadhaar-verified accounts can book. Verified 2026-10-16 (X-108, 08-0 §G.19); items 4–5 re-checked on irctc.co.in before M15 (GAPS).

Steps:
1. **Ask or accept** ("book tatkal …", or "Try Tatkal at 10:00 AM" in §12.25.4). foo asks the missing pieces (§12.25.3 step 2) and one extra Choice question: `thread.trains.q_tatkal_wl` "If only waitlist is left when it opens, should I still book?" options "No, only confirmed seats" (Best fit) / "Yes, waitlist is fine". The answer sets IRCTC's "Book only if confirmed berths are allotted" (on for Best fit).
2. **Plan card** (05 §5.12; `plan` state `pending`): title `thread.trains.plan_title` "My plan · Tatkal {Ajmer Shatabdi}, {Fri 23 Oct}"; steps, in order:
   1. `thread.trains.plan_step_signin` "At {9:55 AM} {Thu 22 Oct}: sign in to IRCTC with you (it will want a puzzle)"
   2. `thread.trains.plan_step_fill` "At {10:00 AM}: pick {CC} on {12015} and fill in {2} travellers"
   3. `thread.trains.plan_step_pay` "Show you the exact fare before paying"
   Estimate line per 05 §5.12.2. Line under the steps `thread.trains.plan_note` "Tatkal fares cost more than normal ones. Keep your PC on and awake at {9:55 AM}."
3. **Go** → `plan` state `go`; the job enters WAITING with `waiting_reason = 'opens_at'` and `wake_at = opening − 5 min` (no stuck timer while waiting: 08-2 §5.6 counts only WORKING). foo posts `thread.trains.tatkal_ready` "Tatkal opens {Thu 22 Oct, 10:00 AM}. I'll be signed in and ready by {9:58 AM}, fill in your details the moment it opens, and you tap Pay." (UJ-07 copy, adjusted so it does not promise a filled form before IRCTC allows one). Badge on the user's bubble: 🛠 (the job is live); right shell Doing now shows "Waiting for Tatkal · opens {10:00 AM}".
4. **Clock check at Go.** If `CLOCK_WRONG` is active (08-3 §21.2) the Go button stays disabled and the line `thread.trains.clock_wrong` "Your PC's clock looks wrong, and Tatkal is timed to the second. Fix the clock first." with the `CLOCK_WRONG` card's button "Fix the clock" shows instead.
5. **T − 10 min (9:50 AM)**: notification (08-3 §15, kind `reminder`, `urgent`: it toasts in quiet hours too, 08-3 §15.2; always T − 10 min before the opening time, 10:00 AC / 11:00 non-AC), body `notifications.trains.tatkal_soon` "{agentName} · Tatkal for {Ajmer Shatabdi} opens at {10:00 AM}. Be at your PC from {9:55 AM}: IRCTC will want a puzzle, then you tap Pay." button [ Open ]. foo also asks Windows to keep the PC awake from T − 10 min to T + 20 min (Electron `powerSaveBlocker 'prevent-app-suspension'`); it cannot wake a sleeping PC.
6. **T − 5 min (9:55 AM)**: job → WORKING; sign in (§12.25.3 step 4; the puzzle lane is the user's). foo opens the booking form with from, to, date, quota "TATKAL" and class filled and waits on it.
7. **T (10:00:00 by the PC clock)**: foo searches, opens the train and class, fills travellers (from memory, as step 5 of §12.25.3), answers IRCTC's options, and the user does the booking puzzle and the Aadhaar OTP (code lane, 08-2 §8.4) when IRCTC asks. foo stops on the payment page.
8. **Payment card** as §12.25.3 step 6 with the Tatkal cancel row. foo **never** pays without the APPROVED tap; the card's 10-minute expiry applies unchanged.
9. Result, calendar, reminder and PNR offer as §12.25.3 steps 8–11.

Tatkal branches:
| Case | What happens | Exact copy |
|---|---|---|
| Not signed in by T + 15 min (user not at the PC) | job CANCELLED, `stop_reason='signin_timeout'`; nothing booked | `thread.trains.tatkal_missed` "Tatkal seats usually go in minutes, and I couldn't sign in without you, so I stopped. Nothing was booked or paid." [ Show me other trains ] |
| PC asleep or foo closed at T − 5 min | job WAITING `asleep` / `app_quit`; on wake before T + 15 min it continues at step 6; after that, as the row above | same copy as above |
| Tatkal sold out at opening (or only waitlist with "only confirmed seats") | job DONE with no booking (result is information, Art. 11 "Done" = no proof needed for "nothing booked"), no Payment card | `thread.trains.tatkal_sold_out` "Tatkal seats on {Ajmer Shatabdi} went by {10:01 AM}. Nothing was booked or paid." [ Show me other trains ] |
| IRCTC refuses Tatkal because the account is not Aadhaar-verified | foo posts `thread.trains.aadhaar_verify_first` and the job ends FAILED; no workaround (foo never tries another account, quota or path) | `thread.trains.aadhaar_verify_first` "On the first day only Aadhaar-verified IRCTC accounts can book. If yours isn't verified yet, do that on IRCTC first." (§12.25.4) |
| User taps Stop, or "stop", while waiting | CANCELLED ⛔ `stop_reason='user_word'`/`'user_button'`; Plan card summary WITHDRAWN | 05 copy |
| Payment card expires (10 min) | EXPIRED per 05; no second card unless the user taps "Ask me again" | 05 copy |

### 12.25.7 Stored
- `jobs`, `steps`, `cards`, `approvals`, `payments` per 08-1; `jobs.proof` = PNR + screenshot ref.
- Memory: travellers' name, age, gender as `person` facts; berth, class and time preferences as `preference` facts (only what the user said or confirmed). Never stored: IRCTC password (vault only, `foo/login/irctc.co.in`), puzzle, OTP, Aadhaar number (foo never reads or types it).
- Trips helper notes (08-3 §12.2 line format): "{Fri 23 Oct} · {12015} · PNR {2134567890} · {CC} · {C4 32, 33}".
- Site note `sites\irctc.co.in.md`: "always CAPTCHA", "sign-in times out".
- Settings read: `permissions.actions.book`, `permissions.actions.pay`, `permissions.actions.calendar`, `permissions.apps.browser`, `money.purchaseCapPaise`, `money.bigPaymentPaise`, `money.upiId`, `money.defaultMethod`, `notifications.quiet`, `connections.google.calendarOn`, `privacy.readCodesFromGmail`, `privacy.screenshotDays`. Written: none.

### 12.25.8 PNR watch (routine builtin `pnr_watch`)
Created from the post-booking `after_job` offer (`created_from 'asked'`: the user tapped Yes, prompted, §12.0.6, X-97), the Ideas tile (`'idea'`, prompted) or by asking ("watch PNR 2134567890", `'asked'`). Never `'suggested'` or `'habit'` (those are for habit offers). `routines.builtin = 'pnr_watch'` (DB-04); title "PNR {2134567890}" (or "{Ajmer Shatabdi} · PNR {2134567890}" when foo booked it). Read-only (08-3 §13.1).

| Field | Value |
|---|---|
| What (`what_text`) | "Status of PNR {2134567890}" |
| Schedule | `interval` 120 min inside active hours until departure − 12 h, then `interval` 30 min (ignoring active hours, still obeying quiet hours for notifications) until the chart is prepared or departure; the engine switches the interval itself (builtin) |
| Condition | `{ metric: 'status', op: 'changed' }` (P-17); the observed value is the normalised status string per traveller, e.g. `"P1:CNF/C4/32;P2:WL/5"`; "changed" compares with the last run's `observed` value; the first run never fires (it is shown as the first-run result) |
| Source | IRCTC booked-ticket history (My Transactions → Booked Ticket History) in foo's Edge profile while the user is signed in (08-2 §8.3.11). Never the public PNR page (it has a CAPTCHA; foo never solves one) and no third-party PNR API in v1. Signed out → the run returns `signed_out`, makes no other request, and foo posts at most once per local day `thread.pnr_watch.signed_out` "IRCTC signed me out, so I can't check your PNR. Sign in to keep watching." [ `thread.pnr_watch.sign_in` "Sign in" ]; no polling until the user signs in. |
| Where | owner chat (Trips or foo) + notification (`deliver_toast` true) |
| Uses about | estimate per 08-3 §13.7 (Path A fast path once learned) |

Messages (each a normal foo bubble with the why footer "Why am I getting this? Your {PNR 2134567890} routine."):
| Change | Copy |
|---|---|
| one traveller, now confirmed | `thread.pnr_watch.cnf` "Your PNR {1234567890} is now CNF, coach {S4} seat {32}." (UJ-07) |
| one traveller, waitlist moved | `thread.pnr_watch.wl_moved` "Your PNR {1234567890} moved up from waitlist {12} to {5}." |
| one traveller, now RAC | `thread.pnr_watch.rac` "Your PNR {1234567890} is now RAC {3}: you have a seat and share the berth." |
| several travellers | `thread.pnr_watch.many` "Your PNR {1234567890} changed: {traveller 1: CNF, coach S4 seat 32; traveller 2: waitlist 2}." |
| chart prepared, all confirmed | `thread.pnr_watch.final_cnf` "The chart is out: PNR {1234567890} is confirmed, coach {S4} seat {32}. That's the final status, so I've stopped watching it." |
| chart prepared, still waitlisted | `thread.pnr_watch.final_wl` "The chart is out and PNR {1234567890} is still on the waitlist, so IRCTC has cancelled it and will refund it to how you paid. I've stopped watching it. Tell me if you want me to find another train." |
| PNR not found (flushed or mistyped) | `thread.pnr_watch.not_found` "I can't find PNR {1234567890} any more. I've stopped watching it." |
| departure passed without a chart message | `thread.pnr_watch.ended` "Your train has left, so I've stopped watching PNR {1234567890}." (silent if the last message was a final one) |

Ending: after a "final" or "not found" or "ended" message the routine moves to `state='deleted'` (soft delete, 08-0 §G.5) and drops off the Routines page. Notification body `notifications.pnr_watch.changed` "{Trips} · PNR {1234567890}: {status line}".

### 12.25.9 Notifications (J20 rules)
Payment card, sign-in card and Plan card notifications per 05 (§5.6.5, §5.10.4, §5.12.3); Tatkal T − 10 min per §12.25.6 step 5; PNR changes per §12.25.8; departure reminder `notifications.trains.reminder` "{agentName} · {Ajmer Shatabdi} leaves at {6:10 AM}. Coach {C4} seats {32, 33}." Taskbar: Needs you (yellow) while a puzzle/OTP/payment waits (09 §9.6).

### 12.25.10 Test ids
Existing families only: `card-choice` (+ `data-card-id`, `data-state`), `card-plan`, `card-plan-go`, `card-signin`, `card-payment`, `card-payment-approve`, `card-payment-not-now`, `card-checklist`, `card-routine`, `card-routine-offer`, `card-routine-offer-yes-watch`, `card-routine-offer-no-thanks`, `bubble-foo`, `bubble-badge` (`data-state`). The proof chip uses 05's id. New ids for this journey: `card-routine-offer-yes-watch`, `card-routine-offer-no-thanks`.

---

## §12.26 J26 · Recharges and everyday billers (R27)

### 12.26.1 Summary
"Recharge my Jio" finds the number in memory, reads the current plans on the operator's own site in foo's Edge, and shows a Choice card of up to three plans, the one used last time first. Tapping a plan leads to one Payment card with the exact amount (UPI by default), paid once, with the operator's transaction id as proof. After the first recharge of a number foo offers once to remind 2 days before the plan ends, with plans ready. DTH and FASTag work the same way with an amount choice; gas-cylinder booking goes straight to a Payment card at the site's fixed price; broadband and electricity read the amount due and use the Bill card and the J11 payment path. Payments follow every Art. 7 rule. foo pays only on the biller's own site from `resources/billers.json` or a site the user confirmed.

**Touches.** 03: SH·Right (Spent) · 04: MS·Me, MS·Foo, MS·Marker (handoff to Money) · 05: CD·Choice, CD·Bill, CD·Payment, CD·Proof, CD·SignIn, CD·Routine (`routine_offer`, `routine`), CD·Error, table card (05 §5.22) · 06: SC·Toasts, SC·Settings (Money) · 08: EN·Jobs, EN·Approvals, EN·Browser, EN·Routines, EN·Log · 09: WN·Hello, WN·Toasts, WN·Taskbar.

**Strip.**
```
[1 "Recharge my Jio" · 👀 → 🛠]-->[2 Which number? (only if several)]-->[3 Plans · Choice (last plan first)]
-->[4 Tap a plan]-->[5 Payment card · exact amount · UPI]-->[6 Approve on phone · pay once]-->[7 "Recharged." + proof]
-->[8 Offer once: remind before it ends]
Bills: [1 "Pay my BESCOM bill"]-->[2 Read amount due on bescom]-->[3 Bill card]-->[J11 steps 3–6]
```

### 12.26.2 Biller kinds
| Kind (`billers.json` `kind`) | Examples (seed) | Identifier (`idLabel`) | Path |
|---|---|---|---|
| `mobile_prepaid` | Jio, Airtel, Vi, BSNL | "Mobile number" | plans Choice → Payment card (§12.26.3) |
| `dth` | Tata Play, Airtel DTH, Dish TV, Sun Direct | "Subscriber ID" | amount Choice → Payment card |
| `fastag` | issuer banks' FASTag recharge pages not on the hand-back list | "Vehicle number" | amount Choice → Payment card; issuer page on `handback-sites.json` → hand-back card |
| `gas_cylinder` | Indane, HP Gas, Bharatgas | "LPG ID" | straight to Payment card (fixed refill price on the site) |
| `broadband` | Airtel Xstream Fiber, JioFiber, ACT Fibernet, BSNL | "Account number" | amount due → Bill card (05 §5.29) → J11 |
| `electricity` | BESCOM, Tata Power-DDL, BSES Rajdhani, BSES Yamuna, MSEDCL, Adani Electricity Mumbai, TNPDCL | "Consumer number" | amount due → Bill card → J11 |

Postpaid mobile bills are J11 (bill emails). The exact seed list and domains live in `resources/billers.json` (B verifies each domain against the operator's own site before M15).

### 12.26.3 Steps (mobile prepaid)
1. **Ask.** "Recharge my Jio" / "Jio recharge kar do". "Recharge" is not an Art. 3 do-word: the job starts `read_only`; the tap on a plan (step 4) is the card tap that makes it `do` with `do_verbs ['pay']`. "check / show Jio plans" → step 3b. The job is handed to Money if the Money helper exists (handoff marker `thread.billers.handoff` "{agentName} asked Money to recharge your Jio"), else runs in foo's chat.
2. **Which number.** Numbers come from memory (`person` facts with a phone, the user's own number first) whose operator matches; the operator of a number is what the user said or what a past recharge recorded (never guessed from the number). One match → used, memory chip "Used: your Jio number ••210". Several → Choice `thread.billers.q_number` "Which {Jio} number?" options "{Your number} ••{210}", "{Mom} ••{455}" (last 3 digits only), Best fit = the user's own. None → plain question `thread.billers.q_number_new` "Which {Jio} number should I recharge?" (answered in the composer; saved as a fact `provenance 'said'`, category `money`, private by default per 08-0 §B.2).
3. **Plans.** foo opens the operator's recharge page (`billers.json` `payUrl`) in foo's Edge, enters the number, reads the plans.
   - **3a (`read_only` from "recharge")** Choice card `purpose 'job'`: question `thread.billers.q_plan` "Which plan should I recharge ••{210} with?"; up to 3 options + "Something else…"; label `thread.billers.plan_label` "₹{349} · {28} days"; detail `thread.billers.plan_detail` "{2 GB a day} · {unlimited calls}{ · same as last time}{ · was ₹{299} last time}". Best fit, deterministic: (1) the plan with the same price and validity as the last completed recharge of this number, if offered; (2) else the plan with the same validity and the closest price to the last one; (3) no history: the cheapest plan with 28 days and unlimited calls. Options 2–3: the next two plans by the same rule (ties: lower price first).
   - **3b ("check / show plans")** a Table card (05 §5.22) of up to 8 plans (Price · Days · Data · Calls) and foo's line `thread.billers.plans_look` "Say \"recharge ₹{349}\" and I'll get it ready." No Choice card, no payment.
4. **Tap a plan** → the card's summary row; the job becomes `do`.
5. **Payment card** (05 §5.6; 08-2 §10.2 guards: duplicate, cap, bigPayment). Receipt lines: `thread.billers.pay_line_plan` "{Jio} prepaid ••{210} · {28} days, {2 GB a day}" = plan price; `thread.billers.pay_line_fee` "Convenience fee" only when the site adds one; no cancel row except `thread.billers.pay_line_no_refund` "Recharges can't be undone." (value ₹0). Personal-data line `thread.billers.pay_people` "For +91 {98••• ••210}". Pay with: `money.defaultMethod`, else UPI (`money.upiId`), else the Secret box / UPI ID step first (J11 branch "No UPI ID saved"). Countdown 10:00.
6. **Approve** → 08-2 §10.4 once: UPI collect ("Approve ₹{349} in your UPI app on your phone. Waiting… {4:58}") or card (3-D Secure lane). Second look compares number (last 3), operator, plan price and total with the user's words and the tapped option.
7. **Result.** Operator success page with a transaction id → DONE, proof `{ kind: 'confirmation', ref: '{transaction id}' }` + screenshot. Bubble `thread.billers.recharged` "Recharged. {Jio} ••{210}, ₹{349} plan, valid till {Fri 13 Nov}." Proof chip "Proof: {transaction #JIO8821340}". Validity date = today + plan days − 1 when the site does not print an end date. Activity: `paid`/`paid`, `approved_how` per 08-0 §G.4. Money notes line: "{Fri 16 Oct} · {Jio ••210} · ₹{349} · {28} days · till {Fri 13 Nov} · #{JIO8821340}".
8. **Offer once.** After the first completed recharge of a number: `routine_offer` card `source 'after_job'`, body `thread.billers.offer_due` "Want me to remind you 2 days before this plan ends on {Fri 13 Nov}, with plans ready?" buttons `cards.routine_offer.button.yes_remind` "Yes, remind me" / `cards.routine_offer.button.no_thanks` "No thanks". Key `routine_offer:recharge_due:{billerSlug}-{last4}` (08-0 §G.13). After-job offer rules per §12.0.6 (prompted, at most one per job, X-97). Yes → §12.26.7, `created_from 'asked'` (the user tapped Yes on an `after_job` offer: prompted).

### 12.26.4 Other kinds
- **DTH.** Identifier from memory or asked (`thread.billers.q_id` "What's your {Tata Play} {Subscriber ID}?"). Choice `thread.billers.q_amount` "How much should I add to {Tata Play} ••{4417}?" options read from the site: "₹{399} · 1 month (your pack)" (Best fit when the site shows the monthly pack price), "₹{1,197} · 3 months", "Something else…" (typed amount, `parseInr`, must be ≥ the site's minimum). Then steps 5–7; result `thread.billers.dth_done` "Added ₹{399} to {Tata Play} ••{4417}." 
- **FASTag.** Issuer from memory or asked as Choice of issuers in `billers.json` `kind 'fastag'`. Amount Choice: "₹{500}", "₹{1,000}", "₹{2,000}", Best fit = last amount for this vehicle, else ₹1,000; detail "Balance now ₹{120}" when the page shows it. Issuer page on `handback-sites.json` → hand-back card (08-2 §8.3.10). Result `thread.billers.fastag_done` "Added ₹{1,000} to the FASTag on {KA 01 ••• 4521}."
- **Gas cylinder.** "Book a gas cylinder" (book = do-word). foo signs in on the distributor site if needed (J13), reads the refill price, then the Payment card: line `thread.billers.pay_line_cylinder` "{Indane} refill · {14.2 kg} · LPG ID ••{8812}"; activity `paid` and `booked`. Result `thread.billers.cylinder_done` "Booked and paid. {Indane} refill, booking #{IN44120}. They'll call before delivery." The site refuses a booking too soon after the last one → `thread.billers.cylinder_too_soon` "{Indane} says your last refill was {Mon 5 Oct}, so you can book again from {Mon 26 Oct}. Nothing was booked or paid." [ Remind me then ] (a `once` routine at 9:00 AM that day).
- **Broadband and electricity** ("pay my BESCOM bill"). foo reads the amount due and due date on the biller's site (sign-in via J13 if needed) and posts a **Bill card** (05 §5.29, state `waiting`; payload = `BillPayload` (08-5 §4.1) with `source = 'biller_site'`, `billerSite` = the biller's registrable domain; this file only says what each field draws: amount due, due date and biller from the biller's page) with source line "From {BESCOM}'s site, {Fri 16 Oct}" (name = `billers.json.name`; 05 §5.29.2 wins; X-115 (5)). From here J11 steps 3–6 apply unchanged (Pay now → live amount → Payment card → UPI → proof). Nothing due → `thread.billers.nothing_due` "Nothing is due on {BESCOM} ••{2207} right now. Your last bill of ₹{1,840} was paid on {Sat 3 Oct}." (no card).

### 12.26.5 Branches
| Case | What happens | Exact copy |
|---|---|---|
| Biller not in `billers.json` | foo finds the biller's site by search and asks before using it; the confirmed domain is saved in the site note as the biller's own (`sites\{domain}.md` "biller: {name}") | Choice `thread.billers.q_domain` "I don't know {Sikkim Power}'s own site yet. Is it {sikkimpower.co.in}?" options "Yes, that's it" / "No, I'll pay it myself" |
| User says "No, I'll pay it myself" | job DONE (nothing paid) | `thread.billers.self_pay` "Okay. Nothing was paid." |
| Site is on `handback-sites.json` | hand-back card (08-2 §8.3.10) | "This is your bank's site. I'll open it for you, and you do this part." [ Open {site} ] |
| A third-party pay link is offered on the biller page (wallet, app) | ignored; foo uses only the biller page's own UPI or card fields | — |
| Plan price on the payment page differs from the tapped plan | Payment card SUPERSEDED, new card (05 §5.6.3) | 05: "The amount changed from ₹{349} to ₹{399}, so I stopped. Nothing was paid." |
| Same number + same amount paid in the last 7 days | duplicate Choice before any Payment card (08-2 §10.2) | 05 §5.6.2: "You paid {Jio} ₹{349} on {Mon 12 Oct}. Pay again anyway?" [ Don't pay ] [ Pay again ] |
| Number not on that operator (site says so) | job asks again | `thread.billers.wrong_operator` "{Jio} says ••{210} isn't one of theirs. Which operator is it on?" options from `billers.json` `mobile_prepaid` |
| Purchase cap would be passed | Spend-cap card instead of Payment card (05 §5.6 Trigger) | 05 §5.21 copy |
| Operator page needs sign-in or OTP | J13 lanes (OTP is the user's) | 05 §5.10.2 |
| Recharge succeeded but no transaction id shown | CHECKING per 08-2 §10.5 (never re-submits) | 05 §5.6.3 CHECKING copy |
| Permissions `pay = never` | refusal before opening any site | 08-0 §G.3 "I'm not allowed to {pay}. You can change that in Settings → Permissions. [ Open Permissions ]" |
| AI unreachable at Approve | Payment card stays PENDING | 05 §5.6.3 "AI down at Approve" copy |

### 12.26.6 Never
No autopay, no stored biller login unless the user saved it (J13 offer), no wallet top-ups, no payment on a domain that is neither in `billers.json` nor confirmed by the user, no recharge started by a routine (routines end in a card, 08-3 §13.1).

### 12.26.7 Recharge reminder (routine builtin `recharge_due`)
Created by the §12.26.3 step 8 offer, the Ideas tile 4, or asking ("remind me before my Jio plan ends"). One routine per number. Read-only.

| Field | Value |
|---|---|
| What | "When the {Jio} plan on ••{210} ends" |
| Schedule | `once` at 9:00 AM on (plan end date − 2 days); when that day is today or past, at the next active-hours start |
| Re-arm | after any completed recharge payment for this number (by foo), the engine sets the next `once` from the new end date; when the user recharged elsewhere, the first firing asks (below) |
| Condition | none: it fires every time |
| Where | owner chat (Money or foo) + notification |

Firing: bubble `thread.billers.due_soon` "Your {Jio} plan on ••{210} ends {Fri 13 Nov}. Here are plans to renew:" followed by the §12.26.3 step 3a Choice card (plans read in the run). Tapping a plan continues at step 5 in a new `do` job; nothing is paid without the Payment card. If the user already recharged elsewhere the Choice card's last row "Something else…" is replaced by "I already recharged" → `thread.billers.already_done` "Okay. When does the new plan end?" (date question; the routine re-arms from the answer). Notification `notifications.billers.due_soon` "{Money} · Your {Jio} plan ends {Fri 13 Nov}." [ Open ]. Runs are prompted whichever way the routine was made (offer Yes → `asked`, Ideas → `idea`, asking → `asked`; §12.0.6, X-97) and do not count toward the interruption budget.

### 12.26.8 Stored, settings, test ids
- Money notes (biller, identifier last 3/4 only, last amount, plan days, end date, transaction id); full identifiers as private `money` memory facts; activity `paid` (and `booked` for gas); `payments`, `approvals`, `cards`, `jobs.proof`.
- Settings read: `permissions.actions.pay`, `permissions.apps.browser`, `money.upiId`, `money.defaultMethod`, `money.purchaseCapPaise`, `money.bigPaymentPaise`, `routines.activeFrom`, `notifications.quiet`. Written: `money.upiId` only through the J11 "No UPI ID saved" step.
- Test ids: `card-choice`, `card-table`, `card-bill` (and E's Bill card button ids), `card-payment`, `card-payment-approve`, `card-routine-offer`, `card-routine-offer-yes-remind`, `card-routine-offer-no-thanks`, `card-routine`.

---

## §12.A Acceptance tests (AT-158…AT-199)

Columns as 10-1 §B: id · journey · test · articles · priority. All run with the sandbox site pack (10-2 F.2) extended by a fake IRCTC (search, sign-in with puzzle, Tatkal clock, payment, booked-ticket history page for PNR watch; no public PNR page) and fake biller sites (prepaid operator, DTH, gas, electricity), `FOO_FAKE_AI`, and the pinned clock (07 §7.0.6) unless a test sets another time.

| AT | J | Test | Art. | P |
|---|---|---|---|---|
| AT-158 | J24 | **Given** the More options menu, **when** "Ideas" is chosen, **then** `screen-ideas` opens with the title "Ideas", the line "Tap one to start. I'll ask anything I need.", six chips in the order All · Money · Travel · Home · Family · Fun (All selected) and 12 tiles in the §12.24.4 order. | 25 | P1 |
| AT-159 | J24 | **Given** the Ideas page, **when** "Money" is selected, **then** exactly tiles 3, 4, 5, 8, 12 show; **when** "All" is selected, all 12 show again. | 25 | P1 |
| AT-160 | J24 | **Given** Gmail is not connected, **then** tiles 2, 3, 10, 12 show "Needs Gmail" and tile 9 shows "Needs Google"; **when** Start on tile 2 is tapped, **then** the Connect card appears first and, on Skip, foo says "Okay. This idea needs Gmail, so I haven't started it." and no routine row exists. | 2, 25 | P1 |
| AT-161 | J24 | **Given** Start on "Watch my PNR", **then** the owner chat opens, foo asks for the PNR, and after "2134567890" a `routine_offer` card (state `offered`) shows the routine's rows; **and** the `routines` table is unchanged until "Start it" is tapped. | 3, 5 | P1 |
| AT-162 | J24 | **Given** the offer card from AT-161, **when** "Start it" is tapped, **then** foo posts the first-run result line and a Routine created card, and the routine row has `created_from='idea'` and `builtin='pnr_watch'`. | 11, 19 | P1 |
| AT-163 | J24 | **Given** an idea offer card, **when** "Not now" is tapped, **then** the card reads "Not started. It's still in Ideas if you want it later.", no `suggestions` row is written, and starting the same idea again from the gallery posts a new offer card. | 20 | P1 |
| AT-164 | J24 | **Given** an idea routine fires 4 times in one day with `notifications.unpromptedPerDay = 3`, **then** all 4 messages are delivered (idea routines are prompted). | 19 | P1 |
| AT-165 | J24 | **Given** no routines, **then** the Routines page first-time block shows "See ideas" and it opens the Ideas page; **given** the user asks "what can you do?", **then** foo's reply ends with "Here are some things I can keep an eye on for you: See ideas" and the link opens the Ideas page. | 25 | P1 |
| AT-166 | J24 | **Given** offline, **then** every Start button is disabled with the tooltip "You're offline. This needs the internet."; **given** 25 routines, **then** Start is disabled with the 25-routine tooltip. | 25, 29 | P1 |
| AT-167 | J24 | **Given** the Medicine reminder idea started for "Thyronorm" at 8:00 AM, **then** its notification body is "Time for your medicine." and the medicine name never appears in a group chat, a notification or the AI-visible group context. | 14 | P1 |
| AT-168 | J25 | **Given** "find trains from Delhi to Jaipur on Fri 23 Oct", **then** a Choice card with at most 3 trains plus "Something else…" appears, option 1 is tagged Best fit and has seats, the job is `read_only`, and IRCTC is never asked to sign in for payment and no Payment card appears. | 3 | P1 |
| AT-169 | J25 | **Given** the card from AT-168, **when** a train is tapped, **then** the job becomes `do` with `do_verbs` containing `book` and `pay` and continues to sign-in; **and** every IRCTC page was opened in foo's Edge (no cloud browser call for `irctc.co.in`). | 3, 9 | P1 |
| AT-170 | J25 | **Given** a saved IRCTC login, **when** the login page shows its puzzle, **then** foo posts "IRCTC always asks for a puzzle, so I'll need you for a few seconds." and a Take over sign-in card, makes no click on the page until handed back, and no screenshot or page text is captured while the user is in control. | 8 | P1 |
| AT-171 | J25 | **Given** a booking for 2 travellers in CC, **then** the Payment card lists the ticket line, "IRCTC convenience fee", "Travel insurance ₹0 (not taken)", the per-class cancel row, "Booked for …" with both names and ages, "Adds it to your calendar after booking." and "Total charged once" equal to IRCTC's page total. | 5, 7 | P1 |
| AT-171a | J25 | **Given** a booking Payment card, **then** the cancel row reads "Cancel 72 h or more before: IRCTC keeps about ₹180 a traveller. Later, more is kept. (An estimate; IRCTC decides.)"; **given** "cancel my train", **then** the Approval card's refund line reads "IRCTC should refund about ₹{x} to how you paid. That's an estimate; IRCTC decides the final amount." (amount from IRCTC's cancel page, else `railRefundEstimate`); **given** a confirmed Tatkal ticket, **then** both show "Tatkal: no refund if you cancel a confirmed ticket." with no refund amount, and the cancel still needs the Approval tap. | 5, 7 | P1 |
| AT-172 | J25 | **Given** the user approves the AT-171 card, **then** exactly one payment is submitted, the result reads "Booked. …" with coach and seats, the proof chip is "Proof: PNR {10 digits}", one Calendar event exists, and the activity log has one `paid` and one `booked` row with the same `approval_id`. | 7, 11 | P1 |
| AT-173 | J25 | **Given** IRCTC's total changes from ₹2,145 to ₹2,195 after Approve, **then** nothing is submitted, the card is SUPERSEDED with "The amount changed from ₹2,145 to ₹2,195, so I stopped. Nothing was paid." and a new card appears. | 7 | P1 |
| AT-174 | J25 | **Given** a booking that ends on the waitlist, **then** the Payment card had the "Status now: Waitlist …" row in warn colour, the result uses the waitlist copy, and one "Watch PNR" offer card appears with no notification; **when** "No thanks" is tapped, **then** `suggestions` has `routine_offer:pnr_watch:{pnr}` = dismissed and the offer never appears again for that PNR. | 11, 20 | P1 |
| AT-175 | J25 | **Given** a `pnr_watch` routine, **when** two runs observe the same status, **then** nothing is posted; **when** the status becomes CNF S4 32, **then** foo posts exactly "Your PNR 1234567890 is now CNF, coach S4 seat 32." with the why footer. | 12, 19 | P1 |
| AT-176 | J25 | **Given** the chart is prepared and the ticket is still waitlisted, **then** foo posts the final waitlist message and the routine's state becomes `deleted`; no further runs happen. | 11 | P1 |
| AT-176a | J25 | **Given** a `pnr_watch` routine and the user is signed out of IRCTC in foo's Edge profile, **when** a run starts, **then** it ends `signed_out` with no further IRCTC request in that run and no request to the public PNR page (indianrail.gov.in), foo posts "IRCTC signed me out, so I can't check your PNR. Sign in to keep watching." at most once that local day, and no further run polls until the user signs in to IRCTC through foo. | 8, 19 | P1 |
| AT-177 | J25 | **Given** the user accepts "Try Tatkal at 10:00 AM" on Thu 22 Oct 9:00 AM for an AC class, **then** a Plan card with the three steps and "Tatkal fares cost more than normal ones. Keep your PC on and awake at 9:55 AM." appears; **when** Go is tapped, **then** the job is WAITING with `waiting_reason='opens_at'`, `wake_at` = 9:55 AM and foo posts the Tatkal-ready line. | 3, 21 | P1 |
| AT-178 | J25 | **Given** the AT-177 job, **then** a notification "… Tatkal for {train} opens at 10:00 AM. Be at your PC from 9:55 AM …" fires at 9:50 AM; no IRCTC page is opened before 9:55 AM; the train is not selected before 10:00:00. | 12, 21 | P1 |
| AT-178a | J25 | **Given** quiet hours set to 09:00–12:00 and a Tatkal Plan card on Go, **then** the Tatkal reminder fires `urgent` at T − 10 min before the opening time (9:50 AM for an AC class, 10:50 AM for SL) and toasts despite quiet hours. | 19, 21 | P1 |
| AT-179 | J25 | **Given** the Tatkal job reaches IRCTC's payment page, **then** a Payment card appears and, with no tap for 10 minutes, it EXPIRES and nothing is paid. | 5, 7 | P0 |
| AT-180 | J25 | **Given** the Tatkal job and nobody completes the sign-in puzzle by 10:15 AM, **then** the job is CANCELLED with "Tatkal seats usually go in minutes, and I couldn't sign in without you, so I stopped. Nothing was booked or paid." | 7, 16 | P1 |
| AT-181 | J25 | **Given** a Tatkal request for an SL ticket on Sat 24 Oct for a train whose origin departs on Fri 23 Oct, **then** the opening time shown is Thu 22 Oct, 11:00 AM. | 21 | P1 |
| AT-182 | J25 | **Given** "No, only confirmed seats" and only Tatkal waitlist at opening, **then** nothing is booked, no Payment card appears, and foo posts the sold-out copy. | 3, 7 | P1 |
| AT-183 | J25 | **Given** `CLOCK_WRONG` is active, **then** the Tatkal Plan card's Go is disabled and foo shows the clock line with "Fix the clock". | 2, 12 | P1 |
| AT-184 | J25 | **Given** a booked train departing Fri 23 Oct 6:10 AM and default quiet hours, **then** the departure reminder routine is set for Thu 22 Oct, 9:00 PM; **given** departure at 4:00 PM, **then** it is set for 1:00 PM the same day. | 19, 21 | P1 |
| AT-185 | J25 | **Given** a journey date 75 days ahead, **then** foo says "Bookings for … open on …, 8:00 AM. I can be ready then; you tap Pay." with the date = journey date − 60 days and offers a Plan card. | 21 | P1 |
| AT-185a | J25 | **Given** the AT-185 Plan card and Go, **then** a "booking opens" reminder (prompted, `urgent`) fires at 08:00 IST on journey date − 60 days, and the Plan card shows "On the first day only Aadhaar-verified IRCTC accounts can book. If yours isn't verified yet, do that on IRCTC first." | 19, 21 | P1 |
| AT-186 | J25 | **Given** `permissions.actions.book = 'never'`, **when** the user says "book a train to Jaipur on Friday", **then** foo replies "I'm not allowed to book. You can change that in Settings → Permissions." with [ Open Permissions ] and no IRCTC page opens. | 5 | P0 |
| AT-187 | J25 | **Given** the booking page asks for an Aadhaar OTP, **then** the OTP goes through the code lane or the user's own typing, never appears in chat, logs or AI context, and foo does not read it from Gmail unless `privacy.readCodesFromGmail` includes `irctc.co.in`. | 8 | P0 |
| AT-188 | J26 | **Given** one Jio number in memory and a last recharge of ₹349 / 28 days, **when** the user says "Recharge my Jio", **then** a Choice card shows at most 3 plans with ₹349 · 28 days as Best fit and "same as last time" in its detail; no Payment card appears before a plan is tapped. | 3 | P1 |
| AT-189 | J26 | **Given** the user taps ₹349, **then** a Payment card shows "Jio prepaid ••210 · 28 days, …" ₹349, "Recharges can't be undone.", "For +91 98••• ••210", UPI as the method and "Total charged once ₹349"; after approval exactly one payment is submitted and the result is "Recharged. Jio ••210, ₹349 plan, valid till Fri 13 Nov." with a proof chip. | 7, 11 | P1 |
| AT-190 | J26 | **Given** "show me Jio plans", **then** a Table card of plans and the line "Say "recharge ₹349" and I'll get it ready." appear, and no Choice or Payment card is created. | 3 | P1 |
| AT-191 | J26 | **Given** two Jio numbers in memory, **then** "Which Jio number?" is asked first, showing only the last 3 digits, with the user's own number as Best fit. | 8, 14 | P1 |
| AT-192 | J26 | **Given** a biller not in `billers.json`, **then** foo asks "I don't know {biller}'s own site yet. Is it {domain}?" before entering any number on that site; **given** "No, I'll pay it myself", **then** nothing is filled or paid. | 7, 9 | P0 |
| AT-193 | J26 | **Given** the FASTag issuer page is on `handback-sites.json`, **then** foo shows the hand-back card and never types on that site. | 8 | P0 |
| AT-194 | J26 | **Given** "pay my BESCOM bill" with ₹1,840 due on Thu 22 Oct, **then** a Bill card (state `waiting`) shows the amount, due date and source line, and Pay now follows the J11 path (live amount, Payment card, UPI, proof). | 7, 11 | P1 |
| AT-195 | J26 | **Given** the first completed recharge of ••210, **then** one offer "Want me to remind you 2 days before this plan ends on Fri 13 Nov, with plans ready?" appears; **when** accepted, **then** a `recharge_due` routine runs once at Wed 11 Nov, 9:00 AM, posts the plans Choice card, and no payment happens without a Payment card. | 5, 7, 20 | P1 |
| AT-196 | J26 | **Given** the same number was recharged ₹349 three days ago, **when** the user asks again, **then** the duplicate Choice "You paid Jio ₹349 on … Pay again anyway?" comes before any Payment card. | 7 | P1 |
| AT-197 | J26 | **Given** the gas site says the last refill was too recent, **then** foo posts the "too soon" copy with the next allowed date and nothing is booked or paid. | 7, 11 | P1 |
| AT-198 | J26 | **Given** the operator site adds a ₹5 convenience fee, **then** the Payment card shows a "Convenience fee ₹5" line and the total includes it; **given** the total read at submit differs from the card, **then** the card is SUPERSEDED. | 7 | P1 |
| AT-199 | J26 | **Given** `permissions.actions.pay = 'never'`, **when** "Recharge my Jio" is asked, **then** foo answers with the G.3 refusal and opens no biller site. | 5 | P0 |

Totals for this file: 46 tests (AT-158…AT-199 plus the J25 sub-tests AT-171a, AT-176a, AT-178a, AT-185a, X-108): J24 10, J25 24, J26 12. P0: 6. P1: 40.
