// Spec: 11-fidelity §11.2.3 (drive the real app: seed through test:seed, fake clock, real UI actions by test id), §11.6.1
// (fresh evidence from the commit it names); docs/build-method.md "Proof" (the foo-verify skill, .claude/skills/foo-verify).
// Runs one journey against the built app and keeps the proof: a screenshot per shot, the notes the journey wrote, the
// renderer's console errors, the fake AI's recorded turns, and the commit it ran on. `--compare` puts a before run and an
// after run side by side with a pixel diff per shot.
//
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/<name>.journey.ts [--label after] [--app-dir .] [--out DIR]
//   pnpm tsx scripts/foo-verify.ts --compare qa-evidence/verify/<name>
//   pnpm tsx scripts/foo-verify.ts --markdown qa-evidence/verify/<name> --base-url <raw URL of the pushed folder>
//
// A journey default-exports `async (v: Verify) => void`. It launches through `v.launch` (FOO_TEST=1, its own data folders,
// optional fake AI script) and drives the window with the helpers in test/fidelity/capture.ts.
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { diff, readPng } from './golden/pixels';
import type { FakeLine } from '../test/e2e/fakeAi';

export interface Verify {
  /** Starts the app from --app-dir with FOO_TEST=1 and fresh data folders; closed for you at the end. */
  launch(o?: { fakeAi?: FakeLine[]; args?: string[]; env?: Record<string, string> }): Promise<{ app: ElectronApplication; page: Page }>;
  /** Saves a picture of the window (or of `selector`) as NN-<name>.<theme>.png. */
  shot(name: string, selector?: string): Promise<string>;
  /** One line of what the journey checked, kept in run.json and printed. */
  note(text: string): void;
  /** Every request the fake AI recorded in the newest launch (purpose, prompt, matched line). */
  fakeTurns(): unknown[];
}

interface Shot {
  file: string;
  name: string;
  theme: string;
}

const usage =
  'usage: foo-verify <journey.ts> [--label before|after] [--app-dir DIR] [--out DIR] | --compare DIR | --markdown DIR --base-url URL';

function args(argv: string[]) {
  const flags: Record<string, string> = {};
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) flags[a.slice(2)] = argv[i + 1] && !argv[i + 1]!.startsWith('--') ? argv[++i]! : 'true';
    else rest.push(a);
  }
  return { flags, rest };
}

