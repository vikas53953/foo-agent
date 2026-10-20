// Spec: 08-3 §12.6 (`forgetAll` deletes all memory files except `identity.md` and all helper notes), 06-3 §14 C-4. The engine
// empties each file through `file.write` (08-1 §2.4 has no delete); main then removes the emptied files, so not even a file
// name (`people\{name}.md`) is left behind. Only zero-byte files are removed: a file written to since keeps its text.
import { readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

function list(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/** Removes the empty memory files and helper notes left by a forgetAll; returns how many went. */
export function removeForgottenFiles(dataDir: string): number {
  const candidates = [
    ...['memory', join('memory', 'people'), join('memory', 'preferences')].flatMap((sub) =>
      list(join(dataDir, sub))
        .filter((n) => n.endsWith('.md') && !(sub === 'memory' && n === 'identity.md'))
        .map((n) => join(dataDir, sub, n)),
    ),
    ...list(join(dataDir, 'helpers'))
      .filter((h) => h.startsWith('h_'))
      .map((h) => join(dataDir, 'helpers', h, 'notes.md')),
  ];
  let removed = 0;
  for (const file of candidates) {
    try {
      if (statSync(file).isFile() && statSync(file).size === 0) {
        rmSync(file);
        removed += 1;
      }
    } catch {
      // gone already
    }
  }
  return removed;
}
