# Details panel (03-shell-2 §3.7–§3.9)

## Sub-features
- Doing now (In progress / Scheduled / Done control, rows, Stop, Watch live), Using chips, What I know about you (facts, Edit, See all), Spent this month, group members, Kept (R1 T7: things kept from replies, Open / Show in folder).

## How to get to it (user POV)
- Right column at 1280+ wide, or the panel toggle in the chat header (`Ctrl+Shift+D`) on narrower windows.

## Driving it with foo-verify
- `openWorld`, `openChat(page, 'foo')`, then `TID.appPanel` and its parts: `appPanelDoing`, `appPanelDoingRow`, `appPanelDoingStop`, `appPanelUsingChip`, `appPanelKnowFact`, `appPanelSpentAi`; toggle with `TID.chatHeaderPanel`.
- Proof: rows and texts per section, a shot of `TID.appPanel` light and dark.

## Gotchas
- Kept rows are `TID.filesKeptItem` with `data-kind` kit | page and buttons `data-action` open | show; they sit at the bottom of the panel, so scroll one into view before a shot. Journey: `test/verify/r1-t7-output.journey.ts`.
- A group chat shows "In this group" instead of memory and no "Spent this month" (3.11.10).
- Existing E2E: `test/e2e/m1-shell-main.spec.ts`.
