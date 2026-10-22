# 09 · Windows integration

This chapter turns the platform evidence into final rules: identity, install, first launch, single instance, start at login, tray, toasts, taskbar, jump list, Focus, scaling, contrast, motion, keyboard, secure storage, Windows Hello, updates, crashes, power and uninstall. The shell layout itself is in `03-shell-1.md` / `03-shell-2.md`.

Evidence: **WIN** = `/mnt/project-files/personal-agent-re/ui-evidence/windows-platform.md` (its sources S1–S19, E1–E11 are cited as WIN [Sx]/[Ex]); **MSG**, **HRM**, **AGT**, **AIC** as in `02`; **J** = `research/journeys-1..4.md` (J1 install, J19 errors, J20 notifications, J21 settings, J23 uninstall).

Tags: `[exact]` official doc or source; `[reported]` secondary; `[foo decision]` chosen on purpose.

---

## 9.0 Laws for this chapter

| # | Rule |
|---|---|
| 9.0.1 | foo MUST behave as a native Windows app: system caption buttons with Snap Layouts, Windows toasts, a taskbar overlay badge, a tray icon, start at login, one instance (Article 27). |
| 9.0.2 | No OS surface (toast, tray menu, jump list, taskbar) may approve a payment. A toast button may open a card; only a tap on the card inside foo's window approves it, plus Windows Hello at or above the Hello threshold (Article 7). |
| 9.0.3 | foo MUST NOT bypass Windows Focus / Do not disturb, steal focus from the background, or flash the taskbar in a loop. |
| 9.0.4 | No OS surface ever shows a secret, OTP, card number, full third-party email address or full message body (Article 8). |
| 9.0.5 | All copy here is final. No banned words (Article 2). |

---

## 9.1 Supported Windows

| Item | Value | Evidence |
|---|---|---|
| Minimum | Windows 10 22H2 (build 19045) and Windows 11 (22000+), x64 and ARM64 | J1 preconditions `[foo decision]`; WIN targets 1809+, narrowed to builds Microsoft still updates |
| Older Windows | installer screen: "foo needs Windows 10 (22H2) or Windows 11. Your PC has {version}." [ Close ] | J1 branches |
| Win10 differences | square window corners; Windows Hello uses `RequestVerificationAsync` (§9.19.3); everything else identical (foo uses no Mica, `03` §3.1.1) | WIN §1.1, §16.4 `[exact: S19]` |

---

## 9.2 App identity

| Item | Value | Evidence |
|---|---|---|
| Product name | "foo" | |
| Executable | `foo.exe` | |
| AppUserModelID | **`com.foo.desktop`**, one fixed string, set with `app.setAppUserModelId('com.foo.desktop')` as the first line after `app` is created and before any window or notification. The installer writes the same AUMID on the Start menu shortcut. Never `process.execPath`. | WIN §16.1 `[exact: E5, E6]` "Without it, toasts silently fail" |
| `win.setAppDetails` | `{ appId: 'com.foo.desktop', appIconPath: <foo.exe>, relaunchCommand: '"<foo.exe>"', relaunchDisplayName: 'foo' }` | WIN §16.2 `[exact: E3]` |
| URL protocol | `foo://` registered per user (`app.setAsDefaultProtocolClient('foo')`). **The route table is exactly 08-0 §G.9 (X-67; incl. `foo://ideas` → `{ kind: 'screen', id: 'ideas' }`)**; this chapter lists no routes of its own. Any other URL is ignored and logged `URL_NOT_ALLOWED`. The handler emits the renderer event `navigate { view, act? }` (08-0 §G.10). | `[foo decision]` for toast, jump list and tray activation |
| App icon | multi-size `.ico` with 16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72, 80, 96, 256 px [X-27]: the foo logo: the two-eyes face in its static Resting pose (X-143; master `foo/look-book/assets/logo-face.svg`), `--fg-1` light value `#0B0B10` disc with `#FFFFFF` eyes, plus a `#3A3A44` rim (1px at 32px, 2px at 64px and up, none at 16/20) so the dark disc shows on dark taskbars (02 §F14.7, §F15.1) | MSI 14 target sizes `[reported]` via 02 §F14.7; BP1 foo avatar `[exact]` |

J1 "Stored" names the AUMID `foo.app`; this chapter overrides it (§9.24).

---

## 9.3 Installer

### 9.3.1 Technology

| Item | Value | Evidence |
|---|---|---|
| Type | electron-builder **NSIS, per-user, assisted** (`oneClick: false`, `perMachine: false`, `allowElevation: false`) | WIN §16.5 per-user, no UAC `[reported]`; assisted mode is needed for J1's screens and J23's uninstall choice `[foo decision]` |
| Install folder | `%LOCALAPPDATA%\Programs\foo\` (not user-changeable) | electron-builder per-user default `[foo decision]` |
| Data folder | `%APPDATA%\foo\` (J storage map) | J §3 |
| Signing | installer, `foo.exe` and every native addon signed (Azure Trusted Signing or EV) before anyone outside the named test group installs foo; the public release MUST be signed. Builds for the named test group may be unsigned: testers see SmartScreen's "Windows protected your PC" and click "More info" → "Run anyway" [settled: X-44, Vikas chose "Stay unsigned for testers"]. | WIN §16.5, M27 `[reported]`: SmartScreen "Windows protected your PC" reads as malware |
| Send to | the installer creates `%APPDATA%\Microsoft\Windows\SendTo\foo.lnk` → `foo.exe --send-to "%1"` (Windows appends each selected path; behaviour 12-2 §12.29.2); update keeps it, uninstall removes it (§9.23.3) | 12-2 §12.29 |
| Shortcuts | Start menu "foo" with AUMID; **no** desktop shortcut | WIN §16.5 `[inferred]` |
| Registration | protocol `foo://` and the uninstall entry (Windows Settings → Apps). **No COM toast activator** is registered: every toast uses protocol activation (§9.9.1); "Electron's COM activator" is withdrawn (INT-07). | INT-07 review; WIN §16.1 evidence corrected |

### 9.3.2 Screens (final copy; from J1)

| Screen | Content |
|---|---|
| 1 Welcome | Title "Install foo". Body "foo is your personal helper. It lives on this PC and uses the AI you already have." Checkbox (ticked) "Start foo when I sign in to Windows". Buttons [ Install ] [ Cancel ] |
| 2 Progress | "Installing… this takes about a minute." + progress bar. No other copy. |
| 3 Done | "foo is ready." [ Open foo ]; opens foo by itself after 3 s |
| Not enough space (< 2 GB free) | "There isn't enough space on this PC. foo needs 2 GB free." [ Open storage settings ] (`ms-settings:storagesense`) [ Close ] |
| Already installed | "Update foo to {version}? Your chats and settings stay." [ Update ] [ Cancel ] |
| Install failed | "Something stopped the install. Nothing was changed on your PC." [ Try again ] |

Installer window: 480 × 360, Segoe UI 12pt (NSIS default font set to "Segoe UI"), foo icon top-left. The readiness check (Windows version, 2 GB free, Edge present, `%APPDATA%` not on a network drive, Documents not online-only OneDrive, sleep settings) runs silently at the end of screen 2 and stores results in `settings.json → install.readiness` (`ReadinessResult`, 08-0 §A; J1 step 4). The installer checkbox writes `install.startWithWindows`.

---

## 9.4 First launch

| Step | Rule | Evidence |
|---|---|---|
| 1 | Window opens at the default size (`03` §3.1.1: 1280 × 800, clamped to 90 % of the work area), centred, focused. | `03` |
| 2 | Onboarding runs as chat cards inside foo's chat (J1–J5). No separate wizard window. | J1 |
| 3 | foo does **not** ask Windows for notification permission (Windows has none to ask). Toasts work from the first launch. If toasts are blocked, the banner in `03` §3.3 type 6 shows. | WIN §16.5 `[exact]` |
| 4 | Start at login follows the installer checkbox (§9.7). No second question in the app. | `[foo decision]` |
| 5 | Background running is explained at the **first close** (§9.8.2), not up front. | J20 |
| 6 | Tray icon appears at first launch with tooltip "foo · setting up" until J5 finishes. | J1 branches |

---

## 9.5 Single instance and activation

| Rule | Value | Evidence |
|---|---|---|
| Lock | `app.requestSingleInstanceLock()` is the first call after `setAppUserModelId`. If it returns `false`, the new process calls `app.quit()` immediately (before creating any window). **Stale lock (CR-0036, X-194):** the owner writes its pid to `{userData}\foo-main.pid` and removes it on a clean quit. When the lock is refused and that pid is no longer running (foo crashed or was ended in Task Manager and its helper processes still hold the lock), the new process ends the processes whose parent is that pid and that run this same foo.exe, asks for the lock again every 250 ms for up to 10 s and, once it has it, starts normally; if another start took it meanwhile (the pid file names a different running pid) it quits at once. Until it owns the lock a start only reads settings. If it is still refused it shows `app.start_blocked.title` / `app.start_blocked.body` in an error box and quits, never silently. | WIN §16.3 `[exact: E6]`; CR-0036 |
| `second-instance` | restore (if minimized), show (if hidden in tray) and focus the existing window; then route any `foo://` URL found in `argv` (the route table is exactly 08-0 §G.9). | WIN §16.3 `[exact: E6]` |
| Focus | `win.focus()` is called **only** for user-initiated activation: tray click, toast click, jump list, Start menu, second launch, `foo://` link. Never for background events. | WIN §18 avoid list `[reported]` |
| Toast activation | **Protocol activation only** (INT-07): a toast click or button starts (or signals) `foo.exe` with its `foo://` URL; Windows delivers it in `argv` to a new process (cold start: read in the first `ready` handler) or to `second-instance` (running). The single-instance handler (08-1 §2.2 step 1) routes it, so toasts sent before a restart still work. Electron has no `Notification.handleActivation`; it is not used. A cold start whose only activation is a `foo://` URL with `?act=not_now` or `?act=read` behaves like `--hidden` (window created with `show:false`, tray only) after handling the act (X-124). | INT-07; WIN §16.1 evidence corrected |
| Send to | `--send-to <paths…>` (first launch `process.argv` and `second-instance`): user-initiated activation; the files go to foo's own chat as attachments, at most 6 (04 §22.6 limit; 7+ → the first 6), per 12-2 §12.29.2–§12.29.3; `--send-to` wins over `--hidden`. | 12-2 §12.29 |
| Launched hidden | `--hidden` (start at login): create the window with `show: false`, do not show it; tray icon only. | WIN §16.3 `[exact: E6]` |
| Uninstall cleanup | `--uninstall-cleanup --mode=delete\|keep [--export-to "<folder>"]`: a **non-interactive** activation run only by the uninstaller (§9.23.4; X-124): main only, never shows a window or tray icon (`--hidden` semantics); refused when another instance is running (the uninstaller first quits it, §9.23.2 screen 1). | X-124 |

