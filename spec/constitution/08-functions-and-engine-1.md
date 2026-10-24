# 08 · Functions and engine — Part 1 of 3: architecture, processes, IPC, data model

This chapter is for **engineers**. Technical words are allowed here; they are still banned in anything a user sees (Article 2). Every user-facing string an engine function produces MUST come from the exact copy in `research/journeys-1..4.md` (cited as J#) or from 03–06; the engine never writes its own UI copy. In code every such string is a copy key in `src/shared/copy/en-IN.json`, looked up with `t(key, vars)` in main, engine and renderer alike (08-0 §D, X-59).

| Part | File | Sections |
|---|---|---|
| 1 | `08-functions-and-engine-1.md` (this file) | §0 conventions · §1 architecture · §2 process model · §3 IPC contract · §4 data model |
| 2 | `08-functions-and-engine-2.md` | §5 job runner · §6 your-AI adapters · §7 prompt + reply protocol · §8 tool layer · §9 approval gate + second look · §10 payments · §11 secret vault + redaction |
| 3 | `08-functions-and-engine-3.md` | §12 memory · §13 routines · §14 morning brief · §15 notifications · §16 connectors · §17 helpers + groups · §18 voice · §19 logging, privacy, data lifecycle · §20 performance budgets · §21 error taxonomy · §22 testing hooks · §23 gaps + open questions |

---

## §0. Conventions

0.1 **MUST / MUST NOT / SHOULD** are used as in RFC 2119. A MUST that cannot be met is a gap: log it in `GAPS.md` and take the conservative option (Article 30).

0.2 **Evidence keys** (in addition to those in `research/journeys-1.md` §0):

| Key | File |
|---|---|
| OMB-03 | `/mnt/project-files/omnibot-re/03-tech-spec.md` (Omnibot core algorithm, §5.x) |
| OMB-05 | `/mnt/project-files/omnibot-re/05-cli-driver-reference.md` (exact CLI argv + stream events) |
| OMB-06 | `/mnt/project-files/omnibot-re/06-prompt-assembly.md` |
| OMB-08 | `/mnt/project-files/omnibot-re/08-unknowns-and-limits.md` |
| FOO-PRD / FOO-PLAN | `/mnt/project-files/omnibot-re/foo/foo-prd.md` (§6 W1–W6 Windows facts) / `foo-plan.md` |
| HRM-SRC | `/home/claude/src/hermes-agent` (e.g. `agent/redact.py`, `agent/background_review.py`, `tools/approval_smart.py`) — reference only, no code copied |
| OCL-SRC | `/home/claude/src/openclaw` — reference only |
| J#, G#, C# | journeys, global rules and shared components in `research/journeys-1..4.md` |
| Art. N | Article N in `01-articles.md` |

0.3 **Every function** in this chapter is listed in a table with: name · inputs · output · errors (from the §21 taxonomy) · journeys (J#) · articles (Art.). Signatures are TypeScript. `Result<T>` means `{ ok: true; value: T } | { ok: false; error: FooError }` (§21.1). No engine function throws across a process boundary; it returns a `Result`. `FooError.kind` is an `ErrorKind`, the closed union of 08-0 §B.3 (X-70): every error named in this chapter is a member of that union, a kind not in one of the three lists of 08-3 §21 (§21.2 user-facing, §21.3 renderer-handled, §21.4 internal; X-120) is never emitted, and the renderer-handled kinds (08-3 §21.3, e.g. `CARD_STALE`, `TOO_LATE`, `SETTING_LOCKED`, `NOT_FOUND`, `CHAT_PAUSED`, `SECRET_EXISTS`) are shown by the surface that caused them, never as an error card.

0.4 **Money** is always an integer number of **paise** (`amountPaise: number`, ₹1 = 100). Never a float. Display formatting is the renderer's job (02 F10).

0.5 **Time** is stored as UTC epoch milliseconds (`number`). The user's time zone is `settings.locale.timeZone` (IANA, default from `Intl.DateTimeFormat().resolvedOptions().timeZone`). All schedule maths uses the user's zone (Art. 21).

0.6 **IDs** (08-0 §E.7, X-75; that section wins). Every id is `{prefix}_{UUIDv7}` (time-ordered, `uuid` package `v7()`), produced only by `IdGen.next(kind)` in `src/shared/ids.ts`; no other code makes an id. `[foo decision: time-ordered ids make "latest first" queries index-only; prefixes make logs readable]`

| Prefix | Row / thing | Prefix | Row / thing |
|---|---|---|---|
| `c_` | chat (incl. groups, WhatsApp mirrors) | `cn_` | connection |
| `m_` | message | `act_` | activity row (also the `changeId` of a settings change, §4.4.2) |
| `k_` | card | `nt_` | notification ledger row |
| `j_` | job | `sg_` | suggestion |
| `s_` | step | `dr_` | composer draft |
| `tc_` | tool call | `att_` | staged attachment |
| `t_` | AI turn | `fl_` | file index row |
| `ap_` | approval | `rcp_` | site recipe |
| `py_` | payment | `ob_` | outbox row |
| `r_` | routine | `bf_` | brief feedback |
| `rr_` | routine run | `wa_` | WhatsApp mirror message (Baileys id appended) |
| `h_` | helper | `rule_` | rule (`Rule.id`) |
| `f_` | memory fact (full UUIDv7, never truncated) | `req_` | code / secret request |
| `prev_` | report preview | `undo_` | memory undo token |
| `hi_` | held item (`held_items`) | | |

`contacts_index.id` is Google's `resourceName` as given (no prefix). `FaceRef` (stored in `chats.avatar_ref`, `helpers.face_ref`, `settings.identity.avatarRef`) is exactly one of `living:{style}` (style per 02 §F15.9) · `glyph:{emoji}` (one grapheme incl. its U+FE0E/U+FE0F selector, X-30) · `letter:{one grapheme, upper-cased where the script has case}` (default = the first grapheme of the name by `Intl.Segmenter`, 08-5 §2, X-111) · `file:{chatId}` (the picture `{DATA}\avatars\{chatId}.png`) (08-0 §E.7, DB-25); any other string fails zod.

0.6.1 **Canonical JSON and nonces** (08-5 §7, X-113; that section wins). `canonicalJson(v)` lives in `src/shared/canon.ts` and is RFC 8785 (JCS): keys sorted by UTF-16 code units recursively, no whitespace, numbers in the shortest round-trip form. It is the one function used for `approvals.fields_hash`, `tool_calls.idem_key` (§4.3.4), `suggestions` subjects (`suggest:{sha8}`) and the fake-AI `match` hashes. A card `nonce` (§3.1.3) is 32 lower-case hex characters from `crypto.randomBytes(16)`.

0.7 **Paths** (08-0 §E.6). `{DATA}` = `%APPDATA%\foo` (J storage map, journeys-1 §3). `{LOCAL}` = `%LOCALAPPDATA%\foo` (caches, AI scratch dirs, the voice pack; browser binaries are NOT here because foo uses Edge, §8.3). `{OUT}` = `settings.files.outputFolder` (default `%USERPROFILE%\Documents\foo`, or `%USERPROFILE%\foo files` when Documents is online-only, J1). **Test overrides** (§22): `FOO_DATA_DIR` replaces `{DATA}`, `FOO_LOCAL_DIR` replaces `{LOCAL}`, `FOO_OUT_DIR` replaces `{OUT}` (and wins over the setting); `FOO_FAKE_AI` selects the `fake` provider. A `FOO_TEST=1` run without all three of `FOO_DATA_DIR`, `FOO_LOCAL_DIR`, `FOO_OUT_DIR` refuses to start (X-96), so no test ever writes to the real `Documents\foo` or `%LOCALAPPDATA%\foo`. `FOO_TEST_ALLOW_HOSTS` (comma-separated hosts, honoured only in `FOO_TEST=1` builds) lets those hosts bypass the localhost/private-range block of `browser.open` and `web.fetch` (08-0 §E.6).

0.7.1 **File names** (`safeName()`, `src/shared/safeName.ts`, 08-0 §E.7; provenance BE-30). Steps in order: NFC-normalise; replace `<`, `>`, `:`, `"`, `/`, `\`, `|`, `?`, `*`, `·` (U+00B7) and U+0000–U+001F with `-`; collapse runs of spaces and of `-` to one; trim spaces and dots at both ends; if the stem matches `^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$` (case-insensitive) prefix `_`; cut to 120 characters keeping the extension; empty result → `file`. Job output folders are `{OUT}\{safeName(job title)}\`; on a name collision append ` (2)`, ` (3)`… Inbox files are `{attachmentId}-{safeName(original name)}`.

---

## §1. Architecture

### 1.1 Decided stack

| Layer | Choice | Reason |
|---|---|---|
| Shell | Electron: the latest stable release on M0 day, pinned to that exact version (`"electron": "x.y.z"`, no `^`/`~`) in `package.json`; the M0 builder writes the exact version into this cell the same day and every later change is a constitution PR (08-0 §H). Node ≥ 22 inside. TypeScript strict | Decided by Vikas (brief); one language end to end (FOO-PLAN §1) |
| OS | Windows 10 22H2 and Windows 11, x64 (minimum enforced by the installer, J1) | Binding decision from 09-windows (the brief's "1809+" is superseded; logged §23 G-08-01) |
| Renderer UI | React 19 + Vite | Brief |
| Renderer state | **Zustand** (+ `immer` middleware), one store per domain slice | `[foo decision]` Small, no boilerplate, works with event patches pushed from main without a cache layer; Redux adds ceremony, TanStack Query assumes HTTP |
| Long lists | `@tanstack/react-virtual` | Art. 28: 5,000 messages at 60 fps needs virtualisation |
| Markdown | `marked` + `DOMPurify` (sanitised before render) | FOO-PLAN §2; Omnibot rule "sanitize all rendered markdown" (AGENT-BRIEF) |
| Validation | `zod` on every IPC payload, every AI reply envelope, every file read back from disk | Typed unions, not strings on the wire (OMB-08 debt 3) |
| Database | **SQLite via `better-sqlite3`**, WAL mode, one file `{DATA}\data\foo.db`, FTS5 for search | `[foo decision]` synchronous API makes transactions simple and fast (< 1 ms writes); ships prebuilt for Electron; FTS5 built in. `node:sqlite` is still experimental; async drivers add latency for no gain on one user's PC. **No encryption at rest:** `foo.db`, the mirrors, memory files and logs are plain files protected by the Windows user-profile ACL; they never contain a secret value (Art. 8, §4.6 rule 2). Only vault items are DPAPI-protected (X-16). SQLCipher and other encrypting drivers are not used `[foo decision]` |
| Memory | Plain Markdown files in `{DATA}\memory\` (user-readable), indexed into SQLite FTS for search | Brief; J17; Instinct/OpenClaw files (INS §4.4, OCL §2.4) |
| Secrets | Windows Credential Manager via `@napi-rs/keyring` for values ≤ 2,560 bytes, target names exactly 08-0 §E.8 (`foo/{kind}/{name}`, X-73); Electron `safeStorage` (DPAPI) blobs for larger values (the WhatsApp session `{DATA}\vault\wa-session.bin`) | Brief; Credential Manager blob limit is 2,560 bytes (`CRED_MAX_CREDENTIAL_BLOB_SIZE`), a WhatsApp session is larger (§11.2) |
| Browser | **Playwright (`playwright-core`, no bundled browsers) driving installed Microsoft Edge (`channel: "msedge"`), headed, in foo's own persistent profile** `{DATA}\browser\profile\`. Fallback: installed Google Chrome (`channel: "chrome"`) with the same foo profile | §8.3 justification |
| Native helpers | One N-API addon **`foo-native`** (C++/WinRT) at `native/foo-native/`, loaded only in main; sources, exported functions and the "unsupported" JS fallback per 08-0 §E.2 and the literal list of 08-5 §6 (X-60, X-111): Job Objects, Windows Hello, speech synthesis, network cost, toast history and setting, text scale, keyboard layouts, Focus, window tracking for the sign-in banner (`wintrack.cc`: `trackWindow` / `untrackWindow` / `findWindowByPid`), on-device text recognition and black-out for pictures sent to the AI (`ocr.cc`: `ocrRead`, `blackout`, 08-0 §E.2). There is no second addon (`foo-winrt` is withdrawn) | Node has no Job Object, Hello or WinRT toast-history API; FOO-PRD W2 |
| PDF pages | `pdfjs-dist` (exact version pinned at M0) in a hidden sandboxed offscreen window `windows/pdfraster.html`, main process only (08-0 §G.18) | X-98, X-109: PDFs are never sent as PDF |
| Speech-to-text | **OpenAI transcription first** (`POST https://api.openai.com/v1/audio/transcriptions`, model `gpt-4o-mini-transcribe`; `gpt-4o-transcribe` if Hindi/Punjabi accuracy is poor in testing) with the user's own OpenAI key from the vault. Backup: `whisper.cpp` CLI binary bundled; the multilingual `base` model (about 150 MB) downloads on the first voice note that needs it (no key, or OpenAI unreachable), not bundled [settled: X-43, replaces X-18's voice clause] | Vikas 2026-10-16 ("we can use openai voice models"); J7; see §18 |
| Web tools (optional, user's own keys) | Search: **Exa** (Tavily alternative). Read: **Firecrawl**; fallback `@mozilla/readability` on JSDOM (scripts and remote loading off) in the engine. Cloud browser: **Browser Use Cloud**, public signed-out reading only. No key → Bing in foo's Edge window + Readability. Keys in the vault `foo/web_key/{exa\|tavily\|firecrawl\|browseruse}` (08-0 §E.8); no foo server [settled: X-46] | Vikas 2026-10-16 Q8 "Cloud agent tools"; research/web-tools.md; see 08-2 §8.2, §8.3.12 |
| Connections hub (v1.1, flag `flags.hub`) | One hub connection in the engine (MCP client in the engine utility process): **Composio** by default, **Zapier** second; foo manifest per app (action class per tool, plain name, description hash) [settled: X-49] | Vikas 2026-10-16 Q10; research/capabilities.md §5.2; see 08-3 §16.8 |
| WhatsApp | `@whiskeysockets/baileys` (linked device), isolated in its own utility process | J4 decision; fragility evidence OCL §8.4 |
| Packaging | electron-builder NSIS, per-user, no admin; installer, `foo.exe` and every native addon code-signed (Azure Trusted Signing or EV) before anyone outside the named test group installs foo; tester builds may be unsigned [settled: X-44] (09 §9.3 Signing) | FOO-PLAN §2; J1; 09 |
| Tests | Vitest (unit/integration), Playwright for Electron (UI), fake CLIs as scripts | FOO-PLAN §2; Omnibot `test_support` pattern (OMB-03 §10) |

### 1.2 Architecture diagram (normative)

```
┌──────────────────────────────────────────── foo.exe (one instance per Windows user) ──────────────────────────────────────────┐
│                                                                                                                               │
│  RENDERER (BrowserWindow "main", sandbox:true, contextIsolation:true, nodeIntegration:false)                                 │
│  React 19 + Zustand · chat list · chat · cards · right shell · settings · memory · routines · search · live view              │
│        │  window.foo.invoke(channel, payload) / window.foo.on(event, cb)      (preload.ts, zod-typed, §3)                     │
│        │  (no second renderer: toast "Review" opens the card in the main window [settled: X-02])                                 │
│ ═══════╪═════════════════════════════════════ ipcMain (validated) ═══════════════════════════════════════════════════════════  │
│        ▼                                                                                                                      │
│  MAIN PROCESS  ("broker": owns every durable thing and every Windows surface)                                                │
│   ├─ IpcRouter ............ validates sender + zod schema, routes to services                                                │
│   ├─ Store ................ better-sqlite3 (single writer) + file mirrors (jobs/*/state.json, routines/*.json, activity jsonl)│
│   ├─ SecretVault .......... Credential Manager + safeStorage blobs · SecretRegistry (values in RAM for redaction, §11)       │
│   ├─ ApprovalGate (state) . approval/payment rows, expiry timers, Windows Hello (foo-native) ── decisions in engine §9        │
│   ├─ NotificationService .. toasts (Electron Notification toastXml), taskbar overlay/progress/jump list, tray, quiet hours  │
│   ├─ Settings ............. settings.json (atomic write) + locked-key rules                                                  │
│   ├─ PowerService ......... powerSaveBlocker while a job WORKING, resume/suspend/lock events → engine                        │
│   ├─ Redactor (main) ...... instance of src/shared/redactor.ts; SecretRegistry of record lives in SecretVault (§11, X-72)  │
│   └─ EngineSupervisor ..... forks engine AND wa-bridge, wires their port pair, crash counter, safe mode (08-0 §G.14)        │
│        │  MessagePort (structured clone, typed EngineMsg union §2.4)                                                          │
│        ▼                                                                                                                      │
│  UTILITY PROCESS "engine"  (all thinking and acting; may crash without taking the UI down)                                   │
│   ├─ JobRunner ........... queue (max 3 WORKING), steps, steer, stop, stuck watchdog, cost meter, recovery (§5)              │
│   ├─ ChatLane ............ plain replies, reactions, intake classification (one per chat)                                    │
│   ├─ AiAdapterRegistry ... claude-cli · codex-cli · gemini-cli · ollama · openai-key · anthropic-key · google-key · fake (§6)│
│   │      └─ ProcessHost .. spawn via resolved binary, prompt on stdin, Job Object, line reader, timeouts                     │
│   ├─ PromptBuilder ....... identity → rules → tools → protocol → memory → context → job → untrusted → steer (§7)            │
│   ├─ ToolLayer ........... route ladder: CONNECTORS → BROWSER → SCREEN → (email with fresh yes) → HAND BACK (§8)            │
│   │      ├─ connectors/ .. gmail · gcal · contacts · whatsapp (via wa-bridge) · x-drafts · (v1.1) hub [X-48, X-49]           │
│   │      ├─ web/ ......... search (Exa/Tavily key, else Bing in Edge) · read (Firecrawl key, else Readability) [X-46]       │
│   │      ├─ browser/ ..... Playwright → Edge (persistent foo profile), snapshotter, masker, screencast                       │
│   │      └─ screen/ ...... open file/app/URL, screenshot-with-consent (v1 limit, §8.5)                                      │
│   ├─ GateLogic ........... action class → permissions always/ask/never (08-0 §G.3) → rules → hard limits → card or execute│
│   ├─ Redactor (engine) ... same module as main's; registry mirror fed by registry:add / registry:remove from main (§2.4) │
│   ├─ MemoryService ....... file parser/writer, FTS index, post-turn review, nightly tidy (§12)                               │
│   ├─ RoutineScheduler .... 15 s tick, active hours, catch-up after sleep, "tell me only if" (§13)                            │
│   └─ BriefBuilder ........ morning brief candidates → ranking → cards (§14)                                                 │
│        │  MessagePort                                                                                                         │
│        ▼                                                                                                                      │
│  UTILITY PROCESS "wa-bridge" (forked by MAIN, not the engine; Baileys linked device; own port to the engine, §2.4.2)         │
│  CHILD PROCESSES: claude.exe / codex.exe / gemini (node) / whisper-cli.exe — each inside a Job Object                        │
│  EXTERNAL: msedge.exe (foo profile, CDP over pipe) · Ollama at 127.0.0.1:11434 · Google APIs · AI vendor APIs (key mode)    │
└───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

1.2.1 **Load URL and CSP** (08-0 §E.4, X-60, FE-22). Production loads `app://foo/index.html` from a custom protocol registered with `protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }])` before `ready` and served with `protocol.handle('app', …)` from the packaged renderer folder. Development loads `http://localhost:5173` only when the environment variable `FOO_DEV=1`; without it the dev server is never used. Vite `base: './'`; inputs `index.html` (`<html lang="en-IN">`, 02-3 §F24), `windows/live.html`, `windows/viewer.html`, `windows/signin-banner.html`, `windows/pdfraster.html`. The CSP, the same in both modes, is `default-src 'self' app:; img-src 'self' app: data: blob:; style-src 'self' 'unsafe-inline'; connect-src 'none'` (provenance FE-22; `connect-src` has no remote host). X-180 (CR-0022): main also registers the privileged scheme `foo-page` (`{ standard: true, secure: true }`, no fetch) that serves AI pages with their own header CSP (04 §13.6), and the app CSP adds `frame-src foo-page:`; nothing else changes.

1.3 **Layer rules (MUST).**
1. The renderer MUST NOT hold or receive a secret value, ever. It can send one (Secret box → `secret:save`), never read one (Art. 8; Grok write-only, GRK §1.2).
2. The AI adapter layer MUST NOT execute anything with side effects. CLIs are run with their own tools disabled (§6.3). Every side effect happens in the ToolLayer after GateLogic (Art. 5, 10, 12). `[foo decision: Omnibot runs CLIs as agents with their own tools ("not a sandbox", OMB-03 §8); foo cannot, because the approval gate, check≠do and the secret rules must sit between the AI's decision and the action for every provider identically]`.
3. Only the JobRunner changes a job's state; only the ApprovalGate (main) changes an approval's state (J §4 rule 1, §5).
4. Only the main process writes to SQLite and to `{DATA}`. The engine requests writes only through `db.tx` with the `DbOp` grammar and reads only through `db.query` with a named query (§2.4.1, X-71); the engine never sends SQL text. `[foo decision: single writer = no lock contention, and an engine crash cannot corrupt state mid-transaction]`. Exception: the engine writes job screenshots and browser downloads to `{DATA}\jobs\{id}\` directly (binary, append-only).
5. Every string that crosses into the AI, a log, a DB text column, a toast or an export passes the Redactor (§11.4). The Redactor is one module, `src/shared/redactor.ts`, instantiated once in main and once in the engine (X-72, 08-0 §G.6); main holds the SecretRegistry of record; main mirrors registry changes, values included, over the private main↔engine channel only (X-93); the renderer never holds either.

---

## §2. Process model

### 2.1 Processes

| Process | Created by | Count | Owns | Crash behaviour |
|---|---|---|---|---|
| Main | Windows | 1 per user (`app.requestSingleInstanceLock()`; second launch focuses the window, Art. 27) | DB, files, vault, settings, windows, tray, toasts, Hello, power | App crash → next launch runs recovery (§5.9) |
| Renderer `main` | Main | 1 | UI | On `render-process-gone` main reloads it once, restoring the open chat and composer draft, and shows 09 §9.21's 4-s status line. A second `render-process-gone` within 60 s → no reload; the native dialog of 09 §9.21 ("foo's window stopped working." [ Reopen foo ] [ Quit foo ]) — 09 §9.21 owns the copy. There is no in-window error page |
| Utility `engine` | EngineSupervisor at app ready + 300 ms (after first paint) | 1 | Everything in §1.2 engine box | Supervisor restarts it and increments the current launch record's `engineCrashes` (§4.1.3); all jobs → recovery path (§5.9). `engineCrashes` reaching 3 within one launch → safe mode (08-0 §G.14, X-77) |
| Utility `wa-bridge` | **Main** (`EngineSupervisor.startBridge()`), only when a `connections` row with `app='whatsapp'` exists or `whatsapp:linkStart` is called (X-64) | 0–1 | Baileys socket | Main's supervisor restarts it with backoff 5 s, 30 s, 2 min, 10 min and re-wires the port (§2.4.2); after 4 failures the connection status is `error`; the J19.6 "WhatsApp unlinked" card (`WA_UNLINKED`) appears only if the socket reported `logged_out` |
| AI CLI children | Engine ProcessHost | ≤ 4 at once (§5.6) | One AI turn | Killed with the Job Object on stop/timeout |
| `msedge.exe` | Engine via Playwright | 1 browser, ≤ 3 job windows | Web jobs | Engine relaunches on next browser step; running browser steps → step failure (counts toward stuck) |
| `whisper-cli.exe` | Engine | ≤ 1 | One transcription | Killed after 60 s → J7 "I couldn't make out that voice note…" |

2.2 **Startup sequence (MUST, in order; budget Art. 28 cold start < 2.0 s to usable chat list).**
1. `requestSingleInstanceLock` → if lost, forward argv (toast activation args and `foo://` deep links, 08-0 §G.9) to the first instance and quit. AppUserModelID is `com.foo.desktop` (`app.setAppUserModelId`, 09-windows). Launch at sign-in (on by default) passes `--hidden`: the window is not shown, only the tray (09-windows). Then read `{DATA}\launches.json` (§4.1.3): if, among the previous records, 3 or more have `clean: false` and `at ≥ now − 10 min` → this launch is in **safe mode** (08-0 §G.14, X-77). Append this launch's record `{ at: now, clean: false, version, engineCrashes: 0 }` (keep the last 10).
2. Read `settings.json` (sync, < 5 ms), run settings migrations and repair (§4.4.3). If missing → first-run defaults from `src/shared/settingsDefaults.ts`.
3. Open SQLite: `PRAGMA journal_mode=WAL; synchronous=NORMAL; foreign_keys=ON; busy_timeout=2000`; run pending migrations (§4.2); then `PRAGMA quick_check` (§4.1.1). An open failure or a check result other than `ok` runs the damaged-database procedure (§4.1.1) before step 4.
4. `nativeTheme.themeSource` is set from `settings.appearance.theme` **before** the main window is created (02-3 §F28.1); the accent CSS is injected by main with `webContents.insertCSS` (02-3 §F28.3). Create main window with `show:false`; load the renderer (`app://foo/index.html`, §1.2.1); renderer calls `app:getBootstrap` (chat list + first 40 messages of the last-open chat, ≤ 200 KB).
5. `ready-to-show` → show (not when `--hidden`). **Usable chat list here.**
6. +300 ms: fork the engine; the engine runs recovery (§5.9). In safe mode the engine starts no job and no routine and posts the safe-mode card (08-3 §21.2 `SAFE_MODE`).
7. +20 s (09 §9.7, §9.20.1; the same delay on every launch, hidden or not): AI health check if the last verify is > 10 min old (J §4 QUEUED rule), fork wa-bridge if a WhatsApp row exists (§2.1), routine catch-up (§13.6) then the routine scheduler, and the first update check. Update checks then repeat every 6 h while foo runs, and on "Check for updates" (09 §9.20.1).

2.3 **Shutdown** (09 §9.8.4 owns the dialog copy; this section owns the mechanics).
1. Closing the window hides it to the tray (J20; `settings.app.closeToTray`).
2. **Quit foo** (tray, jump list or `app:quit`): if no job is `queued`, `working` or `needs_you` and no approval is `RUNNING` or `CHECKING` → quit at once (step 4). Otherwise main returns `{ quitting: false, runningJobs, paymentInFlight }` and the renderer shows 09 §9.8.4's dialog ("Quit foo?" [ Quit ] [ Keep running ]); on [ Quit ] the renderer calls `app:quit { confirm: true }`.
3. **Payment in flight blocks quit.** If any approval is `RUNNING` with `submitted_at` set, or `CHECKING`, the dialog is 09 §9.8.4's payment variant ("I'm in the middle of paying {amount}. I'll quit as soon as it's finished." [ Quit when finished ] [ Keep running ]). [ Quit when finished ] = `app:quit { confirm: true, whenPaymentDone: true }`: main keeps running (window hidden) until no approval is `RUNNING`/`CHECKING` (bounded by the 15-min CHECKING procedure, 08-2 §10.5), then continues at step 4. Art. 7.
4. Quit mechanics: engine `jobs.pauseAll({ reason: 'app_quit' })` → every unfinished job `waiting` with `waiting_reason='app_quit'` (copy "foo was closed", J20); open approvals keep their absolute `expires_at` (they can expire while foo is closed, J §5); main sets this launch's record `clean: true` in `launches.json`; then `app.exit(0)`. Updates downloaded earlier install now (`autoInstallOnAppQuit`, 09 §9.20).
5. **Windows sign-out / shutdown** (`powerMonitor 'shutdown'` / `query-session-end`, 09 §9.22): never blocks or delays shutdown (no `setShutdownBlockReason`). The engine runs `jobs.pauseAll({ reason: 'windows_shutdown' })` at once; an approval `RUNNING` with `submitted_at` set becomes `CHECKING` on the next launch and is never re-submitted (Art. 7); main sets `clean: true` in `will-quit` if Windows lets it get that far, otherwise the record stays unclean (counted by safe mode; conservative). [settled: 09 §9.24 #7]

### 2.4 Main ⇄ engine messages (internal, not reachable from the renderer)

Transport: `utilityProcess.fork(engine.js)` + one `MessageChannelMain` (08-0 §G.6). Every message is `{ id: string; kind: string; payload }`; requests get `{ re: id, result: Result<T> }`. All payloads are zod-validated on receipt (`src/shared/schemas.ts`). Types named here are 08-0 §B / 08-5 types (`src/shared/types.ts`). `MemoryCmd` is withdrawn (X-111): the Memory page uses the `memory:*` invokes of §3.2.

```ts
type MainToEngine =
  | { kind: "user.message";      payload: { messageId: string; chatId: string } }            // after main stored it
  | { kind: "card.answered";     payload: { cardId: string; answer: CardAnswer } }
  | { kind: "approval.changed";  payload: { approvalId: string; state: ApprovalState } }
  | { kind: "job.stop";          payload: { jobId: string; by: "user" | "system"; reason: StopReason } }
  | { kind: "job.stopAll";       payload: { by: "user" } }
  | { kind: "job.watch";         payload: { jobId: string; on: boolean } }
  | { kind: "job.takeOver";      payload: { jobId: string; on: boolean } }
  | { kind: "signin.done";       payload: { jobId: string } }
  | { kind: "code.submit";       payload: { requestId: string; codeRef: string } }              // codeRef = SecretRegistry handle, never the code
  | { kind: "power";             payload: { event: "suspend" | "resume" | "lock" | "unlock" | "on-ac" | "on-battery" | "shutdown" } }
  | { kind: "net";               payload: { online: boolean } }
  | { kind: "settings.changed";  payload: { paths: SettingsPath[]; settings: Settings } }  // also sent once right after fork with paths: [] (the engine's full copy)
  | { kind: "registry:add";      payload: { handle: string; hash: string; len: number; value: string; normalised: string[]; ttlMs: number } }   // X-93: values exist only in main and engine memory
  | { kind: "registry:remove";   payload: { handles: string[] } }
  | { kind: "bridge.port";       payload: {} }                                                   // transfers the engine end of the wa-bridge port (§2.4.2)
  | { kind: "routine.cmd";       payload: { routineId: string; cmd: "runNow" | "pause" | "resume" | "delete" | "reload" } }   // routine:pause/resume/runNow/delete; reload after main wrote the row for routine:update (X-124)
  | { kind: "ai.cmd";            payload: { cmd: "detect" | "verify" | "choose" | "signIn"; providerId?: ProviderId } }   // no "install" (X-42)
  | { kind: "connection.cmd";    payload: { target: "google" | "outlook" | "whatsapp"; cmd: "connect" | "reconnect" | "disconnect" | "linkStart" | "linkCancel" | "unlink";
                                            connectionId?: string; scopes?: ("gmail" | "gcal" | "contacts")[] } }      // INT-17, 08-0 §G.12
  | { kind: "search.ask";        payload: { query: string; chatId: string } }                    // Ctrl+Enter only (J22)
  | { kind: "job.retry";         payload: { jobId: string } }                                    // J19 Try again (job:retry); the runner re-enters WORKING from FAILED (X-124)
  | { kind: "job.handBack";      payload: { jobId: string } }        // job:handBack (X-124; `mode` withdrawn, X-135)
  | { kind: "signin.skip";       payload: { jobId: string } }                                    // signin:skip (X-124)
  | { kind: "routine.startIdea"; payload: { ideaId: string; chatId: string } }                   // routine:startIdea (X-124)
  | { kind: "webkey.check";      payload: { provider: "exa" | "tavily" | "firecrawl" | "browseruse" } }   // reply { result: "ok" | "refused" | "unknown" } (08-4 §27.3 item 1, X-124, X-127)
  | { kind: "kit.action";        payload: { chatId: string; messageId?: string; cardId?: string; surfaceId: string; name: string; sourceComponentId: string; context: Record<string, unknown>; timestamp: string } }   // kit:action (X-180; the A2UI client `action`; CR-0022 calls it `kit_action`); a gated action is handled as if the user typed it (Art. 6)
  | { kind: "kit.refresh";       payload: { chatId: string; messageId?: string; cardId?: string; surfaceId: string } }   // kit:refresh (X-180, LiveStamp)
  | { kind: "side.question";     payload: { messageId: string; chatId: string } }                // X-180 pick 6 (CR-0022 `side_question`): answered from context; never cancels or re-plans a running job
  | { kind: "test.*";            payload: unknown };                                             // FOO_TEST builds only (§22)

type EngineToMain =
  | { kind: "db.tx";             payload: { ops: DbOp[] } }                                      // §2.4.1; one SQLite transaction; reply { ids: string[]; revs: number[] }
  | { kind: "db.query";          payload: { q: NamedQuery; args: unknown[] } }                   // §2.4.1; named, prepared, read-only
  | { kind: "ui.patch";          payload: UiEvent }                                              // forwarded to the renderer as-is (§3.3)
  | { kind: "notify";            payload: NotificationRequest }                                  // 08-3 §15
  | { kind: "approval.open";     payload: ApprovalDraft }                                        // gate asks main to create the card + approvals row
  | { kind: "approval.transition"; payload: { approvalId: string; to: ApprovalState; data?: { submittedAt?: number; paymentState?: 'submitted' | 'checking' | 'succeeded' | 'failed' } } }   // payment write-ahead per 08-2 §10.4; main replies { ok: true }; no ack in 2 s → the engine treats it as HELD(cannot_check) (08-4 §29.1)
  | { kind: "attachment.prepare"; payload: { fileId: string } }                                  // reply { parts: AttachmentPart[]; covered: number; ocr: "ok" | "unavailable" | "failed" | "not_needed" }
  | { kind: "settings.set";      payload: { path: SettingsPath; value: unknown; chatId: string } }        // an AI `<act>` setting op; main applies 08-0 §A.3 (§4.4.2)
  | { kind: "vault.use";         payload: VaultUseRequest }                                      // 08-2 §11.3 — returns the value ONLY to the engine browser filler
  | { kind: "vault.encrypt" | "vault.decrypt"; payload: { blobRef: "wa-session"; bytes?: Uint8Array } }  // WhatsApp session only
  | { kind: "power.keepAwake";   payload: { on: boolean; jobCount: number } }
  | { kind: "file.write";        payload: { relPath: string; text: string; atomic: true } }       // memory\, helpers\{id}\notes.md, sites\ only; mirrors use DbOp 'mirror'
  | { kind: "log";               payload: LogLine };                                             // already redacted
```

`attachment.prepare` (08-0 §G.17, §G.18): `AttachmentPart = { kind: "image"; path: string; mime: "image/png"; bytes: number; page?: number } | { kind: "text"; text: string; page: number }`. Main runs 08-0 §G.18 (foo-native OCR + blackout, pdfjs-dist in `windows/pdfraster.html`); files land in `{LOCAL}\ai-scratch\attach\` and are deleted after the turn.

`settings.set` from the engine is accepted only for the 08-0 §A.3 allow-list; any other path returns `SETTING_LOCKED` and the engine posts 08-0 §A.3's refusal line with its [ Open Settings ] button deep-linking to the row (`foo://settings/{page}/{row}`).

#### 2.4.1 Data ops and named queries (X-71, BE-07)

```ts
type DbOp =
  | { op: "insert";     table: WritableTable; row: Record<string, unknown>; redact?: string[] }       // redact = columns passed through Store.writeRedacted (§4.6)
  | { op: "update";     table: WritableTable; id: string; set: Record<string, unknown>; expectRev?: number }  // rev = rev + 1 in the same statement; expectRev mismatch → DB_STALE_REV
  | { op: "transition"; table: "jobs" | "routines" | "steps"; id: string; from: string[]; to: string; set?: Record<string, unknown> }  // DB_BAD_TRANSITION if current state ∉ from
  | { op: "delete";     table: HardDeletable; id: string }                                              // only the hard-delete tables of §4.6 rule 3
  | { op: "activity";   row: Omit<ActivityRow, "id" | "at"> }                                          // also appends the activity.jsonl line (§4.1)
  | { op: "mirror";     kind: "job_state" | "plan_md" | "routine_json" | "handoff_md"; id: string; text: string };   // shapes §4.1.2
type WritableTable = "messages" | "cards" | "jobs" | "steps" | "tool_calls" | "ai_turns" | "routines" | "routine_runs" | "memory_index"
  | "memory_tombstones" | "site_notes" | "site_recipes" | "suggestions" | "outbox" | "brief_feedback" | "wa_messages" | "notifications" | "files"
  | "held_items" | "memory_uses" | "memory_group_grants" | "wa_contacts";
type HardDeletable = "wa_messages" | "notifications" | "routine_runs" | "memory_index" | "memory_tombstones" | "site_recipes" | "outbox"
  | "held_items" | "memory_uses" | "memory_group_grants" | "wa_contacts";
// Never writable by the engine: chats, group_members, drafts, helpers, connections, secrets_index, approvals, payments (ApprovalGate in main),
// activity (only through op "activity"), schema_migrations, contacts_index (rebuilt by main from connectors, 08-3 §16.7; X-125).
// Main writes those itself in response to IPC or engine messages. The derived chat columns (seq/next_seq, last_message_id, last_activity_at,
// unread_count, helper_messages_since_user, loop_paused, pill, pill_until) are written only by main inside the transaction of the triggering
// DbOp (§4.6 rule 7, X-129); a DbOp that names one of them → DB_NOT_WRITABLE.
```

One `db.tx` = one SQLite transaction: any failing op rolls back all ops; the reply is `{ ids: string[] /* in op order */, revs: number[] }`. Failure kinds (internal, `DB_*`): `DB_BAD_TRANSITION`, `DB_STALE_REV`, `DB_NOT_WRITABLE`, `DB_CONSTRAINT`. `db.query` names (`NamedQuery`) are exactly the exported keys of `src/main/db/queries.ts`: `chatList`, `chatOpen`, `messagesBefore`, `messagesSince`, `cardsOpenForChat`, `cardById`, `jobById`, `jobsByState`, `stepsForJob`, `toolCallsForJob`, `toolCallsUnknown`, `approvalsOpenForJob`, `approvalById`, `paymentsDuplicate`, `monthAiSpend`, `monthPurchases`, `routinesDue`, `routineById`, `routineRuns`, `memorySearch`, `memoryByScope`, `memoryTombstoned`, `memoryUsedInChat` (fact ids used in a chat, newest first, last 90 days; 08-4 §24.16), `siteNotes`, `siteRecipe`, `suggestionState`, `connectionsByApp`, `secretsIndexByKind`, `activityForJob`, `notificationsToday`, `waMessages`, `contactsSearch`, and the round-2 additions (X-124, 08-0 §B.6): `'jobs.liveForChat'(chatId)`, `'cards.openForChat'(chatId, type)`, `'notifications.countToday'(kind)`, `'helpers.byId'(id)`, `'group_members.forChat'(chatId)`, `'held_items.forChat'(chatId)`, `'brief_feedback.recent'(n)`, `'wa_contacts.byTitle'(normTitle)`, `'files.byId'(id)`, `'routine_runs.latestObserved'(routineId)`. Each query's SQL is in `src/main/db/queries.ts` under the same name; 08-3 §22 has a test that every `NamedQuery` member has exactly one prepared statement. Every query adds `deleted_at IS NULL` for `chats`, `messages`, `cards`. Adding a query or a writable table is a constitution change.

#### 2.4.2 Main ⇄ wa-bridge ⇄ engine (X-64, BE-06)

Main forks `wa-bridge` (§2.1), creates a `MessageChannelMain`, posts one end to the engine (`bridge.port`) and the other to the bridge; after that the engine and the bridge talk directly. Messages are `{ id; kind; payload }`, zod-validated on receipt:

```ts
type EngineToBridge =
  | { kind: "wa.linkStart" } | { kind: "wa.linkCancel" } | { kind: "wa.unlink" }
  | { kind: "wa.send";       payload: { jid: string; text: string; draftCardId: string } }
  | { kind: "wa.readRecent"; payload: { jid?: string; sinceMs: number } }                     // answered by wa.readRecent.result
  | { kind: "wa.onWhatsApp"; payload: { jids: string[] } }                                     // one sock.onWhatsApp(...jids) call; answered by wa.onWhatsApp.result (X-124)
  | { kind: "wa.session";    payload: { bytes: Uint8Array | null } };                         // decrypted by main via vault.decrypt at bridge start
type BridgeToEngine =
  | { kind: "wa.qr";      payload: { qr: string; expiresAt: number } }                        // expiresAt = linkStartAt + 60_000 (the panel's expiry), the same value on every code of one link attempt; the engine renders the PNG (X-124)
  | { kind: "wa.onWhatsApp.result"; payload: { results: { jid: string; exists: boolean }[] } }   // exists = the entry is present with exists: true (X-124)
  | { kind: "wa.readRecent.result"; payload: { messages: WaMessageRow[] } }                  // what the bridge still holds in memory; the engine merges with wa_messages (X-124)
  | { kind: "wa.linked";  payload: { jidMasked: string; accountHash: string } }
  | { kind: "wa.message"; payload: WaMessageRow }
  | { kind: "wa.ack";     payload: { waMessageId: string; level: 1 | 2 | 3 | 4 } }
  | { kind: "wa.state";   payload: { state: "connecting" | "open" | "closed" | "logged_out"; reason?: string } }
  | { kind: "wa.creds";   payload: { bytes: Uint8Array } }                                    // engine → vault.encrypt → {DATA}\vault\wa-session.bin
  | { kind: "wa.error";   payload: { kind: "WA_LINK_FAILED" | "WA_UNLINKED" | "SEND_FAILED" } }      // ErrorKind members (08-3 §21.2)
  | { kind: "wa.contacts"; payload: { contacts: { jid: string; name?: string; phone?: string }[] } };   // engine upserts wa_contacts through DbOp
```

Restart, backoff and the 4-failure rule are §2.1's and run in main's supervisor; after a restart main re-sends `bridge.port` with a fresh port pair.

2.5 **Concurrency inside the engine.** Single Node event loop; no shared memory. Per-job work is async and cancellable via one `AbortController` per job (§5.7). CPU-heavy work (memory file parsing and hashing, export zip, JPEG mask checks) runs in `worker_threads` inside the engine; the resulting rows go to main as one `db.tx`, and main rebuilds `memory_fts` (`INSERT INTO memory_fts(memory_fts) VALUES ('rebuild')`) in that transaction (DB-27). The engine never opens the database file.

---

## §3. IPC contract (renderer ⇄ main)

### 3.1 Bridge

`preload.ts` exposes exactly one object:

```ts
interface FooBridge {
  invoke<C extends InvokeChannel>(channel: C, payload: InvokeIn[C]): Promise<Result<InvokeOut[C]>>;
  on<E extends EventChannel>(event: E, cb: (payload: EventPayload[E]) => void): () => void; // returns unsubscribe
  send(event: "face:raster", payload: EventPayload["face:raster"]): void;   // the one renderer → main event (§3.3.1; X-135)
  platform: { osBuild: string; reducedMotion: boolean; highContrast: boolean };
  // reducedMotion is the start value only; the renderer follows matchMedia('(prefers-reduced-motion: reduce)') change events (02 F7); no event from main
}
declare global { interface Window { foo: FooBridge } }
```

3.1.0 **Typed contract and client** (08-0 §G.10, X-68, FE-25). `src/shared/ipc.ts` exports `type Invokes = { [channel]: { req; res } }` and `type Events = { [channel]: payload }` with one entry for every channel in §3.2 and §3.3 (and nothing else; that includes the round-2 channels of 08-0 §B.6 — `activity:list`, `activity:saveCsv`, `spend:month`, `suggestions:listDismissed`, `files:list`, `routine:ideaStatus`, `message:get` — and the one renderer → main event `face:raster`, §3.3.1); `InvokeChannel`, `InvokeIn`, `InvokeOut`, `EventChannel`, `EventPayload` derive from them, and the zod schemas in `src/shared/schemas.ts` mirror them. The renderer calls IPC only through `src/renderer/ipc/client.ts`: `invoke<K>(channel, req)` and the hook `useFooEvent(channel, handler)`; components never touch `window.foo` (lint `foo/no-window-foo`). `invoke` rejects with `IpcTimeoutError` (a renderer-only class, not an `ErrorKind`) after **15 s**, except: `files:stage` 60 s, `ai:verify` 60 s, `payment:approve` 180 s (a Windows Hello prompt is open), `ai:signIn` 600 s (the sign-in runs in a browser), `files:pickFolder` / `files:pickImage` no timeout (a native dialog is open). Every other long operation (`connection:connect`, `data:export`, `data:deleteEverything`) returns at once and reports progress and its end on an event (§3.3). On `IpcTimeoutError` the caller shows its own failed state; only `message:send` retries, once, with the same `clientId` (idempotent, §3.2).

3.1.1 Main MUST reject (return `IPC_REJECTED`, log once) any call whose `event.senderFrame.url` origin is not `app://foo` (or `http://localhost:5173` when `FOO_DEV=1`, §1.2.1), whose window is not one of foo's own windows, whose channel is not allowed for that window, or whose payload fails zod. Windows and their channels: `main` — all of §3.2; `live` (09 §9.27) — `job:stop`, `job:takeOver`, `job:handBack`, `job:watch`; `signin-banner` — `signin:done`, `signin:skip`, `job:handBack`; `viewer` — `files:open`, `files:showInFolder`. `[Omnibot loopback+origin checks, OMB-03 §8]`
3.1.2 No channel takes a file path chosen by the renderer except the ones marked **path** below, and those paths MUST be inside `{DATA}`, `{OUT}` or a folder in `settings.permissions.folders` whose `mode` is not `never` (J21 Folders) — else `PATH_NOT_ALLOWED`.
3.1.3 Approval and payment calls carry the card's `nonce` (random 128-bit, created with the card). A stale nonce (card superseded) returns `CARD_STALE`. The AI has no route to these channels: the only producer is a user click or key press in the renderer (Art. 6). Calls that resolve a card also carry `resolvedBy: 'tap' | 'keyboard'`, stored in `cards.resolved_by` (08-0 §G.2); main itself writes `toast`, `typed`, `reaction`, `auto` or `system` for the other paths.
3.1.4 Payload size limit 1 MB per invoke (voice notes and attachments use `files:stage`, which streams to `{DATA}\data\inbox\` first).
3.1.5 **Patches and `rev`** (08-0 §B.1, X-57). Every `*Row` sent to the renderer carries the row's stored `rev`. The renderer store applies a `*:upsert` patch only when `patch.rev > held.rev` or the row is unknown; otherwise it drops it. Invoke results that return a row follow the same rule.
3.1.6 **Test-only channels** (08-3 §22.8, 08-0 §C.4). `test:*` channels exist only in `FOO_TEST=1` builds and are not in §3.2: `test:sendTo { paths: string[] }` simulates the Send to argv (12-2 §12.29).
3.1.7 **One engine message per engine-affecting invoke** (X-124). Every invoke whose Writes column names an engine-owned table or a job state sends exactly one `MainToEngine` message named in §2.4; main never calls into the engine any other way. The "Engine message" notes in §3.2 name it where the channel and the message differ in name.

### 3.2 Invoke channels (request → response)

Names follow 08-0 §0 (`{domain}:{verb}`); no invoke name is ever used as an event name (08-0 §B.5, contract test). Row and payload types are 08-0 §B (`src/shared/types.ts`). Every error listed is an `ErrorKind` (§0.3).

| Channel | In | Out | Errors | J | Art |
|---|---|---|---|---|---|
| `app:getBootstrap` | `{}` | `Bootstrap { settings: PublicSettings; chats: ChatRow[]; openChatId?: string; firstMessages: MessageRow[]; setup: SetupState; ai: AiStatus; spend: SpendSummary; connections: ConnectionRow[]; safeMode: boolean }` (soft-deleted rows excluded) | `DB_OPEN_FAILED` | J1 | 28 |
| `app:quit` | `{ confirm: boolean; whenPaymentDone?: boolean }` | `{ quitting: boolean; runningJobs: number; paymentInFlight: { amountPaise: number } \| null }` — mechanics §2.3 | — | J20 | 7 |
| `app:openExternal` | `{ target: "google_signin" \| "x_intent" \| "google_account" \| "maker_page" \| "handback_site" \| "ai_page" \| "action_chip"; url?: string; providerId?: ProviderId; cardId?: string; nonce?: string; messageId?: string; index?: number /* action_chip: 0..2 */ }` | `void` | `URL_NOT_ALLOWED` | J2, J4, J12, J13 | 2 |
| `app:openWindowsSettings` | `{ page: WindowsSettingsPage }` (08-0 §B.2) | `void` | — | J7, J19, J20 | 2 |
| `kit:action` [X-180] | `KitActionMessage` (`src/shared/kit/catalog.ts`: chatId, messageId or cardId, surfaceId, name, sourceComponentId, context, timestamp) | `void` (sends one `kit.action`) | `VALIDATION` | 04 §13.5 | 6 |
| `kit:refresh` [X-180] | `{ chatId; messageId?; cardId?; surfaceId }` | `void` (sends one `kit.refresh`) | `VALIDATION` | 04 §13.5 | — |
| `page:rpc` [X-180] | `{ chatId; pageId; call: PageRpcCall }` (`src/shared/kit/page.ts`; JSON-RPC 2.0 `reportSize` \| `draftMessage` \| `openLink` \| `requestAction`) | `{ ok: true } \| { ok: false; refused: 'secret' \| 'rate' \| 'schema' \| 'declined' }`; every call logged | — | 04 §13.6 | 6, 8 |
| `keep:save` [X-180] | `{ chatId; messageId?; cardId?; kind: 'kit' \| 'page'; title; body; png?; rect?: { x; y; width; height } /* CSS px, ints 0..10000 */ }` | `KeptItem` (a `kept_items` row; never a plain `.html` file; with `rect`, main snapshots the PNG with `webContents.capturePage(rect)`) | `DISK_FULL` | CR-0022 pick 9 | — |
| `keep:list` [X-180] | `{ chatId }` | `KeptItem[]` (newest first; the chat's Files tab) | — | CR-0022 pick 9 | — |
| `keep:open` [X-180] | `{ id }` | `{ kind: 'kit' \| 'page'; body: string }` (the kept A2UI JSON or `.foopage` blob; a page then opens through `page:open`) | `NOT_FOUND` | CR-0022 pick 9 | — |
| `keep:showInFolder` [X-180] | `{ id }` | `void` (Explorer selects the body file under {DATA}) | `NOT_FOUND` | CR-0022 pick 9 | — |
| `page:open` [X-180] | `{ chatId; messageId?; cardId?; index?; keptId? }` (exactly one of `messageId`, `cardId`, `keptId`; `index` = which `page` fence) | `{ pageId }` (main stores the HTML and serves it at `foo-page://{pageId}`) or `{ failed: 'too_large' \| 'not_found' }` | — | 04 §13.6 | — |
| `app:checkUpdates` | `{}` | `{ status: "none" \| "downloading" \| "ready"; version?: string }` | `UPDATE_FAILED` | J21 | — |
| `app:reportPreview` / `app:reportSave` | `{}` / `{ previewId: string }` | `{ previewId: string; text: string }` / `{ zipPath: string }` — saves the redacted .zip to `{OUT}\reports\`, opens it in File Explorer; never touches the network (X-12) | `DISK_FULL`, `EXPORT_SECRET_FOUND` | J19.5, J21 | 15 |
| `setup:getState` | `{}` | `SetupState` | — | J1–J5 | — |
| `setup:answer` | `{ step: SetupState["step"]; answer: unknown }` | `SetupState` | `VALIDATION` | J3, J4 | — |
| `setup:skip` | `{ all?: boolean }` | `SetupState` | — | J3 | — |
| `chat:list` | `{ filter?: "all" \| "needs_you" \| "working" \| "done"; q?: string }` | `ChatRow[]` | — | J22 | 28 |
| `chat:open` | `{ chatId }` | `{ messages: MessageRow[]; cards: CardRow[]; jobs: JobRow[]; draft: DraftRow \| null; waMessages?: WaMessageRow[] }` (`waMessages` present only for `kind='wa_mirror'` chats, newest 200, 08-3 §16.4.3) | `NOT_FOUND` | all | 28 |
| `chat:markRead` | `{ chatId; upToSeq: number }` | `void` | — | J20 | — |
| `chat:pin` | `{ chatId; on: boolean }` | `ChatRow` | — | J20 | — |
| `chat:mute` | `{ chatId; until: number \| "forever" \| null }` (`null` = unmute) | `void` — writes `settings.notifications.mutedChats[chatId]` (08-0 §A; the only mute store) and emits `settings:changed` | — | J20 | 19 |
| `chat:archive` | `{ chatId; on: boolean }` | `ChatRow` — used only by 06-3 C-8 "Hide from foo" (`on: true`) and its "show again" row in Settings → Connections → WhatsApp (`on: false`): sets `chats.archived` and adds/removes the chat's `wa_jid` in `settings.connections.whatsapp.hiddenJids` in one step; any chat whose `kind ≠ 'wa_mirror'` → `VALIDATION` | `VALIDATION` | J16 | 15 |
| `chat:delete` | `{ chatId; confirm: true }` | `void` — soft delete + purge in one transaction (§4.6 rule 3) | `CHAT_BUSY` (job running) | J16, J21 | 15 |
| `message:list` | `{ chatId; beforeSeq?: number; limit: number (≤ 200) }` | `MessageRow[]` | — | — | 28 |
| `message:get` | `{ messageId }` | `MessageRow` — delta resync after a `message:delta` gap (08-5 §5 rule 4, X-117) | `NOT_FOUND` | all | 28 |
| `message:send` | `{ chatId; clientId: string /* UUIDv4 made by the composer, one per composed message */; text: string; replyToId?: string; attachmentIds?: string[]; secretOverride?: boolean; side?: boolean /* X-180: an "Ask about this" side question; needs replyToId */; quote?: string /* X-180: the selected words (≤ 2000), only with side; folded into the side question's AI text, not stored */ }` | `{ messageId: string; queued: boolean }` — **idempotent**: a repeat with a known `(chatId, clientId)` (unique index `messages_client`) returns the existing `messageId` and its current `queued` value and creates nothing | `SECRET_SUSPECTED` (returns `PasteCatch`), `FILE_TOO_BIG`, `CHAT_PAUSED` | J5, J7, J8, J18 | 6, 8, 18 |
| `message:react` | `{ messageId; emoji: string; on: boolean }` | `void` | — | J6, J8 | 6 |
| `message:pin` | `{ messageId: string; on: boolean }` | `void` — sets `messages.pinned`; only voice messages | `NOT_FOUND` | J21 | 15 |
| `composer:checkSecret` | `{ text: string }` | `PasteCatch \| null` | — | J2, C8 | 8 |
| `composer:saveDraft` | `{ chatId; text: string; attachmentIds: string[]; replyToId?: string; linkPreviewRemoved: boolean }` (text redacted before store; the renderer debounces 500 ms and also saves on chat switch and window close, 04-2 §23.5) | `void` — upserts the chat's `drafts` row; empty text, no attachments and no reply target deletes it | — | J19.5 | — |
| `files:stage` | `{ name: string; bytes: ArrayBuffer }` (chunked, ≤ 25 MB) | `{ attachmentId: string }` (`att_…`) | `FILE_TOO_BIG`, `FILE_TYPE` | J7 | — |
| `files:open` / `files:showInFolder` **path** | `{ path: string }` | `void` | `PATH_NOT_ALLOWED` | J21, J22 | 15 |
| `files:pickFolder` / `files:pickImage` | `{ purpose: "output" \| "grant" \| "export" \| "avatar" }` | `{ path?: string }` | — | J3, J21 | — |
| `files:list` | `{ helperId?: string; chatId?: string; jobId?: string; kinds?: FileRow["kind"][]; limit: number (≤ 200) }` | `FileRow[]` (newest first, `missing_since IS NULL` first) — 06-1 §4 helper Files list (X-124) | — | J15, J22 | 15 |
| `voice:submit` | `{ chatId; attachmentId; durationMs: number }` | `{ messageId }` | `VOICE_TOO_SHORT` | J7 | 23 |
| `card:answer` | `{ cardId; nonce; answer: CardAnswer; resolvedBy: "tap" \| "keyboard" }` | `CardRow` | `CARD_STALE`, `CARD_EXPIRED` | J8, C3 | 6 |
| `card:approve` | `{ cardId; nonce; scope: "once" \| "chat" \| "always"; resolvedBy: "tap" \| "keyboard" }` — `chat`/`always` only for `use_app` and `calendar_write` approvals (08-0 §G.3) | `{ state: ApprovalState }` | `CARD_STALE`, `CARD_EXPIRED`, `SCOPE_NOT_ALLOWED` | J9, J12 | 5, 6 |
| `card:decline` | `{ cardId; nonce; resolvedBy: "tap" \| "keyboard" }` | `CardRow` | `CARD_STALE` | J9–J12 | 5 |
| `card:askAgain` | `{ cardId }` | `{ newCardId?: string }` | `AI_*` | C4, J10 | 7 |
| `card:heldPick` | `{ cardId; nonce; optionId; resolvedBy: "tap" \| "keyboard" }` | `CardRow` | `CARD_STALE` | G17 | 10 |
| `draft:update` | `{ cardId; nonce; fields: DraftFields }` | `CardRow` (new nonce; the same PENDING approval re-hashed, 08-0 §G.7) | `VALIDATION` | J12 | 4 |
| `draft:send` | `{ cardId; nonce; resolvedBy: "tap" \| "keyboard" }` = approve once (`approved_via='card'`, X-65) | `{ approvalId: string; undoUntil: number }` (`now + 5 s`) | `CONN_EXPIRED`, `CONN_REVOKED`, `CONN_RATE_LIMITED`, `CONN_SCOPE_MISSING` (X-120), `NET_OFFLINE` (returns the offline choice) | J12 | 4, 5 |
| `draft:undo` | `{ approvalId }` | `{ undone: boolean }` | `TOO_LATE` | J12 | 4 |
| `draft:discard` | `{ cardId; nonce; resolvedBy: "tap" \| "keyboard" }` (runs `drafts.delete` on Gmail) | `CardRow` | — | J12 | 4 |
| `draft:openInApp` | `{ cardId }` (X intent / Gmail draft link) | `void` | — | J12 | 4 |
| `payment:approve` | `{ cardId; nonce; cvvRef?: string; resolvedBy: "tap" \| "keyboard" }` → main runs Windows Hello if `amountPaise ≥ settings.money.bigPaymentPaise` | `{ state: ApprovalState }` | `HELLO_CANCELLED`, `HELLO_UNAVAILABLE` (renderer then shows the typed-amount confirm), `CARD_EXPIRED`, `CAP_PURCHASE` | J10, J11 | 7 |
| `payment:confirmTypedAmount` | `{ cardId; nonce; typed: string }` | `{ state: ApprovalState }` | `AMOUNT_MISMATCH` | J10 | 7 |
| `payment:decline` | `{ cardId; nonce; resolvedBy: "tap" \| "keyboard" }` | `CardRow` | — | J10 | 7 |
| `payment:changeMethod` | `{ cardId; nonce; method: { kind: "card"; secretName: string } \| { kind: "upi" } }` | `CardRow` (new nonce) | — | J10 | 7 |
| `secret:save` | `{ requestId?: string; kind: SecretKind; name: string; fields: Record<string, string> }` — `name` is the `{name}` part of the 08-0 §E.8 target for that kind (zod regex per kind); main writes target `foo/{kind}/{name}`. For `kind='card'` with an existing `(kind, name)` → `SECRET_EXISTS` (nothing is written); every other kind replaces the value and writes `activity.secret_replaced` (X-129). For `kind='web_key'` main saves the value, sends `webkey.check` (§2.4), then writes `connections.web.search = name` (exa/tavily), `.read = 'firecrawl'` or `.cloudBrowser = true`, and `connections.web.refused[name] = (result === 'refused')`; the Settings row renders from these settings only. Saving a Tavily key while an Exa key exists switches `search` to `tavily` and keeps the Exa key in the vault (the row then offers "Use Exa instead" / "Use Tavily instead", one line, no confirm); `secret:delete` on a web key resets the matching `search`/`read`/`cloudBrowser` to `this_pc`/`false` and `refused[name] = false` (X-127) | `{ target: string; savedAt: number; label: string }` | `VAULT_WRITE_FAILED`, `SECRET_EXISTS` | J2, J10, J13, C7 | 8 |
| `secret:list` | `{}` | `SecretIndexRow[]` (targets, labels, last4 — never values) | — | J21 | 8 |
| `secret:delete` | `{ target: string; confirm: true }` | `void` | `VAULT_WRITE_FAILED` | J21 | 8 |
| `code:submit` | `{ requestId; code: string }` (a `secret` card with `secretKind: 'otp'`; the code goes straight to the engine filler via SecretRegistry; never stored) | `void` | `REQUEST_GONE` | J13 | 8 |
| `cvv:submit` | `{ cardId; nonce; cvv: string }` (a `secret` card with `secretKind: 'cvv'`) → returns a `cvvRef` handle (RAM only, TTL 10 min) | `{ cvvRef: string }` | — | J10 | 7, 8 |
| `signin:done` / `signin:skip` | `{ jobId }` | `void` — Engine message `signin.done` / `signin.skip` (§3.1.7) | `JOB_GONE` | J13 | — |
| `job:takeOver` / `job:handBack` | `{ jobId }` / `{ jobId }` (hand back has one meaning: foo re-reads the page and carries on, 06-3 §11.2; X-135) | `void` — Engine message `job.takeOver { on: true }` / `job.handBack { jobId }` (§3.1.7) | `JOB_GONE` | J13, J18 | — |
| `job:stop` | `{ jobId }` | `StopReport { jobId; done: ActivityRow[]; nothingDone: boolean }` | `JOB_GONE` | J18 | 12, 18 |
| `job:stopAll` | `{ confirm: true }` | `StopReport[]` | — | J18, J20 | 18 |
| `job:details` | `{ jobId }` | `{ job: JobRow; steps: StepRow[]; frames: { stepId; path; at }[]; proof?: Proof; costs: CostLine[] }` | — | J18 | 11, 12 |
| `job:watch` | `{ jobId; on: boolean }` | `void` (frames arrive on `live:frame`) | `LIVE_UNAVAILABLE` | J18 | 8 |
| `job:openWindow` | `{ jobId }` | `void` | `BROWSER_MISSING` | J18 | — |
| `job:retry` | `{ jobId }` | `{ newJobId }` — Engine message `job.retry` (§3.1.7) | — | J19 | — |
| `plan:go` / `plan:change` | `{ cardId; nonce; text?: string; resolvedBy: "tap" \| "keyboard" }` | `CardRow` | — | C11, J10 | 13 |
| `stuck:choose` | `{ cardId; nonce; choice: "other_way" \| "take_over" \| "stop"; resolvedBy: "tap" \| "keyboard" }` (`stop` → CANCELLED, `stop_reason='stuck_stop'`, X-80) | `CardRow` | — | J19.4 | 13 |
| `recovery:choose` | `{ cardId; nonce; choice: "resume" \| "stop"; resolvedBy: "tap" \| "keyboard" }` (an `error` card with `variant: 'recovery'`) | `CardRow` | — | J19.5 | 7 |
| `memory:list` | `{ filter: MemoryFilter; q?: string }` | `MemoryFactView[]` | `MEMORY_PARSE` (with bad lines) | J17 | 15 |
| `memory:add` / `memory:edit` | `{ text: string }` / `{ factId; text }` | `MemoryFactView` | `VALIDATION` | J17 | 15 |
| `memory:setPrivate` | `{ factId; private: boolean }` | `MemoryFactView` | — | J17, 06 §7 "Mark private" [X-06] | 15 |
| `memory:setKind` | `{ factId; kind: MemoryKind }` | `MemoryFactView` (line moves to the matching file) | — | 06 §7 "Move to…" [X-06] | 15 |
| `memory:forget` | `{ factId }` | `{ undoToken: string }` (`undo_…`) | — | J17 | 15 |
| `memory:undo` | `{ undoToken }` | `MemoryFactView` | `TOO_LATE` | J17 | 15 |
| `memory:forgetBySource` | `{ source: MemoryOrigin; confirm: true }` | `{ count: number }` | — | J17 | 15 |
| `memory:forgetAll` | `{ typed: "FORGET" }` | `{ count }` | `CONFIRM_MISMATCH` | J17 | 15 |
| `memory:openFolder` | `{}` | `void` | — | J17 | 15 |
| `helper:create` / `helper:update` | `HelperForm` / `{ helperId; patch: Partial<HelperForm> }` | `HelperRow` | `NAME_TAKEN`, `HELPER_LIMIT` | J15 | — |
| `helper:pause` / `helper:delete` | `{ helperId; on?: boolean }` / `{ helperId; confirm: true; stopJobs: boolean }` | `HelperRow` / `void` | `HELPER_BUSY` | J15 | — |
| `group:create` / `group:update` / `group:delete` | `{ name; helperIds: string[] }` / `{ chatId; name?; helperIds? }` / `{ chatId; confirm: true }` | `ChatRow` / `ChatRow` / `void` | `GROUP_SIZE` | J16 | 14 |
| `routine:list` / `routine:get` | `{}` / `{ routineId }` | `RoutineRow[]` / `RoutineDetail` (with last 20 runs) | — | J14 | — |
| `routine:update` | `{ routineId; patch: RoutinePatch }` | `RoutineRow` — Engine message `routine.cmd { cmd: "reload" }` after main wrote the row (§3.1.7) | `INTERVAL_TOO_SHORT`, `ROUTINE_LIMIT` | J14 | 19 |
| `routine:pause` / `routine:resume` / `routine:runNow` / `routine:delete` | `{ routineId; confirm?: true }` | `RoutineRow` / `void` | — | J14 | — |
| `routine:pauseAll` / `routine:resumeAll` | `{ hours?: number }` | `{ count }` | — | J14, J20 | — |
| `routine:startIdea` | `{ ideaId: string }` | `{ chatId: string }` — main navigates to the idea's owner chat and the engine starts the idea's setup job (12-1 §12.24.5); Engine message `routine.startIdea { ideaId, chatId }` (§3.1.7) | `NOT_FOUND` (unknown idea id) | J24 | 20 |
| `routine:ideaStatus` | `{}` | `{ irctcSignedIn: boolean }` — the engine's `irctc.isSignedIn()` (cookies of foo's Edge profile, cached 10 min, X-124) | — | J24 | — |
| `ai:detect` | `{}` | `DetectRow[]` (rows also stream on the event `ai:detectRow`) | — | J2 | — |
| `ai:verify` | `{ providerId }` | `VerifyResult` | `AI_*` | J2 | 12 |
| `ai:choose` | `{ primary: ProviderId; backup?: ProviderId \| null }` | `AiStatus` | `AI_NOT_VERIFIED` | J2, J21 | — |
| `ai:signIn` | `{ providerId }` | `{ email?: string }` (timeout 600 s, §3.1.0) | `SIGNIN_TIMEOUT` | J2, J19.1 | — |
| `connection:list` | `{}` | `ConnectionRow[]` | — | J21 | 15 |
| `connection:connect` | `{ app: "google" \| "outlook"; scopes?: ("gmail" \| "gcal" \| "contacts")[] /* google only; default all three; incremental consent passes only the missing ones */ }` — `outlook` only while `flags.outlook` | returns **at once** `{ connectionId: string; status: "connecting" }` after the browser is opened (`connectionId` = the first row in the order gmail, gcal, contacts that was created or updated); progress and the final row arrive on `connection:upsert`; `OAUTH_DENIED`, `OAUTH_TIMEOUT`, `NET_OFFLINE` arrive as `lastErrorKind` on that row (08-0 §G.12, INT-17). Connector tool calls on these rows report `CONN_EXPIRED`, `CONN_REVOKED`, `CONN_RATE_LIMITED` or `CONN_SCOPE_MISSING` (HTTP 403 `insufficientPermissions` / `ACCESS_TOKEN_SCOPE_INSUFFICIENT` → that `granted` flag false; Settings row "Not allowed yet" + "Allow" = this channel with only the missing `scopes`, X-120, X-127) | — | J4, J13 | — |
| `connection:disconnect` | `{ connectionId; confirm: true }` — on any Google row this is "Disconnect Google": revokes the one shared token and deletes the gmail, gcal and contacts rows plus `contacts_index` (08-0 §G.12). Calendar and Contacts are turned off/on with `settings:set` on `connections.google.calendarOn` / `contactsOn`, never with this channel | `void` | — | J21 | 15 |
| `whatsapp:linkStart` / `whatsapp:linkCancel` / `whatsapp:unlink` | `{}` | `void` (QR on `whatsapp:qr`) | `WA_LINK_FAILED` | J4, J16 | 4 |
| `settings:get` | `{}` | `PublicSettings` | — | J21 | — |
| `settings:set` | `{ path: SettingsPath; value: unknown }` | `{ settings: PublicSettings; changeId: string \| null }` (§4.4.2) | `SETTING_LOCKED`, `VALIDATION` | J21 | 5, 7, 13, 19 |
| `settings:undo` | `{ changeId: string }` | `{ settings: PublicSettings }` (§4.4.2; 08-0 §A.3) | `TOO_LATE` | J21 | 15 |
| `rules:remove` | `{ ruleId }` | `void` | — | J21 | 5 |
| `suggestions:restoreDismissed` | `{ key?: string }` (one key; omitted = all) | `{ count }` | — | J21 | 20 |
| `suggestions:listDismissed` | `{}` | `SuggestionRow[]` (`state='dismissed'`, newest `decided_at` first) — the Dismissed-suggestions dialog (06-2 §6.6) | — | J21 | 20 |
| `activity:list` | `{ kind?: ActivityRow["kind"]; actor?: string; chatId?: string; jobId?: string; from: number; to: number; q?: string; beforeAt?: number; limit: number (≤ 200) }` | `{ rows: ActivityRow[]; more: boolean }` (newest first; `q` uses `activity_fts` on `summary` plus LIKE on `to_label`, `from_label`, `chat_title`, `proof_ref`; private-chat rows match only on `chat_title`) | — | J21 | 11, 15 |
| `activity:saveCsv` **path** | `{ folder: string; fileName: string; filter: /* activity:list In without beforeAt and limit */ }` | `{ path: string }` — columns in order `time` (Art. 21 format in the user's zone), `who` (`actor`: "you" for the user, `{agentName}` for foo, the helper name), `what` (`summary`), `to` (`to_label`), `amount` (₹ formatted, empty when NULL), `approved how` (06-3 §9.4 words), `proof` (`proof_kind`: `proof_ref`); UTF-8 with BOM, CRLF, RFC 4180 quoting | `DISK_FULL`, `PATH_NOT_ALLOWED` | J21 | 15 |
| `spend:month` | `{ month: string /* YYYY-MM */ }` | `SpendSummary` (08-5 §3.2) | `VALIDATION` (a month before `earliestMonth` = the month of `settings.install.at`, or after the current month) | J19.3 | 13 |
| `search:query` | `{ q: string; filter: SearchFilter; limit?: number }` | `SearchResults` (grouped, ≤ 5 per group) | — | J22 | 28 |
| `search:recent` / `search:clearRecent` | `{}` | `string[]` / `void` | — | J22 | — |
| `search:ask` | `{ q: string }` | `{ messageId }` (foo answers in its chat, cites) | `AI_*` | J22 | — |
| `data:export` **path** | `{ folder: string }` | returns at once `{ exportId: string }`; progress, the final `{ path }` and `EXPORT_SECRET_FOUND` / `DISK_FULL` arrive on `data:exportProgress` | — | J21 | 15 |
| `data:deleteOlderThan` | `{ days: 0 \| 30 \| 90 \| 365; chatId?: string; confirm: true; dryRun?: true }` — `days: 0` only with `chatId` (06-3 C-1 "Clear messages"); soft delete + purge of every message older than `now − days` and its cards, never an approval, payment or activity row (§4.6 rule 3). `dryRun: true` returns the counts and deletes nothing (06-3 C-17 opens with a dry run and confirms with the real call, X-124) | `{ chats: number; messages: number }` | `VALIDATION` | J21 | 15 |
| `data:deleteEverything` | `{ typed: "DELETE" }` | `void` (progress on `data:wipeProgress`; app restarts to J1) | `PARTIAL_WIPE` (lists items) | J23 | 15 |
| `notifications:status` | `{}` | `{ windowsAllowed: boolean; focusAssist: boolean }` | — | J20 | — |

**`app:openExternal` rules** (INT-12, BE-41). Only `https:` URLs, resolved per target: `google_signin` — a URL main built for the running sign-in, host `accounts.google.com`; `x_intent` — `https://x.com/intent/…`; `google_account` — exactly `https://myaccount.google.com/`; `maker_page` — the URL for `providerId` in `resources/maker-pages.json` (08-0 §E.5; the renderer never passes the URL); `handback_site` — `url` for which `handback.check(url)` (08-4 §27.4 rule, the one matcher in `src/shared/handback.ts`, 08-0 §E.9, X-129) is true, and only with the `cardId` + `nonce` of the card that offers it; `ai_page` (X-180) — an `https:` `url` an AI page's `openLink` asked for, only after the user confirmed the C-26 dialog (04 §13.6); `action_chip` (X-180, CR-0022 pick 16) — main reads chip `index` of the stored foo reply `messageId`'s `messages.actions` and builds the target itself (`link`: its `https:` value; `map`: `https://www.google.com/maps/search/?api=1&query={value}`; `call`: `tel:{digits}`), only after the C-26 dialog; the renderer never passes a URL. Anything else → `URL_NOT_ALLOWED`. `ms-settings:` URIs never go through this channel; `app:openWindowsSettings` maps `notifications` → `ms-settings:notifications`, `privacy-microphone` → `ms-settings:privacy-microphone`, `startupapps` → `ms-settings:startupapps`, `signin` → `ms-settings:signinoptions`, `storagesense` → `ms-settings:storagesense`, `dateandtime` → `ms-settings:dateandtime`.

### 3.3 Event channels (main → renderer)

Events are **patches**, never full snapshots (OMB-08 debt 2, defect X5). Names follow 08-0 §0 (`{domain}:{noun}`) and never equal an invoke name (08-0 §B.5; a contract test fails the build on a collision). Every payload that is a `*Row` carries its stored `rev`; the renderer applies it only when newer (§3.1.5).

| Event | Payload | Fired when | J |
|---|---|---|---|
| `chat:upsert` | `ChatRow` | any chat field change (title, unread, pill, last line, draft present) | all |
| `chat:removed` | `{ chatId }` | soft delete | J16, J21 |
| `chat:typing` | `{ chatId; on: boolean; who: string }` | AI writing a chat reply | J7 |
| `message:upsert` | `MessageRow` | new message or status/badge change | all |
| `message:delta` | `{ messageId; seq: number; append: string }` | streaming text of a reply (chat lane only; jobs are silent, Art. 22) | J7 |
| `message:badge` | `{ messageId; badge: BadgeValue \| null }` (glyphs and tooltips only from `src/shared/badges.ts`, 08-0 §F; the slow tooltip comes from `JobRow.slow`) | C1 transitions | C1 |
| `card:upsert` | `CardRow` (includes `nonce`, `state`, `expiresAt`, `resolvedBy`, `supersedesId`) | any card change | C3–C16 |
| `job:upsert` | `JobRow` (state, current step, counts, cost so far, derived `stepsDone`, `nowLine`, `slow`) | any job change | J5–J19 |
| `steps:upsert` | `{ jobId; steps: StepRow[] }` | checklist edits (C2, edited in place, Art. 17) | C2 |
| `live:frame` | `{ jobId; jpeg: ArrayBuffer; w; h; masked: true; nowLine: string }` | ≤ 5 fps while watched (08-2 §8.3.7), to the `live` window (08-0 §G.8) | J18 |
| `live:state` | `{ jobId; state: "running" \| "paused_signin" \| "taken_over" \| "unavailable" }` | J13/J18 transitions | J13, J18 |
| `ai:status` | `AiStatus` | verify results, offline, limit, signed out | J2, J19 |
| `ai:detectRow` | `DetectRow` | detection ladder progress (was `ai:detect`, 08-0 §B.5) | J2 |
| `spend:update` | `SpendSummary` | after each AI turn on a key, and payments | J19.3 |
| `connection:upsert` | `ConnectionRow` (includes `status: 'connecting'` while a sign-in runs and `lastErrorKind`) | connect/disconnect/expiry | J4, J21 |
| `whatsapp:qr` | `{ png: string (data URL); expiresAt: number }` (`expiresAt` = `linkStartAt + 60_000`, the same on every code of one link attempt; the engine renders the PNG, X-124) | Baileys QR refresh | J4 |
| `routine:upsert` | `RoutineRow` | edits, runs, pause | J14 |
| `memory:changed` | `{ factIds: string[]; chip?: MemoryChip }` | saves, edits, forgets | J17 |
| `settings:changed` | `PublicSettings` | any setting | J21 |
| `net:state` | `{ online: boolean }` | network change | J19.1 |
| `navigate` | `{ view: View; act?: string }` (08-0 §G.9/§G.10) | toast click, tray, jump list, any `foo://` route of 08-0 §G.9 (main parses the route into a `View`; `act` is the `?act=` value) | J20 |
| `data:exportProgress` / `data:wipeProgress` | `{ pct: number; phase: string; path?: string; error?: ErrorKind }` | long data jobs (was `data:export` / `data:wipe`, 08-0 §B.5); the last export event carries `path` or `error` | J21, J23 |
| `app:safeMode` | `{ on: boolean }` | safe mode entered or left (08-0 §G.14) | J19 |

There is no `ai:install` event or invoke (X-42) and no `foo://reply` route (X-67).

3.3.1 **Renderer → main event** (X-124, 08-0 §B.6). Exactly one event flows the other way, sent with `window.foo.send` (through `src/renderer/ipc/client.ts`):

| Event | Payload | Fired when | J |
|---|---|---|---|
| `face:raster` | `{ faceRef: FaceRef; size: 16 \| 20 \| 24 \| 32 \| 48; mood: Mood; png: ArrayBuffer }` | the renderer's hidden `<FaceRaster>` drew a face that main needs for a toast app logo (48, ring) or the tray (16/20/24/32, 09 §9.8.1 picks by taskbar scale) (02-2 §F15.9.9, X-135) | J20 |

Main writes the PNG to `{DATA}\avatars\raster\{safeName(faceRef)}-{size}-{mood}.png` (overwriting; `safeName()` §0.7.1 turns the `:` of a `FaceRef` into `-`; the tray and toast readers in 09 apply the same function, X-135); main never draws a face; a missing file → the letter-disc PNG in `resources/` (X-124, X-129). Main accepts it only from the `main` window (§3.1.1) and only when `png` is a PNG of `size × size` pixels.

### 3.4 Shared types (pointer)

All row, enum, envelope and IPC payload types used in §2–§4 are 08-0 §B (X-57) and live only in `src/shared/types.ts` (types) and `src/shared/schemas.ts` (zod). A DB row maps to its `*Row` by camelCasing every column in `src/main/db/rows.ts` (the only converter), plus the derived fields and drops of 08-0 §B.1. Derivations this chapter owns: `ChatRow.hasDraft` = a `drafts` row exists for the chat; `ChatRow.lastLine` = `"Draft: " + first line of the draft` when one exists, else the last visible message's redacted text (≤ 120 chars); `JobRow.stepsDone` = count of `steps.state = 'done'`; `JobRow.nowLine` = the running step's phrase; `JobRow.slow` = `state = 'working'` and `now − last_progress_at ≥ 60 s` (04 §4.2). `MessageRow.reactions[].by` = `'me'` when `reactions.by = 'user'`, `'foo'` for foo, else the helper id (08-5 §2, X-129). Every other shape is 08-5-shared-types.md (X-111); this chapter never cites a review file.

---

## §4. Data model

### 4.1 Storage map (normative; supersedes journeys-1 §3 where they differ, differences logged in §23)

| What | Where | Format | Authority |
|---|---|---|---|
| Chats, messages, cards, reactions, composer drafts, jobs, steps, tool calls, AI turns, approvals, payments, routines + runs, helpers, groups, connections, contacts index, secrets index, activity, notification ledger, file index, site notes index, suggestions, search index | `{DATA}\data\foo.db` | SQLite (WAL) | **Authoritative** |
| Database backups (before migrations) | `{DATA}\data\backup\foo-{fromVersion}-{yyyy-mm-dd}.db` | SQLite copy | Last 3 kept (§4.2) |
| Damaged database (renamed) | `{DATA}\data\foo-damaged-{yyyy-mm-dd-HHmm}.db` | SQLite | Kept 30 days, then deleted by housekeeping (§4.1.1) |
| Job plan and state mirror | `{DATA}\jobs\{jobId}\plan.md`, `state.json` | Markdown / JSON (§4.1.2), atomic write after every step | Mirror (human-readable; recovery source for §4.1.1) |
| Job screenshots | `{DATA}\jobs\{jobId}\steps\{stepIdx}-{n}.jpg` | JPEG q70, masked (§11) | Files; pruned per `settings.privacy.screenshotDays` (§19.3) |
| Handoff notes | `{DATA}\jobs\{jobId}\handoff.md` | Markdown (§4.1.2) | Mirror |
| Memory | `{DATA}\memory\identity.md`, `about-you.md`, `people\{slug}.md`, `preferences\{topic}.md`, `.tidy-log.md`, `.tombstones` | Markdown (08-3 §12.2) | **Authoritative** (DB `memory_index` is a rebuildable cache) |
| Helper profile + notes | `{DATA}\helpers\{helperId}\profile.json`, `notes.md` | JSON (§4.1.2) / Markdown | profile: DB authoritative + mirror; notes.md authoritative |
| Routines mirror | `{DATA}\routines\{routineId}.json` | JSON (§4.1.2) | Mirror |
| Site notes | `{DATA}\sites\{domain}.md` | Markdown (§4.1.2) | Authoritative for text; flags cached in `site_notes` |
| Activity log | DB `activity` + `{DATA}\activity.jsonl` (08-0 §G.4) | JSON lines, camelCase field names = the `activity` columns camelCased, written in the same tick as the row | DB authoritative (the Activity page and CSV read the DB); the jsonl is the user-readable copy (Art. 15). A failed jsonl write leaves the DB row standing and logs `ACTIVITY_MIRROR_FAILED` (warn) |
| Tech log | `{DATA}\logs\app-{yyyy-mm-dd}.log` | JSON lines, redacted, 14 days, ≤ 10 MB/day | — |
| Crash dumps | `{DATA}\logs\crashes\` | Electron minidumps (`uploadToServer: false`) | 14 days (09 §9.21) |
| Settings | `{DATA}\settings.json` (+ `settings.json.bak-{n}` after a migration) | JSON (08-0 §A, §4.4), atomic write (write temp → `MoveFileEx` replace) | Authoritative |
| Launch record | `{DATA}\launches.json` | JSON (§4.1.3), last 10 launches | Safe-mode counter (08-0 §G.14) |
| Secrets | Credential Manager targets `foo/{kind}/{name}` exactly per 08-0 §E.8 (X-73) | DPAPI | Authoritative; targets mirrored in `secrets_index` |
| WhatsApp session | `{DATA}\vault\wa-session.bin` | safeStorage blob of Baileys auth state | Authoritative |
| Browser profile | `{DATA}\browser\profile\` | Edge user-data-dir | Edge |
| Voice notes | `{DATA}\data\voice\{messageId}.webm` (in) / `.wav` (out) | Opus-in-WebM / WAV | Files, kept `settings.privacy.voiceDays` days (`null` = keep) |
| Inbox (attachments) | `{DATA}\data\inbox\{attachmentId}-{safeName}` | original | Files |
| Draft attachments | `{DATA}\data\drafts\{chatId}\{attachmentId}-{safeName}` | copies of staged files | Deleted when the draft is sent or cleared (§4.3.2 `drafts`) |
| Avatars | `{DATA}\avatars\{chatId}.png` | PNG 256×256, ≤ 2 MB (`FaceRef` `file:{chatId}`, §0.6) | Files |
| Face rasters (toasts, tray) | `{DATA}\avatars\raster\{safeName(faceRef)}-{size}-{mood}.png` | PNG 48 (toast, ring) or 16/20/24/32 (tray) px from the renderer's `face:raster` (§3.3.1, X-124, X-135) | Files; rewritten on change |
| Output files | `{OUT}\{safeName(job title)}\` (§0.7.1) | real files | The user's; indexed in `files` |
| Saved reports | `{OUT}\reports\` | .zip of redacted logs (X-12) | The user's |
| AI scratch dirs | `{LOCAL}\ai-scratch\{providerId}\` | empty dirs used as CLI cwd | Disposable |
| Pricing table | `resources\pricing.json` (in app) | JSON (§6.8) | Shipped with each release |

foo never installs AI apps (X-42), so there is no AI-tools folder. **Encryption at rest:** none for any row above except the vault items and the WhatsApp session (§1.1 Database row). `[foo decision: SQLite is authoritative for jobs, approvals, payments and routines (not state.json files as journeys-1 §3 suggests) because an approval, its payment and its job MUST change state in one transaction (Art. 7 "exactly once"); the files stay as readable mirrors and the recovery source]`.

4.1.1 **Damaged database** (DB-12). At startup, after migrations, main runs `PRAGMA quick_check` (budget ≤ 2 s); the weekly housekeeping pass runs the full `PRAGMA integrity_check`. If the file cannot be opened, a migration cannot run because of corruption (`SQLITE_CORRUPT`/`SQLITE_NOTADB`), or a check returns anything but `ok`:
1. Close the DB, rename `foo.db` (and its `-wal`/`-shm`) to `foo-damaged-{yyyy-mm-dd-HHmm}.db`; create a fresh DB from `0001_init.sql` + all migrations.
2. Rebuild in one transaction, in this order, with `PRAGMA foreign_keys=OFF` for this transaction only: `helpers\*\profile.json` → `helpers` and one live chat per helper (same `chat_id`, title = helper name); one new live `kind='foo'` chat (title `settings.identity.agentName`); `routines\*.json` → `routines`, `routine_runs`; `jobs\*\state.json` → `jobs`, `steps`, `approvals`, `payments` (states and proof refs as written); `activity.jsonl` → `activity`; `memory\` → `memory_index` + `memory_fts` rebuild. Every `chat_id`, `message_id` or `card_id` these rows reference that does not exist yet gets a **placeholder tombstone** (a `chats`/`messages`/`cards` row with that id, `deleted_at = now`, empty text, `payload '{}'`, `kind`/`type` = the referencing row's kind where known, else `chats.kind='foo'`, `messages.kind='marker'` + `marker_kind='system_line'`, `cards.type='error'`, `cards.state='dismissed'`). `PRAGMA foreign_key_check` must return no rows before commit; then foreign keys go back on.
3. `settings.json` is untouched. Chats and messages have no mirror and are not rebuilt.
4. Post one error card in the new foo chat, kind `DB_REBUILT` (copy and its single button are that row of 08-3 §21.2).
5. Any approval rebuilt as `RUNNING` with `submitted_at` set becomes `CHECKING` (08-2 §10.5; never re-submitted, Art. 7).
If the rebuild itself fails, foo opens read-only with the J19.6 "Unknown" card and logs `DB_REBUILD_FAILED`; the damaged file is never deleted in that case.

4.1.2 **Mirror shapes** (DB-13; JSON is camelCase per 08-0 §0, pretty-printed with 2 spaces, UTF-8, LF; written temp+replace by main via `DbOp` `mirror`; read back through the same zod schema).
- `jobs\{id}\state.json` = `{ schemaVersion: 1, job: JobRow, steps: StepRow[], approvals: ApprovalRow[], payments: PaymentRow[], steerQueue: string[], estimate: { minutes: number; tokens: number; costPaise: number }, actual: { tokens: number; costPaise: number }, workingMs: number, aiEstimate?: { minutes?: number; tokens?: number }, writtenAt: number }` (JobRow without derived fields; `workingMs` = WORKING wall time, NEEDS_YOU/WAITING excluded; `aiEstimate` is display only; 08-0 §B.3 `StateJson`).
- `jobs\{id}\plan.md` = `# {title}` · blank · `Asked: {user words, redacted}` · blank · numbered steps `1. [x] {done phrase}` / `1. [ ] {pending or running phrase}` · blank · `Decisions:` then one `- ` bullet per card answer · blank · `Route: {route}`.
- `jobs\{id}\handoff.md` = exactly the four headings of 08-3 §17.2 (`HandoffNote` fields `done`, `proof`, `open`, `nextOwner`, 08-0 §B.3), each followed by `- ` bullets.
- `routines\{id}.json` = `RoutineDetail` (`RoutineRow` + `runs: RoutineRunRow[]`, last 20).
- `helpers\{id}\profile.json` = `HelperRow`.
- `sites\{domain}.md` = `# {domain}` then one line per event: `- {yyyy-mm-dd HH:mm} · {flag or note}`.

4.1.3 **Launch record** (08-0 §G.14, X-77, BE-12). `{DATA}\launches.json` = `{ launches: { at: number; clean: boolean; version: string; engineCrashes: number }[] }`, newest last, at most 10. Main appends `{ at: now, clean: false, version, engineCrashes: 0 }` at startup (§2.2 step 1), increments `engineCrashes` on each engine crash (§2.1) and sets `clean: true` on a normal quit (§2.3). The field is `clean`, never `cleanExit`. Safe mode: 3 previous records with `clean: false` within the last 10 min, or `engineCrashes` reaching 3 in the current launch.

### 4.2 Migrations

`schema_migrations(version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)`. `db.ts` creates `schema_migrations` with `CREATE TABLE IF NOT EXISTS` before reading the migration folder; it is not part of `0001_init.sql` and the migration test's `sqlite_master` comparison ignores it (X-129). Migrations are **forward-only** files `src/main/store/migrations/NNNN_{snake_name}.sql`, `NNNN` from `0001` with no gaps; `0001_init.sql` is the whole §4.3 DDL (tables, indexes, FTS tables and their triggers). There are no down migrations; the restore path is the backup copy.
1. Before applying any pending migration, main runs `PRAGMA wal_checkpoint(TRUNCATE)` and copies `foo.db` to `{DATA}\data\backup\foo-{fromVersion}-{yyyy-mm-dd}.db`, keeping the last 3 backups.
2. Each file runs in one transaction. A migration that changes a CHECK, a NOT NULL or a foreign key recreates the table inside the same file (`CREATE TABLE {t}_new …; INSERT INTO {t}_new SELECT …; DROP TABLE {t}; ALTER TABLE {t}_new RENAME TO {t};` then re-creates its indexes and triggers), with `PRAGMA foreign_keys=OFF` for that file only; `PRAGMA foreign_key_check` must return no rows before commit.
3. A failed migration rolls back; the app opens read-only with the error card "Something went wrong on my side. / Nothing was booked, paid or sent." [ Try again ] (J19.6 Unknown, 08-3 §21.2 `UNKNOWN`), logs `DB_MIGRATION_FAILED` and keeps the backup. A failure caused by corruption runs §4.1.1 instead.
4. **Migration test** (M0, replaces the "up/down test"): (a) apply every migration to an empty DB → `PRAGMA integrity_check` = `ok`, `PRAGMA foreign_key_check` returns nothing, and the normalised `sqlite_master` equals §4.3 exactly (`sqldiff --schema`); (b) apply the new migrations to the previous release's seed DB → the same three checks pass.
5. **FTS triggers.** `messages_fts`, `memory_fts`, `activity_fts` and `contacts_fts` are external-content FTS5 tables, each with exactly three triggers named `{table}_ai` (AFTER INSERT), `{table}_ad` (AFTER DELETE) and `{table}_au` (AFTER UPDATE OF its indexed columns and, where the table has one, `deleted_at`); the update trigger deletes the old entry with the `'delete'` command and re-inserts only rows with `deleted_at IS NULL`. The `messages_fts` insert and update triggers also skip rows whose chat has `private = 1` (`WHEN (SELECT private FROM chats WHERE id = new.chat_id) = 0`; 08-0 §G.17). The full text is in §4.3. Rebuild statement (after `memory.reindex`, after §4.1.1, or when `PRAGMA integrity_check` reports an FTS problem): `INSERT INTO {fts}({fts}) VALUES ('rebuild')`, run by main. Search uses `snippet({fts}, {col}, char(1), char(2), '…', 12)`; the renderer turns the `\u0001…\u0002` span into the `--t-body-strong` match.
6. **0004 (X-180, CR-0022).** `0004_rich_replies.sql` rebuilds `cards` with the 27 card types of 08-0 §G.1 (item 2's recipe), adds `messages.side INTEGER NOT NULL DEFAULT 0 CHECK (side IN (0, 1))` (a side question and its answer, pick 6), `messages.understood TEXT` (JSON `string[]`, the "foo read:" line, 04 §6.5) and `messages.actions TEXT` (JSON `ActionChip[]`, 04-2 §21.7), both NULL or `json_valid`, and adds `kept_items(id ki_…, chat_id, message_id?, card_id?, kind 'kit' | 'page', title, body_path, png_path?, created_at)` with exactly one of `message_id` / `card_id` and index `kept_items_chat(chat_id, created_at DESC)`. The §4.3 DDL below stays the 0001 text; the migration test applies 0003 and 0004 to the reference as written.

### 4.3 Tables (SQLite DDL is normative; `INTEGER` times are epoch ms; `TEXT` JSON columns are validated with the named zod schema on read and write)

Rules for the whole DDL (X-57, X-63, DB-07): every column that names a row of another table carries `REFERENCES … ON DELETE RESTRICT` (no CASCADE, no SET NULL anywhere); the two insert cycles `helpers.chat_id ⇄ chats.helper_id` and `messages.card_id ⇄ cards.message_id` are `DEFERRABLE INITIALLY DEFERRED` and are always written inside one `db.tx` in the order given at the table; `PRAGMA defer_foreign_keys` is never used. `rev INTEGER NOT NULL DEFAULT 1` exists on exactly `chats`, `messages`, `cards`, `jobs`, `steps`, `routines`, `helpers`, `connections`, and every UPDATE of those tables sets `rev = rev + 1` in the same statement (enforced in `Store`, 08-0 §B.1). `deleted_at` exists on `chats`, `messages`, `cards` (and `helpers`); deletion is §4.6 rule 3. Ids use the §0.6 prefixes. Column comments name the canonical union (08-0 §B.2) a CHECK mirrors.

```sql
-- 4.3.1 Chats
CREATE TABLE chats (
  id               TEXT PRIMARY KEY,                       -- c_…
  kind             TEXT NOT NULL CHECK (kind IN ('foo','helper','group','wa_mirror')),
  helper_id        TEXT REFERENCES helpers(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,   -- kind='helper' only
  title            TEXT NOT NULL,                          -- display name ({agentName}, helper name, group name, WA chat name)
  avatar_ref       TEXT,                                   -- FaceRef (§0.6); NULL = the kind's default face
  color_token      TEXT,                                   -- '--h-teal' etc (02 F2)
  wa_jid           TEXT,                                   -- kind='wa_mirror' only
  pinned           INTEGER NOT NULL DEFAULT 0,
  archived         INTEGER NOT NULL DEFAULT 0,             -- 1 only for a wa_mirror hidden with 06-3 C-8 (`chat:archive`)
  unread_count     INTEGER NOT NULL DEFAULT 0,
  pill             TEXT CHECK (pill IN ('needs_you','working','done','paused') OR pill IS NULL),  -- derived by main from the job/card writes (§4.6 rule 7, X-129; Art. 12)
  pill_until       INTEGER,                                -- 'done' fades after 24 h (J App. A)
  last_message_id  TEXT REFERENCES messages(id) ON DELETE RESTRICT,
  last_activity_at INTEGER NOT NULL,
  next_seq         INTEGER NOT NULL DEFAULT 1,
  rev              INTEGER NOT NULL DEFAULT 1,
  created_at       INTEGER NOT NULL,
  deleted_at       INTEGER,
  private          INTEGER NOT NULL DEFAULT 0,  -- R31; only with kind='foo'; at most one live row with private=1 (12-2 §12.30)
  helper_messages_since_user INTEGER NOT NULL DEFAULT 0,  -- group loop guard (08-3 §17.3.4)
  loop_paused      INTEGER NOT NULL DEFAULT 0,
  CHECK ((kind = 'helper') = (helper_id IS NOT NULL)),
  CHECK ((kind = 'wa_mirror') = (wa_jid IS NOT NULL))
);   -- no draft column (drafts table, X-69); no mute column (settings.notifications.mutedChats is the only mute store, 08-0 §A)
CREATE INDEX chats_activity ON chats(archived, pinned DESC, last_activity_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX chats_kind ON chats(kind);
CREATE UNIQUE INDEX chats_one_private ON chats(private) WHERE private = 1 AND deleted_at IS NULL;
-- Rule: "foo's chat" everywhere = kind='foo' AND private=0.

CREATE TABLE group_members (
  chat_id   TEXT NOT NULL REFERENCES chats(id) ON DELETE RESTRICT,
  member_id TEXT NOT NULL,                                 -- helper id or 'foo' (no FK: 'foo' is not a row)
  role      TEXT NOT NULL CHECK (role IN ('owner','member')),
  added_at  INTEGER NOT NULL,
  PRIMARY KEY (chat_id, member_id)
);

-- 4.3.2 Messages, reactions, composer drafts
CREATE TABLE messages (
  id            TEXT PRIMARY KEY,                          -- m_…
  chat_id       TEXT NOT NULL REFERENCES chats(id) ON DELETE RESTRICT,
  seq           INTEGER NOT NULL,                          -- per-chat order, from chats.next_seq
  author_kind   TEXT NOT NULL CHECK (author_kind IN ('user','foo','helper','system')),
  author_id     TEXT REFERENCES helpers(id) ON DELETE RESTRICT,   -- author_kind='helper' only
  kind          TEXT NOT NULL CHECK (kind IN ('text','voice','card','marker')),   -- 08-0 §G.1; brief, job link and error are cards
  marker_kind   TEXT CHECK (marker_kind IN ('start_of_chat','handoff','memory_chip','helper_notice','system_line') OR marker_kind IS NULL),
  client_id     TEXT,                                      -- message:send idempotency key (user messages only)
  text          TEXT NOT NULL DEFAULT '',                  -- REDACTED display text (Art. 8)
  text_for_ai   TEXT,                                      -- only when different, e.g. "[the user typed a secret; it was hidden]" (C8); never leaves main/engine
  status        TEXT NOT NULL CHECK (status IN ('queued','sent','streaming','complete','failed')),
  badge         TEXT CHECK (badge IN ('seen','working','waiting','done','done_unverified','failed','stopped') OR badge IS NULL),  -- BadgeValue, user msgs (08-0 §F)
  reply_to_id   TEXT REFERENCES messages(id) ON DELETE RESTRICT,
  job_id        TEXT REFERENCES jobs(id) ON DELETE RESTRICT,                          -- job this message started / belongs to
  card_id       TEXT REFERENCES cards(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,   -- kind='card' only
  lang          TEXT,                                      -- detected language tag of user text ('en','hi','pa','mixed'); written by main's Store with the 02-3 §F24 script rule (08-4 §25.7); the AI never sends it
  voice_path    TEXT, voice_ms INTEGER, transcript TEXT, transcript_conf REAL,
  attachments   TEXT,                                      -- JSON Attachment[] (id, name, mime, bytes, path); user attachments ride on 'text'
  prompted      INTEGER NOT NULL DEFAULT 1,                -- 0 = unprompted (counts toward budget)
  why           TEXT,                                      -- JSON { source: 'routine_asked'|'routine_suggested'|'suggestion'|'habit_offer'|'housekeeping'|'cap_warning'; routineId?; suggestionKey?; vars } (08-0 §G.17); drives the "Why am I getting this?" footer (Art. 19); 'cap_warning' is written when the 80 % cap warning is posted (money.warnAt80)
  pinned        INTEGER NOT NULL DEFAULT 0,                -- "Keep this voice note" (08-3 §18.3); voice retention skips pinned rows
  provider_note TEXT,                                      -- e.g. 'answered with ChatGPT while Claude rests' (J19.2)
  rev           INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL,
  edited_at     INTEGER,
  deleted_at    INTEGER,
  UNIQUE (chat_id, seq),
  CHECK ((kind = 'marker') = (marker_kind IS NOT NULL)),
  CHECK ((kind = 'card') = (card_id IS NOT NULL)),
  CHECK (why IS NULL OR json_extract(why, '$.source') IN ('routine_asked','routine_suggested','suggestion','habit_offer','housekeeping','cap_warning'))
);
CREATE INDEX messages_job ON messages(job_id);
CREATE INDEX messages_chat_time ON messages(chat_id, created_at);
CREATE UNIQUE INDEX messages_client ON messages(chat_id, client_id) WHERE client_id IS NOT NULL;
CREATE VIRTUAL TABLE messages_fts USING fts5(text, transcript, content='messages', content_rowid='rowid', tokenize="unicode61 remove_diacritics 2 tokenchars '@._-'");
CREATE TRIGGER messages_ai AFTER INSERT ON messages WHEN new.deleted_at IS NULL AND (SELECT private FROM chats WHERE id = new.chat_id) = 0 BEGIN
  INSERT INTO messages_fts(rowid, text, transcript) VALUES (new.rowid, new.text, new.transcript); END;
CREATE TRIGGER messages_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, text, transcript) VALUES ('delete', old.rowid, old.text, old.transcript); END;
CREATE TRIGGER messages_au AFTER UPDATE OF text, transcript, deleted_at ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, text, transcript) SELECT 'delete', old.rowid, old.text, old.transcript WHERE old.deleted_at IS NULL
    AND (SELECT private FROM chats WHERE id = old.chat_id) = 0;
  INSERT INTO messages_fts(rowid, text, transcript) SELECT new.rowid, new.text, new.transcript WHERE new.deleted_at IS NULL
    AND (SELECT private FROM chats WHERE id = new.chat_id) = 0; END;   -- private chats are never indexed (08-0 §G.17)

CREATE TABLE reactions (
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE RESTRICT,
  by         TEXT NOT NULL,                                -- 'user' | 'foo' | helper id
  emoji      TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (message_id, by, emoji)
);

CREATE TABLE drafts (                                      -- composer drafts, one row per chat (X-69, 08-0 §G.11, DB-05)
  id                   TEXT PRIMARY KEY,                   -- dr_…
  chat_id              TEXT NOT NULL UNIQUE REFERENCES chats(id) ON DELETE RESTRICT,
  text                 TEXT NOT NULL DEFAULT '',           -- REDACTED; mentions stored as @{helperId}
  attachments          TEXT NOT NULL DEFAULT '[]',         -- JSON Attachment[]; files under {DATA}\data\drafts\{chatId}\
  reply_to_id          TEXT REFERENCES messages(id) ON DELETE RESTRICT,
  link_preview_removed INTEGER NOT NULL DEFAULT 0,
  updated_at           INTEGER NOT NULL
);   -- written by main from composer:saveDraft; deleted (row + files) when the message is sent or the draft is emptied

-- 4.3.3 Cards (one row per card; the message row of kind 'card' points here)
-- Insert order in one db.tx: messages row (kind 'card', card_id = pre-generated k_ id) → cards row.
CREATE TABLE cards (
  id            TEXT PRIMARY KEY,                          -- k_…
  chat_id       TEXT NOT NULL REFERENCES chats(id) ON DELETE RESTRICT,
  message_id    TEXT NOT NULL REFERENCES messages(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  job_id        TEXT REFERENCES jobs(id) ON DELETE RESTRICT,
  type          TEXT NOT NULL CHECK (type IN ('brief','checklist','choice','tiles','approval','payment','bill','draft','secret','signin',
                  'connect','plan','routine','routine_offer','stuck','error','spend_cap','table','file','link_preview','job_link','place',
                  'face_explainer','catch_up','setup')),   -- CardType, exactly the 25 values of 08-0 §G.1 (X-56, X-119)
  state         TEXT NOT NULL,                             -- exactly 08-0 §G.2 for the type (approval/payment: ApprovalState); zod-checked on every write (§4.5.1)
  payload       TEXT NOT NULL,                             -- JSON CardPayload for the type (§4.5); never a secret value
  answer        TEXT,                                      -- JSON CardAnswer
  nonce         TEXT NOT NULL,
  expires_at    INTEGER,
  resolved_by   TEXT CHECK (resolved_by IN ('tap','keyboard','toast','typed','reaction','auto','system') OR resolved_by IS NULL),
  resolved_at   INTEGER,
  supersedes_id TEXT REFERENCES cards(id) ON DELETE RESTRICT,   -- the card this one replaces (that card's state becomes superseded)
  rev           INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  deleted_at    INTEGER
);
CREATE INDEX cards_open ON cards(state, expires_at);
CREATE INDEX cards_chat ON cards(chat_id, created_at DESC);
CREATE INDEX cards_message ON cards(message_id);
CREATE INDEX cards_job ON cards(job_id);                   -- X-129

-- 4.3.4 Jobs, steps, tool calls (08-2 §5)
CREATE TABLE jobs (
  id                TEXT PRIMARY KEY,                      -- j_…
  chat_id           TEXT NOT NULL REFERENCES chats(id) ON DELETE RESTRICT,   -- chat where it runs (helper chat after handoff)
  origin_chat_id    TEXT NOT NULL REFERENCES chats(id) ON DELETE RESTRICT,   -- where the user asked (job_link card lives there)
  owner_kind        TEXT NOT NULL CHECK (owner_kind IN ('foo','helper')),
  owner_id          TEXT REFERENCES helpers(id) ON DELETE RESTRICT,          -- owner_kind='helper' only
  title             TEXT NOT NULL,                          -- engine-built, ≤ 40 chars, e.g. "Booking Goa stay" (08-4 §26.2)
  origin            TEXT NOT NULL CHECK (origin IN ('user','routine','handoff','brief','setup','retry','system')),
  origin_ref        TEXT,                                   -- message id / routine id / parent job id (polymorphic, no FK)
  user_message_id   TEXT REFERENCES messages(id) ON DELETE RESTRICT,         -- bubble carrying the C1 badge
  intent            TEXT NOT NULL CHECK (intent IN ('read_only','do')),       -- Art. 3 (08-2 §5.3)
  do_verbs          TEXT NOT NULL DEFAULT '[]',             -- JSON Verb[] the user actually said: send, book, buy, pay, post, delete, add_calendar (X-55)
  state             TEXT NOT NULL CHECK (state IN ('queued','working','needs_you','waiting','done','done_unverified','failed','cancelled')),
  waiting_reason    TEXT CHECK (waiting_reason IN ('ai_offline','ai_down','ai_signed_out','ai_limit','spend_cap','net_offline','asleep','app_quit','windows_shutdown','opens_at') OR waiting_reason IS NULL),   -- WaitingReason (08-0 §B.2)
  wake_at           INTEGER,  -- epoch ms; set only when waiting_reason='opens_at'; the runner's tick moves the job to WORKING at wake_at (G1-1)
  needs_you_card_id TEXT REFERENCES cards(id) ON DELETE RESTRICT,
  plan_version      INTEGER NOT NULL DEFAULT 0,
  current_step_idx  INTEGER,
  step_count        INTEGER NOT NULL DEFAULT 0,
  route             TEXT CHECK (route IN ('api','browser','screen') OR route IS NULL),   -- Route (08-0 §B.2)
  site_domain       TEXT,                                   -- current acting site (Art. 9)
  uses_browser      INTEGER NOT NULL DEFAULT 0,
  est_minutes       REAL, est_tokens INTEGER, est_cost_paise INTEGER,
  spent_tokens_in   INTEGER NOT NULL DEFAULT 0, spent_tokens_out INTEGER NOT NULL DEFAULT 0,
  spent_cost_paise  INTEGER NOT NULL DEFAULT 0, cost_unknown INTEGER NOT NULL DEFAULT 0,
  provider_id       TEXT,  ai_session_id TEXT,             -- ai_session_id never leaves main/engine (JobRow drops it)
  fail_streak       INTEGER NOT NULL DEFAULT 0,             -- consecutive failed tool calls (Art. 13)
  stuck_count       INTEGER NOT NULL DEFAULT 0,             -- times stuck card shown (J19.4 step 2)
  proof             TEXT,                                   -- JSON Proof (08-2 §5.8 union plus read_source, 08-0 §B.3); the proof chip renders from it
  result_message_id TEXT REFERENCES messages(id) ON DELETE RESTRICT,
  stop_reason       TEXT CHECK (stop_reason IN ('user_word','user_button','stop_all','window_closed','stuck_stop','choice_timeout','signin_timeout',
                      'approval_expired','approval_declined','helper_deleted','chat_deleted','wipe','system') OR stop_reason IS NULL),   -- StopReason
  rev               INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL, started_at INTEGER, last_progress_at INTEGER, finished_at INTEGER
);
CREATE INDEX jobs_state ON jobs(state);
CREATE INDEX jobs_chat_state ON jobs(chat_id, state);

CREATE TABLE steps (
  id          TEXT PRIMARY KEY,                             -- s_…
  job_id      TEXT NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  idx         INTEGER NOT NULL,
  phrase_key  TEXT NOT NULL,                                -- from the step phrase catalogue (08-2 §5.4.3)
  slots       TEXT NOT NULL DEFAULT '{}',                   -- JSON, validated per phrase
  state       TEXT NOT NULL CHECK (state IN ('pending','running','done','failed','skipped','waiting_user')),
  attempts    INTEGER NOT NULL DEFAULT 0,
  route       TEXT CHECK (route IN ('api','browser','screen') OR route IS NULL),
  rev         INTEGER NOT NULL DEFAULT 1,
  started_at INTEGER, finished_at INTEGER,
  UNIQUE (job_id, idx)
);

CREATE TABLE tool_calls (
  id              TEXT PRIMARY KEY,                         -- tc_…
  job_id          TEXT NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  step_id         TEXT REFERENCES steps(id) ON DELETE RESTRICT,
  turn_id         TEXT REFERENCES ai_turns(id) ON DELETE RESTRICT,
  tool            TEXT NOT NULL,                            -- ToolName, 'browser.click' etc (08-2 §8.2)
  action_class    TEXT NOT NULL,                            -- 08-2 §9.2
  side_effect     INTEGER NOT NULL,                         -- 1 if not read-only
  idem_key        TEXT UNIQUE,                              -- side_effect=1 only; derivation below; UNIQUE(idem_key) (X-113)
  args            TEXT NOT NULL,                            -- JSON, REDACTED
  result          TEXT,                                     -- JSON summary, REDACTED, ≤ 16 KB
  observation_ref TEXT,                                     -- snapshot id / screenshot path
  gate            TEXT NOT NULL CHECK (gate IN ('auto','approved','rule','blocked','handed_back')),
  approval_id     TEXT REFERENCES approvals(id) ON DELETE RESTRICT,
  outcome         TEXT CHECK (outcome IN ('ok','error','cancelled','unknown') OR outcome IS NULL),
  error_kind      TEXT,                                     -- ErrorKind
  started_at INTEGER NOT NULL, finished_at INTEGER
);
CREATE INDEX tool_calls_job ON tool_calls(job_id, started_at);
CREATE INDEX tool_calls_step ON tool_calls(step_id);
-- idem_key = sha256(jobId + '|' + stepId + '|' + tool + '|' + canonicalJson(args) + '|' + (approvalId ?? '')), hex, for every side_effect=1 call
-- (X-113; canonicalJson = §0.6.1). A replayed step reuses the stored row with outcome 'ok' (§4.6 rule 6).
-- Retention (X-129): 7 days after jobs.finished_at, args → '{}', result → NULL, observation_ref → NULL; hard-deleted by main's housekeeping
-- 90 days after finished_at (terminal jobs only, §4.6 rule 3).
-- The ToolLayer refuses a second call with the same idem_key in the same job (IDEMPOTENT_REPEAT, internal) unless a read tool has run
-- in that job since the first call (08-2 §5.9 step 5).

-- 4.3.5 AI turns (cost accounting, 08-2 §5.10)
CREATE TABLE ai_turns (
  id              TEXT PRIMARY KEY,                         -- t_…
  chat_id         TEXT REFERENCES chats(id) ON DELETE RESTRICT,
  job_id          TEXT REFERENCES jobs(id) ON DELETE RESTRICT,
  routine_id      TEXT REFERENCES routines(id) ON DELETE RESTRICT,
  purpose         TEXT NOT NULL CHECK (purpose IN ('chat','intake','step','repair','second_look','memory_review','tidy','routine','brief','verify','classify','rewrite','voice','web','hub','catch_up','read_attachment')),   -- AiPurpose (08-0 §B.2)
                  -- voice = an OpenAI transcription (X-43, provider 'openai-voice'); local whisper writes no row; web/hub: X-46, X-49
  provider_id     TEXT NOT NULL,                            -- CostProviderId (08-0 §B.2), zod-checked
  model_reported  TEXT,                                     -- never guessed (OMB-03 §5.6)
  session_id      TEXT,
  tokens_in INTEGER, tokens_out INTEGER, tokens_cache_read INTEGER, tokens_cache_write INTEGER,  -- NULL = unknown
  cost_paise      INTEGER,                                  -- NULL = unknown
  cost_source     TEXT NOT NULL CHECK (cost_source IN ('reported','priced','estimated','free','unknown')),
  billing         TEXT NOT NULL CHECK (billing IN ('plan','key','local')),
  duration_ms INTEGER, outcome TEXT NOT NULL CHECK (outcome IN ('ok','error','cancelled','timeout')),
  error_kind TEXT,
  started_at INTEGER NOT NULL
);
CREATE INDEX ai_turns_month ON ai_turns(billing, started_at);
CREATE INDEX ai_turns_chat ON ai_turns(chat_id, started_at);
CREATE INDEX ai_turns_job ON ai_turns(job_id);
CREATE INDEX ai_turns_routine ON ai_turns(routine_id, started_at);
-- Which chat_id / job_id / routine_id a turn carries is 08-4 §26.12.

-- 4.3.6 Approvals and payments (08-2 §9, §10)
CREATE TABLE approvals (
  id            TEXT PRIMARY KEY,                           -- ap_…
  card_id       TEXT NOT NULL UNIQUE REFERENCES cards(id) ON DELETE RESTRICT,
  job_id        TEXT NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  chat_id       TEXT NOT NULL REFERENCES chats(id) ON DELETE RESTRICT,
  verb          TEXT NOT NULL CHECK (verb IN ('send','book','buy','pay','post','delete','share','switch','use_app','calendar_write')),  -- ApprovalVerb (X-55); cancelling a booking is 'delete'
  hard_limit    INTEGER NOT NULL,                           -- 1 = G5 list; no scope chips, no rules
  fields        TEXT NOT NULL,                              -- JSON ApprovalFields (canonical, 08-2 §9.3)
  fields_hash   TEXT NOT NULL,                              -- sha256 of canonical JSON
  state         TEXT NOT NULL CHECK (state IN ('PENDING','APPROVED','HELD','RUNNING','CHECKING','COMPLETED','DECLINED','EXPIRED','SUPERSEDED','WITHDRAWN','FAILED')),  -- ApprovalState
  scope         TEXT CHECK (scope IN ('once','chat','always') OR scope IS NULL),
  approved_at   INTEGER,
  approved_via  TEXT CHECK (approved_via IN ('card','rule') OR approved_via IS NULL),   -- a Draft card's Send is 'card' (X-65); never 'toast' (09-windows)
  hello         TEXT CHECK (hello IN ('verified','typed_amount','not_needed') OR hello IS NULL),
  expires_at    INTEGER NOT NULL,                           -- draft approvals: created_at + 60 min (08-0 §G.7)
  superseded_by TEXT REFERENCES approvals(id) ON DELETE RESTRICT,
  second_look   TEXT,                                       -- JSON SecondLookResult
  undo_until    INTEGER,                                    -- draft sends only: approved_at + 5 s (08-0 §G.7)
  submitted_at  INTEGER,                                    -- WRITE-AHEAD before the irreversible click/call (08-2 §10.4)
  completed_at  INTEGER,
  proof         TEXT,
  failure_kind  TEXT,                                       -- ErrorKind
  created_at    INTEGER NOT NULL,
  CHECK (scope IS NULL OR scope = 'once' OR verb IN ('use_app','calendar_write'))   -- chat/always only where rules apply (08-0 §G.3)
);
CREATE INDEX approvals_state ON approvals(state, expires_at);
CREATE INDEX approvals_job ON approvals(job_id);

CREATE TABLE payments (
  id            TEXT PRIMARY KEY,                           -- py_…
  approval_id   TEXT NOT NULL UNIQUE REFERENCES approvals(id) ON DELETE RESTRICT,  -- one payment per approval, ever (Art. 7)
  job_id        TEXT NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  payee         TEXT NOT NULL, description TEXT NOT NULL,
  amount_paise  INTEGER NOT NULL CHECK (amount_paise > 0),
  currency      TEXT NOT NULL DEFAULT 'INR',
  method        TEXT NOT NULL CHECK (method IN ('card','upi')),
  method_label  TEXT NOT NULL,                              -- 'Visa ••4242' | 'UPI vik•••@okhdfc'
  site_domain   TEXT NOT NULL,
  state         TEXT NOT NULL CHECK (state IN ('submitted','checking','succeeded','failed')),   -- no 'ready', no 'unconfirmed' (DB-28)
  submitted_at  INTEGER NOT NULL, confirmed_at INTEGER,
  proof_kind TEXT, proof_ref TEXT, failure_kind TEXT,
  created_at    INTEGER NOT NULL
);
-- The payments row is INSERTED in the write-ahead transaction (08-2 §10.4) together with approvals.state='RUNNING' and submitted_at,
-- with state 'submitted'. Before that the amount lives only in the payment card's payload and approvals.fields. 'checking' while the
-- approval is CHECKING; 'succeeded' with COMPLETED; 'failed' with FAILED (decline, OTP/UPI timeout, or the 15-min CHECKING end, 08-2 §10.5).
-- Month purchase spend = SUM(amount_paise) WHERE state IN ('submitted','checking','succeeded') (08-0 §H, Art. 13).
CREATE INDEX payments_dupe ON payments(payee, amount_paise, created_at);
CREATE INDEX payments_job ON payments(job_id);
CREATE INDEX payments_state ON payments(state, created_at DESC);

-- 4.3.7 Routines (08-3 §13)
CREATE TABLE routines (
  id               TEXT PRIMARY KEY,                        -- r_…
  owner_chat_id    TEXT NOT NULL REFERENCES chats(id) ON DELETE RESTRICT,
  owner_helper_id  TEXT REFERENCES helpers(id) ON DELETE RESTRICT,
  title            TEXT NOT NULL,                           -- "BTC below ₹55 lakh"
  builtin TEXT CHECK (builtin IN ('morning_brief','memory_tidy','pnr_watch','recharge_due','bill_watch') OR builtin IS NULL),   -- RoutineBuiltin (08-0 §B.2; bill_watch X-115)
  what_text        TEXT NOT NULL,                           -- plain words for the card ("Checks")
  task_spec        TEXT NOT NULL,                           -- JSON RoutineTask (08-3 §13.2)
  schedule         TEXT NOT NULL,                           -- JSON Schedule
  tz               TEXT NOT NULL,
  active_from      TEXT NOT NULL, active_to TEXT NOT NULL,  -- HHMM; copied from settings.routines.activeFrom/activeTo at creation (no SQL default)
  condition_text   TEXT,                                    -- "only if it's below ₹55 lakh"
  condition        TEXT,                                    -- JSON Condition (structured, optional)
  deliver_toast    INTEGER NOT NULL DEFAULT 1,
  urgent           INTEGER NOT NULL DEFAULT 0,              -- may notify in quiet hours (J20)
  state            TEXT NOT NULL CHECK (state IN ('on','paused','paused_away','paused_cap','deleted')),
  created_from     TEXT NOT NULL CHECK (created_from IN ('asked','habit','suggested','builtin','idea')),   -- RoutineCreatedFrom; 'idea' is prompted like 'asked' (08-3 §13.5)
  next_run_at INTEGER, last_run_at INTEGER, last_fired_at INTEGER,
  last_condition   INTEGER,                                 -- 1 true / 0 false / null unknown (hysteresis, J14)
  fail_streak      INTEGER NOT NULL DEFAULT 0,
  fired_ever_30d   INTEGER NOT NULL DEFAULT 0,              -- for the stale review (J14)
  est_month_paise  INTEGER, est_month_plan_pct REAL,
  rev              INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE routine_runs (
  id            TEXT PRIMARY KEY,                           -- rr_…
  routine_id    TEXT NOT NULL REFERENCES routines(id) ON DELETE RESTRICT,
  kind          TEXT NOT NULL CHECK (kind IN ('scheduled','catch_up','manual','first')),
  scheduled_for INTEGER, started_at INTEGER NOT NULL, finished_at INTEGER,
  outcome       TEXT CHECK (outcome IN ('nothing','fired','failed','skipped_cap','skipped_quiet','skipped_busy') OR outcome IS NULL),
  reason_short  TEXT,                                       -- plain words, ≤ 60 chars ("couldn't open CoinDCX")
  missed_count  INTEGER NOT NULL DEFAULT 0, gap_from INTEGER, gap_to INTEGER,
  job_id        TEXT REFERENCES jobs(id) ON DELETE RESTRICT,
  cost_paise    INTEGER,
  observed      TEXT  -- JSON { metric, value, unit? } (RoutineStepAct.observed or fast path); 'changed' compares with the latest run that has one
);  -- pruned to the last 20 per routine (J14; hard delete)
CREATE INDEX routine_runs_routine ON routine_runs(routine_id, started_at DESC);

-- 4.3.8 Helpers
-- helper:create, in one db.tx: helpers row (with the pre-generated c_ id in chat_id) → chats row (kind 'helper', helper_id = the new h_ id).
CREATE TABLE helpers (
  id           TEXT PRIMARY KEY,                            -- h_…
  name         TEXT NOT NULL COLLATE NOCASE,                -- unique among live helpers: index helpers_name_live below (X-129)
  job_text     TEXT NOT NULL, good_result TEXT,
  face_ref     TEXT NOT NULL,                               -- FaceRef (§0.6)
  color_token  TEXT NOT NULL,
  allowed_apps TEXT NOT NULL,                               -- JSON = HelperForm.allowedApps: { gmail, gcal, contacts, whatsapp, x, outlook, browser, payments: boolean } (08-0 §B.3); the 06 screens omit the Outlook checkbox while `flags.outlook=false`
  chat_id      TEXT NOT NULL UNIQUE REFERENCES chats(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  paused       INTEGER NOT NULL DEFAULT 0,
  template     TEXT,
  rev          INTEGER NOT NULL DEFAULT 1,
  created_at   INTEGER NOT NULL, deleted_at INTEGER
);
CREATE UNIQUE INDEX helpers_name_live ON helpers(name COLLATE NOCASE) WHERE deleted_at IS NULL;

-- 4.3.9 Memory index (cache of the Markdown files, 08-3 §12)
CREATE TABLE memory_index (
  id          TEXT PRIMARY KEY,                             -- f_… (stored in the file line too, full UUIDv7)
  file        TEXT NOT NULL, line_no INTEGER NOT NULL,      -- path relative to {DATA} with forward slashes ('memory/about-you.md', 'helpers/{id}/notes.md'; the locator, X-112)
  scope       TEXT NOT NULL CHECK (scope IN ('global','chat','helper')),                         -- MemoryScope (08-0 §B.2); identity.md rows are 'global'
  chat_id     TEXT,                                         -- NULL unless scope='chat': read from the chat:{chatId} brace token of the line (08-3 §12.2, X-112)
  text        TEXT NOT NULL,
  provenance  TEXT NOT NULL CHECK (provenance IN ('said','guessed')),                            -- MemoryProvenance ("You said" / "I guessed")
  origin      TEXT NOT NULL,                                -- 'chat:{chatId}/{messageId}' | 'gmail:{msgId}' | 'whatsapp:{id}' | 'manual' | 'setup' | 'job:{jobId}'
  origin_kind TEXT NOT NULL CHECK (origin_kind IN ('chat','gmail','gcal','whatsapp','manual','setup','job')),   -- MemoryOrigin (= MemorySource)
  reason      TEXT,                                         -- for guessed: "from 4 bookings"
  category    TEXT CHECK (category IN ('food','travel','health','money','people','places','work','style','home','family','religion','politics','other') OR category IS NULL),  -- MemoryCategory
  kind        TEXT NOT NULL DEFAULT 'fact' CHECK (kind IN ('person','preference','place','fact')),   -- MemoryKind [settled: X-06]
  sensitive   INTEGER NOT NULL DEFAULT 0,
  private     INTEGER NOT NULL DEFAULT 0,                   -- never in groups (Art. 14)
  learned_at  INTEGER NOT NULL, last_used_at INTEGER, use_count INTEGER NOT NULL DEFAULT 0,
  hash        TEXT NOT NULL                                 -- sha256(normalised text) for tombstones/dedupe
);
CREATE INDEX memory_scope ON memory_index(scope, last_used_at DESC);
CREATE INDEX memory_hash ON memory_index(hash);
CREATE INDEX memory_file ON memory_index(file, line_no);   -- X-112
CREATE VIRTUAL TABLE memory_fts USING fts5(text, content='memory_index', content_rowid='rowid', tokenize="unicode61 remove_diacritics 2 tokenchars '@._-'");
CREATE TRIGGER memory_index_ai AFTER INSERT ON memory_index BEGIN
  INSERT INTO memory_fts(rowid, text) VALUES (new.rowid, new.text); END;
CREATE TRIGGER memory_index_ad AFTER DELETE ON memory_index BEGIN
  INSERT INTO memory_fts(memory_fts, rowid, text) VALUES ('delete', old.rowid, old.text); END;
CREATE TRIGGER memory_index_au AFTER UPDATE OF text ON memory_index BEGIN
  INSERT INTO memory_fts(memory_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
  INSERT INTO memory_fts(rowid, text) VALUES (new.rowid, new.text); END;

CREATE TABLE memory_tombstones (hash TEXT NOT NULL, origin_kind TEXT NOT NULL, forgotten_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
  PRIMARY KEY (hash, origin_kind));                         -- 90 days (J17); mirrored in memory\.tombstones

-- 4.3.10 Connections, contacts index, secrets index (X-73, X-74, 08-0 §E.8, §G.12)
CREATE TABLE connections (
  id             TEXT PRIMARY KEY,                          -- cn_…
  app            TEXT NOT NULL CHECK (app IN ('gmail','gcal','contacts','whatsapp','outlook','hub')),
  account_label  TEXT NOT NULL,                             -- masked 'v***@gmail.com' | '+91 98••• ••210'
  account_hash   TEXT NOT NULL,                             -- sha256 of the real account id, for dedupe
  granted        TEXT NOT NULL,                             -- JSON { read, draft, send, calendarWrite, contactsRead: boolean }
  status         TEXT NOT NULL CHECK (status IN ('connecting','connected','needs_signin','unlinked','error','disconnected')),
  vault_name     TEXT NOT NULL,                             -- 'foo/conn_token/google' (the same on the gmail, gcal and contacts rows) | 'foo/conn_token/outlook' | 'vault\wa-session.bin' (whatsapp)
                                                            -- v1.1 hub row (flags.hub): 'foo/hub_key/composio' (08-0 §E.8)
  connected_at   INTEGER NOT NULL, last_ok_at INTEGER, last_error_kind TEXT,
  history_id     TEXT,                                      -- Gmail users.history baseline; NULL except on the gmail row (08-3 §16.1.3)
  rev            INTEGER NOT NULL DEFAULT 1,
  UNIQUE (app, account_hash)
);
-- 'connecting' is never kept past exit: at startup every 'connecting' row becomes 'disconnected'. A vault target is deleted only when
-- the last row naming it is deleted. Calendar/Contacts "Turn off" changes settings.connections.google.calendarOn/contactsOn, not the row.

CREATE TABLE contacts_index (                               -- Google Contacts, read-only (X-48, 08-3 §16.7)
  id             TEXT PRIMARY KEY,                          -- Google resourceName
  connection_id  TEXT NOT NULL REFERENCES connections(id) ON DELETE RESTRICT,   -- the 'contacts' row
  display_name   TEXT NOT NULL,
  emails         TEXT NOT NULL DEFAULT '[]',                -- JSON string[]
  phones         TEXT NOT NULL DEFAULT '[]',                -- JSON string[]
  synced_at      INTEGER NOT NULL
);   -- replaced wholesale on each sync; deleted on "Disconnect Google" and when contactsOn turns false; never exported; never in Ctrl+K
CREATE VIRTUAL TABLE contacts_fts USING fts5(display_name, emails, phones, content='contacts_index', content_rowid='rowid', tokenize="unicode61 remove_diacritics 2 tokenchars '@._-+'");
CREATE TRIGGER contacts_index_ai AFTER INSERT ON contacts_index BEGIN
  INSERT INTO contacts_fts(rowid, display_name, emails, phones) VALUES (new.rowid, new.display_name, new.emails, new.phones); END;
CREATE TRIGGER contacts_index_ad AFTER DELETE ON contacts_index BEGIN
  INSERT INTO contacts_fts(contacts_fts, rowid, display_name, emails, phones) VALUES ('delete', old.rowid, old.display_name, old.emails, old.phones); END;
CREATE TRIGGER contacts_index_au AFTER UPDATE OF display_name, emails, phones ON contacts_index BEGIN
  INSERT INTO contacts_fts(contacts_fts, rowid, display_name, emails, phones) VALUES ('delete', old.rowid, old.display_name, old.emails, old.phones);
  INSERT INTO contacts_fts(rowid, display_name, emails, phones) VALUES (new.rowid, new.display_name, new.emails, new.phones); END;

CREATE TABLE secrets_index (
  target     TEXT PRIMARY KEY,                              -- 'foo/{kind}/{name}' exactly per 08-0 §E.8; WhatsApp: 'vault\wa-session.bin'
  kind       TEXT NOT NULL CHECK (kind IN ('ai_key','login','card','conn_token','wa_session','web_key','hub_key','user_key')),   -- SecretKind; 'user_key' by migration 0005 (CR-0057)
  name       TEXT NOT NULL,                                 -- the {name} part: providerId | host | last4 | google | outlook | exa… | composio | whatsapp | user key name (CR-0057)
  label      TEXT NOT NULL,                                 -- user-facing, e.g. "Visa ••4242", "OpenAI key"
  domain TEXT, brand TEXT, last4 TEXT,
  storage    TEXT NOT NULL CHECK (storage IN ('credman','blob')),
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, last_used_at INTEGER,
  UNIQUE (kind, name)
);   -- NEVER a value column (Art. 8). secret:save with kind='card' and an existing (kind, name) → SECRET_EXISTS (nothing written);
     -- every other kind replaces the value and writes activity 'secret_replaced' (X-129)

-- 4.3.11 Activity log (Art. 15; X-62, 08-0 §G.4; owner Q2 default for private chats)
CREATE TABLE activity (
  id           TEXT PRIMARY KEY,                            -- act_…
  at           INTEGER NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('sent','paid','booked','deleted','connected','stopped','changed')),
  event        TEXT NOT NULL,
  actor        TEXT NOT NULL,                               -- 'foo' | helper id | 'user'
  chat_id      TEXT REFERENCES chats(id) ON DELETE RESTRICT,
  chat_title   TEXT,                                        -- chat title when written; exactly 'a private chat' for a private chat (R31)
  job_id       TEXT REFERENCES jobs(id) ON DELETE RESTRICT,
  approval_id  TEXT REFERENCES approvals(id) ON DELETE RESTRICT,
  payment_id   TEXT REFERENCES payments(id) ON DELETE RESTRICT,
  routine_id   TEXT REFERENCES routines(id) ON DELETE RESTRICT,
  summary      TEXT NOT NULL,                               -- redacted line 1 (06-3 §9.4 templates); for a private chat built only from the to, amount, payee and recipient labels, never message text (X-82)
  to_label     TEXT,                                        -- masked recipient / payee
  from_label   TEXT,
  amount_paise INTEGER,
  approved_how TEXT CHECK (approved_how IN ('card_once','card_chat','card_always','rule','hello','typed_amount','user','none') OR approved_how IS NULL),
  rule_text    TEXT,                                        -- the Rule.text when approved_how='rule'
  proof_kind   TEXT, proof_ref TEXT,
  outcome      TEXT NOT NULL CHECK (outcome IN ('done','failed','unknown')),
  fields       TEXT,                                        -- JSON, the event's named fields, redacted; never message text for a private chat
  CHECK (
       (kind = 'sent'      AND event IN ('sent_email','sent_whatsapp','opened_x_draft','shared_personal'))
    OR (kind = 'paid'      AND event = 'paid')
    OR (kind = 'booked'    AND event IN ('booked','cancelled_booking'))
    OR (kind = 'deleted'   AND event IN ('deleted_files','deleted_email','deleted_chats','deleted_messages'))
    OR (kind = 'connected' AND event IN ('connected','disconnected','signed_in_site','signed_out_site','saved_login','removed_login'))
    OR (kind = 'stopped'   AND event IN ('stopped_job','stopped_all','paused_routines','resumed_routines'))
    OR (kind = 'changed'   AND event IN ('permission_changed','cap_changed','setting_changed','rule_added','rule_removed','forgot_facts',
                                         'secret_saved','secret_replaced','secret_removed','switched_route','exported'))
  )
);
CREATE INDEX activity_job ON activity(job_id, at);
CREATE INDEX activity_at ON activity(kind, at DESC);
CREATE INDEX activity_actor ON activity(actor, at DESC);
CREATE INDEX activity_chat ON activity(chat_id, at DESC);  -- X-129
CREATE VIRTUAL TABLE activity_fts USING fts5(summary, content='activity', content_rowid='rowid', tokenize="unicode61 remove_diacritics 2 tokenchars '@._-'");
CREATE TRIGGER activity_ai AFTER INSERT ON activity BEGIN
  INSERT INTO activity_fts(rowid, summary) VALUES (new.rowid, new.summary); END;
CREATE TRIGGER activity_ad AFTER DELETE ON activity BEGIN
  INSERT INTO activity_fts(activity_fts, rowid, summary) VALUES ('delete', old.rowid, old.summary); END;
CREATE TRIGGER activity_au AFTER UPDATE OF summary ON activity BEGIN
  INSERT INTO activity_fts(activity_fts, rowid, summary) VALUES ('delete', old.rowid, old.summary);
  INSERT INTO activity_fts(rowid, summary) VALUES (new.rowid, new.summary); END;
-- Only the events above are activity rows; every other 05 "Logged" event goes to the tech log, never here (08-0 §G.4).
-- Rows written from a private chat: chat_title = 'a private chat' and summary built only from to/amount/payee/recipient label,
-- never message text (X-82).
-- The stop report (08-2 §5.7) counts kinds sent, paid, booked, deleted. The 06-3 §9 kind chips filter on `kind`; the expanded row
-- reads to_label / from_label / amount_paise / approved_how + rule_text / proof_kind + proof_ref. Rows are never deleted except by
-- "Delete everything" (J23). settings:set writes one row per user-visible change (§4.4.2).

-- 4.3.12 Notifications ledger (budget + merge, 08-3 §15)
CREATE TABLE notifications (
  id         TEXT PRIMARY KEY,                              -- nt_…
  at         INTEGER NOT NULL,
  local_date TEXT NOT NULL,                                 -- 'YYYY-MM-DD' in the user's time zone
  chat_id    TEXT REFERENCES chats(id) ON DELETE RESTRICT,
  kind       TEXT NOT NULL CHECK (kind IN ('choice','approval','payment','signin','done','routine','brief','stuck','error','reply','reminder','summary')),  -- NotificationKind
  prompted   INTEGER NOT NULL,
  delivery   TEXT NOT NULL CHECK (delivery IN ('toast','held_quiet','held_quiet_item','held_budget','merged','suppressed_focus','suppressed_muted','suppressed_off','summary')),   -- NotificationDelivery
  ref        TEXT                                           -- the cardId or messageId the notification opens; also the Windows toast `tag`
);
CREATE INDEX notifications_day ON notifications(local_date, prompted, delivery);
CREATE INDEX notifications_chat ON notifications(chat_id); -- X-129

-- 4.3.13 Misc
CREATE TABLE site_notes (domain TEXT PRIMARY KEY, flags TEXT NOT NULL,  -- JSON { blocksAutomation, needsSignIn, captchaAlways, otpChannel, searchLoop, bookingWorks }
  updated_at INTEGER NOT NULL);
CREATE TABLE site_recipes (id TEXT PRIMARY KEY /* rcp_ */, domain TEXT NOT NULL, goal TEXT NOT NULL, url_pattern TEXT NOT NULL,  -- 08-2 §8.3.11 [X-46]
  steps_json TEXT NOT NULL /* [{instruction, role, name, fallbackSelector, variableName?}]; never values */, success_count INTEGER NOT NULL DEFAULT 0,
  last_ok_at INTEGER, last_fail_at INTEGER, UNIQUE (domain, goal));
CREATE TABLE suggestions (                                  -- Art. 20 "never offer twice" (X-76, 08-0 §G.13)
  id         TEXT PRIMARY KEY,                              -- sg_…
  key        TEXT NOT NULL UNIQUE,                          -- '{kind}:{subject}', derivation below
  kind       TEXT NOT NULL CHECK (kind IN ('helper_offer','habit_offer','routine_offer','connector_offer','brief_kind_stop','memory_conflict','memory_share','stale_routine','save_login','read_codes','voice_key')),   -- SuggestionKind
  text       TEXT NOT NULL,                                 -- the sentence shown, redacted (the "Dismissed suggestions" dialog lists it)
  state      TEXT NOT NULL CHECK (state IN ('offered','accepted','dismissed')),
  offered_at INTEGER NOT NULL,
  decided_at INTEGER                                        -- the "Dismissed {date}" in the dialog
);
-- subject per kind (AG-26): helper_offer → template id (trips, money, home, family); habit_offer → biller slug ('airtel-7741');
-- routine_offer → 'suggest:{first 8 hex of sha256(task_spec)}' | 'pnr_watch:{pnr}' | 'recharge_due:{billerSlug}-{last4}' (idea offers write no row);
-- connector_offer → ConnectorApp; brief_kind_stop → BriefKind; memory_conflict → the two fact ids sorted, joined by '-'; memory_share → '{factId}:{groupChatId}';
-- stale_routine → routine id; save_login → domain; read_codes → sender domain; voice_key → 'openai'.
-- A key in state 'dismissed' is never offered again. suggestions:restoreDismissed { key } sets that row to 'offered'; {} sets all.
CREATE INDEX suggestions_state ON suggestions(state, decided_at DESC);   -- X-129
CREATE TABLE outbox (id TEXT PRIMARY KEY /* ob_ */, approval_id TEXT NOT NULL REFERENCES approvals(id) ON DELETE RESTRICT, created_at INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('waiting_online','sent','cancelled'))); -- J12 offline send with consent
CREATE TABLE brief_feedback (id TEXT PRIMARY KEY /* bf_ */, brief_card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE RESTRICT,
  item_kind TEXT NOT NULL /* BriefKind */, vote INTEGER NOT NULL CHECK (vote IN (1, -1)), at INTEGER NOT NULL); -- J6, 08-3 §14.5
CREATE TABLE wa_messages (id TEXT PRIMARY KEY /* 'wa_' + chat_jid + ':' + Baileys key.id; ingest is INSERT OR IGNORE (X-129) */, chat_jid TEXT NOT NULL, from_me INTEGER NOT NULL, sender_label TEXT, text TEXT,
  at INTEGER NOT NULL, starred INTEGER NOT NULL DEFAULT 0, mentions_me INTEGER NOT NULL DEFAULT 0); -- pruned at 7 days (J16; hard delete)
CREATE INDEX wa_messages_chat ON wa_messages(chat_jid, at DESC);
CREATE TABLE wa_contacts (jid TEXT PRIMARY KEY, name TEXT, phone TEXT, updated_at INTEGER NOT NULL);
  -- names for JID resolution; deleted with wa_messages on unlink or read=false; never exported (08-0 §G.17)
CREATE TABLE held_items (
  id                    TEXT PRIMARY KEY,                   -- hi_…
  kind                  TEXT NOT NULL CHECK (kind IN ('routine_fire','habit_offer','helper_offer','stale_routine','away_notice','memory_conflict','cap_80','brief_kind_stop','suggestion')),   -- HeldItemKind
  chat_id               TEXT NOT NULL REFERENCES chats(id) ON DELETE RESTRICT,
  payload               TEXT NOT NULL,                      -- JSON HeldItemPayload (08-5 §3.8)
  created_at            INTEGER NOT NULL,
  delivered_in_brief_id TEXT
);   -- 08-3 §15.6; undelivered rows older than 7 days deleted by the brief builder
CREATE INDEX held_items_chat ON held_items(chat_id);       -- X-129
CREATE TABLE memory_group_grants (
  fact_id TEXT NOT NULL,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE RESTRICT,
  until   INTEGER NOT NULL,
  PRIMARY KEY (fact_id, chat_id)
);   -- 08-0 §G.17 (C-5)
CREATE TABLE memory_uses (fact_id TEXT NOT NULL, chat_id TEXT NOT NULL, job_id TEXT, at INTEGER NOT NULL);
CREATE INDEX memory_uses_chat ON memory_uses(chat_id, at);
  -- purged nightly after 90 days; read by the named query memoryUsedInChat
CREATE TABLE files (                                        -- file index (DB-16): 06-3 §12.3 Files group, helper profile files, export files-index.json
  id            TEXT PRIMARY KEY,                           -- fl_…
  kind          TEXT NOT NULL CHECK (kind IN ('made','received','downloaded','screenshot')),
  name          TEXT NOT NULL,
  mime          TEXT, bytes INTEGER,
  path          TEXT NOT NULL,                              -- absolute
  chat_id       TEXT REFERENCES chats(id) ON DELETE RESTRICT,
  message_id    TEXT REFERENCES messages(id) ON DELETE RESTRICT,
  job_id        TEXT REFERENCES jobs(id) ON DELETE RESTRICT,
  helper_id     TEXT REFERENCES helpers(id) ON DELETE RESTRICT,
  created_at    INTEGER NOT NULL,
  missing_since INTEGER                                     -- set by housekeeping when the path no longer exists
);
CREATE INDEX files_chat ON files(chat_id, created_at DESC);
CREATE INDEX files_helper ON files(helper_id, created_at DESC);   -- X-129
CREATE INDEX files_job ON files(job_id);                   -- X-129
-- Written by files.write, browser.download, files:stage (on send) and the step-screenshot writer. Ctrl+K Files group =
-- kind IN ('made','received','downloaded') AND name LIKE ?; helper profile files = helper_id.
```

No other index is added without a GAPS line and a PERF trace (DB-22).

### 4.4 `settings.json` (schema: 08-0 §A — pointer)

4.4.1 **Schema, defaults, ranges, locks, AI allow-list.** The `Settings` interface (`schemaVersion: 2`), every default and range, the locks (`SETTING_LOCKED`) and the list of paths the AI may change are **08-0 §A, §A.1, §A.2, §A.3** (X-53, X-54) and are not restated here. Code: the type in `src/shared/settings.ts`, the one defaults object in `src/shared/settingsDefaults.ts` (zod `.default()` is not used), the zod schema in `src/shared/schemas.ts`, the lock constants in `src/shared/settings.ts` (imported by main for enforcement and by the renderer to disable choices). The keys removed by 08-0 §A.1 (`autonomy`, `spend`, `files.grants`, `connections.contacts`, `dismissedShown`, …) exist nowhere. This chapter adds only the mechanics below.
- `SettingsPath` = the union of every dotted leaf path of `Settings`, generated as a literal union in `src/shared/settings.ts`, with these whole-value paths instead of their leaves: `permissions.folders`, `notifications.quiet.days`, `notifications.mutedChats`, `privacy.readCodesFromGmail`, `connections.whatsapp.hiddenJids`, `search.recent`, `window.bounds`. `rules` is not a `SettingsPath`: rules are added only by the ApprovalGate (an Always scope, 08-0 §G.3) and removed by `rules:remove`.
- `PublicSettings` = `Settings` minus `install.readiness`, `ai.providers[*].model`, `ai.providers[*].cheapModel`, `chat.transcribeModel`, `dev`, `flags`, `window.bounds`; plus `{ locked: SettingsPath[] }` = the paths whose value cannot change in this build (v1: `permissions.actions.post`). The renderer greys out the values 08-0 §A.2 forbids using the shared lock constants.
- Writes are atomic (temp file → `MoveFileEx` replace) and only main writes the file.

4.4.2 **`settings:set` and `settings:undo`** (BE-29, 08-0 §A.3).
1. Validate `path` and `value` with zod → `VALIDATION`; check 08-0 §A.2 → `SETTING_LOCKED`. Nothing is written on either error.
2. Write the file; emit `settings:changed` (renderer) and `settings.changed { paths, settings }` (engine).
3. **Change record.** Except for the internal paths `install.*`, `setup.*`, `window.*`, `search.*`, `app.closeDialogShown`, `chat.openAiKeyOffered`, `chat.voiceKeyRefused`, every change writes one `activity` row in the same step: `kind='changed'`; `event` = `permission_changed` for `permissions.*`, `cap_changed` for `money.purchaseCapPaise`, `money.aiCapPaise` and `money.bigPaymentPaise`, else `setting_changed`; `fields = { path, old, new }` (redacted); `actor` = `'user'`, or `'foo'` when the change came from an AI op; `approved_how` = `'user'`, or `'none'` for an AI op; `outcome='done'`. `changeId` = that row's id (`act_…`); internal paths return `changeId: null`.
4. `settings:undo { changeId }`: if the activity row exists, has a `fields.path`, and the current value at that path deep-equals `fields.new`, main writes `fields.old` through steps 1–3 (a new activity row with old and new swapped) and returns the settings; otherwise `TOO_LATE` (the setting changed again since). There is no time limit. It backs both the 06 undo bar and 08-0 §A.3's chat mini line "Changed: {row label} → {value}. [ Undo ]".
5. **AI ops.** The engine sends `settings.set` (§2.4) for an `<act>` `{ kind: 'setting', path, value }`. Main accepts only the 08-0 §A.3 allow-list (else `SETTING_LOCKED`, and the engine posts 08-0 §A.3's refusal line with its button); an accepted change runs steps 1–3 with `actor 'foo'` and the engine posts the mini line with the `changeId`.

4.4.3 **Load, migration and repair** (08-0 §A, DB-33).
1. Read `{DATA}\settings.json`. Missing → defaults (first run).
2. Not parseable JSON, or `schemaVersion` missing or 1 (the pre-review shape was never written by any build, so there is no `1-to-2.ts`) → rename to `settings-damaged-{yyyy-mm-dd-HHmm}.json`, log `settings.repaired`, use defaults, except `setup.complete = true` when `foo.db` holds a `kind='foo'` chat with at least one message (the user is never sent back through first run for a damaged file).
3. `schemaVersion` lower than the app's → run `src/main/settings/migrations/{n}-to-{n+1}.ts` in order (pure functions, one unit test each); back up the file to `settings.json.bak-{n}` before the first write after a migration. Migrations start at `2-to-3.ts`.
4. `schemaVersion` higher than the app's (an older build after a newer one) → the file is not migrated; it is parsed with unknown keys dropped in memory and backed up to `settings.json.bak-{fileVersion}` before the first write.
5. zod parse: unknown keys are dropped; an invalid value falls back to that key's default; each repaired path is logged once (`settings.repaired`, path names only, never values).

### 4.5 Card payloads (X-56, 08-0 §G.1–§G.2)

`cards.type` is exactly the 25 `CardType` values of 08-0 §G.1; sub-kinds are payload fields, never types. `CardPayload` (in `src/shared/types.ts`, zod in `src/shared/schemas.ts`) is a union discriminated by `type`. The fields below are binding; the members for `bill`, `table`, `file`, `link_preview`, `place`, `connect` and `setup` are the full shapes of 08-5 §4.1 (X-111, X-115, X-119, X-127, X-129), and the card's 05 section says which element each field draws. Setup interview cards reuse these types with `setupCard: 'A' … 'H'` (06-1); the other first-run surfaces are type `setup` (X-119).

```ts
type CardPayload =
  | { type: "brief"; items: BriefItem[]; light: boolean; lateNote?: string; footer?: string }
  | { type: "checklist"; jobId: string }                                                     // steps come from `steps`; edited in place (Art. 17)
  | { type: "choice" | "tiles"; purpose: ChoicePurpose; question: string;
      options: { id: "o1" | "o2" | "o3" | "o4"; label: string; detail?: string; bestFit?: boolean; photoRef?: string /* required for tiles */ }[];
      multi?: boolean; stepper?: { index: number; total: number }; aiReversible: boolean /* what the AI said */; reversible: boolean /* the engine's effective value */;
      livePrices: boolean; setupCard?: string }   // J8 timeout rules; ChoiceCardSpec, ChoicePayload (08-0 §B.3)
  | { type: "approval"; variant: "standard" | "deadline_reminder"; approvalId: string; verb: ApprovalVerb; title: string; impact: string;
      fields: ApprovalFields; scopes: ("once" | "chat" | "always")[]; hardLimit: boolean; expiresAt: number }
  | { type: "payment"; approvalId: string; lines: { label: string; amountPaise: number }[]; totalPaise: number; payee: string; cancelTerms?: string;
      bookedUnder?: string; method: PaymentMethodView; bigPayment: boolean; needsCvv: boolean; expiresAt: number }
  | ({ type: "bill" } & BillPayload)                                                           // 08-5 §4.1 (X-115)
  | { type: "draft"; approvalId: string; channel: "email" | "whatsapp" | "x"; to?: { name: string; address: string; isNew: boolean }; subject?: string;
      body: string; signature?: string /* Gmail default send-as signature, shown below the body (owner Q4 default) */; edited: boolean;
      sendAllowed: boolean; xRemaining?: number; undoUntil?: number }
  | { type: "secret"; secretKind: "ai_key" | "voice_key" | "web_key" | "login" | "card" | "otp" | "cvv" | "user_key"; name: string; why: string;
      fields: { key: string; label: string; masked: boolean }[]; savedAt?: number;
      requestId?: string /* otp */; sentTo?: string /* otp: masked destination */; paymentCardId?: string /* cvv */ }
  | { type: "signin"; mode: "sign_in_here" | "take_over"; jobId: string; site: string; reason: string }
  | ({ type: "connect" } & ConnectPayload)                                                     // 08-5 §4.1: variant, app, why?, scopes?, setupCard? (X-127)
  | { type: "plan"; title: string; steps: string[]; minutes: number; costLine: string; big: boolean }
  | { type: "routine"; routineId: string; changedField?: string }
  | { type: "routine_offer"; suggestionKey: string; draft: RoutineDraft; text: string; source: "habit" | "idea" | "after_job" }   // RoutineOfferPayload (08-0 §B.3)
  | { type: "stuck"; whatsWrong: string; spentLine: string; suggestion: string; allowOtherWay: boolean }
  | { type: "error"; variant: "error" | "recovery"; kind: ErrorKind; whatHappened: string; whatIsSafe: string;
      button: { label: string; action: FixAction }; secondary?: { label: string; action: FixAction };
      jobId?: string; atStep?: number; of?: number; paymentChecking?: boolean; doneLines?: string[] /* variant 'recovery' (J19.5) */ }
  | { type: "spend_cap"; which: "ai" | "purchase"; capPaise: number; spentPaise: number }
  | { type: "job_link"; jobId: string }                                                        // mirrors a job in another chat (J15)
  | { type: "face_explainer" }                                                                 // empty payload {}; state `shown` only (08-0 §G.1)
  | ({ type: "catch_up" } & CatchUpPayload)                                                    // 12-2 §12.27.5
  | ({ type: "table" } & TablePayload)                                                         // 08-5 §4.1 (X-129)
  | ({ type: "file" } & FilePayload)                                                           // 08-5 §4.1
  | ({ type: "link_preview" } & LinkPreviewPayload)                                            // 08-5 §4.1
  | ({ type: "place" } & PlacePayload)                                                         // 08-5 §4.1
  | ({ type: "setup" } & SetupCardPayload)                                                     // 08-5 §4.1; states shown | answered | skipped (08-0 §G.2, X-119)
```

Removed types (do not use anywhere): `code` and `cvv` (→ `secret` with `secretKind` `otp`/`cvv`), `takeover` (→ `signin` `mode: 'take_over'`), `recovery` (→ `error` `variant: 'recovery'`), `memory_confirm` (→ `choice` `purpose: 'memory_confirm'`), `link` (→ `job_link`), `feedback`, `helper_form`, `group_form` (screens, not cards), `paste`, `voice` (message kinds or composer UI, not cards), `spendcap` (→ `spend_cap`). The memory chip is a marker message (`marker_kind='memory_chip'`), not a card.

4.5.1 **Card states.** `cards.state` holds exactly the 08-0 §G.2 list for the card's type (approval and payment: `ApprovalState`, mirrored from the `approvals` row in the same transaction; `setup`: `shown`, `answered`, `skipped`, X-119). There is no SQL CHECK (one column, many types); `Store` validates `state` against the type's list on every write and rejects anything else (`VALIDATION`). Every state change sets `updated_at`, increments `rev`, and, when the change resolves the card, sets `resolved_by` and `resolved_at` (§3.1.3). A new card that replaces an old one sets `supersedes_id`; the old card moves to `superseded` (or `SUPERSEDED`) in the same transaction.

4.6 **Integrity rules (MUST).**
1. A `payments` row exists only with an `approvals` row of verb `pay` (FK + UNIQUE), inserted in the write-ahead transaction (§4.3.6). Payment and approval state changes happen in one transaction.
2. `messages.text`, `messages.text_for_ai`, `messages.transcript`, `drafts.text`, `tool_calls.args/result`, `activity.summary`, `activity.fields`, `cards.payload` and `suggestions.text` are written only through `Store.writeRedacted()` (main) or the `redact` list of a `DbOp` insert (§2.4.1), which call the Redactor (§11.4). A raw `INSERT` from feature code is a review-blocking bug (lint rule `foo/no-raw-text-write`).
3. **Deletion = soft delete, then purge** (X-63, 08-0 §G.5, DB-02). Every FK is `ON DELETE RESTRICT`.
   - **Soft delete** sets `deleted_at = now` on `chats`, `messages`, `cards` (and `helpers`). Soft-deleted rows are excluded from every list query, search, `app:getBootstrap` and export.
   - **Purge** (children first): purge of a chat first deletes its `memory_group_grants` rows and its `held_items` rows; then hard-delete the row's `reactions`, its `drafts` row and draft files, its `group_members`, its `notifications` rows and its `files` rows of kind `received`, `downloaded` and `screenshot` (all under `{DATA}`); `files` rows of kind `made` stay, and foo never deletes the user's files in `{OUT}`; delete the files `{DATA}\data\voice\{messageId}.*`, `{DATA}\data\inbox\{attachmentId}-*`, `{DATA}\avatars\{chatId}.png` and the `{DATA}\jobs\{jobId}\` folders of the chat's jobs; then blank the content columns of the soft-deleted rows (`messages.text`, `text_for_ai`, `transcript`, `attachments`, `voice_path` → `''`/`NULL`; `cards.payload` → `'{}'`, `cards.answer` → `NULL`), which removes their FTS entries through the `_au` triggers. The `chats`, `messages` and `cards` rows themselves stay as tombstones so that `jobs`, `steps`, `tool_calls`, `ai_turns`, `approvals`, `payments` and `activity` keep their references and the Spend and Activity pages keep their numbers (Art. 7, 11, 13, 15). Purging a private chat sets `ai_turns.chat_id = NULL` for its turns and keeps every file referenced by an `activity.proof_ref` (12-2 §12.30.6).
   - WhatsApp unlink or `connections.whatsapp.read=false` deletes all `wa_contacts` rows together with the `wa_messages` rows.
   - `chat:delete` runs soft delete and purge of the chat, its messages and its cards in one transaction; `data:deleteOlderThan` does the same for the matching messages and their cards; the nightly housekeeping purges anything soft-deleted but not yet purged. `activity` rows survive every deletion except "Delete everything" (J23), which deletes `foo.db` and the folders whole.
   - **`helper:delete`** (06-3 C-5/C-6, X-129), in this order: stop the helper's jobs (`jobs.stop`, `stop_reason='helper_deleted'`); then in one transaction set `helpers.deleted_at`; soft-delete + purge its chat (above); delete the `group_members` rows whose `member_id` is the helper (a group left with < 2 members is soft-deleted too); set its `routines` to `state='deleted'`; delete the `memory_index` and `memory_uses` rows whose `file` is under `helpers/{id}/`; delete the folder `{DATA}\helpers\{id}\` (`profile.json`, `notes.md`); `secrets_index` and the vault are untouched; write the activity row `deleted_chats` "Deleted {Trips} and its chat".
   - **Hard `DELETE`** is allowed only on: `wa_messages`, `notifications`, `routine_runs`, `memory_index`, `memory_tombstones`, `contacts_index`, `site_recipes`, `outbox`, `drafts`, `reactions`, `group_members`, `files`, `held_items`, `memory_uses`, `memory_group_grants`, `wa_contacts`, `tool_calls` (main's housekeeping only, rows of terminal jobs 90 days after `finished_at`, §4.3.4; X-129) and `connections` (on disconnect, with the token rule of §4.3.10). `HardDeletable` (§2.4.1) is unchanged: the engine never deletes `tool_calls` or `contacts_index`. Nothing else is ever hard-deleted.
4. **`rev`.** `Store.update*` sets `rev = rev + 1` in the same statement on `chats`, `messages`, `cards`, `jobs`, `steps`, `routines`, `helpers`, `connections`; every `*Row` carries it; the renderer applies a patch only when newer (§3.1.5). `rev` survives restarts because it is stored.
5. **Activity for private chats** (owner Q2 default). An `activity` row whose chat is a private chat (R31, `12-features-r25-r31`) has `chat_title = 'a private chat'`, a `summary` built only from the to, amount, payee and recipient labels (never message text, X-82) and no message text in `fields`; `kind`, `event`, `to_label`, `amount_paise`, `approved_how` and proof are kept (money and sends stay traceable, Art. 13).
6. **Idempotent replay** (X-113). A replayed step (crash recovery, 08-2 §5.9) reuses the stored `tool_calls` row's result when its `outcome = 'ok'` and never re-calls the adapter; the row is found by `idem_key` (§4.3.4, `UNIQUE`).
7. **Derived chat columns** (X-129). They are written only by main, inside the same transaction as the triggering `DbOp`; the engine never names them, and a `DbOp` that sets one is rejected with `DB_NOT_WRITABLE`:
   - `insert messages` → `seq = chats.next_seq`, `chats.next_seq += 1`, `chats.last_message_id = id`, `chats.last_activity_at = created_at`; `unread_count += 1` unless `author_kind = 'user'` or the chat is open and focused (03 §3.9.6; `chat:markRead` lowers it, X-117); `helper_messages_since_user += 1` for `author_kind = 'helper'`, `= 0` for `author_kind = 'user'`.
   - `transition jobs` (and the card writes that open or resolve a NEEDS YOU card) → `chats.pill` per the 03-shell-1 §3.4.5 pill precedence (Needs you › Paused › Working › Done), `pill_until = now + 24 h` when the pill becomes `done`.
   - `loop_paused` is set to 1 by main when `helper_messages_since_user` passes the 08-3 §17.3.4 loop-guard threshold and cleared, with the counter, on the next user message.
