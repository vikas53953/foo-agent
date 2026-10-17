# foo · Feature catalogue (Grok Bot and every other personal agent, deduplicated)

Researched and written 2026-10-16 (test clock Fri 16 Oct 2026). Research file only: it **does not change** the PRD or any chapter. Proposed PRD changes are in §5 as new lines R25+ for Vikas to accept or reject.

**Why this exists.** Vikas: "Grok Bot has a rich feature set. Explore whatever we still haven't explored, including future, so we can take a decision now." This page lists every feature we could find. Each one is checked against foo v1 (`omnibot-re/foo/foo-prd.md` R1–R24, constitution journeys J1–J23) and gets a call.

**How to read the tags.**
- Evidence: **[obs]** seen on an official page, doc or changelog · **[rep]** press or user report · **[inf]** our inference · **[unverified]** not confirmed by a source we fetched. Source IDs are in `features-sources.md`. Grok IDs (S*, D*, U*, P*) match `personal-agent-re/grok/sources.md` and `04-deep-dive.md`. **CL70** = Grok changelog v0.70.2 (11 Oct 2026), **CL68** = v0.68.0/0.68.1, **CL65–67** = v0.65–0.67.
- App codes: **GB** Grok Bot · **GA** Grok app (separate product) · **IN** Instinct · **PK** Poke · **TB** Tab · **CG** ChatGPT (dot, Pulse, agent, groups, shopping) · **GM** Gemini (Spark/Task, Daily Brief, Live) · **MU** Meta (Muse, Meta AI in WhatsApp) · **CP** Microsoft Copilot (Autopilot, Copilot on Windows) · **CW** Claude / Cowork · **PX** Perplexity (Computer, Comet, Email Assistant) · **MN** Manus / Cue · **HM** Hermes · **OC** OpenClaw · **LD** Lindy · **MT** Martin · **AX** Alexa+ · **RB** Rabbit.
- foo v1 column: **Have** (with the R or J that covers it) · **Part** (partly there) · **No**.
- Call: **HAVE** (already in v1, keep) · **V1** (add now) · **V1.1** (first update after release) · **LATER** · **NEVER**. Effort **S/M/L** (S ≈ days, M ≈ 1–2 weeks, L ≈ a month or more). Risk **L/M/H** (safety, money, privacy, platform or build risk).

