// Spec: 08-1 §3.2 card:approve | decline | askAgain | heldPick (each checks the card's nonce and state first; CARD_STALE,
// CARD_EXPIRED, SCOPE_NOT_ALLOWED; `card:approve` answers `{ state }`), §3.3 (events are patches: the moved card, message,
// job and chat rows), 08-2 §9.1, §9.5, §9.7 (main's ApprovalGate and its 1 s expiry tick). The router line in
// src/main/ipc/IpcRouter.ts stays T1's; this file fills the four rows (M5-T4). M5-T6: `card:askAgain` on a Draft card.
import { cardRow, type DbRow } from '../db/rows';
import type { TxEffects } from '../engine-supervisor/engineHost';
import { emit, listContext, type AppContext, type IpcHandlers } from '../ipc/IpcRouter';
import { deps } from '../deps';
import { chatRowById, jobRows, messageGet } from '../store/queries';
import { ApprovalGate } from './ApprovalGate';
import { startExpiryTick } from './expiry';
// M5
import { draftService } from '../drafts/draftIpc';

const gates = new WeakMap<AppContext['db'], ApprovalGate>();

/** Sends the rows a gate write moved to the renderer (08-1 §3.3), as EngineBridge does for db.tx. */
export function publish(ctx: AppContext, effects: TxEffects): void {
  const now = deps.clock.now();
  for (const id of effects.messageIds) {
    const m = messageGet(ctx.db, id);
    if (m) emit('message:upsert', m);
  }
  for (const id of effects.cardIds) {
    const r = ctx.db.prepare('SELECT * FROM cards WHERE id = ?').get(id) as DbRow | undefined;
    if (r) emit('card:upsert', cardRow(r));
  }
  if (effects.jobIds.size) {
    const ids = [...effects.jobIds];
    for (const job of jobRows(ctx.db, `id IN (${ids.map(() => '?').join(', ')})`, ids, now)) emit('job:upsert', job);
  }
  for (const id of effects.chatIds) {
    const row = chatRowById(ctx.db, listContext(ctx.settings.get()), id);
    if (row) emit('chat:upsert', row);
  }
}

/** The one ApprovalGate of this app (main is the single writer); its expiry tick starts with it. */
export function approvalGate(ctx: AppContext): ApprovalGate {
  let gate = gates.get(ctx.db);
  if (gate) return gate;
  gate = new ApprovalGate({
    db: ctx.db,
    now: () => deps.clock.now(),
    timeZone: () => ctx.settings.get().locale.timeZone,
    rules: { get: () => ctx.settings.get().rules, set: (rules) => ctx.settings.update((s) => ({ ...s, rules })) },
    dataDir: ctx.dataDir,
    changed: (effects) => publish(ctx, effects),
    ...(ctx.engine ? { engine: ctx.engine } : {}),
    log: (line) => console.info('approvals', JSON.stringify(line)),
  });
  gates.set(ctx.db, gate);
  startExpiryTick(gate);
  return gate;
}

// M5
const cardType = (ctx: AppContext, cardId: string) =>
  ctx.db.prepare('SELECT type FROM cards WHERE id = ?').pluck().get(cardId) as string | undefined;

export function approvalIpc(ctx: AppContext): IpcHandlers<'card:approve' | 'card:decline' | 'card:askAgain' | 'card:heldPick'> {
  const gate = approvalGate(ctx);
  return {
    'card:approve': (req) => gate.approve(req),
    'card:decline': (req) => gate.decline(req),
    // M5 T6 (05-2 §5.7.2): an expired Draft's "Ask me again" makes a fresh Draft card on the same Gmail draft.
    'card:askAgain': (req) => (cardType(ctx, req.cardId) === 'draft' ? draftService(ctx).askAgain(req) : gate.askAgain(req)),
    'card:heldPick': (req) => gate.heldPick(req),
  };
}
