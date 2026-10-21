// Spec: 04-2 §21.7 Look (CR-0024 F8, §(e) 3): a suggestion chip's 16px icon comes from a fixed word map, first match wins:
// mail/email/inbox → Mail; calendar/day/meeting → CalendarLtr; price/pay/bill/₹ → Money; compare/find/search/look → Search;
// remind/later/tomorrow → Clock; WhatsApp/group/family → People; else Edit. Every icon is in the 02 F6 list. Pure.
import type { IconName } from '../ui/Icon';

/** A word matches at the start of a word ("bill" in "bills", never "day" in "today"); ₹ anywhere. */
const RULES: readonly (readonly [RegExp, IconName])[] = [
  [/\b(mail|email|inbox)/i, 'Mail'],
  [/\b(calendar|day|meeting)/i, 'CalendarLtr'],
  [/\b(price|pay|bill)|₹/i, 'Money'],
  [/\b(compare|find|search|look)/i, 'Search'],
  [/\b(remind|later|tomorrow)/i, 'Clock'],
  [/\b(whatsapp|group|family)/i, 'People'],
];

export function chipIcon(text: string): IconName {
  return RULES.find(([re]) => re.test(text))?.[1] ?? 'Edit';
}
