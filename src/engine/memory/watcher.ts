// Spec: 08-3 §12.2 (a file watcher, `fs.watch` on `{DATA}\memory`, debounced 500 ms, re-indexes changed files; the next AI
// turn uses the edited text, J17), pack M6 Risk 2 (foo's own writes are ignored by hash: MemoryService compares). The debounce
// runs on the injected clock (08-3 §22.2), so FOO_TEST runs move it with the fake clock.
import { mkdirSync, watch, type FSWatcher } from 'node:fs';
import { join } from 'node:path';
import type { Clock, TimerId } from '../../shared/clock';

export const WATCH_DEBOUNCE_MS = 500;

export interface MemoryWatcher {
  close(): void;
}

/** `{DATA}/memory/**.md` changes, as `memory/…` paths with forward slashes; dot files (`.tombstones`, `.tidy-log.md`) skipped. */
export function memoryFileOf(name: string): string | null {
  const rel = name.split(/[\\/]/u).filter(Boolean);
  const base = rel[rel.length - 1];
  if (!base || !base.endsWith('.md') || base.startsWith('.') || rel.length > 2) return null;
  if (rel.length === 2 && rel[0] !== 'people' && rel[0] !== 'preferences') return null;
  return ['memory', ...rel].join('/');
}

export function watchMemory(o: { dataDir: string; clock: Clock; onChange: (file: string) => void }): MemoryWatcher {
  const dir = join(o.dataDir, 'memory');
  mkdirSync(dir, { recursive: true });
  const timers = new Map<string, TimerId>();
  const fire = (name: string | null) => {
    const file = name ? memoryFileOf(name) : null;
    if (!file) return;
    const prev = timers.get(file);
    if (prev !== undefined) o.clock.clearTimeout(prev);
    timers.set(
      file,
      o.clock.setTimeout(() => {
        timers.delete(file);
        o.onChange(file);
      }, WATCH_DEBOUNCE_MS),
    );
  };
  let w: FSWatcher | null = watch(dir, { recursive: true }, (_event, name) => fire(name ? String(name) : null));
  w.on('error', () => {
    w?.close();
    w = null;
  });
  return {
    close() {
      w?.close();
      w = null;
      for (const id of timers.values()) o.clock.clearTimeout(id);
      timers.clear();
    },
  };
}
