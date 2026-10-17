# foo v1: end-to-end user journeys (part 2 of 4)

Journeys 6 to 13. Read `journeys-1.md` first: it defines the global rules (G1–G17), the shared components (C1–C17), the storage map and the job and approval state machines that every journey here uses. Source keys (INS, GRK, OCL, HRM, POK, TAB, GPT, GEM, MUS, APL, CWK, PPX, MNS) map to files in `/mnt/project-files/personal-agent-re/` as listed in `journeys-1.md` §0.

---

## J6. Daily morning brief and feedback

**Trigger:** the brief routine fires at the time set in J4 (default 8:00 AM), on days the PC is on. It is a built-in routine and shows in the Routines list as "Morning brief" (J14).
**Rule:** a few cards, then it ends. Never a feed (ChatGPT Pulse "that's it for today", GPT §4, §9.9; Gemini Daily Brief, GEM §9.8).

### Steps
1. **07:45** foo starts a background job "Morning brief" (no checklist shown; the user did not ask). It reads: Calendar (today + tomorrow), Gmail since the last brief, WhatsApp mentions of the user's name and starred chats, open jobs, routines that found something, helper notes (bills, trips), weather for the user's city.
2. It scores items with a fixed order: (1) things that need the user today, (2) money due within 3 days, (3) people (birthdays within 7 days), (4) trips and bookings within 7 days, (5) one "nice to know". It keeps **3 to 5** cards. If fewer than 2 items qualify, it sends a one-line brief instead (step 6).
3. **08:00** foo posts one message in its own chat, with a date divider "Today 8:00":
   ```
   ☀️ Good morning, {Vikas}                                    morning brief
   ┌ Mom's birthday is Saturday. Cake ordered?        [ Yes, from Theobroma ]  [ Not yet ]   👍 👎
   ├ Airtel bill ₹1,179 due Friday. Sent to Money.    [ Open Money ]                          👍 👎
   ├ Goa: hotel prices dropped 18% for 12 Dec.        [ Show me ]                             👍 👎
   └ That's all for today · 👍 👎     ·  Tomorrow, more of / less of… [ type ]
   ```
   - Each card: one line of headline, at most one action button, and 👍 👎. The action is a suggestion; it starts a normal job or opens a chat, it never acts on its own.
   - "Sent to Money" means a handoff marker (C15) was posted in the Money chat.
4. Toast (only if the window is not focused, and not in quiet hours): "{foo} · Good morning. 3 things today." [ Open ]
5. **Feedback**:
   - 👍 / 👎 on a card: the icon fills in; nothing else happens. Stored for tomorrow's scoring.
   - 👎 twice on the same kind of card (e.g. weather) within 7 days → foo asks once, inline under the brief: "Stop showing weather in your brief?" [ Yes, stop ] [ Keep it ]
   - "more of / less of…" text: saved verbatim; next brief obeys it. foo confirms with a 👍 reaction on the user's text, no reply message (Instinct reaction instead of reply, INS2 §A).
   - 👍 / 👎 on the whole brief ("That's all for today" line): stored.
6. **Light day**: "☀️ Good morning, {Vikas}. Nothing needs you today. Enjoy it." (no cards) · 👍 👎
7. Unopened brief: at 8:00 PM the brief dims and shows "Expired · open anyway" (Pulse cards expire after 24 h, GPT §4) `[foo decision: 12 h]`.

### Branches
| Case | What happens | Exact copy |
|---|---|---|
| PC was off/asleep at 8:00 | Runs on wake if before 12:00 PM; header gets a note | "☀️ Good morning, {Vikas} · late because your PC was asleep at 8:00" (Tab gap reporting, TAB §9.7; Cowork missed runs, CWK §9.8) |
| PC wakes after 12:00 PM | Skipped; one line instead | "I skipped this morning's brief because your PC was off. Want it now?" [ Yes ] [ Skip today ] |
| Gmail connection expired | Brief still sends; last card | "I couldn't read your Gmail today. [ Reconnect Gmail ]" |
| AI offline / limit hit at 07:45 | Retries every 5 min until 8:30; then brief without AI ranking (calendar + bills from cache, plain list) with footer | "Short brief today: your AI wasn't answering." |
| Spend cap reached | Brief still runs using cached data only, no AI | Footer "Short brief today: you've reached this month's AI cap. [ Change cap ]" |
| Quiet hours set to end after brief time | Brief waits until quiet hours end | — |
| User tapped "Don't send one" in J4 | Routine exists but paused; shows in Routines as Paused | — |
| Action button tapped ("Show me") | Normal job starts in the right chat (Goa → Trips chat) | Handoff marker in foo chat: "Opened in Trips" |
| User replies in chat to a card (swipe-reply) | Treated as a message about that card (Poke inline reply, POK §9.12) | — |

### Stored
- `routines\morning-brief.json` (time, last run, run history).
- `memory\preferences\brief.md`: verbatim "more of / less of" lines, card-type scores, hidden card types.
- Activity log: "brief sent, 3 cards". Brief content stays in `foo.db` only.

### Notifications
Toast at brief time (window not focused, outside quiet hours). Taskbar badge: none (nothing is waiting). Unread count on the foo chat row: 1.

### Acceptance criteria
- **Given** 9 candidate items, **then** the brief shows at most 5 cards and always ends with "That's all for today".
- **Given** the user taps 👎 on the weather card on two days within a week, **then** foo asks once whether to stop showing weather, and never asks again if the answer is "Keep it" (G15).
- **Given** the PC was asleep at 8:00 and wakes at 9:10, **then** the brief arrives within 2 minutes of wake and says it is late and why.
- **Given** a brief card has an action button, **when** the user does nothing, **then** no job starts.

Sources: ChatGPT Pulse finite cards + 👍/👎 + curate (GPT §5, §9.9); Gemini Daily Brief learns from approve/disapprove (GEM §4, §9.8); Instinct 7am brief (INS2 §D); Autopilot Today digest (APL §9.6); Tab and Cowork missed-run honesty (TAB §9.7, CWK §9.8); Poke noise lesson (POK §8).

---

## J7. Casual chat, including voice notes in and out

**Trigger:** the user types or speaks to foo (or a helper) with no task in it ("morning!", "what's the capital of Peru", "ugh long day").

