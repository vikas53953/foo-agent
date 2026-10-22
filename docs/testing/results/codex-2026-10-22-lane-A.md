# Lane A — 2026-10-22 strict validation

Status: **BLOCKED**. The strict all-files validator is intentionally red because unchanged baseline journeys violate §11.3.7. This branch is not GREEN or ready.

Base: `7b5f435` (merge of `origin/main 0d04a9f`). No real-AI workflow run, cost, or current-main real-AI result is claimed.

## Changes in scope

- `62a20830`: validator-only RED commit.
- `94480181`: journey changes: six rejected Lane A manifests removed, corrected smoke, eight `R-*.json` journeys covering all 33 Group R IDs, and the initial report.
- Correction pending: strict validator now checks every journey file, accepts a following regex `expectText`, validates `expectKit` against current `TID`, and requires each covered ID to name a checked step.
- No baseline B/J/U/R1 journey, source/spec/golden/workflow/secret, driver, or `journeys.txt` file was edited.

## Focused validator evidence

Command:

`pnpm vitest run test/unit/real-pc-journeys.test.ts --maxWorkers=1 --pool=threads`

Result: **2 passed, 2 failed**.

Passing checks: all referenced `tid`, `expectTid`, `expectKit`, and CSS `data-testid` values are in current `TID`; no Group C coverage remains; owned R coverage remains within Group R.

Failing check 1 — `requires an end-state check after every send in every journey`:

```
B01-chat-rules [0,3]
B02-choice [0,5]
B04-stop [0,4]
B05-restart [0]
B06-booking-options [0]
B07-live [0]
B08-bank [0]
B12-languages [0,2,4]
B13-no-apps-honesty [0,3]
B14-restart-mid-reply [0,5]
J07-chat [0,2,4]
J08-choice [0]
J09-J18-booking [0]
J10-hotel [0]
J12-draft [0]
J17-memory [0,7]
R1-rich [0,6]
U01-bubble-menu [1]
U02-reactions-thanks [1,3]
U04-find-in-chat [1]
U08-rich-text [1,4,6]
U09-plan-checklist [1]
U10-plan-change-stop [1,5]
U11-approval-states [1,9]
U12-choice-variants [1,4,6,10]
U14-memory [1]
U15-routines [1]
U20-errors-honesty [1,3,5]
U21-window-dialogs [1]
U22-face-polish [1]
```

Failing check 2 — `ties every covered AT to a checked proof step`:

```
U01-bubble-menu: C.3 Your bubble + status badge; C.3 foo / helper bubble; C.3 Reactions; AT-027
U02-reactions-thanks: C.3 Reactions; AT-027
U03-select-delete: C.3 Your bubble + status badge; C.2 Headers (left + main)
U04-find-in-chat: C.5 Search palette + find in chat
U05-chat-list: C.2 Left shell: chat list; C.2 Filter chips + "Search chats" box
U06-header-panel: C.2 Headers (left + main); C.2 Right shell; C.2 Main shell + banner strip
U07-composer: C.3 Composer
U08-rich-text: C.3 foo / helper bubble; C.9 Rich replies
U09-plan-checklist: C.4 Plan (C11); C.4 Checklist (C2) + link card; C.4 Proof chip + receipt footer (C12)
U10-plan-change-stop: C.4 Plan (C11); C.4 Checklist (C2) + link card; C.2 Right shell
U11-approval-states: C.4 Approval (C4); C.4 Choice (C3)
U12-choice-variants: C.4 Choice (C3); C.3 Reactions; AT-035
U13-secret-box: C.4 Secret box (C7) + code box + card form; C.4 Paste catcher (C8)
U14-memory: C.4 Memory chip (C14); C.5 Memory page
U15-routines: C.4 Routine (C13); C.5 Routines screen
U16-settings-all: C.5 Settings
U17-settings-by-chat: C.5 Settings; C.8 Quiet premium polish
U18-new-helper-group: C.4 New helper / New group dialogs (06, not cards); C.5 Helper profile / group
U19-screens: C.5 Helper profile / group; C.2 Main shell + banner strip
U20-errors-honesty: C.4 Error (C16) / stuck / recovery; C.4 Connect (C10) + WhatsApp QR
U21-window-dialogs: C.5 Dialogs; C.6 Start at login, close to tray
U22-face-polish: C.7.1; C.7.4; C.8 Quiet premium polish
U23-ai-page-chips: C.9 Rich replies
U25-anatomy-composer: BP-ANAT-*; BP-APP-*; BP-COMP-*; BP-MSG-04
U26-crash-reopen: crash recovery; single instance
U27-composer-no-dropped-letters: C.4 Composer; AT-365
```

No baseline files were changed to make this pass. The lead must resolve these outside Lane A or accept the strict validator as a blocked gate.

## Remaining blockers

- Way 1 real-AI run: not started; driver-choice work is a separate pending lane. Approval journeys are authored only.
- `test/real-pc/journeys.txt`: lead-owned; still needs the eight R IDs (and smoke ID if the lead wants to wire it).
