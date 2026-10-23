# Foo native Windows diagnostic receipt

- **Source SHA:** `27279d164b115211463af11f4f601b0f0b7dd875`
- **Source archive:** `<RUNNER_TEMP>\\foo-native-27279d16-source.zip`
- **Scope:** isolated unpacked Electron diagnostic on the exact source SHA. No installer, upgrade, connector authentication, external message, payment, or security/privacy-setting flow was exercised.

## Availability and launch

No existing trustworthy `foo.exe` or installer was found in the local evidence tree. An isolated source archive was built outside the checkout:

```powershell
git archive --format=zip --output=<RUNNER_TEMP>\\foo-native-27279d16-source.zip 27279d164b115211463af11f4f601b0f0b7dd875
corepack.cmd pnpm build
corepack.cmd pnpm exec electron-builder --win --dir --config.directories.output=dist
```

The TypeScript/token/renderer build passed. The isolated electron-builder run remained in dependency scanning and was stopped; no NSIS installer was produced. For the visual diagnostic, the exact built `out`, `resources`, and `package.json` were placed in an unpacked Electron runtime root. Runtime executable SHA256: `C99A56D653220A8BF209B0B9AE2424EC1F1580946D1BF3395A968EB211A4F1B5`. Source archive SHA256: `B38A62E5CB64039269950ED55241CC2C1C40B2C7B37E92351FA9DF327EE9BD27`.

The run used a fresh temporary Electron user-data directory and explicit app data paths:

```text
FOO_TEST=1
FOO_FAKE_AI=1
FOO_DATA_DIR=<RUNNER_TEMP>\\foo-native-27279d16-profile2\\data
FOO_LOCAL_DIR=<RUNNER_TEMP>\\foo-native-27279d16-profile2\\local
FOO_OUT_DIR=<RUNNER_TEMP>\\foo-native-27279d16-profile2\\out
electron.exe --user-data-dir="<RUNNER_TEMP>\\foo-native-27279d16-profile2\\electron-userdata"
```

## Observed results

- **Startup visual:** PASS for the diagnostic. One window titled `foo` appeared and showed the chat shell, `Setting up · step 1 of 2`, chat list, details panel, and disabled AI input pending setup.
- **Accessibility:** PARTIAL PASS. The first startup capture returned no accessibility tree; after a one-second refresh on the same window, the tree exposed the root web area, chat navigation, search edit, chat filters, settings button, settings navigation, and settings headings/buttons. This is evidence for the inspected screen only, not a full accessibility acceptance.
- **Settings safe flow:** PASS for navigation. Clicking the visible Settings control opened Account & your AI; the inspected page exposed Account & your AI, Appearance, Notifications, Permissions, Money, Privacy, Routines, Connections, Chat and voice, Keyboard shortcuts, and About.
- **Tray:** NOT BUILT / UNAVAILABLE. No tray surface was observed. The source explicitly states that close-to-tray awaits M11 and that closing quits until then (`src/main/index.ts`, source SHA above). The close action removed the window; exact test processes lingered briefly and were stopped by their verified runtime path. This is not a tray pass.

## Screenshots

- `<RUNNER_TEMP>\\foo-native-27279d16-evidence\\startup-isolated.png` — SHA256 `323D41B5FE3F1BE0BA3120ABA61DDB76AA1C1E3B69A8DC85497269F1F6DF3A8D`
- `<RUNNER_TEMP>\\foo-native-27279d16-evidence\\settings-isolated.png` — SHA256 `8D69B059B663A3FF5D18FB481273A78E996297D2561F26D56561165A3DEFAA38`

This receipt records a bounded native startup/settings observation from the exact source SHA. It does not establish installer install/upgrade behavior, tray behavior, full accessibility acceptance, performance, or release acceptance.

Published screenshots: [startup](startup-isolated.png), [settings](settings-isolated.png). This was fake-AI source-runtime navigation only; it does not satisfy Vikas's requested installed foo.exe real-AI Windows journey.
