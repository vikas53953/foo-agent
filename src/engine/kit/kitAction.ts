// Spec: 08-1 §2.4 MainToEngine `kit.action` ("the A2UI client `action`; a gated action is handled as if the user typed
// it", Article 6), 04 §13.5 (user actions go renderer → main → engine; any action that would send, book, pay, delete or
// share is an approval request, never a direct action), CR-0022 AT-355 (the action reaches the engine and the surface
// updates from the reply), AT-356 (a gated Button opens an approval), AT-349 / AT-350 (a ListPick or TimePick pick is the
// user's message in the picked words; R1 T3), X-180. R1 T2.
// The engine never acts on a surface action itself: it stores the tap as the user's message (the Button's own words, or
// its action name) with the action for the AI beside it (`text_for_ai`), and hands it to the chat lane like a typed
// message. So an action that would send, book, pay, delete or share meets the same intake, job and gate (08-2 §9.4) as the
// user typing those words, and the reply that follows can update the surface by naming its surfaceId.
import type { Clock } from '../../shared/clock';
import type { KitActionMessage } from '../../shared/kit/catalog';
import { pickWords } from '../../shared/kit/pick';
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
  private async surface(a: KitActionMessage): Promise<Surface | null> {
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
    // A ListPick or TimePick tap (or keycap reaction, R1 T3) is the picked row's or slot's words, like a Choice answer.
    const words = (buttonWords(s, a.sourceComponentId) ?? pickWords(s, a.sourceComponentId, a.context) ?? actionWords(a.name)).slice(
      0,
      WORDS_MAX,
    );
    const id = this.d.newId('m');
    const r = await this.d.link.request('db.tx', {
      ops: [
        {
          op: 'insert',
          table: 'messages',
          row: {
            id,
            chat_id: a.chatId,
            author_kind: 'user',
            kind: 'text',
            text: words,
            text_for_ai: actionForAi(words, a),
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
    this.d.enqueue(a.chatId, id);
  }
}
