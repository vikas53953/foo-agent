# foo v1: end-to-end user journeys (part 1 of 4)

Written 16 Oct 2026, from the approved blueprint (`foo-blueprint.html`, "Is this foo?" = yes) and the 13 teardowns in `/mnt/project-files/personal-agent-re/`.

- **Part 1 (this file):** reading rules, global rules, shared components with fixed copy, storage map, the two state machines, journeys 1 to 5.
- **Part 2:** `journeys-2.md`, journeys 6 to 13 (brief, chat and voice, choice chips, restaurant, hotel + payment, bills, email/X drafts, login handoff).
- **Part 3:** `journeys-3.md`, journeys 14 to 18 (routines, helpers, group chat, memory, watch live and stop).
- **Part 4:** `journeys-4.md`, journeys 19 to 23 (errors, notifications, settings, search, uninstall), plus the notification matrix and a coverage checklist.

A coding agent should be able to build every screen from these files without guessing. Where the teardowns disagree or say nothing, this file **decides**, and marks the decision `[foo decision]`.

---

## 0. How to read this

**Placeholders.** `{foo}` = the name the user gave the agent (default `foo`). `{You}` = the user's first name. `{Helper}` = a helper's name (Trips, Money, Home). Anything else in `{braces}` is data.

**Exact copy.** Text in "double quotes" or inside a copy block is final UI copy. Keep it word for word, including capitals and punctuation. Do not add exclamation marks or "Great question" style filler (Hermes front-desk rules, `hermes/01-teardown.md` §6).

**Sources.** Every pattern is credited as `(App · path §section)`. Paths are relative to `/mnt/project-files/personal-agent-re/`. Short keys used throughout:

| Key | File |
|---|---|
| INS | `instinct/04-deep-dive.md` (and `instinct/02-ux-and-conversation-patterns.md` as INS2) |
| GRK | `grok/04-deep-dive.md` (and `grok/02-ux-and-screens.md` as GRK2) |
| OCL | `openclaw/01-teardown.md` |
| HRM | `hermes/01-teardown.md` |
| POK | `poke/01-teardown.md` |
| TAB | `tab/01-teardown.md` |
| GPT | `chatgpt/01-teardown.md` |
| GEM | `gemini/01-teardown.md` |
| MUS | `muse/01-teardown.md` |
| APL | `autopilot/01-teardown.md` |
| CWK | `cowork/01-teardown.md` |
| PPX | `perplexity/01-teardown.md` |
| MNS | `manus/01-teardown.md` |

**Window layout** (blueprint "How foo will look"): left = chat list with filter chips; centre = the open chat; right = side panel ("Doing now", "Using", "What I know about you", "Spent this month"). On widths under 900 px the side panel collapses behind a "ⓘ" button in the chat header.

---

## 1. Global rules (apply to every journey)

| # | Rule | Behaviour | Source |
|---|---|---|---|
| G1 | **One voice.** | `{foo}` is the only speaker in its own chat. Helpers speak only in their own chats and in groups. Background workers and tool runs are never voiced; their results are re-told by `{foo}` or the helper. | Poke (POK §9.1); Grok handoff markers (GRK §4.2) |
| G2 | **No tech words, ever.** | Banned in UI copy and in the AI's replies: API, token, CLI, OAuth, server, cron, webhook, MCP, JSON, prompt, model, terminal, command, error code, stack, timeout, localhost. Use: "your AI", "key", "sign in", "routine", "connection". Every error says what happened plus **one** button that fixes it. | OpenClaw anti-pattern (OCL §8.6); Poke glossary rule (POK §9.10) |
| G3 | **"Check" never means "do".** | Words such as check, find, look, see, compare and "is there" only read. Booking, buying, sending and posting need the word book, buy, pay, send or post, or a tap on a card. When in doubt, show options and ask. | Instinct $200-fee booking (INS §1.1, §5.2) |
| G4 | **A draft is never permission.** | Every outbound email, message or post is a Draft card first. Approving one send does not approve the next one. | ChatGPT (GPT §9.2); Poke (POK §9.4) |
| G5 | **Every send, buy, book, post or delete stops for an Approval card.** | Hard limits that ask even on "Always": sharing your home address or phone number, any payment, anything that can't be undone (delete, cancel a booking with a fee), posting in public, messaging someone new. | Muse Marketplace incident (MUS §8, §9.3); ChatGPT fixed rules (GPT §5) |
| G6 | **Secrets never in chat.** | Keys, passwords, card numbers, OTPs go into a Secret box or straight into the website. The composer has a paste catcher. Secret values are blanked from chat, logs, screenshots, page snapshots and AI input. | Grok (GRK §1.1, §1.5); Hermes (HRM §5); Tab (TAB §5) |
| G7 | **"Done" only with proof.** | A finished job carries a Proof chip (confirmation number, screenshot, or the email received). If foo could not check live, it says "⚠ Not checked live". | Tab (TAB §9.3); Gemini fake Amazon results (GEM §8) |
| G8 | **Fresh yes before switching how.** | Moving from a website to email, or to a new person, or to a new site, inside an approved job needs a new Approval card. | Tab doctor-call incident (TAB §8, §9.14) |
| G9 | **Status lives on the user's bubble.** | See component C1. No "ok, on it" messages. | OpenClaw status reactions (OCL §5.3); Hermes (HRM §5) |
| G10 | **One checklist per job, edited in place.** | See component C2. Never post a new message per step. | Cowork (CWK §9.1); Hermes (HRM §9.4) |
| G11 | **You talk over it.** | A new message while a job runs is folded into the running job by default ("steer"). foo confirms with "Got it, I'll fold that in." A message starting with "stop" stops the job (J18). User messages always get answered before progress notes. | OpenClaw steer (OCL §9.12); Hermes (HRM §4); Tab (TAB §9.6) |
| G12 | **Status comes from what is really running.** | The badge, checklist and side panel read the job runner's real state, never the AI's own words. If no step finishes for 3 minutes, foo raises a "stuck" card (J19). | ChatGPT complaint "reports progress but isn't working" (GPT §8, §9.11) |
| G13 | **Interruption budget.** | Outside the morning brief and things the user asked for, foo sends at most 3 unprompted messages per day, never in quiet hours (default 10:00 PM to 7:00 AM). Each unprompted message has a grey footer "Why am I getting this?" | Poke 30% noise (POK §8, §9.15); OpenClaw active hours (OCL §2.6) |
| G14 | **Absolute times.** | Times always show the day and date: "Fri 12 Dec, 8:00 PM". Relative words ("tomorrow") only in addition, never alone. | Poke time-zone bugs (POK §9.14) |
| G15 | **Never offer twice.** | A suggestion the user dismissed (routine offer, connector, helper) is never offered again. Settings → Privacy → "Show dismissed suggestions" can bring them back. | Hermes (HRM §4, §9.8) |
| G16 | **Approvals are taps, not words.** | Typing "yes" or reacting 👍 does **not** approve an Approval or Payment card. foo replies: "Tap Approve on the card so I know it's really you." Reactions and typed answers DO answer Choice cards. | Muse system-dialog approvals (MUS §9.1); Hermes "Gestures never grant approval" (HRM §5) |
| G17 | **Second look before acting.** | Right before an approved send, buy, book or post runs, a separate quick AI check compares the action with the user's own words in this chat (recipient, amount, date, item). If it does not match, the job goes to Needs you with "Before I do this, one check: you asked for {X}, this is {Y}. Which one?" | ChatGPT Auto-review (GPT §3.1, §9.3); Grok re-checks your own messages (GRK §0.6) |

