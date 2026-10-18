// Spec: 05-3 §5.10.1 (anatomy: title, favicon + domain line, LIVE only while Edge is in front with the banner, buttons
// "I'm done" Primary, "Take over" Secondary, "Skip" Link), §5.10.2 (the six lanes' titles and buttons; the states and their
// copy), §5.10.4 (card label "Sign-in needed: {title}"), 05-1 §0.3 (order Primary, Secondary, then links), §0.5 (summary
// row for terminal states; offline: the offline line, "Skip" stays enabled), 08-1 §4.5 (`signin` payload), CR-0013
// G-M9-10 (`reason` is the lane), G-M9-11 (no Watch button). The card's words and buttons as data, so they are unit-tested.
import { z } from 'zod';
import { t } from '../../shared/copy/t';
import { formatTime } from '../../shared/format';
import { SignInReasonSchema } from '../../shared/schemas';
import type { CardRow, SignInReason } from '../../shared/types';

export type SignInAction = 'done' | 'take_over' | 'skip' | 'use_code_box';

// 08-1 §4.5 + G-M9-10. `phone` (the masked number of the bank-check lane) is not in the 08-1 payload: implementation-notes
// "M9 T6", flagged to the lead. The renderer reads it when the engine sends it and draws no bank-check card without it.
const payloadSchema = z.object({
  mode: z.enum(['sign_in_here', 'take_over']),
  jobId: z.string().min(1),
  site: z.string().min(1),
  reason: SignInReasonSchema,
  phone: z.string().min(1).optional(),
});
export type SignInPayload = z.infer<typeof payloadSchema>;

export const parseSignIn = (payload: Record<string, unknown>): SignInPayload | null => {
  const r = payloadSchema.safeParse(payload);
  return r.success ? r.data : null;
};

/** §5.10.2 Buttons column, in the §0.3 order (the first one is the Primary). */
const LANE_ACTIONS: Record<SignInReason, readonly SignInAction[]> = {
  sign_in: ['done', 'take_over', 'skip'],
  captcha: ['take_over', 'skip'],
  passkey: ['done', 'skip'],
  bank_3ds: ['done', 'use_code_box'],
  known_puzzle: ['take_over', 'skip'],
  saved_login_failed: ['done', 'take_over', 'skip'],
};

/** §5.10.2 Title column. The known-puzzle lane is a CAPTCHA lane whose card adds the puzzle line (implementation-notes). */
function title(p: SignInPayload): string | null {
  switch (p.reason) {
    case 'sign_in':
      return t('cards.signin.title.sign_in', { site: p.site });
    case 'captcha':
    case 'known_puzzle':
      return t('cards.signin.title.captcha');
    case 'passkey':
      return t('cards.signin.title.passkey', { site: p.site });
    case 'bank_3ds':
      return p.phone ? t('cards.signin.title.bank_3ds', { phone: p.phone }) : null;
    case 'saved_login_failed':
      return t('cards.signin.title.saved_login_failed', { site: p.site });
  }
}

const LABEL: Record<SignInAction, () => string> = {
  done: () => t('cards.signin.button.done'),
  take_over: () => t('cards.signin.button.take_over'),
  skip: () => t('cards.signin.button.skip'),
  use_code_box: () => t('cards.signin.button.use_code_box'),
};

/** 05-1 §0.5 Offline: "Skip" (like "Not now", "Cancel") stays enabled; the rest need the internet. */
const WORKS_OFFLINE: ReadonlySet<SignInAction> = new Set(['skip']);
/** "Use the code box" opens the §5.8 Code box, which needs an engine path main does not have yet (M5): shown, not usable. */
const NOT_WIRED: ReadonlySet<SignInAction> = new Set(['use_code_box']);

export interface SignInButton {
  action: SignInAction;
  label: string;
  variant: 'primary' | 'secondary' | 'link';
  disabled: boolean;
}

export type SignInView =
  | {
      kind: 'open';
      title: string;
      label: string;
      domain: string;
      live: boolean;
      line: string | null;
      offlineLine: string | null;
      buttons: SignInButton[];
    }
  | { kind: 'summary'; tone: 'ok' | 'grey'; text: string };

/** What the card shows for its row: an open card while it waits, else its summary row. Null = not drawable. */
export function signInView(card: CardRow, o: { offline: boolean; timeZone: string }): SignInView | null {
  const p = parseSignIn(card.payload);
  if (!p) return null;
  const head = title(p);
  if (head === null) return null;
  switch (card.state) {
    case 'waiting':
    case 'live': {
      const actions = LANE_ACTIONS[p.reason];
      return {
        kind: 'open',
        title: head,
        label: t('cards.signin.accessible_name', { title: head }),
        domain: p.site,
        live: card.state === 'live',
        line: p.reason === 'known_puzzle' ? t('cards.signin.known_puzzle_site') : null,
        offlineLine: o.offline ? t('cards.common.offline_line') : null,
        buttons: actions.map((action, i) => ({
          action,
          label: LABEL[action](),
          variant: action === 'skip' || action === 'use_code_box' ? 'link' : i === 0 ? 'primary' : 'secondary',
          disabled: NOT_WIRED.has(action) || (o.offline && !WORKS_OFFLINE.has(action)),
        })),
      };
    }
    case 'signed_in':
      return {
        kind: 'summary',
        tone: 'ok',
        text: t('cards.signin.state.signed_in', {
          site: p.site,
          time: formatTime(card.resolvedAt ?? card.updatedAt, { timeZone: o.timeZone }),
        }),
      };
    case 'skipped':
      return { kind: 'summary', tone: 'grey', text: t('cards.signin.state.skipped') };
    case 'withdrawn':
      return { kind: 'summary', tone: 'grey', text: t('cards.signin.state.withdrawn') };
    default:
      // timed_out, handed_back: §5.10.2 gives no summary words ("summary grey"); the card's own title, read-only.
      return { kind: 'summary', tone: 'grey', text: head };
  }
}
