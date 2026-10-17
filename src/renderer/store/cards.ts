// Spec: 08-5 §5 `cards.ts { byId }`, rule 2 (rev), 08-1 §3.3 card:upsert. Cards render in 05 (later milestones).
import type { CardRow } from '../../shared/types';
import { acceptRev } from './chats';
import type { RootState } from './index';

export interface CardsState {
  byId: Record<string, CardRow>;
}

export const initialCards = (): CardsState => ({ byId: {} });

export function upsertCardReducer(s: CardsState, row: CardRow): void {
  if (acceptRev('card', row.id, s.byId[row.id], row)) s.byId[row.id] = row;
}

export const selectCard = (cardId: string) => (s: RootState) => s.cards.byId[cardId];
