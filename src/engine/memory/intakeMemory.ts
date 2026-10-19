// Spec: 08-4 §25.2 (`IntakeDecision.memory { op: 'remember' | 'forget'; text ≤ 200 }`), §25.5 item 5 (kind `memory`: no
// `<say>`; the chip follows), 08-3 §12.4.2 (explicit "remember…" / "forget…" are intake's, not the review's; R-20: foo reacts 👍
// on the user's bubble and the chip is a system line under it; `privacy.askBeforeRemembering` → the `memory_confirm` Choice
// card "Remember that {fact}?" [ Remember ] [ Don't ]), §12.1 (a private chat never saves memory; nothing said after "don't
// remember this" in the same message or the next one is saved), §12.6 (forget: tombstone + 5 s undo), 05-3 §5.17.1 ("Not
// saving this one."; "Forgot it. I won't use that again."), J17 branch "don't remember this", 07-2 R-20, CR-0010 G-M6-03
// (remember = the manual-add path: one classify turn, `said`, origin `chat:{chatId}/{messageId}`, the sensitive rule, 👍 +
// chip), G-M6-04 (forget = FTS match with token overlap ≥ 0.6: one → forget + chip with Undo 5 s; ≥ 2 → a `memory_confirm`
// Choice card listing up to 3 facts; none → a reply that nothing matched), G-M6-06 (`privacy.rememberOn=false` blocks intake
// remember; forgets keep working).
import { t } from '../../shared/copy/t';
import type { Result } from '../../shared/errors';
import type { Settings } from '../../shared/settings';
import type { CardAnswer, CardRow, ChoicePayload } from '../../shared/types';
import type { EngineChat, EngineFact, EngineHelper, EngineMessage } from '../../main/db/queries';
import type { DbOp, DbTxReply } from '../protocol';
import type { Clock } from '../../shared/clock';
import { classifyFact, type ClassifyTurn } from './classifyFact';
import type { MemoryChips } from './chips';
import type { LearnOp, LearnResult } from './MemoryService';
import { ftsMatch } from './retrieval';
import { askRemember, overlap, postChoice, saveAndChip, SAID_OVERLAP, tokens, type MemoryReview } from './review';

