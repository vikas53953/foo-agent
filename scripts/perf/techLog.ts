// Spec: G-M14-25 (timing marks are ordinary tech-log rows `{ evt: 'perf.PERF-nn', ms }`, ids and durations only, allowed in
// production by 08-3 l.414; the runner reads them from {DATA}\logs\app-{date}.log). Lines that are not such rows are skipped.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function readTechLogMarks(dataDir: string): Record<string, number[]> {
  const dir = join(dataDir, 'logs');
  const marks: Record<string, number[]> = {};
  if (!existsSync(dir)) return marks;
  for (const file of readdirSync(dir)
    .filter((f) => /^app-.*\.log$/.test(f))
    .sort()) {
    for (const line of readFileSync(join(dir, file), 'utf8').split(/\r?\n/)) {
      let row: unknown;
      try {
        row = JSON.parse(line);
      } catch {
        continue;
      }
      if (typeof row !== 'object' || row === null) continue;
      const { evt, ms } = row as { evt?: unknown; ms?: unknown };
      if (typeof evt === 'string' && evt.startsWith('perf.') && typeof ms === 'number') (marks[evt.slice(5)] ??= []).push(ms);
    }
  }
  return marks;
}
