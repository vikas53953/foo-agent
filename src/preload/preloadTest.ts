// Spec: 08-3 §22.7 (renderer test hooks, test builds only), §22.8 (test:* channels). Loaded instead of preload.ts only in
// FOO_TEST runs and left out of the packaged app. A sandboxed preload cannot require local files, so the platform bridge
// from preload.ts is repeated here.
import { contextBridge, ipcRenderer } from 'electron';
import type { FooBridge, FooTestBridge, PlatformInfo } from '../shared/ipc';

const platform = ipcRenderer.sendSync('app:platform') as PlatformInfo;
const bridge: FooBridge = { platform };
contextBridge.exposeInMainWorld('foo', bridge);

const call = (channel: string, arg?: unknown) => ipcRenderer.invoke(channel, arg);
const testBridge: FooTestBridge = {
  clock: {
    now: () => call('test:clock', {}),
    set: (at) => call('test:clock', { set: at }),
    advance: (ms) => call('test:clock', { advance: ms }),
  },
  seed: (set) => call('test:seed', { set }),
  setOnline: (online) => call('test:setOnline', { online }),
  theme: (theme) => call('test:theme', { theme }),
  reset: () => call('test:reset'),
};
contextBridge.exposeInMainWorld('__fooTest', testBridge);
