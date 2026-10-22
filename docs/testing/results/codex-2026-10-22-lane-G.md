# Lane G daily continuation — 2026-10-22

Build under review: `6127faffe236d231b0611b90eed2ad1af74401ba` (`codex/lane-g-2026-10-22`). This is a static scope check only; the script remains unchanged and no human result is claimed.

The run sheet has exactly five timed tasks and retains the three post-task questions plus the qualitative capture sheet.

| Feature or check | Test type | Result | Build SHA | Evidence | Note |
| --- | --- | --- | --- | --- | --- |
| Task 1: fresh setup and AI choice | Source/scope alignment | **pass (static only)** | `6127faffe236d231b0611b90eed2ad1af74401ba` | [15-minute script](../usability/15-minute-real-person-script.md), [first-run source](../../../src/main/setup/firstRun.ts), [AI finder](../../../src/renderer/cards/setup/AiFinder.tsx) | “Let’s go”, setup progress, provider “works / not found / looking” states, and setup-locked composer are in the current built path. |
| Task 2: typo correction and in-chat find | Source/scope alignment | **pass (static only)** | `6127faffe236d231b0611b90eed2ad1af74401ba` | [script](../usability/15-minute-real-person-script.md), [find test ids](../../../src/shared/testids.ts) | Composer/chat reply flow and `thread-find`, count, previous/next and close controls exist in the current build. |
| Task 3: safe choice and stop | Source/scope alignment | **pass (static only)** | `6127faffe236d231b0611b90eed2ad1af74401ba` | [choice card](../../../src/renderer/cards/Choice.tsx), [checklist](../../../src/renderer/cards/Checklist.tsx), [test ids](../../../src/shared/testids.ts) | Choice options, BEST FIT wording, checklist Stop, and reversible stopped-job path are built; the script does not approve, pay, book, or send. |
| Task 4: synthetic secret path | Source/scope alignment | **pass (static only)** | `6127faffe236d231b0611b90eed2ad1af74401ba` | [redactor](../../../src/shared/redactor.ts), [composer](../../../src/renderer/composer/Composer.tsx), [script](../usability/15-minute-real-person-script.md) | The synthetic `sk-proj-...` fixture matches P1, and the paste catcher offers the Secret box path. No real credential is used. |
| Task 5: settings and paused pages | Source/scope alignment | **pass (static only)** | `6127faffe236d231b0611b90eed2ad1af74401ba` | [settings page](../../../src/renderer/screens/settings/SettingsPage.tsx), [implementation notes](../../../implementation-notes.md), [script](../usability/15-minute-real-person-script.md) | Appearance is built. Notifications and Keyboard shortcuts are title-only in the current paused scope; the script explicitly asks the participant to explain recovery when a page is empty. |
| Human run and screenshots | Human usability evaluation | **blocked / none** | `6127faffe236d231b0611b90eed2ad1af74401ba` | [script capture sheet](../usability/15-minute-real-person-script.md) | No participant, screenshots, completion ratings, hesitation counts, or interview answers were collected. No usability acceptance claim is made. |

No source, spec, script, dependency, shared ledger, screenshot set, or real-AI result was changed. No new tool, credential, network call, or paid run was used.

Fidelity-CR: none
