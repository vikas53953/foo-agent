// Spec: 08-1 §2.4 (main ⇄ engine messages: `{ id, kind, payload }`, requests answered `{ re, result: Result<T> }`, every
// payload zod-checked on receipt), §2.4.1 (DbOp, db.tx one transaction, NamedQuery), 08-0 §G.6 (one MessageChannelMain).
// M3 carries the rows the chat lane and the your-AI service need; later milestones add theirs with the same names.
// M4 (CR-0008): the job runner's rows — DbOp transition/activity/mirror, writable jobs/steps/tool_calls/cards, card.answered,
// job.stop/stopAll/retry, power, jobs.pauseAll (G-M4-04), power.keepAwake, notify (stub until M11), the job NamedQuery names.
// M5 (CR-0009; 08-1 §2.4 lines 185–232): approval.changed, registry:add|remove (X-93), code.submit (main → engine);
// approval.open, approval.transition, vault.use (engine → main). Main's handlers are stubs until T4 (approvals) / T2 (vault).
// M6 (CR-0010): memory — MainToEngine `memory.cmd` (G-M6-01), EngineToMain `file.write` (08-1 §2.4, memory\ and helper notes
// only), writable memory_index / memory_tombstones / memory_uses / memory_group_grants (main rebuilds memory_fts in the tx,
// 08-1 §2.5), delete on the memory tables, the memory NamedQuery names, and FOO_TEST `test.memoryTidy`.
// GAP (GAPS.md 2026-10-18 "reactions not in WritableTable"): foo's reaction (08-4 §25.2 kind 'react', AT-027) needs a row in
// `reactions`, which 08-1 §2.4.1 lists neither as writable nor as main-only; M3 adds `reactions` to the engine's inserts.
import { z } from 'zod';
import { PROVIDER_IDS } from '../shared/settings';
import { ApprovalDraftSchema, ApprovalStateSchema } from '../shared/schemas';
import type { Result } from '../shared/errors';
import type { EventChannel, EventPayload } from '../shared/ipc';
import type { ProviderId, AiStatus, ErrorKind, ResolvedBy, StopReason, CardAnswer, ActivityRow } from '../shared/types';
import type { Settings } from '../shared/settings';

export interface Envelope<K extends string = string, P = unknown> {
  id: string;
  kind: K;
  payload: P;
}
export interface Reply<T = unknown> {
  re: string;
  result: Result<T>;
}

export const RESOLVED_BY = ['tap', 'keyboard', 'toast', 'typed', 'reaction', 'auto', 'system'] as const satisfies readonly ResolvedBy[];
export const STOP_REASONS = [
  'user_word',
  'user_button',
  'stop_all',
  'window_closed',
  'stuck_stop',
  'choice_timeout',
  'signin_timeout',
  'approval_expired',
  'approval_declined',
  'helper_deleted',
  'chat_deleted',
  'wipe',
  'system',
] as const satisfies readonly StopReason[];
const cardAnswerSchema: z.ZodType<CardAnswer> = z.union([
  z.object({ optionId: z.string() }).strict(),
  z.object({ optionIds: z.array(z.string()) }).strict(),
  z.object({ text: z.string() }).strict(),
  z.object({ skip: z.literal(true) }).strict(),
]);

const MEMORY_KINDS = ['person', 'preference', 'place', 'fact'] as const;
const MEMORY_ORIGINS = ['chat', 'gmail', 'gcal', 'whatsapp', 'manual', 'setup', 'job'] as const;
const factId = z.string().min(1).max(80);
/** CR-0010 G-M6-01: one engine message per `memory:*` invoke (08-1 §3.1.7); the payload is the invoke's request. */
export const memoryCmdSchema = z.discriminatedUnion('cmd', [
  z.object({ cmd: z.literal('add'), text: z.string().min(1).max(120) }).strict(),
  z.object({ cmd: z.literal('edit'), factId, text: z.string().min(1).max(120) }).strict(),
  z.object({ cmd: z.literal('setPrivate'), factId, private: z.boolean() }).strict(),
  z.object({ cmd: z.literal('setKind'), factId, kind: z.enum(MEMORY_KINDS) }).strict(),
  // M6 T5: `chipId` = the ✕ on a memory chip (the forget is then activity `forgot_facts`, G-M6-10).
  z.object({ cmd: z.literal('forget'), factId, chipId: z.string().min(1).max(80).optional() }).strict(),
  z.object({ cmd: z.literal('undo'), undoToken: z.string().min(1).max(80) }).strict(),
  z.object({ cmd: z.literal('forgetBySource'), source: z.enum(MEMORY_ORIGINS), confirm: z.literal(true) }).strict(),
  z.object({ cmd: z.literal('forgetAll'), typed: z.literal('FORGET') }).strict(),
]);
export type MemoryCmdPayload = z.infer<typeof memoryCmdSchema>;

