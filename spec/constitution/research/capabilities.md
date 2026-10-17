# Capabilities research: computer use, browser use, connections, and what else the market has

Research date: Fri 16 Oct 2026 · For: Vikas · Status: proposal. This file is evidence only. It changes no spec until Vikas says yes and the coordinator applies the "Spec deltas" (§7).

Evidence labels: **[observed]** official page, docs or source code · **[reported]** press, users or a third party · **[inferred]** our reasoning · **[unverified]** we could not confirm it. Sources are numbered in `capabilities-sources.md` ([C1]…), and the teardowns in `../../../personal-agent-re/` are cited by folder.

---

## 0. The short answer for Vikas (plain words)

| Question | Answer | Why, in one line |
|---|---|---|
| **Is browser use needed?** | **Yes. Keep foo's own Edge window, exactly as specified.** | In India almost every errand (IRCTC, electricity bills, MakeMyTrip, Amazon, government sites) has no app connection for ordinary people. Without a browser foo could only give advice. |
| **Chrome extension or cloud browser instead?** | **No to both, for v1. Cloud browser: never.** | An extension acts inside all your personal sign-ins and needs a store review. A cloud browser sends your life to a server, costs money every minute, and Indian sites block cloud computers. |
| **Computer use (clicking other apps)?** | **Not in v1 (as decided). Plan it for v1.1 as "Use an app on my screen", one app at a time, only apps you allow, with money apps blocked.** | The leaders (Claude Cowork, ChatGPT, Perplexity, Manus, Copilot) all have it now, but every one of them warns that it is unsafe for banking and still a preview. foo's users are non-technical, so we wait one release and do it more safely. |
| **Connections?** | **v1: Gmail + Calendar, WhatsApp, X drafts (as decided) + Google Contacts (new, same Google sign-in).** v1.1: Outlook/OneDrive, Google Drive, Zomato, Swiggy, and a "Connections gallery". | Contacts makes "message Rahul" work. Zomato and Swiggy have official connections for AI apps since 2025–26. |
| **Should foo support MCP?** | **Yes, under the hood, as a curated "Connections" gallery (v1.1). "Add your own connection" later, behind an Advanced switch. The word MCP never appears.** | Indian companies (Zomato, Swiggy) and global ones (Notion, Canva, Spotify-in-ChatGPT) now ship their AI connections this way. A gallery foo has checked keeps the "approvals are taps" promise. A "paste any link" box lets a stranger's tool steer foo. |
| **What else is missing?** | **Now (v1.1): text foo from your phone via WhatsApp "Message yourself", memory import from ChatGPT/Gemini/Claude, real Excel/Word files.** Later: phone companion app for taps on the go, phone calls on your behalf, UPI agent payments. Never: a foo email address on a server, a cloud computer. | These are what users of Poke, Tab, Instinct and Cowork Dispatch love most. Calls and payments carry the biggest risks, so they wait. |

---

## 1. Comparison matrix (agent × capability)

Legend: ✅ has it · 🟡 partial, preview or limited · ❌ no · ? not found. "Own PC" means it acts on the user's own computer.

### 1.1 Computer use, browser, connections

