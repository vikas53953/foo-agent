# Lane E — Windows, install, upgrade, performance and soak

Branch before this bounded fix: `77977b5c59027fd336e1fafc3046a81e5463d386` (merge of current main `0d04a9f9105e42aef0b4a22238285a9007635c3e`). The old upgrade fixture is fixed to `04f01dd9fb3108cbbce8ff6df211d3a389c16977`.

The harnesses are fixture-only. They require explicit release artifacts and put installer targets, `FOO_DATA_DIR`,
`FOO_LOCAL_DIR`, Electron `APPDATA`/`LOCALAPPDATA`, output, and reports under `RUNNER_TEMP`; they refuse a user-profile path. No user key, Credential Manager
entry, AI login or paid workflow was accessed. Real-AI cost: **$0**.

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
| 04f01dd old build → current build install over fixture                | PowerShell + SQLite fixture                        | blocked                                | `0d04a9f` | [lane-e-upgrade.ps1](../../../test/windows/lane-e-upgrade.ps1)                                                                                     | The harness now requires an old installer built from `04f01dd` plus a current installer and explicit SHA metadata, all under `RUNNER_TEMP`; no artifact pair was supplied.                                                                                              |
| Chats, memory and working job preservation                            | SQLite seed + read-only verifier                   | blocked                                | `0d04a9f` | [lane-e-upgrade-seed.ts](../../../test/windows/lane-e-upgrade-seed.ts), [lane-e-upgrade-verify.ts](../../../test/windows/lane-e-upgrade-verify.ts) | The fixture preserves chats, memory and a running job. Routine rows are excluded because routine execution is not an acceptance dependency; the installer run remains blocked without both artifacts.                                                                   |
| PERF-01..18 + PERF-01..04 at 225%, pretend AI                         | TypeScript p95 validator                           | blocked                                | `0d04a9f` | [lane-e-performance.ts](../../../test/soak/lane-e-performance.ts)                                                                                  | All 18 budgets, exact E.1 data, separate measured 225% dataset, and 20 samples per check are required. No live measurement bundle was supplied.                                                                                                                         |
| PERF-01..18, real AI                                                  | TypeScript p95 validator                           | blocked                                | `0d04a9f` | [lane-e-performance.ts](../../../test/soak/lane-e-performance.ts)                                                                                  | No lane-provided real-AI key/environment was inspected or used; the real mode remains fail-closed. Cost $0.                                                                                                                                                             |
| Eight-hour source-fixture heartbeat producer                          | Playwright Electron + fake AI + SQLite observation | blocked                                | `0d04a9f` | [lane-e-live-producer.ts](../../../test/soak/lane-e-live-producer.ts)                                                                              | The producer starts a real fake-AI job in an isolated FOO_TEST app. `jobStarts` is the acceptance gate; `routine_runs` is diagnostic only. No eight-hour run was started.                                                                                               |
| Eight-hour jobs soak, handles, memory and freezes                     | Windows process + heartbeat monitor                | blocked                                | `0d04a9f` | [lane-e-soak.ts](../../../test/soak/lane-e-soak.ts)                                                                                                | Harness enforces exactly 8 hours and requires a job start plus process/heartbeat evidence. A one-hour run was not started because no packaged fixture and Windows CI evidence were available; no local installer or AI call was used.                                   |

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

The executable source-app producer uses the existing Electron launcher and fake-AI fixture. It must run for the full eight
hours; it records the live job rows from its isolated SQLite database, so missing job activity stays blocked. `routine_runs`
is diagnostic only because routine execution is not a current acceptance dependency:

```powershell
corepack.cmd pnpm exec tsx test/soak/lane-e-live-producer.ts --out "$env:RUNNER_TEMP\lane-e-live" --mode pretend --duration-hours 8
# Bounded launcher/job smoke only; this does not claim the eight-hour result.
corepack.cmd pnpm exec tsx test/soak/lane-e-live-producer.ts --out "$env:RUNNER_TEMP\lane-e-live-smoke" --mode pretend --smoke
```

The soak command requires a fixture executable and an external heartbeat JSON under `RUNNER_TEMP`; `--duration-hours`
must remain exactly `8`:

```powershell
corepack.cmd pnpm exec tsx test/soak/lane-e-soak.ts --exe "$env:RUNNER_TEMP\foo.exe" --scenario "$env:RUNNER_TEMP\soak-heartbeat.json" --out "$env:RUNNER_TEMP\lane-e-soak" --mode pretend --duration-hours 8
```

## Needs Vikas

Add one Windows CI job (workflow change) that builds the current NSIS installer and a second isolated installer from
the old `04f01dd9fb3108cbbce8ff6df211d3a389c16977` checkout, then runs `test/windows/*.ps1` on `windows-latest`.
The job should publish the JSON/Markdown result folders as artifacts and invoke `lane-e-windows.ps1` with both installer
paths, `-PreviousBuildSha 04f01dd9fb3108cbbce8ff6df211d3a389c16977`, `-CurrentBuildSha $env:GITHUB_SHA`, and the PR97
`results.json` plus its run URL. Keep every target, profile root, report and artifact under `RUNNER_TEMP`; no workflow
trigger, secret or user profile is changed by this lane.

## Validation and remaining work

Authored-path validation for this revision: PowerShell parser checks, focused TypeScript checks, ESLint/Prettier, `git diff --check`,
and TypeScript `--help` dry runs pass. The Windows entrypoint dry run exited 2 and wrote three explicit blocked rows (no PR97
results, no current installer, no old/current installer pair). The Windows entrypoint without artifacts is expected to exit 2
with explicit blocked rows. No installer was packaged, executed or uninstalled locally; no Credential Manager entry was read or
written; no tray/toast check was claimed. The optional one-hour soak was not started: the current job evidence must come from
the isolated fake-AI fixture on Windows CI, and no packaged fixture or CI run was available. No full suite, new dependency,
paid AI call or real-AI key was used.
