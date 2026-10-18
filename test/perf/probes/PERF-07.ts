// Spec: 10-acceptance-2 §E PERF-07 (seen badge, C1), 08-3 §20; M14 pack §4: measurable when M4 lands.
import { pending } from './pending';

export const probe = pending('PERF-07', 'send → 👀 painted', { kind: 'le', max: 1_000, unit: 'ms' }, 'M4');
