// Spec: project testing rules 6, 8 and 9 (rule 6 rewritten 22 Nov 2026 with Vikas's approval: real Claude for every
// app-level test, using Vikas's installed, signed-in Claude on his own PC through a Remote Control session, no API key);
// CR-0054 (batch 1); the release gate (release-gate.yml, scripts/release-gate.ts), which this script runs on his PC.
//
// The release gate on Vikas's PC. Same journeys, rounds, report and verdict as release-gate.yml, with three differences:
//   - foo is set up on the "Claude app" row (his signed-in Claude Code), not an API key; steps that type a real key into
//     foo are listed as "not run on this PC" (foo-drive.js needsKey), never counted as works;
//   - the picture reviewer is his signed-in Claude Code CLI (release-gate.ts review --via cli);
//   - the installer smoke test runs only when foo is not already installed on the PC, so his own foo is never touched.
// It is the real-PC check too (Vikas 21 Oct: no installer without a real-PC, real-AI check).
//
// Usage (from the repo root, on Windows, started by a Remote Control session; Vikas never runs it by hand):
//   node scripts/pc-gate.mjs [--ref <branch|sha>] [--rounds 3] [--journeys "G2-chat G4-settings"] [--no-review] [--no-push]
// Exit: 0 PASS, 1 FAIL, 2 BLOCKED (nothing ran, no review), 3 the PC could not build or drive foo.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pushEvidence } from './push-evidence.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const has = (n) => args.includes(n);
const ROOT = process.cwd();
const WIN = process.platform === 'win32';
const ROUNDS = Number(opt('--rounds', '3'));
const REF = opt('--ref');
const KIT = path.join(ROOT, 'test', 'real-pc');
const WORK = path.join(os.homedir(), 'foo-pc-gate');
const RUN_DIR = path.join(WORK, 'drive');
const REPORT = path.join(WORK, 'gate-report');
const REFS = path.join(WORK, 'gate-refs');
const REPO = 'vikas53953/foo-agent';

const say = (m) => console.log(`[pc-gate ${new Date().toISOString().slice(11, 19)}] ${m}`);
const die = (m, code = 3) => {
  console.error(`[pc-gate] STOP: ${m}`);
  process.exit(code);
};
/** Runs a command through the shell (Windows finds pnpm.cmd, claude.exe and npx only that way); throws on failure. */
const sh = (cmd, o = {}) => {
  say(`$ ${cmd}`);
  const r = spawnSync(cmd, {
    shell: true,
    stdio: o.quiet ? 'pipe' : 'inherit',
    cwd: o.cwd ?? ROOT,
    env: o.env ?? process.env,
    encoding: 'utf8',
  });
  if (r.status !== 0 && !o.allowFail)
    die(`"${cmd}" failed (exit ${r.status})${o.quiet ? `: ${(r.stderr || r.stdout || '').slice(-600)}` : ''}`);
  return r;
};
const out = (cmd, o = {}) => (sh(cmd, { ...o, quiet: true }).stdout || '').trim();

// No API key anywhere in this run: foo, the driver and the reviewer all use the signed-in Claude app.
const env = { ...process.env };
for (const k of Object.keys(env)) if (/^(ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|FOO_TEST.*|FOO_FAKE_.*)$/i.test(k)) delete env[k];

// 1. Preflight: Windows, Node 22+, a clean checkout, Claude Code signed in.
if (!WIN) die("this runs on Vikas's Windows PC only");
if (Number(process.versions.node.split('.')[0]) < 22) die(`Node 22 or newer is needed (found ${process.version})`);
if (out('git status --porcelain --untracked-files=no')) die('the checkout has local changes; the gate tests a clean commit');
const PNPM = spawnSync('pnpm --version', { shell: true }).status === 0 ? 'pnpm' : 'npx -y pnpm@10.28.0';
const claudeVer = spawnSync('claude --version', { shell: true, encoding: 'utf8', env });
if (claudeVer.status !== 0) die('Claude Code (claude) is not on PATH; foo and the reviewer need it');
const hello = spawnSync('claude -p --output-format json --model claude-haiku-5-5', {
  shell: true,
  encoding: 'utf8',
  env,
  input: 'Reply with the word ok.',
});
const signedIn = (() => {
  try {
    return hello.status === 0 && !JSON.parse(hello.stdout).is_error;
  } catch {
    return false; // not JSON: the CLI printed an error instead of an answer
  }
})();
if (!signedIn) die(`Claude Code is not signed in or cannot answer: ${(hello.stdout || hello.stderr || '').slice(0, 300)}`);
say(`Claude Code ${claudeVer.stdout.trim()} is signed in and answers`);

