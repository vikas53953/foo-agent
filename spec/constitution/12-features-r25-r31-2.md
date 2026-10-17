# 12 · New v1 features R25–R31 · part 2 of 2 (J27–J30)

Part 1 (`12-features-r25-r31-1.md`): §12.24 J24 Ideas gallery (R25), §12.25 J25 Trains (R26), §12.26 J26 Recharges and billers (R27), AT-158…AT-199. Part 2 (this file): §12.27 J27 Catch me up (R28), §12.28 J28 Photos and papers in (R29), §12.29 J29 Send to foo (R30), §12.30 J30 Private chat (R31), §12.31 acceptance tests AT-230…AT-266. Read both; they are one chapter.

Status: written 2026-10-16 by review group G (fixes F-190 / UJ-07, X-45). Rank: behaviour spec, same level as 07 (README order of authority, level 5). Owner approval: Vikas approved R25–R31 (J24–J30) together on 2026-10-16 (X-100; Q9 answered). Builders start M15 Step 2 after M13.

**Binding names.** Every card type, card state, settings key, test id, copy key, error kind and table name here comes from `08-0-canonical-names.md` (X-53…X-110). All names proposed by this chapter were merged into 08-0 on 2026-10-16 (X-90); there are no open addenda.

**Conventions shared with part 1.**
- Copy keys (08-0 §D): card copy `cards.{type}.{slot}[.{state}]`; lines foo posts in a chat that are not cards `thread.{journey_slug}.{slot}` (slugs here: `catch_up`, `papers`, `send_to`, `private_chat`); errors `errors.{kind_lower}.{slot}`; notifications `notifications.{journey_slug}.{slot}`; header `chat_header.{element}.{slot}`; dialogs `dialog.c_{nn}.{slot}`; activity `activity.{element}.{slot}`. The English text in "double quotes" is final copy (00-README). `{x}` marks a variable.
- Test ids (08-0 §C, X-58): `card-{type-kebab}` and `card-{type-kebab}-{action}`, state in `data-state`, identity in `data-card-id`/`data-chat-id`/`data-index`. New ids are in 08-0 §C (registry).
- Example dates use the pinned test clock **Fri 16 Oct 2026, 9:00 AM IST** (X-10).
- Every journey follows the 07 shape: Trigger, Rules, Steps, Branches (exact copy), Cards and states, Settings keys, Test ids, Stored, Notifications, Acceptance (AT rows in §12.31).

