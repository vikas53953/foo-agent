# CR-0018: M14 trace rows, the native capture kind, and the picks the M14 build makes where the spec forks

- **Asked by:** the M14 lead (ticket T1, `/mnt/project-files/foo/prep/M14-tickets.md`), 2026-10-18, while building M14
  (foo-plan §5 M14), ahead of plan order against fakes (Vikas, 2026-10-18 18:03Z: run every non-dependent milestone now).
- **Spec sections:** 09-windows §9.3 (installer), §9.5 (single instance), §9.23 (uninstall, X-124 helper); 06-2 §6.6 (Privacy →
  Your data), §6.9 (About); 06-3 §14 C-16; 08-0 §C, §D; 08-1 §3.2, §3.3 (`data:*`); 08-3 §19.4 (export, wipe), §20 (PERF), §21;
  08-5 l.57 (`ReadinessResult`); 10-acceptance-1 §A.4, §A.6, §B; 10-acceptance-2 §D, §E, §F, §G; 11-fidelity §11.2.7, §11.9.1,
  §11.12; research J1 l.415.
- **Status:** Approved by Vikas's approve-on-my-behalf rule (his message 2026-10-18 14:56Z), after the independent review in §(e); §(c) by Vikas himself 2026-10-18 18:42Z; DECISIONS X-171, X-177
- **Change:** `spec/trace.csv` (rows below), `spec/constitution/DECISIONS.md` (rows X-171, X-177);
  `scripts/golden-manifest.ts` (`NATIVE_STEPS`, `capture` / `captureNote` on `UxEntry`) and `golden/manifest.json` regenerated
  (`pnpm golden:manifest`); `docs/fidelity/disputes.json` (UX-01-05 r4, UX-25-11 r1). No other `spec/` or `golden/` file
  changes.
- **Manifest:** `pnpm tsx scripts/spec-verify.ts --write` run in the same commit.

## (a) Trace rows (`spec/trace.csv`), Milestone M14

| Id                                    | Test file                                                                                 | Ticket                   |
| ------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------ |
| AT-001 (M11 proves the toast half)    | `test/installer/AT-001.spec.ts`                                                           | T2                       |
| AT-004                                | `test/installer/strings.test.ts`, `test/installer/branches.spec.ts`                       | T2                       |
| AT-092                                | `test/integration/data/export.test.ts`                                                    | T3                       |
| AT-100, AT-103                        | `test/installer/uninstall-delete.spec.ts` (T2), `test/integration/data/wipe.test.ts` (T4) | T2, T4                   |
| AT-101                                | `test/integration/data/wipe-revoke.test.ts`                                               | T4                       |
| AT-102                                | `test/installer/keep-reinstall.spec.ts`                                                   | T2                       |
| AT-104                                | `test/installer/jobs-warning.spec.ts`                                                     | T2                       |
| AT-150                                | `test/e2e/m14-about-version.spec.ts` (+ `scripts/verify-signature.ts` in release)         | T7                       |
| AT-224                                | `test/integration/data/wipe-offline.test.ts`                                              | T4                       |
| AT-277 (M11, M12 halves as notes)     | `test/installer/icon.spec.ts`                                                             | T2                       |
| ART-15a                               | `test/articles/ART-15a.test.ts`                                                           | T6 scaffold, T3/T4 fill  |
| ART-15b (feed host waits on G-M14-05) | `test/articles/ART-15b.test.ts`                                                           | T8                       |
| ART-24b, ART-25                       | `test/articles/ART-24b.test.ts`, `test/articles/ART-25.test.ts`                           | T8                       |
| ART-26a                               | `test/e2e/m14-axe.spec.ts` (the M14 surfaces: export row, C-16, wiping screen)            | T3/T4, T8                |
| ART-28, PERF-05…PERF-18               | `test/perf/probes/budgets.test.ts`                                                        | T5                       |
| ART-30                                | `test/articles/ART-30.test.ts`                                                            | T6                       |
| UX-01-01…05, UX-25-07…13 (native)     | `test/installer/native-steps.test.ts`                                                     | T2                       |
| UX-25-03…06                           | `test/fidelity/ux/UX-25.privacy.spec.ts`                                                  | T3 (03, 04), T4 (05, 06) |

Every row is `pending` until its ticket lands the test and flips it to `live` in the same commit (FID-18). A ticket may move
its own row to a different file inside the paths it owns, in the commit that adds the test, citing this CR. Each PERF row's
Spec § cell names the milestone that makes it measurable (pack §4 table); PERF-01…04 keep their M0–M2 rows (T5 wraps them,
also at 225 %). ART-24b, ART-25 and ART-15b have no ticket before the RC: T8 owns them unless an earlier ticket claims them.

## (b) Fidelity exit and picks (pack `prep/M14.md` §6, §8; each is the pack's reviewed "Recommended" option, DECISIONS X-177)

1. **Native capture kind (G-M14-10).** UX-01-01…05 and UX-25-07…13 are drawn by Windows (NSIS pages, Downloads, SmartScreen,
   Settings → Apps). `golden/manifest.json` marks them `capture: "native"`: string payload equality (`strings.nsh` = en-IN
   keys) plus manual list items 1 and 10 on Windows 10 and 11; no Tier B. Tier B at the RC = 233 steps × 2 themes.
   UX-01-01 is checked on the first **signed** build; the tester RC files a manual record of the SmartScreen path (G-M14-06).
