// Spec: 08-1 §2.4 MainToEngine `kit.action` ("the A2UI client `action`; a gated action is handled as if the user typed
// it", Article 6), 04 §13.5 (user actions go renderer → main → engine; any action that would send, book, pay, delete or
// share is an approval request, never a direct action), CR-0022 AT-355 (the action reaches the engine and the surface
// updates from the reply), AT-356 (a gated Button opens an approval), X-180. R1 T2. R1 T7: MainToEngine `kit.refresh`
// (a LiveStamp's Refresh, AT-352, AT-368) is stored the same way, as the user tapping "Refresh", and asks the AI for the
// surface's data again with a new LiveStamp asOf.
// The engine never acts on a surface action itself: it stores the tap as the user's message (the Button's own words, or
// its action name) with the action for the AI beside it (`text_for_ai`), and hands it to the chat lane like a typed
// message. So an action that would send, book, pay, delete or share meets the same intake, job and gate (08-2 §9.4) as the
// user typing those words, and the reply that follows can update the surface by naming its surfaceId.
import type { Clock } from '../../shared/clock';
import { t } from '../../shared/copy/t';
import type { KitActionMessage } from '../../shared/kit/catalog';
import { buttonWords, foldFence, kitMessagesOf, type Surface } from '../../shared/kit/surface';
import type { CardRow } from '../../shared/types';
import type { EngineMessage } from '../../main/db/queries';
import type { MainLink } from '../protocol';

export interface KitActionDeps {
  link: MainLink;
  clock: Clock;
  newId(prefix: 'm'): string;
  /** The chat lane takes the stored message like a typed one (`user.message`). */
  enqueue(chatId: string, messageId: string): void;
  log(evt: string, kind?: string): void;
}

/** The longest words a tap may put in the user's bubble (a Button label is ≤ 2,000 chars in the catalog; a bubble line is short). */
const WORDS_MAX = 120;
/** The action context the AI reads, cut to stay inside the prompt budget (08-4 §24 part 7 caps one message at 2,000). */
const CONTEXT_MAX = 1_500;
/** How many of the chat's newest messages are read for later replies that update the surface. */
const LATER_REPLIES = 50;

/** "compare_last_month" → "Compare last month": the words when a Button has no Text child. */
export function actionWords(name: string): string {
  const s = name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_.-]+/g, ' ')
    .trim()
    .toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The line the AI reads for the tap (08-4 §24 conversation line); not shown to the user. */
export function actionForAi(words: string, a: KitActionMessage): string {
  const context = JSON.stringify(a.context);
  return [
    `${words}`,
    `(I tapped "${words}" in your ${a.surfaceId} surface: action ${a.name}, context ${context.length > CONTEXT_MAX ? `${context.slice(0, CONTEXT_MAX)}…` : context}.`,
    `To change that surface, reply with an \`\`\`a2ui block that sends updateDataModel or updateComponents for surfaceId "${a.surfaceId}" without createSurface.)`,
  ].join('\n');
}

/** The line the AI reads for a LiveStamp's Refresh (08-4 §24 conversation line); not shown to the user. */
export function refreshForAi(words: string, surfaceId: string): string {
  return [
    words,
    `(I tapped Refresh on your ${surfaceId} surface. Get its data again now. Reply with an \`\`\`a2ui block that sends updateDataModel with the new values and updateComponents with its LiveStamp's new asOf (epoch ms) for surfaceId "${surfaceId}", without createSurface.)`,
  ].join('\n');
}

export type KitRefresh = { chatId: string; messageId?: string; cardId?: string; surfaceId: string };

export class KitActions {
  constructor(private readonly d: KitActionDeps) {}

  private async query<T>(q: string, ...args: unknown[]): Promise<T | null> {
    const r = await this.d.link.request<T>('db.query', { q, args });
    return r.ok ? r.value : null;
  }

  /**
   * The surface as the renderer draws it: its host message (or card) and, for a message, the later foo replies of the
   * chat that update the same surfaceId (renderer/kit/model.ts folds the same way), so a relabelled Button keeps its words.
   */
  private async surface(a: KitRefresh): Promise<Surface | null> {
    const fences: string[] = [];
    if (a.messageId !== undefined) {
      const m = await this.query<EngineMessage>('messageById', a.messageId);
      if (!m || m.chatId !== a.chatId || m.authorKind !== 'foo') return null;
      fences.push(m.text);
      const recent = (await this.query<EngineMessage[]>('messagesBefore', a.chatId, null, LATER_REPLIES)) ?? [];
      for (const r of recent) if (r.seq > m.seq && r.authorKind === 'foo' && r.text.includes('```')) fences.push(r.text);
    } else if (a.cardId !== undefined) {
      const c = await this.query<CardRow>('cardById', a.cardId);
      if (!c || c.chatId !== a.chatId || c.type !== 'kit' || typeof c.payload.body !== 'string') return null;
      fences.push(`\`\`\`a2ui\n${c.payload.body}\n\`\`\``);
    }
    if (!fences.length) return null;
    const { surfaces } = foldFence(
      fences.map((t) => kitMessagesOf(t).messages),
      0,
    );
    return surfaces.find((s) => s.id === a.surfaceId) ?? null;
  }

  async handle(a: KitActionMessage): Promise<void> {
    const s = await this.surface(a);
    if (!s) {
      this.d.log('kit.action_unknown_surface', 'NOT_FOUND');
      return;
    }
    const words = (buttonWords(s, a.sourceComponentId) ?? actionWords(a.name)).slice(0, WORDS_MAX);
    await this.store(a.chatId, words, actionForAi(words, a));
  }

  /** R1 T7: a LiveStamp's Refresh. The surface must still exist where the tap says it lives. */
  async refresh(r: KitRefresh): Promise<void> {
    const s = await this.surface(r);
    if (!s) {
      this.d.log('kit.refresh_unknown_surface', 'NOT_FOUND');
      return;
    }
    const words = t('kit.live.refresh');
    await this.store(r.chatId, words, refreshForAi(words, r.surfaceId));
  }

  /** The tap as the user's message, then the chat lane takes it like a typed one. */
  private async store(chatId: string, words: string, forAi: string): Promise<void> {
    const id = this.d.newId('m');
    const r = await this.d.link.request('db.tx', {
      ops: [
        {
          op: 'insert',
          table: 'messages',
          row: {
            id,
            chat_id: chatId,
            author_kind: 'user',
            kind: 'text',
            text: words,
            text_for_ai: forAi,
            status: 'sent',
            created_at: this.d.clock.now(),
          },
        },
      ],
    });
    if (!r.ok) {
      this.d.log('kit.action_store_failed', r.error.kind);
      return;
    }
    this.d.enqueue(chatId, id);
  }
}
