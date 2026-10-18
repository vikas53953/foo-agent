// Spec: 02-2 §F13.3 / X-119 card registry: which `cards.type` values have their own component (05-3 §5.22–§5.24 in M2;
// 05-1 §5.3, §5.4 and 05-2 §5.5, §5.7, §5.8 in M5, CR-0009). Kept apart from `renderCard.tsx` so tests read it without JSX.
import type { CardType } from '../../shared/types';

/** The card types M2 draws; the rest are later milestones' (05). */
export const M2_CARD_TYPES: readonly CardType[] = ['table', 'file', 'link_preview', 'place'];
/** The card types M5 draws (CR-0009). */
export const M5_CARD_TYPES: readonly CardType[] = ['choice', 'tiles', 'approval', 'draft', 'secret'];

export const hasCardView = (type: CardType) => M2_CARD_TYPES.includes(type) || M5_CARD_TYPES.includes(type);