---

## 2. Shared components (fixed copy, reused by every journey)

### C1. Status badge on the user's bubble
A small emoji in the bottom-right corner of the user's last message.

| State | Emoji | When | Tooltip copy |
|---|---|---|---|
| Seen | 👀 | Within 1 s of send | "Seen" |
| Working | 🛠 | First tool step starts | "Working on it" |
| Waiting on you | ✋ | Job enters Needs you | "Waiting for you" |
| Slow | ⏳ | No finished step for 60 s | "Still working, this one takes a while" |
| Done | ✅ | Job done with proof | "Done" |
| Failed | ❌ | Job failed | "Didn't work. See the message below." |
| Cancelled | ⛔ | Job cancelled | "Stopped" |

For a plain chat answer with no tools, the badge goes 👀 then disappears when the reply arrives. A "typing…" line appears under the chat name while text is being written.
Sources: OpenClaw (OCL §5.3), Hermes (HRM §5), Grok status phrases (GRK §2 row 2).

### C2. Checklist bubble (one per job)
Appears only if the job has 2+ steps **and** runs longer than 1.5 s (OpenClaw progress drafts, OCL §5.3). It is one message, edited in place.

```
{Job title}                                  live checklist
✓ {done step, past tense}
✓ {done step}
✱ {current step, -ing form}                  ← bold when it just started
○ {next step}
[ Watch live ]   [ Stop ]                    {n} min · uses about ₹{x} of your AI
```
- Step text comes from a fixed list of plain phrases ("Checking Booking.com", "Reading your Gmail"), never raw tool arguments (Hermes curated phrases, HRM §5).
- On done it collapses to "✓ Done · {n} steps · {m} min · Details". On failure it stays expanded so the user sees where it stopped (Hermes `cleanup_progress`, HRM §5).
- "Watch live" appears only while the job uses the browser (J18).
Sources: Cowork (CWK §5, §9.1), Gemini work panel (GEM §5), Manus todo.md (MNS §9.12).

### C3. Choice card
```
{One-sentence question}
[ ★ {Option 1} · {one-line detail} ]   ← "Best fit" tag, always first
[ {Option 2} · {detail} ]
[ {Option 3} · {detail} ]
[ Something else… ]        Skip
```
- 2 to 4 options. Option 1 is foo's pick and carries the tag "Best fit". "Something else…" focuses the composer with the hint "Tell me what you want instead".
- Typing "2", typing the option text, or reacting 1️⃣–4️⃣ also answers it.
- After an answer, the card collapses to "{question} → {answer}" (OpenClaw, OCL §5.4).
- Timeout rules are in J8.
Sources: OpenClaw `ask_user` (OCL §4, §9.4), Hermes clarify (HRM §4), Cowork decision card (CWK §5).

### C4. Approval card (send, book, post, delete, share)
Drawn with a distinct frame (2 px coloured border, lock icon) by the app, not by the AI. Its text is built from structured fields, never from free AI text (Muse system UI, MUS §9.1).
```
{icon} {Verb phrase}?                              e.g. "✉ Send this email to your landlord?"
{Impact line: what happens, to whom, from where, can it be undone}
   e.g. "Will send to r.sharma@gmail.com from your Gmail. Can't be unsent."
Scope:  ( Just this once )  ( For this chat )  ( Always )   ← only where allowed
[ {Primary verb} ]  [ Edit ]  [ No ]
Expires {time} · If you don't answer, I won't do it.
```
- Primary verb is the action: "Send", "Book it", "Post it", "Delete", "Share".
- Scope chips appear only for sends to a known recipient and for reading or using an app. For anything in the G5 hard-limit list, scope chips are hidden and the footer says "I'll always ask for this one."
- Expiry: 60 min for send, post, delete and share; 15 min for bookings with no charge now. When expired, see the state machine in §5.
Sources: Hermes four tiers and fail-closed (HRM §3.3, §9.2), Muse scope (MUS §9.2), OpenClaw scope line (OCL §9.5), Grok Review-an-action (GRK §2 row 11).

### C5. Payment card (receipt style)
```
💳 Approve this payment                                   one-time
{Merchant / payee}, {what}                      ₹{amount}
{Fees, taxes, each on its own line}             ₹{x}
{Cancel terms, e.g. "Free cancellation until Wed 10 Dec"}   ₹0
Total charged once                              ₹{total}
Pay with: {Visa ••4242 | UPI vikas@okhdfc}  (change)
[ Approve ₹{total} ]   [ Not now ]
foo never sees your card · Expires in 10:00
```
- Counter starts at 10:00 and counts down (Instinct / Stripe Link 10-minute window, INS §1.4; Grok spend card, GRK §2 row 12).
- Totals at or above the Big-payment limit (default ₹10,000) need Windows Hello (face, fingerprint or PIN) after Approve: "Confirm it's you to pay ₹{total}" (Perplexity on-device authorization, PPX §9.9) `[foo decision: Windows Hello as the on-device check]`.
- If the final checkout amount differs from the approved total by any amount, foo stops before paying and shows a new card (see J10 "price changed") (Tab "stops rather than retrying", TAB §2, §9.2).
- Payment is submitted **once**. A timeout during submit is never retried; foo checks for proof instead (Tab payment binding, TAB §2).

### C6. Draft card
```
📝 Draft · not sent                                  {Email | WhatsApp | X post}
To: {name} <{address}>        (email/WhatsApp only)
Subject: {subject}            (email only)
{body}
[ Send ]  [ Change ]  [ Discard ]       ← X: [ Open in X to post ] instead of Send
```
"Change" puts the draft in edit mode inline; typing "make it shorter" in chat also updates the same card in place (Poke, POK §9.4). Send opens the C4 Approval card only if the recipient is new; for a known recipient, Send itself is the approval tap `[foo decision: the Send button on a draft counts as the C4 tap for known recipients, so the user taps once]`.

