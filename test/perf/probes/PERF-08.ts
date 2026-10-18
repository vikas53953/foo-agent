// Spec: 10-acceptance-2 §E PERF-08 (checklist, J5), 08-3 §20; M14 pack §4: measurable when M4 lands.
import { pending } from './pending';

export const probe = pending(
  'PERF-08',
  'job start → checklist painted (appears no earlier than 1.5 s)',
  { kind: 'range', min: 1_500, max: 2_000, unit: 'ms' },
  'M4',
);
