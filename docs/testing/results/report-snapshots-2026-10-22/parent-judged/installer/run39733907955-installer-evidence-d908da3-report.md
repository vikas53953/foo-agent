# Lane E installer run 39733907955 evidence

Run: https://github.com/vikas53953/foo-agent/actions/runs/39733907955
Job: https://github.com/vikas53953/foo-agent/actions/runs/39733907955/job/119675046876
Workflow SHA: `d908da3e9ee0c9c2641b83bb9f1c21c05ab9a2b3`
Tested app SHA: `5c8c80e88704a75a4ea9102b2bcbadf260fec6b1`

The workflow completed `failure` because Lane E intentionally exits 2 when any row is `blocked`; the raw Lane E rows contain no `fail` rows.

- PR97: 22 rows, 20 pass, 2 gap. The two gaps are `foo's own toasts` and `tray icon`.
- First-run fixture: 8 rows, 7 pass, 1 blocked. The only blocked row is PERF-12 exact Install-tap to Welcome-card timing; the fixture explicitly says file bootstrap is not UI proof.
- Upgrade fixture: 11 rows, 11 pass. Old `04f01dd9fb3108cbbce8ff6df211d3a389c16977` and current `5c8c80e88704a75a4ea9102b2bcbadf260fec6b1` installers both install; seeded chats, memory and working job survive current startup.
- Aggregated Lane E: 42 rows, 38 pass, 4 blocked, 0 fail. The other three blocked rows are PR97 unbuilt-feature gaps plus missing PR97 `uninstaller present` source row.

The installer argument fix worked. Diagnostics show current installer SHA-256 `A0934667E9200569E53DC1CD682D22D97B4F25BFC613854AD0BEB99F98D733EF`, 160,309,620 bytes; after install the isolated target contains `foo.exe`, `Uninstall foo.exe`, resources and Electron runtime. Old installer SHA-256 is `82E8878D32F99B72B9537DD587E03DC6911164D29C321EC2BE3FE4586033AC2D`, 160,310,735 bytes, and also yields `foo.exe`. Raw diagnostics are under `lane-e-results/first-run/lane-e-install-diagnostics.jsonl` and `lane-e-results/upgrade/lane-e-install-diagnostics.jsonl` in the downloaded artifact folder.

One actual screenshot was produced and viewed: `lane-e-screenshots/packaged-foo-window.png`. It shows the packaged app at 938x656 with the foo shell and `Setting up Â· step 1 of 2`; this is a real app screenshot, not a feature-acceptance proof for the blocked Welcome timing row.

## Source verification of tray and own-toast status

The PR97 `gap` labels are current-source product gaps, not stale harness labels:

- `src/main/index.ts:49-51` defines and sets AUMID `com.foo.desktop`.
- `src/main/engine-supervisor/EngineBridge.ts:51-52` documents the toast request as â€œStub until M11 (logged only)â€; `:195-198` either calls an injected notifier or logs a `notify/stub` event.
- `src/main/index.ts:126-155` constructs `EngineBridge` without a `notify` callback, so production falls through to the logged stub path.
- `src/main/index.ts:269-270` states close-to-tray needs M11 and currently closes by quitting. No `Tray` implementation exists under `src/main`.

Thus the OS-level AUMID acceptance row passing proves Windows accepts a toast under the app identity; it does not prove foo emits its own native toasts. The own-toast and tray rows remain unbuilt/blocked, consistent with source.

Downloaded artifact folder: `[LOCAL_WORKSPACE]\run39733907955-installer-evidence-d908da3`
