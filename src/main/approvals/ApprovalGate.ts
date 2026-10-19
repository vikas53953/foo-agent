// Spec: 08-2 §9.1 (only main's ApprovalGate writes `approvals.state`; the engine requests transitions and main checks them
// against the table, else APPROVAL_BAD_TRANSITION, logged; expiry per verb; timers run in main), §9.5 (scopes and rules),
// §9.7 (`ApprovalGate.create | approve | transition | expireTick`), §5.7 step 3 (a stopped job's open approvals →
// WITHDRAWN), 07-2 §5 + SM-A4…A9, A13 (the machine, src/shared/approvalMachine.ts), 08-1 §3.2 (`card:approve | decline |
// askAgain | heldPick`; CARD_STALE, CARD_EXPIRED, SCOPE_NOT_ALLOWED), §4.5.1 (an approval card's `cards.state` mirrors its
// approvals row, in the same transaction), §2.4 (`approval.changed` tells the engine an approval moved; `card.answered` is how
// the M4 runner resumes or cancels the job on a tap), 05-2 §5.5.4 (EXPIRED → "Ask me again" re-checks live terms first and
// builds a fresh card), X-03, X-04, X-125. CR-0009 G-M5-03 (HELD → own value → DECLINED), G-M5-04 (HELD expires),
// G-M5-18 (HELD / APPROVED → WITHDRAWN on a stopped job), G-M5-24 (use_app rules match `fields.app`).
// M5 T7: §5.9 step 2 / 08-1 §4.1.1 step 5 (`recoverSubmitted`: RUNNING with `submitted_at` → CHECKING, never re-submitted,
// Art. 7; this also sweeps a Draft send cut between its write-ahead and `gmail.send`, 08-2 §10.4).
// M5 T6: 08-0 §G.7 (a Draft's approvals row is made with the card; Send = approve once, then the 5 s undo; X-65).
// M5 T8: §9.6 / 08-0 §B.3 (`approval.transition` stores `second_look`; HELD and SUPERSEDED write the card's `held` /
// `superseded`), 08-4 §26.5 item 3 (superseded_by set once the new card exists), §10.5 + G-M5-33 (CHECKING 15 min → FAILED),
// SM-A4 (the HELD picks go to the runner as `held_action` / `held_own`).
import { APPROVAL_EVENTS, approvalExpiresAt, nextApproval, type ApprovalEvent } from '../../shared/approvalMachine';
import { newNonce } from '../../shared/canon';
import { fail, ok, type Result } from '../../shared/errors';
import { newId } from '../../shared/ids';
import { ApprovalFieldsSchema } from '../../shared/schemas';
import type {
  ApprovalDraft,
  ApprovalFields,
  ApprovalPayload,
  ApprovalScope,
  ApprovalState,
  ApprovalVerb,
  CardRow,
  DraftPayload,
  JobState,
  Rule,
  SecondLookResult,
} from '../../shared/types';
import { fieldsHash } from '../../engine/gate/fieldsHash';
import type { DbOp } from '../../engine/protocol';
import { cardRow, type DbRow } from '../db/rows';
import { applyDbOps, type TxEffects } from '../engine-supervisor/engineHost';
import type { Db } from '../store/db';
import { addRule, checkScope, endOfLocalDay, matchRule, ruleActivity, ruleMatch, scopesFor, type ChatRule } from './rules';

/** One `approvals` row, camelCased (08-0 §4.3 DDL). */
export interface ApprovalRow {
  id: string;
  cardId: string;
  jobId: string;
  chatId: string;
  verb: ApprovalVerb;
  hardLimit: boolean;
  fields: ApprovalFields;
  fieldsHash: string;
  state: ApprovalState;
  scope: ApprovalScope | null;
  approvedAt: number | null;
  approvedVia: 'card' | 'rule' | null;
  expiresAt: number;
  supersededBy: string | null;
  secondLook: SecondLookResult | null;
  submittedAt: number | null;
  createdAt: number;
}

