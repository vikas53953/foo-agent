// Spec: 08-4 §25.1 (shared act types: PlanStep, ChoiceCardSpec), §25.2 (IntakeAct), §25.2a (GroupIntakeAct, GroupMemberAct),
// §25.4 (SecondLookAct, RewriteAct, StuckAct), 08-2 §7.3/§7.4 (`<act>` parsed with zod, unknown fields rejected, objects
// strict), 08-4 §24.4 ({schemaJson} is the JSON Schema of the purpose's zod schema), 08-0 §B.2 (Route, ConnectorApp),
// 08-3 §13.2 (RoutineDraft), 08-0 §E.9 (`src/shared/schemas.ts`); M5 (CR-0009): ApprovalFields (08-2 §9.3), ApprovalDraft
// (08-4 §25.1, X-125).
import { z } from 'zod';

/** 08-0 §B.2 `Route` (X-125). */
export const RouteSchema = z.enum(['api', 'browser', 'screen', 'email', 'handback']);
/** 08-0 §B.2 `ConnectorApp`. */
export const ConnectorAppSchema = z.enum(['gmail', 'gcal', 'contacts', 'whatsapp', 'x', 'outlook']);
/** 08-0 §E.8 / 08-4 §27.3: the cloud web-tool providers that take the user's own key (X-46; vault `foo/web_key/{p}`, G-M9-13). */
export const WebProviderSchema = z.enum(['exa', 'tavily', 'firecrawl', 'browseruse']);
/**
 * M9 (CR-0013 G-M9-10): the `signin` card's `reason` is a closed enum of the six 05-3 §5.10.2 lanes; `mode` is `take_over`
 * for captcha / passkey / bank_3ds / known_puzzle and `sign_in_here` for the rest (`signInModeOf`).
 */
export const SignInReasonSchema = z.enum(['sign_in', 'captcha', 'passkey', 'bank_3ds', 'known_puzzle', 'saved_login_failed']);
const TAKE_OVER_LANES: ReadonlySet<z.infer<typeof SignInReasonSchema>> = new Set(['captcha', 'passkey', 'bank_3ds', 'known_puzzle']);
export const signInModeOf = (reason: z.infer<typeof SignInReasonSchema>): 'sign_in_here' | 'take_over' =>
  TAKE_OVER_LANES.has(reason) ? 'take_over' : 'sign_in_here';

/**
 * `PhraseKey` = keyof PHRASES (08-4 §26.1, `src/shared/phrases.ts`, M4). 08-2 §5.3.3: a key missing from the catalogue is
 * replaced by the runner with `generic_working`, so the wire accepts any non-empty string here (an unknown key is not a
 * repair). TODO(M4): narrow once phrases.ts exists, keeping the runner's fallback.
 */
export const PhraseKeySchema = z.string().min(1).max(40);

/** 08-4 §25.1 `PlanStep`. */
export const PlanStepSchema = z
  .object({
    phraseKey: PhraseKeySchema,
    slots: z.record(z.string(), z.string()),
    route: RouteSchema,
  })
  .strict();

/** 08-4 §25.1 `ChoiceCardSpec`: what the AI writes; the engine adds ids and decides `reversible` (§26.7). */
export const ChoiceCardSpecSchema = z
  .object({
    question: z.string().min(1).max(90),
    options: z
      .array(z.object({ label: z.string().min(1).max(40), detail: z.string().max(60).optional() }).strict())
      .min(2)
      .max(4),
    multi: z.boolean().optional(),
    reversible: z.boolean().optional(),
  })
  .strict();

// 08-3 §13.2 RoutineDraft and its parts. ToolName (08-2 §8.2 / 08-4 §27.1) and BuiltinTask (08-5 §4.3) arrive with M4 / M10:
// TODO(M10, routines): narrow `tools` to ToolName.
const ScheduleSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('interval'), everyMin: z.number(), anchor: z.number() }).strict(),
  z
    .object({
      kind: z.literal('daily'),
      at: z.string().regex(/^\d{2}:\d{2}$/),
      days: z.array(z.union([0, 1, 2, 3, 4, 5, 6].map((n) => z.literal(n)) as [z.ZodLiteral<0>, ...z.ZodLiteral<number>[]])),
    })
    .strict(),
  z.object({ kind: z.literal('monthly'), day: z.number().int(), at: z.string().regex(/^\d{2}:\d{2}$/) }).strict(),
  z.object({ kind: z.literal('once'), at: z.number() }).strict(),
  z
    .object({
      kind: z.literal('on_email'),
      connectionId: z.string(),
      match: z.object({ fromDomain: z.string().optional(), subjectAny: z.array(z.string()).optional() }).strict(),
    })
    .strict(),
]);
const FastPathSchema = z
  .object({ kind: z.literal('page_number'), url: z.string(), selectorHint: z.string(), parse: z.enum(['inr', 'number']) })
  .strict();
