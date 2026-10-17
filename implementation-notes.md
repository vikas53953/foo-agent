# Implementation notes (deviations, picks, deferrals)

## M0 (2026-10-17)

### Picks where the spec is silent (closest spec-consistent default)

1. **TypeScript 5.9.3**, not 7.0: 7.0 has no JS API yet, which `typescript-eslint` and Vite tooling need. Strict mode everywhere.
2. **Sizes stay in px** in `tokens.css`; font sizes, line heights and spacing are in rem (02-3 §F29.3 names only those for rem). Rows grow with text through min-height and padding, not through the size tokens.
3. **New tokens** (named per §F29.1, each with its spec source): `--focus-outer-w` 2px and `--focus-inner-w` 1px (02 F8 ring widths), `--bubble-max-rich` 680px (02 F5 rich-bubble cap), `--m-basic` 200ms and `--ease-basic` (02 F7 X-150 "Basic"), `--motion-move` (1, or 0 under reduced/Basic/Off, so components can zero movement without their own media query).
4. **Reduced motion block** (02 F7, §F25.4): every fade duration becomes 83ms, the shimmer 0ms, `--motion-move` 0. `data-motion="basic"` maps every duration to `--m-basic` with `--ease-basic`.
5. **Forced colours** (§F25.5) are applied by remapping the token variables to system colours in one block of `tokens.css`.
6. **Dark shadows** use the light offsets with `rgba(0,0,0,.5)`; `--shadow-1` is `none` in dark (02 F4 "light only").
7. **Linux E2E** emulates `prefers-color-scheme` because Electron on Linux CI does not bridge `nativeTheme.themeSource` into the media query; the windows-latest run checks the real behaviour, including the live switch.
8. **Window close quits** until the tray exists (M11); `settings.app.closeToTray` stays true.
9. **App icon** is drawn in code (`scripts/build-icon.ts`) from the master geometry of `logo-face.svg` (X-143, F15.1), light pair + rim, 14 sizes, PNG entries in the `.ico`.

### Deferred from the M0 "Create" list (reason · where it lands)

- Golden pipeline (golden runner pinned, `golden-render` for the 490 UX + BP refs, `golden/manifest.json`, `golden-bless`, UX-08-01 wiring sample), `copy.json` extraction + FID-09, `spec-values.json` + FID-14 (SV-16/37/38), `state-machines.json` + FID-16, `trace.csv` + FID-18, FID-02 CODEOWNERS guard, Stylelint (FID-13; ART-24a scan covers styles today), fidelity report `scripts/fidelity-report.ts` · need a Windows golden runner with Segoe UI Variable · **M0b fidelity PR, next**.
- `src/shared/{handback,face,badges,redactor,schemas,ids,safeName,errors}.ts` · first used in M2–M5 · their milestone.
- `native/foo-native/` skeleton with JS fallbacks, Windows text size (`TextScaleFactor`, 09 §9.14.2) · M11.
- `test/fakes/*` · M3 (fake AI, fake CLIs).
- Windows accent (§F28.3, setting off by default), app zoom (09 §9.14.3), tray and close-to-tray, `foo://` route table (08-0 §G.9; URLs are logged as `URL_NOT_ALLOWED`) · M11/M13.
- `launches.json` and safe mode (08-1 §2.2 step 1) · M4 (needs the engine).
- `settings.ts` holds only the keys M0 reads (+ `appearance.animations`, X-150); other keys arrive with the milestone that reads them.
- Extra renderer entries (`live.html`, `viewer.html`, `signin-banner.html`) · M9.

### Gaps (not written to `GAPS.md`, which the Look Book thread owns)

- `--logo-bg` is named in 02-3 §F28.2 rule 4 but has no value in 02 F2.
- 02 F5 `--bubble-max` is "72 % of the column, capped at 620px": the token holds the 620px cap; the 72 % rule belongs to the bubble component (M2).

### Spec snapshot

`spec/` is a frozen copy of the constitution and Look Book assets taken 2026-10-17 (spec-v1.0, `SPEC-MANIFEST.json`). Later edits in the project files (for example the acceptance tests being finished in parallel) reach the repo through a CR (`docs/cr/`) that refreshes the copy and the manifest.
