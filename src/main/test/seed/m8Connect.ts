// Spec: 08-3 §22.9 (seed sets, test builds only); 05-3 §5.11 (the Google Connect card, variant `google`, state `offered`);
// M8 T2 (AT-014, AT-093, BP-CARD-11, foo-verify): the ux-world plus one Connect card at the end of foo's chat, and no
// connections. Fake world only: no real account appears anywhere.
import type { Db } from '../../store/db';
import { SeedWriter } from './writer';
import { seedUxWorld, type SeedResult } from './uxWorld';

export function seedM8Connect(db: Db, now: number): SeedResult {
  const r = seedUxWorld(db, now);
  db.exec('DELETE FROM contacts_index; DELETE FROM connections;');
  const foo = r.refs.foo!;
  // A fresh writer numbers foo's chat from 1, so park the ux-world rows above it; finish() renumbers the chat by time and
  // the card (newest) ends up last.
  db.prepare('UPDATE messages SET seq = seq + 2000000 WHERE chat_id = ?').run(foo);
  const w = new SeedWriter(db, 8);
  // One transaction: the card's message points at the card before the card row exists (a deferred key).
  const { cardId } = db.transaction(() =>
    w.card(foo, { type: 'connect', state: 'offered', payload: { variant: 'google', app: 'gmail' }, at: now }),
  )();
  w.finish(now);
  db.prepare('UPDATE chats SET next_seq = (SELECT MAX(seq) + 1 FROM messages WHERE chat_id = ?) WHERE id = ?').run(foo, foo);
  return { ...r, refs: { ...r.refs, connectCard: cardId } };
}
