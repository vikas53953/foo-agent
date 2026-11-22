// Spec: project testing rules 6 and 8 (the PC gate's evidence goes where the cloud lead reads it); 11-fidelity §11.2
// (evidence beside every result).
//
// Adds one folder to the evidence branch WITHOUT checking that branch out: it holds every gate's pictures, and a worktree
// of it took longer than the gate run itself on Vikas's PC (pc-gate b1c3cf6). A private index starts from the branch's
// tree, takes the new folder from a staging directory, and becomes one commit on top; push, and on a race fetch and redo.
// --missing-ok: in a partial clone the branch's old blobs are not local, and write-tree would otherwise download them all
// (6.6 GB on Vikas's PC); the tree only needs their ids.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * @param {string} repo the git checkout to push from
 * @param {string} stage a directory whose contents mirror the branch layout, e.g. <stage>/pc-gate/<sha7>/...
 * @param {string} folder the one folder to add or replace, relative to stage (e.g. pc-gate/<sha7>); nothing else changes
 * @param {string} message the commit message
 * @returns {boolean} pushed
 */
export function pushEvidence(repo, stage, folder, message) {
  const index = path.join(os.tmpdir(), `foo-evidence-index-${process.pid}`);
  const env = { ...process.env, GIT_INDEX_FILE: index };
  const git = (args, o = {}) => spawnSync('git', args, { cwd: repo, encoding: 'utf8', env, ...o });
  for (let attempt = 0; attempt < 3; attempt++) {
    fs.rmSync(index, { force: true });
    if (
      git(['fetch', '-q', '--depth', '1', '--filter=blob:none', 'origin', '+refs/heads/evidence:refs/remotes/origin/evidence']).status !== 0
    )
      return false;
    if (git(['read-tree', 'origin/evidence']).status !== 0) return false;
    if (git(['--work-tree', stage, 'add', '-A', '--', folder.replaceAll('\\', '/')]).status !== 0) return false;
    const tree = git(['write-tree', '--missing-ok']).stdout.trim();
    const commit = git([
      '-c',
      'user.name=foo-pc-gate',
      '-c',
      'user.email=noreply@users.noreply.github.com',
      'commit-tree',
      tree,
      '-p',
      'origin/evidence',
      '-m',
      message,
    ]).stdout.trim();
    if (commit && git(['push', '-q', 'origin', `${commit}:refs/heads/evidence`]).status === 0) {
      fs.rmSync(index, { force: true });
      return true;
    }
  }
  fs.rmSync(index, { force: true });
  return false;
}
