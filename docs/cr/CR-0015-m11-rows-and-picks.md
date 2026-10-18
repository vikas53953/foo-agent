# CR-0015: M11 trace rows, the native Windows refs, and the picks the M11 build makes where the spec forks

- **Asked by:** the M11 integrator (ticket T1, `/mnt/project-files/foo/prep/M11-tickets.md`), 2026-10-18, while building M11
  (foo-plan §5 M11).
- **Spec sections:** 09-windows §9.2, §9.4, §9.7–§9.10, §9.12–§9.17, §9.19.2, §9.20–§9.22; 08-0 §A, §C, §D, §G.9; 08-1 §2.3,
  §2.4, §3.2, §3.3; 08-2 §5.4; 08-3 §15.1, §15.3–§15.5, §18, §21, §22.8; 08-5 §6; 05-1 §5.3; 05-3 §5.25; 06-3 §16–§18;
  02-2 §F15.9; 10-acceptance-1 §B; 10-acceptance-2 §C.6, §D, §E; 11-fidelity §11.2.5, §11.2.7, §11.12 (row M11); CR-0007 §(e).
- **Status:** Approved by Vikas's approve-on-my-behalf rule (his message 2026-10-18 14:56Z), after the independent review in
  §(f), DECISIONS X-168
- **Change:** `spec/trace.csv` (rows below), `spec/constitution/DECISIONS.md` (row X-168); `scripts/golden-manifest.ts`
  (`BP_M11`, `STEP_MILESTONE`, the optional `capture: 'native'` field on `BpEntry`) and `golden/manifest.json` regenerated
  (`pnpm golden:manifest`); `docs/fidelity/disputes.json` (§(c)). No other `spec/` or `golden/` file changes.
- **Manifest:** `pnpm tsx scripts/spec-verify.ts --write` run in the same commit.

## (a) Trace rows (`spec/trace.csv`), Milestone M11

| Id                                             | Test file                                   | Status  |
| ---------------------------------------------- | ------------------------------------------- | ------- |
| AT-001 (toast part), AT-011, AT-086            | `test/e2e/m11-toasts.spec.ts`               | pending |
| AT-028, AT-029, AT-135, AT-206                 | `test/e2e/m11-voice.spec.ts`                | pending |
| AT-087                                         | `test/integration/notify/taskbar.test.ts`   | pending |
| AT-088                                         | `test/integration/notify/quiet.test.ts`     | pending |
| AT-089 (dialog path)                           | `test/e2e/m11-quit.spec.ts`                 | pending |
| AT-090                                         | `test/unit/notify/toastXml.test.ts`         | pending |
| AT-108 (toast/taskbar part, from M4)           | `test/integration/notify/needs-you.test.ts` | pending |
| AT-121 (toast part, from M5)                   | `test/integration/notify/approval.test.ts`  | pending |
| AT-134                                         | `test/integration/voice/openai.test.ts`     | pending |
| AT-136                                         | `test/integration/voice/fallback.test.ts`   | pending |
| AT-137 (voice hosts)                           | `test/articles/ART-15b-voice.test.ts`       | pending |
| AT-221                                         | `test/integration/notify/locked.test.ts`    | pending |
| AT-271                                         | `test/integration/face-raster.test.ts`      | pending |
| ART-06a (voice "yes"), ART-18b (spoken "stop") | `test/integration/voice/articles.test.ts`   | pending |
| ART-19b (toast part)                           | `test/articles/ART-19b-toast.test.ts`       | pending |
| ART-23b (voice, manual)                        | `test/articles/ART-23b.manual.md`           | pending |
| ART-27 (manual)                                | `test/articles/ART-27.manual.md`            | pending |
| PERF-09                                        | `test/perf/PERF-09.spec.ts`                 | pending |
| PERF-10                                        | `test/perf/PERF-10.spec.ts`                 | pending |
| UX-21-01…11                                    | `test/fidelity/ux/UX-21.notify.spec.ts`     | pending |
| UX-09-02…07                                    | `test/fidelity/ux/UX-09.voice.spec.ts`      | pending |
| UX-23-10                                       | `test/fidelity/ux/UX-23.errors.spec.ts`     | pending |
| UX-10-07 (from M5, G-M5-09)                    | `test/fidelity/ux/UX-10.choice.spec.ts`     | pending |
| BP-WIN-01…04                                   | `test/fidelity/bp/BP-win.spec.ts`           | pending |