---

## 9.6 Window behaviour

| Item | Value |
|---|---|
| Frame, title bar, sizes, breakpoints, restore | `03` §3.1 and §3.2 |
| Snap | Snap Layouts come from the native maximize button (`titleBarOverlay`); foo MUST NOT intercept Win+arrow or Win+Z. `[WIN §1.2]` |
| Multi-monitor | per-monitor DPI aware (Electron default). Bounds are DIPs. Off-screen or removed display → re-centre on the primary display (`03` §3.1.2). `[WIN §16.6]` |
| Minimize | normal minimize to the taskbar |
| Close (✕, Alt+F4, Ctrl+W) | follows the close choice (§9.8.2): hide to tray (default) or quit |

---

## 9.7 Start at login

**Decision: ON by default** (the installer checkbox is ticked), launching hidden in the tray.

Why: foo's core promises run when the user is not looking: the morning brief at 8:00 AM, routines, approvals with 10-minute timers and jobs that resume after a restart (J6, J14, J19.5). If foo is not running after a reboot, all of those silently fail, which a non-technical user reads as "foo is broken". The checkbox on the first installer screen is visible consent; the user can turn it off there, in Settings, or in Task Manager. `[foo decision]` from WIN §16.3 "default on after onboarding consent" `[reported]` and J1 installer checkbox; HRM keeps tray off by default `[exact: DESIGN.md:128-137]` but is a developer tool.

| Rule | Value | Evidence |
|---|---|---|
| Register | `app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] })` | WIN §16.3 `[exact: E6]` |
| Read back | `app.getLoginItemSettings({ args: ['--hidden'] })`; if `executableWillLaunchAtLogin` is false while the setting is on (user disabled foo in Task Manager → Startup), Settings shows the row off with the line "Turned off in Task Manager. Turn it on there to change this." and foo MUST NOT re-enable it. | WIN §16.3 `[exact]` |
| Settings row | Settings → Account & your AI: "Start foo when I sign in to Windows" (toggle, `06` §6.1 `start-login`, writes `install.startWithWindows`, 08-0 §A) [settled: X-07] | J21 |
| Login start | window hidden; tray icon shows; heavy work (AI check, routine catch-up, update check) waits **20 s** after launch so Windows sign-in stays fast | `[foo decision]` |
| Missed routines | caught up once each after the 20 s delay (J14) | J14 |

---

## 9.8 Tray

### 9.8.1 Icon

| Item | Value | Evidence |
|---|---|---|
| Format | `.ico` 16/20/24/32 px; a light-taskbar and a dark-taskbar variant, swapped on `nativeTheme 'updated'` using `nativeTheme.shouldUseDarkColorsForSystemIntegratedUI` | WIN §14 `[exact: E8, E9]` |
| Base face | foo's living face (`02` §F15.9.6) [X-37], moving and with mood rings, unlike the still logo face of the app icon (§9.2, X-143): light taskbar disc `#0B0B10` / eyes `#FFFFFF`; dark taskbar disc `#F1F1F5` / eyes `#0D0D11` (`--fg-1` / `--bg-app` pairs). At 16px: eyes 2 × 5px at x 5 and 9, y 4, whole pixels; 20/24/32 hand-tuned. Static frames only; the tray never animates. Frames are read from `{DATA}\avatars\raster\{faceRef}-16-{mood}.png`, written by main from the renderer's `face:raster` event (X-124; main never draws a face); missing file → the letter disc PNG in `resources/`. If the user picked another face for foo (`02` §F15.5.1), the tray shows that face circle-cropped with the same state dots; Offline and Quiet hours then show the `#8E8E9A` dot. | `02` F2, §F15.9.6 |
| States (first match wins, across all chats; §F15.9.3e) | **Offline** (the Article 29 offline line is showing): dashed outline, grey eyes · **Needs you** (any card PENDING): `#F5B041` dot (`--warn` dark value) · **Working** (any job WORKING): `#8C9BFF` dot (`--accent` dark value) · **Paused** (AI limit or cap, a job WAITING): `#8E8E9A` dot (`--fg-3` dark value) · **Done** (a job turned DONE with proof in the last 10 s): `#4ADE80` dot (`--ok` dark value) · **Quiet hours** (inside quiet hours, nothing running): closed eyes (flat 1px lines at 16) · **Resting**: eyes, no dot. Dot: radius 2.6px at (13, 13) on the 16 grid (scaled at 20/24/32), with a 0.8px knock-out ring in the taskbar colour. | `[foo decision]`; `02` §F15.9.6 |
| Setting up | the face at 50 % opacity | J1 "grey f" |
| High contrast | monochrome face (disc outline and eyes) in the system window-text colour; state dot drawn as a hollow ring | WIN §12 `[exact: S15]` |
| GUID | tray icon created with a fixed GUID (signed builds only) so Windows keeps the user's "always show" choice across updates | WIN §16.3 `[exact: E8]` |

### 9.8.2 Close choice (first close)

The first time the user closes the window (✕, Alt+F4, Ctrl+W), foo shows a small dialog (`06` dialog style, width `--dialog-sm` 400px):

- Title: "foo keeps working in the background"
- Body: "So it can do your jobs, routines and morning brief. You'll find foo in the tray, next to the clock."
- Checkbox (ticked): "Don't show this again"
- Buttons: [ Got it ] (primary, default) [ Quit foo instead ]

Got it → hide to tray (`app.closeToTray = true`). Quit foo instead → quit flow (§9.8.4); next launch shows the dialog again unless the checkbox stayed ticked, in which case `app.closeToTray = false` ("quit on close") is saved. `app.closeDialogShown = true` once the dialog has been answered with the checkbox ticked (08-0 §A). Settings → Account & your AI row "When I close the window" (`06` §6.1 `close`, writes `app.closeToTray`) [settled: X-07]: "Keep foo running in the tray" (default) / "Quit foo". `[J20 step 1; WIN §16.3 reported]`

### 9.8.3 Tooltip and clicks

| Item | Value |
|---|---|
| Tooltip (first match wins) | "foo · setting up" · "foo · {n} things need you" ("1 thing needs you") · "foo · paused: {reason}" (reasons: "you're offline", "{AI} isn't answering", "AI cap reached", "{AI} limit until {time}") · "foo · keeping your PC awake for {n} jobs" (§9.22) · "foo · {n} jobs running" ("1 job running") · "foo · all quiet" |
| Left click | show and focus the window at the last open chat |
| Double click | same as left click |
| Right click | context menu §9.8.4 |

`[J20 step 2]`

### 9.8.4 Tray menu (final, in order; items with "only when" are hidden otherwise)

| Item | Only when | Action |
|---|---|---|
| "Open foo" | | show + focus |
| "Needs you ({n})" | n ≥ 1 | open the chat of the soonest-expiring waiting card, scrolled to the card, card focused |
| "Doing now: {job title} · step {n} of {m}" (one line per job, max 3, newest first) | ≥ 1 job WORKING | open that job's checklist |
| — separator — | | |
| "Pause routines until {10:00 AM}" (now + 1 hour, rounded up to the next 15 min; when that time is not today the label is day first: "Pause routines until {Sat 17 Oct, 12:15 AM}") / "Resume routines" | | toggles (`routine:pauseAll { hours: 1 }`); paused state shows in Routines (`06`); label uses the absolute time, day first per X-11 and Article 21 (UX-33) |
| "Quiet until…" ▸ submenu / "End quiet time" (while quiet) | | submenu options, each with an absolute time [settled: X-11]: "Until {Fri 16 Oct, 10:00 AM}" (today shows "Until 10:00 AM"; now + 1 hour, rounded up to the next 15 min) · "Until {Sat 17 Oct, 7:00 AM}" (the next configured quiet-hours end, Article 19). Choosing one starts quiet hours now until that time. Format exactly as X-11's example "Until Sat 17 Oct, 9:00 AM" |
| "Stop everything…" | ≥ 1 job not finished | shows the window with the J18 confirm |
| — separator — | | |
| "Settings" | | show window → Settings |
| "Quit foo" | | quit flow below |

Quit flow: if no job is QUEUED/WORKING/NEEDS YOU, quit at once. Otherwise a dialog: title "Quit foo?", body "{n} jobs are running. They'll pause and pick up when you open foo again. Nothing will be paid while foo is closed.", buttons [ Quit ] [ Keep running ] (default). On quit every job is saved as WAITING with reason "foo was closed" (J20). A payment in RUNNING or CHECKING state blocks the quit: the dialog body becomes "I'm in the middle of paying {amount}. I'll quit as soon as it's finished." with [ Quit when finished ] [ Keep running ]. `[J20; Article 7]`

---

## 9.9 Notifications (toasts)

### 9.9.1 Plumbing

