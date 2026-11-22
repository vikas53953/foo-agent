// Spec: project testing rules 6, 8 and 9 (real Claude on Vikas's PC, nothing merges before the real-AI journeys pass,
// never ask Vikas to start a test); Vikas 22 Nov 2026: "fully automatic 24/7 pipeline … I will not be there on my PC".
//
// The PC side of the automatic loop. Windows Task Scheduler starts this every 10 minutes while Vikas is signed in
// (install: node scripts/pc-gate-watch.mjs --install). Each start looks once and exits:
//   1. every open, non-draft PR labelled "pc-gate" is a target (a PR merges only after its head passed here);
//   2. a target whose head commit has no result on the evidence branch (pc-gate/<sha7>/report/verdict.json) yet is run
//      through scripts/pc-gate.mjs (3 rounds), newest PR first, one at a time (a lock file stops overlapping starts);
//   3. pc-gate.mjs pushes its evidence, which is what the cloud lead reads to fix and push again.
// So a push from the cloud is tested on this PC with no one at the keyboard; the PC only needs to be on and signed in.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO = 'vikas53953/foo-agent';
const ROOT = process.cwd();
const HOME = path.join(os.homedir(), 'foo-pc-gate-watch');
const LOCK = path.join(HOME, 'lock');
const LOG = path.join(HOME, 'watch.log');
fs.mkdirSync(HOME, { recursive: true });
const say = (m) => fs.appendFileSync(LOG, `${new Date().toISOString()} ${m}\n`) || console.log(m);
const git = (a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' });

if (process.argv.includes('--install')) {
  // Every 10 minutes while Vikas is signed in (foo's windows need his desktop session); no admin rights needed.
  const cmd = `cmd /c cd /d "${ROOT}" && node scripts\\pc-gate-watch.mjs`;
  const r = spawnSync('schtasks', ['/Create', '/F', '/SC', 'MINUTE', '/MO', '10', '/TN', 'foo-pc-gate-watch', '/TR', cmd], {
    encoding: 'utf8',
  });
  console.log(r.stdout || r.stderr);
  process.exit(r.status ?? 1);
}

// One run at a time; a lock older than 6 hours is from a run that died.
if (fs.existsSync(LOCK) && Date.now() - fs.statSync(LOCK).mtimeMs < 6 * 3600_000) process.exit(0);
fs.writeFileSync(LOCK, String(process.pid));
try {
  const gh = async (p) => {
    const res = await fetch(`https://api.github.com/repos/${REPO}/${p}`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'foo-pc-gate-watch' },
    });
    if (!res.ok) throw new Error(`GitHub ${p}: ${res.status}`);
    return res.json();
  };
  const prs = (await gh('pulls?state=open&per_page=50'))
    .filter((p) => !p.draft && p.labels.some((l) => l.name === 'pc-gate'))
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
    .map((p) => ({ name: `#${p.number}`, sha: p.head.sha }));
  const targets = prs;
  git(['fetch', '-q', '--depth', '1', '--filter=blob:none', 'origin', '+refs/heads/evidence:refs/remotes/origin/evidence']);
  const done = (sha) => git(['cat-file', '-e', `origin/evidence:pc-gate/${sha.slice(0, 7)}/report/verdict.json`]).status === 0;
  const next = targets.find((t) => !done(t.sha));
  if (!next) process.exit(0);
  say(`running the gate on ${next.name} ${next.sha}`);
  if (git(['status', '--porcelain', '--untracked-files=no']).stdout.trim()) git(['checkout', '-q', '--', '.']);
  git(['fetch', '-q', 'origin', next.sha]);
  git(['checkout', '-q', '--detach', next.sha]);
  // The gate script of the commit under test runs, so a fix to the gate itself is tested the moment it is pushed.
  const out = path.join(HOME, `run-${next.sha.slice(0, 7)}.log`);
  const fd = fs.openSync(out, 'w');
  const r = spawnSync('node', ['scripts/pc-gate.mjs', '--rounds', '3'], {
    cwd: ROOT,
    stdio: ['ignore', fd, fd],
    shell: true,
    timeout: 5 * 3600_000,
  });
  fs.closeSync(fd);
  say(`${next.name} ${next.sha.slice(0, 7)} finished with exit ${r.status}`);
  git(['fetch', '-q', '--depth', '1', '--filter=blob:none', 'origin', '+refs/heads/evidence:refs/remotes/origin/evidence']);
  if (!done(next.sha)) {
    // No report (the PC could not build or drive foo, or the push failed): push a BLOCKED verdict with the log's end,
    // so the cloud lead sees why and this commit is not retried every 10 minutes.
    const tail = fs.readFileSync(out, 'utf8').split('\n').slice(-150).join('\n');
    const wt = path.join(HOME, 'evidence-wt');
    spawnSync('git', ['worktree', 'remove', '-f', wt], { cwd: ROOT });
    git(['worktree', 'add', '-f', '--detach', wt, 'origin/evidence']);
    const dest = path.join(wt, 'pc-gate', next.sha.slice(0, 7), 'report');
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(
      path.join(dest, 'verdict.json'),
      JSON.stringify({ status: 'BLOCKED', sha: next.sha, exit: r.status, reason: 'pc-gate.mjs ended without a report' }, null, 2),
    );
    fs.writeFileSync(path.join(dest, 'console-tail.txt'), tail);
    const g = (a) => spawnSync('git', a, { cwd: wt, encoding: 'utf8' });
    g(['add', '-A']);
    g([
      '-c',
      'user.name=foo-pc-gate',
      '-c',
      'user.email=noreply@users.noreply.github.com',
      'commit',
      '-q',
      '-m',
      `pc-gate ${next.sha.slice(0, 7)}: BLOCKED`,
    ]);
    for (let i = 0; i < 3 && g(['push', '-q', 'origin', 'HEAD:refs/heads/evidence']).status !== 0; i++) {
      g(['fetch', '-q', '--depth', '1', 'origin', '+refs/heads/evidence:refs/remotes/origin/evidence']);
      g(['rebase', '-q', 'origin/evidence']);
    }
    spawnSync('git', ['worktree', 'remove', '-f', wt], { cwd: ROOT });
  }
} catch (e) {
  say(`watch failed: ${e}`);
} finally {
  fs.rmSync(LOCK, { force: true });
}
