# 08-5 · Shared types, store slices and native exports (binding)

Status: binding from 2026-10-16 (review round 2, X-111). Owner of this file: chief architect. Rank: **the same rank as 08-0** (after DECISIONS, before every chapter). 08-0 §B names every shared type; **this file writes out every shape that no chapter section already holds in full.** Where a chapter section is named as the owner of a shape (table in §1), that section is the single source and this file does not repeat it.

**Rule (X-111).** Nothing in `constitution/` may cite a `review/*.md` file as the source of a name, shape or value. A review id in brackets (`BE-01`, `AG-06`, `DB2-01`…) is provenance only, never a definition. `src/shared/types.ts` is written from 08-0 §B plus this file plus the chapter sections in §1, and from nothing else. The frozen spec set (11 §11.1.1) includes this file.

Casing: 08-0 §0. Every type below is `export`ed from `src/shared/types.ts`; the zod mirror lives in `src/shared/schemas.ts`; every union below is `.strict()` on the wire.

---

## §1 Where each shared type lives (one owner each)

| Types | Single source |
|---|---|
| `Settings`, `PublicSettings` (§3.1), `SettingsPath` | 08-0 §A (+ §3.1 here for `PublicSettings`) |
| `*Row` derivations (`ChatRow`, `MessageRow`, `JobRow`, `RoutineDetail`, `rev`) | 08-0 §B.1 + 08-1 §3.4 derivations + §2 here |
| Enums and unions (`ProviderId` … `BillSource`, `Route`, `MemoryScope`, `DialogId`, `ApprovalDraftVerb`, `RoutineBuiltin`) | 08-0 §B.2 |
| `RoutineDraft`, `RoutinePatch`, `RoutineTask`, `Schedule`, `Condition`, `FastPath`, `RoutineStepAct` | 08-3 §13.2 (`BuiltinTask` is §4.3 here and is referenced from `RoutineTask.builtin`) |
| `MemoryReviewAct`, `TidyAct` | 08-3 §12.4, §12.7 |
| `BriefItem`, `BriefKind`, `BriefCandidate`, `BriefAct`, `BriefAction` | 08-3 §14.3, §14.7 |
| `PlanStep`, `ChoiceCardSpec`, `ToolCall`, `ApprovalDraft`, `CardAnswer`, `HandoffNote`, `IntakeAct`, `StepDecision`, `SecondLookAct`, `StuckAct`, `GroupIntakeAct`, `GroupMemberAct` | 08-4 §25.1–§25.4 |
| `TurnRequest`, `TurnResult`, `AiUsage`, `Capabilities`, `DetectResult` | 08-2 §6.2 |
| `ApprovalFields`, `Proof`, `SecondLookResult` | 08-2 §9.3, §5.8; 08-0 §B.3 |
| `CardPayload` (the union) | 08-1 §4.5; its per-type members for `bill`, `table`, `file`, `link_preview`, `place`, `connect`, `setup`, `routine_offer`, `choice`, `catch_up` are §4.1–§4.2 here (08-1 §4.5 points here for those) |
| `CatchUpAct`, `CatchUpPayload`, `PaperRead` | 12-2 §12.27.5, §12.28.3 |
| `DbOp`, `WritableTable`, `HardDeletable`, `NamedQuery`, `MainToEngine`, `EngineToMain`, `EngineToBridge`, `BridgeToEngine`, `NotificationRequest`, `VaultUseRequest`, `AttachmentPart`, `StateJson` | 08-1 §2.4, §4.1.2, §4.5 |
| `ErrorKind` | 08-3 §21 (three lists; §21.2 user-facing, §21.3 renderer-handled, §21.4 internal) — the only list |
| `Invokes`, `Events`, `InvokeChannel`, `EventChannel`, `EventPayload` | 08-1 §3.1.0 (`src/shared/ipc.ts`) |
| `Mood`, face geometry | 08-0 §B.2, 02-2 §F15.9 (`src/shared/face.ts`) |
| Everything in §3–§7 below | **this file** |

