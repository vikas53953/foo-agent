# Web tools research: how foo should search, read and act on the internet

Research date: Fri 16 Oct 2026 · For: Vikas (owner) · Status: proposal. Evidence only. It changes no spec until Vikas says yes and the coordinator applies §6 (spec deltas).
Sources: `research/web-tools-sources.md` (IDs W1–W61, I1–I3). Tags: **[observed]** vendor's own page/repo · **[reported]** third party · **[inferred]** our reasoning · **[unverified]** not confirmed.
Builds on `research/capabilities.md` §3 (Option A, browser), which already decided: keep foo's own Edge window, no cloud browser.
Money: $1 ≈ ₹88 [unverified, rounded]. "Typical user" = 10 searches, 30 page reads and about 20 minutes of browser work a day [inferred].

---

## 0. The short answer (plain words)

foo needs three web skills: **find** (search), **read** (open a page and pull out the words) and **do** (click, fill and book on a site). The market sells each one as a paid internet service. We looked at 30 of them.

| Question | Answer | Why, in one line |
|---|---|---|
| **Find: keep "open Bing in foo's window and read it"?** | **Yes, keep it as the free default, and make it sturdier.** Add an **optional "Faster search" key** later (v1.1) that the user gets free from a search company. | It costs nothing and sends no new data anywhere. Microsoft shut the paid Bing service in Aug 2025 and Google is closing its one on 1 Jan 2027, so "no key" is the only free route that lasts. A key makes search faster but tells one more company what you searched. |
| **Read: local or cloud (Firecrawl, Jina)?** | **Local.** A small free reader built into foo (Mozilla's "Reader view" code). If a page needs a real browser, foo opens it in its own window. | Every page you open would otherwise go to a cloud company first. Local reading is free, private and good enough for news, bills, recipes and timetables. |
| **Do: keep foo's Edge + Playwright, or use Browser Use / Stagehand?** | **Keep foo's own Edge. Do not ship those products inside foo. Copy five of their ideas.** | Both need a separate pay-per-use AI account from the user (foo uses the user's own AI subscription) and Browser Use sends usage data, including your task and the sites visited, to its makers unless switched off. Their best ideas are free to copy. |
| **Cloud browsers (Browserbase, Steel, Hyperbrowser, Browser Use cloud)?** | **No.** | Your sign-ins would live on someone else's computer in the US or Europe. Indian sites like IRCTC block those computers. And it costs money every minute. |

**What the owner would notice with the recommendation (Option 1 below):** searches take a few seconds and use foo's window; reading pages is instant and free; bookings keep working on your PC and your home internet; foo gets steadily faster on sites it has used before because it remembers the steps that worked.

**Five ideas to copy** (details in §4.3):
1. **Read the page like a screen reader**, using the same "page outline with numbered buttons" that Microsoft's Playwright tool and Stagehand use, including the payment boxes inside other frames.
2. **Send only what changed** after each click, not the whole page again.
3. **Remember the steps that worked on each site** ("site recipe") and replay them next time, with the AI checking each step. If the site changed, the AI finds the new button and the recipe is updated.
4. **The AI chooses, foo's code clicks.** The AI never drives the browser directly. foo already does this; keep it a hard rule.
5. **Watch for events** (a pop-up, a new tab, a download, a crash, a "prove you're human" box) instead of guessing, and treat every page's words as possibly hostile.

**Facts that changed recently:**
- Bing Search API **shut down 11 Aug 2025**; the replacement costs $35 per 1,000, gives no raw results and works only inside Microsoft's own agent service [observed W1; reported W2].
- Google's Custom Search API is **closed to new customers and ends 1 Jan 2027** [reported W20].
- Brave's search API **ended its free plan in Feb 2026**; now $5 of free credit a month, card required [observed W9; reported W8].
- Tavily was **bought by Nebius** (Feb 2026); Jina by **Elastic** (Oct 2025) [reported W13, W17].
- Perplexity added a **$1 per 1,000 "Fast" search** (28 Sep 2026) [reported W15].
- Browser Use **left Playwright for raw Chrome control (CDP)** in Aug 2025 [observed W32]; Stagehand moved the same way (v3, now v4) [observed W36, W38].
- Claude in Chrome went **generally available 26 Aug 2026**; OpenAI's Operator was **shut 31 Aug 2025** and folded into ChatGPT agent [reported W53, W54].
- Hidden "prompt injection" text aimed at browsing agents is now **seen in the wild** (e.g. a page telling agents to send a $5,000 PayPal payment) [reported W55].

---

## 1. Search APIs for agents

**What a search API is:** a paid service that takes a question and returns a list of links (and sometimes page text) in a form a program can read, with no browser window. You need a "key" (a password for the service). Every query goes to that company.

### 1.1 Comparison table

Price columns are for **plain web search, 10 results**. "Typical user cost" = 300 searches a month.

| Service | What it does (one line) | How it works inside | Free tier | Paid price per 1,000 | Typical user / month | Data and privacy | India | MCP | Notes |
|---|---|---|---|---|---|---|---|---|---|
| **Bing in foo's window** (today's spec) | foo opens bing.com in its own Edge window and reads the result list | A real browser on the user's PC and home internet. No key. | Unlimited (it's a normal website) | ₹0 | ₹0 | Microsoft sees the search as an ordinary visitor (no Microsoft sign-in in the foo profile). No new company involved. | Good: Bing has an India market (`cc=IN`) and Hindi [inferred] | — | Bing's robots.txt says bots should not fetch `/search` [observed W3]; the Microsoft agreement bans "impermissible scraping" and scraping its **AI answers** [observed W4]. A user-driven, low-volume browser is a grey area, not clearly banned [inferred]. May show a "prove you're human" box under heavy use [unverified]. 2–5 s per search [inferred]. |
| **Bing Search API** | Was Microsoft's search service | — | — | — | — | — | — | — | **Retired 11 Aug 2025** [observed W1]. Replacement "Grounding with Bing" = $35/1k, only inside Azure AI agents, no raw results, must show Bing links [reported W2]. Not usable by foo. |
| **Google Programmable Search (Custom Search JSON API)** | Google results as data | Google's index | 100/day (existing customers only) | $5 | — | Google | Excellent | — | **Closed to new customers; ends 1 Jan 2027**; new engines limited to 50 sites [reported W8, W20]. Not usable. |
| **Brave Search API** | Independent web index, results as data | Brave's own index (not Google/Bing) | $5 credit/month (~1,000 searches), **card required** | $5 (Search); $4 + tokens (Answers) | ₹0 (inside the $5 credit) | Brave is privacy-branded; **zero data retention only on Enterprise**; you may not store results without a storage plan [observed W9] | Country codes are 2-letter; India not explicitly listed [observed W11] — `IN` likely works [unverified] | ✅ official `brave-search-mcp-server` [observed W9] | Free tier ended Feb 2026 [reported W8]. 50 queries/s. |
| **Exa** | "Neural" search built for AI; returns links plus page text | Own index and embeddings | $10 credit/month, no card [reported W7, W8] | $7 (with page text); Deep $12–15 [observed W5] | ₹0 (inside credit); ~₹185 if paid | Offers zero data retention [observed W6]; one tracker says ZDR is Enterprise-only [reported W7] | Weaker for local and "today" queries (PNR status, bill due dates) [inferred, unverified] | ✅ official (hosted and npm) [reported] | Strong for research-style questions. Answer and Research products extra. |
| **Tavily** | Search made for AI agents; returns cleaned snippets | Aggregated web search + extraction (sources not disclosed) [unverified] | **1,000 credits/month, no card** [observed W12] | $8 basic, $16 advanced ($0.008/credit) [observed W12] | ₹0 | No retention option found [reported W7]. Now owned by Nebius [reported W13]. | Not documented [unverified] | ✅ official `tavily-mcp` [unverified] | Also Extract/Crawl/Map. Easiest no-card sign-up. |
| **Perplexity Search API / Sonar** | Raw ranked results (Search API) or a written answer with citations (Sonar) | Perplexity's index | None (occasional trial credit) [reported W14] | Search $5; **Fast $1** (since 28 Sep 2026); Sonar = per-request fee + tokens [reported W14, W15] | ~₹26 (Fast) | ZDR stated for chat API only, not search [reported W7] | Good general coverage [unverified] | ✅ official [unverified] | Sonar writes the answer itself: that is a second AI in the loop, against foo's "your AI does the thinking" design [inferred]. |
| **Jina (s.jina.ai search, r.jina.ai reader)** | Search and "turn any URL into clean text" | Jina's servers fetch and render the page | Reader: 20 requests/min with **no key**; key: 10M tokens once, non-commercial [reported W17] | $0.05 per million tokens; a search costs ≥10k tokens (~$0.50/1k) [reported W17] | ~₹15 | Retention not documented [unverified]. Part of Elastic since Oct 2025 [reported W17]. | Not documented | ✅ [unverified] | Free grant is non-commercial only. |
| **Serper** | Google results scraped and returned as data | Scrapes Google | 2,500 queries once, no card [reported W8, W18] | $0.30–1.00 | ~₹26 | Serper sees queries; Google ToS risk is Serper's [inferred] | Google India quality (`gl=in`) [inferred] | community | Cheapest Google-quality option. Credits expire [reported]. |
| **SerpAPI** | Google, Bing and 80+ engines as data | Scrapes search engines | 250/month [reported W18] | ~$25 for 1,000 (entry plan) | ~₹2,200 (300 is above the 250 free; entry plan $25) | SerpAPI sees queries | Supports `google.co.in`, Hindi [unverified] | ✅ [unverified] | Expensive at low volume. |
| **You.com Search API** | Web results + optional page text | You.com index | **100 calls/day free**, $100 new-account credit, free MCP endpoint [reported W16] | $5; Contents $1/1k | ₹0 | Not documented | Not documented | ✅ free MCP (`profile=free`) [reported W16] | Free daily quota covers a typical user. |
| **Parallel** | Search built for AI agents, 4 speed/quality modes | Own index | **5,000 requests/month free**, plus signup credit [observed W19] | $1 (Fast/Turbo) – $5 (Basic/Advanced) [observed W19] | ₹0 | ZDR on Enterprise only [observed W19] | Not documented | ✅ Search MCP [observed W19] | Generous free tier; younger company. |
| **Your own AI's built-in search** (Claude / ChatGPT / Gemini CLIs) | The user's AI searches by itself | Vendor's own search | Gemini CLI: included on free tier with Google sign-in, 1,000 requests/day shared [reported W59]; Claude/ChatGPT: in the subscription [unverified] | Claude API: $10/1k + tokens [reported W60] | ₹0 for subscribers | **The question already goes to that AI company** in the prompt, so no new party [inferred] | Google/Bing-quality [inferred] | — | foo turns the AI's tools off so foo's engine owns and logs every tool (I1 §6). Allowing it would break that rule (no approval gate, no untrusted-text wrapping, no step log). |

