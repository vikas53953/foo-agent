# 08 · Functions and engine — Part 3 of 3: memory, routines, brief, notifications, connectors, privacy, budgets, errors, tests

Read Parts 1 and 2 first. Section numbers continue from Part 2.

---

## §12. Memory

### 12.1 What is saved (and what is not)

| Saved | Where (under `{DATA}\memory\`) | Provenance (`MemoryProvenance`, 08-0 §B.2) · writer |
|---|---|---|
| Facts the user states about themselves ("I'm allergic to peanuts") | `about-you.md` | `said` · post-turn review (§12.4), intake "remember…", Memory page |
| Facts about people ("Mom's birthday 18 Oct") | `people\{slug}.md` (slug rule §12.2) | `said`, or `guessed` when the origin is Gmail/WhatsApp (§12.3) · review, intake, Memory page |
| Preferences inferred from ≥ 2 consistent events ("Prefers window seats · from 4 bookings") | `preferences\{topic}.md` (topic list §12.2) | `guessed` with reason · review |
| Style stats (casing, length, emoji rate, greeting/sign-off) | `preferences\style.md` | `guessed`, reason "from your last 20 messages" · **engine only** (§12.9); never shown as chips, never in groups |
| Brief preferences ("more of / less of", hidden card kinds) | `preferences\brief.md` | `said` · brief feedback (§14.5) and the Memory page |
| foo's identity | `identity.md` | `said`, origin `setup` · setup and Profile page |
| Helper working notes (bills, trips, bookings) | `helpers\{id}\notes.md`, §12.2 line format, indexed with `scope='helper'` | engine on DONE, post-turn review in the helper's chat, the user (§17.5) — nothing else writes it; there is no AI `helper.note` tool |

**Never saved** (MUST): secret values (Art. 8); one-off task data (bills found go to Money's notes, not about-you — J5); a **sensitive** fact (§12.4.1) with provenance `guessed` — sensitivity is decided by the engine's deterministic rule, never by the AI's `category` label (J17 step 3, AT-076); anything said after "don't remember this" in the same message or the next one (J17 branch); facts whose hash has a live tombstone for the same origin kind (90 days, J17). A sensitive fact with provenance `said` is saved with `private` forced on (R-33, 08-0 §B.2 note). A private chat (`chats.private=1`) never saves memory, never offers review, never creates routines; on end (dialog C-23) its messages are deleted (12-2).

### 12.2 File format (user-readable, Notepad-editable; OCL §2.4, INS §4.4)

```markdown
# About you
- Vegetarian on Tuesdays  {you said · 2026-10-02 · chat · f_01929a3e-7c41-7d2a-9b1e-3f5a2c8d4e61}
- Prefers window seats  {I guessed · 2026-10-09 · from 4 bookings · f_0193b2c4-1a07-7e3f-8c55-0d9e6f7a1b22}

## Private
- Lives at 14 Hill Road, Bandra  {you said · 2026-10-03 · chat · private · f_0194c1d0-5e22-7f10-a3b4-6c7d8e9f0a13}
```
Parser: a fact is a line `^- (.+?)\s{2}\{(.+)\}\s*$`; the brace holds ` · `-separated tokens: provenance (`you said` = `said` | `I guessed` = `guessed`), ISO date, origin label, optional `from …` reason, optional `kind` (`person`|`preference`|`place`|`fact`; when missing it is derived from the file: `people\` → person, `preferences\` → preference, otherwise fact) [settled: X-06], optional `private`, optional `chat:{chatId}` (only in `about-you.md`: the fact has `scope='chat'` and is offered only in that chat; the indexer writes `memory_index.chat_id` = that id, X-112, 08-0 §B.2), and the id. **Origin labels** map 1:1 to `MemoryOrigin` (08-0 §B.2, X-57): `chat`→`chat`, `gmail`→`Gmail`, `gcal`→`Calendar`, `whatsapp`→`WhatsApp`, `manual`→`you typed it`, `setup`→`setup`, `job`→`a task`; the parser accepts exactly these seven labels (case-sensitive) and the Memory page filter shows the same words. **Ids** are written in full: `f_` + the complete UUIDv7 (08-0 §E.7), never truncated (the `f_0192…` style is not legal in a file). Lines without braces that start with `- ` are accepted as **you said, today, `manual`** facts (the user typed them in Notepad) and receive their id and brace **at reindex time** (§12.2 watcher; the file is rewritten once, atomically), not "on the next write". **Private:** the `private` token is authoritative; the `## Private` heading is cosmetic and is rewritten from the tokens on every write; a line found under `## Private` without the token gains the token at reindex. **Slugs and topics:** `people\{slug}.md` slug = the person's name as the user wrote it, NFKC, lower-cased, spaces → `-`, characters outside `\p{L}\p{N}-` removed, ≤ 40 chars, Devanagari/Gurmukhi kept as written (`people\माँ.md` is legal); then `safeName()` (08-0 §E.7). `preferences\{topic}.md` topic ∈ `travel, food, shopping, work, home, family, style, brief, other`; anything else → `other`. Unparseable lines are kept untouched in the file and reported (J17 "I couldn't read 2 lines in about-you.md. [ Show them ]"). Files are UTF-8 with BOM-less LF on write; CRLF tolerated on read (FOO-PRD W5). The origin's full reference (`chat:{chatId}/{messageId}`, `gmail:{id}`) is kept in `memory_index.origin`, not in the file, so the file stays readable. `memory_index.file` values are relative to `{DATA}` with forward slashes (08-0 §0, §G.17): `memory/about-you.md`, `memory/identity.md`, `memory/people/{slug}.md`, `memory/preferences/{topic}.md`, `helpers/{h_id}/notes.md`. `[foo decision]`

Writes: atomic (temp + replace), through main (`file.write`). A file watcher (`fs.watch` on `{DATA}\memory`, debounced 500 ms) re-indexes changed files; the next AI turn uses the edited text (J17 acceptance).

### 12.3 Provenance rules ("You said" vs "I guessed" [settled: X-05]; TAB §9.10)
- `said` ("You said") requires `evidenceMessageIds` containing at least one message with `author_kind='user'` whose text contains the fact's key content (checked by token overlap ≥ 0.6 after normalisation), or a manual edit/add in the Memory page. An edit always turns a fact into `you said · {today}` (J17).
- `guessed` ("I guessed") requires ≥ 2 distinct evidence events (messages, bookings, choices) and a `reason` string ("from 4 bookings"). One booking is never enough (J9 Stored).
- `memory_index.provenance` stores `said` or `guessed`; AI-inferred facts are `guessed` (08-0 §G.17).
- Facts from Gmail/WhatsApp/Calendar content are `guessed` with origin `gmail`/`whatsapp`/`gcal` unless the user confirmed them in chat (J17 filter "From Gmail").

### 12.4 Post-turn review (Hermes background review, HRM §3.1, HRM-SRC `agent/background_review.py`)
Trigger: after a chat-lane reply or a job finishing, when the chat has ≥ 1 new user message since the last review, debounced to 20 s of quiet in that chat, at most once per chat per 2 minutes, background lane, only if `privacy.learnFromChats`. Skipped when the spend cap is reached.
Input: the new messages since the last review (redacted), the current facts in the same scopes (≤ 4,000 chars), tombstone hashes. Output `<act>`:
```ts
interface MemoryReviewAct { ops: (
  | { op: "add"; scope: MemoryScope /* 08-0 §B.2: global | chat | helper */; text: string /* ≤ 120 chars, third person-free plain sentence */;
      provenance: MemoryProvenance /* said | guessed */; evidenceMessageIds: string[]; reason?: string;
      category: MemoryCategory /* closed list, 08-0 §B.2 */; kind: MemoryKind; person?: string /* name as the user wrote it; required when kind='person' */;
      private: boolean /* a request only; the engine may force it on, never off for a sensitive fact */ }
  | { op: "update"; factId: string; text: string; evidenceMessageIds: string[] }       // supersede, never append (OCL §9.7)
  | { op: "nothing" } )[] }
```
File placement is the engine's, never the AI's: `scope='helper'` → `helpers\{id}\notes.md` of the chat's helper; `kind='person'` → `people\{slug(person)}.md`; `kind='preference'` → `preferences\{topic}.md` (topic = the category when it is a legal topic, else `other`); otherwise `about-you.md`. `scope='chat'` → `memory/about-you.md` with the brace token `chat:{chatId}` (§12.2); `memory_index.chat_id` = that id; in foo's 1:1 chat a `scope='helper'` add is coerced to `'global'` and logged `memory.scope_coerced`. `identity.md` is never a scope: its rows are `scope='global'` (X-112). `scope` is one of 08-0 §B.2's three values and never a file path. An op with a `category` outside `MemoryCategory`, or `kind='person'` without `person`, is rejected.
**Manual add** (`memory:add`, 06-2 §7.3; X-112): the engine runs one `classify` turn whose `<act>` is `{ category: MemoryCategory; kind: MemoryKind; person?: string }` (strict); the fact is saved with provenance `said`, origin `manual`, scope `global`; on any AI failure or offline → kind `fact`, category `other`. The sensitive rule §12.4.1 runs regardless.

#### 12.4.1 Sensitive facts (engine rule, deterministic; AT-076, R-33)
Run on every add/update/manual edit **before** the AI's label is read. A fact is **sensitive** when (a) its `category` ∈ {`health`, `money`, `religion`, `politics`, `family`} (08-0 §B.2), **or** (b) its text matches any of these patterns (case-insensitive, NFKC; Latin and Devanagari/Gurmukhi forms):
- health `/\b(allerg|diabet|bp|blood pressure|thyroid|pregnan|asthma|depress|anxiet|medicine|tablet|dose|doctor|hospital|surgery|disease|hiv|cancer)\w*|एलर्जी|दवा|डॉक्टर|बीमार|ਦਵਾਈ|ਡਾਕਟਰ/`
- money amounts `/₹\s?\d|\b(rs\.?|inr|rupees?|lakh|crore|salary|loan|emi|debt|balance)\b|रुपय|तनख्वाह|ਤਨਖ਼ਾਹ/`
- religion `/\b(hindu|muslim|sikh|christian|jain|buddhist|temple|mosque|church|gurdwara|fast(ing)?|roza|vrat|puja|namaz)\b|मंदिर|मस्जिद|पूजा|ਗੁਰਦੁਆਰਾ/`
- politics `/\b(bjp|congress|aap|vote[sd]?|party|election|modi|rahul|kejriwal)\b|चुनाव|वोट|ਵੋਟ/`
- another person's contact details: `/(\+91[\s-]?\d{5}[\s-]?\d{5}|\b\d{10}\b|\b\d{6}\b.*(road|nagar|colony|sector|street|marg)|lives? at|address)/` **and** the fact is `kind='person'` or names a person other than the user (a `people\` file, or a name found in `contacts_index`).

Sensitive **and** `guessed` → dropped (logged `memory.dropped_sensitive`, no chip). Sensitive **and** `said` → saved with `private` forced on. The AI's `category` is stored for the Memory page filter and never decides saving. The same rule runs on manual adds in the Memory page (the user may turn `private` off there by hand; that is the user's choice, Art. 15).

#### 12.4.2 Chip
Accepted ops → file write → memory chip (`messages.kind='marker'`, `marker_kind='memory_chip'`, 08-0 §G.1) "I'll remember: {fact} · Undo" (said) or "I'll remember: {fact} · I guessed · Undo" (guessed), with the `Brain` icon (05 §5.17) [settled: X-05] (C14, J17). **Placement (R-20):** under the foo bubble that followed the evidence; when no foo bubble followed (foo only reacted 👍) it is a system line directly under the user's bubble that carried the fact; `MemoryChip.messageId` names that bubble. With `privacy.askBeforeRemembering` each op becomes a Choice card instead (`choice.purpose='memory_confirm'`, 08-0 §G.1): "Remember that {fact}?" [ Remember ] [ Don't ]. Review prompt instruction (fixed, `resources/prompts/`): "Save only facts that will matter in future conversations. If nothing is worth saving, return {op:"nothing"}."
Explicit requests ("remember…", "forget…") are handled by intake directly (`IntakeDecision.memory`), not by the review.

### 12.5 Using memory
Retrieval per turn (§7.2 part 5). The AI lists the fact ids it relied on in `usedMemoryIds`; the engine validates ids and shows "Used: {fact} ✕" under the reply (C14) for at most 2 facts, preferring `guessed` ones; ✕ → forget (J17 "Forgot it. I won't use that again."). `last_used_at`/`use_count` update. Private facts and `about-you` facts are never put into a group-chat turn (Art. 14).

#### 12.5.1 Sharing one fact into a group (J16 branch "Helper wants to share a fact")
A helper turn in a group may call the tool `memory.askShare { factId; groupChatId; why: string /* ≤ 80 chars */ }` (class `prepare`; tool row owned by 08-2 §8.2). The engine posts in that helper's **1:1** chat a Choice card (`choice.purpose='memory_confirm'`, `reversible:false`, prompted): "Okay to tell the {Goa trip} group {you're vegetarian on Tuesdays}?" [ Yes ] [ No ]. **Yes** → a grant row `memory_group_grants(fact_id, chat_id, until = now + 24 h)`; the fact is included in that group's prompts until `until`, and the helper's next turn receives it. **No** → never asked again for that fact and group (suggestion key `memory_share:{factId}:{groupChatId}`, 08-0 §G.13, Art. 20). A fact that is sensitive under §12.4.1 (category ∈ {health, money, religion, politics, family} or a pattern hit) cannot be shared even on Yes (X-112): the tool returns `PRIVATE_BLOCKED` and the helper says "That one stays between us." The group never sees the question. Only `memory.askShare` can open this path; there is no other way a private fact reaches a group.

### 12.6 Forget, undo, tombstones
`forget(factId)` deletes the line, writes tombstone `{hash, origin_kind, forgotten_at, expires_at = +90 d}` to the DB and `memory\.tombstones`, and returns an undo token valid 5 s (J17 "Forgot '…' · Undo"); undo restores the exact line at its old position. `forgetBySource('gmail')` deletes every fact whose `origin_kind='gmail'` (J17). `forgetAll` deletes all memory files except `identity.md` and all helper notes (J17 "including helpers' notes").

### 12.7 Nightly tidy (OpenClaw dreaming OCL §2.4; J17 step 4)
Built-in routine `memory_tidy`, daily 03:00 user time; if the PC was off/asleep, runs once after the next 10 minutes of user idle (`powerMonitor.getSystemIdleTime() ≥ 600`). Steps: (1) exact/near-duplicate merge (same scope, normalised text similarity ≥ 0.9; keep newest `said`); (2) conflict detection: the engine groups facts by **entity** = the `people\{slug}` file, else the first noun phrase after `lives in|works at|birthday|allergic to|prefers|drives|married to|phone|address|email`, and sends only groups with ≥ 2 facts to one cheap AI turn (`purpose 'tidy'`) whose `<act>` is `TidyAct { conflicts: { factIds: [string, string]; entity: string; keep?: string /* factId when sure */; ask?: { question: string; options: [string, string] } }[] }` (schema row in 08-2 §7.4). Keep the newest `said`; if both are `guessed` or the AI returns `ask` → one Choice card (`choice.purpose='conflict'`, `reversible:false`) in **foo's** chat, delivered as an unprompted item (§15.2 step 5, held for the brief when over budget), e.g. "Do you live in Pune now, or Mumbai?" (J17); its answer edits the kept fact to `you said · {today}` and forgets the other (tombstone, §12.6); (3) drop `guessed` facts unused for 180 days `[foo decision]`; (4) append a human-readable entry to `memory\.tidy-log.md` ("Merged 2 duplicates · Asked about 1 conflict"); (5) count facts learned this week for Monday's brief item (`BriefKind 'memory_week'`, §14.7) "This week I learned {n} things about you. See them" (J17).

### 12.8 Functions

