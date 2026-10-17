# Sources for capabilities.md

Fetched or searched on Fri 16 Oct 2026. "Fetched" means the page was read; "search" means only the search-result title was seen (treat as weaker). Teardown files are cited in `capabilities.md` by folder name (e.g. [cowork §2] = `../../../personal-agent-re/cowork/01-teardown.md`).

## Web sources

| Id | Source | Used for | How |
|---|---|---|---|
| C1 | Inc42, "How Swiggy Is Using AI Agents To Take Commerce Beyond Its App" (30 Sep 2026) — https://inc42.com/buzz/how-swiggy-is-using-ai-agents-to-take-commerce-beyond-its-app/ | Swiggy: 4 MCP servers, 66 tools (Food, Instamart, Dineout, Scenes), "whichever LLM you use" | fetched |
| C2 | Stellagent, "Swiggy Launches Builders Club…" (24 Apr 2026) — https://stellagent.ai/insights/swiggy-builders-club-ai-commerce-stack | Builders Club 23 Apr 2026, invite-led, 3 MCP servers + 18 API tools + skills | fetched |
| C3 | Storyboard18, "Swiggy integrates AI chatbots to enable ordering via ChatGPT, Claude and Gemini" (27 Jan 2026) — https://www.storyboard18.com/amp/brand-marketing/swiggy-integrates-ai-chatbots-to-enable-ordering-via-chatgpt-claude-and-gemini-88325.htm | Swiggy Food/Instamart/Dineout via custom connector in ChatGPT, Claude, Gemini | fetched |
| C4 | Analytics Vidhya, "Order Food From Your Terminal with Zomato MCP" (Nov 2025) — https://www.analyticsvidhya.com/blog/2025/11/zomato-mcp-server/ | Zomato MCP URL, OAuth sign-in, UPI QR payment, redirect-URL allow list, clients | fetched (third party) |
| C5 | Voice&Data, "Swiggy brings ChatGPT and Gemini to food and grocery orders" — https://www.voicendata.com/software-apps/swiggy-brings-chatgpt-and-gemini-to-food-and-grocery-orders-11035033 | corroborates C3 | search |
| C6 | Claude Help Center, "Let Claude use your computer in Cowork" — https://support.claude.com/en/articles/14128542-let-claude-use-your-computer-in-cowork | Computer use on macOS + Windows, per-app permission, blocked investment/crypto apps, blocklist, background vs full control, "no sandbox", don't grant banking/health/government apps | fetched (official) |
| C7 | Let's Data Science, "Anthropic Adds Computer Use To Windows Apps" (3 Apr 2026) — https://letsdatascience.com/news/anthropic-adds-computer-use-to-windows-apps-40c5c1ad | Windows date, research preview, Pro/Max | fetched |
| C8 | Microsoft Support, "Experimental agentic features" — https://support.microsoft.com/windows/experimental-agentic-features-a25ede8a-e4c2-4841-85a8-44839191dfb3 ; Microsoft Learn MCP on Windows — https://learn.microsoft.com/en-us/windows/ai/mcp/overview | Agent workspace, agent accounts, Copilot Actions (Insider preview), known-folder consent, MCP agent connectors in the On-Device Registry, admin-only setting | fetched (official) / search |
| C9 | BGR, "Copilot Mode Turns Microsoft Edge Into An AI Browser" (28 Jul 2025) — https://bgr.com/1924283/microsoft-edge-copilot-mode-ai-browser/ | Edge Copilot Mode Actions using history and credentials, visual cues | fetched |
| C10 | Claude Help Center, "Use Claude in Chrome safely" — https://support.claude.com/en/articles/12902428-use-claude-in-chrome-safely | Approval modes, permission before financial sites, blocked adult/pirate sites, separate profile advice, <0.08% injection success (internal) | fetched (official) |
| C11 | Chrome for Developers, "Changes to remote debugging switches to improve security" — https://developer.chrome.com/blog/remote-debugging-port | Chrome 136+ ignores remote debugging on the default data directory | fetched (official) |
| C12 | Microsoft Research, "UFO2: The Desktop AgentOS" — https://www.microsoft.com/en-us/research/publication/ufo2-the-desktop-agentos/ (arXiv 2504.14603) | UI Automation + vision hybrid, picture-in-picture desktop, 20+ Windows apps | fetched |
| C13 | Business Today, "ChatGPT Astra tries booking a train on IRCTC…" (15 Sep 2026) — https://www.businesstoday.in/technology/story/chatgpt-astra-tries-booking-a-train-on-irctc-what-happened-next-may-surprise-you-555469-2026-09-15 | IRCTC done by browser, stopped before payment | fetched |
| C14 | respond.io, "WhatsApp general-purpose chatbots ban" — https://respond.io/blog/whatsapp-general-purpose-chatbots-ban ; Business Standard (22 Oct 2025) — https://www.business-standard.com/technology/tech-news/meta-bans-ai-chatbots-from-whatsapp-business-api-chatgpt-to-shut-down-jan-2026-125102200335_1.html | Business API terms: new users 15 Oct 2025, all users 15 Jan 2026; does not address linked devices | fetched / search |
| C15 | DeepStrike, "Google CASA security assessment 2025" — https://deepstrike.io/blog/google-casa-security-assessment-2025 | CASA levels, ~$500–4,500, yearly revalidation, restricted scopes | fetched (vendor) |
| C16 | Google Developers Blog, "Google Photos Picker API launch and Library API changes" — https://developers.googleblog.com/en/google-photos-picker-api-launch-and-library-api-updates/ | Library-wide read removed 31 Mar 2025; Picker API | search (date from known announcement) |
| C17 | Tom's Guide, "You can now use apps inside ChatGPT…" — https://www.tomsguide.com/ai/you-can-now-use-apps-inside-chatgpt-including-spotify-canva-and-zillow-heres-how | ChatGPT apps: Booking.com, Canva, Coursera, Figma, Expedia, Spotify, Zillow; Uber, DoorDash, OpenTable etc. announced | fetched |
| C18 | Spotify for Developers, "Quota modes" — https://developer.spotify.com/documentation/web-api/concepts/quota-modes | Dev mode 5 users; extended quota needs organisation with ≥ 250k MAU (since 15 May 2025) | fetched (official) |
| C19 | Postproxy, "X (Twitter) API Pricing in 2026" — https://postproxy.dev/blog/x-api-pricing-2026 | Pay per use $0.015/post, $0.20 with link; no free tier for new devs | fetched (vendor bias) |
| C20 | OpenClaw docs (claw.so), "Browser" — https://docs.claw.so/engine/tools/browser/ | Managed `openclaw` profile, Chrome extension relay, remote CDP, safety notes | fetched |
| C21 | Hermes Agent docs, "Browser" — https://hermes-agent.nousresearch.com/docs/user-guide/features/browser | 7 browser backends incl. attach to own Chrome/Edge; accessibility-tree refs; separate computer-use page | fetched |
| C22 | Sahamati, "Account Aggregators" — https://sahamati.org.in/account-aggregators/ ; DFS — https://financialservices.gov.in/account-aggregator-framework | AA consent flow; FIU eligibility (regulated entities) **[unverified on page; from framework knowledge]** | fetched (partial) |
| C23 | TechCrunch, "India pilots AI chatbot-led e-commerce…" (9 Oct 2025) — https://techcrunch.com/2025/10/09/india-pilots-ai-chatbot-led-e-commerce-with-chatgpt-gemini-claude-in-the-mix ; CRN India — https://www.crn.in/?p=73405 | NPCI + Razorpay + OpenAI agentic payments pilot | search |
| C24 | Invariant Labs, "WhatsApp MCP exploited" — https://invariantlabs.ai/blog/whatsapp-mcp-exploited | Tool poisoning, rug-pull description change, leak via WhatsApp, approval dialog hid payload | fetched |
| C25 | Uber Developers, Riders introduction — https://developer.uber.com/docs/riders/introduction | Ride request button, deep links; API access terms not stated (so "restricted to partners" is [unverified]) | fetched |

