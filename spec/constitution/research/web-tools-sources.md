# Sources for research/web-tools.md

Research date: Fri 16 Oct 2026. Each source was read with a web fetch on that day unless marked "(search result only)". Vendor-written comparison pages are marked "(vendor-authored)" because they compare themselves with rivals. Third-party price trackers are marked "(tracker)": they copy official pages, but can lag or misread.

Tags used in web-tools.md: **[observed]** = read on the vendor's own page or repo · **[reported]** = third-party article or tracker · **[inferred]** = our reasoning · **[unverified]** = not confirmed by any source we read.

## Search APIs

| ID | Source | What we took from it |
|---|---|---|
| W1 | Microsoft Learn, "Bing Search API retirement" — https://learn.microsoft.com/en-us/lifecycle/announcements/bing-search-api-retirement | Bing Search APIs fully shut down 11 Aug 2025; replacement "Grounding with Bing Search" in Azure AI Agents |
| W2 | PPC Land, "Microsoft ends Bing Search APIs on August 11; alternative costs 40–483% more" — https://ppc.land/microsoft-ends-bing-search-apis-on-august-11-alternative-costs-40-483-more/ (reported) | Grounding = $35/1k; no raw results; agent-only; old S1–S3 prices |
| W3 | Bing robots.txt — https://www.bing.com/robots.txt | `User-agent: *` → `Disallow: /search` |
| W4 | Microsoft Services Agreement — https://www.microsoft.com/en-us/servicesagreement | 3.a.vi "impermissible scraping"; 14.s.iii no scraping of AI services output |
| W5 | Exa changelog, "Pricing update" (3 Mar 2026) — https://exa.ai/docs/changelog/pricing-update | $7/1k search with contents; Deep $12; contents $1/1k |
| W6 | Exa blog, "ZDR search engine" (18 Aug 2025) — https://exa.ai/blog/zdr-search-engine | Zero data retention offered; own index |
| W7 | Digital Applied, "Web search APIs for AI agents compared" (2 Oct 2026) — https://www.digitalapplied.com/blog/web-search-apis-for-ai-agents-compared-2026 (reported) | Side-by-side prices, free tiers, retention for Exa, Tavily, Brave, Perplexity, Parallel |
| W8 | Parallel, "The best free web search APIs for AI agents in 2026" — https://parallel.ai/articles/best-free-web-search-api.md (vendor-authored) | Brave free tier ended Feb 2026; Serper 2,500 free; Google PSE closed to new customers |
| W9 | Brave Search API — https://brave.com/search/api/ | $5/1k Search, $4/1k Answers, $5 monthly credit, card required, ZDR only Enterprise, storage rights restricted, MCP server |
| W10 | CostBench, Brave price change May 2026 — https://costbench.com/changelog/brave-search-api-price-decrease-2026-05/ (tracker) | Plan renames May 2026 |
| W11 | Brave API docs, codes — https://api-dashboard.search.brave.com/app/documentation/web-search/codes | Country codes are 2-letter; IN not listed explicitly |
| W12 | Tavily docs, "API credits" — https://docs.tavily.com/guides/api-credits | 1,000 free credits/month no card; $0.008/credit; basic search 1 credit |
| W13 | UsagePricing, Tavily–Nebius (10 Feb 2026) — https://usagepricing.com/blueprint/activity/tavily-2026-02-10-nebius-acquisition (tracker) | Nebius acquired Tavily; prices unchanged |
| W14 | Activepieces, "Perplexity API pricing in 2026" (15 Oct 2026) — https://www.activepieces.com/blog/perplexity-api-pricing-in-2026-models-costs.md (reported) | Search API $5/1k; Sonar Pro token prices; no free tier |
| W15 | UsagePricing, Perplexity Fast Search (28 Sep 2026) — https://www.usagepricing.com/blueprint/activity/perplexity-ai-2026-09-28-search-api-fast-search (tracker) | Fast Search $1/1k |
| W16 | UsagePricing, You.com price changes (Jul 2026) — https://usagepricing.com/blueprint/activity/you-com-2026-07-22-price-change (tracker) | 100 free calls/day, then $5/1k; free MCP endpoint |
| W17 | AgentDeals, Jina AI — https://agentdeals.dev/vendor/jina-ai (tracker) | Reader 20 rpm keyless; 10M free tokens (non-commercial); $0.05/M tokens; part of Elastic since Oct 2025 |
| W18 | CostBench, SerpApi vs Serper — https://costbench.com/compare/serpapi-vs-serper/ (tracker) | Serper 2,500 free, $0.30–1.00/1k; SerpApi 250 free/month, $25 for 1,000 |
| W19 | Parallel pricing — https://parallel.ai/ai/pricing | $1–5/1k by mode; 5,000 free requests/month; ZDR Enterprise; Search MCP |
| W20 | Brave, "Alternatives to the Google Search API" — https://brave.com/learn/google-api-shutdown/ (vendor-authored) | Google Custom Search JSON API closed to new customers; retires 1 Jan 2027; new engines capped at 50 sites |
| W59 | InventiveHQ, Gemini google_web_search — https://inventivehq.com/knowledge-base/gemini/how-to-use-google-search-grounding (reported) | Gemini CLI built-in search, on by default, free tier with Google login, can be excluded |
| W60 | Parallel, "Claude web search vs Parallel" (26 Sep 2026) — https://parallel.ai/articles/claude-web-search-vs-parallel (vendor-authored) | Claude API web search $10/1k + tokens; web fetch no extra fee |