### C7. Secret box
```
{One line: why foo needs it}  e.g. "To use your own AI I need your OpenAI key. Paste it in the box below, not in the chat."
🔑 {Name, e.g. OpenAI key}                                secret
[ •••••••••••••••••••• ]  (show)
[ Save securely ]   [ Cancel ]
● Stored on this PC. foo's AI never sees it.
```
- After save: "✓ Saved securely. foo's AI never sees it." The box shows "OpenAI key · saved {date}" and only a "Replace" button. A saved value can never be read back (Grok write-only, GRK §1.2).
- On failure: "That didn't save. Try again." with "Try again".
- The eye toggle resets to hidden every time the box opens (OpenClaw, OCL §5.4).
- Value goes straight to Windows Credential Manager as `foo/{name}`; the AI only ever gets the name.
Sources: Grok (GRK §1.2), OpenClaw (OCL §5.4), Hermes (HRM §9.1), Muse placeholders (MUS §9.4).

### C8. Paste catcher
Triggered when the composer text matches a key pattern (`sk-`, `sk-proj-`, `AIza`, `ghp_`, `xoxb-`, 16-digit card numbers passing the Luhn check, or a 32+ char high-entropy string), or a 4–8 digit number right after foo asked for a code.
```
⚠ That looks like a password or key
You were about to send it as a normal message. Save it in the secret box instead?
[ Move to secret box ]   [ Send anyway ]
```
"Send anyway" sends it, but the stored chat shows "•••• (hidden)" and the AI receives "[the user typed a secret; it was hidden]". `[foo decision]` Source: Grok (GRK §5.2), Gemini (GEM §9.4).

### C9. Sign-in-here card and live window
```
{Site} wants you to sign in. Do it here and I'll carry on.
{site.com}   ● LIVE
[ I'm done ]   [ Take over ]   [ Skip ]
```
Full flow in J13. Sources: Manus (MNS §9.1), Tab (TAB §9.4), Grok Take over (GRK §1.4), ChatGPT (GPT §5).

### C10. Connect card (apps such as Gmail, Calendar)
```
{App icon} Connect {App}
{One line: what foo will do with it, e.g. "So I can see your bills and trips."}
[ Connect ]   [ Not now ]
```
States after tap: "Opening {App} sign-in in your browser…" → "✓ Connected as {email}" or a failure line with "Try again" / "Reopen". The sign-in link expires after 10 minutes (Grok, GRK §1.4).

### C11. Plan card (jobs expected to take > 2 min or > ₹5 of AI)
```
🗺 My plan · {title}
1 {step}
2 {step}
3 Show you before buying anything
About {n} minutes · uses about ₹{x} of your AI     (or "about {p}% of your Claude plan")
[ Go ]   [ Change plan ]
```
Sources: Perplexity quote-before-work (PPX §9.1), Gemini plan preview (GEM §9.3).

### C12. Proof chip and receipt footer
- Success: "✓ Proof: {confirmation # | screenshot | email from {sender}}". Clicking opens the proof.
- No proof: "⚠ Not checked live" plus button "Check for real".
- Footer under every finished job: "Done in {m} min · {n} steps · used about ₹{x} of your AI" (Perplexity receipt, PPX §9.3).

### C13. Routine card
```
⏰ Routine created
Checks       {what, plain words}
How often    {Every weekday at 8:00 AM | every 30 min}
Tells you    {only if …}
Where        {chat name} + {toast | no toast}
Next run     {Mon 20 Oct, 8:00 AM}
[ Run once now ]  [ Edit ]  [ Pause ]
```
Sources: Grok routine created (GRK §2 row 21), ChatGPT notify-if (GPT §9.7).

### C14. Memory chip
Under a foo message when memory changed: "🧠 Saved: {fact} · Undo". When a reply used a memory: "Used: {fact} ✕" (tap ✕ = forget it). Sources: Hermes (HRM §9.12), Perplexity memories as sources (PPX §9.6).

### C15. Handoff marker
A centred grey line in a chat: "{foo} asked {Helper} to {task}" or "{Helper} is back: {one-line result}". Source: Grok (GRK §2 row 20).

### C16. Error card
```
{icon} {What happened, one sentence}
{What I did about it / what is safe, one sentence}
[ {One fix button} ]   {optional secondary link}
```
Example: "😴 Your AI isn't answering right now. / Your Goa job is saved. Nothing was booked or paid. / [ Try again ]". Sources: OpenClaw anti-pattern (OCL §8.6), Tab honest status (TAB §5), ChatGPT blocker brief (GPT §9.8).

### C17. Toast (Windows notification)
Title = chat name, body = one line, up to 2 buttons. Never shows a secret, a full card number or an OTP. Full rules in J20.

---

## 3. Storage map (where everything lives)

