# Real-AI run 39733030713: shard 0/1 evidence review

Run: https://github.com/vikas53953/foo-agent/actions/runs/39733030713
Tested application HEAD: `948fe18ccc02caf874c8bf913c27fe15cecee983` (`codex/lane-a-2026-10-22`).
Evidence was pinned from commit [`1bffc8d80e2ae4a570a274195abc624d76d7dc52`](https://github.com/vikas53953/foo-agent/tree/1bffc8d80e2ae4a570a274195abc624d76d7dc52/real-ai/948fe18-claude), committed 2026-10-22 06:33:59Z. This review covers only `s0` and `s1`; no s2/s3 evidence was used.

All 37 PNGs were opened and visually inspected: s0=18, s1=19. All 7 journey `log.jsonl` files and paired `summary.json` files were read. Downloaded immutable copies and `evidence-manifest.csv` are in this folder.

## Actual execution inventory

| shard | journey (evidence timestamp) | steps | summary failed | PNGs | result notes |
|---|---|---:|---:|---:|---|
| s0 | `J01-J02-first-run` (`06-21-21-952Z`) | 14 | 0 | 8 | Claude detected/selected; ChatGPT and Gemini not found; setup reaches first chat. |
| s0 | `B03-web-local` (`06-22-13-052Z`) | 12 | 4 | 2 | Stays on live web checklist; no final sources/citation/proof surfaces. Named checklist rows are visible. |
| s0 | `B08-bank` (`06-25-03-071Z`) | 7 | 0 | 2 | Initial wait-reply is late/false, then handback card and Open HDFC control are present at recheck. |
| s0 | `U27-composer-no-dropped-letters` (`06-26-41-900Z`) | 10 | 0 | 6 | Exact full-speed, 5ms, and 18-line inline paste round trips; all reply checks pass. |
| s1 | `J01-J02-first-run` (`06-21-10-213Z`) | 14 | 0 | 8 | Same setup result as s0; Claude works, ChatGPT/Gemini not found. |
| s1 | `B04-stop` (`06-22-00-938Z`) | 9 | 2 | 3 | Booking date Choice remains unanswered; `stop` returns `Nothingâ€™s running right now`; no stopped checklist/badge. |
| s1 | `B09-kit` (`06-23-04-877Z`) | 17 | 2 | 8 | Calculator, map, chart, compare, timer, form and AI page surfaces render; map wait assertion and secret-form kit assertion fail. |

Total: 83 recorded journey steps, 8 summary failures, 37 PNGs.

## PNG inventory

- s0 `J01-J02-first-run`: `01-splash.png`, `02-welcome.png`, `03-finder-testing.png`, `04-finder-tested.png`, `05-after-claude-retest.png`, `06-after-use.png`, `07-step2.png`, `08-first-chat.png`.
- s0 `B03-web-local`: `01-news.png`, `02-news-later.png`.
- s0 `B08-bank`: `01-bank.png`, `02-bank-later.png`.
- s0 `U27-composer-no-dropped-letters`: `01-fast-typed.png`, `02-fast-reply.png`, `03-fast-typed-5ms.png`, `04-fast-reply-2.png`, `05-pasted.png`, `06-paste-reply.png`.
- s1 `J01-J02-first-run`: `01-splash.png`, `02-welcome.png`, `03-finder-testing.png`, `04-finder-tested.png`, `05-after-claude-retest.png`, `06-after-use.png`, `07-step2.png`, `08-first-chat.png`.
- s1 `B04-stop`: `01-flight-plan.png`, `02-flight-working.png`, `03-after-stop.png`.
- s1 `B09-kit`: `01-emi.png`, `02-map.png`, `03-chart.png`, `04-compare.png`, `05-timer.png`, `06-form.png`, `07-ai-page.png`, `08-secret-form.png`.

## Conservative per-AT candidates

These are candidates from this run only. They do not promote a journey's generic green workflow or a visual subset into a full feature pass.

| AT | candidate | evidence and bounded reason |
|---|---|---|
| AT-005 | **blocked** | Both provider sign-ins were not present: finder screenshots show Claude `works`, ChatGPT/Gemini `not found`. The predicate requires both Claude and ChatGPT real-request tests. `J01-J02-first-run/log.jsonl`; s0/s1 `04-finder-tested.png`. |
| AT-020 | **blocked** | B03 is a news/local-web job, not an email result. Four exact checks fail for sources/citation/Proof; no Gmail/email precondition or `Proof`/`Not checked live` chip exists. Do not call this an email-proof defect. `B03-web-local/log.jsonl`, `01-news.png`, `02-news-later.png`. |
| AT-077 | **blocked** | B04 never starts the booking job because the date Choice remains unanswered; `stop` returns `Nothingâ€™s running right now`. No running-job stop timing/activity proof. `B04-stop/log.jsonl`, `03-after-stop.png`. |
| AT-077a | **blocked / unexercised** | B04 has one unresolved Choice, not two running jobs and no `stop_which` card. |
| AT-077b | **blocked / unexercised** | No NEEDS YOU + PENDING Approval + steer scenario was reached. |
| AT-080 | **blocked** | The run sent `stop`, not `Stop everything`; no all-jobs/withdrawn-approval path was exercised. |
| AT-107 | **blocked** | No job was in a stop-able active state when `stop` was sent; the expected stopped badge/checklist was absent, but the required fixture was absent. |
| AT-139 | **partial / blocked for complete acceptance** | B03 is explicitly the no-keys journey and reaches a live checklist, but there is no network capture, local Readability result, or script-heavy `needsBrowser` result. The missing read path is unproven behavior, not a confirmed cloud-routing defect. `B03-web-local/log.jsonl`, both PNGs. |
| AT-142 | **partial** | `B08-bank/02-bank-later.png` and the late checks show exact handback copy plus `Open netbanking.hdfcbank.com`; no typed bank interaction is visible. Default-browser opening and complete no-read/no-click trace are not evidenced. The initial wait-reply was late/false, so do not call full pass. |
| AT-310 | **partial** | B03 screenshots show named checklist rows and one completed row while another remains live; the journey never reaches complete checkmark/overshoot and source-pile states. Incomplete job is not evidence that those conditional states are defective. |
| AT-313 | **partial** | Static splash PNGs show face/wordmark only. The log records one short wake wait, but no frame sequence proves one-time eye opening, no logo animation, or Off behavior. |
| AT-314 | **partial** | Finder screenshots show striped setup treatment and Claude `works`; other rows are `not found`. The all-row shimmer-to-check behavior is not demonstrated. |
| AT-340 | **partial** | One chart surface is visible with one series/variant. The three variants, one-vs-three series, and legend rule are not exercised. `B09-kit/03-chart.png`. |
| AT-341 | **partial** | Map PNG shows numbered stops, a route, stops list, and Open in Maps chip. The map wait assertion failed (`endState=false`), and no no-network trace is present. `B09-kit/02-map.png`, `log.jsonl`. |
| AT-343 | **pass, bounded to this predicate** | Compare PNG visibly has three columns, a highlighted Galaxy S25 column, and a one-line reason; log reports `kit-compare` and `waitReply ok=true`. `B09-kit/04-compare.png`. |
| AT-346 | **partial** | Timer card renders `2:00 left` and Start timer, but Start was not clicked; no ticking/data-model persistence proof. `B09-kit/05-timer.png`. |
| AT-347 | **partial** | EMI inputs and computed outputs render; no input mutation/recompute or bad-formula path is exercised. `B09-kit/01-emi.png`. |
| AT-351 | **partial** | Three-field form and Send to foo render; no values are entered/submitted. `B09-kit/06-form.png`. |
| AT-358 | **blocked** | AI-page surface is visible, but no DOM/frame evidence establishes `sandbox="allow-scripts"` only. `B09-kit/07-ai-page.png`. |
| AT-359 | **blocked / unexercised** | No >512KB page, 600px cap, or internal-scroll case. |
| AT-360 | **blocked / unexercised** | No foreign-source, bad-schema, rate-limit, or `page:rpc` refusal case. |
| AT-361 | **blocked / unexercised** | No requestAction/openLink/secret-call gate was exercised. |
| AT-362 | **blocked / unexercised** | No before-ready frame/status timing evidence. |
| AT-365 | **partial** | Full-speed, 5ms, and <=2,000-character 18-line inline paste are byte-accurate. The 2,001â€“10,000 chip and >10,000 file bands are untested. `U27-composer-no-dropped-letters/log.jsonl`, six PNGs. |
| AT-370 | **partial** | The response refuses a password field and renders username only; the expected short-form kit assertion fails and no actual Secret-box flow is shown. `B09-kit/08-secret-form.png`, `log.jsonl`. |
| AT-371 | **blocked / unexercised** | A calculator output renders, but no formula-language coverage, bad formula, or source-level no-eval evidence comes from this real-AI run. |

Unlisted ATs in the broad `B09-kit` range were not evidenced by a matching assertion or captured state in s1 and remain unproven.

## Immutable evidence roots

Each listed journey directory is under the pinned evidence commit above; timestamps are the artifact directory names recorded in the paired logs.

- [s0 J01-J02-first-run](https://github.com/vikas53953/foo-agent/tree/1bffc8d80e2ae4a570a274195abc624d76d7dc52/real-ai/948fe18-claude/s0/2026-10-22T06-21-21-952Z-J01-J02-first-run)
- [s0 B03-web-local](https://github.com/vikas53953/foo-agent/tree/1bffc8d80e2ae4a570a274195abc624d76d7dc52/real-ai/948fe18-claude/s0/2026-10-22T06-22-13-052Z-B03-web-local)
- [s0 B08-bank](https://github.com/vikas53953/foo-agent/tree/1bffc8d80e2ae4a570a274195abc624d76d7dc52/real-ai/948fe18-claude/s0/2026-10-22T06-25-03-071Z-B08-bank)
- [s0 U27-composer-no-dropped-letters](https://github.com/vikas53953/foo-agent/tree/1bffc8d80e2ae4a570a274195abc624d76d7dc52/real-ai/948fe18-claude/s0/2026-10-22T06-26-41-900Z-U27-composer-no-dropped-letters)
- [s1 J01-J02-first-run](https://github.com/vikas53953/foo-agent/tree/1bffc8d80e2ae4a570a274195abc624d76d7dc52/real-ai/948fe18-claude/s1/2026-10-22T06-21-10-213Z-J01-J02-first-run)
- [s1 B04-stop](https://github.com/vikas53953/foo-agent/tree/1bffc8d80e2ae4a570a274195abc624d76d7dc52/real-ai/948fe18-claude/s1/2026-10-22T06-22-00-938Z-B04-stop)
- [s1 B09-kit](https://github.com/vikas53953/foo-agent/tree/1bffc8d80e2ae4a570a274195abc624d76d7dc52/real-ai/948fe18-claude/s1/2026-10-22T06-23-04-877Z-B09-kit)
