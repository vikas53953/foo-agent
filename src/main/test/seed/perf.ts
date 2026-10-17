// Spec: 08-3 §22.9 `perf` (200 chats: 1 foo, 7 helpers, 4 groups, 8 wa_mirror, 180 archived helper chats; 50,000 messages
// over the last 365 days, one chat with 5,000; message mix; 2,000 jobs with 4–9 steps; "taj" in exactly 12 messages),
// 10-acceptance-2 §E.1 (the PERF data set). Generated from PRNG seed 1 relative to the pinned clock.
import type { Db } from '../../store/db';
import type { CardType } from '../../../shared/types';
import { DAY, MIN, SeedWriter } from './writer';
import type { SeedResult } from './uxWorld';

export const PERF_MESSAGES = 50_000;
export const PERF_FOO_MESSAGES = 5_000;
export const PERF_JOBS = 2_000;
export const PERF_TAJ = 12;

const EN = [
  'can you check the bill',
  'book a table for 4 at 8',
  'what did the doctor say about Tuesday',
  'send the photos to Riya',
  'ok',
  'thanks!',
];
const HI = ['kal ka plan kya hai', 'bijli ka bill bhar diya?', 'mummy ko yaad dila dena', 'thik hai, kar do'];
const PA = ['ki haal aa', 'kal milde haan', 'theek aa ji, kar do'];
const WORDS = ['booking', 'flight', 'bill', 'dinner', 'cake', 'trip', 'tickets', 'doctor', 'school', 'groceries', 'cab', 'hotel', 'Sunday'];
const CARD_MIX: [CardType, string, number][] = [
  ['choice', 'answered', 0.4],
  ['approval', 'COMPLETED', 0.25],
  ['payment', 'COMPLETED', 0.1],
  ['draft', 'sent', 0.1],
  ['checklist', 'done', 0.15],
];

/** Log-normal length, median 60 characters, max 1,400. */
function textOf(w: SeedWriter): string {
  const r = w.rand();
  const base = r < 0.6 ? w.pick(EN) : r < 0.85 ? w.pick(HI) : w.pick(PA);
  const u = Math.max(1e-9, w.rand());
  const v = w.rand();
  const normal = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  const len = Math.min(1400, Math.max(2, Math.round(60 * Math.exp(0.8 * normal))));
  let s = base;
  while (s.length < len) s += ` ${w.pick(WORDS)}`;
  return s.slice(0, len);
}

