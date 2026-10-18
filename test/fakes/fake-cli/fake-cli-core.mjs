// Fake AI CLI core (08-3 §22.3 "Fake CLIs"): echoes a captured fixture line by line and dumps what it was given.
// env: FAKE_CLI_FIXTURE (stdout lines), FAKE_CLI_DUMP (JSON dump path), FAKE_CLI_HELP / FAKE_CLI_VERSION (text files for
// --help / --version; FAKE_CLI_EXEC_HELP for `exec --help`), FAKE_CLI_STDERR (file copied to stderr), FAKE_CLI_EXIT (exit code), FAKE_CLI_LINE_DELAY_MS,
// FAKE_CLI_FIXTURE_NO_MODEL / FAKE_CLI_EXIT_NO_MODEL (used when argv has no -m/--model), FAKE_CLI_HANG=1 (never exit after printing), FAKE_CLI_GRANDCHILD=1 (spawn a sleeping grandchild; its pid goes in the dump).
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const KEPT_ENV = ['NO_COLOR', 'TERM', 'CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'ELECTRON_RUN_AS_NODE', 'FAKE_MARKER'];

export async function runFakeCli(name) {
  const argv = process.argv.slice(2);
  const env = process.env;
  const textOf = (p, fallback) => (p && existsSync(p) ? readFileSync(p, 'utf8') : fallback);
  if (argv.includes('--version')) {
    process.stdout.write(textOf(env.FAKE_CLI_VERSION, `${name} 0.0.0-fake\n`));
    return 0;
  }
  if (argv.includes('--help')) {
    const file = argv[0] === 'exec' && env.FAKE_CLI_EXEC_HELP ? env.FAKE_CLI_EXEC_HELP : env.FAKE_CLI_HELP;
    process.stdout.write(textOf(file, `usage: ${name}\n`));
    return 0;
  }
  const stdin = await new Promise((resolve) => {
    const chunks = [];
    process.stdin.on('data', (c) => chunks.push(c));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
  const dump = { name, argv, stdin, cwd: process.cwd(), env: {} };
  for (const k of KEPT_ENV) if (env[k] !== undefined) dump.env[k] = env[k];
  const sysIdx = argv.indexOf('--append-system-prompt-file');
  if (sysIdx >= 0) {
    const p = argv[sysIdx + 1];
    dump.systemFile = { path: p, existed: !!p && existsSync(p), text: p && existsSync(p) ? readFileSync(p, 'utf8') : null };
  }
  if (env.FAKE_CLI_GRANDCHILD === '1') {
    const gc = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    dump.grandchildPid = gc.pid;
  }
  dump.pid = process.pid;
  if (env.FAKE_CLI_DUMP) writeFileSync(env.FAKE_CLI_DUMP, JSON.stringify(dump, null, 2));

  if (env.FAKE_CLI_STDERR && existsSync(env.FAKE_CLI_STDERR)) process.stderr.write(readFileSync(env.FAKE_CLI_STDERR, 'utf8'));
  const delay = Number(env.FAKE_CLI_LINE_DELAY_MS ?? 0);
  const noModel = !argv.includes('-m') && !argv.includes('--model');
  const fixture = noModel && env.FAKE_CLI_FIXTURE_NO_MODEL ? env.FAKE_CLI_FIXTURE_NO_MODEL : env.FAKE_CLI_FIXTURE;
  const lines = textOf(fixture, '').split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  for (const l of lines) {
    process.stdout.write(l + '\n');
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
  }
  if (env.FAKE_CLI_HANG === '1') await new Promise(() => setInterval(() => {}, 1000));
  return Number((noModel ? env.FAKE_CLI_EXIT_NO_MODEL : undefined) ?? env.FAKE_CLI_EXIT ?? 0);
}