const approvalRow = (r: DbRow): ApprovalRow => ({
  id: String(r.id),
  cardId: String(r.card_id),
  jobId: String(r.job_id),
  chatId: String(r.chat_id),
  verb: r.verb as ApprovalVerb,
  hardLimit: Number(r.hard_limit) === 1,
  fields: JSON.parse(String(r.fields)) as ApprovalFields,
  fieldsHash: String(r.fields_hash),
  state: r.state as ApprovalState,
  scope: (r.scope as ApprovalScope | null) ?? null,
  approvedAt: r.approved_at == null ? null : Number(r.approved_at),
  approvedVia: (r.approved_via as 'card' | 'rule' | null) ?? null,
  expiresAt: Number(r.expires_at),
  supersededBy: (r.superseded_by as string | null) ?? null,
  secondLook: r.second_look ? (JSON.parse(String(r.second_look)) as SecondLookResult) : null,
  submittedAt: r.submitted_at == null ? null : Number(r.submitted_at),
  createdAt: Number(r.created_at),
});

/** 08-2 §10.5: the CHECKING procedure runs 15 min, then the approval is FAILED. */
export const CHECKING_MS = 15 * 60_000;

/** Engine-side job states after which nothing of the job may still run (07-2 §4). */
const JOB_ENDED: readonly JobState[] = ['done', 'done_unverified', 'failed', 'cancelled'];
/** Approval states a stopped job withdraws (07-2 §5 PENDING; G-M5-18 HELD, APPROVED). */
const WITHDRAWABLE: readonly ApprovalState[] = ['PENDING', 'HELD', 'APPROVED'];
/**
 * Moves only the user makes, by a tap or a key on the card (Art. 3, 6; X-04): approve, decline, the HELD picks, and a
 * Draft's Undo (T6's own path). The engine's `approval.transition` may never ask for these, whatever the table allows.
 */
const USER_EVENTS: ReadonlySet<ApprovalEvent> = new Set<ApprovalEvent>([
  'approve',
  'decline',
  'held_pick_action',
  'held_pick_own',
  'draft_undo',
]);
/**
 * Every non-user edge of the table. M5 T4 has no engine caller yet; this set narrows to the edges each engine path really
 * asks for (RUNNING / COMPLETED / FAILED / SUPERSEDED / CHECKING) when T7 and T8 wire `approval.transition`.
 */
const ENGINE_EDGES = new Set(
  (Object.entries(APPROVAL_EVENTS) as [ApprovalEvent, Partial<Record<ApprovalState, ApprovalState>>][])
    .filter(([e]) => !USER_EVENTS.has(e))
    .flatMap(([, row]) => Object.entries(row).map(([from, to]) => `${from}>${to}`)),
);

/** A Draft card keeps its own states (08-0 §G.2); only these approval moves show on it (T6 owns the rest). */
const DRAFT_STATE: Partial<Record<ApprovalState, string>> = { EXPIRED: 'expired', WITHDRAWN: 'withdrawn' };

/** 08-2 §9.2 hard-limit column for the verbs the AI may request (X-125): buy, pay, delete always; book when it shares a
 * phone or address or cannot be cancelled free. */
export function hardLimitOf(fields: ApprovalFields, now: number): boolean {
  if (fields.verb !== 'book') return true;
  const shares = (fields.personalShared ?? []).some((p) => p === 'phone' || p === 'address');
  const terms = fields.cancelTerms;
  // A free-cancel window that has already closed is no free cancel.
  const free = !!terms && (terms.refundable || (terms.freeUntil !== undefined && terms.freeUntil > now));
  return shares || !free || fields.irreversible;
}

export interface CreateInput {
  jobId: string;
  verb: ApprovalVerb;
  fields: ApprovalFields;
  hardLimit: boolean;
  title: string;
  impact: string;
  variant?: ApprovalPayload['variant'];
  /** The card this one replaces (Ask me again, a superseded card). */
  supersedesCardId?: string;
  /** M5 T7 (G-M5-29): the engine's submit target, stored on the card payload for a restart. */
  submitRef?: string;
}

/** M5 T8: what the engine's `approval.transition` may carry (08-4 §29.1; 08-0 §B.3 SecondLookResult; 05-2 §5.5.4). */
export interface TransitionData {
  submittedAt?: number;
  secondLook?: SecondLookResult;
  held?: ApprovalPayload['held'];
  superseded?: ApprovalPayload['superseded'];
}

export interface Created {
  approvalId: string;
  cardId: string;
  nonce: string;
}

/** What the live terms are now (08-2 §9.4.2, 08-2 §9.7 `liveTermsCheck`); T8 fills it from a read tool. */
export type LiveTerms = (a: ApprovalRow) => Result<{ fields: ApprovalFields; title?: string; impact?: string }>;