Every row is `pending` until its ticket (T2–T8, LF for the AT-271 send side) lands the test and flips it to `live` in the same
commit. Rows that need another milestone stay pending until the integrator merges it (pack §5 "blocked by"). Notes:

- **UX-09-01 and UX-09-08** already have M2 rows (CR-0003, `firstTested: M2`); M11 runs them in the same spec file, so no new row.
- **The Job Object row** (CR-0007 §(e), 08-2 §5.4 l.119: (a) Stop kills the tree ≤ 1 s, (b) engine crash leaves no orphan,
  (c) main exit → KILL_ON_JOB_CLOSE, (d) addon missing → taskkill fallback) has no AT / ART / PERF / UX / BP id, and FID-18
  (`scripts/trace-check.ts`) refuses a row without one. It is tracked here and in implementation-notes "M11 · contracts"
  instead: T2 owns `test/integration/native/jobobject.test.ts` on windows-latest, and the M11 close-out lists its result.
- **AT-277** is a note only: its trace row belongs to M14 (merger decision B, G-M14-30 pattern); M11 T7 files the icon /
  taskbar / FooMark half under `qa-evidence/M11/` like AT-001's window half.
- **AT-283** goes to M13 (G-M11-18); M11 adds no row.
- **UX-07-01** (the brief arriving as one toast) stays M7's step; M7 records its toast frame as UNVERIFIABLE until M11, and
  M11 T8 runs the toast part with the real `Notifier` after M7 merges (no new row; the M7 row names the file).
- **09 §9.25 rows** (9.25.1…16) have no trace id; they are asserted inside `test/e2e/m11-*.spec.ts` and the manual list
  (`qa-evidence/M11/manual/`), as the pack §5 table says.

## (b) Blueprint ids (`scripts/golden-manifest.ts` `BP_M11`) and step milestones