---

## §2 Row-type derivations not stated elsewhere

- `MessageRow.reactions[].by` = `'me'` when `reactions.by = 'user'`, `'foo'` when `'foo'`, else the helper id (DB2-13). The DB word is `user`; the wire word is `me`.
- `ChatRow.face: FaceRef`; for `kind='wa_mirror'` chats `face = 'letter:{first grapheme of the group subject}'` (03-shell-1 §3.4.5.1 draws the WhatsApp mark).
- `FaceRef` grammar (08-0 §E.7, DB2-17): `living:{style}` | `glyph:{emoji}` | `letter:{one grapheme, upper-cased where the script has case}` | `file:{chatId}`. The user's default face is `letter:` + the first grapheme of `user.firstName` (`Intl.Segmenter('en-IN', { granularity: 'grapheme' })`).
- `JobRow` drops `aiSessionId` and `doVerbs` is `Verb[]` (parsed JSON).
- `ConnectionRow` drops `vaultName` and `accountHash`; `SecretIndexRow` drops `target`; `MemoryFactView` drops `hash` (§3.6).

---

## §3 Value and view types (full shapes)

### 3.1 App and settings

```ts
type PublicSettings = Omit<Settings, 'dev' | 'flags'> & {
  install: Omit<Settings['install'], 'readiness'>;
  ai: Omit<Settings['ai'], 'providers'> & { providers: Partial<Record<ProviderId, { kind: 'plan' | 'key' | 'local'; lastVerifiedAt?: number; lastVerifyOk?: boolean }>> };
  window: Omit<Settings['window'], 'bounds'>;
  locked: SettingsPath[];                 // the 08-0 §A.2 locked paths, for the UI's lock chips
};
interface Bootstrap { settings: PublicSettings; chats: ChatRow[]; openChatId?: string; firstMessages: MessageRow[]; setup: SetupState; ai: AiStatus; spend: SpendSummary; connections: ConnectionRow[]; safeMode: boolean; features?: FeatureId[] }   // 08-1 §3.2 app:getBootstrap; `features` CR-0054 (08-4 §25.5 item 5b), absent = every feature
interface SetupState { complete: boolean; step: 0 | 1 | 2 | 3 | 4 | 5; interviewCard?: 'A'|'B'|'C'|'D'|'E'|'F'|'G'|'H'; answers: Partial<Record<0|1|2|3|4|5, unknown>> }   // 06-1 §2.0 numbering, never a 1–4 index
interface ReadinessResult { os: 'ok' | 'too_old'; disk: 'ok' | 'low'; webview2: 'ok' | 'missing'; edge: 'ok' | 'missing'; checkedAt: number }
interface AiStatus { primary: ProviderId | null; backup: ProviderId | null; displayName: string /* 08-0 §B.4 */; billing: 'plan' | 'key' | 'local';
  state: 'ok' | 'offline' | 'down' | 'signed_out' | 'limit' | 'key_invalid' | 'unverified'; resetAt?: number; lastVerifiedAt?: number; usingBackup: boolean; planUsedPct?: number | null }
interface DetectRow { providerId: ProviderId; found: boolean; version?: string; signedIn?: boolean; path?: string;
  state: 'looking' | 'testing' | 'works' | 'not_found' | 'not_signed_in' | 'signin_unfinished' | 'key_failed' | 'plan_limit' | 'slow' | 'offline' | 'needs_helper' | 'waiting_helper';   // = 06-1 §2.2 row states
  failKind?: ErrorKind }
type VerifyResult = { ok: true; providerId: ProviderId; displayName: string; billing: 'plan' | 'key' | 'local'; model?: string; verifiedAt: number }
  | { ok: false; providerId: ProviderId; kind: ErrorKind /* an AI_* kind of 08-3 §21.2 */; raw?: RawAiError };
interface RawAiError { providerId: ProviderId; http?: number; code?: string; message: string /* Redactor-scrubbed, ≤ 200 */ }
interface LogLine { t: number; lvl: 'info' | 'warn' | 'error' | 'debug'; mod: string; evt: string; ids?: { chatId?: string; jobId?: string; approvalId?: string }; kind?: ErrorKind; ms?: number }   // 08-3 §19.1
type UiEvent = { [E in EventChannel]: { event: E; payload: EventPayload[E] } }[EventChannel];
```