Root: `%APPDATA%\foo\` (per Windows user). `[foo decision]` for all paths; layout follows Instinct's memory repo (INS §4.4) and OpenClaw's workspace files (OCL §2.4).

| What | Where | Format | Notes |
|---|---|---|---|
| Chats, messages, cards, reactions | `data\foo.db` | SQLite | Secrets never stored; card state stored as JSON fields in the row |
| Identity of foo | `memory\identity.md` | Markdown | name, avatar file, vibe line, emoji |
| About you (facts) | `memory\about-you.md` | Markdown, one fact per line with tags `source: you-said | i-guessed`, `date`, `from` | Tab "you said / I concluded" (TAB §9.10) |
| People | `memory\people\{name}.md` | Markdown | e.g. Mom, Rohit |
| Preferences | `memory\preferences\{topic}.md` | Markdown | travel, food, autonomy |
| Helper memory | `helpers\{id}\notes.md`, `helpers\{id}\profile.json` | Markdown / JSON | name, job, goal, colour, face |
| Jobs | `jobs\{job-id}\plan.md`, `state.json`, `steps\*.png` | Markdown / JSON / PNG | plan.md is rewritten each step (Manus todo.md, MNS §2) and is the crash-recovery source |
| Site notes | `sites\{domain}.md` | Markdown | "needs SMS code", "blocks automation" (Instinct browser guidance, INS §5.7) |
| Routines | `routines\{id}.json` + run history | JSON | last 20 runs kept (Grok, GRK §4.5) |
| Activity log | `logs\activity-{yyyy-mm}.jsonl` | JSON lines | every send/buy/book/post/delete: who, what, when, approval id, proof. Secrets redacted |
| Tech log (for support) | `logs\app-{date}.log` | text | redacted, 14 days |
| Settings and permissions | `settings.json` | JSON | |
| Secrets | Windows Credential Manager, target `foo/{name}` | DPAPI | AI keys, site logins, saved cards, UPI ID is NOT secret (stored in settings) |
| App connections (Gmail etc.) | Credential Manager `foo/conn/{app}/{account}` | DPAPI | refresh tokens |
| Browser profile | `browser\profile\` | Chromium profile | foo's own browser window; keeps site sign-ins |
| Screenshots of jobs | `jobs\{id}\steps\` | PNG, password fields masked | deleted after 7 days by default |
| Output files | `Documents\foo\{job title}\` | real files | Gemini real files (GEM §9.10) |

---

## 4. State machine: a JOB

A job is anything foo does that takes a tool step (read Gmail, open a site, book, pay). Plain chat replies are not jobs.

```
                       user asks / routine fires / helper hands off
                                        │
                                        ▼
                                  ┌──────────┐  user taps Stop / "stop"
                                  │  QUEUED  │──────────────────────────────┐
                                  └────┬─────┘                              │
              AI available & a slot free (max 3 jobs at once)               │
                                        ▼                                   │
     ┌──────────────────────────► ┌──────────┐ ──── step needs a person ──┐│
     │  user answered / approved   │ WORKING  │      (choice, approval,     ││
     │  / signed in / "I'm done"   └──┬──┬──┬─┘       sign-in, payment)     ││
     │                                │  │  │                             ▼▼
     │                                │  │  │                       ┌──────────────┐
     │                                │  │  └── AI offline / limit ─►│   WAITING    │
     │                                │  │      hit / spend cap /    │ (not on you) │
     │                                │  │      PC went to sleep     └──────┬───────┘
     │                                │  │                    AI back /    │ cap raised /
     │                                │  │                    resume tapped│ limit reset
     │                                │  │◄──────────────────────────────── ┘
     │                                │  │
     │                ┌───────────────┘  └────────────┐
     │                ▼                               ▼
     │        ┌──────────────┐                ┌──────────────┐
     └────────│  NEEDS YOU   │                │     DONE     │  (proof attached, or
              └──┬───────┬───┘                └──────────────┘   "Not checked live")
     no answer   │       │ user taps No / Stop / declines payment
     by expiry   │       ▼
     (see §5)    │  ┌──────────────┐        ┌──────────────┐
                 └─►│  CANCELLED   │        │    FAILED    │◄── from WORKING: same step
                    └──────────────┘        └──────────────┘    failed 3 times / stuck 3 min
                                                                 and user chose "Stop" /
                                                                 site blocked with no fallback
```

| From | Event | To | What the user sees |
|---|---|---|---|
| (none) | job created | QUEUED | Badge 👀. If 3 jobs already running: checklist shows "Waiting for another job to finish" |
| QUEUED | slot free and AI verified in last 10 min (else a 1-word test first) | WORKING | Badge 🛠, checklist appears after 1.5 s |
| QUEUED / WORKING / NEEDS YOU / WAITING | Stop | CANCELLED | Badge ⛔, checklist line "Stopped by you", message "Stopped. {what was already done, or 'Nothing was booked, paid or sent.'}" |
| WORKING | needs a choice, approval, payment, sign-in, code | NEEDS YOU | Badge ✋, chat row pill "Needs you", taskbar yellow, toast (J20) |
| NEEDS YOU | answered / approved / "I'm done" | WORKING | Badge 🛠, card collapses to its answered state |
| NEEDS YOU | declined (No / Not now) | CANCELLED, or WORKING if foo has another route | "Okay, I won't. {next step or 'Nothing else to do here.'}" |
| NEEDS YOU | card expired | CANCELLED (payment, booking) or stays NEEDS YOU with a reminder (choice cards) | See §5 |
| WORKING | AI not answering, AI limit hit, spend cap hit, PC asleep | WAITING | Error card (J19). Chat row pill "Paused" |
| WAITING | condition clears | WORKING | One line: "Back on it. Picking up from step {n}." |
| WORKING | all steps done, proof found | DONE | Badge ✅, Proof chip, receipt footer |
| WORKING | all steps done, no proof possible | DONE (unverified) | Badge ✅ plus "⚠ Not checked live" |
| WORKING | stuck (no step for 3 min, or same step failed 3 times, or spend > 2× estimate) | NEEDS YOU (stuck card) | J19 stuck card; Stop on it → FAILED |
| WORKING | unrecoverable (site blocks, no other route) | FAILED | Badge ❌, error card with one alternative |
| any | app crash / PC restart | restored from `state.json` on next launch | J19 crash recovery |

Rules:
- Only the **job runner** changes state. The AI can request a change; it cannot set DONE without a proof object or an explicit `unverified` flag (G7, G12).
- A job never goes from FAILED or CANCELLED back to WORKING. "Try again" creates a new job linked to the old one ("Trying again: {title}").
- Max 3 jobs WORKING at once `[foo decision]` (Gemini caps at 15, GEM §2; foo runs on one PC with the user's own AI).

---

## 5. State machine: an APPROVAL CARD (C4 and C5)

```
            job reaches a gated step
                     │
                     ▼
               ┌───────────┐
               │  PENDING  │── expiry timer runs (10 min pay / 15 min book / 60 min other)
               └─┬──┬──┬──┬┘
     Approve tap │  │  │  └──────── job cancelled elsewhere ──────────► WITHDRAWN
     (+ Windows  │  │  └─────────── terms changed before Approve ─────► SUPERSEDED ──► new PENDING card
      Hello if   │  │               (price, time, recipient)
      big pay)   │  └── No / Not now ─────────────────────────────────► DECLINED
                 │      timer ends ─────────────────────────────────── ► EXPIRED
                 ▼
          ┌────────────┐  second look (G17) fails ──────────────────► HELD ──► user picks ──► APPROVED or DECLINED
          │  APPROVED  │
          └─────┬──────┘
                ▼
          ┌────────────┐  checkout total ≠ approved total ─────────► SUPERSEDED ──► new PENDING card
          │  RUNNING   │  bank/site needs code ────────────────────► (stays RUNNING; J13 sign-in card)
          └──┬───┬───┬─┘
   proof ok  │   │   └── submit result unknown (crash, timeout) ──► CHECKING ──► COMPLETED or FAILED
             │   └────── declined by bank / site error ───────────► FAILED
             ▼
       ┌────────────┐
       │ COMPLETED  │
       └────────────┘
