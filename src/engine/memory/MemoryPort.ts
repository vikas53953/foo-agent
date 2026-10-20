// Spec: 08-3 §12.8 (memory functions), 08-1 §2.4 `memory.cmd` (CR-0010 G-M6-01), §12.7 `memory.tidy()` (G-M6-09).
// The engine's memory seam. M6 T1 lands this stub so the wave tickets fill bodies, not shared lines: T3 replaces the
// stub with MemoryService (cmd), T7 adds tidy. Until then every call answers UNKNOWN with "not built".
import { fail, type Result } from '../../shared/errors';
import type { MemoryCmdPayload } from '../protocol';

export interface MemoryPort {
  /** One `memory:*` invoke, forwarded by main. The value is the invoke's response type (08-1 §3.2). */
  cmd(c: MemoryCmdPayload): Promise<Result<unknown>>;
  /** 08-3 §12.7 steps 1–5; M7 schedules it at 03:00. */
  tidy(): Promise<Result<unknown>>;
}

export const memoryNotBuilt: MemoryPort = {
  cmd: () => Promise.resolve(fail('UNKNOWN', 'memory not built yet')),
  tidy: () => Promise.resolve(fail('UNKNOWN', 'memory tidy not built yet')),
};