### Steps (typed)
1. User sends text. Badge 👀 within 1 s.
2. If a reply would only be noise ("thanks!", "ok", "👍", "cool"), foo **reacts** with 👍 (or ❤️ for thanks with warmth) on the user's bubble and sends nothing (Instinct, INS2 §A.2; Poke, POK §5). Badge disappears.
3. Otherwise: "typing…" under the chat name, then 1 to 3 short bubbles, split at paragraph breaks, 0.8–2.5 s apart (OpenClaw chunking + pacing, OCL §5.2, §9.13). Lists stay in one bubble (Poke block grouping, POK §9.13). Tables become "label: value" lines (OCL §5.1).
4. **Style mirroring**: foo matches the user's casing, length and emoji density from their last 20 messages, but never repeats the user's own recent emojis or slang (Poke, POK §3, §9.5). The vibe from J3 sets the base tone.
5. **No filler**: never "Great question", "How can I help you", "I apologize for the confusion" (Poke tone rules, POK §6; Hermes SOUL, HRM §6).
6. Reply-to: the user can hover a bubble → "↩ Reply" (or swipe right) to quote it. foo treats the quoted bubble as the subject.

### Steps (voice note in)
1. User **holds Ctrl+Space** (anywhere while foo's window is focused) or holds the 🎙 button. Composer turns into a recording bar: red dot, timer "0:03", text "Release to send · slide left to cancel" (mouse) / "Release to send · Esc to cancel" (keyboard).
2. Release → a voice-note bubble from the user (waveform, length "0:14", ▶). Under it, in grey, the transcript appears within 3 s (collapsed to 2 lines, "more").
3. Transcription runs on the PC first (local speech-to-text) `[foo decision: local first for privacy]`; if local fails, foo uses the user's AI if it can take audio. foo then handles the transcript exactly like typed text (OpenClaw voice note in, OCL §4).
4. A spoken "stop", "cancel" or a helper's name works the same as typed (OCL §4).

### Steps (voice note out)
1. Setting "Voice replies" (Settings → Chat): **"When I send voice"** (default) / "Always" / "Never" (OpenClaw `tts.auto: inbound`, OCL §9.10).
2. When on, foo replies with a voice bubble **and** the same text underneath (collapsed). Voice bubble: ▶ / ⏸, waveform, length, speed chip 1× / 1.5× / 2×; while playing, the matching word in the text highlights (Grok voice memo, GRK §2 row 18, §5.13).
3. foo skips voice for replies that are mostly numbers, links, addresses or longer than 60 s of speech; it says in text "(Too long to read out, here it is in text.)".
4. Voice bubbles never auto-play. Exception: none.

### Branches
| Case | What happens | Exact copy |
|---|---|---|
| Microphone blocked in Windows privacy settings | Recording bar does not start; card | "I can't hear you. Windows is blocking the microphone for foo." [ Open microphone settings ] |
| No microphone found | Same card | "I can't find a microphone. Plug one in and try again." |
| Recording < 0.5 s | Discarded silently, tooltip | "Hold to record" |
| Recording hits 5 min | Auto-stops and sends | Bar shows "5:00 max" |
| Transcription fails | Voice bubble stays, transcript line | "I couldn't make out that voice note. Try again, or type it." [ ▶ ] stays playable |
| Transcription is low-confidence | foo answers but shows its reading | "I heard: '{text}'. Right?" [ Yes ] [ No, let me retype ] |
| Text-to-speech fails | Text reply only, no error card | — |
| AI offline | User's bubble gets ⏳ and the queued note "I'll answer when your AI is back." (J19) | — |
| User sends a message that contains a task | Becomes a job (C1 🛠, C2 checklist) | — |
| User sends a secret-looking string | Paste catcher (C8) | — |
| User says something that sounds like a memory ("I'm vegetarian on Tuesdays") | foo replies normally and adds a Memory chip | "🧠 Saved: Vegetarian on Tuesdays · Undo" |
| User sends a photo / file / link | Accepted (≤ 25 MB per file, 6 at once); foo reads it and answers | Too big: "That file is too big. I can take up to 25 MB." |

### Stored
- Messages in `foo.db`. Voice notes as `.ogg` in `data\voice\` (deleted after 30 days unless pinned) `[foo decision]`. Transcripts in `foo.db`.
- Memory chips write to `memory\about-you.md` with `source: you-said`.
- Style stats (casing, average length, emoji rate): `memory\preferences\style.md`.

### Notifications
Only if the window is not focused: toast with foo's first reply line. Voice replies show "🎙 Voice note (0:12)" in the toast, never auto-play.

### Acceptance criteria
- **Given** the user sends "thanks!", **then** foo adds a 👍 reaction and posts no message.
- **Given** the user holds Ctrl+Space for 4 s and releases, **then** a voice bubble and its transcript appear, and foo's reply is a voice bubble plus text (default setting).
- **Given** Windows blocks the mic, **then** the card has one button that opens the exact Windows microphone privacy page.
- **Given** a 200-word answer, **then** it arrives as at most 3 bubbles, with no bubble splitting a list.
- **Given** foo's reply, **then** it contains none of the banned filler phrases.

Sources: Instinct reaction-instead-of-reply and voice notes (INS2 §A, INS §2); Poke mirroring and bursts (POK §3, §5, §9.5, §9.13); OpenClaw voice in/out and chunking (OCL §4, §5.2, §9.10, §9.13); Grok voice memo with highlighted transcript and Ctrl+D dictation (GRK §2, GRK2); Hermes voice replies (HRM §4).

---

## J8. Asking a question with choice chips

**Trigger:** inside any job, foo is missing one piece of information it cannot fill from memory, or there are 2+ reasonable routes.
**Rule:** fill silently from memory first, then ask **one** question per missing item (Instinct silent defaults, INS §1.2).

### Steps
1. Job → NEEDS YOU. Badge ✋. Checklist current line: "✱ Waiting for you to pick".
2. foo posts a Choice card (C3). Example:
   ```
   Which flight time works for Delhi on Friday?
   [ ★ 10:15 · IndiGo · ₹5,240 ]   Best fit
   [ 7:10 · Air India · ₹4,890 ]
   [ 18:40 · Vistara · ₹6,100 ]
   [ Something else… ]                     Skip
   ```
   - Best fit comes from memory ("hates early flights", you said, 3 Oct) and shows a Memory chip "Used: hates early flights ✕".
   - foo's own text above the card does not repeat the options (Hermes rule, HRM §6).
3. User taps an option → card collapses to "Which flight time works for Delhi on Friday? → 10:15 · IndiGo". Job → WORKING.
4. Multi-question: if foo needs 2–3 answers at once, the card becomes a stepper "1 of 3" with one question at a time and Back (OpenClaw stepper, OCL §5.4). Max 3 questions per card.
5. Multi-select variant (e.g. "Which of these subscriptions do you still use?"): checkboxes plus [ Done ] (Grok question card, GRK §2 row 5).

### Timeout rules `[foo decision, from OpenClaw 900 s default and Hermes fail-closed]`
| Question kind | After 15 min | After 24 h |
|---|---|---|
| Preference that is reversible (which format, which order, which summary length) | foo uses Best fit and says "I went with {option} since I didn't hear back. Say the word if you want another." (OpenClaw `no_answer` → best judgment, OCL §4) | — |
| Anything that leads to a send, booking, payment, or a choice between real-world options (flights, hotels, tables) | No auto-pick. One reminder toast: "{Trips} · Still need your pick for Delhi flights." | Job → CANCELLED with "I stopped the Delhi flight search because I didn't hear back. Options change fast, so ask me again when you're ready." [ Search again ] |
| Options with live prices | If the user answers after 30 min, foo re-checks prices before continuing: "Checking those prices are still right…" | — |

### Branches
| Case | What happens | Exact copy |
|---|---|---|
| "Something else…" | Composer focused, hint "Tell me what you want instead"; the user's typed answer collapses the card | "{question} → {typed text}" |
| Skip | foo uses Best fit if reversible, else asks "Okay. Should I stop this job, or do you want to decide later?" [ Decide later ] [ Stop it ] | — |
| User types "2" or "the 7:10 one" | Same as tapping option 2 | — |
| User reacts 2️⃣ on the card | Same as tapping option 2 | — |
| User asks a question instead ("which one has free meals?") | foo answers in one bubble and re-posts the same card below | — |
| Picked option no longer available when foo continues | New card: "That 10:15 flight just sold out. Here's what's left:" + fresh options | — |
| Window closed | Toast with up to 2 option buttons (J20): body "Which flight time works for Delhi on Friday?" buttons [ 10:15 IndiGo ] [ Open ] | — |

### Stored
- Answer in `foo.db` (card row). If the answer reveals a lasting preference (picked late flights 3 times), foo may add "I guessed" memory and show a Memory chip (J17).
- `jobs\{id}\plan.md` updated with the decision.

### Notifications
Toast when NEEDS YOU and window not focused (J20). Taskbar badge yellow while any choice is open. Chat list pill "Needs you".

### Acceptance criteria
- **Given** foo has 3 options, **then** the card shows exactly 3 options plus "Something else…" and Skip, with option 1 tagged "Best fit".
- **Given** a reversible-preference question with no answer for 15 minutes, **then** foo picks Best fit and says so in one line.
- **Given** a flight-choice question with no answer, **then** foo never picks for the user and cancels after 24 h with a "Search again" button.
- **Given** the user types "2", **then** the card collapses exactly as if option 2 had been tapped.

Sources: OpenClaw ask_user (OCL §4, §5.4, §9.4); Hermes clarify and "never list options in text" (HRM §4, §6, §9.10); Cowork decision card with recommended option (CWK §5, §9.2); Instinct silent defaults then one question (INS §1.2); Grok question card multi-select (GRK §2).

---

## J9. Restaurant booking

**Trigger:** the user says, e.g., "book a table for 4 at a good Italian place in Bandra, Saturday 8pm". (If the user says "check" / "find" / "any tables…", foo runs the same search but stops at step 5 and asks "Want me to book one?" — G3.)

### Steps
1. Badge 👀 → 🛠. foo reads memory: diet (vegetarian on Tuesdays — not relevant on Saturday), preferred areas, past restaurants, budget, family size. Missing pieces → one Choice card each (J8). Here nothing is missing.
2. Checklist (C2), title "Table for 4 · Sat 18 Oct, 8:00 PM":
   - ✓ Checked Zomato, EazyDiner and restaurant sites
   - ✓ Kept 3 Italian places in Bandra with tables near 8:00
   - ✱ Waiting for you to pick one
   - ○ Book and add to your calendar
   Route order: an app connection if one exists → foo's browser on booking sites → the restaurant's own site → email to the restaurant (needs a fresh yes, G8) → hand back to the user (Instinct ordered fallbacks, INS §5.8; Cowork tool ladder, CWK §9.3). Phone calls are **not in v1** (blueprint "Later").
3. Options card (C3 with photos, Instinct picture bubbles, INS §5.9; Perplexity one-action cards, PPX §9.4):
   ```
   Pick a table · Sat 18 Oct
   [ photo ] ★ Pizza by the Bay · 8:00 PM · ₹₹ · 4.4★          Best fit
   [ photo ]   Bastian · 8:30 PM · ₹₹₹ · 4.5★
   [ photo ]   Gigi · 7:45 PM · ₹₹ · 4.3★
   [ Something else… ]
   ```
4. User taps Pizza by the Bay. foo re-checks the slot is still free (≤ 10 s).
5. Approval card (C4, booking variant, Tab/Instinct exact terms):
   ```
   🍽 Book this table?
   Pizza by the Bay, Marine Drive · Sat 18 Oct, 8:00 PM · 4 people
   Booked under: Vikas Sharma · +91 98••• ••210
   Charged now                         ₹0
   No-show fee                         ₹1,000
   Free to cancel until Sat 18 Oct, 6:00 PM
   [ Book it ]   [ Change ]   [ No ]
   Expires 7:52 PM · If you don't answer, I won't book it.
   ```
   - Name and phone come from memory; sharing the user's phone with a restaurant is a G5 hard limit, so no scope chips and the footer says "I'll always ask for this one."
6. Tap "Book it" → second look (G17) passes → foo completes the booking on the site → checklist ticks "✓ Booked".
7. Result message:
   "Booked. Pizza by the Bay, Sat 18 Oct, 8:00 PM, table for 4. Added to your calendar."
   Proof chip "✓ Confirmation #PB-4471 · screenshot". Buttons: [ Tell the Family group ] [ Cancel booking ].
   Calendar event created with the address, confirmation number and "Free to cancel until 6:00 PM".
8. "Tell the Family group" → Draft card (C6, WhatsApp) "Dinner Saturday 8 PM at Pizza by the Bay, Marine Drive 🍕" → Send → sent from the user's WhatsApp.
9. Reminders: Sat 18 Oct, 4:00 PM (2 h before the free-cancel cutoff): "Dinner at Pizza by the Bay tonight at 8. Free to cancel until 6:00 PM." [ Keep it ] [ Cancel booking ] (Instinct reminds about reservations, INS §1.6).

### Branches
| Case | What happens | Exact copy |
|---|---|---|
| User said "check" or "find" | Stops after options | "These have tables. Want me to book one?" (options card stays) |
| No tables near 8:00 | Choice card | "Nothing free at 8:00 in Bandra. Closest options:" [ ★ 7:00 PM · Gigi ] [ 9:30 PM · Bastian ] [ Try another area ] |
| Site blocks foo (bot check, "access denied") | foo tries the next route; writes site note | Checklist: "✓ Zomato blocked me, trying EazyDiner". If all routes blocked: "These sites won't let me book. Want to do it yourself? I'll open the page." [ Open the page ] [ Email the restaurant ] |
| Email route chosen | G8 fresh yes | Draft card to the restaurant's email "Table for 4 on Sat 18 Oct at 8:00 PM, under Vikas Sharma, +91 98••• ••210." + "Can't be unsent." |
| Site needs sign-in | J13 sign-in card | "EazyDiner wants you to sign in. Do it here and I'll carry on." |
| Site needs a card for the no-show hold | Payment card variant with "Charged now ₹0 · Held on card ₹1,000 if you don't show" and the saved card picker; if no card saved: Secret box for card (J13 lane: card) | "This place holds ₹1,000 on a card in case of a no-show. Nothing is charged now." |
| Slot taken between pick and Book it | Card → SUPERSEDED | "That 8:00 table just went. Here's what's left:" + new options |
| No-show fee or terms changed before booking | Card → SUPERSEDED, new card | "The no-show fee changed from ₹1,000 to ₹1,500, so I stopped. See the new card below." |
| Approval expires | Card → EXPIRED | "This expired at 7:52 PM. Nothing was booked." [ Ask me again ] |
| User taps No | DECLINED; job → CANCELLED | "Okay, I won't book it." |
| Booking submitted, site shows no confirmation | CHECKING: foo looks for the confirmation email for 10 min | "I'm not sure the booking went through. Checking your email before doing anything else." Then either proof, or "I couldn't confirm it. Call them on {phone} to check." (the user calls, not foo) |
| Offline mid-job | WAITING | "You're offline. I'll carry on when you're back." |
| Cancel booking (later) | Approval card | "❌ Cancel your table at Pizza by the Bay? Free to cancel until 6:00 PM today. After that it costs ₹1,000." [ Cancel booking ] [ Keep it ] |

### Stored
- `jobs\{id}\` plan, state, screenshots (password fields masked).
- Calendar event in the user's Google Calendar.
- `logs\activity-*.jsonl`: "booked Pizza by the Bay, Sat 18 Oct 8 PM, #PB-4471, approved {time}".
- `sites\zomato.com.md` / `sites\eazydiner.com.md`: "blocked automation on {date}" or "booking works, needs sign-in".
- Memory (I guessed): "Likes Italian in Bandra (from 1 booking)" only after 2+ similar bookings `[foo decision]`.
- Trips/Home helper notes: upcoming booking with cancel cutoff.

### Notifications
- NEEDS YOU (options, approval) → toast + yellow taskbar badge (J20).
- DONE → toast "{foo} · Booked: Pizza by the Bay, Sat 8:00 PM" [ Open ] + green check badge for 30 min or until the window is focused.
- Cancel-cutoff reminder at 4:00 PM on the day.

### Acceptance criteria
- **Given** "are there tables at an Italian place in Bandra Saturday", **then** foo shows options and never shows a Book it card until the user says book or taps an option and then Book it.
- **Given** the user taps Book it, **then** the booking is submitted at most once, and the result message carries a confirmation number or screenshot.
- **Given** the no-show fee changes between card and submit, **then** nothing is booked and a new card shows the new fee.
- **Given** all booking sites block foo, **then** foo offers "Open the page" and "Email the restaurant", and never emails without a fresh Approval tap.
- **Given** a booking with a free-cancel cutoff, **then** a reminder arrives 2 h before the cutoff.

Sources: blueprint "How foo books something" (ask → choose → approve → proof); Instinct booking flow, no-show card link and $200-fee lesson (INS §1.1–1.6, §5.1–5.2, §5.8–5.11); Perplexity Reserve card (PPX §4, §9.4); Tab exact terms and proof (TAB §9.2–9.3); Cowork tool ladder (CWK §9.3); Tab fresh yes before channel switch (TAB §9.14).

---

## J10. Hotel booking with payment approval

**Trigger:** "ok book the Goa hotel then, under ₹8k a night, near the beach" (blueprint hero example), usually after the brief card "Goa: hotel prices dropped 18%".

### Steps
1. Message goes to the foo chat; foo hands it to Trips: handoff marker in foo chat "foo asked Trips to book your Goa stay"; the job runs in the Trips chat (J15). The foo chat keeps a link card "Booking your Goa stay · in Trips" that mirrors the checklist state.
2. Plan card (C11) because this is long and involves money:
   ```
   🗺 My plan · Goa stay, 12–14 Dec
   1 Check Booking.com, MakeMyTrip and hotel sites
   2 Keep 3 under ₹8,000 a night, under 5 min walk to the beach
   3 Show you before booking anything
   About 6 minutes · uses about ₹4 of your AI
   [ Go ]   [ Change plan ]
   ```
   `[foo decision: plan card shown for jobs estimated > 2 min or > ₹5 of AI; this one is > 2 min]`
3. Go → checklist (C2):
   - ✓ Checked Booking.com, MakeMyTrip, hotel sites
   - ✓ Kept 3 that fit ₹8k and beach under 5 min
   - ✱ Waiting for you to pick one
   - ○ Book and add to your calendar
4. Options card with photos:
   ```
   Pick a stay · 12–14 Dec
   [ photo ] BEST FIT  Taj Holiday Village · ₹7,300/night · 2 min walk · free cancellation
   [ photo ]           W Goa · ₹7,950/night · 4 min walk
   [ photo ]           Ronil Beach · ₹4,100/night · 3 min walk
   [ Something else… ]
   ```
5. User taps Taj. foo opens the checkout on the cheapest site that offers free cancellation, fills guest details from memory (name, email, phone: phone is a G5 item and is listed on the payment card), and stops before the pay button.
6. Payment card (C5):
   ```
   💳 Approve this payment                                    one-time
   Taj Holiday Village, 2 nights (12–14 Dec)          ₹14,600
   Taxes and fees                                     ₹0 (included)
   Free cancellation until Wed 10 Dec                 ₹0
   Total charged once                                 ₹14,600
   Booked under Vikas Sharma · vikas@… · +91 98••• ••210
   Pay with: Visa ••4242  (change)
   [ Approve ₹14,600 ]   [ Not now ]
   foo never sees your card · Expires in 10:00
   ```
7. Approve → because ₹14,600 ≥ ₹10,000 Big-payment limit, Windows Hello sheet: "Confirm it's you to pay ₹14,600 to Taj Holiday Village" (face / fingerprint / PIN).
8. Second look (G17) passes. foo fills the saved card directly from the vault into the checkout page (the AI only knows "Visa ••4242") and clicks Pay **once**.
9. Bank asks for an OTP (3-D Secure) → J13 code lane: "Your bank sent a code to +91 98••• ••210. Type it on the bank's page." Live window opens on the bank page. User types the OTP there, taps "I'm done".
10. Proof: foo waits for the hotel's confirmation page and the confirmation email.
11. Result in Trips chat and mirrored in foo chat:
    "Booked. Taj Holiday Village, 12–14 Dec, 2 nights, ₹14,600 paid. Added to your calendar."
    Proof chip "✓ Proof: booking #TJ88213 · email from MakeMyTrip". Receipt footer (C12).
    Calendar: "Taj Holiday Village" 12 Dec check-in 2:00 PM to 14 Dec check-out 11:00 AM, address, booking number, "Free cancellation until Wed 10 Dec".
12. Reminder: Tue 9 Dec, 10:00 AM: "Last day tomorrow to cancel the Goa stay for free. Keep it?" [ Keep it ] [ Cancel stay ].

### Branches
| Case | What happens | Exact copy |
|---|---|---|
| Price changed at checkout (any amount, up or down) | Card → SUPERSEDED, no payment | "The price changed from ₹14,600 to ₹15,180 at checkout, so I stopped. Nothing was paid." + new Payment card with ₹15,180 |
| Taxes appear only at the last step | Same as price changed | "Taxes of ₹1,752 showed up at the last step, so I stopped. Nothing was paid." |
| Approval expires (10 min) | EXPIRED; checkout abandoned | "This expired at 9:58 AM. Nothing was paid." [ Ask me again ] (Ask again re-checks the live price first) |
| Not now | DECLINED | "Okay, I won't pay. The 3 options are still above if you change your mind." |
| Windows Hello cancelled or failed | Card stays PENDING | "I need you to confirm it's you before paying. [ Try again ]" |
| No card saved | Secret box for a card (secure form lane, J13) before the Payment card | "To pay, I need a card. Type it here, not in the chat." Fields: Card number, Expiry, CVV (never saved), Name on card. "✓ Visa ••4242 saved. foo's AI never sees it." |
| User prefers UPI | Pay with: UPI → the site's UPI flow; J11 UPI step | "Approve ₹14,600 in your UPI app within 5 minutes." |
| OTP not entered in 5 min | Bank page times out → payment FAILED | "Your bank's code timed out. No money was taken." [ Try again ] |
| Payment declined | FAILED | "Your bank said no. No money was taken." [ Try another card ] [ Pay with UPI ] |
| Submit result unknown (window closed, crash, network drop) | CHECKING; no retry | "I'm not sure the payment went through. Checking your email and the site before doing anything else." |
| CHECKING finds proof | COMPLETED | normal result message |
| CHECKING finds nothing in 15 min | FAILED | "I couldn't confirm it. Check your bank app before trying again." [ I checked, try again ] |
| Site needs sign-in (MakeMyTrip account) | J13 | "MakeMyTrip wants you to sign in. Do it here and I'll carry on." |
| Site blocks automation | Next site; if none: "These sites won't let me book. I'll open the Taj's page so you can book it yourself. I'll add it to your calendar after." [ Open the page ] |
| Only non-refundable rates left | Card shows the term in red | "No free cancellation. If you cancel, you lose ₹14,600." |
| User changes mind mid-job ("actually make it 12–15") | Steer (G11) | "Got it, I'll fold that in." Checklist restarts at step 1 with the new dates |
| Monthly AI spend cap hit mid-search | WAITING (J19) | — |

### Stored
- Trips helper: `helpers\trips\notes.md`: "Goa stay booked 12–14 Dec, Taj, #TJ88213, free cancel until 10 Dec".
- Vault: `foo/card/visa-4242` (number, expiry, name; CVV is never stored).
- Activity log: payment line with merchant, amount, approval id, Windows Hello used = yes, proof id.
- Memory (I guessed, from ≥ 2 trips): "Budget trips under ₹40k" — shown with "I guessed · from 2 trips".
- Screenshots: card fields masked, OTP page not screenshotted `[foo decision]`.

### Notifications
- Payment card while window closed → toast with **[ Review ] [ Not now ]**; Review opens a small always-on-top receipt window with the full card (J20). Payments are never approved straight from a toast button.
- Done → toast "Trips · Booked: Taj Holiday Village, 12–14 Dec. ₹14,600 paid." + green badge.
- Free-cancel reminder the day before the cutoff.

### Acceptance criteria
- **Given** an approved total of ₹14,600, **when** checkout shows ₹14,601, **then** nothing is paid and a new Payment card shows ₹14,601.
- **Given** a total ≥ ₹10,000, **when** Approve is tapped, **then** Windows Hello is required before any payment is submitted.
- **Given** the Pay click succeeded but the confirmation page never loaded, **then** foo never clicks Pay again and enters CHECKING.
- **Given** a completed payment, **then** the activity log has exactly one payment entry with the approval id, and the result carries a booking number or confirmation email.
- **Given** any screen or log, **then** no full card number, CVV or OTP appears anywhere.

Sources: blueprint Goa example (choices, payment card, "charged once"); Tab payment binding, submit once, stop on change (TAB §2, §9.2); Instinct Stripe Link 10-minute approval, price-raise re-approval, 3-D Secure (INS §1.4); Grok spend card "no charge was made" (GRK §2 row 12); Perplexity plan + cost card and on-device approval (PPX §9.1, §9.9); Muse single-use card (MUS §9.9); Manus take over for 2FA (MNS §9.1).

---

## J11. Bill reminder and payment

**Trigger A (found):** the morning brief or a Gmail scan finds a bill email (Airtel, BESCOM, credit card).
**Trigger B (asked):** "remind me to pay Airtel every month".
**Trigger C (habit):** the user asked to pay the same bill 3 months in a row → routine offer.

### Steps
1. foo hands the bill to Money (handoff marker: "foo asked Money to look after your Airtel bill"). Money chat posts:
   ```
   Airtel bill ₹1,179 due Fri 17 Oct.
   From your email on 9 Oct · account ••7741
   [ Pay now ]   [ Remind me Thursday ]   [ I already paid ]
   ```
   Proof chip "✓ From: Airtel email, 9 Oct · open".
2. "Remind me Thursday" → one-off reminder Thu 16 Oct, 10:00 AM: "Airtel ₹1,179 is due tomorrow." [ Pay now ] [ I already paid ].
3. "Pay now" → Money checks the live amount on Airtel's site (sign-in via J13 if needed) and shows the Payment card (C5):
   ```
   💳 Approve this payment                                    one-time
   Airtel postpaid ••7741, bill for Sep                 ₹1,179
   Late fee if paid after Fri 17 Oct                   ₹100
   Total charged once                                  ₹1,179
   Pay with: UPI vikas@okhdfc  (change)
   [ Approve ₹1,179 ]   [ Not now ]
   foo never sees your bank details · Expires in 10:00
   ```
4. Approve (below ₹10,000, so no Windows Hello). Money starts the UPI payment on Airtel's site. Card line changes to: "Approve ₹1,179 in your UPI app on your phone. Waiting… 4:58" `[foo decision: UPI collect request approved by the user on the phone counts as the bank's own second check]`.
5. User approves in GPay/PhonePe. Airtel shows success.
6. Result: "Paid. Airtel ₹1,179 for September." Proof chip "✓ Proof: Airtel receipt #AT-55120 · screenshot". The brief tomorrow will not mention it again.
7. **Habit offer** (3rd month in a row of paying the same bill through foo): Money posts once:
   "You've asked me to pay the Airtel bill three months in a row. Want me to just remind you and get it ready each month?"
   [ Yes, every month ] [ No thanks ]
   - Yes → Routine (C13): "Checks: your Airtel bill email · How often: monthly, when the bill arrives · Tells you: amount and due date, with Pay now ready · Where: Money chat + toast · Next run: when November's bill arrives". **It never pays by itself**: each month still ends in a Payment card.
   - No thanks → never asked again (G15).

### Branches
| Case | What happens | Exact copy |
|---|---|---|
| "I already paid" | Money checks for a payment email/receipt; marks paid | Found: "Got it, I see the payment on 12 Oct. ✓" Not found: "Okay, marked as paid. I couldn't see a receipt, so I'll trust you on this one." |
| Live amount differs from the email | Card shows the live amount and a line | "The bill email said ₹1,179; Airtel's site now says ₹1,279 (includes a late fee). I'm using the site's amount." |
| Amount changes after Approve, before submit | SUPERSEDED | "The amount changed from ₹1,179 to ₹1,279, so I stopped. Nothing was paid." + new card |
| UPI request not approved in 5 min | FAILED | "Your UPI app didn't get an approval in time. No money was taken." [ Try again ] |
| UPI declined / insufficient balance | FAILED | "Your bank said no. No money was taken." [ Try again ] [ Pay with card ] |
| No UPI ID saved | Ask once | "Which UPI ID should I use?" field (not secret) + [ Save ]. Stored in settings, shown masked "vik•••@okhdfc" |
| Airtel sign-in needed | J13 | "Airtel wants you to sign in. Do it here and I'll carry on." |
| Bill already overdue | Red line on the card | "This was due Fri 17 Oct. Airtel adds ₹100 late fee." |
| Duplicate risk (paid 2 days ago for same bill) | Hard stop before card | "You paid Airtel ₹1,179 on 12 Oct. Pay again anyway?" [ Don't pay ] [ Pay again ] (pay again then shows the normal card) |
| Unknown sender or scam-looking bill ("pay to this link") | Never offers Pay now | "This bill email looks odd: it asks you to pay through a link that isn't Airtel's site. I won't pay it. [ Show me the email ]" |
| Gmail not connected | Trigger A impossible; Trigger B works as plain reminders | "I'll remind you on the 15th each month. Connect Gmail and I can tell you the amount too. [ Connect Gmail ]" |

### Stored
- `helpers\money\notes.md`: biller, account (last 4), usual amount, due day, last paid date + receipt id.
- `settings.json`: UPI ID (masked in UI), default payment method.
- Routine file if accepted. Activity log payment line.
- Memory: nothing in about-you; bills live with Money.

### Notifications
- Reminder toast at the chosen time: "Money · Airtel ₹1,179 is due tomorrow." [ Pay now ] [ Later ] — Pay now opens the receipt window, never pays.
- Waiting-for-UPI state: taskbar yellow; toast "Money · Approve ₹1,179 in your UPI app." (no buttons).
- Done toast.

### Acceptance criteria
- **Given** a bill email for ₹1,179 and the site shows ₹1,279, **then** the Payment card shows ₹1,279 and says why.
- **Given** the user paid the same bill 2 days ago, **then** foo shows the duplicate warning before any Payment card.
- **Given** the user accepts the monthly routine, **then** each month produces a Payment card and never a payment without one.
- **Given** a bill email asking to pay via a non-biller link, **then** foo offers no Pay button.
- **Given** "No thanks" to the habit offer, **then** the offer never appears again for that bill.

Sources: blueprint Money helper + Airtel example + "Offer to make it a habit"; OpenClaw promotion of repeated asks (OCL §2.6, §9.9); Hermes never re-offer (HRM §9.8); Tab bills fetched behind logins and payment binding (TAB §3, §4, §2); Instinct subscriptions and approval (INS §1.1); Grok "no charge was made" (GRK §2).

---

## J12. Drafting and sending an email or an X post

**Trigger:** "reply to my landlord saying I'll pay rent on Monday", "email Rohit the Goa dates", or "write an X post about the Goa trip". Also: a brief card "Draft reply".
**Rules:** G4 (a draft is never permission), G17 (second look), G8 (new recipient = fresh yes). **X posting in v1 is draft-only**: foo opens X with the text filled in and the user presses Post themselves (Grok drafts on X and never posts by itself, GRK §0.7, §3.1; blueprint "X and Instagram posting: later").

### Steps (email)
1. foo finds the thread (Gmail search "landlord" → the last thread with r.sharma@gmail.com). If 2+ people could be "my landlord", Choice card: "Which one is your landlord?" with names + emails (never guess a recipient).
2. Draft card (C6):
   ```
   📝 Draft · not sent                                          Email
   To: Rakesh Sharma <r.sharma@gmail.com>
   Subject: Re: October rent
   Hi Rakesh, I'll pay October's rent on Monday 20 Oct. Thanks for your patience. Vikas
   [ Send ]   [ Change ]   [ Discard ]
   ```
   - Written in the user's style (length, greeting, sign-off copied from their last 10 sent emails) and with their Gmail signature (Grok signature/send-as, GRK §3.2).
3. "Change" → inline editing in the card, or the user types "make it more formal"; the same card updates in place, with a small "edited" label.
4. Send → this recipient has been emailed by the user before, so Send is the approval (C6 rule). The card shows the Approval footer inline for 1 s: "Will send to r.sharma@gmail.com from your Gmail. Can't be unsent." then a 5-second bar "Sending… [ Undo ]" `[foo decision: 5-second local undo window before the send is actually handed to Gmail]`.
5. Second look (G17): checks the recipient and the date ("Monday 20 Oct") against the user's words. Passes.
6. Sent. Card header turns to "✓ Sent · 9:14 AM". Proof chip "✓ Proof: in your Gmail Sent folder · open".
7. Scope (only after the first send to a person): a quiet line under the sent card: "Next time, send emails to Rakesh without asking?" [ Keep asking ] [ Don't ask for Rakesh ] → the latter stores a rule "send email · r.sharma@gmail.com · always" (never for new people, never for attachments with personal documents) `[foo decision: offered once per person, G15]`.

### Steps (new recipient)
- Recipient never emailed before → Send opens a full Approval card (C4):
  "✉ Send this email to Priya Nair? / Will send to priya.n@company.com from your Gmail. You haven't emailed her before. Can't be unsent." [ Send ] [ Edit ] [ No ] — no scope chips (G5 "messaging someone new").

### Steps (X post)
1. Draft card (C6, X variant):
   ```
   📝 Draft · not sent                                          X post
   Just booked Goa for December. Any beach shack I can't miss? 🌴
   212 characters left
   [ Open in X to post ]   [ Change ]   [ Discard ]
   ```
2. "Open in X to post" opens x.com's compose page in the user's default browser with the text filled in. foo says: "It's ready in X. Press Post there when you're happy." The card shows "Opened in X · not posted by foo".
3. foo does not check whether it was posted; the card stays "Opened in X". (No proof chip: foo did not do the action.)

### Steps (WhatsApp message)
Same as email, Draft card with "To: Mom (WhatsApp)". Send = approval for known chats; for groups and new numbers, full Approval card. Sent from the user's linked WhatsApp. Proof: "✓ Delivered" ticks read from WhatsApp.

### Branches
| Case | What happens | Exact copy |
|---|---|---|
| User says "send it" in chat instead of tapping | G16 | "Tap Send on the draft so I know it's really you." |
| User asks "draft" only | Draft card; never sends | — |
| Undo tapped within 5 s | Not sent; card back to draft | "Not sent. The draft is still here." |
| Gmail send permission not granted (J4) | Send replaced by [ Open in Gmail ] | "I can't send from your Gmail, so I've saved this as a draft there. [ Open in Gmail ]" |
| Gmail says it failed / quota | Card red | "Gmail didn't send it. Nothing went out. [ Try again ]" (Grok "Message not delivered", GRK §2 row 13) |
| Offline when Send tapped | Queued with the user's consent | "You're offline. Send it as soon as you're back?" [ Yes, send when online ] [ No, keep the draft ] |
| Second look mismatch ("Monday" vs draft says Tuesday) | HELD | "Before I send this, one check: you said Monday, the draft says Tuesday 21 Oct. Which one?" [ Monday 20 Oct ] [ Tuesday 21 Oct ] |
| Draft would include an address, phone, bank details, or an attachment from Documents | Always full Approval card, line | "This email includes your home address." |
| Email mentions money owed or agrees to terms | Always full Approval card, line | "This email agrees to pay ₹25,000. Can't be unsent." |
| Text found in an incoming email tells foo to send something (injection) | Ignored as instruction; foo tells the user | "An email asked me to send your details to someone. I didn't. [ Show me the email ]" (OpenClaw untrusted input, OCL §8.3) |
| X draft > 280 characters | Counter goes red; Open in X disabled | "Too long for X by 34 characters. [ Shorten it ]" |
| Approval card ignored 60 min (new recipient) | EXPIRED | "This expired at 10:14 AM. Nothing was sent." [ Ask me again ] |

### Stored
- Drafts and sent cards in `foo.db`; Gmail Sent is the source of truth.
- Activity log: "sent email to r.sharma@gmail.com, subject 'Re: October rent', approval {id}".
- Rules in `settings.json → rules[]` ("send email · r.sharma@gmail.com · always").
- `memory\preferences\style.md`: email greeting/sign-off patterns.

### Notifications
Draft ready while the window is closed → toast "{foo} · Draft ready for Rakesh" [ Review ] [ Later ] (Review opens the chat; sending is never from a toast).

### Acceptance criteria
- **Given** "draft a reply to my landlord", **then** a Draft card appears and no email is sent until the user taps Send.
- **Given** a recipient the user has never emailed, **when** Send is tapped, **then** a full Approval card with "You haven't emailed her before" appears and there are no scope chips.
- **Given** the user taps Undo within 5 s, **then** Gmail has no sent message.
- **Given** an X post draft, **then** foo never posts to X; it only opens X's compose page with the text.
- **Given** approval of one email, **then** a second email in the same chat still needs its own Send tap (unless a per-person rule exists).

Sources: ChatGPT draft ≠ send, zoning-email incident, auto-review (GPT §8, §9.2, §9.3); Poke draft → show → yes → send and edit-in-place (POK §4, §9.4); Grok draft card, signature, "Message not delivered", X draft-only (GRK §2, §3.1, §3.2); OpenClaw scope line and untrusted input (OCL §8.3, §9.5); blueprint "Drafts that wait for you" and the landlord Approval card.

---

## J13. Login handoff: sign in here, OTP, CAPTCHA, take over

**Trigger:** any job hits a wall that needs the person: a sign-in page, a one-time code, a CAPTCHA or "press and hold", a passkey, a bank's 3-D Secure page, or an app account (Gmail, Calendar).

### Lane chooser (Grok's four lanes, GRK §1.1, §5.4)
| What the site needs | Lane | Component |
|---|---|---|
| A key for an AI or service | Secret box | C7 |
| A website login (email + password) | **Saved login** if foo has one in the vault (filled straight into the page; the AI never sees it). Else **Sign in here** | C9 |
| A one-time code by SMS or email | **Code box** if the user prefers, else Sign in here. foo never reads codes from Gmail on its own `[foo decision, Instinct "do not copy" silent 2FA reading, INS §5]` | C7 variant |
| CAPTCHA, "press and hold", passkey, Face ID on phone, bank 3-D Secure page | **Take over** | C9 |
| An app account (Google, Microsoft) | **Connect** in the user's own browser | C10 |

### Steps (Sign in here)
1. Job → NEEDS YOU. Badge ✋. In the chat:
   ```
   IRCTC wants you to sign in. Do it here and I'll carry on.
   irctc.co.in   ● LIVE
   [ I'm done ]   [ Take over ]   [ Skip ]
   ```
2. A small foo browser window (720×640) opens on top, on the real sign-in page, with a yellow banner across the top: "foo is waiting. It can't see what you type here." and on the right [ I'm done ]. Screenshots and page reading are **paused** while this window is in front `[foo decision; Grok snapshot leak lesson, GRK §1.5]`.
3. User types username and password (and the site's own OTP if asked) directly on the page.
4. foo watches only for the page to change away from the sign-in form. When it does, the banner turns green: "Looks like you're in. Carrying on…" and after 2 s the window shrinks back into the Watch live panel (J18). If the user taps "I'm done" first, foo checks the page and continues.
5. After success, once per site: "Save your IRCTC login so I can sign in myself next time? It stays on this PC and I fill it in without seeing it." [ Save ] [ Don't save ] (Hermes save-login dialog, HRM §4). Save opens a Secret box with Username and Password fields (the values the user just typed are not captured; they type them again) `[foo decision: never capture typed values from the page]`.
6. Job → WORKING. Checklist line "✓ Signed in to IRCTC".

### Steps (Code box, when the user picks it)
"Your bank sent a code to +91 98••• ••210." Masked numeric box with placeholder "123 456", [ Use code ] [ I'll type it on the page ]. The code is typed into the page field by foo's browser driver and then forgotten; never stored, never shown to the AI (Hermes OTP dialog, HRM §4).

### Steps (Take over)
1. Card: "This page wants to check you're a person. You do this bit, then hand it back." [ Take over ] [ Skip ]
2. Take over → the job's browser window comes to the front at full size, foo pauses all its clicks, and a bottom bar shows: "You're in control. foo is paused." [ Hand back to foo ]
3. Hand back → foo re-reads the page and continues. Closing the window instead = Stop (J18).
Sources: Grok Take over / I'm done / Skip (GRK §1.4), ChatGPT Take over / Return control (GPT §5), Manus and Muse take over pauses the agent (MNS §5, MUS §9.8).

### Branches
| Case | What happens | Exact copy |
|---|---|---|
| No answer for 10 min | One reminder toast; job stays NEEDS YOU | "{foo} · IRCTC is still waiting for you to sign in." |
| No answer for 2 h | Job → CANCELLED (nothing booked) | "I stopped the train booking because the sign-in wasn't done. Ask me again any time." [ Start again ] |
| Skip | foo tries another route (another site); if none, asks | "IRCTC is the only place to book this train. Want to sign in later?" [ Remind me in 1 hour ] [ Stop ] |
| Wrong password (site says so) | Nothing from foo; the user is on the real page and sees the site's message | — |
| Saved login fails (password changed) | Falls back to Sign in here | "Your saved IRCTC login didn't work. Sign in here and I'll update it." |
| Site sends the OTP to an email, and Gmail is connected | foo still asks; offers once | "The code went to your Gmail. Want me to read codes from your email for IRCTC from now on?" [ Yes, for IRCTC only ] [ No, I'll type them ] |
| Passkey / phone approval ("approve on your phone") | Take over card with copy | "IRCTC sent an approval to your phone. Approve it there, then tap I'm done." |
| CAPTCHA appears every time on a site | Site note written; next time foo warns up front | "IRCTC always asks for a puzzle, so I'll need you for a few seconds." |
| User types the password into foo's chat instead | Paste catcher (C8); if sent anyway, hidden | "Please type it on the site instead. I've hidden what you sent." |
| User closes the sign-in window | Treated as Skip | — |
| Connect (Google) lane: sign-in link expired (10 min) | C10 | "That sign-in link expired. [ Reopen ]" |
| App connection needs more permission later (e.g. send) | Incremental Connect card (Grok, GRK §1.4) | "To send emails I need one more permission from Google. [ Allow sending ] [ Not now ]" |
| Connection expired | Reconnect card in foo chat; Settings → Apps shows "Needs sign-in" | "Your Gmail connection expired. [ Reconnect ]" |

### Stored
- Vault: `foo/login/{domain}` (username + password) only after Save. TOTP/OTP never stored.
- Browser profile keeps the site's cookies (the user stays signed in for future jobs). Settings → Privacy → "Signed-in sites" lists them with Sign out per site (Manus logged-in accounts, MNS §4).
- `sites\{domain}.md`: "needs sign-in", "always CAPTCHA", "OTP by SMS".
- Activity log: "you signed in to irctc.co.in" (no values). No screenshots while the sign-in window is up.
- Rule if accepted: "read codes from Gmail · irctc.co.in".

### Notifications
NEEDS YOU toast "{foo} · IRCTC needs you to sign in." [ Open ] + yellow taskbar badge. Reminder once at 10 min. No toast if the window is focused.

### Acceptance criteria
- **Given** a sign-in page, **then** the AI never receives the typed username/password, and no screenshot or page text is captured while the sign-in window is in front.
- **Given** the user signs in and the page changes, **then** foo continues without the user tapping "I'm done".
- **Given** a CAPTCHA, **when** the user takes over, **then** foo performs no clicks until "Hand back to foo".
- **Given** a saved login, **then** it is filled directly into the page and the AI only knows "your IRCTC login".
- **Given** no response for 2 h, **then** the job is cancelled with nothing booked and a "Start again" button.

Sources: Grok four lanes, Secure Form, Take over, snapshot leak (GRK §1.1–1.5); Tab private live browser link (TAB §4, §9.4); Manus take over and saved sessions (MNS §4, §5, §9.1); Hermes save-login and OTP dialogs (HRM §4); ChatGPT login pause and secure form (GPT §5); Gemini "don't type passwords here" (GEM §5); Instinct "do not copy" silent 2FA (INS §5).
