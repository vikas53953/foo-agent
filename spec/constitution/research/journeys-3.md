# foo v1: end-to-end user journeys (part 3 of 4)

Journeys 14 to 18. Read `journeys-1.md` first: it defines the global rules (G1–G17), shared components (C1–C17), the storage map and the job and approval state machines. Source keys map to files in `/mnt/project-files/personal-agent-re/` as listed in `journeys-1.md` §0.

---

## J14. Creating, editing and pausing a routine

**Triggers:**
- A. Asked in plain words: "tell me when BTC drops below ₹55 lakh", "every Friday list bills due next week", "remind me Sunday night to plan my week".
- B. Offered after a repeat (J11 habit offer).
- C. Suggested: Routines screen → "foo suggests" (Gemini suggested schedules, GEM §9.7), at most 3 shown, each dismissible forever.

A routine is a saved check with: **what** to check, **how often** (with time zone), **tells you only if…**, **where** results go, and **approval boundary** (routines never send, buy, book, post or delete by themselves; they end in a card) (ChatGPT schedule fields, GPT §2, §9.7; Grok routine confirmation, GRK §4.5).

### Steps (create by asking)
1. User: "tell me when BTC drops below ₹55 lakh".
2. If anything is missing, one Choice card per item (J8). Here: "How often should I check?" [ ★ Every 30 min ] [ Every hour ] [ Once a day at 9:00 AM ].
3. **Run once now** before saving (Manus "run once before you schedule", MNS §9.15): foo checks right away and shows: "Right now BTC is ₹57.2 lakh, above your line. Here's what the routine will do:"
4. Routine card (C13):
   ```
   ⏰ Routine created
   Checks       Bitcoin price in rupees (CoinDCX)
   How often    Every 30 min, 7:00 AM to 10:00 PM (your time, IST)
   Tells you    only if it's below ₹55 lakh
   Where        Money chat + toast
   Next run     Thu 16 Oct, 10:15 AM
   Uses about   ₹30 of your AI a month
   [ Run once now ]  [ Edit ]  [ Pause ]
   ```
   - Owner chat: the helper whose job fits (Money); otherwise foo.
   - "Uses about" shown for key-based AI; plan-based shows "about 2% of your Claude plan a month" (OpenClaw cost per routine, OCL §9.8; Tab cost and history, TAB §9.15).
   - Checks run in the active hours of the routine (default 7:00 AM to 10:00 PM, inside quiet-hours rules) and with a light, cheap AI request (OpenClaw heartbeat cost lesson, OCL §8.1).
5. Each run: if the condition is false → **silence** (no message, no toast; run history logs "nothing to tell") (OpenClaw NO_REPLY, OCL §3.3; Hermes [SILENT], HRM §9.9). If true → message in the owner chat: "BTC just dropped to ₹54.8 lakh (below your ₹55 lakh line). Checked 10:45 AM on CoinDCX." Footer: "Why am I getting this? Your BTC routine." After firing, it keeps running but won't repeat the same alert until the price goes back above the line `[foo decision]`.

### Steps (edit)
1. Edit on the card, or Routines screen (left sidebar footer → "Routines", or Ctrl+R) → tap a routine. Detail view:
   ```
   BTC below ₹55 lakh                         [ On ●]
   Checks / How often / Tells you / Where     (each row tappable)
   Next run Thu 16 Oct, 10:15 AM
   Last 20 runs:  ✓ 9:45 nothing to tell · ✓ 9:15 nothing to tell · ✗ 8:45 couldn't open CoinDCX [ Fix ]
   [ Run once now ]  [ Delete ]
   ```
   (Grok routine detail and history, GRK §4.5; Manus history with errors, MNS §9.6.)
2. Each row opens an inline editor (time picker, frequency chips, condition text). Or say it in chat: "make the BTC check hourly" → foo updates and posts the changed Routine card with the changed line highlighted: "How often: Every hour (was every 30 min)".
3. Save → "Updated. Next run Thu 16 Oct, 11:00 AM."

### Steps (pause / resume / delete)
- Pause (card, detail toggle, or "pause the BTC alert") → "Paused. I won't check BTC until you turn it back on." The routine row shows "Paused". Resume → "On again. Next run {time}."
- Delete → confirm: "Delete the BTC routine? Its history goes too. This can't be undone." [ Delete ] [ Keep it ] (Grok no undo on delete, GRK §4.5).
- Stop all routines: Routines screen → "Pause all" → "Paused 4 routines. Turn them back on one by one or with Resume all."

