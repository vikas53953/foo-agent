> 23 October correction: the four-option observation below is preserved, but its product-failure classification is withdrawn. Spec05-cards-1 section5.3 permits2–4 options; AT032 applies only when foo has3. B02 did not establish that precondition. AT032 remains unproven; no new pass is claimed.

# Run 39901848029 — B02-choice review

## Provenance

- Workflow: [run 39901848029](https://github.com/vikas53953/foo-agent/actions/runs/39901848029)
- Tested app branch: `codex/b02-verification-2026-10-23`
- Tested app SHA: `4ba14bdf4ecc6791759b2cdb2ef9124ed38413c7`
- Immutable evidence commit: `3c4c0dbd694f577a8a2705d94a38bdafd870cb1b`
- Evidence root: [real-ai/4ba14bd-claude/s0/2026-10-23T04-48-08-933Z-B02-choice](https://github.com/vikas53953/foo-agent/tree/3c4c0dbd694f577a8a2705d94a38bdafd870cb1b/real-ai/4ba14bd-claude/s0/2026-10-23T04-48-08-933Z-B02-choice)
- Journey source at tested SHA: [B02-choice.json](https://github.com/vikas53953/foo-agent/blob/4ba14bdf4ecc6791759b2cdb2ef9124ed38413c7/test/real-pc/journeys/B02-choice.json)

## Evidence inventory

Two PNGs and six JSONL/JSON files were downloaded and inspected. No `tool-calls` file was present for this journey. Both PNGs were viewed directly:

- [01-choice.png](https://github.com/vikas53953/foo-agent/blob/3c4c0dbd694f577a8a2705d94a38bdafd870cb1b/real-ai/4ba14bd-claude/s0/2026-10-23T04-48-08-933Z-B02-choice/01-choice.png): the chat viewport shows the running-shoes request and the “Waiting for your answer” strip; the choice card itself is below the visible viewport.
- [02-typed-2.png](https://github.com/vikas53953/foo-agent/blob/3c4c0dbd694f577a8a2705d94a38bdafd870cb1b/real-ai/4ba14bd-claude/s0/2026-10-23T04-48-08-933Z-B02-choice/02-typed-2.png): user bubble `2` and the next visible choice card, “What's your shoe size (UK)?”, with four options, `BEST FIT`, “Something else…”, and `Skip`.

Paired machine evidence:

- [summary.json](https://github.com/vikas53953/foo-agent/blob/3c4c0dbd694f577a8a2705d94a38bdafd870cb1b/real-ai/4ba14bd-claude/s0/2026-10-23T04-48-08-933Z-B02-choice/summary.json)
- [log.jsonl](https://github.com/vikas53953/foo-agent/blob/3c4c0dbd694f577a8a2705d94a38bdafd870cb1b/real-ai/4ba14bd-claude/s0/2026-10-23T04-48-08-933Z-B02-choice/log.jsonl)
- [thread.json](https://github.com/vikas53953/foo-agent/blob/3c4c0dbd694f577a8a2705d94a38bdafd870cb1b/real-ai/4ba14bd-claude/s0/2026-10-23T04-48-08-933Z-B02-choice/thread.json)
- [app-log.jsonl](https://github.com/vikas53953/foo-agent/blob/3c4c0dbd694f577a8a2705d94a38bdafd870cb1b/real-ai/4ba14bd-claude/s0/2026-10-23T04-48-08-933Z-B02-choice/app-log.jsonl)
- [ai-turns.jsonl](https://github.com/vikas53953/foo-agent/blob/3c4c0dbd694f577a8a2705d94a38bdafd870cb1b/real-ai/4ba14bd-claude/s0/2026-10-23T04-48-08-933Z-B02-choice/ai-turns.jsonl)
- [thread-raw.json](https://github.com/vikas53953/foo-agent/blob/3c4c0dbd694f577a8a2705d94a38bdafd870cb1b/real-ai/4ba14bd-claude/s0/2026-10-23T04-48-08-933Z-B02-choice/thread-raw.json)

## Strict initial-step gate

- `kit/app SHA`: `4ba14bdf4ecc6791759b2cdb2ef9124ed38413c7` (this run only; evidence is branch/run scoped).
- Numbered B02 steps present: `0, 1, 2, 3, 4, 5, 6, 7`.
- Strict initial numbered-step result: **CLEAN**; failed numbered step indices: `[]`.
- This CLEAN result excludes auxiliary `launch`, `appLog`, and `aiTurns` records. The app-log `DRAFT_TICK_FAILED` is preserved below and does not change the numbered-step result.

## AT judgment

| AT     | Result                               | Evidence and boundary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AT-032 | **FAIL**                             | The paired step-1 reply and DOM checks report four numbered options (`1`–`4`) plus “Something else…” and “Skip”; the spec requires exactly three numbered options plus those two controls, with option 1 marked “Best fit”. The observed card therefore violates the exact predicate. The first PNG does not show the card surface in the viewport; the option count is preserved in `summary.json`/`log.jsonl` and the journey's DOM checks (`found: 1`, `found: 4`).                                                                                 |
| AT-035 | **PASS (bounded typed-2 assertion)** | Yes: the exact journey `expectJs` at step 6 passed (`ok: true`). It verifies the latest user row is exactly `2`, finds the previously recorded card by the same DOM card id, requires `data-card-state="answered"`, and compares the external summary after `→` with the saved second option. `thread.json` independently records `What will you mainly use the running shoes for? → Gym and treadmill`, then user `2`, then a new asking shoe-size card. This proves the typed `2` path in this journey; it does not prove the `2️⃣` reaction variant. |
| AT-288 | **PARTIAL / NOT EXERCISED**          | This journey does not exercise the three-question pager, `1 of 3`, Back control, row advance timing, or the full key behavior. The visible next card is evidence of a follow-up question only, not the AT-288 contract.                                                                                                                                                                                                                                                                                                                                |

## Execution notes and limitations

`summary.json` reports 8 steps, `failed: 0`, and `blocked: 0`; all two Claude CLI intake turns have `outcome: "ok"`. These are journey execution results, not a blanket product-acceptance result. The paired app log preserves one incidental `drafts:DRAFT_TICK_FAILED` `TypeError` after the journey; it is not tied by this run to the B02 choice assertion. No cost receipt is present (`billing: "plan"` in `ai-turns.jsonl`), and `thread-raw.json` is empty.
