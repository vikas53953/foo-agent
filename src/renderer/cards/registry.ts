// Spec: 02-2 §F13.3 (virtual list height estimates per card type; any type missing: 160), X-119. The card components join this
// registry with their milestone (05); the message column reads only the estimates in M1.
import { cardTitle } from '../../shared/cards';
import type { CardRow } from '../../shared/types';

export const CARD_ESTIMATE_DEFAULT = 160;

/** Estimated card heights for the virtual list. */
export const CARD_ESTIMATE: Record<string, number> = {
  brief: 320,
  checklist: 200,
  choice: 240,
  tiles: 360,
  approval: 260,
  payment: 300,
  bill: 220,
  draft: 300,
  secret: 200,
  signin: 180,
  connect: 180,
  plan: 240,
  routine: 160,
  routine_offer: 160,
  stuck: 220,
  error: 140,
  spend_cap: 160,
  table: 280,
  file: 88,
  link_preview: 120,
  job_link: 64,
  place: 200,
  face_explainer: 200,
  catch_up: 240,
  setup: 320,
  // CR-0022 (X-180): a kit card and an AI page (frame height is capped at 600px, 04 §13.6).
  kit: 320,
  ai_page: 420,
};

/** The line a card is known by in the header status and the right shell ("Needs you: {title}"). */
export const titleOfCard = (card: CardRow | undefined): string | undefined => (card ? cardTitle(card.payload) || undefined : undefined);