### 3.2 Money

```ts
interface SpendSummary {
  month: string;                           // YYYY-MM in settings.locale.timeZone
  aiSpentPaise: number | null;             // null when ai.primary bills by plan
  aiCapPaise: number; aiBilling: 'plan' | 'key' | 'local'; planUsedPct?: number;
  purchasesPaise: number; purchaseCapPaise: number; purchaseCount: number;
  byChat: { chatId: string | null /* null = "Private chats" */; title: string; paise: number }[];     // ai_turns grouped by chat_id; turns of a private chat or with chat_id NULL map to null
  byRoutine: { routineId: string; title: string; paise: number }[];
  purchases: { paymentId: string; activityId: string; payee: string; at: number; chatTitle: string; amountPaise: number }[];   // submitted + checking + succeeded (08-0 §H month rule)
  earliestMonth: string;                   // the month of settings.install.at
}
interface CostLine { turnId: string; purpose: AiPurpose; providerId: CostProviderId; costPaise: number | null; tokensIn: number | null; tokensOut: number | null; startedAt: number }
type PaymentMethodView = { kind: 'card'; label: string /* "Visa ••4242" (brand + last 4; 05 §0.4, X-116) */; secretName: string /* the {last4} part of foo/card/{last4} */ }
  | { kind: 'upi'; label: string /* "UPI vik•••@okhdfc" */ };
```

### 3.3 Permissions and helpers

```ts
interface Rule { id: string /* rule_ */; verb: 'use_app' | 'calendar_write' | 'mail_organise'; match: { app?: PermissionApp; calendarId?: 'primary'; labelOrFolder?: string };
  text: string;                            // the sentence shown in Settings → Permissions → "Rules I follow" and stored in activity.rule_text; built by main from
                                           // settings.permissions.rule_text.{verb}: use_app "Let {helper} use {App} without asking" · calendar_write "Let {helper} add to your calendar without asking" · mail_organise "Let {helper} move and label emails without asking"
  helperId?: string; createdAt: number; source: 'card' }
// mail_organise exists only in Rule.verb: its approvals row is verb='use_app' with fields.app='gmail' and fields.action='organise'.
interface HelperForm { name: string /* ≤ 20 */; jobText: string /* ≤ 120 */; goodResult?: string /* ≤ 120 */; faceRef: FaceRef; colorToken: string /* one of the ten 02 F2 helper tokens, '--h-terracotta' … '--h-ochre' (X-138) */;
  allowedApps: Record<'gmail' | 'gcal' | 'contacts' | 'whatsapp' | 'x' | 'outlook' | 'browser' | 'payments', boolean>; template?: 'trips' | 'money' | 'home' | 'family' }
interface ContactHit { id: string /* People API resourceName, or 'wa:{jid}' */; name: string; emails: string[]; phones: string[] /* E.164 where Google gives canonicalForm */; source: 'google' | 'whatsapp' }
```

### 3.4 Drafts, attachments, secrets

```ts
interface DraftFields { to?: string; subject?: string; body: string /* includes the signature text when the user kept it (X-84) */ }
interface Attachment { id: string /* att_ */; name: string; mime: string; bytes: number; path: string /* under {DATA}\data\inbox\ or {DATA}\data\drafts\{chatId}\ */; kind: 'image' | 'pdf' | 'doc' | 'other' }
interface PasteCatch { start: number; end: number; kind: 'ai_key' | 'web_key' | 'card' | 'otp' | 'password' | 'token'; mask: '••••' }   // 04-2 §22.4; mask is always exactly "••••"
```

