// Spec: 08-2 §9.2 (action classes, the permission row of each class, the app rows, the hard-limit column; `rowFor(cls, tool)`;
// only browser.click §8.2.1, browser.fillPersonal and browser.submit need the tool to find the class), §8.2 (tools; the
// engine-only tools the AI never calls: gmail.send, whatsapp.send, gmail.trash, browser.fillCard, browser.submit),
// pack M5 §7 risk 1 (AI-called fill/submit/send → USE_SUBMIT), 08-0 §G.3 (permission rows), X-125.
// M5 T8: the send hard limit also reads the message content (bank details, attachments from Documents, agrees to pay).
import type { ApprovalFields, PermissionApp } from '../../shared/types';
import type { ActionClass } from './GateLogic';
import { sendContentHard, type SendContent } from './sendContent';

/** 08-0 §G.3 permission rows (settings.permissions.actions keys). */
export type PermRow = 'read' | 'drafts' | 'calendar' | 'send' | 'book' | 'pay' | 'post' | 'delete' | 'share';

/** §9.2 "Permission row" column; `switch` has no row (always a card). */
const ROW_OF: Record<ActionClass, PermRow | null> = {
  read: 'read',
  prepare: 'drafts',
  calendar_write: 'calendar',
  send: 'send',
  book: 'book',
  buy: 'pay',
  pay: 'pay',
  post: 'post',
  delete: 'delete',
  share_personal: 'share',
  switch: null,
};

export function rowFor(cls: ActionClass): PermRow | null {
  return ROW_OF[cls];
}

/** §9.2 app rows; tools with no app row (memory, routine, helper, files, screen, job) use only their action class. */
export function appOf(tool: string): PermissionApp | null {
  const ns = tool.split('.')[0];
  switch (ns) {
    case 'gmail':
      return 'gmail';
    case 'gcal':
      return 'calendar';
    case 'contacts':
      return 'contacts';
    case 'whatsapp':
      return 'whatsapp';
    case 'browser':
    case 'web':
      return 'browser';
    case 'outlook':
      return 'outlook';
    default:
      return null;
  }
}

/** The classes that act on the world: never run from an AI tool call, only after an APPROVED approval (§9.4, pack §7 risk 1). */
export const ACTING: ReadonlySet<ActionClass> = new Set<ActionClass>([
  'send',
  'book',
  'buy',
  'pay',
  'post',
  'delete',
  'share_personal',
  'switch',
]);

/** §8.2 engine-only tools: the AI never calls them; the engine does, once, after the write-ahead (08-4 §28.1 item 8, §29.1). */
export const ENGINE_ONLY: ReadonlySet<string> = new Set([
  'browser.submit',
  'browser.fillCard',
  'gmail.send',
  'whatsapp.send',
  'gmail.trash',
]);

/** §9.2 / §8.2.1: the class of one call. `browser.fillPersonal` with phone or address shares personal data. */
export function classOf(tool: string, declared: ActionClass, args: unknown): ActionClass {
  if (tool === 'browser.fillPersonal') {
    const field = (args as { field?: unknown } | null)?.field;
    if (field === 'phone' || field === 'address') return 'share_personal';
    if (field === 'name' || field === 'email') return 'prepare';
  }
  return declared;
}

/** §9.4 `personalHard(call)`: a prepare call that types a phone or home address (§9.2 share_personal row). */
export function personalHard(tool: string, args: unknown): boolean {
  return classOf(tool, 'prepare', args) === 'share_personal';
}

/**
 * §9.2 hard-limit column. send: a new recipient, a group, or content with address / phone / bank details / documents or an
 * agreement to pay (address and phone in `personalShared`, the rest read from `content`, M5 T8); book: a phone or address
 * shared, or no free cancel; buy, pay, post, delete, share_personal, switch: always. read, prepare, calendar_write: never.
 */
export function isHardLimit(cls: ActionClass, fields: ApprovalFields | undefined, now: number, content?: SendContent): boolean {
  switch (cls) {
    case 'read':
    case 'prepare':
    case 'calendar_write':
      return false;
    case 'send':
      return (
        !fields ||
        (fields.recipients ?? []).some((r) => r.isNew || r.isGroup) ||
        (fields.personalShared ?? []).some((p) => p === 'phone' || p === 'address') ||
        sendContentHard(content)
      );
    case 'book': {
      if (!fields) return true;
      if ((fields.personalShared ?? []).some((p) => p === 'phone' || p === 'address')) return true;
      const terms = fields.cancelTerms;
      const free = !!terms && (terms.refundable || (terms.freeUntil !== undefined && terms.freeUntil > now));
      return !free || fields.irreversible;
    }
    default:
      return true;
  }
}

/** The class of an ApprovalDraft verb (08-0 §B.2; cancelling a booking is `delete`, X-55). */
export function classOfVerb(verb: 'book' | 'buy' | 'pay' | 'delete'): ActionClass {
  return verb;
}

/** The verb the AI may name in `do_verbs` for a class (08-4 §28.1 item 6: buy and pay are one). */
export function verbOfClass(cls: ActionClass): string | null {
  switch (cls) {
    case 'send':
    case 'book':
    case 'post':
    case 'delete':
      return cls;
    case 'buy':
    case 'pay':
      return 'pay';
    case 'share_personal':
      return 'share';
    default:
      return null;
  }
}

/** 08-2 §7.2 part 9: tools whose results hold what other people wrote (mail, chats), the untrusted content of §9.4.3. */
export function untrustedSource(tool: string): boolean {
  const app = appOf(tool);
  return app === 'gmail' || app === 'outlook' || app === 'whatsapp';
}