// ---- main → engine (08-1 §2.4 MainToEngine, the rows M3, M4 and M6 use) ----
export type AiCmd = 'detect' | 'verify' | 'choose' | 'signIn';
export const mainToEngineSchema = z.discriminatedUnion('kind', [
  z.object({ id: z.string(), kind: z.literal('user.message'), payload: z.object({ messageId: z.string(), chatId: z.string() }).strict() }),
  z.object({ id: z.string(), kind: z.literal('net'), payload: z.object({ online: z.boolean() }).strict() }),
  z.object({
    id: z.string(),
    kind: z.literal('settings.changed'),
    // G-M4-13: on the first settings.changed after a fork main adds what it decided from launches.json (08-1 §2.2 step 1).
    payload: z
      .object({
        paths: z.array(z.string()),
        settings: z.unknown(),
        launch: z.object({ safeMode: z.boolean(), cleanStart: z.boolean() }).strict().optional(),
      })
      .strict(),
  }),
  z.object({
    id: z.string(),
    kind: z.literal('ai.cmd'),
    payload: z
      .object({
        cmd: z.enum(['detect', 'verify', 'choose', 'signIn']),
        providerId: z.enum(PROVIDER_IDS).optional(),
        backup: z.enum(PROVIDER_IDS).nullable().optional(),
      })
      .strict(),
  }),
  // M4 (08-1 §2.4; CR-0008). `card.answered` carries the card's answer (08-4 §25.1 CardAnswer) or, for the M4 cards that
  // answer with one named choice (plan go|change, stuck other_way|take_over|stop, recovery resume|stop, error fix), `choice`.
  z.object({
    id: z.string(),
    kind: z.literal('card.answered'),
    payload: z
      .object({
        cardId: z.string(),
        choice: z.string().optional(),
        text: z.string().optional(),
        answer: cardAnswerSchema.optional(),
        resolvedBy: z.enum(RESOLVED_BY),
      })
      .strict(),
  }),
  z.object({
    id: z.string(),
    kind: z.literal('job.stop'),
    payload: z.object({ jobId: z.string(), by: z.enum(['user', 'system']), reason: z.enum(STOP_REASONS) }).strict(),
  }),
  z.object({ id: z.string(), kind: z.literal('job.stopAll'), payload: z.object({ by: z.literal('user') }).strict() }),
  /** X-124 + G-M4-01: main allocates the new job's id (job:retry replies `{ newJobId }`); the old job never moves. */
  z.object({ id: z.string(), kind: z.literal('job.retry'), payload: z.object({ jobId: z.string(), newJobId: z.string() }).strict() }),
  z.object({
    id: z.string(),
    kind: z.literal('power'),
    payload: z.object({ event: z.enum(['suspend', 'resume', 'lock', 'unlock', 'on-ac', 'on-battery', 'shutdown']) }).strict(),
  }),
  /** G-M4-04: 08-1 §2.3 steps 4–5. A request: the engine answers `{ re, result: ok({ paused: jobIds }) }` before main exits. */
  z.object({
    id: z.string(),
    kind: z.literal('jobs.pauseAll'),
    payload: z.object({ reason: z.enum(['app_quit', 'windows_shutdown']) }).strict(),
  }),
  /** Not in 08-1 §2.4 (gap, implementation-notes "M3"): 04 §19.4 "Try again" on a cut-off foo reply re-runs its turn. */
  z.object({ id: z.string(), kind: z.literal('reply.retry'), payload: z.object({ messageId: z.string() }).strict() }),
  z.object({ id: z.string(), kind: z.literal('reply.stop'), payload: z.object({ chatId: z.string() }).strict() }),
  // FOO_TEST runs only (08-3 §22): the engine's fake clock follows main's, and test:reset cancels every turn.
  z.object({ id: z.string(), kind: z.literal('test.reset'), payload: z.object({}).strict() }),
  z.object({ id: z.string(), kind: z.literal('test.clock'), payload: z.object({ now: z.number() }).strict() }),
  // M5 (CR-0009): main tells the engine an approval moved; the SecretRegistry mirror (X-93: values live in main and engine
  // memory only, never logged); a typed code reaches the engine as a registry handle, never the code.
  z.object({
    id: z.string(),
    kind: z.literal('approval.changed'),
    payload: z.object({ approvalId: z.string(), state: ApprovalStateSchema }).strict(),
  }),
  z.object({
    id: z.string(),
    kind: z.literal('registry:add'),
    payload: z
      .object({
        handle: z.string(),
        hash: z.string(),
        len: z.number().int().min(1),
        value: z.string().min(1),
        normalised: z.array(z.string()),
        ttlMs: z.number().int().min(0),
      })
      .strict(),
  }),
  z.object({ id: z.string(), kind: z.literal('registry:remove'), payload: z.object({ handles: z.array(z.string()) }).strict() }),
  z.object({ id: z.string(), kind: z.literal('code.submit'), payload: z.object({ requestId: z.string(), codeRef: z.string() }).strict() }),
  // M5 T14 (CR-0009 G-M5-39 (b); 08-2 §9.6, 08-0 §G.7): main's Draft tick asks for the second look before Gmail drafts.send;
  // the engine answers `{ pass, result, held? }` (a request, like ai.cmd). `content` is the card text, redacted.
  z.object({
    id: z.string(),
    kind: z.literal('draft.secondLook'),
    payload: z
      .object({ approvalId: z.string(), content: z.string().max(50_000), recipients: z.array(z.string().max(320)).max(50) })
      .strict(),
  }),
  /** M6 (CR-0010 G-M6-01): a request; the engine answers `{ re, result }` with the invoke's response type. */
  z.object({ id: z.string(), kind: z.literal('memory.cmd'), payload: memoryCmdSchema }),
  /** M6: FOO_TEST only. Runs `memory.tidy()` now (M7 schedules it at 03:00, G-M6-09). */
  z.object({ id: z.string(), kind: z.literal('test.memoryTidy'), payload: z.object({}).strict() }),
  /** M4: FOO_TEST only. The engine's runner moves a job by the named machine event (test:jobState, 08-3 §22). */
  z.object({
    id: z.string(),
    kind: z.literal('test.jobEvent'),
    payload: z.object({ jobId: z.string(), event: z.string() }).strict(),
  }),
  // M8 (CR-0012, landed by the lead so T2 and T3 share one row): 08-1 §2.4 `connection.cmd` and `bridge.port`. The port itself
  // travels as the message's transferred MessagePort; the payload is empty.
  z.object({
    id: z.string(),
    kind: z.literal('connection.cmd'),
    payload: z
      .object({
        target: z.enum(['google', 'outlook', 'whatsapp']),
        cmd: z.enum(['connect', 'reconnect', 'disconnect', 'linkStart', 'linkCancel', 'unlink']),
        connectionId: z.string().optional(),
        scopes: z.array(z.enum(['gmail', 'gcal', 'contacts'])).optional(),
      })
      .strict(),
  }),
  z.object({ id: z.string(), kind: z.literal('bridge.port'), payload: z.object({}).strict() }),
]);
export type MainToEngine = z.infer<typeof mainToEngineSchema>;