// 2. The commit under test.
if (REF) {
  sh(`git fetch -q origin ${REF}`);
  sh('git checkout -q --detach FETCH_HEAD');
}
const SHA = out('git rev-parse HEAD');
const SHORT = SHA.slice(0, 7);
say(`testing ${SHA}`);

// 3. Build the app and the installer exactly as CI does.
sh(`${PNPM} install --frozen-lockfile --ignore-scripts`);
sh('node node_modules/electron/install.js');
sh(`${PNPM} build`);
if (sh(`${PNPM} rebuild:electron`, { allowFail: true }).status !== 0) {
  // No C++ build tools on this PC: take better-sqlite3's prebuilt binary for this Electron instead of compiling it.
  const ev = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', 'electron', 'package.json'), 'utf8')).version;
  sh(`npx -y prebuild-install@7 --runtime electron --target ${ev} --arch x64`, { cwd: path.join(ROOT, 'node_modules', 'better-sqlite3') });
}
sh(`${PNPM} exec electron-builder --win nsis --publish never`);
sh(`${PNPM} exec electron-builder --win --dir --publish never`);
// PC run 3 (22 Nov): the package held @napi-rs/keyring without its Windows binary, so foo could not reach Credential
// Manager ("can't reach this PC's safe storage"). A build without it is not worth driving.
const unpacked = path.join(ROOT, 'dist', 'win-unpacked', 'resources', 'app.asar.unpacked', 'node_modules', '@napi-rs');
const keyringBin = path.join(unpacked, 'keyring-win32-x64-msvc');
if (!fs.existsSync(keyringBin) || !fs.readdirSync(keyringBin).some((f) => f.endsWith('.node'))) {
  die(`the package has no Credential Manager binary (${keyringBin}); foo could not save keys`);
}

// 4. Installer smoke test, only when foo is not installed here (his own foo and its uninstall entry stay untouched).
const instDir = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'foo');
const install = { ran: false, ok: true, lines: [] };
let EXE = path.join(ROOT, 'dist', 'win-unpacked', 'foo.exe');
if (fs.existsSync(path.join(instDir, 'foo.exe'))) {
  install.lines.push(`skipped: foo is already installed at ${instDir}; journeys drive the built app (dist/win-unpacked)`);
} else {
  const setup = fs.readdirSync(path.join(ROOT, 'dist')).find((f) => /Setup.*\.exe$/i.test(f));
  if (!setup) die('no installer in dist/');
  install.ran = true;
  const r = spawnSync(`"${path.join(ROOT, 'dist', setup)}" /S`, { shell: true });
  spawnSync('taskkill /IM foo.exe /F', { shell: true, stdio: 'ignore' });
  const checks = {
    'installer exit code 0': r.status === 0,
    'foo.exe installed': fs.existsSync(path.join(instDir, 'foo.exe')),
    'uninstaller installed': fs.existsSync(path.join(instDir, 'Uninstall foo.exe')),
    'Start menu shortcut': fs.existsSync(path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'foo.lnk')),
  };
  for (const [k, v] of Object.entries(checks)) install.lines.push(`${k}: ${v ? 'yes' : 'NO'}`);
  install.ok = Object.values(checks).every(Boolean);
  if (install.ok) EXE = path.join(instDir, 'foo.exe');
}

