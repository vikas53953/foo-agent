// Spec: 10-acceptance-2 §E PERF-12 (welcome card from Install tap, J1), 08-3 §20; M14 pack §4: measurable when M12 lands.
import { pending } from './pending';

export const probe = pending(
  'PERF-12',
  'Install tapped → welcome card (installed build, T2)',
  { kind: 'le', max: 90_000, unit: 'ms' },
  'M12',
);
