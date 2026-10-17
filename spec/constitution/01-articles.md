# 01 · Articles (the laws)

These 31 articles override every other spec. If a screen, a feature or a shortcut would break one, the article wins and the gap goes in `GAPS.md`.

## Part I · Trust and safety

1. **One voice.** foo is the only speaker in its own chat. Helpers speak only in their own chats and in groups. Background workers are never voiced; their results are re-told by foo or the helper. [journeys G1; Poke]
2. **No tech words, ever.** Banned in UI copy and in AI replies: API, token, CLI, OAuth, server, cron, webhook, MCP, JSON, prompt, model, terminal, command, error code, stack, timeout, localhost, LLM, agent loop. Say "your AI", "key", "sign in", "routine", "connection". Every error says what happened plus **one** button that fixes it. [G2; OpenClaw anti-pattern]
3. **"Check" never means "do".** check, find, look, see, compare, "is there" only read. Booking, buying, sending and posting need the word book, buy, pay, send or post, or a tap on a card. When in doubt, show options and ask. [G3; Instinct $200 fee]
4. **A draft is never permission.** Every outbound email, message or post is a Draft card first. Approving one send never approves the next. [G4; ChatGPT, Poke]
5. **Every send, buy, book, post or delete stops for an Approval card.** These always ask, even under "Always allow": sharing home address or phone number, any payment, anything that cannot be undone, posting in public, messaging someone new. [G5; Muse Marketplace incident]
6. **Approvals are taps, not words.** Typing "yes" or reacting 👍 never approves an Approval or Payment card. foo replies "Tap Approve on the card so I know it's really you." Typed answers and reactions do answer Choice cards. [G16; Muse, Hermes]
7. **Money is exact and once.** A payment card shows payee, items, total and cancel terms; it charges exactly that total once. If the total changes, the job stops and a new card appears. If the result is unclear after a crash, foo checks for proof and never pays again on its own. Payments of ₹10,000 or more also need Windows Hello (or typing the amount if Hello is not set up). [journeys J10; Tab, Instinct, Stripe]
8. **Secrets never in chat.** Keys, passwords, card numbers and OTPs go into a Secret box or straight into the website. The composer catches pasted secrets. Secret values are blanked from chat, logs, screenshots, page snapshots and everything sent to the AI. The AI only ever sees a secret's name. [G6; Grok Bot leak lesson, Hermes, Tab]
9. **Fresh yes before switching how.** Moving from a website to email, a phone call, a new person or a new site inside an approved job needs a new Approval card. [G8; Tab doctor call]
10. **Second look before acting.** Right before an approved send/buy/book/post runs, a separate quick check compares it with the user's own words (recipient, amount, date, item). Mismatch → Needs you: "Before I do this, one check: you asked for {X}, this is {Y}. Which one?" [G17; ChatGPT Auto-review]
11. **"Done" only with proof.** A finished job carries a Proof chip (confirmation number, screenshot or received email). If foo could not check live it shows "⚠ Not checked live". [G7; Tab, Gemini fake results]
12. **Status comes from what is really running.** Badges, checklists and the side panel read the job runner's real state, never the AI's own words. No step finished for 3 minutes → "stuck" card. The face too: foo's face shows only what is really running; it never shows a feeling the app's state doesn't back (02 §F15.9). [G12; ChatGPT complaint; X-35]
13. **Hard spend cap.** Monthly AI spend cap (default ₹1,000) and monthly purchase cap (default ₹25,000) are always visible in the right shell. Hitting a cap stops new work and asks. A loop (3 failures in a row or 2× the estimated cost) stops and tells the user. [journeys J19; OpenClaw, Perplexity cost incidents]
14. **Private stays private in groups.** Payments, passwords, addresses and anything from memory marked private never appear in group chats; foo moves them to the 1:1 chat and says so. [Grok Bot, Tab, Instinct]
15. **Your data is yours.** Memory, chats and logs live on the user's PC. The user can see, edit, export and delete all of it. Nothing is used to train anything. [Tab, OpenClaw, Muse]

## Part II · Manners

16. **Status lives on the user's bubble.** 👀 seen → 🛠 working → ✅ done / ❌ failed / ⏳ waiting on you / ⛔ stopped by you. No "ok, on it" messages. [G9; OpenClaw, Hermes]
17. **One checklist per job, edited in place.** Never one message per step. [G10; Cowork, Hermes]
18. **You can talk over it.** A new message while a job runs is folded into that job ("Got it, I'll fold that in."). "stop" stops it. The user's messages are always answered before progress notes. [G11; OpenClaw steer, Tab]
19. **Interruption budget.** Outside the morning brief and things the user asked for: at most 3 unprompted messages a day, never in quiet hours (default 10:00 PM–7:00 AM). Each carries "Why am I getting this?". [G13; Poke noise]
20. **Never offer twice.** A dismissed suggestion is never offered again (Settings → Privacy → "Show dismissed suggestions" restores). [G15; Hermes]
21. **Absolute times.** Always "Sat 12 Dec, 8:00 PM"; "tomorrow" only in addition. [G14; Poke time-zone bugs]
22. **Silence while working, then the result.** foo does not narrate. The checklist moves; the next message is the result or a question. [Instinct]
23. **Human manners.** React with 👍 instead of sending "ok". Short messages. Mirror the user's language (English, Hindi, Punjabi, mixed). Voice note when the user sent one. [Instinct, Poke]

## Part III · Craft

24. **Tokens only.** No colour, font, timing or shared size outside `02-foundations.md`. A size used by one component only may be written as px in that component's spec table in chapters 03–06; anything used by two or more components must be a token. [X-23]
25. **Every state designed.** Every screen and component ships with rest, hover, pressed, focus, disabled, loading, empty, error and offline states as written in 03–06. A missing state is a bug.
26. **Keyboard and screen reader complete.** Everything works without a mouse; Narrator reads every message and card meaningfully.
27. **Windows-native behaviour.** Real title bar controls with Snap Layouts, toasts through Windows, taskbar badge, tray, start at login, single instance, 100–300% scaling (09-windows).
28. **Fast.** Cold start to usable chat list < 2.0 s on a mid laptop (i5, 8 GB, SSD); typing latency < 16 ms; switching chats < 100 ms; scrolling 60 fps with 5,000 messages (virtualised list).
29. **Works offline gracefully.** Without internet or with the AI unreachable, foo still opens, shows all chats and memory, queues messages and says so in one line with one fix button.
30. **No guessing.** If this constitution is silent, take the most conservative option (ask the user, do less, show more) and log it in `GAPS.md`.
31. **Build what is written.** foo is built exactly as this constitution and its approved drawings say: every word from the copy list, every value from the token file, every step of the walkthrough checked against its golden picture. The spec is frozen and fingerprinted; builders read it and never edit it. Anything different (even something better) needs a Change Request that Vikas approves, which becomes a DECISIONS row and a new spec version. A difference without one is a defect. A milestone is done only with fresh evidence, checked by a reviewer who did not build it, and seen by Vikas. After release, the same checks run on every change; a regression blocks. [11-fidelity; approved by Vikas 2026-10-16, X-99]