### Branches
| Case | What happens | Exact copy |
|---|---|---|
| Routine asks to send/buy/pay ("every month pay Airtel") | Saved as remind-and-prepare only | "I'll get it ready each month and ask you before paying. I never pay on my own." |
| Same routine already exists | Shown instead of a duplicate (OpenClaw duplicate check, OCL §9.9) | "You already have this: 'BTC below ₹55 lakh'. Change it instead?" [ Change it ] [ Make another anyway ] |
| Time zone unclear (user mentions another city) | Choice card | "Which time do you mean?" [ ★ India (IST) ] [ London time ] |
| Run fails (site down, sign-in expired) | Failure message in owner chat, once per kind | "Your BTC check couldn't open CoinDCX at 8:45 AM. I'll try again at 9:15." After 3 failures in a row: "Your BTC check has failed 3 times. [ Fix ] [ Pause it ]" (Manus failure notification, MNS §9.6) |
| PC asleep at run time | Skipped runs are not replayed one by one; one catch-up run on wake | Only if the catch-up finds something: "While your PC was asleep (2:00–6:10 AM) I missed 8 checks. Checked now: BTC is ₹54.6 lakh, below your line." (Tab gap report, TAB §9.7) |
| User away 7+ days (no app open) | Routines pause; notice on return | "I paused 3 routines while you were away (since Mon 6 Oct). Turn them back on?" [ Resume all ] [ Choose ] (Grok paused-while-away notice, GRK §2 row 23) |
| Routine never fires anything useful for 30 days | Review card once (Poke review stale automations, POK §9.9) | "Your 'Weekly deals' routine hasn't found anything in 4 weeks. Keep it?" [ Keep ] [ Pause ] [ Delete ] |
| Spend cap reached | All AI routines pause until cap raised or next month | "I paused your routines because you've reached this month's AI cap (₹1,000). [ Raise cap ]" |
| Over 25 routines | Blocked `[foo decision]` | "That's 25 routines, the most I can look after. Delete one to add this." |
| Interval under 15 min | Not offered `[foo decision; Grok min 5 min, GRK §4.5]` | "The fastest I check is every 15 minutes." |
| Routine created by a helper's suggestion and dismissed | Never offered again (G15) | — |

### Stored
- `routines\{id}.json`: owner, what, schedule + time zone, active hours, condition text, where, last 20 runs (time, result, short reason), cost estimate, state (on/paused).
- Activity log: created / edited / paused / deleted.
- Run results that fire are chat messages in the owner chat.

### Notifications
- Fired alert: message + toast (if "Where" includes toast; not in quiet hours unless marked "Urgent" by the user) + unread count. No taskbar badge (nothing waiting).
- 3 failures in a row: toast "{Money} · Your BTC check keeps failing." [ Fix ].
- Silent runs: nothing at all.

### Acceptance criteria
- **Given** "tell me when BTC drops below ₹55 lakh", **then** foo runs one check immediately and posts a Routine card with what, how often, tells-you-only-if, where and next run.
- **Given** 50 runs where the price stays above the line, **then** the user receives no message and no toast.
- **Given** the PC slept through 8 runs, **then** on wake there is at most one catch-up run and at most one message.
- **Given** a routine that would pay a bill, **then** every firing produces a Payment card and never a payment.
- **Given** the user pauses a routine, **then** no run happens until it is resumed, and the routine row shows "Paused".

Sources: Grok routines made by asking, Routine created card, history, paused-while-away (GRK §2, §4.5); ChatGPT "tell me only if" and four schedule fields (GPT §2, §9.7); Manus run once first, failure alerts (MNS §9.6, §9.15); OpenClaw silent heartbeat, cost per routine, promotion with duplicate check (OCL §2.6, §8.1, §9.8, §9.9); Hermes silent monitors and cron sprawl (HRM §4, §8); Poke stale review (POK §9.9); Tab gap report (TAB §9.7); Cowork never fail silently (CWK §9.8).

---

## J15. Creating a helper (Trips, Money) and handing work between helpers

**Concept:** helpers are contacts with a job. foo is the main voice and front door; helpers do focused work and have their own chat, colour, face and notes. All helpers share "What I know about you"; each has its own notes (Grok bots with jobs, GRK2 sidebar; Cue agents by life area, MNS §9.9; Autopilot name + role + goal, APL §9.5).

