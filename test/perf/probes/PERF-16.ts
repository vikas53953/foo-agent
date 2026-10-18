// Spec: 10-acceptance-2 §E PERF-16 (main + renderer idle < 400 MB: app idle 60 s after PERF-01, window focused, E.1 data
// set; resident memory), 08-3 §20 (X-130). Resident memory = the working set Electron reports per process.
import type { SessionProbe } from './types';

export const probe: SessionProbe = {
  kind: 'session',
  id: 'PERF-16',
  measures: 'app idle after PERF-01, window focused → resident memory of main + renderer',
  budget: { kind: 'lt', max: 400, unit: 'MB' },
  smoke: true,
  textScale: false,
  order: 2,
  measure: async (ctx) => {
    await ctx.idle();
    const m = await ctx.metrics();
    const mine = m.filter((p) => p.type === 'Browser' || p.type === 'Tab');
    if (!mine.some((p) => p.type === 'Tab')) throw new Error('no renderer process in the metrics');
    const kb = mine.reduce((s, p) => s + p.workingSetKb, 0);
    return { value: kb / 1024, trace: { processes: m } };
  },
};
