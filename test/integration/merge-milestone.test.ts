// Spec: docs/build-method.md §1 and §3; retro lever 1. scripts/merge-milestone.sh in a throwaway repo: the shared row
// and JSON files merge by themselves, the manifest is rebuilt, and a real source clash stops the merge.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve('.');
// Windows: pnpm is a .cmd shim that execFile cannot start, and System32 may hold a WSL bash; use node and Git Bash.
const TSX = [join(ROOT, 'node_modules/tsx/dist/cli.mjs')];
const GIT_BASH = 'C:\\Program Files\\Git\\bin\\bash.exe';
const BASH = process.platform === 'win32' && existsSync(GIT_BASH) ? GIT_BASH : 'bash';
const TRACE_HEAD = 'R,J,AT / ART / PERF,UX step,BP ref,Spec §,Test file,Milestone,Status';
let dir = '';

const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
const put = (file: string, text: string) => {
  mkdirSync(dirname(join(dir, file)), { recursive: true });
  writeFileSync(join(dir, file), text);
};
const read = (file: string) => readFileSync(join(dir, file), 'utf8');
const merge = (ref: string, ...rest: string[]) =>
  spawnSync(BASH, ['scripts/merge-milestone.sh', ref, ...rest], { cwd: dir, encoding: 'utf8' });
const specWrite = () => execFileSync(process.execPath, [...TSX, 'scripts/spec-verify.ts', '--write'], { cwd: dir });

/** main → two branches that each append to every shared file; `clash` also edits src/a.ts on both. */
function branch(name: string, n: number, src?: string) {
  git('checkout', '-q', '-b', name, 'main');
  put('spec/trace.csv', read('spec/trace.csv') + `,,AT-90${n},,,10-1 §B,test/x${n}.test.ts,M9,pending\n`);
  put('docs/decisions/M9.tsv', read('docs/decisions/M9.tsv') + `2026-10-21\tdecision ${n}\n`);
  const pending = JSON.parse(read('scripts/copy-pending.json')) as { keys: Record<string, string> };
  pending.keys[`key.${n}`] = `T${n}`;
  put('scripts/copy-pending.json', JSON.stringify(pending, null, 2) + '\n');
  put(`spec/constitution/cr-${n}.md`, `CR ${n}\n`);
  specWrite();
  if (src) put('src/a.ts', src);
  git('add', '-A');
  git('commit', '-q', '-m', name);
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'merge-ms-'));
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 't');
  git('config', 'core.autocrlf', 'false');
  for (const f of ['merge-milestone.sh', 'merge-rows.ts', 'trace-check.ts', 'spec-verify.ts']) {
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    copyFileSync(join(ROOT, 'scripts', f), join(dir, 'scripts', f));
  }
  symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'junction');
  put('.gitignore', 'node_modules\n');
  put('package.json', '{ "name": "t", "private": true, "type": "module" }\n');
  put('.prettierrc', readFileSync(join(ROOT, '.prettierrc'), 'utf8'));
  put('spec/constitution/00.md', 'spec\n');
  put('spec/trace.csv', `${TRACE_HEAD}\n`);
  put('docs/decisions/M9.tsv', 'ts\tdecision\n');
  put('scripts/copy-pending.json', '{\n  "_why": "test",\n  "keys": {}\n}\n');
  put('src/a.ts', 'export const a = 1;\n');
  mkdirSync(join(dir, 'test'), { recursive: true });
  specWrite();
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
}, 60_000);

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('merge-milestone.sh', () => {
  it('merges the shared files of two tickets with no hand work and commits', () => {
    branch('t1', 1);
    branch('t2', 2);
    const r = merge('t1');
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('spec/trace.csv: rows merged');
    expect(r.stdout).toContain('spec/SPEC-MANIFEST.json: regenerated');
    expect(r.stdout).toContain('merge committed');
    expect(read('spec/trace.csv')).toBe(
      `${TRACE_HEAD}\n,,AT-902,,,10-1 §B,test/x2.test.ts,M9,pending\n,,AT-901,,,10-1 §B,test/x1.test.ts,M9,pending\n`,
    );
    expect(read('docs/decisions/M9.tsv')).toBe('ts\tdecision\n2026-10-21\tdecision 2\n2026-10-21\tdecision 1\n');
    expect(JSON.parse(read('scripts/copy-pending.json')).keys).toEqual({ 'key.2': 'T2', 'key.1': 'T1' });
    const manifest = JSON.parse(read('spec/SPEC-MANIFEST.json')) as { files: Record<string, string> };
    expect(Object.keys(manifest.files).sort()).toEqual(['constitution/00.md', 'constitution/cr-1.md', 'constitution/cr-2.md', 'trace.csv']);
    expect(git('status', '--porcelain')).toBe('');
  }, 120_000);

  it('says so when the branch is already merged', () => {
    const r = merge('t1');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('nothing to merge');
  }, 60_000);

  it('stops on a real source clash, names it, and leaves the merge open', () => {
    branch('c1', 3, 'export const a = 3;\n');
    branch('c2', 4, 'export const a = 4;\n');
    const r = merge('c1');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('real clashes');
    expect(r.stderr).toContain('src/a.ts');
    expect(r.stderr).not.toContain('trace.csv');
    expect(git('diff', '--name-only', '--diff-filter=U')).toBe('src/a.ts');
    git('merge', '--abort');
  }, 120_000);

  it('a trace row two tickets changed differently stops the merge and leaves the manifest for later', () => {
    const flip = (name: string, file: string) => {
      git('checkout', '-q', '-b', name, 't2');
      put('spec/trace.csv', read('spec/trace.csv').replace('test/x1.test.ts', file));
      specWrite();
      git('commit', '-q', '-am', name);
    };
    flip('f1', 'test/y1.test.ts');
    flip('f2', 'test/z1.test.ts');
    const r = merge('f1');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('changed on both sides');
    expect(r.stderr).toContain('spec/trace.csv');
    expect(r.stderr).toContain('regenerate once the spec/ clash');
    expect(r.stdout).not.toContain('regenerated');
    git('merge', '--abort');
  }, 120_000);

  it('--no-commit stages the merge and leaves it open', () => {
    git('checkout', '-q', '-b', 'n1', 't2');
    put('docs/decisions/M9.tsv', read('docs/decisions/M9.tsv') + '2026-10-22\tn1\n');
    git('commit', '-q', '-am', 'n1');
    git('checkout', '-q', '-b', 'n2', 't2');
    put('docs/decisions/M9.tsv', read('docs/decisions/M9.tsv') + '2026-10-22\tn2\n');
    git('commit', '-q', '-am', 'n2');
    const r = merge('n1', '--no-commit');
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('merge staged, not committed');
    expect(git('rev-parse', '-q', '--verify', 'MERGE_HEAD')).not.toBe('');
    expect(read('docs/decisions/M9.tsv').endsWith('2026-10-22\tn2\n2026-10-22\tn1\n')).toBe(true);
    git('merge', '--abort');
  }, 120_000);

  it('refuses to start on a dirty tree', () => {
    put('src/a.ts', 'dirty\n');
    const r = merge('t2');
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('commit or stash');
    git('checkout', '--', 'src/a.ts');
  }, 60_000);
});
