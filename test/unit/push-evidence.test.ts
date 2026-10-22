// Spec: 11-fidelity §11.6.1 (fresh evidence pushed per run). scripts/push-evidence.sh against a local `evidence` remote: it
// writes only this run's <branch>/<sha>/ and <branch>/latest/ folders, never fetches or checks out other branches' evidence
// (the golden lane ran out of disk checking it all out, #123), keeps every other folder, and retries when another run's push
// lands first. POSIX shell only: the Windows golden lane runs the script itself on every PR.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = path.resolve('scripts/push-evidence.sh');
let root: string | null = null;
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = null;
});

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd, encoding: 'utf8' }).trim();

/** A bare `remote.git` whose `evidence` branch already holds another branch's run (with a 2 MB picture) and our stale latest/. */
function world() {
  root = mkdtempSync(path.join(os.tmpdir(), 'evidence-'));
  const remote = path.join(root, 'remote.git');
  git(root, 'init', '-q', '--bare', remote);
  git(remote, 'config', 'uploadpack.allowFilter', 'true');
  const seed = path.join(root, 'seed');
  mkdirSync(path.join(seed, 'other/abc1234'), { recursive: true });
  mkdirSync(path.join(seed, 'feat/latest'), { recursive: true });
  writeFileSync(path.join(seed, 'other/abc1234/big.png'), Buffer.alloc(2_000_000, 7));
  writeFileSync(path.join(seed, 'feat/latest/stale.json'), '{}');
  git(seed, 'init', '-q');
  git(seed, 'add', '-A');
  git(seed, 'commit', '-qm', 'seed');
  git(seed, 'push', '-q', remote, 'HEAD:refs/heads/evidence');
  const bigBlob = git(seed, 'rev-parse', 'HEAD:other/abc1234/big.png');
  // Another run's push, parked on a side ref; the race test moves `evidence` to it.
  mkdirSync(path.join(seed, 'third/1111111'), { recursive: true });
  writeFileSync(path.join(seed, 'third/1111111/r.json'), '{}');
  git(seed, 'add', '-A');
  git(seed, 'commit', '-qm', 'another run');
  git(remote, 'fetch', '-q', seed, 'HEAD:refs/other-run');
  // This run's evidence, where the golden lane leaves it.
  const repo = path.join(root, 'repo');
  mkdirSync(path.join(repo, 'qa-evidence/M9'), { recursive: true });
  writeFileSync(path.join(repo, 'qa-evidence/M9/fidelity.json'), '{"ok":true}');
  const tmp = path.join(root, 'tmp');
  mkdirSync(tmp);
  return { remote, repo, tmp, bigBlob };
}

function push(w: ReturnType<typeof world>) {
  return execFileSync('bash', [SCRIPT], {
    cwd: w.repo,
    encoding: 'utf8',
    env: {
      ...process.env,
      TMPDIR: w.tmp,
      GITHUB_TOKEN: 'test-token',
      GITHUB_SERVER_URL: `file://${root}`,
      GITHUB_REPOSITORY: 'remote',
      SOURCE_BRANCH: 'feat',
      HEAD_SHA: 'deadbeefcafe',
      MILESTONE: 'M9',
      GITHUB_RUN_ID: '42',
      GIT_NO_LAZY_FETCH: '1',
    },
  });
}

/** Every file under `dir`. */
function files(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => path.join(d.parentPath, d.name));
}

describe.runIf(process.platform !== 'win32')('push-evidence.sh', () => {
  it("writes only this run's folders, keeps the rest, and never brings other branches' evidence onto the runner", () => {
    const w = world();
    push(w);
    const tree = git(w.remote, 'ls-tree', '-r', '--name-only', 'evidence').split('\n');
    expect(tree).toEqual([
      'feat/deadbee/RUN.txt',
      'feat/deadbee/fidelity.json',
      'feat/latest/RUN.txt',
      'feat/latest/fidelity.json',
      'other/abc1234/big.png',
    ]);
    expect(git(w.remote, 'show', 'evidence:feat/latest/fidelity.json')).toBe('{"ok":true}');
    // Nothing the script left in its temp folders holds the other branch's picture, on disk or as a git object.
    const left = files(w.tmp);
    expect(left.filter((f) => f.endsWith('big.png'))).toEqual([]);
    expect(left.filter((f) => statSync(f).size >= 1_000_000)).toEqual([]);
    const gitDirs = left
      .filter((f) => path.basename(f) === 'HEAD' && existsSync(path.join(path.dirname(f), 'objects')))
      .map((f) => path.dirname(f));
    expect(gitDirs.length).toBeGreaterThan(0);
    for (const gitDir of gitDirs) {
      const present = git(gitDir, '--git-dir', gitDir, 'cat-file', '--batch-check=%(objectname)', '--batch-all-objects').split('\n');
      expect(present).not.toContain(w.bigBlob);
    }
  });

  it('when another run pushes first, it fetches again and lands on top, keeping that run', () => {
    const w = world();
    // The first push is refused after another run's commit lands, as GitHub refuses a non-fast-forward on a race.
    writeFileSync(
      path.join(w.remote, 'hooks/pre-receive'),
      `#!/usr/bin/env bash
unset GIT_QUARANTINE_PATH GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES
if [ ! -e ../raced ]; then touch ../raced; git update-ref refs/heads/evidence refs/other-run; exit 1; fi
`,
      { mode: 0o755 },
    );
    const out = push(w);
    expect(out).toMatch(/retrying/);
    const tree = git(w.remote, 'ls-tree', '-r', '--name-only', 'evidence').split('\n');
    expect(tree).toContain('feat/deadbee/fidelity.json');
    expect(tree).toContain('other/abc1234/big.png');
    expect(tree).toContain('third/1111111/r.json');
    expect(git(w.remote, 'rev-parse', 'evidence~1')).toBe(git(w.remote, 'rev-parse', 'refs/other-run'));
  });
});
