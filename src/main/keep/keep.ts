// Spec: CR-0022 pick 9 (Keep: a kept item is a `kept_items` row shown in the chat's Files tab; kit surfaces are stored as
// their A2UI JSON plus a PNG snapshot, AI pages as a `.foopage` blob plus a PNG; "Open" always reopens a kept page in the
// sealed box, never with `shell.openPath`; "Show in folder" is allowed; no plain `.html` file is ever written), pick 15
// (a kept page is served from its `.foopage` blob through the same `pages.serve()` path), 08-1 §3.2 `keep:save` /
// `keep:list` / `keep:open` / `keep:showInFolder`, 08-1 §4.2 item 6 (migration 0004 `kept_items`), 08-0 §G.2 (card states
// `kit` shown | kept, `ai_page` … | kept), AT-369, X-180. R1 T7.
// Electron-free: main's IPC wires the file writes, the snapshot and Explorer (keepIpc.ts).
import { join } from 'node:path';
import { fail, ok, type Result } from '../../shared/errors';
import { KEPT_EXT, keptSurfaceId } from '../../shared/kit/keep';
import { kitMessagesOf } from '../../shared/kit/surface';
import { newId } from '../../shared/ids';
import type { CardRow, KeptItem, KeptKind } from '../../shared/types';
import { cardRow, type DbRow } from '../db/rows';
import { pageBodies } from '../page/pages';
import type { Db } from '../store/db';

export interface KeepSave {
  chatId: string;
  messageId?: string;
  cardId?: string;
  kind: KeptKind;
  title: string;
  body: string;
}

export interface KeepDeps {
  db: Db;
  /** {DATA}: kept bodies and snapshots live in {DATA}\kept\. */
  dataDir: string;
  now(): number;
  writeFile(path: string, data: string | Uint8Array): Promise<void>;
  readFile(path: string): Promise<string>;
  /** The PNG snapshot of what the user kept, or null when none could be made (the item is still kept). */
  snapshot(): Promise<Uint8Array | null>;
}

const keptRow = (r: DbRow): KeptItem => ({
  id: r.id as string,
  chatId: r.chat_id as string,
  messageId: (r.message_id as string | null) ?? null,
  cardId: (r.card_id as string | null) ?? null,
  kind: r.kind as KeptKind,
  title: r.title as string,
  pngPath: (r.png_path as string | null) ?? null,
  createdAt: r.created_at as number,
});

/** The kept row with its body file (main only: the renderer never sees a body path). */
export function keptGet(db: Db, id: string): (KeptItem & { bodyPath: string }) | null {
  const r = db.prepare('SELECT * FROM kept_items WHERE id = ?').get(id) as DbRow | undefined;
  return r ? { ...keptRow(r), bodyPath: r.body_path as string } : null;
}

/** `keep:list`: the chat's kept items, newest first. */
export function keepList(db: Db, chatId: string): KeptItem[] {
  return (db.prepare('SELECT * FROM kept_items WHERE chat_id = ? ORDER BY created_at DESC, id DESC').all(chatId) as DbRow[]).map(keptRow);
}

/**
 * The body is what the host really holds: a kit body creates one surface that the host's own fences create; a page body is
 * one of the host's closed ```page blocks or its `ai_page` card's html. Only foo's own live text hosts either (pick 12).
 */
