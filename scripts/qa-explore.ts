// Spec: Vikas 2026-10-26 "autonomous exploratory, visual, functional and experience testing of the running product";
// 11-fidelity §11.2 (evidence beside every result). One command: builds foo, drives the real Electron app (crawler + one
// regression per defect, test/qa-explore), and writes an acceptance report a person can read: what was discovered, what
// was exercised, what passed, what is still broken (with screenshots and repro), and what was never tested. A defect is
// FIXED only when QA's own test for it passes on the real app; a control never exercised is NOT TESTED, never PASS.
// Usage: pnpm qa:explore [--no-build] [--out <dir>]   Exit: 0 all defect tests pass, 1 open defects, 2 could not run.
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DEFECTS } from '../test/qa-explore/catalogue';

const argv = process.argv.slice(2);
const opt = (k: string) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined);
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT = resolve(opt('--out') ?? join('qa-explore-report', stamp));
mkdirSync(join(OUT, 'shots'), { recursive: true });

const sha = (() => {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
})();

if (!argv.includes('--no-build')) {
  const b = spawnSync('pnpm', ['build'], { stdio: 'inherit', shell: process.platform === 'win32' });
  if (b.status !== 0) {
    console.error('BLOCKED: pnpm build failed, so the app under test would be stale.');
    process.exit(2);
  }
}

const cmd = process.platform === 'linux' && !process.env.DISPLAY ? 'xvfb-run' : 'npx';
const args = ['playwright', 'test', '-c', 'playwright.qa-explore.config.ts'];
const run = spawnSync(cmd, cmd === 'xvfb-run' ? ['-a', '-s', '-screen 0 1920x1080x24', 'npx', ...args] : args, {
  stdio: 'inherit',
  env: { ...process.env, QA_EXPLORE_DIR: OUT },
  shell: process.platform === 'win32',
});

interface PwSpec {
  title: string;
  tests: { results: { status: string; error?: { message?: string } }[] }[];
}
const specs: PwSpec[] = [];
try {
  const pw = JSON.parse(readFileSync(join(OUT, 'playwright.json'), 'utf8'));
  const walk = (s: { specs?: PwSpec[]; suites?: unknown[] }) => {
    specs.push(...(s.specs ?? []));
    for (const c of (s.suites ?? []) as { specs?: PwSpec[]; suites?: unknown[] }[]) walk(c);
  };
  for (const s of pw.suites ?? []) walk(s);
} catch {
  console.error('BLOCKED: no Playwright results; the app could not be driven.');
  process.exit(2);
}
const result = (prefix: string) => {
  const s = specs.find((x) => x.title.startsWith(prefix));
  const r = s?.tests[0]?.results.at(-1);
  if (!r) return { status: 'NOT TESTED', error: '' };
  return {
    status: r.status === 'passed' ? 'PASS' : r.status === 'skipped' ? 'NOT TESTED' : 'FAIL',
    error: (r.error?.message ?? '').replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), '').slice(0, 400),
  };
};

// Evidence screenshots kept next to the findings (shared project folder when present).
const SHOTS_SRC = process.env.QA_EXPLORE_SHOTS ?? '/mnt/project-files/foo/qa-explore/2026-10-26/shots';
for (const d of DEFECTS)
  if (d.shot && existsSync(join(SHOTS_SRC, d.shot))) copyFileSync(join(SHOTS_SRC, d.shot), join(OUT, 'shots', d.shot));

interface Entry {
  id: string;
  place: string;
  tid: string;
  role: string;
  name: string;
  action: string;
  skipReason?: string;
  effect: string[];
  issues: Record<string, unknown>[];
  shot?: string;
  status: string;
  hasAccessibleName: boolean;
  tooltip: string[];
}
let registry: Entry[] = [];
try {
  registry = JSON.parse(readFileSync(join(OUT, 'registry.json'), 'utf8'));
} catch {
  /* the crawler failed; the report says so below */
}

// Source-side inventory: every test id the code declares, against the ones seen on screen in batch 1.
const tidSrc = readFileSync('src/shared/testids.ts', 'utf8');
const declared = [...tidSrc.matchAll(/^\s+\w+: '([a-z0-9-]+)'/gm)].map((m) => m[1]!);
const seen = new Set(registry.map((e) => e.tid).filter(Boolean));

const defects = DEFECTS.map((d) => ({ ...d, ...(d.test ? result(d.test) : { status: 'OPEN (no automated check)', error: '' }) }));
const open = defects.filter((d) => d.status !== 'PASS');
const crawl = result('QA-X explore');
const count = (s: string) => registry.filter((e) => e.status === s).length;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const badge = (s: string) =>
  `<span class="b ${s.startsWith('PASS') || s === 'pass' ? 'ok' : s.startsWith('NOT') || s === 'not-tested' ? 'nt' : 'bad'}">${esc(s.toUpperCase())}</span>`;
