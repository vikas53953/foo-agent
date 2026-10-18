// Spec: 10-acceptance-2 §E.1 (each test runs 20 times; the 95th percentile must meet the budget), §E.2 (a regression of more
// than 10 % on any PERF id between two builds is a P1 bug even when the budget still passes), 08-3 §20 (budgets, X-130).

export type Unit = 'ms' | 'KB' | 'MB' | '%';
export type Budget =
  | { kind: 'lt'; max: number; unit: Unit }
  | { kind: 'le'; max: number; unit: Unit }
  | { kind: 'range'; min: number; max: number; unit: Unit };

/** t100 = the default text size; t225 = PERF-01…04 repeated at text size 225 % (§E.1). */
export type Variant = 't100' | 't225';

export interface SummaryRow {
  id: string;
  variant: Variant;
  /** p95 of the runs; null when the probe was skipped or every run failed. */
  p95: number | null;
  unit: Unit;
  runs: number;
  /** The budget in words, e.g. "< 2000 ms". */
  budget: string;
  verdict: 'pass' | 'fail' | 'skipped' | 'error';
  note?: string;
}

export interface Regression {
  id: string;
  variant: Variant;
  before: number;
  after: number;
  /** (after − before) / before; Infinity when before was 0. */
  change: number;
  severity: 'P1';
}

/** Nearest-rank 95th percentile: of 20 runs, the 19th smallest. */
export function p95(values: readonly number[]): number {
  if (values.length === 0) throw new Error('p95 of no runs');
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * 0.95) - 1]!;
}

export function meets(b: Budget, value: number): boolean {
  switch (b.kind) {
    case 'lt':
      return value < b.max;
    case 'le':
      return value <= b.max;
    case 'range':
      return value >= b.min && value <= b.max;
  }
}

export function budgetText(b: Budget): string {
  return b.kind === 'range' ? `${b.min}–${b.max} ${b.unit}` : `${b.kind === 'lt' ? '<' : '≤'} ${b.max} ${b.unit}`;
}

/** Every measured id and text size more than `limit` worse (higher) than the baseline's; lower is better for every PERF id. */
export function regressions(current: readonly SummaryRow[], baseline: readonly SummaryRow[], limit = 0.1): Regression[] {
  const key = (r: SummaryRow) => `${r.id} ${r.variant}`;
  const before = new Map(baseline.filter((r) => r.p95 !== null).map((r) => [key(r), r.p95!]));
  const out: Regression[] = [];
  for (const r of current) {
    const b = before.get(key(r));
    if (r.p95 === null || b === undefined) continue;
    const change = b === 0 ? (r.p95 > 0 ? Infinity : 0) : (r.p95 - b) / b;
    if (change > limit) out.push({ id: r.id, variant: r.variant, before: b, after: r.p95, change, severity: 'P1' });
  }
  return out;
}