export interface GateDeps {
  db: Db;
  now(): number;
  timeZone(): string;
  /** settings.rules (the `always` rules, 08-0 §A). */
  rules: { get(): Rule[]; set(next: Rule[]): void };
  dataDir?: string;
  /** After every committed write: main emits the moved rows (card:upsert, message:upsert, job:upsert, chat:upsert). */
  changed(effects: TxEffects): void;
  /** The engine port (08-1 §2.4); absent or not live in unit tests. */
  engine?: { send(kind: 'approval.changed' | 'card.answered', payload: Record<string, unknown>): boolean };
  /** 08-2 §9.4.2 before "Ask me again" builds a fresh card; until T8, the stored terms stand. */
  liveTerms?: LiveTerms;
  /** Tech log (05-2 §5.5.6: card events are tech-log lines, not activity); never carries card text. */
  log?(line: Record<string, unknown>): void;
}

export interface TapReq {
  cardId: string;
  nonce: string;
  resolvedBy: 'tap' | 'keyboard';
}

const merge = (into: TxEffects, from: TxEffects) => {
  for (const k of ['messageIds', 'chatIds', 'jobIds', 'cardIds'] as const) for (const v of from[k]) into[k].add(v);
};
const emptyEffects = (): TxEffects => ({ messageIds: new Set(), chatIds: new Set(), jobIds: new Set(), cardIds: new Set() });

/**
 * M5 review fix 4 (T2's `fill_card` purpose check, 08-2 §11.3): the approval a card fill may run against, read only. Fails
 * closed: null unless exactly one row for this job and verb is APPROVED (a filled card comes after the user's tap and
 * before the runner's write-ahead to RUNNING).
 */
export function findOpenApproval(db: Db, jobId: string, verb: ApprovalVerb): { id: string; state: ApprovalState } | null {
  const rows = db.prepare("SELECT id, state FROM approvals WHERE job_id = ? AND verb = ? AND state = 'APPROVED'").all(jobId, verb) as {
    id: string;
    state: ApprovalState;
  }[];
  return rows.length === 1 ? rows[0]! : null;
}

export class ApprovalGate {
  /** "For this chat" rules: memory only, so they end when foo restarts (G-M5-01). */
  private chatRules: ChatRule[] = [];

  constructor(private readonly d: GateDeps) {}

  get(approvalId: string): ApprovalRow | null {
    const r = this.d.db.prepare('SELECT * FROM approvals WHERE id = ?').get(approvalId) as DbRow | undefined;
    return r ? approvalRow(r) : null;
  }

  byCard(cardId: string): ApprovalRow | null {
    const r = this.d.db.prepare('SELECT * FROM approvals WHERE card_id = ?').get(cardId) as DbRow | undefined;
    return r ? approvalRow(r) : null;
  }

  private card(cardId: string): CardRow | null {
    const r = this.d.db.prepare('SELECT * FROM cards WHERE id = ? AND deleted_at IS NULL').get(cardId) as DbRow | undefined;
    return r ? cardRow(r) : null;
  }

  /** A rule that lets this approval skip its card (08-2 §9.4 `matchRule`); T7's gate asks before creating one. */
  ruleFor(s: { verb: ApprovalVerb; fields: ApprovalFields; hardLimit: boolean; chatId: string }): Rule | null {
    return matchRule(this.d.rules.get(), this.chatRules, s, this.d.now());
  }

