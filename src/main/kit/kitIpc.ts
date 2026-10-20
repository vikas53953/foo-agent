// Spec: 08-1 §3.2 `kit:action` (KitActionMessage → `void`, sends one MainToEngine `kit.action`; VALIDATION), 04 §13.5
// (user actions in a surface go renderer → main → engine; any action that would send, book, pay, delete or share is an
// approval request, never a direct action, Article 6: main forwards and the engine handles it as if the user typed it),
// Article 8 / 04-2 §22.4 (a value that looks like a secret never leaves for the AI: refused again here after the renderer),
// X-124 (one IPC call = exactly one engine message), CR-0022 AT-355, AT-356, X-180. R1 T2. R1 T3: a keycap reaction on foo's
// message picks that row of its ListPick, through the same handler as a tap (05-1 §5.3.4, AT-349).
import { fail, ok, type Result } from '../../shared/errors';
import type { KitActionMessage } from '../../shared/kit/catalog';
import { keycapRow, pickContext, reactionListPick } from '../../shared/kit/pick';
import { foldFence, kitMessagesOf } from '../../shared/kit/surface';
import { checkSecret } from '../../shared/redactor';
import type { EngineBridge } from '../engine-supervisor/EngineBridge';
import type { AppContext, handle as Handle } from '../ipc/IpcRouter';
import type { Db } from '../store/db';

export interface KitDeps {
  /** The ```a2ui text of the surface's host: a foo message or a `kit` card in that chat; null when there is none. */
  hostText(chatId: string, host: { messageId: string } | { cardId: string }): string | null;
  engine(): Pick<EngineBridge, 'send'> | undefined;
  log(line: string): void;
}

const strings = (v: unknown): string[] =>
  typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : [];

/** Electron-free: checks the surface exists where the action says it lives, then forwards exactly one `kit.action`. */
export function kitActionHandler(d: KitDeps): (req: KitActionMessage) => Result<void> {
  return (req) => {
    const host = req.messageId !== undefined ? { messageId: req.messageId } : { cardId: req.cardId! };
    const text = d.hostText(req.chatId, host);
    if (text === null) return fail('NOT_FOUND');
    const created = kitMessagesOf(text).messages.some((m) => 'createSurface' in m && m.createSurface.surfaceId === req.surfaceId);
    if (!created) return fail('NOT_FOUND');
    if (strings(req.context).some((s) => checkSecret(s) !== null)) return fail('SECRET_SUSPECTED');
    if (!d.engine()?.send('kit.action', req)) return fail('UNKNOWN', 'engine not running');
    // Tech log: the action's name only, never its values (08-1 §0.6).
    d.log(`kit: action ${req.name}`);
    return ok(undefined);
  };
}

/** Reads for the handler from foo.db: a live foo or helper message, or a live `kit` card (its payload body as a fence). */
export function kitDbReads(db: Db): Pick<KitDeps, 'hostText'> {
  const message = db.prepare("SELECT text FROM messages WHERE id = ? AND chat_id = ? AND author_kind = 'foo' AND deleted_at IS NULL");
  const card = db.prepare("SELECT payload FROM cards WHERE id = ? AND chat_id = ? AND type = 'kit' AND deleted_at IS NULL");
  return {
    hostText: (chatId, host) => {
      if ('messageId' in host) {
        const row = message.get(host.messageId, chatId) as { text: string } | undefined;
        return row?.text ?? null;
      }
      const row = card.get(host.cardId, chatId) as { payload: string } | undefined;
      if (!row) return null;
      try {
        const body = (JSON.parse(row.payload) as { body?: unknown }).body;
        return typeof body === 'string' ? `\`\`\`a2ui\n${body}\n\`\`\`` : null;
      } catch {
        return null;
      }
    },
  };
}

/**
 * 05-1 §5.3.4 for kit: a reaction 1️⃣–🔟 on a foo message answers the first ListPick its surfaces draw, exactly as a tap on
 * that row would (one `kit.action`). Any other emoji, a row past the end, or a message with no ListPick does nothing.
 */
export function kitReactionAction(
  hostText: KitDeps['hostText'],
  chatId: string,
  messageId: string,
  emoji: string,
  now: number,
): KitActionMessage | null {
  const n = keycapRow(emoji);
  const text = n === null ? null : hostText(chatId, { messageId });
  if (n === null || text === null) return null;
  const found = reactionListPick(foldFence([kitMessagesOf(text).messages], 0).surfaces);
  const row = found?.pick.rows[n - 1];
  if (!found || !row) return null;
  return {
    chatId,
    messageId,
    surfaceId: found.surface.id,
    name: found.pick.action.event.name,
    sourceComponentId: found.pick.id,
    context: pickContext(found.pick, found.surface.data, '', { choice: row.title, row: n }),
    timestamp: new Date(now).toISOString(),
  };
}

/** IpcRouter's message:react line: a keycap reaction on a foo message with a ListPick sends its pick (R1 T3). */
export function kitReaction(ctx: AppContext, messageId: string, emoji: string, now: number): void {
  const reads = kitDbReads(ctx.db);
  const row = ctx.db.prepare("SELECT chat_id FROM messages WHERE id = ? AND author_kind = 'foo'").get(messageId) as
    { chat_id: string } | undefined;
  const action = row ? kitReactionAction(reads.hostText, row.chat_id, messageId, emoji, now) : null;
  if (action) kitActionHandler({ ...reads, engine: () => ctx.engine, log: (line) => console.info(line) })(action);
}

/** IpcRouter's one line. */
export function registerKitIpc(ctx: AppContext, handle: typeof Handle): void {
  handle('kit:action', kitActionHandler({ ...kitDbReads(ctx.db), engine: () => ctx.engine, log: (line) => console.info(line) }));
}