**Cross-references other groups must add** (one-line pointers; merged into 08-0 under X-90):
- E (05): Catch-up card section = pointer to §12.27.4 here (card type `catch_up`, file `cards/CatchUp.tsx`); Bill card (E's section) adds the "From your photo / {file name}" source line and the paper amount-differs line (§12.28.4); Approval card §5.5.2 adds the "Add to calendar" kind row (§12.28.5); Choice card §5.3 adds `purpose: file_in` (no Best-fit tag, no Skip, §12.29.4). 06: 06-3 §14 confirm catalogue adds C-23 "End this private chat?" (§12.30.5); 06-3 §9 Activity rows from private chats (§12.30.7); 06-3 §10 Spend "Private chats" line; 06-3 §12 Search excludes private chats.
- C (08-3): §12 memory rule "nothing saved from a private chat" (§12.30.6); §21.2 rows for `AI_NO_VISION` (§12.28.7); catch-up summariser (§12.27.5). 09: §9.3.1 Send to shortcut, §9.5 `--send-to` argv in first launch and `second-instance`, §9.10 taskbar hover-then-drop note, §9.9 private-chat notification body, §9.23.3 uninstall removes the shortcut (§12.29).
- B (08-2 / 08-4): `TurnRequest.attachments` and `Capabilities.vision` and `ai_turns.purpose` values `catch_up`, `read_attachment` (AI-29 P-29); prompts `resources/prompts/catch_up.md`, `read_attachment.md`.
- A (08-1): `chats.private`, `activity.chat_title`, `cards.type` CHECK includes `catch_up` (X-56), FTS skip for private chats, purge keeps activity proof files (§12.30.6).
- F (07, 10, plan, PRD, GAPS): 07 index rows J27–J30 with surface keys; 10 adds AT-230…AT-266 (§12.31); PRD R28–R31 "Journeys/Proof" point here; plan M15 "spec first" points to `12-*`; GAPS line 37 closed for R28–R31 once approved; GAPS line 43 closed by §12.30.7 (owner Q2 default).

---

## §12.27 J27 · Catch me up (R28)

### 12.27.1 Trigger
- **A (typed):** in foo's chat, a helper's 1:1 chat or the private chat, the user writes a catch-up request naming a source: "catch me up on Family group", "what did I miss in Family group?", "what did I miss in mail?", "catch me up on my inbox". Intake returns `IntakeAct` kind `catch_up` (08-4 §25.2; no job, one `catch_up` turn, X-126); Art. 3: "catch up", "what did I miss" only read.
- **B (menu):** chat options menu (03 §3.6.2.2) of a `wa_mirror` chat gains the item "Catch me up" (copy `chat_header.menu.catch_up`, test id `chat-header-menu-catch-up`). Tapping it opens foo's chat and posts, as the user's bubble, the text "Catch me up on {Family group}" (copy `thread.catch_up.menu_request`), then runs as Trigger A.
- **C (routine):** a routine whose task is a catch-up ("every evening at 9, catch me up on Family group", J14) runs this same flow inside the routine run; delivery and budget follow 08-3 §13.

### 12.27.2 Rules
- Read-only (Art. 3). Nothing is sent, posted, deleted or marked read in WhatsApp or Gmail. The card footer always says "I only read; nothing was sent."
- Messages go only to the user's own AI (`ai.primary`, backup per 08-2 §6.7). Never to a cloud web tool (X-46) and never to any other service.
- Text is redacted before the AI sees it (Art. 8, `src/shared/redactor.ts`).
- **Art. 14:** the catch-up turn receives **no memory facts at all** (no retrieval, §7.2 part 5 skipped for this purpose) except `user.firstName` and `identity.agentName`, so private facts can never appear in a summary. If the request is typed in a foo group chat, the card is posted in foo's 1:1 chat and the group gets the line "I put your catch-up in our chat." (copy `thread.catch_up.moved_to_one_to_one`).
- Any reply is a Draft card (Art. 4, 05 §5.7). Any calendar add is the calendar Approval card or the `always` path (§12.28.5).
- The AI turn counts toward the AI cap (Art. 13); `SPEND_CAP` stops it like any job.

### 12.27.3 Steps
1. **Resolve the source.** WhatsApp: match the named chat against `chats` rows with `kind='wa_mirror'` (title, case-insensitive, NFKC, ≥ 4 matching characters, `wa_jid` not in `settings.connections.whatsapp.hiddenJids`). Mail: "mail", "inbox", "email", "Gmail" → Gmail inbox.
   - 2+ WhatsApp matches → Choice card (`purpose: job`) "Which one do you mean?" (copy `thread.catch_up.which_one`) with up to 4 chat titles; the answer continues the job.
   - App permission `permissions.apps.whatsapp` / `permissions.apps.gmail` = `ask` → the app-use Choice card "Can I use {WhatsApp} for this?" once per job (08-0 §G.3); `never` → the §G.3 refusal line.
2. **Pick the window.** `since` = the `until` of the last `catch_up` card for the same source (`payload.source.key`), else now − 24 h. A time the user names ("since Monday") wins. WhatsApp text is kept 7 days (08-3 §16.4), so `since` is clamped to now − 7 days with the line "I only keep 7 days of WhatsApp messages, so this starts {Fri 9 Oct, 9:00 AM}." (copy `thread.catch_up.clamped_7_days`). Gmail is clamped to 7 days the same way with "I look back at most 7 days, so this starts {Fri 9 Oct, 9:00 AM}." (`thread.catch_up.clamped_mail`). `until` = now.
3. **Gather.** WhatsApp: `wa_messages WHERE chat_jid = ? AND at BETWEEN since AND until AND from_me = 0`, newest first, at most 400 rows and 40,000 characters. Gmail: `users.messages.list(q = "in:inbox -category:promotions -category:social after:{since epoch s}", maxResults = 50)` then `messages.get(format=full)`; body text only (attachments are named, never opened). If the cap cut anything: card line "I read the newest {400} messages." / "I read the newest 50 emails." (`cards.catch_up.truncated.whatsapp` / `.mail`).
4. **Nothing new** (0 rows) → no card; foo posts "Nothing new in {Family group} since {Thu 15 Oct, 9:00 PM}." (`thread.catch_up.nothing_new`). Badge ✅.
5. **Summarise.** One AI turn, `ai_turns.purpose = 'catch_up'` (AI-29 P-29), prompt `resources/prompts/catch_up.md` (group B). The AI returns `CatchUpAct` (§12.27.5); the engine validates it and builds the card.
6. **Post the card** (§12.27.4) in the chat where the user asked (or foo's 1:1, rule above). The job is DONE; badge ✅ on the user's bubble (Art. 16). The job's proof is the card's source line: `jobs.proof` kind `read_source`, chip `cards.proof_chip.chip.read_source` "Proof: {Family group} · {n} messages read", shown as the Proof chip (05 §5.15) under the card; no "Not checked live" chip because the data is local.
7. **Buttons.** Each action button runs once; after a tap it is disabled and its label gains " ✓" (`data-state` of the button = `used`).
   - "Draft a reply" (WhatsApp) / "Reply to {Mom}" (mail) → a Draft card (05 §5.7) in the same chat, written for that chat or email thread. Sending follows the Draft rules (groups and new people get the full Approval card, X-65).
   - "Add {Sun dinner} to calendar" → §12.28.5 calendar path with the event the AI extracted.

### 12.27.4 Catch-up card (`catch_up`, X-56; file `cards/CatchUp.tsx`)

```
┌──────────────────────────────────────────────────────────────┐
│ [TaskListLtr 20] Family group · since Thu 15 Oct, 9:00 PM     │ title --t-body-strong
│ • Mausi's flight lands Sat 17 Oct, 4:30 PM (Priya)            │ lines --t-body, ≤ 6
│ • Dinner at ours on Sun, 7 people (Mom)                       │
│ • 34 good-morning messages, skipped                           │ skipped lines --t-small --fg-2
│ For you: Mom asked if you can pick up sweets.                 │ label --t-body-strong, ≤ 3 lines
│ [ Draft a reply ]  [ Add Sun dinner to calendar ]             │ Secondary buttons, ≤ 2
│ I only read; nothing was sent.                                │ --t-caption --fg-3
└──────────────────────────────────────────────────────────────┘
```
Width `--card-w` 440px, frame, focus, motion and logging per 05 §0. No Primary button (nothing to approve).

| Slot | Copy key | Copy (final) |
|---|---|---|
| Icon | — | `TaskListLtr` 20 `--accent` (02 icon list) |
| Title, WhatsApp | `cards.catch_up.title.whatsapp` | "{Family group} · since {Thu 15 Oct, 9:00 PM}" |
| Title, mail | `cards.catch_up.title.mail` | "Your inbox · since {Thu 15 Oct, 9:00 PM}" |
| Line | `cards.catch_up.line` | "{text} ({who})" — `who` is the sender's WhatsApp name or email display name; no `who` for mail lines that are one email: "{text}" |
| Skipped line | `cards.catch_up.skipped` | "{34} {good-morning messages}, skipped" |
| Photos line | `cards.catch_up.media` | "{5} photos, not opened" |
| For-you label | `cards.catch_up.for_you` | "For you:" |
| No for-you lines | — | label and lines omitted |
| Draft button | `cards.catch_up.button.draft_reply` / `.reply_to` | "Draft a reply" / "Reply to {Mom}" |
| Calendar button | `cards.catch_up.button.add_calendar` | "Add {Sun dinner} to calendar" (event label ≤ 24 characters) |
| Footer | `cards.catch_up.footer` | "I only read; nothing was sent." |
| Truncated | `cards.catch_up.truncated.whatsapp` / `.mail` | "I read the newest {400} messages." / "I read the newest 50 emails." |

- **States:** `shown` only (08-0 §G.2 "all others"). Button use is per-button `data-state` `ready` / `used`.
- **Keyboard / Narrator:** one Tab stop into the card, then buttons. Card name "Catch-up. {title}. {n} points. For you: {k} points." Lines are a list.
- **Groups:** never posted in a group chat (rule above).
- **Toast:** none when the window is focused; otherwise the normal "done" toast (09 §9.9.3): title "{agentName}", body "Your catch-up on {Family group} is ready." (`notifications.catch_up.ready`).
- **Logged:** card row with `payload` (`CatchUpPayload`, §12.27.5). Activity: none (no world change, 08-0 §G.4).
- **Test ids:** `card-catch-up` (`data-card-id`, `data-state`), `card-catch-up-draft-reply`, `card-catch-up-add-calendar`.

### 12.27.5 Summariser contract (engine `chat/catchUp.ts`)

```ts
// shared types (src/shared/types.ts, 08-0 §B.3)
interface CatchUpAct {                    // what the AI returns inside <act>
  lines: { text: string /* ≤ 90 chars */; who?: string; messageIds: string[] }[];   // ≤ 6
  skipped: { label: string /* e.g. "good-morning messages" */; count: number }[];    // ≤ 3
  forYou: { text: string /* ≤ 120 chars */; messageIds: string[] }[];                 // ≤ 3
  actions: ({ kind: 'draft_reply'; messageId: string } |
            { kind: 'add_calendar'; label: string; start: string /* ISO local */; end?: string; place?: string; messageId: string })[]; // ≤ 2
}
interface CatchUpPayload {                // cards.payload for type 'catch_up'
  source: { app: 'whatsapp' | 'gmail'; key: string /* wa_jid or 'gmail:inbox' */; label: string };
  since: number; until: number; readCount: number; truncated: boolean;
  lines: CatchUpAct['lines']; skipped: CatchUpAct['skipped']; mediaCount: number; forYou: CatchUpAct['forYou'];
  actions: (CatchUpAct['actions'][number] & { used: boolean })[];
}
```
Validation (drop silently what fails, then build): every `messageIds` entry must be a gathered message; `forYou` lines need ≥ 1 cited message that `mentions_me = 1`, is a reply to the user, or (mail) is addressed To the user; `add_calendar.start` must parse and lie within now … now + 60 days; `who` must equal a sender label of a cited message; any line whose text contains a vault secret hash hit or a card-number pattern is dropped (Redactor). `mediaCount` is counted by the engine from `"[photo]"` rows, not by the AI. If nothing survives validation the card shows the skipped and media lines only; if those are empty too, step 4's "Nothing new" line is used instead.

### 12.27.6 Branches

| Case | What happens | Copy key | Exact copy |
|---|---|---|---|
| WhatsApp not linked | Connect card (05 §5.11, WhatsApp) under the line | `thread.catch_up.need_whatsapp` | "To catch you up on WhatsApp, link it first." |
| `connections.whatsapp.read = false` | line + one button deep-linking `foo://settings/connections/w-read` | `thread.catch_up.whatsapp_read_off` | "Reading WhatsApp is turned off. [ Open Settings ]" |
| Source is in `hiddenJids` | line + button `foo://settings/connections/w-hidden` | `thread.catch_up.hidden` | "You hid {Family group} from me, so I don't read it. [ Open Settings ]" |
| No chat matches | line | `thread.catch_up.not_found` | "I can't find a WhatsApp chat called "{Family grp}"." |
| Gmail not connected | Connect card (Google) under the line | `thread.catch_up.need_gmail` | "To catch you up on email, connect Gmail first." |
| Gmail connection expired | `CONN_EXPIRED` error card (08-3 §21.2) | — | as 08-3 |
| Offline | Gmail: `NET_OFFLINE`; WhatsApp: the stored `wa_messages` are summarised (local) and the AI is reached as usual; if the AI is unreachable, `AI_SERVICE_DOWN`/`NET_OFFLINE` per 08-3 | — | as 08-3 |
| Typed "send it" / "reply yes" to a catch-up | no send; foo asks for a Draft first (Art. 4) | `thread.catch_up.draft_first` | "I'll write a draft first. Tap Draft a reply on the card." |
| Asked in a group | card goes to 1:1 (rule) | `thread.catch_up.moved_to_one_to_one` | "I put your catch-up in our chat." |
| Mail with only promotions/social in range | treated as Nothing new | `thread.catch_up.nothing_new` | "Nothing new in {your inbox} since {Thu 15 Oct, 9:00 PM}." |

### 12.27.7 Settings keys read (08-0 §A; none written)
`connections.whatsapp.read`, `connections.whatsapp.hiddenJids`, `permissions.apps.whatsapp`, `permissions.apps.gmail`, `permissions.actions.calendar` (calendar button), `money.aiCapPaise` (cap), `ai.primary`, `ai.backup`.

### 12.27.8 Stored
`cards` row (`type='catch_up'`, `state='shown'`, `payload: CatchUpPayload`); `jobs` row titled "Catch up on {Family group}"; `ai_turns` row (`purpose='catch_up'`). Nothing in memory; nothing in `activity` (read only). `wa_messages` unchanged (no "read" marks).

---

## §12.28 J28 · Photos and papers in (R29)

### 12.28.1 Trigger
A user message (`messages.kind='text'`, attachments on the text message, 08-0 §G.1) carries ≥ 1 image (jpg, jpeg, png, webp, gif, bmp, heic, heif) or PDF, from the composer (04 §21.4, §22.6 drop) or from Send to foo (§12.29). Three cases:
- **A · Text with intent:** "pay this", "remind me before this is due", "add this to my calendar", "put this ticket in my calendar". Intake reads the intent (bill_pay, bill_remind, calendar_add) and runs §12.28.3 with it.
- **B · No text:** the file-in Choice card (§12.29.4) asks first; its answer becomes the intent.
- **C · Text that only asks about the file** ("what does this say?", "is this the right amount?"): a normal `intake` turn with the attachments (purpose `intake`, kind `reply`, ≤ 6 lines, never a number longer than 6 digits; the 08-4 §26.13 answer guard runs on the `<say>`); no card. `read_attachment` and `PaperRead` are used only for the bill, ticket and calendar paths (X-126).

### 12.28.2 Rules
- Reading a file is a read (Art. 3): no card is needed to read it. Every action after the read stops at its normal card: Bill card then Payment card for paying (Art. 5, 7), calendar Approval card (or the `always` path) for calendar entries, Bill card "Remind me" for reminders. Nothing happens until the user taps (R29).
- The file goes only to the user's AI (`ai.primary`, then backup), prepared per 08-0 §G.18 (images ≤ 2,048 px PNG; PDFs never sent as PDF, X-109; the original stays in the chat). Never to a cloud tool (X-46).
- **Art. 8 and pictures** (X-98, Claude's default, Vikas may change): before any turn, main prepares every attachment (08-0 §G.18): images and scanned PDF pages are read on this PC with Windows OCR and card numbers, CVV, OTPs, Aadhaar and bank account numbers are blacked out (`thread.papers.covered`); PDF text pages are scrubbed by the Redactor; at most 10 pages. OCR unavailable → the one-time `photo_notice` Choice; OCR failed on a picture → `thread.papers.check_failed`. The answer guard stays: if the AI's read still contains such a number or a vault hash hit, the read is discarded and foo posts the secret line.
- Read facts are never written to memory (12.1 "one-off task data"). Bills paid go to the Money helper's notes per J11.

### 12.28.3 Steps
1. **Check the AI can read it.** Main prepares the file (08-0 §G.18). If any part is a picture (an image or a scanned PDF page) and `Capabilities.vision = false`: **with a command-line AI (`claude-cli`, `codex-cli`, `gemini-cli`) main first reads the words off each image locally** with Windows built-in OCR (`Windows.Media.Ocr`, offline, nothing leaves the PC) and sends them as text in the same message, prefixed "Text read from the picture:", with no image part; the flow goes on at step 3 [X-142; 08-4 §30.10]. The engine raises `AI_NO_VISION` and posts the matching ask line (Branches) only when the picture has no readable words, the turn needs the picture itself, or the AI is not a command-line AI; the job then waits (NEEDS_YOU, ⏳). A PDF made only of text pages needs no vision. The typed answer is parsed into the same `PaperRead` and the flow goes on at step 3.
2. **Read.** One AI turn, `ai_turns.purpose = 'read_attachment'`, prompt `resources/prompts/read_attachment.md` (group B), with the intent if known. Returns `PaperRead`:
   ```ts
   interface PaperRead {
     docKind: 'bill' | 'ticket' | 'booking' | 'other'; sure: boolean;
     bill?: { biller: string; amountPaise: number; dueDate: string /* YYYY-MM-DD */; accountLast4?: string; period?: string /* "September" */ };
     event?: { title: string /* ≤ 40 */; start: string /* ISO local */; end?: string; place?: string; ref?: string /* PNR or booking number */ };
     summary: string /* ≤ 200 chars, plain */;
   }
   ```
   Engine validation: `amountPaise` integer 100 … 10,000,000; `dueDate` a real date within today − 60 days … today + 120 days; `accountLast4` exactly 4 digits; `event.start` within today − 1 day … today + 400 days; any other value → the field counts as missing. A `ref` of exactly 10 digits on a train ticket is kept as `pnr`.
3. **Act by kind and intent.**
   - `bill` (or intent bill_pay / bill_remind): post the **Bill card** (05, E's section; type `bill`, state `waiting`, `BillPayload.source` = `'photo'` or `'file'`, 08-0 §B.2 `BillSource`) with source line "From your photo, {Fri 16 Oct}" or "From {Electricity-Sep.pdf}, {Fri 16 Oct}" (`cards.bill.source.photo` / `cards.bill.source.file`). Intent bill_pay: the Bill card goes straight to `paying` and the J11 Pay-now path runs (live amount on the biller's site, sign-in per J13, then the Payment card, 05 §5.6). Intent bill_remind: the Bill card's "Remind me {day}" action runs at once (state `reminded`, its `once` routine per the Bill card rules). No intent: the card waits for a tap.
   - `ticket` / `booking` (or intent calendar_add): calendar path §12.28.5. If `event.ref` is a 10-digit PNR, after the calendar step foo offers the PNR watch exactly as J25 (part 1 §12.25.3 step 11; routine §12.25.8, builtin `pnr_watch`): `routine_offer` card with payload `source: 'after_job'`, copy "Want me to watch PNR {pnr} and tell you when it changes?" with buttons "Yes, watch it" / "No thanks" (copy keys owned by part 1), suggestion key `routine_offer:pnr_watch:{pnr}` (08-0 §G.13).
   - `other`: foo replies in one bubble with `summary`, then "What should I do with it?" (`thread.papers.other_ask`); the user answers in words.
   - `sure = false` (any kind): the file-in Choice card (§12.29.4) with the question "Is this a bill, a ticket or something else?" (`thread.papers.which_kind`) and options "A bill" · "A ticket or booking" · "Something else" (`thread.papers.kind_option.bill` / `.ticket` / `.other`); the answer sets `docKind` and step 3 runs again without a second AI read.
4. **Missing fields.** If a field the action needs is missing (bill: biller, amount, due date; event: title, start), foo asks for one field at a time in words before posting the card: "I couldn't read the {due date} on this. What is it?" (`thread.papers.missing_field`; field names `thread.papers.field.biller` "biller name", `.amount` "amount", `.due_date` "due date", `.event_title` "name of the trip or event", `.event_start` "date and time"). Typed answers are parsed by the engine (amount: digits with optional ₹ and commas; date: the 08-2 date parser); a reply that does not parse gets "Sorry, I didn't get that. What's the {due date}?" (`thread.papers.missing_field_retry`) once, then the job ends FAILED with "Okay, I've left it. Send it again when you have the details." (`thread.papers.gave_up`).
5. **Done.** The job is DONE when the Bill card or calendar entry exists (badge ✅). Payments and calendar adds carry their own proof (05 §5.15, 08-3 §16.1 `calendar_event`).

### 12.28.4 Bill card additions (owned by E's Bill card section)
| Slot | Copy key | Copy (final) |
|---|---|---|
| Source, photo | `cards.bill.source.photo` | "From your photo, {Fri 16 Oct}" |
| Source, file | `cards.bill.source.file` | "From {Electricity-Sep.pdf}, {Fri 16 Oct}" |
| Live amount differs (Pay now) | `cards.bill.paper_amount_differs` | "Your {photo} says ₹{1,179}; {Airtel}'s site now says ₹{1,279}. I'm using the site's amount." (`{photo}` = "photo" or "file") |
The card's payload = `BillPayload` (08-5 §4.1; `source` `'photo'`/`'file'`, `sourceAttachmentId` is a field of it, X-115); this section only says which slots the paper fills. If `dueOn` ≤ today, the Remind chip is omitted (the Bill card's "Remind me {day}" and the file-in card's "Remind me before it's due") and the chips are "Pay now" then the Link "I already paid" (`cards.bill.already_paid`, state `already_paid`; no "Mark paid" chip, X-140; X-115 (6)). Duplicate, scam, overdue and expiry behaviour are the Bill card's own (05-3 §5.29). A paper bill never has a pay link, so the scam variant applies only when the paper names a payee that is not the biller's known site.

### 12.28.5 Calendar path (shared by J27 and J28)
- `permissions.actions.calendar = 'ask'` (default): an **Approval card** (05 §5.5), `approvals.verb = 'calendar_write'`, kind "Add to calendar" `[cross-ref E: new §5.5.2 row]`: icon `Calendar`; title "Add {Train to Mumbai} to your calendar?" (`cards.approval.calendar_add.title`); impact "{Sat 17 Oct, 4:30 PM} · {Mumbai Central} · {Google Calendar}" (`cards.approval.calendar_add.impact`); Primary "Add to calendar" (`cards.approval.calendar_add.button.approve`); Secondary "Not now"; expiry 60 min; scope chips shown (calendar is reversible, 05 §5.5.3).
- `'always'`: the event is added at once and foo posts "Added to your calendar: {Train to Mumbai}, {Sat 17 Oct, 4:30 PM}. [ Undo ]" (`thread.papers.calendar_added`); Undo deletes the event within 5 s (02 §F21.3 undo bar).
- `'never'`: the 08-0 §G.3 refusal line.
- Calendar off or Google not connected: Connect card (05 §5.11, Calendar) after the line "To add it to your calendar, connect Google Calendar." (`thread.papers.need_calendar`).
- Proof: `calendar_event` chip "Proof: in your Google Calendar · open" (05 §5.15). Activity: per 08-0 §G.4 there is no calendar event kind, so a calendar add is not an activity row (tech log only); this matches 05's Logged rule for reversible changes.

### 12.28.6 Branches

| Case | What happens | Copy key | Exact copy |
|---|---|---|---|
| Image, command-line AI, words found (X-142) | words read on the PC and sent as text ("Text read from the picture:"); no ask; flow goes on at step 3 | — | none |
| Image, AI can't read pictures (no readable words, or not a command-line AI) | `AI_NO_VISION`; ask; job NEEDS_YOU | `errors.ai_no_vision.picture` | "Your AI can't read pictures. Can you type the amount and due date?" |
| Image, AI can't read pictures, intent calendar_add | same | `errors.ai_no_vision.picture_event` | "Your AI can't read pictures. Can you type the date, time and place?" |
| Scanned PDF page, AI can't read pictures | same | `errors.ai_no_vision.scanned_page` | "Your AI can't read scanned pages. Can you type the amount and due date?" |
| Numbers that looked private were blacked out before the read (08-0 §G.18 step 4) | marker line, then the read goes on | `thread.papers.covered` | "I covered {n, plural, one {# number} other {# numbers}} that looked private before reading this." |
| PDF longer than 10 pages | only the first 10 pages are prepared and read | `thread.papers.first_pages` | "I read the first 10 pages." |
| OCR unavailable on this PC and `privacy.photoCheckNoticeShown = false` (08-0 §G.18 step 5) | `choice` card `purpose: 'photo_notice'` before the first picture is sent; Send it → setting true, the read goes on; Not now → nothing is sent, job CANCELLED (`stop_reason='user_button'`) | `thread.papers.photo_notice.body` · `.send` · `.not_now` · `.not_sent` | "I can't check pictures for card numbers or codes on this PC, so your AI would see this photo as it is. Don't send photos of cards, codes or Aadhaar." [ "Send it" ] [ "Not now" ]; after Not now: "Okay, I didn't send it." |
| OCR failed on a picture (08-0 §G.18 step 6) | that picture is not sent; job NEEDS_YOU | `thread.papers.check_failed` | "I couldn't check this picture for private numbers, so I didn't send it to your AI. Can you type what you need from it?" |
| Read shows a card number / OTP / saved secret | read discarded; nothing stored from it; job FAILED | `thread.papers.secret_seen` | "This seems to show a card number or a code, so I stopped reading it. Nothing was saved." |
| Photo unreadable (AI returns nothing usable) | job FAILED | `thread.papers.unreadable` | "I couldn't read this. Try a sharper photo, or type the amount and due date." |
| Several bills in one message | one Bill card per bill, in file order, at most 6 | — | — |
| Paper says already paid ("Paid", receipt) | no Bill card; foo replies with summary and asks | `thread.papers.looks_paid` | "This looks like a receipt for {Airtel} ₹{1,179}, already paid. Should I keep it with Money's notes?" (answered in words; yes → Money notes line per J11 Stored) |
| Due date already passed | Bill card overdue state (E's card) | — | — |
| AI service down / offline / cap | 08-3 §21.2 rows | — | as 08-3 |
| Typed "yes pay" after the Payment card shows | Art. 6 reply | — | "Tap Approve on the card so I know it's really you." |

### 12.28.7 Error row for 08-3 §21.2 (group C adds it, X-70)
| ErrorKind | Detect | Job effect | Surface | One button | Toast |
|---|---|---|---|---|---|
| `AI_NO_VISION` | an attachment needs a picture read (an image, or a scanned PDF page), the AI's `vision=false` (08-4 §30.6), and the words-first read of X-142 found no words or does not apply (08-4 §30.10) | NEEDS_YOU (waits for a typed answer) | foo line (not a C16 card), copies in §12.28.6 | none (the answer is typed; Art. 2's one-button rule is met by the composer) | only if the job waits > 5 min and the window is not focused |

### 12.28.8 Settings keys read
`permissions.actions.pay`, `permissions.actions.calendar`, `permissions.apps.calendar`, `connections.google.calendarOn`, `money.purchaseCapPaise`, `money.bigPaymentPaise`, `money.upiId`, `money.defaultMethod`, `ai.primary`, `ai.backup`. None written.

### 12.28.9 Test ids
Bill card ids are E's (`card-bill`, `card-bill-pay-now`, `card-bill-remind`, `card-bill-already-paid`). Calendar approval: `card-approval` with `data-card-type="approval"`, buttons `card-approval-approve`, `card-approval-not-now` (08-0 §C). File-in card: §12.29.6. Photo check: `thread-papers-covered` (the marker `thread-marker` with `data-state="papers_covered"`); photo notice `card-choice` with `data-purpose="photo_notice"`.

### 12.28.10 Stored
Attachment files at `{DATA}\data\inbox\{attachmentId}-{safeName}` (08-1 §3) and `files` rows `kind='received'` (DB-16); the user message's `attachments` JSON; `ai_turns` (`purpose='read_attachment'`); the Bill card payload = `BillPayload` (08-5 §4.1; `sourceAttachmentId` is a field of it, X-115); approvals per 08-2 §9. The `PaperRead` itself is kept only in the job folder `jobs\{id}\plan.md` (redacted). No memory facts.

### 12.28.11 Notifications
None of its own. Bill, Payment and Approval cards notify per 09 §9.9 (Review / Not now, X-02).

---

## §12.29 J29 · Send to foo from Windows (R30)

### 12.29.1 Trigger
- **A · Explorer:** right-click one or more files → Send to → foo.
- **B · Taskbar:** drag files over foo's taskbar button; after Windows' hover delay foo's window comes to the front (Windows behaviour, no code); the user drops on the open chat, which is the composer drop of 04 §22.6. Dropping directly on the taskbar button does nothing (Windows does not deliver drops to taskbar buttons); no copy is shown for it.
- **C · Window:** files dropped on an open chat = 04 §22.6 (chips in the pill; the user sends). A sent message with attachments and no text gets the file-in card (§12.29.4) in that chat.

### 12.29.2 Install and launch contract (group C adds to 09)
- **Shortcut:** the installer creates `%APPDATA%\Microsoft\Windows\SendTo\foo.lnk`, target `%LOCALAPPDATA%\Programs\foo\foo.exe`, arguments `--send-to`, icon `foo.exe,0`, display name "foo". Windows appends each selected path as a further argument. Update keeps it; uninstall (09 §9.23.3) removes it. If the user deletes it, foo does not recreate it until the next install or update.
- **Argv:** `foo.exe --send-to "<path1>" "<path2>" …`. Main parses argv on first launch (`process.argv`) and in `second-instance` (09 §9.5): every argument after `--send-to` that is an absolute path is a candidate file. `--send-to` together with `--hidden` (start at login) never happens; if it does, `--send-to` wins and the window shows.
- **Activation:** this is user-initiated activation (09 §9.5 Focus rule): restore/show/focus the window, then navigate to foo's own chat (`navigate { view: { kind: 'chat', chatId: <foo chat> } }`, X-68). An open page closes (back stack push); an open dialog is cancelled as if Esc was pressed (every 06-3 §14 dialog's Cancel is safe). foo's chat is `chats.kind='foo' AND private=0` (§12.30); never the private chat.
- **Setup not finished** (`settings.setup.complete = false`): the window shows the setup step it is on; files are ignored; one notification (09 §9.9, kind `error`) "Finish setting up foo, then send the file again." (`notifications.send_to.setup_not_done`).

### 12.29.3 Steps
1. **Check each path** with the 04 §22.6 limits: at most 6 files (7+ → the first 6, in argv order); 25 MB each; allowed and blocked types as the 04 table; a folder is refused; a path that cannot be opened is unreadable.
2. **Copy** each accepted file to `{DATA}\data\inbox\{attachmentId}-{safeName}` (same path as `files:stage`, 08-1) and add `files` rows `kind='received'`.
3. **Post the user's bubble** in foo's chat: `messages.kind='text'`, `text=''`, `attachments` = the accepted files, `author_kind='user'`. It renders as 04 §10.1/§10.2 (image grid / file chips). Badge 👀 (`seen`) at once; it stays 👀 until an option is tapped (nothing is working yet, Art. 12).
4. **foo replies** with one line "Got **{Electricity-Sep.pdf}**." (`thread.send_to.got_one`; two or more files: "Got {3} files." `thread.send_to.got_many`) and the file-in Choice card (§12.29.4). Rejected files are named in one more line (Branches). The composer draft in foo's chat is untouched.
5. **Nothing starts until an option is tapped or typed** (Art. 3; Choice answers by typing count, Art. 6, 05 §5.3.4). The answer starts the matching job: J28 with that intent, or the "Just keep it" path.

### 12.29.4 File-in Choice card (`choice`, `purpose: 'file_in'`)
A Choice card (05 §5.3) with these differences, all because foo has not read the file yet: no "Best fit" tag and no accent row (all rows look like option 2); no Skip link; no reminder toast and no auto-pick; the card is not part of a job until answered (`cards.job_id` NULL; the answer creates the job). Typed answers and 1️⃣–4️⃣ reactions answer it as any Choice card.

| File set | Question (copy key) | Options in order (copy keys) |
|---|---|---|
| Only images and/or PDFs | "What should I do with {it}?" (`cards.choice.file_in.question`, `{it}` = "it" / "them") | "Pay this bill" (`cards.choice.file_in.option.pay`) · "Remind me before it's due" (`.option.remind`) · "Add it to my calendar" (`.option.calendar`) · "Just keep it" (`.option.keep`) |
| Any other allowed document | same | "Tell me what's in it" (`.option.read`) · "Just keep it" (`.option.keep`) |
| Last row (always) | — | "Something else…" (05 §5.3.2; focuses the composer with placeholder "Tell me what you want instead") |

| Answer | What happens |
|---|---|
| Pay this bill | J28 with intent bill_pay (§12.28.3) |
| Remind me before it's due | J28 with intent bill_remind |
| Add it to my calendar | J28 with intent calendar_add |
| Tell me what's in it | a normal `intake` turn with the attachments (purpose `intake`, kind `reply`, ≤ 6 lines; the 08-4 §26.13 answer guard runs on the `<say>`), answered in one plain bubble; `read_attachment` and `PaperRead` are used only for the bill, ticket and calendar paths (X-126) |
| Just keep it | foo reacts 👍 on the user's bubble (Art. 23), no message; the file stays in the chat and in Ctrl+K Files; badge ✅ |
| Something else… / typed text | normal intake with the attachments |
| No answer in 24 h | card `expired`, summary "{question} → no answer" `--fg-2` (05 §5.3.2 "Cancelled" look) with **no** foo message; badge stays 👀 |

States: `asking, answered, expired, superseded, withdrawn` (subset of 08-0 §G.2 choice states; `auto_picked` and `skipped` never occur).

### 12.29.5 Branches

| Case | What happens | Copy key | Exact copy |
|---|---|---|---|
| Every file over 25 MB | no bubble; foo line only | `errors.file_too_big.body` | "That file is too big. I can take up to 25 MB." (08-3 §21.2 `FILE_TOO_BIG`) |
| Some files over 25 MB | bubble with the rest; extra foo line | `thread.send_to.some_too_big` | "{Scan-2.pdf} is over 25 MB, so I left it out." |
| 7 or more files | first 6 kept | `thread.send_to.over_six` | "I can take up to 6 files at a time. I added the first 6." |
| Program file | refused | `thread.send_to.program` | "{agentName} doesn't open programs. Send a photo or document instead." (04 §22.6) |
| Zipped folder | refused | `thread.send_to.zip` | "I can't open zipped folders. Unzip it and send the files inside." (04 §22.6) |
| A folder | refused | `thread.send_to.folder` | "I can't take folders. Send the files inside instead." |
| Unreadable path (moved, locked, offline OneDrive file) | refused | `thread.send_to.unreadable` | "I couldn't read {file name}. Try saving it again." (04 §22.6) |
| Nothing accepted | no bubble; only the matching foo lines | — | — |
| foo was not running | launched by the shortcut, then the same steps after the chat list is usable (Art. 28 cold start) | — | — |
| AI not set up or unreachable | bubble and card post normally (no AI needed); a tapped option that needs the AI raises the normal 08-3 §21.2 error | — | — |
| Offline | same as above; "Just keep it" works offline | — | — |
| Quiet hours | no effect (user-initiated) | — | — |

### 12.29.6 Test ids
`card-choice` with `data-card-type="choice"` and `data-purpose="file_in"`; option rows per the Choice card's ids with `data-index`; the user's bubble `bubble-me` with its attachment chips per 04. Main-process test hook: `test:sendTo { paths: string[] }` (08-3 §22.8 test channel family) simulates the argv path.

### 12.29.7 Settings keys
Read: `setup.complete`, `identity.agentName`. None written. No setting turns the Send to entry off in v1.

### 12.29.8 Stored
Inbox copies, `files` rows (`kind='received'`), the user message, foo's line, the `choice` card row (`payload.purpose = 'file_in'`, `payload.attachmentIds`). Nothing in `activity` (receiving a file is not a world change).

### 12.29.9 Notifications
None (the user is looking at foo).

---

## §12.30 J30 · Private chat (R31)

### 12.30.1 What it is
A second, temporary chat with foo where nothing is remembered and which is deleted when the user ends it. At most one private chat exists at a time. It is a `chats` row with `kind='foo'` and `private=1`. Helpers, groups and WhatsApp mirrors have no private mode in v1.

### 12.30.2 Trigger
- **Start:** foo's chat header gains an icon toggle "Private chat" (§12.30.4). Tapping it creates the private chat (or opens the existing one) and moves to it.
- **End:** in the private chat, the same toggle (shown pressed) or chat options "End private chat…" → confirm C-23 (§12.30.5) → the chat is deleted.

### 12.30.3 Steps
1. Tap "Private chat" in foo's chat header → main creates the chat (`chats.kind='foo'`, `private=1`, `title` = "Private chat", face = foo's living face) and opens it. The left shell shows its row directly under foo's chat row, with the private mark.
2. The chat opens with a system line (`messages.kind='marker'`, `marker_kind='start_of_chat'`): "This chat is private. I won't remember anything from it, and it's deleted when you end it. Anything I send, pay, book or delete is still listed in your activity log." (`thread.private_chat.start`).
3. The user talks to foo as usual. Jobs, Choice, Approval, Payment, Draft, Secret and sign-in cards work exactly as in foo's chat (Art. 5–8 unchanged).
4. The user ends it (§12.30.5). On confirm: running jobs in it stop (`stop_reason='chat_deleted'`, 08-0 §B.2), open cards become WITHDRAWN / `withdrawn`, the chat is deleted (soft delete, then purge in the same transaction, 08-0 §G.5), its toasts are cleared from Action Center (09 §9.9.5), and one activity row is written (§12.30.7). foo's chat opens.

### 12.30.4 Header and row

| Element | Spec | Copy key · copy | Test id |
|---|---|---|---|
| Header toggle | icon button `EyeOff` 20 in `--icon-btn` 36 (03 §3.6.2.2 style), placed left of Find; shown only in foo's chat (off) and the private chat (on: filled icon, `aria-pressed="true"`). Disabled while an approval in the private chat is RUNNING or CHECKING (tooltip below) | `chat_header.private_toggle.tooltip.off` "Start a private chat" · `.tooltip.on` "End private chat" · `.tooltip.busy` "You can end this chat after the payment finishes." | `chat-header-private-toggle` (`data-state` `off` / `on` / `busy`) |
| Header title | "Private chat" with `EyeOff` 16 `--fg-2` before it | `chat_header.private.title` "Private chat" | `chat-header-private-mark` |
| Header status line (idle, row 12 of 03 §3.6.2.1 replaced) | `--fg-2` | `chat_header.private.status_idle` "Nothing here is remembered" | — |
| Chat options menu | adds "End private chat…" above "Clear messages…"; "Clear messages…" is hidden in the private chat | `chat_header.menu.end_private` "End private chat…" | `chat-header-menu-end-private` |
| Left-shell row | title "Private chat", `EyeOff` 16 `--fg-2` before the title (the private mark is `EyeOff` 16 until Vikas answers, 02-OWNER-LIST item 1); never pinned, never archived; last line and time as any row | same title key | `chatlist-row` (`data-chat-id`) + `chatlist-private-mark` |

Narrator: header "Private chat. Nothing here is remembered."; toggle "Private chat, off" / "Private chat, on". Keyboard: the toggle is a normal Tab stop in the header; no shortcut in v1.

### 12.30.5 Confirm C-23 (06-3 §14 catalogue)

| Id | Trigger | Title | Body | Buttons (destructive first) | After |
|---|---|---|---|---|---|
| C-23 | Private chat header toggle (on) or "End private chat…" | "End this private chat?" (`dialog.c_23.title`) | "Its messages, cards and files are deleted from your PC. Anything I sent, paid, booked or deleted stays in your activity log. This can't be undone." (`dialog.c_23.body`) + if a job runs here: "The job that's running here will be stopped." (`dialog.c_23.body_job`) | [ End and delete ] (`dialog.c_23.button.confirm`) [ Cancel ] | foo's chat opens; no undo |
Test id `dialog-c-23` (08-0 §C family).

### 12.30.6 What is and isn't kept (engine `chat/privateChat.ts`)

| Thing | In a private chat | Rule owner |
|---|---|---|
| Reading memory | allowed (1:1 chat; private facts may be used, Art. 14 is about groups); "Used: {fact} ✕" chips work | 08-3 §12.5 |
| Saving memory | **never**: post-turn review (08-3 §12.4) does not run; intake "remember …" answers "This is a private chat, so I won't remember that. Tell me in my main chat if you want me to." (`thread.private_chat.no_remember`); no memory chips, no `memory_confirm` | C adds to 08-3 §12.1 "Never saved" |
| Helper notes | never written from a private-chat job | 08-3 §12.1 |
| Routines | not created from a private chat: "Routines need a normal chat. Ask me in {agentName}'s chat." (`thread.private_chat.no_routine`) | 08-3 §13 |
| Suggestions and habit offers | jobs here never count toward habit detection; no `routine_offer` or helper offer is posted here | 08-0 §G.13 |
| Morning brief | never mentions anything from a private chat | 08-3 §14 |
| Search (Ctrl+K) and `messages_fts` | private-chat messages are not indexed and never appear in search | A (08-1 FTS trigger skips `private=1` chats), E (06-3 §12) |
| Notifications | every kind (reply, approval, done, choice, stuck, routine) shows only "{chat title} · New message" (`notifications.private.body`, X-132); approval and payment toasts keep [ Review ] [ Not now ] (X-02) | 09 §9.9 |
| AI spend | costs count toward the AI cap as usual; after the chat ends its `ai_turns` rows keep their cost with `chat_id` set NULL, shown in Spend "by chat" as "Private chats" (`screen.spend.row.private_chats`) | E (06-3 §10), A |
| Job screenshots | deleted with the chat, except files referenced by an `activity.proof_ref`, which stay as proof | A (purge rule) |
| Export (Settings → Privacy) | while the chat exists it is exported like any chat; after it ends nothing remains to export except activity rows | 08-3 §19.4 |
| Tech log | carries no message text (it never does; Redactor) | 08-3 §19 |

### 12.30.7 Activity log (owner Q2 default (a); closes GAPS line 43)
- Rows with `kind` sent, paid, booked or deleted that come from a private chat are written as usual (amount, `approved_how`, proof) with `chat_title = 'a private chat'` and **no payee, recipient or message text** (06-3 §9.4 wins, X-132): the `summary` is the 06-3 §9.4 private-chat event phrase with names and text removed, and `fields` carries no text taken from the chat. Line 2 on the Activity page reads "a private chat · {approved by you}" (`activity.row.private_chat_label` "a private chat").
- Rows of other kinds (connected, stopped, changed) caused from a private chat are also labelled "a private chat" the same way.
- Ending the chat writes one row: `kind='deleted'`, `event='deleted_chats'`, `actor='user'`, `summary` "Ended a private chat" (`activity.row.ended_private_chat`), `chat_title='a private chat'`, `outcome='done'`. This is the "a private chat happened" record (PRD R31).
- Activity rows survive the chat's deletion (08-0 §G.5).

### 12.30.8 Branches

| Case | What happens | Copy key | Exact copy |
|---|---|---|---|
| Private chat already exists | the toggle in foo's chat opens it | — | — |
| End while a job is WORKING/WAITING/NEEDS YOU | C-23 shows `body_job`; confirm stops it (`chat_deleted`) and the stop report goes to foo's chat as one line | `thread.private_chat.ended_job_stopped` | "I stopped the job that was running in the private chat. Nothing more will happen from it." |
| End while a payment is RUNNING or CHECKING | toggle and menu item disabled with the busy tooltip | `chat_header.private_toggle.tooltip.busy` | "You can end this chat after the payment finishes." |
| foo quits or the PC restarts | the private chat stays until the user ends it | — | — |
| Send to foo while the private chat is open | files go to foo's main chat (§12.29.2) | — | — |
| Catch me up asked here | card posted here (it is a 1:1 chat); no memory used (§12.27.2) | — | — |
| "Remember …" typed | refused (§12.30.6) | `thread.private_chat.no_remember` | "This is a private chat, so I won't remember that. Tell me in my main chat if you want me to." |
| Routine asked | refused | `thread.private_chat.no_routine` | "Routines need a normal chat. Ask me in {agentName}'s chat." |
| Delete everything (C-16) | the private chat goes with everything else | — | — |

### 12.30.9 Settings keys
None read or written specially. `privacy.rememberOn` and `privacy.learnFromChats` are not changed; the private chat ignores them because nothing is saved there at all.

### 12.30.10 Stored
`chats` row (`private=1`) and its messages, cards, jobs and files until the chat ends; then only `activity` rows (§12.30.7), `ai_turns` cost rows (chat_id NULL) and proof files referenced by activity.

---

## §12.31 Acceptance tests AT-230…AT-266 (group F copies them into 10)

Format as 10-acceptance-1 §B (Area · Given/When/Then · Articles · Priority). Clock pinned to Fri 16 Oct 2026, 9:00 AM IST. Copy in quotes is checked exactly.

| ID | Area | Test | Art. | Pri |
|---|---|---|---|---|
| AT-230 | J27 Catch me up | **Given** a linked WhatsApp group "Family group" with 40 messages since Thu 15 Oct, 9:00 PM, **when** the user types "catch me up on Family group", **then** one `catch_up` card appears titled "Family group · since Thu 15 Oct, 9:00 PM" with ≤ 6 lines, footer "I only read; nothing was sent.", and the user's bubble ends ✅. | 3, 16, 22 | P1 |
| AT-231 | J27 read-only | **Given** AT-230, **then** no WhatsApp or Gmail send, mark-read, delete or label call is made (fake connector records none) and no `activity` row is written. | 3, 15 | P1 |
| AT-232 | J27 privacy | **Given** private memory facts exist, **when** a catch-up runs, **then** the recorded `TurnRequest` (`turns.jsonl`) contains no memory fact text and no secret canary, and its purpose is `catch_up`. | 8, 14 | P1 |
| AT-233 | J27 in a group | **Given** the user asks "catch me up on Family group" in a foo group chat, **then** the card is posted in foo's 1:1 chat and the group gets "I put your catch-up in our chat." | 14 | P1 |
| AT-234 | J27 reply | **When** "Draft a reply" is tapped, **then** a Draft card appears and nothing is sent until its Send (and, for the group, the Approval card) is tapped; the button shows "Draft a reply ✓" and is disabled. | 4, 5 | P1 |
| AT-235 | J27 calendar | **Given** `permissions.actions.calendar='ask'`, **when** "Add Sun dinner to calendar" is tapped, **then** an Approval card "Add Sun dinner to your calendar?" appears and no calendar event exists until "Add to calendar" is tapped. | 5 | P1 |
| AT-236 | J27 nothing new | **Given** no messages since the last catch-up, **then** no card; foo says "Nothing new in Family group since {time of last catch-up}." | 21 | P1 |
| AT-237 | J27 window | **Given** a last catch-up for the same source at Thu 15 Oct, 9:00 PM, **then** the next card's title uses that time; **given** "since last Monday" and only 7 days of messages, **then** the line "I only keep 7 days of WhatsApp messages, so this starts Fri 9 Oct, 9:00 AM." appears. | 21 | P1 |
| AT-238 | J27 not linked / hidden | **Given** WhatsApp unlinked, **then** "To catch you up on WhatsApp, link it first." + Connect card; **given** the jid is in `hiddenJids`, **then** "You hid Family group from me, so I don't read it. [ Open Settings ]". | 2, 15 | P1 |
| AT-239 | J27 validation | **Given** the fake AI returns a "For you" line citing a message that does not mention the user, and a line with a card-number pattern, **then** both are dropped from the card. | 8, 12 | P1 |
| AT-240 | J28 bill photo | **Given** a vision-capable AI and a photo of an Airtel bill (₹1,179, due Fri 23 Oct), **when** sent with no text and "Pay this bill" is chosen, **then** a Bill card shows "₹1,179 due Fri 23 Oct" with "From your photo, Fri 16 Oct", then the live-amount check, then a Payment card; nothing is paid until Approve is tapped. | 3, 5, 7 | P1 |
| AT-241 | J28 paper amount differs | **Given** the photo says ₹1,179 and the biller site says ₹1,279, **then** the Payment card shows ₹1,279 and the line "Your photo says ₹1,179; Airtel's site now says ₹1,279. I'm using the site's amount." | 7 | P1 |
| AT-242 | J28 no vision | **Given** a provider with `vision=false` that is not a command-line AI (a command-line AI reads the words first, X-142, AT-275), **when** a bill photo is sent with "pay this", **then** no AI read turn is made, foo says "Your AI can't read pictures. Can you type the amount and due date?", the badge is ⏳, and typing "₹1,179, 23 Oct" produces the Bill card. | 2, 16 | P1 |
| AT-243 | J28 PDF pages (X-109) | **Given** a provider with `vision=false` and a bill PDF whose pages are scanned, **then** no AI read turn is made and foo says "Your AI can't read scanned pages. Can you type the amount and due date?"; **given** the same provider and a PDF made only of text pages, **then** the read runs on the Redactor-scrubbed page text with no `AI_NO_VISION`; in both cases no `application/pdf` part is ever sent to the AI. | 2, 8 | P1 |
| AT-244 | J28 ticket | **Given** a train e-ticket PDF with PNR 1234567890 for Sat 17 Oct, 4:30 PM, **when** "Add it to my calendar" is chosen with calendar = ask, **then** the Approval card "Add {title} to your calendar?" appears; after "Add to calendar" the event exists with a calendar proof chip and the PNR watch is offered once (`routine_offer:pnr_watch:1234567890`). | 5, 11, 20 | P1 |
| AT-245 | J28 calendar always | **Given** calendar = always, **then** the event is added without a card and foo says "Added to your calendar: {title}, Sat 17 Oct, 4:30 PM. [ Undo ]"; Undo within 5 s removes the event. | 5, 21 | P1 |
| AT-246 | J28 missing field | **Given** the read has no due date, **then** foo asks "I couldn't read the due date on this. What is it?" before any Bill card; an unparseable reply gets "Sorry, I didn't get that. What's the due date?" once, then "Okay, I've left it. Send it again when you have the details." and the job ends ❌. | 2, 30 | P1 |
| AT-247 | J28 secret in picture | **Given** the fake AI's read contains a Luhn-valid 16-digit number, **then** the read is discarded, nothing from it is stored in the DB, memory or card payloads, and foo says "This seems to show a card number or a code, so I stopped reading it. Nothing was saved." | 8 | P0 |
| AT-248 | J28 no memory | **Given** any paper read, **then** no memory file changes and no memory chip appears. | 15 | P1 |
| AT-249 | J29 Explorer | **Given** foo is running, **when** `foo.exe --send-to "C:\…\Electricity-Sep.pdf"` starts, **then** the existing window comes to the front on foo's chat, the user bubble shows the file chip with 👀, foo says "Got **Electricity-Sep.pdf**." and a Choice card "What should I do with it?" offers "Pay this bill", "Remind me before it's due", "Add it to my calendar", "Just keep it", "Something else…" with no "Best fit" tag and no Skip. | 3, 27 | P1 |
| AT-250 | J29 nothing starts | **Given** AT-249, **then** no job, AI turn or tool call exists until an option is tapped or typed; after 24 h with no answer the card is `expired` with no foo message. | 3, 19 | P1 |
| AT-251 | J29 cold start | **Given** foo is not running, **when** launched with `--send-to`, **then** the same result as AT-249 appears and the chat list is usable in < 2.0 s (Art. 28 rig). | 27, 28 | P1 |
| AT-252 | J29 limits | **Given** files of 30 MB and 2 MB, **then** the bubble holds only the 2 MB file and foo says "{name} is over 25 MB, so I left it out."; **given** only the 30 MB file, **then** no bubble and "That file is too big. I can take up to 25 MB."; **given** an .exe, a .zip and a folder, **then** the 04 §22.6 copies and "I can't take folders. Send the files inside instead." | 2, 8 | P1 |
| AT-253 | J29 keep | **When** "Just keep it" is tapped, **then** foo reacts 👍 on the bubble, posts no message, the badge is ✅ and the file is found in Ctrl+K Files. | 23 | P1 |
| AT-254 | J29 setup not done | **Given** setup is not complete, **when** `--send-to` runs, **then** no message is created and the notification "Finish setting up foo, then send the file again." is recorded. | 2 | P1 |
| AT-255 | J29 install | **Given** a fresh install, **then** `%APPDATA%\Microsoft\Windows\SendTo\foo.lnk` exists with arguments `--send-to`; **given** uninstall, **then** it is gone. | 27 | P1 |
| AT-256 | J30 start | **When** the "Private chat" toggle in foo's chat header is tapped, **then** a chat titled "Private chat" with the private mark opens under foo's row with the start line "This chat is private. I won't remember anything from it, and it's deleted when you end it. Anything I send, pay, book or delete is still listed in your activity log."; tapping the toggle again in foo's chat opens the same chat (never a second one). | 15 | P1 |
| AT-257 | J30 no memory | **Given** the private chat, **when** the user says "I'm allergic to peanuts" and "remember that I love jazz", **then** no memory file changes, no chip shows, no post-turn review turn is recorded, and foo answers "This is a private chat, so I won't remember that. Tell me in my main chat if you want me to." | 15 | P0 |
| AT-258 | J30 cards unchanged | **Given** a payment job in the private chat, **then** the Payment card, Windows Hello threshold, second look and proof behave exactly as in foo's chat (AT-110…AT-133 rerun in a private chat). | 5, 6, 7, 10, 11 | P0 |
| AT-259 | J30 end | **When** the user confirms C-23 "End this private chat?" → "End and delete", **then** the chat, its messages, cards, jobs and non-proof files are gone from the DB and disk, a running job stops with `stop_reason='chat_deleted'`, and foo's chat opens. | 15 | P0 |
| AT-260 | J30 activity | **Given** a payment of ₹1,179 to Airtel and a sent email were made in a private chat that was then ended, **then** the Activity log still lists "Paid ₹1,179 to Airtel" and "Sent an email to {name}" with proof and line 2 "a private chat · …", contains no email subject or message text from the chat, and has one row "Ended a private chat". | 11, 13, 15 | P0 |
| AT-261 | J30 search, brief, notifications | **Given** a private chat with the word "zebra", **then** Ctrl+K finds nothing, the next brief does not mention it, and a reply toast from it reads title "Private chat", body "Open foo to see it." | 15 | P1 |
| AT-262 | J30 busy | **Given** a payment in CHECKING in the private chat, **then** the toggle and "End private chat…" are disabled with "You can end this chat after the payment finishes." | 7 | P1 |
| AT-263 | J28 photo check | **Given** a photo of a card with a 16-digit Luhn-valid number and "CVV 123", **then** the PNG sent to the AI has both blacked out, `thread.papers.covered` reads "I covered 2 numbers…", and the original in the chat is unchanged. | 8 | P0 |
| AT-264 | J28 photo check | **Given** a bill photo with "Consumer No 1234567890" and an Aadhaar number (Verhoeff-valid), **then** only the Aadhaar number is blacked out. | 8 | P0 |
| AT-265 | J28 no OCR | **Given** OCR is unavailable and `privacy.photoCheckNoticeShown=false`, **when** a photo is sent, **then** the `photo_notice` Choice shows; Not now → nothing is sent and "Okay, I didn't send it."; Send it → sent, and the next photo shows no notice. | 8 | P0 |
| AT-266 | J28 PDF pages | **Given** a 14-page PDF with 3 scanned pages, **then** only the first 10 pages are prepared, text pages go as scrubbed text, scanned pages as blacked-out PNGs, no `application/pdf` part is sent, and "I read the first 10 pages." shows. | 8 | P1 |