## Teardowns used (in this project)

`personal-agent-re/`: `openclaw/01-teardown.md`, `hermes/01-teardown.md`, `poke/01-teardown.md`, `tab/01-teardown.md`, `instinct/01-product-teardown.md`, `instinct/04-deep-dive.md`, `grok/01-product-teardown.md`, `grok/04-deep-dive.md`, `chatgpt/01-teardown.md`, `gemini/01-teardown.md`, `muse/01-teardown.md`, `autopilot/01-teardown.md`, `cowork/01-teardown.md`, `perplexity/01-teardown.md`, `manus/01-teardown.md`.

## Spec files read

`foo/constitution/01-articles.md`, `DECISIONS.md`, `GAPS.md`, `00-README.md`, `08-functions-and-engine-2.md` §8, `08-functions-and-engine-3.md` §16 and §23, `06-screens-2.md` §6.7–6.8, `09-windows.md` (shortcut reservations).

## Not verified (flagged in the text)

- Whether Edge applies Chrome 136's default-profile debugging rule.
- Google scope tier of `contacts.readonly` and `drive.file` (believed sensitive/non-sensitive, not restricted).
- Uber ride-request API access, Instagram/LinkedIn personal posting APIs, MakeMyTrip consumer connection, DigiLocker access, Windows Phone Link API.
- Indian telecom rules for AI phone calls.
- OpenClaw desktop clicking via nodes; Hermes computer-use details; Gemini Spark phone calls.
