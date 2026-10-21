// Spec: 06-1 §2.0 (setup mode; `setup.step` 0 welcome, 1 find your AI, 2 name and face; written after every answered card;
// resume at the unfinished card; "Skip the rest" applies the defaults), §2.1 (the Welcome card, `setupCard: 'welcome'`;
// "Let's go" writes `setup.step = 1`), §2.3 (Card 2a name, Card 2b face, Card 2c vibe; "{Name} it is."; the vibe line).
// CR-0026 (option A, approved on Vikas's behalf 2026-10-21): first run is the welcome, the AI and step 2 only; after the
// vibe (or "Skip the rest") setup is complete and foo says a short warm hello with three things to try. The interview and
// the first real job (§2.4–§2.6) stay with P2 T4.
import { newNonce } from '../../shared/canon';
import { FACE_GLYPHS } from '../../shared/firstRunPools';
import { t } from '../../shared/copy/t';
import { newId } from '../../shared/ids';
import { settingsDefaults } from '../../shared/settingsDefaults';
import type { CardRow, ChoicePayload, SetupCardPayload } from '../../shared/types';
import type { DbOp } from '../../engine/protocol';
import { cardRow, type DbRow } from '../db/rows';
import { applyDbOps } from '../engine-supervisor/engineHost';
import type { Db } from '../store/db';
import { fooChatId } from '../store/queries';
import { ensureFinder, finderWanted, type FinderWrite, type SettingsPort } from './aiFinder';

/** Card 2a: at most 20 characters, at least one letter or digit (06-1 §2.3). A character is what the user sees (a
 * grapheme), as the field counts it: "नमस्ते" is 4, an emoji with a skin tone is 1. */
export const NAME_MAX = 20;
export type NameError = 'too_long' | 'no_letter';
const segmenter = new Intl.Segmenter('en-IN', { granularity: 'grapheme' });
export const graphemeCount = (s: string) => [...segmenter.segment(s)].length;
export function checkName(raw: string): { ok: true; name: string } | { ok: false; error: NameError } {
  const name = raw.trim();
  if (graphemeCount(name) > NAME_MAX) return { ok: false, error: 'too_long' };
  if (!/[\p{L}\p{N}]/u.test(name)) return { ok: false, error: 'no_letter' };
  return { ok: true, name };
}

/** Card 2b faces: the living face, or a glyph face (§F15.5 type 2). An own picture is not built yet (CR-0026 pick 5). */
export const FACES: ReadonlySet<string> = new Set(['living:default', ...FACE_GLYPHS.map((g) => `glyph:${g.glyph}\uFE0E`)]);

/** "Something else…" words in the vibe line are cut at whole characters to this many UTF-16 units, so the line stays
 * inside `identity.vibeLine` (200). */
const VIBE_WORDS_MAX = 160;
function cutWords(words: string): string {
  let out = '';
  for (const { segment } of segmenter.segment(words)) {
    if (out.length + segment.length > VIBE_WORDS_MAX) break;
    out += segment;
  }
  return out;
}

/** The vibe choices of Card 2c and the identity they write (06-1 §2.3 table). */
export const VIBES = {
  o1: { vibe: 'calm_funny', label: () => t('setup.vibe.option.calm_funny'), line: () => t('setup.vibe.line.calm_funny') },
  o2: { vibe: 'direct', label: () => t('setup.vibe.option.direct'), line: () => t('setup.vibe.line.direct') },
  o3: { vibe: 'warm', label: () => t('setup.vibe.option.warm'), line: () => t('setup.vibe.line.warm') },
} as const;
type VibeId = keyof typeof VIBES;

type Step2Card = 'name' | 'face' | 'vibe';

function setupCards(db: Db, chatId: string): CardRow[] {
  return (
    db
      .prepare(
        "SELECT * FROM cards WHERE chat_id = ? AND type IN ('setup', 'choice') AND json_extract(payload, '$.setupCard') IN ('welcome', 'name', 'face', 'vibe') AND deleted_at IS NULL ORDER BY created_at",
      )
      .all(chatId) as DbRow[]
  ).map(cardRow);
}