### 3.5 Search

```ts
interface SearchHit { group: 'chats' | 'messages' | 'jobs' | 'files' | 'routines' | 'memory' | 'settings'; id: string; title: string; line?: string /* snippet; match wrapped in \u0001…\u0002 */; at?: number; view: View }
interface SearchResults { q: string; groups: { group: SearchHit['group']; total: number; hits: SearchHit[] /* ≤ 5 */ }[] }
```

### 3.6 Memory

```ts
type MemoryFactView = Omit<CamelCase<memory_index row>, 'hash'> & { fileLabel: string /* 'about-you.md' | 'people/{slug}.md' | 'preferences/{topic}.md' | '{helper name} notes' */; originLabel: string /* 08-3 §12.2 label */; onlyInChatTitle?: string /* scope='chat': the chat's title, Memory page line "Only in {chat name}" */ }
interface MemoryFilter { chip: 'all' | 'said' | 'guessed' | 'gmail' | 'whatsapp' | 'chat'; helperId?: string; last7?: boolean }   // 06-2 §7.3 chips (memory-filter data-row-id); q travels beside it in memory:list
interface MemoryChip { messageId: string; factIds: string[]; kind: 'saved' | 'guessed' | 'updated' | 'used' | 'not_saving'; text: string /* ellipsised at 48 by the renderer, full text here */; was?: string /* 'updated' only */; undoToken?: string; undoUntil?: number }   // 05-3 §5.17.1 rows
// MemoryCmd is withdrawn (X-111): the Memory page uses the memory:* invokes of 08-1 §3.2 directly.
```

### 3.7 Error fix actions

```ts
type FixAction =
  | { kind: 'retry' }                                          // "Try again" (NET_OFFLINE, AI_SERVICE_DOWN, UPDATE_FAILED, SEND_FAILED, OTP_TIMEOUT, UPI_TIMEOUT, UNKNOWN)
  | { kind: 'sign_in_ai'; providerId: ProviderId }             // AI_SIGNED_OUT
  | { kind: 'remind_at'; at: number }                          // AI_LIMIT
  | { kind: 'replace_key'; providerId: ProviderId }            // AI_KEY_INVALID
  | { kind: 'use_backup' }                                     // AI_SERVICE_DOWN, AI_NO_VISION
  | { kind: 'raise_cap'; which: 'ai' | 'purchase' }            // SPEND_CAP, CAP_PURCHASE
  | { kind: 'try_other_way' } | { kind: 'take_over' } | { kind: 'stop' }   // STUCK
  | { kind: 'resume_job' }                                     // CRASH_RECOVERY "Pick up where I left off"
  | { kind: 'start_normally' }                                 // SAFE_MODE
  | { kind: 'reconnect'; app: 'google' | 'outlook' } | { kind: 'link_whatsapp' }   // CONN_EXPIRED, WA_UNLINKED, OAUTH_*
  | { kind: 'allow_scope'; scopes: ('gmail' | 'gcal' | 'contacts')[] }  // CONN_SCOPE_MISSING (X-120)
  | { kind: 'open_url'; url: string }                          // SITE_BLOCKED "Open the page myself", SITE_HANDBACK "Open {site}"
  | { kind: 'open_settings'; page: SettingsPage; row?: string }   // DISK_LOW, MIC_*, CLOCK_WRONG, SECRET_EXISTS; a Windows page is row 'windows:{WindowsSettingsPage}'
  | { kind: 'open_chat'; chatId: string; cardId?: string }
  | { kind: 'repair_app' }                                     // BROWSER_MISSING
  | { kind: 'try_another_card' } | { kind: 'pay_with_upi' } | { kind: 'checked_try_again' }   // payment kinds
  | { kind: 'dismiss' };                                       // OK / none
```
The 08-3 §21.2 "One button" column maps 1:1 onto these kinds (that table names the kind per row); 05's error card renders the label from `errors.{kind_lower}.button`. The AI may fill only `retry`, `open_url` (an http(s) URL that appeared in a tool result of this job) and `dismiss` in `StepDecision.fail.alternative`; anything else from the AI → the engine substitutes `dismiss` and logs `PROTOCOL_FIX_ACTION` (internal kind, 08-3 §21.4).