// ---- engine → main ----
/** 08-1 §2.4.1 WritableTable (the members built so far). `activity` is written only through op `activity`. */
export const WRITABLE_TABLES = [
  'messages',
  'ai_turns',
  'reactions',
  'jobs',
  'steps',
  'tool_calls',
  'cards',
  // M6 (CR-0010; 08-1 §2.5): the index follows the files; main rebuilds memory_fts in the same tx
  'memory_index',
  'memory_tombstones',
  'memory_uses',
  'memory_group_grants',
  // M6 T7 (08-1 §2.4.1 lists both): the budget's held items (08-3 §15.6) and the never-offer-twice keys (§15.7).
  'held_items',
  'suggestions',
] as const;
/** Tables the `delete` op takes, with the id each uses: reactions `{messageId}|{by}`, memory_index the fact id,
 * memory_tombstones `{hash}|{originKind}`, memory_group_grants `{factId}|{chatId}`. */
export const DELETE_TABLES = ['reactions', 'memory_index', 'memory_tombstones', 'memory_group_grants'] as const;
export type DeleteTable = (typeof DELETE_TABLES)[number];
export type WritableTable = (typeof WRITABLE_TABLES)[number];
/** Tables with a `state` column the `transition` op moves (08-1 §2.4.1 names jobs, routines, steps; CR-0008 adds cards). */
export const TRANSITION_TABLES = ['jobs', 'steps', 'cards'] as const;
export type TransitionTable = (typeof TRANSITION_TABLES)[number];
export const MIRROR_KINDS = ['job_state', 'plan_md'] as const;
export type MirrorKind = (typeof MIRROR_KINDS)[number];