**Triggers:**
- A. "+ New helper" button at the top of the chat list.
- B. foo offers one after a pattern (3+ trip jobs in 30 days → "Want a Trips helper to look after travel? It keeps your trips in one chat." [ Yes, make Trips ] [ No thanks ]) — once only (G15).
- C. The user says "make me a helper for money stuff".

### Steps (create)
1. "+ New helper" opens a card in the foo chat (not a settings page):
   ```
   New helper
   Name         [ Trips ]                       🎲
   Its job      [ Plan and book my travel ]
   Good result  [ Trips booked on budget, no surprises ]   (optional)
   Face         ( ✈ ) ( 🧳 ) ( 🌴 ) ( 🎲 )   Colour ● ● ● ● ●
   Can use      [✓] Gmail  [✓] Calendar  [ ] WhatsApp  [✓] Browser  [ ] Payments
   [ Create Trips ]   [ Cancel ]
   ```
   - Templates as chips above the form: [ Trips ] [ Money ] [ Home ] [ Family ] fill all fields at once.
   - "Payments" off by default; when ticked: "Trips can ask you to approve payments. It can never pay without your tap."
2. Create → a new contact appears in the chat list with its face and colour; its chat opens with its first message:
   "Hi, I'm Trips. I'll look after your travel. I already see your Goa trip on 12–14 Dec. Anything to sort for it?"
   (Grok/foo: the helper texts first with one useful thing, POK §9.6.)
3. In the foo chat: handoff marker "You made a new helper: Trips".

### Steps (handoff foo → helper)
1. User in foo chat: "find me flights to Delhi Friday".
2. foo routes by the helpers' jobs (routing is written into each helper's job text, as in Grok's Chief of Staff, GRK §4.3). foo chat shows:
   - foo: "Trips will handle this." (one line, no "ok, on it")
   - Handoff marker: "foo asked Trips to find flights to Delhi on Fri 17 Oct"
   - A link card that mirrors the job's status: "✈ Flights to Delhi · in Trips · Working · step 2 of 4" [ Open Trips ]
3. In the Trips chat: the request appears as a quote at the top "From foo: find me flights to Delhi Friday (Vikas, 9:02 AM)", then the job runs there (checklist, choices, approvals all in Trips).
4. When done, Trips posts the result in its chat; foo chat's link card updates to "✓ Done · in Trips" and a marker "Trips is back: booked IndiGo 10:15, ₹5,240".

### Steps (helper → helper)
1. Trips books a hotel; the payment is a Money matter. Trips does **not** pay; it shows the Payment card itself in Trips (the approval belongs where the job is) and, after it's paid, hands the receipt to Money: marker in Trips "Trips told Money about ₹14,600 for Taj Holiday Village"; in Money chat: "Added: ₹14,600 Taj Holiday Village (via Trips) to December spending."
2. Handoffs carry a short note in a fixed shape (Grok handoff template, GRK §4.4): what was done, proof, what's open, who owns it next. Shown to the user only as the marker line; the full note is in Details.
3. Only one helper owns a job at a time (Grok "one owner per stage", GRK §4.2).

### Steps (edit / remove a helper)
- Click helper name in its chat header → profile: face, name, job, good result, colour, Can use (apps), its routines, its notes ("What Trips knows"), Files it made, [ Pause Trips ] [ Delete Trips ] (Manus agent profile, MNS §9.8; Grok Library tab, GRK §5.11).
- Delete → "Delete Trips? Its chat and notes go. Its routines stop. Bookings it made stay booked." [ Delete ] [ Keep ]. Open jobs owned by Trips must be finished or stopped first: "Trips is still working on 1 job. Stop it first?" [ Stop and delete ] [ Cancel ].

