// Spec: 04-2 §21.7 (suggestion chips: 3 starters in an empty chat, foo's or a helper's; up to 3 follow-ups only from the
// latest foo or helper reply's own `suggestions`; hidden on the first keystroke, while recording, in groups, WhatsApp mirrors
// and private chats, and when the latest reply holds an Approval, Payment, Draft or Secret card or its job touched money),
// CR-0021 pick 10, AT-307, AT-308. Pure; unit-tested (test/unit/p1-suggestions.test.ts).
import { t } from '../../shared/copy/t';
import type { CardRow, CardType, ChatKind, MessageRow } from '../../shared/types';

export interface SuggestFacts {
  kind: ChatKind;
  private: boolean;
  /** The chat's messages, oldest first. */
  messages: readonly Pick<MessageRow, 'authorKind' | 'kind' | 'cardId' | 'jobId' | 'suggestions' | 'deletedAt'>[];
  cards: Readonly<Record<string, Pick<CardRow, 'type' | 'jobId'> | undefined>>;
  recording: boolean;
  /** The field holds text or a chip (the row goes on the first keystroke). */
  typed: boolean;
}

export type SuggestView = { kind: 'starter' | 'followup'; items: string[] } | null;

/** §21.7: a reply holding one of these cards shows no follow-ups. */
const STOP_CARDS: ReadonlySet<CardType> = new Set(['approval', 'payment', 'draft', 'secret']);
/** Cards that mean the reply's job touched money. */
const MONEY_CARDS: ReadonlySet<CardType> = new Set(['approval', 'payment', 'bill']);

const STARTERS = {
  foo: ['composer.suggest.starter.foo.1', 'composer.suggest.starter.foo.2', 'composer.suggest.starter.foo.3'],
  helper: ['composer.suggest.starter.helper.1', 'composer.suggest.starter.helper.2', 'composer.suggest.starter.helper.3'],
} as const;

/** The chip row for this chat now, or null when it is hidden. */
export function suggestionsFor(f: SuggestFacts): SuggestView {
  if (f.typed || f.recording || f.private) return null;
  if (f.kind !== 'foo' && f.kind !== 'helper') return null;
  const shown = f.messages.filter((m) => m.kind !== 'marker');
  if (!shown.length) return { kind: 'starter', items: STARTERS[f.kind].map((k) => t(k)) };
  const last = shown[shown.length - 1]!;
  if ((last.authorKind !== 'foo' && last.authorKind !== 'helper') || last.deletedAt !== null) return null;
  const card = last.cardId ? f.cards[last.cardId] : undefined;
  if (card && STOP_CARDS.has(card.type)) return null;
  if (last.jobId && Object.values(f.cards).some((c) => c?.jobId === last.jobId && MONEY_CARDS.has(c.type))) return null;
  const items = (last.suggestions ?? []).slice(0, 3);
  return items.length ? { kind: 'followup', items } : null;
}
