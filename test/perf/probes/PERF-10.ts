// Spec: 10-acceptance-2 §E PERF-10 (face/name update, J3), 08-3 §20; M14 pack §4: measurable when M11 lands.
import { pending } from './pending';

export const probe = pending(
  'PERF-10',
  'face tapped → chat list, header, jump list updated',
  { kind: 'le', max: 1_000, unit: 'ms' },
  'M11',
);