2. **Early steps handed on (G-M14-08, G-M14-09).** UX-01-06…08 are M12's (CR-0016 adds them as EARLY_STEPS; G-M12-04: -06/-07
   now, -08 after M11); UX-25-01/-02 are M13's (CR-0017, G-M13-08). M14 re-runs them on the installed build in T8. This CR does
   not touch `EARLY_STEPS` so the two CRs own their lines.
3. **Disputes (G-M14-07, G-M14-11).** UX-01-05 draws foo's "f" in the taskbar and tray: X-143 replaced it with the two-eyes face
   (r4 disputed). UX-25-11 draws the sub-line "Signing foo out of Google and WhatsApp…": 09 §9.23.2 has "Removing foo…" and the
   bar only, and the written spec wins (r1 disputed). Both rows are in `docs/fidelity/disputes.json`.
4. **Copy areas (G-M14-12, G-M14-13).** 08-0 §D gains the areas `installer` and `uninstaller` (09 §9.3.2, §9.23.2 words, and
   the research J1 unsupported-Windows line verbatim as `installer.unsupported.*`). NSIS cannot call `t()`: T2's
   `scripts/build-installer-strings.ts` generates `build/installer/strings.nsh` LangStrings at package time and a test fails
   on any quoted literal in `build/installer/**/*.nsh`. The keys sit in `scripts/copy-pending.json` until that generator
   counts as their use.
5. **Folder slot (G-M14-17).** "Documents\foo" in the uninstaller's done line and in C-16 is the slot `{folder}`, filled with
   the display path of `files.outputFolder`; the words are exactly the spec's when it is `Documents\foo`. `UninstallResult`
   gains `outPath`.
