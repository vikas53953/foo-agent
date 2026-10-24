# 08-0 · Canonical names and shared models (binding)

Status: binding from 2026-10-16 (review Phase 1; round 2 rulings X-111…X-141 applied, merge 2026-10-17). Owner of this file: chief architect. Decisions X-53…X-80 and X-90…X-133 in `DECISIONS.md` point here. **Companion file `08-5-shared-types.md`** (same rank) writes out every shared shape that no chapter holds in full; nothing in `constitution/` cites `review/*.md` as a source (X-111). **Phase 3a (2026-10-16):** every addendum in `review/addenda-{A,B,C,D,E,F,G1,G2}.md` is merged here or rejected there (X-90); chapters replace every `[addendum X-n]` marker with the final name below (`review/xref-*.md`).

**Precedence.** Articles > DECISIONS (X-nn) > **this file** > 02 > 03–06 > 07–09 > 10 > research. Where any chapter (including 08-1/2/3) names a key, type, id, path, enum value or file differently from this file, this file wins and the chapter is corrected by its fixer group (see `review/work-*.md`). Nothing here changes an Article.

**How to read.** Each section is the single source for its names. Code mirrors it 1:1: §A → `src/shared/settings.ts` + `src/shared/settingsDefaults.ts`; §B → `src/shared/types.ts`; §C → `src/shared/testids.ts`; §D → `src/shared/copy/`; §F → `src/shared/badges.ts`.

---

## §0 Casing rule (X-57)

| Where | Casing | Example |
|---|---|---|
| SQLite tables and columns | `snake_case` | `cards.supersedes_id`, `jobs.stop_reason` |
| TypeScript identifiers, IPC payload fields, `settings.json` keys, `<act>` JSON fields, every JSON file on disk (mirrors, `state.json`, `activity.jsonl`, `launches.json`, `routines\{id}.json`) | `camelCase` | `purchaseCapPaise`, `stepsDone` |
| Types, components, files exporting one component | `PascalCase` | `ChatRow`, `ApprovalCard.tsx` |
| Enum / union string values | `lower_snake` | `'done_unverified'`, `'stuck_stop'` |
| Exceptions | `ApprovalState` values are `UPPER` (`PENDING`, `APPROVED`…, per 07). `ErrorKind` values are `UPPER_SNAKE` (`NET_OFFLINE`). | |
| IPC invoke channels | `{domain}:{verb}` (camelCase verb) | `chat:archive`, `settings:undo` |
| IPC event channels | `{domain}:{noun}` (camelCase noun), never equal to an invoke name | `ai:detectRow`, `data:exportProgress` |
| Memory file paths (`memory_index.file`) | relative to `{DATA}`, forward slashes | `memory/about-you.md`, `memory/people/{slug}.md`, `memory/preferences/{topic}.md`, `helpers/{h_id}/notes.md` (X-112) |
| `data-testid` | kebab-case (§C) | `composer-send` |
| Copy keys | dot-separated `lower_snake` segments (§D); card copy uses area `cards` (plural), the test-id area stays `card` (X-105) | `cards.approval.button.change` |
| Settings row ids | as 06 (`p-send`, `cap-ai`) | |

A DB row maps to its TS `*Row` type by camelCasing every column; the mapper lives in `src/main/db/rows.ts` and is the only place that converts. `INTEGER` flag columns (`private`, `pinned`, `loop_paused`, `starred`, `prompted`, …: values 0/1) map to `boolean`; JSON `TEXT` columns map to their parsed type.

---

## §A `settings.json` — full schema (X-53)

File: `{DATA}\settings.json`. Validated by zod on load and on every `settings:set`. `schemaVersion: 2` (this schema). Migrations: `src/main/settings/migrations/{n}-to-{n+1}.ts`, run on load in order, each pure and unit-tested; the file is backed up to `settings.json.bak-{n}` before the first write after a migration. Unknown keys are dropped; invalid values fall back to the default and are logged (`settings.repaired`).

Defaults live only in `src/shared/settingsDefaults.ts`. The TS type uses real types (`string`, `number`), never literal values that double as defaults.

```ts
type HHMM = string;                       // /^([01]\d|2[0-3]):[0-5]\d$/
type Tri = 'always' | 'ask' | 'never';

interface Settings {
  schemaVersion: 2;
  install:  { at: number; version: string; startWithWindows: boolean; readiness: ReadinessResult };
  setup:    { complete: boolean; step: 0 | 1 | 2 | 3 | 4 | 5; interviewCard?: 'A'|'B'|'C'|'D'|'E'|'F'|'G'|'H'; firstBriefAt?: number };
  identity: { agentName: string; avatarRef: FaceRef; vibe: 'calm_funny' | 'direct' | 'warm' | 'custom'; vibeLine: string; emoji: string };
  user:     { firstName?: string };
  locale:   { timeZone: string; region: string; currency: string };
  app:      { closeToTray: boolean; hardwareAcceleration: boolean; closeDialogShown: boolean };
  zoom:     80 | 90 | 100 | 110 | 125 | 150 | 175 | 200;
  appearance: { theme: 'system' | 'light' | 'dark'; useWindowsAccent: boolean };
  window:   { bounds?: { x: number; y: number; width: number; height: number }; maximized: boolean; displayId?: string;
              sidebarWidth: number; rightShellOpen: boolean; lastChatId?: string };
  ai: {
    primary: ProviderId | null; backup: ProviderId | null;
    providers: Partial<Record<ProviderId, { kind: 'plan' | 'key' | 'local'; lastVerifiedAt?: number; lastVerifyOk?: boolean; model?: string; cheapModel?: string }>>;
    plainChatFallback: boolean;
  };
  permissions: {
    actions: { read: Tri; drafts: Tri; calendar: Tri; send: Tri; book: Tri; pay: Tri; post: Tri; delete: Tri; share: Tri };
    apps:    { gmail: Tri; calendar: Tri; contacts: Tri; whatsapp: Tri; browser: Tri; outlook: Tri };
    folders: { path: string; mode: Tri }[];
  };
  rules: Rule[];
  money: { purchaseCapPaise: number; aiCapPaise: number; warnAt80: boolean; bigPaymentPaise: number;
           upiId?: string; defaultMethod?: { kind: 'card'; secretName: string } | { kind: 'upi' } };
  notifications: {
    kinds: { needsYou: boolean; done: boolean; routine: boolean; brief: boolean; helper: boolean; problem: boolean };
    sound: boolean;
    quiet: { on: boolean; from: HHMM; to: HHMM; days: number[] /* 0=Sun…6=Sat */ };
    unpromptedPerDay: 0 | 1 | 2 | 3;
    mutedChats: Record<string /* chatId */, number /* until epoch ms */ | 'forever'>;
  };
  brief: { enabled: boolean; at: HHMM };
  routines: { activeFrom: HHMM; activeTo: HHMM; pauseWhenAway: boolean; catchUp: boolean; keepAwake: boolean; housekeepingMessages: boolean; habitOffers: boolean };
  chat: { voiceReplies: 'when_i_send_voice' | 'always' | 'never'; holdToTalk: string; showStatusOnMyMessages: boolean;
          voiceToText: 'openai' | 'this_pc'; openAiKeyOffered: boolean; voiceKeyRefused: boolean;
          transcribeModel: 'gpt-4o-mini-transcribe' | 'gpt-4o-transcribe' };
  privacy: { rememberOn: boolean; learnFromChats: boolean; askBeforeRemembering: boolean; screenshotDays: 0 | 1 | 7 | 30;
             voiceDays: 7 | 30 | null; readCodesFromGmail: string[] /* sender domains */; photoCheckNoticeShown: boolean };
  files: { outputFolder: string; outputFolderReason?: 'onedrive_online_only' };
  connections: {
    whatsapp: { read: boolean; draft: boolean; hiddenJids: string[] };
    google:   { calendarOn: boolean; contactsOn: boolean };
    web:      { search: 'exa' | 'tavily' | 'this_pc'; read: 'firecrawl' | 'this_pc'; cloudBrowser: boolean;
                refused: { exa: boolean; tavily: boolean; firecrawl: boolean; browseruse: boolean } };   // X-127
  };
  search: { recent: string[] };
  dev:    { screenRung: { clickType: boolean } };
  flags:  { screenHands: boolean; hub: boolean; outlook: boolean; multiAccount: boolean };
}
```

### A.1 Defaults and ranges

| Key | Default | Range / rule |
|---|---|---|
| `setup.step` | 0 | 0–5 (06-1 numbering) |
| `setup.interviewCard` | absent | 'A'…'H'; set while step = 3 (06-1 numbering: 0 welcome, 1 AI, 2 name and face, 3 interview, 4 real job, 5 closing) so a relaunch resumes the exact interview card (UJ-17, E-8) |
| `app.closeToTray` | true | — |
| `app.hardwareAcceleration` | true | restart needed |
| `app.closeDialogShown` | false | replaces top-level `dismissedShown` |
| `zoom` | 100 | enum above; Ctrl+= / Ctrl+- step through it |
| `appearance.theme` | 'system' | — |
| `appearance.useWindowsAccent` | false | replaces `systemAccent` (X-51) |
| `appearance.visuals` [X-180] | 'balanced' | 'words' \| 'balanced' \| 'visuals' (06-2 §6.2 Visuals; CR-0022 pick 8) |
| `appearance.animations` | 'full' | 'full' \| 'basic' \| 'off'; first run sets 'basic' on ≤ 4 logical CPUs or < 8 GB RAM; Windows animation effects off shows 'off' without writing it (X-150, 02 F7) |
| `window.sidebarWidth` | 340 | 300–460 at L; at M the shell clamps the shown width to ≤ 400 and at S fixes it at 300 without writing the setting (02 F5 `--sidebar-w`, X-91) |
| `window.rightShellOpen` | true | read at L only (the right shell is open by default at L, Blueprint, X-91); the M/S overlay never reads or writes it (`ui.rightShellOpenOverlay`, closed by default, not persisted) |
| `ai.plainChatFallback` | true | — |
| `permissions.actions.read` | 'always' | any |
| `permissions.actions.drafts` | 'always' | any |
| `permissions.actions.calendar` | 'ask' | any |
| `permissions.actions.send` | 'ask' | **ask \| never** |
| `permissions.actions.book` | 'ask' | **ask \| never** |
| `permissions.actions.pay` | 'ask' | **ask \| never** |
| `permissions.actions.post` | 'never' | **locked 'never' in v1** (hand-back, X-54) |
| `permissions.actions.delete` | 'ask' | **ask \| never** |
| `permissions.actions.share` | 'ask' | **ask \| never** |
| `permissions.apps.*` | gmail 'always', calendar 'always', contacts 'always', whatsapp 'ask', browser 'always', outlook 'never' | any; outlook row hidden while `flags.outlook=false` |
| `permissions.folders` | `[]` | path absolute, normalised, no duplicates |
| `money.purchaseCapPaise` | 2_500_000 | 0–100_000_000 |
| `money.aiCapPaise` | 100_000 | **≥ 10_000**, ≤ 10_000_000 |
| `money.warnAt80` | true | — |
| `money.bigPaymentPaise` | 1_000_000 | **0–1_000_000** (cannot exceed ₹10,000) |
| `notifications.kinds.*` | all true | — |
| `notifications.sound` | true | — |
| `notifications.quiet` | `{ on: true, from: '22:00', to: '07:00', days: [0,1,2,3,4,5,6] }` | from ≠ to |
| `notifications.unpromptedPerDay` | 3 | **0–3** (Art. 19, R-11) |
| `brief.enabled` / `brief.at` | true / '08:00' | one key, used by both the Notifications and Routines rows (UJ-39) |
| `routines.activeFrom` / `activeTo` | '07:00' / '22:00' | — |
| `routines.pauseWhenAway` | true | — |
| `routines.catchUp` | true | — |
| `routines.keepAwake` | false | — |
| `routines.housekeepingMessages` | true | 06-2 §6.7 row `r-housekeeping` "Tell me about routines that stopped or went quiet"; "Stop these" on an away/stale-routine message writes false (04 §19.6) |
| `routines.habitOffers` | true | 06-2 §6.7 row `r-habits` "Offer to turn things I see you repeat into routines"; "Stop these" on a habit offer writes false; the engine checks it before any `habit_offer` (D-10, X-92); not on the §A.3 allow-list |
| `chat.voiceReplies` | 'when_i_send_voice' | — |
| `chat.holdToTalk` | 'Ctrl+Space' | validated accelerator string; must not collide with 09 §9.17 |
| `chat.showStatusOnMyMessages` | true | — |
| `chat.voiceToText` | 'openai' if an OpenAI key is saved, else 'this_pc' (X-43) | — |
| `privacy.rememberOn` | true | — |
| `privacy.learnFromChats` | true | — |
| `privacy.askBeforeRemembering` | false | — |
| `privacy.screenshotDays` | 7 | 0 = don't keep |
| `privacy.voiceDays` | 30 | 7 \| 30 \| null (null = keep) |
| `privacy.photoCheckNoticeShown` | false | set true when the user taps "Send it" on the one-time photo-check notice (§G.18); no Settings row |
| `files.outputFolder` | `Documents\foo` | absolute path |
| `connections.whatsapp` | `{ read: true, draft: true, hiddenJids: [] }` | — |
| `connections.google` | `{ calendarOn: true, contactsOn: true }` | — |
| `connections.web` | `{ search: 'this_pc', read: 'this_pc', cloudBrowser: false, refused: { exa: false, tavily: false, firecrawl: false, browseruse: false } }` | cloudBrowser true only with a Browser Use key; `refused.{p}` is set true on `CLOUD_AUTH` from the key check (`webkey.check`, 08-1 §2.4) or any later call, cleared on the next HTTP 200 from that provider and on Remove key; saving a web key writes `search`/`read`/`cloudBrowser` for that provider (two search keys: the last saved one is `search`, the other key stays in the vault; one-line Link "Use Exa instead" / "Use Tavily instead", `settings.connections.web.switch_to`, 06-2 §6.8, X-138); `secret:delete` on a web key resets its field to `this_pc`/`false` (X-127) |
| `flags.*` | all false | build flags, not user-visible |