/** `activity` op row: ActivityRow without id and at (main sets both, 08-1 §2.4.1). */
export type ActivityOpRow = Omit<ActivityRow, 'id' | 'at' | 'fields'> & { fields?: Record<string, unknown> | null };

/**
 * 08-1 §2.4.1 DbOp. Rows use the DB column names (snake_case); the activity row is camelCase (ActivityRow). Main fills `seq`,
 * `rev`, `updated_at` and the chat's derived columns (§4.6 rule 7). `jobs.state` moves only by `transition` (Art. 12).
 */
export type DbOp =
  | { op: 'insert'; table: WritableTable; row: Record<string, unknown>; redact?: string[] }
  | { op: 'update'; table: WritableTable; id: string; set: Record<string, unknown>; expectRev?: number }
  | { op: 'transition'; table: TransitionTable; id: string; from: string[]; to: string; set?: Record<string, unknown> }
  | { op: 'delete'; table: DeleteTable; id: string }
  | { op: 'activity'; row: ActivityOpRow }
  | { op: 'mirror'; kind: MirrorKind; id: string; text: string };

const activityRowSchema = z
  .object({
    kind: z.enum(['sent', 'paid', 'booked', 'deleted', 'connected', 'stopped', 'changed']),
    event: z.string(),
    actor: z.string(),
    chatId: z.string().nullable(),
    chatTitle: z.string().nullable(),
    jobId: z.string().nullable(),
    approvalId: z.string().nullable(),
    paymentId: z.string().nullable(),
    routineId: z.string().nullable(),
    summary: z.string(),
    toLabel: z.string().nullable(),
    fromLabel: z.string().nullable(),
    amountPaise: z.number().nullable(),
    approvedHow: z.enum(['card_once', 'card_chat', 'card_always', 'rule', 'hello', 'typed_amount', 'user', 'none']).nullable(),
    ruleText: z.string().nullable(),
    proofKind: z.string().nullable(),
    proofRef: z.string().nullable(),
    outcome: z.enum(['done', 'failed', 'unknown']),
    fields: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .strict();

const dbOpSchema = z.discriminatedUnion('op', [
  z
    .object({
      op: z.literal('insert'),
      table: z.enum(WRITABLE_TABLES),
      row: z.record(z.string(), z.unknown()),
      redact: z.array(z.string()).optional(),
    })
    .strict(),
  z
    .object({
      op: z.literal('update'),
      table: z.enum(WRITABLE_TABLES),
      id: z.string(),
      set: z.record(z.string(), z.unknown()),
      expectRev: z.number().optional(),
    })
    .strict(),
  z
    .object({
      op: z.literal('transition'),
      table: z.enum(TRANSITION_TABLES),
      id: z.string(),
      from: z.array(z.string()).min(1),
      to: z.string(),
      set: z.record(z.string(), z.unknown()).optional(),
    })
    .strict(),
  z.object({ op: z.literal('delete'), table: z.enum(DELETE_TABLES), id: z.string() }).strict(),
  z.object({ op: z.literal('activity'), row: activityRowSchema }).strict(),
  z.object({ op: z.literal('mirror'), kind: z.enum(MIRROR_KINDS), id: z.string(), text: z.string() }).strict(),
]);

/** 08-1 §2.4.1: exactly the exported keys of src/main/db/queries.ts (a test holds the two lists equal). */
export const NAMED_QUERY_NAMES = [
  'chatOpen',
  'messagesBefore',
  'messageById',
  'messagesQueued',
  'helpers.byId',
  // M4
  'jobById',
  'jobsByState',
  'stepsForJob',
  'toolCallsForJob',
  'toolCallsUnknown',
  'activityForJob',
  'cardsOpenForChat',
  'cardById',
  'approvalsOpenForJob',
  'monthAiSpend',
  'jobs.liveForChat',
  'cards.openForChat',
  // M4 T4: foo's chat for the safe-mode card (08-2 §5.9 step 1).
  'chats.foo',
  // M4 T3: the watchdog's budget ceiling (08-4 §26.3 item 6, "counts come from the DB").
  'stepTurnsForJob',
  // M5 T7: one approval by id (approval.changed after an engine restart, when the runner holds nothing in RAM).
  'approvals.byId',
  // M6 (CR-0010): memory. The four 08-1 §2.4.1 names (memoryByScope, memorySearch, memoryTombstoned, memoryUsedInChat) plus
  // the reads the store needs; T4 owns the retrieval bodies (memoryByScope, memorySearch) in src/main/db/queries.ts.
  'memory.byId',
  'memory.byFile',
  'memory.all',
  'memoryTombstoned',
  'memory.tombstones',
  'memoryByScope',
  'memorySearch',
  'memory.weekCount',
  'memoryUsedInChat',
  // M6 T7: the never-offer-twice state (08-1 §2.4.1 `suggestionState`), a helper's 1:1 chat (askShare's card, 08-3 §12.5.1)
  // and the user's recent texts in a chat with their count (style stats, §12.9).
  'suggestionState',
  'chats.forHelper',
  'messages.userTexts',
] as const;
export type NamedQuery = (typeof NAMED_QUERY_NAMES)[number];

export interface UiPatch<E extends EventChannel = EventChannel> {
  event: E;
  payload: EventPayload[E];
}

export const engineToMainSchema = z.discriminatedUnion('kind', [
  z.object({ id: z.string(), kind: z.literal('db.tx'), payload: z.object({ ops: z.array(dbOpSchema).min(1) }).strict() }),
  z.object({
    id: z.string(),
    kind: z.literal('db.query'),
    payload: z.object({ q: z.enum(NAMED_QUERY_NAMES), args: z.array(z.unknown()) }).strict(),
  }),
  z.object({
    id: z.string(),
    kind: z.literal('ui.patch'),
    payload: z.object({ event: z.string(), payload: z.unknown() }).strict(),
  }),
  z.object({
    id: z.string(),
    kind: z.literal('log'),
    payload: z
      .object({
        t: z.number(),
        lvl: z.enum(['info', 'warn', 'error', 'debug']),
        mod: z.string(),
        evt: z.string(),
        kind: z.string().optional(),
        ms: z.number().optional(),
        ids: z.object({ chatId: z.string().optional(), jobId: z.string().optional() }).strict().optional(),
      })
      .strict(),
  }),
  /** M6 (08-1 §2.4; 08-3 §12.2): a request. Main writes `{DATA}/{relPath}` (temp + rename); only `memory/**.md`,
   * `memory/.tombstones`, `memory/.tidy-log.md` and `helpers/{h_id}/notes.md` (else PATH_NOT_ALLOWED). Answers `ok({})`. */
  z.object({
    id: z.string(),
    kind: z.literal('file.write'),
    payload: z.object({ relPath: z.string().min(1).max(260), text: z.string(), atomic: z.literal(true) }).strict(),
  }),
  /** 09 §9.22: main holds powerSaveBlocker('prevent-app-suspension') while `on` (a job is WORKING). */
  z.object({
    id: z.string(),
    kind: z.literal('power.keepAwake'),
    payload: z.object({ on: z.boolean(), jobCount: z.number().int().min(0) }).strict(),
  }),
  /** 08-3 §15 NotificationRequest; main stubs it (logs only) until M11 builds toasts. */
  z.object({
    id: z.string(),
    kind: z.literal('notify'),
    payload: z
      .object({
        kind: z.enum([
          'choice',
          'approval',
          'payment',
          'signin',
          'done',
          'routine',
          'brief',
          'stuck',
          'error',
          'reply',
          'reminder',
          'summary',
        ]),
        chatId: z.string(),
        title: z.string(),
        body: z.string(),
        buttons: z.array(z.object({ label: z.string(), action: z.record(z.string(), z.unknown()) }).strict()).optional(),
        prompted: z.boolean(),
        urgent: z.boolean().optional(),
        ref: z.string().optional(),
      })
      .strict(),
  }),
  // M5 (CR-0009). Requests: approval.open → { approvalId, cardId, nonce } (ApprovalGate.create, T4); approval.transition →
  // { ok: true } or APPROVAL_BAD_TRANSITION (08-2 §9.1; no ack in 2 s = HELD(cannot_check), 08-4 §29.1); vault.use → the
  // value, to the engine filler only (08-2 §11.3; VAULT_PURPOSE_DENIED, VAULT_MISSING).
  // M5 T7 (lead-approved edit): the job and the card text ride with the verified draft (ApprovalGate.openFromEngine, T4 hand-off).
  z.object({
    id: z.string(),
    kind: z.literal('approval.open'),
    payload: z
      .object({
        jobId: z.string(),
        draft: ApprovalDraftSchema,
        title: z.string(),
        impact: z.string(),
        submitRef: z.string().max(64).optional(),
        // M5 T8 (lead edit): the approval this card replaces (a steer or changed terms); main sets its superseded_by.
        supersedes: z.string().optional(),
      })
      .strict(),
  }),
  z.object({
    id: z.string(),
    kind: z.literal('approval.transition'),
    payload: z
      .object({
        approvalId: z.string(),
        to: ApprovalStateSchema,
        data: z
          .object({
            submittedAt: z.number().optional(),
            paymentState: z.enum(['submitted', 'checking', 'succeeded', 'failed']).optional(),
            // M5 T8 (lead edit): the second look's result (approvals.second_look, 08-0 §B.3) and what the card shows for a
            // HELD or SUPERSEDED move (ApprovalPayload.held / .superseded, 05-2 §5.5.4, 08-4 §28.6).
            secondLook: z
              .object({
                at: z.number(),
                deterministic: z.object({ ok: z.boolean(), mismatches: z.array(z.string()) }).strict(),
                ai: z.object({ ok: z.boolean(), note: z.string() }).strict().optional(),
                turnId: z.string().optional(),
                held: z
                  .object({
                    field: z.enum(['recipient', 'amount', 'date', 'time', 'item', 'people', 'place']),
                    userSaid: z.string(),
                    actionHas: z.string(),
                  })
                  .strict()
                  .optional(),
              })
              .strict()
              .optional(),
            held: z
              .object({
                reason: z.enum(['mismatch', 'cannot_check', 'no_user_words']),
                userSaid: z.string().optional(),
                actionHas: z.string().optional(),
                verbing: z.string().optional(),
              })
              .strict()
              .optional(),
            superseded: z.enum(['price', 'time', 'recipient', 'fee', 'steer']).optional(),
          })
          .strict()
          .optional(),
      })
      .strict(),
  }),
  z.object({
    id: z.string(),
    kind: z.literal('vault.use'),
    payload: z
      .object({
        purpose: z.enum(['fill_login', 'fill_card', 'ai_call', 'connector_refresh', 'wa_session', 'voice_call', 'web_tool', 'hub_call']),
        name: z.string().min(1),
        jobId: z.string().optional(),
        approvalId: z.string().optional(),
      })
      .strict(),
  }),
  /** The engine's answer to `ai.cmd`: main stores the chosen/verified provider in settings.json (main owns settings). */
  z.object({
    id: z.string(),
    kind: z.literal('ai.state'),
    payload: z
      .object({
        providers: z.record(
          z.string(),
          z.object({ kind: z.enum(['plan', 'key', 'local']), lastVerifiedAt: z.number().optional(), lastVerifyOk: z.boolean().optional() }),
        ),
        primary: z.enum(PROVIDER_IDS).nullable().optional(),
        backup: z.enum(PROVIDER_IDS).nullable().optional(),
      })
      .strict(),
  }),
]);
export type EngineToMain = z.infer<typeof engineToMainSchema>;
export type DbTxReply = { ids: string[]; revs: number[] };

/** The engine side of the port (in production a MessagePort; in tests a direct call into main's handlers). */
export interface MainLink {
  request<T>(
    kind: 'db.tx' | 'db.query' | 'file.write' | 'approval.open' | 'approval.transition' | 'vault.use',
    payload: unknown,
  ): Promise<Result<T>>;
  send(kind: 'ui.patch' | 'log' | 'ai.state' | 'power.keepAwake' | 'notify', payload: unknown): void;
}

export interface EngineSettingsView {
  settings: Settings;
  aiStatus: AiStatus;
}

export type { ProviderId, ErrorKind };
