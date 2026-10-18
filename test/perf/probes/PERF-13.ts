// Spec: 10-acceptance-2 §E PERF-13 (living faces idle < 1 % CPU: chat list with 200 chats visible, every face resting,
// window focused 60 s; then minimised and session locked 60 s; 0 running face animations while hidden), 02 §F15.9.8,
// M14 pack §4 (idle and minimised now; the full mood set with M12). Locking the session cannot be scripted: the reference
// laptop run does that half by hand. Full runs only (two minutes a run).
import type { SessionProbe } from './types';

const WINDOW_MS = 60_000;

export const probe: SessionProbe = {
  kind: 'session',
  id: 'PERF-13',
  measures: '200 resting faces, focused 60 s then minimised 60 s → average CPU of foo’s processes',
  budget: { kind: 'lt', max: 1, unit: '%' },
  smoke: false,
  textScale: false,
  order: 8,
  measure: async (ctx) => {
    const cpu = async () => (await ctx.metrics()).reduce((s, p) => s + p.cpuPercent, 0);
    await cpu(); // Electron reports CPU since the last call: this one starts the window
    await ctx.page.waitForTimeout(WINDOW_MS);
    const focused = await cpu();
    await ctx.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.minimize());
    await ctx.page.waitForTimeout(WINDOW_MS);
    const minimised = await cpu();
    const running = await ctx.page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
    await ctx.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.restore());
    if (running > 0) throw new Error(`${running} animations still running while minimised`);
    return { value: Math.max(focused, minimised), trace: { focused, minimised, runningWhileHidden: running, locked: 'by hand' } };
  },
};
