// Spec: 05 card payloads (the line a card is known by: a checklist or brief `title`, a choice `question`, a payment or bill
// `payee`, a sign-in `site`), 03-shell-1 §3.4.6 (list preview), 03-shell-2 §3.6.2.1 row 2 / §3.7.3.1 ("Needs you: {title}");
// 08-0 §G.2 (card states per type; approval and payment use ApprovalState), 08-1 §4.5.1 (every write validates the state).
// M5 (CR-0009): the approval states come from the approval machine's table. CR-0022 (X-180): `kit` and `ai_page`.
import { APPROVAL_STATES } from './approvalMachine';
import type { CardType } from './types';

/** The short name of a card, from its payload. */
export function cardTitle(payload: Record<string, unknown>): string {
  return String(payload.title ?? payload.question ?? payload.payee ?? payload.site ?? '');
}

/** 08-0 §G.2: the `cards.state` values each card type may hold ("all others": shown). */
export const CARD_STATES: Record<CardType, readonly string[]> = {
  brief: ['open', 'expired'],
  checklist: ['live', 'done', 'done_unverified', 'failed', 'stopped'],
  choice: ['asking', 'answered', 'auto_picked', 'skipped', 'expired', 'superseded', 'withdrawn'],
  tiles: ['asking', 'answered', 'auto_picked', 'skipped', 'expired', 'superseded', 'withdrawn'],
  approval: APPROVAL_STATES,
  payment: APPROVAL_STATES,
  bill: ['waiting', 'reminded', 'paying', 'paid', 'already_paid', 'expired'],
  draft: [
    'pending',
    'editing',
    'undo_window',
    'sending',
    'sent',
    'discarded',
    'opened_in_app',
    'queued_offline',
    'failed',
    'expired',
    'superseded',
    'withdrawn',
  ],
  secret: ['asking', 'checking', 'saved', 'rejected', 'expired', 'withdrawn'],
  signin: ['waiting', 'live', 'signed_in', 'skipped', 'timed_out', 'handed_back', 'withdrawn'],
  connect: ['offered', 'opening', 'waiting', 'connected', 'partial', 'denied', 'expired', 'failed', 'skipped'],
  plan: ['pending', 'go', 'changed', 'withdrawn'],
  routine: ['shown'],
  routine_offer: ['offered', 'accepted', 'dismissed'],
  stuck: ['asking', 'other_way', 'taken_over', 'stopped', 'timed_out'],
  error: ['shown', 'asking', 'fixed', 'resumed', 'stopped', 'dismissed'],
  spend_cap: ['shown', 'raised', 'dismissed'],
  job_link: ['live', 'done', 'failed', 'stopped'],
  setup: ['shown', 'answered', 'skipped'],
  table: ['shown'],
  file: ['shown'],
  link_preview: ['shown'],
  place: ['shown'],
  face_explainer: ['shown'],
  catch_up: ['shown'],
  // CR-0022 (X-180): a kit card is shown or kept; an AI page is built, then ready or failed, and may be kept (04 §13.6).
  kit: ['shown', 'kept'],
  ai_page: ['building', 'ready', 'failed', 'kept'],
};

/** 08-1 §4.5.1: is `state` one of the type's states? */
export function isCardState(type: string, state: string): boolean {
  return (CARD_STATES as Record<string, readonly string[] | undefined>)[type]?.includes(state) ?? false;
}
