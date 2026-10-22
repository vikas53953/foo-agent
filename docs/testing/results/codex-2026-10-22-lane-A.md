# Lane A — 2026-10-22 strict validation

Status: **BLOCKED**. The strict all-files validator is intentionally red because unchanged baseline journeys violate §11.3.7. The real-AI workflow completed, but the owned R journeys have runtime failures recorded below. This branch is not GREEN or ready.

Base: `7b5f435` (merge of `origin/main 0d04a9f`). The workflow tested head `9f429f8022c6c7b7ba989463ccbc2390b0fd5f6d` (`9f429f8`), which includes the owned journey repair `a7a04fac`, report/dispatch commit `0578abe0`, and root-owned concurrency commit `9f429f80`. The earlier dispatch `39726084968` was canceled before execution. Current dispatch `39727432127` completed its four Windows jobs successfully; journey-level failures remain and are not treated as workflow green.

Dispatch inputs: `ref=codex/lane-a-2026-10-22`, `journeys=R-ai-pages R-approvals R-chat-rules R-dark R-jobs R-kit-1 R-kit-2 R-reply-area`, `max_journeys=1000`, `shards=4`, `ai=claude`, `model=claude-sonnet-5-5`. No cost fields were present in the workflow and no cost is claimed.

## Changes in scope

- `62a20830`: validator-only RED commit.
- `94480181`: journey changes: six rejected Lane A manifests removed, corrected smoke, eight `R-*.json` journeys covering all 33 Group R IDs, and the initial report.
- `6dbefcfa`: validator correction: strict all-file send/end-state checks, following regex `expectText`, current `expectKit` validation, and checked-step coverage for every covered ID.
- `768a7bd7` plus `a7a04fac`: corrected real controls and fresh-reply assertions in the eight owned R manifests, including immediate checked waits for all three AT-420 follow-ups in `R-jobs.json`. The repair does not claim a run or GREEN status.
- Registered the eight owned R IDs in `test/real-pc/journeys.txt`; no baseline B/J/U/R1 journey, source/spec/golden/workflow/secret, or driver file was edited.
- `a7a04fac`: repaired the owned R-jobs send/end-state gaps and registered the eight R IDs.

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

## Repair-pass limits

- `R-kit-1.json` now clicks the real scoped Stepper increase button and the latest ListPick radio control. The removed `kit-button` clicks were invalid for Stepper/ListPick.
- `R-kit-2.json` now clicks a real latest TimePick radio and waits for foo's confirmation; the refresh path waits for a new `kit-live-stamp` reply; `do:eval` assertions were removed. AT-355 calculator recomputation remains blocked because the DSL has no fresh-surface input mutation assertion. AT-369 uses the supported Files presence check, but fresh-row identity remains unavailable.
- `R-ai-pages.json` uses the supported composer-field text assertion for AT-425.
- `R-chat-rules.json` records AT-427's exact `newBubbles=1` limitation: the runner reports `newBubbles`, but the journey DSL cannot assert the per-send exact count.
- `R-reply-area.json` scopes sender and copy-action checks to the latest answer bubble.
- `R-jobs.json` keeps each AT-420 follow-up adjacent to its required checked wait, scopes the reply to the latest checklist bubble, requires exactly one `fold that in` line, and checks the latest user bubble tick for AT-432. The strict validator reports no owned R-jobs send gaps after this repair.
- `R-approvals.json` adds the safe choice-option step before starred approval cards. These approval-dependent journeys are authored only; the separate driver-choice lane is pending and no run is claimed.

## Real-AI workflow evidence

Run `39727432127` completed with four successful Windows jobs. Each part also ran the required `J01-J02-first-run` setup (14 steps, 0 failures). The eight owned R summaries are:

