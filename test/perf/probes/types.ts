// Spec: 10-acceptance-2 §E (one probe per PERF id; E.1 20 runs, p95; PERF-01…04 again at 225 %), 08-3 §20, M14 pack §4 (a
// probe skips with "needs Mx" until the milestone that makes its id measurable lands).
import type { ElectronApplication, Page } from '@playwright/test';
import type { Budget } from '../compare';

export type PerfId = `PERF-${string}`;

/** One run's number for one PERF id, plus what produced it (kept as that run's trace file, 10-2 §G.10). */
export interface Sample {
  value: number;
  trace?: unknown;
}

/** One process metric from Electron's app.getAppMetrics() (memory in KB, CPU since the last call). */
export interface ProcessMetric {
  type: string;
  name?: string;
  serviceName?: string;
  workingSetKb: number;
  cpuPercent: number;
}

/** One cold launch of the measured build with the perf data in its real {DATA} (G-M14-25). Every session probe reads it once. */
export interface SessionCtx {
  app: ElectronApplication;
  page: Page;
  run: number;
  /** 1 or 2.25 (§E.1: PERF-01…04 again at text size 225 %). */
  textScale: number;
  /** Process creation → chat list painted (PERF-01), taken while the session opened. */
  coldStart: { ms: number; source: 'tech-log' | 'probe'; trace: unknown };
  /** Waits once per session until the app has idled `idleMs` since the chat list painted (PERF-16/17 read after it). */
  idle(): Promise<void>;
  metrics(): Promise<ProcessMetric[]>;
  /** Byte size of every main → renderer event sent so far in this session (PERF-15). */
  patches(): Promise<{ channel: string; bytes: number }[]>;
  close(): Promise<void>;
}

/** What a probe that runs outside the app needs: the generated perf data and the built main bundle. */
export interface ProcessCtx {
  perfData: string;
  outMain: string;
}

interface ProbeBase {
  id: PerfId;
  /** Start → end of measurement, from 10-2 §E. */
  measures: string;
  budget: Budget;
  /** In `pnpm perf --smoke` (pack §4: measurable on M0–M3 + the perf seed). */
  smoke: boolean;
  /** Repeated at text size 225 % (§E.1: PERF-01…04). */
  textScale: boolean;
}

export interface SessionProbe extends ProbeBase {
  kind: 'session';
  /** Order inside a session: cold start first, then idle memory, then the interactions. */
  order: number;
  measure(ctx: SessionCtx): Promise<Sample>;
}

export interface ProcessProbe extends ProbeBase {
  kind: 'process';
  measureAll(runs: number, ctx: ProcessCtx): Promise<Sample[]>;
}

export interface PendingProbe extends ProbeBase {
  kind: 'pending';
  /** The milestone that makes this id measurable (pack §4). */
  needs: string;
}

export type Probe = SessionProbe | ProcessProbe | PendingProbe;
