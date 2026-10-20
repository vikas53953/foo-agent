// Spec: 08-1 §3.1 (window.foo: invoke, on, platform; channels allow-listed here, zod-checked in main), 08-1 §3.3 (events).
// A sandboxed preload cannot require local files, so the allow-lists are written out; test/unit/preload.test.ts checks
// they equal INVOKE_CHANNELS and EVENT_CHANNELS in src/shared/ipc.ts, less `live:frame` and `live:state`, which only the live
// window's preload (preloadLive.ts) carries (08-1 §3.3).
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
  // M9 (CR-0013).
  'job:openWindow',
  'job:takeOver',
  'job:handBack',
  'signin:done',
  'signin:skip',
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
  // CR-0022 (X-180)
  'kit:action',
  'kit:refresh',
  'page:rpc',
  'keep:save',
  'keep:list',
  'page:open',
  'keep:open',
  'keep:showInFolder',
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
  send: (event, payload) => {
    if (event === 'face:raster') ipcRenderer.send(event, payload);
  },
};
contextBridge.exposeInMainWorld('foo', bridge);
