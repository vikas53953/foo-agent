# App start (doctor)

## Sub-features
- Window opens (single instance), FOO_TEST hooks, ux-world seed, light and dark themes.

## How to get to it (user POV)
- Start foo from the Start menu; the window shows the chat list, the chat and the details panel.

## Driving it with foo-verify
- `test/verify/doctor.journey.ts`: `v.launch()`, wait for `TID.titlebarStrip`, check `window.__fooTest.seed`, `openWorld(app, page)`, count `TID.chatlistRow`, `setTheme` light then dark with a shot each.
- Proof: PASS, 8 chat rows from ux-world, two shots.

## Gotchas
- `pnpm build` first: the helper runs `out/`, not `src/`.
- Linux has no theme bridge from `nativeTheme` to `prefers-color-scheme`; `setTheme` emulates it (implementation-notes M0 item 7). The real switch is proven on windows-latest.