The 06 row id of each key is owned by 06 (06 §0.13 and each 06 "Writes" cell); this table holds no row ids (E-7).

Removed keys (do not use anywhere): `autonomy`, `spend`, `spend.warnAtPct`, `notifications.toastKinds`, `notifications.quietFrom/quietTo/quietDays`, `notifications.soundInFocus`, `files.grants`, `connections.contacts`, `dismissedShown`, `appearance.systemAccent`, `ai.provider`, `ai.fallback`, `routines.hours`.

### A.2 Locks (enforced in `settings:set`, error `SETTING_LOCKED`)
1. `permissions.actions.{send, book, pay, delete, share}` ∈ {ask, never}.
2. `permissions.actions.post` = 'never' (v1).
3. `money.bigPaymentPaise` ∈ [0, 1_000_000].
4. `money.aiCapPaise` ≥ 10_000.
5. `notifications.unpromptedPerDay` ≤ 3.
6. Any value outside its enum or range: `VALIDATION`.

### A.3 What the AI may change by words (X-53, closes AI-04)
The `<act>` op `{ kind: 'setting', path, value }` is accepted only for this allow-list: `chat.voiceReplies`; `notifications.quiet.*`, `notifications.kinds.*`, `notifications.unpromptedPerDay`, `notifications.mutedChats`; `brief.*`; `appearance.*`; `zoom`; `privacy.learnFromChats`, `privacy.askBeforeRemembering`, `privacy.screenshotDays`. Everything else (money, permissions, rules, connections, ai, files, flags, dev, identity, window, setup, install) is refused with the line "That's one for you to change. [ Open Settings ]" deep-linking to the row. Every applied change posts the mini line "Changed: {row label} → {value}. [ Undo ]"; Undo calls `settings:undo { changeId }` (BE-29). Undo has **no time limit**; it fails with `TOO_LATE` only when the value was changed again since (X-96).

### A.4 06 "Writes" column
Every "Writes" cell in 06-1/06-2/06-3 names a path from this section. The 06 row id stays the UI id; the path is the storage key. Row-id → path is 06 §0.13 plus the 06 Writes cells (not A.1).

---

## §B Shared TypeScript types (X-57)

File: `src/shared/types.ts` (types only, no runtime). zod schemas in `src/shared/schemas.ts` mirror it. **Every full field list is in this file, in `08-5-shared-types.md` or in the chapter section named in 08-5 §1; a review id in brackets (BE-01, AG-06, DB2-01…) is provenance only, never a definition (X-111).**

### B.1 Rows (DB → TS)
`ChatRow, MessageRow, CardRow, JobRow, StepRow, RoutineRow, RoutineRunRow, HelperRow, ConnectionRow, ApprovalRow, PaymentRow, ActivityRow, NotificationRow, SuggestionRow, MemoryFactView, DraftRow, FileRow, HeldItemRow, WaContactRow, WaMessageRow, SecretIndexRow` = the table's columns camelCased (§0), plus these derived fields:

| Type | Adds | Drops |
|---|---|---|
| `ChatRow` | `lastLine: string; lastTime: number; hasDraft: boolean; face: FaceRef; memberIds?: string[]; helper?: { id: string; color: string }` | — |
| `MessageRow` | `reactions: { emoji: string; by: 'me' \| string }[]` | `textForAi` (never leaves main/engine) |
| `JobRow` | `stepsDone: number; nowLine: string; slow: boolean` (`slow` = state `working` and no progress for 60 s) | `aiSessionId` |
| `RoutineDetail` | `= RoutineRow & { runs: RoutineRunRow[] }` | — |
| every row with `rev` | `rev: number` | — |

**`rev`** (X-57, BE-10/DB-08): `rev INTEGER NOT NULL DEFAULT 1` on chats, messages, cards, jobs, steps, routines, helpers, connections. Every UPDATE does `rev = rev + 1` in the same statement (enforced in `Store`). The renderer applies a patch only when `patch.rev > stored.rev`.

### B.2 Enums and unions (closed lists)

```ts
type ProviderId = 'claude-cli' | 'codex-cli' | 'gemini-cli' | 'openai-key' | 'anthropic-key' | 'google-key' | 'ollama' | 'fake';
type CostProviderId = ProviderId | 'openai-voice' | 'exa' | 'tavily' | 'firecrawl' | 'browseruse';
type Route = 'api' | 'browser' | 'screen' | 'email' | 'handback';   // 08-2 §8.1 rungs 1–5 in order: api = CONNECTOR, email = EMAIL (gmail.draft to the business, Art. 4 card), handback = HAND BACK (screen.open / job.needSignIn, no AI action); rungOf(route) = index 1–5 (X-125)
type ConnectorApp = 'gmail' | 'gcal' | 'contacts' | 'whatsapp' | 'x' | 'outlook';   // connections.app also allows 'hub'
type PermissionAction = 'read' | 'drafts' | 'calendar' | 'send' | 'book' | 'pay' | 'post' | 'delete' | 'share';
type PermissionApp = 'gmail' | 'calendar' | 'contacts' | 'whatsapp' | 'browser' | 'outlook';
type Verb = 'send' | 'book' | 'buy' | 'pay' | 'post' | 'delete' | 'add_calendar';            // lexicon + do_verbs (X-55)
type ApprovalVerb = 'send' | 'book' | 'buy' | 'pay' | 'post' | 'delete' | 'share' | 'switch' | 'use_app' | 'calendar_write';
type ApprovalState = 'PENDING' | 'APPROVED' | 'RUNNING' | 'COMPLETED' | 'HELD' | 'CHECKING' | 'DECLINED' | 'EXPIRED' | 'SUPERSEDED' | 'WITHDRAWN' | 'FAILED';  // exactly 07-1 §5 / 08-2 §9.1; DB-28: no 'unconfirmed', no 'ready'
type StopReason = 'user_word' | 'user_button' | 'stop_all' | 'window_closed' | 'stuck_stop' | 'choice_timeout' | 'signin_timeout'
  | 'approval_expired' | 'approval_declined' | 'helper_deleted' | 'chat_deleted' | 'wipe' | 'system';
type SecretKind = 'ai_key' | 'login' | 'card' | 'conn_token' | 'wa_session' | 'web_key' | 'hub_key' | 'user_key';   // user_key: CR-0057 (X-214)
type MemoryKind = 'person' | 'preference' | 'place' | 'fact';                                  // X-06
type MemoryScope = 'global' | 'chat' | 'helper';   // X-112: 'global' = memory/about-you.md, people/*, preferences/*; 'chat' = offered only in the chat it was learned in (stored in about-you.md with the brace token chat:{chatId}; memory_index.chat_id holds the id); 'helper' = helpers/{id}/notes.md. identity.md is a FILE, not a scope: its rows are scope='global', file='memory/identity.md'. Never 'identity', 'about', 'pref:*', 'people:*', 'helper:{id}'
type MemoryProvenance = 'said' | 'guessed';                                                     // labels "You said" / "I guessed"
type MemoryOrigin = 'chat' | 'gmail' | 'gcal' | 'whatsapp' | 'manual' | 'setup' | 'job';       // = MemorySource; labels chat, Gmail, Calendar, WhatsApp, you typed it, setup, a task
type MemoryCategory = 'food' | 'travel' | 'health' | 'money' | 'people' | 'places' | 'work' | 'style' | 'home' | 'family' | 'religion' | 'politics' | 'other';
type SearchFilter = 'all' | 'messages' | 'files' | 'jobs' | 'routines' | 'memory';
type SettingsPage = 'account' | 'appearance' | 'notifications' | 'permissions' | 'money' | 'privacy' | 'routines-settings' | 'connections' | 'chat' | 'shortcuts' | 'about';
type WindowsSettingsPage = 'notifications' | 'privacy-microphone' | 'startupapps' | 'signin' | 'storagesense' | 'dateandtime';   // → ms-settings:notifications, privacy-microphone, startupapps, signinoptions, storagesense, dateandtime (A-1)
type BadgeValue = 'seen' | 'working' | 'waiting' | 'done' | 'done_unverified' | 'failed' | 'stopped';   // §F
type NotificationKind = 'choice' | 'approval' | 'payment' | 'signin' | 'done' | 'routine' | 'brief' | 'stuck' | 'error' | 'reply' | 'reminder' | 'summary';
type CardType = /* §G.1, 27 values */ string;
type ConnectVariant = 'google' | 'whatsapp' | 'outlook' | 'one_app' | 'allow_send' | 'contacts_only';   // ConnectPayload.variant, 08-5 §4.1 (X-127)
type SetupCard = 'welcome' | 'ai_finder' | 'name' | 'face' | 'apps';   // card type 'setup' (X-119; 'whatsapp_link' withdrawn, Card E is the Connect card, X-139)
// Phase 3a additions (X-90)
type ApprovalDraftVerb = 'book' | 'buy' | 'pay' | 'delete';      // what the AI may request (B-10, X-125: 'send' removed — every outbound message reaches the user only through gmail.draft / whatsapp.draft / x.draft and its Draft card, §G.7); share, switch, use_app, calendar_write are engine-created; post is locked never in v1
type AiPurpose = 'chat' | 'intake' | 'step' | 'repair' | 'second_look' | 'memory_review' | 'tidy' | 'routine' | 'brief' | 'verify' | 'classify'
  | 'rewrite' | 'voice' | 'web' | 'hub' | 'catch_up' | 'read_attachment';   // = ai_turns.purpose (B-6, G2); no 'transcribe_fallback'; 'chat' is reserved and never written in v1: every chat-lane turn is 'intake' (X-126)
type WaitingReason = 'ai_offline' | 'ai_down' | 'ai_signed_out' | 'ai_limit' | 'spend_cap' | 'net_offline' | 'asleep' | 'app_quit' | 'windows_shutdown' | 'opens_at';   // no 'slot' (G1-1)
type NotificationDelivery = 'toast' | 'held_quiet' | 'held_quiet_item' | 'held_budget' | 'merged' | 'suppressed_focus' | 'suppressed_muted' | 'suppressed_off' | 'summary';   // C-1; 'suppressed_budget' removed (over-budget items are held, X-94)
type HeldItemKind = 'routine_fire' | 'habit_offer' | 'helper_offer' | 'stale_routine' | 'away_notice' | 'memory_conflict' | 'cap_80' | 'brief_kind_stop' | 'suggestion';
type SuggestionKind = 'helper_offer' | 'habit_offer' | 'routine_offer' | 'connector_offer' | 'brief_kind_stop' | 'memory_conflict' | 'memory_share'
  | 'stale_routine' | 'save_login' | 'read_codes' | 'voice_key';     // §G.13; 'routine_suggest' is not a kind (X-106)
type RoutineBuiltin = 'morning_brief' | 'memory_tidy' | 'pnr_watch' | 'recharge_due' | 'bill_watch';   // bill_watch: J11's on_email bill trigger, 08-3 §13.3 (X-115); task_spec.builtin is 08-5 §4.3 BuiltinTask
type RoutineCreatedFrom = 'asked' | 'habit' | 'suggested' | 'builtin' | 'idea';     // 'idea' is prompted like 'asked'
type BriefActionLabel = 'Open' | 'Review' | 'Show me' | 'Remind me' | 'Add to calendar' | 'Draft a reply';   // C-8; a brief button never pays
type BannerType = 'offline' | 'ai_not_answering' | 'ai_signed_out' | 'ai_cap' | 'plan_limit' | 'notifications_blocked' | 'update_ready';   // priority order, 03 §3.3.2 (D-2)
type ComposerBannerType = 'mic_blocked' | 'no_mic' | 'mic_busy' | 'helper_paused';    // D-3
type TickState = 'waiting' | 'sent' | 'delivered' | 'read' | 'not_sent';            // renderer view value derived from messages columns (D-3)
type RoundButtonState = 'disabled' | 'save_edit' | 'send_voice' | 'recording' | 'send' | 'stop' | 'mic';   // composer-send, order of 04-2 §21.2 checks (D-4)
type Mood = 'resting' | 'waking' | 'noticed' | 'listening' | 'thinking' | 'working' | 'stuck' | 'needs_you' | 'waiting' | 'happy' | 'celebrating'
  | 'thumbs_up' | 'heart' | 'speaking' | 'sorry' | 'stopped' | 'offline' | 'asleep';   // src/shared/face.ts, 02-2 §F15.9.3 order (D-11)
type ScreenId = /* the {slug} of every 06 `screen-{slug}` id, plus 'ideas' (12-1 §12.24.3); generated into src/shared/testids.ts */ string;
type DialogId = `c-${string}` /* 'c-01'…'c-26', 'c-13b' */ | 'new-helper' | 'new-group' | 'privacy' | 'type-amount' | 'whats-new' | 'restart' | 'report' | 'shortcuts' | 'replace-key' | 'add-card' | 'add-upi' | 'dismissed-suggestions' | 'hold-to-talk' | 'licences' | 'helper-limit' | 'link-whatsapp' | 'unreadable-lines' | 'template-replace';   // = §C.3 dialog families (X-118)
type View = { kind: 'chat'; chatId: string } | { kind: 'settings'; page: SettingsPage; row?: string } | { kind: 'screen'; id: ScreenId; params?: Record<string, string> };   // FE-06 (D-8)
type ProofKind = 'confirmation' | 'email' | 'sent_folder' | 'wa_delivered' | 'calendar_event' | 'emails_read' | 'read_source' | 'screenshot' | 'receipt';   // 08-2 §5.8 + read_source (G2-8)
type ChoicePurpose = 'job' | 'setup' | 'memory_confirm' | 'app_use' | 'stop_which' | 'conflict' | 'file_in' | 'photo_notice';   // §G.1
type RoutineOfferSource = 'habit' | 'idea' | 'after_job';           // G1-3
type BillSource = 'gmail' | 'whatsapp' | 'chat' | 'photo' | 'file' | 'biller_site';
```

