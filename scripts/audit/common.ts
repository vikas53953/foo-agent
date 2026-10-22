// Spec: 08-3 §22.8 (test-only audit tooling stays outside the packaged app); 08-2 §11.4 (audit output never contains a secret value).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type AuditStatus = 'pass' | 'fail' | 'blocked' | 'candidate' | 'unassessed';

export interface AuditFinding {
  category: string;
  status: AuditStatus;
  path?: string;
  line?: number;
  note: string;
}

export interface AuditResult {
  lane: 'F';
  command: string;
  generatedAt: string;
  buildSha: string;
  status: AuditStatus;
  findings: AuditFinding[];
  counts: Record<string, number>;
}

const THIS_DIR = resolve(dirname(fileURLToPath(import.meta.url)));

export function repoRoot(): string {
  return resolve(THIS_DIR, '../..');
}

export function relPath(file: string, root = repoRoot()): string {
  return relative(root, file).replaceAll('\\', '/');
}

export function trackedFiles(root = repoRoot()): string[] {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' });
  return out
    .split('\0')
    .filter(Boolean)
    .map((file) => resolve(root, file));
}

export function readText(file: string): string | null {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

export function lineOf(text: string, offset: number): number {
  return text.slice(0, offset).split('\n').length;
}

export function isTextPath(file: string): boolean {
  return !new Set([
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.ico',
    '.webp',
    '.pdf',
    '.db',
    '.sqlite',
    '.sqlite3',
    '.woff',
    '.woff2',
    '.ttf',
    '.eot',
    '.map',
  ]).has(extname(file).toLowerCase());
}

export function sourceFiles(root = repoRoot()): string[] {
  return trackedFiles(root).filter((file) => {
    const rel = relPath(file, root);
    return /^src\/(?:.*\.(?:ts|tsx|mjs|js))$/u.test(rel) || /^scripts\/(?:.*\.(?:ts|tsx|mjs|js))$/u.test(rel);
  });
}

export function currentBuildSha(root = repoRoot()): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

export function addFinding(findings: AuditFinding[], finding: AuditFinding): void {
  findings.push({ ...finding, path: finding.path?.replaceAll('\\', '/') });
}

export function countStatuses(findings: AuditFinding[]): Record<string, number> {
  return findings.reduce<Record<string, number>>((counts, finding) => {
    counts[finding.status] = (counts[finding.status] ?? 0) + 1;
    return counts;
  }, {});
}

export function writeJson(file: string, value: unknown, root = repoRoot()): void {
  const absolute = resolve(root, file);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function parseJson<T>(file: string, root = repoRoot()): T | null {
  const text = readText(resolve(root, file));
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function hasOwnRealAiKey(): boolean {
  // The audit deliberately does not read or print the value. A caller must opt in with a key owned by this test run.
  return process.env.FOO_AUDIT_OWN_KEY === '1' && Boolean(process.env.FOO_AUDIT_PROVIDER);
}

export function redactedNote(category: string): string {
  return `${category}; value redacted by Lane F scanner`;
}

export function isKnownFixture(rel: string): boolean {
  return /^(?:test\/fixtures|test\/fakes|src\/main\/test|resources\/.*\.example\.)/u.test(rel);
}

export function result(command: string, status: AuditStatus, findings: AuditFinding[]): AuditResult {
  return {
    lane: 'F',
    command,
    generatedAt: new Date().toISOString(),
    buildSha: currentBuildSha(),
    status,
    findings,
    counts: countStatuses(findings),
  };
}

export function output(resultValue: AuditResult, outFile?: string): void {
  const text = `${JSON.stringify(resultValue, null, 2)}\n`;
  if (outFile) {
    const absolute = resolve(repoRoot(), outFile);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, text, 'utf8');
  }
  process.stdout.write(text);
}

export function isRepoFile(file: string, root = repoRoot()): boolean {
  const absolute = resolve(file);
  const prefix = `${resolve(root)}\\`;
  return absolute === resolve(root) || absolute.startsWith(prefix) || existsSync(absolute);
}