| Rule | Value | Evidence |
|---|---|---|
| API | Electron `Notification` with `toastXml` (needed for the app-logo override and button layout) | WIN §16.1 `[exact: E4]` |
| Prerequisite | AUMID set (§9.2) and Start menu shortcut present; check `Notification.isSupported()` | WIN §16.1 `[exact: E5]` |
| Grouping | `groupId` = chat id, `groupTitle` = chat name; `id` (tag) = card id or message id | WIN §16.1 `[exact: E4]` |
| Activation | protocol activation only (§9.5): `<toast launch="foo://card/{cardId}" activationType="protocol">` (or `foo://chat/{chatId}` for a message), and each button `<action content="{label}" activationType="protocol" arguments="{foo:// URL}"/>` with the 08-0 §G.9 `?act=` query: Review `foo://card/{id}?act=review`, Not now `foo://card/{id}?act=not_now`, a Choice option `foo://card/{id}?act=choice:{optionId}`, Mark as read `foo://chat/{id}?act=read`, Open `foo://chat/{id}[/card/{cardId}]`. `?act=not_now` and `?act=read` are handled without showing the window; every other act shows and focuses it. | INT-07 |
| Scenario | always `default`. Never `urgent`, `alarm`, `reminder` or `incomingCall`. | WIN §16.1 Focus rules `[exact: S18]`; J20 "no extra pressure" |
| Sound | Windows default notification sound; silent when the event is a summary | `[foo decision]` |
| Timeout | `timeoutType: 'default'` (Windows decides); never `'never'` | `[foo decision]` |

### 9.9.2 Anatomy (all toasts)

```
┌───────────────────────────────────────────────┐
│ (48 avatar)  {chat name}               foo ·  │  ← app name + time by Windows
│              {one-line body, ≤ 4 lines}       │
│ [ Button 1 ]            [ Button 2 ]          │  ← 0–2 buttons
└───────────────────────────────────────────────┘
```

| Part | Value | Evidence |
|---|---|---|
| App-logo override | the chat's face rendered to a 48 × 48 PNG (circle crop) in the mood that caused the toast, with its ring (Happy for Done, Needs you for a card, Sorry for a failure; `02` §F15.9.6) [X-37], re-rendered per toast; foo's chat uses foo's face (living face by default), never the "f" mark. The PNG is read from `{DATA}\avatars\raster\{safeName(faceRef)}-48-{mood}.png` (02-2 §F15.9.9 Rasters, X-135), written by main from the renderer's `face:raster` event (`<FaceRaster>`; main never draws a face, X-124); missing file → the letter disc PNG in `resources/` | WIN §16.1 `[exact: S17]` 48×48 |
| Title | chat name: "foo" / "{agentName}", "Trips", "Money", or "{group} · {helper}" for a helper speaking in a group | J20 |
| Body | one sentence; Windows truncates to 4 lines | WIN §16.1 `[exact: S17]` |
| Buttons | max **2**; no icons on buttons | WIN M21 `[inferred: fewer choices]`; J20 |
| Hero image / attribution / progress bar | none | `[foo decision]` |
| Inline reply | **none in v1** (owner Q3 default, INT-07): text cannot travel through protocol activation and foo registers no COM activator; a native reply box is a v1.1 candidate (GAPS) | INT-07; owner Q3 |

### 9.9.3 Toast types (final)

| Type | When | Body (example; `{}` = data) | Buttons → action |
|---|---|---|---|
| Message | a foo/helper message arrives that is not a card and the chat is not focused (`NotificationKind 'reply'`) | first line of the message, markdown stripped (private chats: rule 9.9.3.5) | [ Open ] → opens the chat · [ Mark as read ] → marks the chat read and clears its toasts, window stays as it is |
| Choice needed | a Choice card becomes PENDING | "{question}" e.g. "Which flight time works for Delhi on Fri 18 Dec?" | [ {recommended option label} ] → answers the card (choices are not gated, Article 6) · [ Open ] |
| Approval needed (send, book, post, delete, share) | an Approval card becomes PENDING | "{verb} {object}? {undo note}" e.g. "Send this email to Rakesh? It can't be unsent." | [ Review ] → opens foo at the card, card focused · [ Not now ] → declines the card (DECLINED, "You said no. Nothing was sent.") |
| Payment needed | a Payment card becomes PENDING | "Pay {payee} {amount}?" e.g. "Pay Airtel ₹1,179?" | [ Review ] → opens foo at the card · [ Not now ] → declines. **No toast path pays.** |
| Sign-in needed | a Sign-in card becomes PENDING (J13) | "{site} needs you to sign in." | [ Open ] → opens the sign-in window |
| Stuck | a job raises the stuck card (J19.4) | "I'm stuck on {job title}." | [ Open ] |
| Job done | a job the user started turns DONE | "{result line}" e.g. "Booked: Taj Holiday Village, 12–14 Dec. ₹14,600 paid." | [ Open ] |
| Routine | a routine set to notify fires | "{routine message}" | [ Open ] |
| Morning brief | brief is ready | "Good morning. {n} things today." | [ Open ] |
| AI cap reached | spend cap hit (J19.3) | "You've reached this month's AI cap. {n} jobs paused." | [ Raise cap ] → `foo://settings/money/cap-ai` [settled: X-07] |
| AI not answering | `{AI}` down > 5 min while a job waits | "{AI} isn't answering. Your jobs are paused, not lost." | none (click opens foo) |
| Quiet-hours summary | quiet hours end with held toasts | "While you were away: {n} things need you, {m} jobs done." | [ Open ] |
| Merged | > 1 event in one chat within 2 min | "{n} updates" | [ Open ] |

Rules:
- 9.9.3.1 Approval and Payment toasts never carry an "Approve" button. `[foo decision]`: WIN M26 "sensitive approvals only in-app" `[inferred]` and Article 6/7; J20 allowed Approve for non-hard-limit approvals (§9.24 conflict 3).
- 9.9.3.2 "Review" opens the main window (shown, focused, restored) at the chat, scrolls the card into view and moves keyboard focus to the card's title. It does not open a separate window. `[foo decision]` (§9.24 conflict 4)
- 9.9.3.3 A toast for a card that has since expired or been answered is removed (§9.9.5). If the user still clicks one from Notification Center, foo opens the chat at the collapsed card (J20 branch: "This expired at {time}. Nothing was paid. [ Ask me again ]").
- 9.9.3.4 Toast bodies never contain an OTP, key, password, card number, full third-party email address or message attachment (Article 8). Payee names and amounts are allowed.
- 9.9.3.5 **Private chats (X-132).** For every notification kind (reply, approval, done, choice, stuck, routine) from a private chat (`chats.private=1`) the body is only "{chat title} · New message" (`notifications.private.body`): no message text, question, payee, amount or result line. Buttons stay as the type's row.

### 9.9.4 When toasts are sent

| Rule | Value | Evidence |
|---|---|---|
| Focused chat | no toast when foo's window is focused **and** showing that chat; no sound either | J20 |
| Window focused, other chat | toast is sent (the user may be reading another chat) | `[foo decision]` |
| Rate | at most 1 toast per chat per 2 min; extra events in that window replace the toast with the "Merged" type (same tag) | J20 |
| Interruption budget | the budget counts unprompted **messages**, not toasts (`notifications.unpromptedPerDay`, 0–3, default 3; Article 19, R-11); an unprompted item over the budget or inside quiet hours is neither posted nor toasted but held for the next morning brief (08-3 §15.2 step 5, §15.6) | J20; AG-01 |
| Muted chats | Message, Routine, Morning brief, Job done and reminder toasts suppressed (`suppressed_muted`); Choice, Approval, Payment, Sign-in, Stuck and problem (error, AI cap) toasts still sent. This is the one rule; 08-3 §15.2 step 3 implements it (BE-17). | `03` §3.4.9 |
| Quiet hours (default 10:00 PM–7:00 AM) | all toasts held; at quiet-hours end one "Quiet-hours summary" toast; held Needs-you cards still wait in the app. A routine marked "Urgent: notify even in quiet hours" is the only exception. | J20; Article 19 |
| Expiring cards | no extra "about to expire" toast | J20 `[foo decision: no pressure]` |
| PC locked | while `powerMonitor` reports `lock-screen`, every toast body is replaced by "{n} things need you" ("1 thing needs you") or "New message" and the title by "foo"; full content is not resent on unlock (the user opens the app) | J20 branch `[foo decision: privacy]` |
| Toasts off for a kind | Settings → Notifications per-kind toggles `notifications.kinds.{needsYou, done, routine, brief, helper, problem}` (08-0 §A; J21 §7); turning off "needs you" toasts (Choice, Approval, Payment, Sign-in, Stuck) shows "You might miss approvals." under the toggle | J21 |

### 9.9.5 Clearing (Notification Center hygiene)

| Event | Clear |
|---|---|
| User opens a chat (window focused on it) | every toast in that chat's group |
| A card leaves PENDING (approved, declined, expired, superseded, withdrawn) | that card's toast (by tag), wherever the decision was made |
| Mark as read (toast button or menu) | that chat's group |
| Chat deleted or cleared | that chat's group |
| Delete everything / uninstall | all foo toasts |

Mechanism: live `Notification` objects are closed with `notification.close()`. Toasts from an earlier run are removed with WinRT `ToastNotificationHistory.Remove(tag, group, aumid)` / `RemoveGroup(group, aumid)` / `Clear(aumid)` through the `foo-native` addon (`toastRemove`, `toastRemoveGroup`, `toastClear`; §9.19.2). `[WIN §16.1 exact: S18, E4]`

### 9.9.6 Focus / Do not disturb

- When Windows Focus or Do not disturb is on, Windows sends toasts straight to Notification Center. foo MUST NOT try to break through (no `urgent` scenario, no priority hacks). `[WIN §16.1 exact: S18]`
- foo adds nothing on top: its own quiet hours are separate and both apply.
- Settings → Notifications shows a read-only line while Focus is on: "Windows Focus is on, so notifications go quietly to the notification centre." foo detects Focus through `foo-native` `focusActive()` (`Windows.UI.Shell.FocusSessionManager.IsFocusActive`, Windows 11 only; `null` where missing). Where that API is missing (Windows 10), the line is not shown.