Sensitive categories (`health, money, religion, politics, family`) are private by default (R-33); the engine forces `private = true` and `provenance` check, never the AI (AI-06/AG-12).

### B.3 Envelope and IPC payload types
Field lists are the cited proposals; names are fixed here.

| Type | Shape (key fields) | Source of full text |
|---|---|---|
| `PlanStep` | `{ phraseKey: string; slots: Record<string,string>; route: Route }` | AG-06 |
| `ChoiceCardSpec` | AI gives `{ question; options: { label; detail? }[]; multi?; reversible? }`; the engine assigns ids `o1…o4`; option 1 is Best fit; `reversible` is decided by the engine (AG-11) | AI-02 P-02 |
| `CardAnswer` | `{ optionId } \| { optionIds } \| { text } \| { skip: true }` | AG-06 |
| `RoutineDraft`, `RoutinePatch`, `Condition`, `Schedule`, `FastPath`, `RoutineTask` | 08-3 §13.2 is the single schema (`RoutineTask.builtin?: BuiltinTask`, 08-5 §4.3; `RoutineDraft.urgentText?` per X-131) | 08-3 §13.2 |
| `RoutinePatch` | `{ routineId: string } & Partial<Pick<RoutineDraft, 'title' \| 'whatText' \| 'task' \| 'schedule' \| 'tz' \| 'conditionText' \| 'whereChatId' \| 'deliverToast'>>` | C-12 |
| `RoutineStepAct` | `<act>` of `purpose:'routine'`, decision kind `routine_result`, with `observed?: { metric: Condition['metric']; value: string \| number; unit?: string }` | 08-3 §13.2/§13.4 (C-13) |
| `HandoffNote` | `{ done: string[]; proof: Proof[]; open: string[]; nextOwner: string }` | AG-06 |
| `ApprovalDraft` | `{ verb: ApprovalDraftVerb; fields: ApprovalFields; evidence: { field: keyof ApprovalFields; toolCallId: string; quote: string; ref?: string }[] }` (`quote` ≤ 200 chars verbatim; `ref` = snapshot element) | AI-03 P-03, 08-4 §25.1 (B-1, B-10) |
| `ToolCall` | 08-4 §25.1 (`idemKey` added by the engine per 08-5 §7, X-113) | 08-4 §25.1 |
| `SecondLookResult` | `{ at: number; deterministic: { ok: boolean; mismatches: string[] }; ai?: { ok: boolean; note: string }; turnId?: string; held?: { field: 'recipient' \| 'amount' \| 'date' \| 'time' \| 'item' \| 'people' \| 'place'; userSaid: string; actionHas: string } }` | AI-16, 08-4 §28.4 (B-2) |
| `BriefItem`, `BriefKind`, `BriefCandidate`, `BriefAct` | as 08-3 §14.3 / §14.7; labels are `BriefActionLabel` (§B.2) | AG-18, C-8 |
| `BriefAction` | `{ kind: 'open_chat'; chatId: string; cardId?: string } \| { kind: 'start_job'; chatId: string; text: string } \| { kind: 'remind'; at: number }` | C-8 |
| `AiStatus`, `SpendSummary`, `CostLine`, `SetupState`, `DetectRow`, `ReadinessResult`, `VerifyResult`, `RawAiError`, `HelperForm`, `Rule`, `ContactHit`, `DraftFields`, `Attachment`, `PaymentMethodView`, `SearchHit`, `SearchResults`, `MemoryFactView`, `MemoryFilter`, `MemoryChip`, `LogLine`, `UiEvent`, `PublicSettings`, `Bootstrap`, `HeldItemPayload`, `StopReport` | full shapes in **08-5 §3** (X-111) | 08-5 |
| `PasteCatch` | `{ start; end; kind; mask: '••••' }` (mask is always exactly "••••"; full shape 08-5 §3.4) | 04-2 §22.4 |
| `View`, `FaceRef` | §B.2 / §E.7 | — |
| `MemoryCmd` | withdrawn (X-111): the Memory page uses the `memory:*` invokes of 08-1 §3.2 | — |
| `FixAction` | the closed union in **08-5 §3.7**; 08-3 §21.2's "One button" column names the kind per row; the AI may fill only `retry`, `open_url`, `dismiss` | 08-5 §3.7 |
| `MemoryReviewAct` | `ops[]` of `{ op:'add'; scope: MemoryScope; text (≤ 120); provenance: MemoryProvenance; evidenceMessageIds: string[]; reason?: string; category: MemoryCategory; kind: MemoryKind; person?: string; private: boolean }` \| `{ op:'update'; factId; text; evidenceMessageIds }` \| `{ op:'nothing' }`; **08-3 §12.4 is authoritative** for this type and its placement rules; no `source: 'you_said' \| 'i_guessed'` anywhere; the step tool `memory.propose` (08-2 §8.2) takes the same object as one `add` op (X-112) | 08-3 §12.4 |
| `GroupIntakeAct` | `{ decision: { kind: 'group_route'; ownerHelperId: string; parts: { helperId: string; task: string }[] } \| { kind: 'reply'; helperId: string }; usedMemoryIds: string[] }`: the intake `<act>` when the chat kind is `group` (`IntakeAct` stays the 1:1 schema) | 08-3 §17.3.1 (C-7, X-107) |
| `GroupMemberAct` | `{ decision: { kind: 'reply' } \| { kind: 'react'; emoji: string } \| { kind: 'handoff_accept'; task: string } }`: a non-owner member's turn in a group | 08-3 §17.3.2 (C-7) |
| `CatchUpAct`, `CatchUpPayload` | exactly 12-2 §12.27.5 | G2-4 |
| `PaperRead` | exactly 12-2 §12.28.3 step 2 | G2-5 |
| `Proof` | 08-2 §5.8 union plus `{ kind: 'read_source'; app: 'whatsapp' \| 'gmail'; sourceKey: string; label: string; count: number; since: number; until: number }` | G2-8 |
| `BillPayload`, `TablePayload`, `FilePayload`, `LinkPreviewPayload`, `PlacePayload`, `ConnectPayload`, `SetupCardPayload` | full shapes in **08-5 §4.1** (X-115, X-127, X-119); 05-3 §5.29.1 / §5.22–§5.24 / §5.11.2 and 12-1/12-2 only say what each field draws | 08-5 §4.1 |
| `RoutineOfferPayload` | 05 §5.14 payload plus `source: RoutineOfferSource`; `idea` uses the 12-1 §12.24.5 layout and writes no `suggestions` row; `after_job` is one sentence + two buttons under a job result and is keyed in `suggestions` | 05-3 §5.14 (G1-3) |
| `RoutineDraftTemplate`, `BuiltinTask` | 08-5 §4.3 | 08-5 |
| `ChoicePayload` | 05 §5.3 payload plus `purpose: ChoicePurpose`, `aiReversible: boolean` (what the AI said) and `reversible: boolean` (the engine's effective value) | B-9, G2-3 |
| `StateJson` (`jobs\{id}\state.json`) | 08-1 §4.1.2 fields plus `workingMs: number` (WORKING wall time; NEEDS_YOU/WAITING excluded) and `aiEstimate?: { minutes?: number; tokens?: number }` (display only) | B-4 |
| `StopReport` | `{ jobId: string; done: ActivityRow[]; nothingDone: boolean }` | A-2 |
| Other shared types (names fixed, shapes in the cited §) | `NotificationRequest`, `VaultUseRequest`, `CardPayload` (08-1 §4.5), `ApprovalFields` (08-2 §9.3); `DbOp`, `WritableTable`, `HardDeletable`, `NamedQuery` (08-1 §2.4.1); `MainToEngine`, `EngineToMain` (08-1 §2.4); `EngineToBridge`, `BridgeToEngine` (08-1 §2.4.2); `ui`/`live` slice field types (§G.10); data slices (08-5 §5). `src/shared/ipc.ts` holds `Invokes` and `Events`; `IpcTimeoutError` is renderer-only (`src/renderer/ipc/`) | A-2 |
| `ErrorKind` | closed union = exactly the three lists of 08-3 §21 (§21.2 user-facing, §21.3 renderer-handled, §21.4 internal) and nothing else (X-70, X-120). Spellings: `PROTOCOL_INVALID` (never `AI_PROTOCOL_INVALID`), `NET_OFFLINE` (never `AI_OFFLINE`); `SITE_*` / `CONN_*` are written out literally; `INSTALL_FAILED` removed (X-42). Lint `foo/error-kind-closed` | 08-3 §21 |

### B.4 Display names (X-78, AI-27)
| ProviderId | On screen |
|---|---|
| claude-cli | Claude |
| codex-cli | ChatGPT |
| gemini-cli | Gemini |
| openai-key | OpenAI key |
| anthropic-key | Anthropic key |
| google-key | Google key |
| ollama (and LM Studio through openai-key with a localhost base URL) | AI on this PC |
| fake | Test AI |

### B.5 Event-name collisions (X-57, BE-42)
Rename: `ai:detect` (event) → `ai:detectRow`; `data:export` (event) → `data:exportProgress`; `data:wipe` (event) → `data:wipeProgress`. `ai:install` (both) is removed (X-42). No event channel may share a string with an invoke channel (contract test).

### B.6 Round-2 IPC additions (X-124; shapes in 08-1 §3.2/§3.3 and §2.4)
Invokes: `activity:list`, `activity:saveCsv`, `spend:month`, `suggestions:listDismissed`, `files:list`, `routine:ideaStatus`, `message:get`; `data:deleteOlderThan` gains `dryRun?: true`. Events: `face:raster { faceRef, size: 16 | 20 | 24 | 32 | 48, mood, png }` (renderer → main through `FooBridge.send`, 02-2 §F15.9.9, X-135). `MainToEngine`: `job.retry { jobId }`, `job.handBack { jobId }` (no `mode`, X-135), `signin.skip`, `routine.cmd`, `routine.startIdea`, `webkey.check`. `EngineToBridge`/`BridgeToEngine`: `wa.onWhatsApp` / `wa.onWhatsApp.result`, `wa.readRecent.result`. There is no `routine:create` invoke (X-135). `NamedQuery` additions: `jobs.liveForChat`, `cards.openForChat`, `notifications.countToday`, `helpers.byId`, `group_members.forChat`, `held_items.forChat`, `brief_feedback.recent`, `wa_contacts.byTitle`, `files.byId`, `routine_runs.latestObserved`. Engine-only tool `gmail.trash { messageId }` (class `delete`, never listed to the AI, X-125).

---

## §C `data-testid` scheme (X-58)

1. Format: kebab-case `{area}-{element}[-{variant}]`. Areas: `app, titlebar, sidebar, chatlist, chat-header, thread, bubble, composer, card, dialog, settings, screen, search, memory, routines, spend, activity, profile, banner, tray-menu, live, signin-banner, setup, toast-preview`. FE-01 draft areas map onto these exactly as addendum D-1 (`chat-row` → `chatlist-row`; `badge-{value}` → `bubble-badge` + `data-state`; `find-*` → `thread-find-*`; `right-section-*` → `app-panel-*`; `banner-{type}` → `banner-strip` + `data-state`; `composer-mic` dropped, it is `composer-send` + `data-state`; `dialog-{C-nn}` → `dialog-c-{nn}`).
2. Ids are static. Dynamic identity is carried in data attributes, never in the id: `data-chat-id`, `data-message-id`, `data-card-id`, `data-card-type`, `data-card-state`, `data-index`, `data-row-id`, `data-state`.
3. Fixed families: settings rows `settings-row-{page}-{rowId}` (06 row id), `settings-nav-{page}`, `settings-search`; dialogs: a confirm's root is `dialog-c-{nn}` (06-3 §14, two digits, optional one-letter suffix: `dialog-c-13b`); every other Dialog's root is `dialog-{slug}` with the slug from this closed list only (X-118): `new-helper`, `new-group`, `privacy`, `type-amount`, `whats-new`, `restart`, `report`, `shortcuts`, `replace-key`, `add-card`, `add-upi`, `dismissed-suggestions`, `hold-to-talk`, `licences`, `helper-limit`, `link-whatsapp`, `unreadable-lines`, `template-replace` (the first-run "Monthly AI cap" dialog is C-21 → `dialog-c-21`); `dialog-message-delete`, `dialog-messages-delete`, `dialog-open-link` are not ids (X-102: those are C-24…C-26); inside every dialog `dialog-close`, `dialog-primary`, `dialog-secondary`, `dialog-confirm-field`; screens `screen-{slug}` and their parts `screen-{slug}-{element}`; cards `card-{type}` (type in kebab: `card-routine-offer`, `card-catch-up`) with buttons `card-{type}-{action}` (e.g. `card-approval-approve`, `card-approval-change`, `card-approval-not-now`) and parts `card-{type}-{part}`; FE-01's generic `card-primary/secondary/tertiary` are withdrawn (E-2). The Live window uses area `live` (`live-root`, `live-bar`, `live-pill`, `live-picture`, `live-take-over`, `live-control-bar`, `live-hand-back`, `live-stop`; 06-3 §11.2 is the list, 09 §9.27 adds none, X-121); the docked banner uses `signin-banner`, `signin-banner-address`, `signin-banner-done`, `signin-banner-success`, `signin-banner-hand-back` with `data-state` ∈ `waiting`, `in_control`, `signed_in` (05-3 §5.10.3 is the list; no `signin-banner-stop`, X-121). `live-view-*` and `live-window-*` are not ids (the in-panel live view is withdrawn, §G.8). New data attribute `data-purpose` on `card-choice` (= `choice.purpose`, G2-6). Setup cards: `card-setup` with `data-row-id` = `setupCard` (X-119). Chat list: `chatlist-filters` (the radiogroup), `chatlist-row` carries `data-chat-kind`; WhatsApp mirror bubbles `bubble-wa` with `data-from-me` (X-128). Backup-AI mark `bubble-backup-mark`; replay `screen-viewer-replay-bar`, `screen-viewer-replay-step` (`data-index`); plan card `card-plan-show-all` (X-128, X-131). Round-2 additions (X-138, X-140, X-141): `card-connect-allow-send` (the Connect card's Allow-send button, split from `card-connect-connect`, X-127), `card-secret-open-money` (`SECRET_EXISTS` line's button), `screen-ideas-on` (Ideas page "On" pill), `app-panel-doing-open` (right-shell Doing-now "Open the window" button). First-run Card E is `card-connect` with `data-row-id="E"`; its QR panel is `setup-whatsapp-link` (X-139).
4. The registry `src/shared/testids.ts` (`export const TID = { … } as const`) is compiled from these lists, which together are the only source: 02-3 §F32.2 (02/03/04 ids), the Test id columns of 05-cards-1…3 and 06-screens…06-3 (E-1), 09 §9.27 (C-11), 12-1 §12.24–§12.26 test-id lines (G1-7) and 12-2 test-id lines (G2-6); FE-01 is superseded where these differ. An id used in a chapter but missing from these lists is a GAPS line. A string literal in `data-testid=` in a component is a lint error (`foo/testid-from-registry`). Test-only IPC channels (`test:*`, e.g. `test:sendTo { paths: string[] }`) exist only in `FOO_TEST=1` builds (08-3 §22.8).
5. Component state is exposed as `data-state="{value}"` using the §G/§F enum values (FE-34). Class names are never test hooks.
6. Every element table in 03, 04, 05 and 06 gains a "Test id" column filled from the list (fixers D and E).

---

## §D Copy storage (X-59)

| Item | Value |
|---|---|
| File | `src/shared/copy/en-IN.json`, one flat JSON object |
| Key | `{area}.{component}.{slot}[.{state}]`, each segment `lower_snake`; areas = the §C areas with `-` → `_` (`chat_header`, `signin_banner`, `tray_menu`, `toast_preview`) except that card copy uses **`cards`** (plural; B-7, X-105), plus `errors`, `notifications`, `memory_chip`, `tray`, `jumplist`, `activity`. Chips that are not cards: `cards.proof_chip.*`, `cards.not_live_chip.*`, `memory_chip.*` (05-1 §0.4). Lines foo posts in a thread that are not cards: `thread.{slug}.*`. Engine copy keys are listed in 08-4 §31 |
| Format | ICU MessageFormat via `intl-messageformat` 10.x, exact version pinned at M0 (plural, select, `{amount, number, ::currency/INR}` is NOT used: money is pre-formatted by `formatInr()`) |
| Lookup | `t(key, vars?)` from `src/shared/copy/t.ts`; same function in renderer, main and engine |
| Lint | `foo/no-literal-copy` (no user-visible literals in JSX, toasts, tray, dialogs); `scripts/check-copy.ts` checks every key exists, every `{var}` is supplied, no unused keys, banned-word scan (Art. 2) |
| Language | Fixed copy is English (en-IN) in v1 (X-51). Only AI-written text mirrors the user's language. |
| Fidelity | 11-fidelity `COPY-{chapter}-{line}` keys are superseded by these keys; 11 maps each quoted string to its key. |
| Dialog keys | Confirms: `dialog.c_{nn}.{title\|body\|body_{variant}\|primary\|secondary\|field_label}` (04 owns C-24…C-26's words, 06-3 §14 the numbers); other Dialogs: `dialog.{slug}.{slot}` with the §C.3 slug, `-` → `_` (e.g. `dialog.type_amount.title`). The Windows Hello lines are `dialog.type_amount.*` (the typed-amount dialog) and `cards.payment.hello.*` (lines on the Payment card); `settings.security.*` is not a family (X-118). |
| Round-2 keys (X-141) | `thread.group.no_part`, `thread.catch_up.not_connected`, `thread.ideas.medicine_line`, `thread.bills.watch_stopped`, `thread.brief.remind.{bill,birthday}`, `thread.wa_mirror.{retention,draft_made,open}`, `bubble.backup_mark.{text,accessible_suffix}`, `cards.brief.item.reminder_set`, `cards.bill.footer.reminded_on` (never `reminded_at`), `cards.bill.no_due_date`, `cards.plan.show_all`, `cards.secret.line.exists`, `cards.draft.line.{wa_cant_check,wa_daily_limit}`, `screen.ideas.pill.on`, `screen.routines.builtin.bill_watch`, `settings.connections.row.not_allowed_yet`, `settings.connections.button.allow`, `settings.connections.web.switch_to`, `dialog.type_amount.{not_set_up,set_up_link}`, `dialog.c_26.*`, `notifications.private.body` (never `notifications.private_chat.body`), `errors.validation.on_email_match`, `errors.conn_scope_missing.{line,button}`, `errors.not_found.line`, `errors.{site_changed,site_timeout,conn_revoked,conn_rate_limited}.{what_happened,what_is_safe,button}` (words in 08-3 §21.2). Owners as X-141. |
| Not copy | AI prompts live in `resources/prompts/*.md` (08-4 §24; round 2 adds `group_intake.md`, `group_member.md`, X-141) and are not in the copy file. Copy strings hold no HTML; emphasis is a `{strong}` placeholder rendered by the component (02-3 §F30.4). |

---

## §E Paths, files and packages (X-60)

### E.1 Tokens (F29 wins over foo-plan)
`design/tokens.json` (source) → generated `src/renderer/styles/tokens.css` and `src/shared/tokens.ts`; `design/tokens.paper.json` for the Paper export (F29.4). There is no `motion.ts` and no `renderer/tokens/`. Motion tokens are in the same files. Component-local px (one component only) stays in that component's `.module.css` with a `/* local: 03 §… */` comment (F29.5, X-23).

### E.2 Native addon (X-60, BE-09/INT-13)
One addon: **`foo-native`** at `native/foo-native/`, built with node-gyp, loaded as `require('foo-native')` in main only. Sources: `jobobject.cc, hello.cc, speech.cc, netcost.cc, toasthistory.cc, toastsetting.cc, textscale.cc, keyboard.cc, focus.cc, wintrack.cc, ocr.cc`. Exported functions are **the literal list in 08-5 §6** (X-111), which includes: `trackWindow(hwnd: number, cb: (e: { x: number; y: number; width: number; height: number; minimized: boolean; foreground: boolean; destroyed: boolean }) => void): number`, `untrackWindow(id: number): void`, `findWindowByPid(pid: number, titlePrefix?: string): number | null` (`wintrack.cc`, C-10); `ocrRead(path: string): Promise<OcrResult>` and `blackout(inPath: string, outPath: string, rects: { x: number; y: number; w: number; h: number }[]): Promise<void>` (`ocr.cc`, Windows.Media.Ocr + WIC, §G.18), with `OcrResult = { status: 'ok' | 'unavailable' | 'failed'; lang?: string; lines: { text: string; words: { text: string; x: number; y: number; w: number; h: number }[] }[] }`. Every export has a JS fallback that returns "unsupported" (`ocrRead` → `status: 'unavailable'`) so the app runs without it.

### E.3 Renderer layout
`src/renderer/` uses CSS Modules and no router library. Folders: `ui/` (primitives, one `.tsx` + `.module.css` each, exactly: Button, IconButton, TextField, TextArea (multi-line field, auto-grow `rows` prop), Checkbox, Radio, Toggle, Segmented, Chip (`size: 'sm' (32) | 'lg' (40)`, `selected`, optional `onRemove` → `IconButton xs`), Dropdown, Tooltip, Menu, Dialog, ToastPreview (the 09 §9.9 notification preview; never "Toast-preview"), Pill, Stepper, Meter, Avatar, Face, Icon, Spinner, Skeleton, Banner, Kbd (key cap, 06-2 §6.10), EmptyState (06 §0.5 block, `data-state` first_time/empty/filter_empty), UndoBar (02 §F21.3), Presence (02 F7) — X-119; screen composites SettingsRow, RowGroup, SectionLabel, PageHeader, PageSearchField live in `screens/shared/`), `cards/` (`registry.ts` = `Record<CardType, Component>`), `screens/`, `screens/settings/{Pascal(id)}Page.tsx` (`routines-settings` → `RoutinesSettingsPage.tsx`), `store/`, `ipc/`, `windows/` (`live.html`, `viewer.html`, `signin-banner.html`, `pdfraster.html` §G.18), and the composite folders `shell/`, `messages/`, `composer/`, `a11y/`, `icons/custom/` with the file names of 02-3 §F32.4, `ui/Presence` (02 F7) as a primitive, and `public/theme-boot.js` (02-3 §F28.1) (D-12). `cards/registry.ts` also exports `CARD_ESTIMATE: Record<CardType, number>` (02-2 §F13.3, D-9).

Card component files: `Brief, Checklist, Choice, OptionTiles, Approval, Payment, Bill, Draft, SecretBox, SignIn, Connect, Plan, RoutineCreated, RoutineSuggestion, Stuck, ErrorCard, SpendCap, TableCard, FileCard, LinkPreview, JobLink, PlaceCard, FaceExplainer, CatchUp, SetupCard` (`.tsx` + `.module.css`; `SetupCard` switches on `payload.setupCard`, X-119). `messages/` also holds `ProofChip.tsx`, `NotLiveChip.tsx`, `MemoryChip.tsx`, `HandoffMarker.tsx`, `ReceiptFooter.tsx` (02-3 §F32.4 lists them, X-119).

**Primitive props (X-119; 02-3 §F32.4 is the owner, 05 §0.3 and 06 §0.4 point there):** `IconButton size: 'xs' (24 visual: chip remove, strip close) | 'sm' (32: hover toolbar, action row) | 'md' (36, `--icon-btn`: shell headers, page headers, dialogs, the default) | 'lg' (40: inside cards, 05 §0.3)`; hit area always padded to 40×40; icon 20px except `xs` 16px; hover/pressed shape `--r-full`, `--r-sm` only with the `inField`/`inCell` prop. `TextField size: 'sm' (36 = --field-h: cards, left-shell search, page search and find fields) | 'md' (40: pages and dialogs, the default)` and `shape: 'field' (--r-sm) | 'search' (--r-full, Search 16 icon, no border)`; `size` and `shape` are independent.

### E.4 Load URL and CSP (FE-22)
Production loads `app://foo/index.html` (custom protocol registered privileged before ready). Dev loads `http://localhost:5173` only when `FOO_DEV=1`. Vite `base: './'`. The CSP, the same in both modes, is `default-src 'self' app:; img-src 'self' app: data: blob:; style-src 'self' 'unsafe-inline'; connect-src 'none'` (08-1 §1.2.1 is the source; `connect-src` has no remote host). X-180 (CR-0022) adds `frame-src foo-page:` for AI pages (04 §13.6); main registers `foo-page` as a privileged scheme beside `app`. Nothing else in the CSP changes.

### E.5 Resources (`resources/`)
`pricing.json`, `prompts/*.md`, `handback-sites.json`, `no-capture-hosts.json`, `web-tools.json`, `maker-pages.json`, `google-oauth.json`, `voice-pack.json` (`{ url, sha256, bytes, version }`), `ideas.json`, `billers.json`, `rail-rules.json`, `hub-manifests/{slug}.json` + `hub-manifests/_hub.json` (v1.1, 08-3 §16.8.1). Formats: owning fixer (B for prompts/handback/no-capture/web-tools/pricing/billers/rail-rules, C for voice-pack/google-oauth/hub-manifests, E for maker-pages/ideas). Every file is validated by zod at load; a file that fails is a startup error logged to the tech log and the feature that needs it shows its error state.
- `pricing.json`: format 08-4 §30.2; the model ids in it are a **seed, re-pinned at M0 and again at release** together with the prices (08-4 §30.1, X-101).
- `maker-pages.json` (E-6): `{ [p in 'claude-cli' | 'codex-cli' | 'gemini-cli' | 'ollama']: { name: string; maker: string; url: string /* https only */ } }` (Claude/Anthropic, ChatGPT/OpenAI, Gemini/Google, Ollama/Ollama `https://ollama.com/download`); LM Studio is reached through `openai-key` and has no row or link (X-124); read only by `app:openExternal` target `maker_page`; URLs filled at the M3 spike.
- `ideas.json` (G1-3; content and order = 12-1 §12.24.4): `{ id: string; chip: 'money' | 'travel' | 'home' | 'family' | 'fun'; icon: string /* Fluent Regular name */; titleKey: string; lineKey: string; needs: null | 'gmail' | 'google' | 'irctc'; ownerTemplate: 'trips' | 'money' | 'home' | 'family' | null /* null = foo */; asks: { kind: 'pnr' | 'url' | 'price' | 'number' | 'date' | 'text' | 'choice'; questionKey: string; options?: string[] }[]; routine: RoutineDraftTemplate | { builtin: 'pnr_watch' | 'recharge_due' } }[]` (`RoutineDraftTemplate` = 08-5 §4.3; the ten non-builtin task prompts are 12-1 §12.24.4, verbatim).
- `billers.json` (G1-2; seed = 12-1 §12.26.2, B verifies each domain before M15): `{ slug: string; name: string; kind: 'mobile_prepaid' | 'dth' | 'fastag' | 'gas_cylinder' | 'broadband' | 'electricity'; domains: string[]; payUrl: string; idLabel: string; idPattern: string /* regex */; needsSignIn: boolean }[]`. A domain the user confirms is kept in `sites\{domain}.md` as "biller: {name}", never written back.
- `rail-rules.json` (X-108; the values below are binding; provenance `review/rail-facts.md`, verified 2026-10-16): `{ version: string; verifiedOn: 'YYYY-MM-DD'; refundRulesUrl: string; arp: { days: 60; opensAt: '08:00'; tz: 'Asia/Kolkata'; openingDayAadhaarOnly: true }; tatkal: { opensDaysBefore: 1; acOpensAt: '10:00'; nonAcOpensAt: '11:00'; tz: 'Asia/Kolkata'; acClasses: string[]; nonAcClasses: string[]; aadhaarVerifiedAccount: true; aadhaarOtp: true; confirmedRefund: false }; cancel: { flatPerPassengerPaise: Record<'1A' | 'EC' | '2A' | 'FC' | '3A' | '3E' | 'CC' | 'SL' | '2S', number>; gstOnAcPct: number; slabs: { minHoursBefore: number; deduct: 'flat' | { pctOfFare: number } | 'all' }[]; clerkagePaise: { default: number; '2S': number } } }`. Seed: flat 1A/EC 24000, 2A/FC 20000, 3A/3E/CC 18000, SL 12000, 2S 6000; GST 5 on AC; slabs `[{72,'flat'},{24,{pctOfFare:25}},{8,{pctOfFare:50}},{0,'all'}]` (25 %/50 % never below the flat charge); clerkage 6000 / 2S 3000. Every refund foo computes from it is labelled an estimate.

### E.6 Folders and test overrides
`{DATA}` = `%APPDATA%\foo`, `{LOCAL}` = `%LOCALAPPDATA%\foo`, `{OUT}` = `settings.files.outputFolder`. Test overrides: `FOO_DATA_DIR`, `FOO_LOCAL_DIR`, `FOO_OUT_DIR`; a test run (`FOO_TEST=1` build) without all three refuses to start (X-96). `FOO_FAKE_AI` selects the fake provider. `FOO_TEST_ALLOW_HOSTS` (comma-separated hosts, honoured only in `FOO_TEST=1` builds) lets those hosts bypass the localhost/private-range block of `browser.open` and `web.fetch` (B-5, 08-4 §27.6). Avatars: `{DATA}\avatars\{chatId}.png`.

### E.7 Ids, FaceRef, safeName (X-75)
Ids are `{prefix}_{UUIDv7}` with the 08-1 §0.6 prefix table (adds `tc_` tool_calls, `rr_` routine_runs, `act_` activity, `nt_` notifications, `cn_` connections, `sg_` suggestions, `dr_` drafts, `ap_` approvals, `py_` payments, `hi_` held_items, `fl_` files, `bf_` brief_feedback, `bill_` BillPayload.billId). `FaceRef` grammar (08-1 §0.6): `living:{style}` \| `glyph:{emoji}` \| `letter:{one grapheme, upper-cased where the script has case}` \| `file:{chatId}` (08-5 §2, X-111). `safeName()` (08-1 §0.7.1, `src/shared/safeName.ts`): replaces `:`, `·`, reserved names, trailing dots, ≤ 120 chars; face raster files are `{safeName(faceRef)}-{size}-{mood}.png` (X-135). The user's own default face is `letter:` + the first grapheme of `user.firstName` (06-1 §2.4 "The user's own face"). `canonicalJson` = RFC 8785 in `src/shared/canon.ts`; `nonce` = 32 lower-case hex (08-5 §7, X-113).

### E.8 Vault names (X-73, BE-27/INT-09)
Credential Manager target = `foo/{kind}/{name}` with the BE-27 table: `foo/ai_key/{providerId}`, `foo/conn_token/google` (one row shared by gmail, gcal, contacts — the connections rows carry the same `vault_name`), `foo/conn_token/outlook`, `foo/web_key/{exa|tavily|firecrawl|browseruse}`, `foo/hub_key/composio`, `foo/login/{host}`, `foo/card/{last4}`, `foo/user_key/{name}` (CR-0057, X-214: a key or password the user names in the Secret box; `{name}` is the typed name, 1 to 40 characters with a letter or digit in any script, made safe by 08-1 §0.7.1 `safeName`, lower case, spaces and dots → `-`, symbols trimmed from both ends ("@work key" → `work-key`); `secrets_index.label` is the name as typed). WhatsApp session: safeStorage file `{DATA}\vault\wa-session.bin`. **No vault name contains a space; the only pattern is `foo/{kind}/{safeName}`.** The OpenAI key is one `ai_key` entry, `foo/ai_key/openai-key`, shared by voice (X-43) and the `openai-key` provider; X-43's older spelling "`foo/OpenAI key`" means this entry (X-114). Two cards with the same last 4 → `SECRET_EXISTS` (X-129).

### E.9 `src/shared/` file set (X-111)
`types.ts`, `schemas.ts`, `ipc.ts` (never `ipc-contract.ts`), `settings.ts`, `settingsDefaults.ts`, `testids.ts`, `badges.ts`, `face.ts`, `format.ts` (`formatInr`, `formatTime`, `formatDate`, 02-2 §F19; never `money.ts`/`time.ts`), `redactor.ts`, `canon.ts`, `handback.ts` (the one `handback.check(url)` matcher, 08-4 §27.4), `errors.ts` (`FooError`, `Result<T>`, `fail(kind)`; `ErrorKind` stays in `types.ts`), `ids.ts` (`newId(prefix)`, 08-1 §0.6 prefix table), `safeName.ts` (08-1 §0.7.1), `tokens.ts` (generated), `copy/en-IN.json`, `copy/t.ts` (X-140; there is no `banned-words.ts`: the Article 2 list lives in `scripts/check-copy.ts`). 11-fidelity and foo-plan cite this list and never rename a file.

---

## §F Status badge (X-61)

| Value | Glyph | Tooltip |
|---|---|---|
| seen | 👀 | Seen |
| working | 🛠 | Working on it (slow: "Taking longer than usual") |
| waiting | ⏳ | Waiting on you |
| done | ✅ | Done |
| done_unverified | ✅ | Done · Not checked live |
| failed | ❌ | Didn't work |
| stopped | ⛔ | Stopped |

Rules: `slow` and `cancelled` are not values (slow is derived: `jobs.slow` → 🛠 tooltip, 04 §4.2). **⚠ never appears on a bubble**; it appears only in the Stuck card header. A stuck job's bubble stays ⏳ (SM-A2). A message queued offline shows a clock tick and no badge. Resume edits the error card in place (no new message). The glyph map lives only in `src/shared/badges.ts`. One exception to "a badge never re-appears" (X-128): a message that opened a `choice` card with `purpose: file_in` (J29) keeps `seen` while the card is `asking`, becomes `done` when any option other than "Not now" is tapped, and returns to `seen` when the card expires after 24 h (12-2 §12.29.4, 04 §4.1 rule 4).

---

## §G Models

### G.1 Card types (X-56)
`brief, checklist, choice, tiles, approval, payment, bill, draft, secret, signin, connect, plan, routine, routine_offer, stuck, error, spend_cap, table, file, link_preview, job_link, place, face_explainer, catch_up, setup, kit, ai_page` (27 types; `kit` and `ai_page` are X-180, 04 §13.5–§13.6, 05 §0.1, states `kit` shown \| kept and `ai_page` building \| ready \| failed \| kept; `catch_up` is J27, 12-2 §12.27; `setup` is the first-run surfaces of 06-1 §2.1–§2.4 that are not Choice/Connect cards, payload `SetupCardPayload` 08-5 §4.1, states `shown | answered | skipped`, X-119).

Sub-kinds are payload fields, not types: `secret.secretKind` ∈ ai_key \| voice_key \| web_key \| login \| card \| otp \| cvv \| user_key (CR-0057); `signin.mode` ∈ sign_in_here \| take_over; `choice.purpose` ∈ job \| setup \| memory_confirm \| app_use \| stop_which \| conflict \| file_in \| photo_notice (`file_in`: no Best fit, no Skip, no reminder or auto-pick, no job until answered, 12-2 §12.29.4; `photo_notice`: same rules, §G.18); `routine_offer.source` ∈ habit \| idea \| after_job (§B.3 `RoutineOfferPayload`); `approval.variant` ∈ standard \| deadline_reminder; `error.variant` ∈ error \| recovery; `connect.variant` ∈ `ConnectVariant` (google \| whatsapp \| outlook \| one_app \| allow_send \| contacts_only; `ConnectPayload` 08-5 §4.1, X-127); `bill` payload is `BillPayload` (08-5 §4.1; `duplicate`, `scam`); `table`, `file`, `link_preview`, `place` payloads are 08-5 §4.1; `face_explainer` has an empty payload and only state `shown`; `catch_up` payload is `CatchUpPayload`. Removed types: code, cvv, takeover, recovery, memory_confirm, link, feedback, helper_form, group_form, paste, voice, spendcap (→ spend_cap). Setup interview cards reuse these types with `payload.setupCard: 'A'…'H'`.

`messages.kind` ∈ `text | voice | card | marker`; new column `messages.marker_kind` ∈ `start_of_chat | handoff | memory_chip | helper_notice | system_line`. A brief, job link and error are always `kind='card'` → `cards` row (never a message kind). User attachments ride on `text` messages. The proof chip renders from `jobs.proof`.

### G.2 Card states (`cards.state`; approval and payment use `ApprovalState`)
| Type | States |
|---|---|
| brief | open, expired |
| checklist | live, done, done_unverified, failed, stopped |
| choice, tiles | asking, answered, auto_picked, skipped, expired, superseded, withdrawn |
| bill | waiting, reminded, paying, paid, already_paid, expired |
| draft | pending, editing, undo_window, sending, sent, discarded, opened_in_app, queued_offline, failed, expired, superseded, withdrawn |
| secret | asking, checking, saved, rejected, expired, withdrawn |
| signin | waiting, live, signed_in, skipped, timed_out, handed_back, withdrawn |
| connect | offered, opening, waiting, connected, partial, denied, expired, failed, skipped |
| plan | pending, go, changed, withdrawn |
| routine | shown |
| routine_offer | offered, accepted, dismissed |
| stuck | asking, other_way, taken_over, stopped, timed_out |
| error | shown, asking, fixed, resumed, stopped, dismissed |
| spend_cap | shown, raised, dismissed |
| job_link | live, done, failed, stopped |
| setup | shown, answered, skipped |
| approval, payment | ApprovalState |
| all others | shown |

New `cards` columns: `resolved_by` ∈ tap \| keyboard \| toast \| typed \| reaction \| auto \| system; `resolved_at`; `supersedes_id`; `deleted_at`.

### G.3 Permission model (X-54)
Three values everywhere: always / ask / never. Action class → row: read→read (tools `web.search`, `web.fetch`, `web.browseCloud`, `browser.open`, `browser.snapshot`, `browser.click` non-commit, `browser.screenshot`, `browser.download`, `gmail.search`, `gmail.read`, `gcal.list`, `whatsapp.read`, `contacts.search`, `memory.search`, `files.read`, `screen.open`), prepare→drafts (`gmail.draft`, `whatsapp.draft`, `x.draft`, `x.openCompose`, `browser.type`/`select`/`check`/`press`/`scroll`/`back`/`wait`, `browser.fillSecret`, `browser.fillPersonal`, `files.write`, `memory.propose`, `memory.askShare`, `job.needSignIn`, `job.needSecret`; names are 08-2 §8.2's, X-137), calendar_write→calendar, send→send, book→book, buy→pay, pay→pay, post→post, delete→delete, share_personal→share, switch→always a card. **The gate reads the row first (X-125):** `perm = permissions.actions[rowFor(cls)]; if perm == 'never' → REFUSE` with the line below, then `read`/`prepare` execute; `read = 'never'` and `drafts = 'never'` are real. `never` refuses with "I'm not allowed to {row}. You can change that in Settings → Permissions. [ Open Permissions ]". Post in v1 = hand-back: `x.draft` + `x.openCompose`. Only read, drafts, calendar may be `always`; hard limits always show a card. Calendar add after a booking is covered by the book approval when the card shows "Adds it to your calendar after booking." (do_verbs contains `add_calendar`). An app set to `ask` shows the Choice card (`purpose: app_use`) "Can I use {Gmail} for this?" once per job. Helper `allowedApps` AND permissions. Removed: `do_when_i_say`, `ill_do`, G-08-03. Rules (`Rule[]`) apply only to use_app, calendar_write and mail_organise.

### G.4 Activity log (X-62)
Columns per DB-06 plus `kind` ∈ sent, paid, booked, deleted, connected, stopped, changed. `event` closed list:
- sent: sent_email, sent_whatsapp, opened_x_draft, shared_personal
- paid: paid
- booked: booked, cancelled_booking
- deleted: deleted_files, deleted_email, deleted_chats, deleted_messages
- connected: connected, disconnected, signed_in_site, signed_out_site, saved_login, removed_login
- stopped: stopped_job, stopped_all, paused_routines, resumed_routines
- changed: permission_changed, cap_changed, setting_changed, rule_added, rule_removed, forgot_facts, secret_saved, secret_replaced, secret_removed, switched_route, exported

`outcome` ∈ done, failed, unknown. `approved_how` ∈ card_once, card_chat, card_always, rule, hello, typed_amount, user, none. Anything else a 05 "Logged" line names goes to the tech log, not activity. Mirror `{DATA}\activity.jsonl` uses camelCase fields; the Activity page reads the DB.

### G.5 Deletion (X-63)
Soft delete then purge (DB-02 proposed text): user deletes set `deleted_at`; the purge pass (same transaction for chat delete, nightly for the rest) removes child rows children-first. Every FK is `ON DELETE RESTRICT`; no CASCADE. `activity` rows survive chat deletion and go only with "Delete everything".

### G.6 Processes (X-64, X-72)
Main forks the engine (utilityProcess) and **wa-bridge** (utilityProcess); main hands both ends of a `MessageChannelMain` port to engine and bridge; `EngineToBridge` / `BridgeToEngine` unions per BE-06. Main is the only SQLite writer; the engine calls `DbOp` (named queries per BE-07, X-71). The Redactor is one module `src/shared/redactor.ts`, instantiated in main and engine; main mirrors `SecretRegistry` changes to the engine's Redactor over the private main↔engine channel only: `registry:add { handle: string; hash: string; len: number; value: string; normalised: string[]; ttlMs: number }` and `registry:remove { handles: string[] }` (B-8, X-93). Secret values exist only in main's and the engine's memory; they never reach the renderer, a log, the DB, a file or the AI; the only secret wa-bridge holds is its own Baileys auth state (`wa_session`), which it never logs or sends anywhere but `wa.creds` (X-124).

### G.7 Draft card lifecycle (X-65)
Draft creation creates its `approvals` row (PENDING, expires 60 min). `draft:send` = approve once (`approved_via='card'`); `'draft_send'` is not a value. On send: `undo_until = now + 5 s` → second look → `gmail drafts.send` (or WhatsApp send). Change uses `drafts.update`; Discard uses `drafts.delete`. Hard-limit drafts (new recipient, money, personal data) use the full Approval card.

### G.8 Windows and browser (X-66)
Edge is always external, driven by playwright-core over CDP. **Watch live** = a foo-owned Electron window `live.html` rendering CDP screencast frames (`live:frame`, masked, not interactive) with foo's title bar, foo bar and control bar, grouped under foo in the taskbar. **Take over / sign in** = bring the real Edge window to front plus one docked, always-on-top, frameless `signin-banner.html` window (address row + "I'm done", Alt+D), positioned by `foo-native` wintrack. 06-3's "Chromium view" and every in-panel live view are withdrawn; "See steps" opens the right shell at Doing now, and "Watch live" (chat header, Doing now row `Window` button) opens `live.html`. Closing `live.html` does not stop the job (Stop is the explicit control, X-95). **Take over (X-121):** `live.html` stays open and enters state `in_control` (pill "YOU'RE IN CONTROL", the 48px control bar [ Hand back to {agentName} ] [ Stop ] under the paused picture, 06-3 §11.2); the docked Edge banner shows the Control tone bar with [ Hand back to {agentName} ] only (no Stop; 05-3 §5.10.3); Edge is never resized (`--signin-w`/`--signin-h` are removed). Words, copy keys (`live.window.*`) and test ids of the live window are 06-3 §11.2; banner content and ids are 05-3 §5.10.3; 09 §9.27 owns only window creation, size, focus and docking. Live-window states: `starting / live / needs_you / in_control / paused / done / cant_show`. Replay mode (06-3 §13, X-128) is the attachment viewer, never a window.

### G.9 Deep links (X-67)
`foo://chat/{id}`, `foo://chat/{id}/card/{id}`, `foo://chat/{id}/message/{id}`, `foo://card/{id}`, `foo://needs-you`, `foo://new-message`, `foo://stop-all`, `foo://settings/{page}[/{row}]`, `foo://ideas` (→ `{ kind: 'screen', id: 'ideas' }`, G1-4). Query `?act=review | not_now | read | choice:{optionId}`. No `foo://reply`. Jump list uses `settings/account`. The renderer event `navigate` carries `{ view: View; act?: string }`.

### G.10 Renderer architecture (X-68)
Navigation: `View` in the `ui` slice, back stack max 10, Esc pops (FE-06). Store slices per FE-07 with the rev rule (§B.1). IPC client per FE-25: typed `invoke<C>()` with a 15 s timeout, `useFooEvent(channel, fn)`.
- `ui` slice (D-7): `view: View`; `back: View[]` (max 10); `dialog: DialogId | null`; `focusReturn: HTMLElement | null`; `scroll: Record<string /*chatId*/, number /*scrollTop*/>`; `selection: Set<string /*messageId*/>`; `banner: BannerType | null`; `findOpen: boolean`; `rightShellOpenOverlay: boolean` (M/S only, not persisted).
- `live` slice (D-11): `faceQueue: Record<string /*chatId*/, { mood: Mood; until: number }[]>`; `celebratedOn?: string /*YYYY-MM-DD*/`; `cardSeenAt: Record<string /*cardId*/, number>`; `connection: 'online' | 'offline' | 'ai_down'`; `typingChatId?: string`; `replyInFlight: Record<string, boolean>`; `speaking: Record<string, boolean>`; action `playOnce(chatId, mood)`; selector `selectChatMood(chatId): Mood`.
- `live` slice also carries `lastKeystrokeAt: number | null` (set by the composer on input, read by `selectChatMood`) and `windowFocused: boolean` (X-117).
- Data slices (`chats`, `messages`, `cards`, `jobs`, `connections`, `spend`, `settings`), optimistic send, delta ordering, pagination and read marks: **08-5 §5** (X-117).
- `platform.reducedMotion` in `app:getBootstrap` is the start value only; the renderer follows `matchMedia('(prefers-reduced-motion: reduce)')` change events.
- Chat multi-select: the selection bar replaces the chat header inside its 60px box (03 §3.6.2.3); it is not a banner-strip type (X-92).

### G.11 Composer drafts (X-69)
Table `drafts` (DB-05 DDL: one row per chat; text with mention tokens, attachments, reply target, preview flag) replaces `chats.draft_text`; `ChatRow.hasDraft` derives from it.

### G.12 Connections (X-74)
`connections.app` CHECK adds `contacts` and `hub`. Tables `contacts_index` + `contacts_fts` per INT-03/DB-18. `connection:connect { app: 'google' | 'outlook', scopes? }` returns `{ connectionId, status: 'connecting' }` at once; progress arrives as `connection:upsert`. Gmail row button "Disconnect Google"; Calendar and Contacts rows use Turn off / Turn on (`connections.google.*On`).

### G.13 Suggestions (X-76)
`suggestions.key` = `{kind}:{subject}` per AG-26 (e.g. `helper_offer:trips`, `routine_offer:pnr_watch:{pnr}`), columns per DB-17; UNIQUE(key) enforces Art. 20 "never offer twice". `kind` ∈ `SuggestionKind` (§B.2). Subjects: helper_offer → template id; habit_offer → biller slug (`airtel-7741`); routine_offer → `suggest:{first 8 hex of sha256(task_spec)}` \| `pnr_watch:{pnr}` \| `recharge_due:{billerSlug}-{last 4 of the number}`; connector_offer → `ConnectorApp`; brief_kind_stop → `BriefKind`; memory_conflict → the two fact ids sorted, joined by `-`; memory_share → `{factId}:{groupChatId}`; stale_routine → routine id; save_login → domain; read_codes → sender domain; voice_key → `openai` (X-106). Idea offers (`routine_offer.source='idea'`) write no row. A post-job offer (`source='after_job'`) is part of the job the user started: `prompted = 1`, it does not count toward `notifications.unpromptedPerDay` and is never held, and at most one offer is posted per finished job (X-97). `habit_offer` is posted only while `routines.habitOffers` is true.

### G.14 Safe mode (X-77)
`{DATA}\launches.json` entries `{ at, clean, version, engineCrashes }` (`clean`, never `cleanExit`). Trigger per BE-12: 3 unclean launches within 10 min, or 3 engine crashes within one launch.

### G.15 Words (X-79)
"cap" only (never "limit" for foo's caps; "limit" is reserved for the AI plan's own usage limit). "toast" never appears on screen ("notification"). Approval and Draft cards say "Change", never "Edit".

### G.16 Stop on a stuck card (X-80)
The job ends CANCELLED, `stop_reason='stuck_stop'`, badge ⛔ (Art. 16: the user stopped it). 07 FAILED and AT-116 are corrected.

### G.17 Schema additions and changes (Phase 3a, X-90; DDL owner 08-1)
| Table | Change |
|---|---|
| `chats` | `private INTEGER NOT NULL DEFAULT 0` (only with `kind='foo'`; at most one live row with `private=1`; "foo's chat" = `kind='foo' AND private=0`; `messages_fts` triggers skip messages of private chats; G2-1); `helper_messages_since_user INTEGER NOT NULL DEFAULT 0`, `loop_paused INTEGER NOT NULL DEFAULT 0` (group loop guard, C-6) |
| `messages` | `client_id TEXT` + `CREATE UNIQUE INDEX messages_client ON messages(chat_id, client_id) WHERE client_id IS NOT NULL` (`message:send` idempotency, A-7); `pinned INTEGER NOT NULL DEFAULT 0` (kept voice note, C-4); `why TEXT` (JSON `{ source: 'routine_asked' \| 'routine_suggested' \| 'suggestion' \| 'habit_offer' \| 'housekeeping' \| 'cap_warning'; routineId?: string; suggestionKey?: string; vars: Record<string, string> }`, written by the engine for every unprompted message and every routine-fire message, NULL otherwise; drives the 04 §19.6 "Why am I getting this?" footer; `idea` routines count as `routine_asked`; only `prompted = 0` counts toward the budget) |
| `jobs` | `waiting_reason` CHECK = `WaitingReason` (adds `opens_at`, no `slot`); `wake_at INTEGER` (epoch ms, set only with `opens_at`; the runner's tick moves the job to WORKING at `wake_at`; no stuck timer while WAITING) (G1-1) |
| `routines` | `builtin` CHECK = `RoutineBuiltin` or NULL; `created_from` CHECK = `RoutineCreatedFrom` (A-4, G1-5) |
| `routine_runs` | `observed TEXT` (JSON `{ metric, value, unit? }`; `op 'changed'` compares with the latest run that has one; the first run never fires on `changed`) (G1-6) |
| `activity` | `chat_title TEXT` (chat display title at write time; exactly `'a private chat'` for a private chat; summary from a private chat carries no message text) (A-5, G2-2) |
| `connections` | `history_id TEXT` (NULL except on the `gmail` row; C-2) |
| `memory_index` | `source` renamed `provenance` CHECK (`'said'`,`'guessed'`); `scope` CHECK = `MemoryScope`; the file path stays in `file` (relative to `{DATA}`, forward slashes, §0; `CREATE INDEX memory_file ON memory_index(file, line_no)`); new `chat_id TEXT` (NULL unless `scope='chat'`; read from the `chat:{chatId}` brace token of the line, 08-3 §12.2) (A-9, X-112) |
| `secrets_index` | `target TEXT PRIMARY KEY` (`foo/{kind}/{name}`; WhatsApp `vault\wa-session.bin`), `name` = the `{name}` part, `UNIQUE(kind, name)`, `kind` CHECK = `SecretKind` (A-10); `secret:save { kind, name }`, `secret:delete { target }` |
| `brief_feedback` | `brief_card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE RESTRICT`, `item_kind TEXT NOT NULL` (a `BriefKind`), `vote INTEGER NOT NULL CHECK (vote IN (1,-1))` (A-11) |
| `notifications` | `delivery` CHECK = `NotificationDelivery` (C-1) |
| `suggestions` | `kind` CHECK = `SuggestionKind` (A-6 + `memory_share`, C-5) |
| `ai_turns` | `purpose` CHECK = `AiPurpose` (B-6) |
| `approvals` | `undo_until INTEGER` (§G.7); `verb` without `cancel_booking`; `approved_via` without `draft_send` |
| `payments` | the row is INSERTED in the write-ahead transaction with `state='submitted'`; `state` ∈ submitted, checking, succeeded, failed (no ready/unconfirmed) (X-96) |
| `wa_messages` | index `wa_messages_chat ON wa_messages(chat_jid, at DESC)` |
| new `files` | DB-16 DDL as 08-1 §4.3.13, id prefix `fl_`, `kind` ∈ made, received, downloaded, screenshot (A-8) |
| new `held_items` | `(id TEXT PRIMARY KEY /* hi_ */, kind TEXT NOT NULL CHECK (kind IN ('routine_fire','habit_offer','helper_offer','stale_routine','away_notice','memory_conflict','cap_80','brief_kind_stop','suggestion')), chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE RESTRICT, payload TEXT NOT NULL /* JSON HeldItemPayload, 08-5 §3.8 */, created_at INTEGER NOT NULL, delivered_in_brief_id TEXT)` (C-1) |
| `helpers` | the inline `UNIQUE` on `name` becomes `CREATE UNIQUE INDEX helpers_name_live ON helpers(name COLLATE NOCASE) WHERE deleted_at IS NULL` (X-129) |
| `tool_calls` | `UNIQUE(idem_key)`; 7 days after `jobs.finished_at` `args`, `result`, `observation_ref` are blanked (`'{}'`, NULL, NULL); hard-deleted by housekeeping 90 days after `finished_at` (main only; X-129) |
| `wa_messages` | `id` = `'wa_' + chat_jid + ':' + Baileys key.id`; ingest is `INSERT OR IGNORE` (X-129) |
| indexes | `files_helper(helper_id, created_at DESC)`, `files_job(job_id)`, `cards_job(job_id)`, `activity_chat(chat_id, at DESC)`, `held_items_chat(chat_id)`, `notifications_chat(chat_id)`, `suggestions_state(state, decided_at DESC)` (X-129) |
| new `wa_contacts` | `(jid TEXT PRIMARY KEY, name TEXT, phone TEXT, updated_at INTEGER NOT NULL)`; deleted with `wa_messages` on unlink or `connections.whatsapp.read=false`; never exported (C-3) |
| new `memory_group_grants` | `(fact_id TEXT NOT NULL, chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE RESTRICT, until INTEGER NOT NULL, PRIMARY KEY (fact_id, chat_id))` (C-5) |
| new `memory_uses` | `(fact_id TEXT NOT NULL, chat_id TEXT NOT NULL, job_id TEXT, at INTEGER NOT NULL)` + `CREATE INDEX memory_uses_chat ON memory_uses(chat_id, at)`; rows older than 90 days purged nightly; a `WritableTable`; named query `memoryUsedInChat` (B-3) |

Id prefixes added to §E.7: `hi_` held_items, `fl_` files, `bf_` brief_feedback. New `WritableTable` members: `held_items`, `memory_uses`, `memory_group_grants`, `wa_contacts` (`files` already is); new `HardDeletable` members: `held_items`, `memory_uses`, `memory_group_grants`, `wa_contacts`. The bridge sends names as `BridgeToEngine` `{ kind: 'wa.contacts'; payload: { contacts: { jid: string; name?: string; phone?: string }[] } }` and the engine upserts `wa_contacts` through `DbOp`. Named query `monthPurchases` = payments with `submitted_at` in the month and `state ≠ 'failed'` (08-4 §29.3).

New IPC and engine messages: invoke `message:pin { messageId: string; on: boolean } → void` (C-4); invoke `routine:startIdea { ideaId: string } → { chatId: string }` (G1-4); invoke `chat:mute { chatId: string; until: number | 'forever' | null } → void` writes `settings.notifications.mutedChats`; engine tool `memory.askShare { factId: string; groupChatId: string; why: string /* ≤ 80 */ }`, class `prepare` (C-5); EngineToMain `approval.transition { approvalId, to, data: { submittedAt, paymentState } }` → `{ ok: true }` (08-4 §29.1); EngineToMain `attachment.prepare { fileId: string } → { parts: AttachmentPart[]; covered: number; ocr: 'ok' | 'unavailable' | 'failed' | 'not_needed' }` (§G.18); events `chat:typing`, `app:safeMode`, `ai:detectRow`, `data:exportProgress`, `data:wipeProgress`. Intake tag `intent_capabilities` ("what can you do?"): the engine posts the Capabilities card (04 §13.7), whose footer carries `thread.ideas.link_line` at most once per chat per day (G1-4; X-182, CR-0024 F3).

### G.18 Photos, scanned pages and Article 8 (X-98, Claude's default, Vikas may change)
Every attachment that goes to the user's AI (any purpose: `read_attachment`, `intake`, `chat`, `step`) is prepared by **main** through `attachment.prepare` before the turn; the engine never sends an original file.
1. **Images** (jpg, jpeg, png, webp, gif, bmp, heic, heif): decoded and resized to ≤ 2,048 px on the long edge as PNG (04 §22.6), then `foo-native` `ocrRead` (Windows.Media.Ocr: `OcrEngine.TryCreateFromLanguage(en)` if supported, else `TryCreateFromUserProfileLanguages()`; neither → `unavailable`).
2. **PDFs** are never sent as PDF (X-109). Main opens them with `pdfjs-dist` (exact version pinned at M0) in a hidden, sandboxed offscreen window `windows/pdfraster.html`; at most the first 10 pages (more → line `thread.papers.first_pages` "I read the first 10 pages."). A page with ≥ 20 characters of text layer is sent as **text** after the Redactor (pattern + registry, plus the patterns below, replaced by "••••"); a page with less is a **scanned page**: rendered to PNG at 150 dpi (≤ 2,048 px) and handled as an image.
3. **Patterns** (`src/shared/redactor.ts` `findPhotoSecrets(lines)`, also used on PDF text): card number = 13–19 digits (spaces or dashes allowed) passing Luhn; CVV = 3–4 digits on the same OCR line as, or the word right after, `CVV|CVC|CVV2|CID|security code`; OTP = 4–8 digits on a line containing `OTP|one-time|one time|verification code|code is|ओटीपी`; Aadhaar = 12 digits (4-4-4 or run together), first digit 2–9, passing Verhoeff; bank account = 9–18 digits on a line containing `a/c|acct|account no|bank|खाता`, or within one line of an IFSC (`[A-Z]{4}0[A-Z0-9]{6}`), except on lines containing `consumer|customer|CA no|BP no|K no` (biller ids stay readable). A vault secret hash hit also matches.
4. **Black out.** Every matching word box (padded 4 px) is filled black with `foo-native` `blackout` into `{LOCAL}\ai-scratch\attach\{fileId}-{page}.png` (deleted after the turn and swept on engine start, like 08-4 §30.8). When `covered > 0` foo posts the marker line `thread.papers.covered` "I covered {n, plural, one {# number} other {# numbers}} that looked private before reading this." The AI never sees the original.
5. **OCR unavailable** (language pack missing or the addon absent) and `privacy.photoCheckNoticeShown = false`: before the first image or scanned page is sent, a `choice` card (`purpose: 'photo_notice'`) with question `thread.papers.photo_notice.body` "I can't check pictures for card numbers or codes on this PC, so your AI would see this photo as it is. Don't send photos of cards, codes or Aadhaar." options `thread.papers.photo_notice.send` "Send it" / `thread.papers.photo_notice.not_now` "Not now". Send it → setting true, the turn continues (later photos go without asking); Not now → nothing is sent, the job ends CANCELLED (`stop_reason='user_button'`) with `thread.papers.photo_notice.not_sent` "Okay, I didn't send it." While OCR stays unavailable, 12-2 §12.28.2's answer guard still applies: a read whose answer contains a card number, CVV/OTP-labelled number, Aadhaar number or a vault secret is discarded and nothing from it is stored.
6. **OCR failed** on one picture (status `failed`): that picture is not sent; foo posts `thread.papers.check_failed` "I couldn't check this picture for private numbers, so I didn't send it to your AI. Can you type what you need from it?" and the job waits (NEEDS_YOU).
7. Tests AT-263…AT-266 (12-2 §12.31).

### G.19 Indian Railways rules (X-108; values here are binding; provenance `review/rail-facts.md`, verified 2026-10-16)
Values live only in `resources/rail-rules.json` (§E.5); `src/engine/tools/browser/irctc.ts` reads them and holds no rail constant of its own. Tatkal opens one day before the journey date (counted from the origin station) at 10:00 IST (AC) / 11:00 IST (non-AC) and needs an Aadhaar-verified IRCTC account plus an Aadhaar OTP at booking: the user types the OTP into IRCTC's page (Art. 8); foo never reads, forwards or works around it. General bookings open 60 days ahead (journey day excluded) at 08:00 IST; on the opening day only Aadhaar-verified accounts can book, and any "booking opens" reminder fires at 08:00 IST that day. Cancellation refunds use the 72 h / 24 h / 8 h slabs and the flat per-class charges, always shown as an estimate ("about ₹{x}, an estimate; IRCTC decides the final amount"); a confirmed Tatkal ticket gets no refund. **PNR watch** never uses the public PNR page (it has a CAPTCHA and foo never solves CAPTCHAs) and no third-party PNR API exists in v1: it reads the user's own IRCTC booked-ticket history in foo's Edge profile while the user is signed in to IRCTC there. Signed out → no polling; one "sign in to keep watching" message per local day until the user signs in to IRCTC through foo, then the normal schedule resumes.

---

## §H Reviewer rulings (one line each)
- Paste catcher: whole caught span masked "••••" (04 wins over 05: shows nothing of the secret), shadow `--shadow-16`, Esc dismisses the catch and keeps the text masked.
- Group turns: AG-08 algorithm (covers J16's "different part" branch) over AI-15.
- Stuck "What I'd do" line: written by the runner from the stuck facts (AI-18) not by a free AI turn (AG-16 brief part handled separately).
- Helper notes: §12.2 line format; written by the engine on DONE, by the post-turn review and by the user; no AI `helper.note` tool; style stats computed by the engine (AG-14 + AI-24 over BE-48).
- Typed choice answers: AG-10 algorithm; a tie between options is not an answer (foo asks again).
- AI install flow: UJ-02 copy + AI-26 removal list + INT-12 `maker-pages.json`.
- Bill card: UX-06 look (matches the approved walkthrough) merged with UJ-01 remind and duplicate rules.
- Month spend counts `submitted` and `checking` payments as spent (BE-38; conservative, Art. 13).
- `waiting_reason 'slot'` is removed.
- Electron: latest stable on M0 day, exact version pinned and written into 08-1 §1.1 that day.
- `chat:archive` is used only by C-8 "Hide from foo".
- Tray times are day first per X-11 ("Until Sat 17 Oct, 9:00 AM").
- Living face party sparks use `--accent` / `--ok` / `--accent` (not `--warn`): F2 forbids status colours as decoration (X-92).
- Buttons: `--btn-h` 40 (Primary, cards, dialogs, pages), `--btn-h-sm` 32 (never a Primary), `--btn-round` 36 (composer round buttons); `--signin-w` / `--signin-h` are removed (X-92).
- First-run privacy sentence: "foo never uses your data to train anything, and nothing goes to us." (`setup.privacy.no_training`; Art. 2 forbids "server"; X-95).
- First-run app chips keep "X" with the note "Drafts only" (X-34, X-95).
- Bill "Remind me {day}" creates a `once` routine at 9:00 AM local that day (UJ-01, 07-2 D-41; X-103).
- Confirm dialogs: C-21 raise AI cap, C-22 remove a saved secret, C-23 end a private chat, C-24 delete one message (copy 04 §6.3), C-25 delete selected messages (copy 04 §1.9), C-26 open a link to another domain (copy 04 §13) (X-102).
- Copy keys for shared lines: proof chip `cards.proof_chip.chip.{variant}` (`pnr` "Proof: PNR {pnr}", `read_source` "Proof: {Family group} · {n} messages read"); IRCTC puzzle line `cards.signin.known_puzzle_site`; calendar-after-booking line `cards.approval.line.adds_calendar` (X-105).
- Private chat mark: `EyeOff` 16 until Vikas says otherwise (owner list item; PRD R31 says "ghost mark").
- Flight booking request: reply `thread.flight_scope.body` "I can find and compare flights, and open the booking page for you. Filling in passengers and paying for flights comes in a later version." [ `thread.flight_scope.button.compare` "Compare flights" ] link `thread.flight_scope.button.not_now` "Not now"; never a Payment or booking Approval card (X-81, F-1).
- `DB_REBUILT` is a user-facing `ErrorKind` (08-3 §21.2 row: "I lost my copy of your older chats after a problem on this PC." / "Your memory, routines, helpers and activity log are safe." [ OK ]; keys `errors.db_rebuilt.what_happened`, `.what_is_safe`, `.button`); `DB_REBUILD_FAILED` is internal (A-3).
- Acceptance-test numbers: F AT-151…AT-157 and AT-200…AT-226; G1 AT-158…AT-199 (12-1 §12.A); G2 AT-230…AT-262 and Phase 3a AT-263…AT-266 (12-2 §12.31); AT-227…AT-229 unused (X-104).

### H.2 Round-2 rulings (X-111…X-133; one line each)
- Last 4 digits: a saved **card** is identified by brand + last 4 ("Visa ••4242") in the Secret box saved row, Settings → Money, the Payment card's "Pay with" line, C-12 and the Activity log; keys, logins and codes show "{Name} · saved {date}" and never any part of the value (X-116; 09 §9.18's "no last-4 anywhere" is withdrawn).
- Streaming (X-122): the engine's sentence gate holds every release for the first 1.5 s of a turn (04 §12.3's buffer lives there, not in the renderer); after that sentences stream; for a non-`reply` kind only text **not yet released** is discarded, released text stands and the card/reaction/chip follows it; a leak is logged `PROTOCOL_SAY_LEAK`.
- Images on the wire (X-123): 08-4 §30.10; images before the prompt text in the same user message, base64 PNG; CLIs (`claude-cli`, `codex-cli`, `gemini-cli`) are `vision = false` in v1 (`AI_NO_VISION`); `ollama` vision from `/api/show` families.
- Idempotency key (X-113): `sha256(jobId|stepId|tool|canonicalJson(args)|approvalId ?? '')`, hex; a replayed step reuses the stored `state='ok'` row and never re-calls the adapter.
- Bill flow J11 (X-115): builtin `bill_watch` is created when the first Gmail account connects, owned by Money's chat (foo's chat until Money exists), trigger `on_email` by `billers.json` domain or the 08-4 §26.14 bill patterns (X-136), posts one `bill` card after fold rule 5; 05-3 §5.29 is the card's source of copy and behaviour; 10-1 AT-151/152/208 follow 05 ("I already paid" runs no receipt search, writes no activity row); idea 3 posts no second card for an existing bill; `BillPayload` = 08-5 §4.1; brief "Remind me" = 08-3 §14.7 rule (9:00 AM the day before the due date).
- Brief size (X-131): 1–5 items (cap = Settings → Brief, default 5); zero items → the one-line light-day brief; "3–5" and "fewer than 2 → light day" are withdrawn everywhere.
- Plan card (X-131): plans are 1–12 steps; the card shows the first 5 and "…and {n} more · Show" beyond 6; the engine inserts a `show_before` step (08-4 §26.1 key) before the first acting step.
- `urgent` (X-131): set by the engine only (word patterns in 08-3 §13.2.1 or a builtin marked urgent in §13.7a); `RoutineDraft.urgentText?` carries the user's words; the AI never sets `urgent`.
- Group turns (X-126): `group_intake.md` / `group_member.md` (08-4 §24.19–§24.20); a `GroupIntakeAct` `reply` discards its `<say>` and runs one `GroupMemberAct` turn for that helper; only `handoff_accept` creates the member's job; Redactor channel `group` (08-2 §11.4) masks paid amounts, addresses and private facts; `memory.askShare` is listed to the AI only in group turns (08-4 §27.1); "catch me up" is `IntakeAct` kind `catch_up` and creates no job.
- Memory (X-112): `memory.propose` = one `MemoryReviewAct` `add` op; manual add runs one `classify` turn `{ category; kind; person? }`, offline → `fact`/`other`; `PRIVATE_BLOCKED` covers every §12.4.1-sensitive fact incl. `family`; `scope='chat'` shows "Only in {chat name}" on the Memory page.
- Private chats (X-132): every notification kind from a private chat shows "{chat title} · New message" only (09 §9.9); private-chat activity rows carry no payee or recipient label (12-2 §12.30.7 follows 06-3 §9.4); the end-private-chat confirm is C-23 (12-2 §12.30.5's "C-21" is corrected).
- Walkthrough-drawn elements adopted (X-128): the backup-AI bubble mark (04 §12.5, `bubble-backup-mark`, "Answered with {ChatGPT} while {Claude} rests"); Replay mode in the attachment viewer (06-3 §13); the WhatsApp mirror row and thread (03-shell-1 §3.4.5.1, 04 §10.11; sender names in the ten F2 helper colours by `hash(jid) mod 10`, X-138); the private chat sits directly under foo's row and its toggle sits left of Find (03). 11-fidelity §11.2.7 lists the 14 superseded frames to re-render before `spec-v1.0`.
- Uninstall (X-124): `foo.exe --uninstall-cleanup --mode=delete|keep [--export-to "<folder>"]`, ≤ 90 s, result file `{LOCAL}\uninstall-result.json` (09 §9.23.4).
- WhatsApp sends (X-129): ≥ 30 `sent_whatsapp` activity rows since local midnight → the Draft card's Send is disabled with `cards.draft.line.wa_daily_limit`; the 3-s gap is the engine's FIFO send queue, never an error; `sender_label` = `wa_contacts.name` ?? `pushName` ?? masked number, "You" for `from_me`.
- PERF (X-130): budgets are PERF-01…PERF-18, measured as 10-2 §E.1 (p95 of 20); 08-3 §20 carries the same ids; plan §9 says "18 PERF budgets".
- Confirm button words: C-26 is [ Open {domain} ] [ Not now ] (02 F10: "Cancel" only stops something running).
- Tray face states: 8 (6 drawn in 02-2 §F15.9.6 + Paused and Setting up from 09 §9.8.1).
- Face rasters (X-124, X-135): the renderer's hidden `<FaceRaster>` sends `face:raster { faceRef, size: 16 | 20 | 24 | 32 | 48, mood, png }` through `FooBridge.send`; main writes `{DATA}\avatars\raster\{safeName(faceRef)}-{size}-{mood}.png` for toasts (48, ring) and the tray (16/20/24/32 by taskbar scale); main never draws a face.
- Merge rulings (X-134…X-141): loop guard `> 6`; `job:handBack { jobId }` with no mode and no `routine:create`; `AI_CLI_INCOMPATIBLE`/`URL_NOT_ALLOWED`/`SETTING_LOCKED` are §21.3 kinds; bill patterns are 08-4 §26.14; tool names are 08-2 §8.2's; mirror thread 04 §10.11, backup mark 04 §12.5, rasters 02-2 §F15.9.9; Copy is plain text; Card E is the Connect card and `SetupCard` has five values; `src/shared/` adds `errors.ts`, `ids.ts`, `safeName.ts`; no "Mark paid" chip.
- Derived chat columns (X-129): `seq`, `next_seq`, `last_message_id`, `last_activity_at`, `unread_count`, `helper_messages_since_user`, `loop_paused`, `pill`, `pill_until` are written only by main inside the transaction of the triggering `DbOp`; a `DbOp` naming them → `DB_NOT_WRITABLE`.
- `read_attachment` is used only for the bill, ticket and calendar paths; "Tell me what's in it" is an `intake` turn with the attachments, kind `reply`, ≤ 6 lines (08-4 §24.5, 12-2 §12.28.1 case C).
- Private chat mark stays `EyeOff` 16 (owner item closed; 02 F6 required list).
