# 08 · Functions and engine — Part 2 of 4: job runner, your-AI adapters, tools, approvals, payments, secrets

Read Part 1 first (`08-functions-and-engine-1.md`): conventions §0, architecture §1, processes §2, IPC §3, data model §4. Names (types, settings paths, enums, vault names, copy keys) are `08-0-canonical-names.md`'s. Exact prompt texts, `<act>` schemas, runner limits, tool descriptions, web-tool and resource-file formats, gate and payment detail are in Part 4 (`08-functions-and-engine-4.md`); where this part points there, Part 4 is the text.

---

## §5. Job runner

### 5.1 Responsibilities (MUST)
The JobRunner is the only component that creates jobs, changes job state, edits checklists, sets C1 badges and decides when the AI is called for a job; chat pills (`chats.pill`, `pill_until`) and the other derived chat columns are written by main inside the job transition's transaction (08-1 §4.6 rule 7, X-129), never by the runner. Everything the user sees about progress is derived from its rows (Art. 12, G12). The state machine is journeys-1 §4 exactly; this section is its algorithm.

**Unprompted posting (Art. 19).** The engine writes `messages.why` (08-0 §G.17) for every unprompted message and every routine-fire message: `source` per 04 §19.6 (`routine_asked`, `routine_suggested`, `suggestion`, `habit_offer`, `housekeeping`, `cap_warning`) plus the reason variables; it never writes a free-text reason. Before posting any `habit_offer` the engine checks `settings.routines.habitOffers`.

### 5.2 Message intake (every user message)

```
onUserMessage(m):                                             # main stored m (status 'sent'), engine receives user.message
  t0 = now; setBadge(m, 'seen') within 1 s                    # C1 👀
  if !net.online: queue m (clock tick, no badge; 08-0 §F) ; return
  if spendCapReached() && billing(primary)=='key': queue m (badge 'waiting' ⏳, J19.3) ; return
  if !aiAvailable(): queue m (badge 'waiting' ⏳ + "I'll answer when your AI is back." thread.queued.ai_back, J19.1/19.2); return
  if isStopCommand(m.text):        → stopFlow(m) (08-4 §26.9)                                   # Art. 18
  if openChoiceCard(chat) && answersCard(m): → card.answered (rule: 08-4 §26.6)  # J8
  if openApprovalOrPaymentCard(chat) && looksLikeYes(m): reply "Tap Approve on the card so I know it's really you." (G16 copy, `thread.approval_typed.approve`; for drafts "Tap Send on the draft so I know it's really you.", `thread.approval_typed.send`) ; return   # Art. 6
  running = liveJobs(chat)                                     # jobs in WORKING or NEEDS_YOU (steer while NEEDS_YOU: 08-4 §26.5)
  if running.length == 1: → steer(running[0], m) (§5.5) ; return
  if running.length > 1:  → Choice card (purpose 'job') "Fold this into which job?" (cards.choice.question.fold_which), options = job titles   [foo decision]
  → intakeTurn(m) (§5.3)
```

