// Spec: CR-0022 pick 9 (a kept item is a `kept_items` row shown in the chat's Files tab), 08-1 §3.2 `keep:save` /
// `keep:list`, AT-369, X-180. R1 T7. The chat's kept items for the panel list, and which surfaces and pages were kept this
// run (so a row the message list mounts again still says "Kept"). No store slice: the list loads itself.
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { InvokeIn } from '../../shared/ipc';
import type { KeptItem } from '../../shared/types';
import { invoke } from '../ipc/client';

const kept = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;
const changed = () => {
  version++;
  for (const l of listeners) l();
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** True once this surface or page was kept (by its own key: host plus surface id or page index). */
export function useKept(key: string): boolean {
  return useSyncExternalStore(subscribe, () => kept.has(key));
}

/** Where the snapshot is: the element's box in the window (CSS px; main scales it by the zoom). */
export function rectOf(el: Element | null): { x: number; y: number; width: number; height: number } | undefined {
  if (!el) return undefined;
  const r = el.getBoundingClientRect();
  const clamp = (n: number) => Math.max(0, Math.min(10_000, Math.round(n)));
  return { x: clamp(r.left), y: clamp(r.top), width: clamp(r.width), height: clamp(r.height) };
}

/** `keep:save`; on success the item shows as kept everywhere and the chat's list reloads. */
export async function keep(key: string, req: InvokeIn['keep:save']): Promise<KeptItem | null> {
  const r = await invoke('keep:save', req).catch(() => null);
  if (!r?.ok) return null;
  kept.add(key);
  changed();
  return r.value;
}

/** The chat's kept items, newest first; reloads after every Keep. */
export function useKeptList(chatId: string): KeptItem[] | null {
  const v = useSyncExternalStore(subscribe, () => version);
  const [items, setItems] = useState<{ chatId: string; items: KeptItem[] } | null>(null);
  useEffect(() => {
    let live = true;
    void invoke('keep:list', { chatId }).then(
      (r) => live && setItems({ chatId, items: r.ok ? r.value : [] }),
      () => live && setItems({ chatId, items: [] }),
    );
    return () => {
      live = false;
    };
  }, [chatId, v]);
  return items?.chatId === chatId ? items.items : null;
}