## Read / crawl / extract

| ID | Source | What we took from it |
|---|---|---|
| W21 | Firecrawl docs, "Billing" — https://docs.firecrawl.dev/billing | Credit costs per endpoint; 1,000 free credits/month; ZDR +1 credit/page; keyless use limited per IP |
| W22 | Firecrawl docs, "Open source or cloud" — https://docs.firecrawl.dev/contributing/open-source-or-cloud.md | Self-host lacks enhanced proxies, managed anti-bot, Agent/Browser/Interact |
| W23 | Firecrawl GitHub — https://github.com/firecrawl/firecrawl | AGPL-3.0 core, MIT SDKs; scrape/crawl/map/search/agent/interact/actions; firecrawl-mcp |
| W24 | Flexprice, Firecrawl pricing index (30 Sep 2026) — https://flexprice.io/pricing-index/firecrawl (tracker) | Hobby $19, Standard $99, Growth $399 per month (from 4 Sep 2026) |
| W25 | Firecrawl glossary, "Zero data retention web scraping" — https://www.firecrawl.dev/glossary/web-scraping-apis/zero-data-retention-web-scraping | ZDR described as an Enterprise option (conflicts with W21) |
| W26 | Crawl4AI GitHub — https://github.com/unclecode/crawl4ai | Apache-2.0, v0.9.4 (23 Sep 2026), Playwright, fit-markdown, stealth, profiles, MCP |
| W27 | Trafilatura docs — https://trafilatura.readthedocs.io/en/latest/ | Apache-2.0 since v1.8, v2.3.1, Python, Markdown + metadata |
| W28 | Mozilla Readability GitHub — https://github.com/mozilla/readability | Apache-2.0, Node + JSDOM, no sanitising, isProbablyReaderable |
| W29 | Defuddle README — https://cdn.jsdelivr.net/gh/kepano/defuddle@main/README.md | Readability alternative, Markdown output, Node via linkedom |
| W30 | CostBench, Bright Data vs ScrapingBee — https://costbench.com/compare/bright-data-vs-scrapingbee/ (tracker) | ScrapingBee 1,000 free credits, from $19.99; Bright Data APIs from $1/1k |
| W57 | OpenClaw docs, web_fetch — https://docs.openclaw.ai/tools/web-fetch | Precedent: plain GET + Readability, Firecrawl fallback, 15-min cache, private-host block |
| W58 | OpenClaw docs, web search — https://docs.openclaw.ai/tools/web | Precedent: many providers incl. key-free DuckDuckGo; no key → search tool hidden |

## Browser automation for agents