5.2.1 `isStopCommand(text)`: trimmed, lower-cased text matches `^(stop|stop that|stop it|cancel|stop everything|ruko|ruk jao|bas|band karo|rok do)\b[.! ]*$` (English, Hindi and Punjabi/Hinglish forms; Art. 23 mirrors those languages). Anything longer is NOT a stop (it may be a steer, J18 branch "only look at Taj and W"). A stop goes to `stopFlow` (08-4 §26.9).
5.2.2 `looksLikeYes(text)`: `^(yes|yep|yeah|ok|okay|haan|ha|ji|theek hai|kar do|go|do it|send it|book it|pay|approve)\b` or a single 👍/✅ reaction on the card. Never approves; only triggers the G16 reply.
5.2.3 `answersCard(m, card)`: the typed-answer algorithm of 08-4 §26.6 (replaces 05-1 §5.3's character rule; a tie is not an answer).

### 5.3 Intake turn and planning

5.3.1 **Check vs do (Art. 3), deterministic, before the AI.** `extractDoVerbs(text): Verb[]` (`Verb` = 08-0 §B.2, X-55) matches a fixed lexicon, case-insensitive. Latin words match with `\b`; Devanagari and Gurmukhi forms match with `(?<![\p{L}\p{M}])…(?![\p{L}\p{M}])` under the `u` flag (JS `\b` does not see Indic letters):

| Verb | English | Hindi / Hinglish / Punjabi (romanised and script) |
|---|---|---|
| book | book, reserve | book karo/kar do, buk, बुक, ਬੁੱਕ |
| buy | buy, order, purchase, get me (only when none of "a table", "a slot", "an appointment", "the time", "directions" follows within 3 words) | kharid, khareed, mangwa, order karo, खरीद, ਖਰੀਦ |
| pay | pay, transfer | pay karo/kar do, bhar do, bharo, भुगतान, ਭੁਗਤਾਨ |
| send | send, reply, email (verb), message (verb), text (verb), tell {person} | bhej, bhejo, bhej do, भेज, ਭੇਜ |
| post | post, tweet, publish | post karo, डालो |
| delete | delete, remove, cancel {booking} | hata do, mita do, delete karo, हटाओ, ਮਿਟਾ |
| add_calendar | add to (my) calendar, put (it) on/in my calendar, calendar it, block (time) | calendar karo, calendar me daal do, calendar pe daal do, कैलेंडर में डालो, ਕੈਲੰਡਰ ਵਿੱਚ ਪਾਓ |

The result is stored on the job as `do_verbs`. If empty, `jobs.intent = 'read_only'`: the gate (§9.2) blocks every action class except `read` and `prepare` and instead posts a Choice card offering the action ("These have tables. Want me to book one?", J9). A tap on an option or card button adds that verb to `do_verbs` (Art. 3 "or a tap on a card"). The AI cannot change `intent`.

5.3.2 **Intake AI call** (`purpose:'intake'`, chat lane, `<say>` streamed through the release gate): the AI returns an `IntakeAct` whose exact schema is 08-4 §25.2 (kinds `reply`, `react`, `ask`, `handoff`, `job`, `routine`, `memory`, `setting`; prompt `intake.md`, 08-4 §24.5). A `setting` decision is checked by the engine against the 08-0 §A.3 allow-list (08-4 §25.6). What is posted for each kind is 08-4 §25.5 items 5–6 (only `reply` posts its `<say>`).

5.3.3 **Job creation.** For `kind:'job'`: insert `jobs` row (`queued`), insert `steps` from `plan` (each step's `phraseKey` MUST exist in the catalogue of 08-4 §26.1, else the runner replaces it with `generic_working`; X-189, CR-0031: before that, an intake plan with a key outside the catalogue, a runner-only key or a missing slot gets the one §7.5 repair turn with those issues; a repaired plan that is clean replaces it, otherwise the first plan stands, and the tech log gets `chat.plan_keys` `repaired` or `fallback`), write `plan.md` + `state.json`. `jobs.title` is built by the engine (08-4 §26.2); `est_minutes`, `est_tokens`, `est_cost_paise` are the engine values of 08-4 §26.3, never the AI's raw estimate. Then:
- If `est_minutes > 2` or `est_cost_paise > 500` (₹5) → Plan card C11; job stays `queued` until "Go" (`plan:go`). "Change plan" → the text goes back to an intake turn with the old plan attached. `[J C11 foo decision]`
- If key billing and `est_cost_paise > 0.2 × money.aiCapPaise` → the Plan card shows "This is a big one." (J19.3 step 5).
- Else → `enqueue(job)`.

5.3.4 **Flights (X-81).** A request to book or pay for a flight never creates a Payment or booking Approval card; foo replies `thread.flight_scope.body` with [ `thread.flight_scope.button.compare` ] and link `thread.flight_scope.button.not_now` (08-0 §H, X-81) and offers compare-and-open.

### 5.4 Steps and the work loop

5.4.1 **Scheduling.** `enqueue(job)`: if count(`working`) < 3 → start; else stays `queued` and the checklist shows "Waiting for another job to finish" (J §4). Start requires AI verified within 10 min, else a verify call first (J §4 QUEUED rule). Slots are released on any terminal state or on `needs_you`/`waiting` (a job waiting on the user does not hold a slot). `[foo decision: needs_you/waiting jobs release the slot, otherwise three unanswered cards would block all work]`. When a slot frees, the oldest startable `queued` job starts (FIFO by `created_at`). Browser jobs also need one of the 3 job windows (08-4 §26.8); a queued job has no `waiting_reason` (`'slot'` is removed, 08-0 §H). WAITING with `waiting_reason='opens_at'`: the job sleeps until `jobs.wake_at`; the 15 s runner tick moves it to WORKING at `wake_at`; no stuck timer and no AI turn while waiting; quitting foo keeps `wake_at` and the job resumes per 08-4 §26.10 only if `wake_at` is still in the future, else it is FAILED with `thread.trains.tatkal_missed` (08-4 §26.8 item 6).

5.4.2 **The loop** (one per WORKING job; all awaits take the job's `AbortSignal`):

```
runJob(job):
  setState(job,'working'); setBadge(job.user_message_id,'working')        # 🛠 on first tool step (C1)
  after 1.5 s, if step_count ≥ 2 and job not finished: post checklist message (C2), edited in place from now on
  powerKeepAwake(on)                                                      # J20: only while WORKING
  loop:
    if signal.aborted: return                                             # stop handled in §5.7
    drainSteer(job)                                                       # §5.5 — user messages first
    capCheck(job)            → may WAIT(spend_cap)                        # §5.10
    decision = await aiStepTurn(job)                                      # §7: one AI turn → StepDecision
    recordTurn(decision.usage)
    switch decision.kind:
      'tool'      → r = await toolLayer.execute(job, decision.call)       # §8, gate inside (§9)
                    observe(job, r); if r.gate=='needs_user' → NEEDS_YOU (current step 'waiting_user'); await resume; continue
                    updateProgress(job, r)                                # last_progress_at, fail_streak
      'step_done' → markStep(job, idx,'done'); next step 'running'; edit checklist
      'replan'    → validate & replace remaining steps (done steps immutable); plan_version++
      'ask'       → post Choice card; NEEDS_YOU; await answer; continue
      'request_approval' → engine verifies the draft (08-4 §28.1) → GateLogic.decide → card; NEEDS_YOU; await resume; continue
      'done'      → finish(job, decision.proof, decision.result)           # §5.8
      'fail'      → fail(job, decision.reason)                             # FAILED + error card with one alternative
    stuckCheck(job)                                                       # §5.6
```

5.4.3 **Step phrase catalogue** (Art. 2, C2 "fixed list of plain phrases, never raw tool arguments"; Hermes curated phrases HRM §5): the one list is 08-4 §26.1 (`next` / `running` / `done` forms, slot rule, copy keys). The Plan card, the checklist and the 04 §14.2 status line all use it.

### 5.5 Steer injection (Art. 18, G11; OpenClaw steer OCL §2.2; Hermes "steered into current run" HRM §4)

1. `steer(job, m)`: append `m.id` to the job's in-memory `steerQueue` (persisted as `state.json.steerQueue`), set badge 👀 on `m`. Do **not** interrupt an in-flight AI turn or tool call (a running turn finishes; cost and side-effect safety). Exception: an in-flight `browser.wait` / page load longer than 5 s is cancelled and retried after the steer.
2. At the next loop boundary `drainSteer` builds a `STEER` block (§7.2 part 10) containing all queued messages in order, and the step turn's decision MUST include `steerEffect` for each: `"folded"` (applied to the plan) · `"answered"` (a question; `say` holds the answer) · `"restart"` (plan reset to step 1, e.g. new dates in J10) · `"new_job"` (unrelated request → runner creates a separate intake for it).
3. User-facing result (exact copy, posted by the runner, not written by the AI): `folded`/`restart` → foo posts "Got it, I'll fold that in." (G11, `thread.steer.folded`). `answered` → the AI's `say` text is posted **before** any further progress (Art. 18 "answered before progress notes"). `new_job` → normal intake.
4. Badge on `m` follows the job's badge from then on.
5. Steers that contain a do-verb add it to `do_verbs` (5.3.1).
6. **Steer while the job is NEEDS_YOU** (a card is open): 08-4 §26.5 — pending approval, payment and draft cards of the job are superseded and the job re-plans at once; a sign-in in progress is not interrupted.

### 5.6 Stuck and slow detection (Art. 12, 13; J19.4)

A watchdog runs every 5 s for each WORKING job:

| Signal | Rule | Effect |
|---|---|---|
| Slow | no step finished for 60 s | `jobs.slow = true`; the badge stays 🛠 with the tooltip "Taking longer than usual" (08-0 §F, X-61); checklist line unchanged; never ⏳ |
| Stuck: no progress | `now − last_progress_at > 180 s` while WORKING (time in NEEDS_YOU/WAITING does not count) | stuck card |
| Stuck: failures | `fail_streak ≥ 3` (same step or consecutive tool errors) | stuck card |
| Stuck: cost | `spent_tokens > 2 × est_tokens` (all billing kinds; engine estimate and unreported-usage rule of 08-4 §26.3) or, for key billing, `spent_cost_paise > 2 × est_cost_paise` | stuck card |
| Stuck: loop | same normalised URL (origin + path, query sorted) navigated 5 times in a row | stuck card |
| Stuck: budget / time | the hard ceilings of 08-4 §26.3 (60 step turns, 25 tool calls per step, 150 per job; 30 min working time) | stuck card |

`last_progress_at` updates on: a step marked done, a tool call that returned `ok` **and** changed the observation hash (page/state actually changed), a card answered. Stuck card (C `stuck`, J19.4 copy): while it is shown the job waits on the user and the user's bubble shows ⏳ (⚠ appears only in the card header, 08-0 §F). `whatsWrong`, the runner-written "What I'd do" line and `spentLine` are 08-4 §26.4. Stop on the stuck card → `cancelled`, `stop_reason='stuck_stop'`, badge ⛔ (X-80, 08-0 §G.16). "Try another way" → `stuck_count++`, counters reset, the next step turn gets a `ROUTE_EXCLUDE` list containing the current site/route; if `stuck_count ≥ 2` the card offers only [ Take over ] [ Stop ]. No answer in 15 min → FAILED + toast (fail closed, HRM §9.2). Each stuck event writes `sites\{domain}.md` "search loop on {date}" / flags (§8.3.9).

### 5.7 Stop (Art. 18; J18)

`stopJob(jobId, reason: StopReason)` (08-0 §B.2) MUST complete the halt within 1 s. Typed stop words reach it through `stopFlow` (08-4 §26.9):
1. `abortController.abort()` → in-flight fetches cancelled; adapter `cancel()` kills the CLI process tree via the Job Object (`TerminateJobObject`), fallback `taskkill /PID {pid} /T /F` (FOO-PRD W2); Playwright actions are abandoned (`page` stays open but no further calls); queued tool calls dropped.
2. **Exception — irreversible step in flight**: if an approval of this job is `RUNNING` and `submitted_at` is set (payment/booking/send already handed off), the runner does not cut it: it waits for the in-flight call to settle (max 30 s), then → CHECKING path (J18 branch "Stop during payment submit"; copy "Stopping… the payment was already on its way. Checking whether it went through.", `thread.stop.in_flight`).
3. Transaction: job → `cancelled` with `stop_reason = reason`, open approvals of the job → `WITHDRAWN`, open choice cards → `withdrawn`, the checklist gets the runner-only row `stopped` ("Stopped by you", 08-4 §26.1), badge ⛔, pill cleared.
4. Report: built **only** from `activity` rows of the job (never from AI memory): if no `done` rows of verbs send/book/pay/post/delete → "Stopped. Nothing was booked, paid or sent." (`thread.stop.report.nothing`) else "Stopped. I'd already {activity.summary} at {time}, that can't be unsent. Nothing else was done." (`thread.stop.report.partial`) (J18 exact pattern). "Done" rows are `activity` rows of kind sent, paid, booked or deleted (08-0 §G.4) with `outcome='done'`.
5. Close the job's browser window unless the user is taking over.
6. `stopAll`: same for every job not terminal; routines untouched; result line J18 "Stop everything".
7. Closing the job's browser window = stop (J18), detected via Playwright `page.on('close')` when not caused by the runner.

### 5.8 Done and proof (Art. 11; C12)

```ts
type Proof =
  | { kind: "confirmation"; code: string; site: string; screenshot?: string; seenInToolCallId: string }
  | { kind: "email"; connectionId: string; messageId: string; from: string; subject: string }
  | { kind: "sent_folder"; connectionId: string; messageId: string }
  | { kind: "wa_delivered"; waMessageId: string }
  | { kind: "calendar_event"; eventId: string }
  | { kind: "emails_read"; count: number; messageIds: string[] }          // read-only jobs (J5)
  | { kind: "screenshot"; path: string; stepId: string }
  | { kind: "receipt"; paymentId: string; ref: string; screenshot?: string };
```

`finish(job, proof?)` MUST verify the proof **from recorded tool results, never from the AI's words** (G7, G12): `confirmation.code` must appear verbatim in the **pre-redaction** result of `seenInToolCallId` of this job, kept in RAM only (08-4 §26.11); `email`/`sent_folder` ids are re-fetched through the connector (exists, within the last 24 h); `screenshot` path must exist in this job's folder. Verified → `done` (badge ✅, Proof chip, receipt footer "Done in {m} min · {n} steps · used about ₹{x} of your AI"; for plan billing "· used about {p}% of your {AI} plan" only when the adapter reports plan usage, else the footer omits the AI part; keys `cards.checklist.footer.base|key|plan`). Unverifiable or absent with `unverified:true` → `done_unverified` (badge ✅ + "⚠ Not checked live" + "Check for real", C12). The runner then posts the AI's result text (redacted, banned-word filtered) as one message.

### 5.9 Crash recovery and resume (J19.5)

On engine start (after a crash, app restart or power cut):
1. Read `launches.json` (08-0 §G.14); if 3 unclean launches within 10 min, or 3 engine crashes within one launch → **safe mode**: do not start jobs or routines; post the safe-mode card (J19.5 step 5) and wait.
2. For every approval in `RUNNING` with `submitted_at` set → `CHECKING` (never re-submitted). Every `PENDING`/`HELD` approval with `expires_at < now` → `EXPIRED` (normal copy).
3. For every job in `working` or `queued`: → `needs_you` with a recovery card (J19.5 copy). `doneLines` come from `activity` rows of the job. If the job had a CHECKING approval, the card says the payment line and the job runs only the CHECKING procedure (§10.5).
4. For every job in `waiting`: stays `waiting`; the condition is re-evaluated (AI back? cap raised?). Jobs paused by `app_quit`, `windows_shutdown` or `asleep` resume silently with a checklist edit only (08-4 §26.10).
5. Tool calls with `side_effect=1` and `outcome IS NULL` (started, never finished) are marked `unknown`. On "Pick up where I left off", the first step turn receives a `RECOVERY` block listing them, and the gate forbids repeating any of them until a `read` tool has verified the current state (e.g. reload the page, search Sent).
6. The AI session (`ai_session_id`) is reused if the adapter supports resume; on failure the runner rebuilds context from `plan.md`, the steps and the last observation (Omnibot drops failed resumed sessions, OMB-03 §5.3).
7. The composer draft of each chat is restored from the `drafts` table (08-0 §G.11, J19.5 step 6).

### 5.10 Cost accounting and caps (Art. 13; J19.2, J19.3)

1. Every AI call writes one `ai_turns` row with usage **as reported** by the adapter; missing metrics are `NULL` (never guessed, OMB-03 §5.6). Which `chat_id` / `job_id` / `routine_id` a turn carries: 08-4 §26.12.
2. `cost_paise`: `reported` (adapter gave USD cost → × `pricing.usdToInr` × 100, rounded up) · `priced` (tokens × `pricing.json` rate) · `estimated` (no usage: chars/3.5 tokens × rate) · `free` (Ollama) · `unknown` (plan billing with no cost info). For a key provider whose model is not in `pricing.json`, use that provider's **most expensive** listed rate (conservative for the cap).
3. **Spend meter** (key billing only): `monthSpentPaise = SUM(cost_paise) WHERE billing='key' AND started_at ≥ first day of month 00:00 user tz`. Cached in memory, updated per turn, `spend:update` event.
4. **Pre-call cap check** (every AI call on a key provider, including background ones): `if monthSpent + estimateNextCall > cap` → do not call; jobs → `waiting(spend_cap)`, routines → `paused_cap`, card J19.3. At ≥ 80 % (once per month) → amber state + one line in foo's chat (J19.3 step 1). Raising the cap resumes in FIFO order.
5. **Purchase cap** (Art. 13): before creating a Payment card, `monthPaymentsPaise + total > money.purchaseCapPaise` (`monthPaymentsPaise` per 08-4 §29.3: submitted, checking and succeeded payments count) → Choice card "This would go over your ₹{cap} monthly cap for purchases. Raise it?" [ Raise cap ] [ Not now ] (`cards.choice.question.purchase_cap`, `cards.choice.option.raise_cap`, `cards.choice.option.not_now`; "cap", never "limit", X-79) `[foo decision; J has no copy — logged in §23]`.
6. **Voice and web tools** [X-43, X-46]: every OpenAI transcription and every cloud web tool call writes an `ai_turns` row with `purpose` `voice` or `web` and `billing='key'`, priced from `pricing.json` `voice` / `web` rows (per minute of audio, per call or per browser minute); they count in the spend meter and the pre-call cap check like any key call. Free-tier calls are still priced at the listed rate (conservative for the cap). At the cap, voice uses the local pack and web tools use the local path instead of waiting.
7. **Plan billing**: no ₹ meter; plan-limit errors → `waiting(ai_limit)` with reset time when the CLI states it (§6.7); 80 % warning only if the adapter reports plan usage (J19.2 step 5).

### 5.11 Functions

| Function | In | Out | Errors | J | Art |
|---|---|---|---|---|---|
| `onUserMessage` | `messageId` | `void` | `AI_*`, `SPEND_CAP` | J5–J18 | 6, 16, 18 |
| `extractDoVerbs` | `text, lang` | `Verb[]` | — | J9, J12 | 3 |
| `intakeTurn` | `message, chatContext` | `IntakeDecision` | `AI_*`, `PROTOCOL_INVALID` | J5–J17 | 3, 22 |
| `createJob` | `IntakeDecision.job, origin` | `JobRow` | `VALIDATION` | J5, J9–J11 | 12, 17 |
| `enqueue` / `startNext` | `jobId` | `void` | — | all jobs | 12 |
| `runJob` | `jobId` | `Promise<void>` | any | all jobs | 12, 17, 22 |
| `steer` / `drainSteer` | `jobId, messageId` | `void` | — | J10, J18 | 18 |
| `stuckCheck` | `jobId` | `StuckSignal \| null` | — | J19.4 | 12, 13 |
| `stopJob` / `stopAll` / `stopFlow` | `jobId, reason` / — / `message` | `StopReport` | `JOB_GONE` | J18 | 18 |
| `finish` | `jobId, proof?, unverified?` | `JobRow` | `PROOF_INVALID` → done_unverified | J5, J9, J10 | 11 |
| `recoverAll` | — | `RecoveryReport` | `DB_*` | J19.5 | 7 |
| `recordTurn` / `capCheck` | `AiUsage` / `jobId?` | `void` / `CapState` | `SPEND_CAP` | J19.3 | 13 |

---

## §6. Your-AI adapters

### 6.1 Providers

| `ProviderId` | Kind | Transport | Billing | J2 ladder rank |
|---|---|---|---|---|
| `claude-cli` | Claude Code CLI signed in | child process, stream-json | plan (or key if the CLI uses an API key) | 1 |
| `codex-cli` | Codex CLI signed in with ChatGPT | child process, JSONL | plan | 2 |
| `gemini-cli` | Gemini CLI signed in with Google | child process | plan / free tier | 3 |
| `openai-key` / `anthropic-key` / `google-key` | key in vault | HTTPS from engine | key | 4 |
| `ollama` | local server | HTTP `127.0.0.1:11434` | local (₹0) | 5 |
| `fake` | test only | in-process script | — | — |

LM Studio (J2 rung 5) is detected (`http://127.0.0.1:1234/v1/models`) and driven through the OpenAI-compatible path of `openai-key` with base URL override and no key `[foo decision: same code path]`.

On-screen names (`{AI}` everywhere) are 08-0 §B.4 (X-78): Claude, ChatGPT, Gemini, OpenAI key, Anthropic key, Google key, AI on this PC (ollama and LM Studio), Test AI. The "(your AI)" suffix is added by the surface, never stored.

### 6.2 Adapter interface (normative)

```ts
interface AiAdapter {
  readonly id: ProviderId;
  readonly billing: "plan" | "key" | "local";
  detect(): Promise<DetectResult>;                                   // no network, < 3 s
  probe(): Promise<Capabilities>;                                    // parses `--help`/version once per app version (§6.5)
  verify(signal: AbortSignal): Promise<VerifyResult>;                // "Reply with the word ready", 20 s limit (J2)
  runTurn(req: TurnRequest, sink: TurnSink, signal: AbortSignal): Promise<TurnResult>;
  cancel(turnId: string): Promise<void>;                             // kill tree, idempotent
  estimate(req: TurnRequest): { tokensIn: number; tokensOutMax: number; costPaise: number | null };
  classifyError(e: RawAiError): AiErrorKind;                         // §6.7
  signIn?(signal: AbortSignal): Promise<Result<{ email?: string }>>;
}

interface DetectResult { found: boolean; state: "ready" | "installed_not_signed_in" | "not_installed" | "key_in_env" | "running_local";
  binaryPath?: string; version?: string; account?: string /* masked */; envKeyName?: string; models?: string[] }
interface VerifyResult { ok: boolean; kind?: AiErrorKind; latencyMs: number; resetAt?: number }
interface Capabilities { stdinPrompt: boolean; systemPromptFile: boolean; appendSystemPrompt: boolean; resume: boolean;
  disableTools: "flag" | "settings" | "none"; jsonStream: boolean; modelFlag: boolean; vision: boolean }   // fallbacks 08-4 §30.4; vision 08-4 §30.6 (no pdf, X-109)

interface TurnRequest {
  turnId: string; purpose: AiPurpose; system: string; prompt: string;     // both already REDACTED (§11.4)
  resumeSessionId?: string; model?: string; maxOutputTokens: number; timeoutMs: number;
  temperature: number | null;                                              // filled by PromptBuilder from 08-4 §30.1; null for the CLIs (no temperature flag) (X-123)
  stream: boolean;                                                         // true only for chat-lane <say>
  attachments?: { path: string; mime: "image/png"; bytes: number }[]; attachmentText?: { page: number; text: string }[];   // 08-4 §30.6, prepared by main (08-0 §G.18)
}
// model, temperature, maxOutputTokens and timeoutMs per purpose: 08-4 §30.1; images on the wire: 08-4 §30.10 (X-123). foo never installs an AI app (X-42): no install() method.
interface TurnSink { onText(delta: string): void; onSession(id: string): void }
interface TurnResult { text: string; sessionId?: string; usage: AiUsage; modelReported?: string; stopReason: "end" | "max_tokens" | "cancelled" | "error" }
interface AiUsage { tokensIn: number | null; tokensOut: number | null; cacheRead: number | null; cacheWrite: number | null; costUsd: number | null; planUsedPct?: number | null }
```

### 6.3 Per-provider command lines

Common rules for every CLI (MUST): binary resolved once by `detect()` (prefer the real `.exe`; for npm `.cmd` shims resolve the target JS and run it with foo's own Electron binary as Node: env `ELECTRON_RUN_AS_NODE=1` — FOO-PRD W4); prompt delivered on **stdin**, never on the command line (FOO-PRD W3: 8,191-char cmd limit and quoting bugs); `cwd` = `{LOCAL}\ai-scratch\{providerId}\` (empty, foo-owned); env = user env minus `CLAUDECODE`, `CLAUDE_CODE_ENTRYPOINT`, plus `NO_COLOR=1`, `TERM=dumb` (OMB-03 §5.5); `windowsHide:true`; child assigned to a Job Object with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`; stdout read line by line (UTF-8, CRLF tolerant); stderr kept ≤ 40 lines × 4,000 chars (OMB-03 §5.5) and only used for error classification, never shown; per-turn timeout = `TurnRequest.timeoutMs` (08-4 §30.1: chat lane 60 s, step 180 s, second look 20 s, verify 20 s; at 60 s a chat turn is cancelled and no late text is posted, 08-4 §30.7). Native tools of the CLI MUST be disabled (§1.3 rule 2).

| Provider | argv (stdin = PROMPT, or COMBINED when no system channel) | Evidence | Disable its own tools | Resume |
|---|---|---|---|---|
| `claude-cli` | `claude -p --output-format stream-json --verbose [--include-partial-messages when stream] --append-system-prompt-file {LOCAL}\ai-scratch\claude-cli\sys-{turnId}.md [--resume SID] [--model M] --max-turns 1 --tools "" --strict-mcp-config --mcp-config {"mcpServers":{}} --setting-sources "" --settings {"disableAllHooks":true}` | base flags OMB-05 row `claude`; `--strict-mcp-config`, `--mcp-config`, `--setting-sources`, `--settings` used by Omnibot's model probe (OMB-05 "Model catalog probes") | `--tools ""` (if `probe()` does not find it: `--disallowedTools` with the full built-in list + `--permission-mode plan`) | `--resume SID` |
| `codex-cli` | `codex exec --json --skip-git-repo-check -C {cwd} -c sandbox_mode="read-only" [-m M] [-c model_reasoning_effort="low" on cheap purposes only] -` (resume: `codex exec resume SID --json --skip-git-repo-check -`) | OMB-05 row `codex` (plan → read-only sandbox); `-` = read prompt from stdin `[verify in probe]` | read-only sandbox + empty scratch cwd + protocol instruction "do not run commands"; any `command_execution` item in the stream → turn discarded, `AI_PROTOCOL_VIOLATION` logged (internal, 08-3 §21.4), retried once with a stronger instruction, then provider marked unusable for jobs | `exec resume SID` |
| `gemini-cli` | `gemini [--output-format stream-json when probe finds it] [--model M]` with COMBINED on stdin | OMB-05 row `gemini` (`-p COMBINED`, plain text, no resume) | empty scratch cwd; default approval mode (non-interactive runs cannot approve write/shell tools); protocol instruction; `tool_use` events in JSON mode → same handling as Codex `[verify in M2 spike]` | none (context rebuilt each turn, OMB-06 §4) |
| `ollama` | HTTP `POST /api/chat` `{model, messages:[{role:"system"},{role:"user"}], stream, options:{num_ctx: 16384, temperature}}` (temperature per purpose, 08-4 §30.1) | OMB-05 notes `ollama run MODEL` refuses without a model; foo uses the HTTP API instead `[foo decision: gives token counts (prompt_eval_count, eval_count) and clean cancellation]` | n/a (no tools passed) | none |
| `openai-key` | `POST https://api.openai.com/v1/responses` (stream SSE) with key from vault | vendor API | n/a | `previous_response_id` not used (stateless) |
| `anthropic-key` | `POST https://api.anthropic.com/v1/messages` (stream SSE, `x-api-key` from vault, `anthropic-version`) | vendor API | n/a | stateless |
| `google-key` | `POST https://generativelanguage.googleapis.com/v1beta/models/{m}:streamGenerateContent` | vendor API | n/a | stateless |

`M` in `--model M` / `-m M` is the model of 08-4 §30.1; the system file lives at `{LOCAL}\ai-scratch\{providerId}\sys-{turnId}.md` and is deleted after the turn (08-4 §30.8). Request bodies and stream parsing for the three key providers: 08-4 §30.3.

6.3.1 Key-mode HTTP calls run in the engine; the key is fetched with `vault.use({purpose:'ai_call', name})` from target `foo/ai_key/{providerId}` (08-0 §E.8), placed only in the request header, never logged (logger strips `authorization`, `x-api-key`, `x-goog-api-key` headers), and registered in the SecretRegistry (§11.3) so any echo is scrubbed.

### 6.4 Stream parsing (per adapter, fixture-tested)

| Provider | Text deltas | Final/usage | Session id | Failure envelope |
|---|---|---|---|---|
| claude-cli | `stream_event` → `content_block_delta.text_delta` | `result` `{usage{input_tokens,output_tokens,cache_read_input_tokens,cache_creation_input_tokens}, total_cost_usd, is_error}` | `system.session_id` / `result.session_id` | `result.is_error:true` |
| codex-cli | `item.updated/completed` with `item.type=agent_message` (prefix-diff) | `turn.completed.usage{input_tokens,cached_input_tokens,output_tokens}` | `thread.started.thread_id` | `turn.failed{error.message}`, `error` |
| gemini-cli | JSON mode: message deltas; text mode: every stdout line, ANSI stripped | JSON mode stats object if present, else `NULL` usage | — | non-zero exit, `error` events |
| ollama | `message.content` per chunk | final chunk `prompt_eval_count`, `eval_count` | — | HTTP error / `error` field |

HTTP providers: 08-4 §30.3. All CLI rows from OMB-05 "Stream events" and OMB-03 §5.6; the usage rule "only terminal envelopes count; a missing metric is unknown" applies (OMB-03 §5.6).

### 6.5 Capability probe and drift

On first run and after every CLI version change, `probe()` runs `<bin> --version` and `<bin> --help` (8 s, 2 MiB cap, OMB-03 §6) and records which flags exist. If a flag the adapter needs is missing, the adapter uses the fallback of 08-4 §30.4 (only a missing way to disable the CLI's own tools is fatal); then `verify()` returns `AI_CLI_INCOMPATIBLE` and J2 shows the provider as "didn't work" with the copy for an unknown failure. A CLI turn that runs a command or tool although tools are off is `AI_PROTOCOL_VIOLATION`: the turn is discarded and retried once; a second violation marks the provider unusable for jobs with `AI_CLI_INCOMPATIBLE` (08-3 §21.4, X-136). Every adapter ships fixture tests from real captured output (FOO-PLAN M2 spike; OMB-05 caveat "pinned to the CLI versions tested").

### 6.6 Detect, verify, install, sign in (J2)

| Provider | `detect()` evidence (no network) | Install (X-42: foo never installs) | `signIn()` |
|---|---|---|---|
| claude-cli | `where claude`, `%USERPROFILE%\.local\bin\claude.exe`; signed in if `%USERPROFILE%\.claude\.credentials.json` exists or `ANTHROPIC_API_KEY` is set for the CLI `[verify in spike]` | no: open the maker's install page; foo never installs silently [settled: X-18, confirmed X-42]; re-run `detect()` when the window regains focus | spawn `claude auth login` `[verify at the M3 spike; if the subcommand is absent, open the maker's page and show J2's "Sign in in the {Claude} app, then come back" line]`; success = `%USERPROFILE%\.claude\.credentials.json` appears or `claude auth status` exits 0; 10 min limit (J2; X-127) |
| codex-cli | `where codex`, npm global prefix; signed in if `%USERPROFILE%\.codex\auth.json` exists | no: open the maker's install page [settled: X-18] | `codex login` (browser) |
| gemini-cli | `where gemini`, npm global; signed in if `%USERPROFILE%\.gemini\oauth_creds.json` exists | no: open the maker's install page [settled: X-18] | `gemini` first-run Google sign-in |
| keys | user env vars `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`/`GOOGLE_API_KEY` (HKCU\Environment) and vault | — | Secret box (C7); an env key is copied into the vault only after the user taps "Use this key" `[foo decision; J2 rung 4]` |
| ollama | `GET /api/tags` with 1 s timeout | no: link out → `maker_page` `ollama` (`maker-pages.json`, 08-0 §E.5; X-124) | — |
| LM Studio | `GET /v1/models` with 1 s timeout | no: no `maker-pages.json` row and no link (reached through `openai-key`, §6.1; 08-0 §E.5) | — |

Detection runs all rungs in parallel (J2 "run in parallel, show in this order"); results stream on `ai:detectRow` (08-0 §B.5). With several local models the user picks one (08-4 §30.5). `verify()` sends one real request whose prompt is exactly `Reply with the word ready` (J2) with `maxOutputTokens: 10`; `ok` when the reply contains "ready" (case-insensitive). The chosen provider = first verified rung in ladder order; chat stays locked until one verifies (J2; OCL §6.1).

### 6.7 Error classification (adapter → `AiErrorKind`; every value is an `ErrorKind` of 08-0 §B.3 with a row in 08-3 §21.2, or in the internal list 08-3 §21.4; X-70, X-120)

| Kind | Signals (any) | Runner effect | Card (J19) |
|---|---|---|---|
| `NET_OFFLINE` (X-120; these signals feed the 08-3 §21.2 NET_OFFLINE row) | `net.isOnline()` false, DNS/ECONNREFUSED/ETIMEDOUT to vendor | after 2 consecutive failures: jobs WAITING; retest every 30 s for 1 h then 15 min | 19.1 "📡 You're offline…" |
| `AI_SERVICE_DOWN` | HTTP 5xx/529, CLI stderr "overloaded", "service unavailable" | same; retest every 2 min for 1 h then 15 min | 19.1 "😴 {AI} isn't answering right now…" + "Use {backup} instead" if backup verified |
| `AI_SIGNED_OUT` | HTTP 401/403 on plan, CLI stderr matching `/not (logged|signed) in|login required|invalid (credentials|token)/i` | WAITING | 19.1 "🔑 You've been signed out of {AI}…" [ Sign in ] |
| `AI_KEY_INVALID` | HTTP 401 on key | WAITING | J2 row "didn't work… [ Replace key ]" in a C16 card |
| `AI_LIMIT` | HTTP 429 with `retry-after`; CLI text `/usage limit|rate limit|limit (reached|resets)/i`; parse reset time (`resets? (at )?(\d{1,2}(:\d{2})?\s?(am|pm))`, `try again in (\d+) (minutes|hours)`) | WAITING(ai_limit) with `resetAt` or 15 min polling | 19.2 |
| `AI_CLI_INCOMPATIBLE` | unknown flag errors, unparseable stream after 3 lines | provider unusable until next probe | 19.6 Unknown |
| `AI_TIMEOUT` | turn exceeded `timeoutMs` | counts as one tool failure (fail_streak) | none unless stuck |
| `PROTOCOL_INVALID` (internal, 08-3 §21.4, X-120) | reply envelope fails zod twice (§7.5) | step failure | none unless stuck |

Regex tables live in each adapter and are fixture-tested with captured texts. "2 failures in a row" is per provider (J19.1 Detect).

### 6.8 `pricing.json`

Format (models, prices, `anthropicVersion`, voice and web rows): 08-4 §30.2. Values are filled at release time from vendor price pages (release checklist item). Tests use a fixture file.

### 6.9 Lanes and AI concurrency

| Lane | Max concurrent AI calls | Users |
|---|---|---|
| Job lane | 3 (one per WORKING job) | steps, second look of that job |
| Chat lane | 1 per chat, 2 total | intake, plain replies |
| Background lane | 1 | memory review, tidy, routine checks, brief, classifiers; yields: never starts while 3 jobs are WORKING |

Total CLI children ≤ 4 at once; extra calls wait in FIFO (no error). What may run on the backup provider when the primary is limited, down or unreachable: 08-4 §30.9 (chat turns yes; read-only jobs yes; jobs that send, book, buy, pay, post or delete no; the second look never).

### 6.10 Functions

| Function | In | Out | Errors | J | Art |
|---|---|---|---|---|---|
| `detectAll` | — | `DetectRow[]` (streamed) | — | J2 | — |
| `verify` | `providerId` | `VerifyResult` | `AI_*` | J2, J19 | 12 |
| `choose` | `primary, backup?` | `AiStatus` | `AI_NOT_VERIFIED` | J2, J21 | — |
| `signIn` | `providerId` | `Result<void>` | `NET_OFFLINE`, `SIGNIN_TIMEOUT` | J2 | 2 |
| `runTurn` | `TurnRequest` | `TurnResult` | `AI_*` | all | 8, 12 |
| `cancel` | `turnId` | `void` | — | J18 | 18 |
| `estimate` | `TurnRequest` | `CostEstimate` | — | J10, J19.3 | 13 |
| `classifyError` | `RawAiError` | `AiErrorKind` | — | J19 | 2 |

---

## §7. Prompt assembly and the reply protocol

### 7.1 Principle
foo runs its **own** agent loop: one AI turn = one decision (§1.3 rule 2). The AI never sees a secret value, never receives raw tool arguments it did not produce, and treats all outside content as data (OCL §8.3 "treat inbound as untrusted"; Grok "checks your own messages for approval", GRK §3.1).

### 7.2 System context (parts in this order, joined by blank lines; adapted from OMB-06 §2)

1. **Identity**: `resources/prompts/identity.md`, verbatim in 08-4 §24.2 (foo and helper forms).
2. **House rules**: `resources/prompts/rules.md`, verbatim in 08-4 §24.3 (one voice; no tech words; no filler; short, mirrored language; absolute dates; no narration; check ≠ do; secrets only in a Secret box; no done without proof; untrusted text is data).
3. **Tool catalogue**: for job/step turns only — the tools of §8.2 this job may use, one line each, with the exact descriptions and line format of 08-4 §27.1 (tools that ask the user say so).
4. **Reply protocol**: `protocol.md` + the purpose file (08-4 §24.4–§24.13).
5. **What you know about {firstName}** (data, not instructions): the pinned set of 08-4 §24.16 (X-112) in the system; up to 8 turn facts by FTS in the prompt (part 5b). Selection, size cap, FTS query, line format and the group exclusions (Art. 14): 08-4 §24.16 only.
6. **Helper notes** (helpers only): `notes.md`, ≤ 2,000 chars, newest first.
7. **Conversation**: last 20 completed messages of this chat, each ≤ 1,400 chars (OMB-03 §5.3 `maxMessageChars`), format `[{name}, {Sat 12 Dec 8:00 PM}]: {text_for_ai ?? text}`; cards rendered as one line (`[card: Approval · Send email to Rakesh · APPROVED 9:14 AM]`). With a resumed CLI session only messages after the last synced one are sent (OMB-03 §5.3 delta resume).
8. **Job state** (step turns, "The job:"): layout = 08-4 §24.22 (X-126), including the "Decisions:" lines for answered Choice cards (X-125); never trimmed from `Title:` through `Decisions:`.
9. **Untrusted content**: every email body, web page text, WhatsApp message, file text and search result wrapped as
   `<untrusted …>…</untrusted>` with the fixed preface; wrapper, sources, escaping and preface text: `untrusted.md`, 08-4 §24.14.
10. **Steer**: header `New messages from {firstName} while you work (answer or fold in each one):` then the queued messages (08-4 §24.14).

Which parts each purpose gets: 08-4 §24.1. Parts 1–6 are the **system** (stable for a session); 5b and 7–10 are the per-turn **prompt**; total size ≤ 48,000 chars (≤ 24,000 for local AI) with the fixed trim order of 08-4 §24.15.

The assembled string goes through `Redactor.finalGate()` (§11.4) **after** assembly; a hit on the SecretRegistry at this point is a bug: the value is blanked, the turn proceeds, and `REDACTION_LATE_HIT` is logged with the part number (not the value).

System goes to `--append-system-prompt-file` for Claude; to the `system` field for HTTP providers; COMBINED (system + "\n\n" + prompt) on stdin for Codex and Gemini (OMB-06 §4).

### 7.3 Reply envelope `FOO/1` (all purposes)

```
<say>text for the user (may be empty)</say>
<act>{ JSON, schema depends on purpose }</act>
```

- Chat-lane turns stream through the sentence release gate (08-4 §25.5): no text reaches `message:delta` before it has passed the §7.6 filters. Untagged text, stray text and repair after streaming: 08-4 §25.5. Job step turns do not stream (Art. 22).
- `<act>` is parsed with zod. Unknown fields are rejected.
- `[foo decision: a text-plus-trailing-JSON envelope works identically on every provider, including small local models and CLIs without schema flags; native tool-calling is not used because CLIs run with tools disabled]`.

### 7.4 `<act>` schemas

Every purpose's `<act>` schema is 08-4 §25 (`IntakeAct` §25.2, `StepAct` with `request_approval` §25.3, `SecondLookAct`, `RewriteAct`, `StuckAct` §25.4; shared act types `PlanStep`, `ChoiceCardSpec`, `ToolCall`, `ApprovalDraft`, `CardAnswer`, `HandoffNote` §25.1). Memory review, tidy, routine and brief acts are 08-3 §12.4, §12.7, §13.4, §14.3. zod objects are strict.

| Act schema | Purpose | Defined in |
|---|---|---|
| `RoutineStepAct` | `routine` (decision `routine_result`) | 08-3 §13.2 / §13.4 |
| `BriefAct` | `brief` | 08-3 §14.3 |
| `TidyAct` | `tidy` | 08-3 §12.7 |
| `GroupIntakeAct` / `GroupMemberAct` | `intake` when `chats.kind='group'` | 08-4 §25.2a |
| `CatchUpAct` | `catch_up` | 12-2 §12.27.5 |
| `PaperRead` | `read_attachment` | 12-2 §12.28.3 |

### 7.5 Validation and repair
If `<act>` is missing or invalid: one repair turn (`purpose:'repair'`, same session) with `repair.md` (08-4 §24.8) A second failure → `PROTOCOL_INVALID` (08-3 §21.4, X-120; counts toward `fail_streak`). For chat-lane turns, a valid `<say>` with a broken `<act>` is still posted as a plain reply.

### 7.6 Output filters (every `<say>`, every step slot, every card text from the AI)
1. **Banned words** (Art. 2 list + "agent", "tool call", "API key"→"key"): case-insensitive whole-word scan. Hit → replace with the mapped plain word (`API`→"connection", `token`→"key", `OAuth`→"sign in", `server`→"service", `cron`→"routine", `prompt`→"message", `model`→"AI", `CLI`/`terminal`/`command`→"helper app") when a mapping exists; if any unmapped banned word remains, one `rewrite` turn on the cheap model with `rewrite.md` (08-4 §24.9). Still failing → the sentence containing it is dropped. Hindi and Punjabi script forms and the `agent` / `tool call` mappings: 08-4 §25.8.
2. **Filler** (J7 step 5): sentences matching "Great question", "How can I help you", "I apologize for the confusion", "As an AI", "I hope this helps" are removed.
3. **Chunking**: the engine never splits a reply; the renderer's rule (04 §12.3) and the bubble delay formula are 08-4 §25.9. The engine only turns tables into "label: value" lines.
4. **Redactor** (§11.4) on the final text.

---

## §8. Tool layer

### 8.1 Route ladder (normative order; Cowork tool ladder CWK §2, §9.3; Instinct ordered fallbacks INS §4.3; J9 route order)

```
1 CONNECTOR  (gmail · gcal · contacts · whatsapp · x-drafts; v1.1: hub connections §16.8) — if a connected app covers the need
2 BROWSER    (foo's Edge window, foo profile) — sites, bookings, bills, checkouts; reading-only public pages may use the cloud browser (§8.3.12)
3 SCREEN     (v1: open a file/app/URL for the user; screenshot only when the user attached "look at my screen")
4 EMAIL      (write to the business) — needs a fresh Approval card (Art. 9)
5 HAND BACK  ("Open the page" / "Open in Gmail" / user does it) — always available
```
Rung names in code are the `Route` values of 08-0 §B.2 (`api`, `browser`, `screen`, `email`, `handback` = rungs 1–5 above); `rungOf(route)` = index 1–5 in that order; the "later rung" rule below compares these indices (X-125).

Rules: the runner rejects a browser call to a site whose content a connected connector covers (host map in 08-4 §27.2, e.g. `mail.google.com` when Gmail is connected) with `ROUTE_ORDER` and tells the AI to use the connector. Moving from one rung to a later one inside an approved job, to a new recipient, or acting (`book`/`buy`/`pay`) on a domain different from `approval.fields.siteDomain` requires a new Approval card (Art. 9, G8). Reading other sites never does. Search (`web.search`) and page reading (`web.fetch`) are reads at every rung and use the user's own Exa/Tavily and Firecrawl keys when saved, else the local path (§8.3.12) [X-46].

### 8.2 Tool catalogue (every tool the AI may call)

| Tool | Args | Action class (§9.2) | Notes |
|---|---|---|---|
| `gmail.search` | `{ query: string; max ≤ 50; sinceDays ≤ 365 }` | read | Gmail `q` syntax; returns ids, from, subject, date, snippet |
| `gmail.read` | `{ messageId }` | read | body text (plain preferred, HTML→text), attachments metadata; wrapped untrusted |
| `gmail.draft` | `{ to: string[]; subject; body; replyToMessageId? }` | prepare | creates a Gmail draft, a Draft card and its `approvals` row (PENDING, 60 min, 08-0 §G.7); never sends |
| `gmail.send` | `{ draftCardId }` | send | **engine-only, never offered to the AI**: runs after the user's Send tap (`draft:send` = approve once), the 5 s undo and the second look (08-0 §G.7) |
| `gcal.list` | `{ from; to }` | read | |
| `gcal.create` | `{ title; start; end; location?; notes? }` | calendar_write | permission row `p-calendar` (08-0 §G.3); after a booking see 08-4 §28.2 |
| `whatsapp.read` | `{ chat?: string; sinceHours ≤ 168; mentionsOnly? }` | read | from `wa_messages` + live bridge |
| `whatsapp.draft` | `{ to: string /* contact or group */; text }` | prepare | Draft card + `approvals` row (08-0 §G.7); `to` is resolved by the engine (08-3 §16.4.2), never by the AI |
| `whatsapp.send` | `{ draftCardId }` | send | **engine-only**, as `gmail.send`; groups and new numbers: always the full Approval card (J12, J16) |
| `x.draft` | `{ text }` | prepare | X Draft card; weighted length ≤ 280 |
| `x.openCompose` | `{ draftCardId }` | prepare | opens `https://x.com/intent/post?text=…` in the default browser; never posts (J12) |
| `browser.open` | `{ url }` | read | http/https only; blocks `file:`, `chrome:`, `edge:`, `about:` (except blank), `localhost`, private/link-local IP ranges (test builds: `FOO_TEST_ALLOW_HOSTS`, 08-4 §27.6) |
| `browser.snapshot` | `{ scope?: "page" \| "form" }` | read | §8.3.4 |
| `browser.click` | `{ ref }` | read **or** the class of the element's purpose (see 8.2.1) | |
| `browser.type` | `{ ref; text }` | prepare | refused if `text` matches a secret pattern (§11.5) |
| `browser.select` / `browser.check` / `browser.press` / `browser.scroll` / `browser.back` / `browser.wait` | `{ ref?; value?; key?; ms ≤ 15000 }` | read/prepare | |
| `browser.fillSecret` | `{ ref; secretName; field: "username" \| "password" }` | prepare | value from vault straight into the page (§11.3) |
| `browser.fillCard` | `{ refs: { number; expiry; name; cvv? }; approvalId }` | pay | **engine-only**: only for an APPROVED payment, after second look (§10) |
| `browser.fillPersonal` | `{ ref; field: "name" \| "email" \| "phone" \| "address" }` | prepare; `share_personal` if field is phone/address | value from memory, typed by the engine; card lists it (J9, J10) |
| `browser.submit` | `{ ref; approvalId }` | book / buy / pay / delete (from the approval verb, `ApprovalDraftVerb` 08-0 §B.2) | **engine-only**: the irreversible click (§10.4), after the write-ahead ack (08-4 §29.1); after APPROVED, `book` and `delete` run second look → `liveTermsCheck` → write-ahead `RUNNING` → this call exactly once (X-125) |
| `gmail.trash` | `{ messageId }` | delete | **engine-only, never listed to the AI** (X-125): runs after an APPROVED `delete` approval whose evidence is a Gmail message, after the second look |
| `browser.screenshot` | `{}` | read | masked (§11.6) |
| `browser.download` | `{ ref }` | read | into `{DATA}\jobs\{id}\downloads\` |
| `web.search` | `{ query; max ≤ 10 }` | read | [X-46] With an Exa key (`foo/web_key/exa`): Exa search, India-biased (`userLocation: "IN"`), ≤ 10 results (title, url, snippet, site, date). With a Tavily key instead: Tavily basic search. Query passes the Redactor first (§11.4 R11); results wrapped untrusted (§7.2 part 9). No key, key refused, quota used up or service down → **local path**: `https://www.bing.com/search?q={q}&cc=IN&setlang={en-IN\|hi}` in the job window, read by a fixed parser (title, url, snippet, site), ≤ 10, ads and AI-answer modules skipped; on a challenge page never solve, retry once on `https://html.duckduckgo.com/html/?q=`, then `SEARCH_BUSY` ("Search is busy right now." [ Try again ], 08-3 §21.2; counts as one tool failure, not a job failure). The fallback is silent; a used-up key adds one line to the next brief. Cost per call added to the AI spend meter (§5.10) |
| `web.fetch` | `{ url }` | read | [X-46] URL policy as `browser.open`, re-checked on every redirect. Hand-back domains (§8.3.10) and pages that need the user's sign-in are never sent to a cloud reader. With a Firecrawl key (`foo/web_key/firecrawl`): Firecrawl scrape → Markdown ≤ 20,000 chars + title/site/date; URL passes the Redactor first (query params named `token\|key\|code\|sig\|…` stripped, R11). No key / service down / 4xx → **local path**: GET with Edge user agent, `Accept-Language: en-IN,hi;q=0.8`, 2 MB cap, charset sniffing; JSDOM (scripts and remote loading off) → `@mozilla/readability` → Markdown ≤ 20,000 chars; under ~500 chars or not readable → `needsBrowser`, the engine reads it in the job window (same extractor on the rendered page). 15-min cache per URL. Text wrapped untrusted. Cost added to the AI spend meter |
| `web.browseCloud` | `{ url; goal }` | read | [X-46] only when `connections.web.cloudBrowser` is on (a Browser Use key is saved), the domain is not a hand-back domain, the job holds no sign-in, saved login, card, personal field or approval for that domain, and the goal is reading (find, compare, list). Returns text and links only; the cloud loop is given no secret, no personal field and no way to submit (§8.3.12). Anything that would type, sign in, book, buy, pay, send or post → `USE_EDGE`, the step moves to foo's Edge rung |
| `contacts.search` | `{ query; max ≤ 20 }` | read | [X-48] Google People API over the user's contacts (§16.7); returns display name, emails, phones (masked in toasts and logs, §11.4). Used by `gmail.draft` / `whatsapp.draft` to resolve names; two or more matches → Choice card "Which {Priya}?"; "someone new" (Art. 5) = not in Contacts, not in sent mail, not in WhatsApp chats |
| `hub.call` (v1.1, `flags.hub`) | `{ app; tool; args }` | the class written in foo's manifest for that tool (§16.8); unknown tool → `CONN_TOOL_UNKNOWN` | [X-49] through the one hub connection (Composio, else Zapier); never offered to the AI unless the app is connected; results untrusted |
| `memory.search` | `{ query }` | read | FTS over `memory_index` |
| `memory.propose` | `{ scope: MemoryScope; text /* ≤ 120 */; provenance: MemoryProvenance; evidenceMessageIds: string[]; reason?: string; category: MemoryCategory; kind: MemoryKind; person?: string /* required when kind='person' */; private: boolean }` (08-0 §B.2 types) — the same object as one `MemoryReviewAct` `add` op (08-3 §12.4 is authoritative; X-112) | prepare | origin is set by the engine to `job`; goes through 08-3 §12.4 and §12.4.1 (sensitive rule, tombstones, dedupe); never saved while `chats.private=1`; at most one call per turn |
| `routine.propose` | `RoutineDraft` | prepare | Routine card (J14) |
| `helper.handoff` | `{ helperId; task; note: HandoffNote }` | prepare | §17 |
| `memory.askShare` | `{ factId: string; groupChatId: string; why: string /* ≤ 80 */ }` | prepare | posts the Choice card in the helper's 1:1 (08-3 §12.5.1); at most one call per turn in a group (J16; Art. 14) |
| `files.read` | `{ path }` | read | only granted folders (J21 Folders, "Ask every time" → Choice card) |
| `files.write` | `{ name; content \| fromDownloadId }` | prepare | only `{OUT}\{safeName(job title)}\` (08-4 §26.2) |
| `files.delete` | `{ paths: string[] }` | delete | always red card (J21 Folders); prefers move to `_to_delete` |
| `screen.open` | `{ target: path \| url \| app }` | read | `shell.openPath` / `openExternal` |
| `job.needSignIn` | `{ site; kind: "password" \| "otp" \| "captcha" \| "passkey" \| "3ds" }` | prepare¹ | J13 lane chooser (§8.4) |
| `job.needSecret` | `{ name; why; kind }` | prepare¹ | Secret box C7 |

¹ These two `prepare` tools never create a card themselves; `job.needSignIn` and `job.needSecret` are runner signals that end the step in NEEDS_YOU (sign-in lane chooser §8.4 / Secret box C7) (X-125).

The Notes column is for builders. What the AI reads for each tool (exact description, line format, which tools are never listed to it) is 08-4 §27.1.

8.2.1 **Click classification.** A `browser.click` is `read` unless the snapshot marks the target element as a **commit control**: a button/link/input whose accessible name or nearby text matches `/(pay|place order|book|confirm|reserve|purchase|buy|send|post|submit|delete|cancel (booking|reservation)|complete|checkout now)/i` (+ Hindi equivalents in 5.3.1) inside a form, or whose form has payment/password fields. Commit clicks are refused with `USE_SUBMIT` and must go through `browser.submit` with an approval id. `[foo decision: the AI cannot reach an irreversible click except through the gated tool]`.

### 8.3 Browser rung

8.3.1 **Choice.** `playwright-core` (no downloaded browsers) launches the installed **Microsoft Edge** with `chromium.launchPersistentContext('{DATA}\\browser\\profile', { channel: 'msedge', headless: false, viewport: null, acceptDownloads: true, args: ['--disable-renderer-backgrounding','--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--no-first-run','--no-default-browser-check'] })`. Fallback when Edge is missing: `channel: 'chrome'` with user-data-dir `{DATA}\browser\profile-chrome\`. Neither present → J19.6 "🌐 I can't open my browser." / J1 "I need Microsoft Edge…" `[foo decision, reasons: (1) Edge ships with every supported Windows and is kept updated by Windows, so no 150 MB browser download; (2) a real, headed, branded browser trips fewer bot checks than Playwright's bundled Chromium; (3) a separate foo profile — not the user's own Chrome profile — keeps foo's sign-ins listable and wipeable (J13 "Signed-in sites", J23 wipe), avoids acting inside the user's personal sessions without consent, and avoids Chrome's block on automating the default profile; (4) J1 and J18 already assume foo's own browser window]`.
8.3.2 **Windows.** One browser process; each job gets its own window (CDP `Target.createTarget({ url:'about:blank', newWindow:true, background:true })`, then adopt the page), max 3. Windows are normal (not minimised) so screencast frames keep flowing, placed behind foo, and appear in the taskbar under Edge with the site's own title (foo adds no title prefix; J18's "find it in the taskbar" is satisfied by the window existing) `[verify in spike: background window placement]`. Max 3 job windows; browser jobs wait for a free window (08-4 §26.8).
8.3.3 **Sign-in pause.** While a sign-in/take-over window is in front (J13), the engine performs **no** snapshot, screenshot or screencast on that page (`page.__fooNoCapture=true`), and no clicks. It polls only `page.url()` and the presence of a password/OTP field every 1 s to detect "the page changed away from the sign-in form" (J13 step 4).
8.3.4 **Snapshot** (`browser.snapshot`): an injected script walks the DOM (including open shadow roots and same-origin iframes) and returns ≤ 300 interactive elements and ≤ 8,000 chars of visible text: `[{ref}] {role} "{accessible name}" {value-or-state}`. Refs are `data-foo-ref` attributes. **At source**: the value of any input that is `type=password`, has `autocomplete` in `cc-*`/`one-time-code`/`current-password`/`new-password`, matches `/pass|pwd|cvv|cvc|otp|pin|card.?num|security.?code/i` in name/id/label, or carries `data-foo-secret` is emitted as `[hidden]`. Then the Redactor runs (§11.4). Text is wrapped as untrusted (§7.2 part 9). `[Grok Secure Form leak via accessibility snapshot, GRK §1.5]` **Borrowed techniques [X-46]:** the element list is built from Playwright's AI accessibility snapshot (refs) merged with DOM interactive elements and open shadow roots; **cross-origin iframes** (payment boxes, captcha frames) are included by routing each ref to the frame that owns it; every masking rule above stays at source unchanged; after the first snapshot in a step only a **diff** (changed / unchanged refs) is sent to the AI. A masked screenshot is added only when the tree has < 5 interactive elements or a canvas fills the main area (seat and berth maps).
8.3.5 **Actions** use Playwright locators on `[data-foo-ref="{ref}"]` with 10 s actionability timeout; after each action the engine waits for `load` or 2 s network idle (max 15 s; two misses in a row raise `SITE_TIMEOUT`, 08-3 §21.2) and computes an observation hash (URL + visible-text hash) for progress (§5.6). Each action carries an **expected change** (new URL, element appears/disappears, value set); no change after the wait → one retry → stuck rules (§5.6) [X-46]. **Watchdogs** run for every job page: dialogs (only `alert` is auto-dismissed; `confirm` is treated as a commit control, §8.2.1), new tabs and pop-ups (adopted into the job, e.g. payment gateways), downloads finished, page crash (reload once), challenge page detected (→ `job.needSignIn{kind:"captcha"}`).
8.3.6 **Masking at source**: an injected stylesheet `[data-foo-secret], input[type=password], input[autocomplete^="cc-"], input[autocomplete="one-time-code"] { filter: blur(10px) !important; }` is present while foo controls the page and removed on take-over. Fill functions add `data-foo-secret` to the elements they fill.
8.3.7 **Live view** (J18): Watch live is the foo-owned window `live.html` showing these frames (`live:frame`, masked, not interactive); Take over and sign-in bring the real Edge window to the front with the docked `signin-banner.html` window (X-66, 08-0 §G.8, 09 §9.27). CDP `Page.startScreencast({ format:'jpeg', quality:60, maxWidth:1280, everyNthFrame:2 })` on the job page only while `job:watch` is on, throttled to ≤ 5 fps, each frame checked: before forwarding, the engine verifies the mask stylesheet is applied (computed style check on every sensitive element, cached per DOM mutation); if not verifiable, the frame is dropped (live view shows the last good frame). Never during sign-in pause. Frames are not stored. "Now:" line = the running step phrase.
8.3.8 **Step screenshots** (replay, J18): one masked JPEG after each step completes and after each `browser.submit`, never on pages with sign-in pause, bank 3-D Secure or OTP fields (§11.6). Kept `settings.privacy.screenshotDays` (default 7); none when disk < 500 MB (J19.6).
8.3.9 **Site notes** (Instinct browser guidance INS §4.3): after blocks (HTTP 403/429 on document, "access denied", known bot-check pages → `SITE_BLOCKED`), CAPTCHAs (`SITE_CAPTCHA`), recipe or target misses that survive one re-plan (`SITE_CHANGED`, 08-3 §21.2), sign-in needs, OTP channel, loops and successes, the engine updates `site_notes.flags` and appends a dated line to `sites\{domain}.md`. Step turns receive the flags for every domain in play; `blocksAutomation` seen within 14 days → the AI is told to skip that site (J9 branch "Zomato blocked me").

8.3.10 **Hand-back sites** [X-46]. `resources/handback-sites.json` (updated with foo; format, match rule and seed list in 08-4 §27.4) lists net-banking, UPI web, trading, crypto and password-manager domains; payment gateways are not on it. `browser.open`, `web.fetch` (cloud path) and `web.browseCloud` on them return `SITE_HANDBACK`; the job posts an `error` card (kind `SITE_HANDBACK`): "This is your bank's site. I'll open it for you, and you do this part." [ Open {site} ] (`errors.site_handback.body`, `errors.site_handback.button`; opens in the user's default browser, not foo's window). foo never types, clicks or reads inside these sites.
8.3.11 **Site recipes** [X-46]. Table `site_recipes(domain, goal, url_pattern, steps_json /* [{instruction, role, name, fallbackSelector, variableName?}] */, success_count, last_ok_at, last_fail_at)`. Saved after a job reaches DONE with proof. Replay: each step runs only when the element matches by role + name on a matching URL, and the AI confirms each step in a light step turn; a miss → normal snapshot and AI choice, then the recipe updates. Only variable names are stored, never values (names, dates, card data). Commit steps (§8.2.1) are never replayed: the final pay, book or send click always goes through `browser.submit` with this job's own approval (§9, §10.4). Recipes are wiped with site sign-ins (Connections → Browser) and by "Delete everything".
   - **IRCTC** (`src/engine/tools/browser/irctc.ts`; IRCTC recipe and Tatkal timer, 12-1 §12.25). It holds **no rail constant**: every time, window, class list and refund value is read from `resources/rail-rules.json` (08-0 §E.5, §G.19). Rules: it never selects net banking on IRCTC's payment page; the Aadhaar OTP and every puzzle go to the user (code/CAPTCHA lanes, §8.4; Art. 8); Premium Tatkal only when the user said "premium tatkal" in this job.
   - `railRefundEstimate({ classCode, farePaise, hoursBeforeDeparture, tatkal, status }) → { refundPaise: number; estimate: true }` per the `rail-rules.json` slabs: ≥ 72 h flat charge per passenger; 72–24 h 25 % of fare, 24–8 h 50 % of fare, each never below the flat charge; < 8 h nothing; + GST % on AC classes; confirmed Tatkal → 0; WL/RAC → fare − clerkage. Every user-facing use labels it an estimate.
   - `irctc.isSignedIn(): Promise<boolean>` — checks the foo Edge profile's irctc.co.in cookies for a session cookie; cached 10 min; exposed to the renderer as `routine:ideaStatus` → `{ irctcSignedIn }` (08-1 §3.2; X-124).
   - **PNR read path** (`pnr_watch`): foo opens IRCTC's booked-ticket history (My Transactions → Booked Ticket History) in foo's Edge profile and reads the PNR row; it never opens the public PNR enquiry page (CAPTCHA, never solved) and uses no third-party PNR API (X-108). If IRCTC shows its sign-in page the run returns `signed_out` and makes no other request.
   - **Billers** (`resources/billers.json`, format 08-0 §E.5; 12-1 §12.26): foo pays a biller only on a `domains` entry of its row or a domain the user confirmed (kept in `sites\{domain}.md` as "biller: {name}"); B verifies each seed domain before M15.
8.3.12 **Cloud web tools** [X-46]. (a) The user's own keys only (vault `foo/web_key/exa`, `foo/web_key/tavily`, `foo/web_key/firecrawl`, `foo/web_key/browseruse`, 08-0 §E.8), pasted in the Secret box (05 §5.8), never in chat; no foo server, no foo-paid key. (b) Every outbound query, URL, goal and argument passes the Redactor (§11.4 R11); a registry or pattern hit removes the hit before sending, and a hit in a URL path or host blocks the call (`CLOUD_SECRET_BLOCKED`, local path used). (c) Results are untrusted text (§7.2 part 9) and cannot by themselves trigger a rung change, a new domain, a new payee or a secret entry (§9.6 "page asked"). (d) The cloud browser (`web.browseCloud`) is for public, signed-out reading only: no foo profile cookies, no saved logins, no secrets, no personal fields, no card data, no `browser.submit`; its own agent loop never approves anything and any proposed send, buy, book or post becomes a normal step on foo's Edge rung behind the Approval card (Art. 4–7, 10). IRCTC, bill and biller sites, and any site the job is signed in to, always use foo's Edge. (e) Each call's cost (from `pricing.json` `web.*` rows) is added to the AI spend meter and counts toward the AI cap (§5.10, Art. 13); at the cap, cloud calls stop and the local path is used. (f) Failure of any cloud tool → silent local fallback (Art. 29); 3 failures in a row mark that provider "resting" for 1 h. (g) What each service sees is listed in Settings → Privacy (06-2 §6.6). (h) Endpoints, headers, bodies, response mapping, timeouts, key check, error kinds (`CLOUD_AUTH`, `CLOUD_QUOTA`, `CLOUD_DOWN`, `CLOUD_SECRET_BLOCKED`), offline rule and cost rows: 08-4 §27.3 and `resources/web-tools.json`.

### 8.4 Sign-in lanes (J13 lane chooser, Grok four lanes GRK §1.1)

| Need (`job.needSignIn.kind` or detected) | Lane | Engine behaviour |
|---|---|---|
| saved login exists for the domain | Saved login | `browser.fillSecret` username + password; on failure → Sign in here ("Your saved IRCTC login didn't work…") |
| password, no saved login | Sign in here | job NEEDS_YOU, sign-in card C9; the real Edge job window brought to front (not resized) with the docked `signin-banner.html` window (09 §9.27, 08-0 §G.8, X-121); capture paused (8.3.3); detect success; then offer "Save your {site} login…" once per site (values typed again in a Secret box, never captured from the page) |
| OTP by SMS/email | Code box (if chosen) else Sign in here | `code:submit` → SecretRegistry handle → typed into the OTP field → forgotten; never read from Gmail unless `privacy.readCodesFromGmail` includes the domain (J13 branch) |
| CAPTCHA, passkey, phone approval, bank 3-D Secure | Take over | job NEEDS_YOU; window full size; all foo clicks paused until "Hand back to foo" |
| app account (Google, Microsoft) | Connect | C10 → §16 OAuth |

Timers (J13): reminder toast at 10 min; cancel at 2 h (nothing booked).
foo never solves CAPTCHAs, never uses CAPTCHA-solving services, stealth fingerprint changes or proxies, and never hands a challenge to a cloud browser. A detected challenge always goes to Take over [X-46].

### 8.5 Screen rung (v1 limit)
`[foo decision]` v1 ships `screen.open` only, plus a one-shot screenshot of the whole screen when the user attaches it themselves (composer "look at my screen"). Clicking and typing into other desktop apps is **not** in v1 (Cowork asks per app and blocks finance apps, CWK §2; risk too high for a non-technical first release). The AI is told the screen rung cannot click. O-5 answered: no clicking in v1 [X-47]. **v1.1** (`flags.screenHands`): one allowed app per job as research/capabilities.md §4.3 (UI Automation first, one-window capture second, commit clicks gated like §8.2.1, job-only permission card, 30-min limit, the user's mouse or keyboard pauses foo at once, stop key and overlay Stop); finance, bank, UPI, trading, crypto, password-manager, Windows Settings and system apps always blocked (`APP_BLOCKED`). Full spec text is written before v1.1 build (V11-1…V11-8 in research/capabilities.md §7.2).

### 8.6 Functions

| Function | In | Out | Errors | J | Art |
|---|---|---|---|---|---|
| `toolLayer.execute` | `job, ToolCall` | `ToolResult { ok; observation; gate }` | `ROUTE_ORDER`, `USE_SUBMIT`, `URL_NOT_ALLOWED`, `SITE_BLOCKED`, `CONN_*`, `BROWSER_MISSING` | all jobs | 5, 9, 12 |
| `browser.ensure` | — | `BrowserHandle` | `BROWSER_MISSING` | J1, J18 | — |
| `browser.snapshot` | `page` | `Snapshot` (masked) | — | J9–J13 | 8 |
| `browser.startScreencast` / `stop` | `jobId` | frames | `LIVE_UNAVAILABLE` | J18 | 8 |
| `browser.pauseCapture` / `resumeCapture` | `jobId` | `void` | — | J13 | 8 |
| `chooseSignInLane` | `site, kind` | `Lane` | — | J13 | 8 |
| `siteNotes.update` / `get` | `domain, flags` | `SiteFlags` | — | J9, J13, J19.4 | — |
| `webSearch.exa` / `webSearch.tavily` / `webSearch.bing` / `webSearch.ddgHtml` | `query` | `SearchResult[]` | `CLOUD_*` → fallback, `SEARCH_BUSY` | J9 | 8, 13, 29 |
| `webFetch.firecrawl` / `webFetch.extract` | `url` | `ReadResult \| needsBrowser` | `CLOUD_*` → fallback, `URL_NOT_ALLOWED`, `SITE_HANDBACK` | J9 | 8, 29 |
| `web.browseCloud` | `url, goal` | `ReadResult` | `USE_EDGE`, `SITE_HANDBACK`, `CLOUD_*` | J9 | 4–7, 8 |
| `cloud.outbound` | `provider, payload` | redacted payload \| block | `CLOUD_SECRET_BLOCKED` | all cloud calls | 8 |
| `recipes.save` / `match` / `invalidate` | `job` / `domain, goal, url` / `domain` | `Recipe \| null` | — | J9–J11 | 7, 11 |
| `browser.watchdogs.start` | `page` | `void` | — | J9–J13 | 12 |
| `handback.check` | `url` | `boolean` | `SITE_HANDBACK` | J9, J11 | 7, 8 |
| `contacts.search` | `query` | `ContactHit[]` | `CONN_EXPIRED` | J12, J16 | 5 |

---

## §9. Approval gate and second look

### 9.1 States
Exactly journeys-1 §5: `PENDING → APPROVED → RUNNING → COMPLETED`, with `HELD`, `CHECKING`, `DECLINED`, `EXPIRED`, `SUPERSEDED`, `WITHDRAWN`, `FAILED`. Only main's ApprovalGate writes `approvals.state`; the engine requests transitions (`approval.transition`), main validates them against the transition table and rejects anything else (`APPROVAL_BAD_TRANSITION`, logged). The write-ahead before an irreversible click is 08-4 §29.1; every other engine write is a `DbOp` / named query (X-71).

Expiry (J C4/C5): `pay` 10 min · `book` with no charge now 15 min · `send`/`post`/`delete`/`share`/`switch` 60 min (a Draft card's approval: 60 min from draft creation, 08-0 §G.7; Gmail side: 08-3 §16.1.4). Timers run in main (they keep running while the window is closed). Expired → `EXPIRED`; the job: payment/booking → `cancelled`; others stay `needs_you` with the expired card's [ Ask me again ] (J §5).

### 9.2 Action classes

| Class | Examples | Permission row (08-0 §G.3; 06 id) | Hard limit (Art. 5) |
|---|---|---|---|
| `read` | search, read, open, snapshot | `read` (`p-read`); tools: `gmail.search`, `gmail.read`, `gcal.list`, `whatsapp.read`, `contacts.search`, `browser.open`, `browser.snapshot`, `browser.click` (non-commit), `browser.screenshot`, `browser.download`, `web.search`, `web.fetch`, `web.browseCloud`, `memory.search`, `files.read`, `screen.open` | no |
| `prepare` | drafts, typing into forms, filling non-sensitive fields | `drafts` (`p-drafts`); tools: `gmail.draft`, `whatsapp.draft`, `x.draft`, `x.openCompose`, `browser.type`, `browser.select`/`check`/`press`/`scroll`/`back`/`wait`, `browser.fillSecret`, `browser.fillPersonal` (name/email), `files.write`, `memory.propose`, `memory.askShare`, `routine.propose`, `helper.handoff`, `job.needSignIn`, `job.needSecret` | no |
| `calendar_write` | add event | `calendar` (`p-calendar`); tool: `gcal.create` | no |
| `send` | email, WhatsApp, email to a business | `send` (`p-send`; ask or never); engine-only tools `gmail.send`, `whatsapp.send` (after a Draft card) | when recipient is new, a group, or the content includes address/phone/bank details/attachments from Documents or agrees to pay (J12 branches) |
| `book` | reservation, booking | `book` (`p-book`; ask or never); `browser.submit` with verb `book` | when phone/address is shared (J9), when it cannot be cancelled free |
| `buy` / `pay` | checkout, bill | `pay` (`p-pay`; ask or never); `browser.fillCard`, `browser.submit` with verb `buy`/`pay` | **always** |
| `post` | public post | `post` (`p-post`; locked `never` in v1 → hand-back: `x.draft` + `x.openCompose`) | **always** |
| `delete` | files, bookings (cancelling a booking is `delete`, X-55), emails | `delete` (`p-delete`; ask or never); `files.delete`, `browser.submit` with verb `delete`, engine-only `gmail.trash` | **always** (cannot be undone) |
| `share_personal` | phone, home address to a third party | `share` (`p-share`; ask or never); `browser.fillPersonal` (phone/address) | **always** |
| `switch` | change of channel/site/person in an approved job | — (always a card) | **always** (Art. 9) |

App rows (`permissions.apps`, 08-0 §A): `gmail.*` → gmail; `gcal.*` → calendar; `contacts.search` → contacts; `whatsapp.*` → whatsapp; `browser.*`, `web.*` → browser; `outlook.*` → outlook. Tools with no app row (memory, routine, helper, files, screen, job) use only their action class.

`rowFor(cls, tool)` = the row of the tool's class in the table above (the tool → row map of 08-0 §G.3, written with this chapter's tool names); only `browser.click` (§8.2.1), `browser.fillPersonal` and `browser.submit` (verb of its approval) need the tool to find the class.

Hub tools (v1.1) take the class foo's manifest gives them (§16.8); any tool that writes, sends or pays is at least `send`/`pay` and always asks. Cloud web tools are `read` only [X-46, X-49].

### 9.3 `ApprovalFields` (canonical; hashed; drives the card text — never free AI text, MUS §9.1)

```ts
interface ApprovalFields {
  verb: ApprovalVerb;                 // 08-0 §B.2 (X-55)
  channel?: "email" | "whatsapp" | "web" | "x";
  recipients?: { name: string; address: string; isNew: boolean; isGroup: boolean; groupSize?: number }[];
  payee?: string; siteDomain?: string;
  amountPaise?: number; lines?: { label: string; amountPaise: number }[]; currency?: "INR";
  when?: { start: number; end?: number; tz: string };
  partySize?: number; item?: string;
  personalShared?: ("name" | "email" | "phone" | "address")[];
  cancelTerms?: { freeUntil?: number; feePaise?: number; refundable: boolean };
  contentSummary?: string;            // for send/post: subject + first 140 chars (redacted)
  irreversible: boolean;
}
```

### 9.4 Gate algorithm (engine `GateLogic.decide`, runs for every tool call and every verified `ApprovalDraft`)

Permission model: always · ask · never (X-54, 08-0 §G.3).

```
decide(job, call):                                            # call = a ToolCall, or an ApprovalDraft verified by 08-4 §28.1
  cls = classOf(call)                                         # §9.2, §8.2.1
  app = appOf(call)                                           # §9.2 app rows; none for memory/routine/helper/files/screen/job tools
  perm = (cls == 'switch') ? 'ask' : settings.permissions.actions[rowFor(cls, call.tool)]   # the row is read FIRST (X-125, 08-0 §G.3); §9.2 map
  if perm == 'never':
       if cls == 'post': return HAND_BACK                     # v1: x.draft + x.openCompose ("Open in X to post")
       return REFUSE(row)                                     # 08-0 §G.3 line "I'm not allowed to {row}. You can change that in Settings → Permissions." [ Open Permissions ]; step → skipped; read = 'never' and drafts = 'never' are real
  if helperOwned(job) and !helperAllows(job.owner, app, cls): return REFUSE(HELPER_NOT_ALLOWED)   # helper allowedApps AND permissions (08-3 §17)
  if app:
     ap = settings.permissions.apps[app]
     if ap == 'never': return REFUSE(app)                     # "I'm not allowed to use {app}. …" (thread.permission.never)
     if ap == 'ask' and !askedThisJob(job, app) and !matchRule(settings.rules, 'use_app', app):
          return ASK_CHOICE(app_use)                          # "Can I use {Gmail} for this?" [ Yes ] [ Not this time ], once per job
  if cls == read: return EXECUTE
  if cls == prepare and not personalHard(call): return EXECUTE
  if job.intent == 'read_only':
       return ASK_CHOICE(offer_action)                        # "Want me to {action}?" Art. 3, J9; a Yes adds the verb to do_verbs
  if chat(job).kind == 'group': cards of this call go to the owner helper's 1:1 chat; the group gets the "stays private" line   # Art. 14, J16
  hard = isHardLimit(cls, fields)                             # §9.2 column
  if !hard and perm == 'always': return EXECUTE               # only read, drafts, calendar may be 'always' (08-0 §A.2); no second look for them
  if !hard and cls == 'calendar_write' and coveredByBooking(job, call): return EXECUTE   # 08-4 §28.2
  if !hard and cls == 'calendar_write' and matchRule(settings.rules, cls, call): return EXECUTE (approved_via='rule')   # rules: use_app, calendar_write, mail_organise only
  if call is gmail.send / whatsapp.send:                      # engine-only; never from the AI
       the Draft card's approval (created PENDING with the draft, 08-0 §G.7) was approved by the user's Send tap
       → 5 s undo window (undo_until) → SECOND_LOOK → RUNNING → EXECUTE
  # everything else
  createApproval(draft, hard) → PENDING card (approval; payment for buy/pay, §10.2) → job NEEDS_YOU
  on APPROVED: SECOND_LOOK → RUNNING → EXECUTE → COMPLETED / FAILED / CHECKING
```

9.4.1 Permission values are `always`, `ask`, `never` only. `send`, `book`, `pay`, `delete`, `share` can never be `always`, and `post` is `never` in v1 (locks in 08-0 §A.2, `SETTING_LOCKED`). The old values `do`, `do_when_i_say`, `ill_do` and the G-08-03 note no longer exist. Copy keys of the gate lines: 08-4 §31.
9.4.2 **Fresh terms check.** Immediately before creating a card and again immediately before executing, the engine re-reads live terms (price, slot, fee, recipient) through a read tool. Any difference from `fields` → current approval `SUPERSEDED` + new PENDING card with the J copy ("The price changed from ₹{a} to ₹{b} at checkout, so I stopped. Nothing was paid.", `cards.approval.superseded.price_changed`).
9.4.3 **Untrusted origin check** (J12 injection branch): if a recipient address, payee or URL in `fields` appears in untrusted content but never in the user's own messages or memory, the card is still created but the second look (9.6) MUST flag it; and if the request to act originated only from untrusted content, the engine does not create the card and posts "An email asked me to send your details to someone. I didn't. [ Show me the email ]" (J12; `thread.injection.blocked`, `thread.injection.button.show_email`).
9.4.4 **Cancelling a booking.** "Cancel booking" on the `deadline_reminder` approval and a typed "cancel my train/booking" create an Approval card with verb `delete` (X-55; AT-207).

### 9.5 Scopes and rules
Scope chips appear only for using an app, adding/changing calendar events and moving or labelling emails (05 §5.5.3); never for send, book, buy, pay, post, delete or share [settled: X-03]. `once` = single use (default). `chat` = rule limited to this chat until app restart `[foo decision: "For this chat" lasts until foo restarts, so it can't silently live forever]`. `always` = `Rule { id, verb, match: { app?, calendarId? }, createdAt, source: 'card' }` in `settings.rules` (J21 "Rules I follow", removable). Rules never match hard-limit approvals, payments, new recipients, groups or attachments with personal documents (J12 step 7). There is no per-person send offer (J12 step 7 and D-20 withdrawn) [settled: X-03]. Rules (`Rule[]`) apply only to `use_app`, `calendar_write` and `mail_organise` (08-0 §G.3).

### 9.6 Second look (Art. 10, G17; ChatGPT Auto-review GPT §3.1; Grok "checks your own messages", GRK §3.1; Hermes guard prompt hardening HRM-SRC `tools/approval_smart.py`)

Runs right before execution of every `send`, `book`, `buy`, `pay`, `post`, `delete`, `share_personal` (approved by card, draft tap or rule).

**Page asked [X-46].** In every step turn, an instruction found in page text, a cloud tool result or a hub result to go to a new domain, pay a new payee, or enter a secret is flagged "page asked" and can never by itself cause a rung change, a new payee or a secret fill (each already needs a card under §8.1).

```
secondLook(approval, job):
  userWords = 08-4 §28.3 by job.origin (user, routine, brief, handoff, retry, setup, system)   # ONLY the user's own words; empty → HELD(cannot_check)
  A. deterministic checks (no AI):
     - payment: fields.amountPaise == live checkout total (parsed by §10.3) == card total
     - recipient address on the outgoing call == fields.recipients[*].address
     - siteDomain of the page == fields.siteDomain
     - dates: every date/time the user stated (parsed by chrono-node with user tz) that refers to this job == fields.when (±0 min for times, same day for dates)
     - numbers: party size / quantity stated by user == fields
     (extraction rules and the HELD values: 08-4 §28.4)
     any mismatch → HELD(mismatch)
  B. AI check (fresh session, no resume, PRIMARY provider only, cheap model, temperature 0, purpose 'second_look', timeout 20 s;
     prompt files second_look.md + protocol.md, 08-4 §24.7; act SecondLookAct, 08-4 §25.4)
     invalid twice / timeout / primary unavailable (even with a verified backup) → HELD(cannot_check)      # fail closed (J19.1 branch)
  C. result stored in approvals.second_look; pass → RUNNING
```

HELD card copy (keys 08-4 §28.6): mismatch → "Before I do this, one check: you asked for {userSaid}, this is {actionHas}. Which one?" with two Choice chips built from the two values (J §5, J12 example). `cannot_check` → "I need your AI back to double-check this before paying. I'll ask again when it's back." (J19.1 branch; used for every verb, with "paying" replaced by "sending"/"booking"/"deleting"/"sharing" `[foo decision]`). Picking the user's value → the job re-prepares with that value and builds a **new** card (the old one → SUPERSEDED); picking the action's value → APPROVED proceeds.

### 9.7 Functions

| Function | In | Out | Errors | J | Art |
|---|---|---|---|---|---|
| `GateLogic.decide` | `job, ToolCall \| ApprovalDraft` | `EXECUTE \| ASK_CHOICE \| HAND_BACK \| REFUSE \| CARD(approvalDraft)` | `HELPER_NOT_ALLOWED`, `APPROVAL_EVIDENCE` | J9–J13, J16 | 3, 5, 9, 14 |
| `ApprovalGate.create` (main) | `ApprovalDraft` | `{ approvalId; cardId; nonce }` | `CAP_PURCHASE` | C4, C5 | 5, 7 |
| `ApprovalGate.approve` (main) | `cardId, nonce, scope` | `ApprovalState` | `CARD_STALE`, `CARD_EXPIRED`, `HELLO_*` | J9–J12 | 6, 7 |
| `ApprovalGate.transition` | `approvalId, to, data` | `ApprovalState` | `APPROVAL_BAD_TRANSITION` | §5 machine | 7 |
| `ApprovalGate.expireTick` | — (1 s timer) | expired ids | — | C4, C5 | 5 |
| `liveTermsCheck` | `approval` | `{ same: boolean; diff?: FieldDiff }` | `SITE_*` | J9, J10, J11 | 7 |
| `secondLook` | `approval, job` | `SecondLookResult` | `AI_*` → HELD | G17 | 10 |
| `matchRule` / `addRule` / `removeRule` | `cls, fields` / `Rule` / `ruleId` | `Rule \| null` | `RULE_NOT_ALLOWED` | J12, J21 | 5 |

---

## §10. Payments

### 10.1 How foo pays (v1)
- **Saved card into the checkout page** (J10): the card (number, expiry, name; **CVV never stored**) lives in the vault (`foo/card/{last4}`, 08-0 §E.8; Credential Manager JSON ≤ 2,560 bytes). After approval, the engine types the values straight into the merchant's own card fields; the AI only ever knows "Visa ••4242" (Art. 8).
- **UPI on the phone** (J11): foo types the user's UPI ID (not a secret, stored in settings, shown masked) into the site's UPI field and submits; the user approves the collect request in their UPI app; foo waits up to 5 min for the site's success page (`[J11 foo decision: the phone approval is the bank's own second check]`).
- No wallet, no stored bank login, no autopay, no payment without a Payment card (Art. 5, 7; routines end in a card, J14).

### 10.2 Payment card creation
1. Duplicate guard (J11): `payments` with the same `payee` and `amount_paise` and state `succeeded` in the last 7 days → hard-stop Choice card "You paid {payee} ₹{x} on {date}. Pay again anyway?" [ Don't pay ] [ Pay again ] before any Payment card.
2. Scam guard (J11): a bill whose pay link domain is not the biller's known domain (from `site_notes` or the email's sender domain) → no Pay button; "This bill email looks odd…".
3. Purchase cap check (§5.10.5; month total per 08-4 §29.3).
4. Card fields from the live checkout (`liveTermsCheck`), `needsCvv` = the checkout has a CVV field, `bigPayment` = `total ≥ money.bigPaymentPaise`.
5. Card C5 created PENDING, 10-min countdown (`expires_at`).

### 10.3 Amount parsing (deterministic)
`parseInr(text): number /* paise */ | null` accepts "₹14,600", "Rs. 14,600.00", "INR 1,23,450", "14600"; rejects ranges, "from ₹…", strikethrough prices (elements with `text-decoration: line-through` are excluded by the snapshot), and multiple distinct totals in the "total" region (→ `null` → the AI is asked to identify the single grand-total element; still `null` → stuck). The checkout total used for comparison is read by the engine from the element ref the AI identified **and** re-parsed by `parseInr`; the AI's own number is never trusted.

### 10.4 Approve → pay sequence (exactly once, Art. 7)

```
payment:approve(cardId, nonce, cvvRef?)                                       [main]
  validate nonce, state PENDING, not expired
  if bigPayment: r = foo-native.verifyUser("Approve paying {amount} to {payee}")   # 09 §9.19.3 copy [settled: X-08]
       'verified' → hello='verified'; any other result → stay PENDING with 09 §9.19.3's line for that result (X-08; 08 adds no Hello wording, 08-4 §29.2)
       'unavailable' (Hello not set up) → typed-amount dialog (09 §9.19.4); must equal total digits → hello='typed_amount'
  if needsCvv and !cvvRef → card asks for CVV (masked 3–4 digit box, C7 variant); cvvRef is a RAM handle, TTL 10 min
  APPROVED (approved_via card) [settled: X-02]
engine:
  secondLook (§9.6, includes amount == live total)  → HELD on any mismatch
  liveTermsCheck                                     → SUPERSEDED on any difference (any amount, up or down, J10)
  fill: browser.fillCard from vault (+cvvRef) | UPI ID into the UPI field; mark fields data-foo-secret; register values in SecretRegistry
  re-read total one last time (parseInr) == approved total else SUPERSEDED
  WRITE-AHEAD (08-4 §29.1): engine → main approval.transition(RUNNING, submittedAt, paymentState 'submitted'); main's ApprovalGate does the one transaction (it INSERTS the `payments` row with state='submitted', X-96) and acks
  browser.submit(ref) — only after the ack (no ack in 2 s → no click, HELD(cannot_check)); ONE click; no retry on any error or timeout
  classify outcome (≤ 120 s, polling the page every 2 s):
     success page / confirmation code   → COMPLETED (proof receipt/confirmation)
     bank OTP / 3-D Secure page          → stays RUNNING; J13 Take over / code lane ("Your bank sent a code to …"); wait ≤ 5 min
     UPI waiting page                    → card line "Approve ₹{x} in your UPI app on your phone. Waiting… {mm:ss}" ≤ 5 min
     explicit decline text               → FAILED "Your bank said no. No money was taken." [ Try another card ] [ Pay with UPI ]
     OTP/UPI timeout                     → FAILED (J10/J11 copies)
     anything else / crash / window closed / network drop → CHECKING
  forget cvv handle; clear registry entries for this payment after 30 min
```

### 10.5 CHECKING procedure (never re-submits; J §5, J10)
Every 60 s for 15 min: (1) re-open the merchant page's order/booking history if known (site notes) and snapshot for the amount + a confirmation code; (2) `gmail.search` for mail from the merchant domain or containing the amount in the last 30 min (if Gmail is connected). Found → COMPLETED with proof. 15 min without proof → FAILED "I couldn't confirm it. Check your bank app before trying again." [ I checked, try again ] — which creates a **new** job and a new Payment card (never resubmits the old approval).

### 10.6 Functions

| Function | In | Out | Errors | J | Art |
|---|---|---|---|---|---|
| `payments.prepareCard` | `job, checkoutRef` | `{ cardId }` | `DUPLICATE_PAYMENT`, `SCAM_SUSPECTED`, `CAP_PURCHASE`, `AMOUNT_UNREADABLE` | J10, J11 | 7, 13 |
| `parseInr` | `text` | `paise \| null` | — | J10, J11 | 7 |
| `verifyUser` (foo-native) | `message` | `'verified' \| 'canceled' \| 'retries_exhausted' \| 'device_busy' \| 'unavailable'` (the one set, 08-5 §6, X-111) | — | J10 | 7 |
| `payments.execute` | `approvalId` | `PaymentOutcome` | `PAYMENT_DECLINED`, `OTP_TIMEOUT`, `UPI_TIMEOUT` → FAILED; unknown → CHECKING | J10, J11 | 7, 11 |
| `payments.check` | `approvalId` | `COMPLETED \| FAILED` | — | J10, J19.5 | 7, 11 |

---

## §11. Secret vault and redaction

### 11.1 What is a secret
AI keys, site passwords, card number/expiry/name, CVV (never stored), OTPs (never stored), connection refresh tokens, the WhatsApp session. **Not** secrets (stored in settings/memory, shown masked): UPI ID, email addresses, phone number (but phone/address are "personal" and gated, Art. 5, 14).

### 11.2 Storage
| Item | Store | Target / file | Format |
|---|---|---|---|
| AI key | Credential Manager | `foo/ai_key/{providerId}` | UTF-8 value |
| Site login | Credential Manager | `foo/login/{host}` | JSON `{u,p}` |
| Card | Credential Manager | `foo/card/{last4}` | JSON `{number, expMonth, expYear, name}` |
| Google token (gmail, gcal, contacts share one row) | Credential Manager | `foo/conn_token/google` | JSON `{refresh_token, scope, issued_at}` |
| Outlook token (v1.1) | Credential Manager | `foo/conn_token/outlook` | same |
| WhatsApp session | safeStorage blob | `{DATA}\vault\wa-session.bin` (> 2,560 bytes) | encrypted Baileys auth state |
| Web tool key [X-46] | Credential Manager | `foo/web_key/{exa\|tavily\|firecrawl\|browseruse}` | UTF-8 value |
| Hub key (v1.1) [X-49] | Credential Manager | `foo/hub_key/composio` | JSON `{key, userId, issued_at}` |

Names are 08-0 §E.8 (X-73; `SecretKind` per 08-0 §B.2); `secret:save` accepts only these shapes. The OpenAI key used for voice notes [X-43] is the same `foo/ai_key/openai-key` entry the `openai-key` AI uses; saving it for voice does not make OpenAI the user's AI.

**`secretKind` → storage (X-114).** `otp`: registry only, TTL 10 min, never vault; `cvv`: registry only, TTL = the payment job, never vault (G-08-08); `voice_key`: vault `foo/ai_key/openai-key` (the same entry as the `openai-key` provider, X-114); `ai_key`: `foo/ai_key/{providerId}`; `web_key`: `foo/web_key/{provider}`; `login`: `foo/login/{host}`; `card`: `foo/card/{last4}`. No vault name contains a space; the only pattern is `foo/{kind}/{safeName}` (08-0 §E.8).

Access through `@napi-rs/keyring` `Entry.withTarget(target, 'foo', name)` (Generic credentials, per-user DPAPI) `[verify exact API in M1]`. A value can be written and used, never read back to the renderer (Grok write-only, GRK §1.2). `secret:list` returns `secrets_index` rows only.

### 11.3 Using a secret (`vault.use`)
```ts
interface VaultUseRequest { purpose: "fill_login" | "fill_card" | "ai_call" | "connector_refresh" | "wa_session" | "voice_call" | "web_tool" | "hub_call"; name: string; jobId?: string; approvalId?: string }
```
Main checks the purpose against the caller: `fill_card` requires an approval in `APPROVED`/`RUNNING` for this job with `verb='pay'`; `fill_login` requires a running job whose current page domain equals the login's domain (checked by the engine, re-asserted by main from `jobs.site_domain`). The value is returned only to the engine's filler/HTTP client, which **first** registers it in the SecretRegistry and then uses it. Values are never written to DB, logs or prompts.

### 11.4 Redaction pipeline (Art. 8, G6; Grok lesson "must hold in every observation channel", GRK §1.5; Hermes `agent/redact.py`)

`Redactor.redact(text: string, ctx: RedactCtx): { text: string; hits: number }` applies, in order:
**Placement (X-72, 08-0 §G.6).** The Redactor is one pure module, `src/shared/redactor.ts`, instantiated in **main** (R1, R2, R7, R8, R9 through `Store.writeRedacted`, logs, notifications, exports) and in the **engine** (R3, R4, R5, R10, R11). The SecretRegistry of record is in main; every addition is mirrored to the engine over the private main↔engine channel as `registry:add { handle, hash, len, value, normalised, ttlMs }` (08-0 §G.6, X-93); the value and its normalised forms never leave main and the engine (never the renderer, a log or a prompt); expiry and `clearFor` send `registry:remove { handles }`. Values first seen in the engine (`vault.use` results, typed codes) are sent to main the same way before first use.

1. **Registry scrub**: exact substrings registered in the SecretRegistry (vault values used this session, typed codes, CVVs, pasted secrets, plus normalised forms: CR/LF stripped, card number without spaces/dashes and grouped 4-4-4-4), longest first → `[hidden]`. Registry: in RAM only, per app run, ≤ 256 values, LRU.
2. **Pattern scrub** (adapted from Hermes `_PREFIX_PATTERNS`): `sk-…`, `sk-proj-…`, `sk-ant-…`, `AIza…`, `ghp_…`/`github_pat_…`, `xox[baprs]-…`, `xai-…`, `gsk_…`, `hf_…`, `AKIA…`, JWTs `eyJ…`, `Bearer …`, PEM private-key blocks, URL query params named `token|key|code|sig|signature|password|pwd|secret|auth` and URL userinfo; card numbers (13–19 digits, separators allowed, Luhn-valid) → `•••• {last4}`; 4–8 digit numbers within 40 chars of `\b(otp|one[- ]?time|verification code|security code|passcode|पासकोड|ओटीपी|ਓਟੀਪੀ)\b` → `[hidden]` (the words confirmation, booking, reference, order, PNR, ticket, receipt and a bare "code" do **not** trigger this rule; a number inside an element marked `autocomplete=one-time-code` is always hidden at source, §8.3.4); 32+ char high-entropy tokens (Shannon entropy ≥ 4.0 bits/char, no spaces) → `[hidden]`. Proof codes are checked against the pre-redaction text (08-4 §26.11).
3. **Context rules**: `ctx.channel = 'toast'` additionally masks third-party email addresses (`r***@gmail.com`) and phone numbers (`+91 98••• ••210`) (J20); `ctx.channel = 'log'` additionally masks every email address and phone number and drops message text entirely (§19.1). `ctx.channel = 'group'` (08-3 §17.3.3; X-126) additionally: (a) masks every email address and phone number as `'toast'` does; (b) removes every amount that appears in a `payments` row of the same job in state `succeeded` (`payments.amount_paise` formatted by F11 in any of its forms: "₹14,600", "14600", "14,600.00") and replaces it with "the amount"; (c) removes the text of every `memory_index` row with `private=1` that was offered in this job's turns (exact and NFKC case-insensitive match) and replaces it with "something private"; (d) removes every address value the job's approvals shared (the `address` typed by `browser.fillPersonal` for an approval of the job) verbatim and replaces it with "the address". The group result bubble is built from the redacted string; a redaction that empties the result yields the fixed line "Done. The details are in {helper}'s chat." (`thread.group.result_private`).

**Choke points (MUST call the Redactor):**

| # | Where | Function |
|---|---|---|
| R1 | Composer → `message:send` (main re-checks what the renderer's paste catcher saw) | `composer.checkSecret` + `Store.writeRedacted` |
| R2 | Every DB text column listed in §4.6 rule 2 | `Store.writeRedacted` |
| R3 | Every AI input, after assembly | `PromptBuilder.finalGate` |
| R4 | Every tool result before it is stored or shown to the AI | `ToolLayer.observe` |
| R5 | DOM snapshot (mask at source + R4) | `browser.snapshot` |
| R6 | Screenshots, screencast frames (mask at source CSS + verification; capture paused on sign-in, OTP, 3-D Secure pages) | §8.3.6–8.3.8 |
| R7 | Logs (tech log, activity summaries) | `log.*`, `activity.write` |
| R8 | Toast bodies | `NotificationService.send` |
| R9 | Exports and crash reports (final scan; abort on any registry or pattern hit with `EXPORT_SECRET_FOUND`) | `data.export`, `report.preview` |
| R10 | AI output before display (the AI could echo a registry value it inferred) | §7.6 step 4 |
| R11 | Every outbound cloud tool request (search query, URL, browse goal, hub arguments) [X-46, X-49]; voice transcripts coming back from OpenAI before they are stored (the audio itself cannot be scrubbed, so Settings says plainly that voice goes to OpenAI) [X-43] | `cloud.outbound`, `voice.transcribe` |
| R12 | Attachments, in main: images/scanned pages OCR-blacked-out, PDF text scrubbed, before any AI turn (08-0 §G.18) | `attachment.prepare` |

The choke points are exactly R1–R12 (X-125; the former R13 is R12).

### 11.5 Paste catcher (C8) and typed secrets
`composer.checkSecret(text, lastFooAskedForCode: boolean): PasteCatch | null` — triggers on the C8 patterns (`sk-`, `sk-proj-`, `AIza`, `ghp_`, `xoxb-`, Luhn-valid 16-digit card, 32+ char high-entropy string) or a 4–8 digit number when foo's last message asked for a code. "Send anyway" (`secretOverride:true`) stores `text = "•••• (hidden)"`, `text_for_ai = "[the user typed a secret; it was hidden]"`, registers the value in the SecretRegistry, and keeps nothing else (J C8). `browser.type` refuses text that hits patterns 2 or the registry (`SECRET_IN_TYPE`), so the AI cannot type a secret it saw.

### 11.6 No-capture pages
The engine sets `noCapture` on a page when: a sign-in window is up (J13); the page has an input with `autocomplete="one-time-code"` or a field matching OTP patterns; the URL host matches the 3-D Secure / bank list in `resources/no-capture-hosts.json` (format and seed in 08-4 §27.5) or the page title/text contains "3D Secure", "Verified by Visa", "Mastercard ID Check", "SafeKey" (J10 "OTP page not screenshotted").

### 11.7 Functions

| Function | In | Out | Errors | J | Art |
|---|---|---|---|---|---|
| `vault.save` | `name, kind, fields` | `SecretIndexRow` | `VAULT_WRITE_FAILED` | J2, J10, J13 | 8 |
| `vault.use` | `VaultUseRequest` | value (engine only) | `VAULT_PURPOSE_DENIED`, `VAULT_MISSING` | J10, J13 | 8 |
| `vault.delete` / `vault.wipeAll` | `name` / — | `{ failed: string[] }` | — | J21, J23 | 15 |
| `SecretRegistry.add` / `clearFor` | `value, ttlMs` / `jobId` | `handle` | — | J10, J13 | 8 |
| `Redactor.redact` | `text, ctx` | `{ text; hits }` | — | all | 8 |
| `composer.checkSecret` | `text, lastAskedCode` | `PasteCatch \| null` | — | J2, J13, C8 | 8 |