| Function | In | Out | Errors | J | Art |
|---|---|---|---|---|---|
| `memory.parseFile` / `writeFile` | `path` / `facts` | `Fact[]` + bad lines / `void` | `MEMORY_PARSE` | J17 | 15 |
| `memory.reindex` | changed paths | `void` | — | J17 | 15 |
| `memory.retrieve` | `chatId, query, isGroup` | `Fact[]` | — | J7, J9 | 14 |
| `memory.review` | `chatId` | `MemoryOp[]` applied | `NET_OFFLINE`, `AI_SERVICE_DOWN`, `AI_SIGNED_OUT`, `AI_LIMIT`, `AI_KEY_INVALID`, `SPEND_CAP` (review skipped) | J7, J17 | 15 |
| `memory.add` / `edit` / `forget` / `undo` / `forgetBySource` / `forgetAll` | see IPC §3.2 | — | — | J17 | 15, 20 |
| `memory.tidy` | — | `TidyReport` | — | J17 | 15 |
| `memory.askShare` | `{ factId, groupChatId, why }` | Choice card in the helper's 1:1 | `PRIVATE_BLOCKED` | J16 | 14 |
| `memory.styleStats` | `chatId` (foo's chat) | up to 4 `guessed` facts in `preferences\style.md` (CR-0037) | — | J7 | 23 |

### 12.9 Style stats (engine only; AI-24 ruling, 08-0 §H)
Computed by the engine, never by the AI, after every 20th user message in foo's chat (counter on `messages` of that chat), over the last 20 user text messages: average length in characters (integer); casing `lower` (≥ 80 % of messages have no capital letter) / `sentence` (≥ 80 % start with a capital) / `mixed`; emoji rate (emoji per message, one decimal); greeting and sign-off (most frequent first and last token across the 20, only when it appears in ≥ 5 of them). Written as up to four lines in `preferences\style.md`, each `guessed`, reason "from your last 20 messages", replacing the previous ones (supersede, not append). A measure that found nothing gives no line (CR-0037, X-195): no casing line for `mixed`, no emoji line when the rate is 0.0; and no lines at all, the previous ones kept, until there are 20 non-blank user text messages to measure. They are never shown as memory chips and never in groups. They are ordinary pinned facts of part 5 (08-2 §7.2; file `memory/preferences/style.md`), nothing more; there is no separate prompt part.
---

## §13. Routines scheduler

### 13.1 Rules (J14; GPT §2 four fields; GRK §4.5)
A routine = what to check · how often (with time zone) · tell me only if… · where · approval boundary. Routines **never** send, buy, book, post or delete on their own: their job's gate has `intent='read_only'` forced, and a firing that needs action ends in a card (J14 branch "I never pay on my own"). Limits: minimum interval **15 min** (J14 "The fastest I check is every 15 minutes."), max **25** routines, active hours `settings.routines.activeFrom`–`activeTo` (default 07:00–22:00, 08-0 §A.1; J14 step 4). Away pause, catch-up and keep-awake follow `settings.routines.pauseWhenAway`, `catchUp` and `keepAwake` (08-0 §A). Routines may not be created or fire in a private chat (`chats.private=1`). "Ideas" (`foo://ideas`, X-110) creates routines with `created_from='idea'` via `routine:startIdea`. **Deleted routines (X-129):** `state='deleted'` rows are excluded from `routine:list`, `routinesDue`, the Routines page and the 25-routine count; `routine:delete` hard-deletes the routine's `routine_runs` (C-9 "Its history goes too") and deletes `routines\{id}.json`; the `routines` row stays (FKs from `ai_turns`, `activity`).

### 13.2 Types
```ts
type Schedule =
  | { kind: "interval"; everyMin: number /* ≥ 15 */; anchor: number }
  | { kind: "daily"; at: "HH:MM"; days: (0|1|2|3|4|5|6)[] }
  | { kind: "monthly"; day: number /* 1–28 or -1 = last */; at: "HH:MM" }
  | { kind: "once"; at: number }
  | { kind: "on_email"; connectionId: string; match: { fromDomain?: string; subjectAny?: string[] } };   // "when the bill arrives" (J11)
interface RoutineTask { prompt: string; tools: ToolName[]; site?: string; fastPath?: FastPath; builtin?: BuiltinTask /* 08-5 §4.3 */ }
interface Condition { metric: "price_inr" | "number" | "text" | "count" | "status"; op: "<" | "<=" | ">" | ">=" | "==" | "changed" | "found"; value?: number | string; unit?: string }
interface FastPath { kind: "page_number"; url: string; selectorHint: string /* role + accessible name */; parse: "inr" | "number" }   // learned on the first run (§13.4.2)

// The single routine schema (08-0 §B.3, AI-05). Intake (08-2 §5.3.2 kind "routine") returns RoutineDraft;
// "change my BTC routine…" returns RoutinePatch. Nothing else creates or edits a routine from words.
interface RoutineDraft { title: string /* ≤ 40 */; whatText: string; task: RoutineTask; schedule: Schedule; tz: string /* IANA */;
  conditionText?: string; condition?: Condition /* ignored on input; always derived by the engine, §13.2.1 */;
  urgentText?: string /* the user's own words that ask for night-time alerts; the engine derives urgent, never the AI */;
  whereChatId: string; deliverToast: boolean }
interface RoutinePatch { routineId: string } & Partial<Pick<RoutineDraft, "title" | "whatText" | "task" | "schedule" | "tz" | "conditionText" | "urgentText" | "whereChatId" | "deliverToast">>
// Step turns of a routine run (purpose 'routine', background lane). Row in 08-2 §7.4.
interface RoutineStepAct { decision: StepDecision | { kind: "routine_result"; fire: boolean; message?: string /* ≤ 200 chars */;
  evidence: string[] /* tool call ids */; observed?: { metric: Condition["metric"]; value: number | string; unit?: string }; fastPath?: FastPath } }
```
**Built-in task data (X-115, X-131; `BuiltinTask` = 08-5 §4.3).** A row with `routines.builtin` set has `task_spec.builtin.kind = routines.builtin` (zod refinement). The duplicate check for builtins compares `builtin.kind` + `pnr` / `billerSlug`+`idLast4` / `connectionId` only. `pnr_watch`: the 30-min interval starts at `departureAt − 12 h`; `chartPrepared` is set by the run that saw the chart. `recharge_due`: `planEndsOn` is rewritten by the recharge job's COMPLETED payment (`lastPaymentId`) or by the 'When does the new plan end?' answer (12-1 §12.26.7).

#### 13.2.1 Validation of a RoutineDraft / RoutinePatch (engine)
The engine validates: `schedule.everyMin ≥ 15` (else `INTERVAL_TOO_SHORT`, copy "The fastest I check is every 15 minutes."), ≤ 25 routines (`ROUTINE_LIMIT`), `tz` is IANA (else `settings.locale.timeZone`), `title` ≤ 40, `whereChatId` exists. **Condition** is filled by the engine, never taken from the AI: `conditionText` is matched against `^(below|under|less than|above|over|more than|changes?|found|is)\s+(.+)$` (case-insensitive; Hindi/Hinglish equivalents "se kam" → below, "se zyada" → above) → `op` ∈ {`<` (below, under, less than), `>` (above, over, more than), `changed`, `found`, `==` (is)}; the value via `parseInr` (₹, lakh, crore) → `metric 'price_inr'`, else `Number` → `metric 'number'`, else text → `metric 'text'`. No match → `condition = null` and the routine runs Path B only. A missing or invalid field → one Choice card per field in the chat (J14 step 2). A RoutinePatch is applied with the same checks; the Routine card is edited in place (`rev + 1`), not reposted.
**`urgent` (X-131)** is set by the engine only, never by the AI: `urgent = true` when `whatText`, `conditionText` or `urgentText` matches (case-insensitive, NFKC) `/(even at night|even in quiet hours|wake me|any time of (the )?night|raat ko bhi|kabhi bhi jaga)/`, or when the routine is a builtin listed as urgent in §13.7a (`pnr_watch` Tatkal and booking-open reminders); otherwise false. The Routine card (05-3 §5.13) shows the row "Urgent — even in quiet hours" (copy owned by 05-3 §5.13) only when `urgent=1`; 06-2 §8.3's toggle edits the same column.
**Metrics `count` and `status`** are set only by builtins (§13.7a) and by `RoutineStepAct.observed`; the word parser never produces them (X-131).

### 13.3 Tick
Every 15 s (OMB-03 §7 "Scheduler ticks every 15 s"): for each routine `state='on'` with `next_run_at ≤ now`: skip if outside active hours (move `next_run_at` to the next active start); skip if spend cap reached (`paused_cap`, J14 branch); routine runs use the **background lane**: at most 1 routine run at a time (others wait in `next_run_at` order), never counted in the 3 WORKING slots of user jobs, and never started while 3 user jobs are WORKING (`skipped_busy`, retry in 5 min). Persist `last_run_at` **before** dispatch (dedupe; OMB-03 §7), compute the next `next_run_at` in the routine's `tz` (DST-safe: compute wall-clock time in tz, then convert). `once` routines move to `paused` after running. `on_email` routines are evaluated by the Gmail poller (§16.1), not the tick.
**`on_email` runs (X-131).** An `on_email` routine with `match = {}` is rejected at validation (`VALIDATION`, field `match`: "Tell me which sender or subject to watch for." `errors.validation.on_email_match`, X-136). On each new message id the poller evaluates `match` locally (`fromDomain` = sender domain, case-insensitive; `subjectAny` = any substring, case-insensitive) and only a hit starts a run (Path B, `routine` purpose) whose turn facts include the email as untrusted part 9 (08-2 §7.2; headers + first 2,000 chars of text). At most 5 runs per routine per day; further hits are summarised in the next brief.
**`bill_watch` (builtin, X-115; J11's entry point).** Created when the first Gmail account connects (first run Card B or Settings → Connections); owned by Money's chat (foo's chat while Money does not exist; re-parented to Money on its creation). Trigger `on_email` (`task_spec.builtin = { kind: 'bill_watch', connectionId }`): the sender domain or the `List-Unsubscribe` domain matches `billers.json`, **or** the subject/body matches the bill patterns of 08-4 §26.14 (X-136). Action: post one `bill` card (05-3 §5.29) after fold rule 5. Notification: follows Money's notification setting; default on. Shown in Routines as "Watch for bills" (`screen.routines.builtin.bill_watch`, X-136) with the usual Pause / Edit / Delete; deleting it posts "Okay, I'll stop watching for bills. Turn it back on under Ideas → Pay bills 3 days before." (`thread.bills.watch_stopped`) and removes the Ideas pill "On" (12-1 §12.24).

### 13.4 Run
Create a background job (`origin:'routine'`, no checklist, no badge), owner chat = routine owner. Path A (fast path present): fetch the page/connector value without the AI (Hermes `wakeAgent:false`, HRM §4) and evaluate `condition`. Path B: step turns with `purpose:'routine'` whose `<act>` is `RoutineStepAct` (§13.2); `decision` is a normal `StepDecision` (tool calls) until the AI returns `kind:'routine_result'`. Run outcome recorded in `routine_runs` (pruned to 20). `RoutineStepAct.observed` (08-0 §B.3) is stored in `routine_runs.observed` and compared with the latest earlier run that has one: no change → no message (`op 'changed'`; the first run never fires on `changed`, 08-0 §G.17).

#### 13.4.1 Path B rules
- Tool calls are limited to the `read` action class (08-2 §9.2). Any other class → `ROUTINE_ACTION_REFUSED`; the AI is told once ("Routines can only look. Return routine_result."), a second attempt fails the run.
- The run ends on `routine_result`, `fail`, 8 step turns, 20 tool calls, 90 s wall time, or 2 × the first run's tokens, whichever comes first; a ceiling ends the run `failed` with reason "took too long". §5.6 stuck rules do not apply to routine runs (no Stuck card); the run simply fails (§13.5 failure copy).
- **Condition evaluation (Art. 12):** when `routine.condition` is set, the engine evaluates it against `observed.value` and **ignores the AI's `fire`** when they disagree (logged `routine.fire_overridden`); `observed` missing → treated as `fire=false` and the run is `failed` ("couldn't read the value"). `fire` alone decides only when no structured condition exists. `message` passes the §7.6 output filters and is posted only when the engine's result is true.

#### 13.4.2 FastPath learning
On a run whose `routine_result` returns `fastPath`, the engine stores it only after re-reading the same element through `selectorHint` (role + accessible name resolving to exactly one element on `fastPath.url`) and parsing a value equal to `observed.value`. Path A is used while the hint resolves to exactly one element and parses; a miss falls back to Path B in the same run, and `fastPath` is cleared after 2 consecutive misses.

#### 13.4.3 First run at creation
"Run once now" (Manus MNS §9.15) runs Path B immediately. If it fails, the Routine card is still created; its "Last run" row shows "Didn't finish · See why" (05 §5.13.2) and foo's line is "I couldn't check right now, but the routine is saved. Next run {Fri 16 Oct, 10:15 AM}."

### 13.5 "Tell me only if" evaluation
- `fire=false` or condition false → **silence**: no message, no toast; run history "nothing to tell" (J14 step 5; OCL NO_REPLY; HRM [SILENT]).
- Hysteresis: after firing, the routine does not fire again until the condition has been observed false once (`last_condition`) (J14 step 5 decision).
- Fired → message in the owner chat; its footer "Why am I getting this? Your {title} routine." is stored in `messages.why` (08-0 §G.17; `routineId` names the routine, the footer text is built from it, 04 §19.6). Routines with `created_from ∈ {asked, builtin, idea}` are prompted (`prompted=1`; Art. 19 "things the user asked for"). Routines with `created_from ∈ {suggested, habit}` are unprompted (`prompted=0`): they count toward the daily budget and, when over budget or inside quiet hours, are **held for the next brief** per §15.2 step 5 (not posted, not toasted); a held fire keeps the routine's hysteresis as fired. The fired message writes `messages.why` (`source` = `routine_asked` for asked/builtin/idea, `routine_suggested` for suggested, `habit_offer` for habit; 04 §19.6, 08-0 §G.17). A routine marked urgent is never held. Toast per §15 if `deliver_toast`.
- Failure → message once per failure kind ("Your BTC check couldn't open CoinDCX at 8:45 AM. I'll try again at 9:15."); `fail_streak = 3` → "Your BTC check has failed 3 times. [ Fix ] [ Pause it ]" + toast (J14).
- First run ("Run once now" at creation, Manus MNS §9.15) always shows its result in chat even if the condition is false ("Right now BTC is ₹57.2 lakh, above your line. Here's what the routine will do:").

### 13.6 Catch-up after sleep or app closed (J14, J6; Tab gap report TAB §9.7; Cowork missed runs CWK §9.8)
On engine start and on `powerMonitor 'resume'` (and on a wall-clock jump > 2 min detected by the tick): for each routine with ≥ 1 missed run (`next_run_at < now − 2 min`): count missed runs, run **one** catch-up run (`kind:'catch_up'`, `gap_from/gap_to`), then schedule normally. The catch-up message is posted only if it fires: "While your PC was asleep ({from}–{to}) I missed {n} checks. Checked now: …". Morning brief: own rule (§14.4).

### 13.7 Away, stale, duplicates, cost
- No user interaction (window focus or tray action) for 7 days → all routines `paused_away`; on return one card "I paused {n} routines while you were away (since {date}). Turn them back on?" [ Resume all ] [ Choose ] (J14; GRK §4.5).
- No firing in 30 days → once: "Your '{title}' routine hasn't found anything in 4 weeks. Keep it?" [ Keep ] [ Pause ] [ Delete ] (J14; POK §9.9). Suggestion key `stale_routine:{routineId}` (08-0 §G.13); unprompted (§15.2 step 5).
- The away card above is unprompted too and is delivered (or held) per §15.2 step 5; it is never shown twice for the same away period.
- Duplicate on creation: same normalised `task_spec` + `condition` → "You already have this: '{title}'. Change it instead?" (J14; OCL §9.9).
- Estimate per month = runs/month × average tokens of the first run × price (key) or "about {p}% of your {AI} plan a month" only when plan usage is reported (J14 step 4).

### 13.7a Built-in routines (`RoutineBuiltin`, 08-0 §B.2)

| Builtin | One per | Schedule | `urgent` | `condition` (engine-set, not derived; X-131) | Notes |
|---|---|---|---|---|---|
| `morning_brief` | install | daily at `settings.brief.at` | 0 | null | §14 |
| `memory_tidy` | install | daily 03:00 | 0 | null | §12.7 |
| `pnr_watch` | PNR | as 12-1 §12.25.8 (the engine switches the interval itself until chart preparation; ends after the final, not-found or departed message) | 1 (its Tatkal and booking-open reminders only, §15.2 step 4) | `{ metric: 'status', op: 'changed' }` | **Read path:** IRCTC booked-ticket history in foo's Edge profile while the user is signed in (08-2 §8.3.11); never the public PNR page (CAPTCHA, never solved), no third-party PNR API in v1 (X-108). Run result `signed_out` → no further requests that run; one message per local day `thread.pnr_watch.signed_out` "IRCTC signed me out, so I can't check your PNR. Sign in to keep watching." [ Sign in ] (12-1 owns copy); no polling until the user signs in (next run after a successful sign-in card). Posts only on a status change (`routine_runs.observed`). |
| `recharge_due` | biller row (`{slug}-{last4}`) | as 12-1 §12.26.7 (`once` at 09:00 on plan end − 2 days, re-armed after each recharge) | 0 | `{ metric: 'number', op: '<=', value: 2, unit: 'days' }` | Posts the reminder before the plan ends (12-1 §12.26.7 owns copy). |
| `bill_watch` | Gmail connection (`connectionId`) | `on_email` (§13.3) | 0 | null | Created on the first Gmail connect, owned by Money's chat; posts one `bill` card (05-3 §5.29) after fold rule 5; Routines row "Watch for bills"; full rule §13.3 (X-115). |

### 13.8 Functions

| Function | In | Out | Errors | J | Art |
|---|---|---|---|---|---|
| `routines.create` | `RoutineDraft` | `RoutineRow` + Routine card | `INTERVAL_TOO_SHORT`, `ROUTINE_LIMIT`, `ROUTINE_DUPLICATE` | J14 | 19 |
| `routines.patch` | `RoutinePatch` | `RoutineRow` (card edited in place) | `INTERVAL_TOO_SHORT`, `VALIDATION` | J14 | 19 |
| `routines.tick` | `now` | runs started | — | J14 | — |
| `routines.run` | `routineId, kind` | `RunOutcome` | `NET_OFFLINE`, `AI_SERVICE_DOWN`, `AI_SIGNED_OUT`, `AI_LIMIT`, `AI_KEY_INVALID`, `SITE_BLOCKED`, `SITE_CHANGED`, `SITE_TIMEOUT`, `SITE_CAPTCHA`, `SITE_HANDBACK`, `ROUTINE_ACTION_REFUSED` | J14 | 19 |
| `routines.nextRun` | `Schedule, tz, from` | `epochMs` | — | J14 | 21 |
| `routines.catchUp` | `now` | `CatchUpReport` | — | J6, J14 | 19 |
| `routines.pauseAll/resumeAll/awayCheck/staleCheck` | — | counts | — | J14, J20 | 20 |

---

## §14. Morning brief (J6)

14.1 Built-in routine `morning_brief` (`daily`, at `settings.brief.at`, default 08:00). The background job starts at `at − 15 min` (J6 "07:45").
14.2 **Collect** candidates (each source optional; a failing source adds a footer line, never blocks the brief; when the web search key hit its quota the footer line is `brief.footer.web_key_quota`, copy 06-3 owns): calendar today + tomorrow; Gmail since the last brief (§16.1.3: bills, trips, replies needed); WhatsApp mentions of the user's name and starred chats (`wa_messages`); jobs in NEEDS_YOU and approvals/payments in `PENDING` or `HELD` (UJ-21); routines that fired since the last brief; **held items** (unprompted items held back by §15.2 step 5); helper notes (bills due, trips within 7 days); weather for the user's city (`web.fetch` of a weather page; skipped if no city in memory); on Mondays the `memory_week` count (§12.7). Each source yields `BriefCandidate`s (§14.7).
14.3 **Rank** deterministically into bands: (1) needs the user today (`needs_you`, `held`, `payment_due` due today), (2) money due within 3 days (`bill`, `payment_due`), (3) people (`birthday` within 7 days, `reply_needed`), (4) trips/bookings within 7 days (`trip`, `booking`), (5) the rest (`routine`, `helper_note`, `memory_week`, `weather`, `nice_to_know`; at most one `nice_to_know`). Within a band: kind score from `brief_feedback` (👍 +1, 👎 −1, decayed 0.9/day) and verbatim "more of / less of" lines from `preferences\brief.md`; ties by soonest date. Hidden kinds (§14.5) are excluded. **Count (UJ-13, X-131):** keep the top 1–5 (5 max); fewer candidates → show them as they are (no padding, no invented "nice to know"); **0 candidates** → the light-day line "Nothing needs you today. Enjoy it." (J6). `held` items are folded into one item "{n} things I held back yesterday" when there are more than 2. A `held` candidate is built from `held_items.payload` = `HeldItemPayload` (08-5 §3.8): `facts = { text }`, `sourceRef = held_items.id`, `allowedActions = ['Review']` → `payload.open`.
**Headlines (AI-17, AG-16).** The engine builds every candidate with a deterministic `templateHeadline` (§14.8). One AI turn (`purpose:'brief'`, background lane) receives the kept candidates as `{ id, kind, facts, allowedActions, templateHeadline }` and returns `BriefAct { items: { id: string; headline: string /* ≤ 70 chars */; action?: BriefActionLabel }[] }` (schema row in 08-2 §7.4). The engine keeps an AI headline only when it is ≤ 70 chars, passes §7.6 filters, and contains every amount and date of `facts` verbatim (formatted per 02 §F19); otherwise, and for any item the AI omits, adds or labels with an action outside `allowedActions`, the template is used. Order and kinds are never changed by the AI. Buttons map label → `BriefAction` in the engine. AI unavailable or the cap reached → all templates, plus the J6 footer line "Short brief today: your AI wasn't answering." / "Short brief today: you've reached this month's AI cap. [ Change cap ]". AI unavailable at 07:45 → retry every 5 min until 08:30 (J6), then templates.
14.4 **Deliver** at `at` (not earlier): one `brief` card (`messages.kind='card'`, card type `brief`, 08-0 §G.1, X-56) in foo's chat with a date divider; quiet hours ending after `at` → wait until they end. PC off/asleep at `at`: on wake before 12:00 → run and add "· late because your PC was asleep at {at}"; after 12:00 → skip with the one-line offer (J6). **Expiry (UJ-14):** the card moves to state `expired` at `at + 12 h` whether or not it was opened (8:00 PM when `at` is 8:00 AM; J6's "8:00 PM" is the example for the default time). Brief card states: `open`, `expired` (08-0 §G.2). Held items shown in this brief are marked delivered; a held item undelivered for 7 days is deleted.
14.5 **Feedback**: 👍/👎 per item → `brief_feedback(card_kind = BriefKind)`; two 👎 on the same kind within 7 days → once, as an unprompted line in foo's chat, "Stop showing {kind words} in your brief?" [ Stop showing ] [ Keep ] with suggestion key `brief_kind_stop:{kind}` (08-0 §G.13; never asked twice, Art. 20). "Stop showing" appends `- hide: {kind}  {you said · {date} · chat · {id}}` to `preferences\brief.md`. `needs_you`, `payment_due` and `held` cannot be hidden (the question is never asked for them). Monday's brief adds the `memory_week` item (§12.7).
14.6 The brief is prompted (`prompted=1`; Art. 19 excludes the brief from the budget). Toast per §15 (kind `brief`).

14.7 **Kinds and action labels (AG-18, 08-0 §B.3).**
```ts
type BriefKind = "needs_you" | "bill" | "payment_due" | "birthday" | "trip" | "booking" | "reply_needed" | "routine" | "helper_note" | "weather" | "held" | "memory_week" | "nice_to_know";
type BriefActionLabel = "Open" | "Review" | "Show me" | "Remind me" | "Add to calendar" | "Draft a reply";   // 08-0 §B.2
interface BriefCandidate { id: string; kind: BriefKind; facts: Record<string, string | number>; allowedActions: BriefActionLabel[]; templateHeadline: string; sourceRef: string }
interface BriefItem { kind: BriefKind; headline: string; action?: { label: BriefActionLabel; do: BriefAction }; sourceRef: string; feedback?: 1 | -1 }
type BriefAction = { kind: "open_chat"; chatId: string; cardId?: string } | { kind: "start_job"; chatId: string; text: string } | { kind: "remind"; at: number };
```
Plain words for `{kind words}` (copy keys `cards.brief.kind.{kind}`): needs_you "things that need you", bill "bills", payment_due "payments due", birthday "birthdays", trip "trips", booking "bookings", reply_needed "emails waiting for a reply", routine "routine results", helper_note "notes from your helpers", weather "weather", held "things I held back", memory_week "what I learned", nice_to_know "nice-to-know items". `allowedActions` per kind: needs_you/held/payment_due ["Review"]; bill ["Review", "Remind me"]; birthday ["Remind me", "Draft a reply"]; reply_needed ["Draft a reply", "Open"]; trip/booking ["Open", "Add to calendar"]; routine/helper_note ["Open"]; memory_week ["Show me"]; weather/nice_to_know []. "Review" opens the card exactly like the toast Review (X-02); no brief button approves, pays or sends (Art. 4–6). "Draft a reply" starts a job whose result is a Draft card.
**"Remind me" from the brief (X-115 (7))** creates a `once` routine owned by foo's chat (`created_from 'asked'`, prompted, `deliver_toast` true), exactly like the Bill card's Remind me (X-103): `bill`/`payment_due` → `at` = 9:00 AM local on the due date − 1 day; when that moment is already past → 9:00 AM on the due date; when that is past too → now + 60 min rounded up to the next quarter hour. `birthday` → 9:00 AM local on the birthday (today's birthday → now + 60 min rounded the same way). Message: `thread.brief.remind.bill` "Reminder: {payee} bill ₹{amount} is due {Fri 23 Oct}." / `thread.brief.remind.birthday` "Reminder: it's {Name}'s birthday {today|tomorrow}, {Sun 18 Oct}." Collapsed item line "Reminder set · {Thu 22 Oct, 9:00 AM}" (`cards.brief.item.reminder_set`).

14.8 **Template headlines** (used when the AI is not; copy keys `cards.brief.template.{kind}`): needs_you "{Card question}" or, for a PENDING/HELD approval or payment (UJ-21), "Still waiting: {verb phrase}" / "Still waiting: ₹{total} to {payee}"; bill "{Payee} bill ₹{amount} due {Fri 23 Oct}."; payment_due "₹{amount} to {payee} due {Fri 23 Oct}."; birthday "{Name}'s birthday is {Sun 18 Oct}."; trip "{Trip} starts {Sat 12 Dec}."; booking "{Place} booked for {Sat 17 Oct, 8:00 PM}."; reply_needed "{Sender} is waiting for your reply."; routine "{Routine title}: {result line}"; helper_note "{Helper}: {note}"; weather "{City}: {condition}, {high}°."; held "{first 60 chars of the held line}"; memory_week "This week I learned {n} things about you."; nice_to_know "{line}".

---

## §15. Notification service (main; J20, Appendix A)

### 15.1 Request
```ts
interface NotificationRequest { kind: NotificationKind /* 08-0 §B.2 */; chatId: string; title: string; body: string;
  buttons?: { label: string; action: ToastAction }[]; prompted: boolean; urgent?: boolean; ref?: string /* cardId or messageId = toast tag */ }
// Every ToastAction is carried as a foo:// URL (08-0 §G.9) with protocol activation (09 §9.9.1). There is no "reply" action (X-67, owner Q3).
type ToastAction = { kind: "open"; chatId: string; cardId?: string }            // foo://chat/{chatId}[/card/{cardId}]
                 | { kind: "review"; cardId: string }                           // foo://card/{cardId}?act=review
                 | { kind: "not_now"; cardId: string }                          // foo://card/{cardId}?act=not_now
                 | { kind: "answer_choice"; cardId: string; optionId: string }  // foo://card/{cardId}?act=choice:{optionId}
                 | { kind: "read"; chatId: string }                             // foo://chat/{chatId}?act=read
                 | { kind: "settings"; page: SettingsPage; row?: string };      // foo://settings/{page}[/{row}]
```

### 15.2 Decision order (MUST)
Toast rules (which kinds, muting, focus, rate, quiet hours, lock screen) are owned by 09 §9.9.4; this is the engine order that implements them. Every decision writes one `notifications` row with its `delivery` value.
1. `settings.notifications.kinds.{needsYou|done|routine|brief|helper|problem}` off for this kind (map: choice/approval/payment/signin/stuck → needsYou; done → done; routine/reminder → routine; brief → brief; reply from a helper → helper; error → problem; summary always on), or Windows notifications off (09 §9.9.7) → `suppressed_off` (Settings shows the J20 bar). The chat message is still posted.
2. Window focused **and** showing that chat → `suppressed_focus`, **no sound** (09 §9.9.4 "Focused chat").
3. Chat muted (`settings.notifications.mutedChats[chatId]` is `'forever'` or a future epoch) → kinds `done`, `routine`, `brief`, `reply`, `reminder` → `suppressed_muted`; kinds `choice`, `approval`, `payment`, `signin`, `stuck`, `error` still go on (09 §9.9.4 "Muted chats"). The unread count still updates.
4. Quiet hours (`settings.notifications.quiet`, 08-0 §A) and not `urgent` → toast `held_quiet`; at quiet end one `summary` toast "While you were away: {n} things need you, {m} jobs done." (J20). Prompted chat messages are still posted; unprompted items go to step 5's hold. A Tatkal opening reminder (12-1 §12.25, T−10 min) and the 'booking opens' reminder (08:00 IST on the opening day, X-108) are `urgent`: they toast in quiet hours. **Train reminder times (X-108, 08-0 §G.19):** the booking-open reminder fires at 08:00 IST on the day bookings open (60 days before the journey, journey day excluded); the Tatkal reminder fires 10 min before Tatkal opens, 10:00 IST (AC) / 11:00 IST (non-AC) one day before the journey; every one of these times is read from `resources/rail-rules.json`, none is hard-coded.
5. **Interruption budget (Art. 19, R-11; AG-01, AG-20).** This step runs at **message** time, before anything is posted, for every item with `prompted=0` (the full list is §15.6): if today's delivered unprompted count (`budget.countToday`, §15.5) ≥ `settings.notifications.unpromptedPerDay` (0–3, default 3), **or** the time is inside quiet hours and the item is not `urgent` → the item is **not posted to the chat and not toasted**; it is written to `held_items` (§15.6) and appears as one line in the next morning brief (§14.2, kind `held`). Delivery value `held_budget` or `held_quiet_item`. Otherwise the message is posted with its "Why am I getting this?" footer and continues to step 6.
6. Same chat toasted < 2 min ago → `merged` into "{title} · {n} updates" (replaces the previous toast via the same `tag`).
7. Otherwise `toast`.

### 15.3 Toast build
Electron `Notification` with `toastXml` (Windows), AppUserModelID **`com.foo.desktop`** (09 §9.2). Activation is **protocol activation only** (09 §9.9.1): the toast `launch` attribute and every button carry a `foo://` URL from 08-0 §G.9 (`foo://chat/{chatId}`, `foo://chat/{chatId}/card/{cardId}`, `foo://card/{cardId}?act=review|not_now|choice:{optionId}`, `foo://chat/{chatId}?act=read`), handled by the single-instance handler (08-1 §2.2). Title = chat name; face = the chat's face (09 §9.9.2); body = one line, Redactor channel `toast` (R8). Buttons ≤ 2. While the session is locked (`powerMonitor 'lock-screen'` until `'unlock-screen'`) title and body follow 09 §9.9.4 "PC locked".

**Toasts never approve and never pay** (binding, 09 §9.0.2; Art. 6, 7): Approval and Payment toasts carry [ Review ] [ Not now ]. Review opens the card in the main window [settled: X-02] — where the real tap (and Windows Hello for big payments) happens. `[This supersedes J20's "[ Approve ] [ Open ]" row for non-hard approvals; logged in §23 G-08-05]`. Choice toasts may carry the Best-fit option button because answering a Choice card is not an approval (G16). Message toasts carry [ Open ] [ Mark as read ] and **no inline reply** in v1 (owner Q3 default; 09 §9.9.3). Expiring approvals get no extra toast (J20).

### 15.4 Taskbar, tray
Overlay badge, progress bar and flash are exactly 09 §9.10 (amber disc with the count of waiting cards; green ✓ for 30 min after a DONE until focus; progress of the **earliest-started** WORKING job; `paused` when all unfinished jobs wait). Tray icon, tooltip and menu are exactly 09 §9.8. The NotificationService only computes and pushes `BadgeState { needsYou: number; doneRecently: boolean; working: { done: number; total: number } | null; paused: boolean }` to main's taskbar module, debounced 500 ms; it never chooses images or words. "Pause routines…" in the tray → `routine:pauseAll { hours: 1 }`. Badge updates within 2 s of the state change (J20 acceptance).

### 15.5 Functions

| Function | In | Out | Errors | J | Art |
|---|---|---|---|---|---|
| `notify` | `NotificationRequest` | `Delivery` | — | J20, App. A | 19 |
| `quietHours.isQuiet` / `flushSummary` | `now` | `boolean` / `void` | — | J20 | 19 |
| `budget.countToday` | `localDate` | `number` | — | J20 | 19 |
| `budget.hold` / `budget.takeForBrief` | held item / `briefId` | `void` / `HeldItem[]` | — | J6, J20 | 19 |
| `taskbar.update` | `BadgeState` | `void` | — | J20 | 27 |
| `deeplink.handle` | `url` | `navigate { view, act? }` event | `URL_NOT_ALLOWED` | J20 | 27 |

`budget.countToday(localDate)` = `COUNT(messages WHERE prompted = 0 AND deleted_at IS NULL AND date(created_at in settings.locale.timeZone) = localDate)`. It counts **messages posted**, whatever the window state, never toasts; the `notifications` ledger records toast decisions only.

### 15.6 What is unprompted, and held items (AG-01, AG-20)
`prompted` is set by the writer of each message. **1 (prompted):** replies to a user message; job results, checklists and cards of a job the user started (or of an `asked`/`builtin` routine); the brief; anything the user asked for by time ("remind me at…"). **0 (unprompted, counts and can be held):** fires of `suggested`/`habit` routines (`routine_fire`), habit offers (`habit_offer`), helper offers (`helper_offer`), stale-routine questions (`stale_routine`), the away notice (`away_notice`), memory conflict questions (`memory_conflict`), the 80 % cap warning (`cap_80`), "Stop showing … in your brief?" (`brief_kind_stop`), and any other suggestion (`suggestion`).
Held items are stored in `held_items` (columns and CHECK: 08-0 §G.17); `held_items.payload` = `HeldItemPayload` (08-5 §3.8; X-129); the brief `held` candidate's `facts = { text }`, `sourceRef = held_items.id`, `allowedActions = ['Review']` → `payload.open`. The brief builder (§14.2) takes all undelivered rows as `held` candidates, sets `delivered_in_brief_id`, and deletes rows older than 7 days that were never delivered. An item with `urgent` set (a routine marked "Urgent: notify even in quiet hours") is never held.
`routine_offer` with `source='after_job'` is **prompted** (it answers the job the user asked for), never counts toward the budget, and at most one is posted per job (X-97). `prompted=0` items held by step 5 are delivered in the next brief (AT-156).

### 15.7 Offers and suggestions: never offer twice (Art. 20; X-76, 08-0 §G.13)
Every offer foo makes on its own is a `suggestions` row (columns per DB-17: `key, kind, text, state, offered_at, decided_at`) whose `key` = `{kind}:{subject}` (UNIQUE). Kinds and subjects (AG-26): `helper_offer:{template id}` (trips, money, home, family), `habit_offer:{biller slug}` (e.g. `airtel-7741`), `routine_offer:{suggest|pnr_watch|recharge_due}:{subject}` (subjects 08-0 §G.13: `{sha8}`, `{pnr}`, `{slug}-{last4}`; e.g. `routine_offer:suggest:{first 8 hex of sha256(task_spec)}`, `routine_offer:pnr_watch:{pnr}`), `connector_offer:{app}`, `brief_kind_stop:{BriefKind}` (§14.5), `memory_conflict:{factIdA}-{factIdB}` (ids sorted), `memory_share:{factId}:{groupChatId}` (§12.5.1), `stale_routine:{routineId}` (§13.7), `save_login:{domain}`, `read_codes:{domain}`, `voice_key:openai` (§18.1). Before offering, the engine inserts the key; an existing row with `state='dismissed'` blocks the offer forever; Settings → Privacy "Show dismissed suggestions" restores one row (`suggestions:restoreDismissed { key }`) or all (`{}`) to `offered`.

---

## §16. Connectors (v1)

### 16.1 Gmail and Google Calendar
- **Connect**: OAuth 2.0 for installed apps, Authorization Code + PKCE (S256), loopback redirect `http://127.0.0.1:{port}/oauth2/callback` (random free port ≥ 49152) served by main for **one** request, opened with `shell.openExternal` in the default browser (C10, J4); link valid 10 min (`OAUTH_TIMEOUT`, J4 "That sign-in link expired."). `connection:connect { app: 'google', scopes? }` (08-0 §G.12, X-74) returns `{ connectionId, status: 'connecting' }` at once, after the browser was opened; progress and the final rows arrive on `connection:upsert`. One Google sign-in creates or updates the three rows `gmail`, `gcal`, `contacts`; `scopes` defaults to all three; incremental consent passes only the missing scope. Granular consent: foo reads the granted scopes from the token response and stores `granted` (J4 branch "I can read and draft, but not send"). **One Google account in v1** (`flags.multiAccount=false`, owner Q4 default): "Add another account" is hidden and an `addAccount` field is rejected with `VALIDATION`.
- **Scopes**: `openid email`, `https://www.googleapis.com/auth/gmail.readonly` (read), `https://www.googleapis.com/auth/gmail.compose` (create, update, delete and send drafts), `https://www.googleapis.com/auth/calendar.events` (see and add events), `https://www.googleapis.com/auth/contacts.readonly` (see contacts, §16.7) [X-48]. Distribution: Google testing mode, ≤ 100 named test users, until Google's verification and yearly security assessment are done [settled: X-39]. Incremental consent for send if it was refused (J13 branch "To send emails I need one more permission from Google").
- **Tokens**: one refresh token for the Google account in the vault target **`foo/conn_token/google`** (08-0 §E.8, X-73); the `gmail`, `gcal` and `contacts` rows carry the same `vault_name`, and the token is deleted only when the last row naming it is deleted (Disconnect Google). Access token in RAM only; refresh on 401 once; `invalid_grant` → all three rows `needs_signin` + the `CONN_EXPIRED` card (§21.2) naming the app the job was using. **Granted map (X-127):** `granted = { read: scope ∋ gmail.readonly, draft: scope ∋ gmail.compose, send: scope ∋ gmail.compose, calendarWrite: scope ∋ calendar.events, contactsRead: scope ∋ contacts.readonly }` from the space-separated `scope` of the token response and of every refresh response. HTTP 403 with reason `insufficientPermissions` / `ACCESS_TOKEN_SCOPE_INSUFFICIENT` → set the matching `granted` flag false, emit `connection:upsert`, fail the tool call with `CONN_SCOPE_MISSING` (§21.3); the Calendar and Contacts rows then show "Not allowed yet" + "Allow" (incremental consent with `prompt=consent`, §16.1.1; copy owned by 06-2 §6.8).
- **Calls**: `users.messages.list(q, maxResults ≤ 50)`, `users.messages.get(format=full)`, `users.drafts.create/update/delete/send` (§16.1.4), `users.history.list` (§16.1.3), `users.getProfile`, `users.settings.sendAs.list`. Calendar: `calendarId='primary'` only; `events.list(timeMin, timeMax, singleEvents=true, orderBy='startTime', maxResults=100)`, default window = today 00:00 to tomorrow 23:59 in `settings.locale.timeZone` unless the step names one; `events.insert` body `{ summary, start: { dateTime, timeZone: settings.locale.timeZone }, end: { dateTime, timeZone }, location?, description? }`, no attendees and no reminders in v1. Self rate limit 5 requests/s, exponential backoff on 429/5xx (max 3 tries, never for `drafts.send`).
- **Signature** (J12; owner Q4 default): the default send-as signature from `users.settings.sendAs.list` (`isDefault: true`) is appended below the body when the draft is created and is shown on the Draft card (05 Draft card); the user may delete it there like any other text.
- **Limits**: no attachments sent in v1 except files from `{OUT}` with a full Approval card; read attachments are metadata only unless the user asks to open one (downloaded to the job folder). Disconnect Google revokes the token at `https://oauth2.googleapis.com/revoke` and deletes the three rows and `contacts_index` (J23).
- **Proof**: Sent message id (`sent_folder`), event id (`calendar_event`).

#### 16.1.1 Google client (`resources/google-oauth.json`; owner action)
**Vikas, before M8:** create the Google Cloud project, the OAuth consent screen "foo" (External, **Testing**) with the five scopes above, add each tester's Google address (≤ 100, X-39), and create one OAuth client of type **Desktop app**. Its id and secret ship in `resources/google-oauth.json`:
```json
{ "projectId": "foo-desktop", "clientId": "….apps.googleusercontent.com", "clientSecret": "…",
  "consentScreen": { "appName": "foo", "supportEmail": "…", "privacyUrl": "…" } }
```
An installed-app secret is not confidential (RFC 8252 §8.5) but is never logged. These are the only Google credentials in the app. Missing or malformed file → the Google Connect buttons are disabled with "Gmail isn't available in this build." (tester builds only; the release gate 10-1 §A.4 requires the file).
**Authorization URL** `https://accounts.google.com/o/oauth2/v2/auth` with `response_type=code`, `client_id`, `redirect_uri`, `scope` (space-joined), `code_challenge`, `code_challenge_method=S256`, `access_type=offline`, `include_granted_scopes=true`, `state` (random 128-bit), and `prompt=consent` on first connect and on any incremental consent ("Allow sending", "Allow contacts"); `prompt=select_account&login_hint={email}` on Reconnect. **Token endpoint** `https://oauth2.googleapis.com/token` (code → `access_token, refresh_token, scope, id_token`); the account e-mail is the `id_token` `email` claim, checked against `iss` and `aud`, never a Gmail call. A reply without `refresh_token` → `OAUTH_DENIED` and the Connect card line "Google didn't let me stay connected. Try again." [ Try again ]. A callback whose `state` does not match is ignored and logged `OAUTH_STATE_MISMATCH` (internal).
**Loopback page** (HTML served once, inline CSS from 02 tokens, no script, `<title>foo</title>`): success "You're connected. You can close this tab and go back to foo."; denied "Nothing was connected. You can close this tab." The listener closes after that one request or after 10 min.

#### 16.1.2 Calendar and Contacts rows
The `gcal` and `contacts` rows have no Disconnect of their own: Settings → Connections shows **Turn off / Turn on** for them (`settings.connections.google.calendarOn` / `contactsOn`, 08-0 §A, X-74), which stop use and sync locally without revoking; the Gmail row's button is "Disconnect Google" (all three go, C-10). A row whose `granted` flag is false (§16.1 Tokens) shows "Not allowed yet" + Primary "Allow" instead (X-127).

#### 16.1.3 Gmail poller (INT-11)
On connect, store `connections.history_id` from `users.getProfile().historyId`. Every 5 min while online and not suspended: `users.history.list(startHistoryId, historyTypes=['messageAdded'], labelId='INBOX', maxResults=500)`, paging on `nextPageToken`; save the newest `historyId` after processing; emit each new message id once to `on_email` routines (§13.3) and the brief collector. HTTP 404 (history too old) → re-baseline: `getProfile().historyId` plus one `messages.list(q='newer_than:1d', labelIds=['INBOX'], maxResults=50)` pass, de-duplicated by message id against `routine_runs` and brief records. On `powerMonitor 'resume'` one poll runs immediately; at login the first poll waits for the 20 s delay (09 §9.7). The brief's "Gmail since the last brief" = `messages.list(q='after:{lastBriefEpochSeconds} -category:promotions -category:social', maxResults=50)`.

#### 16.1.4 Gmail drafts (X-65, 08-0 §G.7; owner Q4 default)
`gmail.draft` → `users.drafts.create` and stores `gmailDraftId` and the message id in the card payload; the same call creates the card's `approvals` row (`PENDING`, `verb='send'`, expires 60 min). **Change** (`draft:update`) → `users.drafts.update(gmailDraftId)` with the full edited message and the same thread headers; failure keeps the card in edit mode with "That didn't save. Try again.". **Discard** (`draft:discard`) → `users.drafts.delete(gmailDraftId)` (best effort, logged). **Send** (`draft:send`) = approve once (`approved_via='card'`); `undo_until = now + 5 s`; then the second look on the card text; then `users.drafts.send(gmailDraftId)` (never `messages.send`), so what Gmail sends is exactly the last saved card text. **Open in Gmail** (`draft:openInApp`) → `shell.openExternal('https://mail.google.com/mail/?authuser={email}#drafts/{messageId}')` `[verify at M8 on a real draft; fallback '#drafts']`. Hard-limit drafts (new recipient, money, personal data) use the full Approval card and skip the 5 s undo (08-0 §G.7).

### 16.2 Outlook (J4 lists it; the brief's v1 list does not)
Spec'd for parity, shipped behind the build flag `flags.outlook` (08-0 §A): **off in v1, on in v1.1** [settled: X-41]: `connection:connect { app: 'outlook' }`, refresh token in `foo/conn_token/outlook` (08-0 §E.8); Microsoft identity platform public client, PKCE, loopback redirect, scopes `offline_access Mail.Read Mail.ReadWrite Mail.Send Calendars.ReadWrite`, Graph `me/messages`, `me/messages/{id}/send` for drafts. While off, the J4 Outlook chip is not shown.

### 16.3 X drafts
No account connection (X-34); posting is hand-back in v1 (`permissions.actions.post` is locked `never`, 08-0 §G.3). `x.draft` → Draft card with weighted length computed by the **`twitter-text`** npm package (exact version pinned at M0; `parseTweet(text).weightedLength`: URLs count 23, CJK 2); > 280 → "Too long for X by {n} characters. [ Shorten it ]" (J12). `x.openCompose` → `shell.openExternal("https://x.com/intent/post?text=" + encodeURIComponent(text))`; card → "Opened in X · not posted by foo"; no proof; foo never posts (J12; GRK §3.1).

### 16.4 WhatsApp (linked device; read + send-after-tap)
- **Bridge** (X-64, 08-0 §G.6): Baileys runs in the utility process `wa-bridge`, **forked by main** (`EngineSupervisor.startBridge()`, only when a `whatsapp` connection row exists or `whatsapp:linkStart` is called). Main creates a `MessageChannelMain`, transfers one port to the engine and the other to the bridge; after that engine and bridge talk directly with `{ id; kind; payload }` messages (zod on receipt) of the `EngineToBridge` / `BridgeToEngine` unions (08-1 §2.4, BE-06): `wa.linkStart`, `wa.linkCancel`, `wa.unlink`, `wa.send { jid; text; draftCardId }`, `wa.readRecent { jid?; sinceMs }`, `wa.onWhatsApp { jids }`, `wa.session { bytes | null }` → bridge; `wa.qr { qr; expiresAt }`, `wa.linked { jidMasked; accountHash }`, `wa.message`, `wa.onWhatsApp.result { results: { jid; exists }[] }`, `wa.readRecent.result { messages: WaMessageRow[] }` (X-124), `wa.ack { waMessageId; level }`, `wa.state { state; reason? }`, `wa.creds { bytes }`, `wa.error { kind }` → engine. Restart/backoff (4-failure rule, 08-1 §2.1) is executed by main's supervisor. Auth state lives in the bridge's memory; each `wa.creds` is encrypted by main (safeStorage) to `{DATA}\vault\wa-session.bin` (08-0 §E.8); the connection row's `vault_name` is `wa-session`.
- **Read**: `messages.upsert` → `wa_messages` (text only, media as "[photo]"), 7-day retention (J16); starred and `@mention` flags for the brief. `sender_label` = `wa_contacts.name` for the sender jid, else the message `pushName`, else the masked number (`+91 98••• ••210`, Redactor toast mask); for `from_me=1` it is "You" (X-129).
- **Send**: only `whatsapp.send(draftCardId)` after the Draft card's Send tap (X-65: the draft's `approvals` row, approve once, 5 s undo, second look) for a known 1:1 chat, or after a full Approval card (groups, someone new, §16.4.2) (J12, J16; Art. 4, 5); self-limits: ≥ 3 s between sends, ≤ 30 sends/day `[foo decision: lower ban risk on an unofficial link]`. Never auto-replies, never joins or posts to groups by itself (J4 decision). Proof: delivery ack ≥ 2 → `wa_delivered` ("✓ Delivered"). Bridge send errors arrive as `wa.error { kind: 'SEND_FAILED' }`. **Daily limit and gap (X-129, 08-0 §H.2):** counter = `COUNT(activity WHERE event='sent_whatsapp' AND at ≥ local midnight)`; ≥ 30 → the Draft card's Send button is disabled with the line `cards.draft.line.wa_daily_limit` "I've sent 30 WhatsApp messages today, which is my daily limit. I can send again after {Sat 17 Oct, 12:00 AM}." (no ErrorKind, no toast; the draft stays `pending` until its 60-min expiry). The 3-s gap is enforced by the engine's send queue (FIFO; the second card shows `sending` for the wait); it is never visible as an error.
- **Settings**: `connections.whatsapp.read=false` stops ingest and deletes `wa_messages`; `draft=false` hides WhatsApp drafts (J21); `hiddenJids` lists groups hidden with "Hide from foo" (08-0 §A).
- **Failure**: `connection.update` with `loggedOut` → status `unlinked`, `WA_UNLINKED` card (§21.2) [ Link again ] (J19.6); transient disconnects reconnect with backoff and are never shown. Risk note: unofficial protocol; fragility documented (OCL §8.4) — the J4 footer copy sets expectations. Kept in v1 with the risk note and one-tap unlink [settled: X-40]. v1.1: "Text me from your phone" through WhatsApp "Message yourself" (PRD R32) [X-50]; Approval, Payment and Secret cards are never answered from the phone.

#### 16.4.1 Bridge configuration
`@whiskeysockets/baileys` pinned to an exact version at M8; `fetchLatestBaileysVersion()` at every start with a 5 s timeout; on failure the bridge uses the version pinned in the package (and retries at the next `net.online=true`) (X-127); `makeWASocket({ auth, version, browser: ['foo', 'Desktop', '{appVersion}'], syncFullHistory: false, markOnlineOnConnect: false, printQRInTerminal: false, generateHighQualityLinkPreview: false })` (the phone's Linked devices list shows "foo"). Contact names and group metadata are kept in the bridge's memory and mirrored to `wa_contacts (jid TEXT PRIMARY KEY, name TEXT, phone TEXT, updated_at INTEGER NOT NULL)` (08-0 §G.17; the bridge sends `wa.contacts` upserts, main writes) for name lookups. The bridge never requests media.

#### 16.4.2 Recipients (resolved by the engine, never by the AI)
`whatsapp.draft.to` (text from the AI) is resolved in this order: (1) a `wa_jid` already in `wa_messages` or `chats`; (2) an E.164 number or a 10-digit Indian number → `91{10 digits}@s.whatsapp.net`, confirmed through `wa.onWhatsApp` (08-1 §2.4.2) — not on WhatsApp → the Draft card shows "That number isn't on WhatsApp." and has no Send button; a bridge that is not `open` → the Draft card line `cards.draft.line.wa_cant_check` "I can't check that number right now." and Send disabled until the bridge is open again (no error card; X-124); (3) a name → exact, then prefix match on `wa_contacts.name` and on Google Contacts phones (`contacts_index`, X-48): one match → that person; 0 matches → Choice card "Who is {Mom} on WhatsApp?" listing the last 5 chats; ≥ 2 → Choice card "Which {Mom}?" with masked numbers. **Someone new** (Art. 5) = the JID has no `wa_messages` row in the last 365 days and no `wa_contacts`/Contacts match → full Approval card ("You haven't messaged them before"), never the Draft-card tap.

#### 16.4.3 What is mirrored (DB-15)
Only **groups** become `wa_mirror` chats: all of them on link, each written with `settings.notifications.mutedChats[chatId] = 'forever'` (no toasts by default), each hideable with "Hide from foo" (C-8: `chats.archived = 1`, the group's JID added to `connections.whatsapp.hiddenJids`, ingest stops for it) and re-shown from Settings → Connections → WhatsApp → "Groups I read". 1:1 chats are never rows; their text is stored only in `wa_messages` (7 days) for `whatsapp.read`, the brief and the someone-new check. A `wa_mirror` chat renders **only** `wa_messages WHERE chat_jid = chats.wa_jid` as read-only bubbles; nothing is copied into `messages`. `chat:open` returns `waMessages: WaMessageRow[]` for these chats; `chats.last_activity_at` and `unread_count` are updated by the ingest; `last_message_id` stays NULL. WhatsApp mirror text is **not** in `messages_fts` and not in Ctrl+K (7-day data; conservative). Pruning at 7 days deletes `wa_messages` rows and leaves the chat. The composer in a mirror chat drafts only: anything typed becomes a `whatsapp.draft` for that group (J16), never a direct send. Row look: 03-shell-1 §3.4.5.1; thread: 04 §10.11 (X-128).

#### 16.4.4 Link and QR cadence (INT-24: the single statement)
`whatsapp:linkStart` → the bridge emits a new QR about every 20 s (Baileys' own cadence); the engine renders the PNG (`qrcode` 1.5.x, exact version pinned at M8, 200 px, margin 2) and forwards `{ png, expiresAt }` as `ui.patch` → `whatsapp:qr` as each code arrives; `expiresAt = linkStartAt + 60_000` on every code (X-124). 60 s after `linkStart` with no scan, the panel shows "This code expired." [ New code ] and the socket is closed (`linkCancel`). 3 failed links → `WA_LINK_FAILED` (§21.2). Success → connection row with the masked number. 05-3 §5.11.2 and 06-1 §2.4 use the words "new code every 20 seconds; expires 60 seconds after Show QR code" (X-127).

### 16.5 Connector interface
```ts
interface Connector { app: ConnectorApp; connect(opts): Promise<Result<ConnectionRow>>; disconnect(id): Promise<Result<void>>;
  health(id): Promise<"ok" | "needs_signin" | "unlinked" | "error">; tools: ToolName[] }
```

### 16.6 Functions

| Function | In | Out | Errors | J | Art |
|---|---|---|---|---|---|
| `google.connect` / `disconnect` | `{ app: 'google'; scopes?: ('gmail' \| 'gcal' \| 'contacts')[] }` / `connectionId` | `{ connectionId, status: 'connecting' }` at once, rows on `connection:upsert` / `void` (all three rows) | `OAUTH_DENIED`, `OAUTH_TIMEOUT`, `NET_OFFLINE` | J4, J13, J21, J23 | 15 |
| `gmail.search/read/draft/send` | §8.2 | results | `CONN_EXPIRED`, `SEND_FAILED` | J5, J11, J12 | 4, 5 |
| `gcal.list/create` | §8.2 | events | `CONN_EXPIRED` | J9, J10 | — |
| `gmail.pollHistory` | `connectionId` | new message ids (§16.1.3) | `CONN_EXPIRED` | J6, J11, J14 | — |
| `gmail.updateDraft` / `deleteDraft` | `gmailDraftId`, message / `gmailDraftId` | `void` | `CONN_EXPIRED` | J12 | 4 |
| `wa.link/unlink/read/draft/send` | §8.2 | — | `WA_LINK_FAILED`, `WA_UNLINKED`, `SEND_FAILED` | J4, J12, J16 | 4, 5 |
| `wa.resolveRecipient` | `to: string` | `{ jid, isNew }` or a Choice card (§16.4.2) | — | J12, J16 | 5 |
| `x.draft/openCompose` | `text` | card | `X_TOO_LONG` | J12 | 4 |
| `contacts.sync` / `contacts.search` | — / `query` | `ContactHit[]` (08-5 §3.3) | `CONN_EXPIRED` | J12, J16 | 5 |
| `hub.connect` / `hub.call` (v1.1) | `app` / `app, tool, args` | `ConnectionRow` / result | `CONN_TOOL_UNKNOWN`, `CONN_PAUSED`, `APP_BLOCKED` | — | 2, 5, 7, 8 |

### 16.7 Google Contacts (v1, read only) [X-48]
- **Connect**: the same Google sign-in as Gmail and Calendar (§16.1); the scope `contacts.readonly` is asked with them, or incrementally when Gmail was connected earlier ("To find the right person, I need to see your contacts." [ Allow ]). One token covers Gmail, Calendar and Contacts rows. `[verify scope tier in M8: Google lists contacts.readonly as sensitive, not restricted]`
- **Calls**: People API `people.connections.list(resourceName='people/me', personFields='names,emailAddresses,phoneNumbers', pageSize=1000, pageToken…)` until no `nextPageToken` (`sortOrder` default; ≤ 25,000 rows kept, the rest ignored and logged; synced every 24 h while foo runs and on connect; X-124) into the tables `contacts_index` + `contacts_fts` (08-0 §G.12, X-74; DDL in 08-1: name, emails, phones; no notes, no photos); rows are replaced wholesale on each sync; `people.searchContacts` for a miss. Nothing is written to Google. `contacts_index` is never exported and never in Ctrl+K.
- **Use**: `contacts.search` (08-2 §8.2) returns `ContactHit[]` (08-5 §3.3) and resolves names for `gmail.draft` and `whatsapp.draft`; one match → that person; two or more → Choice card "Which {Priya}?" with masked addresses; none → treated as someone new (Art. 5: full Approval card "You haven't messaged her before").
- **Settings**: the Contacts row's "Turn off" sets `settings.connections.google.contactsOn=false` (08-0 §A), which stops sync and deletes `contacts_index`; "Turn on" re-syncs. Disconnect Google removes all three rows and the token (§16.1.2). Contact details never enter memory unless the user says so; they are masked in toasts and logs (08-2 §11.4).

### 16.8 Connections hub (v1.1, flag `flags.hub`) [X-49]
- **One hub**: the v1.1 Connections gallery (Zomato, Swiggy, Notion, Drive, OneDrive and others) runs through ONE hub connection. Default **Composio** (free Hobby tier ≈ 100,000 tool calls/month; one connected account per user per app; managed sign-in pages; can wrap other connections). Second option **Zapier** for apps Composio lacks (9,000+ apps; each call uses 2 Zapier tasks, free plan ≈ 50 calls/month; the user is the single account owner). Gmail, Calendar, Contacts and WhatsApp stay direct (§16.1, §16.4, §16.7), never through the hub. Prices and limits are re-checked at v1.1 build.
- **Client**: foo's engine is the only client (MCP over HTTPS); the user's AI never talks to the hub (its own tools stay off, 08-2 §6). The hub key is in the vault `foo/hub_key/{composio|zapier}` (08-0 §E.8, `SecretKind 'hub_key'`); app sign-ins happen on the app's own page in the default browser.
- **foo manifest per app** (shipped with foo): allowed tools, the action class of each tool (08-2 §9.2) written by foo, its plain-words name, and a hash of the hub's tool descriptions. Unknown tool → `CONN_TOOL_UNKNOWN`. Description change → the app pauses: "🔌 {Zomato} changed how it works. I've paused it until I check." [ Reconnect ].
- **Gate**: every tool that writes, sends, books, buys, pays, posts or deletes goes through the Approval card (and the Payment card for money) and the second look (Art. 4–7, 10). A tool that would charge a saved card or wallet is refused. Finance apps (banks, UPI, trading, crypto, password managers) are blocked in the manifest and never listed.
- **Results** are untrusted (08-2 §7.2 part 9) and flagged "page asked" when they ask for a new payee, domain or secret (08-2 §9.6); arguments pass the Redactor (08-2 §11.4 R11).
- **Cost**: hub calls are free inside the hub's free tier; any paid call is priced in `pricing.json` and counts toward the AI cap.
- **Words**: the user sees app names and "Connect" only; never "MCP", "server", "hub" or "tool" (Art. 2). The hub itself appears in Settings → Connections as "Connect more apps" (06-2 §6.8).
- "Add your own connection" is later, behind an Advanced switch (research/capabilities.md §5.2 rules for (ii)).

#### 16.8.1 Hub wiring (v1.1; written now so v1.1 needs no choices; INT-25)
- **Manifest files**: `resources/hub-manifests/{slug}.json` = `{ "app": "zomato", "displayName": "Zomato", "hub": "composio" | "zapier", "tools": [ { "hubName": "ZOMATO_SEARCH_RESTAURANTS", "fooName": "zomato.search", "actionClass": "read" | "prepare" | "send" | "book" | "buy" | "pay" | "post" | "delete", "plainWords": "look for restaurants", "descriptionSha256": "…" } ] }`. A tool not in the file → `CONN_TOOL_UNKNOWN`; a `descriptionSha256` mismatch → the app pauses (`CONN_PAUSED`, card above).
- **Transport**: Composio's hosted MCP endpoint over HTTPS (Streamable HTTP), header `x-api-key: {hub key}`; Zapier's MCP endpoint over HTTPS with the URL key the user pasted. Endpoint URLs live in the manifest set's `resources/hub-manifests/_hub.json` `{ composio: { url }, zapier: { url } }`, re-checked at v1.1 build.
- **Sign-in flow**: `hub.connect(app)` asks the hub for the app's managed sign-in link, opens it with `shell.openExternal`, and polls the hub's connected-account status every 5 s for up to 10 min (`OAUTH_TIMEOUT` after that); success → connection row `app='hub'`, account = the app slug.
- **Cost rows**: `pricing.json` gains `hub.composio.perCallUsd` (0 inside the free tier) and `hub.zapier.perCallUsd`; each call writes a cost line like a web tool (08-2 §5.10) and counts toward the AI cap.

---

## §17. Helpers and groups (J15, J16)

17.1 **Routing**: intake receives each helper's name and `job_text`; `handoff` decisions are validated (helper exists, not paused, the helper's `allowedApps` cover `needsApps` per §17.6, else the helper asks "Let {helper} use {app}?" in its chat, J15). Two equally fitting helpers → Choice card "Who should take this?" (J15). The job is created in the helper's chat (`chat_id`), the foo chat gets the handoff marker (`marker_kind='handoff'`, C15) and a `job_link` card mirroring `job:upsert` (J15 step 2; 08-0 §G.1). One owner per job (GRK §4.2).
17.2 **Handoff note** (fixed shape, GRK §4.4) `HandoffNote { done: string[]; proof: Proof[]; open: string[]; nextOwner: string }` (08-0 §B.3) rendered to `jobs\{id}\handoff.md` as four `##` sections `Done`, `Proof`, `Open`, `Next owner`. Payment cards stay in the chat where the job runs; receipts go to Money per §17.5.

17.3 **Groups** (2–6 members; AG-08 algorithm, 08-0 §H ruling).
17.3.1 **Owner.** For each user message in a group, the owner is: the `@mentioned` helper (first mention wins; it must be a member, else the line "{Home} isn't in this group. [ Add Home ] or ask in Home's chat."); else, if exactly one job of this group is WORKING or NEEDS_YOU, that job's owner (steer, 08-2 §5.5); else the intake AI's pick, run with **foo's** identity and a `members` block (name, `job_text`), returning a `GroupIntakeAct` (08-0 §B.3; 08-4 §25.2a). foo itself never speaks in a group unless it is a member, and never answers on another helper's behalf (Art. 1).
17.3.2 **Turns.** Exactly one AI turn for the owner, then one for each member named in `parts`, in `group_members.added_at` order. Each non-owner turn posts at most one bubble (≤ 240 chars, Art. 23) or a `react`; its `<act>` is a `GroupMemberAct` (08-0 §B.3; prompt `group_member.md`, 08-4 §24.20; X-126). Only `handoff_accept` creates that member's job (title from `task`, `origin='handoff'`, `origin_chat_id` = the group) and posts the C15 marker; `reply` and `react` never create a job. A member named in `parts` that answers `reply` or `react` is treated as declining its part: the owner's job carries on without it and the group gets the line "{Money} has nothing to add." (`thread.group.no_part`). This is J16's "has a different part" branch. The owner's turn may create its job (in its 1:1, `origin_chat_id` = group) and call `helper.handoff` for a part; the group gets the marker "{Trips} asked {Money} to {task}" (05 §5.18.1). No member speaks again until the next user message or until a job of this group reaches DONE, FAILED or NEEDS_YOU.
17.3.3 **Results in the group.** When a group-origin job changes state, the group gets the `job_link` card (05 §5.18.2) and, on DONE, the owner's result as one bubble containing only the `result` text, passed through the Redactor channel `group` (rules (a)–(d) of 08-2 §11.4 item 3; "paid" = `payments.state = 'succeeded'`, the address = the value `browser.fillPersonal` typed for the job's approvals; Art. 14: removes amounts the user paid, addresses, phone numbers and any fact with `private=1`). Cards of types `approval`, `payment`, `draft`, `secret`, `signin` and any Choice card with `purpose='memory_confirm'` are never inserted into a group chat (Store-level check `GROUP_CARD_FORBIDDEN`, §21.3); the gate creates them in the owner's 1:1 and the group gets "{Trips}: {Payment and the address} stay private. I've asked {firstName} in their own chat." [ Open {Trips} ] (J16; the braces list the moved card kinds in plain words: "Payment", "the address", "a sign-in", "a password").
17.3.4 **Loop guard.** The group's chat row counts helper messages since the last user message (`chats.helper_messages_since_user`); > 6 → the group is paused (`chats.loop_paused = 1`) with the bubble "We're going in circles. Pausing until you reply." (J16); open jobs keep their state; any user message resets the counter and the pause.
17.3.5 Private facts and `about-you` facts never enter a group prompt except through §12.5.1.
17.4 Limits: 8 helpers (J15), names unique case-insensitive and ≠ `agentName`.

17.5 **Helper notes and receipts** (AG-14, 08-0 §H ruling; BE-48's "free Markdown" and AI-24's `helper.note` tool are not adopted).
`helpers\{id}\notes.md` uses the §12.2 line format and is indexed in `memory_index` with `scope='helper'`, `kind='fact'`; provenance `said` when the user told the helper, else `guessed` with reason "from the {Goa stay} job". **Writers (only these):** (1) the engine, deterministically, on every DONE job of that helper: one line per completed approval built from `ApprovalFields` + `Proof` with the template "{item or payee} · {when or amount} · {proof code} · free cancel until {Wed 10 Dec}" (the last part only when `cancelTerms.freeUntil` exists), e.g. "Goa stay 12–14 Dec · Taj Holiday Village · #TJ88213 · free cancel until Wed 10 Dec"; (2) the post-turn review (§12.4) for that helper's chat with `scope='helper'`; (3) the user, on the Memory page. The 06-2 §7.3 helper-notes rows (Change/Forget) work on these lines like any fact.
**Receipt to Money (J15; UX-32):** when a job of any helper other than Money reaches COMPLETED with a payment, the engine posts in Money's chat, as Money's bubble with **no AI turn** (runner copy, prompted): "Added: ₹{14,600} {Taj Holiday Village} (via {Trips}) to {December} spending." and writes one Money notes line `kind='fact'`, provenance `guessed`, reason "from the {Goa stay} job": "Paid ₹{amount} to {payee} via {Trips} · {Fri 16 Oct}". No Money helper → nothing is posted (the payment is still in Spend and Activity).

17.6 **Helper permissions → tools** (AG-31, X-54: helper `allowedApps` AND Settings → Permissions).
`HelperForm.allowedApps` keys (08-0 §B.3): `gmail, gcal, contacts, whatsapp, x, outlook, browser, payments` (booleans). Gating per helper: `gmail` → `gmail.*`; `gcal` → `gcal.*`; `contacts` → `contacts.search`; `whatsapp` → `whatsapp.*`; `x` → `x.*`; `outlook` → `outlook.*` (v1.1); `browser` → `browser.*`, `web.*`, `screen.open`, `job.needSignIn`; `payments=false` → any call whose action class is `buy` or `pay` (including `browser.fillCard`, `browser.submit` under a pay approval, a `hub.call` classed pay) returns `HELPER_NOT_ALLOWED` and the helper asks in its chat "I need to pay for this. Let {Trips} ask you to approve payments?" [ Allow ] [ Not now ] (same pattern as the J15 app ask; Allow sets `payments=true`). Always available to every helper: `memory.*`, `routine.propose`, `helper.handoff`, `files.read`, `files.write`; `files.delete` follows Settings → Permissions → Folders. A tool passes only when **both** the helper's `allowedApps` and the user's Settings → Permissions row (08-0 §G.3) allow it; foo itself (`owner_kind='foo'`) is gated by Settings → Permissions only.

---

## §18. Voice (J7)

18.1 **In**: renderer `MediaRecorder` (`audio/webm;codecs=opus`) → `files:stage` → `voice:submit` (discard < 0.5 s with `VOICE_TOO_SHORT`; auto-stop 5:00). Stored `{DATA}\data\voice\{messageId}.webm` `[deviation: J7 says .ogg; Chromium records WebM/Opus natively; logged G-08-06]`. **The user's AI never receives audio** (J7 step 3's AI fallback is withdrawn). **Transcription order [settled: X-43]:**
1. **OpenAI** when `settings.chat.voiceToText = 'openai'` and the vault holds the OpenAI key (`foo/ai_key/openai-key`, 08-0 §E.8; the same key the `openai-key` AI uses): `POST https://api.openai.com/v1/audio/transcriptions`, header `Authorization: Bearer {key}` (the key comes from `vault.use({ purpose: 'voice_call', name: 'openai-key' })` and lives only in main/engine memory for the call), multipart fields `file` (filename `note.webm`, type `audio/webm`, the recorded file as is), `model` = `settings.chat.transcribeModel` (default `gpt-4o-mini-transcribe`; `gpt-4o-transcribe` if Hindi/Punjabi accuracy is poor in testing), `response_format=json`; no `language` (Hindi, Punjabi, English and mixed are detected); 60 s timeout. Notes over 25 MB are never sent (local path). The audio goes only to OpenAI. The transcript passes the Redactor (08-2 §11.4 R11) before it is stored. **Responses:** 200 with `text` → transcript; 200 with empty `text` or fewer than 2 letters → garbled (step 4); HTTP 401/403 → `settings.chat.voiceKeyRefused = true`, Settings → Chat and voice shows "OpenAI didn't accept this key." with Link "Replace key", local path for this note; 429, 5xx, timeout or network error → local path, no flag. **Cost** = `ceil(durationMs / 1000) / 60 × pricing.voice[model].perMinuteUsd × usdToInr × 100` paise, rounded up, checked against the AI cap **before** the call (08-2 §5.10; at the cap → local path) and written as an `ai_turns` row `provider_id = 'openai-voice'` (`CostProviderId`, 08-0 §B.2), `purpose = 'voice'`, `billing = 'key'`, `cost_source = 'priced'`, `model_reported = model`.
2. **This PC** (backup): bundled `whisper-cli.exe` + the `ggml-base` multilingual model, downloaded on the first voice note that needs it. **Source (AI-07, BE-31):** `resources/voice-pack.json` = `{ "url": "https://huggingface.co/ggerganov/whisper.cpp/resolve/{commit}/ggml-base.bin", "sha256": "{64 hex}", "bytes": {pinned at release}, "version": "{whisper.cpp commit}" }` shipped with each release; **Vikas pins `url` (with the commit hash), `sha256` and `bytes` at release from the file actually tested** (pinned at release, owner list). Download rules: HTTPS only, from that one URL (redirects allowed only to `huggingface.co` and `cdn-lfs.huggingface.co`), resume with `Range`, 3 tries with 2 s / 10 s / 60 s backoff, size must equal `bytes`, SHA-256 must equal `sha256` before the file is moved to `{LOCAL}\voice-model\ggml-base.bin`; any mismatch → delete the file and show X-22's failure copy "I couldn't set up voice notes. [ Try again ]". While downloading, the composer notice shows "Setting up voice notes… {n}%" [X-22]; offline → the note is kept and transcribed when back. **Run:** the engine decodes the WebM to 16 kHz mono WAV in a temp file, then `whisper-cli.exe -m {LOCAL}\voice-model\ggml-base.bin -f {tmp}.wav -l auto -t {min(4, cores − 1)} -nt -ojf -of {tmp}` (**full** JSON, X-131), 60 s timeout, ≤ 3 s target for a 15 s note on the Art. 28 reference laptop. Used when `voiceToText = 'this_pc'`, when there is no OpenAI key, when OpenAI is unreachable or refuses the key, or when the AI cap is reached.
3. **No OpenAI key, first voice note**: before transcribing, foo posts the one-time OpenAI key card (Secret card, `secretKind='voice_key'`, 05-2 §5.8): Save key → OpenAI path; "Use this PC instead" → local path and pack download. `settings.chat.openAiKeyOffered = true` after either answer or a dismiss; it is never offered again (Art. 20, suggestion key `voice_key:openai`); the user can add the key later in Settings → Chat and voice.
4. **Confidence (AI-28).** Local (X-131): **confidence** = the mean of every token's `p` over all segments (`transcription[].tokens[].p`, excluding tokens whose `text` starts with `[_`), weighted by the token's text length in characters; `< 0.60` → "I heard: '{text}'. Right?" (J7). **No speech**: the joined `text` after trimming has fewer than 2 letters, or whisper's `result.language` is `nospeech`/absent → the J7 failure copy. `[verify the JSON field names against whisper.cpp examples/cli/cli.cpp output_json at M11; the fixture captured then is binding]` OpenAI: `verbose_json` is not requested; an empty result or fewer than 2 letters counts as garbled → the local result is used with the "I heard… Right?" line (or, if the local pack is not installed yet, the line with the OpenAI text). Both paths fail → J7 failure copy. OpenAI failures are never shown when the local path succeeds.
18.2 **Out**: `foo-native.synthesize(text, lang, outPath)` (WinRT `SpeechSynthesizer`, installed Windows voices) → WAV in `{DATA}\data\voice\`; skipped for replies that are mostly numbers/links/addresses or > 60 s of speech (J7 step 3). **Voice choice:** the first installed Windows voice whose language tag starts with the message `lang` (`hi` → `hi-IN`, `pa` → `pa-IN`, `en`/`mixed` → `en-IN`, else the first `en-*`); none for `hi`/`pa` → `en-IN` reading the text as is; no voice at all → text only. Never auto-plays.
18.3 Retention: `settings.privacy.voiceDays` (7 | 30 | null = keep; default 30, 08-0 §A) unless the message is kept with "Keep this voice note" (`messages.pinned = 1`, IPC `message:pin { messageId; on }`) (J21).

---

## §19. Logging, privacy, data lifecycle

### 19.1 Tech log (`logs\app-{date}.log`)
JSON lines `{ t, lvl, mod, evt, ids: { chatId?, jobId?, approvalId? }, kind?, ms? }`. MUST NOT contain message text, page text, prompt text, AI replies, email addresses, phone numbers or secret values (Redactor channel `log`, R7). Allowed: ids, error kinds, durations, counts, provider ids, masked accounts (`v***@gmail.com`). Levels: info/warn/error; debug only in `FOO_TEST` or when the user turns on "Send a report" for one session. 14-day retention, 10 MB/day cap (oldest lines dropped).

### 19.2 What leaves the PC (J21 Privacy statement)
Only: (a) prompts to the user's chosen AI (redacted, §11.4); (b) requests to sites and connected services the user asked foo to use; (b2) voice-note audio to OpenAI when the user saved an OpenAI key and kept "OpenAI" on for voice notes [X-43]; (b3) redacted search queries, page addresses and public browsing goals to the web tools whose keys the user saved (Exa or Tavily, Firecrawl, Browser Use) [X-46]; (b4) v1.1: requests to the connections hub for apps the user connected [X-49]; (c) update checks to the release feed (version only); (c2) one download of the voice pack from the address in `resources/voice-pack.json` (`huggingface.co`) the first time a voice note needs it (§18.1); Settings → Privacy "What leaves this PC" says "Once, foo downloads a voice pack (148 MB) when it is needed." (cross-ref 06-2 §6.6; 10-2 ART-15b allows `huggingface.co`, `cdn-lfs.huggingface.co`); ("Send a report" uploads nothing: it saves a redacted .zip to `{OUT}\reports\` (`app:reportSave`, X-129) [settled: X-12]). No analytics, no telemetry, no foo cloud `[foo decision from the blueprint]`. Electron `crashReporter` is started with `uploadToServer:false`; dumps stay in `{DATA}\logs\crashes\`, kept 14 days (one rule with 09 §9.21; BE-14).

### 19.3 Retention (defaults; Settings can change the marked ones)

| Data | Kept |
|---|---|
| Chats, messages, cards, jobs, approvals, payments | until the user deletes them (J21 "Delete chats older than…") |
| Activity log | until "Delete everything" (J23) |
| Job screenshots | 7 days (setting: 1 / 7 / 30 / don't keep) |
| Voice notes | 30 days unless pinned |
| WhatsApp mirror messages | 7 days |
| Routine runs | last 20 per routine |
| Tech log | 14 days |
| Crash dumps (`{DATA}\logs\crashes\`) | 14 days |
| Inbox attachments (`data\inbox`) | with their message |
| Memory tombstones | 90 days |
| `notifications` rows | 35 days |
| `tool_calls` | kept while the job is non-terminal; 7 days after `jobs.finished_at` the columns `args`, `result` and `observation_ref` are set to `'{}'`, `NULL`, `NULL` (row kept for recovery and Activity 'See the job'); the row is hard-deleted 90 days after `finished_at` by main's housekeeping (terminal jobs only; `HardDeletable` unchanged, X-129) |
| `ai_turns` | forever (cost history; Spend month switcher) |
| `cards` | with their message (soft delete then purge, 08-0 §G.5) |
| `site_notes` | forever; `site_recipes` 180 days since `last_ok_at` |
| `jobs\{id}\downloads\` | 30 days |
| `held_items` | delivered or 7 days (§15.6) |
| `contacts_index` | replaced on each sync; deleted with Google or Contacts off |
| `backup\` | last 3 |
| `foo-damaged-*.db` | 30 days |
| `launches.json` | last 10 entries (08-0 §G.14) |

Voice notes follow `settings.privacy.voiceDays` (null = keep) unless pinned (§18.3); job screenshots follow `settings.privacy.screenshotDays` (0 = don't keep). **Two nightly jobs, two times (DB-34):** the memory tidy runs at 03:00 (§12.7); the **housekeeping** task runs at **03:30** user time (or once after the next 10 min of idle if the PC was off/asleep) and applies this table, then `PRAGMA optimize`; `VACUUM` monthly when free pages > 20 %. Copy that names the clean-up (06-2 §6.6) says "Older screenshots are removed tonight." with no time.

### 19.4 Export (J21) and wipe (J23)
Export writes one zip (§19.4.1) — never vault items, never `contacts_index`, never WhatsApp mirror text (`wa_messages`, other people's 7-day messages); every file passes the final scan (R9: any secret hit aborts the whole export with `EXPORT_SECRET_FOUND`, "I found a key in the export, so I stopped. Nothing was saved."). Progress arrives on `data:exportProgress` (08-0 §B.5); a finished export writes an activity row `kind='changed'`, `event='exported'` (08-0 §G.4). Wipe order exactly J23 step 4 (stop jobs → revoke Google token, log out WhatsApp device → delete every Credential Manager target starting `foo/` → delete `{DATA}` and `{LOCAL}` → remove startup entry, shortcuts, AUMID registration); `{OUT}` is never deleted. Failures are listed by name (J23 branches).

#### 19.4.1 Export zip layout (DB-14)
File name `foo-export-{d-Mon-yyyy}.zip` (e.g. `foo-export-16-Oct-2026.zip`); the memory-only export (06-2 §7.4 "Export what I know") is `foo-memory-{d-Mon-yyyy}.zip` and contains only `README.txt` and `memory/`. Both are written to the folder the user picks (default `{OUT}`). JSON files are UTF-8, camelCase (08-0 §0), pretty-printed with 2 spaces; times are epoch ms plus an ISO 8601 copy in the user's time zone. Folder and file names use `safeName()` (08-0 §E.7).
```
README.txt                      plain words: what is inside; "Keys, passwords and cards are never included."
chats/{chat title} ({chatId})/messages.json   MessageRow[] with cards: CardRow[] inline; soft-deleted rows omitted
chats/{chat title} ({chatId})/messages.html   one static page in the 04 bubble layout, tokens inlined, no scripts
chats/{chat title} ({chatId})/files/          that chat's inbox attachments and voice notes, original names
memory/                         the {DATA}\memory folder as is (includes helpers' notes.md files)
routines/{routineId}.json       RoutineRow + task, schedule, condition
helpers/{helperId}/profile.json HelperRow (no face file path; the face PNG beside it as face.png if one exists)
jobs/{jobId}/plan.md, state.json, steps/*.jpg   screenshots only within retention
activity/activity.jsonl         every activity row (08-0 §G.4 fields)
activity/activity.csv           the 06-3 §9.3 columns
files-index.json                FileRow[] with kind IN ('made','downloaded') and missing_since IS NULL (no file contents)
settings.json                   the settings file without install, dev and flags
```
`files-index.json` = `FileRow[]` with `kind IN ('made','downloaded')` and `missing_since IS NULL`; `received` files are inside `chats/…/files/`, screenshots inside `jobs/…/steps/` (X-129).

### 19.5 Attachments and photo checks
Attachments are checked before any AI turn per 08-0 §G.18 (X-98: Windows OCR, black out card, CVV, OTP, Aadhaar, bank account). If OCR is unavailable the user gets the one-time `thread.papers.photo_notice` Choice. This is Redactor row R13 (08-2 §11.4).

---

## §20. Performance budgets (reference laptop: i5, 8 GB, SSD, Windows 11; Art. 28)

Every budget is measured as 10-2 §E.1 says: reference laptop, release build, the §E.1 data set (= the `perf` seed, §22.9), 20 runs, the **95th percentile** must meet the budget (X-130). The ids and rows are exactly 10-2 §E.

| PERF id | Metric | Budget | Measured as 10-2 §E.1 (p95 of 20) |
|---|---|---|---|
| PERF-01 | Cold start | < 2.0 s | process start (double-click, after reboot) → chat list painted and accepting input |
| PERF-02 | Typing latency | < 16 ms | keydown in composer → character painted, with the 5,000-message chat open and a job running |
| PERF-03 | Switch chats | < 100 ms | click or Enter on a chat row → that chat's last messages painted |
| PERF-04 | Scroll 5,000 messages | 60 fps | fling from bottom to top and back; ≤ 1 % frames over 16.7 ms; virtualised list |
| PERF-05 | Search first page (J22) | < 300 ms | last keystroke + 150 ms debounce → first results painted, at 50,000 and at 100,000 messages |
| PERF-06 | Stop halts all activity (J18) | < 1 s | "stop" sent → last click or AI call for that job; 0 events after 1 s |
| PERF-07 | 👀 badge (C1) | ≤ 1 s | send → 👀 painted |
| PERF-08 | Checklist visible (J5) | ≤ 2 s (not before 1.5 s) | job start → checklist painted |
| PERF-09 | Taskbar overlay (J20) | ≤ 2 s | job enters NEEDS_YOU → overlay shown |
| PERF-10 | Face/name update (J3) | ≤ 1 s | face tapped → chat list, header, jump list updated |
| PERF-11 | Offline shown (J19, X-13) | ≤ 10 s | network cut → WAITING + offline banner strip |
| PERF-12 | Welcome card from Install tap (J1) | ≤ 90 s | Install tapped → welcome card |
| PERF-13 | Living faces idle (02 §F15.9.8) | < 1 % CPU | 200 faces resting, focused 60 s, then minimised and locked 60 s; 0 running face animations while hidden |
| PERF-14 | SQLite single-row write | < 5 ms | one `DbOp` single-row insert/update in main → transaction committed |
| PERF-15 | IPC patch size | < 64 KB (frames excepted) | any main → renderer delta patch during the busiest step |
| PERF-16 | Main + renderer idle | < 400 MB | app idle 60 s after PERF-01, window focused; resident memory |
| PERF-17 | Engine idle (no browser) | < 250 MB | engine idle 60 s, no job running; resident memory |
| PERF-18 | Voice transcript visible (J7) | ≤ 3 s per 15-s note | end of a 15-s voice note → transcript shown |

Limits that are not PERF budgets (checked by their own tests): Edge (foo profile) ≤ 1 browser, ≤ 3 job windows (08-2 §8.3); live view ≤ 5 fps, ≤ 1280 px wide.

A budget miss is a release blocker (10-acceptance).

---

## §21. Error taxonomy

### 21.1 Shape
```ts
interface FooError { kind: ErrorKind; retryable: boolean; jobId?: string; detail?: string /* log only, redacted */ }
```
**`ErrorKind` is a closed union (X-70, 08-0 §B.3)** = the kinds in the §21.2 map (C16 card or named card surface) + the §21.3 renderer-handled kinds + the §21.4 internal-only kinds. A kind in none of these three lists is a type error and may not be emitted; `INSTALL_FAILED` does not exist (X-42). Every `ErrorKind` maps to exactly one user surface (or none, for internal kinds). Copy is J19's, word for word; "Nothing was booked, paid or sent" is shown only when the activity log confirms it, else the card lists what was done (J19.6). Copy keys are `errors.{kind_lower}.{slot}` (08-0 §D). `foo/error-kind-closed`: any string literal passed as `kind` must be a member of `ErrorKind`; the contract test of 08-5 §8 enforces it.

### 21.2 Map (engine kind → user-facing card)

| ErrorKind | Detect | Job effect | Card (C16): what happened / what is safe | One button · `FixAction` kind (08-5 §3.7) | Toast |
|---|---|---|---|---|---|
| `NET_OFFLINE` | `net.isOnline()` false, or 2 consecutive AI calls (per provider) fail with DNS / ECONNREFUSED / ETIMEDOUT to the vendor (08-2 §6.7 signals; `AI_OFFLINE` is not a kind, X-120); retest every 30 s for 1 h, then every 15 min | WAITING | "📡 You're offline." / "Your jobs are saved. Nothing was booked, paid or sent while offline." (the app-wide banner shows the offline line, X-13) | Try again · `retry` | if a job waits > 5 min |
| `AI_SERVICE_DOWN` | 08-2 §6.7 | WAITING | "😴 {AI} isn't answering right now." / "Your {job} job is saved at step {n}. Nothing was booked or paid." | Try again (+ "Use {backup} instead"; the backup AI is offered once per outage, not once per job) · `retry` (+ `use_backup`) | if a job waits > 5 min |
| `AI_SIGNED_OUT` | 08-2 §6.7 | WAITING | "🔑 You've been signed out of {AI}." / "Sign in again and I'll carry on." | Sign in · `sign_in_ai` | same |
| `AI_LIMIT` | 08-2 §6.7 | WAITING(resetAt) | "⏳ You've hit your {AI} plan's limit until {time}." / "Your jobs are paused, not lost." | Remind me at {time} · `remind_at` | only if a job waits |
| `AI_KEY_INVALID` | 08-2 §6.7 | WAITING | "Your {AI} didn't work. It may be old or typed wrong." / "Your jobs are saved." `[J2 row copy adapted to C16; {AI} = 08-0 §B.4 display name, e.g. "OpenAI key"]` | Replace key · `replace_key` | — |
| `AI_NO_VISION` | an attachment needs a picture read (an image, or a scanned PDF page) and the AI's `vision=false` (08-4 §30.6) | WAITING | foo line per 12-2 §12.28.6 (`errors.ai_no_vision.picture`: "Your AI can't read pictures. Can you type the amount and due date?" and the other keys of that table) | Use {backup} instead (hidden when no backup: Open Settings) · `use_backup` (no backup: `open_settings`) | — |
| `SPEND_CAP` | 08-2 §5.10 | WAITING; routines paused_cap | "🧾 You've reached this month's AI cap (₹{cap})." / "I've paused {n} jobs and {m} routines. Nothing was lost." | Raise cap · `raise_cap` (`which:'ai'`) | always |
| `CAP_PURCHASE` | 08-2 §5.10.5 | NEEDS_YOU | Choice card (08-2 §5.10.5) | Raise cap · `raise_cap` (`which:'purchase'`) | — |
| `STUCK` | 08-2 §5.6 | NEEDS_YOU | Stuck card (J19.4) | Try another way · `try_other_way` (the Stuck card also offers `take_over`, `stop`) | yes |
| `CRASH_RECOVERY` | 08-2 §5.9 | NEEDS_YOU | Error card `variant='recovery'` (J19.5) | Pick up where I left off · `resume_job` | — |
| `SAFE_MODE` | 08-0 §G.14 trigger | all held | "foo had trouble starting. I've paused everything so nothing runs twice." | Start normally · `start_normally` | — |
| `CONN_EXPIRED` | Google `invalid_grant` (or Outlook equivalent) | WAITING for jobs needing it | "🔌 Your {app} connection expired." / "{Bills and drafts} are on hold." — `{app}` = the app the job was using: Gmail, Calendar or Contacts (INT-28); with no job, "Google" | Reconnect (runs the one Google sign-in, §16.1.1) · `reconnect` (`app:'google'`) | — |
| `CONN_REVOKED` | the user removed foo's access in their Google account: a refresh returns `invalid_grant` with an `error_description` that says revoked `[verify the wording at M8]`, or an access token is refused with 401 right after a successful refresh | WAITING for jobs needing it; the three Google rows `needs_signin` (§16.1) | "🔌 Google no longer lets me use your {app}." / "{Bills and drafts} are on hold." | Reconnect · `reconnect` (`app:'google'`) | — |
| `CONN_RATE_LIMITED` | Google returns 429 or 403 `rateLimitExceeded` / `userRateLimitExceeded` after the 3 tries of §16.1 Calls | the tool call fails; the step is retried once after 60 s, then counts toward STUCK (08-2 §5.6) | "⏳ {Gmail} is asking me to slow down." / "I'll try again in a minute. Nothing was sent." | Try again · `retry` | — |
| `OAUTH_DENIED` | the user declined, or no `refresh_token` came back | — | Connect card state Denied: "{Gmail} isn't connected. That's fine, I'll work without it." | Try again · `reconnect` (`app:'google'`) | — |
| `OAUTH_TIMEOUT` | no callback within 10 min | — | Connect card state Link expired: "That sign-in link expired." | Reopen · `reconnect` (`app:'google'`) | — |
| `WA_UNLINKED` | Baileys `loggedOut` | — | "💬 WhatsApp unlinked foo." / "I can't read or send WhatsApp messages until you link again." | Link again · `link_whatsapp` | — |
| `WA_LINK_FAILED` | 3 failed links | — | Connect card: "WhatsApp didn't link. You can try later in Settings → Connections." | Skip for now · `dismiss` | — |
| `SITE_BLOCKED` | 403/bot page on every route | FAILED (or hand back) | "🚫 {site} won't let me in." / "Nothing was booked." | Open the page myself · `open_url` | — |
| `SITE_CHANGED` | the page no longer matches the saved recipe or the step's target (role + accessible name resolves to 0 or ≥ 2 elements) and one re-plan of the step also misses; terms that changed after approval stay with the second look (08-2 §5.8) | step re-planned once, then NEEDS_YOU | "🔄 {site} looks different from last time." / "I stopped before doing anything there. Nothing was booked or paid." | Try again · `retry` | — |
| `SITE_TIMEOUT` | the page does not reach `load` within the 15 s wait of 08-2 §8.3.5, twice in a row | step retried once, then FAILED (or hand back) | "⌛ {site} isn't loading right now." / "Nothing was booked or paid." | Try again · `retry` | — |
| `SITE_CAPTCHA` | a CAPTCHA or bot challenge page is detected (08-2 §8.3.5 watchdog → `job.needSignIn{kind:"captcha"}`); foo never solves it (08-2 §8.3) | NEEDS_YOU (Take over, J13) | no C16 card: the Sign-in-here card and banner (05-3 §5.10, J13 copy) | Take over · `take_over` | yes |
| `SITE_HANDBACK` | domain in `handback-sites.json` | step handed back | hand-back card (08-2 §8.3.10): "This is your bank's site. I'll open it for you, and you do this part." (keys `errors.site_handback.body` / `errors.site_handback.button`) | Open {site} · `open_url` | — |
| `FILE_TOO_BIG` | > 25 MB | — | "That file is too big. I can take up to 25 MB." | none · `dismiss` | — |
| `DISK_LOW` | free < 500 MB (checked hourly); also raised for `DISK_FULL` | screenshots off | "💾 Your PC is almost out of space." / "I've stopped saving screenshots." | Open storage settings · `open_settings` (`row:'windows:storagesense'`) | — |
| `CLOCK_WRONG` | HTTPS `Date` header from a Google API differs > 5 min | — | "⏰ Your PC's clock looks wrong." / "Reminders could fire at the wrong time." | Fix the clock · `open_settings` (`row:'windows:dateandtime'`) | — |
| `BROWSER_MISSING` | no Edge/Chrome or launch fails 2× | web jobs WAITING | "🌐 I can't open my browser." / "Web jobs are on hold." | Repair foo · `repair_app` | — |
| `UPDATE_FAILED` | updater error | — | "foo couldn't update. You're still on {version} and everything works." | Try again · `retry` | — |
| `MIC_BLOCKED` / `MIC_MISSING` | getUserMedia NotAllowed / NotFound | — | J7 copies (composer notice) | Open microphone settings · `open_settings` (`row:'windows:privacy-microphone'`) | — |
| `PAYMENT_DECLINED` | 08-2 §10.4 | approval FAILED | "Your bank said no. No money was taken." | Try another card · `try_another_card` | yes |
| `PAYMENT_UNCONFIRMED` | 08-2 §10.5, 15 min | approval FAILED | "I couldn't confirm it. Check your bank app before trying again." | I checked, try again · `checked_try_again` | yes |
| `OTP_TIMEOUT` / `UPI_TIMEOUT` | 08-2 §10.4 | approval FAILED | J10 / J11 copies | Try again · `retry` | — |
| `SEND_FAILED` | Gmail/WhatsApp error on send | approval FAILED | "{Gmail} didn't send it. Nothing went out." | Try again · `retry` | — |
| `DB_REBUILT` | startup had to rebuild `foo.db` after damage (08-0 §H, A-3) | — | "I lost my copy of your older chats after a problem on this PC." / "Your memory, routines, helpers and activity log are safe." (keys `errors.db_rebuilt.what_happened`, `.what_is_safe`, `.button`) | OK · `dismiss` | — |
| `UNKNOWN` | anything unmapped at runtime | job FAILED if in a job | "Something went wrong on my side." / "Nothing was booked, paid or sent." | Try again · `retry` | — |

`SITE_*` and `CONN_*` are never wildcards: every kind is written out above (X-120); `CONN_SCOPE_MISSING` is renderer-handled (§21.3), `CONN_TOOL_UNKNOWN` / `CONN_PAUSED` are §21.3 (v1.1).

### 21.3 Renderer-handled kinds (no C16 card; the surface that caused them shows the line)
`VALIDATION` (field error), `CARD_STALE` and `CARD_EXPIRED` (the card re-renders in its real state), `TOO_LATE` (undo bar "Too late to undo."), `SETTING_LOCKED` (lock tooltip, 06-2 §6.4), `CONFIRM_MISMATCH` / `AMOUNT_MISMATCH` (field error, 09 §9.19.4), `HELLO_CANCELLED` / `HELLO_UNAVAILABLE` (Payment card lines, 09 §9.19.3), `NAME_TAKEN` ("That name is taken."), `HELPER_LIMIT` ("You can have up to 8 helpers."), `GROUP_SIZE` ("A group has 2 to 6 helpers."), `INTERVAL_TOO_SHORT` ("The fastest I check is every 15 minutes."), `ROUTINE_LIMIT` ("You can have up to 25 routines."), `ROUTINE_DUPLICATE` (J14 copy), `FILE_TYPE` ("I can't open that kind of file."), `VOICE_TOO_SHORT` (composer notice "That was too short to hear."), `SECRET_SUSPECTED` (paste catcher), `CHAT_BUSY` / `HELPER_BUSY` ("Stop its job first."), `SCOPE_NOT_ALLOWED` (chip hidden), `URL_NOT_ALLOWED` / `PATH_NOT_ALLOWED` ("I can't open that."), `REQUEST_GONE` / `JOB_GONE` (card collapses "No longer needed."), `LIVE_UNAVAILABLE` (06-3 §11.1 "Can't show"), `EXPORT_SECRET_FOUND` ("I found a key in the export, so I stopped. Nothing was saved."), `DISK_FULL` (→ the `DISK_LOW` card), `PARTIAL_WIPE` (J23 list), `SIGNIN_TIMEOUT` / `AI_NOT_VERIFIED` / `AI_CLI_INCOMPATIBLE` (J2 row "didn't work" [ Try again ]), `MEMORY_PARSE` (J17 line "I couldn't read {n} lines in {file}. [ Show them ]"), `VAULT_WRITE_FAILED` / `VAULT_MISSING` (Secret card Failed/Disabled, 05-2 §5.8.3), `SEARCH_BUSY` (checklist line "Search is busy right now." [ Try again ], no FAILED), `X_TOO_LONG` (Draft card counter), `DUPLICATE_PAYMENT` / `SCAM_SUSPECTED` (Choice/Bill card, 08-2 §10.2), `AMOUNT_UNREADABLE` (→ Stuck card), `PROOF_INVALID` (→ checklist `done_unverified`), `ROUTINE_ACTION_REFUSED` (routine run fails, §13.4.1), `HELPER_NOT_ALLOWED` (the helper's ask line, §17.6), `PRIVATE_BLOCKED` (the helper's line "That one stays between us.", §12.5.1), `USE_EDGE` / `CLOUD_AUTH` / `CLOUD_QUOTA` / `CLOUD_DOWN` / `CLOUD_SECRET_BLOCKED` (silent local fallback, 08-2 §8.3.12), `CONN_TOOL_UNKNOWN` / `CONN_PAUSED` / `APP_BLOCKED` (v1.1 hub pause card, §16.8).
Added by X-120: `NOT_FOUND` (the surface that asked collapses with "No longer here." `errors.not_found.line`), `CHAT_PAUSED` (the send is dropped; the composer notice of the paused chat already shows), `STALE_REV` (the surface re-reads the row and re-renders it in its real state, like `CARD_STALE`), `GROUP_CARD_FORBIDDEN` (the card is created in the owner's 1:1 instead and the group gets the §17.3.3 line "{Trips}: {Payment and the address} stay private. I've asked {firstName} in their own chat."), `SECRET_EXISTS` (Secret card line `cards.secret.line.exists` "You already saved a card ending {4242}. Remove it in Settings → Money first." [ Open Money ] · `open_settings` (`page:'money'`); logins and keys replace the saved value and log `secret_replaced`, never this kind; X-129), `CONN_SCOPE_MISSING` (Settings → Connections row state "Not allowed yet" + Primary "Allow" (copy owned by 06-2 §6.8; incremental consent, `prompt=consent`, §16.1.1); in a job the step line `errors.conn_scope_missing.line` "I'm not allowed to see your {calendar} yet. Allow it in Settings → Connections." [ Open Connections ] (`errors.conn_scope_missing.button`) · `allow_scope`; §16.1 Tokens, X-127). `CHAT_BUSY` keeps its line above.

### 21.4 Internal-only kinds (logged, never shown; a user-visible effect only through STUCK or UNKNOWN)
The complete internal list (X-120): `IPC_REJECTED`, `PROTOCOL_INVALID`, `PROTOCOL_STRAY_TEXT`, `PROTOCOL_SAY_LEAK`, `PROTOCOL_FIX_ACTION`, `AI_TIMEOUT`, `AI_PROTOCOL_VIOLATION`, `PROMPT_TOO_LONG`, `PROMPT_HASH_MISMATCH`, `PROMPT_PLACEHOLDER_EMPTY`, `PROMPT_TRIMMED`, `FAKE_AI_NO_MATCH`, `ROUTE_ORDER`, `USE_SUBMIT`, `SECRET_IN_TYPE`, `REDACTION_LATE_HIT`, `APPROVAL_BAD_TRANSITION`, `APPROVAL_EVIDENCE`, `RULE_NOT_ALLOWED`, `VAULT_PURPOSE_DENIED`, `IDEMPOTENT_REPEAT`, `OAUTH_STATE_MISMATCH`, `DB_OPEN_FAILED`, `DB_MIGRATION_FAILED`, `DB_BAD_TRANSITION`, `DB_REBUILD_FAILED`, `DB_STALE_REV`, `DB_NOT_WRITABLE`, `DB_CONSTRAINT`, `ACTIVITY_MIRROR_FAILED` (`DB_REBUILT` is user-facing, §21.2).
- `AI_PROTOCOL_VIOLATION`: a CLI turn ran a command or tool despite tools being off; the turn is discarded and retried once (08-2 §6.3), then the provider is marked unusable for jobs (`AI_CLI_INCOMPATIBLE`).
- `APPROVAL_EVIDENCE`: the draft approval request is rejected and the AI is asked again, then → Stuck; never shown.
- `PROTOCOL_INVALID` is the only spelling (never `AI_PROTOCOL_INVALID`); `GROUP_CARD_FORBIDDEN` moved to §21.3 (X-120).
- X-136 settles X-120's listing of `AI_CLI_INCOMPATIBLE`, `URL_NOT_ALLOWED` and `SETTING_LOCKED`: each kind sits in exactly one list, so they are §21.3 kinds, where a user action shows their line (setup row, "I can't open that.", lock tooltip); raised inside a job or an AI turn with no surface (a CLI that is unusable for jobs, a blocked deep link or URL, an AI `setting` request on a locked path) they are only logged, as an internal kind would be.

---

## §22. Testing hooks

22.0 **Contract tests that always run** (round 2): every `NamedQuery` member has exactly one prepared statement in `src/main/db/queries.ts` (08-1 §2.4.1); every `Invokes`/`Events` channel of `src/shared/ipc.ts` has one handler and one zod schema (08-1 §3.1.0); every `ErrorKind` appears in exactly one of §21.2, §21.3, §21.4 (X-136).
22.1 **Build flag** `FOO_TEST=1` (test builds only; production builds strip the code via a compile-time define, verified by a CI check that greps the packaged `app.asar` for `__fooTest`).
22.2 **Injected dependencies**: `Clock` (now, timers — fake clock drives expiry, routines, quiet hours, catch-up; copy tests start it at Fri 16 Oct 2026, 9:00 AM IST [X-10]), `Net` (online toggle), `Power` (suspend/resume/lock events), `IdGen` (deterministic), `Hello` (returns any of the five values of 08-5 §6 — `verified | canceled | retries_exhausted | device_busy | unavailable`, X-111 — scripted by `test:hello { result }`), `Vault` (in-memory, same API, same purpose checks), `Notifier` (records toasts instead of showing them).
22.3 **Fake AI** (provider `fake`, display name "Test AI"): `FOO_FAKE_AI` points to a JSON Lines script; each line is `{ "match": { "purpose": AiPurpose, "promptIncludes"?: string, "chatId"?: string }, "reply": string /* the full FOO/1 envelope */, "usage"?: AiUsage, "delayMs"?: number, "error"?: ErrorKind /* one of the §21.2 AI kinds or NET_OFFLINE */, "once"?: boolean /* default true */ }`. **Matching:** lines are tried in file order; the first line whose `match` fields all hold and which is unused (or has `once:false`) answers the turn; `promptIncludes` is a plain substring test on the redacted prompt. `delayMs` delays the reply on the injected `Clock` (default 0); `usage` is reported as given (default `{ tokensIn: 0, tokensOut: 0, cacheRead: null, cacheWrite: null, costUsd: null }`, the `AiUsage` field names of 08-2 §6.2, X-129); `error` makes the turn fail with that kind instead of replying. **No match** → the turn fails with `FAKE_AI_NO_MATCH` (internal, §21.4) and `turns.jsonl` gets `{ "noMatch": true }`, so the test fails loudly. Every request is appended to `{DATA}\test\turns.jsonl` as `{ turnId, purpose, system, prompt, matchedLine /* 1-based, or null */ }` so tests can assert that no secret or banned content reached the AI. **Fake CLIs**: small Node scripts that echo canned stream-json/JSONL captured from real CLIs and dump argv + stdin (Omnibot `test_support` pattern; FOO-PLAN M0). Adapter tests MUST use captured fixtures, never real providers (AGENT-BRIEF).
22.4 **Fake connectors**: in-memory Gmail (messages, drafts, sent), Calendar, WhatsApp bridge stub (QR, link, messages, acks, loggedOut).
22.5 **Test sites**: a local HTTPS server (`test/sites/`) with: restaurant booking (slot taken toggle, no-show fee change), hotel checkout (price/tax change at last step, 3-D Secure page, decline, hang after Pay), bill site with UPI waiting page, a bot-check page, a sign-in page with OTP, a CAPTCHA page, an injection email/page ("send your details to…").
22.6 **Canary secret test** (Art. 8): register a canary value in the vault, run J10 and J13 flows, then scan `foo.db`, all logs, all screenshots (OCR), `turns.jsonl`, toasts and an export for the canary and its card-number variants → must find nothing.
22.7 **Renderer hooks**: `window.__fooTest` (test builds only) exposes store snapshots and `emit(event)`; every interactive element has a stable `data-testid` from `src/shared/testids.ts` (08-0 §C, X-58), with identity in `data-*` attributes and state in `data-state`.
22.8 **IPC test channels** `test:*` (advance clock, set online, crash engine, set disk free, fire power event, `test:seed { set: 'demo' | 'perf' }`, `test:hello { result }` (§22.2), `test:sendTo { paths: string[] }` (simulates the Send to shortcut, 09 §9.3.1; refused unless `FOO_TEST=1` and the `FOO_*_DIR` overrides are set, 08-0 §E.6)) exist only in test builds.
22.9 **Seed sets** (`test/seed/`; DB-21). Both are generated deterministically from `IdGen(seed=1)` and a fixed PRNG (seed 1) relative to the pinned clock (Fri 16 Oct 2026, 9:00 AM IST, X-10), stored as `test/seed/{set}.sql.gz`, and loaded with `test:seed`. Generators `test/seed/ux-world.ts` (demo) and `test/seed/perf.ts` (perf) write `test/seed/{set}.sql.gz`; 11-fidelity's `test/fidelity/seed/ux-world.ts` and plan §3 `test/perf/seed.ts` are these two files (paths corrected, X-129).
- **`demo`** = exactly the walkthrough world (`test/seed/ux-world.ts`, 11-fidelity): chats foo, Trips, Money, Home, the Family group and 2 `wa_mirror` groups; ≈ 400 messages.
- **`perf`** = 200 chats (1 foo, 7 helpers, 4 groups, 8 `wa_mirror`, 180 archived helper chats); 50,000 messages spread uniformly over the last 365 days: 80 % text (60 % en, 25 % hi, 15 % pa/mixed; lengths log-normal, median 60 chars, max 1,400), 8 % cards (choice 40 %, approval 25 %, payment 10 %, draft 10 %, other types 15 %; all in terminal states), 5 % voice (12 s, one seeded audio file), 4 % text with a file attachment, 3 % markers and briefs; 2,000 jobs (done 70 %, failed 10 %, cancelled 10 %, done_unverified 10 %) with 4–9 steps and 10–40 tool calls each; 1,500 approvals; 300 payments (₹200–₹24,000); 25 routines with 20 runs each; 300 memory facts; 5,000 activity rows. The word "taj" appears in exactly 12 messages (AT-096). Every PERF budget that uses the 10-2 §E.1 data set runs on `perf` (§20).

---

## §23. Gaps, conflicts, open questions

### 23.1 Conflicts resolved here (also to be appended to `GAPS.md` by the builder)

| Id | Conflict | Resolution |
|---|---|---|
| G-08-01 | Brief says Windows 10 1809+; J1 and 09-windows say 22H2 | 22H2 minimum (binding coordinator decision) [settled: X-14] |
| G-08-02 | journeys-1 §3 makes `jobs\*\state.json` and `routines\*.json` the stores | SQLite authoritative; files are mirrors (§4.1 reason) |
| G-08-03 | J21 "Do it when I say" for Send/Book/Delete vs Art. 5 | treated as "Ask me" (§9.4.1) [settled: X-03; 06 §6.4 has no "Do it when I say"] |
| G-08-04 | J20 says toast app id `foo.app`; 09-windows binds `com.foo.desktop` | `com.foo.desktop` (§15.3) [settled: X-14] |
| G-08-05 | J20 toast [ Approve ] for non-hard approvals vs binding "toasts never approve" | toasts show [ Review ] [ Not now ] (§15.3) [settled: X-02] |
| G-08-06 | J7 voice notes `.ogg` | WebM/Opus (§18.1) |
| G-08-07 | No copy for "Fold this into which job?" (2+ running jobs in a chat) and the purchase-cap card | conservative copy written in §5.2 / §5.10.5; 04/05 may override |
| G-08-08 | J10 assumes saved card fills fully; Indian checkouts need CVV, which is never stored | CVV box after Approve (§10.4) |

### 23.2 Open questions only Vikas can answer

**Answered by Vikas 2026-10-16 11:40 UTC:** O-1 testers first [X-39]; O-2 keep WhatsApp [X-40]; O-3 Outlook in v1.1 [X-41]; O-4 link to the makers' pages [X-42]; O-5 no clicking in v1, one app per job in v1.1 [X-47]; O-6 download on the first voice note, with OpenAI transcription first [X-43]. The questions below are kept for history. Earlier: until Vikas answered, DECISIONS X-18 set the v1 defaults: O-1 testers only (≤ 100 named), O-2 keep WhatsApp with a plain risk note and one-tap unlink, O-3 Outlook specified but off, O-4 link to the makers' pages only (never install silently), O-5 no clicking inside other desktop apps, O-6 download the voice model on the first voice note. [settled for v1: X-18]
- **O-1 Google verification.** Reading Gmail needs a "restricted" Google scope; a public app must pass Google's verification and a yearly security assessment (or stay in testing mode, max 100 named test users). Ship v1 to testers only, or budget for verification?
- **O-2 WhatsApp risk.** The linked-device link is unofficial; WhatsApp can unlink or restrict numbers that use it. Keep it in v1 as decided in J4, knowing this?
- **O-3 Outlook.** J4 offers Outlook, the brief's v1 list does not. In v1 or later?
- **O-4 Installing AI helpers.** Should foo download and install Claude/Codex/Gemini helper apps for the user (J2), or only link to the makers' pages?
- **O-5 Screen control.** v1 limits the screen rung to opening files/apps and a screenshot the user attaches. Is clicking inside other desktop apps wanted in v1?
- **O-6 Voice model size.** Bundling the local voice model adds about 150 MB to the installer. Bundle it, or download on first voice note?