| ID | Source | What we took from it |
|---|---|---|
| W31 | Browser Use GitHub — https://github.com/browser-use/browser-use | MIT, ~118k stars, Python, provider keys, WSL advised on Windows for some tools, cloud $0.02/browser-hour |
| W32 | Browser Use blog, "Playwright to CDP" (20 Aug 2025) — https://browser-use.com/posts/playwright-to-cdp | Left Playwright for raw CDP; element indexes; cross-origin iframe routing; event watchdogs |
| W33 | Browser Use pricing — https://browser-use.com/pricing.md | $0.02/browser-hour; agent $0.006/step; proxies $5/GB; CAPTCHA solving included; ZDR Enterprise |
| W34 | Browser Use docs, telemetry — https://docs.browser-use.com/open-source/development/monitoring/telemetry.md | Telemetry to PostHog incl. task instructions, URLs, action traces; opt out with ANONYMIZED_TELEMETRY=false |
| W35 | workflow-use README — https://cdn.jsdelivr.net/gh/browser-use/workflow-use@main/README.md | Record once, replay without AI, agent fallback; "very early development" |
| W36 | Stagehand GitHub — https://github.com/browserbase/stagehand | MIT, TS/Python/Go, act/observe/extract, local Chrome or Browserbase, hosted MCP |
| W37 | Stagehand docs, caching — https://docs.stagehand.dev/v3/best-practices/caching.md | Server cache and local cacheDir; key = instruction + page + options; variables by name |
| W38 | "How Stagehand works" (Mintlify mirror of docs) — https://www.mintlify.com/browserbase/stagehand/concepts/how-stagehand-works | Hybrid accessibility tree + XPath map; LLM picks, code executes; self-heal by diffing |
| W39 | Browserbase pricing — https://www.browserbase.com/pricing | Free 1 h; $20 / $99 plans; $0.10–0.12/h overage; proxies $10–12/GB; retention 7–30 days; regions US/EU, Asia on request |
| W40 | Steel Browser GitHub — https://github.com/steel-dev/steel-browser | Apache-2.0, self-host Docker, stealth, session persistence |
| W41 | Steel docs, pricing — https://docs.steel.dev/overview/pricinglimits | $0.10/h, CAPTCHA $3/1k, proxy $10/GB, retention 7–14 days |
| W42 | Hyperbrowser docs, pricing — https://www.hyperbrowser.ai/docs/pricing.md | $0.10/h, proxy $10/GB, scrape $0.001/page |
| W43 | Notte, "Hyperbrowser vs Kernel" — https://ai.notte.cc/answers/hyperbrowser-vs-kernel (vendor-authored, competitor) | Hyperbrowser closed-source, stealth modes, MCP; Kernel VMs, Web Bot Auth |
| W44 | AI IDE List, Kernel — https://aiidelist.com/ide/kernel.md (reported) | Free plan $5 credits; per GB-second billing; managed auth; MCP |
| W45 | Anchor Browser docs, pricing — https://docs.anchorbrowser.io/pricing.md | $0.05/h, $0.01/session, proxy $8/GB, CAPTCHA on paid, retention 7 days |
| W46 | Airtop pricing — https://www.airtop.ai/pricing | Free 1,000 credits; $29/$189/$558 plans; no training on data |
| W47 | Bug0, browser alternatives (Apr 2026) — https://browsers.bug0.com/alternatives (vendor-authored) | Cross-vendor hourly prices |
| W48 | Skyvern GitHub — https://github.com/Skyvern-AI/skyvern | AGPL-3.0; vision LLM; anti-bot and CAPTCHA only in cloud; 2FA; Bitwarden; Windows needs Rust + C++ tools |
| W49 | Notte GitHub — https://github.com/nottelabs/notte | SSPL-1.0; vaults; hosted CAPTCHA; scripted steps + agent fallback |
| W50 | Playwright MCP GitHub — https://github.com/microsoft/playwright-mcp | Apache-2.0; accessibility snapshot with refs; vision optional; persistent profile; --extension; msedge |
| W51 | Playwright aria snapshot format (mirror of doc) — https://glama.ai/mcp/servers/@nickweedon/playwritght-proxy-mcp/blob/cd9cf4f62d609b9a5979fa4d6b79ca34604cbef4/docs/aria-snapshot/playwright_aria_snapshot_format.md (reported) | `[ref=eN]`, `[cursor=pointer]`, `[active]`, `<changed>` / `[unchanged]` diffs |
| W52 | Chrome DevTools MCP GitHub — https://github.com/ChromeDevTools/chrome-devtools-mcp | Apache-2.0; Puppeteer; usage statistics on by default; CrUX URL sending |
| W53 | Simular, "Best computer use APIs 2026" (Oct 2026) — https://www.simular.ai/alternatives/computer-use-apis (vendor-authored) | Status of Anthropic/OpenAI/Gemini computer use; Operator shut 31 Aug 2025 |
| W54 | AI Understanding, Claude in Chrome GA (31 Aug 2026) — https://aiunderstanding.org/news/anthropic-makes-claude-in-chrome-generally-available-with-autonomous-browser-actio (reported) | GA 26 Aug 2026; injection rates; action-vs-request classifier |
| W55 | Cloud Security Alliance, "Indirect prompt injection in the wild" (26 Apr 2026) — https://labs.cloudsecurityalliance.org/research/csa-research-note-indirect-prompt-injection-in-the-wild-2026/ | Live payloads targeting browsing agents (PayPal transfer, key leak) |
| W56 | BOOM Live, IRCTC anti-bot — https://www.boomlive.in/web-stories/news/irctc-deploys-anti-bot-system-makes-aadhaar-mandatory-for-tatkal-bookings-2477 (reported) | IRCTC anti-bot via CDN partner; 2.5 crore suspicious accounts blocked; Aadhaar for Tatkal |
| W61 | Cloudflare blog, "Signed agents" — https://blog.cloudflare.com/signed-agents/ (search result only) | Web Bot Auth: agents sign their requests |

## Internal

| ID | Source |
|---|---|
| I1 | `constitution/08-functions-and-engine-2.md` §8.1–8.6 (tool layer, browser rung) |
| I2 | `constitution/research/capabilities.md` §3 (Option A browser), §7 (deltas V1-2 proposes §8.3.10 hand-back sites) |
| I3 | `constitution/01-articles.md` (Art. 2 no tech words, Art. 8 secrets, Art. 13 caps, Art. 15 your data is yours) |
