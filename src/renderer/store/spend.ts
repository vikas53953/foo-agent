// Spec: 08-5 §5 `spend.ts { summary }` (mirrors Bootstrap.spend; spend:update replaces it), 08-5 §3.2 SpendSummary,
// Article 13 (both caps visible: the sidebar footer and the right shell read this slice).
import type { SpendSummary } from '../../shared/types';
import type { RootState } from './index';

export interface SpendState {
  summary: SpendSummary | null;
}

export const initialSpend = (): SpendState => ({ summary: null });

/** spend:update: the newest month wins; a late summary for an older month (sent before the month turned) is ignored. */
export function updateSpendReducer(s: SpendState, summary: SpendSummary): void {
  if (s.summary && summary.month < s.summary.month) return;
  s.summary = summary;
}

export const selectSpend = (s: RootState) => s.spend.summary;
