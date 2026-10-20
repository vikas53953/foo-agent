// Spec: 08-1 §3.2 card:answer (`{ cardId; nonce; answer: CardAnswer; resolvedBy }` → CardRow; CARD_STALE, CARD_EXPIRED),
// §2.4 card.answered (main → engine), 05-1 §5.3.3 (`cards.state`: asking → answered | skipped …; `resolved_by` records how),
// §5.3.4 (tap, typed, reaction and toast answers give the same result; Art. 6: choice cards are not gated), §5.3 purposes
// (file_in / photo_notice show no Skip), 08-4 §25.1 CardAnswer, §26.6 rule 4 (reactions 1️⃣–4️⃣ answer Choice cards only),
// 08-2 §5.2.2 (a 👍 / ✅ reaction on an Approval, Payment or Draft card never approves: it only gets the G16 reply,
// `thread.approval_typed.approve|send`), Art. 12 (state moves of a job's card are the runner's: main checks and forwards).
// A card with no job (setup, file_in, photo_notice …) has no runner to move it, so main writes its answer itself through
// the same db.tx path (implementation-notes M5-T5); a `conflict` card's answer is then sent on to the engine (08-3 §12.7;
// M6 T7). A `memory_confirm` card is the engine's: main forwards it and the engine moves it (CR-0010 G-M6-21). 05-2 §5.8.3: a Secret box's Cancel (`{ skip: true }`) moves
// an asking or rejected box to `withdrawn` ("Skipped. Nothing was saved."); main writes it, as secret:save writes `saved`.
import { t } from '../../shared/copy/t';
import { fail, ok, type Result } from '../../shared/errors';
import { newId } from '../../shared/ids';
import type { CardAnswer, CardRow, ChatRow, MessageRow } from '../../shared/types';
import { reactionAnswer, showsSkip, toastAnswer, type AnswerableCard } from '../../engine/cards/typedAnswer';
import type { DbOp } from '../../engine/protocol';
import type { EngineBridge } from '../engine-supervisor/EngineBridge';
import { applyDbOps } from '../engine-supervisor/engineHost';
import { cardRow, type DbRow } from '../db/rows';
import type { Db } from '../store/db';
import { messageGet, recomputePill } from '../store/queries';

export type AnswerBy = 'tap' | 'keyboard' | 'reaction' | 'toast';

export interface AnswerDeps {
  db: Db;
  now(): number;
  engine: Pick<EngineBridge, 'send'> | undefined;
  /** Pushes what main wrote to the windows (card:upsert, message:upsert, chat:upsert). */
  emitCard(row: CardRow): void;
  emitMessage(row: MessageRow): void;
  emitChat(chatId: string): void;
}

/** The cards answered here (05-1 §5.3, §5.4). */
const ANSWERABLE = new Set(['choice', 'tiles']);
/** Engine-made choice cards the runner answers by option id (08-4 §26.9 stop_which; 08-2 §5.2 fold_which). */
// M6 T5: a `memory_confirm` card's answer is the engine's (08-3 §12.4.2; G-M6-04); the engine moves the card.
const RUNNER_PURPOSES = new Set(['stop_which', 'fold_which', 'memory_confirm']);
/** Jobless memory cards main answers and then tells the engine about (08-3 §12.7 conflict; M6 T7). */
const ENGINE_TOLD = new Set(['conflict']);
/** 08-2 §5.2.2: a single 👍 or ✅ reaction on these cards gets the G16 reply. */
const YES_REACTIONS = new Set(['👍', '✅']);

const card = (db: Db, sql: string, arg: string): CardRow | null => {
  const r = db.prepare(`SELECT * FROM cards WHERE ${sql} AND deleted_at IS NULL`).get(arg) as DbRow | undefined;
  return r ? cardRow(r) : null;
};

/** The answer fits the card: a real option, many only on multi-select, Skip only where shown (a stepper is one card per
 * question, 08-1 §4.5). */
export function fitsCard(c: CardRow, a: CardAnswer): boolean {
  const p = c.payload as unknown as AnswerableCard;
  const ids = (p.options ?? []).map((o) => o.id);
  if ('skip' in a) return showsSkip(p);
  if ('text' in a) return a.text.trim().length > 0;
  if ('optionId' in a) return !p.multi && ids.includes(a.optionId);
  return !!p.multi && new Set(a.optionIds).size === a.optionIds.length && a.optionIds.every((id) => ids.includes(id));
}

/** Writes rows main owns (a jobless card's answer, a foo line) and pushes them to the windows. */
function write(d: AnswerDeps, ops: DbOp[], chatId: string): Result<void> {
  const now = d.now();
  const { result, effects } = applyDbOps(d.db, ops, { now });
  if (!result.ok) return result;
  for (const id of effects.cardIds) {
    const c = card(d.db, 'id = ?', id);
    if (c) d.emitCard(c);
  }
  for (const id of effects.messageIds) {
    const m = messageGet(d.db, id);
    if (m) d.emitMessage(m);
  }
  recomputePill(d.db, chatId, now);
  d.emitChat(chatId);
  return ok(undefined);
}

/**
 * card:answer and every other way a Choice or tiles card is answered from main (a reaction; later the toast). The card must
 * still be asking with the nonce the window holds; a job's card goes to the runner as card.answered, a jobless card is
 * written here. Returns the card as it stands after main's part.
 */