const ConditionSchema = z
  .object({
    metric: z.enum(['price_inr', 'number', 'text', 'count', 'status']),
    op: z.enum(['<', '<=', '>', '>=', '==', 'changed', 'found']),
    value: z.union([z.number(), z.string()]).optional(),
    unit: z.string().optional(),
  })
  .strict();
const RoutineTaskSchema = z
  .object({
    prompt: z.string(),
    tools: z.array(z.string()),
    site: z.string().optional(),
    fastPath: FastPathSchema.optional(),
    // `builtin` (08-5 §4.3) is set only on engine-made routines (08-3 §13.7a), never by the AI, so it is not accepted here.
  })
  .strict();
/** 08-3 §13.2 `RoutineDraft` (limits such as everyMin ≥ 15 and title ≤ 40 are the engine's checks, §13.2.1, not zod's). */
export const RoutineDraftSchema = z
  .object({
    title: z.string(),
    whatText: z.string(),
    task: RoutineTaskSchema,
    schedule: ScheduleSchema,
    tz: z.string(),
    conditionText: z.string().optional(),
    condition: ConditionSchema.optional(),
    urgentText: z.string().optional(),
    whereChatId: z.string(),
    deliverToast: z.boolean(),
  })
  .strict();

const Emoji = z.enum(['👍', '❤️']);

/** 08-4 §25.2 `IntakeDecision`. */
export const IntakeDecisionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('reply') }).strict(),
  z.object({ kind: z.literal('react'), emoji: Emoji }).strict(),
  z.object({ kind: z.literal('ask'), card: ChoiceCardSpecSchema }).strict(),
  z.object({ kind: z.literal('handoff'), helperId: z.string().min(1), task: z.string().min(1).max(120) }).strict(),
  z
    .object({
      kind: z.literal('job'),
      title: z.string().max(60),
      plan: z.array(PlanStepSchema).min(1).max(12),
      estimate: z.object({ minutes: z.number().optional(), tokens: z.number().optional() }).strict().optional(),
      routeHint: z.array(RouteSchema),
      needsApps: z.array(ConnectorAppSchema),
    })
    .strict(),
  z.object({ kind: z.literal('routine'), draft: RoutineDraftSchema }).strict(),
  z.object({ kind: z.literal('memory'), op: z.enum(['remember', 'forget']), text: z.string().min(1).max(200) }).strict(),
  // §25.6: the path and value are checked by the engine against 08-0 §A.3, not by zod.
  z.object({ kind: z.literal('setting'), path: z.string().min(1), value: z.unknown() }).strict(),
  z
    .object({
      kind: z.literal('catch_up'),
      source: z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('wa_group'), chatId: z.string().min(1) }).strict(),
        z.object({ kind: z.literal('gmail') }).strict(),
      ]),
      sinceHint: z.string().optional(),
    })
    .strict(),
]);

/** 08-4 §25.2 `IntakeAct`: the `<act>` of purpose `intake` in 1:1 and helper chats (no `lang` field, §25.7). */
export const IntakeActSchema = z
  .object({
    decision: IntakeDecisionSchema,
    usedMemoryIds: z.array(z.string()),
    tags: z.array(z.literal('intent_capabilities')).optional(),
  })
  .strict();

/** 08-4 §25.2a `GroupIntakeAct` (intake when chats.kind = 'group'; prompts arrive with M13). */
export const GroupIntakeActSchema = z
  .object({
    decision: z.discriminatedUnion('kind', [
      z
        .object({
          kind: z.literal('group_route'),
          ownerHelperId: z.string().min(1),
          parts: z.array(z.object({ helperId: z.string().min(1), task: z.string().min(1) }).strict()),
        })
        .strict(),
      z.object({ kind: z.literal('reply'), helperId: z.string().min(1) }).strict(),
    ]),
    usedMemoryIds: z.array(z.string()),
  })
  .strict();

/** 08-4 §25.2a `GroupMemberAct`. */
export const GroupMemberActSchema = z
  .object({
    decision: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('reply') }).strict(),
      z.object({ kind: z.literal('react'), emoji: Emoji }).strict(),
      z.object({ kind: z.literal('handoff_accept'), task: z.string().min(1) }).strict(),
    ]),
  })
  .strict();

