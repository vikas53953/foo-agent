// Spec: 08-2 §11.4 (secrets are never echoed); 08-3 §22.8 (repository-only audit tooling); 08-4 §27.6 (network sinks are reviewed).
import { execFileSync } from 'node:child_process';
import {
  addFinding,
  isKnownFixture,
  isTextPath,
  lineOf,
  output,
  readText,
  relPath,
  repoRoot,
  result,
  trackedFiles,
  type AuditFinding,
} from './common';

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

const IMPORT_RE =
  /\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)|\bimport\s+['"]([^'"]+)['"]/gu;
const SECRET_RULES: { category: string; re: RegExp }[] = [
  { category: 'private-key', re: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/gu },
  { category: 'provider-key', re: /\b(?:sk-(?:proj|ant|svcacct|admin)-|AIza|ya29\.)[A-Za-z0-9_-]{16,}/gu },
  { category: 'github-token', re: /\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{16,}/gu },
  { category: 'cloud-token', re: /\b(?:xox[baprs]-|npm_[A-Za-z0-9_-]{20,})/gu },
  {
    category: 'credential-assignment',
    re: /\b(?:api[_-]?key|client[_-]?secret|access[_-]?token|password|passwd|secret)\b\s*[:=]\s*['"][^'"]{12,}['"]/giu,
  },
];
const STATIC_SINKS: { category: string; re: RegExp }[] = [
  { category: 'dynamic-code', re: /\beval\s*\(|\bnew\s+Function\s*\(/gu },
  { category: 'shell-exec', re: /\b(?:exec|execSync|spawn|spawnSync)\s*\(/gu },
  { category: 'shell-true', re: /\bshell\s*:\s*true\b/gu },
  { category: 'unsafe-dom-html', re: /\b(?:innerHTML|outerHTML)\s*=/gu },
];
const FAKE_DATA_MARKERS = /\b(?:not implemented|coming soon|placeholder|sample data|dummy data|hard[- ]coded demo)\b/giu;
const NODE_BUILTINS = new Set([
  'assert',
  'child_process',
  'crypto',
  'events',
  'fs',
  'http',
  'https',
  'module',
  'net',
  'os',
  'path',
  'stream',
  'timers',
  'url',
  'util',
  'worker_threads',
  'zlib',
]);

function packageName(specifier: string): string | null {
  if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('node:')) return null;
  if (NODE_BUILTINS.has(specifier)) return null;
  if (specifier.startsWith('@')) return specifier.split('/').slice(0, 2).join('/');
  return specifier.split('/')[0] ?? null;
}

function packageJson(root: string): PackageJson {
  const text = readText(`${root}/package.json`);
  if (!text) return {};
  try {
    return JSON.parse(text) as PackageJson;
  } catch {
    return {};
  }
}

function historySecretCount(root: string): number | null {
  if (process.argv.includes('--no-history')) return null;
  const commits = (() => {
    try {
      return execFileSync('git', ['rev-list', '--all', '--max-count=250'], { cwd: root, encoding: 'utf8' }).split(/\r?\n/u).filter(Boolean);
    } catch {
      return null;
    }
  })();
  if (commits === null) return null;
  let hits = 0;
  for (const commit of commits) {
    for (const rule of SECRET_RULES) {
      try {
        const out = execFileSync(
          'git',
          ['grep', '-I', '-n', '-E', rule.re.source, commit, '--', ':!test/fixtures', ':!resources/*.example.*'],
          {
            cwd: root,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
          },
        );
        hits += out ? out.split(/\r?\n/u).filter(Boolean).length : 0;
      } catch {
        // git grep returns 1 for no hits; no value is ever printed.
      }
    }
  }
  return hits;
}

function main(): void {
  const root = repoRoot();
  const files = trackedFiles(root)
    .filter(isTextPath)
    .filter((file) => {
      const rel = relPath(file, root);
      return !/^(?:docs|spec|golden)\//u.test(rel) && /\.(?:ts|tsx|mjs|js|json|yaml|yml|toml|lock|xml|html|css)$/u.test(rel);
    });
  const codeFiles = files.filter(
    (file) => /^(?:src|scripts)\//u.test(relPath(file, root)) && /\.(?:ts|tsx|mjs|js)$/u.test(relPath(file, root)),
  );
  const findings: AuditFinding[] = [];
  const imported = new Set<string>();
  const packageData = packageJson(root);
  const declared = new Set([
    ...Object.keys(packageData.dependencies ?? {}),
    ...Object.keys(packageData.devDependencies ?? {}),
    ...Object.keys(packageData.optionalDependencies ?? {}),
  ]);

  for (const file of files) {
    const rel = relPath(file, root);
    if (/^scripts\/audit\/evidence\//u.test(rel)) continue;
    const text = readText(file);
    if (text === null) continue;
    if (codeFiles.includes(file))
      for (const sourceLine of text.split(/\r?\n/u)) {
        if (!/^\s*(?:import|export|const\s+\w+\s*=\s*require|await\s+import)\b/u.test(sourceLine)) continue;
        for (const match of sourceLine.matchAll(IMPORT_RE)) {
          const name = packageName(match.slice(1).find(Boolean) ?? '');
          if (name) imported.add(name);
        }
      }
    for (const rule of SECRET_RULES) {
      for (const match of text.matchAll(rule.re)) {
        const line = lineOf(text, match.index ?? 0);
        const fixture =
          isKnownFixture(rel) || /^(?:test|docs|spec)\//u.test(rel) || /\.example\./u.test(rel) || /^scripts\/audit\//u.test(rel);
        addFinding(findings, {
          category: fixture ? `fixture-${rule.category}` : rule.category,
          status: fixture ? 'candidate' : 'fail',
          path: rel,
          line,
          note: fixture ? 'Fixture/example pattern; review allowlist. Value redacted.' : 'Potential secret pattern; value redacted.',
        });
      }
    }
    if (!codeFiles.includes(file)) continue;
    for (const sink of STATIC_SINKS) {
      for (const match of text.matchAll(sink.re)) {
        addFinding(findings, {
          category: sink.category,
          status: 'candidate',
          path: rel,
          line: lineOf(text, match.index ?? 0),
          note: 'Static sink candidate; inspect the call boundary and input validation.',
        });
      }
    }
    if (!/^src\/(?:renderer|main)\//u.test(rel)) continue;
    for (const match of text.matchAll(FAKE_DATA_MARKERS)) {
      addFinding(findings, {
        category: 'fake-or-placeholder-data',
        status: 'candidate',
        path: rel,
        line: lineOf(text, match.index ?? 0),
        note: 'Static marker found; this is not live UX proof and needs an owner decision.',
      });
    }
  }

  for (const name of imported) {
    if (!declared.has(name)) {
      addFinding(findings, {
        category: 'undeclared-import',
        status: 'fail',
        note: `Imported package ${name} is absent from package.json; dependency value omitted from audit output.`,
      });
    }
  }
  const packageFiles = codeFiles;
  const packageText = packageFiles.map((file) => readText(file) ?? '').join('\n');
  for (const name of declared) {
    if (name.startsWith('@types/')) continue;
    const used =
      imported.has(name) ||
      new RegExp(`(?:^|[^A-Za-z0-9_@-])${name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}(?:$|[^A-Za-z0-9_@-])`, 'u').test(packageText);
    if (!used) {
      addFinding(findings, {
        category: 'unused-dependency-candidate',
        status: 'candidate',
        note: `Declared package ${name} has no import/reference in tracked source; confirm with a full dependency tool.`,
      });
    }
  }

  const historyHits = historySecretCount(root);
  if (historyHits === null)
    addFinding(findings, {
      category: 'history-secret-pattern',
      status: 'blocked',
      note: 'Bounded worktree scan completed, but the optional git-history scan was intentionally not run; values were never emitted.',
    });
  else if (historyHits > 0)
    addFinding(findings, {
      category: 'history-secret-pattern',
      status: 'fail',
      note: `${historyHits} historical pattern hit(s) across the repo; values and lines are redacted. Rotate/review before publication.`,
    });
  else
    addFinding(findings, {
      category: 'history-secret-pattern',
      status: 'pass',
      note: 'No secret pattern was found in the bounded git history scan; values were never emitted.',
    });

  const status = findings.some((finding) => finding.status === 'fail')
    ? 'fail'
    : findings.some((finding) => finding.status === 'candidate')
      ? 'candidate'
      : 'pass';
  const outIndex = process.argv.indexOf('--out');
  output(result('pnpm exec tsx scripts/audit/repo-scan.ts', status, findings), outIndex >= 0 ? process.argv[outIndex + 1] : undefined);
}

main();