export function answerCard(
  d: AnswerDeps,
  req: { cardId: string; nonce?: string; answer: CardAnswer; resolvedBy: AnswerBy },
): Result<CardRow> {
  const c = card(d.db, 'id = ?', req.cardId);
  if (!c) return fail('NOT_FOUND');
  if (c.type === 'secret') return cancelSecret(d, c, req);
  if (!ANSWERABLE.has(c.type)) return fail('VALIDATION');
  if (req.nonce !== undefined && c.nonce !== req.nonce) return fail('CARD_STALE');
  const now = d.now();
  if (c.state === 'expired' || (c.state === 'asking' && c.expiresAt !== null && now >= c.expiresAt)) return fail('CARD_EXPIRED');
  if (c.state !== 'asking' || c.resolvedAt !== null) return fail('CARD_STALE');
  if (!fitsCard(c, req.answer)) return fail('VALIDATION');

  const purpose = String(c.payload.purpose ?? '');
  // M9 T8: the flight-scope reply (08-2 §5.3.4) has no job yet; its Compare flights starts one in the runner.
  if (c.jobId !== null || RUNNER_PURPOSES.has(purpose) || c.payload.flightScope !== undefined) {
    const a = req.answer;
    const sent = d.engine?.send('card.answered', {
      cardId: c.id,
      answer: a,
      ...('optionId' in a ? { choice: a.optionId } : {}),
      ...('text' in a ? { text: a.text } : {}),
      resolvedBy: req.resolvedBy,
    });
    return sent ? ok(c) : fail('UNKNOWN', 'engine not running');
  }

  const state = 'skip' in req.answer ? 'skipped' : 'answered';
  const r = write(
    d,
    [{ op: 'update', table: 'cards', id: c.id, set: { state, answer: req.answer, resolved_by: req.resolvedBy, resolved_at: now } }],
    c.chatId,
  );
  if (!r.ok) return r;
  // M6 T7: the engine acts on a memory card's answer (a conflict edits and forgets, a share grants) once main wrote it.
  if (ENGINE_TOLD.has(purpose)) {
    const a = req.answer;
    d.engine?.send('card.answered', {
      cardId: c.id,
      answer: a,
      ...('optionId' in a ? { choice: a.optionId } : {}),
      resolvedBy: req.resolvedBy,
    });
  }
  return ok(card(d.db, 'id = ?', c.id) ?? c);
}

/** 05-2 §5.8.3 Cancelled: an asking (or rejected) Secret box → `withdrawn`; nothing is saved and no value moves. */
function cancelSecret(d: AnswerDeps, c: CardRow, req: { nonce?: string; answer: CardAnswer; resolvedBy: AnswerBy }): Result<CardRow> {
  if (!('skip' in req.answer)) return fail('VALIDATION');
  if (req.nonce !== undefined && c.nonce !== req.nonce) return fail('CARD_STALE');
  if (c.state !== 'asking' && c.state !== 'rejected') return fail('CARD_STALE');
  const r = write(
    d,
    [
      {
        op: 'update',
        table: 'cards',
        id: c.id,
        set: { state: 'withdrawn', answer: req.answer, resolved_by: req.resolvedBy, resolved_at: d.now() },
      },
    ],
    c.chatId,
  );
  if (!r.ok) return r;
  return ok(card(d.db, 'id = ?', c.id) ?? c);
}

/**
 * A reaction the user put on a card's bubble (message:react, on). 1️⃣–4️⃣ on an asking Choice or tiles card answer it
 * (resolved_by 'reaction'); 👍 / ✅ on a pending Approval, Payment or Draft card only get the G16 line, and nothing moves.
 * Anything else is just a reaction.
 */
export function onCardReaction(d: AnswerDeps, messageId: string, emoji: string): void {
  const c = card(d.db, 'message_id = ?', messageId);
  if (!c) return;
  if (ANSWERABLE.has(c.type) && c.state === 'asking') {
    const r = reactionAnswer(emoji, c.payload as unknown as AnswerableCard);
    if (r.kind === 'answer') answerCard(d, { cardId: c.id, answer: r.answer, resolvedBy: 'reaction' });
    return;
  }
  const gated = ((c.type === 'approval' || c.type === 'payment') && c.state === 'PENDING') || (c.type === 'draft' && c.state === 'pending');
  if (!gated || !YES_REACTIONS.has(emoji.replace(/️/gu, ''))) return;
  const now = d.now();
  const chat = d.db.prepare('SELECT helper_id FROM chats WHERE id = ?').get(c.chatId) as Pick<DbRow, 'helper_id'> | undefined;
  const helperId = (chat?.helper_id as ChatRow['helperId'] | undefined) ?? null;
  write(
    d,
    [
      {
        op: 'insert',
        table: 'messages',
        row: {
          id: newId('m', now),
          chat_id: c.chatId,
          author_kind: helperId ? 'helper' : 'foo',
          author_id: helperId,
          kind: 'text',
          text: c.type === 'draft' ? t('thread.approval_typed.send') : t('thread.approval_typed.approve'),
          status: 'complete',
          job_id: c.jobId,
          created_at: now,
        },
      },
    ],
    c.chatId,
  );
}

/**
 * The notifier's answer button (CR-0009 G-M5-09; 05-1 §5.3.4): the toast's first button picks the card's Best fit with
 * `resolved_by: 'toast'`, through the same path as a tap. The Windows toast that calls it is M11's; a card with no Best fit
 * (file_in, photo_notice) has no answer button.
 */
export function answerFromToast(d: AnswerDeps, cardId: string): Result<CardRow> {
  const c = card(d.db, 'id = ?', cardId);
  if (!c) return fail('NOT_FOUND');
  const pick = toastAnswer(c.payload as unknown as AnswerableCard);
  if (!pick) return fail('VALIDATION');
  return answerCard(d, { cardId, answer: pick.answer, resolvedBy: pick.resolvedBy });
}