const SecondLookField = z.enum(['recipient', 'amount', 'date', 'time', 'item', 'people', 'place']);
/** 08-4 §25.4 `SecondLookAct`. */
export const SecondLookActSchema = z.union([
  z.object({ match: z.literal(true) }).strict(),
  z.object({ match: z.literal(false), field: SecondLookField, userSaid: z.string().max(60), actionHas: z.string().max(60) }).strict(),
]);

/** 08-4 §25.4 `RewriteAct`: an empty object; the rewritten text is the `<say>`. */
export const RewriteActSchema = z.object({}).strict();

/** 08-4 §25.4 `StuckAct` (purpose `classify`). */
export const StuckActSchema = z.object({ whatsWrong: z.string().min(1).max(80) }).strict();

/** CR-0045 (X-203) 08-4 §24.13a `SteerCheckAct` (purpose `classify`): is a message to a waiting job about that job? */
export const SteerCheckActSchema = z.object({ about: z.enum(['job', 'new']) }).strict();

/** 08-2 §5.8 `Proof` plus `read_source` (08-0 §B.3, G2-8). The runner checks it against recorded tool results (§26.11). */
export const ProofSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('confirmation'),
      code: z.string().min(1).max(80),
      site: z.string().max(80),
      screenshot: z.string().optional(),
      seenInToolCallId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal('email'),
      connectionId: z.string(),
      messageId: z.string(),
      from: z.string(),
      subject: z.string(),
    })
    .strict(),
  z.object({ kind: z.literal('sent_folder'), connectionId: z.string(), messageId: z.string() }).strict(),
  z.object({ kind: z.literal('wa_delivered'), waMessageId: z.string() }).strict(),
  z.object({ kind: z.literal('calendar_event'), eventId: z.string() }).strict(),
  z.object({ kind: z.literal('emails_read'), count: z.number().int().min(0), messageIds: z.array(z.string()) }).strict(),
  z.object({ kind: z.literal('screenshot'), path: z.string(), stepId: z.string() }).strict(),
  z.object({ kind: z.literal('receipt'), paymentId: z.string(), ref: z.string(), screenshot: z.string().optional() }).strict(),
  z
    .object({
      kind: z.literal('read_source'),
      app: z.enum(['whatsapp', 'gmail']),
      sourceKey: z.string(),
      label: z.string(),
      count: z.number().int().min(0),
      since: z.number(),
      until: z.number(),
    })
    .strict(),
]);

/** 08-4 §25.1 `ToolCall`: the engine adds the idem key (X-113); the AI never sends it. Args are checked per tool (§27.1). */
export const ToolCallSchema = z.object({ tool: z.string().min(1).max(60), args: z.unknown() }).strict();

/** 08-4 §25.3 `StepDecision`. `fail.alternative` is a FixAction; the runner keeps only retry / open_url / dismiss (M4 pack). */
export const StepDecisionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('tool'), call: ToolCallSchema, why: z.string().max(120) }).strict(),
  z.object({ kind: z.literal('step_done'), idx: z.number().int().min(0) }).strict(),
  z.object({ kind: z.literal('replan'), steps: z.array(PlanStepSchema).min(1).max(12) }).strict(),
  z.object({ kind: z.literal('ask'), card: ChoiceCardSpecSchema }).strict(),
  // TODO(M5): ApprovalDraft (§25.1, 08-2 §9.3) is checked by the gate; M4 has no gate, so the draft is not read yet.
  z.object({ kind: z.literal('request_approval'), draft: z.record(z.string(), z.unknown()), submitRef: z.string().optional() }).strict(),
  z
    .object({
      kind: z.literal('done'),
      result: z.string().max(600),
      proof: ProofSchema.optional(),
      unverified: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('fail'),
      reason: z.string().max(200),
      alternative: z.object({ kind: z.string() }).catchall(z.unknown()).optional(),
    })
    .strict(),
]);

/** 08-4 §25.3 `StepAct` (purpose `step`). */
export const StepActSchema = z
  .object({
    decision: StepDecisionSchema,
    steer: z.array(z.object({ messageId: z.string(), effect: z.enum(['folded', 'answered', 'restart', 'new_job']) }).strict()).optional(),
    usedMemoryIds: z.array(z.string()),
  })
  .strict();

