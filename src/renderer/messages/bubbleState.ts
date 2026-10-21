// Spec: 04 §3.3 (tick states from the message row: Waiting to send, Sent, Delivered, Read, Not sent), §4.1–§4.2 (which
// bubble shows a badge; foo's reaction takes the badge slot; a message waiting offline shows the Clock tick and no badge,
// 08-0 §F; tooltips and their variants), §1.8 (each bubble's accessible name "{sender}, {Ddd D Mmm, h:mm AM}: {text}.
// {state}"), §6.2 (edit: the user's most recent bubble, within 15 minutes, no approved Approval/Payment from it), §15
// ("Worked for {n}s ›", "{m} min", "{h} h {m} min"), §12.5 (backup-AI mark). Pure apart from t().
import { t } from '../../shared/copy/t';
import { formatDate } from '../../shared/format';
import type { BadgeValue, MessageRow, TickState } from '../../shared/types';

/** 04 §4.2: a badge value that would last less than this is skipped (OCL status-reactions.ts). */
export const BADGE_DEBOUNCE_MS = 700;
/** 04 §6.2: edits are allowed this long after sending. */
export const EDIT_WINDOW_MS = 15 * 60_000;

type TickInput = Pick<MessageRow, 'status' | 'badge'>;

/** 04 §3.3, the same rule main's chat-list preview uses (queries.tickOf). */
export function tickState(m: TickInput): TickState {
  if (m.status === 'failed') return 'not_sent';
  if (m.status === 'queued') return 'waiting';
  // Read stays read after the badge clears (CR-0024 F9): the lane marks a user message `complete` in the same write as 👀,
  // so `complete` means foo started on it, and a plain or answered-steer message keeps ✓✓ read after its answer posts.
  if (m.badge !== null || m.status === 'complete') return 'read';
  return m.status === 'sent' ? 'sent' : 'delivered';
}

export function tickLabel(state: TickState, agentName: string): string {
  switch (state) {
    case 'waiting':
      return t('bubble.tick.waiting');
    case 'sent':
      return t('bubble.tick.sent');
    case 'delivered':
      return t('bubble.tick.delivered', { agentName });
    case 'read':
      return t('bubble.tick.read', { agentName });
    case 'not_sent':
      return t('bubble.tick.not_sent');
  }
}

export type BadgeSlot = { kind: 'badge'; value: BadgeValue } | { kind: 'reaction'; emoji: string } | null;

/** What sits in the user's badge slot (§4.1 rules 1–5, 08-0 §F). Only user bubbles have one. */
export function badgeSlot(
  m: Pick<MessageRow, 'authorKind' | 'status' | 'badge' | 'reactions' | 'deletedAt'>,
  o: { offline: boolean },
): BadgeSlot {
  if (m.authorKind !== 'user' || m.deletedAt !== null || m.status === 'failed') return null;
  const reaction = m.reactions.find((r) => r.by !== 'me');
  if (reaction) return { kind: 'reaction', emoji: reaction.emoji };
  if (m.status === 'queued' && o.offline) return null;
  return m.badge ? { kind: 'badge', value: m.badge } : null;
}

/** 04 §4.2 + 08-0 §F tooltips; `slow` from JobRow.slow, `aiDown` = online and queued while the AI is not answering. */
export function badgeTooltip(value: BadgeValue, o: { slow?: boolean; aiDown?: boolean } = {}): string {
  switch (value) {
    case 'seen':
      return t('bubble.badge.tooltip.seen');
    case 'working':
      return o.slow ? t('bubble.badge.tooltip.working_slow') : t('bubble.badge.tooltip.working');
    case 'waiting':
      return o.aiDown ? t('bubble.badge.tooltip.waiting_ai') : t('bubble.badge.tooltip.waiting');
    case 'done':
      return t('bubble.badge.tooltip.done');
    case 'done_unverified':
      return t('bubble.badge.tooltip.done_unverified');
    case 'failed':
      return t('bubble.badge.tooltip.failed');
    case 'stopped':
      return t('bubble.badge.tooltip.stopped');
  }
}

export function slotTooltip(slot: Exclude<BadgeSlot, null>, o: { slow?: boolean; aiDown?: boolean; agentName: string }): string {
  return slot.kind === 'reaction'
    ? t('bubble.badge.tooltip.reacted', { agentName: o.agentName, emoji: slot.emoji })
    : badgeTooltip(slot.value, o);
}

/** 04 §1.8 accessible name. `text` is the bubble's plain text; `state` the tick label and badge tooltip (user bubbles). */
export function bubbleName(o: { sender: string; at: number; timeZone: string; now: number; text: string; state: string[] }): string {
  const time = formatDate(o.at, 'full', { timeZone: o.timeZone, now: o.now });
  const state = o.state.filter(Boolean).join('. ');
  const name = t('bubble.row.accessible_name', { sender: o.sender, time, text: o.text.trim().replace(/[.\s]+$/, ''), state }).trim();
  return state ? `${name}.` : name;
}

/** 04 §6.2: may this user bubble be edited now? */
export function canEdit(
  m: Pick<MessageRow, 'authorKind' | 'createdAt' | 'deletedAt' | 'kind' | 'status'>,
  o: { isLatestUserMessage: boolean; now: number; approvedFromIt: boolean },
): boolean {
  return (
    m.authorKind === 'user' &&
    m.kind === 'text' &&
    m.deletedAt === null &&
    m.status !== 'failed' &&
    o.isLatestUserMessage &&
    o.now - m.createdAt <= EDIT_WINDOW_MS &&
    !o.approvedFromIt
  );
}

/** 04 §15 copy for a work time in ms. */
export function workedLabel(ms: number): string {
  const s = Math.max(1, Math.floor(ms / 1000));
  if (s < 60) return t('bubble.worked.seconds', { n: s });
  const totalMin = Math.floor(s / 60);
  if (totalMin < 60) return t('bubble.worked.minutes', { m: totalMin });
  return t('bubble.worked.hours', { h: Math.floor(totalMin / 60), m: totalMin % 60 });
}

export function workedAccessible(ms: number): string {
  return t('bubble.worked.accessible_name', { seconds: Math.max(1, Math.floor(ms / 1000)) });
}

/** 04 §12.5: "answered with {ChatGPT} while {Claude} rests" in `messages.provider_note` (08-1 §4.3.2) → the two names. */
export function backupNames(note: string | null): { backup: string; primary: string } | null {
  const m = note ? /^answered with (.+?) while (.+?) rests$/i.exec(note.trim()) : null;
  return m ? { backup: m[1]!, primary: m[2]! } : null;
}
