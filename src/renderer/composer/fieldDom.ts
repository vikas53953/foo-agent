// Spec: 04-2 §20.3 (contenteditable pill; rich paste always flattened), §22.4 (the masked span is an atomic, non-editable
// "••••"), §22.8 (the mention is one atomic token in `--t-body-strong`, the helper's colour). The DOM side of fieldModel.ts:
// read the field into segments, write segments back, and move the caret by check-text offset. Masks and mentions are
// `contenteditable="false"` spans, so Chromium deletes each as one unit.
import { MASK } from '../../shared/redactor';
import { MASK_CHAR, tidy, type Segment } from './fieldModel';

const BLOCK = new Set(['DIV', 'P', 'LI']);

/** Reads the field. Line breaks are "\n" text (white-space: pre-wrap); a stray <br> or block from the browser is a line. */
export function domToSegments(root: HTMLElement): Segment[] {
  const out: Segment[] = [];
  const walk = (node: Node, first: boolean) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out.push({ kind: 'text', text: node.nodeValue ?? '' });
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.dataset.mask) {
      out.push({ kind: 'mask', id: node.dataset.mask });
      return;
    }
    if (node.dataset.mention) {
      out.push({ kind: 'mention', helperId: node.dataset.mention, name: node.dataset.name ?? '' });
      return;
    }
    if (node.tagName === 'BR') {
      // The browser's placeholder <br> at the very end of the field, or at the end of a block (the empty line of a pasted
      // "a\n\nb" is `<div><br></div>`, and the block already makes the line), is not a line.
      const blockEnd = !node.nextSibling && node.parentNode instanceof HTMLElement && BLOCK.has(node.parentNode.tagName);
      if ((node.nextSibling || node.parentNode !== root) && !blockEnd) out.push({ kind: 'text', text: '\n' });
      return;
    }
    if (BLOCK.has(node.tagName) && !first) out.push({ kind: 'text', text: '\n' });
    node.childNodes.forEach((c, i) => walk(c, i === 0 && first));
  };
  root.childNodes.forEach((c, i) => walk(c, i === 0));
  return tidy(out);
}

export interface SegmentLook {
  maskClass: string;
  mentionClass: string;
  /** The helper's colour token for a mention (light theme; dark uses --fg-1 through CSS). */
  mentionColor: (helperId: string) => string | null;
}

export function segmentNode(s: Segment, look: SegmentLook): Node {
  if (s.kind === 'text') return document.createTextNode(s.text);
  const span = document.createElement('span');
  span.contentEditable = 'false';
  if (s.kind === 'mask') {
    span.dataset.mask = s.id;
    span.className = look.maskClass;
    span.textContent = MASK;
  } else {
    span.dataset.mention = s.helperId;
    span.dataset.name = s.name;
    span.className = look.mentionClass;
    const color = look.mentionColor(s.helperId);
    if (color) span.style.setProperty('--mention-color', `var(${color})`);
    span.textContent = `@${s.name}`;
  }
  return span;
}

export function segmentsToDom(root: HTMLElement, segs: readonly Segment[], look: SegmentLook): void {
  root.replaceChildren(...segs.map((s) => segmentNode(s, look)));
}

const lengthOf = (n: Node): number => {
  if (n.nodeType === Node.TEXT_NODE) return n.nodeValue?.length ?? 0;
  if (n instanceof HTMLElement && n.dataset.mask) return MASK_CHAR.length;
  if (n instanceof HTMLElement && n.dataset.mention) return (n.dataset.name ?? '').length + 1;
  if (n instanceof HTMLElement && n.tagName === 'BR') return 1;
  let sum = 0;
  n.childNodes.forEach((c) => (sum += lengthOf(c)));
  return sum;
};

/** The caret (selection focus) as a check-text offset, or the end when the field has no selection. */
export function caretOffset(root: HTMLElement): number {
  const sel = root.ownerDocument.getSelection();
  if (!sel || !sel.rangeCount || !root.contains(sel.focusNode)) return lengthOf(root);
  const r = document.createRange();
  r.selectNodeContents(root);
  r.setEnd(sel.focusNode!, sel.focusOffset);
  return lengthOf(r.cloneContents());
}

/** The selection as check-text offsets (start ≤ end), or null when it is not in the field. */
export function selectionOffsets(root: HTMLElement): { start: number; end: number } | null {
  const sel = root.ownerDocument.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const a = document.createRange();
  a.selectNodeContents(root);
  a.setEnd(range.startContainer, range.startOffset);
  const b = document.createRange();
  b.selectNodeContents(root);
  b.setEnd(range.endContainer, range.endOffset);
  return { start: lengthOf(a.cloneContents()), end: lengthOf(b.cloneContents()) };
}

/** Puts the caret at a check-text offset (after an atomic token when the offset lands on it). */
export function setCaret(root: HTMLElement, offset: number): void {
  const sel = root.ownerDocument.getSelection();
  if (!sel) return;
  let left = offset;
  const range = document.createRange();
  for (const node of Array.from(root.childNodes)) {
    const len = lengthOf(node);
    if (node.nodeType === Node.TEXT_NODE && left <= len) {
      range.setStart(node, left);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    if (left < len || (left === len && node.nodeType !== Node.TEXT_NODE)) {
      range.setStartAfter(node);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    left -= len;
  }
  range.selectNodeContents(root);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

/** The plain text before the caret (for the "@" mention trigger). */
export function textBeforeCaret(root: HTMLElement): string {
  const sel = root.ownerDocument.getSelection();
  if (!sel || !sel.rangeCount || !root.contains(sel.focusNode)) return '';
  const r = document.createRange();
  r.selectNodeContents(root);
  r.setEnd(sel.focusNode!, sel.focusOffset);
  const frag = r.cloneContents();
  let out = '';
  const walk = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) out += n.nodeValue ?? '';
    else if (n instanceof HTMLElement && (n.dataset.mask || n.dataset.mention)) out += MASK_CHAR;
    else n.childNodes.forEach(walk);
  };
  walk(frag);
  return out;
}

/** The caret's x position in the window (the mention popover's left edge, §22.8). */
export function caretX(root: HTMLElement): number {
  const sel = root.ownerDocument.getSelection();
  if (!sel || !sel.rangeCount) return root.getBoundingClientRect().left;
  const rect = sel.getRangeAt(0).getBoundingClientRect();
  return rect.width || rect.left ? rect.left : root.getBoundingClientRect().left;
}
