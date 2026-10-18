// Spec: 10-acceptance-2 §E PERF-09 (taskbar overlay, J20), 08-3 §20; M14 pack §4: measurable when M11 lands.
import { pending } from './pending';

export const probe = pending('PERF-09', 'job enters NEEDS YOU → overlay shown', { kind: 'le', max: 2_000, unit: 'ms' }, 'M11');
