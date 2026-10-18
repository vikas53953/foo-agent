// Spec: 08-1 §3.2 (`job:openWindow { jobId }` → BROWSER_MISSING; `job:watch { jobId; on }` → LIVE_UNAVAILABLE, frames arrive
// on `live:frame`), §3.3 (`live:frame`, `live:state` to the live window only, 08-0 §G.8), §2.4 (`job.watch` to the engine),
// 09 §9.27.2 (the live window), 08-4 §27.5 (`resources/no-capture-hosts.json`, read once). Registered from IpcRouter.
import { BrowserWindow } from 'electron';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fail, ok, type Result } from '../../shared/errors';
import { createNoCapture, hostListSchema } from '../../shared/handback';
import type { EventChannel, InvokeIn, InvokeOut } from '../../shared/ipc';
import { deps } from '../deps';
import type { AppContext } from '../ipc/IpcRouter';
import { resourcesDir } from '../engine-supervisor/EngineSupervisor';
import { jobRows, publicSettings } from '../store/queries';
import { electronLiveWindow, LiveWindows } from '../windows/liveWindow';

type Handle = <C extends 'job:openWindow' | 'job:watch'>(
  channel: C,
  fn: (req: InvokeIn[C]) => Result<InvokeOut[C]> | Promise<Result<InvokeOut[C]>>,
) => void;

let windows: LiveWindows | null = null;

/** Called by `emit` before it broadcasts: `live:*` never reach any window but their job's live window. */
export function routeLive(event: EventChannel, payload: unknown): boolean {
  if (windows) return windows.route(event, payload);
  return event === 'live:frame' || event === 'live:state';
}

const mainWindow = () =>
  BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && !w.webContents.getURL().includes('/windows/')) ?? null;

export function registerLiveIpc(ctx: AppContext, handle: Handle): void {
  const now = () => deps.clock.now();
  const row = (jobId: string) => jobRows(ctx.db, 'id = ?', [jobId], now())[0] ?? null;
  const noCapture = createNoCapture(hostListSchema.parse(JSON.parse(readFileSync(join(resourcesDir(), 'no-capture-hosts.json'), 'utf8'))));
  windows = new LiveWindows({
    clock: deps.clock,
    job: row,
    noCapture,
    watch: (jobId, on) => void ctx.engine?.send('job.watch', { jobId, on }),
    create: (job) =>
      electronLiveWindow(job, {
        main: mainWindow(),
        initial: (send) => {
          send('settings:changed', publicSettings(ctx.settings.get()));
          const fresh = row(job.id);
          if (fresh) send('job:upsert', fresh);
        },
      }),
  });
  handle('job:openWindow', ({ jobId }) => windows!.open(jobId));
  handle('job:watch', async ({ jobId, on }) => {
    if (!ctx.engine?.live) return on ? fail('LIVE_UNAVAILABLE') : ok(undefined);
    const r = await ctx.engine.request<void, 'job.watch'>('job.watch', { jobId, on }, 15_000);
    if (r.ok || !on) return ok(undefined);
    return fail('LIVE_UNAVAILABLE');
  });
}
