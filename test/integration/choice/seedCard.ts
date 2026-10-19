// Test helper for the M5-T5 card tests: one card bubble + its cards row through main's db.tx path (08-1 §4.3.3 insert
// order), as test:card.seed writes it, without Electron. 05-1 §5.3 / §5.4 payloads.
import { applyDbOps } from '../../../src/main/engine-supervisor/engineHost';
import { newNonce } from '../../../src/shared/canon';
import { newId } from '../../../src/shared/ids';
import type { CardRow, CardType } from '../../../src/shared/types';
import { cardRow, type DbRow } from '../../../src/main/db/rows';
import type { Db } from '../../../src/main/store/db';

export function seedCard(
  db: Db,
  o: { chatId: string; type: CardType; state: string; payload: Record<string, unknown>; now: number; jobId?: string; expiresAt?: number },
): CardRow {
  const cardId = newId('k', o.now);
  const messageId = newId('m', o.now);
  const r = applyDbOps(
    db,
    [
      {
        op: 'insert',
        table: 'messages',
        row: {
          id: messageId,
          chat_id: o.chatId,
          author_kind: 'foo',
          kind: 'card',
          card_id: cardId,
          status: 'complete',
          job_id: o.jobId ?? null,
          created_at: o.now,
        },
      },
      {
        op: 'insert',
        table: 'cards',
        row: {
          id: cardId,
          chat_id: o.chatId,
          message_id: messageId,
          job_id: o.jobId ?? null,
          type: o.type,
          state: o.state,
          payload: o.payload,
          nonce: newNonce(),
          expires_at: o.expiresAt ?? null,
          created_at: o.now,
        },
      },
    ],
    { now: o.now },
  );
  if (!r.result.ok) throw new Error(`seed refused: ${r.result.error.kind}`);
  return cardOf(db, cardId);
}

export const cardOf = (db: Db, id: string): CardRow => cardRow(db.prepare('SELECT * FROM cards WHERE id = ?').get(id) as DbRow);

/** 05-1 §5.3.1's drawn flight question (UX-10-02 words). */
export const FLIGHTS = {
  purpose: 'job',
  question: 'Which flight time works for Delhi on Fri 18 Dec?',
  options: [
    { id: 'o1', label: '10:15 AM · IndiGo · ₹5,240', detail: 'No early start, you said you hate those', bestFit: true },
    { id: 'o2', label: '7:10 AM · Air India · ₹4,890', detail: 'Cheapest, leaves early' },
    { id: 'o3', label: '1:35 PM · Akasa Air · ₹5,610' },
  ],
  multi: false,
  aiReversible: false,
  reversible: false,
  livePrices: true,
};