const which = (c: CardRow) => String((c.payload as { setupCard?: string }).setupCard);
const isOpen = (c: CardRow) => c.state === 'shown' || c.state === 'asking';

function insert(db: Db, ops: DbOp[], now: number, dataDir?: string): boolean {
  return applyDbOps(db, ops, { now, ...(dataDir ? { dataDir } : {}) }).result.ok;
}

function cardOps(chatId: string, type: 'setup' | 'choice', state: string, payload: object, now: number) {
  const cardId = newId('k', now);
  const messageId = newId('m', now);
  const ops: DbOp[] = [
    {
      op: 'insert',
      table: 'messages',
      row: { id: messageId, chat_id: chatId, author_kind: 'foo', kind: 'card', card_id: cardId, status: 'complete', created_at: now },
    },
    {
      op: 'insert',
      table: 'cards',
      row: { id: cardId, chat_id: chatId, message_id: messageId, type, state, payload, nonce: newNonce(), created_at: now },
    },
  ];
  return { cardId, messageId, ops };
}

/** A plain foo bubble (04): `{Name} it is.`, the vibe line, the hello. Suggestions are an update column (P1 T6), not an insert one. */
function bubbleOps(chatId: string, text: string, now: number, suggestions?: string[]) {
  const id = newId('m', now);
  const ops: DbOp[] = [
    {
      op: 'insert',
      table: 'messages',
      row: { id, chat_id: chatId, author_kind: 'foo', author_id: null, kind: 'text', text, status: 'complete', created_at: now },
    },
  ];
  if (suggestions) ops.push({ op: 'update', table: 'messages', id, set: { suggestions } });
  return { id, ops };
}

function step2Payload(card: Step2Card): SetupCardPayload | ChoicePayload {
  if (card !== 'vibe') return { setupCard: card };
  return {
    purpose: 'setup',
    setupCard: 'vibe',
    question: t('setup.vibe.question'),
    options: (Object.keys(VIBES) as VibeId[]).map((id, i) => ({ id, label: VIBES[id].label(), ...(i === 0 ? { bestFit: true } : {}) })),
    aiReversible: true,
    reversible: true,
    livePrices: false,
  };
}

/** The step-2 card to show next: the first of name → face → vibe not answered or skipped yet. */
function nextStep2(cards: CardRow[]): Step2Card | null {
  for (const k of ['name', 'face', 'vibe'] as const) if (!cards.some((c) => which(c) === k && !isOpen(c))) return k;
  return null;
}

/**
 * The one card first run wants on screen now (06-1 §2.0 rule 8: a launch resumes at the unfinished card; nothing is asked
 * twice). Step 0 → the Welcome card; step 1 → the AI finder; step 2 → the next of name, face, vibe. Posts nothing when that
 * card is already open.
 */
export function ensureSetupCard(db: Db, settings: SettingsPort, now: number, dataDir?: string): FinderWrite | null {
  const s = settings.get();
  if (s.setup.complete) return null;
  const chatId = fooChatId(db);
  if (!chatId) return null;
  const cards = setupCards(db, chatId);
  if (s.setup.step > 0) {
    // The AI was chosen some other way while the welcome was still open: it is answered, not asked again.
    const welcome = cards.find((c) => which(c) === 'welcome' && isOpen(c));
    if (welcome) insert(db, [collapse(welcome, 'answered')], now, dataDir);
  }
  if (s.setup.step === 0) {
    if (cards.some((c) => which(c) === 'welcome' && isOpen(c))) return null;
    const w = cardOps(chatId, 'setup', 'shown', { setupCard: 'welcome' } satisfies SetupCardPayload, now);
    return insert(db, w.ops, now, dataDir) ? { chatId, cardIds: [w.cardId], messageIds: [w.messageId] } : null;
  }
  if (s.setup.step === 1) {
    if (finderWanted(s)) return ensureFinder(db, settings, now, dataDir);
    settings.update((cur) => ({ ...cur, setup: { ...cur.setup, step: 2 } }));
  }
  if (cards.some((c) => which(c) !== 'welcome' && isOpen(c))) return null;
  const next = nextStep2(cards);
  if (!next) return complete(db, settings, chatId, now, dataDir);
  const w = cardOps(chatId, next === 'vibe' ? 'choice' : 'setup', next === 'vibe' ? 'asking' : 'shown', step2Payload(next), now);
  return insert(db, w.ops, now, dataDir) ? { chatId, cardIds: [w.cardId], messageIds: [w.messageId] } : null;
}

