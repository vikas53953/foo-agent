// Spec: 10-acceptance-2 §E PERF-05 (search first page, J22), 08-3 §20; M14 pack §4: measurable when M13 lands.
import { pending } from './pending';

export const probe = pending(
  'PERF-05',
  'last keystroke + 150 ms debounce → first results painted, at 50,000 and at 100,000 messages',
  { kind: 'lt', max: 300, unit: 'ms' },
  'M13',
);