export type PlanStep = z.infer<typeof PlanStepSchema>;
export type Proof = z.infer<typeof ProofSchema>;
export type ToolCallAct = z.infer<typeof ToolCallSchema>;
export type StepDecision = z.infer<typeof StepDecisionSchema>;
export type StepAct = z.infer<typeof StepActSchema>;

// M5 (CR-0009): approval verbs and states, ApprovalFields (08-2 §9.3) and the AI's ApprovalDraft (X-125).
/** 08-0 §B.2 ApprovalVerb (X-55). */
export const ApprovalVerbSchema = z.enum(['send', 'book', 'buy', 'pay', 'post', 'delete', 'share', 'switch', 'use_app', 'calendar_write']);
/** 08-0 §B.2 ApprovalState (UPPER values, SM-A13). */
export const ApprovalStateSchema = z.enum([
  'PENDING',
  'APPROVED',
  'RUNNING',
  'COMPLETED',
  'HELD',
  'CHECKING',
  'DECLINED',
  'EXPIRED',
  'SUPERSEDED',
  'WITHDRAWN',
  'FAILED',
]);
/** 08-2 §9.3 `ApprovalFields` (strict: unknown fields never reach the hash or the card text). */
export const ApprovalFieldsSchema = z
  .object({
    verb: ApprovalVerbSchema,
    channel: z.enum(['email', 'whatsapp', 'web', 'x']).optional(),
    recipients: z
      .array(
        z
          .object({
            name: z.string(),
            address: z.string(),
            isNew: z.boolean(),
            isGroup: z.boolean(),
            groupSize: z.number().int().min(0).optional(),
          })
          .strict(),
      )
      .optional(),
    payee: z.string().optional(),
    siteDomain: z.string().optional(),
    amountPaise: z.number().int().min(0).optional(),
    lines: z.array(z.object({ label: z.string(), amountPaise: z.number().int() }).strict()).optional(),
    currency: z.literal('INR').optional(),
    when: z.object({ start: z.number(), end: z.number().optional(), tz: z.string() }).strict().optional(),
    partySize: z.number().int().min(1).optional(),
    item: z.string().optional(),
    personalShared: z.array(z.enum(['name', 'email', 'phone', 'address'])).optional(),
    cancelTerms: z
      .object({ freeUntil: z.number().optional(), feePaise: z.number().int().min(0).optional(), refundable: z.boolean() })
      .strict()
      .optional(),
    contentSummary: z.string().max(400).optional(),
    irreversible: z.boolean(),
    // M5 T4 (G-M5-24): the app of a `use_app` approval, which its "For this chat" / "Always" rule matches (08-5 §3.3).
    app: z.enum(['gmail', 'calendar', 'contacts', 'whatsapp', 'browser', 'outlook']).optional(),
  })
  .strict();
/** 08-0 §B.3 / 08-4 §25.1 `ApprovalDraft`: verb is ApprovalDraftVerb only (X-125: no `send`; a send is a Draft card). */
export const ApprovalDraftSchema = z
  .object({
    verb: z.enum(['book', 'buy', 'pay', 'delete']),
    fields: ApprovalFieldsSchema,
    evidence: z.array(
      z
        .object({
          field: ApprovalFieldsSchema.keyof(),
          toolCallId: z.string().min(1),
          quote: z.string().max(200),
          ref: z.string().optional(),
        })
        .strict(),
    ),
  })
  .strict();

export type IntakeAct = z.infer<typeof IntakeActSchema>;
export type IntakeDecision = z.infer<typeof IntakeDecisionSchema>;
export type ChoiceCardSpecAct = z.infer<typeof ChoiceCardSpecSchema>;
export type SecondLookAct = z.infer<typeof SecondLookActSchema>;
export type RewriteAct = z.infer<typeof RewriteActSchema>;
export type StuckAct = z.infer<typeof StuckActSchema>;
export type SteerCheckAct = z.infer<typeof SteerCheckActSchema>;
export type GroupIntakeAct = z.infer<typeof GroupIntakeActSchema>;
export type GroupMemberAct = z.infer<typeof GroupMemberActSchema>;

/**
 * 08-4 §24.4 `{schemaJson}`: the JSON Schema of a zod schema. Pick: zod 4's built-in `z.toJSONSchema` (zod-to-json-schema
 * does not support zod 4) with `target: 'draft-7'` and every reused schema inlined (the spec's `$refStrategy: "none"`),
 * serialised with `JSON.stringify` (no spaces).
 */
export function schemaJson(schema: z.ZodType): string {
  return JSON.stringify(z.toJSONSchema(schema, { target: 'draft-7', reused: 'inline', unrepresentable: 'any' }));
}