const html = `<!doctype html><meta charset="utf-8"><title>foo QA acceptance</title>
<style>body{font:14px/1.45 system-ui,sans-serif;margin:24px;max-width:1200px;color:#111}h1{font-size:22px}h2{margin-top:32px;font-size:17px}
table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ddd;padding:6px;text-align:left;vertical-align:top}th{background:#f4f4f6}
.b{font-size:11px;font-weight:700;padding:2px 6px;border-radius:4px}.ok{background:#dcf5e3;color:#0b6b2c}.bad{background:#fde2e2;color:#a40e0e}.nt{background:#eee;color:#555}
.k{display:inline-block;margin-right:16px;padding:10px 14px;border:1px solid #ddd;border-radius:8px}.k b{font-size:20px;display:block}img{max-width:220px;border:1px solid #ddd}small{color:#666}</style>
<h1>foo batch-1 · product QA on the running app</h1>
<p>Commit <code>${sha}</code> · ${new Date().toISOString()} · ${process.platform} · fake AI (no real AI in this run) · crawl ${badge(crawl.status)}</p>
<div><span class="k"><b>${registry.length}</b>controls discovered</span><span class="k"><b>${count('pass')}</b>exercised, worked</span><span class="k"><b>${count('fail')}</b>exercised, failed</span><span class="k"><b>${count('not-tested')}</b>not tested</span><span class="k"><b>${open.length}/${defects.length}</b>defects open</span></div>
<h2>Defects (QA-owned regression per defect; FIXED only when it passes on the real app)</h2>
<table><tr><th>ID</th><th>Sev</th><th>Kind</th><th>What a user sees</th><th>Where</th><th>Status</th><th>Evidence</th></tr>
${defects.map((d) => `<tr><td>${d.id}</td><td>${d.sev}</td><td>${d.kind}</td><td>${esc(d.title)}${d.note ? `<br><small>${esc(d.note)}</small>` : ''}${d.error ? `<br><small>${esc(d.error)}</small>` : ''}</td><td>${esc(d.where)}</td><td>${badge(d.status)}<br><small>${d.test ?? ''}</small></td><td>${d.shot ? `<a href="shots/${d.shot}"><img src="shots/${d.shot}"></a>` : ''}</td></tr>`).join('\n')}
</table>
<h2>Feature registry (discovered on screen by the crawler)</h2>
<table><tr><th>Place</th><th>Control</th><th>Name / tooltip</th><th>What happened</th><th>Invariants</th><th>Status</th><th>Shot</th></tr>
${registry.map((e) => `<tr><td>${esc(e.place)}</td><td><code>${esc(e.tid || e.role)}</code>${e.hasAccessibleName ? '' : ' <span class="b bad">NO NAME</span>'}</td><td>${esc(e.name)}${e.tooltip.length ? `<br><small>tip: ${esc(e.tooltip.join(' / '))}</small>` : ''}</td><td>${esc(e.skipReason ?? e.effect.join('; '))}</td><td>${e.issues.length ? `<small>${esc(JSON.stringify(e.issues).slice(0, 300))}</small>` : '—'}</td><td>${badge(e.status)}</td><td>${e.shot ? `<a href="${e.shot}">shot</a>` : ''}</td></tr>`).join('\n')}
</table>
<h2>Code vs screen</h2><p>${declared.length} test ids declared in code; ${seen.size} seen on screen in batch 1. The rest belong to switched-off features or were not reached; they are listed in <code>unreached.txt</code>, never counted as tested.</p>
<h2>Not tested in this run</h2><ul><li>Windows (installer, tray, notifications, keychain): runs only on Windows CI.</li><li>Real AI: this run uses the fake AI; replies, streaming and tone need the real-AI workflow.</li><li>${count('not-tested')} controls skipped (reasons in the registry).</li></ul>`;
writeFileSync(join(OUT, 'report.html'), html);
writeFileSync(join(OUT, 'unreached.txt'), declared.filter((t) => !seen.has(t)).join('\n') + '\n');
writeFileSync(join(OUT, 'defects.json'), JSON.stringify(defects, null, 2));
console.log(
  `\nReport: ${join(OUT, 'report.html')}\nControls ${registry.length} (pass ${count('pass')}, fail ${count('fail')}, not tested ${count('not-tested')}). Defects open ${open.length}/${defects.length}.`,
);
process.exit(run.status === null || crawl.status === 'NOT TESTED' ? 2 : open.length ? 1 : 0);