### 3.8 Jobs and held items

```ts
interface StopReport { jobId: string; done: ActivityRow[]; nothingDone: boolean }
interface HeldItemPayload { text: string /* the redacted line that would have been posted, ≤ 240 */; why: NonNullable<MessageRow['why']>; open: BriefAction /* what Review does */;
  ref: { routineId?: string; suggestionKey?: string; factIds?: string[]; capWhich?: 'ai' | 'purchase' } }   // held_items.payload (08-0 §G.17); the brief 'held' candidate: facts = { text }, sourceRef = held_items.id, allowedActions = ['Review'] → payload.open
```

---

## §4 Card payload members and routine templates

### 4.1 Card payload members owned here (08-1 §4.5 lists the union and points here for these)

```ts
interface BillPayload { billId: string /* bill_{UUIDv7} */; biller: string; billerSite: string /* registrable domain from billers.json or the sender domain */; payUrl?: string;
  amountPaise: number; dueOn: string /* YYYY-MM-DD */; accountMasked?: string /* "••••4821" */; period?: string /* "Sep 2026" */;
  source: BillSource; sourceRef?: string /* gmail message id, wa message id, or '' */; sourceAttachmentId?: string /* att_, J28 */;
  receivedAt: number; alsoReceived: number[] /* epoch ms of folded duplicate emails, 05 §5.29 rule 5 */; remindAt?: number;
  duplicate: boolean; scam: boolean; lastPaid?: { amountPaise: number; at: number; paymentId: string }; paidAt?: number }
interface TablePayload { title: string; columns: { key: string; label: string; align: 'left' | 'right'; unit?: 'inr' | 'text' | 'date' | 'time' }[]; rows: Record<string, string | number | null>[] /* ≤ 50 */; sourceLine?: string; bestRowIndex?: number }
interface FilePayload { fileId: string /* files.id */; name: string; mime: string; bytes: number; path: string; madeBy: 'foo' | string /* helper id */; kind: 'made' | 'received' | 'downloaded' }
interface LinkPreviewPayload { url: string; domain: string; title: string; description?: string; imageRef?: string /* {DATA}\data\inbox\{att_}-preview.jpg */; fetchedAt: number }
interface PlacePayload { name: string; address: string; phone?: string; hoursLine?: string; mapsUrl: string /* https://www.google.com/maps/search/?api=1&query={encodeURIComponent(name + ', ' + address)} */; rating?: string }
interface ConnectPayload { variant: 'google' | 'whatsapp' | 'outlook' | 'one_app' | 'allow_send' | 'contacts_only'; app: ConnectorApp; why?: string /* 'one_app' only */;
  scopes?: ('gmail' | 'gcal' | 'contacts')[] /* google = all three; allow_send = ['gmail']; contacts_only = ['contacts'] */; setupCard?: 'D' | 'E' }
interface SetupCardPayload { setupCard: 'welcome' | 'ai_finder' | 'name' | 'face' | 'apps' }   // card type 'setup' (08-0 §G.1, X-119); 'whatsapp_link' withdrawn: Card E is ConnectPayload { variant: 'whatsapp', setupCard: 'E' } (X-139); interview cards A–H keep their own types with payload.setupCard 'A'…'H'
type RoutineOfferPayload = /* 05-3 §5.14 fields */ & { source: RoutineOfferSource };
type ChoicePayload = /* 05-1 §5.3 fields */ & { purpose: ChoicePurpose; aiReversible: boolean; reversible: boolean };
```

### 4.2 Card payload members owned elsewhere
`CatchUpPayload` 12-2 §12.27.5. Every other member: 08-1 §4.5.

