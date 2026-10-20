// Spec: 08-3 §16.4.2 (not on WhatsApp → "That number isn't on WhatsApp." and no Send button; bridge not open → "I can't
// check that number right now." and Send disabled until it is), 05-2 §5.7.2 WhatsApp daily limit (Send disabled, state
// `pending`, "I've sent 30 WhatsApp messages today, which is my daily limit. I can send again after {Sat 17 Oct, 12:00 AM}.").
// M8 T7: what a pending WhatsApp draft says in place of its pending line, and what that does to Send.
import { t } from '../../../shared/copy/t';
import type { DraftPayload } from '../../../shared/types';

export interface WhatsAppNotice {
  line: string;
  /** `hidden`: no Send button at all; `disabled`: Send shows but cannot be pressed. */
  send: 'hidden' | 'disabled';
}

/** The one WhatsApp line a pending draft shows, if any; `at` writes the limit's end as a full date. */
export function whatsAppNotice(p: DraftPayload, at: (ms: number) => string): WhatsAppNotice | null {
  if (p.channel !== 'whatsapp') return null;
  if (p.waCheck === 'not_on') return { line: t('cards.draft.line.wa_not_on'), send: 'hidden' };
  if (p.waCheck === 'cant_check') return { line: t('cards.draft.line.wa_cant_check'), send: 'disabled' };
  if (p.waLimitUntil !== undefined) return { line: t('cards.draft.line.wa_daily_limit', { date: at(p.waLimitUntil) }), send: 'disabled' };
  return null;
}
