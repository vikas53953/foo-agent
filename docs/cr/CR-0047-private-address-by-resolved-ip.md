# CR-0047: the private-address block checks where a name points

- **Asked by:** the coordinator for Vikas, 2026-10-21 22:18Z, after the finding below; under his 2026-10-21 07:14Z "Do not wait
  for any go or approval from me" and the approve-on-my-behalf rule (2026-10-18 14:56Z, 14:59Z) for security bug fixes.
- **Why:** 08-2 §8.2 says `browser.open` blocks `localhost` and private/link-local IP ranges, and `web.fetch` uses the same URL
  policy. `checkUrl` (and the web tools' `defaultUrlAllowed`) compared only the host name as written. A public name that
  resolves to `127.0.0.1`, `10.x` or `192.168.x` passed, so a page or link chosen by a website or by injected text could make
  foo's browser or the page read reach a service on the user's PC or home network (a router page, a local dev server). This
  was found while fixing the real-AI web search (PR #128), and nothing was built on it.
- **Spec sections:** 08-2 §8.2 (`browser.open` and `web.fetch` rows); DECISIONS X-205.
- **Status:** waiting for Vikas. The coordinator held it on 2026-10-21 23:16Z: the browser's traffic going through the
  engine's proxy (and a company proxy not being chained, §(c)8) is a design change beyond approve-on-behalf. Draft PR, not merged.
- **Manifest:** `pnpm tsx scripts/spec-verify.ts --write` run in the same commit.

## (a) Tests

- `test/unit/net/address.test.ts`: the one private-address rule (IPv4, IPv6, IPv4 carried in IPv6, trailing dots); a name that
  resolves to a private address is private; `localhost.` and `*.localhost` are local whatever DNS says; only test hosts skip it.
- `test/integration/web/guardedGet.test.ts`: the page read's GET to a public name that resolves to 127.0.0.1 is refused before
  any byte reaches the service; written addresses and localhost names are refused; an odd status is a failed read, not a crash;
  `web.fetch` reports the refusal as `URL_NOT_ALLOWED`; test hosts are still read.
- `test/integration/browser/egressProxy.test.ts` (real Chromium): `browser.open` on such a name (through the test host map and
  through foo's own lookup), a redirect hop onto it, a frame and an image pointing at it, a cross-site frame that later moves
  itself onto it, and a pop-up opened on it never reach the local service; an allow-listed test host still opens; a `CONNECT`
  tunnel (HTTPS, WebSockets) to a private answer is closed; a `CONNECT` line it cannot read gets 400 and the engine keeps running;
  a tunnel keeps its port (:80 for `ws://`); a browser that ignores the proxy is not used (`BROWSER_MISSING`). The browser
  booking tests (HTTPS sandbox, POST bodies) and the M9 app tests (booking, sign-in, live, take-over, stop, hand-back) run
  through the proxy.

## (b) Spec before → after

| #   | Spec before                                                             | Spec after                                                                                                                          |
| --- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `browser.open`: blocks `localhost`, private/link-local IP ranges        | the same, also when a host name resolves to one: every browser request goes through the engine's proxy, which refuses it at connect |
| 2   | `web.fetch`: URL policy as `browser.open`, re-checked on every redirect | the same; the local GET refuses a private address at connect time                                                                   |

## (c) Picks where the spec is silent

1. **One lookup feeds the socket.** The engine's proxy on 127.0.0.1 resolves each host once and connects to that address, so a
   name whose DNS answer changes between two lookups cannot slip through. It covers every request the browser makes, whatever
   started it (a page, a redirect, a frame in its own process, a pop-up, an image, a WebSocket), which a per-page hook could not.
   Chromium is started with `--proxy-server` and `--proxy-bypass-list=<-loopback>` so loopback goes through it as well.
2. **Any private answer refuses the host.** A name with both a public and a private address is refused.
3. **A name that does not resolve (or takes over 3 s) is not refused here.** It fails on its own, so a DNS hiccup is not
   reported as a blocked address.
4. **The private set.** Loopback, 10/8, 172.16/12, 192.168/16, link-local, 0/8, shared 100.64/10 (CGNAT and Tailscale, the
   user's own devices), 198.18/15, multicast and reserved (224/4 and up); IPv6 loopback, unique-local, link-local, site-local,
   multicast, and the IPv4-mapped, NAT64 and 6to4 forms judged by the IPv4 address inside.
5. **Test runs.** The sandbox's `.test` host map (FOO_TEST_BROWSER_HOST_RULES) moves from Chromium to the proxy, since the
   browser no longer resolves names itself; test builds only, as before.
6. **Cloud calls are unchanged.** Exa, Tavily, Firecrawl and Browser Use go to the fixed provider addresses in
   `resources/web-tools.json`, not to an address the AI chose.
7. **A browser that ignores the proxy is not used.** A managed PC's proxy policy can override `--proxy-server`; at each launch
   the start page loads a name that cannot exist (`foo-egress-probe.invalid`) and the proxy must see it, or the browser is
   closed (`browser.proxy_bypassed`, `BROWSER_MISSING`). Fail closed rather than browse unguarded.
8. **Known limit.** foo's browser no longer uses a system proxy set by the user or their company; its traffic goes straight out
   from the engine's proxy. A follow-up can chain to the system proxy if a tester needs it. WebRTC is kept to proxied UDP only.
9. **Offline.** Behind the proxy Chromium always reaches 127.0.0.1, so a failed load while the engine is offline (08-3 §21.2)
   is `NET_OFFLINE`; a refusal is `URL_NOT_ALLOWED` only when the load failed as a refused tunnel or connection.
10. **One rule.** The browser's and the web tools' two copies of the private-range test are now one module
    (`src/engine/tools/net/address.ts`).

## (d) Review

Independent Fable and Opus reviews (HIGH tier: AI engine and browser), recorded in the PR and in `docs/decisions/fixes.tsv`.
Round 1 found that a per-page CDP hold missed pop-ups' first load, cross-process frames and the browser's own second DNS lookup,
plus a crash on an odd status code and `localhost.` with a trailing dot. All are fixed: the browser side became the engine's proxy
(both reviewers' recommended design), with a test for each case. Round 2 found a crash on a malformed `CONNECT` line, `ws://`
on port 80 tunnelled to 443, offline reported as a timeout, and a managed browser that could skip the proxy unnoticed; all fixed
with tests, plus header hygiene (hop-by-hop headers, an origin's 407 never shown as the proxy's), upstream timeouts and closing
the upstream when the browser gives up.
Round 3 confirmed every round-2 item closed and found one more: a tunnel cut short when the site closes right after sending
(fixed: the browser side is ended, not destroyed). The launch check now retries once on a fresh page, and a launch it closes
still has its profile wiped.