| Journey | Steps | Failed | Evidence |
|---|---:|---:|---|
| R-ai-pages | 74 | 10 | [s0](https://github.com/vikas53953/foo-agent/tree/evidence/real-ai/9f429f8-claude/s0) |
| R-approvals | 102 | 38 | [s1](https://github.com/vikas53953/foo-agent/tree/evidence/real-ai/9f429f8-claude/s1) |
| R-chat-rules | 15 | 0 | [s2](https://github.com/vikas53953/foo-agent/tree/evidence/real-ai/9f429f8-claude/s2) |
| R-dark | 15 | 0 | [s3](https://github.com/vikas53953/foo-agent/tree/evidence/real-ai/9f429f8-claude/s3) |
| R-jobs | 79 | 36 | [s0](https://github.com/vikas53953/foo-agent/tree/evidence/real-ai/9f429f8-claude/s0) |
| R-kit-1 | 48 | 9 | [s1](https://github.com/vikas53953/foo-agent/tree/evidence/real-ai/9f429f8-claude/s1) |
| R-kit-2 | 63 | 20 | [s2](https://github.com/vikas53953/foo-agent/tree/evidence/real-ai/9f429f8-claude/s2) |
| R-reply-area | 24 | 6 | [s3](https://github.com/vikas53953/foo-agent/tree/evidence/real-ai/9f429f8-claude/s3) |

Totals: **420 steps, 119 failed**. I inspected **203 PNG files** across every shard: `s0` 71, `s1` 67, `s2` 39, and `s3` 26. `R-chat-rules` and `R-dark` are readable clean/messy/Hinglish (plus Hindi/Punjabi where authored) replies with zero journey failures. The failures are concrete:

- `R-ai-pages`: AT-425/426 capability prose and chips were visible, but no `kit-capabilities` surface or Try-it control appeared in any language; the expectation remains a truthful failure.
- `R-jobs`: AT-106/120/364/420 often received date-choice, live-checklist, plan, or stuck-choice cards instead of the expected state; the journey did not answer AI follow-up questions. Try-again controls were absent. AT-420 replies visibly contained “I’ll fold that in,” but the strict checklist selector was absent.
- `R-kit-1`: AT-349 received plan cards rather than a `kit-list-pick`; all three scoped radio clicks timed out. Earlier Stepper/Timeline/Calendar surfaces were visible.
- `R-kit-2`: AT-350 showed time choices but the scoped radio click timed out; AT-352/368 alternated between live checklists, stuck cards, and a real live card; AT-355 alternated between plain arithmetic text and a calculator; AT-369 showed calculator cards but the global kept-file presence check did not resolve. No `do:eval` was used as an assertion.
- `R-approvals`: AT-109/110/121/126/128 frequently stayed at choice/plan cards or asked “Stop which one?”; approval and Not-now controls were absent on several runs. AT-363 showed date-choice cards instead of the expected plan. AT-435 showed a visible Gmail connect card, while the latest-bubble scoped card assertion timed out. No approval or external send was clicked.
- `R-reply-area`: sender replies were visible, but AT-428’s end-state check failed on the first clean turn; AT-430’s copy waits timed out because the action row is a sibling below the bubble, not a descendant of it. Screenshots show the action row; no fake pass was recorded.

## Remaining blockers

- Way 1 real-AI run: current run `39727432127` has screenshot-backed per-journey failures above. Driver-choice work is a separate pending lane, so approval journeys are authored only.
- Cost/paid run: unavailable; no cost is claimed (this is not a `$0` result).
- `test/real-pc/journeys.txt`: the eight R IDs are registered and were included in run `39727432127`; the run remains blocked by the journey failures above.

## Post-run B07 live-window routing follow-up

After the immutable R evidence above, commit `006e91dc` added bounded live-window routing for B07. The driver pre-arms the Electron window event before clicking `chat-header-watch-live`, routes generic live checks and screenshots to the active live page, keeps sends/waits/thread dumps on `mainPage`, and pre-arms the live-page close event before Stop restores the main page. B07 now waits for the actual live and masked states, exercises Take over and Hand Back, and checks the main-thread stopped badge after the viewer closes.

Focused evidence: `corepack.cmd pnpm vitest run test/unit/real-pc-driver.test.ts --maxWorkers=1 --pool=threads` passed 4/4; `node --check` passed for the driver and helper; B07 JSON and `expectJs` syntax, targeted Prettier, and `git diff --check` passed. The strict all-file validator remains 2 passed / 2 failed on unchanged legacy baseline send end-state and covered-proof gaps. No live desktop run is claimed here. AT-058 no-click telemetry remains unverified, and AT-078 remains blocked because the driver cannot close the external Edge job window; closing Foo's live viewer is not used as AT-078 proof.

B07 workflow command: `$FOO_EXE foo-drive.js journeys/B07-live.json` from `test/real-pc` (direct PowerShell: `$env:ELECTRON_RUN_AS_NODE='1'; & "$env:LOCALAPPDATA\Programs\foo\foo.exe" test/real-pc/foo-drive.js test/real-pc/journeys/B07-live.json`).

## B07 live-window workflow evidence

Run `39735003572` completed successfully at tested head `4fd0d51c0516efb239123704dd1deb3af16dc219`; the immutable evidence commit is `72e4b8bb6ea050ad32bb4e6e5d4b34d67567e176`, under [`real-ai/4fd0d51-claude/s0`](https://github.com/vikas53953/foo-agent/tree/evidence/real-ai/4fd0d51-claude/s0). The setup journey passed 14/14 with 8 PNGs. B07 produced 12 PNGs and 25 steps with 12 failed steps.

The plan reply and plan start passed, and the driver observed the live BrowserWindow opening. Every subsequent live-root/live-picture wait timed out. All 12 B07 screenshots show the same blank live window header, `Checking IRCTC · step 3 of 3 · Done`, with no live root, picture, takeover, hand-back, or stop controls visible. The B07 log records timeout failures at steps 5, 6, 10, 12, 17, and 22; the evidence scan passed with 21 retained app-log lines and 0 dropped lines. This is a journey/runtime failure, not a masking pass.

AT-079 sensitive-field masking is unverified because no live picture rendered. AT-058 no-click telemetry remains unverified, and AT-078 external Edge closure remains blocked; no Foo live-viewer close was treated as Edge-window evidence.
