// Spec: 02-2 §F13.3 / X-119 card registry: the card types M5 registers in `CARD_VIEWS` (05-1 §5.3, §5.4, 05-2 §5.5, §5.7,
// §5.8; CR-0009). Kept apart from `renderCard.tsx` so tests read it without JSX.
import type { CardType } from '../../shared/types';

/** The card types M5 draws (CR-0009). */
export const M5_CARD_TYPES: readonly CardType[] = ['choice', 'tiles', 'approval', 'draft', 'secret'];