6. **Switches (G-M14-14, G-M14-15; X-124).** `foo.exe --install-readiness --start-with-windows=0|1` (≤ 15 s) and
   `--uninstall-cleanup --mode=delete|keep [--export-to "<folder>"]` (≤ 90 s) run main only, with no window, tray or engine,
   and are refused (exit 2) while another foo holds the lock. `--uninstall-probe` (writes `{LOCAL}\uninstall-probe.json
{ jobs }`) and `--uninstall-quit` (`jobs.pauseAll`, quit ≤ 10 s) reach the running foo through `second-instance`, never
   show or focus it, and are refused (exit 2) when no foo runs. `src/main/cli/argv.ts` routes all four; exit codes 0 ok,
   1 failed, 2 refused, 3 no handler yet. The two hook lines are in `windows/singleInstance.ts` (M11's activation file) and
   `index.ts`.
7. **`ReadinessResult` (G-M14-14, merger decision C).** 08-5 l.57's type gains `appdata: 'ok'|'network'`,
   `documents: 'ok'|'online_only'`, `sleepAcMinutes: number|null` (stored only, no new user copy); `webview2` is always 'ok'.
   M14 owns `src/main/install/readiness.ts` (T2); M12 calls it on first launch when `install.readiness` is absent.
8. **{LOCAL} (G-M14-16).** Delete everything removes `{DATA}` and `{LOCAL}` (the uninstaller reads `uninstall-result.json`
   first); Keep my data keeps both and deletes only the result and probe files; the in-app wipe deletes both.
9. **Welcome back (G-M14-18).** `thread.welcome_back.line` "Welcome back, {name}. Everything’s where you left it.", posted once
   on the first launch of a reinstall whose `{DATA}` has a finished setup and whose AI verify passes. M12 owns the skip.
10. **Export (G-M14-19…21).** Main runs export in a main-owned `worker_thread` (the helper has no engine); one in-house zip
    writer on `node:zlib` (`deflateRawSync`, `crc32`), no new dependency, shared later with M6's memory export and M11's
    report. Row failure lines: `EXPORT_SECRET_FOUND` its own line, `DISK_FULL` the `DISK_LOW` card + the generic line, else
    the generic line; a partial zip is always deleted.
11. **Wiping screen and partial wipe (G-M14-22).** Test ids `screen-wiping`, `screen-wiping-progress`; copy
    `screen.wiping.title`. `PARTIAL_WIPE` has no line of its own: after the restart foo's chat posts the 09 §9.23.3 branch
    sentences as `thread.wipe.cred_failed` / `thread.wipe.files_locked` and C-16's offline line as `thread.wipe.google_offline`.
12. **Ownership (G-M14-23, merger decision D).** M14 owns `screens/settings/privacy/{ExportRow,DeleteAllRow}.tsx`,
    `screens/confirms/C16DeleteEverything.tsx`, `screens/Wiping.tsx`, `screens/settings/about/VersionLine.tsx`, the copy keys
    `settings.privacy.row.{export,delete_all}.*`, `dialog.c_16.*` and the test ids `settings-row-privacy-export`,
    `settings-row-privacy-delete-all`, `dialog-c-16`. M13's PrivacyPage and AboutPage mount them.
13. **Tester build (G-M14-24).** Compile-time define `__FOO_TESTER_BUILD__` (vite `define`; true unless the release workflow
    sets `FOO_SIGNED_BUILD=1`); no new IPC.
14. **Perf (G-M14-25 as changed by review, G-M14-26, G-M14-27).** No `FOO_PERF` variant: the runner copies a generated
    `perf.db` into the real `{DATA}` and launches the unchanged installed build; durations are tech-log rows
    `evt: 'perf.PERF-nn'`. The reference OS of 08-3 §20 is Windows 10 22H2 **and** 11 (10-1 §A.6 wins; DECISIONS X-171 records
    it, the chapter text stays frozen). Both arches build; ARM64 runtime stays UNVERIFIABLE until an ARM64 PC exists.
15. **Rest (G-M14-28…34).** AT-277 is M14's row (merger decision B); AT-001's row is M14's, M11 proves the toast half; any
    UX-23 step unblessed by the RC is blessed in T8; evidence PNG/CSV/JSON on the `evidence` branch, videos only with test
    data, stranger media private; the CI-only uninstall switch `/MODE=delete|keep` works only with `/S`; M15 owns
    `build/installer/sendto.nsh` (`!include /NONFATAL`); the release-gate items outside code go in `docs/release/rc-checklist.md`.

Picks T1 made where the spec is silent:

16. **Many saved items.** 09 §9.23.3 words the one-item case and mentions "{n} saved item(s)". `*.branch.cred_failed` keeps the
    spec sentence with the item in words as `{item}` ("your IRCTC login"); `*.cred_failed_many` is "I couldn’t remove {n}
    saved items: {items}. Remove them in Credential Manager." for two or more.
17. **"{n} jobs are still running."** stays word for word (the uninstaller shows it only when jobs are running); no plural
    form is invented.
18. **Data channels.** The `data:*` shapes are fixed in `src/shared/ipc.ts` as `DataInvokes` / `DataEvents`. T3 and T4 move
    each row into `Invokes` / `Events` in the commit that adds its handler, zod schema, renderer reducer and the preload
    allow-list lines, because `SCHEMAS` and the reducers must cover every channel.
19. **ErrorKind.** `EXPORT_SECRET_FOUND`, `DISK_FULL`, `PARTIAL_WIPE` (08-3 §21) join `ErrorKind`.

## (c) Vikas's own calls (G-M14-01…05), answered by Vikas 2026-10-18 18:42Z

His message "M11-M14 choices: 1A 2A 3A 4B 5A 6A" (project thread, recorded in `prep/GAPS-2-for-review.md` §"Need Vikas's own
call"):

- **G-M14-01** recommended: testers stay unsigned (X-44); a certificate is bought before anyone outside the test group
  downloads (Azure Trusted Signing if eligible, else OV/EV). T7's signing step stays dormant until the secrets exist.
- **G-M14-02** recommended: Vikas names one reference laptop plus a Windows 10 22H2 install; until then CI runs PERF smoke and
  the budgets block the public release (the tester RC is allowed with a GAPS line).
- **G-M14-03** **not** the recommendation: no stranger test for the tester build. The stranger test (3 people, recordings and
  consent private, anonymised score sheets in the repo) runs only before the **public release**. It leaves T8's tester-RC
  exit and joins the public-release gate in `docs/release/rc-checklist.md` (T6).
- **G-M14-04** recommended: the reviewer agent pre-checks every P0 folder; Vikas does the G.14 pass on one compare page.
- **G-M14-05** recommended: GitHub Releases on the repo (tester builds as pre-releases), electron-updater `github`
  provider. The update-check hosts join ART-15b's allowed list for update checks only, when M11's updater lands.

## (d) Not changed

`EARLY_STEPS` (M12, M13 own their lines), `settings.ts` (T2 adds the `install` section with readiness), the IPC router,
reducers and preload lists (T3/T4), `OWNERS.yml` (its `'*'` row already owns every M14 path, FID-19).

## (e) Independent review

Fable reviewer, 2026-10-18 ~18:45Z, read-only, against 09 §9.3.2, §9.5, §9.23.2–§9.23.4, 06-2 l.232–238 and l.307, 06-3
l.320, 08-1 l.417/419/451, 08-5 l.57, 08-3 l.448/l.555, research J1 l.415, DECISIONS, `prep/M14.md` §4/§6/§8 and the T1
ticket. Verdict **PASS WITH FIXES**: every copy key matches the spec words (only ’, `{folder}` and slot names differ; the one
new line is pick 16); the trace rows cover pack §6; `NATIVE_STEPS` is exactly the 12 steps; the types match.

- Act (fixed): a probe or quit switch that loses the lock on purpose exited "refused"; it now exits 0
  (`lockLostExitCode`, unit case), helpers still exit 2.
- Consider (taken): the running foo logs `CLI_HANDLER_FAILED` when a probe/quit handler fails; this section filled before
  the status flip.
- Consider (noted for tickets): T4 drops `errors.partial_wipe.*` from its ticket text (pick 11); T2's "result file missing"
  fallback uses the spec words `Documents\foo` for `{folder}`.
