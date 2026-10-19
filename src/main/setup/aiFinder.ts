// Spec: 06-1 §2.0 (setup mode; `setup.step` 1 = find your AI; written after every answered card; resume: "Step 1 resumes from a
// fresh detection"), §2.2 (the AI finder card: card type `setup`, payload `setupCard: 'ai_finder'`, X-119; after "Use …" the card
// collapses to "✓ Using {Claude} (your AI)" and `setup.step = 2`; "I have a key" → the 05 Secret box with the lead line "To use
// your own AI I need your {OpenAI} key. Paste it in the box below, not in the chat."), 06-2 §6.1 ("Change" and "Add another AI"
// post the §2.2 card in foo's chat, without the step pill), 08-0 §E.5 (`maker-pages.json`, read only by `app:openExternal`
// target `maker_page`; foo installs nothing, X-42), 08-0 §E.8 (vault `foo/ai_key/{providerId}`), 08-0 §G.2 (setup card states
// `shown | answered | skipped`). CR-0020 (b): until M12 builds the welcome card, a first run with no AI opens on this card.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { AI_MAKER, AI_NAME } from '../../shared/aiNames';
import { newNonce } from '../../shared/canon';
import { t } from '../../shared/copy/t';
import { newId } from '../../shared/ids';
import type { Settings } from '../../shared/settings';
import type { CardRow, KeyProviderId, ProviderId, SecretPayload, SetupCardPayload } from '../../shared/types';
import type { DbOp } from '../../engine/protocol';
import { cardRow, type DbRow } from '../db/rows';
import { applyDbOps } from '../engine-supervisor/engineHost';
import type { Db } from '../store/db';
import { fooChatId } from '../store/queries';

export interface SettingsPort {
  get(): Settings;
  update(patch: (s: Settings) => Settings): void;
}

/** What a post or a collapse wrote, for the window upserts. */
export interface FinderWrite {
  chatId: string;
  cardIds: string[];
  messageIds: string[];
}

/** 06-1 §2.0: setup is on step 1 (or the welcome step M12 has not built yet) and no AI was chosen. */
export function finderWanted(s: Settings): boolean {
  return !s.setup.complete && s.setup.step <= 1 && s.ai.primary === null;
}

function openFinders(db: Db, chatId: string): CardRow[] {
  return (
    db
      .prepare(
        "SELECT * FROM cards WHERE chat_id = ? AND type = 'setup' AND state = 'shown' AND json_extract(payload, '$.setupCard') = 'ai_finder' AND deleted_at IS NULL ORDER BY created_at",
      )
      .all(chatId) as DbRow[]
  ).map(cardRow);
}

function insertCard(db: Db, chatId: string, type: 'setup' | 'secret', state: string, payload: object, now: number, dataDir?: string) {
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
  const r = applyDbOps(db, ops, { now, ...(dataDir ? { dataDir } : {}) }).result;
  return r.ok ? { cardId, messageId } : null;
}

/** Posts a fresh AI finder card in foo's chat (06-2 §6.1 "Change" / "Add another AI"; a first run's card). */
export function postFinder(db: Db, now: number, dataDir?: string): FinderWrite | null {
  const chatId = fooChatId(db);
  if (!chatId) return null;
  const payload: SetupCardPayload = { setupCard: 'ai_finder' };
  const r = insertCard(db, chatId, 'setup', 'shown', payload, now, dataDir);
  return r ? { chatId, cardIds: [r.cardId], messageIds: [r.messageId] } : null;
}

/**
 * 06-2 §6.1 "Change" / "Add another AI": a fresh finder card at the bottom of foo's chat. An older finder card still open is
 * closed as `skipped`, so only the newest card runs detection.
 */
export function openFinder(db: Db, now: number, dataDir?: string): FinderWrite | null {
  const chatId = fooChatId(db);
  if (!chatId) return null;
  const open = openFinders(db, chatId);
  if (open.length) {
    const ops: DbOp[] = open.map((c) => ({ op: 'transition', table: 'cards', id: c.id, from: ['shown'], to: 'skipped' }));
    if (!applyDbOps(db, ops, { now, ...(dataDir ? { dataDir } : {}) }).result.ok) return null;
  }
  const w = postFinder(db, now, dataDir);
  return w ? { ...w, cardIds: [...open.map((c) => c.id), ...w.cardIds] } : null;
}

