// Spec: 04 §13.5 (kit surfaces: each complete A2UI message draws at once, an incomplete one is held back; two-way controls
// write the surface's data model; user actions go renderer → main `kit:action`), CR-0022 AT-353, AT-355 (a later reply
// updates the surface the action came from), X-180. R1 T2: the renderer half of the surface model. The pure fold is
// shared/kit/surface.ts; this file finds the chat's fences in the store, caches their parses and keeps the user's edits.
import { useMemo, useSyncExternalStore } from 'react';
import type { KitParse } from '../../shared/kit/parse';
import { parseKitBlock } from '../../shared/kit/parse';
import { foldFence, getPath, kitFences, setPath, type Surface } from '../../shared/kit/surface';
import { useStore } from '../store/index';

// ---- the chat's fences ----

const parses = new Map<string, KitParse>();
const PARSE_CACHE = 300;

/** One fence parse, cached by its text (a surface re-folds on every store change while a reply streams). */
export function parseCached(body: string, streaming: boolean): KitParse {
  const key = `${streaming ? 1 : 0}${body}`;
  let p = parses.get(key);
  if (!p) {
    p = parseKitBlock(body, streaming);
    if (parses.size >= PARSE_CACHE) parses.delete(parses.keys().next().value!);
    parses.set(key, p);
  }
  return p;
}

interface ChatFence {
  messageId: string;
  body: string;
  streaming: boolean;
}

const hasFence = (text: string) => text.includes('```');

/** Every ```a2ui fence of the chat's foo messages, in chat order. */
function useChatFences(chatId: string): ChatFence[] {
  const chat = useStore((s) => s.messages.byChat[chatId]);
  return useMemo(() => {
    const out: ChatFence[] = [];
    for (const id of chat?.ids ?? []) {
      const m = chat!.byId[id];
      if (!m || m.authorKind === 'user' || !hasFence(m.text)) continue;
      for (const f of kitFences(m.text)) out.push({ messageId: m.id, body: f.body, streaming: m.status === 'streaming' });
    }
    return out;
  }, [chat]);
}

/**
 * The surfaces one fence draws (04 §13.5): its own messages, then every later fence's messages for the same surfaceId
 * (AT-355). `body` and `streaming` are the fence as the bubble has it right now; outside the store (a kit card, a test
 * harness) the fence draws alone.
 */
export function useFenceSurfaces(
  chatId: string,
  messageId: string,
  body: string,
  streaming: boolean,
): { surfaces: Surface[]; dropped: number; pending: boolean } {
  const fences = useChatFences(chatId);
  return useMemo(() => {
    const own = parseCached(body, streaming);
    const at = fences.findIndex((f) => f.messageId === messageId && f.body === body);
    const all = fences.map((f, i) => (i === at ? own : parseCached(f.body, f.streaming)).messages);
    if (at < 0) all.push(own.messages);
    const folded = foldFence(all, at < 0 ? all.length - 1 : at);
    return { surfaces: folded.surfaces, dropped: own.dropped + folded.dropped, pending: own.pending };
  }, [fences, messageId, body, streaming]);
}

// ---- the user's edits (two-way controls), kept per surface so a row mounted again keeps them ----

interface Edit {
  path: string;
  value: unknown;
  /** The AI's value at `path` when the user changed it: a later reply that changes that value wins (AT-355). */
  base: string;
}

const edits = new Map<string, Edit[]>();
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const json = (v: unknown) => JSON.stringify(v) ?? 'undefined';

/** The surface's data model with the user's still-current edits on top. */
export function useSurfaceData(key: string, aiData: unknown): unknown {
  const mine = useSyncExternalStore(subscribe, () => edits.get(key));
  return useMemo(
    () => (mine ?? []).reduce((d, e) => (json(getPath(aiData, e.path)) === e.base ? setPath(d, e.path, e.value) : d), aiData),
    [mine, aiData],
  );
}

/** A two-way control changed: `aiData` is the surface's data model as the AI last set it. */
export function editSurface(key: string, aiData: unknown, path: string, value: unknown): void {
  const next = (edits.get(key) ?? []).filter((e) => e.path !== path);
  next.push({ path, value, base: json(getPath(aiData, path)) });
  edits.set(key, next);
  listeners.forEach((fn) => fn());
}

/** For unit tests. */
export function resetSurfaceEdits(): void {
  edits.clear();
  parses.clear();
  listeners.forEach((fn) => fn());
}