  /** 08-2 §9.7 `ApprovalGate.create`: approvals row + card row + its message, one transaction, PENDING, expiry per verb. */
  create(input: CreateInput): Result<Created> {
    const fields = ApprovalFieldsSchema.safeParse(input.fields);
    if (!fields.success || fields.data.verb !== input.verb) return fail('VALIDATION');
    const job = this.d.db.prepare('SELECT chat_id FROM jobs WHERE id = ?').get(input.jobId) as { chat_id: string } | undefined;
    if (!job) return fail('JOB_GONE');
    const now = this.d.now();
    const approvalId = newId('ap', now);
    const cardId = newId('k', now);
    const messageId = newId('m', now);
    const nonce = newNonce();
    const expiresAt = approvalExpiresAt(input.verb, now);
    const payload: ApprovalPayload = {
      variant: input.variant ?? 'standard',
      approvalId,
      verb: input.verb,
      title: input.title,
      impact: input.impact,
      fields: fields.data as ApprovalFields,
      scopes: scopesFor(input.verb, input.hardLimit),
      hardLimit: input.hardLimit,
      expiresAt,
      ...(input.submitRef ? { submitRef: input.submitRef } : {}),
    };
    const ops: DbOp[] = [
      {
        op: 'insert',
        table: 'messages',
        row: {
          id: messageId,
          chat_id: job.chat_id,
          author_kind: 'foo',
          kind: 'card',
          card_id: cardId,
          status: 'complete',
          job_id: input.jobId,
          created_at: now,
        },
      },
      {
        op: 'insert',
        table: 'cards',
        row: {
          id: cardId,
          chat_id: job.chat_id,
          message_id: messageId,
          job_id: input.jobId,
          type: 'approval',
          state: 'PENDING',
          payload,
          nonce,
          expires_at: expiresAt,
          supersedes_id: input.supersedesCardId ?? null,
          created_at: now,
        },
      },
    ];
    const effects = this.tx(() => {
      const e = this.ops(ops, now);
      this.d.db
        .prepare(
          `INSERT INTO approvals (id, card_id, job_id, chat_id, verb, hard_limit, fields, fields_hash, state, expires_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
        )
        .run(
          approvalId,
          cardId,
          input.jobId,
          job.chat_id,
          input.verb,
          input.hardLimit ? 1 : 0,
          JSON.stringify(fields.data),
          fieldsHash(fields.data as ApprovalFields),
          expiresAt,
          now,
        );
      return e;
    });
    if (!effects.ok) return effects;
    this.d.changed(effects.value);
    this.d.log?.({ t: now, lvl: 'info', mod: 'approvals', evt: 'card.state', approvalId, cardId, to: 'PENDING', verb: input.verb });
    return ok({ approvalId, cardId, nonce });
  }

  /**
   * The main half of engine `approval.open` (08-1 §2.4): a verified ApprovalDraft from the gate (X-125). Book and delete get
   * an Approval card here; buy / pay are the Payment card (08-2 §10.2, M10).
   */
  openFromEngine(req: {
    jobId: string;
    draft: ApprovalDraft;
    title: string;
    impact: string;
    submitRef?: string;
    supersedes?: string;
  }): Result<Created> {
    if (req.draft.verb === 'buy' || req.draft.verb === 'pay') return fail('VALIDATION', 'payment_card');
    // M5 T8 (08-4 §26.5 item 3, 08-2 §9.4.2): the card this one replaces; its superseded_by is set once the new card exists.
    const old = req.supersedes ? this.get(req.supersedes) : null;
    const usable = old && old.jobId === req.jobId && old.state === 'SUPERSEDED' && old.supersededBy === null ? old : null;
    const made = this.create({
      jobId: req.jobId,
      verb: req.draft.verb,
      fields: req.draft.fields,
      hardLimit: hardLimitOf(req.draft.fields, this.d.now()),
      title: req.title,
      impact: req.impact,
      ...(req.submitRef ? { submitRef: req.submitRef } : {}),
      ...(usable ? { supersedesCardId: usable.cardId } : {}),
    });
    if (made.ok && usable)
      this.d.db
        .prepare('UPDATE approvals SET superseded_by = ? WHERE id = ? AND superseded_by IS NULL')
        .run(made.value.approvalId, usable.id);
    return made;
  }

  /** The open Approval card the renderer holds (nonce, not resolved); CARD_STALE / CARD_EXPIRED otherwise (08-1 §3.2). */
  private tapped(req: { cardId: string; nonce: string }, states: readonly ApprovalState[]): Result<{ card: CardRow; a: ApprovalRow }> {
    const card = this.card(req.cardId);
    if (!card) return fail('NOT_FOUND');
    if (card.type !== 'approval') return fail('VALIDATION');
    const a = this.byCard(card.id);
    if (!a) return fail('NOT_FOUND');
    if (card.nonce !== req.nonce) return fail('CARD_STALE');
    if (a.state === 'EXPIRED' || ((a.state === 'PENDING' || a.state === 'HELD') && this.d.now() >= a.expiresAt))
      return fail('CARD_EXPIRED');
    if (!states.includes(a.state)) return fail('CARD_STALE');
    return ok({ card, a });
  }

  /**
   * 08-2 §9.7 `ApprovalGate.approve` (card:approve): PENDING → APPROVED with `approved_at`, `approved_via='card'` and the
   * scope; "For this chat" / "Always" adds a rule (rule_added). Only a tap or a key on the card gets here (Art. 6, X-04).
   */
  approve(req: TapReq & { scope: ApprovalScope }): Result<{ state: ApprovalState }> {
    const t = this.tapped(req, ['PENDING']);
    if (!t.ok) return t;
    const { card, a } = t.value;
    const scope = checkScope(a.verb, a.hardLimit, req.scope);
    if (!scope.ok) return scope;
    const now = this.d.now();
    let rule: Rule | null = null;
    if (req.scope !== 'once') {
      const m = ruleMatch(a);
      if (!m.ok) return m;
      rule = {
        id: newId('rule', now),
        ...m.value,
        text: String((card.payload as Partial<ApprovalPayload>).title ?? ''),
        createdAt: now,
        source: 'card',
      };
    }
    const moved = this.move(a, 'approve', now, {
      approval: { approved_at: now, approved_via: 'card', scope: req.scope },
      card: { resolved_by: req.resolvedBy, resolved_at: now, answer: { optionId: 'approve', scope: req.scope } },
      extra: rule
        ? [{ op: 'activity', row: ruleActivity('rule_added', rule, { ...this.where(a), approvalId: a.id, scope: req.scope }) }]
        : [],
    });
    if (!moved.ok) return moved;
    if (rule && req.scope === 'always') {
      // The approval is already committed; a settings write that fails loses only the rule, so foo asks again next time.
      try {
        this.d.rules.set(addRule(this.d.rules.get(), rule));
      } catch (e) {
        this.d.log?.({
          t: now,
          lvl: 'error',
          mod: 'approvals',
          evt: 'RULE_SAVE_FAILED',
          approvalId: a.id,
          ruleId: rule.id,
          err: String(e),
        });
      }
    }
    if (rule && req.scope === 'chat') this.chatRules.push({ rule, chatId: a.chatId, until: endOfLocalDay(now, this.d.timeZone()) });
    this.d.engine?.send('card.answered', { cardId: card.id, choice: 'approve', resolvedBy: req.resolvedBy });
    return ok({ state: moved.value });
  }

  /** card:decline (Not now): PENDING → DECLINED; the runner cancels the job, or goes on by another route (07-2 §5). */
  decline(req: TapReq): Result<CardRow> {
    const t = this.tapped(req, ['PENDING']);
    if (!t.ok) return t;
    const now = this.d.now();
    const moved = this.move(t.value.a, 'decline', now, {
      card: { resolved_by: req.resolvedBy, resolved_at: now, answer: { optionId: 'decline' } },
    });
    if (!moved.ok) return moved;
    this.d.engine?.send('card.answered', { cardId: req.cardId, choice: 'decline', resolvedBy: req.resolvedBy });
    return ok(this.card(req.cardId)!);
  }

  /**
   * card:heldPick (SM-A4, X-125): on a HELD card the user picks the action's value (`action`, HELD → APPROVED; the engine
   * goes on to RUNNING) or their own (`own`, HELD → DECLINED and the job re-prepares a fresh card, G-M5-03).
   */
  heldPick(req: TapReq & { optionId: string }): Result<CardRow> {
    if (req.optionId !== 'action' && req.optionId !== 'own') return fail('VALIDATION');
    const t = this.tapped(req, ['HELD']);
    if (!t.ok) return t;
    const now = this.d.now();
    const event: ApprovalEvent = req.optionId === 'action' ? 'held_pick_action' : 'held_pick_own';
    const moved = this.move(t.value.a, event, now, {
      approval: req.optionId === 'action' ? { approved_at: now, approved_via: 'card' } : {},
      card: { resolved_by: req.resolvedBy, resolved_at: now, answer: { optionId: req.optionId } },
    });
    if (!moved.ok) return moved;
    // M5 T8: the runner goes on (action) or re-prepares with the user's value (own), 08-2 §9.6, G-M5-03.
    this.d.engine?.send('card.answered', { cardId: req.cardId, choice: `held_${req.optionId}`, resolvedBy: req.resolvedBy });
    return ok(this.card(req.cardId)!);
  }

  /**
   * card:askAgain on an EXPIRED card (05-2 §5.5.4): live terms first (08-2 §9.4.2), then a fresh PENDING card with a new
   * id, nonce and expiry; the expired card stays EXPIRED (single use, never auto-retried).
   */
  askAgain(req: { cardId: string }): Result<{ newCardId?: string }> {
    const card = this.card(req.cardId);
    if (!card) return fail('NOT_FOUND');
    if (card.type !== 'approval') return fail('VALIDATION');
    const a = this.byCard(card.id);
    if (!a) return fail('NOT_FOUND');
    if (a.state !== 'EXPIRED') return fail('CARD_STALE');
    const p = card.payload as unknown as ApprovalPayload;
    const live: ReturnType<LiveTerms> = this.d.liveTerms ? this.d.liveTerms(a) : ok({ fields: a.fields });
    if (!live.ok) return live;
    const made = this.create({
      jobId: a.jobId,
      verb: a.verb,
      fields: live.value.fields,
      hardLimit: a.hardLimit,
      title: live.value.title ?? p.title,
      impact: live.value.impact ?? p.impact,
      variant: p.variant,
    });
    if (!made.ok) return made;
    // A job still waiting on the user now waits on the fresh card (08-2 §9.1: non-payment jobs stay NEEDS_YOU).
    const job = this.d.db.prepare('SELECT state FROM jobs WHERE id = ?').get(a.jobId) as { state: JobState } | undefined;
    if (job?.state === 'needs_you') {
      const r = applyDbOps(this.d.db, [{ op: 'update', table: 'jobs', id: a.jobId, set: { needs_you_card_id: made.value.cardId } }], {
        now: this.d.now(),
        ...(this.d.dataDir ? { dataDir: this.d.dataDir } : {}),
      });
      if (r.result.ok) this.d.changed(r.effects);
    }
    return ok({ newCardId: made.value.cardId });
  }

  // M5 T6 (08-0 §G.7, X-65): a Draft card is its own approval card. Its approvals row is made with the card, and the
  // Draft's moves (Send = approve once, the 5 s Undo, the send itself, Discard) go through this gate like any approval.

  /** A known-recipient Draft: message + `draft` card (pending) + its approvals row (PENDING, 60 min), one transaction. */
  createDraft(input: {
    jobId: string;
    fields: ApprovalFields;
    payload: Omit<DraftPayload, 'approvalId'>;
    /** The expired Draft card an "Ask me again" replaces. */
    supersedesCardId?: string;
  }): Result<Created> {
    const fields = ApprovalFieldsSchema.safeParse(input.fields);
    if (!fields.success || fields.data.verb !== 'send') return fail('VALIDATION');
    const job = this.d.db.prepare('SELECT chat_id FROM jobs WHERE id = ?').get(input.jobId) as { chat_id: string } | undefined;
    if (!job) return fail('JOB_GONE');
    const now = this.d.now();
    const approvalId = newId('ap', now);
    const cardId = newId('k', now);
    const messageId = newId('m', now);
    const nonce = newNonce();
    const expiresAt = approvalExpiresAt('send', now);
    const payload: DraftPayload = { ...input.payload, approvalId };
    const effects = this.tx(() => {
      const e = this.ops(
        [
          {
            op: 'insert',
            table: 'messages',
            row: {
              id: messageId,
              chat_id: job.chat_id,
              author_kind: 'foo',
              kind: 'card',
              card_id: cardId,
              status: 'complete',
              job_id: input.jobId,
              created_at: now,
            },
          },
          {
            op: 'insert',
            table: 'cards',
            row: {
              id: cardId,
              chat_id: job.chat_id,
              message_id: messageId,
              job_id: input.jobId,
              type: 'draft',
              state: 'pending',
              payload,
              nonce,
              expires_at: expiresAt,
              supersedes_id: input.supersedesCardId ?? null,
              created_at: now,
            },
          },
        ],
        now,
      );
      this.d.db
        .prepare(
          `INSERT INTO approvals (id, card_id, job_id, chat_id, verb, hard_limit, fields, fields_hash, state, expires_at, created_at)
           VALUES (?, ?, ?, ?, 'send', 0, ?, ?, 'PENDING', ?, ?)`,
        )
        .run(
          approvalId,
          cardId,
          input.jobId,
          job.chat_id,
          JSON.stringify(fields.data),
          fieldsHash(fields.data as ApprovalFields),
          expiresAt,
          now,
        );
      return e;
    });
    if (!effects.ok) return effects;
    this.d.changed(effects.value);
    this.d.log?.({ t: now, lvl: 'info', mod: 'approvals', evt: 'card.state', approvalId, cardId, to: 'PENDING', verb: 'send' });
    return ok({ approvalId, cardId, nonce });
  }

  /**
   * A Draft card's move: the approval event (guarded on the row's state, as every move) and the Draft card's own state and
   * fields in the same transaction (08-0 §G.2 Draft states), plus any extra ops (the `sent_email` activity row).
   */
  draftMove(
    approvalId: string,
    event: 'approve' | 'draft_undo' | 'submit' | 'proof_ok' | 'submit_failed' | 'withdraw',
    w: { approval?: Record<string, unknown>; card: Record<string, unknown>; extra?: DbOp[] },
  ): Result<ApprovalState> {
    const a = this.get(approvalId);
    if (!a) return fail('NOT_FOUND');
    const now = this.d.now();
    return this.move(a, event, now, {
      ...(w.approval ? { approval: w.approval } : {}),
      extra: [{ op: 'update', table: 'cards', id: a.cardId, set: w.card }, ...(w.extra ?? [])],
    });
  }

  /**
   * 08-2 §9.7 `ApprovalGate.transition` (engine `approval.transition`): any move the machine allows, else
   * APPROVAL_BAD_TRANSITION (logged). The user's own moves (USER_EVENTS) are refused here too: only a tap approves.
   * RUNNING writes `submitted_at` ahead of the one irreversible call (08-2 §10.4).
   */
  transition(approvalId: string, to: ApprovalState, data: TransitionData = {}): Result<ApprovalState> {
    const a = this.get(approvalId);
    if (!a) return fail('NOT_FOUND');
    if (!ENGINE_EDGES.has(`${a.state}>${to}`)) {
      this.d.log?.({ t: this.d.now(), lvl: 'warn', mod: 'approvals', evt: 'APPROVAL_BAD_TRANSITION', approvalId, from: a.state, to });
      return fail('APPROVAL_BAD_TRANSITION');
    }
    const now = this.d.now();
    const set: Record<string, unknown> = {};
    if (to === 'RUNNING') set.submitted_at = data.submittedAt ?? now;
    if (to === 'COMPLETED') set.completed_at = now;
    // M5 T8: the second look's result is kept on the row; HELD and SUPERSEDED write what the card shows (05-2 §5.5.4). A
    // HELD card waits on the user again, so its earlier Approve tap is cleared.
    if (data.secondLook) set.second_look = JSON.stringify(data.secondLook);
    let card: Record<string, unknown> | undefined;
    if (data.held || data.superseded) {
      const payload = (this.card(a.cardId)?.payload ?? {}) as unknown as ApprovalPayload;
      card = {
        payload: { ...payload, ...(data.held ? { held: data.held } : {}), ...(data.superseded ? { superseded: data.superseded } : {}) },
      };
    }
    if (to === 'HELD') card = { ...card, resolved_by: null, resolved_at: null, answer: null };
    if (to === 'SUPERSEDED') card = { ...card, resolved_by: 'system', resolved_at: now };
    return this.moveTo(a, to, now, { approval: set, ...(card ? { card } : {}) });
  }

  // M5 T7
  /**
   * 08-2 §5.9 step 2 (main's half, run when the app or the engine starts): every approval RUNNING with `submitted_at` set →
   * CHECKING (`result_unknown`), never re-submitted (Art. 7). A Draft card keeps `sending`; the CHECKING procedure is T8's
   * (§10.5). Returns the ids it moved.
   */
  recoverSubmitted(): string[] {
    const now = this.d.now();
    const rows = this.d.db
      .prepare("SELECT * FROM approvals WHERE state = 'RUNNING' AND submitted_at IS NOT NULL ORDER BY submitted_at, id")
      .all() as DbRow[];
    return rows.filter((r) => this.move(approvalRow(r), 'result_unknown', now, {}).ok).map((r) => String(r.id));
  }

  /**
   * 08-2 §9.7 `ApprovalGate.expireTick` (1 s, absolute `expires_at`, runs with the window closed): PENDING / HELD past
   * their time → EXPIRED (G-M5-04); and an open approval whose job has ended → WITHDRAWN (08-2 §5.7 step 3, G-M5-18).
   * Returns the ids it moved.
   */
  expireTick(): string[] {
    const now = this.d.now();
    const moved: string[] = [];
    const due = this.d.db
      .prepare("SELECT * FROM approvals WHERE state IN ('PENDING','HELD') AND expires_at <= ? ORDER BY expires_at, id")
      .all(now) as DbRow[];
    for (const r of due)
      if (this.move(approvalRow(r), 'expire', now, { card: { resolved_by: 'system', resolved_at: now } }).ok) moved.push(String(r.id));
    const ended = this.d.db
      .prepare(
        `SELECT a.* FROM approvals a JOIN jobs j ON j.id = a.job_id
         WHERE a.state IN (${WITHDRAWABLE.map(() => '?').join(',')}) AND j.state IN (${JOB_ENDED.map(() => '?').join(',')})`,
      )
      .all(...WITHDRAWABLE, ...JOB_ENDED) as DbRow[];
    for (const r of ended)
      if (this.move(approvalRow(r), 'withdraw', now, { card: { resolved_by: 'system', resolved_at: now } }).ok) moved.push(String(r.id));
    // M5 T8 (08-2 §10.5, CR-0009 G-M5-33): 15 min in CHECKING without proof → FAILED, never re-submitted. The proof search
    // (history page, Gmail) is M8 / M9's; until then nothing finds proof, so the timer alone decides.
    const unproven = this.d.db
      .prepare(
        "SELECT * FROM approvals WHERE state = 'CHECKING' AND submitted_at IS NOT NULL AND submitted_at <= ? ORDER BY submitted_at, id",
      )
      .all(now - CHECKING_MS) as DbRow[];
    for (const r of unproven)
      if (this.move(approvalRow(r), 'no_proof', now, { card: { resolved_by: 'system', resolved_at: now } }).ok) moved.push(String(r.id));
    return moved;
  }

  private where(a: ApprovalRow): { chatId: string; chatTitle: string | null; jobId: string } {
    const chat = this.d.db.prepare('SELECT title FROM chats WHERE id = ?').get(a.chatId) as { title: string | null } | undefined;
    return { chatId: a.chatId, chatTitle: chat?.title ?? null, jobId: a.jobId };
  }

  private move(
    a: ApprovalRow,
    event: ApprovalEvent,
    now: number,
    w: { approval?: Record<string, unknown>; card?: Record<string, unknown>; extra?: DbOp[] },
  ): Result<ApprovalState> {
    const to = nextApproval(a.state, event);
    if (!to) return fail('APPROVAL_BAD_TRANSITION');
    return this.moveTo(a, to, now, w);
  }

  /** One transaction: the approvals row (guarded on its old state), the card mirror, any extra ops; then emit and tell the engine. */
  private moveTo(
    a: ApprovalRow,
    to: ApprovalState,
    now: number,
    w: { approval?: Record<string, unknown>; card?: Record<string, unknown>; extra?: DbOp[] },
  ): Result<ApprovalState> {
    const type = (this.d.db.prepare('SELECT type FROM cards WHERE id = ?').pluck().get(a.cardId) as string | undefined) ?? 'approval';
    const cardState = type === 'draft' ? DRAFT_STATE[to] : to;
    const r = this.tx(() => {
      const cols = { state: to, ...w.approval };
      const keys = Object.keys(cols);
      const changed = this.d.db
        .prepare(`UPDATE approvals SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ? AND state = ?`)
        .run(...keys.map((k) => cols[k as keyof typeof cols] as string | number | null), a.id, a.state).changes;
      if (changed !== 1) throw new GateAbort('CARD_STALE');
      const ops: DbOp[] = [...(w.extra ?? [])];
      if (cardState) ops.unshift({ op: 'update', table: 'cards', id: a.cardId, set: { state: cardState, ...w.card } });
      return ops.length ? this.ops(ops, now) : emptyEffects();
    });
    if (!r.ok) return r;
    this.d.changed(r.value);
    this.d.log?.({ t: now, lvl: 'info', mod: 'approvals', evt: 'card.state', approvalId: a.id, cardId: a.cardId, from: a.state, to });
    this.d.engine?.send('approval.changed', { approvalId: a.id, state: to });
    return ok(to);
  }

  private ops(ops: DbOp[], now: number): TxEffects {
    const r = applyDbOps(this.d.db, ops, { now, ...(this.d.dataDir ? { dataDir: this.d.dataDir } : {}) });
    if (!r.result.ok) throw new GateAbort(r.result.error.kind);
    return r.effects;
  }

  private tx(fn: () => TxEffects): Result<TxEffects> {
    try {
      const out = emptyEffects();
      merge(out, this.d.db.transaction(fn)());
      return ok(out);
    } catch (e) {
      if (e instanceof GateAbort) return fail(e.kind as 'VALIDATION');
      throw e;
    }
  }
}

class GateAbort extends Error {
  constructor(readonly kind: string) {
    super(kind);
  }
}
