// Spec: 10-acceptance-2 §E PERF-01 (cold start < 2.0 s: process start → chat list painted and accepting input), 08-3 §20,
// G-M14-25 (a `perf.PERF-01` tech-log row wins when the build writes one). The session takes the number while it opens.
import type { SessionProbe } from './types';

export const probe: SessionProbe = {
  kind: 'session',
  id: 'PERF-01',
  measures: 'process start → chat list painted and accepting input',
  budget: { kind: 'lt', max: 2_000, unit: 'ms' },
  smoke: true,
  textScale: true,
  order: 1,
  measure: async (ctx) => ({ value: ctx.coldStart.ms, trace: { source: ctx.coldStart.source, ...(ctx.coldStart.trace as object) } }),
};
