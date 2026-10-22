# Lane E â€” Windows, install, upgrade, performance and soak

Branch before this bounded fix: `77977b5c59027fd336e1fafc3046a81e5463d386` (merge of current main `0d04a9f9105e42aef0b4a22238285a9007635c3e`). The old upgrade fixture is fixed to `04f01dd9fb3108cbbce8ff6df211d3a389c16977`.
Current corrected diagnostic revision: `5c8c80e88704a75a4ea9102b2bcbadf260fec6b1`.

The harnesses are fixture-only. They require explicit release artifacts and put installer targets, `FOO_DATA_DIR`,
`FOO_LOCAL_DIR`, Electron `APPDATA`/`LOCALAPPDATA`, output, and reports under `RUNNER_TEMP`; they refuse a user-profile path. No user key, Credential Manager
entry, AI login or paid workflow was accessed by Lane E. No real-AI credential or paid-provider acceptance is claimed.

## Tool comparison

| Option                                       | Primary evidence                                                                                                                                      | Fit for Lane E                                                                                                                                                                            | Decision                                                                                                       |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Existing Playwright Electron launcher        | [`test/e2e/launch.ts`](../../../test/e2e/launch.ts); [Playwright ElectronApplication docs](https://playwright.dev/docs/api/class-electronapplication) | Strong DOM/UI timing and existing fake-AI seams; does not own NSIS install paths, Windows Credential Manager, tray, notifications, process handles or 8-hour monitoring.                  | Reuse only as the external Windows UI driver; PR97 remains the owner of its packaged UI checks.                |
| PowerShell/.NET process and Windows APIs     | [`electron-builder.yml`](../../../electron-builder.yml); [Microsoft PowerShell documentation](https://learn.microsoft.com/en-us/powershell/)          | Strong native Windows process, installer and profile containment; no extra package, but weak for renderer paint and chat interaction evidence.                                            | Use for the isolated first-run and upgrade orchestration.                                                      |
| Vitest/tsx TypeScript validator              | [`package.json`](../../../package.json); [Vitest CLI docs](https://vitest.dev/guide/cli)                                                              | Already pinned in the repo, works with the existing SQLite seed and can validate all 18 PERF budgets without adding dependencies; live UI/native samples still must come from Windows CI. | **Selected** for the measurement contract, upgrade fixture seed/verifier, and soak monitor.                    |
| Existing Electron launcher + fake-AI fixture | [`test/e2e/launch.ts`](../../../test/e2e/launch.ts), [`test/e2e/fakeAi.ts`](../../../test/e2e/fakeAi.ts)                                              | Starts the real source app with isolated FOO_TEST roots and a JSONL fake AI; it can seed ux-world, execute one UI job, and report real SQLite job rows. Routine rows are diagnostic only. | **Selected** for the executable eight-hour heartbeat producer; it is separate from the packaged NSIS observer. |

## Results

| Feature or check                                                      | Test type                                          | Result (pass / fail / wrong / blocked) | Build sha | Evidence link                                                                                                                                      | Note                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR97 silent install, Apps & features, Start menu, window and `foo://` | delegated Windows harness                          | blocked                                | `0d04a9f` | [PR97](https://github.com/vikas53953/foo-agent/pull/97)                                                                                            | `lane-e-windows.ps1` consumes PR97 `results.json` only with explicit current build SHA and run/log URL; otherwise even source `pass` rows stay blocked. It does not invoke PR97's hardcoded user-profile path. No provenance-bearing result was available in this lane. |
| PR97 Credential Manager round trip                                    | delegated Windows harness                          | blocked                                | `0d04a9f` | [PR97](https://github.com/vikas53953/foo-agent/pull/97)                                                                                            | Consumed only from PR97 output when supplied; no real keychain entry was read or written here.                                                                                                                                                                          |
| Tray icon and foo-owned Windows notifications                         | delegated Windows harness                          | blocked                                | `0d04a9f` | [PR97](https://github.com/vikas53953/foo-agent/pull/97)                                                                                            | PR97 explicitly reports these as product gaps; the aggregator preserves that as blocked rather than a pass. AUMID toast acceptance remains delegated.                                                                                                                   |
| Clean fixture first run and profile containment                       | PowerShell harness                                 | blocked                                | `0d04a9f` | [lane-e-first-run.ps1](../../../test/windows/lane-e-first-run.ps1)                                                                                 | No installer artifact was supplied. Local installer packaging and execution were intentionally not run under the fixed Lane E path, so this remains a Windows CI check.                                                                                                 |
| 04f01dd old build â†’ current build install over fixture                | PowerShell + SQLite fixture                        | blocked                                | `0d04a9f` | [lane-e-upgrade.ps1](../../../test/windows/lane-e-upgrade.ps1)                                                                                     | The harness now requires an old installer built from `04f01dd` plus a current installer and explicit SHA metadata, all under `RUNNER_TEMP`; no artifact pair was supplied.                                                                                              |
| Chats, memory and working job preservation                            | SQLite seed + read-only verifier                   | blocked                                | `0d04a9f` | [lane-e-upgrade-seed.ts](../../../test/windows/lane-e-upgrade-seed.ts), [lane-e-upgrade-verify.ts](../../../test/windows/lane-e-upgrade-verify.ts) | The fixture preserves chats, memory and a running job. Routine rows are excluded because routine execution is not an acceptance dependency; the installer run remains blocked without both artifacts.                                                                   |
| PERF-01..18 + PERF-01..04 at 225%, pretend AI                         | TypeScript p95 validator                           | blocked                                | `0d04a9f` | [lane-e-performance.ts](../../../test/soak/lane-e-performance.ts)                                                                                  | All 18 budgets, exact E.1 data, separate measured 225% dataset, and 20 samples per check are required. No live measurement bundle was supplied.                                                                                                                         |
| PERF-01..18, real AI                                                  | TypeScript p95 validator                           | blocked                                | `0d04a9f` | [lane-e-performance.ts](../../../test/soak/lane-e-performance.ts)                                                                                  | No lane-provided credential was supplied; the real mode remains fail-closed and no real-AI acceptance is claimed.                                                                                                                                                       |
| Source-fixture heartbeat producer (8-hour gate / 1-hour diagnostic)   | Playwright Electron + fake AI + SQLite observation | blocked                                | `0d04a9f` | [lane-e-live-producer.ts](../../../test/soak/lane-e-live-producer.ts)                                                                              | The producer starts a real fake-AI job in an isolated FOO_TEST app. `jobStarts` is the acceptance gate; `routine_runs` is diagnostic only. The historical CI producer-only diagnostic is recorded below; the corrected current-head run is separate. |
| Jobs soak, handles, memory and freezes (8-hour gate / 1-hour partial) | Windows process + heartbeat monitor                | blocked                                | `0d04a9f` | [lane-e-soak.ts](../../../test/soak/lane-e-soak.ts)                                                                                                | Default is the eight-hour acceptance threshold. `--partial --duration-hours 1` records diagnostic evidence only and reports `partial`; the historical producer-only run did not run this observer. The corrected current-head observer is ongoing below. |
| Historical CI 1-hour producer-only diagnostic                          | Windows CI fake-AI producer                         | partial (job failed)                   | `236b9bfc` | [run](https://github.com/vikas53953/foo-agent/actions/runs/39728230100), [job](https://github.com/vikas53953/foo-agent/actions/runs/39728230100/job/119657034807), [artifact](https://github.com/vikas53953/foo-agent/actions/runs/39728230100/artifacts/12405654410) | Actual report: `result=partial`, `durationHours=1`, `acceptanceDurationHours=8`, `routineRuns=0`, `jobStarts=1`, `jobState=failed`, `failure=null`, producer exit `0`; observed 60m21s (05:32:16â€“06:32:37 UTC). Tested `236b9bfc8e45f0d2911967c1c76e0a78e841aed0`; producer-only, no observer, no runtime handles/memory/process samples, and no eight-hour acceptance. Runner paths are redacted to `<RUNNER_TEMP>`. |
| Current corrected source-app + heartbeat observer diagnostic        | Isolated local Windows producer plus observer | blocked (ongoing)                     | `5c8c80e8` | â€” | Producer started `2026-10-22 12:04:34.547 IST`; first heartbeat `12:05:05.957 IST`; observer started `12:05:29.903 IST` after that heartbeat. Evidence root is `<RUNNER_TEMP>\foo-lane-e-soak-5c8c80e8-r2`; provenance is `<RUNNER_TEMP>\foo-lane-e-soak-5c8c80e8-r2\source-runtime-provenance.txt`. Current runtime PID `85852` is `...\electron\dist\electron.exe`; launcher PID `72188` is `cmd.exe`; responding `true`, handles `1053`, working set `151867392`. `buildSha()` reads git HEAD for each heartbeat, so `5c8c80e88704a75a4ea9102b2bcbadf260fec6b1` is the starting SHA and later heartbeat SHA drift must be reported if HEAD changes. Observer validates heartbeat freshness and pinned runtime identity; it never samples the provenance path. Expected finish is about `20:05 IST`; no acceptance result yet, and routines, child-process total RAM, and packaged acceptance remain unproven. |

## Executable commands and prerequisites

The Windows entrypoint is:

```powershell
& test/windows/lane-e-windows.ps1 -Out "$env:RUNNER_TEMP\lane-e-results" -Pr97Results "$env:RUNNER_TEMP\pr97\results.json" -Pr97BuildSha "$env:GITHUB_SHA" -Pr97EvidenceUrl "https://github.com/vikas53953/foo-agent/actions/runs/<run-id>" -PreviousInstaller "$env:RUNNER_TEMP\foo-04f01dd-Setup.exe" -CurrentInstaller "$env:RUNNER_TEMP\foo-current-Setup.exe" -PreviousBuildSha "04f01dd9fb3108cbbce8ff6df211d3a389c16977" -CurrentBuildSha "$env:GITHUB_SHA"
```

The isolated first-run and upgrade harnesses are independently executable:

```powershell
& test/windows/lane-e-first-run.ps1 -Installer "$env:RUNNER_TEMP\foo-Setup.exe" -Out "$env:RUNNER_TEMP\lane-e-first"
& test/windows/lane-e-upgrade.ps1 -PreviousInstaller "$env:RUNNER_TEMP\foo-04f01dd-Setup.exe" -CurrentInstaller "$env:RUNNER_TEMP\foo-current-Setup.exe" -PreviousBuildSha "04f01dd9fb3108cbbce8ff6df211d3a389c16977" -CurrentBuildSha "$env:GITHUB_SHA" -Out "$env:RUNNER_TEMP\lane-e-upgrade"
```

The performance validator consumes live Windows output and cannot manufacture samples:

```powershell
corepack.cmd pnpm exec tsx test/soak/lane-e-performance.ts --measurements "$env:RUNNER_TEMP\perf-pretend.json" --out "$env:RUNNER_TEMP\lane-e-perf" --mode pretend
corepack.cmd pnpm exec tsx test/soak/lane-e-performance.ts --measurements "$env:RUNNER_TEMP\perf-real.json" --out "$env:RUNNER_TEMP\lane-e-perf" --mode real
```

The executable source-app producer uses the existing Electron launcher and fake-AI fixture. The default eight-hour run is the
acceptance gate; the explicit one-hour route is diagnostic and reports `partial`, never `pass`. It records live job rows from
its isolated SQLite database, so missing job activity stays blocked. `routine_runs` is diagnostic only because routine
execution is not a current acceptance dependency:

```powershell
corepack.cmd pnpm exec tsx test/soak/lane-e-live-producer.ts --out "$env:RUNNER_TEMP\lane-e-live" --mode pretend --duration-hours 8
# Explicit one-hour diagnostic; this is partial evidence and never satisfies the eight-hour acceptance gate.
corepack.cmd pnpm exec tsx test/soak/lane-e-live-producer.ts --out "$env:RUNNER_TEMP\lane-e-live-partial" --mode pretend --partial --duration-hours 1
# Bounded launcher/job smoke only; this does not claim the eight-hour result.
corepack.cmd pnpm exec tsx test/soak/lane-e-live-producer.ts --out "$env:RUNNER_TEMP\lane-e-live-smoke" --mode pretend --smoke
```

The soak command requires a fixture executable and an external heartbeat JSON under `RUNNER_TEMP`. Use eight hours for the
acceptance gate; pass both `--partial` and `--duration-hours 1` only for the bounded diagnostic route:

```powershell
corepack.cmd pnpm exec tsx test/soak/lane-e-soak.ts --exe "$env:RUNNER_TEMP\foo.exe" --scenario "$env:RUNNER_TEMP\soak-heartbeat.json" --out "$env:RUNNER_TEMP\lane-e-soak" --mode pretend --duration-hours 8
# Explicit one-hour diagnostic; the report says partial and keeps the eight-hour acceptance result blocked.
corepack.cmd pnpm exec tsx test/soak/lane-e-soak.ts --exe "$env:RUNNER_TEMP\foo.exe" --scenario "$env:RUNNER_TEMP\soak-heartbeat.json" --out "$env:RUNNER_TEMP\lane-e-soak-partial" --mode pretend --partial --duration-hours 1
```

## Next concrete performance collection

Run one dedicated `windows-latest` job on the pinned current revision, separate from the active soak desktop and with one
Playwright worker. It must create fresh `FOO_DATA_DIR`, `FOO_LOCAL_DIR` and `FOO_OUT_DIR` roots below `RUNNER_TEMP`, use
the existing fake-AI launch seam, and publish only the logs, measurement bundle, validator report and screenshots. The
three existing seeded probes should run serially with `--repeat-each=20 --workers=1`:

```powershell
corepack.cmd pnpm exec playwright test test/e2e/m2-composer.spec.ts --grep "PERF-02" --repeat-each=20 --workers=1 2>&1 | Tee-Object "$env:RUNNER_TEMP\perf-ui-m2-composer.log"
corepack.cmd pnpm exec playwright test test/e2e/m1-shell.spec.ts --grep "PERF-03:" --repeat-each=20 --workers=1 2>&1 | Tee-Object "$env:RUNNER_TEMP\perf-ui-m1-shell.log"
corepack.cmd pnpm exec playwright test test/e2e/m2-messages.spec.ts --grep "PERF-04" --repeat-each=20 --workers=1 2>&1 | Tee-Object "$env:RUNNER_TEMP\perf-ui-m2-messages.log"
```

`m2-composer.spec.ts`, `m1-shell.spec.ts` and `m2-messages.spec.ts` call `window.__fooTest!.seed('perf')` after launch.
The collector must verify the returned/SQLite counts before writing the bundle: 200 chats, 50,000 messages, a 5,000-message
largest chat, 300 memory facts, 25 routines and 8 helpers. Until those counts are observed in the run, the bundle must omit
dataset metadata and the validator must remain blocked. The existing `m0-window.spec.ts` PERF-01 smoke does not seed this
dataset, measures only launch to `titlebar-strip`, and has a 15,000 ms smoke assertion; it is not a PERF-01 acceptance probe.

PERF-01 needs a small new collector in a separate performance branch: use one isolated launch to seed `perf`, close it,
then cold-launch the same persisted roots and measure from process launch to the chat list row and composer accepting input.
That persisted-dataset launch is the only proposed PERF-01 sample source. No implementation is being added in this report.

The collector must parse exactly 20 finite values per metric into `perf-pretend.json`, then run
`test/soak/lane-e-performance.ts --measurements ... --out ... --mode pretend`:

| Metric | Source probe and value | Existing threshold |
|---|---|---|
| PERF-01 | New persisted-seed collector: cold process launch to the seeded chat list and composer accepting input | p95 `< 2,000 ms`; current `m0-window` titlebar smoke is excluded |
| PERF-02 | `m2-composer.spec.ts`: approved CR-0005 paced probe; report both raw keydown-to-paint and the approved value after subtracting at most one refresh wait | validator uses approved `typingMs` p95 `< 16 ms`; raw value remains diagnostic |
| PERF-03 | `m1-shell.spec.ts`: chat-row click to new header and first message row painted, after the verified `perf` seed | p95 `< 100 ms` |
| PERF-04 | `m2-messages.spec.ts`: verified `perf` seed, fling frames longer than 16.7 ms, plus `[data-index]` row count | long-frame share `â‰¤ 1%`; every sample must carry `virtualizedDomBounded=true` and max DOM rows `â‰¤ 80` |

The bundle may identify `buildSha`, `os: "win32"`, `aiMode: "pretend"`, and the exact E.1 dataset only after the run
verifies those counts. This bounded run measures PERF-02..04 with existing probes and PERF-01 only with the new persisted-seed
collector; the validator must leave the other metrics and the 225% stress rows blocked until their separate live probes exist.
It must not start the 8-hour producer, invoke an installer, read Credential Manager, use a real-AI key, or share the
interactive desktop with the soak.

## Historical Needs Vikas proposal

The installer CI proposal below was owner-approved and exercised by the Windows CI run linked above; it is retained as
historical context rather than an outstanding request. The job builds the current NSIS installer and a second isolated
installer from the old `04f01dd9fb3108cbbce8ff6df211d3a389c16977` checkout, then runs `test/windows/*.ps1` on
`windows-latest`. It publishes JSON/Markdown result folders as artifacts and invokes `lane-e-windows.ps1` with both
installer paths, `-PreviousBuildSha 04f01dd9fb3108cbbce8ff6df211d3a389c16977`, `-CurrentBuildSha $env:GITHUB_SHA`, and
the PR97 `results.json` plus its run URL. Every target, profile root, report and artifact stays under `RUNNER_TEMP`;
no workflow trigger, secret or user profile is changed by this lane.

## Validation and remaining work

Authored-path validation for this revision: PowerShell parser checks, focused TypeScript checks, ESLint/Prettier, `git diff --check`,
the duration contract red/green test, and TypeScript `--help` dry runs pass. The Windows entrypoint dry run exited 2 and wrote three explicit blocked rows (no PR97
results, no current installer, no old/current installer pair). The Windows entrypoint without artifacts is expected to exit 2
with explicit blocked rows. No installer was packaged, executed or uninstalled locally; no Credential Manager entry was read or
written; no tray/toast check was claimed. The historical one-hour producer-only CI diagnostic did run and is recorded above;
its failed job state and missing observer/resource evidence keep it partial and below the eight-hour acceptance threshold.
The corrected source-app plus observer diagnostic is running at the current head and has no acceptance result yet. No full
suite, new dependency, paid AI call or real-AI key was used.