function hostHolds(db: Db, req: KeepSave): { card: CardRow | null } | null {
  if (req.messageId !== undefined) {
    const m = db
      .prepare(
        "SELECT text FROM messages WHERE id = ? AND chat_id = ? AND author_kind = 'foo' AND status != 'streaming' AND deleted_at IS NULL",
      )
      .get(req.messageId, req.chatId) as { text: string } | undefined;
    if (!m) return null;
    if (req.kind === 'page') return pageBodies(m.text).some((b) => b.closed && b.body === req.body) ? { card: null } : null;
    const id = keptSurfaceId(req.body);
    const created = kitMessagesOf(m.text).messages.some((x) => 'createSurface' in x && x.createSurface.surfaceId === id);
    return id !== null && created ? { card: null } : null;
  }
  const r = db
    .prepare('SELECT * FROM cards WHERE id = ? AND chat_id = ? AND type = ? AND deleted_at IS NULL')
    .get(req.cardId, req.chatId, req.kind === 'kit' ? 'kit' : 'ai_page') as DbRow | undefined;
  if (!r) return null;
  const card = cardRow(r);
  if (req.kind === 'page') return card.payload.html === req.body ? { card } : null;
  const body = card.payload.body;
  const id = keptSurfaceId(req.body);
  const created =
    typeof body === 'string' &&
    kitMessagesOf(`\`\`\`a2ui\n${body}\n\`\`\``).messages.some((x) => 'createSurface' in x && x.createSurface.surfaceId === id);
  return id !== null && created ? { card } : null;
}

/** States a kept card moves from (08-0 §G.2): a shown surface, a ready page. */
const KEEPABLE: Record<string, string> = { kit: 'shown', ai_page: 'ready' };

/**
 * `keep:save`: writes the body (`.json` or `.foopage`, never `.html`) and its PNG under {DATA}\kept\, then the row. A kept
 * card moves to its `kept` state (returned so main can push it). Keeping the same thing twice keeps it once.
 */
export async function keepSave(d: KeepDeps, req: KeepSave): Promise<Result<{ item: KeptItem; card: CardRow | null }>> {
  if ((req.messageId === undefined) === (req.cardId === undefined)) return fail('VALIDATION');
  const host = hostHolds(d.db, req);
  if (!host) return fail('NOT_FOUND');
  const same = d.db
    .prepare(
      'SELECT id, body_path FROM kept_items WHERE chat_id = ? AND kind = ? AND (message_id IS ? AND card_id IS ?) ORDER BY created_at DESC',
    )
    .all(req.chatId, req.kind, req.messageId ?? null, req.cardId ?? null) as { id: string; body_path: string }[];
  for (const s of same) {
    const known = await d.readFile(s.body_path).catch(() => null);
    if (known === req.body) return ok({ item: keptGet(d.db, s.id)!, card: null });
  }
  const now = d.now();
  const id = newId('ki', now);
  const bodyPath = join(d.dataDir, 'kept', `${id}.${KEPT_EXT[req.kind]}`);
  const pngPath = join(d.dataDir, 'kept', `${id}.png`);
  try {
    await d.writeFile(bodyPath, req.body);
  } catch {
    return fail('DISK_FULL');
  }
  const png = await d.snapshot().catch(() => null);
  const wrote = png
    ? await d.writeFile(pngPath, png).then(
        () => true,
        () => false,
      )
    : false;
  let card: CardRow | null = null;
  d.db.transaction(() => {
    d.db
      .prepare(
        'INSERT INTO kept_items (id, chat_id, message_id, card_id, kind, title, body_path, png_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(id, req.chatId, req.messageId ?? null, req.cardId ?? null, req.kind, req.title, bodyPath, wrote ? pngPath : null, now);
    const c = host.card;
    if (c && c.state === KEEPABLE[c.type]) {
      d.db.prepare("UPDATE cards SET state = 'kept', rev = rev + 1, updated_at = ? WHERE id = ?").run(now, c.id);
      card = cardRow(d.db.prepare('SELECT * FROM cards WHERE id = ?').get(c.id) as DbRow);
    }
  })();
  return ok({ item: keptGet(d.db, id)!, card });
}

/** `keep:open`: the kept body for the kit renderer, or for the sealed box (a page then opens through `page:open`). */
export async function keepOpen(d: Pick<KeepDeps, 'db' | 'readFile'>, id: string): Promise<Result<{ kind: KeptKind; body: string }>> {
  const k = keptGet(d.db, id);
  if (!k) return fail('NOT_FOUND');
  const body = await d.readFile(k.bodyPath).catch(() => null);
  return body === null ? fail('NOT_FOUND') : ok({ kind: k.kind, body });
}