| Agent | Where it runs | Computer use (desktop apps by screenshot + click) | Browser use | Connections (how added) | Custom MCP / "add your own" |
|---|---|---|---|---|---|
| **OpenClaw** | Own PC or server (daemon) | 🟡 phone/desktop "nodes" expose `screen.*` and camera; no general click loop found [openclaw §1; unverified for clicks] | ✅ three modes: managed own profile (`openclaw`), **Chrome extension relay** you attach per tab, or remote CDP [C20] | ✅ ~50 bundled skills (Notion, Spotify, 1Password…), ClawHub marketplace, setup scans installed apps and suggests [openclaw §2.5] | ✅ skills + plugins; community marketplace, opt-in |
| **Hermes** | Own PC or server | 🟡 has a separate computer-use page [C21; unverified details] | ✅ 7 backends: cloud (Browser Use, Browserbase, Firecrawl), local stealth Firefox, local Chromium, or **attach to your own Chrome/Edge** [C21] | ✅ MCP connectors, onboarding "look around this PC" suggests some [hermes §2] | ✅ any MCP server (config file) |
| **Poke** | Cloud only | ❌ | 🟡 "narrow browser use", barred from password logins [poke §2] | ✅ Gmail/Outlook, Calendar, Notion, Linear, GitHub, Oura, Hue, Sonos; one-link "recipes" [poke §2] | ✅ custom MCP, needs a public web address [poke §2] |
| **Tab** | Cloud computer per user | 🟡 cloud computer, browser-centred [tab §2] | ✅ own cloud browser; "type it from your phone" live link for sign-ins [tab §2] | ✅ one Google sign-in (Gmail, Cal, Drive, Docs, Sheets, Contacts, Tasks) + Slack, GitHub, Linear, Notion; writes denied unless that exact action is on [tab §2] | ❌ not found |
| **Instinct** | Cloud | ❌ (Mac app beta shows "Local browser" and iMessage) [instinct 01] | ✅ leased cloud browser pool with saved profile; per-site guidance notes [instinct 04] | ✅ Google, Outlook, 1Password broker, WHOOP (beta), Shopify checkout tools, Stripe Link [instinct 04] | ❌ not found |
| **Grok Bot** | Cloud computer per user | ✅ on its own cloud computer; watch live + take over; "Teach a task" records you for 10 min [grok 01, 04] | ✅ the cloud computer's browser; Secure Form; take over for passkeys/2FA [grok 04] | ✅ "Connect apps" (was Marketplace): Gmail, Calendar, Slack, GitHub, Notion, QuickBooks, X, 1Password; attach with @ [grok 01] | 🟡 API-key connectors via secure card [grok 04] |
| **ChatGPT (Dot / agent)** | Cloud Linux + Chrome; optional your PC | ✅ cloud computer; 🟡 **your PC, off by default** ("Allow access", PC must be online) [chatgpt §2] | ✅ cloud Chrome; falls back to your local browser [chatgpt §2]. Also the ChatGPT Atlas browser [inferred] | ✅ 4,000+ plugins/apps incl. Spotify, Booking.com, Expedia, Zillow; Uber, DoorDash announced [C17] | ✅ custom connectors (Zomato, Swiggy plug in this way) [C3, C5] |
| **Gemini (Spark)** | Google cloud VM | 🟡 remote VM; Android Halo status | ✅ **cloud Chrome** or **Chrome auto browse on your own signed-in Chrome** [gemini §2] | ✅ Workspace native + MCP "Connected Apps" (Canva, OpenTable, Instacart, Dropbox, Zillow) [gemini §2] | ✅ **any custom MCP server URL** since 29 Jun 2026 [gemini §2] |
| **Muse (Meta)** | Meta cloud | ❌ | ✅ cloud browser sub-agent reads an accessibility tree, cannot run scripts [muse §2] | ✅ Meta apps (IG, FB, Marketplace, WhatsApp), Gmail, Docs, Shopify, Squarespace [muse §2] | 🟡 Muse *proposes* custom connectors it writes, with approval [muse §3] |
| **Copilot / Autopilot** | Microsoft cloud + Windows | 🟡 **Copilot Actions** on Windows (Insider preview) in a separate "agent workspace" with its own agent account [C8] | ✅ **Edge Copilot Mode Actions** use your history and sign-ins, ask at steps [C9; autopilot §3] | ✅ Outlook, Gmail, Drive, Calendar, OneDrive with consent per source [autopilot §3] | ✅ Windows "agent connectors" = MCP servers in the On-Device Registry; Windows asks before use [C8] |
| **Claude Cowork** | Anthropic cloud + your PC (desktop app) | ✅ **macOS and Windows** (Windows since 3 Apr 2026), research preview, Pro/Max; asks per app; investment/crypto apps blocked by default; you can add a blocklist [C6, C7] | ✅ **Claude in Chrome extension** in your own Chrome; asks before financial sites; blocks adult/pirate sites [C10] | ✅ connectors (Gmail, Drive, Calendar, Slack, Notion, DocuSign), per-tool "ask" settings; plugins bundle them [cowork §2] | ✅ any custom MCP connector |
| **Perplexity Computer / Personal Computer / Comet** | Cloud sandbox; Personal Computer on your Mac/Windows | ✅ Personal Computer (Windows since Jul 2026): local files, Microsoft 365; works only in folders you connect; "sensitive operations require on-device authorization" [perplexity §2] | ✅ cloud browser + **Comet** (its own browser on your PC) with 3 modes: you browse / once / automatically [perplexity §2] | ✅ 400+ managed OAuth connectors; some still ask for header names and bearer tokens [perplexity §2] | 🟡 token-pasting custom connectors ("the tutorial died at bearer tokens") |
| **Manus / Cue** | Cloud Linux | ✅ 2.0: from your phone, Manus uses **your computer** in a separate visible workspace, only approved files/apps; phone shows a live mirror [manus §2] | ✅ cloud browser (saved sessions) + **"My Browser"** connector: your Chrome/Edge, tab group per task, close tab = stop [manus §2] | ✅ Gmail, Calendar, Slack, Notion… app catalog [manus §2] | ? |
| **foo (spec today)** | **User's own PC, user's own AI** | ❌ v1: open files/apps + one screenshot the user attaches (O-5, X-18) | ✅ own Edge window, foo profile, Playwright-core, live view, take over, masked capture (08 §8.3) | ✅ Gmail + Calendar, WhatsApp linked device, X drafts; Outlook specified but off (08 §16) | ❌ |

### 1.2 Other capability families

| Agent | Text it from your phone | Phone calls for you | Its own email / number | Scheduled tasks | Memory import | Phone companion / multi-device |
|---|---|---|---|---|---|---|
| OpenClaw | ✅ WhatsApp, Telegram, iMessage, Signal +20 | ? | ❌ | ✅ cron + heartbeat | ? | ✅ iOS/Android nodes |
| Hermes | ✅ ~20 chat apps incl. SMS, email | ? | ❌ | ✅ cron | ? | 🟡 via chat apps |
| Poke | ✅ iMessage, SMS/RCS, Telegram, WhatsApp | ❌ | ✅ (phone lines) | ✅ | 🟡 learns from email | ✅ (it lives on your phone) |
| Tab | ✅ iMessage, WhatsApp | ✅ holds up to 1 h | ✅ | ✅ with run history | ❌ | ✅ |
| Instinct | ✅ iMessage, WhatsApp, SMS, voice | ✅ Concierge (16 Sep 2026) | ✅ phone + `@mail.instinct.com` | ✅ | ❌ | ✅ |
| Grok Bot | ❌ (desktop/web app) | ❌ | 🟡 Bot email addresses | ✅ with events | ? | 🟡 phone app |
| ChatGPT Dot | 🟡 SMS beta (US Pro) | ❌ (you can call it) | ❌ | ✅ notify-if | ✅ carries ChatGPT memory | ✅ |
| Gemini Spark | 🟡 email/SMS announced | 🟡 "Ask for me" style [unverified for Spark] | ❌ | ✅ time/event | ✅ Personal Intelligence | ✅ Android Halo |
| Muse | ✅ inside WhatsApp (US) | ❌ | ❌ | ✅ check-ins | ✅ "import memory" prompt from IG/FB/WA | ✅ |
| Copilot | 🟡 Teams/Outlook | ❌ | 🟡 agent identity in tenant | ✅ routines | ? | ✅ |
| Cowork | ✅ **Dispatch**: phone → your PC | ❌ | ❌ | ✅ local + cloud | ✅ import memory | ✅ phone remote |
| Perplexity | 🟡 email assistant you cc | ❌ | ❌ | ✅ | ? | ✅ phone approves PC work |
| Manus / Cue | ✅ Telegram, email, Cue app | ✅ Cue answers and places calls | ✅ own email, number, wallet | ✅ + event Automations | ? | ✅ |
| **foo today** | ❌ | ❌ | ❌ | ✅ routines + catch-up | ❌ | ❌ |

### 1.3 Safety models (what each one does to keep you safe)

