// Spec: 10-acceptance-2 §E PERF-18 (voice transcript, J7), 08-3 §20; M14 pack §4: measurable when M11 lands.
import { pending } from './pending';

export const probe = pending('PERF-18', 'end of a 15-s voice note → transcript shown', { kind: 'le', max: 3_000, unit: 'ms' }, 'M11');