// 5. Drive the journeys: the first one sets up the shared profile once, the rest run every round (pass^k).
fs.rmSync(WORK, { recursive: true, force: true });
fs.mkdirSync(path.join(RUN_DIR, 'runs'), { recursive: true });
sh(`${PNPM} exec playwright install ffmpeg`, { allowFail: true });
const list = (opt('--journeys') ?? fs.readFileSync(path.join(KIT, 'gate.txt'), 'utf8')).split(/\s+/).filter(Boolean);
const file = (id) => (fs.existsSync(path.join(KIT, 'gate', `${id}.json`)) ? `gate/${id}.json` : `journeys/${id}.json`);
const expected = list.map((id, k) => {
  const j = JSON.parse(fs.readFileSync(path.join(KIT, file(id)), 'utf8'));
  const features = [...new Set(j.steps.map((s) => s.feature || j.feature).filter(Boolean))];
  return { journey: j.id, features, count: k === 0 || j.once ? 1 : ROUNDS };
});
fs.writeFileSync(path.join(RUN_DIR, 'runs', 'expected.json'), JSON.stringify(expected, null, 2));
const driveEnv = {
  ...env,
  FOO_EXE: EXE,
  FOO_REAL_TEST_DIR: RUN_DIR,
  FOO_QA_INPAGE: path.join(ROOT, 'test', 'qa-explore', 'inpage.js'),
  FOO_AI_ROW: 'claude-cli',
  FOO_REAL_AI_ONLY: '1',
  FOO_VIDEO: '1',
  FOO_WATCH_MS: '1500,3000,6000',
  ELECTRON_RUN_AS_NODE: '1',
};
const console_ = path.join(RUN_DIR, 'runs', 'console.txt');
const drive = (id) => {
  say(`=== ${id} ===`);
  const r = spawnSync(EXE, ['foo-drive.js', file(id)], { cwd: KIT, env: driveEnv, encoding: 'utf8', timeout: 45 * 60_000 });
  fs.appendFileSync(console_, `=== ${id} ===\n${r.stdout ?? ''}${r.stderr ?? ''}`);
  spawnSync('taskkill /IM foo.exe /F', { shell: true, stdio: 'ignore' });
  return r.status ?? 1;
};
const first = list[0];
const rc = drive(first);
if (rc !== 0 && rc !== 3) die(`${first} could not finish setup on the Claude app; see ${console_}`);
for (let round = 1; round <= ROUNDS; round++)
  for (const id of list.slice(1)) {
    if (round > 1 && expected.find((e) => e.journey === id)?.count === 1) continue;
    drive(id);
  }

// 6. Uninstall what step 4 installed.
if (install.ran) {
  spawnSync('taskkill /IM foo.exe /F', { shell: true, stdio: 'ignore' });
  spawnSync(`"${path.join(instDir, 'Uninstall foo.exe')}" /S`, { shell: true });
  for (let i = 0; i < 30 && fs.existsSync(path.join(instDir, 'foo.exe')); i++)
    spawnSync('ping -n 3 127.0.0.1', { shell: true, stdio: 'ignore' });
  const gone = !fs.existsSync(path.join(instDir, 'foo.exe'));
  install.lines.push(`uninstall removed foo.exe: ${gone ? 'yes' : 'NO'}`);
  install.ok &&= gone;
}

// 7. The other checks on this commit (public repo: no token needed), as the CI gate reads them.
let checks = [];
try {
  const res = await fetch(`https://api.github.com/repos/${REPO}/commits/${SHA}/check-runs?per_page=100`, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'foo-pc-gate' },
  });
  checks = (await res.json()).check_runs
    .filter((c) => /^(Fast lane|Screen change|Full suite|Golden lane)/.test(c.name))
    .map((c) => ({ name: c.name, conclusion: c.conclusion, url: c.html_url }));
} catch (e) {
  say(`could not read the CI checks: ${e}`);
}
checks.push({ name: "Installer smoke test on Vikas's PC", conclusion: install.ok ? (install.ran ? 'success' : 'skipped') : 'failure' });
fs.writeFileSync(path.join(WORK, 'checks.json'), JSON.stringify(checks, null, 2));

