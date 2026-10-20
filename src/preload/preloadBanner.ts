// Spec: 08-1 §3.1.1 (each window's preload exposes only the channels that window uses; the sign-in banner: `signin:done`,
// `signin:skip`, `job:handBack`), 09 §9.27.3 (the docked sign-in banner window). A sandboxed preload cannot require local
// files, so the list is written out; test/unit/m9-signin-banner-preload.test.ts checks it is these three and that each is a
// shared invoke channel. The banner listens to no events: main drives it through its URL hash (implementation-notes T6-07).
import { contextBridge, ipcRenderer } from 'electron';
import type { FooBridge, PlatformInfo } from '../shared/ipc';

const INVOKES = new Set(['signin:done', 'signin:skip', 'job:handBack']);

const platform = ipcRenderer.sendSync('app:platform') as PlatformInfo;
const bridge: FooBridge = {
  platform,
  invoke: (channel, payload) => {
    if (!INVOKES.has(channel)) return Promise.resolve({ ok: false, error: { kind: 'IPC_REJECTED' } });
    return ipcRenderer.invoke(channel, payload);
  },
  on: () => () => undefined,
};
contextBridge.exposeInMainWorld('foo', bridge);
