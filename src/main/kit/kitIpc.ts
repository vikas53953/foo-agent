// Spec: 08-1 §3.2 `kit:action` (KitActionMessage → `void`, sends one MainToEngine `kit.action`; VALIDATION), 04 §13.5
// (user actions in a surface go renderer → main → engine; any action that would send, book, pay, delete or share is an
// approval request, never a direct action, Article 6: main forwards and the engine handles it as if the user typed it),
// Article 8 / 04-2 §22.4 (a value that looks like a secret never leaves for the AI: refused again here after the renderer),
// X-124 (one IPC call = exactly one engine message), CR-0022 AT-355, AT-356, X-180. R1 T2.
import { fail, ok, type Result } from '../../shared/errors';
import type { KitActionMessage } from '../../shared/kit/catalog';
import { kitMessagesOf } from '../../shared/kit/surface';
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
  const message = db.prepare(
    "SELECT text FROM messages WHERE id = ? AND chat_id = ? AND author_kind IN ('foo','helper') AND deleted_at IS NULL",
  );
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

/** IpcRouter's one line. */
export function registerKitIpc(ctx: AppContext, handle: typeof Handle): void {
  handle('kit:action', kitActionHandler({ ...kitDbReads(ctx.db), engine: () => ctx.engine, log: (line) => console.info(line) }));
}