| Agent | Key safety ideas | Known failures |
|---|---|---|
| OpenClaw | Exec approvals forwarded to chat (👍 Allow once / ♾️ Always / 👎 Deny); managed browser profile separate from yours; "evaluate JS" can be switched off [openclaw §2; C20] | Reachable by anyone who can message you; repeated prompt-injection hardening |
| Hermes | Secret prompts the model never sees; browser vault; optional write approval [hermes §2] | No iteration cap by default; "run it in a sandbox" advice |
| Poke | Tapback approvals (👍 = send); integrations preferred over web [poke §2] | Time-zone bugs; slow tools |
| Tab | Card vault outside the AI; payment bound to exact cart and total, charged once; scoped connectors (writes denied unless enabled) [tab §2] | Doctor-call surprise: switched to a phone call without a fresh yes |
| Instinct | Vault fill links; 1Password broker; per-site guidance [instinct 04] | $200 fee incident; unasked "Selections" |
| Grok Bot | Secure Form, take over, OAuth tokens kept off the computer [grok 04] | Secure Form password leaked through an accessibility snapshot; reconnect wiped secrets |
| ChatGPT Dot | **Auto-review**: a separate checker outside the sandbox reviews every planned write; secure login [chatgpt §2] | Emailed a city office without permission |
| Gemini Spark | View live / take over; "don't type sign-in or payment details" [gemini §2] | Fake Amazon results with no browser opened; schedules can't be stopped mid-action |
| Muse | **Sentinel**: every outbound request allowed/denied/asked; tainted-process tracking; email connector strips codes and reset links [muse §2] | Marketplace "Allow Always" shared the seller's home address |
| Copilot | Separate agent account + agent workspace; per-agent folder access (Allow always / Ask every time / Never); admin must switch it on [C8] | Preview only |
| Cowork | Connector → browser → screen ladder; asks per new app; blocks finance/crypto apps; user blocklist; no sandbox between Claude and your apps [C6] | Safety burden on the user ("monitor Claude") |
| Perplexity | Folder scoping; on-device authorization; Windows alerts before sending email or deleting a file; kill switch [perplexity §2] | Connectors fail silently |
| Manus | Take over for logins; separate visible workspace for your PC; close tab = stop [manus §2] | Telegram suspended its agent account |
| **foo** | 30 Articles: taps not words, draft ≠ permission, second look, exact-once money, secrets never in chat, masked capture, route ladder | — |

**What the matrix says.** (1) Every big player now has **browser use**, and they split between a cloud browser (Tab, Instinct, Grok, Manus, ChatGPT, Gemini) and the user's own browser (Cowork, Copilot/Edge, Comet, Gemini auto browse, Manus "My Browser", OpenClaw). foo is the only one that is local **and** uses a separate profile: the safest of the "own PC" designs. (2) **Computer use on the user's own PC** arrived in 2026 at Anthropic, OpenAI, Perplexity, Manus and Microsoft, and every one calls it preview, asks per app and warns against money apps. (3) **Connections are converging on MCP**: Gemini, ChatGPT, Cowork, Poke, Hermes and Windows itself accept MCP servers, and Indian brands (Zomato, Swiggy) publish them. (4) The texting agents (Poke, Tab, Instinct) win on **"text it from your phone"** and **phone calls**, which foo lacks.

---

## 2. Facts that change the decision (India, Windows, Oct 2026)