### 4.3 Routine built-ins and idea templates

```ts
type BuiltinTask =
  | { kind: 'pnr_watch'; pnr: string /* 10 digits */; trainNo?: string; trainName?: string; from?: string; to?: string; departureAt: number /* epoch ms */; travellers: number; lastStatus?: string /* normalised, = routine_runs.observed.value */; chartPrepared: boolean }
  | { kind: 'recharge_due'; billerSlug: string; idLast4: string; planEndsOn: string /* YYYY-MM-DD */; lastPaymentId?: string }
  | { kind: 'bill_watch'; connectionId: string }               // X-115
  | { kind: 'morning_brief' } | { kind: 'memory_tidy' };
// RoutineTask (08-3 §13.2) gains `builtin?: BuiltinTask`; a row with routines.builtin set has task_spec.builtin.kind = routines.builtin (zod refinement).
// Duplicate check for builtins compares builtin.kind + pnr / billerSlug+idLast4 / connectionId only.
type RoutineDraftTemplate = Omit<RoutineDraft, 'title' | 'tz' | 'whereChatId' | 'condition'> & { titleKey: string /* screen.ideas.tile.{id}.title */; askSlots: string[] /* names substituted into task.prompt from the Asks answers */ };
// ideas.json (08-0 §E.5): title = t(titleKey) (+ 12-1 §12.24.4 suffix rules), tz = settings.locale.timeZone, whereChatId = the owner chat; condition is derived by the engine from conditionText (08-3 §13.2.1). The ten task prompts are 12-1 §12.24.4.
```

---

## §5 Renderer store (Zustand) — data slices (X-117)

One store, `src/renderer/store/index.ts`, with `immer`; one file per slice in `src/renderer/store/`. `ui` and `live` slices: 08-0 §G.10. Data slices:

```ts
chats.ts        { byId: Record<ChatId, ChatRow>; order: ChatId[]; selectedId: ChatId | null }
messages.ts     { byChat: Record<ChatId, { ids: MessageId[]; byId: Record<MessageId, MessageRow & { pending?: boolean; clientId?: string; status?: 'sending' | 'failed' }>; oldestSeq: number | null; hasMore: boolean; lastSeq: number }> }
cards.ts        { byId: Record<CardId, CardRow> }
jobs.ts         { byId: Record<JobId, JobRow>; byChat: Record<ChatId, JobId[]> }
connections.ts  { rows: ConnectionRow[] }           // mirrors Bootstrap.connections
spend.ts        { summary: SpendSummary }           // mirrors Bootstrap.spend; spend:update replaces it
settings.ts     { value: PublicSettings }           // settings:changed replaces it
```
Rules:
1. Events from `src/shared/ipc.ts` are applied by exactly one reducer per channel in `store/apply.ts`; components never call `window.foo` (lint `foo/no-window-foo`). Selectors sit beside their slice as `selectX` functions; components never read `useStore(s => s)`.
2. **rev rule** (08-0 §B.1): a patch is applied only when `patch.rev > stored.rev`; a patch whose `rev > stored.rev + 1` is applied and logged `rev gap` once per chat per session (no resync: patches are whole rows).
3. **Optimistic send.** `message:send` inserts `{ id: clientId, clientId, pending: true, status: 'sending' }` at once; the reply re-keys it to `messageId` in `byId` and `ids` in place (`key={clientId}` stays stable, no re-sort); no reply within 15 s → `status: 'failed'` with the 04 §4 retry affordance; it is never removed on its own.
4. **Deltas.** A `message:delta { messageId; seq; append }` with `seq === last + 1` is appended; a gap buffers the delta and sends one `message:get { messageId }` to resync, then replays the buffer; `seq ≤ last` is dropped.
5. **Pagination.** The first open shows the newest 50 messages (from `chat:open`); reaching 400 px from the top with `hasMore` calls `message:list { chatId; beforeSeq: oldestSeq; limit: 50 }`; the virtual list keeps the scroll anchor by measured height (03 §3.6.4).
6. **Read marks.** 03 §3.9.6 (`chat:markRead` rule, X-117).

