// Spec: 04 §13.5 / §13.6 and CR-0022 pick 12 (kit surfaces and AI pages draw and act only in foo's own text: a helper's,
// a system line's or the user's ```a2ui / ```page fence stays a code block), X-180. R1 T2: the bubble passes its parsed
// blocks through this so the dispatcher in Markdown.tsx never sees a kit or page block from anyone but foo.
import type { MessageRow } from '../../shared/types';
import type { Block } from '../messages/markdownParse';

export function fooOnlyBlocks(blocks: Block[], author: MessageRow['authorKind']): Block[] {
  if (author === 'foo' || !blocks.some((b) => b.t === 'kit' || b.t === 'page')) return blocks;
  return blocks.map((b) => (b.t === 'kit' || b.t === 'page' ? { t: 'code', lang: b.t === 'kit' ? 'a2ui' : 'page', v: b.body } : b));
}
