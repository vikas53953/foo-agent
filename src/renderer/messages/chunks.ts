// Spec: 04 §12.3 (chat mode: a whole reply ≤ 600 characters shows as 1–3 complete bubbles split at blank lines, in one run;
// lists, quotes and code blocks never split; a 4th+ paragraph joins the 3rd; the delay before bubble n+1 is
// `clamp(800 + 12 × chars(bubble n), 800, 2500)` ms, reduced motion unchanged; anything else is one bubble that is never
// split), 08-4 §25.9 (the engine never splits a reply; chunking is the renderer's rule). Pure.
import type { MessageRow } from '../../shared/types';

export const CHAT_MODE_MAX_CHARS = 600;
export const MAX_BUBBLES = 3;

/** The delay before bubble n+1 (04 §12.3). */
export function bubbleDelayMs(prevChars: number): number {
  return Math.min(2500, Math.max(800, 800 + 12 * prevChars));
}

const LIST = /^\s*(?:[-*+]|\d+[.)])\s/;
const QUOTE = /^\s*>/;
const FENCE = /^\s*```/;

/** Splits at blank lines; a fenced code block, a list or a quote stays in one piece with what continues it. */
export function paragraphs(text: string): string[] {
  const lines = text.split('\n');
  const out: string[] = [];
  let cur: string[] = [];
  let inFence = false;
  const flush = () => {
    const p = cur.join('\n').trim();
    if (p) out.push(p);
    cur = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (FENCE.test(line)) inFence = !inFence;
    if (!inFence && line.trim() === '') {
      // A blank line between two list items (or two quote lines) does not split the list (or the quote).
      const prev = cur[cur.length - 1] ?? '';
      const next = lines.slice(i + 1).find((l) => l.trim() !== '') ?? '';
      if ((LIST.test(prev) && LIST.test(next)) || (QUOTE.test(prev) && QUOTE.test(next))) {
        cur.push(line);
        continue;
      }
      flush();
      continue;
    }
    cur.push(line);
  }
  flush();
  return out;
}

/** 1–3 bubble texts for a chat-mode reply; one element when the message is not chunked. */
export function chunkText(text: string): string[] {
  if (text.length > CHAT_MODE_MAX_CHARS) return [text];
  const ps = paragraphs(text);
  if (ps.length <= 1) return [text];
  if (ps.length <= MAX_BUBBLES) return ps;
  return [...ps.slice(0, MAX_BUBBLES - 1), ps.slice(MAX_BUBBLES - 1).join('\n\n')];
}

/** Which messages are chunked: a finished text answer from foo or a helper, with no attachments, not deleted or failed. */
export function chunkable(m: MessageRow): boolean {
  return (
    m.kind === 'text' &&
    (m.authorKind === 'foo' || m.authorKind === 'helper') &&
    m.status === 'complete' &&
    m.deletedAt === null &&
    !(m.attachments?.length ?? 0) &&
    m.text.length <= CHAT_MODE_MAX_CHARS
  );
}

const cache = new WeakMap<MessageRow, MessageRow[]>();

/** The parts of a message as rows (same id; reactions only on the last part, where the chips hang). Kept per row object. */
export function messageParts(m: MessageRow): MessageRow[] {
  const hit = cache.get(m);
  if (hit) return hit;
  const texts = chunkable(m) ? chunkText(m.text) : [m.text];
  const parts =
    texts.length === 1 ? [m] : texts.map((text, i) => (i === texts.length - 1 ? { ...m, text } : { ...m, text, reactions: [] }));
  cache.set(m, parts);
  return parts;
}

/** Live pacing state: message id → parts shown so far, for chunked replies that arrived while the chat was open. */
export interface PacingPlan {
  id: string;
  delays: number[];
}

/** The reveal plan for a message that just arrived: one delay per part after the first (04 §12.3). Null when not chunked. */
export function pacingPlan(m: MessageRow): PacingPlan | null {
  const parts = messageParts(m);
  if (parts.length < 2) return null;
  return { id: m.id, delays: parts.slice(0, -1).map((p) => bubbleDelayMs(p.text.length)) };
}
