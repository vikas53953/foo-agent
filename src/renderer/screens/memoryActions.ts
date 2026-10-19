// Spec: 06-2 §7.4 (each action and its one write: Edit `memory:edit`, Forget `memory:forget` + Undo `memory:undo`, Forget
// everything from {source} `memory:forgetBySource` (C-3), Forget everything `memory:forgetAll` typed FORGET (C-4), Export
// what I know: folder picker then `data:export {scope:'memory'}` (CR-0010 G-M6-11), Open the memory folder
// `memory:openFolder`, Mark private `memory:setPrivate`; row ⋯ Move to… `memory:setKind`, X-06), §7.3 (+ Add something
// `memory:add`), §7.5 (memory off → "Turn back on" = settings `privacy.rememberOn`; unreadable lines → "Open the file"
// `files:open`), 08-1 §3.2. Every button sends exactly one invoke; the engine-bound ones wait as long as main does (30 s).
import type { Result } from '../../shared/errors';
import type { MemoryFactView, MemoryKind, MemoryOrigin } from '../../shared/types';
import { invoke } from '../ipc/client';

const ENGINE_WAIT = 30_000;

export const memoryActions = {
  list: () => invoke('memory:list', { filter: { chip: 'all' } }),
  add: (text: string) => invoke('memory:add', { text: text.trim() }, ENGINE_WAIT),
  edit: (factId: string, text: string) => invoke('memory:edit', { factId, text: text.trim() }, ENGINE_WAIT),
  setPrivate: (factId: string, on: boolean) => invoke('memory:setPrivate', { factId, private: on }, ENGINE_WAIT),
  setKind: (factId: string, kind: MemoryKind) => invoke('memory:setKind', { factId, kind }, ENGINE_WAIT),
  forget: (factId: string) => invoke('memory:forget', { factId }, ENGINE_WAIT),
  undo: (undoToken: string) => invoke('memory:undo', { undoToken }, ENGINE_WAIT),
  forgetBySource: (source: MemoryOrigin) => invoke('memory:forgetBySource', { source, confirm: true }, ENGINE_WAIT),
  forgetAll: () => invoke('memory:forgetAll', { typed: 'FORGET' }, ENGINE_WAIT),
  openFolder: () => invoke('memory:openFolder', {}),
  openFile: (file: string) => invoke('files:open', { path: file }),
  showInFolder: (path: string) => invoke('files:showInFolder', { path }),
  turnBackOn: () => invoke('settings:set', { path: 'privacy.rememberOn', value: true }),
  /** The Windows folder picker, then the memory-only export; the end arrives on `data:exportProgress`. */
  async exportTo(): Promise<Result<{ exportId: string }> | null> {
    const picked = await invoke('files:pickFolder', { purpose: 'export' });
    if (!picked.ok || !picked.value.path) return null;
    return invoke('data:export', { folder: picked.value.path, scope: 'memory' });
  },
};

/** "Show where I learned it": a chat origin `chat:{chatId}/{messageId}` names the chat to open (08-3 §12.2). */
export function learnedInChat(f: Pick<MemoryFactView, 'origin' | 'originKind'>): string | null {
  if (f.originKind !== 'chat') return null;
  const m = /^chat:([^/]+)/.exec(f.origin);
  return m?.[1] ?? null;
}