function openCard(db: Db, chatId: string, card: 'welcome' | Step2Card): CardRow | undefined {
  return setupCards(db, chatId).find((c) => which(c) === card && isOpen(c));
}

function collapse(c: CardRow, to: 'answered' | 'skipped', set: Record<string, unknown> = {}): DbOp {
  return { op: 'transition', table: 'cards', id: c.id, from: [c.state], to, set };
}

/** §2.1 "Let's go": the welcome card is answered, `setup.step = 1`, then the AI finder (or step 2 if an AI is already set). */
export function welcomeStart(db: Db, settings: SettingsPort, now: number, dataDir?: string): FinderWrite | null {
  const chatId = fooChatId(db);
  const s = settings.get();
  if (!chatId || s.setup.complete || s.setup.step !== 0) return null;
  const open = openCard(db, chatId, 'welcome');
  if (open && !insert(db, [collapse(open, 'answered')], now, dataDir)) return null;
  settings.update((cur) => ({ ...cur, setup: { ...cur.setup, step: 1 } }));
  return merge({ chatId, cardIds: open ? [open.id] : [], messageIds: [] }, ensureSetupCard(db, settings, now, dataDir));
}

function merge(a: FinderWrite, b: FinderWrite | null): FinderWrite {
  return b ? { chatId: a.chatId, cardIds: [...a.cardIds, ...b.cardIds], messageIds: [...a.messageIds, ...b.messageIds] } : a;
}

function setFooChat(db: Db, chatId: string, set: { title?: string; avatar_ref?: string }) {
  if (set.title !== undefined) db.prepare('UPDATE chats SET title = ?, rev = rev + 1 WHERE id = ?').run(set.title, chatId);
  if (set.avatar_ref !== undefined) db.prepare('UPDATE chats SET avatar_ref = ?, rev = rev + 1 WHERE id = ?').run(set.avatar_ref, chatId);
}

/** Card 2a answered (blank = Keep "foo"): writes `identity.agentName`, foo says "{Name} it is.", then the face card. */
export function nameAnswered(
  db: Db,
  settings: SettingsPort,
  raw: string,
  now: number,
  dataDir?: string,
): { ok: true; write: FinderWrite | null } | { ok: false; error: NameError | 'stale' } {
  const chatId = fooChatId(db);
  const open = chatId ? openCard(db, chatId, 'name') : undefined;
  if (!chatId || !open) return { ok: false, error: 'stale' };
  const checked = raw.trim() === '' ? ({ ok: true, name: settingsDefaults.identity.agentName } as const) : checkName(raw);
  if (!checked.ok) return checked;
  const name = checked.name;
  // Settings first: a name the settings refuse leaves the card open and nothing written.
  const before = settings.get().identity.agentName;
  try {
    settings.update((cur) => ({ ...cur, identity: { ...cur.identity, agentName: name } }));
  } catch {
    return { ok: false, error: 'too_long' };
  }
  const reply = bubbleOps(chatId, t('setup.name.reply', { name }), now + 1);
  if (!insert(db, [collapse(open, 'answered', { payload: { ...open.payload, answer: name } }), ...reply.ops], now, dataDir)) {
    settings.update((cur) => ({ ...cur, identity: { ...cur.identity, agentName: before } }));
    return { ok: false, error: 'stale' };
  }
  setFooChat(db, chatId, { title: name });
  const w = merge({ chatId, cardIds: [open.id], messageIds: [reply.id] }, ensureSetupCard(db, settings, now + 2, dataDir));
  return { ok: true, write: w };
}