---

## §6 `foo-native` exports (the literal list; 08-0 §E.2 points here)

`native/foo-native/index.d.ts`, loaded in main only; every export has a JS fallback that returns the "unsupported" value named:

| Export | Source | Fallback |
|---|---|---|
| `assignToJobObject(pid: number): void`, `killJobObject(pid: number): void` | `jobobject.cc` | no-op |
| `verifyUser(message: string, hwnd?: number): Promise<'verified' \| 'canceled' \| 'retries_exhausted' \| 'device_busy' \| 'unavailable'>` (09 §9.19.2; the one return set, X-111) | `hello.cc` | `'unavailable'` |
| `synthesize(text: string, lang: string, outPath: string): Promise<void>` | `speech.cc` | rejects `VOICE_UNAVAILABLE` |
| `networkCost(): 'unrestricted' \| 'fixed' \| 'variable' \| 'unknown'` | `netcost.cc` | `'unknown'` |
| `toastRemove(tag: string, group: string): void`, `toastRemoveGroup(group: string): void`, `toastClear(): void` | `toasthistory.cc` | no-op |
| `toastSetting(): 'enabled' \| 'disabled_app' \| 'disabled_user' \| 'disabled_policy' \| 'disabled_manifest'` | `toastsetting.cc` | `'enabled'` |
| `textScaleFactor(): number`, `watchTextScale(cb: (f: number) => void): void` | `textscale.cc` | `1`, no-op |
| `keyboardLayouts(): string[]` | `keyboard.cc` | `[]` |
| `focusActive(): boolean \| null` | `focus.cc` | `null` |
| `trackWindow(hwnd, cb): number`, `untrackWindow(id): void`, `findWindowByPid(pid, titlePrefix?): number \| null` (08-0 §E.2) | `wintrack.cc` | `-1`, no-op, `null` |
| `ocrRead(path): Promise<OcrResult>`, `blackout(inPath, outPath, rects): Promise<void>` (08-0 §E.2, §G.18) | `ocr.cc` | `{ status: 'unavailable', lines: [] }`, rejects |

All constants use AUMID `com.foo.desktop`.

---

## §7 Canonical JSON, nonces, ids

- `canonicalJson(v)` lives in `src/shared/canon.ts` and is **RFC 8785 (JCS)**: keys sorted by UTF-16 code units recursively, no whitespace, numbers as the shortest round-trip form. It is the one function used for `approvals.fields_hash`, `tool_calls.idem_key`, `suggestions` subjects (`suggest:{sha8}`) and the fake-AI `match` hashes (DB2-18).
- `idem_key = sha256(jobId + '|' + stepId + '|' + tool + '|' + canonicalJson(args) + '|' + (approvalId ?? ''))`, hex (X-113).
- `nonce` = 32 lower-case hex chars from `crypto.randomBytes(16)`.
- Ids: `{prefix}_{UUIDv7}` per 08-0 §E.7 (adds `bill_` for `BillPayload.billId`).

---

## §8 Contract tests (08-3 §22, run in CI)

1. Every member of `WritableTable`, `NamedQuery`, `CardType`, `ErrorKind`, `SuggestionKind`, `InvokeChannel` and `EventChannel` is a string literal that appears in exactly one owning section (this file, 08-0 or the chapter named in §1); a literal in `src/` that is not in the union fails the build (`foo/error-kind-closed`, `foo/testid-from-registry`).
2. `src/shared/types.ts` carries a header comment listing its sources (08-0 §A–§G, 08-5, 08-1 §2.4/§4.5, 08-2 §6.2/§9.3, 08-3 §12.4/§13.2/§14.3/§21, 08-4 §25, 12-2 §12.27.5); any `review/` path in that comment fails the lint.
