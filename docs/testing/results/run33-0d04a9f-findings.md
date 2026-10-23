# Real-AI run 33 on main 0d04a9f

[Run 39710797010](https://github.com/vikas53953/foo-agent/actions/runs/39710797010) completed successfully on `0d04a9f9105e42aef0b4a22238285a9007635c3e`. All 54 journey folders and 302 screenshots were inspected with summaries, thread dumps where present, app logs and AI-turn logs. A green workflow and `ok: true` are not acceptance.

## Totals

54 journey runs; 42 have no hard driver failure and 12 have at least one. These are driver counts, not feature pass counts. Soft failures, inherited cards and unexercised states prevent treating the 42 as passes. Per-feature judgments and current-main totals are in `real-ai-results.tsv` and the generated matrix.

Evidence pins: [s0](https://github.com/vikas53953/foo-agent/tree/1b9e64c381c1554b4d4fed36d527ffa36cf149dd/real-ai/0d04a9f-claude/s0), [s1](https://github.com/vikas53953/foo-agent/tree/3b162cce22bbe26c63c0a4a8e3dcb37f188cb94c/real-ai/0d04a9f-claude/s1), [s2](https://github.com/vikas53953/foo-agent/tree/b849ae668a5f60ebe9921e3463cc82a1353357ff/real-ai/0d04a9f-claude/s2), [s3](https://github.com/vikas53953/foo-agent/tree/3b162cce22bbe26c63c0a4a8e3dcb37f188cb94c/real-ai/0d04a9f-claude/s3). Each contains the corresponding journey logs and screenshots. No shard contains `tool-calls.jsonl`; per-tool outcomes and dollar costs remain unavailable.

## Asked-for items

| Item                                   | Judgment                                                                                                                                                                                                             | Evidence                                                                                                                                                                       |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CR-0050 calculator/map/chart rendering | Widgets visibly render and their DOM kit identifiers are present. This fixes the narrow missing-widget symptom. Calculator recomputation, all chart variants and full map behavior remain partial; map pins overlap. | [B09 screenshots and thread](https://github.com/vikas53953/foo-agent/tree/3b162cce22bbe26c63c0a4a8e3dcb37f188cb94c/real-ai/0d04a9f-claude/s3/2026-10-22T02-36-41-836Z-B09-kit) |
| R1 rich table                          | Required table never appears; later trip answer is plain text. No current proof of the R1 table path.                                                                                                                | [R1 evidence](https://github.com/vikas53953/foo-agent/tree/b849ae668a5f60ebe9921e3463cc82a1353357ff/real-ai/0d04a9f-claude/s2/2026-10-22T02-36-15-722Z-R1-rich)                |
| Web sources                            | B03 ends `job.stuck.budget`, sources/citations count zero. J05 also never reaches a sourced answer.                                                                                                                  | [B03 evidence](https://github.com/vikas53953/foo-agent/tree/3b162cce22bbe26c63c0a4a8e3dcb37f188cb94c/real-ai/0d04a9f-claude/s1/2026-10-22T02-36-16-645Z-B03-web-local)         |
| J09/J10 approval                       | Partial: booking choice not completed; hotel reaches Booking.com captcha/Take over, not approval. The hotel screenshot does not establish a missing choice-click cause.                                              | [J10 evidence](https://github.com/vikas53953/foo-agent/tree/1b9e64c381c1554b4d4fed36d527ffa36cf149dd/real-ai/0d04a9f-claude/s0/2026-10-22T02-36-24-008Z-J10-hotel)             |
| U17 theme                              | Dark theme and appearance row visible; Undo path times out. No claim that settings/memory separation is fixed.                                                                                                       | [U17 evidence](https://github.com/vikas53953/foo-agent/tree/1b9e64c381c1554b4d4fed36d527ffa36cf149dd/real-ai/0d04a9f-claude/s0/2026-10-22T02-59-09-835Z-U17-settings-by-chat)  |
| Memory and basic replies               | J17 source/date/recall works; U14 exercises edit/forget/Undo. B01 long reply retains its list and avoids filler. Only the exercised acceptance criteria are credited.                                                | [J17 evidence](https://github.com/vikas53953/foo-agent/tree/3b162cce22bbe26c63c0a4a8e3dcb37f188cb94c/real-ai/0d04a9f-claude/s1/2026-10-22T02-35-45-225Z-J17-memory)            |

## Still broken or unproven

1. AT-027 is wrong overall: B01 shows a red heart; U02 on the same build shows thumbs-up. The same variation exists on 04f01dd, so no deterministic merge changing the emoji was established. Reserved for Vikas; no fix.
2. J08 returns prose with no Choice card. U12 Something else ends in an error with `PROTOCOL_INVALID`; B08 bank request is folded into another job instead of reaching the requested handback.
3. U23 uses the obsolete `card-ai-page` selector; an AI page is visible. This is a journey defect already addressed by PR #131, not proof of a page-rendering failure.
4. U15 routines, B13 catch_up and blank paused settings/screens are not built, not product failures. J12 cannot reach Draft without Gmail. First-run tests exercise Claude only, not the full two-provider AT-005 requirement.
5. Later journeys inherit earlier jobs and cards. Unentered helper, secret, approval and window flows stay partial. Static screenshots do not prove motion timing, restart preconditions, network isolation or persistence internals.
6. AI-turn records identify plan billing but contain no dollar-cost receipt. Cost is unknown, not zero; no new paid run was started during this review.

## Screenshot spot-check

Root review confirmed B09 EMI/map/chart widgets, B01 long-reply layout and J17 source/date. Independent shard reviews inspected every PNG. Render-only success does not promote an entire interactive AT; the ledger retains partial results where input changes, submission, elapsed timers or security paths were not exercised.