### 1.2 What this means for foo

- **There is no free, keyless, official search API any more.** Bing's is gone, Google's is closing, Brave's free plan ended. Every remaining option needs the user (or foo) to sign up for a key, and every query then goes to that company [observed W1, W9; reported W20].
- **A foo-paid key needs a foo server.** A key baked into a desktop app can be copied out by anyone and run up foo's bill [inferred]. To hide it, foo would need a relay server that every search passes through. That server would see every search of every user: a new privacy promise, a new thing to run, and against Article 15 in spirit [inferred].
- **The user's own key is cheap.** At 300 searches a month, Tavily (1,000 free), Brave ($5 credit), You.com (100/day), Parallel (5,000) and Exa ($10 credit) all cost the user **₹0** [observed W9, W12, W19; reported W7, W16]. The friction is the sign-up itself, and Brave needs a card (Indian debit cards often fail international card checks [unverified]).

---

## 2. Read, crawl and extract

**What a reader does:** opens a web address and gives back just the useful words (no menus, ads or cookie banners), usually as tidy text the AI can read.

### 2.1 Comparison table

| Tool | What it does | How it works inside | Local or cloud | Licence | Runs on Windows locally? | Price | What leaves the PC | JS-heavy pages | MCP |
|---|---|---|---|---|---|---|---|---|---|
| **Firecrawl** | Scrape a page, crawl a site, map links, search, extract fields with AI, `/agent` (describe what you want), Interact (browser session), actions (click/type before reading) [observed W23] | Cloud runs real browsers behind proxies and an anti-bot layer; returns Markdown/JSON | Cloud (self-host possible) | **AGPL-3.0** core, MIT SDKs [observed W23] | Self-host is Docker; the self-hosted version **lacks** enhanced proxies, managed anti-bot, Agent, Browser, Interact [observed W22] | 1,000 credits/month free, no card; Hobby $19 (5k credits), Standard $99 (100k) [observed W21; reported W24]. Scrape = 1 credit; JSON extraction +4; ZDR +1 [observed W21] | Every URL and the page content pass through Firecrawl. ZDR: billing page says +1 credit/page [observed W21]; another Firecrawl page calls it Enterprise-only [observed W25] | ✅ (cloud) | ✅ `firecrawl-mcp` |
| **Jina Reader** (`r.jina.ai/<url>`) | URL → clean Markdown | Jina's servers render the page | Cloud | Reader code Apache-2.0 [unverified] | n/a (cloud) | 20/min keyless free; tokens otherwise [reported W17] | Every URL and page | ✅ | ✅ [unverified] |
| **Crawl4AI** | Open-source crawler that turns pages into "fit" Markdown; optional AI extraction | Python + Playwright Chromium; pruning/BM25 filters; profiles keep logins; stealth mode [observed W26] | **Local** | **Apache-2.0** [observed W26] | Python app; Windows not stated [observed W26]; needs Python + a Playwright browser download | Free | Nothing (unless you plug in a cloud AI) | ✅ (real browser) | ✅ self-hosted |
| **Trafilatura** | Pulls main text, title, author, date from HTML | Python heuristics, no browser | **Local** | Apache-2.0 since v1.8 [observed W27] | Python | Free | Nothing | ❌ (needs HTML already rendered) | — |
| **Mozilla Readability** (Firefox Reader View) | Pulls the main article from HTML | JavaScript, runs on JSDOM in Node [observed W28] | **Local** | **Apache-2.0** [observed W28] | ✅ Pure JavaScript: fits foo's Electron/Node engine directly [inferred] | Free | Nothing | ❌ alone; ✅ if given the rendered page from foo's Edge window [inferred] | — |
| **Defuddle** (by Obsidian's maker) | Readability alternative; keeps footnotes, code, tables better; outputs Markdown and rich metadata [observed W29] | JavaScript, Node via linkedom/JSDOM | **Local** | MIT [unverified] (README read did not state it) | ✅ JavaScript | Free | Nothing | as Readability | — |
| **ScrapingBee** | Scraping API with browsers and proxies | Cloud | Cloud | Proprietary | n/a | 1,000 free credits; from $19.99/month [reported W30] | Every URL and page | ✅ | [unverified] |
| **Bright Data** (Web Unlocker etc.) | Large proxy network and unblocking APIs | Cloud, residential IPs incl. India | Cloud | Proprietary | n/a | From ~$1 per 1,000 requests [reported W30] | Every URL and page | ✅ | ✅ [unverified] |

### 2.2 What this means for foo

- foo's engine is Node/Electron with `playwright-core` and the user's Edge (I1 §8.3). **Readability or Defuddle drop straight in**; Crawl4AI and Trafilatura are Python and would add a second runtime and, for Crawl4AI, its own browser download [observed W26, W27; inferred].
- foo already owns the best "renderer" there is: a real Edge on a home internet connection. For pages that need scripts, foo can open them in the job window and run the same extractor on the rendered page. Cloud readers exist mainly to provide browsers and unblocking for servers; foo doesn't need that [inferred].
- **OpenClaw is the precedent**: plain GET + Readability, block private addresses, 15-minute cache, and a cloud reader only as an optional fallback [observed W57].
- Cloud readers would send **every page foo reads** (including pages with the user's bill or ticket details, if they ever reached `web.fetch`) to a third party. That is a bigger leak than search queries [inferred].

---

## 3. Browser automation for agents

**What these do:** let an AI drive a web browser (open pages, click, type, read). Two questions decide everything for foo: **where does the browser run** (your PC or their server) and **how does the AI "see" the page** (a text outline of buttons and fields, or screenshots).

### 3.1 Comparison table: libraries and tools that can run on your PC

| Tool | What it does | How it sees the page | How it drives | CAPTCHAs / logins / sessions | Licence | Windows locally | AI it needs | Privacy notes | MCP |
|---|---|---|---|---|---|---|---|---|---|
| **foo today** (Edge + playwright-core, I1 §8.3) | foo's own Edge window, separate profile, approval gate | Injected script: ≤300 interactive elements + ≤8,000 chars text, refs, secrets masked at source | Playwright locators on refs | CAPTCHA/OTP/passkey → user takes over; saved logins from foo's vault; persistent foo profile | foo's | ✅ | The user's own AI via CLI | Nothing leaves except to the user's AI | — |
| **Browser Use** (open-source library) | Python library: give it a task, it runs a browser agent loop | DOM serialised to a numbered list of interactive elements (`element_index`), optional screenshots [observed W32] | **Raw CDP** since Aug 2025 (left Playwright for speed and cross-origin iframes) [observed W32] | Can reuse a local Chrome profile (`from_system_chrome`) [observed W31]; CAPTCHA help only in cloud [observed W31] | **MIT** [observed W31] | Library: not stated; some tools advise WSL on Windows [observed W31] | **API keys** for OpenAI/Anthropic/Google, or its own gateway/model; local Ollama possible [observed W31] | **Telemetry on by default, sent to PostHog; may include task instructions, URLs visited, action traces and results**; turn off with `ANONYMIZED_TELEMETRY=false` [observed W34] | partial [observed W31] |
| **workflow-use** (Browser Use) | Record a task once, replay without AI, AI takes over if a step fails | Recorded steps | Browser Use | — | [unverified] | — | Only for the fallback | "Very early development, not for production" [observed W35] | — |
| **Stagehand** (Browserbase) | SDK with 3 verbs: `act` ("click Book"), `observe` (find elements), `extract` (pull data to a schema) + agent | **Hybrid accessibility tree** (a11y tree + DOM interactive elements + shadow DOM) with an XPath map; cross-origin iframes handled [observed W38] | AI returns the target; **deterministic code executes via CDP; the AI never controls the browser** [observed W38] | Local Chrome with `userDataDir` for cookies [observed W36]; CAPTCHA/proxies only on Browserbase | **MIT** [observed W36] | Local mode needs Chrome [observed W36]; Edge [unverified] | API keys or Browserbase's model gateway [observed W36] | Local mode keeps the browser local; server cache on Browserbase stores actions there [observed W37] | ✅ hosted Browserbase MCP [observed W36] |
| **Stagehand caching** (technique) | Remember how an instruction was done; replay with no AI call | Cache key = instruction + page + options; variables by **name**, not value [observed W37] | — | — | — | Local `cacheDir` works without Browserbase [observed W37] | — | — | — |
| **Playwright MCP** (Microsoft) | Gives any AI a browser through Playwright | **Accessibility snapshot with refs** (`[ref=e12]`), no vision by default; optional vision mode [observed W50]; snapshots can be diffed (`<changed>`, `[unchanged]`) [reported W51] | Playwright | Persistent profile by default; `--extension` to attach to your running Chrome/Edge; `msedge` supported [observed W50] | **Apache-2.0** [observed W50] | ✅ (profile path under `%USERPROFILE%`) [observed W50] | Any MCP client | Local. README warns it is token-heavy and suggests Playwright CLI for coding agents [observed W50] | is MCP |
| **Chrome DevTools MCP** (Google) | Lets coding agents inspect and drive Chrome (network, console, performance) | DevTools data + snapshots | Puppeteer [observed W52] | Can attach to a running Chrome [observed W52] | Apache-2.0 | [unverified] | Any MCP client | **Usage statistics on by default**; performance tools may send URLs to Google's CrUX service [observed W52]. Built for developers debugging sites, not for errands [inferred] | is MCP |
| **Skyvern** | Workflow automation with vision AI; forms, 2FA, password managers | **Vision LLM** on screenshots + Playwright [observed W48] | Playwright | 2FA (TOTP, email, SMS); Bitwarden; **CAPTCHA solving and anti-bot only in its cloud** [observed W48] | **AGPL-3.0** [observed W48] | Needs Rust + C++ build tools on Windows [observed W48] | API keys | Self-host local | ✅ [observed W48] |
| **Notte** | Agent + "perception layer", scripted steps with agent fallback | Structured page actions [observed W49] | Playwright-compatible | Vaults for credentials; CAPTCHA solving in hosted sessions [observed W49] | **SSPL-1.0** (not OSI open source) [observed W49] | Local mode with your API keys [observed W49] | API keys | — | partial |
| **Computer use** (Anthropic / OpenAI / Gemini) | The model looks at screenshots and returns mouse/keyboard actions | **Screenshots (vision)** [reported W53] | Your code performs the clicks | — | Proprietary models | ✅ (as an API) | API with per-token pricing [reported W53] | Screenshots of pages go to the AI vendor. Anthropic: production; OpenAI: available; Gemini: preview [reported W53]. Operator shut 31 Aug 2025 [reported W53]. Claude in Chrome GA 26 Aug 2026 with an "action vs request" classifier [reported W54]. Slow and costly per step versus text snapshots [inferred]. | — |

### 3.2 Comparison table: cloud browsers (the browser runs on their server)

| Service | What it is | Price per browser-hour | Free tier | Proxies | CAPTCHA | Data kept | Regions | Open source | MCP |
|---|---|---|---|---|---|---|---|---|---|
| **Browserbase** | Cloud Chrome for agents; home of Stagehand | $0.10–0.12 overage; plans $20 / $99 [observed W39] | 1 browser-hour/month [observed W39] | $10–12/GB [observed W39] | Automatic on paid plans [observed W39] | **7 days free, 30 days paid** [observed W39] | **US and EU; Asia only on request for enterprise** [observed W39] | No (Stagehand is) | ✅ |
| **Browser Use Cloud** | Cloud browsers + hosted agent | **$0.02** [observed W33] | $1 once [observed W33] | $5/GB residential [observed W33] | Included [observed W33] | ZDR only Enterprise [observed W33] | Not stated | Library MIT | ✅ |
| **Steel** | Open-source browser API; cloud or self-host | $0.10 (Launch), $0.08 (Scale) [observed W41] | $30 once, 90 days [observed W41] | $10/GB [observed W41] | $3 per 1,000 solves [observed W41] | 7–14 days [observed W41] | Not stated | **Apache-2.0**, Docker [observed W40] | [unverified] |
| **Hyperbrowser** | Stealth cloud browsers + agents | $0.10 [observed W42] | Not stated | $10/GB [observed W42] | [unverified] | Not stated | Not stated | Closed [reported W43] | ✅ `hyperbrowser-mcp` [reported W43] |
| **Anchor Browser** | Cloud browsers with "authenticated" sessions | $0.05 + $0.01 per session [observed W45] | $5/month credit [observed W45] | $8/GB [observed W45] | Paid plans only [observed W45] | 7 days (ZDR on Enterprise) [observed W45] | Not stated | No | [unverified] |
| **Kernel** | Browsers in micro-VMs; managed sign-in; signs its traffic (Web Bot Auth) | Per GB-second; idle free [reported W44] | $5/month credit [reported W44] | Not charged [reported W44] | Listed [reported W44] | Replays 7 days on Hobbyist [reported W44] | Not stated | Browser image open [reported W43] | ✅ [reported W44] |
| **Airtop** | Cloud browsers + no-code agents | Credit-based; $29 / $189 / $558 plans [observed W46] | 1,000 credits + 10,000 once [observed W46] | Included on paid [observed W46] | Not stated | Not stated; "never used for training" [observed W46] | Not stated | No | [unverified] |

### 3.3 What this means for foo

- **foo's design already matches the best practice.** The leaders (Playwright MCP, Stagehand, Browser Use) all read a **text outline of the page** (accessibility tree / numbered elements), not screenshots, and keep the AI away from direct control [observed W32, W38, W50]. foo's §8.3.4 snapshot is the same idea.
- **Why foo should not embed Browser Use or Stagehand:**
  1. **They call the AI themselves with API keys** [observed W31, W36]. foo's users bring a Claude/ChatGPT/Gemini *subscription* driven through its CLI, not a pay-per-use API key (I1 §6). Plugging those libraries in would mean a second AI bill or rewiring their insides [inferred].
  2. **They would bypass foo's gate.** Their agent loop decides when to click "Pay". foo's rule is that the AI can only reach an irreversible click through `browser.submit` with an approval id (I1 §8.2.1) [inferred].
  3. **Privacy defaults.** Browser Use sends telemetry with task text and URLs unless switched off [observed W34]; Chrome DevTools MCP sends usage statistics by default [observed W52].
  4. **Stack.** Browser Use, Skyvern, Crawl4AI and Notte are Python; foo is Node. Stagehand is TypeScript (fits), but its value is the techniques, which are small to copy [inferred].
- **Why no cloud browser** (agrees with `capabilities.md` §3.3):
  1. **Privacy.** The user's signed-in IRCTC, Amazon and bill-payment sessions would live on a US/EU server, with recordings kept 7–30 days [observed W39, W41, W45]. That breaks Article 15 ("Your data is yours").
  2. **Indian sites block them.** IRCTC runs an anti-bot system through a CDN partner and has blocked 2.5 crore suspicious accounts [reported W56]. Data-centre IPs are the first thing such systems block [inferred]. Browserbase has no India region by default [observed W39]; Indian residential proxies cost $5–12 per GB [observed W33, W39].
  3. **CAPTCHA solving is the wrong answer.** Cloud vendors "solve" CAPTCHAs automatically [observed W33, W39, W41]. IRCTC's CAPTCHA and Aadhaar rules exist to stop bots [reported W56]; auto-solving would likely breach the site's terms and get the user's account blocked [inferred]. foo's "you take over" lane (I1 §8.4) is right.
  4. **Cost.** Every minute costs money, plus proxies, plus a foo server to run it (§5).

---

## 4. Recommendation for foo

### 4.1 Search (`web.search`)

**Keep "Bing in foo's window" as the free default. Make it sturdier. Add an optional "Faster search" key in v1.1, using the user's own free key. Do not buy a foo-paid key.**

Make the Bing route sturdier [inferred from W3, W4, W58]:
- Open `https://www.bing.com/search?q={q}&cc=IN&setlang=en-IN` (Hindi when the user writes Hindi).
- Read the results with a **fixed parser** (title, link, snippet, site) rather than the general page snapshot: faster, cheaper for the AI, and the same every time. Return ≤10 results.
- **Skip Bing's AI answer box** (Copilot) and ads. The Microsoft agreement specifically forbids scraping its AI output [observed W4]; and an AI-written answer inside results is a second AI talking to the user's AI.
- If Bing shows a "prove you're human" page: never solve it; retry once on **DuckDuckGo's plain HTML page** in the same window; if that fails too, say "Search is busy right now" with one button [Try again]. (OpenClaw ships DuckDuckGo as its key-free provider [observed W58].)
- Keep it in the background job window; the user never needs to look at it.

Optional "Faster search" (v1.1, Settings → Connections):
- One tile: **"Faster search"**. "Searches finish in about a second and don't use foo's window. You get a free key from a search company. That company sees what you search." [Get a free key] [Paste key].
- Suggested provider: **Tavily** (1,000 free searches a month, no card) [observed W12]. Second choice for privacy-minded users: **Brave** (own index, privacy brand, $5 free credit, but needs a card) [observed W9]. Both have official MCP servers, so foo can wire them through its connector interface later [observed W9; unverified Tavily].
- The key goes in the vault like any secret (Art. 8). If the key fails or runs out, foo falls back to Bing silently and adds one line to the morning brief.
- **Not a foo-paid key**: it would need a foo relay server that sees every user's searches, and costs grow with users (§5, Option 3).

Considered and **not** recommended for v1: letting the user's AI use its own built-in search. It is free for subscribers and adds no new company [reported W59; inferred], but foo would lose the gate, the step log and the untrusted-text wrapping (I1 §6, §7). Revisit as a v1.1 switch "Let my AI search by itself" if search speed is the top complaint.

### 4.2 Reading (`web.fetch`)

**Local only. Mozilla Readability (or Defuddle) inside foo's engine; foo's own Edge window when a page needs scripts. No Firecrawl, no Jina.**

Pipeline [observed W28, W57; inferred]:
1. Same URL rules as `browser.open` (no `file:`, localhost, private IPs), **re-checked on every redirect**.
2. Plain GET with Edge's user agent and `Accept-Language: en-IN,hi;q=0.8`; 2 MB cap; character set from header, then page.
3. JSDOM with scripts and remote loading **off** → `isProbablyReaderable` → Readability (`@mozilla/readability`, Apache-2.0) → Markdown (≤20,000 characters) with title, site, date.
4. If the page is not readable or returns under ~500 characters of text (sites built with scripts, like MakeMyTrip results), return `needsBrowser` and the engine reads it in the job window instead (rendered page → same extractor). This counts as a read, not a new rung.
5. Text wrapped as untrusted (I1 §7.2 part 9); 15-minute cache per URL.

Why not cloud: free, nothing leaves the PC, and foo already has a real browser for the hard pages. Firecrawl's extra power (proxies, anti-bot, `/agent`) is aimed at servers scraping at scale [observed W22]. Revisit only if a whole category of reading keeps failing.

### 4.3 Doing things on sites (bookings, forms, payments)

**Keep foo's own Edge + playwright-core (I1 §8.3). Don't embed Browser Use, Stagehand, Skyvern or Notte. Copy these techniques:**

| # | Technique | Who does it | What foo gets | Where in spec |
|---|---|---|---|---|
| T1 | **Accessibility-tree snapshot with refs**, merging the a11y tree, DOM interactive elements and shadow DOM; use Playwright's AI snapshot (`[ref=eN]`) as the base and keep foo's masking at source | Playwright MCP [observed W50], Stagehand hybrid tree [observed W38] | Fewer missed buttons (custom dropdowns, date pickers), less hand-written code to maintain, Microsoft keeps it current | §8.3.4 |
| T2 | **Cross-origin iframes** handled by routing each element to the frame that owns it | Browser Use [observed W32], Stagehand [observed W38] | Payment boxes (Razorpay, PayU, bank 3-D Secure) and captcha frames often live in other-origin frames [inferred]; today's spec reads only same-origin iframes (I1 §8.3.4) | §8.3.4, §10 |
| T3 | **Snapshot diffs**: after an action send only what changed (`<changed>`, `[unchanged]`) | Playwright [reported W51] | Fewer AI tokens per step, faster steps, lower spend against the Art. 13 cap | §8.3.4, §8.3.5 |
| T4 | **Site recipes (action cache)**: after a job succeeds, save the path per site and goal: page URL pattern, the instruction, the element's role + name (+ backup selector), and **variable names, never values**. Next time: replay each step only if the element is found and the page matches; the AI confirms each step; on a miss, re-snapshot and ask the AI (self-heal) and update the recipe | Stagehand cache [observed W37], self-heal by diff [observed W38], workflow-use [observed W35], Notte scripted steps + agent fallback [observed W49] | Second IRCTC booking or second electricity bill is faster and cheaper; fewer wrong clicks. **Commit clicks are never replayed without a fresh approval** | new §8.3.11 |
| T5 | **The AI chooses; deterministic code acts** (already foo's rule) plus **check after acting**: each action names what should change; no change → retry once, then stuck | Stagehand [observed W38] | Fewer silent failures | §8.3.5 |
| T6 | **Event watchdogs** for dialogs (alert/confirm), new tabs/pop-ups (payment gateways open them), downloads, page crashes, and "prove you're human" pages | Browser Use watchdogs [observed W32] | Fewer stuck jobs; CAPTCHA goes straight to the Take-over lane | §8.3.5, §8.4 |
| T7 | **Screenshot only as a fallback** (canvas maps, seat maps, empty trees), masked | Playwright MCP vision mode [observed W50], computer-use APIs [reported W53] | Seat/berth maps and image-only buttons become possible without paying for vision on every step | §8.3.4 |
| T8 | **Treat page text as hostile** and check the action against the user's own words right before it runs | Claude in Chrome classifier [reported W54]; live attacks [reported W55] | foo already has the second look (Art. 10). Extend: a page that asks to go to a new site, pay a new payee or reveal a secret is flagged in the step turn | §9.6 |

Not to copy: CAPTCHA solving, stealth/fingerprint spoofing, residential proxies [observed W33, W39, W41]. foo runs as the user, from the user's home internet, in a real Edge. Disguising it would be dishonest to the sites and would risk the user's own accounts [inferred]. Later, if sites start accepting signed agents (Cloudflare's Web Bot Auth, used by Kernel and Browserbase [reported W43; search result W61]), foo could sign its traffic, but that needs a foo-held key and is not v1.

### 4.4 Cloud browsers

**No, for v1 and beyond, unless foo one day offers an explicit "work while my PC is off" plan.** Reasons in §3.3: privacy (sign-ins and recordings on a US/EU server for 7–30 days), Indian sites block data-centre computers, CAPTCHA "solving" risks the user's account, and per-minute plus proxy costs need a foo server and a subscription.

---

## 5. Three options for the owner

Assumptions: typical user = 300 searches, 900 page reads and ~10 browser-hours a month [inferred]. Costs are what foo or the user pays **on top of** the user's own AI subscription. $1 ≈ ₹88 [unverified].

| | **Option 1 · All local (recommended for v1)** | **Option 2 · Local + optional "Faster search" key (recommended for v1.1)** | **Option 3 · Cloud tools (not recommended)** |
|---|---|---|---|
| What it is | Bing (and DuckDuckGo backup) in foo's window; local reader; foo's Edge with the 8 techniques | Option 1, plus a Settings tile where the user pastes a free search key (Tavily or Brave) | Exa or Tavily for search, Firecrawl for reading, Browser Use Cloud or Browserbase for doing, all on foo's account through a foo server |
| What the user notices day to day | Searches take 2–5 s and the job window is busy for a moment; reading is instant; bookings run in the foo window on their PC; repeat errands get quicker | Searches take about 1 s once a key is added; a one-time "get a free key" step; everything else as Option 1 | Fastest searches and reading; works while the PC sleeps; **but** IRCTC and some bank/bill sites refuse or show endless "prove you're human"; sign in to each site again on a remote browser; foo subscription needed |
| Cost per month | **₹0** | **₹0** for a typical user (inside free tiers); ~₹70–200 only for very heavy users [inferred from W9, W12] | **~₹450–1,400 per user** [inferred]: search ~$2 (Exa) + reading ~$1–4 (Firecrawl) + browser ~$1–1.2 (Browserbase) + Indian residential proxies ~$5–12/GB, plus a foo server; paid by foo or passed on as a subscription |
| Privacy | Nothing new leaves the PC. Microsoft sees searches as an ordinary visitor; sites see the user's own home connection | Searches also go to the chosen search company (no sign-in, but the key identifies the account). Pages and sign-ins stay local | Every search, every page read and every signed-in session passes through foo's server and 2–3 US companies, kept 7–30 days by default [observed W39, W41]. **Breaks Article 15** in spirit |
| Reliability | High on Indian sites (home IP, real Edge). Search can hit a "prove you're human" page under heavy use → backup engine → "Search is busy" | Search more consistent (no web page to parse); falls back to Option 1 automatically | Search/read very consistent; **doing** is worst exactly on the sites foo users need (IRCTC, government, bills) |
| Build effort | Small: parser, Readability, the techniques (T1–T8) can arrive over v1 and v1.1 | Small extra: one Settings tile, two provider adapters, vault entry | Large: server, billing, abuse control, data processing agreements, privacy policy rewrite |

---

## 6. Spec deltas (only if Vikas says yes)

Section numbers refer to `08-functions-and-engine-2.md` unless stated. `capabilities.md` V1-2 already proposes §8.3.10 (hand-back sites), so the new recipe section here is §8.3.11.

| # | Where | Change |
|---|---|---|
| WT-1 | §8.2, row `web.search` | Replace notes with: "Bing in the job window: `https://www.bing.com/search?q={q}&cc=IN&setlang={en-IN\|hi}`; results read by a fixed parser (title, url, snippet, site), ≤10, ads and AI-answer modules skipped; text wrapped untrusted. On a challenge page: never solve; retry once on `https://html.duckduckgo.com/html/?q=`; then `SEARCH_BUSY` ("Search is busy right now." [Try again]). If a Faster-search key is set (v1.1), call that provider first and fall back silently. `[foo decision: no foo-paid search key; no relay server]`" |
| WT-2 | §8.2, row `web.fetch` | Replace notes with: "GET, URL policy re-checked on each redirect, Edge user agent, `Accept-Language: en-IN,hi;q=0.8`, 2 MB cap, charset sniffing; JSDOM (scripts and remote loading off) → `@mozilla/readability` → Markdown ≤20,000 chars + title/site/date; under ~500 chars or not readable → `needsBrowser`, engine re-reads in the job window (same extractor on the rendered DOM); 15-min cache. No cloud reader. `[foo decision]`" |
| WT-3 | §8.3.4 Snapshot | Base the snapshot on Playwright's AI accessibility snapshot (refs) merged with DOM interactive elements and **open shadow roots**; include **cross-origin iframes** by routing per frame target; keep every masking rule at source unchanged; after the first snapshot in a step, send a **diff** (changed/unchanged refs). Screenshot fallback (masked) only when the tree has < 5 interactive elements or a canvas fills the main area. |
| WT-4 | §8.3.5 Actions | Add: each action carries an expected change; no change after the wait → one retry → stuck rules (§5.6). Add **watchdogs**: dialog (auto-dismiss only `alert`; `confirm` → treat as commit control), new tab/pop-up adopted into the job, download finished, page crash → reload once, challenge page detected → `job.needSignIn{kind:"captcha"}`. |
| WT-5 | New §8.3.11 **Site recipes** | Table `site_recipes(domain, goal, urlPattern, steps[{instruction, role, name, fallbackSelector, variableName?}], successCount, lastOkAt, lastFailAt)`. Saved after a job reaches Done with proof. Replay: each step runs only if the element matches by role + name on a matching URL; the AI confirms each step in a light step turn; on a miss → normal snapshot and AI choice, then the recipe updates. Values (names, dates, card data) are never stored, only variable names. Commit steps are never replayed without the job's own approval (§9). Wiped with site sign-ins (Connections → Browser). |
| WT-6 | §8.4 Sign-in lanes | Add sentence: "foo never solves CAPTCHAs, never uses CAPTCHA-solving services, stealth fingerprint changes or proxies. A detected challenge always goes to Take over." |
| WT-7 | §9.6 Second look | Add flag in step turns: a page instruction to go to a new domain, pay a new payee, or enter a secret is marked "page asked" and cannot by itself trigger a rung change (already needs a card under §8.1) [W55]. |
| WT-8 | §11.1 / Settings (06) | (v1.1) "Faster search key" is a vault secret; Settings → Connections tile "Faster search" with providers Tavily and Brave; copy per §4.1; no tech words (Art. 2: "key" is allowed). |
| WT-9 | `DECISIONS.md` | New X-entries: "Web stays local: search via Bing in foo's window (DuckDuckGo backup), reading via local Readability, doing via foo's Edge. No cloud search, reader or browser on foo's account." · "foo does not embed third-party agent libraries (Browser Use, Stagehand, Skyvern, Notte); it copies techniques T1–T8." · "Optional user-owned Faster-search key (v1.1)." |
| WT-10 | `08-functions-and-engine-3.md` §23 (open questions) | Add: "O-x: Faster-search key in v1 or v1.1? Default provider Tavily (no card) or Brave (privacy)?" and "O-y: allow the user's AI to use its own built-in search behind a switch (v1.1)?" |
| WT-11 | §8.6 Functions | Add `webSearch.bing`, `webSearch.ddgHtml`, `webSearch.keyed`, `webFetch.extract`, `recipes.save` / `recipes.match` / `recipes.invalidate`, `browser.watchdogs.start`. |

---

## 7. Open points and what we could not verify

- Whether Bing shows challenge pages to a low-volume, headed, real-Edge visitor from Indian home IPs [unverified]: test in the browser spike (I1 §8.3.2 already has one).
- India quality of Tavily, Exa, Brave and Parallel on local queries (PNR status, DISCOM bill pages, government notices) [unverified]: run a 50-query India test set before choosing the Faster-search default.
- Defuddle's licence (MIT assumed) [unverified].
- Firecrawl ZDR: its own pages disagree (all plans at +1 credit vs Enterprise only) [observed W21, W25].
- Computer-use model names and benchmark numbers come from one vendor-authored page [reported W53]; treat as indicative.
