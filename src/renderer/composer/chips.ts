// Spec: 04-2 §21.4 (attachment chips: image tiles, file chips "{TYPE} · {size}", "Pasted text" chips "{n} characters";
// preparing while the file is copied into foo's data folder — Send is allowed and the message waits; failed blocks Send until
// removed), §22.6 (6 files per message: "I added the first 6."; 25 MB; blocked programs and zipped folders; one composer
// notice for the blocked files), §22.5 (a long paste becomes a "Pasted text" chip; the catcher also runs on it), 08-5 §3.4.
// Pure planning; unit-tested.
import { extOf, fileProblem, kindOf, MAX_FILES, mimeOf, type FileProblem } from '../../shared/attachmentRules';
import type { Attachment } from '../../shared/types';

export type ChipKind = 'image' | 'file' | 'pasted';

export interface Chip {
  key: string;
  kind: ChipKind;
  name: string;
  bytes: number;
  /** A blob: URL of an image (img-src blob: is allowed by the CSP). */
  url?: string;
  /** "Pasted text": the text, with caught spans as mask tokens (fieldModel MASK tokens, see Composer). */
  text?: string;
  state: 'preparing' | 'ready' | 'failed';
  attachmentId?: string;
  /** The copy (or a promise of it) for files and images. */
  staged?: Promise<string>;
  problem?: FileProblem;
}

export interface FileLike {
  name: string;
  size: number;
}

/** Which files become chips and the one notice for the rest (§22.6). */
export function planFiles<F extends FileLike>(
  files: readonly F[],
  existing: number,
): { add: F[]; notice: { slot: FileProblem | 'too_many_files'; name: string } | null } {
  const add: F[] = [];
  let notice: { slot: FileProblem | 'too_many_files'; name: string } | null = null;
  for (const f of files) {
    const p = fileProblem(f.name, f.size);
    if (p) {
      notice ??= { slot: p, name: f.name };
      continue;
    }
    if (existing + add.length >= MAX_FILES) {
      notice = { slot: 'too_many_files', name: f.name };
      break;
    }
    add.push(f);
  }
  return { add, notice };
}

/** §22.6 drop overlay: none allowed, some blocked, or all fine. */
export function dropVerdict(files: readonly FileLike[]): 'ok' | 'some' | 'none' {
  if (!files.length) return 'ok';
  const bad = files.filter((f) => fileProblem(f.name, f.size)).length;
  return bad === 0 ? 'ok' : bad === files.length ? 'none' : 'some';
}

/** "PDF", "DOCX" (the file chip's type label, §21.4). */
export const typeLabel = (name: string) => extOf(name).toUpperCase() || 'FILE';

export const chipKind = (name: string): ChipKind => (kindOf(name) === 'image' ? 'image' : 'file');

/** The attachment the optimistic bubble shows before main answers (path filled by main). */
export function chipAttachment(c: Chip): Attachment {
  return {
    id: c.attachmentId ?? c.key,
    name: c.name,
    mime: c.kind === 'pasted' ? 'text/plain' : mimeOf(c.name),
    bytes: c.bytes,
    path: '',
    kind: c.kind === 'image' ? 'image' : c.kind === 'pasted' ? 'doc' : kindOf(c.name),
  };
}