// 8. Reference pictures, the reviewer (his Claude Code CLI) and the report.
const runs = path.join(RUN_DIR, 'runs');
sh(`${PNPM} exec playwright install chromium`, { allowFail: true });
const ids = out(`${PNPM} -s exec tsx scripts/release-gate.ts refs --runs "${runs}"`, { allowFail: true });
if (ids) sh(`${PNPM} golden:render --ids "${ids}" --engine chromium --out "${REFS}"`, { allowFail: true });
if (!has('--no-review'))
  sh(
    `${PNPM} exec tsx scripts/release-gate.ts review --via cli --runs "${runs}" --refs "${REFS}" --out "${REPORT}" --model claude-sonnet-5-5 --first-pass claude-haiku-5-5 --skip-when-failed`,
    { env, allowFail: true },
  );
const rep = sh(
  `${PNPM} exec tsx scripts/release-gate.ts report --runs "${runs}" --refs "${REFS}" --out "${REPORT}" --checks "${path.join(WORK, 'checks.json')}" --expect "${path.join(runs, 'expected.json')}" --known test/real-pc/known-red.json --sha ${SHA}`,
  { allowFail: true },
);
const verdict = JSON.parse(fs.readFileSync(path.join(REPORT, 'verdict.json'), 'utf8'));
let summary = [
  `# foo release gate on Vikas's PC: ${verdict.status}`,
  '',
  `Commit ${SHA}, ${ROUNDS} round(s), AI: the signed-in Claude app (Claude Code ${claudeVer.stdout.trim()}), no API key.`,
  '',
  '| Feature | Verdict | Checkpoints | Broken | Wrong vs design |',
  '|---|---|---|---|---|',
  ...verdict.features.map((f) => `| ${f.name} | ${f.verdict} | ${f.checkpoints} | ${f.broken} | ${f.wrong} |`),
  '',
  `Installer smoke test: ${install.lines.join('; ')}`,
  `Not run on this PC (need a real API key): ${verdict.notRun?.length ?? 0} step(s).`,
  `Report: ${path.join(REPORT, 'index.html')}`,
].join('\n');
// A PASS makes this build the gated installer (the only app that goes to Vikas): it is copied beside his Downloads.
let gated = '';
if (verdict.status === 'PASS') {
  const setup = fs.readdirSync(path.join(ROOT, 'dist')).find((f) => /Setup.*\.exe$/i.test(f));
  if (setup) {
    const dir = path.join(os.homedir(), 'Downloads', 'foo-gated');
    fs.mkdirSync(dir, { recursive: true });
    gated = path.join(dir, `foo-Setup-${SHORT}-gated.exe`);
    fs.copyFileSync(path.join(ROOT, 'dist', setup), gated);
  }
}
summary += gated ? `\nGated installer: ${gated}` : '';
fs.writeFileSync(path.join(REPORT, 'summary.md'), summary + '\n');
console.log(`\n${summary}\n`);

// 9. Evidence to the evidence branch (pc-gate/<sha7>/), so the cloud lead can read every record and picture.
if (!has('--no-push')) {
  const stage = path.join(WORK, 'evidence-stage');
  const dest = path.join(stage, 'pc-gate', SHORT);
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  // Pictures, records and the report; videos stay on the PC (too big for git).
  fs.cpSync(REPORT, path.join(dest, 'report'), { recursive: true, filter: (s) => !/[\\/]videos([\\/]|$)/.test(s) });
  fs.cpSync(runs, path.join(dest, 'runs'), { recursive: true, filter: (s) => !/[\\/]video([\\/]|$)/.test(s) });
  const pushed = pushEvidence(ROOT, stage, `pc-gate/${SHORT}`, `pc-gate ${SHORT}: ${verdict.status}`);
  say(pushed ? `evidence pushed to evidence:pc-gate/${SHORT}` : 'evidence push failed; it stays on this PC');
}
process.exit(rep.status ?? 2);
