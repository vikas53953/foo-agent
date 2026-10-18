// Spec: 10-acceptance-2 §E PERF-17 (engine idle < 250 MB: engine process idle 60 s, no job running, E.1 data set; resident
// memory), 08-3 §20 (X-130), 08-1 §2.1 (the engine is the utility process "foo engine").
import type { SessionProbe } from './types';

export const ENGINE_SERVICE = 'foo engine';

export const probe: SessionProbe = {
  kind: 'session',
  id: 'PERF-17',
  measures: 'engine idle, no job running → resident memory of the engine process',
  budget: { kind: 'lt', max: 250, unit: 'MB' },
  smoke: true,
  textScale: false,
  order: 3,
  measure: async (ctx) => {
    await ctx.idle();
    const m = await ctx.metrics();
    const engine = m.filter((p) => p.type === 'Utility' && (p.serviceName === ENGINE_SERVICE || p.name === ENGINE_SERVICE));
    if (engine.length === 0) throw new Error('the engine process is not running');
    return { value: engine.reduce((s, p) => s + p.workingSetKb, 0) / 1024, trace: { engine } };
  },
};
