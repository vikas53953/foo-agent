# Real-AI focused review: run 39900827513

- **Run:** [39900827513](https://github.com/vikas53953/foo-agent/actions/runs/39900827513)
- **App SHA:** `8a85fbe1005cfc234c0dc3267bf4720a187c6734`
- **Immutable evidence commit:** `1701e73d7d2dda7fbd59b76b0cb3ae217dd3f988`
- **Evidence root:** `real-ai/8a85fbe-claude/s0/`
- **Local evidence:** `C:\Users\vikasmit\Downloads\foo\run39900827513-evidence-files\real-ai\8a85fbe-claude\s0`
- **Scope:** J07, R1, R-kit-2, B02, U12. This is a focused real-AI run and is not current-main acceptance evidence. All AI-turn records report provider `claude-cli`, outcome `ok`; that does not establish feature acceptance. No historical provider/parser cause is inferred.

## Execution integrity

Strict initial-step clean means the original numbered execution rows contain no `ok:false`; later summary mutation cannot erase an initial failure. `summary-results clean` is the final `summary.json.results` view. `summary-clean` is `summary.failed == 0`.

| Journey             | Initial numbered steps | Initial strict-clean | Summary-results clean | Summary-clean | Initial false rows | Summary false rows | waitReply / empty lastReply |
| ------------------- | ---------------------: | -------------------: | --------------------: | ------------: | -----------------: | -----------------: | --------------------------: |
| J07-chat            |                      7 |                 PASS |                  PASS |          PASS |                  0 |                  0 |                       3 / 0 |
| R1-rich             |                      9 |                 FAIL |                  FAIL |          FAIL |                  2 |                  2 |                       2 / 0 |
| R-kit-2             |                     63 |                 FAIL |                  FAIL |          FAIL |                 23 |                 17 |                      21 / 6 |
| B02-choice          |                      8 |                 FAIL |                  FAIL |          FAIL |                  1 |                  1 |                       2 / 0 |
| U12-choice-variants |                     17 |                 FAIL |                  FAIL |          FAIL |                  3 |                  3 |                       4 / 0 |
| **Total**           |                **104** |        **1/5 clean** |         **1/5 clean** | **1/5 clean** |             **29** |             **23** |                  **32 / 6** |

The six empty replies are all in R-kit-2. The gap between R-kit-2 initial false rows (23) and summary false rows (17) is late summary mutation; it is not a clean execution.

## Per-journey / AT judgment

### J07-chat

- **J07 baseline reply predicates: PASS.** All 7 numbered rows are clean; three waits each produced one nonempty new bubble. The inspected replies cover greeting, capability/quick-action presentation, and the VPN answer.
- Evidence: [summary.json](https://github.com/vikas53953/foo-agent/blob/1701e73d7d2dda7fbd59b76b0cb3ae217dd3f988/real-ai/8a85fbe-claude/s0/2026-10-23T04-37-08-339Z-J07-chat/summary.json), [log.jsonl](https://github.com/vikas53953/foo-agent/blob/1701e73d7d2dda7fbd59b76b0cb3ae217dd3f988/real-ai/8a85fbe-claude/s0/2026-10-23T04-37-08-339Z-J07-chat/log.jsonl), [01-hi.png](https://github.com/vikas53953/foo-agent/blob/1701e73d7d2dda7fbd59b76b0cb3ae217dd3f988/real-ai/8a85fbe-claude/s0/2026-10-23T04-37-08-339Z-J07-chat/01-hi.png), [02-what-can-you-do.png](https://github.com/vikas53953/foo-agent/blob/1701e73d7d2dda7fbd59b76b0cb3ae217dd3f988/real-ai/8a85fbe-claude/s0/2026-10-23T04-37-08-339Z-J07-chat/02-what-can-you-do.png), [03-vpn.png](https://github.com/vikas53953/foo-agent/blob/1701e73d7d2dda7fbd59b76b0cb3ae217dd3f988/real-ai/8a85fbe-claude/s0/2026-10-23T04-37-08-339Z-J07-chat/03-vpn.png).

### R1-rich

- **Plan card + Go action: PASS as visibly exercised.** The plan card is visible and `card-plan-go` was found/clicked.
- **Required phone table completion: FAIL/partial.** After 150 seconds the required `bubble-table` check found 0; the screenshot still shows a working web job/checklist rather than the final table.
- **Jaipur/trip response: PARTIAL.** Relevant Jaipur content appears in the combined reply, but the final wait had two new bubbles (late phone table plus Jaipur), so the strict wait predicate failed. Do not infer parser/provider causality.
- Evidence: [summary.json](https://github.com/vikas53953/foo-agent/blob/1701e73d7d2dda7fbd59b76b0cb3ae217dd3f988/real-ai/8a85fbe-claude/s0/2026-10-23T04-37-52-673Z-R1-rich/summary.json), [log.jsonl](https://github.com/vikas53953/foo-agent/blob/1701e73d7d2dda7fbd59b76b0cb3ae217dd3f988/real-ai/8a85fbe-claude/s0/2026-10-23T04-37-52-673Z-R1-rich/log.jsonl), [02-table-after-go.png](https://github.com/vikas53953/foo-agent/blob/1701e73d7d2dda7fbd59b76b0cb3ae217dd3f988/real-ai/8a85fbe-claude/s0/2026-10-23T04-37-52-673Z-R1-rich/02-table-after-go.png), [03-trip.png](https://github.com/vikas53953/foo-agent/blob/1701e73d7d2dda7fbd59b76b0cb3ae217dd3f988/real-ai/8a85fbe-claude/s0/2026-10-23T04-37-52-673Z-R1-rich/03-trip.png).

### R-kit-2

- **AT-350 TimePick: PARTIAL / not completed.** Clean variant returned “Connect Calendar / Gmail isn’t available”; typo and Hinglish variants rendered TimePick, but slot click/wait completion failed. No confirmation was proven. This does not prove the product feature is not built.
- **AT-352 live Sensex: PARTIAL.** Only the Hinglish path visibly shows a live card with `Data as of`, Refresh, and Keep; clean/messy paths failed before a live card. No full refresh contract was proven.
- **AT-355 action round trip: NOT EXERCISED / MISSING.** Calculator cards and values are visible, but no Button action/`kit.action` round trip was performed.
- **AT-368 refresh: FAIL for the exercised path.** All three cards and matching `kit-live-refresh` controls were visible/clickable, but every post-refresh wait produced no new bubble; screenshots show the existing card and a “last try didn’t get through” state. No refresh update was proven.
- **AT-369 Keep/files persistence: PARTIAL / unproven.** Cards and Keep controls were visible; two clicks succeeded and one timed out, but all `files-kept-item` checks found 0. No saved-row/reopen proof was obtained.
- Evidence: [summary.json](https://github.com/vikas53953/foo-agent/blob/1701e73d7d2dda7fbd59b76b0cb3ae217dd3f988/real-ai/8a85fbe-claude/s0/2026-10-23T04-41-10-523Z-R-kit-2/summary.json), [log.jsonl](https://github.com/vikas53953/foo-agent/blob/1701e73d7d2dda7fbd59b76b0cb3ae217dd3f988/real-ai/8a85fbe-claude/s0/2026-10-23T04-41-10-523Z-R-kit-2/log.jsonl), [03-at-350-messy-typo.png](https://github.com/vikas53953/foo-agent/blob/1701e73d7d2dda7fbd59b76b0cb3ae217dd3f988/real-ai/8a85fbe-claude/s0/2026-10-23T04-41-10-523Z-R-kit-2/03-at-350-messy-typo.png), [05-at-350-Hinglish.png](https://github.com/vikas53953/foo-agent/blob/1701e73d7d2dda7fbd59b76b0cb3ae217dd3f988/real-ai/8a85fbe-claude/s0/2026-10-23T04-41-10-523Z-R-kit-2/05-at-350-Hinglish.png), [11-at-352-Hinglish.png](https://github.com/vikas53953/foo-agent/blob/1701e73d7d2dda7fbd59b76b0cb3ae217dd3f988/real-ai/8a85fbe-claude/s0/2026-10-23T04-41-10-523Z-R-kit-2/11-at-352-Hinglish.png), [12-at-368-clean-live-card.png](https://github.com/vikas53953/foo-agent/blob/1701e73d7d2dda7fbd59b76b0cb3ae217dd3f988/real-ai/8a85fbe-claude/s0/2026-10-23T04-41-10-523Z-R-kit-2/12-at-368-clean-live-card.png), [13-at-368-messy-typo-live-card.png](https://github.com/vikas53953/foo-agent/blob/1701e73d7d2dda7fbd59b76b0cb3ae217dd3f988/real-ai/8a85fbe-claude/s0/2026-10-23T04-41-10-523Z-R-kit-2/13-at-368-messy-typo-live-card.png), [14-at-368-Hinglish-live-card.png](https://github.com/vikas53953/foo-agent/blob/1701e73d7d2dda7fbd59b76b0cb3ae217dd3f988/real-ai/8a85fbe-claude/s0/2026-10-23T04-41-10-523Z-R-kit-2/14-at-368-Hinglish-live-card.png), [15-at-355-clean.png](https://github.com/vikas53953/foo-agent/blob/1701e73d7d2dda7fbd59b76b0cb3ae217dd3f988/real-ai/8a85fbe-claude/s0/2026-10-23T04-41-10-523Z-R-kit-2/15-at-355-clean.png), [18-at-369-clean.png](https://github.com/vikas53953/foo-agent/blob/1701e73d7d2dda7fbd59b76b0cb3ae217dd3f988/real-ai/8a85fbe-claude/s0/2026-10-23T04-41-10-523Z-R-kit-2/18-at-369-clean.png), [19-at-369-messy-typo.png](https://github.com/vikas53953/foo-agent/blob/1701e73d7d2dda7fbd59b76b0cb3ae217dd3f988/real-ai/8a85fbe-claude/s0/2026-10-23T04-41-10-523Z-R-kit-2/19-at-369-messy-typo.png), [20-error-step54.png](https://github.com/vikas53953/foo-agent/blob/1701e73d7d2dda7fbd59b76b0cb3ae217dd3f988/real-ai/8a85fbe-claude/s0/2026-10-23T04-41-10-523Z-R-kit-2/20-error-step54.png), [21-at-369-Hinglish.png](https://github.com/vikas53953/foo-agent/blob/1701e73d7d2dda7fbd59b76b0cb3ae217dd3f988/real-ai/8a85fbe-claude/s0/2026-10-23T04-41-10-523Z-R-kit-2/21-at-369-Hinglish.png).

### B02-choice

- **AT-032: FAIL.** The visible Choice card has 4 options; the contract requires exactly 3 plus “Something else…” and Skip. The DOM/check also found 4 options.
- **AT-035 typed “2”: PASS for the actual state transition, despite the journey oracle row being false.** The thread records the first card answered as “Gym or treadmill” and then a follow-up card. This is state evidence; do not use the false latest-bubble text predicate as a product failure.
- **AT-288: NOT EXERCISED / MISSING.** No three-question pager, Back action, or focused 1–4 keyboard evidence appears.
- Evidence: [summary.json](https://github.com/vikas53953/foo-agent/blob/1701e73d7d2dda7fbd59b76b0cb3ae217dd3f988/real-ai/8a85fbe-claude/s0/2026-10-23T04-59-08-992Z-B02-choice/summary.json), [log.jsonl](https://github.com/vikas53953/foo-agent/blob/1701e73d7d2dda7fbd59b76b0cb3ae217dd3f988/real-ai/8a85fbe-claude/s0/2026-10-23T04-59-08-992Z-B02-choice/log.jsonl), [thread.json](https://github.com/vikas53953/foo-agent/blob/1701e73d7d2dda7fbd59b76b0cb3ae217dd3f988/real-ai/8a85fbe-claude/s0/2026-10-23T04-59-08-992Z-B02-choice/thread.json), [01-choice.png](https://github.com/vikas53953/foo-agent/blob/1701e73d7d2dda7fbd59b76b0cb3ae217dd3f988/real-ai/8a85fbe-claude/s0/2026-10-23T04-59-08-992Z-B02-choice/01-choice.png), [02-typed-2.png](https://github.com/vikas53953/foo-agent/blob/1701e73d7d2dda7fbd59b76b0cb3ae217dd3f988/real-ai/8a85fbe-claude/s0/2026-10-23T04-59-08-992Z-B02-choice/02-typed-2.png).

### U12-choice-variants

- **AT-035 reaction branch: PASS.** Reaction clicks succeeded, the `bubble-reaction` check found 1, and the thread records the weekend card answered as “Cubbon Park walk and brunch.”
- **AT-035 typed “the second one” branch: PARTIAL / not proven.** The initial card was already answered; the typed message led to a new Choice card and did not prove a typed collapse/selection on that same card. Do not infer a product defect from this sequencing.
- **C.4 Choice card: PARTIAL / unproven.** Screens show 3 options plus Best fit/Something else/Skip, but the initial `waitReply` predicate is false and no independent matching-TID DOM pass exists; widget pass therefore cannot be claimed. The Something-else/own-answer path produced a visible Foo reply.
- Evidence: [summary.json](https://github.com/vikas53953/foo-agent/blob/1701e73d7d2dda7fbd59b76b0cb3ae217dd3f988/real-ai/8a85fbe-claude/s0/2026-10-23T04-59-42-230Z-U12-choice-variants/summary.json), [log.jsonl](https://github.com/vikas53953/foo-agent/blob/1701e73d7d2dda7fbd59b76b0cb3ae217dd3f988/real-ai/8a85fbe-claude/s0/2026-10-23T04-59-42-230Z-U12-choice-variants/log.jsonl), [thread.json](https://github.com/vikas53953/foo-agent/blob/1701e73d7d2dda7fbd59b76b0cb3ae217dd3f988/real-ai/8a85fbe-claude/s0/2026-10-23T04-59-42-230Z-U12-choice-variants/thread.json), [01-choice.png](https://github.com/vikas53953/foo-agent/blob/1701e73d7d2dda7fbd59b76b0cb3ae217dd3f988/real-ai/8a85fbe-claude/s0/2026-10-23T04-59-42-230Z-U12-choice-variants/01-choice.png), [02-choice-card.png](https://github.com/vikas53953/foo-agent/blob/1701e73d7d2dda7fbd59b76b0cb3ae217dd3f988/real-ai/8a85fbe-claude/s0/2026-10-23T04-59-42-230Z-U12-choice-variants/02-choice-card.png), [03-typed-pick.png](https://github.com/vikas53953/foo-agent/blob/1701e73d7d2dda7fbd59b76b0cb3ae217dd3f988/real-ai/8a85fbe-claude/s0/2026-10-23T04-59-42-230Z-U12-choice-variants/03-typed-pick.png), [04-choice-2.png](https://github.com/vikas53953/foo-agent/blob/1701e73d7d2dda7fbd59b76b0cb3ae217dd3f988/real-ai/8a85fbe-claude/s0/2026-10-23T04-59-42-230Z-U12-choice-variants/04-choice-2.png), [05-something-else.png](https://github.com/vikas53953/foo-agent/blob/1701e73d7d2dda7fbd59b76b0cb3ae217dd3f988/real-ai/8a85fbe-claude/s0/2026-10-23T04-59-42-230Z-U12-choice-variants/05-something-else.png), [06-own-answer.png](https://github.com/vikas53953/foo-agent/blob/1701e73d7d2dda7fbd59b76b0cb3ae217dd3f988/real-ai/8a85fbe-claude/s0/2026-10-23T04-59-42-230Z-U12-choice-variants/06-own-answer.png).

## PNG inspection inventory

Every PNG in the five execution folders was opened with `view_image` (35 total):

- J07-chat (3): `01-hi.png`, `02-what-can-you-do.png`, `03-vpn.png`.
- R1-rich (3): `01-table.png`, `02-table-after-go.png`, `03-trip.png`.
- R-kit-2 (21): `01-at-350-clean.png`, `02-error-step2.png`, `03-at-350-messy-typo.png`, `04-error-step6.png`, `05-at-350-Hinglish.png`, `06-error-step10.png`, `07-at-352-clean.png`, `08-error-step14.png`, `09-at-352-messy-typo.png`, `10-error-step18.png`, `11-at-352-Hinglish.png`, `12-at-368-clean-live-card.png`, `13-at-368-messy-typo-live-card.png`, `14-at-368-Hinglish-live-card.png`, `15-at-355-clean.png`, `16-at-355-messy-typo.png`, `17-at-355-Hinglish.png`, `18-at-369-clean.png`, `19-at-369-messy-typo.png`, `20-error-step54.png`, `21-at-369-Hinglish.png`.
- B02-choice (2): `01-choice.png`, `02-typed-2.png`.
- U12-choice-variants (6): `01-choice.png`, `02-choice-card.png`, `03-typed-pick.png`, `04-choice-2.png`, `05-something-else.png`, `06-own-answer.png`.

`tool-calls` artifacts were absent in all five folders. Read summary/thread/app-log/ai-turns where present; R-kit-2 had no thread file. No acceptance conclusion is drawn from workflow success or driver `ok=true` alone.
