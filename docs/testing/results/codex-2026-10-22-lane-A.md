# Lane A — 2026-10-22 changes

Base: `7b5f435` (merge of `origin/main 0d04a9f`). No real-AI workflow run was started; no cost or current-main real-AI result is claimed.

| Feature or check | Test type | Result | Build sha | Evidence link | Note |
| --- | --- | --- | --- | --- | --- |
| Journey contract validator | Vitest, one worker | pass | working tree | local `pnpm vitest run test/unit/real-pc-journeys.test.ts --maxWorkers=1 --pool=threads` | 4/4 tests pass after the journey changes |
| Group R journey coverage | JSON contract | pass | working tree | `test/real-pc/journeys/R-*.json` | 8 files, 33 unique Group R AT ids; clean, typo, Hinglish variants; Hindi/Punjabi added for AT-366, AT-364, AT-424, AT-425, AT-427 |
| Five-minute smoke | JSON contract | pass | working tree | `test/real-pc/journeys/LaneA-smoke-5min.json` | Every smoke send now has a checked waitReply end state |
| Real-AI Way 1 | Windows workflow | could not run | — | — | Driver-choice fix is pending in the separate driver lane; approval-dependent journeys are authored but unrun and unclaimed |
| Journey-list wiring | lead-owned file | could not do | — | — | `test/real-pc/journeys.txt` intentionally unchanged; lead branch owns the list |
| Legacy baseline strict audit | static audit | blocked outside Lane A | `7b5f435` | existing B/J/U/R1 journeys | Preserved unchanged; exact send-step blockers are listed below |

## RED → GREEN proof

- RED commit: `62a20830` — validator-only. It failed on the six Group C manifests and smoke sends at steps 8, 10 and 12.
- GREEN working-tree proof: focused validator output was `4 passed`; the journey/deletion/report changes are ready for the GREEN commit.
- The six rejected manifests removed: `LaneA-ai-pages.json`, `LaneA-approvals.json`, `LaneA-jobs-core.json`, `LaneA-kit-components.json`, `LaneA-motion-and-face.json`, `LaneA-signin-safety.json`.

## Legacy baseline blockers found by strict audit

These existing files have send steps whose next step is `wait` or a prose-only `waitReply`; they were not edited:

`B01-chat-rules [0,3]`; `B02-choice [0,5]`; `B03-web-local [0]`; `B04-stop [0,4]`; `B05-restart [0]`; `B06-booking-options [0]`; `B07-live [0]`; `B08-bank [0]`; `B12-languages [0,2,4]`; `B13-no-apps-honesty [0,3]`; `B14-restart-mid-reply [0,5]`; `J05-web [0]`; `J07-chat [0,2,4]`; `J08-choice [0]`; `J09-J18-booking [0]`; `J10-hotel [0]`; `J12-draft [0]`; `J17-memory [0,7]`; `R1-rich [0,6]`; `U01-bubble-menu [1,19]`; `U02-reactions-thanks [1,3]`; `U03-select-delete [1]`; `U04-find-in-chat [1]`; `U08-rich-text [1,4,6]`; `U09-plan-checklist [1]`; `U10-plan-change-stop [1,5]`; `U11-approval-states [1,9]`; `U12-choice-variants [1,4,6,10]`; `U14-memory [1,4]`; `U15-routines [1]`; `U20-errors-honesty [1,3,5]`; `U21-window-dialogs [1]`; `U22-face-polish [1]`; `U25-anatomy-composer [32]`.

No baseline journey, source/spec/golden/workflow/secret, or driver file was changed.