export function seedPerf(db: Db, now: number): SeedResult {
  const w = new SeedWriter(db, 1);
  w.wipe();
  const refs: Record<string, string> = {};
  const start = now - 365 * DAY;
  // messages.card_id has no index in the 08-1 §4.3 DDL, so with foreign keys on every card insert scans all messages for its
  // deferred child row (O(n²) at 50,000 messages). The seed writes with the checks off and runs foreign_key_check after.
  db.pragma('foreign_keys = OFF');
  db.transaction(() => {
    const colors = [
      '--h-terracotta',
      '--h-green',
      '--h-violet',
      '--h-raspberry',
      '--h-steel',
      '--h-teal',
      '--h-brown',
      '--h-slate',
      '--h-purple',
      '--h-ochre',
    ];
    const chats: { id: string; helperId: string | null; kind: string }[] = [];
    const foo = w.chat({ kind: 'foo', title: 'foo', at: now - MIN, createdAt: start });
    refs.foo = foo.chatId;
    chats.push({ id: foo.chatId, helperId: null, kind: 'foo' });
    const helperIds: string[] = [];
    for (let i = 0; i < 7; i++) {
      const name = ['Trips', 'Money', 'Home', 'Health', 'Work', 'News & X', 'Shopping'][i]!;
      const c = w.chat({
        kind: 'helper',
        title: name,
        at: now - (i + 2) * 37 * MIN,
        createdAt: start + i * DAY,
        helper: { name, color: colors[i]!, face: `letter:${name[0]}`, job: `Looks after ${name.toLowerCase()}.` },
      });
      helperIds.push(c.helperId!);
      chats.push({ id: c.chatId, helperId: c.helperId, kind: 'helper' });
    }
    for (let i = 0; i < 4; i++) {
      const c = w.chat({
        kind: 'group',
        title: `Group ${i + 1}`,
        at: now - (i + 3) * 5 * 60 * MIN,
        createdAt: start + 10 * DAY,
        colorToken: colors[i + 3]!,
      });
      w.member(c.chatId, 'foo', 'owner', start + 10 * DAY);
      w.member(c.chatId, helperIds[i]!, 'member', start + 10 * DAY);
      chats.push({ id: c.chatId, helperId: null, kind: 'group' });
    }
    for (let i = 0; i < 8; i++) {
      const jid = `1203630000000001${String(i).padStart(2, '0')}@g.us`;
      const c = w.chat({
        kind: 'wa_mirror',
        title: `WhatsApp group ${i + 1}`,
        waJid: jid,
        at: now - (i + 1) * DAY,
        createdAt: start + 20 * DAY,
      });
      w.waMessage(jid, { fromMe: false, sender: 'Asha', text: 'see you there', at: now - (i + 1) * DAY }, 0);
      chats.push({ id: c.chatId, helperId: null, kind: 'wa_mirror' });
    }
    for (let i = 0; i < 180; i++) {
      const name = `Old helper ${i + 1}`;
      const c = w.chat({
        kind: 'helper',
        title: name,
        at: start + (i + 1) * DAY,
        createdAt: start + i * DAY,
        archived: true,
        helper: { name, color: colors[i % colors.length]!, face: 'letter:O', job: 'An old helper.' },
      });
      chats.push({ id: c.chatId, helperId: c.helperId, kind: 'helper' });
    }

    // Messages: 5,000 in foo's chat, the rest spread over the other non-mirror chats; times uniform over 365 days, in order.
    const writable = chats.filter((c) => c.kind !== 'wa_mirror');
    const others = writable.slice(1);
    const perOther = Math.floor((PERF_MESSAGES - PERF_FOO_MESSAGES) / others.length);
    const plan: { chat: (typeof chats)[number]; n: number }[] = [{ chat: writable[0]!, n: PERF_FOO_MESSAGES }];
    others.forEach((c, i) => plan.push({ chat: c, n: perOther + (i < (PERF_MESSAGES - PERF_FOO_MESSAGES) % others.length ? 1 : 0) }));
    let taj = 0;
    let total = 0;
    for (const { chat, n } of plan) {
      const span = now - MIN - start;
      for (let i = 0; i < n; i++) {
        const at = Math.round(start + ((i + 0.5) / n) * span);
        const user = i % 2 === 0;
        const reply = chat.helperId ? { author: 'helper' as const, helperId: chat.helperId } : { author: 'foo' as const };
        const r = w.rand();
        total++;
        const forceTaj = taj < PERF_TAJ && total % 4001 === 0;
        if (forceTaj || r < 0.8) {
          let text = textOf(w);
          if (forceTaj) {
            text = `the Taj booking ${text}`.slice(0, 1400);
            taj++;
          }
          w.message(chat.id, user ? { author: 'user', text, at, badge: 'done' } : { ...reply, text, at });
        } else if (r < 0.88) {
          let x = w.rand();
          const [type, state] = CARD_MIX.find(([, , p]) => (x -= p) < 0) ?? CARD_MIX[0]!;
          w.card(chat.id, { ...reply, type, state, at, payload: { title: `${w.pick(WORDS)} ${type}` } });
        } else if (r < 0.93) {
          w.message(
            chat.id,
            user ? { author: 'user', kind: 'voice', voiceMs: 12_000, at, badge: 'done' } : { ...reply, kind: 'voice', voiceMs: 12_000, at },
          );
        } else if (r < 0.97) {
          const att = [{ id: `fl_${total}`, name: 'receipt.pdf', mime: 'application/pdf', bytes: 48_213, path: 'files/receipt.pdf' }];
          w.message(chat.id, { author: 'user', text: 'here you go', attachments: att, at, badge: 'done' });
        } else {
          w.message(chat.id, { author: 'system', kind: 'marker', markerKind: 'system_line', text: 'Messages cleared.', at });
        }
      }
    }
    // 2,000 finished jobs with 4–9 steps (done 70 %, failed 10 %, cancelled 10 %, done_unverified 10 %).
    for (let i = 0; i < PERF_JOBS; i++) {
      const chat = writable[i % writable.length]!;
      const x = w.rand();
      const state = x < 0.7 ? 'done' : x < 0.8 ? 'failed' : x < 0.9 ? 'cancelled' : 'done_unverified';
      const createdAt = Math.round(start + (i / PERF_JOBS) * (now - 2 * DAY - start));
      const n = 4 + Math.floor(w.rand() * 6);
      w.job({
        chatId: chat.id,
        ownerHelperId: chat.helperId ?? undefined,
        title: `${w.pick(WORDS)} job`,
        state,
        createdAt,
        finishedAt: createdAt + 20 * MIN,
        steps: Array.from({ length: n }, (_, k) => ({
          text: `Step ${k + 1}`,
          state: state === 'failed' && k === n - 1 ? 'failed' : 'done',
        })),
      });
    }
  })();
  db.pragma('foreign_keys = ON');
  const broken = db.pragma('foreign_key_check') as unknown[];
  if (broken.length) throw new Error(`perf seed broke ${broken.length} foreign keys`);
  const counts = w.finish(now);
  w.check();
  return { ...counts, refs };
}
