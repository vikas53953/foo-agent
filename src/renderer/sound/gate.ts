// Spec: 02-3 §F22 as amended by X-179 (optional Sounds: default off; on → only Approve and Done; never in quiet hours,
// never while the window is hidden, never the only signal), CR-0021 pick 20, AT-318.
import type { CardRow, JobRow } from '../../shared/types';

export type SoundName = 'approve' | 'done';

/** AT-318: a sound plays only with the setting on, outside quiet hours and while the window is visible. */
export function soundAllowed(g: { setting: boolean; quiet: boolean; hidden: boolean }): boolean {
  return g.setting && !g.quiet && !g.hidden;
}

const APPROVE_CARDS: ReadonlySet<string> = new Set(['approval', 'payment']);
const USER_TAP: ReadonlySet<string> = new Set(['tap', 'keyboard']);

/**
 * Approve: the user's own tap (or Enter) turned an Approval or Payment card APPROVED just now. A card this window had not
 * seen before (opening a chat loads its old cards) is history, not a tap.
 */
export function approvedByUser(prev: CardRow | undefined, next: CardRow): boolean {
  return (
    prev !== undefined &&
    APPROVE_CARDS.has(next.type) &&
    next.state === 'APPROVED' &&
    prev.state !== 'APPROVED' &&
    next.resolvedBy !== null &&
    USER_TAP.has(next.resolvedBy)
  );
}

/** Done: a job of the open chat turned DONE with proof (not "done, not checked"); a job first seen already done is history. */
export function doneWithProof(prev: JobRow | undefined, next: JobRow, openChatId: string | null): boolean {
  return prev !== undefined && next.chatId === openChatId && next.state === 'done' && prev.state !== 'done' && next.proof != null;
}
