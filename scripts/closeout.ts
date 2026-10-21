// Spec: 11-fidelity §11.5.3 FID-18 (trace rows go live with their test), §11.2.7 (Tier R disputes), docs/build-method.md
// §1a (close-out is one command, Vikas 2026-10-19). Runs the mechanical steps of a milestone close-out and prints what is
// left to fix. It never edits spec/, golden/ or CRs, never pushes and never merges.
// Usage: tsx scripts/closeout.ts <M> [--write] [--skip-checks]
//   --write        flip `,<M>,pending` trace rows to `live` where the named test file exists and carries the id
//   --skip-checks  skip the pre-push check chain (quick report only)
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const milestone = args.find((a) => /^M\d+$/.test(a));
if (!milestone) {
  console.error('usage: tsx scripts/closeout.ts <M> [--write] [--skip-checks]');
  process.exit(2);
}
const write = args.includes('--write');
const skipChecks = args.includes('--skip-checks');

type Finding = { step: string; ok: boolean; detail: string };
const findings: Finding[] = [];
const note = (step: string, ok: boolean, detail: string): void => {
  findings.push({ step, ok, detail });
};

// 1. Golden lane names this milestone.
const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
const ms = /FIDELITY_MILESTONE: (M\d+)/.exec(ci)?.[1];
const refs = /FIDELITY_REFS: ([\w,]+)/.exec(ci)?.[1] ?? '';
note('1 golden lane', ms === milestone && refs.split(',').includes(milestone), `FIDELITY_MILESTONE=${ms ?? '?'} FIDELITY_REFS=${refs}`);

// 2. Trace rows: flip pending → live where the test exists and names the id.
const tracePath = 'spec/trace.csv';
const lines = readFileSync(tracePath, 'utf8').split('\n');
const stillPending: string[] = [];
let flipped = 0;
const out = lines.map((line) => {
  const m = new RegExp(`^(.*),([^,]+),${milestone},pending$`).exec(line);
  if (!m) return line;
  const [, head = '', file = ''] = m;
  const ids = head
    .split(',')
    .filter((c) => /^(AT|ART|PERF|UX|BP)-/.test(c.trim()))
    .map((c) => c.trim().split(' ')[0] ?? '');
  const body = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (ids.length > 0 && ids.every((id) => body.includes(id))) {
    flipped += 1;
    return `${head},${file},${milestone},live`;
  }
  stillPending.push(`${ids.join(' ') || '(no id)'} → ${file}${existsSync(file) ? '' : ' (missing file)'}`);
  return line;
});
if (write && flipped > 0) writeFileSync(tracePath, out.join('\n'));
note(
  '2 trace rows',
  stillPending.length === 0,
  `${flipped} ready to go live${write ? ' (written)' : ' (run with --write)'}; ${stillPending.length} still pending` +
    (stillPending.length ? `:\n      ${stillPending.slice(0, 40).join('\n      ')}` : ''),
);

// 3. Close-out docs.
note('5 audit', existsSync(`docs/fidelity/${milestone}.audit.json`), `docs/fidelity/${milestone}.audit.json`);
const notes = readFileSync('implementation-notes.md', 'utf8');
note('5 notes', notes.includes(`## ${milestone} · close-out`), `implementation-notes.md "## ${milestone} · close-out"`);
const added = execSync('git diff --name-only --diff-filter=A origin/main...HEAD -- src scripts', { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);
const map = readFileSync('PROJECT-MAP.md', 'utf8');
const unmapped = added.filter((f) => !map.includes(f.split('/').pop() ?? f));
note(
  '5 project map',
  unmapped.length === 0,
  `${added.length} new files, ${unmapped.length} without a row` + (unmapped.length ? `: ${unmapped.join(', ')}` : ''),
);

// 6. Pre-push chain (stops at the first failure so the output stays short).
if (!skipChecks) {
  const chain = [
    'spec:verify',
    'check:copy',
    'lint',
    'format:check',
    'typecheck',
    'test',
    'build',
    'trace:check',
    'spec:coverage',
    'fid:guard --base origin/main',
  ];
  for (const cmd of chain) {
    const r = spawnSync('pnpm', ['-s', ...cmd.split(' ')], { encoding: 'utf8', shell: false });
    const ok = r.status === 0;
    const tail = `${r.stdout}${r.stderr}`.trim().split('\n').slice(-15).join('\n      ');
    note(`6 ${cmd}`, ok, ok ? 'pass' : tail);
    if (!ok) break;
  }
}

for (const f of findings) console.log(`${f.ok ? 'PASS' : 'TODO'}  ${f.step}: ${f.detail}`);
console.log(`
Left by hand (recipe /mnt/project-files/handoff/closeout-recipe.md):
  4  xvfb-run -a pnpm exec playwright test test/fidelity; pnpm golden:render --milestone ${refs}; Tier R fails → CR dispute or code fix
  7  milestone PR into main, non-draft: full Windows suite + golden lane; merge commit when green
  9  compare page from the evidence branch + installer link (foo-windows-app artifact of the final run)`);
process.exit(findings.every((f) => f.ok) ? 0 : 1);