### 9.9.7 Blocked notifications

At launch and every time the window gains focus, foo reads `ToastNotifier.Setting` (`foo-native` `toastSetting()`). `DisabledForApplication`, `DisabledForUser`, `DisabledByGroupPolicy` or `DisabledByManifest` → banner type 6 (`03` §3.3) and the Settings → Notifications line "Windows is blocking foo's notifications. You might miss approvals." [ Turn them on ] (`ms-settings:notifications`). `[J20 branch; foo decision on detection]`

---

## 9.10 Taskbar

### 9.10.1 Overlay badge

`app.setBadgeCount` does not exist on Windows; the badge is `win.setOverlayIcon(image, description)`. `[WIN §16.2 exact: E3, E7]`

| Priority | Condition | Image | Description (spoken) |
|---|---|---|---|
| 1 | ≥ 1 card waits on the user (NEEDS YOU, PENDING approval/payment/choice/sign-in, stuck) | amber disc `#F5B041` with the count "1"…"9" or "9+" in `#0B0B10`, 1px `#0B0B10` ring | "{n} things need you" ("1 thing needs you") |
| 2 | a job the user started turned DONE in the last 30 min and the window has not been focused since | green disc `#4ADE80` with a `#0B0B10` checkmark, 1px `#0B0B10` ring | "A job is done" |
| 3 | otherwise | none (`setOverlayIcon(null, '')`) | — |

- 9.10.1.1 Plain unread messages do **not** badge the taskbar; the badge means "act" or "finished". `[J20 "none otherwise"; foo decision]`
- 9.10.1.2 Colours are the dark-theme `--warn` (`#F5B041`) and `--ok` (`#4ADE80`) values with the light `--fg-1` (`#0B0B10`) glyph and ring, used on every taskbar colour because the 1px ring keeps the disc visible on light taskbars. High contrast: disc in the system `window` colour, glyph and ring in `window-text` (`systemPreferences.getColor`).
- 9.10.1.3 Images are pre-rendered PNGs at 16, 20, 24 and 32 px and combined into one `nativeImage` with scale factors 1, 1.25, 1.5 and 2.
- 9.10.1.4 Updates are debounced 500 ms; the badge MUST NOT animate or change more than once per 500 ms. It updates within 2 s of a state change (J20 acceptance). Focusing the window clears priority 2.
- 9.10.1.5 The overlay is shown even when the window is hidden in the tray if the user pinned foo to the taskbar.

### 9.10.2 Progress bar

| Condition | `setProgressBar` |
|---|---|
| ≥ 1 job WORKING with a known step count | `normal`, value = done steps ÷ total steps of the earliest-started working job |
| ≥ 1 job WORKING, no step count | `indeterminate` |
| All unfinished jobs are WAITING (paused) | `paused` at the last value |
| No job WORKING or WAITING | removed (`-1`) |

`error` mode is never used (errors live in chats). `[WIN §16.2 exact: E3; J20]`

### 9.10.3 Flash

`win.flashFrame(true)` once when an Approval or Payment card becomes PENDING while the window exists but is not focused and quiet hours are off. `flashFrame(false)` on the window's `focus` event. Never for messages, never repeatedly, never while hidden in the tray (the toast covers that). `[WIN §16.2 exact: E7]`

### 9.10.4 Thumbnail toolbar

None in v1. `[WIN §16.2: max 7; foo decision: none]`

### 9.10.5 Dragging files over the taskbar button

After Windows' hover delay foo's window comes to the front (Windows behaviour, no code); dropped files go through `attachment.prepare` (08-0 §G.18) as the composer drop of 04 §22.6; more than 6 files → only the first 6, line `composer.notice.too_many_files` (12-2 §12.29.1 B). A drop directly on the taskbar button does nothing.

---

## 9.11 Jump list

`app.setUserTasks()` at startup with four static tasks (titles ≤ 260 chars, icon = `foo.exe` index 0): `[WIN §16.2 exact: E6, E7]`

| Title | Description (tooltip) | Arguments |
|---|---|---|
| "New message to foo" | "Open foo's chat and start typing" | `foo://new-message` |
| "See what needs you" | "Open the first thing waiting for you" | `foo://needs-you` |
| "Stop everything" | "Stop all running jobs (asks first)" | `foo://stop-all` |
| "Settings" | "Open foo's settings" | `foo://settings/account` |

Tasks are static (no counts) because Windows caches them; J20's "Needs you (2)" count is dropped (§9.24). `foo://stop-all` always shows the J18 confirm; it never stops anything without it.

---

## 9.12 Theme and accent

| Item | Value | Evidence |
|---|---|---|
| Theme setting | Settings → Appearance: "Same as Windows" (default) / "Light" / "Dark" → `nativeTheme.themeSource = 'system' / 'light' / 'dark'` | `02` F0; WIN §12 `[exact: E9]` |
| Live switch | on `nativeTheme 'updated'`: re-theme CSS, `setTitleBarOverlay`, tray icon variant, `backgroundColor` | WIN §12 |
| Accent | brand `--accent` by default; Settings → Appearance "Use my Windows accent colour" (`appearance.useWindowsAccent`, default off, X-51, 08-0 §A) reads `systemPreferences.getAccentColor()` and listens to `accent-color-changed`. Shades are derived by `02` §F28.3, which always keeps `--on-accent` ≥ 4.5:1. **Fallback only** when `getAccentColor()` throws or returns an empty string: keep the brand `--accent` and show the composer notice (`04` §20) "I couldn't read your Windows colour, so I'm using foo's own." once per session. (The earlier "too light to read" line is withdrawn: it had no trigger; UX-11.) This chapter owns that copy. | `02` F0, §F28.3; WIN §12 `[exact: E11]` |

---

## 9.13 Spell check and input languages

- Electron uses the Windows spell checker; `spellcheck` stays on in the composer and every text field. Languages = the user's Windows display and keyboard languages (`app.getPreferredSystemLanguages()`), e.g. en-IN and hi-IN. `[WIN §8 inferred]`
- IME composition is respected everywhere: Enter never sends or submits while `event.isComposing` is true. `[WIN §8 inferred]`
- Windows voice typing (Win+H) and the emoji panel (Win+.) work in every text field; foo does not intercept them.

---

## 9.14 Scaling and text size

### 9.14.1 Display scaling

- Per-monitor DPI awareness (Electron default). Supported 100–300 % (plateaus 100, 125, 150, 175, 200, 225, 250, 300). `[WIN §16.6 exact: S6]`
- Bitmaps (avatars, overlay badges, tray icons) ship at 1×, 1.5×, 2×, 3×. Icons are SVG.
- Layout stays on the 4px grid so edges stay sharp at every plateau. `[WIN §16.6 exact: S6]`

### 9.14.2 Windows text size (Accessibility → Text size, 100–225 %)

- foo reads `HKCU\Software\Microsoft\Accessibility\TextScaleFactor` (DWORD 100–225; missing = 100) at launch and whenever Windows broadcasts a settings change (`foo-native` `watchTextScale` watches the key with `RegNotifyChangeKeyValue`).
- foo sets the root font size to `16px × TextScaleFactor ÷ 100`. Because every size is in `rem` (`00-README`), text, rows and headers grow together.
- Build check (once, then fixed in code): if the Electron version in use already applies TextScaleFactor to web content (root computed font-size ≠ 16px at 150 % with no foo code), foo MUST NOT apply it a second time. Acceptance test: at 225 %, `getComputedStyle(document.documentElement).fontSize` is exactly `36px`.
- At 225 % nothing clips (`03` §3.0.4). `[WIN §16.6 exact: S14; F9]`

### 9.14.3 App zoom

| Key | Action |
|---|---|
| Ctrl+= (and Ctrl+Numpad +) | zoom in one step |
| Ctrl+- (and Ctrl+Numpad -) | zoom out one step |
| Ctrl+0 | reset to 100 % |

Steps: 80, 90, 100, 110, 125, 150, 175, 200 %. Uses `webContents.setZoomFactor`; persisted in `settings.json → zoom`; `titleBarOverlay.height = round(32 × zoom)` (`03` §3.2.1). Ctrl+mouse-wheel does the same. `[MSG §17 WA Ctrl+/−/0 reported; HRM UI scale exact]`

---

## 9.15 High contrast

| Rule | Value | Evidence |
|---|---|---|
| Detect | CSS `@media (forced-colors: active)`; main process `nativeTheme.shouldUseHighContrastColors` / `inForcedColorsMode` | WIN §12 `[exact: S15, E9]` |
| Colours | only system colours: `Canvas`, `CanvasText`, `LinkText` (links only), `GrayText` (disabled only), `Highlight`/`HighlightText` (selected, hover, pressed, in progress), `ButtonFace`/`ButtonText` | WIN §12 `[exact: S15]` |
| Removed | every shadow, translucency, gradient, avatar tint behind text | WIN §12 |
| Added | 1px `CanvasText` border on bubbles, cards, chips, pills, the composer; 2px on dialogs and menus | WIN §12 `[exact: S15]` |
| Images | `forced-color-adjust: none` only on avatars and photos, each with a 1px `CanvasText` outline | WIN §12 `[inferred]` |
| Status | every status already has an icon and a word (`02` F9); nothing relies on colour | `02` F9 |
| Focus | outline in `Highlight` | WIN §17 |
| OS surfaces | title bar overlay, tray and overlay badges switch to their high-contrast variants (§9.8.1, §9.10.1) | |
| Test | all four built-in contrast themes (Aquatic, Desert, Dusk, Night sky) | WIN §12 `[exact: S15]` |

---

## 9.16 Reduced motion and transparency