const git = (dir: string, ...a: string[]) => {
  try {
    return execFileSync('git', a, { cwd: dir, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
};

async function run(journeyPath: string, label: string, appDir: string, out: string): Promise<number> {
  const main = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8')).main as string;
  if (!existsSync(join(appDir, main))) {
    console.error(`foo-verify: ${join(appDir, main)} is missing. Run \`pnpm build\` in ${appDir} first.`);
    return 2;
  }
  const dir = join(out, label);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const shots: Shot[] = [];
  const notes: string[] = [];
  const consoleErrors: string[] = [];
  const apps: ElectronApplication[] = [];
  const scratch: string[] = [];
  let page: Page | null = null;
  let dataDir = '';

  const v: Verify = {
    async launch(o = {}) {
      const base = mkdtempSync(join(tmpdir(), 'foo-verify-'));
      scratch.push(base);
      dataDir = join(base, 'data');
      const env: Record<string, string> = {
        ...(process.env as Record<string, string>),
        FOO_TEST: '1',
        FOO_DATA_DIR: dataDir,
        FOO_LOCAL_DIR: join(base, 'local'),
        FOO_OUT_DIR: join(base, 'out'),
        ...o.env,
      };
      if (o.fakeAi) {
        const script = join(base, 'fake-ai.jsonl');
        writeFileSync(script, o.fakeAi.map((l) => JSON.stringify(l)).join('\n') + '\n');
        env.FOO_FAKE_AI = script;
      }
      const launchArgs = ['.', ...(o.args ?? [])];
      if (process.platform === 'linux') launchArgs.push('--no-sandbox');
      const app = await electron.launch({ args: launchArgs, cwd: appDir, colorScheme: null, env });
      apps.push(app);
      page = await app.firstWindow();
      page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
      page.on('pageerror', (e) => consoleErrors.push(String(e)));
      return { app, page };
    },
    async shot(name, selector) {
      if (!page) throw new Error('shot() before launch()');
      const theme = (await page.evaluate(() => document.documentElement.dataset.theme ?? 'unknown')) as string;
      const file = join(dir, `${String(shots.length + 1).padStart(2, '0')}-${name}.${theme}.png`);
      const opts = { path: file, animations: 'disabled', caret: 'hide', scale: 'css' } as const;
      if (selector) await page.locator(selector).first().screenshot(opts);
      else await page.screenshot(opts);
      shots.push({ file: relative(out, file), name, theme });
      return file;
    },
    note(text) {
      notes.push(text);
      console.log(`  ✓ ${text}`);
    },
    fakeTurns() {
      const file = join(dataDir, 'test', 'turns.jsonl');
      if (!existsSync(file)) return [];
      return readFileSync(file, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as unknown);
    },
  };

  const started = new Date().toISOString();
  let error: string | null = null;
  try {
    const mod = (await import(pathToFileURL(resolve(journeyPath)).href)) as { default: (v: Verify) => Promise<void> };
    await mod.default(v);
  } catch (e) {
    error = e instanceof Error ? (e.stack ?? e.message) : String(e);
    if (page) await (page as Page).screenshot({ path: join(dir, 'failure.png') }).catch(() => undefined);
  } finally {
    for (const app of apps) await app.close().catch(() => undefined);
    for (const s of scratch) rmSync(s, { recursive: true, force: true });
  }
  const result = {
    journey: relative(process.cwd(), resolve(journeyPath)),
    label,
    appDir: resolve(appDir),
    commit: git(appDir, 'rev-parse', 'HEAD'),
    dirty: git(appDir, 'status', '--porcelain') !== '',
    started,
    finished: new Date().toISOString(),
    platform: `${process.platform} ${process.arch}`,
    pass: error === null,
    error,
    notes,
    shots,
    consoleErrors,
  };
  writeFileSync(join(dir, 'run.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(`foo-verify ${result.pass ? 'PASS' : 'FAIL'} · ${label} · ${result.commit.slice(0, 7)}${result.dirty ? '+dirty' : ''}`);
  console.log(`  ${shots.length} shot(s), ${consoleErrors.length} console error(s) → ${dir}`);
  if (error) console.error(error);
  return result.pass ? 0 : 1;
}

/** before/ vs after/: one row per shot name and theme, with the share of pixels that changed. */
function compare(out: string): number {
  const read = (label: string) => {
    const f = join(out, label, 'run.json');
    return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as { commit: string; shots: Shot[]; pass: boolean }) : null;
  };
  const before = read('before');
  const after = read('after');
  if (!before || !after) {
    console.error(`foo-verify --compare: need ${join(out, 'before/run.json')} and ${join(out, 'after/run.json')}`);
    return 2;
  }
  const key = (s: Shot) => `${s.name}.${s.theme}`;
  const byKey = new Map(before.shots.map((s) => [key(s), s]));
  const rows = after.shots.map((a) => {
    const b = byKey.get(key(a));
    if (!b) return { name: key(a), before: null, after: a.file, changed: null as number | null };
    const r = diff(readPng(join(out, b.file)), readPng(join(out, a.file)));
    return { name: key(a), before: b.file, after: a.file, changed: r.sizeMismatch ? 1 : r.ratio };
  });
  const pct = (n: number | null) => (n === null ? 'new' : `${(n * 100).toFixed(2)} %`);
  const html = `<!doctype html><meta charset="utf-8"><title>foo-verify ${basename(out)}</title>
<style>body{font:14px system-ui;margin:16px}td{vertical-align:top;padding:4px}img{max-width:640px;border:1px solid #ccc}</style>
<h1>${basename(out)}</h1><p>before ${before.commit.slice(0, 7)} · after ${after.commit.slice(0, 7)}</p><table>
${rows
  .map(
    (r) =>
      `<tr><th colspan=2 align=left>${r.name} · changed ${pct(r.changed)}</th></tr><tr><td>${r.before ? `<img src="${r.before}">` : 'none'}</td><td><img src="${r.after}"></td></tr>`,
  )
  .join('\n')}</table>`;
  writeFileSync(join(out, 'compare.html'), html);
  writeFileSync(join(out, 'compare.json'), JSON.stringify({ before: before.commit, after: after.commit, rows }, null, 2) + '\n');
  console.log(`| shot | changed |\n| --- | --- |\n${rows.map((r) => `| ${r.name} | ${pct(r.changed)} |`).join('\n')}`);
  console.log(`→ ${join(out, 'compare.html')}`);
  return 0;
}

/** The PR body's proof block: verdict, commit, notes, console errors and the pictures (before | after when both ran). */
function markdown(out: string, baseUrl: string): number {
  const runs = ['before', 'after']
    .map((label) => join(out, label, 'run.json'))
    .filter((f) => existsSync(f))
    .map(
      (f) =>
        JSON.parse(readFileSync(f, 'utf8')) as {
          label: string;
          journey: string;
          commit: string;
          dirty: boolean;
          pass: boolean;
          notes: string[];
          shots: Shot[];
          consoleErrors: string[];
        },
    );
  const after = runs.find((r) => r.label === 'after');
  if (!after) {
    console.error(`foo-verify --markdown: no ${join(out, 'after/run.json')}`);
    return 2;
  }
  const before = runs.find((r) => r.label === 'before');
  const img = (s: Shot | undefined) => (s ? `![${s.name} ${s.theme}](${baseUrl}/${s.file})` : 'none');
  const lines = [
    `#### Proof · \`${after.journey}\``,
    `**${after.pass ? 'PASS' : 'FAIL'}** on \`${after.commit.slice(0, 7)}${after.dirty ? '+dirty' : ''}\` · ${after.consoleErrors.length} console error(s)` +
      (before ? ` · before: \`${before.commit.slice(0, 7)}\` ${before.pass ? 'PASS' : 'FAIL'}` : ''),
    '',
    ...after.notes.map((n) => `- ✓ ${n}`),
    ...after.consoleErrors.map((e) => `- ⚠ console: \`${e.replace(/`/g, "'")}\``),
    '',
    before ? '| shot | before | after |\n| --- | --- | --- |' : '| shot | after |\n| --- | --- |',
    ...after.shots.map((a) => {
      const b = before?.shots.find((s) => s.name === a.name && s.theme === a.theme);
      return before ? `| ${a.name} · ${a.theme} | ${img(b)} | ${img(a)} |` : `| ${a.name} · ${a.theme} | ${img(a)} |`;
    }),
  ];
  console.log(lines.join('\n'));
  return 0;
}

async function cli(): Promise<number> {
  const { flags, rest } = args(process.argv.slice(2));
  if (flags.compare) return compare(flags.compare);
  if (flags.markdown) return flags['base-url'] ? markdown(flags.markdown, flags['base-url']) : (console.error(usage), 2);
  const journey = rest[0];
  if (!journey || !existsSync(journey)) {
    console.error(usage);
    return 2;
  }
  const name = basename(journey).replace(/\.journey\.ts$|\.ts$/, '');
  const out = flags.out ?? join('qa-evidence', 'verify', name);
  return run(journey, flags.label ?? 'after', resolve(flags['app-dir'] ?? '.'), out);
}

cli().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