/** J17: "don't remember this" (also "do not save that"). */
export const DONT_REMEMBER = /\b(?:don['’]?t|dont|do not)\s+(?:remember|save)\s+(?:this|that)\b/iu;
/** G-M6-04: the Choice card lists at most 3 facts. */
const FORGET_OPTIONS = 3;
const OPTION_IDS = ['o1', 'o2', 'o3'] as const;

export interface IntakeMemoryDeps {
  clock: Clock;
  settings(): Settings;
  query<T>(q: string, ...args: unknown[]): Promise<T | null>;
  tx(ops: DbOp[]): Promise<Result<DbTxReply>>;
  newId(prefix: 'm' | 'k'): string;
  memory: {
    learn(op: LearnOp): Promise<Result<LearnResult>>;
    cmd(c: { cmd: 'forget'; factId: string }): Promise<Result<unknown>>;
  };
  /** The manual-add classify turn (null = §12.4 fallback: kind fact, category other). */
  classify: ClassifyTurn | null;
  chips: MemoryChips;
  review: MemoryReview;
  /** foo's reaction on the user's bubble (ChatLane.react). */
  react(messageId: string, emoji: '👍', helper: EngineHelper | null): Promise<void>;
  /** A plain foo line in the chat (ChatLane.post). */
  post(chatId: string, messageId: string, text: string, helper: EngineHelper | null): Promise<void>;
  /** 08-3 §12.6 `UNDO_MS`. */
  undoMs: number;
  log(evt: string, kind?: string, ids?: { chatId?: string }): void;
}

type MemoryCard = ChoicePayload & {
  memory?: { op: 'remember'; learn: LearnOp } | { op: 'forget'; factIds: string[]; anchorId: string; texts: string[] };
};

/** The memory half of intake (`ChatLane` calls it). */
export class IntakeMemory {
  /** Chats whose next user message a bare "don't remember this" covers. */
  private readonly nextUnsaved = new Set<string>();
  /** Messages that may not be saved, and those that already have their "Not saving this one." chip. */
  private readonly unsaved = new Set<string>();
  private readonly chipped = new Set<string>();

  constructor(private readonly d: IntakeMemoryDeps) {}

  /** Before the intake turn, no AI (J17 branch): this message, or the one after a bare "don't remember this". */
  async beforeTurn(chat: EngineChat, message: EngineMessage): Promise<void> {
    this.d.review.userMessage(chat.id, message.seq);
    const text = message.textForAi ?? message.text;
    let covered = this.nextUnsaved.delete(chat.id);
    if (DONT_REMEMBER.test(text)) {
      covered = true;
      // A bare "don't remember this" covers the next message; with more words, this one carries the thing not to save.
      if (tokens(text.replace(DONT_REMEMBER, ' ')).length < 3) this.nextUnsaved.add(chat.id);
    }
    if (!covered) return;
    this.unsaved.add(message.id);
    this.d.review.skip(message.id);
    if (!this.nextUnsaved.has(chat.id)) await this.notSaving(chat.id, message.id);
  }

  /** Intake kind `memory` (§25.2). */
  async decide(chat: EngineChat, helper: EngineHelper | null, message: EngineMessage, act: { op: 'remember' | 'forget'; text: string }) {
    // Groups never learn, forget by chat or ask (05-3 §5.17 "Groups: never", §17.3.3): the line is ignored here.
    if (chat.kind === 'group') {
      this.d.log('memory.group_ignored', undefined, { chatId: chat.id });
      return;
    }
    if (act.op === 'forget') return this.forget(chat, helper, message, act.text);
    const s = this.d.settings();
    // §12.1 private chat, J17 "don't remember this", G-M6-06 memory off: nothing is saved.
    if (chat.private || this.unsaved.has(message.id) || !s.privacy.rememberOn) {
      await this.d.react(message.id, '👍', helper);
      await this.notSaving(chat.id, message.id);
      return;
    }
    const text = act.text.trim().slice(0, 120);
    const cls = await classifyFact(text, this.d.classify);
    const op: LearnOp = {
      text,
      provenance: 'said',
      originKind: 'chat',
      origin: `chat:${chat.id}/${message.id}`,
      category: cls.category,
      kind: cls.kind,
      ...(cls.person ? { person: cls.person } : {}),
      scope: 'global',
      chatId: chat.id,
      helperId: chat.helperId,
      private: false,
    };
    if (s.privacy.askBeforeRemembering) {
      await askRemember(this.d, chat.id, op, helper?.id ?? null);
      return;
    }
    await this.d.react(message.id, '👍', helper);
    const saved = await saveAndChip(this.d, chat.id, message.id, op);
    if (!saved) await this.notSaving(chat.id, message.id);
  }

  /** G-M6-04: the fact the words name. */
  private async forget(chat: EngineChat, helper: EngineHelper | null, message: EngineMessage, text: string) {
    const match = ftsMatch(text);
    const hits = match ? ((await this.d.query<EngineFact[]>('memorySearch', chat.id, match, 8, [])) ?? []) : [];
    const found = hits
      .map((f) => ({ f, o: overlap(f.text, text) }))
      .filter((x) => x.o >= SAID_OVERLAP)
      .sort((a, b) => b.o - a.o)
      .map((x) => x.f);
    if (found.length === 0) {
      await this.d.post(chat.id, message.id, t('thread.memory.forget_none'), helper);
      return;
    }
    if (found.length === 1) {
      await this.d.react(message.id, '👍', helper);
      await this.forgetOne(chat.id, message.id, found[0]!);
      return;
    }
    const pick = found.slice(0, FORGET_OPTIONS);
    const payload: MemoryCard = {
      purpose: 'memory_confirm',
      question: t('thread.memory.forget_which'),
      options: pick.map((f, i) => ({ id: OPTION_IDS[i]!, label: f.text })),
      multi: false,
      aiReversible: false,
      reversible: false,
      livePrices: false,
      memory: { op: 'forget', factIds: pick.map((f) => f.id), anchorId: message.id, texts: pick.map((f) => f.text) },
    };
    await postChoice(this.d, chat.id, payload, helper?.id ?? null);
  }

  private async forgetOne(chatId: string, anchorId: string, f: Pick<EngineFact, 'id' | 'text'>): Promise<void> {
    const r = await this.d.memory.cmd({ cmd: 'forget', factId: f.id });
    if (!r.ok) {
      this.d.log('memory.forget_failed', r.error.kind, { chatId });
      return;
    }
    const token = (r.value as { undoToken: string }).undoToken;
    await this.d.chips.forgotten(chatId, anchorId, f, { token, until: this.d.clock.now() + this.d.undoMs });
  }

  /** card.answered for a `memory_confirm` card (main forwards them, `RUNNER_PURPOSES`); false = not a memory card. */
  async onCardAnswered(a: { cardId: string; answer?: CardAnswer; choice?: string; resolvedBy: string }): Promise<boolean> {
    const card = await this.d.query<CardRow>('cardById', a.cardId);
    const p = card?.payload as MemoryCard | undefined;
    if (!card || p?.purpose !== 'memory_confirm' || !p.memory) return false;
    if (card.state !== 'asking') return true;
    const answer: CardAnswer = a.answer ?? (a.choice ? { optionId: a.choice as 'o1' } : { skip: true });
    const skipped = 'skip' in answer;
    const r = await this.d.tx([
      {
        op: 'update',
        table: 'cards',
        id: card.id,
        set: { state: skipped ? 'skipped' : 'answered', answer, resolved_by: a.resolvedBy, resolved_at: this.d.clock.now() },
        expectRev: card.rev,
      },
    ]);
    if (!r.ok || skipped || !('optionId' in answer)) return true;
    if (p.memory.op === 'remember') {
      // [ Remember ] = o1; [ Don't ] saves nothing.
      if (answer.optionId === 'o1') await saveAndChip(this.d, card.chatId, card.messageId, p.memory.learn);
      return true;
    }
    const i = OPTION_IDS.indexOf(answer.optionId as (typeof OPTION_IDS)[number]);
    const factId = p.memory.factIds[i];
    if (factId) await this.forgetOne(card.chatId, p.memory.anchorId, { id: factId, text: p.memory.texts[i] ?? '' });
    return true;
  }

  private async notSaving(chatId: string, anchorId: string): Promise<void> {
    if (this.chipped.has(anchorId)) return;
    this.chipped.add(anchorId);
    await this.d.chips.notSaving(chatId, anchorId);
  }
}
