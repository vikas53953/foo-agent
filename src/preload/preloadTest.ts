// Spec: 08-3 §22.7 (renderer test hooks, test builds only), §22.8 (test:* channels). Loaded instead of preload.ts only in
// FOO_TEST runs and left out of the packaged app. A sandboxed preload cannot require local files, so the bridge from
// preload.ts is repeated here (test/unit/preload.test.ts checks the two copies match).
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { FooBridge, FooTestBridge, PlatformInfo } from '../shared/ipc';

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
  'memory:list',
  'memory:add',
  'memory:edit',
  'memory:setPrivate',
  'memory:setKind',
  'memory:forget',
  'memory:undo',
  'memory:forgetBySource',
  'memory:forgetAll',
  'memory:openFolder',
  'data:export',
  'files:pickFolder',
  'routine:list',
  'helper:list',
  'settings:get',
  'settings:set',
  'ai:verify',
  'ai:detect',
  'ai:choose',
  'notifications:status',
  // M8 T3
  'whatsapp:linkStart',
  'whatsapp:linkCancel',
  'whatsapp:unlink',
  'chat:archive',
  // M8
  'connection:list',
  'connection:connect',
  'connection:disconnect',
  'connection:googleInfo',
  'ai:openFinder',
  'ai:askKey',
  'app:openExternal',
  'card:answer',
  'card:approve',
  'card:decline',
  'card:askAgain',
  'card:heldPick',
  'draft:update',
  'draft:send',
  'draft:undo',
  'draft:discard',
  'draft:openInApp',
  'secret:save',
  'secret:list',
  'secret:delete',
  'code:submit',
  // M5 T2
  'secret:offer',
  // M5 T14
  'approval:report',
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
  // M8 T3
  'whatsapp:qr',
  'memory:changed',
  'data:exportProgress',
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
  jobState: (jobId, state) => call('test:jobState', { jobId, state }),
  wa: (op) => call('test:wa', op),
  cardSeed: (arg) => call('test:card.seed', arg),
  memoryTidy: () => call('test:memoryTidy'),
};
contextBridge.exposeInMainWorld('__fooTest', testBridge);
