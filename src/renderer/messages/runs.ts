// Spec: 04 §1.2 (rhythm: 2 in a run, 12 between runs, 4 bubble → card of the same sender, 16 below a badge, 24 below a
// reaction chip (CR-0024 B2); separators and markers pad themselves), §1.3 (runs: same sender, ≤ 3 min, nothing between, not deleted, same day,
// the earlier bubble carries no chip and no badge; the unread divider always breaks a run, X-151), §1.4 (corner position
// in the run), §12.4 (sender label above the first bubble of each output run: groups, and foo's and helpers' own chats,
// CR-0024 F2; cards carry it in groups only, 05 §0.2), §17.1 (the action row sits under the
// latest text answer only), §19.7 (cards break runs; 4 after a bubble of the same sender, else 12). Pure.
import type { ChatKind, MessageRow } from '../../shared/types';
import type { VRow } from './rows';

/** foo's or a helper's reaction chips hang 18px below an output bubble (§8); the user's badge slot hangs 10px (§4.3). */
function chipsBelow(m: Msg): boolean {
  return m.authorKind !== 'user' && m.deletedAt === null && m.reactions.length > 0;
}

/** 04 §1.3 rule 2: Signal's COLLAPSE_WITHIN = 3 minutes. */
export const RUN_WINDOW_MS = 180_000;

export type RunPos = 'single' | 'first' | 'middle' | 'last';
/** The space above a row, as a spacing token (02 F3): `s-1` 2, `s0` 4, `s2` 12, `s3` 16, `s5` 24. */
export type Gap = 'none' | 's-1' | 's0' | 's2' | 's3' | 's5';

export interface RowLayout {
  /** Position in the run (bubbles only). */
  pos: RunPos | null;
  gap: Gap;
  /** The label row above the first bubble of an output run (§12.4); on cards in groups only. */
  senderLabel: boolean;
  /** foo's latest text answer: the action row shows under it (§17.1). */
  latestAnswer: boolean;
}

type Msg = Pick<MessageRow, 'authorKind' | 'authorId' | 'kind' | 'createdAt' | 'deletedAt' | 'badge' | 'reactions' | 'status'>;

/** The sender a run is grouped by: the user, foo, or one helper. */
export function senderKey(m: Pick<MessageRow, 'authorKind' | 'authorId'>): string {
  return m.authorKind === 'helper' ? `helper:${m.authorId ?? ''}` : m.authorKind;
}

/** A bubble row (text or voice); cards and markers are rows of their own kind. */
export const isBubble = (m: Pick<MessageRow, 'kind'>): boolean => m.kind === 'text' || m.kind === 'voice';

/** Something hangs below the bubble: the user's badge slot 10px (badge or foo's reaction, §4) or reaction chips 18px (§8). */
export function hangsBelow(m: Msg): boolean {
  if (m.deletedAt !== null) return false;
  if (m.authorKind === 'user') return m.status !== 'failed' && (m.badge !== null || m.reactions.some((r) => r.by !== 'me'));
  return m.reactions.length > 0;
}

/** 04 §1.3: may `b` join the run that `a` (the row right above it) belongs to? Rows between them break runs already. */
export function joinsRun(a: Msg, b: Msg): boolean {
  return (
    isBubble(a) &&
    isBubble(b) &&
    senderKey(a) === senderKey(b) &&
    b.createdAt - a.createdAt <= RUN_WINDOW_MS &&
    b.createdAt >= a.createdAt &&
    a.deletedAt === null &&
    b.deletedAt === null &&
    !hangsBelow(a)
  );
}

const isOutput = (m: Msg) => m.authorKind === 'foo' || m.authorKind === 'helper';

/** Layout facts for every row (rows are in display order). */
export function layoutRows(rows: VRow[], o: { chatKind: ChatKind }): RowLayout[] {
  const isGroup = o.chatKind === 'group';
  const out: RowLayout[] = rows.map(() => ({ pos: null, gap: 'none', senderLabel: false, latestAnswer: false }));
  const joined: boolean[] = rows.map(() => false);
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1]!;
    const b = rows[i]!;
    if (a.kind === 'message' && b.kind === 'message') joined[i] = joinsRun(a.message, b.message);
  }
  let latest = -1;
  rows.forEach((r, i) => {
    if (r.kind !== 'message') return;
    const m = r.message;
    if (isOutput(m) && m.kind === 'text' && m.deletedAt === null && m.status === 'complete') latest = i;
  });
  rows.forEach((r, i) => {
    if (r.kind !== 'message') return;
    const m = r.message;
    const prev = rows[i - 1];
    const L = out[i]!;
    if (isBubble(m)) {
      const startsRun = !joined[i];
      const continues = i + 1 < rows.length && joined[i + 1]!;
      L.pos = startsRun ? (continues ? 'first' : 'single') : continues ? 'middle' : 'last';
      L.senderLabel = startsRun && isOutput(m);
    } else if (m.kind === 'card') {
      // Cards carry the group sender row too (05 §0.2 "Group sender"), unless they follow a bubble of the same sender.
      L.senderLabel =
        isGroup && isOutput(m) && !(prev?.kind === 'message' && isOutput(prev.message) && senderKey(prev.message) === senderKey(m));
    }
    L.latestAnswer = i === latest;
    // Gap above (§1.2). Separators, the unread divider and markers carry their own padding.
    if (!prev || prev.kind !== 'message' || m.kind === 'marker' || prev.message.kind === 'marker') L.gap = 'none';
    else if (chipsBelow(prev.message)) L.gap = 's5';
    else if (hangsBelow(prev.message)) L.gap = 's3';
    else if (m.kind === 'card') L.gap = isBubble(prev.message) && senderKey(prev.message) === senderKey(m) ? 's0' : 's2';
    else if (joined[i]) L.gap = 's-1';
    else L.gap = 's2';
  });
  return out;
}

/** 04 §1.4: which corners are the 6px tail corners, as [top-left, top-right, bottom-right, bottom-left] booleans. */
export function tailCorners(pos: RunPos, side: 'me' | 'them'): [boolean, boolean, boolean, boolean] {
  const continued = pos === 'middle' || pos === 'last';
  return side === 'me' ? [false, continued, true, false] : [continued, false, false, true];
}
