// Spec: 08-1 §3.1 (window.foo: invoke, on, platform; channels allow-listed here, zod-checked in main), 08-1 §3.3 (events).
// A sandboxed preload cannot require local files, so the allow-lists are written out; test/unit/preload.test.ts checks
// they equal INVOKE_CHANNELS and EVENT_CHANNELS in src/shared/ipc.ts.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { FooBridge, PlatformInfo } from '../shared/ipc';

const INVOKES = new Set([
  'app:getBootstrap',
  'app:quit',
  'app:openWindowsSettings',
  'chat:list',
  'chat:open',
  'chat:markRead',
  'chat:pin',
  'chat:mute',
  'message:list',
  'message:get',
  'message:react',
  'message:pin',
  'message:send',
  'composer:checkSecret',
  'composer:saveDraft',
  'files:stage',
  'voice:submit',
  'helper:pause',
  'message:edit',
  'message:delete',
  'message:retry',
  'message:stopReply',
  'files:open',
  'files:showInFolder',
  'job:details',
  'routine:pause',
  'link:open',
  'app:showEmojiPanel',
  'job:stop',
  'job:watch',
  // M4 T5 job and card answers (08-1 §3.2, CR-0008 G-M4-09).
  'job:stopAll',
  'job:retry',
  'plan:go',
  'plan:change',
  'stuck:choose',
  'recovery:choose',
  'error:fix',
  'helper:create',
  'helper:update',
  'helper:delete',
  'group:create',
  'group:update',
  'group:delete',
  'chat:delete',
  'files:list',
  'files:pickFolder',
  'activity:list',
  'activity:saveCsv',
  'spend:month',
  'search:query',
  'search:recent',
  'search:clearRecent',
  'search:ask',
  'settings:undo',
  'data:deleteOlderThan',
  'suggestions:listDismissed',
  'suggestions:restoreDismissed',
  'routine:pauseAll',
  'routine:resumeAll',
  'memory:list',
  'routine:list',
  'helper:list',
  'settings:get',
  'settings:set',
  'ai:verify',
  'ai:detect',
  'ai:choose',
  'notifications:status',
]);
const EVENTS = new Set([
  'chat:upsert',
  'chat:removed',
  'chat:typing',
  'message:upsert',
  'message:delta',
  'message:badge',
  'card:upsert',
  'job:upsert',
  'ai:status',
  'ai:detectRow',
  'spend:update',
  'connection:upsert',
  'settings:changed',
  'net:state',
  'navigate',
]);

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