**The short answer for Vikas.**
1. foo v1 already covers far more than "thin" suggests: of 241 features found, **84 are already in v1**. The safety side (secrets, approvals, payments, proof) is ahead of Grok Bot.
2. What foo really lacks is Grok Bot's **reach** and **making**: a way to hand foo things from anywhere (your phone, File Explorer, email), ready-made ideas to start from, saved "do it like last time" know-how, and the ability to make things (documents, images, decks).
3. Add **7 things to v1** (all small or medium, all inside foo's laws): an Ideas gallery, trains end to end, recharges, "Catch me up", photos and papers in, "Send to foo" from Windows, and a private chat. Put **71 in V1.1**. Everything else waits or never happens.

---

## 1. Grok Bot: the full feature list (as of 16 Oct 2026)

Grok Bot (SpaceXAI, run with Cursor) entered beta on 11 Aug 2026. The latest release is **v0.70.2 (11 Oct 2026)**. We found no release notes after 11 Oct [obs CL70; WebSearch 16 Oct]. Items marked *new* were not in our earlier teardown.

### 1.1 Bots (teammates) and templates
- Bots are chat contacts. Each has a Name, Label, Description (its standing instructions) and an avatar with a shape and colour. Bots can change their own title and avatar [obs S6, S3].
- Create from New → "Create new Bot", or pick a suggested teammate during onboarding [obs S5, S6].
- **Templates**:
  - Share menu → **Create template** → Public link or Team-only. Others press **"Add to Grok Bot"** and get their own copy, without your computer, logins or history [obs S6 fetched 16 Oct].
  - Connect Apps lists web Bot templates with category chips, Recommended first [obs CL67].
  - *New:* **"Bots can find a template matching your description and link it in chat"** [obs CL70].
  - Publishing or adding from templates works while the computer sleeps [obs CL70].
- **Duplicate** copies profile, settings, skills, routines and avatar, but not history, memory or attachments [obs S6].
- **Pin, sections, Hide from sidebar** (a "Hidden Bots" list), and View Unread on Mac [obs S6, CL70].
- **Primary Bot** (star): only one. It receives @bot tags from X and "spots work it can take off your plate and offers to handle it" [obs CL66, D5]. "Chief of Staff" is a pinned Bot whose description says to delegate [obs S16].
- **Team Bots**: one Bot for a whole team, set up card to card ("Step 2 of 5"), private notes per person, approvals from teammates' DMs, Slack and Teams presence [obs CL65, CL70, D10].
- Bots introduce themselves when created and greet you in your app language [obs S3 v0.39, v0.45].
- Delete removes profile, conversation and routines. Shared files and sign-ins stay [obs S6].

### 1.2 Chat and messages
- iMessage/Slack-like transcript, one thread per Bot. 1:1 chats are tinted in the Bot's colour, and your own bubbles take that colour (Accent → Black turns it off) [obs CL68].
- More than 25 card and message types: text, working status, tool steps, questions and multi-select forms, secure secret card, Secure Form, Take over, Connect/Authorize/Reconnect, Review-an-action, spend card, email and Slack draft, file/result, link preview, interactive app card, voice memo, voice chat card, handoff marker, routine created, routine run chat, routines-paused notice, error card, Primary Bot offer, reactions, threads [obs deep dive §2].
- **Interactive app cards** from connectors (Figma, Notion, Canva) [obs CL70].
- Human status phrases ("Thinking it through", "Working on your computer", "Waiting on results", "Waiting for you"), and an animated avatar while the Bot works with nothing to report [obs CL67, CL70].
- Acknowledges before longer work [obs CL70].
- Composer:
  - Up to 6 attachments (25 MB documents and audio, 200 MB video); paste of text, links and images; quoting.
  - `@` mentions a Bot, routine or connector; `/` skills (the menu was removed in CL68.1).
  - Ctrl+D dictation; Enter sends; drafts saved per chat; a "Sending" bar on uploads [obs S7, CL70].
- *New:* **Add to chat** pill on selected text; reply quotes jump to the original; reactions show on the bubble with recent emoji; Ctrl+F Find in page; "Show more" on long messages [obs CL70].
- Threads: reply in thread to one result [obs S7].
- Type over a running Bot; "Stop now" halts it [obs S7].

### 1.3 Voice
- Dictation (detects the spoken language) [obs S7].
- **Live voice chat** with one Bot: a "Voice chat in progress" marker, a card afterwards, 0.5× speed added; Team Bot voice chats [obs S7, CL65, CL70].
- Bot-sent **voice memos** with a word-synced transcript and a speed control; voice, speed and language set per Bot [obs S7, S3].
- *New:* Bots send MP3, M4A and WAV files [obs CL70].

### 1.4 Routines, skills and proactivity
- Routines by asking ("Every weekday at 8:00 AM…"). The Bot confirms schedule and time zone, inputs, result, approval boundary and missing-source behaviour, then shows **Next run**.
  - *New:* after saving, the Bot "summarizes what it does and who receives results" [obs S8, CL70].
- Triggers: schedule, **Once** reminders, events (Slack, Teams, GitHub, Linear, Sentry, PagerDuty) and webhooks with a key [obs S8, D9].
- Controls: Test run (does real work), pause and resume, edit, delete. Right-click a routine for Pause/Resume/Test/Edit/Delete. History of the last 20 runs. Limits: 50 per Bot, at least 5 minutes apart [obs S8, CL68].
- Each run opens its own chat. A notice says when routines were paused while you were away [obs S3].
- **Skills**: saved procedures; **Teach a task** records up to 10 minutes of you demonstrating and turns it into a draft skill. Recommended order: do once → make reliable → skill → routine [obs S8].
- Proactive: resumes dropped threads, nudges stalled handoffs, Primary Bot offers. "If nothing, send nothing" [obs S1, CL66; rep U4].
- The **morning report** is the best-liked output: changed / needs attention / checked / could not check / 3 next actions [rep U1].

### 1.5 Memory
- Per Bot: preferences, role facts, work summaries; private notes per person on Team Bots [obs S4, S3].
- Learns your writing voice; can scan Gmail or Slack to learn it [obs S16].
- Save and forget by asking. **No memory viewer** [obs S10, S3].
- "Memory is not an authoritative source"; durable rules belong in the Description [obs S6].
- (GA, the Grok app, has memory across chats, data controls and a ghost-icon **Private Chat** [3P G1, G2].)

### 1.6 Doing things (computer, browser, connectors)
- One persistent **cloud computer** per user, a screen per Bot (1920×1200), shared `/workspace`, shared browser sign-ins [obs S11, CL68].
- Watch live (opens in Watching mode), **Take over / I'm done / Skip**, a Wake button for a sleeping computer [obs D8, CL70].
- Opt-in **execution on your local computer** (Always allow / Allow once / Never) [obs S10].
- Connect Apps catalogue: Gmail, Calendar, Outlook, Slack, Teams, GitHub, Notion, QuickBooks (new), Glean (new), 1Password, X, Email, Figma, Canva and more. Most-installed first; pasting a connector link installs it [obs CL70, S11].
- Connector statuses: Installed, Added, Needs auth, Disconnected, Connected. Incremental consent; "add a second account" [obs D11, CL67].
- **Email**:
  - **A Bot can have its own email address**; mail it sends waits on a draft card [obs CL70].
  - Gmail send-as picker, signature and logo, formatted emails [obs CL68, CL70].
  - Reads sign-in codes and links from your Gmail, Outlook or its own inbox [obs CL70].
  - Searches Gmail Spam and moves mail back [obs CL68.1].
- **X**: built-in search and reading of posts, profiles and trends without an account; plugin for DMs, bookmarks and timeline; **Tag @bot on X** starts a task; drafts only, never posts by itself [obs CL70, D5; rep D6].
- **Deliverables**: slide decks (PowerPoint, Google Slides), pages/canvases (now both called "Page"), web pages saved as PDF, files with previews, Library tab per Bot [obs CL68.1, CL70, S12].
- **Shared pages**: title bar with Download (PDF), "Try Grok Bot" for visitors, and Share for owners [obs CL70].
- **Payments**: spend card (merchant, total, breakdown); Stripe Link and **X Money** [obs CL70].
- After a bank or brokerage connector returns data, the Bot asks before sharing it elsewhere [obs CL70].
- In development [rep TestingCatalog, 24 Aug]: **multi-account switching**, **Chrome profile import (cookies)**, **desktop egress routing**, a Templates tab in Settings. *Status today unknown* [unverified].
- Reported: Grok Bots coming to **XChat** with synced history [rep D7].

### 1.7 Safety and approvals
- Review-an-action cards name the Bot, quote its instruction and say in one sentence what it wants to do: Allow once / Always allow / Deny. They expire after about 10 minutes for unattended work [obs S10, CL68].
- Auto-review rules ("Ask first" beats "Allow automatically"), called **Custom Rules** [obs CL68].
- *New:* checks your own messages before irreversible actions (send, post, buy, delete) [obs CL70].
- Secret card (write-only, "never shown to your Bot"), Secure Form window for logins and checkout fields, Take over for 2FA and CAPTCHA [obs D1, CL68.1].
- Known breaks: secrets wiped on reconnect; a Secure Form password leaked into a snapshot [obs D2, D3].

### 1.8 Notifications, desktop and mobile
- Desktop: macOS, **Windows x64 and Arm64**, Linux. Mobile: iOS/iPadOS 18+, Android 9+ [obs S13, fetched 16 Oct].
- Sidebar states: Needs attention / Unread / working; dock badge; per-Bot notification switch; notifications only when a Bot finishes or needs you, suppressed while you look [obs S9].
- Phone: notifications once per reply, skipped while you're viewing on desktop; pinned Bots sync; share sheet (iPhone: photos, files, links, text; Android: text only); live voice; watch and take over. **Routine editing, testing and teaching are desktop-only** [obs S13, CL65, CL66, CL70].
- Settings (Ctrl+,): General (Account, Appearance, Language 20+ incl. Marathi, Tamil, Telugu since CL68), Bot (time zone, local execution), Auto-review, Computer, Usage & Billing, Updates (automatic by default) [obs S9, CL65, CL68].
- Search palette Ctrl+K across Bots, groups, messages, files, links, routines, settings and plugins [obs S7, CL68].

### 1.9 Groups and sharing
- Group chats of 2–6 Bots; @mention or Reply chooses who answers; handoffs land in each Bot's own chat; Bot-to-Bot messages count toward usage [obs S7, D10].
- Approvals, drafts and secret requests never appear in groups [obs S7].
- Share a Bot as a template; Team Bot links use x.ai URLs [obs S6, CL67].

### 1.10 Pricing and access
- Bundled with SuperGrok tiers (SuperGrok, Plus, Heavy) and Cursor paid plans (Pro, Pro+, Ultra, Teams Standard and Premium), with its **own usage pool** separate from Grok and Cursor [obs S2 fetched 16 Oct].
- Reported prices:
  - at launch, $300 Heavy or $200 Cursor Ultra;
  - later about $20 as the cheapest route;
  - SuperGrok Plus $100 a month;
  - Cursor Premium Teams $120 a seat, Teams Standard $40 a seat;
  - weekly allowance sizes unpublished; on-demand spend billed at model cost; a one-time trial [rep P1, T5, TestingCatalog, eesel]. Exact current prices are [unverified].
- No model picker (a router chooses). If a model is unavailable in your region, it falls back to Grok [obs CL70].
- Usage & Billing shows your plan name and a "used" meter [obs CL70].

---

## 2. Other agents, briefly (only what adds to the catalogue)

| App | Signature features (what matters for foo) | Source |
|---|---|---|
| **Instinct** (Spear Street) | iMessage/WhatsApp/SMS, no app. Own number, computer and email. Vault for logins, cards, addresses and TOTP. Stripe Link one-time cards approved for the exact amount. Concierge phone calls. Trusted Person agent-to-agent network. Group Instinct for a whole group. Shareable interactive "Files" pages. 7am brief, 8pm clash check, return-window and delivery-cutoff warnings. Selections (unasked picks, disliked). Location-based suggestions. Memory as Markdown files, not viewable. Mac beta: local iMessage and local browser | instinct/01, 04 |
| **Poke** | Texts first. Email and calendar drafts approved by emoji. Reminders and automations. Recipes (one-click integration bundles, creator payouts). Pages on yourname.poke.site. Tables and charts as images. Poke Human (real people do errands, Ultra). Lighter mode instead of stopping when out of usage. Billing by asking in chat. Free / $19 / $199 | poke/01 |
| **Tab** | Own number, computer and wallet. Purchases bound to an exact cart; add a card through a 10-minute private link; "what did I spend". Phone calls with honest summaries. Fetches documents (last 3 electricity bills). Tracks food orders, flights and packages. Imports contacts. Reads TikToks, reels and PDFs you send. Makes pages, xlsx and PDF. Group Tab with private matters moved to 1:1. "Stop means stop". Readable notes | tab/01 |
| **ChatGPT** | Dot (always-on persona) with schedules, event watches, proactive research, drafts not authorization, Slack and Teams, use-my-PC, Pause and Reset. Pulse morning cards that expire. Agent mode errands. **Group chats with up to 20 people** (Nov 2025). **Shopping research** buyer's guides; Instant Checkout. Temporary chat | chatgpt/01; WebSearch group chats and shopping research |
| **Gemini** | Spark/Task mode with plan, skills (`@skill`), schedules (time or event), a Suggested routines list. Daily Brief learns from 👍/👎. View live / Take over in Chrome. Price watch (flights). Local file sorting on Mac. "Interview me" guided setup. Gemini Live voice; image generation [unverified for Spark] | gemini/01 |
| **Meta** | Muse: reel → grocery list, Marketplace selling (address-leak incident), shopping with single-use cards, lower a bill or cancel subscriptions, Goals tab, Ideas feed, custom connectors, readable and editable memory. **Meta AI in WhatsApp (India)**: @Meta AI in any chat or group, Hindi support, images, live info | muse/01; lumichats; inc42 |
| **Copilot / Autopilot** | @mention a named agent in Teams and Outlook; multi-day projects; "Today" digest; spend policies. On Windows: agent workspace, agents on the taskbar with a badge and hover progress, per-agent file consent (Allow always / Ask every time / Never). Consumer: connectors across Gmail and Outlook, Edge Actions, Journeys. Fall release: Groups, Mico avatar, memory [details unverified] | autopilot/01; redmondmag, thejournal |
| **Claude / Cowork** | Tasks on your files; "Ask before acting" vs "Act without asking"; hard prompt before permanent deletes; Office deliverables; scheduled tasks (local runs fail silently if the PC sleeps); **Dispatch** phone-to-desktop remote; Projects; shareable artifacts, Docs and Slides; memory import | cowork/01 |
| **Perplexity** | Plan preview with a credit estimate; a **live credit counter**; sub-agent questions; pause when out of credits. OpenTable Reserve, Selfbook hotels, PayPal checkout from answers. Comet browser agent. Email Assistant you cc (labels: completed / needs action). Daily Digest. Approve from your phone. Watermarked app builds | perplexity/01 |
| **Manus / Cue** | Cloud computer, take over, saved sessions, "My Browser" tab group named after the task (close the tab = stop). Email tasks to name@manus.bot. Scheduled tasks with run history and failure alerts. Telegram agent. Cue: dice-roll name and avatar, own US phone number, Link wallet, multi-agent group chat | manus/01 |
| **Hermes** | 7-beat first run with a first "wow" task in a minute. Suggested automations (max 5, never re-offered). Quiet monitors ("[SILENT]"). Allow once / session / always. Secret modal; local vault fill; 2FA code dialog. Clarify tool with Recommended + Other. Steer or queue. `/voice on`. **/rollback** checkpoints. Memory-write approval. Stranger pairing codes | hermes/01 |
| **OpenClaw** | Local gateway on WhatsApp/Telegram/iMessage and 20+ apps. 👀 reaction then typing. Steer mode. Voice notes both ways (push-to-talk bubble). Secrets tool. ask_user with 1️⃣–4️⃣ reactions. Approvals by reaction. Reminders, cron and self-paced loops. Heartbeat with NO_REPLY. Editable memory files and "dreaming" consolidation. Progress card edited in place. `show_widget` interactive cards. Skill Workshop ("Learned" row with undo) | openclaw/01 |
| **Lindy** | One assistant on iMessage, email, Slack and the browser. Meeting notes and action items; email triage; drafts in your voice; scheduling without back-and-forth. 7-day trial | lindy.ai blog |
| **Martin** | Phone, SMS, WhatsApp, email, Slack, iOS app with voice. **Morning wake-up call** with weather and schedule. Up to 5 Gmail + 5 Outlook + 5 calendars. Email triage, proactive drafts, cc-to-schedule, daily email digest. Reminders, to-do list, custom shortcuts. Basic $21–35, Pro $30–49 | eesel Martin review |
| **Alexa+** | Partners: OpenTable, Uber, Ticketmaster, Thumbtack; Expedia, Yelp, Angi and Square added in 2026. Hotels, home-service quotes, salon bookings by voice. Remembers family details [unverified] | TechCrunch Dec 2025 |
| **Rabbit** (rabbitOS 2) | Card stack UI; "creations" (vibe-coded mini apps on the device); intern agent for web tasks, image generation and follow-ups | rabbit.tech |
| **Dot** (New Computer) | Companion that remembered your life. **Shut down** (announced Sep 2025): a warning that memory-only companions lack a job [rep] | TechCrunch |
| **India rails** | NPCI is designing a **Unified Agent Protocol** so AI agents can make UPI payments with set limits (reported 9 Jul 2026, not launched). Earlier pilots with ChatGPT, Gemini and Claude (Oct 2025) | outlookbusiness; techcrunch; inc42 |

---

## 3. The catalogue (deduplicated, by family)

Columns: **#** · **Feature** · **Apps** · **What you see** (plain words) · **foo v1** · **Call** · **Why** · **Eff** · **Risk**.

### A. Talking and chat

| # | Feature | Apps | What you see | foo v1 | Call | Why | Eff | Risk |
|---|---|---|---|---|---|---|---|---|
| A1 | One main voice in a messenger-style chat | GB IN PK TB MU OC | You text foo like a friend on WhatsApp | Have R1 | HAVE | Core of foo | – | – |
| A2 | React 👍 instead of "ok" | IN OC GB | foo puts 👍 on your "thanks" | Have R1, Art. 23 | HAVE | Human manners | – | – |
| A3 | Quote-reply and jump to the original | GB IN | Swipe-reply; click the quote to jump back | Have (04 quote reply) | HAVE | Already designed | – | – |
| A4 | Reply-in-thread on one result | GB | A side thread under one message | No | NEVER | WhatsApp has no threads; quote-reply covers it | M | L |
| A5 | Talk over a running job; "stop" | GB OC HM TB | "Got it, I'll fold that in." | Have R8, Art. 18 | HAVE | – | – | – |
| A6 | Human working phrases | GB | Header says "Looking at hotels…" instead of a spinner | Part R8 (badges, checklist) | V1.1 | Warmer than icons; cheap | S | L |
| A7 | Acknowledge before long work | GB | A short plan or checklist appears first | Have R10 plan card, R8 | HAVE | – | – | – |
| A8 | Animated face while working quietly | GB | foo's avatar gently pulses when nothing to report | No | V1.1 | Delight; replaces "still working?" worry | S | L |
| A9 | "Start fresh" for a long chat | IN (/new) GB (complaint) | "Fresh start: I keep what I know, but tidy this chat" | No | V1.1 | Long chats get slow and costly on the user's AI | S | L |
| A10 | Typed slash commands | IN GB HM OC | `/new`, `/remember` | No | NEVER | Feels technical; plain words and buttons do the same | S | L |
| A11 | Choice chips, best first, "Something else…" | GB HM OC | Tap an option or type "2" | Have R9 | HAVE | – | – | – |
| A12 | Multi-select question with Submit | GB | Tick several ("Veg, Jain, no onion") then Submit | Part R9 (single pick) | V1.1 | Food and travel preferences need several picks | S | L |
| A13 | Multi-field in-chat forms | GB | A small form inside the chat | No | LATER | Choice and Secret cards cover v1 | M | L |
| A14 | Find in this chat | GB | Ctrl+F bar | Have (04, 09) | HAVE | – | – | – |
| A15 | "Add to chat" on selected text | GB | Select words in a reply → "Ask about this" pill | No | V1.1 | Natural follow-up | S | L |
| A16 | Long replies tidied | GB | At most 3 bubbles; long ones open in a viewer | Have R1 | HAVE | – | – | – |
| A17 | Charts in answers | PK OC | A small bar chart of your spending | Part (table card 05 §5.22) | LATER | Tables are enough for v1 | M | L |
| A18 | Answers in your language and mix | MU GB | Hindi in, Hindi out; Hinglish works | Have R24 | HAVE | – | – | – |
| A19 | More Indian languages in replies (Marathi, Tamil, Telugu, Bengali, Gujarati) | GB (CL68) | foo answers in Marathi if you write Marathi | Part R24 (Eng/Hin/Pun named) | V1.1 | Same mirroring rule; needs fonts and tests only | S | L |
| A20 | foo's own screens in Hindi | GB (20+ UI languages) | Buttons and settings in Hindi | No | V1.1 | Big copy job; v1 copy is final English | M | M |
| A21 | Name, face and vibe | GB MN CG | "Pick a face." "Surprise me" | Have J3 | HAVE | – | – | – |
| A22 | A little celebration when something is done | IN (confetti) | Brief confetti on "✓ Booked" with proof | No | V1.1 | Delight at the moment of trust; only with proof | S | L |
| A23 | Games in chat | IN (GamePigeon) | – | No | NEVER | Off-mission | M | L |
| A24 | Companion characters with affection levels | GA | – | No | NEVER | Retired by Grok amid criticism | L | H |
| A25 | Suggestions based on where you are | IN | "You're near Bandra…" | No | NEVER | Desktop app; location is too sensitive | M | H |

### B. Voice

| # | Feature | Apps | What you see | foo v1 | Call | Why | Eff | Risk |
|---|---|---|---|---|---|---|---|---|
| B1 | Voice notes in (hold a key) | GB IN OC HM MN | Hold Ctrl+Space, talk, let go | Have R16 | HAVE | – | – | – |
| B2 | Voice-note replies with text | GB OC HM | A playable voice bubble plus the text | Have R16 | HAVE | – | – | – |
| B3 | Word-by-word transcript highlight and 1.5×/2× speed | GB | Words light up as it plays | Part R16 (transcript) | V1.1 | Accessibility and speed | S | L |
| B4 | Dictate into the box (speech to text, then edit) | GB (Ctrl+D) | Talk; the words appear in the box to fix before sending | No | V1.1 | Many prefer to check Hindi text before sending | S | L |
| B5 | Live voice call with foo | GB CG GM PX IN MT | A call screen; talk back and forth | No | LATER | Needs real-time speech from the user's AI; Hindi quality unproven; costly | L | M |
| B6 | Different voice per helper | GB | Trips sounds different from Money | No | V1.1 | Identity; cheap once voices exist | S | L |
| B7 | Morning brief as a voice note | MT (wake-up call) IN | "▶ Hear today's brief" | No | V1.1 | Great for Hindi speakers; reuses R16 | S | L |
| B8 | foo phones you | MT IN | – | No | NEVER | Calls are out of scope and intrusive | L | M |

### C. Jobs, routines and helpers

| # | Feature | Apps | What you see | foo v1 | Call | Why | Eff | Risk |
|---|---|---|---|---|---|---|---|---|
| C1 | Helpers as separate contacts | GB CG MN CP | Trips, Money, Home chats | Have R2 | HAVE | – | – | – |
| C2 | Helper templates | GB MN | Trips / Money / Home / Family / Blank | Have (06 §3) | HAVE | – | – | – |
| C3 | More templates: Health, Shopping, Kids and school, Papers | GB (marketplace) | Extra chips in "New helper" | No | V1.1 | Covers common Indian life areas | S | L |
| C4 | Helper says hello and offers a first job | GB | "Hi, I'm Trips. I see your Goa trip…" | Have J15 | HAVE | – | – | – |
| C5 | Duplicate a helper | GB | "Make a copy" on the profile | No | V1.1 | Quick variants ("Mom's Money") | S | L |
| C6 | Share a helper with a friend as a file | GB (templates) | "Share as file" → friend opens it → "Add to foo" | No | LATER | No foo cloud; must strip memory and keys | M | M |
| C7 | Template marketplace with creator payouts | GB PK | – | No | NEVER | Needs a cloud and moderation | L | H |
| C8 | Main agent offers to take work off your plate | GB (Primary Bot) CG HM | "I can take your Airtel bill off your plate every month. Want me to?" | Part (§5.14 offers, Art. 20) | V1.1 | Grok's key proactive move; needs care with the budget | S | M |
| C9 | Sections and hidden helpers | GB | – | No | NEVER | Max 8 helpers; pin and mute are enough | S | L |
| C10 | Group of helpers with handoff lines | GB MN | "Trips → asked Money" | Have R2, J16 | HAVE | – | – | – |
| C11 | Routines by asking; next run; run once first | GB CG GM OC HM MN | Routine card with exact next run | Have R12 | HAVE | – | – | – |
| C12 | One-time reminders | GB OC | "Remind me Sat 17 Oct, 6:00 PM to call Mom" | Have (08 schedule `once`) | HAVE | – | – | – |
| C13 | "When an email from X arrives" routines | GB CG GM PK | "Tell me when a mail from the school comes" | Part R12 (checks on a timer) | V1.1 | Faster than timed checks | M | L |
| C14 | Webhook, Slack or GitHub triggers | GB | – | No | NEVER | Technical | M | L |
| C15 | Run history with reasons | GB MN | Last results per routine | Have (06 §8) | HAVE | – | – | – |
| C16 | Each run in its own chat | GB | – | No | NEVER | Clutters a WhatsApp-style list | S | L |
| C17 | "Paused while you were away" | GB | One notice | Have (08 awayCheck) | HAVE | – | – | – |
| C18 | foo suggests routines (max 3) | GM HM | "Make it a routine" / "Not interested" | Have (06 §8) | HAVE | – | – | – |
| C19 | **Ideas gallery: ready-made routines and helpers (India pack)** | GB (templates, "find a template") PK (recipes) HM GM | A page of tap-to-start ideas: "Watch my PNR", "Tell me when my parcel is near", "Remind me 3 days before any bill", "Cricket: tell me if India is in a close finish" | No (only 3 suggestions) | **V1** | Biggest gap for non-technical people: they don't know what to ask | S | L |
| C20 | Track parcels, PNR, flights, food orders | TB IN | "Your parcel is out for delivery" | Part R12 (engine) | V1 via C19 | Same engine; ship as starters | S | L |
| C21 | Price watch | GM | "Tell me when Delhi–Goa is under ₹6,000" | Have R12 | HAVE | – | – | – |
| C22 | **Saved "do it like last time" know-how (skills)** | GB GM OC MT | After a job: "Save how I did this?" → next time one tap | No | V1.1 | Faster, cheaper, more reliable repeats | M | M |
| C23 | Teach by showing (record your screen) | GB | – | No | LATER | Already "Later" in the PRD | L | M |
| C24 | Multi-day projects with follow-ups to people | CP | – | No | LATER | Needs messaging other people unattended | L | H |
| C25 | Plan preview with time and AI cost | PX GM | "About 6 min · about ₹12" [ Go ] | Have R10 | HAVE | – | – | – |
| C26 | Cost shown on each job | PX | Checklist footer "So far ₹8" | Part R19 (monthly meter) | V1.1 | Trust; data already tracked | S | L |
| C27 | Many sub-workers on one job | PX MN | – | No | NEVER | Cost and confusion; 3 jobs at once is enough | L | M |
| C28 | Stale routine review | PK | "You haven't opened these 4 results. Pause it?" | Have (08 staleCheck) | HAVE | – | – | – |
| C29 | Follow up on dropped threads | GB IN | "Still want me to chase the landlord?" | No | V1.1 | Loved in Instinct and Grok; counts against the 3-a-day budget | S | M |

### D. Memory and knowledge

| # | Feature | Apps | What you see | foo v1 | Call | Why | Eff | Risk |
|---|---|---|---|---|---|---|---|---|
| D1 | See, edit and forget memory | TB MU OC (GB lacks) | "What I know about you" page | Have R13 | HAVE | – | – | – |
| D2 | "I'll remember: …" chip with Undo | – | Under a message | Have R13 | HAVE | – | – | – |
| D3 | "You said" vs "I guessed" | TB | Label on each fact | Have R13 | HAVE | – | – | – |
| D4 | Private facts never in groups | GB IN | "Mark private" | Have R13, Art. 14 | HAVE | – | – | – |
| D5 | Each helper has its own notes | GB | Helper profile → notes | Have (06 §4.1) | HAVE | – | – | – |
| D6 | Learns how you write | GB IN LD PX | Drafts sound like you; "Learn from my sent mail?" [ Yes ] | No | V1.1 | Drafts feel personal; needs a clear yes | M | M |
| D7 | Bring memory from ChatGPT or Claude | CW (import) | Paste their export → foo shows facts as chips to keep | No | V1.1 | Cheap; reuses chips; PRD "Later" can move up | S | M |
| D8 | **Private chat: nothing remembered** | GA (Private Chat) CG (temporary chat) | Toggle "Private chat" in the header; chat shows a ghost mark; nothing saved to memory; deleted when closed | Part ("don't remember this" phrase) | **V1** | Trust feature, very small, fits Art. 15 | S | L |
| D9 | People page with closeness levels | IN | Mom: family · Raj: work | Part (memory kind `person`) | V1.1 | Safer drafts; groundwork for groups | M | M |
| D10 | Goals | MU | – | No | LATER | Off-core for v1 | M | L |
| D11 | Projects or workspaces | GB CW | – | No | NEVER | Helpers already are the workspace | M | L |
| D12 | Overnight memory tidy-up | OC | "This week I merged 3 notes" | Part (Monday memory line) | LATER | Engine work | M | M |
| D13 | Ask before saving memory | HM | – | Have (chip + Undo) | HAVE | – | – | – |
| D14 | **Papers shelf with renewals** (Aadhaar, PAN, passport, licence, RC, insurance, PUC) | IN (passport photos) TB (documents) | "Papers" page: tiles with expiry dates; foo reminds 30 days before; attaches a paper to a form only after an Approval card | No | V1.1 | Big Indian value; very sensitive, so it needs its own design and tests | M | H |
| D15 | Reuse details from papers in forms | IN | foo fills DOB from your passport | No | V1.1 with D14 | Same | M | H |

### E. Bookings and buying

| # | Feature | Apps | What you see | foo v1 | Call | Why | Eff | Risk |
|---|---|---|---|---|---|---|---|---|
| E1 | Restaurants | IN PX GM AX | Photo options → "Book table" | Have J9 | HAVE | – | – | – |
| E2 | Hotels | PX AX | Receipt-style payment card | Have J10 | HAVE | – | – | – |
| E3 | **Trains end to end (IRCTC): search, book, Tatkal-ready, PNR watch** | – (India) | "Tatkal opens Fri 10:00 AM. I'll have everything filled; you tap Pay." | Part R10 (no journey; PRD §11 gap) | **V1** | Most-used Indian booking; the PRD admits the gap | M | M |
| E4 | Flights as their own journey | PX IN | Fare options with baggage and cancel fee | Part R10 | V1.1 | Same engine; write J-flight | M | M |
| E5 | Web check-in and seat | IN | "Checked in. Seat 14C. Boarding pass ↓" | No | V1.1 | Classic delight; needs airline sign-ins | M | M |
| E6 | Movie and event tickets (BookMyShow) | AX | Seat-map choice → payment card | No | V1.1 | Same engine | S | M |
| E7 | Cabs (Uber, Ola) | AX | – | No | LATER | Phone-first; time-critical | M | M |
| E8 | Food delivery (Swiggy, Zomato) | CG IN | "Your usual from Haldiram's, ₹412" → card | No | V1.1 | Popular; sites block bots | M | H |
| E9 | Groceries and "order my usual" (Blinkit, BigBasket, Amazon) | TB PX IN | Cart card with items and total | No | V1.1 | High value; needs a cart-style payment card | M | H |
| E10 | Shopping research (buyer's guide) | CG PX | "3 ACs under ₹40,000" table, best first | Part (table card, R9) | V1.1 | Read-only, safe, useful | S | L |
| E11 | Buy straight from an answer with a wallet | PX GB TB MU | – | No | NEVER | foo pays on the real site behind a card; no wallet | L | H |
| E12 | Salon, doctor, home-service bookings (Practo, Urban Company) | IN AX | Time-slot chips → "Book" | No | V1.1 | Same engine as J9 | M | M |
| E13 | Change or cancel a booking | IN | "Cancel Taj booking · refund ₹10,200" card | No | V1.1 | Needed after bookings exist; irreversible, so a full card | M | H |
| E14 | Reminder before the free-cancel time | IN | Reminder 2 h before | Have R10 | HAVE | – | – | – |
| E15 | Return-window reminders | TB IN | "Return window for shoes ends Tue 20 Oct" | No | V1.1 | Found in order emails | S | L |
| E16 | Negotiate plans with friends' agents | IN | – | No | NEVER | A network product | L | H |
| E17 | Fallback ladder (site → email → you) | IN | "Open the page" | Have R10 | HAVE | – | – | – |
| E18 | Per-site "what worked" notes | IN | – | Have (08 site notes) | HAVE | – | – | – |
| E19 | Phone calls to businesses | IN TB MN | – | No | LATER | PRD "Later" | L | H |
| E20 | Human concierge for hard cases | PK IN | – | No | NEVER | Needs a company and staff | L | H |
| E21 | Visa and government forms | IN | – | No | LATER | Needs D14 first | L | H |

### F. Messages and email

| # | Feature | Apps | What you see | foo v1 | Call | Why | Eff | Risk |
|---|---|---|---|---|---|---|---|---|
| F1 | Draft card for every outbound message | all | "Send email" / "Not now" | Have R18, Art. 4 | HAVE | – | – | – |
| F2 | Gmail read, draft, send with Undo | GB GM LD MT | 5-second Undo | Have R18 | HAVE | – | – | – |
| F3 | WhatsApp read and draft | OC HM | Draft card → you tap Send | Have R18 | HAVE | – | – | – |
| F4 | **"Catch me up" on a chat, group or inbox** | MU (Meta AI) LD MT | "Catch me up on Family group" → 5 lines: who said what, anything for you, 1 suggested reply as a Draft | Part (brief reads mentions) | **V1** | Top daily use in India (busy family and society groups); read-only | M | M |
| F5 | Email sorting (needs action / FYI) | PX LD MT | Inbox list grouped in a card | No | V1.1 | Useful; the brief covers the core | M | L |
| F6 | Daily email digest | MT | – | Have R7 (brief) | HAVE | – | – | – |
| F7 | Replies you owe, with a ready draft | MT CG | Brief item "Reply owed: Raj (3 days)" [ See draft ] | Part R7 | V1.1 | Natural next step | S | L |
| F8 | Signature, "send as" picker, formatting | GB | From: picker; your signature | No | V1.1 | Polish | S | L |
| F9 | Two or more Gmail accounts | GB (coming) MT | "Which account? Personal / Work" | No | V1.1 | Many people have two | M | M |
| F10 | Outlook | GB MT | – | Specified, off (X-18) | LATER | Keep X-18 | M | L |
| F11 | **Forward anything to foo by email** | GB (Bot email) IN MN PX | Forward a mail to `you+foo@gmail.com`; foo picks it up as a task | No | V1.1 | Grok's "own email" without a foo cloud (uses a Gmail +alias) | S | M |
| F12 | Unsubscribe and inbox clean-up | – | "Unsubscribe from these 12?" card | No | V1.1 | Each unsubscribe needs a tap | M | M |
| F13 | Find a time with someone and send the invite | GM LD MT PX | Draft invite with 3 slots | No | V1.1 | Needs messaging other people | M | M |
| F14 | Reply to calendar invites | GM | "Accept" card | No | V1.1 | Small | S | L |
| F15 | Meeting notes | LD | – | No | NEVER | Work tool; recording-consent problems | L | H |
| F16 | Read and watch X posts | GB | "Any news on the Pune metro from @PuneMetro?" | No | LATER | Browser read is fragile; low priority | M | M |
| F17 | X post drafts that open X | GB | – | Have R18 | HAVE | – | – | – |
| F18 | Posting publicly by itself | – | – | No | NEVER | PRD non-goal | – | – |
| F19 | Tag @foo on X to start a task | GB | – | No | NEVER | No foo account or cloud | L | M |
| F20 | Slack and Teams | GB CG CP | – | No | NEVER | Work tools; off-audience | M | L |
| F21 | Telegram or Signal as a channel | OC HM MN | – | No | LATER | WhatsApp first | M | M |
| F22 | Full approval for someone new | GB | "You haven't emailed her before" | Have R18 | HAVE | – | – | – |
| F23 | foo posts in WhatsApp groups | – | – | No | NEVER (v1) | PRD "Later"; account-ban risk | M | H |
| F24 | Bring in your contacts | TB | "Use my Google contacts?" [ Yes ] | No | V1.1 | Better names in drafts | S | M |

### G. Money and bills

| # | Feature | Apps | What you see | foo v1 | Call | Why | Eff | Risk |
|---|---|---|---|---|---|---|---|---|
| G1 | Find a bill, remind, pay with a card | MU IN | "Airtel ₹1,179 due Fri 23 Oct" | Have J11 | HAVE | – | – | – |
| G2 | UPI: approve on your phone | – | "Approve ₹1,179 in your UPI app. Waiting… 4:32" | Have J11 (08 §10) | HAVE | – | – | – |
| G3 | **Recharges and everyday billers** (mobile prepaid, DTH, FASTag, electricity, gas, broadband) | – (India) | "Jio ₹299 plan ends Sun 18 Oct. Recharge?" → plan choice → payment card | Part J11 (bills only; no recharge) | **V1** | The most frequent payment Indians make; same engine | S | M |
| G4 | Payment card with Windows Hello at ₹10,000+ | – | – | Have R6 | HAVE | – | – | – |
| G5 | Spend caps | OC PX | Two meters | Have R19 | HAVE | – | – | – |
| G6 | Duplicate bill guard | – | "You paid this Mon 12 Oct" | Have R6 | HAVE | – | – | – |
| G7 | "What did I spend through foo?" | TB | Spend page | Have R19 | HAVE | – | – | – |
| G8 | Where your money went (from receipts and bank mails) | MU | "October: food ₹8,200, travel ₹14,600…" | No | V1.1 | Very wanted; money facts never guessed (R13) | M | H |
| G9 | Find and cancel subscriptions | MU IN | "4 subscriptions, ₹1,896/month. Cancel any?" | No | V1.1 | Each cancel needs a card | M | M |
| G10 | Lower a bill by negotiating | MU | – | No | NEVER | Calls and negotiation | L | H |
| G11 | One-time virtual cards | TB IN MU | – | No | LATER | Not available in India today | L | H |
| G12 | UPI payments by agents (NPCI protocol) | – | – | No | LATER | Not launched; revisit when NPCI ships | L | H |
| G13 | Split a bill with friends | – | – | No | LATER | Needs other people | M | M |
| G14 | Tax and deadline reminders (ITR, advance tax) | – | Starter routine | Part R12 | V1 via C19 | Starter only | S | L |
| G15 | Stock and crypto alerts | GM | "BTC below ₹55 lakh" | Have R12 | HAVE | – | – | – |
| G16 | Ask before sharing bank data elsewhere | GB (CL70) | – | Part Art. 14 | V1.1 | Make explicit in the engine | S | M |
| G17 | Add a card safely | TB | Secret box card | Have R4 | HAVE | – | – | – |
| G18 | Refund tracking | MN | "Refund ₹10,200 not in yet; it's day 6 of 7" | No | V1.1 | Small routine | S | L |

### H. Travel

| # | Feature | Apps | What you see | foo v1 | Call | Why | Eff | Risk |
|---|---|---|---|---|---|---|---|---|
| H1 | One Trips chat for everything travel | GB | – | Have (Trips template) | HAVE | – | – | – |
| H2 | Trip plan as a file | PX CW TB | "Goa trip plan.pdf" card | Part (05 §5.23 file card) | V1.1 | With K2 | S | L |
| H3 | PNR and flight status alerts | TB IN | "PNR 245… now CNF, coach B3" | Part R12 | V1 via C19/E3 | – | S | L |
| H4 | Packing list | – | Checklist card | No | V1.1 | Trivial with the Trips helper | S | L |
| H5 | Visa and arrival forms | IN | – | No | LATER | Needs D14 | L | H |
| H6 | Forex and travel insurance | – | – | No | LATER | Money products | M | H |

### I. Home and family

| # | Feature | Apps | What you see | foo v1 | Call | Why | Eff | Risk |
|---|---|---|---|---|---|---|---|---|
| I1 | Birthdays and gifts | IN (doodle) | Brief: "Mom's birthday Wed 21 Oct" | Have (Family template, brief rank 3) | HAVE | – | – | – |
| I2 | Gas cylinder booking | – (India) | "Book Indane refill?" card | No | V1.1 | Home helper; WhatsApp or website | S | M |
| I3 | Plumber or electrician (Urban Company) | AX (Thumbtack, Angi) | Slot chips → card | No | V1.1 | With E12 | M | M |
| I4 | School: fees, PTM, circulars from mail and WhatsApp | – | "Fees ₹18,000 due Mon 26 Oct" | No | V1.1 | Kids template | S | M |
| I5 | A helper shared with your spouse | IN CG | – | No | LATER | Needs multi-user and sync | L | H |
| I6 | foo in a group with real family | IN TB CG MU | – | No | LATER | PRD "Later" | L | H |
| I7 | Smart home control | AX | – | No | NEVER | Off-mission | M | M |
| I8 | Reminders for parents (medicine) as a WhatsApp draft | – | "Draft to Papa: 'BP tablet at 9'" every day; you tap Send | No | V1.1 | Caring use; each send still needs a tap | S | M |

### J. Health and reminders

| # | Feature | Apps | What you see | foo v1 | Call | Why | Eff | Risk |
|---|---|---|---|---|---|---|---|---|
| J1 | Medicine and habit reminders | OC GB | "Every day 9:00 PM: BP tablet" | Have R12 | HAVE | – | – | – |
| J2 | Doctor appointment booking | IN | Practo slots | No | V1.1 with E12 | – | M | M |
| J3 | Health data (WHOOP, Apple Health) | IN (beta) CP | – | No | NEVER (v1) | Sensitive; desktop | L | H |
| J4 | Health facts never guessed | – | – | Have R13 | HAVE | – | – | – |
| J5 | Explain a lab report | MU GM | – | No | LATER | Medical-advice risk | M | H |

### K. Content and creativity

| # | Feature | Apps | What you see | foo v1 | Call | Why | Eff | Risk |
|---|---|---|---|---|---|---|---|---|
| K1 | **Photos and papers in → foo acts** (bill photo, ticket PDF, screenshot) | IN GB MU CG | Drop a photo of the electricity bill → bill card with due date and "Pay"; drop an e-ticket → calendar entry and reminders | Part (attachments 04 §10; no action rules) | **V1** | Huge for paper bills and WhatsApp-forwarded tickets; uses the user's AI's vision | S | M |
| K2 | Make documents (PDF, Word, Excel) on request | TB CW GB PX | "Make a sheet of my October bills" → file card | Part (file card exists) | V1.1 | Write the rules: Documents\foo, no overwrite | M | L |
| K3 | Slide decks | GB CW | – | No | LATER | Work-leaning | M | L |
| K4 | Images: greetings, invites, birthday cards | GA GM MU CG | "Diwali card for the family group" → 3 images → Draft with the image | No | V1.1 | Very popular in India; only if the user's AI can make images | M | M |
| K5 | Video generation | GA MU | – | No | NEVER | Cost, misuse | L | H |
| K6 | Music and podcasts | MU AX | – | No | NEVER | Off-mission | L | M |
| K7 | Public web pages and sites | IN PK TB GB PX | – | No | NEVER | No foo cloud (Art. 15) | L | H |
| K8 | Share a result as a PDF or image to WhatsApp | GB (Download PDF) | "Send this plan to Priya" → Draft with the PDF attached | No | V1.1 | foo's answer to shared pages | S | M |
| K9 | Captions and posts in your voice (Instagram, X) | GB | Draft card; opens the app to post | Part R18 (X only) | V1.1 | Same as X drafts | S | L |
| K10 | Summarise a link, reel or YouTube video | TB MU | Paste a link → 5 lines | Part (link preview, browser) | V1.1 | Video needs a transcript | S | L |
| K11 | Live app cards (Canva, Figma, Notion) | GB | – | No | NEVER | Technical and heavy | L | M |
| K12 | Make small apps ("vibe coding") | RB MU PX | – | No | NEVER | Not foo's job | L | M |
| K13 | Write a message in another language for someone | – | "Write it in Hindi for Mummy" | Have (R24, AI) | HAVE | – | – | – |

### L. Files and the PC

| # | Feature | Apps | What you see | foo v1 | Call | Why | Eff | Risk |
|---|---|---|---|---|---|---|---|---|
| L1 | Attach files and photos (25 MB) | GB | – | Have (04 §10) | HAVE | – | – | – |
| L2 | Files each helper made, in one place | GB (Library) | Helper profile → Files | Have (06 §4.1) | HAVE | – | – | – |
| L3 | **"Send to foo" from File Explorer and drag onto foo** | GB (share sheet, @bot) | Right-click a file → Send to → foo; or drop on foo's window or taskbar → a new chat line "What should I do with Electricity-Sep.pdf?" with 3 chips | No | **V1** | Grok's "hand it from anywhere" on Windows, very cheap (a Send To shortcut) | S | L |
| L4 | Windows Share sheet target | GB (phone share sheet) | foo in the Share menu of Photos or Edge | No | V1.1 | Needs packaged app identity | M | M |
| L5 | Find a file on my PC | CP GM | "Find my PAN card PDF" → file cards | No | V1.1 | Uses Windows' own index; read-only | M | M |
| L6 | Tidy my Downloads | GM CW CP | – | No | LATER | Deleting or moving files is risky | M | H |
| L7 | Work inside other desktop apps | CP CW PX | – | No | LATER | PRD "Later" | L | H |
| L8 | Save a web page as PDF | GB | "Save this receipt page as PDF" | No | V1.1 | Proof and records | S | L |
| L9 | "Look at my screen" | CP | – | No | NEVER (v1) | Too much privacy risk | M | H |
| L10 | Open files, apps and links for you | – | – | Have (PRD §5) | HAVE | – | – | – |

### M. Search and research

| # | Feature | Apps | What you see | foo v1 | Call | Why | Eff | Risk |
|---|---|---|---|---|---|---|---|---|
| M1 | Search all chats, files and memory | GB | Ctrl+K | Have R22 | HAVE | – | – | – |
| M2 | Ask from your own things | – | Ctrl+Enter | Have R22 | HAVE | – | – | – |
| M3 | Research report with sources | PX GM GA CG | "Research Goa in December" → 1-page file with citations | Part (citation pills in 04) | V1.1 | With K2 | S | L |
| M4 | Comparison table | PX CG | – | Have (05 §5.22) | HAVE | – | – | – |
| M5 | Live scores and news | MU GA | "Score?" → answer | Have (browser) | HAVE | – | – | – |

### N. Proactive briefs

| # | Feature | Apps | What you see | foo v1 | Call | Why | Eff | Risk |
|---|---|---|---|---|---|---|---|---|
| N1 | Morning brief that ends | GM CG IN MT GB | "That's all for today" | Have R7 | HAVE | – | – | – |
| N2 | Brief learns from 👍/👎 | GM CG | – | Have R7 | HAVE | – | – | – |
| N3 | "Couldn't check" footer | GB | – | Have (08 §14.2) | HAVE | – | – | – |
| N4 | Evening wrap and tomorrow clash check | IN (8pm) | 9:00 PM: "Tomorrow: 2 things, 1 clash" | No | V1.1 | Optional second brief; off by default | S | M |
| N5 | "Add to tomorrow's brief" | CG (curate) | Right-click a message → "Remind me in tomorrow's brief" | No | V1.1 | Gentle and in budget | S | L |
| N6 | Unasked product picks | IN (Selections) MU (feed) | – | No | NEVER | Called "ewwww"; breaks trust | – | H |
| N7 | Discovery feed | MU CG | – | No | NEVER | Noise | M | M |
| N8 | Deadline warnings from your mail | IN TB | "Delivery cut-off for Diwali gifts is tomorrow, 12:00 PM" | Part (cancel reminders) | V1.1 | With E15 | S | M |
| N9 | Interruption budget with "Why am I getting this?" | – | – | Have R7, Art. 19 | HAVE | – | – | – |
| N10 | Quiet watchers (silent unless something matters) | HM OC GB | – | Have R12 | HAVE | – | – | – |
| N11 | Weekly recap of what foo did | HM | Sunday: "This week: 2 bookings, ₹3,840 bills, 6 hours saved" | No | V1.1 | Shows value; feeds trust | S | L |

### O. Groups and sharing

| # | Feature | Apps | What you see | foo v1 | Call | Why | Eff | Risk |
|---|---|---|---|---|---|---|---|---|
| O1 | Helper groups | GB MN | – | Have R2 | HAVE | – | – | – |
| O2 | Private stays private | GB IN TB | – | Have Art. 14 | HAVE | – | – | – |
| O3 | Groups with real people | IN TB CG MU | – | No | LATER | See I6 | L | H |
| O4 | Agent-to-agent with friends | IN | – | No | NEVER | See E16 | L | H |

(Sharing a helper is C6; sharing a result is K8.)

### P. Multi-device and phone access

| # | Feature | Apps | What you see | foo v1 | Call | Why | Eff | Risk |
|---|---|---|---|---|---|---|---|---|
| P1 | Phone app as a remote | GB CW PX MN GM | – | No | LATER | PRD "Later" | L | M |
| P2 | **Text foo from your phone through your own WhatsApp ("Message yourself")** | GB (mobile, XChat) MN (Telegram) OC CW (Dispatch) | On the phone, in WhatsApp's "You" chat: "foo: book cylinder" → reply "On it. Tap Approve on your PC when you're back." | No | V1.1 | A phone remote with no new app; approvals stay on the PC (X-02) | M | M |
| P3 | Phone notifications | GB | – | No | LATER | With P1 | L | M |
| P4 | Approve money from the phone | PX | – | No | NEVER (for now) | X-02: approve only in foo's window | M | H |
| P5 | Sync between devices | GB | – | No | LATER | No foo cloud | L | H |
| P6 | Keep the PC awake while a job runs | CW (fails when asleep) | Tray: "Keeping your PC awake for 1 job" | Part (catch-up) | V1.1 | Stops silent failures | S | L |
| P7 | Glasses and gadgets | MU RB | – | No | NEVER | – | – | – |
| P8 | Answer from the Windows notification | GB | Type a short reply in the toast (never approvals) | No | V1.1 | Speed; X-02 still holds | S | L |

### Q. Privacy and control

| # | Feature | Apps | What you see | foo v1 | Call | Why | Eff | Risk |
|---|---|---|---|---|---|---|---|---|
| Q1 | Secret box and paste catcher | GB HM OC TB | – | Have R4 | HAVE | – | – | – |
| Q2 | Sign in yourself, take over | GB MN GM | – | Have R11 | HAVE | – | – | – |
| Q3 | Saved site logins filled without foo seeing them | HM TB IN | "Save your IRCTC login?" | Have (05 §5.10) | HAVE | – | – | – |
| Q4 | Codes read from Gmail, per site, if you say yes | GB IN | – | Have (05 §5.10) | HAVE | – | – | – |
| Q5 | Password manager (Bitwarden, 1Password) | GB IN | – | No | LATER | Technical setup | M | M |
| Q6 | foo keeps your authenticator codes | IN HM | – | No | NEVER | Defeats two-step safety | M | H |
| Q7 | Copy your browser's logins and cookies | GB (coming) | – | No | NEVER | Unsafe | M | H |
| Q8 | Approval cards, second look, taps not words | GB CG HM | – | Have R5 | HAVE | – | – | – |
| Q9 | "Always allow" for sending or paying | GB MU | – | No | NEVER | X-03; the Muse leak | – | H |
| Q10 | Rule engine for auto-approvals | GB CG HM | – | No | NEVER | Too complex; the Second look stays internal | M | H |
| Q11 | Activity log, export, delete everything | – | – | Have R21 | HAVE | – | – | – |
| Q12 | Pause a helper; reset | CG | – | Have (06 §4.1, R21) | HAVE | – | – | – |
| Q13 | Undo a settings or memory change | HM | – | Have (R21 Undo, R13) | HAVE | – | – | – |
| Q14 | Strangers need a pairing code | OC HM | – | No | NEVER | foo is not reachable by others | – | – |
| Q15 | Per-app permissions | CP | – | Have R21 | HAVE | – | – | – |

### R. Settings and personalisation

| # | Feature | Apps | What you see | foo v1 | Call | Why | Eff | Risk |
|---|---|---|---|---|---|---|---|---|
| R1 | Settings by asking, with Undo | – | – | Have R21 | HAVE | – | – | – |
| R2 | Light, dark, wallpaper | GB | – | Have R23, 02 | HAVE | – | – | – |
| R3 | Helper colour on your own bubbles in its chat | GB (CL68.1) | Your bubbles turn Trips-blue in Trips | No | V1.1 | Instant "who am I talking to" | S | L |
| R4 | Mute, pin, mark unread | GB WA | – | Have (03 §3.4) | HAVE | – | – | – |
| R5 | A different AI per helper | – (GB has no picker) | Trips uses Claude, Home uses the free one on your PC | No | V1.1 | Cost control; Grok's top complaint was no choice | S | M |
| R6 | Times in India time | – | – | Have R24 | HAVE | – | – | – |
| R7 | Keyboard shortcuts sheet | GB | – | Have R23 | HAVE | – | – | – |

### S. Money for foo itself (monetisation and access)

| # | Feature | Apps | What you see | foo v1 | Call | Why | Eff | Risk |
|---|---|---|---|---|---|---|---|---|
| S1 | Free; uses your own AI; no account | OC HM | – | Have R3 | HAVE | – | – | – |
| S2 | Bundled with an AI subscription | GB GM CG CW | – | – | NEVER | foo has no AI of its own | – | – |
| S3 | Credits for work | PX MN | – | No | NEVER | Surprise bills are what foo fights | – | H |
| S4 | A paid "foo Plus" (one-time ₹ or yearly) for extras (phone remote, more helpers, voice pack) | PK MT LD | – | No | LATER | Decide after the stranger test; never gate safety | M | M |
| S5 | Invites and waitlists | IN TB | – | No | NEVER | – | – | – |
| S6 | Commissions on what foo buys | MU IN | – | No | NEVER | Conflict of interest | – | H |
| S7 | Paid human errands | PK | – | No | NEVER | – | – | – |
| S8 | Haggle over the price with the bot | PK | – | No | NEVER | Gimmick | – | – |
| S9 | Usage meter always visible | GB PX | – | Have R19 | HAVE | – | – | – |

### Counts

| Call | Count |
|---|---|
| HAVE (already in v1) | 84 |
| **V1 (add now)** | **7** (C19, E3, G3, F4, K1, L3, D8) + 3 riding along as Ideas-gallery starters (C20, G14, H3) |
| V1.1 | 71 |
| LATER | 31 |
| NEVER | 45 |
| **Total features** | **241** (10 counted as V1 incl. the 3 starters) |

---

## 4. Top 10 "Grok Bot-style" features foo lacks (with UX sketches)

These are ranked by how much each makes foo feel like Grok Bot: a team you can hand things to from anywhere, that starts you off with ideas, gets better at repeats, and makes real things. Copy in "quotes" is a proposal, written to foo's rules (no tech words, absolute times, ₹, tap to approve).

### 1. Ideas gallery (V1) · Grok: templates, "find a template", Connect Apps
- **Where:** Routines page empty state, plus a new left-shell ⋯ item "Ideas". foo can also link it ("Here are some ideas →") when you ask "what can you do?".
- **Sketch:**
```
┌ Ideas ─────────────────────────────────────────────┐
│ [All] [Money] [Travel] [Home] [Family] [Fun]       │ chips
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ │
│ │ 🚆 Watch my   │ │ 📦 Parcel     │ │ 💡 3 days    │ │ 160×120 tiles
│ │ PNR          │ │ near me      │ │ before bills │ │
│ │ Tells you    │ │ Tells you on │ │ Every bill in│ │
│ │ when it's    │ │ "out for     │ │ Gmail, 3 days│ │
│ │ confirmed    │ │ delivery"    │ │ early        │ │
│ │ [ Start ]    │ │ [ Start ]    │ │ [ Start ]    │ │
│ └──────────────┘ └──────────────┘ └──────────────┘ │
│ 🏏 Close finish alert · 📈 Price drop · 🧾 ITR due  │
│ 🔁 Recharge before my plan ends · 🎂 Birthdays     │
└────────────────────────────────────────────────────┘
```
- **Words:** title "Ideas"; sub "Tap one to start. I'll ask anything I need." Start → foo posts the usual Routine card (R12) in the right chat, already filled, with "Run once now" done first. Ideas for a missing connection show "Needs Gmail" and the Connect card.
- **Ideas (India pack, 12):** Watch my PNR · Parcel near me · 3 days before bills · Recharge before my plan ends · Price drop on a product · Flight fare below ₹X · Close cricket finish · ITR and advance-tax dates · Birthdays this week · School mails summary · Medicine reminder · Weekly "what did I spend".

### 2. "Send to foo" from Windows (V1) · Grok: phone share sheet, Tag @bot
- **Where:** File Explorer right-click → Send to → foo; drag a file onto foo's window or taskbar button; paste an image into the composer (already allowed).
- **Sketch:** foo opens on its own chat with your file as your bubble, and foo replies:
  "Got **Electricity-Sep.pdf**. What should I do?" chips: [ Pay this bill ] [ Remind me before it's due ] [ Just keep it ] [ Something else… ]
- **Rules:** nothing starts until a chip is tapped (Art. 3). Files over 25 MB get "That file is too big. I can take up to 25 MB."

### 3. Text foo from your phone (V1.1) · Grok: mobile app, XChat, @bot
- **Where:** Settings → Connections → WhatsApp → "Text me from your phone" toggle (off by default).
- **Sketch (phone, WhatsApp "You (Message yourself)" chat):**
```
you:  foo book gas cylinder
foo:  On it. Indane refill ₹853 is ready. Tap Approve on your PC
      when you're back. (I can't take payments from here.)
```
- **PC:** the job appears in foo's chat with a small "📱 from your phone" tag. Approval and Payment cards stay on the PC (X-02).
- **Words at switch-on:** "Messages you send yourself on WhatsApp that start with 'foo' come to me. I reply in the same chat. Payments and sends still wait for your tap on this PC."

### 4. "Do it like last time" (V1.1) · Grok: Skills, Teach a task
- **When:** after a job finishes with proof the second time it is done the same way.
- **Card:** "Save how I did this? Next time 'pay electricity' takes one tap." [ Save it ] [ Not now ]
- **Later use:** the composer suggests a chip "⚡ Pay electricity (like last time)" when you type "electricity". The helper profile gets a section "Things I know how to do", each with Rename and Forget.
- **Rules:** a saved how-to never skips an Approval or Payment card.

### 5. Make things: documents, sheets and pictures (V1.1) · Grok: decks, pages, Imagine
- **Words:** "Make a sheet of my October bills" → File card "October bills.xlsx · Excel · 18 KB" [ Open ] [ Show in folder ] [ Send to… ].
- **Pictures:** "Make a Diwali card for the family group" → 3 image tiles → "Pick one" → Draft card for WhatsApp with the image. Shown only when the user's AI can make pictures; otherwise "Your AI can't make pictures. I can write the message instead."

### 6. "Catch me up" (V1) · Grok: X search and monitor, morning report
- **Where:** any chat, or the chat header ⋯ of a WhatsApp-linked contact list; typed "catch me up on Family group" or "what did I miss in mail?".
- **Card:**
```
┌ 📋 Family group · since Thu 15 Oct, 9:00 PM ────────┐
│ • Mausi's flight lands Sat 17 Oct, 4:30 PM (Priya)  │
│ • Dinner at ours on Sun, 7 people (Mom)             │
│ • 34 good-morning messages, skipped                 │
│ For you: Mom asked if you can pick up sweets.       │
│ [ Draft a reply ]  [ Add Sun dinner to calendar ]   │
└─────────────────────────────────────────────────────┘
```
- **Rules:** read-only. Group messages go to the user's own AI only. A reply is always a Draft card. The card footer says "I only read; nothing was sent."

### 7. foo offers to take work off your plate (V1.1) · Grok: Primary Bot
- **When:** at most once a week, inside the 3-a-day budget, only from repeated real patterns.
- **Card:** "You've paid Airtel by hand 3 months running. Want me to get it ready every month? You'll still tap Pay." [ Yes, every month ] [ Not now ] [ Don't suggest this ] · "Why am I getting this?"

### 8. Forward anything to foo by email (V1.1) · Grok: a Bot's own email address
- **Where:** Settings → Connections → Gmail → "Your foo address: vikas+foo@gmail.com [ Copy ]".
- **Flow:** you forward a hotel confirmation from any phone or PC. foo replies in its chat: "Got the Taj booking from your email. Added Sat 12 Dec to your calendar and a reminder before the free-cancel time, Thu 10 Dec, 6:00 PM." [ Undo ]
- **Why it fits:** no foo cloud; it uses Gmail's built-in +address.

### 9. Two Gmail accounts and "send as" (V1.1) · Grok: second account, From picker
- **Connect card:** "+ Add another Google account".
- **Draft card:** a "From" row with a picker: "vikas@gmail.com ▾".
- **Proof line:** "Sent from your work account."
- **Rule:** if two accounts could send, foo asks "Which account?" with chips.

### 10. Live voice chat in Hindi (decision now: LATER) · Grok: voice chat
- **Why it is in the top 10:** Grok users love it, and it fits Hindi and Punjabi speakers.
- **Why LATER:** foo would need real-time speech from the user's own AI, and Hindi quality on PCs is unproven. Voice notes (R16) already give 80% of the value.
- **Revisit when:** Claude, ChatGPT or Gemini expose real-time voice to desktop apps.
- **Sketch for then:** a phone icon in foo's chat header → a call strip "On a call with foo · 02:14 · [ Mute ] [ End ]". The work it starts shows as normal checklists; a "Voice chat · 6 min" card is left in the chat afterwards.

---

## 5. Proposed PRD deltas (new lines R25+; do **not** edit `foo-prd.md` until Vikas agrees)

**For v1 (7 additions, all P1 so they can slip with a note):**

- **R25 · Ideas gallery: ready-made routines and helpers (India pack) · P1.** An "Ideas" page of 12 tap-to-start routines (§4 item 1). Start posts the normal Routine card; nothing runs without it. Sources: GB templates, PK recipes, HM catalogue, GM suggested.
- **R26 · Trains end to end: IRCTC search, booking, Tatkal-ready, PNR watch · P1.**
  - New journey J24 and acceptance tests; this closes PRD §11 "trains have no journey".
  - Tatkal: foo fills everything before the window opens and waits for your Payment tap. No auto-pay at 10:00 AM.
  - PNR watch is a routine.
- **R27 · Recharges and everyday billers · P1.** Mobile prepaid, DTH, FASTag, gas, broadband and electricity through the J11 engine.
  - Plan choice is a Choice card; paying is a Payment card.
  - "Recharge before my plan ends" is an idea in R25.
- **R28 · "Catch me up" on a WhatsApp chat or group, or on the inbox · P1.**
  - Read-only summary card with "For you" lines.
  - Any reply is a Draft card.
  - Footer: "I only read; nothing was sent." Private-fact rules (Art. 14) apply.
- **R29 · Photos and papers in → act · P1.** A dropped photo or PDF of a bill, e-ticket or booking becomes a Bill card, calendar entry or reminder, each behind its normal card.
  - If the user's AI can't read pictures: "Your AI can't read pictures. Can you type the amount and due date?"
- **R30 · "Send to foo" from Windows · P1.** A "Send to → foo" entry in File Explorer, plus dropping files on the window or taskbar button. foo asks what to do with chips; nothing starts without a tap.
- **R31 · Private chat · P1.** A header toggle "Private chat":
  - nothing from this chat is saved to memory;
  - the chat is deleted when closed (after a confirm);
  - a ghost mark shows in the header;
  - Activity log keeps only "a private chat happened".

**For V1.1 (first update; listed so the v1 build leaves room):**
- **R32 · Text foo from your phone through WhatsApp "Message yourself" · V1.1.** Approvals stay on the PC (X-02).
- **R33 · "Do it like last time": saved how-tos per helper · V1.1.** They never skip a card.
- **R34 · Make things: documents, sheets and pictures · V1.1.** Saved in Documents\foo; pictures only when the user's AI can make them.
- **R35 · Forward to foo by email (Gmail +address) · V1.1.**
- **R36 · Two Google accounts, "send as" picker, signature · V1.1.**
- **R37 · foo offers to take repeat work off your plate · V1.1.** Weekly at most, inside the Art. 19 budget.
- **R38 · More bookings on the same engine · V1.1.** Flights journey, web check-in, movie tickets, doctor, salon and home services, food and grocery reorders (cart-style Payment card), and change or cancel a booking.
- **R39 · Money insight · V1.1.** Where your money went, subscriptions found and cancellable, refund tracking. Money facts come only from documents, never guesses.
- **R40 · Papers shelf with renewal reminders · V1.1.** Its own safety review before build.
- **R41 · Voice polish · V1.1.** Dictate-to-edit, word-highlighted transcripts with speed control, a voice per helper, and the brief as a voice note.
- **R42 · Small chat delights · V1.1.**
  - Human working phrases, a pulsing face while working, and confetti on proof.
  - Helper colour on your bubbles, and "Add to chat" on selected text.
  - Multi-select choice, and "Start fresh" for long chats.
  - Weekly recap, and "Add to tomorrow's brief".
  - Keep the PC awake while a job runs, and quick replies in notifications (never approvals).

**Decisions to record now (so nobody re-opens them):** live voice chat LATER (B5); phone app LATER (P1); real-people groups LATER (I6, O3); calls LATER (E19); public pages, wallets, credits, commissions, Always-allow for sends, cookie import, authenticator storage, Slack/Teams, video generation: NEVER.

---

## 6. Caveats
- Grok Bot's in-development items (multi-account, Chrome profile import, desktop egress, Templates tab) come from one August report; whether they have shipped is [unverified].
- Exact Grok pricing today is [unverified]; sources disagree, and xAI's own page lists plans, not prices.
- Copilot Fall-release details (Groups, Mico) and Alexa+ family memory are from search-result summaries only [unverified].
- "Have" calls cite the PRD and constitution as of 16 Oct 2026. Where a constitution section exists but the PRD does not name it (once reminders, saved logins, Gmail codes, pin/mute, Library), we cite the chapter.