### Branches
| Case | What happens | Exact copy |
|---|---|---|
| Name already used (or equals foo's name) | Inline | "You already have a helper called Trips." |
| More than 8 helpers | Blocked `[foo decision]` | "8 helpers is the most for now. Delete one to make another." |
| Request fits two helpers | foo asks with a Choice card | "Who should take this?" [ ★ Trips ] [ Money ] |
| Request fits no helper | foo does it itself | — |
| User messages a helper directly | Helper works directly; foo chat shows nothing | — |
| Helper needs an app it isn't allowed | Asks in its chat | "I need your Calendar to add this trip. Let Trips use Calendar?" [ Allow ] [ Not now ] |
| Helper paused | Messages to it get a line; routines paused | "Trips is paused. [ Turn on ] or ask foo instead." |
| User says "stop" in foo chat while Trips is working | Stops the job foo handed off (J18) and says which | "Stopped Trips' Delhi flight search." |

### Stored
- `helpers\{id}\profile.json` (name, job, good result, face, colour, allowed apps, paused).
- `helpers\{id}\notes.md` (helper's own notes; shared about-you is read-only to helpers but they can propose new facts via Memory chips).
- Handoff notes: `jobs\{id}\handoff.md`. Activity log: helper created/deleted, handoffs.

### Notifications
Each helper's messages notify under the helper's name and face (toast title "Trips"). Badge counts are per chat.

### Acceptance criteria
- **Given** "+ New helper" with the Trips template, **then** a Trips contact appears with its own colour and face and posts a first message that names something real from the user's data, or a plain intro if none.
- **Given** a travel request in the foo chat, **then** the job runs in Trips, and the foo chat shows one line, a handoff marker and a status link card that updates live.
- **Given** a payment arising in a Trips job, **then** the Payment card appears in the Trips chat, and Money receives only a receipt note after payment.
- **Given** Trips is deleted, **then** its routines stop, and bookings it made remain in the calendar and activity log.

Sources: blueprint "Helpers with jobs, as contacts"; Grok bots, Chief of Staff routing, handoff markers, one owner (GRK §2, §4.2–4.4, GRK2); Autopilot name + role + goal (APL §9.5); Manus/Cue agents by life area and profile page (MNS §9.8, §9.9); Poke one voice in front (POK §9.1); Muse side chats (MUS §9.13).

---

## J16. Group chat with a helper

**v1 scope `[foo decision from the blueprint]`:** a group is a chat inside foo with the user plus 2 to 6 helpers (Grok groups, GRK §4.2). A linked **WhatsApp group** (from J4) can be shown read-only inside foo, and foo can draft messages into it for the user to send, but helpers do not post in WhatsApp groups by themselves in v1 (blueprint "Helpers in WhatsApp groups: later").

**Trigger:** "+ New helper" menu → "New group", or the user types "start a group with Trips and Money to plan Goa".

### Steps (create)
1. Card: "New group" · Name [ Goa trip ] · Members: tick 2–6 helpers (foo can be a member too) · [ Create group ].
2. Group appears in the chat list with stacked faces. First line (from the group owner = first ticked helper): "Trips here with Money. Tell us what you need for Goa."

### Steps (working in a group)
1. User: "plan dinner Saturday for the 6 of us and split the cost".
2. One helper takes ownership (the one whose job fits, or `@Trips` if the user mentions it); the group shows: "Trips: I'll find the place. Money will work out the split." and handoff markers "Trips asked Money to work out the split".
3. Results posted in the group are plain text, choices and files only. Example: "Trips: Dinner on Saturday: Barbeque Nation at 8, table for 6?" with a Choice card [ ★ Book it ] [ Another place ] — tapping Book it **moves** the approval to the 1:1 chat.
4. **Private stays private** (Grok approvals/drafts/secrets never in groups, GRK §1.1, §2; Tab money/passwords move to 1:1, TAB §9.9): any Approval card, Payment card, Draft card, Secret box, sign-in request or personal detail (address, phone, card) goes to the owner helper's 1:1 chat. The group shows: "Trips: Payment and Mom's address stay private. I've asked Vikas in his own chat." with [ Open Trips ].
5. Done → group gets the shareable result only: "Trips: Booked. Barbeque Nation, Sat 8:00 PM, table for 6. ✓ #BN-2201". Money posts "Money: ₹1,450 each for 6 people (estimate)."

### Steps (WhatsApp group mirror)
1. In the chat list a linked WhatsApp group (e.g. "Family group") shows with a small WhatsApp mark; its messages appear read-only.
2. User: "tell the family group about Saturday dinner" (in foo or in the mirror) → foo shows a Draft card "To: Family group (WhatsApp) — Dinner Saturday 8 PM at Barbeque Nation, table for 6 🍽" → Send (always a full Approval card for groups: "Will send to Family group (8 people) from your WhatsApp. Can't be unsent.").
3. Sent from the user's own WhatsApp; appears in the mirror as the user's message, labelled small "via foo".

### Branches
| Case | What happens | Exact copy |
|---|---|---|
| Two helpers both answer | Only the owner replies; the other posts at most one line if it has a different part | — |
| Helpers start messaging each other in a loop (> 6 helper messages without a user message) | Group pauses `[foo decision]` | "We're going in circles. Pausing until you reply." |
| User @mentions a helper not in the group | Inline | "Home isn't in this group. [ Add Home ] or ask in Home's chat." |
| Helper wants to share a fact from about-you into the group (e.g. "Vikas is vegetarian on Tuesdays") | Asks in 1:1 first (Instinct asks before sharing, INS2 §C) | In Trips 1:1: "Okay to tell the Goa group you're vegetarian on Tuesdays?" [ Yes ] [ No ] |
| WhatsApp unlinked | Mirror shows a bar | "WhatsApp is unlinked. [ Link again ]" |
| Leave/delete group | Confirm | "Delete the Goa trip group? Helpers keep their own chats." |

### Stored
- Group chat in `foo.db` (members, owner per job). Jobs and approvals in the owner helper's 1:1.
- WhatsApp mirror messages are **not** stored in foo.db beyond 7 days; they're read live from the linked device `[foo decision]`.

### Notifications
Group messages notify with title "Goa trip · Trips". Approvals moved to 1:1 notify from the 1:1 chat.

### Acceptance criteria
- **Given** a group with Trips and Money, **when** a booking needs approval, **then** the group shows only the "stays private" line and the Approval card appears in Trips' 1:1 chat.
- **Given** a group, **then** no Draft, Approval, Payment, Secret box or sign-in card is ever rendered in it.
- **Given** a WhatsApp group mirror, **then** foo cannot send into it without a full Approval card and a tap.
- **Given** 6 helper messages without any user message, **then** the group pauses and says so.

Sources: blueprint "Helpers in group chats, private stays private"; Grok groups 2–6, handoffs, nothing private in groups (GRK §1.1, §2, §4.2); Tab group Tab with private things in DM (TAB §3.3, §9.9); Instinct ask before sharing into a group (INS §2, INS2 §C); Manus/Cue group of agents (MNS §9.9).

---

## J17. Viewing, editing and forgetting memory

**Where memory shows:**
- Side panel "What I know about you" (top 3 most-used facts + "See all").
- Memory page: chat header ⋮ → "What I know about you", or Ctrl+M.
- Inline chips: "🧠 Saved: … · Undo" and "Used: … ✕" (C14).

### Steps (view)
Memory page:
```
🧠 What I know about you                         [ Search ]  [ + Add something ]
Filter: ( All ) ( You said ) ( I guessed ) ( People ) ( From Gmail ) ( From WhatsApp )

About you
  Vegetarian on Tuesdays          You said · 2 Oct            edit · forget
  Prefers window seats            I guessed · from 4 bookings edit · forget
  Hates early flights             You said · 3 Oct            edit · forget
People
  Brother Rohit lives in Pune     You said · 28 Sep           edit · forget
  Mom's birthday 18 Oct           From Gmail · 9 Oct          edit · forget
Helpers' notes   Trips (6) · Money (4) · Home (2)    → opens each helper's notes
Recently learned (this week)   3 new things  · "See what I learned"
[ Forget everything from Gmail ]  [ Open the memory folder ]  [ Forget everything ]
```
- "You said" vs "I guessed" on every row (Tab, TAB §9.10). "I guessed" rows show why ("from 4 bookings").
- "Open the memory folder" opens `%APPDATA%\foo\memory\` in Explorer: plain Markdown files the user can read in Notepad (Instinct/OpenClaw files, INS §5.3, OCL §9.7).

### Steps (save)
1. User: "remember I'm allergic to peanuts" → foo: "Got it." + chip "🧠 Saved: Allergic to peanuts · Undo". Saved as You said.
2. foo infers something (picked window seat 4 times) → saved as I guessed with chip "🧠 I noticed you pick window seats. Saved · Undo".
3. Sensitive categories (health, money amounts, religion, politics, other people's phone/address) are only saved when the user said them directly, never guessed `[foo decision]`.
4. After every chat, a background pass decides what to keep (Hermes post-turn review, HRM §3.1); nightly at 3:00 AM foo tidies duplicates and conflicts (OpenClaw dreaming, OCL §2.4). On Monday's brief, one line: "This week I learned 3 things about you. See them" (OpenClaw DREAMS/Hermes digest, OCL §9.7, HRM §9.13).

### Steps (edit)
Tap "edit" → the row becomes a text field + [ Save ] [ Cancel ]. Saving changes the source to "You said · {today}". Or in chat: "actually I moved to Pune" → foo: "Updated: you live in Pune (was Mumbai)." chip with Undo. Old facts are replaced, not appended (OpenClaw USER.md superseded, OCL §9.7).

### Steps (forget)
- One fact: "forget" → row disappears with a 5 s bar "Forgot 'Prefers window seats' · Undo".
- From a reply: "Used: you're vegetarian ✕" → ✕ → "Forgot it. I won't use that again." (Perplexity, PPX §9.6).
- By source: "Forget everything from Gmail" → confirm "Forget 23 things I learned from your Gmail? Gmail stays connected; I just forget what I learned." [ Forget 23 things ] [ Cancel ] (ChatGPT per-source forget, GPT §9.13).
- All: "Forget everything" → typed confirm: "This deletes everything I know about you, including helpers' notes. Your chats stay. Type FORGET to confirm." [ Forget everything ] (enabled only after typing).
- In chat: "forget that my brother lives in Pune" → foo finds the fact and shows a mini card: "Forget 'Brother Rohit lives in Pune'?" [ Forget ] [ Keep ].

### Branches
| Case | What happens | Exact copy |
|---|---|---|
| User says "don't remember this" before saying something | Next message not saved; chip | "🔒 Not saving this one." |
| Conflicting facts (Mumbai vs Pune) | Nightly tidy keeps the newest You said and asks once if unsure | "Do you live in Pune now, or Mumbai?" [ Pune ] [ Mumbai ] |
| User asks "what do you know about me?" | Short summary + link | "Here are the 5 things I use most. [ See everything ]" |
| User asks "why did you pick the window seat?" | foo cites the memory | "Because you picked window seats on your last 4 flights (I guessed). [ Forget that ]" |
| Memory folder edited by hand in Notepad | foo re-reads on next message; invalid lines ignored and listed | "I couldn't read 2 lines in about-you.md. [ Show them ]" |
| "Save to memory?" approval mode on (Settings → Privacy → "Ask before remembering") | Each save becomes a card (Hermes write approval, HRM §9.12) | "Remember that you're allergic to peanuts?" [ Remember ] [ Don't ] |
| Undo after Forget | Restores the row exactly | — |

### Stored
- `memory\about-you.md`, `memory\people\*.md`, `memory\preferences\*.md`, `helpers\{id}\notes.md`: each fact line carries source, date, and origin (chat id / email id).
- Forgotten facts are deleted from files; a tombstone line "forgotten {hash} {date}" prevents re-learning the same fact from the same source for 90 days `[foo decision]`.
- Activity log: "forgot 23 facts from Gmail" (no fact text).

### Notifications
None, except the Monday "learned this week" line inside the brief.

### Acceptance criteria
- **Given** any fact, **then** it shows "You said" or "I guessed" (with the reason) and a date.
- **Given** "Forget everything from Gmail", **then** every fact whose origin is Gmail is deleted from disk and Gmail stays connected.
- **Given** a forgotten fact, **then** foo does not use it in any later reply, and does not re-learn it from the same email within 90 days.
- **Given** the user edits about-you.md in Notepad, **then** the next foo reply uses the edited fact.
- **Given** a guessed health or money fact, **then** it is never saved unless the user said it.

Sources: blueprint "Memory you can see and fix"; Tab you-said vs I-concluded (TAB §9.10); OpenClaw files, nightly consolidation, superseding (OCL §2.4, §9.7); Hermes post-turn review, saved chip, write approval (HRM §3.1, §9.12, §9.13); Instinct memory as Markdown (INS §4.4, §5.3); Perplexity memories cited as sources (PPX §9.6); ChatGPT opaque memory complaint and per-source forget (GPT §7, §9.13); Muse forget specific things (MUS §7).

---

## J18. Watching live and stopping a task

**Trigger:** any job that uses foo's browser (bookings, bills, sign-ins). "Watch live" appears on the checklist bubble and in the side panel "Doing now" row.

### Steps (watch)
1. Tap "Watch live" (checklist) or the eye icon in "Doing now". The right side panel switches to a live view:
   ```
   👁 Goa stay · step 3 of 4                          ● LIVE   [ ⤢ ]
   ┌──────────────────────────────────────────────┐
   │   live picture of foo's browser window       │
   │   (password and card fields blurred)          │
   └──────────────────────────────────────────────┘
   Now: Filling guest details on makemytrip.com
   [ Take over ]   [ Stop ]
   ```
   - ⤢ opens the real foo browser window at full size (it is a normal window the user can also find in the taskbar under foo).
   - Watching does not pause the job (Grok, GRK2 Computer view).
2. Closing the live view does not stop anything.

### Steps (take over)
Take over → foo pauses its clicks; the browser window comes to the front with the bottom bar "You're in control. foo is paused." [ Hand back to foo ]. Checklist line: "✋ You took over". Hand back → foo re-reads the page and says "Carrying on from here." (Muse/Manus/ChatGPT take over, MUS §9.8, MNS §9.3, GPT §9.5).

### Steps (stop one job)
Any of these stop the job:
- "Stop" on the checklist bubble or live view.
- Typing "stop" / "stop that" / "cancel" in the chat where the job runs (Tab "Stop means stop", TAB §4).
- Closing foo's browser window for that job (Manus "close the tab to stop", MNS §9.2).
- Right-click the job in "Doing now" → Stop.

What happens:
1. Immediately (< 1 s): all clicks and AI calls for that job halt. Job → CANCELLED. Badge ⛔.
2. foo reports what was and wasn't done, from the activity log, never from memory:
   "Stopped. Nothing was booked or paid." or "Stopped. I'd already sent the email to Rakesh at 9:14 AM, that can't be unsent. Nothing else was done."
3. Open Approval/Payment cards for that job → WITHDRAWN.
4. Stop never undoes completed actions; the message says so plainly (ChatGPT, GPT §5, §9.14).

### Steps (stop everything)
Chat header ⋮ → "Stop everything" (also tray menu, J20). Confirm: "Stop all 3 jobs that are running? Routines keep their schedule." [ Stop all ] [ Cancel ]. Result: "Stopped 3 jobs: Goa stay, Airtel bill, Delhi flights. Nothing was paid. 1 email was already sent earlier." Routines can be paused separately ("Pause all routines" link under the result).

### Steps (replay)
Finished job → "Details" on the collapsed checklist → step list with a thumbnail per step (from `jobs\{id}\steps\`), scrubbable like a video, kept 7 days (Manus replay, MNS §9.3). Sign-in screens are not captured (J13).

### Branches
| Case | What happens | Exact copy |
|---|---|---|
| Stop during payment submit | Cannot be cut mid-request; job finishes the in-flight step, then stops | "Stopping… the payment was already on its way. Checking whether it went through." → CHECKING (§5) |
| Stop while a helper owns the job | Stops it in the helper's chat too | "Stopped Trips' Goa search." |
| "stop" sent while no job is running | Plain reply | "Nothing's running right now." |
| Ambiguous "stop" with 2+ jobs in that chat | Choice card | "Stop which one?" [ Goa stay ] [ Delhi flights ] [ Both ] |
| User types a new instruction instead of stop ("only look at Taj and W") | Steer (G11) | "Got it, I'll fold that in." |
| Job not using a browser | No Watch live button; checklist shows steps only | — |
| Live view can't load | Panel shows | "I can't show the live view right now. The job is still running." [ Open the window ] |
| Take over and user closes the window | = Stop | as above |

### Stored
- Activity log: "stopped by you at {time}", with what had completed.
- `jobs\{id}\state.json` → cancelled; screenshots kept 7 days then deleted.

### Notifications
None for a stop the user did. If a job stops for a system reason while the window is closed, see J19.

### Acceptance criteria
- **Given** a running booking job, **when** the user types "stop", **then** no further click or AI call for that job happens after 1 s, and the reply lists exactly what was already done, read from the activity log.
- **Given** the user closes foo's browser window for a job, **then** the job is cancelled with the same report.
- **Given** "Take over", **then** foo makes no clicks until "Hand back to foo".
- **Given** the live view, **then** password, card and OTP fields are blurred in every frame.
- **Given** "Stop everything", **then** all running jobs stop, open approval cards become WITHDRAWN, and routines keep their schedules.

Sources: blueprint "Watch live, take over any time"; Manus watch-live panel, replay, close tab to stop (MNS §5, §9.2, §9.3); ChatGPT take over / return control, stop doesn't undo, one Stop everything (GPT §5, §9.5, §9.14); Gemini View live / Take over / Go back (GEM §5, §9.4); Muse take over pauses the agent (MUS §9.8); Tab stop means stop (TAB §4); Autopilot watch and take over (APL §9.8).
