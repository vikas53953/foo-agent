// Spec: M14 pack §4 (PERF ids that become measurable with a later milestone skip with "needs Mx" until it lands).
import type { Budget } from '../compare';
import type { PendingProbe, PerfId } from './types';

export const pending = (id: PerfId, measures: string, budget: Budget, needs: string): PendingProbe => ({
  kind: 'pending',
  id,
  measures,
  budget,
  needs,
  smoke: false,
  textScale: false,
});
