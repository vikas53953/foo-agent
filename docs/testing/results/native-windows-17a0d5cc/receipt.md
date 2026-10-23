# Native Windows receipt — Foo branch artifact 17a0d5cc

Date: 2026-10-23 (Asia/Calcutta)
Scope: real packaged Windows UI smoke only; no acceptance of current main or real-AI journey.

## Provenance

- GitHub CI run: https://github.com/vikas53953/foo-agent/actions/runs/39888206392
- Artifact: `foo-windows-app`, artifact id `12473932475`
- Workflow head SHA: `17a0d5ccad6e0631d40c70669b9a974fa7440a87`
- Workflow result: `failure` overall; this artifact was produced by the Windows packaging shard and is labeled branch-build evidence.
- `foo.exe` SHA256: `CEFD8FA3737F133377EA5B9B8F65C6DBFD5435543562699C91F68EC43649D12F`
- Artifact was unpacked under a Temp path only. No installer was run and no user-profile package was installed.

## Native observations

- Packaged `foo.exe` launched on Windows from the verified artifact.
- Startup screenshot and accessibility tree were captured. The tree exposed the window, navigation, Settings button, chat area, and disabled composer while AI was unset.
- AI discovery ran without entering credentials or keys. Claude, ChatGPT, Gemini, and local AI were reported `not found`; no real-AI journey was attempted.
- `FOO_TEST=1` was present only to force explicit Temp data roots; the package reported `FOO_TEST=1 but this build has no test hooks`. No fake-AI flag or fake-AI script was used.
- Settings opened. Notifications page rendered its heading and navigation but no notification controls/content; this is a branch-build observation, not a milestone acceptance claim.
- Closing the window removed the visible window while the packaged process remained briefly alive, consistent with close-to-tray/hidden-process behavior. No tray icon was independently captured by the computer-use surface. Reopen through the app launcher did not expose a targetable window before cleanup.
- All packaged Foo processes were stopped by exact executable path after the smoke. The isolated Temp data root remains available for inspection; no user `%LOCALAPPDATA%\foo` data was used by the successful smoke.

## Evidence files

- `<TEMP>\\foo-native-real-17a0d5cc-evidence-20261023-1024\\startup-real.png`
  - SHA256 `97878F91D404450259507C12184CCB801430F1103B1C064DA444D49E05EB1CB7`
- `<TEMP>\\foo-native-real-17a0d5cc-evidence-20261023-1024\\notifications-real.png`
  - SHA256 `B0F55E55ABA517966CA5AE15E6E98561C04872BAB41F8360A1F4D88EAA10487D`
- Isolated data root: `<TEMP>\\foo-native-real-17a0d5cc-data-20261023-1024`

Conclusion: packaged startup, accessibility, and settings navigation were observed on the branch artifact. Provider setup was unavailable without authentication entry, so no real-AI interaction, notification delivery, or full acceptance result is claimed.