```

| State | Card looks like | Copy |
|---|---|---|
| PENDING | full card, live countdown | as C4 / C5 |
| APPROVED → RUNNING | buttons replaced by a spinner line | "Approved by you at {time}. Doing it now…" |
| HELD | yellow strip on the card | "Before I do this, one check: you asked for {X}, this is {Y}. Which one?" + Choice chips |
| COMPLETED | green tick header, proof chip | "✓ {Sent | Booked | Paid ₹{total}} · {time}" |
| DECLINED | grey, collapsed | "You said no. Nothing was {sent | booked | paid}." |
| EXPIRED | grey, collapsed | "This expired at {time}. Nothing was {sent | booked | paid}." + [ Ask me again ] |
| SUPERSEDED | grey, struck-through amount | "The price changed, so I stopped. See the new card below." (or "The time changed…", "The recipient changed…") |
| WITHDRAWN | grey | "No longer needed. The job was stopped." |
| FAILED | red edge | Payment: "Your bank said no. No money was taken." Others: "{Site} didn't accept it. Nothing was {sent | booked}." + one fix button |
| CHECKING | amber | "I'm not sure the payment went through. Checking your email and the site before doing anything else." |

Rules:
- An approval is single-use. "Always" stores a rule in `settings.json → rules[]` that skips **future** C4 cards of the same verb + same recipient/app, never C5 and never G5 hard limits (ChatGPT single-use sends, GPT §9.2; Muse "Allow Always" lesson, MUS §9.3).
- EXPIRED and DECLINED never auto-retry. "Ask me again" re-checks live terms first and builds a fresh card.
- The countdown keeps running while the window is closed; the toast (J20) shows the same expiry.
- A CHECKING card never re-submits a payment. If proof is not found within 15 minutes it becomes FAILED with "I couldn't confirm it. Check your bank app before trying again." and the button "I checked, try again" `[foo decision]` (Tab "submitted once", TAB §2).

---

## J1. Install and first launch

**Trigger:** the user downloads `foo-setup.exe` from the foo website and double-clicks it.
**Preconditions:** Windows 10 22H2 or Windows 11; no admin rights needed (per-user install).

### Steps
1. **Windows SmartScreen** (installer is code-signed, so it shows the publisher): "Do you want to allow this app from {Publisher} to make changes?" is not shown, because the install is per-user. The installer window opens.
2. **Installer screen 1, "Welcome":**
   - Title: "Install foo"
   - Body: "foo is your personal helper. It lives on this PC and uses the AI you already have."
   - Checkbox (on): "Start foo when I sign in to Windows"
   - Buttons: [ Install ] [ Cancel ]
3. **Installer screen 2, progress:** "Installing… this takes about a minute." Progress bar. No other copy.
4. **Readiness check** (runs silently at the end of install; Cowork readiness check, CWK §6, §9.13): Windows version, free disk ≥ 2 GB, Edge or Chrome present, `%APPDATA%` not on a network drive, Documents not a OneDrive "online-only" placeholder folder, sleep settings.
5. **Installer screen 3, done:** "foo is ready." [ Open foo ] (auto-opens after 3 s).
6. **First window** opens at 1100×720, centred. Left list is empty except a greyed "foo" row. Centre shows the welcome card:
   ```
   f   Hi, I'm foo.
       I live on this PC and do things for you: bookings, bills, emails, reminders.
       First, let me find the AI you already use. This takes a few seconds.
       [ Let's go ]
   ```
   Footer line under the card: "Nothing leaves this PC unless you say so. Privacy details" (link to J21 Privacy).
7. Tap "Let's go" → J2.

The setup steps J2 to J5 are shown as **chat cards inside foo's chat**, not a wizard (Hermes onboarding as chat, HRM §6). A small header pill shows "Step 1 of 4 · foo finds your AI" and so on (blueprint "Your first five minutes").

### Branches
| Case | What happens | Exact copy |
|---|---|---|
| Cancel at screen 1 | Installer closes; nothing written | none |
| Disk < 2 GB | Screen 2 stops | "There isn't enough space on this PC. foo needs 2 GB free." [ Open storage settings ] [ Close ] |
| No Edge or Chrome | Install continues; flag set | Later, first browser job shows: "I need a browser to do this. Edge is built into Windows, so I'll use that." (Edge is always present on Win 11; Win 10 without Edge: "I need Microsoft Edge to do web jobs. [ Get Edge ]") |
| Documents is online-only OneDrive | Output folder set to `%USERPROFILE%\foo files` instead | Settings → Files shows "Saved to {path} because your Documents folder is online-only." |
| Unsupported Windows (older than Win 10 22H2) | Screen 1 replaced | "foo needs Windows 10 (22H2) or Windows 11. Your PC has {version}." [ Close ] |
| Already installed | Installer becomes updater | "Update foo to {version}? Your chats and settings stay." [ Update ] [ Cancel ] |
| Offline during install | Install is offline-capable; no change | — |
| Install fails midway | Rolls back | "Something stopped the install. Nothing was changed on your PC." [ Try again ] |
| User closes first window before Let's go | foo stays in tray (J20). Next open shows the same welcome card | Tray tooltip "foo · setting up" |
| Second launch while setup unfinished | Resumes at the last unfinished step | Header pill shows that step |

### Stored
- `settings.json`: install date, version, start-with-Windows flag, output folder, readiness results.
- Windows: Start menu shortcut, startup entry (if ticked), uninstall entry, notification registration (AUMID `foo.app`).
- Nothing in memory yet. No secrets.

### Notifications
None during install. After install the tray icon appears (grey "f").

### Acceptance criteria
- **Given** a standard (non-admin) Windows 11 user, **when** they run the installer and tap Install, **then** foo installs without any admin prompt and opens the welcome card within 90 s.
- **Given** Documents is an online-only OneDrive folder, **when** install finishes, **then** the output folder is `%USERPROFILE%\foo files` and Settings → Files explains why.
- **Given** the user closes the first window, **when** they reopen foo from the tray, **then** the welcome card is shown again and no setup step is skipped.
- **Given** any install failure, **then** the message contains no file paths, codes or technical words (G2).

Sources: Cowork readiness check and OneDrive placeholder failures (CWK §6, §8, §9.13); OpenClaw Windows tray app (OCL §5.6); Hermes onboarding as chat (HRM §6).

---

## J2. Finding and connecting the user's AI (detect + verify)

**Trigger:** "Let's go" on the welcome card (J1), or Settings → Your AI → "Change" (J21), or J19 when the AI stops working.
**Goal:** chat unlocks only after at least one AI has passed a live test (OpenClaw "continuing remains locked until one backend has passed", OCL §6.1).

### Detection ladder (run in parallel, show in this order)
`[foo decision]` adapted from OpenClaw's ranking (OCL §6.1, §9.1):
1. Claude app sign-in (Claude Code / Claude desktop sign-in found on this PC)
2. ChatGPT sign-in (Codex sign-in found)
3. Gemini sign-in (Gemini app sign-in found)
4. Keys already saved in Windows settings for this user: OpenAI, Anthropic, Google
5. A free AI running on this PC (Ollama or LM Studio)

### Steps
1. foo posts a card "Step 1 of 4 · foo finds your AI" with one row per ladder item, each showing a spinner, then a result:
   ```
   foo is looking for the AI you already use…
   Claude (signed in)          ✓ works
   ChatGPT (signed in)         ✓ works
   Gemini                      not found
   OpenAI key                  [ Add in secret box ]
   AI on this PC               not found
   ```
2. **Verify**: for every found item, foo sends one tiny real request ("Reply with the word ready") with a 20 s limit. Row shows "Testing…" then "✓ works" or a failure label (see branches). Test cost is not shown (< ₹0.10).
3. **Choose**: if 2+ work, foo picks the first working one in ladder order and says:
   "I'll use **{Claude}**. It works and it's the best fit for jobs like bookings. You can change this any time in Settings."
   Buttons: [ Use Claude ] [ Pick another ]
   "Pick another" turns the card into a Choice card (C3) of working AIs.
4. **Plan vs key note** (one line under the choice):
   - Sign-in (plan): "This uses your {Claude} plan. If you hit its limit, I'll tell you and wait."
   - Key: "This uses your {OpenAI} key, so each job costs a little. I'll show the cost and stop at your monthly cap (₹1,000 to start)." [ Change cap ]
5. Card collapses to "✓ Using Claude (your AI)". The side panel "Using" section shows "Claude (your AI)". Header pill moves to "Step 2 of 4". Continue to J3.

### Branches
| Case | What happens | Exact copy |
|---|---|---|
| Nothing found at all | Card turns into a Choice card | "I couldn't find an AI on this PC yet. Which one do you use?" [ ★ ChatGPT · sign in with your account ] [ Claude · sign in with your account ] [ Gemini · sign in ] [ I have a key ] |
| User picks a sign-in option | foo asks consent to add the maker's free helper app | "To use your ChatGPT plan I need to add a small free helper from OpenAI (about 40 MB). [ Add it ] [ Not now ]" Then "Opening ChatGPT sign-in in your browser…" → back in foo: "✓ Signed in as {email}" → verify (step 2) |
| Helper download fails / offline | Error card | "I can't download that right now. Check your internet, then try again." [ Try again ] |
| Installed but not signed in | Row shows | "Claude · installed, not signed in [ Sign in ]" |
| Sign-in tab closed / took > 10 min | Row shows | "Sign-in didn't finish. [ Reopen ] [ Try again ]" (Grok Reopen/Retry, GRK §1.4) |
| Test fails: wrong or expired key | Row shows | "OpenAI key · didn't work. It may be old or typed wrong. [ Replace key ]" |
| Test fails: plan limit reached | Row shows | "ChatGPT · signed in, but your plan's limit is used up until {time}." Still selectable if another works; if it's the only one: "You can still set me up. I'll start working at {time}." [ Continue anyway ] |
| Test fails: no internet | Card header | "You're offline. I need the internet to test your AI." [ Try again ] (auto-retries every 30 s, row shows "Waiting for internet") |
| Test slow (> 20 s) | Row shows | "Claude · slow to answer. [ Test again ]" |
| "I have a key" | Choice card | "Which key is it?" [ OpenAI ] [ Anthropic (Claude) ] [ Google (Gemini) ] → Secret box (C7): "To use your own AI I need your {OpenAI} key. Paste it in the box below, not in the chat." |
| User pastes key into composer instead | Paste catcher (C8) | as C8 |
| Key saved, test passes | Row | "OpenAI key ✓ works" |
| Free AI on this PC only | Warning line | "This AI runs on your PC. It's free but slower and can't do bookings well. Fine for chatting and reminders." [ Use it anyway ] [ Add another AI ] |
| User tries to type a normal chat message before any AI works | Composer is disabled with hint | "Connect your AI first, then we can talk." |

### Stored
- `settings.json → ai`: chosen provider, kind (`plan` or `key`), last verified time, fallbacks in order.
- Credential Manager: `foo/OpenAI key` (only if a key was given).
- `logs\app-*.log`: "AI test passed: Claude" (no keys, no emails beyond masked `v***@gmail.com`).
- No memory facts.

### Notifications
None (user is in the window). If the window is closed during a sign-in, toast: "foo · Signed in to ChatGPT. Come back to finish setup." [ Open ]

### Acceptance criteria
- **Given** Claude and ChatGPT sign-ins exist, **when** detection runs, **then** both are tested with a real request and Claude is pre-selected.
- **Given** no AI passes a test, **then** the composer stays disabled and no step after J2 is reachable.
- **Given** the user pastes `sk-proj-…` into the composer, **when** they press Enter, **then** the message is not sent and the paste catcher appears.
- **Given** a key saved through the Secret box, **then** the key value does not appear in `foo.db`, any log, or any AI request body.
- **Given** a key that fails the test, **then** the row offers "Replace key" and the old value is not shown.

Sources: OpenClaw detect + verify ladder (OCL §6.1, §9.1); Grok secret card (GRK §1.2); Hermes masked dialog (HRM §4); Perplexity jargon wall at bearer tokens (PPX §6, §9.13); blueprint Step 1 of 4.

---

## J3. Naming foo, avatar and vibe

**Trigger:** J2 finished. Also reachable from foo's profile (click the name in the chat header → "Change name, face or vibe").
**Rule:** "The user's request always comes first." If the user's first message is a real task, foo does the task first, and runs this ritual after it (OpenClaw BOOTSTRAP, OCL §6.2).

### Steps
1. Header pill "Step 2 of 4 · Name it and pick a face".
2. foo: "What should I call myself?"
   - Input field inside the card, placeholder "Type a name", buttons [ Keep "foo" ] [ 🎲 Surprise me ].
   - foo never suggests a name in its own text (OpenClaw, OCL §6.2). The dice is the only source of suggestions (Manus/Cue dice, MNS §6, §9.7).
   - 🎲 fills the field with a random name from a built-in list of 200 short friendly names; tap again for another. The user still taps "That's it".
3. After the name: foo replies in 3 words or fewer: "{Name} it is." (Hermes "say it by its label in three words or fewer", HRM §6).
4. foo: "Pick a face." A 2×2 grid:
   - If the user's AI can make images: 4 generated avatars in different styles, labelled 1–4.
   - Otherwise: 4 preset faces (letter-mark "f", ✿, ◐, ★) in 4 colours.
   - Buttons under grid: [ 🎲 New faces ] [ Use my own picture ]
   - Tapping a face selects it; the chat list row and header update immediately.
5. foo: "How should I talk to you?" Choice card:
   [ ★ Calm, a bit funny ] [ Straight to the point ] [ Warm and chatty ] [ Something else… ]
   (Autopilot tone picker, APL §9.13; OpenClaw single vibe line + emoji, OCL §6.2.)
6. foo answers in the chosen vibe with one line plus its emoji, e.g. "Calm, a bit funny. Got it. 🌿"
7. Header pill → "Step 3 of 4". Continue to J4.

### Branches
| Case | What happens | Exact copy |
|---|---|---|
| User types a name > 20 characters | Inline under field | "Keep it under 20 letters so it fits in the chat list." |
| Name is blank and user taps Done | Same as Keep "foo" | — |
| Name matches a helper name later | Prevented in J15 | — |
| Image making fails or is slow (> 30 s) | Falls back to preset faces | "I'll use simple faces for now. You can make a new one later." |
| "Use my own picture" | Windows file picker (PNG/JPG ≤ 5 MB), cropped to a circle | If too big: "That picture is too big. Pick one under 5 MB." |
| User skips (types a real request instead) | foo does the request; ritual resumes after the job is DONE | After the job: "Before I forget: what should I call myself?" |
| User says "skip setup" | Remaining steps skipped; defaults used ("foo", letter-mark, Calm) | "Okay, skipping. You can change any of this in Settings." |

### Stored
- `memory\identity.md`: name, vibe line, emoji, created date.
- `avatars\avatar.png` (≤ 2 MB).
- `settings.json → identity` for the UI.

### Notifications
None.

### Acceptance criteria
- **Given** the naming card, **then** foo's own text never contains a suggested name; only the 🎲 button fills one.
- **Given** the user picks face 3, **then** the chat list, chat header, toasts and taskbar jump list use that face within 1 s.
- **Given** the user's first message is "book a table for 2 tonight", **then** foo starts J9 at once and asks for its name only after that job ends.
- **Given** the dice is tapped 5 times, **then** 5 different names are offered with no repeats in the session.

Sources: OpenClaw birth sequence (OCL §6.2, §9.6); Manus/Cue dice (MNS §6, §9.7); Muse name-first onboarding (MUS §6, §9.6); ChatGPT dots named persona (GPT §9.12); Hermes front-desk rules (HRM §6).

---

## J4. Interview + connecting Gmail, Calendar and WhatsApp

**Trigger:** J3 finished. Also: the user types "interview me" or "set me up" at any time (Gemini, GEM §4, §9.6).
**Rules (Hermes beats, HRM §6):** each question is its own card; foo never lists the options in its own text; typing instead of tapping still answers; an off-topic question is answered, then the card comes back; every card has Skip.

### Steps
1. Header pill "Step 3 of 4 · A quick interview".
2. **Card A, "What should I call you?"** Input prefilled from the Windows account name as a chip only (the AI does not see it unless picked) (Hermes name prefill, HRM §4). [ {Vikas} ] [ Something else… ]
   → foo: "Hi {Vikas}." Saved to about-you as "You said".
3. **Card B, "Can I peek at which apps you have installed? Not your files."** [ Yes, have a look ] [ No thanks ]
   (Hermes look-around consent, HRM §9.7; OpenClaw app recommendations, OCL §9.15.) If yes, foo reads the installed-apps list only and pre-ticks Card C.
4. **Card C, "Which apps do you use most?"** multi-select chips, then [ Done ]:
   [ WhatsApp ] [ Gmail + Calendar ] [ Outlook ] [ X ] [ Instagram ] [ None of these ]
   (Grok "Which tools do you use?", GRK2 Other screens.) Instagram and X are noted for reading later; posting is not in v1.
5. **Card D, Gmail + Calendar** (only if ticked). foo: "Want me to read your Gmail so I know your bills and trips?" → Connect card (C10):
   ```
   ✉ Connect Gmail and Calendar
   I'll read emails and your calendar to spot bills, trips and plans.
   I'll write drafts, but I never send without your tap.
   [ Connect ]   [ Not now ]
   ```
   - Connect opens Google sign-in in the default browser. Permissions asked: read mail, create drafts, send (send is only used after an Approval card), read and add calendar events.
   - Back in foo: "✓ Connected as {v***@gmail.com}". Side panel "Using" gains "Gmail" and "Calendar".
6. **Card E, WhatsApp** (only if ticked):
   ```
   💬 Link WhatsApp
   I can read your chats to remind you of things, and draft messages for you to send.
   I never send a WhatsApp message without your tap.
   [ Show QR code ]   [ Not now ]
   ```
   - "Show QR code" shows a QR inside the card plus 3 numbered lines: "1 Open WhatsApp on your phone", "2 Tap ⋮ or Settings → Linked devices → Link a device", "3 Point your phone at this code".
   - On success: "✓ WhatsApp linked ({+91 98••• ••210})".
   - Footer line, always visible on this card: "WhatsApp may unlink foo now and then. If that happens I'll ask you to scan again."
   `[foo decision: WhatsApp in v1 = read + send-after-approval via a linked device; foo never posts by itself, and helpers do not join WhatsApp groups (blueprint "Later, not v1")]`. The linked-device bridge is fragile (OpenClaw WhatsApp fragility, OCL §8.4; Manus channel risk, MNS §9.14), so it is optional and fails gracefully.
7. **Card F, "Who matters most to you?"** free text with chips [ Family ] [ Partner ] [ Friends ] [ Skip ]. foo asks one follow-up at most ("Any birthdays I should know?"). Each answer is saved as a people note.
8. **Card G, "When should I send your morning brief?"** [ ★ 8:00 AM ] [ 7:00 AM ] [ 9:00 AM ] [ Don't send one ]
9. **Card H, "How much should I do on my own?"** (Cowork switch, CWK §9.9)
   [ ★ Check with me first ] [ Go ahead with small things ]
   - "Small things" means: reading, drafting, adding to calendar, reminders. Never sends, buys, books, posts or deletes without a card (G5).
10. foo summarises in one bubble:
   "Here's what I've got, {Vikas}:
   • You use Gmail, Calendar and WhatsApp
   • Mom's birthday is 18 Oct
   • Morning brief at 8:00 AM
   Fix anything?" [ Looks right ] [ Fix something ]
   (Muse "Here's what I learned. Fix anything?", MUS §9.5.)
11. Header pill → "Step 4 of 4". Continue to J5.

### Branches
| Case | What happens | Exact copy |
|---|---|---|
| Google sign-in denied / cancelled | Card stays | "Gmail isn't connected. That's fine, I'll work without it." [ Try again ] [ Skip ] |
| User unticks some permissions on Google's page (e.g. no send) | foo stores what was granted | "Connected. I can read and draft, but not send. I'll ask you to send from Gmail yourself." |
| Browser tab lost / link > 10 min | Card | "That sign-in link expired. [ Reopen ]" |
| Signed in to the wrong Google account | Card shows the email; button | "Connected as {email}. Wrong account? [ Use a different one ]" |
| Second Gmail account wanted | Later from Settings → Apps → Gmail → "Add another account" | — |
| Offline | Connect buttons disabled | "You're offline. I'll connect this when you're back." [ Remind me ] |
| WhatsApp QR expires (60 s) | QR blurs | "This code expired. [ New code ]" |
| WhatsApp link fails 3 times | Card | "WhatsApp didn't link. You can try later in Settings → Apps." [ Skip for now ] |
| User picks Outlook | Connect card for Microsoft sign-in with the same copy, "Outlook" in place of Gmail | — |
| User skips everything | foo continues; J5 picks a task that needs no apps | — |
| User asks an off-topic question mid-interview ("can you book trains?") | foo answers in one line, then re-shows the same card | "Yes, IRCTC too, once you sign in there. Now, back to this:" |
| User types instead of tapping ("8 is fine") | Card answered as "8:00 AM", collapses | "{question} → 8:00 AM" |

### Stored
- `memory\about-you.md`: name (you said), apps used (you said), autonomy choice (you said).
- `memory\people\mom.md`: "Birthday 18 Oct (you said, {date})".
- `settings.json`: brief time, autonomy, connected apps with granted permissions, WhatsApp link status.
- Credential Manager: `foo/conn/gmail/{email}`, `foo/conn/whatsapp/session`.
- `logs\activity-*.jsonl`: "connected Gmail ({masked})".
- Installed-apps scan result: kept in memory for this session only, not saved `[foo decision]`.

### Notifications
None while the window is open. If the user leaves for the browser and finishes sign-in there: toast "foo · Gmail connected. Come back to finish setup." [ Open ]

### Acceptance criteria
- **Given** the user ticks Gmail + Calendar and completes Google sign-in, **then** the card shows "✓ Connected as" with a masked address within 3 s of the browser returning.
- **Given** the user declined the send permission on Google's page, **then** foo never offers "Send" on Gmail drafts and instead offers "Open in Gmail".
- **Given** any interview card, **when** the user types an answer, **then** the card collapses to "question → answer" exactly as a tap would.
- **Given** "Look around this PC" was declined, **then** foo reads no installed-apps list and Card C starts unticked.
- **Given** WhatsApp is linked, **then** foo never sends a WhatsApp message without a Draft card + Send tap (G4).

Sources: Gemini "interview me" (GEM §9.6); Hermes beats and look-around (HRM §4, §6, §9.6, §9.7); Grok Connect card states and tool question (GRK §1.4, GRK2); Muse onboarding + "fix anything" (MUS §6, §9.5); Cowork ask-vs-go switch (CWK §9.9); OpenClaw WhatsApp QR link (OCL §4) and its fragility (OCL §8.4).

---

## J5. First real task inside a minute

**Trigger:** J4 summary confirmed ("Looks right"), or the user skipped the interview.
**Rule:** "Something visible within a minute, finished within five", real data only (Hermes first wow task, HRM §4, §6).

### Steps
1. Header pill "Step 4 of 4 · A real job".
2. foo offers up to 4 tailored first jobs, each ≤ 32 characters (Hermes, HRM §4), filtered by what was connected:
   | Connected | Offered (in this order) |
   |---|---|
   | Gmail | "Find bills due this week" · "Spot my upcoming trips" |
   | Calendar | "What's on this week?" |
   | WhatsApp | "Anything I missed in chats?" |
   | Nothing | "Plan dinner for Saturday" · "Remind me of Mom's birthday" |
   Card: "Let's do something real. Pick one, or ask me anything." + chips + [ Something else… ]
3. User taps "Find bills due this week". User bubble shows the tapped text; badge 👀 → 🛠.
4. Checklist bubble (C2) appears after 1.5 s:
   "✓ Reading your Gmail (last 30 days) / ✱ Looking for bills and due dates / ○ Checking your calendar for trips".
5. Within 60 s foo replies with the result, in its vibe:
   "Found 2 bills due this week and your Goa dates.
   • Airtel ₹1,179 · due Fri 17 Oct
   • BESCOM electricity ₹2,340 · due Sun 19 Oct
   • Goa trip 12–14 Dec (from your IndiGo email)"
   Proof chip: "✓ Proof: 3 emails · open". Receipt footer (C12).
6. Feedback card: "How does this look?" [ Looks right ] [ Change something ] [ Take it further ] (Hermes, HRM §4).
   - Take it further → "Want me to remind you a day before each bill?" [ Yes ] [ No thanks ] (creates a routine via J14 if yes).
7. foo closes setup: "Tomorrow 8:00 AM I'll send your first morning brief." Header pill disappears. The chat list now shows "foo" with the last line. Setup is complete; flag stored.

### Branches
| Case | What happens | Exact copy |
|---|---|---|
| Nothing found | Honest empty result | "No bills due this week in your Gmail. I checked the last 30 days." + Proof chip "✓ Checked 214 emails" |
| Job passes 60 s | Badge ⏳; checklist line | "Still reading, your inbox is big. About a minute more." |
| Job fails (Gmail error) | Error card | "I couldn't read your Gmail just now. Your connection may need a refresh." [ Reconnect Gmail ] |
| AI limit hit during first task | J19 rate-limit card; setup still marked complete | — |
| User types their own first task | Treated as the first job; same rules (≤ 1 min visible progress) | — |
| "Change something" | foo: "What should I change?" and re-runs with the change | — |
| User picks "Remind me of Mom's birthday" | Creates a one-off routine (J14) and shows the Routine card | — |

### Stored
- Job folder `jobs\{id}\` with plan.md, state.json.
- `memory\about-you.md`: nothing new unless the user said something. Bills found are **not** saved as memory; they go into the Money helper's notes only after J15 creates it `[foo decision]`.
- `settings.json → setupComplete: true`, `firstBriefAt`.
- Activity log: "read Gmail for bills".

### Notifications
None (window open). If the user minimised during the job: toast "foo · Found 2 bills due this week." [ Open ]

### Acceptance criteria
- **Given** Gmail connected, **when** the user taps "Find bills due this week", **then** a checklist is visible within 2 s and a first result line appears within 60 s.
- **Given** the result, **then** it carries a Proof chip linking to the actual emails, or "⚠ Not checked live" if no email was opened.
- **Given** nothing was connected, **then** none of the offered first jobs needs Gmail, Calendar or WhatsApp.
- **Given** the first task finishes, **then** foo states the first brief time with an absolute day ("Tomorrow, Fri 17 Oct, 8:00 AM" in the tooltip of "Tomorrow").

Sources: Hermes first task within a minute and feedback chips (HRM §4, §6, §9.6); Poke texts first with one useful thing (POK §9.6); Instinct proof via calendar/email (INS §1.5); blueprint Step 4 of 4.
