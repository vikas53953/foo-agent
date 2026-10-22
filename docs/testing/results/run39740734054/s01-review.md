# Real AI run 39740734054: s0/s1 evidence review

Run: [39740734054](https://github.com/vikas53953/foo-agent/actions/runs/39740734054)

Tested application SHA: `fb15c2eea738e7ddd1b3daa2e11c5712a4c66be3`

Immutable evidence commit: [`c2013b8b41fd9ae3d701cc1cd99fa5d978ab8e4e`](https://github.com/vikas53953/foo-agent/commit/c2013b8b41fd9ae3d701cc1cd99fa5d978ab8e4e)

Evidence trees: [s0](https://github.com/vikas53953/foo-agent/tree/c2013b8b41fd9ae3d701cc1cd99fa5d978ab8e4e/real-ai/fb15c2e-claude/s0), [s1](https://github.com/vikas53953/foo-agent/tree/c2013b8b41fd9ae3d701cc1cd99fa5d978ab8e4e/real-ai/fb15c2e-claude/s1).

This is an evidence review, not a release or acceptance report. It does not alter the original NA62 filter, source/spec files, journey files, or workflow files. No paid, booking, sending, approval, sign-in, or secret side effect was claimed.

## Execution totals

| shard | execution folders | steps | failed assertions | clean folders | failed folders | PNGs |
| ----- | ----------------: | ----: | ----------------: | ------------: | -------------: | ---: |
| s0    |                16 |   271 |                28 |            11 |              5 |  108 |
| s1    |                16 |   190 |                14 |            11 |              5 |   76 |
| s0+s1 |                32 |   461 |                42 |            22 |             10 |  184 |

There are 31 unique journey IDs because `J01-J02-first-run` executed once in each shard. The 42 failures are failed steps/assertions, not 42 failed product features. All 184 s0/s1 PNGs were downloaded from the pinned evidence and reviewed in contact sheets; the screenshots show real Foo UI states, including expected error-state captures.

## Per-AT candidate verdicts

The canonical machine-readable candidate rows are in [`run39740734054-canonical-s01.tsv`](./run39740734054-canonical-s01.tsv). Verdicts are deliberately conservative:

- `UNVERIFIED` means the observed screenshot or DOM state does not establish the complete acceptance predicate.
- `PARTIAL` means one or more required predicates were observed, but the full acceptance condition was not entered or proved.
- `BLOCKED` means the required interaction or qualifying state was not reached, so the result is not a product failure claim.
- `ORACLE_SCOPE` means the check was contaminated by an earlier fixture or used a global selector that cannot identify the current item.

| shard | journey                         | ATs                    | verdict               | evidence                                                                                                                 |
| ----- | ------------------------------- | ---------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| s0    | J01-J02-first-run               | AT-005                 | UNVERIFIED            | Claude/ChatGPT request pair was not evidenced                                                                            |
| s0    | J01-J02-first-run               | AT-313                 | UNVERIFIED            | static screenshots do not prove animation                                                                                |
| s0    | J01-J02-first-run               | AT-314                 | UNVERIFIED            | static screenshots do not prove shimmer behavior                                                                         |
| s0    | B02-choice                      | AT-032, AT-035, AT-288 | OBSERVED              | choice reply, option interaction, and typed answer were exercised                                                        |
| s0    | B10-paste-secret                | AT-365                 | OBSERVED              | long paste rendered the pasted-text chip                                                                                 |
| s0    | B10-paste-secret                | AT-008                 | PARTIAL               | guard and masked Secret box card rendered; complete value-entry predicate was not exercised                              |
| s0    | B10-paste-secret                | AT-370                 | PARTIAL               | composer guard named password/key and blocked normal send; this is not ShortForm/TextField secret-value entry acceptance |
| s0    | U27-composer-no-dropped-letters | AT-365                 | OBSERVED              | fast typing and paste reply screenshots captured                                                                         |
| s0    | U02-reactions-thanks            | AT-027                 | OBSERVED              | reaction flow was exercised; no blanket acceptance beyond the checked reaction state                                     |
| s0    | R-chat-rules                    | AT-427                 | PASS_BOUNDED          | five locale variants each had one new bubble, one timestamp, three paragraphs, and <=600 characters                      |
| s0    | R-kit-2                         | AT-350                 | BLOCKED               | three time-picker surfaces appeared; all real slot clicks timed out and no confirmations were reached                    |
| s0    | R-kit-2                         | AT-352                 | PARTIAL               | live-stamp surfaces appeared, but result/refresh predicates did not all hold                                             |
| s0    | R-kit-2                         | AT-355                 | PARTIAL               | three calculator outputs matched; input mutation/recomputation is DSL-blocked                                            |
| s0    | R-kit-2                         | AT-368                 | BLOCKED               | refresh did not produce a qualifying new reply                                                                           |
| s0    | R-kit-2                         | AT-369                 | BLOCKED               | calculator outputs appeared; keep/fresh-row identity was not established                                                 |
| s1    | R-dark                          | AT-429, AT-278         | OBSERVED_UNQUANTIFIED | dark screenshots exist; contrast was not numerically quantified                                                          |
| s1    | B03-web-local                   | AT-020                 | MISMAPPED_BLOCKED     | generic web sources/citations do not prove the email-result feature                                                      |
| s1    | B03-web-local                   | AT-139                 | PARTIAL               | local reply and non-blocked final text observed; required no-cloud-host/readability/script-page path not proved          |
| s1    | B03-web-local                   | AT-310                 | PARTIAL               | checklist and named rows visible; conditional finished/source-pile proof not established                                 |
| s1    | B04-stop                        | AT-077, AT-080         | OBSERVED              | stop report/badge passed and no pending approval was present                                                             |
| s1    | B04-stop                        | AT-107                 | ORACLE_SCOPE          | expected one stopped checklist but global selector found two, one stale from cleanup and one current                     |
| s1    | R-reply-area                    | AT-428                 | BLOCKED               | qualifying new reply was not reached                                                                                     |
| s1    | R-reply-area                    | AT-430                 | BLOCKED               | all three copy waits timed out                                                                                           |

## B07 diagnostic boundary

B07 is separate from this full s0/s1 run. Its latest immutable evidence is [commit `2626617e30f7e67ba805ce55f7fdf3f7165c0790`](https://github.com/vikas53953/foo-agent/commit/2626617e30f7e67ba805ce55f7fdf3f7165c0790), under [`real-ai/af38bc3-claude/s0`](https://github.com/vikas53953/foo-agent/tree/2626617e30f7e67ba805ce55f7fdf3f7165c0790/real-ai/af38bc3-claude/s0).

The live URL was exactly `app://foo/windows/live.html`; the document reached `readyState=complete` with one live root and one picture element. It immediately reported `state=cant_show`, `maskedCount=0`, `takeoverCount=1`, and `handBackCount=0`. `LiveView` enters `cant_show` only when `job:watch` returns `LIVE_UNAVAILABLE`; the source has three indistinguished failure branches: missing browser window, CDP open failure, or `Page.startScreencast` failure (`src/engine/tools/browser/screencast.ts:63-88`). The main live route is present (`src/main/windows/liveWindow.ts:93-109`). A verifier-only frame drop would leave the renderer in `starting`, so it does not explain this observed `cant_show` state. No product edit or new diagnostic instrumentation was made in this review.
