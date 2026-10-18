// Spec: 10-acceptance-2 §E PERF-11 (offline shown, J19), 08-3 §20; M14 pack §4: measurable when M4 lands.
import { pending } from './pending';

export const probe = pending('PERF-11', 'network cut → WAITING + offline banner strip', { kind: 'le', max: 10_000, unit: 'ms' }, 'M4');
