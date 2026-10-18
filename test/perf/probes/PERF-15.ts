// Spec: 10-acceptance-2 §E PERF-15 (IPC patch < 64 KB: any main → renderer delta patch during the E.1 data set's busiest
// step; frames excepted), 08-3 §20 (X-130). Runs last in the session, so it sees every event the other probes' steps
// caused (launch, chat switch, opening the 5,000-message chat, typing, the fling). The run's number is its largest patch.
import type { SessionProbe } from './types';

export const probe: SessionProbe = {
  kind: 'session',
  id: 'PERF-15',
  measures: 'largest main → renderer event in the session (frames excepted)',
  budget: { kind: 'lt', max: 64, unit: 'KB' },
  smoke: true,
  textScale: false,
  order: 9,
  measure: async (ctx) => {
    const all = await ctx.patches();
    const sent = all.filter((p) => !/frame/i.test(p.channel));
    const largest = sent.reduce((a, p) => (p.bytes > a.bytes ? p : a), { channel: '', bytes: 0 });
    const byChannel: Record<string, { n: number; max: number }> = {};
    for (const p of sent) {
      const c = (byChannel[p.channel] ??= { n: 0, max: 0 });
      c.n++;
      c.max = Math.max(c.max, p.bytes);
    }
    return { value: largest.bytes / 1024, trace: { largest, events: sent.length, byChannel } };
  },
};
