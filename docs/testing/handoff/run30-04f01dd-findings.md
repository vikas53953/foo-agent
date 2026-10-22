# Real-AI run 30 on main 04f01dd (batch 2 + 3: #108 #116 #117 #123 #126 #127 #129)

Run https://github.com/vikas53953/foo-agent/actions/runs/39698459634, finished 01:02Z. Evidence: branch `evidence`, real-ai/04f01dd-claude/s0..s3/. Judged by the e2e thread from summary.json, thread.json, screenshots, app-log.jsonl and ai-turns.jsonl.

## Totals

54 journey runs. 44 with no failed hard step. 10 with a hard fail: 1 test bug (U23, fixed in #131), 1 not built (U01 Try again), 8 real or unproven (below).

## Asked-for items

| Item                                | Result                                                                                                                                                                                         | Evidence                                                                  |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| U26 crash relaunch (#108, CR-0036)  | **WORKS.** Killed foo's main process twice (reopen at once, and 1.5 s later); a foo window came back both times with the chat intact, 1 foo.exe left                                           | s1/…U26…/summary.json (crashRelaunch ok, fooProcs 1); 01-after-reopen.png |
| B08/B09 AI pages (#126)             | **WORKS.** All 7 kit asks answered; expense tracker page reached ready/kept (endState true). No "cut off"                                                                                      | s3/…B09-kit/summary.json step 13                                          |
| U23 AI page                         | **WORKS** (water tracker shown inline with Keep). Journey failed only because it looked for card-ai-page; the page is `ai-page` → test bug, fixed #131 (de877c76)                              | s2/…U23…/01-ai-page.png                                                   |
| U23 cross-talk (CR-0045)            | **FIXED.** No waiting job's card re-asked under the tracker                                                                                                                                    | s2/…U23…/thread.json                                                      |
| CR-0042 routine line                | **WORKS:** "I can't set up repeating checks yet. Ask me each time and I'll do it then."                                                                                                        | s2/…U15…/summary.json                                                     |
| CR-0043 dark mode by chat           | **WORKS but slightly wrong:** "Changed: Theme → Dark. Undo" and the theme went dark, but foo ALSO saved a memory "Prefers dark mode" (memory_review turn). Undo of the theme leaves the memory | s0/…U17…/01-dark.png, app-log memory.saved_said                           |
| CR-0044 electricity                 | **WORKS:** "Pay my electricity bill now" → "Which electricity company should I pay?" choice (BESCOM / Another)                                                                                 | s3/…U20…/thread.json                                                      |
| Pizza                               | plan card "Paying Domino's"                                                                                                                                                                    | s3/…U20…                                                                  |
| B04 / B10 / U25 with the new driver | **all pass.** B04 "Stopped. Nothing was booked, paid or sent."; B10 guard + Secret box; U25 honest flights card                                                                                | summaries                                                                 |
| U27 exact typing, memory (J17, U14) | pass                                                                                                                                                                                           | summaries                                                                 |

## Still broken / unproven

1. **B07 IRCTC ask → "I didn't get that"** (real). app-log: steer_check new → intake_kind=reply twice → empty → didn't get. A clear new ask classed as a reply. → queue/intent.
2. **Web news never gets sources** (J05, B03, R1 table ask). No SEARCH_BUSY now, but B03 ran ~28 step turns then `job.stuck.budget`; J05's job was still working when the journey ended (`job.waiting app_quit`). Many `prompt PROMPT_PLACEHOLDER_EMPTY` warnings (56 in B03, 32 in R1) — a step prompt is built with an empty slot, likely the search results. → web/search owner.
3. J10 hotel, J09 booking: plan cards fine; no Approve card because the driver never answers the choices (partial, as before).
4. J12 draft: Connect Gmail card (Gmail not in CI build) — expected, not a fail.
5. U01 Try again on a finished answer: NOT BUILT (04 §17.1).
6. U17: dark-mode ask also saved a memory (see table) → settings-by-chat owner.

## Screenshot spot-check of the 34 "pass" rows (01:45Z, 22 Oct)

The strict driver checks replies as text, so it passed kit replies whose block never rendered. After looking at the screenshots: **14 pass**, 4 fail or wrong, 16 partial.

- FAIL: chart (AT-340), map (AT-341), EMI calculator (AT-347). Each reply is text plus "Couldn't show part of this", with no widget (B09 01-emi, 02-map, 03-chart). Compare, form, timer and AI page rendered fine. This is the same render failure as run 21's R1 table, and #127 (CR-0046) did not fix it.
- WRONG: "thanks!" gets a red heart reaction, but AT-027 says 👍 (B01 01-thanks).
- PARTIAL: things a screenshot can't show (motion, sandbox, db/log), paths the journey didn't exercise, or no recovery card visible (AT-118). Notes per id are in docs/testing/real-ai-results.tsv.
- Driver gap: the kit steps should assert the block's test id (kit-chart, kit-map, kit-calc) and fail on "Couldn't show part of this".
