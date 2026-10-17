// Spec: 04-2 §20.4 (placeholder copy per situation: AI not set up, app-wide states from 03 §3.3 banner types 1–5, attachments
// with no text, a pill under 360px, then the chat kind: private, WhatsApp mirror, group, helper, foo), §23.1 (offline and the
// AI states keep the composer usable and change only the placeholder), §23.2 (the composer never adds a bar for them).
// "Starting {agentName}…" needs the engine's start signal (M3) and is not shown yet (implementation-notes). Pure.
import { t } from '../../shared/copy/t';
import type { BannerType, ChatKind } from '../../shared/types';

export interface PlaceholderFacts {
  notSetUp: boolean;
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
}

/** §20.2 / §20.4: below this pill width the placeholder is the short form. */
export const NARROW_PILL_PX = 360;

export function placeholderText(f: PlaceholderFacts): string {
  if (f.notSetUp) return t('composer.placeholder.not_set_up');
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
  if (f.hasAttachments && !f.hasText) return t('composer.placeholder.attachments');
  if (f.narrow) return t('composer.placeholder.narrow', { name: f.title });
  if (f.kind === 'foo' && f.private) return t('composer.placeholder.private');
  if (f.kind === 'wa_mirror') return t('composer.placeholder.wa_mirror', { group: f.title });
  if (f.kind === 'group') return t('composer.placeholder.group', { group: f.title });
  if (f.kind === 'helper') return t('composer.placeholder.helper', { helper: f.title, talkKey: f.talkKey });
  return t('composer.placeholder.foo', { agentName: f.agentName, talkKey: f.talkKey });
}
