// Spec: 10-acceptance (proof per test), 11-fidelity §11.2 (evidence beside every result); Vikas 2026-10-25 "capture the
// request, tool calls, trace, resulting state, expected and actual for every test". A test calls `evidence()` with what it
// sent and what it found; `pnpm qa` sets QA_EVIDENCE_DIR and folds each file into the report. Without the variable it is a
// no-op, so plain `pnpm test` runs write nothing. Secrets never reach a file: every string goes through `scrubbed()` first.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Evidence {
  /** The scenario id from test/qa/scenarios.ts, such as QA-B1-S01. */
  id: string;
  request: string | string[];
  /** The AI requests the fake recorded (purpose and the first part of each prompt). */
  aiTurns?: { purpose: string; prompt: string }[];
  toolCalls?: unknown[];
  /** Row counts and settings read back from the run's own database after the run. */
  state: Record<string, unknown>;
  expected: string;
  actual: string;
}

const SECRET = /(sk-ant-[A-Za-z0-9_-]{6,}|sk-[A-Za-z0-9_-]{16,}|fake-key-[a-z0-9-]+)/g;
export const scrubbed = (s: string) => s.replace(SECRET, '[secret]');

export function evidence(e: Evidence): void {
  const dir = process.env.QA_EVIDENCE_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  const text = scrubbed(JSON.stringify({ ...e, at: new Date().toISOString() }, null, 2));
  writeFileSync(join(dir, `${e.id}.json`), text);
}