G-M11-04: the frozen Blueprint's "Living in Windows" section (`#windows`) draws four native surfaces. They get ids with kind
`native` (11 §11.2.5): the automated check compares the payload exactly (toast XML from the `Notifier` fake, the tray menu
template, the overlay description); the picture part is manual (list items 2–4 on Vikas's PC, `qa-evidence/M11/manual/`).

| Id        | Selector                                  | Surface         | Spec       |
| --------- | ----------------------------------------- | --------------- | ---------- |
| BP-WIN-01 | `#windows .panel:nth-child(1) > .toast`   | Payment toast   | 09 §9.9.3  |
| BP-WIN-02 | `#windows .panel:nth-child(2) > .toast`   | Choice toast    | 09 §9.9.3  |
| BP-WIN-03 | `#windows .panel:nth-child(3) > .taskbar` | Taskbar overlay | 09 §9.10.1 |
| BP-WIN-04 | `#windows .panel:nth-child(3) > .menu`    | Tray menu       | 09 §9.8.4  |

The pack proposed BP-WIN-02 as the Message toast, -05 jump list and -06 tray icon states. The Blueprint draws a **Choice**
toast (not a Message toast) and has no panel for the jump list or the tray icon states, so BP-WIN-02 is the Choice toast
(its toast path is M5's answer, tested after M5 merges) and -05 / -06 are dropped, as G-M11-04 says. The jump list tasks and
the tray icon states are still checked as payloads by T3 / T4 / T7 tests and on the manual list.

`BpEntry` gains an optional `capture: 'native'` (absent = `window`). `STEP_MILESTONE` sets the milestone of two steps by CR
instead of by chapter: **UX-23-10** (safe mode; chapter `errors` has no owner) → M11 (G-M11-31), **UX-10-07** (a choice
answered from the notification) → M11 (G-M5-09, from M5's pack; M5 unit-tests the `resolved_by='toast'` path with a fake
notifier). UX-21 (`notify`) and UX-09 (`voice`) are M11 by chapter already. UX-21-05 stays superseded by "05 §0.10 (toast
without reply box)": build the toast with no reply box.

## (c) Disputes (`docs/fidelity/disputes.json`, 11 §11.2.7)

| Ids       | Checks | Why (spec wins over the frame)                                                                         |
| --------- | ------ | ------------------------------------------------------------------------------------------------------ |
| UX-21-03  | r1, r4 | "f" with an amber "!" vs 09 l.290 amber disc with the count, and X-143 (no "f"); G-M11-05              |
| UX-21-06  | r1     | "until 10:00 AM, Fri 16 Oct" vs 09 l.175 / X-11 (today → time only; another day → day first); G-M11-08 |
| UX-21-07  | r1     | tooltip "foo · quiet until 7:00 AM" is not in 09's ladder (l.160) → "foo · all quiet"; G-M11-07        |
| UX-21-10  | r1     | jump list "Search" vs 09 l.331-334 "See what needs you"; G-M11-06                                      |
| UX-09-02  | r1     | "Getting voice ready (one time, about 150 MB)…" vs X-22 "Setting up voice notes… {n}%"; G-M11-10       |
| UX-09-06  | r1     | "No, let me redo it" vs 05-3 l.686 / AT-206 "No, let me retype"; G-M11-11                              |
| BP-WIN-01 | r1     | the toast logo letter "f" vs X-143 (the living face picture, 09 §9.9.2)                                |
| BP-WIN-03 | r1, r3 | taskbar "f" with an "2" disc in `#A04807` vs 09 §9.10.1 (`#F5B041` disc, face icon X-143); G-M11-05    |
| BP-WIN-04 | r1     | menu "Pause all jobs" vs 09 §9.8.4 final menu (Pause routines, Quiet until…, Stop everything…)         |

UX-09-08 (G-M11-12) needs no new row: CR-0003 already disputes its words (r1, r2) and CR-0004 its colour (r3, r4); M2's
composer notice "I can't hear you. Windows is blocking the microphone for foo." stays.

## (d) Picks for the M11 gaps (pack `prep/M11.md` §8; each is the pack's "Recommended" option)

1. **G-M11-01** Job Object wiring: EngineToMain `proc.track { pid, purpose: 'ai_cli' | 'whisper' }` (fired right after spawn, before stdin) and `proc.kill { pid }` (awaited ≤ 1 s, then today's `taskkill /PID {pid} /T /F` sweep); main keeps one Job Object per pid with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`; EngineSupervisor kills every tracked job when the engine exits; addon missing → taskkill only. Closes CR-0007 §(e) pick 1.
2. **G-M11-02** Voice replies: EngineToMain `voice.synthesize { text, lang, outPath }` → `ok` | `VOICE_UNAVAILABLE`; the engine decides skip rules and voice choice, main only calls the addon.
3. **G-M11-03** M11 (T2) creates the `foo-native` scaffold (`binding.gyp`, loader, `fallback.js`) and T1 the `index.d.ts` with the **full** 08-5 §6 list; M10 adds only `hello.cc` and its `binding.gyp` source line, M9 only `wintrack.cc`. `index.d.ts` moves from M10's list to M11.
4. **G-M11-04** BP-WIN ids as in §(b): kind `native`, payload compared exactly, picture manual; ids the Blueprint has no panel for are dropped.
5. **G-M11-05** 09 l.290 wins over UX-21-03 (amber disc with the count, no "f"); disputed in §(c).
6. **G-M11-06** 09's four jump-list tasks win over UX-21-10's "Search"; disputed.
7. **G-M11-07** 09's tooltip ladder wins (quiet with nothing running → "foo · all quiet", closed-eyes icon); UX-21-07's tooltip text disputed.
8. **G-M11-08** 09 l.175 / X-11 time order wins over UX-21-06; disputed.
9. **G-M11-09** No SafeMode screen (same answer as G-M11-20).
10. **G-M11-10** X-22 words "Setting up voice notes… {n}%"; Tier R runs UX-09-02 on the no-key seed after "Use this PC instead"; frame text disputed.
11. **G-M11-11** "No, let me retype" (the card owner 05-3 and AT-206); UX-09-06 disputed.
12. **G-M11-12** Mic blocked stays M2's composer notice (04 owns the composer, 08-3 §21 routes `MIC_BLOCKED` there); AT-029's "card has one button" reads as that notice's one button `app:openWindowsSettings { page: 'privacy-microphone' }`; UX-09-08's words stay disputed (CR-0003).
13. **G-M11-13** New setting `notifications.quietOverride: { mode: 'quiet' | 'awake'; until: number } | null` (default `null`); tray "Until …" → `{ mode: 'quiet', until }`, "End quiet time" → `{ mode: 'awake', until: end of the current quiet period }`; M7's `quietHours.isQuiet` reads it (requested from M7 / wired at the M11 close-out; M11 does not edit `quietHours.ts`).
14. **G-M11-14** Event `update:status { status: 'none' | 'checking' | 'downloading' | 'ready' | 'failed' | 'waiting_wifi'; pct?; version? }`; invokes `app:restart { confirm?: boolean } → { restarting; blocked?: 'payment'; runningJobs; pendingCards }` and `app:downloadUpdate {} → void`.
15. **G-M11-15** Main asks for the dialog with a new event `app:closeAsk { dialog: 'c-18' | 'quit'; runningJobs; paymentInFlight: { amountPaise } | null }` (the pack's `navigate { view: { kind: 'dialog' } }` would add a dialog kind to `View`, 08-0 §G.10, which every view consumer would then have to skip; the quit body also needs the counts); new invoke `app:closeChoice { choice: 'tray' | 'quit'; dontShowAgain: boolean } → void`; dialog slug `quit` → test id `dialog-quit` joins the X-118 list.
16. **G-M11-16** `Notifier` typed in `src/main/notify/types.ts` (`show`, `close`, `closeGroup`, `closeAll`; `ToastSpec`, `BadgeState`); if M7 merges first with its own interface, M11 adopts M7's and adds only the missing methods.
17. **G-M11-17** (wiring, build order only; merger decision A) The living face is the standalone **LF** ticket (branch `claude/foo-living-face`, draft PR straight to main, renderer-only, no spec/golden change, no CR of its own; its AT-271 row rides this CR). M11 T7 and M12 T4 own only its consumers. Until LF merges, tray and toasts use the letter-disc fallback PNG. No look change.
18. **G-M11-18** AT-271 → M11; AT-277 → M14 (single trace row owner; M11 and M12 file their halves as notes, G-M14-30); AT-283 → M13 (M11 only keeps Windows "Animation effects" → `data-motion="off"` live).
19. **G-M11-19** 09 l.327 wins: jump-list icons stay `foo.exe` index 0; "jump list" is dropped from AT-011 and PERF-10; M11 changes the face by the seeded identity setting, M12 re-runs through the picker.
20. **G-M11-20** No `renderer/screens/SafeMode.tsx`: M11 wires `card-error-report` → `dialog-report` and "Start normally" relaunch on M4's card; the Routines page banner is M7's and the Doing-now line M4's (requested from their owners).
21. **G-M11-21** `{OUT}` = `settings.files.outDir`, default `Documents\foo` (08-1 l.61), so reports go to `{OUT}\reports\` and 08-1 and 09 agree.
22. **G-M11-22** Choice card purpose `voice_confirm` (added to 08-0 l.391's list): no Best fit, no auto-pick, no reminder, no toast button; Yes → the transcript is handled as the user's (prompted) message; No → composer focused, field unchanged, nothing acted on. The `ChoicePurpose` type itself lands with M5's Choice card.
23. **G-M11-23** The voice-note toast is a Message toast with 05's body "{chat} · 🎙 Voice note (0:12)" and 09's two buttons; private chats keep X-132's body.
24. **G-M11-24** T6 captures `test/fixtures/whisper/output-full.json` on windows-latest from the pinned `whisper-cli` + `ggml-base`; that fixture is binding for the field names; if they differ from 08-3 l.405 the close-out records the real names under this CR.
25. **G-M11-25** The metered rule stays literal (`networkCost() !== 'unrestricted'` → no download; About line "Update waiting for Wi-Fi without a data limit." [ Download now ]); a build without the addon logs `NATIVE_UNAVAILABLE`; shipped builds carry the addon.
26. **G-M11-26** Tray "Doing now: …" opens `foo://chat/{chatId}/card/{checklistCardId}` (an existing 08-0 §G.9 route).
27. **G-M11-27** 09 (the toast owner) wins: locked-screen toast title "foo", body "1 thing needs you" / "{n} things need you"; AT-221's "{agentName} · 1 thing needs you" is read that way.
28. **G-M11-28** T4 adds `power.batterySaver` (main state from `powerMonitor`, not a setting) and the clock check (at +20 s and on resume, comparing with the HTTPS `Date` header of a response the AI host already returned, no request to any new host, until G-M14-05 decides the update-feed host); > 5 min off → J19.6 card through M4's Error card; M7's scheduler reads the flag (close-out wire).
29. **G-M11-29** Taskbar overlay descriptions use `notifications.taskbar.{needs_you,done}` (no new copy area).
30. **G-M11-30** (logistics, not a Vikas call) Win11 rows run on Vikas's PC at M11 (batched with M10's Hello session); Win10 rows are filed UNVERIFIABLE with a named check at M14 on the G-M14-02 reference laptop or a Win10 VM.
31. **G-M11-31** UX-23-10 is tagged M11 only (UX-23-07/-08 → M10; UX-23-01…06, -09, -11 → M4 early steps, CR-0008).

G-M11-17 and G-M11-30 are wiring and logistics picks; like the other wiring picks they are covered by Vikas's 2026-10-18 13:34Z
approval ("yes go with plan which u purposed", GAPS-for-review) and his approve-on-my-behalf rule (14:56Z).

**Copy.** T1 lands the copy keys for the tray, notifications, jump list, taskbar (`notifications.taskbar.*`), C-18, the quit
and restart dialogs and the hiccup line, with the spec's words (09 §9.8–§9.10, §9.20.4, §9.21). T5 appends `dialog.report.*`,
`dialog.whats_new.*` and `settings.about.update.*` (06-3 §16–§18, 09 §9.20.3); T6 appends the voice keys (05-3 §5.25, 08-3
§18, X-22). Every later addition is append-only. Keys landed before the ticket that renders them are listed in
`scripts/copy-pending.json` (empty by the M11 close-out). The morning-brief toast body "Good morning. {n} things today." (09 §9.9.3) is not
landed: ART-21a flags "today" without an absolute date (Article 21). The brief's owner (M7, 08-3 §14) words that body;
spec-keeper item for 09 §9.9.3's example.

## (e) Contract shapes T1 landed

- **Native.** `native/foo-native/index.d.ts` is the 08-5 §6 list with the 08-0 §E.2 shapes. `src/main/native/fooNative.ts`
  holds the fallback column (`FALLBACK`) and `loadFooNative()`: the addon (`require('foo-native')`, Windows only) is used
  export by export, a missing export or a load failure falls back. T2 adds the `.node`, `binding.gyp` and loader; its
  `fallback.js` is not needed (the TS fallback is the one table; T2's `test/unit/native/fallbacks.test.ts` tests it).
- **Engine ⇄ main.** `proc.track`, `proc.kill` (reply `{ native: boolean }`) and `voice.synthesize` (reply `ok` |
  `VOICE_UNAVAILABLE`) are EngineToMain requests (`MainRequestKind`). The routing is in `EngineBridge.receive` (where every
  EngineToMain kind is handled; `engineHost.ts` holds only the db ops). `EngineBridge.native` defaults to the no-addon answers;
  T2's `installNative` replaces it. `voice.synthesize` replies later through `EngineBridge.postReply`.
- **Notifier.** `ToastSpec` and `BadgeState` live in `src/shared/types.ts` (the FOO_TEST toast preview and the test bridge
  read them); `Notifier` in `src/main/notify/types.ts`. `NotificationKind`, `NotificationRequest`, `ToastAction` are 08-0 §B.2 /
  08-3 §15.1 verbatim. The recording fake is `src/main/test/fakeNotifier.ts` (re-exported as `test/fakes/notifier.ts`);
  FOO_TEST runs put it in `deps.notifier`.
- **Channels.** Invokes `app:restart`, `app:downloadUpdate`, `app:closeChoice` and events `update:status`, `app:closeAsk` in
  `src/shared/ipc.ts`, both preloads and `IpcRouter.SCHEMAS` (the IPC zod schemas live there, not in `shared/schemas.ts`,
  which holds the AI act schemas). Until T4 / T5 the handlers answer `UNKNOWN` "not built yet" (no `NOT_IMPLEMENTED` kind:
  08-3 §21 has none). Test channels `test:notifier` (live), `test:toastSetting`, `test:power`, `test:textScale`,
  `test:crashRenderer` (stubs) are in `src/main/test/m11/{notify,display,crash}.ts`, one file per ticket.
- **Install modules.** `src/main/index.ts` calls `installNative`, `installNotify`, `installTray`, `installLifecycle`,
  `installDisplay`, `installUpdater`, `installCrashGuard` once after the window exists (`InstallDeps` in
  `src/main/installDeps.ts`); each is a stub file its ticket replaces, so no ticket edits `index.ts`.
- **Errors.** `UPDATE_FAILED`, `VOICE_UNAVAILABLE`, `MIC_BLOCKED`, `MIC_MISSING` join `ErrorKind` (08-3 §21.3, 08-5 §6).
- **Not in T1.** `deeplink.parse` is T3's (`src/main/windows/deeplink.ts`); the `face:raster` send channel is LF's (it goes
  to main first). The renderer reducers for the two new events are no-ops until T4 / T5.

## (f) Independent review

TODO(review)
