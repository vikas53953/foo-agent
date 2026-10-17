// Spec: 04-2 §20.3 (the pill is a contenteditable region because mention chips and masked spans sit inside the text), §22.4
// (a caught span shows exactly "••••", atomic, never a real character of the secret; Backspace deletes it as one unit; "Send
// anyway" sends it as "•••• (hidden)"; the next Send re-runs the check while a mask is left; a draft with an unresolved match
// is not written), §22.8 (a mention is one atomic "@{Helper}" token; drafts store `@{helperId}`, §23.5), §21.3 (trim), §23.6
// (the 10,000 limit counts the text, not chips). The field's content as segments, and the pure operations on them; the DOM
// side is fieldDom.ts. Unit-tested.
import { findSecrets, MASK, type CheckContext, type SecretHit } from '../../shared/redactor';

export type Segment = { kind: 'text'; text: string } | { kind: 'mask'; id: string } | { kind: 'mention'; helperId: string; name: string };

/** A caught secret's value, held in memory only until the user chooses (05-2 §5.9). Never rendered, stored or logged. */
export interface MaskValue {
  value: string;
  hit: Pick<SecretHit, 'kind' | 'pattern'>;
}

/** Stands for a mask in the text the checks read (it matches no pattern). */
export const MASK_CHAR = '';

/** The text the paste catcher reads: masks as one private-use character, mentions as "@Name". Offsets are in this text. */
export function checkText(segs: readonly Segment[]): string {
  return segs.map((s) => (s.kind === 'text' ? s.text : s.kind === 'mask' ? MASK_CHAR : `@${s.name}`)).join('');
}

/** Characters the user typed (04-2 §23.6 counts this; masks count as their four dots). */
export function textLength(segs: readonly Segment[]): number {
  let n = 0;
  for (const s of segs) n += s.kind === 'text' ? [...s.text].length : s.kind === 'mask' ? MASK.length : s.name.length + 1;
  return n;
}

export const hasMask = (segs: readonly Segment[]) => segs.some((s) => s.kind === 'mask');

/** Any non-space content (04-2 §21.2 "field has any non-space text"). */
export function hasText(segs: readonly Segment[]): boolean {
  return segs.some((s) => s.kind !== 'text' || s.text.trim() !== '');
}

/** Merges neighbouring text segments and drops empty ones. */
export function tidy(segs: readonly Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const s of segs) {
    if (s.kind === 'text') {
      if (!s.text) continue;
      const last = out[out.length - 1];
      if (last?.kind === 'text') {
        out[out.length - 1] = { kind: 'text', text: last.text + s.text };
        continue;
      }
    }
    out.push(s);
  }
  return out;
}

/** Splits at a check-text offset: the parts before and after (an offset inside a mention or mask falls after it). */
export function splitAt(segs: readonly Segment[], offset: number): [Segment[], Segment[]] {
  const before: Segment[] = [];
  const after: Segment[] = [];
  let pos = 0;
  for (const s of segs) {
    const len = s.kind === 'text' ? s.text.length : s.kind === 'mask' ? 1 : s.name.length + 1;
    if (pos + len <= offset) before.push(s);
    else if (pos >= offset) after.push(s);
    else if (s.kind === 'text') {
      before.push({ kind: 'text', text: s.text.slice(0, offset - pos) });
      after.push({ kind: 'text', text: s.text.slice(offset - pos) });
    } else before.push(s);
    pos += len;
  }
  return [tidy(before), tidy(after)];
}

/**
 * Replaces each caught span of plain text with a mask segment. Hits are offsets into `checkText(segs)`; a hit that touches a
 * mention keeps the mention and masks only the text around it. Returns the new segments and the masks' values.
 */
