// Spec: 08-3 §12.2 (`memory_index.hash`), §12.6 (tombstones match on hash + origin kind), 08-1 §2.5 (hashing runs in the
// engine's worker). The hash is sha256 of the normalised fact text: NFKC, line breaks and runs of white space folded to one
// space, trimmed, lower-cased; so CRLF/LF and spacing never change it.
import { createHash } from 'node:crypto';

export function normaliseFactText(text: string): string {
  return text.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLowerCase();
}

/** Lower-case hex sha256 of the normalised text. */
export function factHash(text: string): string {
  return createHash('sha256').update(normaliseFactText(text), 'utf8').digest('hex');
}
