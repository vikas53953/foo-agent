// Spec: G-M14-25 (launch the measured build unchanged, with the perf data in its real {DATA}; no FOO_TEST, no FOO_PERF, no
// env override), 10-acceptance-2 §E.1 (a cold launch per run; text size 225 % repeat), PERF-01 (process start → chat list
// painted and accepting input), PERF-15 (main → renderer events), PERF-16/17 (resident memory per process).
// On CI the run is reboot-free; on the reference laptop the "after reboot" half of PERF-01 is the operator's (runbook note).
import { _electron as electron } from '@playwright/test';
import electronPath from 'electron';
import { TID } from '../../../src/shared/testids';
import { loadProfile } from '../../../scripts/perf/profile';
import { readTechLogMarks } from '../../../scripts/perf/techLog';
import type { ProcessMetric, SessionCtx } from './types';

export interface SessionOptions {
  run: number;
  textScale: number;
  idleMs: number;
  /** The installed or packaged foo.exe; without it, the built app in this checkout (`electron .`). */
  app?: string;
  perfData: string;
  dataDir: string;
}

/** Variables a test run sets; the measured build must see none of them (G-M14-25). */
const TEST_ENV = /^FOO_(TEST|DATA_DIR|LOCAL_DIR|OUT_DIR|FAKE_AI)$/;

export async function openProdSession(o: SessionOptions): Promise<SessionCtx> {
  loadProfile(o.dataDir, o.perfData);
  const env = Object.fromEntries(Object.entries(process.env).filter(([k, v]) => v !== undefined && !TEST_ENV.test(k))) as Record<
    string,
    string
  >;
  const args = o.app ? [] : ['.'];
  if (process.platform === 'linux') args.push('--no-sandbox');
  const app = await electron.launch({ executablePath: o.app ?? (electronPath as unknown as string), args, env, colorScheme: null });
  try {
    // Every main → renderer event from here on, by size (PERF-15). Installed before the window can ask for anything.
    await app.evaluate(({ app: a, webContents }) => {
      const g = globalThis as unknown as { __fooPerfPatches?: { channel: string; bytes: number }[] };
      g.__fooPerfPatches = [];
      const hook = (wc: Electron.WebContents) => {
        const send = wc.send.bind(wc);
        wc.send = (channel: string, ...args: unknown[]) => {
          g.__fooPerfPatches!.push({ channel, bytes: Buffer.byteLength(JSON.stringify(args) ?? '') });
          send(channel, ...args);
        };
      };
      for (const wc of webContents.getAllWebContents()) hook(wc);
      a.on('web-contents-created', (_e, wc) => hook(wc));
    });
    const page = await app.firstWindow();
    if (o.textScale !== 1) {
      // CI's text-size override (pack T5): the window's zoom; the reference laptop uses the Windows "Text size" setting.
      await app.evaluate(
        ({ BrowserWindow }, z) => BrowserWindow.getAllWindows().forEach((w) => w.webContents.setZoomFactor(z)),
        o.textScale,
      );
    }
    const paintedAt = await page
      .waitForFunction(
        (row) => {
          const w = window as unknown as { __perfPainted?: number };
          const el = document.querySelector(`[data-testid="${row}"]`);
          if (el && document.readyState === 'complete') w.__perfPainted ??= performance.timeOrigin + performance.now();
          return w.__perfPainted ?? false;
        },
        TID.chatlistRow,
        { polling: 'raf', timeout: 60_000 },
      )
      .then((h) => h.jsonValue() as Promise<number>);
    const createdAt = await app.evaluate(() => (process as unknown as { getCreationTime(): number | null }).getCreationTime());
    if (!createdAt) throw new Error('the main process gave no creation time');
    const marks = readTechLogMarks(o.dataDir)['PERF-01'];
    const coldStart = marks?.length
      ? { ms: marks.at(-1)!, source: 'tech-log' as const, trace: { marks } }
      : { ms: paintedAt - createdAt, source: 'probe' as const, trace: { createdAt, paintedAt } };

    let idled: Promise<void> | null = null;
    return {
      app,
      page,
      run: o.run,
      textScale: o.textScale,
      coldStart,
      idle: () => (idled ??= page.waitForTimeout(Math.max(0, paintedAt + o.idleMs - Date.now()))),
      metrics: () =>
        app.evaluate(({ app: a }) =>
          a.getAppMetrics().map((m): ProcessMetric => ({
            type: m.type,
            name: m.name,
            serviceName: m.serviceName,
            workingSetKb: m.memory.workingSetSize,
            cpuPercent: m.cpu.percentCPUUsage,
          })),
        ),
      patches: () =>
        app.evaluate(() => (globalThis as unknown as { __fooPerfPatches: { channel: string; bytes: number }[] }).__fooPerfPatches.slice()),
      close: () => app.close(),
    };
  } catch (e) {
    await app.close().catch(() => {});
    throw e;
  }
}
