// Spec: 08-5 §5 `spend.ts { summary }` (mirrors Bootstrap.spend; spend:update replaces it), 08-5 §3.2 SpendSummary,
// Article 13 (both caps visible: the sidebar footer and the right shell read this slice).
import type { SpendSummary } from '../../shared/types';
import type { RootState } from './index';

export interface SpendState {
  summary: SpendSummary | null;
}

export const initialSpend = (): SpendState => ({ summary: null });

export const selectSpend = (s: RootState) => s.spend.summary;
