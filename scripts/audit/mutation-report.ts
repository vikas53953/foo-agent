// Spec: 11-fidelity §11.2 (evidence is linked to the executed build); Lane F reports a score only from an actual Stryker JSON run.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { output, repoRoot, result, type AuditFinding, type AuditStatus } from './common';

export type Mutation = {
  status?: string;
  mutantStatus?: string;
  filePath?: string;
  location?: { start?: { line?: number } };
};
export type MutationReport = { files?: Record<string, { mutants?: Mutation[] }>; testFiles?: string[] };

type Area = {
  killed: number;
  timeout: number;
  survived: number;
  noCoverage: number;
  invalid: number;
  unknown: number;
  ignored: number;
  total: number;
};

const GROUPS: Record<string, RegExp> = {
  shared: /(?:^|[\\/])src[\\/]shared[\\/]/u,
  ai: /(?:^|[\\/])src[\\/]engine[\\/](?:ai|prompt)[\\/]/u,
  network: /(?:^|[\\/])src[\\/]engine[\\/]tools[\\/]web[\\/]/u,
  jobs: /(?:^|[\\/])src[\\/]engine[\\/](?:jobs|gate)[\\/]/u,
  storage: /(?:^|[\\/])src[\\/]main[\\/](?:store|vault)[\\/]/u,
  ipc: /(?:^|[\\/])(?:src[\\/]main[\\/]ipc|src[\\/]preload)[\\/]/u,
  renderer: /(?:^|[\\/])src[\\/]renderer[\\/]/u,
  bridge: /(?:^|[\\/])src[\\/]wa-bridge[\\/]/u,
};

function emptyArea(): Area {
  return { killed: 0, timeout: 0, survived: 0, noCoverage: 0, invalid: 0, unknown: 0, ignored: 0, total: 0 };
}

function classify(area: Area, status: string): void {
  area.total++;
  if (/^killed$/iu.test(status)) area.killed++;
  else if (/^timeout$/iu.test(status)) area.timeout++;
  else if (/no.?coverage|not.?covered/iu.test(status)) area.noCoverage++;
  else if (/^survived$/iu.test(status)) area.survived++;
  else if (/^ignored$/iu.test(status)) area.ignored++;
  else if (/compile.?error|runtime.?error|error/iu.test(status)) area.invalid++;
  else area.unknown++;
}

export function summarizeReport(report: MutationReport): { findings: AuditFinding[]; status: AuditStatus } {
  const rows: Record<string, Area> = {};
  for (const [file, value] of Object.entries(report.files ?? {})) {
    const group = Object.entries(GROUPS).find(([, pattern]) => pattern.test(file))?.[0] ?? 'other';
    const row = (rows[group] ??= emptyArea());
    for (const mutant of value.mutants ?? []) classify(row, mutant.status ?? mutant.mutantStatus ?? 'Unknown');
  }

  const findings: AuditFinding[] = [];
  for (const [group, row] of Object.entries(rows)) {
    const detected = row.killed + row.timeout;
    const undetected = row.survived + row.noCoverage;
    const scored = detected + undetected;
    const score = scored === 0 || row.unknown > 0 ? null : Math.round((detected / scored) * 10000) / 100;
    findings.push({
      category: `mutation-${group}`,
      status: scored === 0 || row.unknown > 0 ? 'blocked' : undetected > 0 ? 'candidate' : 'pass',
      note: JSON.stringify({
        total: row.total,
        detected,
        killed: row.killed,
        timeout: row.timeout,
        survived: row.survived,
        noCoverage: row.noCoverage,
        invalid: row.invalid,
        ignored: row.ignored,
        unknown: row.unknown,
        scorePercent: score,
      }),
    });
  }

  const hasBlocked = findings.some((finding) => finding.status === 'blocked');
  const hasCandidate = findings.some((finding) => finding.status === 'candidate');
  const status: AuditStatus = hasBlocked ? 'blocked' : hasCandidate ? 'candidate' : findings.length > 0 ? 'pass' : 'blocked';
  return { findings, status };
}

function main(): void {
  const inputIndex = process.argv.indexOf('--input');
  const input = inputIndex >= 0 ? process.argv[inputIndex + 1] : 'reports/mutation/lane-f.json';
  const findings: AuditFinding[] = [];
  if (!input) throw new Error('mutation-report needs --input <json>');
  let report: MutationReport;
  try {
    report = JSON.parse(readFileSync(`${repoRoot()}/${input}`, 'utf8')) as MutationReport;
  } catch {
    findings.push({
      category: 'mutation-run',
      status: 'blocked',
      note: 'No executed Lane F Stryker JSON report was found; mutation scores are intentionally unassessed.',
    });
    const outArg = process.argv.indexOf('--out');
    output(
      result(`pnpm exec tsx scripts/audit/mutation-report.ts --input ${input}`, 'blocked', findings),
      outArg >= 0 ? process.argv[outArg + 1] : undefined,
    );
    return;
  }
  const summary = summarizeReport(report);
  output(
    result(`pnpm exec tsx scripts/audit/mutation-report.ts --input ${input}`, summary.status, summary.findings),
    process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : undefined,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
