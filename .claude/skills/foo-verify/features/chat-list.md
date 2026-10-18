# Chat list, filters, search (03-shell-1 §3.2–§3.5)

## Sub-features
- Rows with avatar, name, time, preview, pills (Needs you, Working, Done), unread badges, mute icon.
- Filter chips All / Needs you / Working / Done with counts; search field with clear; order rules (needs-you on top, then foo, then pinned).

## How to get to it (user POV)
- Left column of the main window, always visible at 1280 wide.

## Driving it with foo-verify
- `openWorld(app, page)` then chips by `TID.chatlistFilterAll|NeedsYou|Working|Done`, rows by `TID.chatlistRow` with `TID.chatlistRowName`, search by `TID.sidebarSearchField` / `TID.sidebarSearchClear`.
- Move a job with `window.__fooTest.jobState(jobId, 'needs_you')` (ids from `openWorld`'s refs) to see the pill and chip count change.
- Proof: the row set after each chip (names), the chip counts, a shot per state.

## Gotchas
- The list is virtual: find a row by its name, not by index past the first screen.
- Existing E2E: `test/e2e/m1-shell-list.spec.ts`.