- Windows "Animation effects" off → `prefers-reduced-motion: reduce` → `02` F7 reduced rules (no movement or scale, fades ≤ 83 ms, face moods hold a static pose including the Thinking face that replaces typing dots (`02` §F15.9.5) [X-36], spinner becomes "◔"). `[WIN §15 inferred mapping; 02 F7]`
- `nativeTheme.prefersReducedTransparency`: no effect, because foo uses no Mica or Acrylic (`03` §3.1.1).

---

## 9.17 Keyboard shortcuts (final)

Rules: `Ctrl` on Windows; shortcuts are shown in tooltips ("Settings (Ctrl+,)") and exposed as `aria-keyshortcuts`; they work wherever focus is unless the column says otherwise; text-field editing keys (Ctrl+A/C/V/X/Z/Y, Home/End, Ctrl+←/→) always keep their normal meaning inside fields. `[WIN §17 exact: S16]`

### 9.17.1 App

| Keys | Action | Evidence |
|---|---|---|
| Ctrl+K | Search everything (palette, J22) | WIN §17; J22 |
| Ctrl+Shift+F | Focus "Search chats" in the chat list | MSG §17 WA Ctrl+F → moved `[foo decision]` |
| Ctrl+F | Find in this chat (`03` §3.6.3) | J22 step 7 |
| Ctrl+N | New helper | MSG §17 WA/Signal new chat |
| Ctrl+Shift+N | New group | MSG §17 WA |
| Ctrl+, | Settings | MSG §17, WIN §17 |
| Ctrl+Shift+D | Show / hide details (right shell) | HRM §17 used Ctrl+J; moved so Ctrl+J can jump to cards [settled: X-21] |
| Ctrl+J | Jump focus to the oldest card in this chat that needs you (`05` §0); none: Narrator "Nothing needs you here." | `05-cards-1.md` §0 [settled: X-09, X-21] |
| Ctrl+I | Profile of the open chat (`06` §4). Inside the composer with text selected, Ctrl+I keeps its italic meaning (`04` §10) | `06` §0.10 [settled: X-09] |
| Ctrl+M | What I know about you (Memory page, `06` §7) | J17 [settled: X-09] |
| Ctrl+R | Routines page (`06` §8). Electron's default reload on Ctrl+R is removed from the menu in production builds | J14 [settled: X-09] |
| Ctrl+H | Activity log (`06` §9) | `[foo decision]` [settled: X-09] |
| Alt+D | "I'm done" in the sign-in window only (`05` §5.10.3) | `05-cards-3.md` [settled: X-09] |
| Ctrl+/ | Keyboard shortcuts sheet | WIN §17, HRM |
| F6 / Shift+F6 | Next / previous pane (`03` §3.9.2) | WIN §17 `[exact: S16]` |
| Ctrl+Tab / Ctrl+Shift+Tab | Next / previous chat (list order) | MSG §17 WA, Signal |
| Alt+↓ / Alt+↑ | Next / previous chat | MSG §17 Signal |
| Alt+Shift+↓ | Next chat that needs you | MSG §17 Signal next unread `[foo decision: needs-you instead]` |
| Ctrl+1 … Ctrl+9 | Open chat 1–9 of the current list | MSG §17 Signal |
| Ctrl+Shift+P | Pin / unpin the open chat | MSG §17 WA |
| Ctrl+Shift+M | Mute / unmute the open chat (opens the mute submenu when muting) | MSG §17 WA |
| Ctrl+Shift+U | Mark the open chat as unread | MSG §17 WA |
| Ctrl+Shift+L | Watch live (when a job in this chat has the browser open) | `[foo decision]` |
| Ctrl+Space (hold) | Hold to talk (`04`); changeable in Settings → Chat and voice | BP1 "hold Ctrl+Space to talk"; J21 §8 |
| Ctrl+= / Ctrl+- / Ctrl+0 | Zoom in / out / reset | WIN §17 |
| Ctrl+W | Close the window (same as ✕: tray or quit per §9.8.2) | `[foo decision]` |
| Esc | Esc ladder (`03` §3.9.4); never quits, never approves or declines | WIN §17 |
| Shift+F10 / Menu key | Context menu of the focused item | WIN §17 `[exact: S16]` |

### 9.17.2 Lists and messages (when focus is in them)

| Keys | Action |
|---|---|
| ↑ / ↓, Home / End | Move in the chat list or message list |
| Enter / Space | Open the focused chat; in the message list, enter the focused card |
| PageUp / PageDown | Scroll messages one screen |
| Ctrl+Home / Ctrl+End | Oldest loaded / newest message |

### 9.17.3 Composer (owned by `04`; listed for completeness)

Enter sends; Shift+Enter new line; no send while IME composition is active; ↑ in an empty composer edits the last own message if `04` allows editing. `[MSG §8; WIN §8]`

### 9.17.4 Cards

- Choice cards: 1–9 pick an option when the card has focus (defined in `05`).
- **Approval and Payment cards have no keyboard shortcut for Approve.** Tab to the button and press Enter or Space; Esc never declines. `[AGT §17 "never map Enter to Allow on a risk card", inferred; Article 6]`

### 9.17.5 Reserved (never intercepted)

Alt+F4, Alt+Space, Alt+Tab, Win+any, Ctrl+Alt+Del, Ctrl+Shift+Esc, PrintScreen, Win+Shift+S, Win+H (voice typing), Win+. (emoji panel). `[WIN §17 exact]`

Conflict note: Ctrl+Space switches input language for some Chinese, Japanese and Korean keyboards. If the user has such a keyboard layout installed (`app.getPreferredSystemLanguages()` / `foo-native` `keyboardLayouts()`, from `GetKeyboardLayoutList`), foo's default hold-to-talk key becomes Ctrl+Shift+Space and Settings says "Changed to Ctrl+Shift+Space because Ctrl+Space switches your keyboard." `[foo decision]`

---

## 9.18 Secure storage

| Rule | Value | Evidence |
|---|---|---|
| Mechanism | Owned by `08` (§ Storage, SecretVault): Windows **Credential Manager** targets named `foo/{kind}/{name}` (08-0 §E.8, X-73; e.g. `foo/ai_key/openai-key`, `foo/conn_token/google`, `foo/web_key/exa`, `foo/login/{host}`, `foo/card/{last4}`) for values ≤ 2,560 bytes, and Electron **safeStorage** (DPAPI) blobs in `%APPDATA%\foo\vault\{name}.bin` for larger values (the WhatsApp session: `vault\wa-session.bin`). Both are DPAPI-protected and bound to the Windows user. safeStorage API (INT-07): `safeStorage.isEncryptionAvailable()` checked after `app.whenReady()`; `encryptString()` / `decryptString()` (synchronous, main process only); `false` → refuse to save (row "Never" below). | WIN §16.4 `[exact: E10]`; `08-functions-and-engine-1.md` storage table; INT-07 |
| Index | `secrets_index` (`08`) holds only names, kinds and last-4 hints, never values | `08` |
| What | your-AI keys, site logins, saved cards, app connection refresh tokens (Article 8; J storage map) | J §3 |
| Never | plaintext fallback. If encryption is unavailable, foo refuses to save and shows a card: "I can't save keys safely on this PC right now. Restart your PC and try again." [ Try again ] | `[foo decision]` |
| UI copy | where a secret is saved: "Saved securely on this PC (protected by your Windows sign-in)." | WIN §16.4 `[reported]` |
| Display | write-only: keys, logins and codes show "{Name} · saved {date}" + [ Replace ] [ Remove ] (Remove → dialog C-22, 08-0 §H); no Reveal and no part of a key or password is ever shown. A saved **card** is identified by brand + last 4 ("Visa ••4242", 05 §0.4 masking rule) in the Secret box saved row, Settings → Money, the Payment card's "Pay with" line, C-12 and the Activity log; the number itself is write-only (X-116). | WIN §16.4 `[inferred]`; X-116 |
| Honest scope | the UI MUST NOT claim more than DPAPI gives (it protects from other Windows users and other PCs, not from other apps running as the same user); no "bank-grade", "military", "encrypted end to end" wording | WIN §16.4 `[exact: E10]` |
| Naming in the UI | the UI never shows a `foo/…` target name or a vault path; it may name the Windows app "Credential Manager" only in the uninstall branch where an item could not be removed (`06`, `07`) | WIN §16.4 `[inferred]`; Article 2 |
| Decrypted values | live only in the main process memory for the duration of one use; never sent to the renderer, logs, crash dumps, screenshots or the AI (Article 8) | `[foo decision]` |

---

## 9.19 Windows Hello for payments

### 9.19.1 When

- Every Payment card approval where `total ≥ threshold`. Threshold default **₹10,000** (Article 7); Settings → Money: "Confirm with Windows Hello for payments of at least" + amount field (`06` §6.5 `hello`, writes `money.bigPaymentPaise`, default 1,000,000, locked to 0–1,000,000 by 08-0 §A.2) [settled: X-07; R-15 "₹10,000 or more"]; it can be lowered to ₹0 (every payment) and **cannot** be raised above ₹10,000 or turned off (J21 §5). Other currencies: converted at the payment card's rate; the threshold compares in the card's currency.
- Not used for non-payment approvals in v1 (Article 7 names payments only). `[foo decision]`

### 9.19.2 Native addon

