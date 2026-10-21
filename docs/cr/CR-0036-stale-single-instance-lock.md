# CR-0036: a crashed foo never blocks the next start (stale single-instance lock)

- **Asked by:** the real-AI e2e run 8 of 2026-10-21 (main 516a344, journey U26 "foo crashes and is reopened at once"), under
  Vikas's ask of 2026-10-21 07:14Z: "keep on doing the end-to-end testing until you see that everything is working ... Do
  not wait for any go or approval from me".
- **Why:** U26 killed only the main foo.exe (as a crash or Task Manager's End task does) and opened foo again at once. Six
  foo.exe helper processes were still alive, and the new foo quit within 0.7 s with no window. 09 §9.5 says a refused
  lock means "quit immediately", which is right when a live foo owns the lock (it shows its own window) but leaves a
  user with nothing at all when the owner is dead and only its leftovers hold the lock. A non-technical user reads that
  as "foo is broken".
- **Spec sections:** 09-windows §9.5 (Lock row); copy keys `app.start_blocked.title`, `app.start_blocked.body` (en-IN).
- **Status:** Approved by Vikas on his behalf, DECISIONS X-194 (his rule 2026-10-18 14:56Z and his 2026-10-21 07:14Z
  message; after the independent review in §(c)).
- **Change:** `spec/constitution/09-windows.md` §9.5 Lock row gains the stale-lock rule; `spec/constitution/DECISIONS.md`
  row X-194. Code: `src/main/windows/staleLock.ts` (the rule, no Electron), `src/main/windows/singleInstance.ts` (its
  Windows seams: the owner file, the alive check, ending the dead owner's children), `src/main/index.ts` (the pre-ready
  steps run for any start that may go on; the ready work waits for the lock; the owner file is removed on quit).
- **Number:** X-194 is the decision id the coordinator assigned to CR-0036 (X-186..X-193 are held by CRs 0028..0035,
  some still on open PRs), so the gap after X-185 on main closes as those land.
- **Manifest:** `pnpm tsx scripts/spec-verify.ts --write` run in the same commit.

## (a) The rule

1. The lock owner writes its pid to `{userData}\foo-main.pid` (beside Chromium's own lock) and removes it in `will-quit`.
2. A refused lock with no owner file, or whose owner pid is running: the plain §9.5 rule, quit at once (a live foo got
   `second-instance` and shows its window). A stray file left by a crash and a pid reused by another program both fall
   back to this.
3. A refused lock whose recorded owner is not running: end the processes whose ParentProcessId is that pid and whose
   executable is this foo.exe (PowerShell `Get-CimInstance Win32_Process`; `taskkill /T` needs a live parent; the exe
   check keeps a reused pid from ending another program), then ask for the lock every 250 ms for up to 10 s. Got it →
   start normally (logged `LOCK_TAKEN_OVER`). Another start won it meanwhile (the owner file now names a different live
   pid) → quit at once, as in rule 2. Still refused → error box `app.start_blocked.*`, then quit (`LOCK_STALE_HELD`).
   PowerShell start-up can add 2 to 5 s to this path; it runs only after a crash.
4. "Running" on Windows means listed by `tasklist` under this foo's image name. `process.kill(pid, 0)` is not used
   there: it answers EPERM for an ended process whose handle the helpers still hold, which read as "a live foo" and
   kept the silent quit (seen on CI at abb45f9). Every refused start logs `LOCK_REFUSED` with why.
5. Until the lock is ours a start only reads settings (`SettingsStore.peek`), so a start that quits never writes over a
   live foo's `settings.json`. A failed owner-file write removes the file, so a dead pid never stays on record.

## (b) Not changed

- A second launch while foo runs: quits at once and the running window comes to the front (m0-window.spec.ts).
- `--uninstall-cleanup` and `--hidden` follow the same lock path.

## (c) Review and proof

- Failing first: `test/e2e/crash-reopen.spec.ts` (kill only the main pid, reopen at once and after 1.5 s, expect a window)
  was pushed alone and ran red on Windows CI before the fix.
- `test/unit/stale-lock.test.ts`: the rule over fake seams (free lock, live owner, no owner, dead owner taken over, still
  held after the wait, two starts racing after a crash) and the read-only settings peek.
- Independent review (Fable): PASS WITH FIXES. Acted on: the exe check before ending a dead pid's children, re-reading
  the owner while waiting (two double-clicks), removing the owner file when its write fails, read-only settings before
  the lock. See PR #108.