| Fact | Evidence | What it means for foo |
|---|---|---|
| Chrome 136+ ignores remote-debugging switches on the **default** Chrome profile; automation needs a separate data folder | [observed C11] | Driving the user's own everyday Chrome from outside is blocked by Google. Only an extension can do it. foo's separate Edge profile is the supported path. Whether Edge does the same is [unverified]. Spike it. |
| Claude computer use came to **Windows** on 3 Apr 2026 (Cowork, research preview, Pro/Max), asks per app, blocks investment/crypto apps, and says "don't grant access to banking, healthcare or government apps" | [observed C6; reported C7] | The best-funded vendor still treats desktop control as preview and unsafe for money. That supports X-18 (no clicking in v1). |
| Windows "agent workspace" + agent accounts + MCP "agent connectors" exist but are **experimental, off by default, admin-only, Insider preview** | [observed C8] | foo cannot rely on it in v1. Later it could run computer use in a separate Windows session so it never fights the user for the mouse. |
| Microsoft Research **UFO2** pairs Windows UI Automation (the accessibility tree) with vision, and runs in a picture-in-picture virtual desktop | [observed C12] | The right Windows design is "read the app's controls first, look at the picture second", the same idea as foo's browser snapshot. |
| **Zomato** runs an official MCP server (`mcp-server.zomato.com`), login by Zomato's own sign-in, pays by **UPI QR you scan**, and allows only listed redirect addresses | [reported C4] | Perfect fit for Article 7 (foo never holds money). foo must ask Zomato to list its sign-in return address [inferred]. |
| **Swiggy** Food, Instamart and Dineout work in ChatGPT, Claude and Gemini via MCP (27 Jan 2026); "Builders Club" API access for outsiders is invite-led (23 Apr 2026) | [reported C3, C5, C2] | Possible as a curated connection. Needs a partner application. |
| IRCTC has no public booking API; ChatGPT ("Astra") booked IRCTC by **browser** and stopped at payment (15 Sep 2026) | [reported C13] | IRCTC is browser-only for any agent. foo's browser rung is right. |
| Meta bars **general-purpose AI chatbots** from the WhatsApp **Business** API (all users from 15 Jan 2026) | [reported C14] | foo cannot become an official WhatsApp business "contact". The linked-device link (personal account) is a different path, still unofficial (O-2). |
| Google **restricted** scopes (Gmail read) need a yearly CASA security check, roughly $500–$4,500 | [reported C15] | Already O-1. Contacts (`contacts.readonly`) and Drive (`drive.file`) are not restricted [inferred from Google's scope tiers; unverified per scope], so they are cheap to add. |
| Google Photos API: since 31 Mar 2025 apps can no longer read a whole library, only photos the user picks | [observed C16] | "Photos" means a picker or the Pictures folder, not "search all my photos". |
| Spotify API: new apps get 5 users only; full access needs a business with ≥ 250k monthly users | [observed C18] | No Spotify connection for foo. Open the Spotify app or a link instead. |
| X API: pay per use, $0.015 per post ($0.20 with a link), no free tier for new developers | [reported C19] | Keep "X drafts → open X compose" (08 §16.3). |
| Account Aggregator (bank data sharing) sends data only to regulated "financial information users" | [reported C22; unverified detail] | foo cannot read bank accounts officially. Use bank alert emails, statement PDFs in a folder, and SMS later. |
| NPCI + Razorpay + OpenAI piloted **agentic UPI payments** in ChatGPT (Oct 2025, UPI Reserve Pay) | [reported C23] | A future, safer way to pay than typing cards. Watch it; not v1. |
| MCP "tool poisoning": a bad server changed its tool description after approval and made an agent leak WhatsApp chats; approval dialogs hid the payload | [observed C24] | "Add any connection" is dangerous for non-technical users. A curated gallery with frozen tool descriptions is the safe form. |

---

## 3. Option A · Browser use

### 3.1 Why a personal agent needs a browser (plain words)

Most of what people ask a personal helper to do happens on websites that have no "connection" for ordinary users: book a train on IRCTC, pay the electricity bill on the board's site, compare flights on MakeMyTrip, reorder on Amazon or Flipkart, download a bill, fill a government form, check a parcel. Without a browser foo can only say "here's the link, you do it". With one, foo does the 20 boring steps and stops for your tap at the one step that matters (Articles 3, 5, 7).

### 3.2 Options

| Option | What the user sees | Good | Bad | Effort |
|---|---|---|---|---|
| **A1. Keep foo's own Edge window (foo profile)** (current spec 08 §8.3) | A separate Edge window marked "foo", visible in the taskbar; "Watch live", "Take over", "Hand back"; first sign-in to each site once, inside foo's window | Runs on your PC and your home internet, so sites trust it more than cloud computers. Your personal Chrome stays untouched. Sign-ins are listable and wipeable (Connections → Browser). Supported route after Chrome 136. No store review. | You sign in to sites once more inside foo's window. Some sites still show CAPTCHAs. | (already in spec) |
| A2. Your own Chrome through a foo extension | foo works in tabs of your everyday Chrome, already signed in | No second sign-in. | foo can reach every site you are signed in to (bank, work mail): one bad page could steer it. Needs Chrome Web Store review and per-update re-review. Masking and "no capture during sign-in" must be rebuilt inside the extension. Two installers for a non-technical user. Cowork, Comet and Manus warn to use a separate profile anyway [C10]. | L |
| A3. Cloud browser (Browserbase etc.) | Same live view, but the browser runs on a server | Works with the PC asleep. | Breaks Article 15 (your sign-ins on someone else's server). Per-minute cost. Indian sites (IRCTC, banks) block datacenter addresses [reported, grok/manus failures]. Needs a foo server. | L |
| A4. No browser | — | Simplest. | foo can't do the errands people want; most journeys (J9, J10, J13) die. | — |

### 3.3 Recommendation A

**Keep A1 for v1, unchanged in principle. A2 (extension): later, and only if "signing in again" turns out to be the top complaint. A3 (cloud browser): never.**

Small additions for v1 (S effort each):
1. **Blocked and hand-back site lists.** foo's browser never operates net-banking, trading, crypto or password-manager sites. It opens them for the user and hands back ("This is your bank's site. I'll open it, and you do this part."). UPI and card checkouts on shopping sites stay allowed through the Payment card (Article 7). This mirrors Cowork's finance block [C6] and Claude in Chrome's financial-site rule [C10].
2. **Spike: Edge + Playwright persistent profile on Windows 10 22H2 and 11**, including whether Edge has Chrome 136's restriction (it shouldn't touch a separate profile) [unverified].
3. **Prefer site tools when a site offers them.** If a shopping site exposes structured checkout tools (Shopify's checkout tools, used by Instinct [instinct 04]), foo uses those over clicking. This is a later rung inside BROWSER, not a new rung.
4. **"Use a sign-in from my browser" is not offered** (no cookie import from Chrome/Edge personal profiles). It would copy every sign-in the user has into foo [inferred risk].

- **What the user sees:** nothing new except, on a blocked site: "This is your bank's site. I'll open it for you, and you do this part." [ Open {site} ].
- **Risk:** low (already specified). Main residual risk: prompt injection from page text, already handled by untrusted wrapping, the commit-click gate (§8.2.1) and the second look (Article 10).
- **Effort:** S (lists + spike).
- **Laws touched:** 3, 5, 7, 8, 9, 11, 15.

---

## 4. Option B · Computer use (clicking inside other desktop apps)

### 4.1 What the market shows

- **Cowork** (Mac + Windows): asks the first time it uses each app; investment, trading and crypto apps blocked by default; user blocklist; "Background" mode on Mac (no pointer takeover) vs "Full control"; Anthropic says "no sandbox between Claude and your apps" and "don't grant banking, healthcare, government apps" [C6].
- **ChatGPT Dot**: your PC is off by default; "Allow access" per computer; local work is a separate task [chatgpt §2].
- **Perplexity Personal Computer (Windows)**: only folders you connect; Microsoft 365 apps; alerts before sending email or deleting files; on-device authorization; kill switch [perplexity §2].
- **Manus 2.0**: a **separate visible workspace**; only approved apps and files; phone shows a live mirror [manus §2].
- **Windows Copilot Actions**: a separate **agent workspace** (own Windows session) and a separate **agent account**, folder permissions per agent, admin-only preview [C8].
- **UFO2** (Microsoft Research): read the accessibility tree (UI Automation) first, use the picture when that fails; run in a picture-in-picture desktop so the user keeps working [C12].

### 4.2 Options

| Option | What it means | Verdict |
|---|---|---|
| B0. Never | foo only opens apps and looks at a screenshot you attach | Too limiting forever: Excel, Tally, WhatsApp Desktop, a printer dialog and old government apps have no other route. |
| **B1. v1 as specified** (X-18 / O-5) | `screen.open` + one-shot screenshot the user attaches | **Keep for v1.** |
| B2. v1 "watch-only" | foo may take screenshots of an allowed app to read it, never click | Small value over B1 (the user can already attach a screenshot). Same privacy risk as clicking. Skip. |
| **B3. v1.1 "Use an app on my screen"** (limited hands) | One allowed app at a time, UI Automation first, gated commit clicks, money apps blocked, live view, stop key | **Recommended for v1.1.** |
| B4. Later: background workspace | Same as B3, but in a separate Windows session (agent workspace) so foo never moves your mouse | When Windows ships agent workspace generally (today: Insider preview, admin-only) [C8]. |

### 4.3 Recommendation B: v1 = B1 (no change); v1.1 = B3; later = B4

**B3 design (v1.1), in full:**

**Which apps.**
- **Starter list (allowed after a per-app yes):** File Explorer, Notepad, Microsoft Word, Excel, PowerPoint, Outlook (desktop) read-only, Photos, Paint, Snipping Tool, PDF reader, Tally/Busy (accounting, read and fill only) [inferred list; foo decision to make], printer dialogs.
- **Always blocked (cannot be allowed):** banking and UPI apps (any app or site of a bank, Google Pay/PhonePe/Paytm desktop or web), trading and crypto (Zerodha Kite, Groww, Upstox, Binance…), password managers, Windows Security, Settings, Registry Editor, Command Prompt, PowerShell, Windows Terminal, Credential Manager, Task Manager, installers (any `setup.exe`/`.msi` window), foo itself, and the Windows Hello / UAC prompts. Matching by executable name + publisher + window-title rules, kept in a file foo updates [foo decision].
- **Apps that have a connection** (WhatsApp Desktop, Gmail in a browser) are refused with `ROUTE_ORDER` (use the connection), the same rule as 08 §8.1.

**How it works (Windows specifics).**
1. **UI Automation first.** foo reads the target window's UI Automation tree (names, roles, values, refs), exactly like the browser snapshot (08 §8.3.4). Fields with UIA `IsPassword = true` and anything matching the secret patterns are emitted as `[hidden]` at source. Clicks and typing use UIA patterns (Invoke, Value, Toggle, SelectionItem) on refs, not pixel coordinates [C12; inferred].
2. **Picture second.** When UIA gives too little (old or custom-drawn apps), foo captures **only the target window** (Windows.Graphics.Capture on one window, not the whole screen), blurs known secret regions, and sends that picture to the user's AI. It clicks by coordinates only inside that window's rectangle. This needs a user AI that can read pictures. With a local model that cannot, the feature shows as unavailable ("Your AI can't see pictures, so I can't use apps on your screen.") [inferred].
3. **Commit clicks are gated** the same way as in the browser (08 §8.2.1): a control whose name matches send/save over/delete/pay/submit/post/print-to-paid… is refused with `USE_SUBMIT` and goes through an Approval card and the second look (Articles 5, 10). Saving a **new** file into `{OUT}` is prepare; overwriting or deleting any file is the delete class (red card).
4. **One app, one job, one session.** The permission lasts for **this job only** in v1.1 (no "Always" for screen use, by analogy with X-03). One app at a time. Max 30 minutes, then foo asks again.
5. **The user's mouse wins.** While foo works, if the user moves the mouse or types, foo pauses at once: "You moved the mouse, so I paused. [ Continue ] [ Stop ]". There is a global stop key **Ctrl+Shift+F12** [foo decision; not Ctrl+Alt+…, because Ctrl+Alt equals AltGr on Indian Inscript keyboards; check against 09 §9.17] and the overlay Stop button.
6. **Nothing stored for blocked or sensitive windows.** Step screenshots follow 08 §8.3.8 (masked, 7 days), and none are kept from windows that show a password field.

**The exact UX (plain words).**
- **Permission card** (a Choice-style card in the job's chat, Article 6 applies because it grants power): title "Can I use {Excel} on your screen?" Body: "I'll click and type only inside {Excel}, for this job. You can stop me any time with the Stop button or Ctrl+Shift+F12." Buttons: Primary "Allow for this job", "Not now". Footer: "I never use bank, payment or password apps."
- **While working:** a thin coloured border around the {Excel} window and a small floating pill at the top of the screen: "foo is using Excel · Stop" (always on top, keyboard reachable, Narrator reads "foo is using Excel. Stop button.").
- **Live view:** the existing Watch live window (06 §11) shows the {Excel} window frames instead of the browser. The checklist "Now:" line names the step.
- **Take over:** "Take over" = foo stops touching the app and the border turns grey ("You're in control. [ Hand back to foo ]"), the same as J13/J18.
- **Stop:** pill Stop, Ctrl+Shift+F12, or "stop" in chat. All three stop within 1 s; the job gets ⛔ (Article 18, X-17).
- **Blocked app:** "That's a {banking} app. I don't use those. I'll open it, and you do this part." [ Open {app} ].
- **Done:** proof chip with a masked screenshot of the result window (Article 11).

- **Risk:** **High.** Clicks in real apps are real (no undo in many apps); screenshots can show private things from other apps; prompt injection from a document or email shown in an app; foo and the user fighting over the mouse. Mitigations above: UIA-first, per-window capture, gated commit clicks, block list, job-only permission, mouse-wins pause, stop key.
- **Effort:** **L** (UIA bridge in a native helper or Node addon, window capture, overlay window, block list, gating, tests across Win10/11 and scaling).
- **Laws touched:** 2 (copy), 5, 6, 8, 9 (switching to "your screen" inside a job needs a fresh yes), 10, 11, 12, 16, 18, 25–27, 30.

---

## 5. Option C · Connections (and MCP)

### 5.1 Catalogue for an Indian non-technical user

Columns: **How** = how foo connects: **Sign-in** (official account connection, the user signs in on the company's page), **Connection** (an official AI connection built on MCP, still a sign-in for the user), **Browser** (foo's Edge window), **Phone** (needs a phone link/companion), **Open** (foo just opens the app/site with things filled in; the user finishes).

| App | How | When | Notes / evidence |
|---|---|---|---|
| **Gmail** | Sign-in (Google) | **v1** (as spec) | Restricted scope, testers ≤ 100 until Google's check (O-1, X-18) [C15] |
| **Google Calendar** | Sign-in (same Google) | **v1** (as spec) | — |
| **WhatsApp** | Phone (linked device, unofficial) | **v1** (as spec) | Business API bars AI chatbots [C14]; linked-device risk note stays (O-2) |
| **X** | Open (draft → X compose) | **v1** (as spec) | API is paid per post [C19]. Fix the 06 §6.8 vs 08 §16.3 mismatch (§7) |
| **Google Contacts** | Sign-in (same Google, read only) | **v1 (new)** | Lets "email Priya" find the right address and lets J12 tell "someone new" from a known person (Article 5). `contacts.readonly` is not a restricted scope [inferred; unverified]. Effort S |
| **Outlook mail + calendar** | Sign-in (Microsoft) | **v1.1** | Already specified behind a flag (O-3). Many Indian office users have it. Microsoft has no CASA-style yearly paid check [inferred; unverified] |
| **OneDrive / Google Drive** | Sign-in (`Files.Read` / `drive.file` + picker) | **v1.1** | Pick a file to read or save a result. Synced Drive/OneDrive folders already work through Folders (06 §6.7) in v1 |
| **Zomato** | Connection (official MCP) | **v1.1** | Pays by UPI QR the user scans [C4]: fits Article 7. Needs Zomato to list foo's sign-in return address [C4; inferred]. Browser fallback |
| **Swiggy (Food, Instamart, Dineout)** | Connection (official MCP) | **v1.1** if partner access granted | Works in ChatGPT/Claude/Gemini [C3]; outside builders are invite-led [C2]. Browser fallback |
| **IRCTC** | Browser | **v1** (browser) | No public API; ChatGPT did it by browser [C13]. OTP and CAPTCHA → Take over (08 §8.4). Needs its own journey (GAPS line 2) |
| **MakeMyTrip, Goibibo, ixigo, airline sites** | Browser | **v1** (browser) | No consumer connection found [unverified] |
| **Amazon, Flipkart, Myntra, BigBasket, Blinkit, Zepto** | Browser | **v1** (browser) | No consumer APIs; payment through the Payment card |
| **Uber, Ola, Rapido** | Open (app/website link with pickup and drop filled) + Browser (m.uber.com) | **v1** (open), browser later | Uber's ride-request API is restricted to partners [unverified]. Booking a ride = book verb + Approval card |
| **Electricity, gas, water, mobile, DTH bills** | Browser; later Bharat BillPay through a payments partner | **v1** (browser) | Read the bill from email (Gmail) first |
| **Banks / UPI (read-only)** | **Not connected.** Read bank alert emails and statement PDFs instead; SMS later via phone | Never as a connection | Account Aggregator data goes only to regulated users [C22]. foo never logs in to net-banking (Option A block list) |
| **UPI payments** | Show UPI QR / UPI link for the user's own app | v1.1 (where a site gives a QR); agent UPI later | NPCI agentic-payments pilot [C23] |
| **Spotify** | Open (app or link) | v1 (open) | API closed to small apps [C18] |
| **Instagram, LinkedIn, Facebook** | Draft + Open compose (like X) | v1.1 | Personal-account APIs don't allow posting or DMs [unverified]. Posting stays locked (06 §6.7 `p-post`) |
| **Telegram** | Channel (official bot) | Later (see D1) | Official, free bot API [inferred] |
| **SMS** | Phone (companion) | Later | Windows Phone Link has no public API for other apps [unverified]. Needs foo's own phone app |
| **Photos** | Folder (Pictures, OneDrive Camera Roll) + Google Photos picker | v1 (folder) / v1.1 (picker) | Google no longer lets apps read the whole library [C16] |
| **Notion, Todoist, Trello, Canva** | Connection (official MCP) | v1.1 gallery | Low risk, wanted by power users |
| **Smart home (Alexa, Google Home, Hue)** | Connection | Later | — |
| **DigiLocker** | Not possible for an app like foo [unverified]; Browser to view | Later / never | Partner-only access |

### 5.2 MCP: (i) gallery, (ii) add your own, (iii) none

| Option | What the user sees | Risk | Effort | Verdict |
|---|---|---|---|---|
| **(i) Curated "Connections" gallery, MCP under the hood** | Settings → Connections → "Add a connection" shows tiles (Zomato, Swiggy, Notion…). Tap → the company's sign-in page opens in the default browser → "✓ Connected". Each tile says in one line what foo can do: "Find restaurants and order food. You pay by scanning a code." | Medium. foo checks each one; tool behaviour is fixed by foo's own list | M | **Yes, v1.1** |
| (ii) "Add your own connection" | Settings → Connections → Advanced → "Add your own connection" (paste a link from the company) | High: a stranger's tool can change its description and steer foo (tool poisoning [C24]); the user can't judge it | M | **Later**, off by default, behind Advanced, with stricter rules |
| (iii) None | Only foo-built connections | Low | — | No: it locks foo out of the way Indian brands now publish AI access |

**Rules for (i), so MCP can never weaken the Articles** [foo decisions, proposed]:
1. foo's engine is the only MCP client. The user's AI never talks to an MCP server; it calls foo's tools by the FOO/1 protocol (08 §7), as today (AI's own tools stay off).
2. Each gallery connection ships with a **foo manifest**: the list of allowed tools, each tool's **action class** (read / prepare / send / book / buy / pay / delete, 08 §9.2) written by foo, the plain-words name for each tool, and a **hash of the server's tool descriptions**. If the server's descriptions change, the connection pauses with "🔌 {Zomato} changed how it works. I've paused it until I check." [Reconnect] (rug-pull guard [C24]).
3. Tool descriptions from the server are never shown to the AI raw; foo gives the AI its own short description. Tool results are wrapped as untrusted (08 §7.2 part 9) and pass the Redactor (08 §11.4).
4. Sign-in tokens live in the vault (`foo/conn/{app}/{account}`, X-16), never in chat, never shown.
5. Any tool not in the manifest is refused (`CONN_TOOL_UNKNOWN`).
6. Money goes through the Payment card. A connection that wants to charge a saved card or wallet is refused; UPI-QR / pay-link flows show the QR inside the Payment card and wait for proof (Article 7, 11).

**Rules for (ii), later:** every tool from a custom server is classed **send** (always a full Approval card, Article 5) until the user re-classes it on a review screen; reads of a new custom connection ask once per job; description changes pause it; no custom connection in groups or routines without a tap.

### 5.3 Recommendation C

- **v1:** keep the 08 §16 set (Gmail + Calendar, WhatsApp, X drafts) and **add Google Contacts read-only** (S). **Build the connector layer on one interface** (08 §16.5 already) so a v1.1 MCP client slots in without changing the gate.
- **v1.1:** Outlook (flag on), Drive/OneDrive picker, and the **curated gallery** starting with Zomato and Swiggy (subject to partner access), Notion.
- **Later:** "Add your own connection" (Advanced), Telegram, SMS via phone companion, smart home, agentic UPI.
- **Never:** bank log-ins, cookie import from personal browsers, a connection that pays without the Payment card.
- **What the user sees:** the Connections page grows an "Add a connection" section with tiles; each tile has one plain sentence of what foo can do and a Connect button.
- **Risk:** medium (gallery), high (custom).
- **Effort:** Contacts S; gallery M; custom M.
- **Laws touched:** 2 ("connection", never MCP), 5, 7, 8, 9, 10, 11, 14, 15.

---

## 6. Option D · Other capability families

| # | Capability | Who has it | Recommendation | What the user sees | Risk | Effort | Laws |
|---|---|---|---|---|---|---|---|
| D1 | **Text foo from your phone** | Poke, Tab, Instinct, OpenClaw, Hermes, Muse, Cowork Dispatch, Manus | **v1.1** via WhatsApp **"Message yourself"** on the already-linked WhatsApp: messages you send to your own number that start with "foo" (or every message, if chosen) become requests to foo on the PC; foo replies there in plain text. **Approvals are never done from WhatsApp** (Article 6): foo replies "I need your tap. Open foo on your PC." Telegram bot: later | Connections → WhatsApp → toggle "Let me text foo from my phone" | Medium: anyone with the phone can ask; the PC must be on; ban risk on the unofficial link | M | 1, 6, 14, 19, 22 |
| D2 | **Phone companion app** (approve on the go, see cards) | Cowork Dispatch, Perplexity, Manus, OpenClaw nodes | **Later (v2)**: pair by QR, cards render on the phone, approvals need phone biometrics. Needs a relay server or local-network link (Article 15 design work) | "Pair your phone" QR in Settings | High (a new place to approve money) | L | 6, 7, 15 |
| D3 | **Phone calls on your behalf** (restaurants, hospitals, customer care) | Tab, Instinct Concierge, Manus Cue | **Later.** Needs a telephony provider, per-minute cost, AI disclosure at the start of every call, Indian telecom rules [unverified], and a **call-plan Approval card** ("I'll call {Hotel} and ask to move check-in to Fri 23 Oct. I won't agree to any charge.") per Article 9 | Approval card, then a call summary card with proof | High (Tab's doctor-call surprise) | L | 5, 9, 11, 13 |
| D4 | **Voice call with foo** (talk live) | ChatGPT, Instinct, Grok | **Later.** Voice notes (J7) cover v1 | Call button in the chat header | Low | M | 23 |
| D5 | **foo's own email address** | Instinct, Manus Cue, Grok | **Never as a server mailbox** (Article 15). If needed later: a Gmail label or a "+foo" alias in the user's own Gmail for sign-ups and receipts [inferred] | — | — | — | 15 |
| D6 | **Scheduled tasks** | Everyone | **Have it** (routines, catch-up). Later: "wake my PC to run" using a Windows wake timer, opt-in | Routine card toggle "Wake my PC for this" | Low | S | 12, 19 |
| D7 | **Real Office files** (xlsx/docx/pptx with formulas) | Cowork, Perplexity, Tab | **v1.1**: `files.write` gains Excel/Word/PowerPoint output via a bundled library [inferred] | File bubble "Bills Oct 2026.xlsx" · Open · Show in folder | Low | M | 11 |
| D8 | **Memory import** from ChatGPT / Gemini / Claude | ChatGPT Dot, Muse, Cowork | **v1.1**: foo gives a one-tap "copy this question" for your old AI; you paste its answer; foo shows a checklist of facts; each kept one is "You said" (you supplied it) with source "from ChatGPT". Nothing saved without a tick | Memory screen → "Bring what another AI knows about you" | Low | S | 15, X-05 |
| D9 | **Multi-device / sync** | Cloud agents | **Later**, after D2 | — | High | L | 15 |
| D10 | **Teach a task / saved shortcuts** | Grok "Teach a task", Gemini skills, OpenClaw learned skills | **Later**: "Save this as a shortcut" after a successful job; replays reuse site notes | Shortcut chip after ✅ | Medium | M | 3, 5 |
| D11 | **Agent payments** (single-use cards, UPI agent pay) | Muse (Link), Instinct (Stripe Link), Tab (card vault), ChatGPT (UPI pilot) | **Later.** v1 keeps the Payment card + CVV box (08 §10) | — | High | L | 7, 13 |
| D12 | **Location-aware suggestions** | Instinct | **Never** for v1/v1.1 (a desktop has no good location; creepy) | — | — | — | 19 |
| D13 | **Shareable "recipes"** (one link sets up a routine + connections) | Poke | **Later** | "Open in foo" link → consent card | Medium | M | 5 |
| D14 | **Watch what's on my screen continuously** | Copilot Vision | **Never** (privacy; Article 15) — one-shot attach stays | — | — | — | 8, 15 |

---

## 7. Spec deltas (what the constitution would need if Vikas says yes)

Nothing here is applied. The coordinator applies the approved rows and logs them in `CHANGELOG.md`.

### 7.1 For v1 (small)

| # | File · section | Change |
|---|---|---|
| V1-1 | `DECISIONS.md` | New X-24: "Browser stays foo's own Edge window (no extension, no cloud browser). Bank, UPI-app, trading, crypto and password-manager sites are hand-back only." New X-25: "Google Contacts (read) joins v1 on the same Google sign-in." New X-26: "Connections are built on one connector interface so curated MCP-based connections can be added in v1.1; the word MCP never appears." |
| V1-2 | `08-functions-and-engine-2.md` §8.3 | Add §8.3.10 **Hand-back sites**: a domain list (`handback-sites.json`, updated with foo) of net-banking, UPI web, trading, crypto, password-manager domains; `browser.open` on them returns `SITE_HANDBACK` → card "This is your bank's site. I'll open it for you, and you do this part." [ Open {site} ] (opens in the default browser, not foo's window). |
| V1-3 | `08-functions-and-engine-2.md` §8.3.1 | Add spike note: confirm Edge persistent-profile automation on Win10 22H2 / Win11 and whether Edge mirrors Chrome 136's default-profile rule [C11]. |
| V1-4 | `08-functions-and-engine-2.md` §8.2 | New tool `contacts.search { query; max ≤ 20 }` · read. `whatsapp.draft` / `gmail.draft` resolve names via contacts + WhatsApp contacts; "someone new" = not in Contacts, not in sent mail, not in WhatsApp chats (Article 5). |
| V1-5 | `08-functions-and-engine-3.md` §16.1 | Add scope `https://www.googleapis.com/auth/contacts.readonly` (or People API `contacts.other.readonly` as well) [verify scope tier]; calls `people.connections.list`, `people.searchContacts`. |
| V1-6 | `06-screens-2.md` §6.8 | Gmail/Calendar group gains row **Contacts**: "See your contacts" / "Not connected". **Fix mismatch:** X row says "Connect" and "Read posts and trends", but 08 §16.3 says X has no account connection. Make the X row: status "Drafts only", no Connect button, note unchanged. |
| V1-7 | `06-screens-2.md` §6.7 APPS | Add row `a-contacts` "Contacts" default Always. |
| V1-8 | `05-cards-*` (Connect card C10) | Copy for Contacts consent line: "See your contacts so I message the right person." |
| V1-9 | `10-acceptance-*` | Tests: hand-back site never driven; Contacts resolves "Priya" to one person or asks a Choice card when two match; new-person detection uses Contacts. |
| V1-10 | `08-functions-and-engine-3.md` §23.2 | Record O-5 answer if Vikas agrees ("no clicking in v1; v1.1 per §4 of research/capabilities.md"). Add O-7…O-10 (§8 below). |

### 7.2 For v1.1 (write now, ship behind flags)

| # | File · section | Change |
|---|---|---|
| V11-1 | `08-functions-and-engine-2.md` §8.1 | SCREEN rung text: "v1: open only. v1.1 (`flags.screenHands`): use one allowed app per job (§8.5)". |
| V11-2 | `08-functions-and-engine-2.md` §8.5 | Rewrite as **Screen rung**: UIA snapshot (`screen.snapshot {appId}` read), `screen.click {ref}` (read or commit-gated like 8.2.1), `screen.type {ref; text}` prepare (secret patterns refused), `screen.capture {appId}` read (one window, masked), `screen.release`; allow list, block list (§4.3 above), job-only permission, mouse-wins pause, 30-min limit, stop key. Errors `APP_BLOCKED`, `APP_NOT_ALLOWED`, `UIA_UNAVAILABLE`, `AI_NO_VISION`. |
| V11-3 | `08-functions-and-engine-2.md` §9.2 | Add action classes for screen tools; "overwrite/delete a file through an app" = delete class. |
| V11-4 | `08-functions-and-engine-2.md` §11.4, §11.6 | Redaction covers UIA snapshots (`IsPassword`) and window captures; no capture of a window showing a password field. |
| V11-5 | `05-cards-*` | New card or Choice-card variant **"Use an app" permission**: title "Can I use {Excel} on your screen?", body and buttons as §4.3; blocked-app card. |
| V11-6 | `06-screens-3.md` §11 | Watch live shows an app window; overlay pill "foo is using {Excel} · Stop"; Take over / Hand back copy. |
| V11-7 | `06-screens-2.md` §6.7 | New section **APPS ON MY SCREEN**: list of allowed apps used before (each "Ask each job"), the fixed blocked list shown read-only ("I never use these"), Link "Add an app to never use". |
| V11-8 | `09-windows.md` | New § **Screen control**: UI Automation client, Windows.Graphics.Capture per window, always-on-top overlay window (click-through except Stop), global hotkey Ctrl+Shift+F12 (add to §9.17 table after checking conflicts), DPI handling 100–300%, Narrator text for the pill, input-detection pause. |
| V11-9 | `01-articles.md` Article 9 | Add "using an app on your screen" to the list of "switching how" that needs a fresh Approval card. (Articles are Vikas's to change.) |
| V11-10 | `08-functions-and-engine-3.md` §16 | New §16.7 **Connection gallery** (MCP client in a utility process; manifest per connection: tools, action class, plain name, description hash; pause on change; tokens in vault; unknown tools refused; payments only through Payment card). §16.8 Zomato, §16.9 Swiggy, §16.10 Notion, §16.2 Outlook flag on, §16.11 Drive/OneDrive picker. |
| V11-11 | `06-screens-2.md` §6.8 | "Add a connection" section with tiles, each with one plain sentence and Connect; paused state copy "🔌 {Zomato} changed how it works. I've paused it until I check." |
| V11-12 | `08-functions-and-engine-3.md` §16.4 + `06-screens-2.md` §6.8 WhatsApp | D1: toggle "Let me text foo from my phone"; self-chat messages become foo requests; replies in self-chat; Approval/Payment/Secret cards never answered from WhatsApp ("I need your tap. Open foo on your PC."). |
| V11-13 | `08-functions-and-engine-3.md` §12 + `06-screens-*` Memory | D8 memory import flow; provenance "You said" with source note "from {ChatGPT}". |
| V11-14 | `08-functions-and-engine-2.md` §8.2 `files.write` | D7: xlsx/docx/pptx output. |
| V11-15 | `10-acceptance-*` | Tests for every v1.1 item: blocked app refused; commit click needs approval; mouse move pauses within 200 ms; stop key stops within 1 s; capture contains only the target window; gallery description change pauses the connection; Zomato order never completes without the Payment card and proof. |

### 7.3 Later (note only)

Phone companion (D2), phone calls (D3), voice calls (D4), custom connections (§5.2 ii), Telegram channel, SMS, agent workspace (B4), agentic UPI (D11), shortcuts (D10), recipes (D13). Each needs its own journey in `research/journeys-*` before spec text.

---

## 8. Questions only Vikas can answer (proposed O-7 to O-10)

- **O-7 Computer use timing.** Agree: no clicking in v1, "Use an app on my screen" in v1.1 as §4.3? Or never?
- **O-8 Connection gallery.** Agree to apply to Zomato and Swiggy for partner access so foo can list them in v1.1?
- **O-9 "Add your own connection".** Later behind Advanced, or never (foo stays curated only)?
- **O-10 Text foo from your phone.** Agree to WhatsApp "Message yourself" in v1.1, knowing that approvals still need the PC?
