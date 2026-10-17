// Spec: 08-0 §F (status badge values, glyphs and tooltips, X-61; "the glyph map lives only in src/shared/badges.ts"),
// 04 §4.2 (tooltip variants: working_slow, waiting_ai, reacted), 04-2 §28 (`bubble.badge.tooltip.*` keys).
import type { BadgeValue } from './types';

/** The only place a badge emoji is written (08-0 §F). */
export const BADGE_GLYPH: Record<BadgeValue, string> = {
  seen: '👀',
  working: '🛠',
  waiting: '⏳',
  done: '✅',
  done_unverified: '✅',
  failed: '❌',
  stopped: '⛔',
};

/** Values that never change once shown (04 §4.1 rule 3). */
export const FINAL_BADGES: readonly BadgeValue[] = ['done', 'done_unverified', 'failed', 'stopped'];