/** Card 2b "Use this face": foo's chat wears the face everywhere (§F15.5.1), then the vibe card. */
export function faceChosen(db: Db, settings: SettingsPort, face: string, now: number, dataDir?: string): FinderWrite | null {
  if (!FACES.has(face)) return null;
  const chatId = fooChatId(db);
  const open = chatId ? openCard(db, chatId, 'face') : undefined;
  if (!chatId || !open) return null;
  if (!insert(db, [collapse(open, 'answered', { payload: { ...open.payload, answer: face } })], now, dataDir)) return null;
  setFooChat(db, chatId, { avatar_ref: face });
  return merge({ chatId, cardIds: [open.id], messageIds: [] }, ensureSetupCard(db, settings, now + 1, dataDir));
}

/** Card 2c answered (a Choice card, written by answerCard): the vibe line, then first run is complete. */
export function vibeAnswered(db: Db, settings: SettingsPort, card: CardRow, now: number, dataDir?: string): FinderWrite | null {
  const chatId = fooChatId(db);
  if (!chatId || card.chatId !== chatId || which(card) !== 'vibe') return null;
  const a = card.answer as { optionId?: string; text?: string; skip?: true } | null;
  const id = a?.optionId && a.optionId in VIBES ? (a.optionId as VibeId) : null;
  const typed = cutWords(a?.text?.trim() ?? '');
  const line = id ? VIBES[id].line() : typed ? t('setup.vibe.line.custom', { words: typed }) : VIBES.o1.line();
  const vibe = id ? VIBES[id].vibe : typed ? 'custom' : VIBES.o1.vibe;
  settings.update((cur) => ({ ...cur, identity: { ...cur.identity, vibe, vibeLine: line } }));
  const b = bubbleOps(chatId, line, now);
  if (!insert(db, b.ops, now, dataDir)) return null;
  return merge({ chatId, cardIds: [], messageIds: [b.id] }, complete(db, settings, chatId, now + 1, dataDir));
}

/** §2.0 "Skip the rest" (shown from step 2): open step-2 cards are skipped, the defaults stand, then the hello. */
export function skipRest(db: Db, settings: SettingsPort, now: number, dataDir?: string): FinderWrite | null {
  const s = settings.get();
  const chatId = fooChatId(db);
  if (!chatId || s.setup.complete || s.setup.step < 2) return null;
  const cards = setupCards(db, chatId);
  const open = cards.filter((c) => which(c) !== 'welcome' && isOpen(c));
  // The defaults stand: "foo", the living face, and the Best fit vibe unless one was already picked.
  if (!cards.some((c) => which(c) === 'vibe' && !isOpen(c)))
    settings.update((cur) => ({ ...cur, identity: { ...cur.identity, vibe: VIBES.o1.vibe, vibeLine: VIBES.o1.line() } }));
  const b = bubbleOps(chatId, t('setup.skip_rest.reply'), now);
  if (!insert(db, [...open.map((c) => collapse(c, 'skipped')), ...b.ops], now, dataDir)) return null;
  return merge({ chatId, cardIds: open.map((c) => c.id), messageIds: [b.id] }, complete(db, settings, chatId, now + 1, dataDir));
}

/** CR-0026: setup is complete; foo says hello with three things to try (shown as the reply's suggestion chips). */
function complete(db: Db, settings: SettingsPort, chatId: string, now: number, dataDir?: string): FinderWrite | null {
  settings.update((cur) => ({ ...cur, setup: { ...cur.setup, complete: true, step: 5 } }));
  const name = settings.get().identity.agentName;
  const tries = [t('setup.hello.try_1'), t('setup.hello.try_2'), t('setup.hello.try_3')];
  const b = bubbleOps(chatId, t('setup.hello.line', { name }), now, tries);
  return insert(db, b.ops, now, dataDir) ? { chatId, cardIds: [], messageIds: [b.id] } : null;
}

/** The answered setup card's row, for callers that hold only an id. */
export function cardById(db: Db, id: string): CardRow | null {
  const r = db.prepare('SELECT * FROM cards WHERE id = ?').get(id) as DbRow | undefined;
  return r ? cardRow(r) : null;
}