/**
 * First run (06-1 §2.0, AT-006): while no AI is chosen, foo's chat holds one open AI finder card and `setup.step` is 1. Nothing
 * is posted when a finder card is already open (a restart re-runs detection inside the same card, rule 8).
 */
export function ensureFinder(db: Db, settings: SettingsPort, now: number, dataDir?: string): FinderWrite | null {
  const s = settings.get();
  if (!finderWanted(s)) return null;
  if (s.setup.step === 0) settings.update((cur) => ({ ...cur, setup: { ...cur.setup, step: 1 } }));
  const chatId = fooChatId(db);
  if (!chatId || openFinders(db, chatId).length > 0) return null;
  return postFinder(db, now, dataDir);
}

/**
 * After `ai:choose` (06-1 §2.2 step 5): every open finder card collapses to "✓ Using {AI} (your AI)" (state `answered`,
 * payload `using`), and a first run moves on to step 2.
 */
export function finderChosen(db: Db, settings: SettingsPort, primary: ProviderId, now: number, dataDir?: string): FinderWrite | null {
  const s = settings.get();
  if (!s.setup.complete && s.setup.step <= 1) settings.update((cur) => ({ ...cur, setup: { ...cur.setup, step: 2 } }));
  const chatId = fooChatId(db);
  if (!chatId) return null;
  const open = openFinders(db, chatId);
  if (!open.length) return null;
  const ops: DbOp[] = open.map((c) => ({
    op: 'transition',
    table: 'cards',
    id: c.id,
    from: ['shown'],
    to: 'answered',
    set: { payload: { ...(c.payload as unknown as SetupCardPayload), using: primary } },
  }));
  const r = applyDbOps(db, ops, { now, ...(dataDir ? { dataDir } : {}) }).result;
  return r.ok ? { chatId, cardIds: open.map((c) => c.id), messageIds: [] } : null;
}

/** 06-1 §2.2 "I have a key" / "Add in secret box" / "Replace key": the key's Secret box in foo's chat (05-2 §5.8). */
export function postKeyBox(db: Db, providerId: KeyProviderId, now: number, dataDir?: string): { card: CardRow; write: FinderWrite } | null {
  const chatId = fooChatId(db);
  if (!chatId) return null;
  const payload: SecretPayload = {
    secretKind: 'ai_key',
    name: AI_NAME[providerId],
    why: t('cards.secret.reason.ai_key', { service: AI_MAKER[providerId] }),
    fields: [{ key: 'value', label: '', masked: true }],
    vaultName: providerId,
  };
  const r = insertCard(db, chatId, 'secret', 'asking', payload, now, dataDir);
  if (!r) return null;
  const row = db.prepare('SELECT * FROM cards WHERE id = ?').get(r.cardId) as DbRow;
  return { card: cardRow(row), write: { chatId, cardIds: [r.cardId], messageIds: [r.messageId] } };
}

// ---------------------------------------------------------------- maker pages (08-0 §E.5)

const page = z.object({ name: z.string().min(1), maker: z.string().min(1), url: z.string().url().startsWith('https://') }).strict();
export const MakerPagesSchema = z.object({ 'claude-cli': page, 'codex-cli': page, 'gemini-cli': page, ollama: page }).strict();
export type MakerPages = z.infer<typeof MakerPagesSchema>;

/** Reads and validates `resources/maker-pages.json` (throws on a bad file: a startup error, 08-0 §E.5). */
export function loadMakerPages(resourcesDir: string): MakerPages {
  return MakerPagesSchema.parse(JSON.parse(readFileSync(join(resourcesDir, 'maker-pages.json'), 'utf8')));
}

/** The maker page for a helper, or null for any other provider (`URL_NOT_ALLOWED` at the channel; AT-155a). */
export function makerPageUrl(pages: MakerPages, providerId: string | undefined): string | null {
  return providerId && Object.hasOwn(pages, providerId) ? pages[providerId as keyof MakerPages].url : null;
}