**`foo-native`** (08-0 §E.2, X-60; the name `foo-winrt` is withdrawn): the one C++/WinRT N-API addon, at `native/foo-native/`, built with node-gyp, signed with the app, loaded as `require('foo-native')` in **main only**. Sources: `jobobject.cc`, `hello.cc`, `speech.cc`, `netcost.cc`, `toasthistory.cc`, `toastsetting.cc`, `textscale.cc`, `keyboard.cc`, `focus.cc`, `wintrack.cc`, `ocr.cc`. Exported API (`native/foo-native/index.d.ts`, BE-09 list): `assignToJobObject(pid): void`, `killJobObject(pid): void`, `verifyUser(message, hwnd?): Promise<'verified' | 'canceled' | 'retries_exhausted' | 'device_busy' | 'unavailable'>` (§9.19.3), `synthesize(text, lang, outPath): Promise<void>` (08-3 §18.2), `networkCost(): 'unrestricted' | 'fixed' | 'variable' | 'unknown'` (§9.20.2), `toastRemove(tag, group)`, `toastRemoveGroup(group)`, `toastClear()` (§9.9.5), `toastSetting(): 'enabled' | 'disabled_app' | 'disabled_user' | 'disabled_policy' | 'disabled_manifest'` (§9.9.7), `textScaleFactor(): number`, `watchTextScale(cb)` (§9.14.2), `keyboardLayouts(): string[]` (§9.17.5), `focusActive(): boolean \| null` (§9.9.6), and the window tracker of §9.27 (`trackWindow(hwnd, cb): number`, `untrackWindow(id): void`, `findWindowByPid(pid, titlePrefix?): number \| null`), and `ocrRead(path): Promise<OcrResult>` and `blackout(inPath, outPath, rects): Promise<void>` (08-0 §E.2, §G.18; Windows.Media.Ocr + WIC; the fallback `ocrRead` returns `status: 'unavailable'`). All toast functions use AUMID `com.foo.desktop`. Every export has a JS fallback that returns "unsupported" so foo runs without the addon (Hello then uses the typed-amount fallback, §9.19.4). Electron has no built-in Hello API. `[WIN §16.4 exact: S19; reported: Electron WebAuthn is macOS-only]`

### 9.19.3 Flow

1. User taps "Approve {amount}" on the Payment card (`05`). The card's buttons disable and show "Waiting for Windows Hello…" (`cards.payment.hello.waiting`).
2. foo calls `UserConsentVerifier.CheckAvailabilityAsync()`.
3. **Available** → Win11: `RequestVerificationForWindowAsync(hwnd, message)` with `hwnd` = `win.getNativeWindowHandle()`; Win10: `RequestVerificationAsync(message)`. Message (`cards.payment.hello.prompt`): "Approve paying {amount} to {payee}" (e.g. "Approve paying ₹14,600 to Taj Holiday Village").
4. Result:

| Result | Card |
|---|---|
| `Verified` | APPROVED → second look (Article 10) → RUNNING |
| `Canceled` | stays PENDING; line under buttons "Not approved. Tap Approve to try again." (`cards.payment.hello.cancelled`) |
| `RetriesExhausted` | stays PENDING; "Windows Hello didn't recognise you. Tap Approve to try again." (`cards.payment.hello.retries_exhausted`) |
| `DeviceBusy` | stays PENDING; "Windows Hello is busy. Tap Approve to try again." (`cards.payment.hello.busy`) |
| `DeviceNotPresent`, `NotConfiguredForUser`, `DisabledByPolicy` (from step 2 or 4) | typed-amount fallback (§9.19.4) |

5. The Hello prompt is parented to foo's window, so foo MUST show and restore the window first if it is minimized or hidden.

### 9.19.4 Fallback: type the amount

