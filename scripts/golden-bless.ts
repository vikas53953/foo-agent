// Spec: 11-fidelity §11.2.4 (Tier B baselines golden/app/ID.{light,dark}.png + ID.json with commit, spec version and
// report id), §11.2.7 + FID-06 (golden directories change only through golden:bless, which needs a CR id or a signed
// fidelity report id). Runs the golden E2E tests with FOO_GOLDEN_BLESS=1 so toHaveScreenshot writes the baselines, then
// records provenance next to each PNG.
// Usage: tsx scripts/golden-bless.ts (--cr CR-nnnn | --report <reportId>) [--ids UX-08-01,BP-APP-L]
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { setSha256 } from './spec-verify';

export const CR_ID = /^CR-\d{4}$/;
const GOLDEN_APP = join('golden', 'app');

/** The CR file for an id: docs/cr/CR-nnnn.md or docs/cr/CR-nnnn-<slug>.md. */
export function crFile(id: string, dir = join('docs', 'cr')): string | null {
  if (!CR_ID.test(id) || !existsSync(dir)) return null;
  const f = readdirSync(dir).find((n) => n === `${id}.md` || (n.startsWith(`${id}-`) && n.endsWith('.md')));
  return f ? join(dir, f) : null;
}

/** A fidelity report with this id whose reviewer signed it (qa-evidence/M{n}/fidelity.json). */
export function signedReport(id: string, root = 'qa-evidence'): string | null {
  if (!existsSync(root)) return null;
  for (const m of readdirSync(root)) {
    const f = join(root, m, 'fidelity.json');
    if (!existsSync(f)) continue;
    const r = JSON.parse(readFileSync(f, 'utf8')) as { reportId?: string; reviewer?: { signed?: boolean } };
    if (r.reportId === id && r.reviewer?.signed === true) return f;
  }
  return null;
}

export function authorise(args: { cr?: string; report?: string }): { kind: 'cr' | 'report'; id: string; file: string } {
  if (args.cr && args.report) throw new Error('give --cr or --report, not both');
  if (args.cr) {
    const file = crFile(args.cr);
    if (!file) throw new Error(`FID-06: ${args.cr} is not a CR file in docs/cr/ (expected CR-nnnn)`);
    return { kind: 'cr', id: args.cr, file };
  }
  if (args.report) {
    const file = signedReport(args.report);
    if (!file) throw new Error(`FID-06: no signed fidelity report with id ${args.report} in qa-evidence/`);
    return { kind: 'report', id: args.report, file };
  }
  throw new Error('FID-06: golden-bless needs --cr CR-nnnn or --report <signed fidelity report id>');
}

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const sha = (f: string) => createHash('sha256').update(readFileSync(f)).digest('hex');

function main() {
  const { values } = parseArgs({ options: { cr: { type: 'string' }, report: { type: 'string' }, ids: { type: 'string' } } });
  const auth = authorise(values);
  const ids =
    values.ids
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean) ?? [];
  if (ids.some((id) => !/^(UX-\d{2}-\d{2}|BP-[A-Z0-9-]+)$/.test(id))) throw new Error(`bad id in --ids: ${values.ids}`);
  const grep = ids.length ? `(${ids.join('|')})` : '(UX-\\d{2}-\\d{2}|BP-[A-Z0-9-]+)';
  console.log(`blessing ${ids.length ? ids.join(', ') : 'every golden test'} under ${auth.id}`);
  const run = spawnSync(
    process.execPath,
    [join('node_modules', '@playwright', 'test', 'cli.js'), 'test', '--grep', grep, '--pass-with-no-tests'],
    {
      stdio: 'inherit',
      env: { ...process.env, FOO_GOLDEN_BLESS: '1', FOO_GOLDEN_BLESS_BY: auth.id },
    },
  );
  if (run.status !== 0) process.exit(run.status ?? 1);

  const changed = git('status', '--porcelain', '--untracked-files=all', '--', GOLDEN_APP)
    .split('\n')
    .map((l) => l.slice(3).trim())
    .filter((p) => p.endsWith('.png'));
  if (!changed.length) {
    console.log('nothing to bless: no golden/app baseline was written or changed');
    return;
  }
  const manifest = JSON.parse(readFileSync(join('spec', 'SPEC-MANIFEST.json'), 'utf8')) as { version: string };
  const byId = new Map<string, string[]>();
  for (const p of changed) {
    const id = p
      .split('/')
      .pop()!
      .replace(/\.(light|dark)\.png$/, '');
    byId.set(id, [...(byId.get(id) ?? []), p]);
  }
  for (const [id] of byId) {
    const files = Object.fromEntries(
      (['light', 'dark'] as const)
        .map((th) => [th, join(GOLDEN_APP, `${id}.${th}.png`)] as const)
        .filter(([, f]) => existsSync(f))
        .map(([th, f]) => [th, { png: f.split(/[\\/]/).pop(), sha256: sha(f) }]),
    );
    const record = {
      id,
      files,
      commit: git('rev-parse', 'HEAD'),
      spec: { version: manifest.version, setSha256: setSha256() },
      blessedBy: { kind: auth.kind, id: auth.id, file: auth.file.split('\\').join('/') },
      blessedAt: new Date().toISOString(),
      runner: process.env.ImageOS ? `${process.env.ImageOS}/${process.env.ImageVersion ?? ''}` : process.platform,
    };
    writeFileSync(join(GOLDEN_APP, `${id}.json`), JSON.stringify(record, null, 2) + '\n');
  }
  console.log(`blessed ${byId.size} step(s): ${[...byId.keys()].join(', ')}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
