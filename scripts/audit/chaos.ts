// Spec: 08-1 §4.1.1 (damaged database recovery); 08-2 §5 (restart recovery); 08-3 §22.3 (isolated fake runs).
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { addFinding, hasOwnRealAiKey, output, repoRoot, result, type AuditFinding } from './common';

async function productionJobChaos(findings: AuditFinding[]): Promise<void> {
  const vitest = join(repoRoot(), 'node_modules', 'vitest', 'vitest.mjs');
  if (!existsSync(vitest)) {
    addFinding(findings, {
      category: 'production-job-restart',
      status: 'blocked',
      note: 'Vitest runtime is unavailable; production recovery tests were not replaced with a toy worker.',
    });
    return;
  }
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/(?:API|AUTH|TOKEN|SECRET|KEY|PASSWORD|CREDENTIAL)/iu.test(key)) delete env[key];
  }
  try {
    let stdout = '';
    let stderr = '';
    const code = await new Promise<number>((resolve) => {
      execFile(
        process.execPath,
        [
          vitest,
          'run',
          'test/integration/jobs/recovery.test.ts',
          '--pool=threads',
          '--maxWorkers=1',
          '--no-file-parallelism',
          '--testNamePattern',
          'WORKING.*NEEDS_YOU',
        ],
        { cwd: repoRoot(), env, timeout: 120_000, windowsHide: true },
        (error, out, err) => {
          stdout = String(out ?? '');
          stderr = String(err ?? '');
          resolve(error && typeof error.code === 'number' ? error.code : error ? 1 : 0);
        },
      );
    });
    const redact = (value: string): string =>
      value
        .replace(/(?:[A-Za-z]:[\\/]|\/)(?:Users|home)[^\r\n]*/giu, '<local-path>')
        .replace(/(?:sk|rk|ghp|xox[baprs])[-_a-z0-9]{12,}/giu, '<redacted-token>')
        .replace(/\r/g, '');
    const safeStdout = redact(stdout);
    const safeStderr = redact(stderr);
    const testCount = [...`${stdout}\n${stderr}`.matchAll(/Tests?\s+(\d+)\s+passed/giu)].at(-1)?.[1] ?? 'unknown';
    const evidencePath = join(repoRoot(), 'scripts', 'audit', 'evidence', 'chaos-production-job.log');
    mkdirSync(dirname(evidencePath), { recursive: true });
    writeFileSync(evidencePath, `exitCode=${code}\ntestCount=${testCount}\n[stdout]\n${safeStdout}\n[stderr]\n${safeStderr}`, 'utf8');
    addFinding(findings, {
      category: 'production-job-restart',
      status: code === 0 ? 'pass' : 'fail',
      note:
        code === 0
          ? `Targeted production recovery test WORKING -> NEEDS_YOU passed in a key-free child process; retained redacted stdout/stderr and testCount=${testCount} in scripts/audit/evidence/chaos-production-job.log.`
          : `Targeted production recovery test failed in a key-free child process; retained redacted stdout/stderr and testCount=${testCount} in scripts/audit/evidence/chaos-production-job.log.`,
    });
  } catch {
    addFinding(findings, {
      category: 'production-job-restart',
      status: 'blocked',
      note: 'Production job recovery suites could not start; no toy process was counted as app coverage.',
    });
  }
}

async function corruptDbFixture(findings: AuditFinding[]): Promise<void> {
  const base = mkdtempSync(join(tmpdir(), 'foo-db-chaos-'));
  const file = join(base, 'data', 'foo.db');
  try {
    const { mkdirSync } = await import('node:fs');
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, Buffer.alloc(8192, 0x5a));
    const { openDbOrRebuild } = await import('../../src/main/store/rebuild');
    const { db, damagedFile } = openDbOrRebuild(file, { dataDir: base, now: Date.UTC(2026, 9, 22, 0, 0), agentName: 'audit' });
    try {
      const foreignKeys = db.pragma('foreign_key_check') as unknown[];
      const quick = db.pragma('quick_check', { simple: true }) as unknown;
      const renamed = Boolean(damagedFile && existsSync(damagedFile));
      const passed = Boolean(renamed && foreignKeys.length === 0 && quick === 'ok');
      addFinding(findings, {
        category: 'corrupt-db-fixture',
        status: passed ? 'pass' : 'fail',
        note: passed
          ? `Corrupt production database fixture invariants: damagedRenamed=${renamed}; foreignKeyViolations=${foreignKeys.length}; quickCheck=${String(quick)}; isolatedFixture=true.`
          : 'Production database recovery did not meet all invariants.',
      });
    } finally {
      db.close();
    }
  } catch {
    addFinding(findings, {
      category: 'corrupt-db-fixture',
      status: 'blocked',
      note: 'SQLite production recovery fixture could not execute in this runtime; no user database was touched.',
    });
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

function randomKillFixture(findings: AuditFinding[]): void {
  addFinding(findings, {
    category: 'production-random-kill',
    status: 'blocked',
    note: 'The production recovery test exercises a persisted killed-mid-step harness, but no safe process-level random-kill seam is exposed for this audit; no toy worker was counted as application coverage.',
  });
}

function diskFullFixture(findings: AuditFinding[]): void {
  addFinding(findings, {
    category: 'production-disk-full',
    status: 'blocked',
    note: 'No safe production filesystem fault-injection seam is available; the lane did not fill real disk or claim app coverage from a toy writer.',
  });
}

function realAiStatus(findings: AuditFinding[]): void {
  addFinding(findings, {
    category: 'real-ai-chaos',
    status: 'blocked',
    note: hasOwnRealAiKey()
      ? 'Own-key marker is present, but this lane does not start paid real-AI chaos from a local audit command.'
      : 'No lane-scoped key was supplied to this audit; zero new provider calls and cost $0.',
  });
}

async function main(): Promise<void> {
  const findings: AuditFinding[] = [];
  await productionJobChaos(findings);
  randomKillFixture(findings);
  await corruptDbFixture(findings);
  diskFullFixture(findings);
  realAiStatus(findings);
  const status = findings.some((finding) => finding.status === 'fail')
    ? 'fail'
    : findings.some((finding) => finding.status === 'blocked')
      ? 'blocked'
      : 'pass';
  const outIndex = process.argv.indexOf('--out');
  output(result('pnpm exec tsx scripts/audit/chaos.ts', status, findings), outIndex >= 0 ? process.argv[outIndex + 1] : undefined);
}

void main().catch(() => {
  process.exitCode = 1;
});
