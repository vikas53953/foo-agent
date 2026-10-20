// Spec: 08-1 §3.2 `kit:action` (KitActionMessage → `void`, sends one MainToEngine `kit.action`; VALIDATION), 04 §13.5
// (user actions in a surface go renderer → main → engine; any action that would send, book, pay, delete or share is an
// approval request, never a direct action, Article 6: main forwards and the engine handles it as if the user typed it),
// Article 8 / 04-2 §22.4 (a value that looks like a secret never leaves for the AI: refused again here after the renderer),
// X-124 (one IPC call = exactly one engine message), CR-0022 AT-355, AT-356, X-180. R1 T2. R1 T3: a keycap reaction on foo's
// message picks that row of its ListPick, through the same handler as a tap (05-1 §5.3.4, AT-349); a ListPick or TimePick
// answers once, like a Choice card (05-1 §5.3.5): a second pick, tap or reaction, is refused here.
import { fail, ok, type Result } from '../../shared/errors';
import type { KitActionMessage } from '../../shared/kit/catalog';
import {
  answeredChoice,
  hostSurfaces,
  isPick,
  keycapRow,
  kitPickOf,
  pickContext,
  reactionListPick,
  type PickScanRow,
} from '../../shared/kit/pick';
import { kitMessagesOf } from '../../shared/kit/surface';
import { checkSecret } from '../../shared/redactor';
import type { EngineBridge } from '../engine-supervisor/EngineBridge';
import type { AppContext, handle as Handle } from '../ipc/IpcRouter';
import type { Db } from '../store/db';

export interface KitDeps {
  /** The ```a2ui text of the surface's host: a foo message or a `kit` card in that chat; null when there is none. */
  hostText(chatId: string, host: { messageId: string } | { cardId: string }): string | null;
  /** The chat's messages after the host (a message, or a card's message), in chat order; [] when there are none. */
  later?(chatId: string, host: { messageId: string } | { cardId: string }): PickScanRow[];
  engine(): Pick<EngineBridge, 'send'> | undefined;
  log(line: string): void;
}

const strings = (v: unknown): string[] =>
  typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : [];

/** How many of the chat's later messages are read for the answer and the later fences (the engine reads 50 for fences). */
const LATER_ROWS = 200;

/** Electron-free: checks the surface exists where the action says it lives, then forwards exactly one `kit.action`. */
export function kitActionHandler(d: KitDeps): (req: KitActionMessage) => Result<void> {
  return (req) => {
    const host = req.messageId !== undefined ? { messageId: req.messageId } : { cardId: req.cardId! };
    const text = d.hostText(req.chatId, host);
    if (text === null) return fail('NOT_FOUND');
    const created = kitMessagesOf(text).messages.some((m) => 'createSurface' in m && m.createSurface.surfaceId === req.surfaceId);
    if (!created) return fail('NOT_FOUND');
    if (strings(req.context).some((s) => checkSecret(s) !== null)) return fail('SECRET_SUSPECTED');
    // 05-1 §5.3.5: a pick answers once; a second tap or reaction is refused (the first answer stays in the chat).
    const after = d.later?.(req.chatId, host) ?? [];
    const source = hostSurfaces(text, after).find((x) => x.id === req.surfaceId)?.components[req.sourceComponentId];
    if (isPick(source) && answeredChoice(after, req.surfaceId, source.id) !== null) return fail('VALIDATION', 'already answered');
    if (!d.engine()?.send('kit.action', req)) return fail('UNKNOWN', 'engine not running');
    // Tech log: the action's name only, never its values (08-1 §0.6).
    d.log(`kit: action ${req.name}`);
    return ok(undefined);
  };
}

/** Reads for the handler from foo.db: a live foo or helper message, or a live `kit` card (its payload body as a fence). */
export function kitDbReads(db: Db): Pick<KitDeps, 'hostText' | 'later'> {
  const message = db.prepare("SELECT text FROM messages WHERE id = ? AND chat_id = ? AND author_kind = 'foo' AND deleted_at IS NULL");
  const card = db.prepare("SELECT payload FROM cards WHERE id = ? AND chat_id = ? AND type = 'kit' AND deleted_at IS NULL");
  const seqOfMessage = db.prepare('SELECT seq FROM messages WHERE id = ? AND chat_id = ?');
  const seqOfCard = db.prepare('SELECT m.seq FROM cards c JOIN messages m ON m.id = c.message_id WHERE c.id = ? AND c.chat_id = ?');
  const after = db.prepare(
    `SELECT author_kind, text, text_for_ai FROM messages WHERE chat_id = ? AND seq > ? AND deleted_at IS NULL ORDER BY seq LIMIT ${LATER_ROWS}`,
  );
  return {
    later: (chatId, host) => {
      const row = ('messageId' in host ? seqOfMessage.get(host.messageId, chatId) : seqOfCard.get(host.cardId, chatId)) as
        { seq: number } | undefined;
      if (!row) return [];
      return (after.all(chatId, row.seq) as { author_kind: string; text: string | null; text_for_ai: string | null }[]).map((r) => ({
        authorKind: r.author_kind,
        text: r.text ?? '',
        kitPick: r.author_kind === 'user' ? kitPickOf(r.text_for_ai) : null,
      }));
    },
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
 * 05-1 §5.3.4 for kit: a reaction 1️⃣–🔟 on a foo message answers the first ListPick its surfaces draw (the chat's later foo
 * fences folded in), exactly as a tap on that row would (one `kit.action`). Any other emoji, a row past the end, or a
 * message with no ListPick does nothing.
 */
export function kitReactionAction(
  d: Pick<KitDeps, 'hostText' | 'later'>,
  chatId: string,
  messageId: string,
  emoji: string,
  now: number,
): KitActionMessage | null {
  const n = keycapRow(emoji);
  if (n === null) return null;
  const text = d.hostText(chatId, { messageId });
  if (text === null) return null;
  const found = reactionListPick(hostSurfaces(text, d.later?.(chatId, { messageId }) ?? []));
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
  if (keycapRow(emoji) === null) return;
  const row = ctx.db.prepare("SELECT chat_id FROM messages WHERE id = ? AND author_kind = 'foo'").get(messageId) as
    { chat_id: string } | undefined;
  if (!row) return;
  const deps: KitDeps = { ...kitDbReads(ctx.db), engine: () => ctx.engine, log: (line) => console.info(line) };
  const action = kitReactionAction(deps, row.chat_id, messageId, emoji, now);
  // A second answer is refused inside the handler (05-1 §5.3.5); nothing to tell the user beyond their reaction.
  if (action) kitActionHandler(deps)(action);
}

/** IpcRouter's one line. */
export function registerKitIpc(ctx: AppContext, handle: typeof Handle): void {
  handle('kit:action', kitActionHandler({ ...kitDbReads(ctx.db), engine: () => ctx.engine, log: (line) => console.info(line) }));
}
