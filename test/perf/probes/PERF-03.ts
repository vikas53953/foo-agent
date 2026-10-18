// Spec: 10-acceptance-2 §E PERF-03 (switch chats < 100 ms: click or Enter on a chat row → that chat's last messages
// painted), 08-3 §20. Timed inside the page: the click, then the first task after the frame that shows the new header and
// the chat's messages (the CR-0005 "first task after the frame" end point). Each run opens a different row of the list.
import { TID } from '../../../src/shared/testids';
import type { SessionProbe } from './types';

export const probe: SessionProbe = {
  kind: 'session',
  id: 'PERF-03',
  measures: 'click on a chat row → that chat’s last messages painted',
  budget: { kind: 'lt', max: 100, unit: 'ms' },
  smoke: true,
  textScale: true,
  order: 4,
  measure: async (ctx) => {
    const k = 1 + ((ctx.run - 1) % 8);
    const out = await ctx.page.evaluate(
      ([tid, k]) =>
        new Promise<{ ms: number; name: string }>((resolve, reject) => {
          const q = (id: string, root: ParentNode = document) => root.querySelector(`[data-testid="${id}"]`);
          const row = document.querySelectorAll(`[data-testid="${tid.row}"]`)[k] as HTMLElement | undefined;
          if (!row) return reject(new Error(`no chat row ${k}`));
          const name = q(tid.rowName, row)?.textContent ?? '';
          const t0 = performance.now();
          row.click();
          const tick = () => {
            const header = q(tid.header)?.textContent ?? '';
            const log = q(tid.log);
            if (header.includes(name) && log?.querySelector('[data-index]')) {
              requestAnimationFrame(() => setTimeout(() => resolve({ ms: performance.now() - t0, name }), 0));
            } else if (performance.now() - t0 > 10_000) reject(new Error(`chat "${name}" did not open in 10 s`));
            else requestAnimationFrame(tick);
          };
          tick();
        }),
      [{ row: TID.chatlistRow, rowName: TID.chatlistRowName, header: TID.chatHeaderName, log: TID.threadLog }, k] as const,
    );
    return { value: out.ms, trace: { row: k, chat: out.name } };
  },
};
