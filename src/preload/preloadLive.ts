// Spec: 08-1 §3.1.1 (each window's preload exposes only that window's channels; the live window: job:stop, job:takeOver,
// job:handBack, job:watch), 08-1 §3.3 (`live:frame` and `live:state` reach the live window only), 06-3 §11.2 (the window
// also follows its job row and the agent name). A sandboxed preload cannot require local files, so the lists are written
// out; test/unit/m9-live-window.test.ts checks them against WINDOW_CHANNELS in src/main/ipc/guard.ts.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { FooBridge, PlatformInfo } from '../shared/ipc';

const INVOKES = new Set(['job:stop', 'job:takeOver', 'job:handBack', 'job:watch']);
const EVENTS = new Set(['live:frame', 'live:state', 'job:upsert', 'settings:changed']);

const platform = ipcRenderer.sendSync('app:platform') as PlatformInfo;
const bridge: FooBridge = {
  platform,
  invoke: (channel, payload) => {
    if (!INVOKES.has(channel)) return Promise.resolve({ ok: false, error: { kind: 'IPC_REJECTED' } });
    return ipcRenderer.invoke(channel, payload);
  },
  on: (event, cb) => {
    if (!EVENTS.has(event)) return () => undefined;
    const listener = (_e: IpcRendererEvent, payload: unknown) => cb(payload as never);
    ipcRenderer.on(event, listener);
    return () => ipcRenderer.removeListener(event, listener);
  },
};
contextBridge.exposeInMainWorld('foo', bridge);
