// Spec: 04-2 §20.4 (placeholder copy per situation: AI not set up, app-wide states from 03 §3.3 banner types 1–5, attachments
// with no text, a pill under 360px, then the chat kind: private, WhatsApp mirror, group, helper, foo), §23.1 (offline and the
// AI states keep the composer usable and change only the placeholder), §23.2 (the composer never adds a bar for them).
// "Starting {agentName}…" needs the engine's start signal (M3) and is not shown yet. 05-3 §5.12.2 (after "Change plan" the
// composer reads "Tell me what to change" until the user answers; M5 T10, CR-0008 (j) row 3), 06-1 §2.0 (first run: the long
// "Connect your AI first, then we can talk."; 04-2's short line stays for the send tooltip and drop overlay, CR-0020). Pure.
// GAP: GAPS.md 2026-10-17 "no engine start signal"
import { t } from '../../shared/copy/t';
import type { BannerType, CardRow, ChatKind, MessageRow } from '../../shared/types';

export interface PlaceholderFacts {
  notSetUp: boolean;
  /** 06-1 §2.0 (CR-0020): first run is not finished, so the locked composer says "Connect your AI first, then we can talk." */
  setupMode?: boolean;
  /** The 03 §3.3 banner that shows now (only types 1–5 change the placeholder). */
  banner: BannerType | null;
  aiName: string;
  hasAttachments: boolean;
  hasText: boolean;
  narrow: boolean;
  kind: ChatKind;
  private: boolean;
  title: string;
  agentName: string;
  talkKey: string;
  // M5
  /** T10: the newest Plan card of this chat was changed and the user has not written since (05-3 §5.12.2). */
  planChange?: boolean;
}

/** 05-3 §5.12.2: true while the newest Plan card is `changed` and no user message came after it. */
export function planChangePending(
  ids: readonly string[],
  byId: Record<string, MessageRow | undefined>,
  cards: Record<string, CardRow>,
): boolean {
  for (let i = ids.length - 1; i >= 0; i--) {
    const m = byId[ids[i]!];
    if (!m) continue;
    if (m.authorKind === 'user') return false;
    const card = m.cardId ? cards[m.cardId] : undefined;
    if (card?.type === 'plan') return card.state === 'changed';
  }
  return false;
}

/** §20.2 / §20.4: below this pill width the placeholder is the short form. */
export const NARROW_PILL_PX = 360;

export function placeholderText(f: PlaceholderFacts): string {
  if (f.notSetUp) return f.setupMode ? t('setup.composer.locked') : t('composer.placeholder.not_set_up');
  switch (f.banner) {
    case 'offline':
      return t('composer.placeholder.offline');
    case 'ai_not_answering':
    case 'ai_signed_out':
      return t('composer.placeholder.ai_not_answering', { AI: f.aiName });
    case 'ai_cap':
      return t('composer.placeholder.ai_cap');
    case 'plan_limit':
      return t('composer.placeholder.plan_limit', { AI: f.aiName });
    default:
      break;
  }
  if (f.planChange) return t('cards.plan.change_placeholder');
  if (f.hasAttachments && !f.hasText) return t('composer.placeholder.attachments');
  if (f.narrow) return t('composer.placeholder.narrow', { name: f.title });
  if (f.kind === 'foo' && f.private) return t('composer.placeholder.private');
  if (f.kind === 'wa_mirror') return t('composer.placeholder.wa_mirror', { group: f.title });
  if (f.kind === 'group') return t('composer.placeholder.group', { group: f.title });
  if (f.kind === 'helper') return t('composer.placeholder.helper', { helper: f.title, talkKey: f.talkKey });
  return t('composer.placeholder.foo', { agentName: f.agentName, talkKey: f.talkKey });
}
