// Spec: 08-3 §19.4.1 (memory-only export `foo-memory-{d-Mon-yyyy}.zip`: `README.txt` + `memory/` only; final secret scan,
// any hit aborts with EXPORT_SECRET_FOUND), 08-1 §3.2 `data:export` (returns at once; progress and the end on
// `data:exportProgress`), 06-2 §7.4 "Export what I know", 08-0 §G.4 activity `exported`. CR-0010 G-M6-11.
// M6 T1 lands the seam; T6 fills `runMemoryExport` (zip, scan, activity row).
import type { EventPayload } from '../../shared/ipc';

export interface MemoryExportCtx {
  dataDir: string;
  folder: string;
  exportId: string;
  now: number;
  progress(p: EventPayload['data:exportProgress']): void;
}

/** Writes the memory zip into `folder`, reporting on `data:exportProgress`; the last event carries `path` or `error`. */
export async function runMemoryExport(ctx: MemoryExportCtx): Promise<void> {
  ctx.progress({ pct: 100, phase: 'done', error: 'UNKNOWN' });
  return Promise.resolve();
}
