// Spec: 10-acceptance-2 §E PERF-06 (stop, J18), 08-3 §20; M14 pack §4: measurable when M4 lands.
import { pending } from './pending';

export const probe = pending(
  'PERF-06',
  '"stop" sent → last click or AI call for that job; 0 events after 1 s',
  { kind: 'lt', max: 1_000, unit: 'ms' },
  'M4',
);
