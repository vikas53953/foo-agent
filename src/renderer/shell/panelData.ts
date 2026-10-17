// Spec: 03-shell-2 §3.7.3.2 (Using: apps a job used in the last 24 h or is using now, most recent first, 8 max),
// §3.7.3.3 (What I know: up to 3 facts, most recently used then newest; private facts never in a group, Article 14), §3.7.4.
import type { ChatRow, JobRow, MemoryFactView } from '../../shared/types';

export const USING_MAX = 8;
export const KNOW_MAX = 3;
const DAY = 24 * 3_600_000;

export interface UsingChip {
  app: 'browser';
  inUse: boolean;
  at: number;
}

const LIVE: JobRow['state'][] = ['queued', 'working', 'needs_you', 'waiting'];

/**
 * Apps after the AI chip. The store's JobRow says only whether a job uses foo's browser (`usesBrowser`), so Browser is
 * the one app the shell can name from job-runner state in M1; connector apps join when their tool calls reach the store.
 */
export function usingChips(jobs: JobRow[], now: number): UsingChip[] {
  const browserJobs = jobs.filter((j) => j.usesBrowser && (LIVE.includes(j.state) || (j.finishedAt ?? 0) >= now - DAY));
  if (!browserJobs.length) return [];
  const inUse = browserJobs.some((j) => LIVE.includes(j.state));
  const at = Math.max(...browserJobs.map((j) => j.finishedAt ?? now));
  return [{ app: 'browser', inUse, at }];
}

/** Facts for this chat: foo's chat = general facts (+ this chat's own); helper = its notes; group = none. */
export function knowFacts(facts: MemoryFactView[], chat: ChatRow): { rows: MemoryFactView[]; total: number } {
  const mine = facts.filter((f) => {
    if (chat.kind === 'group') return false;
    if (chat.kind === 'helper') return f.scope === 'helper' && f.file === `helpers/${chat.helperId}/notes.md`;
    return f.scope === 'global' || (f.scope === 'chat' && f.chatId === chat.id);
  });
  const sorted = [...mine].sort((a, b) => (b.lastUsedAt ?? -1) - (a.lastUsedAt ?? -1) || b.learnedAt - a.learnedAt);
  return { rows: sorted.slice(0, KNOW_MAX), total: mine.length };
}