Dialog (`06` dialog style, width `--dialog-sm` 400px), id `dialog-type-amount` (08-0 §C.3), title "Confirm this payment" (`dialog.type_amount.title`), body "Type the amount to approve paying {payee}." (`dialog.type_amount.body`), a numeric field labelled "Amount to approve" (`dialog.type_amount.field_label`; placeholder = the amount digits, e.g. "14600"; `--t-mono`), buttons [ Approve {amount} ] (`dialog.type_amount.approve`; disabled until the field matches) and [ Cancel ] (`dialog.type_amount.cancel`). Copy keys (X-118): `dialog.type_amount.{title, body, approve, cancel, mismatch, field_label, not_set_up, set_up_link}` for this dialog and `cards.payment.hello.{waiting, prompt, cancelled, retries_exhausted, busy}` for the Payment card lines; this section owns the words, 06-3 §15 lists the keys (the `not_set_up` / `set_up_link` words are 06-3 §15's). `settings.security.*` is not a copy-key family.

- Accepted input: the exact total with or without "₹", commas or spaces ("14600", "14,600", "₹14,600"). Paise must match when the total has paise.
- 3 non-matching submits → dialog closes, card stays PENDING, line "That didn't match. Nothing was paid." (`dialog.type_amount.mismatch`)
- Enter submits only when the field matches; Esc = Cancel.
- `[Article 7 "typing the amount"]`. WIN suggested "Type APPROVE" (§9.24 conflict 6).

---

## 9.20 Auto-update

### 9.20.1 Mechanism

`electron-updater` with the NSIS target (differential download). Check 20 s after launch (§9.7 delay), then every 6 h while running, and when the user taps "Check for updates" in Settings → About. Updates install on quit (`autoInstallOnAppQuit: true`). `[WIN §16.5 reported; foo decision]`

### 9.20.2 Rules

| Rule | Value |
|---|---|
| Download | silent, in the background, at low priority |
| Metered connection | not downloaded on metered Wi-Fi or mobile data (`foo-native` `networkCost()` ≠ `'unrestricted'`, from `ConnectionCost.NetworkCostType`); Settings → About shows "Update waiting for Wi-Fi without a data limit." with [ Download now ] |
| Never interrupt | foo never restarts by itself. A restart (from the banner or Settings) is refused while a payment is RUNNING or CHECKING or a Hello prompt is open. |
| Applied | on the next quit, or on "Restart foo" |
| After update | no chat message; Settings → About → "What's new with me" shows foo's first-person changelog (J21 §11) |

### 9.20.3 Copy (final)

| Place | State | Copy |
|---|---|---|
| Settings → About | up to date | "foo is up to date · {version}" [ Check for updates ] |
| | checking | "Checking for updates…" |
| | downloading | "Downloading update… {p}%" |
| | ready | "Update ready. Restart foo to finish." [ Restart foo ] |
| | failed | "foo couldn't update. You're still on {version} and everything works." [ Try again ] (J19.6) |
| Banner (`03` §3.3 type 7) | ready | "A new version of foo is ready." [ Restart foo ] ✕ ("Later" = dismiss until next launch) |

### 9.20.4 Restart now

- No job running and no card PENDING → restart immediately; reopen at the same chat.
- Jobs running or cards PENDING → dialog: title "Restart foo now?", body "{n} jobs will pause and pick up after the restart. Nothing will be paid during the restart.", buttons [ Restart now ] [ Wait until they finish ] (default). "Wait until they finish" restarts automatically when no job is WORKING and no payment is RUNNING/CHECKING, and only while the window is not focused (so the user is never cut off mid-typing).
- Payment RUNNING/CHECKING → button disabled with the line "Restarting after your payment finishes…".

---

## 9.21 Crash recovery

| Failure | Behaviour | Copy |
|---|---|---|
| Window content crashes (`render-process-gone`) | reload the window once automatically, restoring the open chat and composer text | banner-free status line under the chat header for 4 s: "foo had a hiccup and reopened. Nothing was lost." (`role="status"`) |
| Window content crashes twice within 60 s | do not reload again; show a native dialog: "foo's window stopped working." [ Reopen foo ] [ Quit foo ] | — |
| Graphics crashes (`child-process-gone`, type GPU) twice in one run | `app.hardwareAcceleration = false` (08-0 §A); next launch with hardware acceleration off (`app.disableHardwareAcceleration()`); Settings → Account & your AI (`hw` row) shows "Smooth graphics are off because they caused problems on this PC." [X-07] [ Turn back on ] | — |
| Whole app crash / Windows restart / power cut | next launch runs J19.5: one recovery card per unfinished job ("🔁 I closed unexpectedly at {time}. {job} was at step {n} of {m}. Nothing was paid." [ Pick up where I left off ] [ Stop it ]); a payment that was RUNNING goes to CHECKING and is never re-submitted (Article 7); unsent composer text is restored | J19.5 |
| Safe mode trigger (08-0 §G.14, X-77; the one definition) | `{DATA}\launches.json` keeps the last 10 entries `{ at, clean, version, engineCrashes }` (`clean`, never `cleanExit`); main appends `{ at, clean: false, version, engineCrashes: 0 }` at start and sets `clean: true` on a normal quit. Safe mode when **3 launches with `clean: false` within 10 min**, or **3 engine crashes within one launch**: all jobs and routines held; card "foo had trouble starting. I've paused everything so nothing runs twice." [ Start normally ] [ Send a report ] | J19.5; BE-12 |
| Not responding | Windows' own "Not responding" handling; foo adds nothing | — |

Crash reports: Electron `crashReporter.start({ uploadToServer: false })`; dumps stay in `%APPDATA%\foo\logs\crashes\` for 14 days. "Send a report" first shows the exact redacted file: "This is what will be saved. It has no messages, keys or passwords." [ Save report ] [ Not now ] (J19.5). It never uploads anything: it saves a .zip with the redacted logs to `Documents\foo\reports\`, opens it in File Explorer and says "Report saved. You can attach it to an email if you want help." (`06` §18.2) [settled: X-12]. `[Article 15]`

---

## 9.22 Power, sleep and shutdown

| Event | Behaviour | Evidence |
|---|---|---|
| A job is WORKING | `powerSaveBlocker.start('prevent-app-suspension')` (keeps the PC from sleeping, not the screen on); stopped when no job is WORKING. Never for routines or idle waiting. Tray tooltip "foo · keeping your PC awake for {n} jobs". | J20 branch `[foo decision]`; APL "never block sleep silently" |
| Sleep (`powerMonitor 'suspend'`) | jobs → WAITING ("Paused · your PC was asleep"); approval timers keep their absolute expiry | J §4 |
| Resume (`'resume'`) | re-test the AI, then resume jobs with one line "Back on it. Picking up from step {n}." | J19.1 |
| Sign-out / shutdown (`'query-session-end'`) | save every job's state immediately; foo does **not** block or delay shutdown and registers no shutdown reason | `[foo decision]` (§9.24 conflict 7) |
| Battery saver on | routines that are not "Urgent" wait until the PC is plugged in or Battery saver ends; jobs the user started still run | `[foo decision]` |
| Clock wrong (> 5 min off a time server) | J19.6 card "⏰ Your PC's clock looks wrong. Reminders could fire at the wrong time." [ Fix the clock ] → `ms-settings:dateandtime` | J19.6 |

---

## 9.23 Uninstall

### 9.23.1 Entry points

Windows Settings → Apps → foo → Uninstall, or Start → right-click foo → Uninstall. Both run foo's NSIS uninstaller. "Delete everything" inside foo (Settings → Privacy) [X-07] is in `06` / J23-A.

### 9.23.2 Screens (final copy)

1. If foo is running with jobs: "{n} jobs are still running. Uninstalling stops them. Nothing will be paid." [ Stop and uninstall ] [ Cancel ]. If foo is running without jobs, the uninstaller quits it silently.
2. Choice:
   ```
   Uninstall foo
   What should happen to your foo data?
   ( ) Keep my data on this PC     Chats, memory and settings stay, in case you reinstall.
   (●) Delete everything           Chats, memory, routines, saved logins, cards and keys are erased.
                                   Your Gmail, Calendar and WhatsApp connections are disconnected.
   [ Uninstall ]   [ Cancel ]
   ```
   Default: Delete everything (secrets must not outlive the app). `[J23]`
3. If Delete everything: "This can't be undone. Want a copy first?" [ Export everything ] [ Continue ]. Export writes `foo-export-{date}.zip` to a folder the user picks (J21 §10), then continues.
4. Progress: "Removing foo…" + progress bar.
5. Done: "foo is removed. Your files in Documents\foo were kept. Your {AI} account is untouched." [ Close ]. Keep-my-data variant: "foo is removed. Your data is kept on this PC. Reinstall foo to pick up where you left off."

### 9.23.3 What is removed (order)

| # | Delete everything | Keep my data |
|---|---|---|
| 1 | stop all jobs (CANCELLED), approvals WITHDRAWN, routines stopped | same |
| 2 | revoke app connections online where possible (Google revoke, WhatsApp linked-device log-out, Microsoft revoke) | — |
| 3 | delete every Credential Manager entry whose target starts with `foo/`, then `%APPDATA%\foo\` including `vault\` and the browser profile | — |
| 4 | remove login item, Start menu shortcut, `SendTo\foo.lnk`, `foo://` protocol, toast registration, jump list, tray GUID registration, all foo toasts (`ToastNotificationHistory.Clear`) | same |
| 5 | leave `Documents\foo\` untouched | same |

Branches (J23): a Credential Manager entry that cannot be deleted → "I couldn't remove 1 saved item: your {site} login. Remove it in Credential Manager." (name in words, never the `foo/…` target; `07` R-02b); offline → local wipe still happens and the done screen adds "I couldn't reach Google to disconnect foo. You can remove it yourself at myaccount.google.com → Security → Third-party access."; a locked file → close foo's browser and retry 3 times, then "A few foo files are in use. They'll be removed when you restart your PC." Reinstall after Keep my data → "Welcome back, {You}. Everything's where you left it."

No "sorry to see you go" page, survey or browser launch after uninstall. `[J23]`

### 9.23.4 Uninstall helper contract (X-124)

The uninstaller runs `foo.exe --uninstall-cleanup --mode=delete|keep [--export-to "<folder>"]` and waits ≤ 90 s. foo (main only, no window, no tray, `--hidden` semantics, §9.5) performs, in order:
1. stop jobs, approvals and routines (§9.23.3 step 1);
2. when `--export-to` is given, write `foo-export-{date}.zip` there (08-3 §19.4);
3. when `--mode=delete`: `POST https://oauth2.googleapis.com/revoke?token={refresh_token}` (5 s timeout); Baileys `sock.logout()` through the bridge (10 s); Microsoft revoke (v1.1); delete every Credential Manager target starting with `foo/`; delete `{DATA}\vault\`;
4. write `{LOCAL}\uninstall-result.json` `{ revoked: { google: boolean; whatsapp: boolean }; credsFailed: string[] /* labels in words, e.g. 'your IRCTC login' */; exportPath?: string }` and exit 0.

The uninstaller reads that file for the §9.23.2 / §9.23.3 branch copy (`revoked.google = false` → the "I couldn't reach Google…" sentence; `credsFailed` non-empty → the "I couldn't remove {n} saved item(s)" sentence), then removes `%APPDATA%\foo\` and the rest of §9.23.3 steps 3–4. If `foo.exe` does not exit within 90 s or the file is missing, the uninstaller continues with the local wipe and shows both branch sentences.

---

## 9.24 Conflicts found (spec wins; log in `GAPS.md`)

| # | Evidence / journey says | This chapter decides | Why |
|---|---|---|---|
| 1 | J1 stored AUMID `foo.app`; WIN suggests `com.foo.desktop` | `com.foo.desktop` | one stable reverse-domain id; `07`/`08` must use the same string [settled: X-14] |
| 2 | WIN §1.2: 48px title bar, Mica | 32px, no Mica (`03` §3.13) | `02` F5 and F2 |
| 3 | J20: Approval toast has [ Approve ] for non-hard-limit approvals | Approval and Payment toasts only [ Review ] [ Not now ] | WIN M26; Article 6 approvals are deliberate taps on the card; the brief: "approval toast opens the card" [settled: X-02] |
| 4 | J20: Payment toast "Review" opens a small always-on-top receipt window | Review opens the main window at the card | one place to approve; fewer windows for a non-technical user; `06` need not build a receipt window [settled: X-02] |
| 5 | WIN §16.4: safeStorage only, never Credential Manager; the brief named safeStorage | Credential Manager (≤ 2,560 bytes) + safeStorage blobs (larger), exactly as `08` decides | `08` owns storage; both are DPAPI; a WhatsApp session exceeds the Credential Manager blob limit. UI copy rules in §9.18 still apply. [settled: X-16] |
| 6 | WIN §16.4 fallback "Type APPROVE" | type the exact amount | Article 7 [settled: X-08] |
| 7 | J20: Windows shutdown screen lists "foo: 1 job running" with a reason | foo saves state and never blocks shutdown | blocking shutdown alarms users; jobs resume next launch (J19.5) |
| 8 | J20 jump list "Needs you (2)", "New message", "Stop everything" | four static tasks without counts (§9.11) | WIN §16.2: jump list tasks are static |
| 9 | J20 taskbar: green ✓ after done; WIN: unread count overlay | amber count for needs-you, green ✓ for 30 min after done, nothing for unread | the brief "yellow needs you / count"; badge = act or finished |
| 10 | J1 "Win 10 22H2"; WIN "Win10 1809+" | Win10 22H2+ | supported Windows only [settled: X-14] |
| 11 | BP1 composer hint "hold Ctrl+Space to talk" | kept, with an automatic switch to Ctrl+Shift+Space for CJK keyboards | Ctrl+Space is the IME toggle on those layouts |
| 12 | WIN §16.1 `Notification.handleActivation`, "Electron's COM activator", inline reply on Message toasts | protocol activation only; no COM activator; no inline reply in v1 | Electron has neither API; owner Q3 default (INT-07) |
| 13 | WIN §16.4 async safeStorage API | `isEncryptionAvailable` / `encryptString` / `decryptString` | the async names do not exist (INT-07) |
| 14 | 09 `foo-winrt` vs 08 `foo-native` | one addon `foo-native` (§9.19.2) | X-60 |
| 15 | 06-3 §11.2 live window drawing the site in a "Chromium view" | Watch live shows pictures in `live.html`; take over/sign-in use the real Edge window + docked banner (§9.27) | X-66: Edge is external |
| 16 | three safe-mode triggers (08-1, 08-2, 09) | 3 unclean launches in 10 min or 3 engine crashes in one launch (§9.21) | X-77 |
| 17 | jump list `foo://settings/general` | `foo://settings/account` | X-67: `general` is not a Settings page |

---

## 9.25 Acceptance checks (feed `10`)

| # | Given / When / Then |
|---|---|
| 9.25.1 | Given a fresh install as a standard user, then no admin prompt appears and a toast sent at first launch is shown by Windows (AUMID works). |
| 9.25.2 | Given foo is running, when `foo.exe` is launched again, then no second window appears and the existing one is focused. |
| 9.25.3 | Given a Payment toast, then it has exactly [ Review ] [ Not now ], and no sequence of toast clicks results in a charge. |
| 9.25.4 | Given a card becomes PENDING, then the taskbar overlay shows the amber count within 2 s and its spoken description is "{n} things need you". |
| 9.25.5 | Given the user opens a chat, then that chat's toasts disappear from Notification Center. |
| 9.25.6 | Given Focus is on, then foo's toasts go to Notification Center without a banner. |
| 9.25.7 | Given a ₹14,600 payment and Hello set up, then Approve shows the Windows Hello prompt naming "₹14,600" and the payee; Cancel leaves the card PENDING. |
| 9.25.8 | Given Hello not set up, then the typed-amount dialog appears and "14,600" enables "Approve ₹14,600" while "14,500" does not. |
| 9.25.9 | Given an update is downloaded while a payment is RUNNING, then "Restart foo" is disabled until it finishes. |
| 9.25.10 | Given Windows text size 225 %, then the root font size is 36px and nothing clips. |
| 9.25.11 | Given "Delete everything" uninstall, then `%APPDATA%\foo` is gone, `Documents\foo` is untouched and no foo toast remains in Notification Center. |
| 9.25.12 | Given DPAPI encryption is unavailable, then foo refuses to save a key and nothing is written to disk in plaintext. |
| 9.25.13 | Given foo is closed, when the user clicks [ Review ] on an Approval toast in Notification Center, then foo starts, opens at that card with focus on its title, and nothing is approved. |
| 9.25.14 | Given a Message toast, then it has exactly [ Open ] [ Mark as read ] and no reply box. |
| 9.25.15 | Given a muted chat, then a Job done toast is not shown while an Approval toast in the same chat is. |
| 9.25.16 | Given a toast of any kind from a private chat, then the body is "{chat title} · New message" and nothing else. |
| 9.25.17 | Given `live.html` is closed, then the job's state is unchanged. |

---

## 9.26 New tokens requested

None. Taskbar and tray bitmaps reuse existing token values (§9.8.1, §9.10.1).

---

## 9.27 Live view and sign-in banner windows (X-66, 08-0 §G.8; INT-01)

This section owns foo's browser-related windows. `06-3` §11.2–§11.3 and `05-3` §5.10.3 describe what the user sees in them and point here for the window mechanics; their "Chromium view" inside a foo window is **withdrawn**.

### 9.27.1 The rule
- foo's browser is always the installed **Microsoft Edge** (Chrome fallback), a separate process launched and driven by `playwright-core` over CDP (`08-2` §8.3.1–§8.3.2, X-46). foo never embeds a web view for jobs and never draws its own chrome around an Edge window.
- **Watch live** = a foo-owned Electron window `live.html` that shows **pictures** of the job's Edge page (masked CDP screencast frames). It is never interactive with the site.
- **Take over** and **sign in** = the real Edge window brought to the front, plus one docked, frameless, always-on-top Electron window `signin-banner.html` that carries foo's words and buttons.
- Closing `live.html` (X or Alt+F4) only closes the window; the job keeps running (X-95). There is no in-panel live view (08-0 §G.8). Test ids stay `live-*` / `signin-banner-*`.
- Words, copy keys (`live.window.*`) and test ids of the live window are 06-3 §11.2; banner content and ids are 05-3 §5.10.3; this section owns only window creation, size, focus and docking (X-121, 08-0 §G.8).
- Electron files: `src/renderer/windows/live.html` and `src/renderer/windows/signin-banner.html` (08-0 §E.3); main-side modules `src/main/windows/liveWindow.ts` and `src/main/windows/signinBanner.ts`.

### 9.27.2 Live window (`live.html`)

| Item | Value |
|---|---|
| Created by | main, on the right-shell Doing now `IconButton` `ArrowMaximize` "Open the window" (06 §0.11; `06-3` §11.1), the checklist or chat-header "Watch live", Ctrl+Shift+L (nothing to watch → `announce('Nothing to watch right now.')` only, X-121), or a Stuck/Sign-in card's "Watch". One live window per job; a second request focuses it. |
| Window | `BrowserWindow({ width: 1024, height: 720, minWidth: 640, minHeight: 480, frame: false, titleBarStyle: 'hidden', titleBarOverlay, show: false })` centred on foo's main window display; same AUMID as foo, so it is grouped under **foo's** taskbar button; title "{Goa stay} · foo" (Narrator "{Goa stay}, foo's browser"). Title bar 32 px per `03` §3.2. |
| Content | foo bar 48 px (`06-3` §11.2 element table: face, title, LIVE pill, site domain, [ Take over ] [ Stop ]); below it the picture area showing the latest `live:frame` (`08-1` §3.3: `{ jobId, jpeg, w, h, masked: true, nowLine }`), scaled to fit with letterboxing in `--bg-sunken`; Now line under the picture; in state `in_control` the 48 px control bar of `06-3` §11.2 sits under the paused picture. Frames ≤ 5 fps and ≤ 1280 px wide (`08-3` §20) only while the window is visible (`job:watch { on: true }` on show, `false` on hide/minimise). |
| Not interactive | the picture is an `<img>`; a click on it shows the `06-3` §11.2 tooltip at the pointer. Keys go only to the foo bar and, in `in_control`, the control bar. |
| Take over | calls `job:takeOver`; the live window **stays open** and enters state `in_control` (X-121): the LIVE pill becomes "YOU'RE IN CONTROL" (`--warn`) and the 48 px control bar of `06-3` §11.2 appears under the picture (`live-control-bar` with `live-hand-back` [ Hand back to {agentName} ] and `live-stop` [ Stop ]); the picture keeps the last frame (frames pause during take-over, `08-2` §8.3.3). The docked Edge banner (§9.27.3) carries Hand back only. Hand back from either window = `job:handBack`; Stop = `job:stop`. |
| Stop / ✕ | ✕ closes the live window only and **never stops the job** (it is a picture; `06-3` §11.1 "Closing the live view never stops anything" applies to this window too). Stop on the foo bar = `job:stop` (J18), no confirm. |
| States | `starting / live / needs_you / in_control / paused / done / cant_show` (`data-state`; 08-0 §G.8). Pills, words and copy keys of every state are `06-3` §11.2 verbatim. Window behaviour owned here: `done` closes the window 5 s after DONE unless it is focused; `cant_show` = `LIVE_UNAVAILABLE`; while a sign-in form is on screen no frames are sent (`08-2` §8.3.7) and the picture area shows the `06-3` §11.2 sign-in line. |
| Test ids | `06-3` §11.2 is the list (`live-root`, `live-bar`, `live-pill`, `live-picture`, `live-take-over`, `live-control-bar`, `live-hand-back`, `live-stop`; 08-0 §C.3); `data-state` = the state value above; this section adds none. |

### 9.27.3 Take over and sign in (real Edge + `signin-banner.html`)

| Item | Value |
|---|---|
| Edge window | **Sign in** (J13, `05-3` §5.10) and **Take over**: the job's existing Edge window at its current size (never resized; `--signin-w`/`--signin-h` are removed, X-92, X-121). Both: `Browser.setWindowBounds({ windowState: 'normal' })` (restores a minimised window only) then `page.bringToFront()`; main calls `app.focus({ steal: true })` only because this is user-initiated (§9.5 Focus rule). Edge keeps its own title bar, tabs and address bar; the window stays in the taskbar under Edge. |
| Banner window | `BrowserWindow({ frame: false, transparent: false, resizable: false, movable: false, skipTaskbar: true, focusable: true, alwaysOnTop: true, show: false })`, one per job; height 72 px = address row 32 + banner 40 (`--banner-h`) in both modes (X-121); width = the Edge window's width. |
| Docking | The banner covers the top of Edge's **page area**, directly under Edge's own toolbar: `x = edge.x`, `y = edge.y + (window.outerHeight − window.innerHeight)` read from the page with `Runtime.evaluate`, `width = edge.width`. It follows Edge on every move, resize, minimise and restore via `foo-native` `trackWindow(hwnd, cb)` (`SetWinEventHook` for `EVENT_OBJECT_LOCATIONCHANGE`, `EVENT_SYSTEM_MINIMIZESTART/END`, `EVENT_SYSTEM_FOREGROUND`, `EVENT_OBJECT_DESTROY` on the Edge HWND) within one frame. The HWND is found with `findWindowByPid(edgeBrowserPid)` matching the bounds from CDP `Browser.getWindowForTarget`; the match is re-checked every 500 ms. Without the addon, the banner re-reads the bounds through CDP every 500 ms. |
| Stacking | The banner is always-on-top (`setAlwaysOnTop(true, 'floating')`) only while the Edge window or the banner itself is the foreground window; when the user switches to another app it hides, and it shows again when Edge returns to the front. Minimised Edge → banner hidden. |
| Sign-in content | Address row (`05-3` §5.10.3: lock icon, domain bold, path, read-only, from `page.url()` every 1 s) + Warn banner "{agentName} is waiting. It can't see what you type here." [ I'm done ] (Alt+D, `05-3` §5.10.3; X-09). Success: "Looks like you're in. Carrying on…" for 2 s, then the banner closes and Edge goes back behind foo. |
| Take-over content | Address row + Control tone bar (40 px, bg `--warn`, text `--on-warn`) "You're in control. {agentName} is paused." [ Hand back to {agentName} ] (Alt+D); **no Stop button in the banner** (X-121; Stop is on the live window's control bar or by closing Edge). Hand back = `job:handBack`. Words: `05-3` §5.10.3. |
| Privacy | While the banner is up: no screenshots, no page text read, no AI calls about the page (`05-3` §5.10.3, J13). |
| Closing Edge | Closing the Edge window during take-over = Stop (J18, "close the tab to stop"; no confirm; the chat gets the J18 stop report). During sign-in it pauses the job and leaves the Sign-in card `waiting`, so the user can open it again. The banner closes with its Edge window (`EVENT_OBJECT_DESTROY`). |
| Keyboard, Narrator | F6 cannot move focus from Edge into the banner (they are different processes), so the banner's buttons have access keys: Alt+D "I'm done" / "Hand back", and the banner takes focus when shown (Narrator reads it as `role="status"`: "foo is waiting. It can't see what you type here." / "You're in control. foo is paused."). Tab moves inside the banner only. |
| Test ids | `signin-banner`, `signin-banner-address`, `signin-banner-done`, `signin-banner-success`, `signin-banner-hand-back`; `data-state` ∈ `waiting`, `in_control`, `signed_in` (`05-3` §5.10.3 is the list; X-121). |

### 9.27.4 Acceptance (feed `10`)
- Given a running browser job, when the user opens Watch live, then a foo window titled "{job} · foo" shows masked frames at ≤ 5 fps and clicking the picture does not reach the site.
- Given Take over, then the real Edge window comes to the front with the control banner docked under its toolbar and the live window, if open, shows its control bar, the banner follows a window drag within one frame, and closing Edge stops the job.
- Given a sign-in card, when the user taps Open, then Edge shows the sign-in page in front, at its current size, with the read-only address row and "I'm done" (Alt+D), and no screenshot or page text is captured until the banner closes.
