// Spec: 04 §14.4 (streaming: each new word fades in over 150ms, linear, no movement, no blinking cursor; reduced motion: no
// fade), 02 §F7.1 "Chat" (CR-0021). The reply arrives in pieces; the text that came in since the bubble last painted is
// wrapped in its own span, and each span keeps its key while the reply streams, so its fade is never restarted.
import { createContext, useContext, useEffect } from 'react';
import type { Block, Inline } from './markdownParse';

export interface StreamFade {
  /** Where each text leaf starts in the rendered text (document order). */
  starts: WeakMap<Inline, number>;
  /** The rendered text length at each earlier paint of this reply, ascending. */
  seen: readonly number[];
}

export const StreamFadeCtx = createContext<StreamFade | null>(null);
export const useStreamFade = () => useContext(StreamFadeCtx);

/** Rendered lengths per streaming message, kept outside the row so a row mounted again mid-stream does not fade it all. */
const seenByMessage = new Map<string, number[]>();

/** The text leaves of parsed blocks with their offsets, in document order; returns the total rendered length. */
export function textStarts(blocks: readonly Block[]): { starts: WeakMap<Inline, number>; total: number } {
  const starts = new WeakMap<Inline, number>();
  let n = 0;
  const walk = (x: unknown): void => {
    if (Array.isArray(x)) return x.forEach(walk);
    if (!x || typeof x !== 'object') return;
    const o = x as { t?: string; v?: unknown };
    if (o.t === 'text' && typeof o.v === 'string') {
      starts.set(o as Inline, n);
      n += o.v.length;
      return;
    }
    for (const v of Object.values(o)) if (typeof v === 'object') walk(v);
  };
  walk(blocks);
  return { starts, total: n };
}

export interface FadePiece {
  key: number;
  text: string;
  /** Still fading: the newest piece and the one before it (it may be mid-fade when the next piece lands). */
  fading: boolean;
}

/** Splits one text leaf `[start, start + text.length)` at the earlier paints' lengths. */
export function fadePieces(text: string, start: number, seen: readonly number[]): FadePiece[] {
  const out: FadePiece[] = [];
  const end = start + text.length;
  const edges = [0, ...seen, Infinity];
  for (let k = 0; k < edges.length - 1; k++) {
    const a = Math.max(edges[k]!, start);
    const b = Math.min(edges[k + 1]!, end);
    if (b > a) out.push({ key: k, text: text.slice(a - start, b - start), fading: k >= seen.length - 1 });
  }
  return out;
}

/** The fade context for one foo bubble: null once the reply is complete (its text then renders plain). */
export function useStreamFadeFor(messageId: string, blocks: readonly Block[], streaming: boolean): StreamFade | null {
  const { starts, total } = textStarts(streaming ? blocks : []);
  const seen = streaming ? (seenByMessage.get(messageId) ?? []) : [];
  useEffect(() => {
    if (!streaming) {
      seenByMessage.delete(messageId);
      return;
    }
    const list = seenByMessage.get(messageId) ?? [];
    if (total > (list.at(-1) ?? 0)) seenByMessage.set(messageId, [...list, total]);
  }, [messageId, streaming, total]);
  return streaming ? { starts, seen } : null;
}
