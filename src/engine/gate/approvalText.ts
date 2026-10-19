// Spec: 05-2 §5.5.2 (Approval card kinds: title and impact per kind, built only from the verified ApprovalFields, never free
// AI text, MUS §9.1, 08-2 §9.3), 08-4 §28.1 item 7 (the card text is built only from the verified fields), F10 / F19.3
// (dates "Sat 17 Oct, 8:00 PM"). The renderer shows `title` and `impact` as given (ApprovalPayload).
import { t } from '../../shared/copy/t';
import { formatDate, formatInr } from '../../shared/format';
import type { ApprovalFields } from '../../shared/types';

export interface ApprovalText {
  title: string;
  impact: string;
}

/** book → table (a party size), stay (a room or stay), slot (anything else). */
function bookTitle(f: ApprovalFields): string {
  if (/\b(room|stay|hotel|night)s?\b/iu.test(f.item ?? '')) return t('cards.approval.book.title.stay');
  if (f.partySize !== undefined) return t('cards.approval.book.title.table');
  return t('cards.approval.book.title.slot');
}

/** "{place}, {area} · {when} · {party}" with the slots nothing verified left out (no stray ", " or " · "). */
function joinFilled(line: string): string {
  return line
    .split(' · ')
    .map((part) => part.replace(/^,\s*|,\s*$/gu, '').trim())
    .filter(Boolean)
    .join(' · ');
}

/** The card's title and impact line for a verified book or delete draft (buy / pay are the Payment card, M10). */
export function approvalText(f: ApprovalFields, o: { timeZone: string; now: number }): ApprovalText {
  const when = f.when ? formatDate(f.when.start, 'full', { timeZone: f.when.tz || o.timeZone, now: o.now }) : '';
  const place = f.payee ?? f.item ?? f.siteDomain ?? '';
  if (f.verb === 'book')
    return {
      title: bookTitle(f),
      impact: joinFilled(
        t('cards.approval.book.impact', {
          place,
          // ApprovalFields has no area (08-2 §9.3); the slot stays empty rather than guess one.
          area: '',
          when,
          party: f.partySize === undefined ? '' : t('cards.approval.book.party', { count: String(f.partySize) }),
        }),
      ),
    };
  // Cancelling a booking is `delete` (X-55, 08-2 §9.4.4).
  if (f.cancelTerms)
    return {
      title: t('cards.approval.cancel_booking.title', { thing: f.item ?? '', place }),
      impact:
        f.cancelTerms.freeUntil !== undefined && f.cancelTerms.feePaise !== undefined
          ? t('cards.approval.cancel_booking.impact', {
              time: formatDate(f.cancelTerms.freeUntil, 'full', { timeZone: o.timeZone, now: o.now }),
              fee: formatInr(f.cancelTerms.feePaise),
            })
          : t('cards.approval.delete.impact.permanent'),
    };
  return { title: t('cards.approval.delete.title', { what: f.item ?? place }), impact: t('cards.approval.delete.impact.permanent') };
}