export function maskHits(
  segs: readonly Segment[],
  hits: readonly SecretHit[],
  newId: () => string,
): { segs: Segment[]; masks: [string, MaskValue][] } {
  const masks: [string, MaskValue][] = [];
  let out: Segment[] = [...segs];
  // Right to left, so earlier offsets stay valid.
  for (const h of [...hits].sort((a, b) => b.start - a.start)) {
    const [left, rest] = splitAt(out, h.start);
    const [mid, right] = splitAt(rest, h.end - h.start);
    const value = mid.map((s) => (s.kind === 'text' ? s.text : '')).join('');
    if (!value) continue;
    const id = newId();
    masks.push([id, { value, hit: { kind: h.kind, pattern: h.pattern } }]);
    const kept = mid.filter((s) => s.kind !== 'text');
    out = tidy([...left, { kind: 'mask', id }, ...kept, ...right]);
  }
  return { segs: out, masks };
}

/** Runs the 04-2 §22.4 check over the field's text (existing masks are skipped). */
export function findInSegments(segs: readonly Segment[], ctx: CheckContext): SecretHit[] {
  return findSecrets(checkText(segs), ctx);
}

/** Inserts plain text at a check-text offset; returns the segments and the caret offset after the text. */
export function insertText(segs: readonly Segment[], offset: number, text: string): { segs: Segment[]; caret: number } {
  const [a, b] = splitAt(segs, offset);
  return { segs: tidy([...a, { kind: 'text', text }, ...b]), caret: checkText(a).length + text.length };
}

export type SerialiseMode = 'send' | 'draft';

/**
 * The message text: mentions as "@Name" (send) or `@{helperId}` (draft, §23.5); masks as `hidden` (send after "Send
 * anyway"). A draft is never written with a mask in it (the caller checks `hasMask` first).
 */
export function serialise(segs: readonly Segment[], mode: SerialiseMode, hidden = ''): string {
  return segs
    .map((s) => {
      if (s.kind === 'text') return s.text;
      if (s.kind === 'mention') return mode === 'draft' ? `@{${s.helperId}}` : `@${s.name}`;
      return hidden;
    })
    .join('');
}

/** A stored draft back into segments: `@{helperId}` becomes a mention chip when the helper is known. */
export function parseDraft(text: string, helperName: (id: string) => string | undefined): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(/@\{([A-Za-z0-9_-]+)\}/g)) {
    const name = helperName(m[1]!);
    if (!name) continue;
    out.push({ kind: 'text', text: text.slice(last, m.index) });
    out.push({ kind: 'mention', helperId: m[1]!, name });
    last = m.index + m[0].length;
  }
  out.push({ kind: 'text', text: text.slice(last) });
  return tidy(out);
}

/** Removes the masks (04-2 §22.4 "Move to secret box": the span is removed, the rest of the text stays). */
export function dropMasks(segs: readonly Segment[]): Segment[] {
  return tidy(segs.filter((s) => s.kind !== 'mask'));
}

/** §22.9 Ctrl+B / Ctrl+I / Ctrl+Shift+X on a plain-text selection. */
export function wrapSelection(text: string, start: number, end: number, marker: string): { text: string; start: number; end: number } {
  return {
    text: `${text.slice(0, start)}${marker}${text.slice(start, end)}${marker}${text.slice(end)}`,
    start: start + marker.length,
    end: end + marker.length,
  };
}

/** §22.8: the "@query" being typed right before the caret (start of the field, or after a space or new line), or null. */
export function mentionQuery(before: string): { query: string; at: number } | null {
  const m = /(^|[\s])@([^\s@]*)$/u.exec(before);
  if (!m) return null;
  return { query: m[2]!, at: before.length - m[2]!.length - 1 };
}

/** §22.8 filter: start of the name first, then anywhere in it, case-insensitive. */
export function filterHelpers<T extends { name: string }>(helpers: readonly T[], query: string): T[] {
  const q = query.toLocaleLowerCase('en-IN');
  const starts = helpers.filter((h) => h.name.toLocaleLowerCase('en-IN').startsWith(q));
  const inside = helpers.filter((h) => !starts.includes(h) && h.name.toLocaleLowerCase('en-IN').includes(q));
  return [...starts, ...inside];
}
