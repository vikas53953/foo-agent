// Spec: project testing rule §4–10 (Vikas 2026-10-21), his QA ask of 2026-10-25 (one command, real evidence, PASS / REVISE /
// BLOCKED, only the batch-1 app and its 5 features), CR-0054 (batch 1). Runs the scenarios in test/qa/scenarios.ts, maps
// every result back to its scenario id, and writes one folder: results.json, report.md, dashboard.html, evidence/ (what each
// QA test sent and found, shots) and pw/ (Playwright traces of failures). A scenario counts only from a test runner's own
// result; nothing is marked passed from a claim, an AI's words or an older run of this command.
//
// Usage: pnpm qa [--tier fast|e2e|full] [--out <dir>] [--no-build] [--no-fetch] [--judge <promptfoo results.json>]
//   fast  vitest scenarios (seconds; no window)
//   e2e   + Playwright scenarios on the built app (default; xvfb on Linux)
//   full  + the real-AI B1-batch1 runs from the evidence branch (every merge to main runs them) and the judge file if given
// Exit code: 0 PASS, 1 REVISE (a scenario failed), 2 BLOCKED (a scenario could not run or its test is missing).
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { SCENARIOS, type Scenario } from '../test/qa/scenarios';

type Tier = 'fast' | 'e2e' | 'full';
type Status = 'pass' | 'fail' | 'missing' | 'not-run';
export interface Result {
  id: string;
  status: Status;
  ms?: number;
  error?: string;
  /** How to run this one scenario again. */
  repro?: string;
  evidence?: string;
  runs?: { sha: string; at: string; ok: boolean; failedSteps: string[] }[];
}

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const tier = (opt('--tier') ?? 'e2e') as Tier;
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = opt('--out') ?? join('qa-report', stamp);
const evDir = join(out, 'evidence');
mkdirSync(evDir, { recursive: true });

const inTier = (s: Scenario) =>
  s.layer === 'vitest' ||
  (s.layer === 'playwright' && tier !== 'fast') ||
  ((s.layer === 'real-ai' || s.layer === 'judge') && tier === 'full');
const files = (layer: Scenario['layer']) => [...new Set(SCENARIOS.filter((s) => s.layer === layer && inTier(s)).map((s) => s.file))];
const sh = (cmd: string, a: string[], env: Record<string, string> = {}) => {
  console.log(`\n$ ${cmd} ${a.join(' ')}`);
  return spawnSync(cmd, a, {
    stdio: 'inherit',
    env: { ...process.env, QA_EVIDENCE_DIR: evDir, ...env },
    shell: process.platform === 'win32',
  });
};
const esc = (s: string) => s.replace(/"/g, '\\"');

// ---- 1. vitest ----
type VitestJson = {
  testResults: {
    name: string;
    assertionResults: { fullName: string; title: string; status: string; duration?: number; failureMessages: string[] }[];
  }[];
};
const vitestOut = join(out, 'vitest.json');
const vFiles = files('vitest');
if (vFiles.length) sh('npx', ['vitest', 'run', ...vFiles, '--reporter=default', '--reporter=json', `--outputFile=${vitestOut}`]);

// ---- 2. Playwright ----
interface PwTest {
  title: string;
  results: { status: string; duration: number; error?: { message?: string }; attachments?: { name: string; path?: string }[] }[];
}
interface PwSuite {
  title: string;
  file?: string;
  specs?: { title: string; file: string; tests: PwTest[] }[];
  suites?: PwSuite[];
}
const pwOut = join(out, 'playwright.json');
const pFiles = files('playwright');
let pwRan = false;
if (pFiles.length) {
  if (!flag('--no-build')) sh('pnpm', ['build']);
  const headless = process.platform === 'linux' && !process.env.DISPLAY;
  const [cmd, pre] = headless ? ['xvfb-run', ['-a', 'npx']] : ['npx', [] as string[]];
  const r = sh(
    cmd,
    [...pre, 'playwright', 'test', ...pFiles, '--reporter=list,json', '--trace=retain-on-failure', `--output=${join(out, 'pw')}`],
    {
      PLAYWRIGHT_JSON_OUTPUT_NAME: pwOut,
    },
  );
  pwRan = r.status !== null;
}

// ---- 3. real AI: the B1-batch1 journey of every main run, from the evidence branch ----
interface RealRun {
  sha: string;
  at: string;
  ok: boolean;
  failedSteps: string[];
  intakeMs: number[];
}
function realRuns(journey: string): RealRun[] | null {
  const git = (a: string[]) => spawnSync('git', a, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (!flag('--no-fetch')) git(['fetch', '-q', 'origin', 'evidence:refs/remotes/origin/evidence']);
  const ls = git(['ls-tree', '-r', '--name-only', 'origin/evidence', 'real-ai/']);
  if (ls.status !== 0) return null;
  const summaries = ls.stdout.split('\n').filter((p) => new RegExp(`^real-ai/[0-9a-f]{7}-claude/.*-${journey}/summary\\.json$`).test(p));
  return summaries
    .map((p) => {
      const s = JSON.parse(git(['show', `origin/evidence:${p}`]).stdout) as {
        failed: number;
        results: { i: number; ok: boolean; expect?: string; do: string }[];
      };
      const turns = git(['show', `origin/evidence:${p.replace('summary.json', 'ai-turns.jsonl')}`]).stdout;
      const intakeMs = turns
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as { purpose: string; duration_ms: number })
        .filter((x) => x.purpose === 'intake')
        .map((x) => x.duration_ms);
      return {
        sha: p.split('/')[1]!.slice(0, 7),
        at: p.split('/')[3]!.slice(0, 24),
        ok: s.failed === 0,
        failedSteps: s.results.filter((x) => !x.ok).map((x) => `step ${x.i} ${x.do}: ${x.expect ?? ''}`),
        intakeMs,
      };
    })
    .sort((a, b) => a.at.localeCompare(b.at));
}

// ---- 4. map every scenario to its runner's own result ----
const vJson = existsSync(vitestOut) ? (JSON.parse(readFileSync(vitestOut, 'utf8')) as VitestJson) : null;
const pJson = existsSync(pwOut) ? (JSON.parse(readFileSync(pwOut, 'utf8')) as { suites: PwSuite[] }) : null;
const pwSpecs: { file: string; title: string; t: PwTest }[] = [];
const walk = (s: PwSuite) => {
  for (const sp of s.specs ?? []) for (const t of sp.tests) pwSpecs.push({ file: sp.file, title: sp.title, t });
  for (const c of s.suites ?? []) walk(c);
};
for (const s of pJson?.suites ?? []) walk(s);

const evidenceFor = (id: string, s: Scenario) => {
  const own = /QA-B1-[A-Z]\d\d/.exec(s.test ?? '')?.[0];
  return [id, own]
    .filter(Boolean)
    .map((x) => join(evDir, `${x}.json`))
    .find((f) => existsSync(f));
};
// ---- 5. judge scores (kept apart from pass/fail) ----
interface JudgeRow {
  ask: string;
  runs: number;
  /** Every deterministic check (regex, contains) passed in every run. */
  checksPass: boolean;
  /** The AI judge's mean score per metric (0..1), kept apart from pass/fail. */
  scores: Record<string, number>;
}
let judge: JudgeRow[] | null = null;
// Without --judge, the full tier reads the newest results qa-ai-judge.yml pushed to the evidence branch.
let judgeFile = opt('--judge');
if (!judgeFile && tier === 'full') {
  const g = spawnSync('git', ['show', 'origin/evidence:qa-judge/latest/results.json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (g.status === 0) writeFileSync((judgeFile = join(out, 'judge-results.json')), g.stdout);
}
if (judgeFile && existsSync(judgeFile)) {
  type Comp = { pass: boolean; score?: number; assertion?: { type?: string; metric?: string } };
  type Row = { testCase?: { description?: string }; failureReason?: number; gradingResult?: { componentResults?: Comp[] } };
  const rows = (JSON.parse(readFileSync(judgeFile, 'utf8')) as { results: { results: Row[] } }).results.results;
  const asks = new Map<string, Row[]>();
  for (const r of rows) asks.set(r.testCase?.description ?? '?', [...(asks.get(r.testCase?.description ?? '?') ?? []), r]);
  judge = [...asks].map(([ask, rs]) => {
    const comps = rs.flatMap((r) => r.gradingResult?.componentResults ?? []);
    const det = comps.filter((c) => c.assertion?.type !== 'llm-rubric');
    const sc: Record<string, number[]> = {};
    for (const c of comps.filter((x) => x.assertion?.type === 'llm-rubric'))
      (sc[c.assertion?.metric ?? 'judge'] ??= []).push(c.score ?? (c.pass ? 1 : 0));
    return {
      ask,
      runs: rs.length,
      checksPass: rs.every((r) => r.failureReason !== 2) && det.every((c) => c.pass),
      scores: Object.fromEntries(
        Object.entries(sc).map(([k, v]) => [k, Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100]),
      ),
    };
  });
}

let real: RealRun[] | null = null;
const results: Result[] = SCENARIOS.map((s): Result => {
  if (!inTier(s)) return { id: s.id, status: 'not-run', error: `not in tier ${tier}` };
  if (s.layer === 'vitest') {
    const file = vJson?.testResults.find((f) => relative(process.cwd(), f.name).replace(/\\/g, '/') === s.file);
    const a = file?.assertionResults.find((x) => x.fullName === s.test || x.title === s.test);
    const repro = `npx vitest run ${s.file} -t "${esc(a?.title ?? s.test ?? '')}"`;
    if (!vJson) return { id: s.id, status: 'missing', error: 'vitest wrote no results', repro };
    if (!a) return { id: s.id, status: 'missing', error: 'no test with this title ran', repro };
    const r: Result = { id: s.id, status: a.status === 'passed' ? 'pass' : a.status === 'failed' ? 'fail' : 'missing', repro };
    if (a.duration !== undefined) r.ms = Math.round(a.duration);
    if (a.failureMessages.length) r.error = a.failureMessages.join('\n').slice(0, 1500);
    const ev = evidenceFor(s.id, s);
    if (ev) r.evidence = relative(out, ev);
    return r;
  }
  if (s.layer === 'playwright') {
    const hit = pwSpecs.find((x) => s.file.endsWith(x.file) && x.title === s.test);
    const repro = `${process.platform === 'linux' ? 'xvfb-run -a ' : ''}npx playwright test ${s.file} -g "${esc(s.test ?? '')}"`;
    if (!pwRan || !pJson) return { id: s.id, status: 'missing', error: 'Playwright did not run', repro };
    if (!hit) return { id: s.id, status: 'missing', error: 'no test with this title ran', repro };
    const last = hit.t.results.at(-1)!;
    const r: Result = {
      id: s.id,
      status: last.status === 'passed' ? 'pass' : last.status === 'skipped' ? 'missing' : 'fail',
      ms: last.duration,
      repro,
    };
    if (last.error?.message) r.error = last.error.message.slice(0, 1500);
    const trace = last.attachments?.find((x) => x.name === 'trace')?.path;
    if (trace) r.evidence = relative(out, trace);
    const ev = evidenceFor(s.id, s);
    if (ev) r.evidence = relative(out, ev);
    return r;
  }
  if (s.layer === 'real-ai') {
    real ??= realRuns(s.file);
    if (!real) return { id: s.id, status: 'missing', error: 'evidence branch not readable (git fetch origin evidence)' };
    const lastN = real.slice(-(s.repeat ?? 1));
    if (lastN.length < (s.repeat ?? 1)) return { id: s.id, status: 'missing', error: `only ${lastN.length} runs`, runs: lastN };
    const bad = lastN.filter((x) => !x.ok);
    return {
      id: s.id,
      status: bad.length ? 'fail' : 'pass',
      ...(bad.length
        ? {
            error: `${lastN.length - bad.length} of the last ${lastN.length} runs passed; ${bad.map((x) => `${x.sha}: ${x.failedSteps.join('; ')}`).join(' / ')}`,
          }
        : {}),
      runs: lastN.map(({ sha, at, ok, failedSteps }) => ({ sha, at, ok, failedSteps })),
      repro: 'merge to main (real-ai-e2e.yml runs B1-batch1 on Windows with the packaged app)',
    };
  }
  if (s.layer === 'judge') {
    const repro = 'qa-ai-judge.yml (real Claude on the key), then: pnpm qa --tier full --judge <results.json>';
    if (!judge) return { id: s.id, status: 'missing', error: 'no judge results given (--judge)', repro };
    const bad = judge.filter((j) => !j.checksPass || j.runs < (s.repeat ?? 1));
    return {
      id: s.id,
      status: bad.length ? 'fail' : 'pass',
      repro,
      ...(bad.length ? { error: `checks failed: ${bad.map((j) => j.ask).join(', ')}` } : {}),
    };
  }
  return { id: s.id, status: 'not-run', error: `${s.layer}: proved outside pnpm qa (see docs/testing/qa.md)` };
});

// ---- 6. verdict, report, dashboard ----
const ran = results.filter((r) => r.status !== 'not-run');
const n = (st: Status) => ran.filter((r) => r.status === st).length;
const verdict = n('missing') ? 'BLOCKED' : n('fail') ? 'REVISE' : 'PASS';
const byId = new Map(SCENARIOS.map((s) => [s.id, s]));
const pct = (xs: number[], p: number) =>
  xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))]! : null;
const realAll = (real as RealRun[] | null) ?? [];
const latency = {
  realAiIntakeMs: {
    p50: pct(
      realAll.flatMap((r) => r.intakeMs),
      50,
    ),
    p95: pct(
      realAll.flatMap((r) => r.intakeMs),
      95,
    ),
    turns: realAll.flatMap((r) => r.intakeMs).length,
  },
  realAiRuns: realAll.map(({ sha, at, ok }) => ({ sha, at, ok })),
};
const head = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
const summary = {
  verdict,
  tier,
  commit: head,
  at: new Date().toISOString(),
  counts: {
    scenarios: SCENARIOS.length,
    ran: ran.length,
    pass: n('pass'),
    fail: n('fail'),
    missing: n('missing'),
    notRun: results.length - ran.length,
  },
  byFeature: Object.fromEntries(
    [...new Set(SCENARIOS.map((s) => s.feature))].map((f) => {
      const rs = ran.filter((r) => byId.get(r.id)!.feature === f);
      return [f, { pass: rs.filter((r) => r.status === 'pass').length, of: rs.length }];
    }),
  ),
  security: {
    pass: ran.filter((r) => byId.get(r.id)!.kind === 'security' && r.status === 'pass').length,
    of: ran.filter((r) => byId.get(r.id)!.kind === 'security').length,
  },
  latency,
  judge: judge ? { asks: judge.length, checksPass: judge.filter((j) => j.checksPass).length, rows: judge } : 'not run',
  cost: 'pretend-AI tiers cost nothing; real-AI runs are billed to the ANTHROPIC_API_KEY on each main merge (the evidence does not record tokens)',
};
writeFileSync(join(out, 'results.json'), JSON.stringify({ summary, scenarios: SCENARIOS, results }, null, 2));

const row = (r: Result) => {
  const s = byId.get(r.id)!;
  return `| ${r.id} | ${s.feature} | ${s.kind} | ${s.layer} | ${r.status.toUpperCase()} | ${s.title} | ${r.error ? r.error.split('\n')[0]!.slice(0, 120).replace(/\|/g, '/') : ''} |`;
};
const md = [
  `# foo batch-1 QA: ${verdict}`,
  '',
  `Tier \`${tier}\` on \`${head}\`, ${summary.at}. ${n('pass')} pass, ${n('fail')} fail, ${n('missing')} could not run, ${summary.counts.notRun} not in this tier (of ${SCENARIOS.length}).`,
  '',
  'Pass/fail comes only from the test runners (vitest, Playwright JSON) and the real-AI journey summaries. AI-judge scores are listed apart and never change the verdict.',
  '',
  '## Failures and blocks (each with its repro)',
  '',
  ...ran
    .filter((r) => r.status !== 'pass')
    .map(
      (r) =>
        `- **${r.id}** ${r.status}: ${byId.get(r.id)!.title}\n  - repro: \`${r.repro ?? '-'}\`\n  - ${String(r.error ?? '').split('\n')[0]}`,
    ),
  '',
  '## Real AI (B1-batch1, packaged app, Windows, every merge to main)',
  '',
  ...realAll.map((r) => `- ${r.at} \`${r.sha}\` ${r.ok ? 'pass' : `FAIL (${r.failedSteps.join('; ')})`}`),
  realAll.length
    ? `\nIntake latency over ${latency.realAiIntakeMs.turns} real turns: p50 ${latency.realAiIntakeMs.p50} ms, p95 ${latency.realAiIntakeMs.p95} ms.`
    : '(not in this tier)',
  '',
  '## AI judge (scores apart; they never change the verdict)',
  '',
  ...(judge
    ? judge.map((j) => `- ${j.ask}: checks ${j.checksPass ? 'pass' : 'FAIL'} over ${j.runs} runs; judge ${JSON.stringify(j.scores)}`)
    : ['(not run)']),
  '',
  '## Every scenario',
  '',
  '| id | feature | kind | layer | result | scenario | first error line |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  ...results.map(row),
].join('\n');
writeFileSync(join(out, 'report.md'), md);

const shots = existsSync(join(evDir, 'shots')) ? readdirSync(join(evDir, 'shots')).filter((f) => f.endsWith('.png')) : [];
for (const f of shots) copyFileSync(join(evDir, 'shots', f), join(out, f));
writeFileSync(join(out, 'dashboard.html'), dashboard(summary, results, shots));
console.log(
  `\nQA ${verdict}: ${n('pass')} pass, ${n('fail')} fail, ${n('missing')} blocked, ${summary.counts.notRun} not in tier ${tier}. Report: ${join(out, 'report.md')}`,
);
process.exit(verdict === 'PASS' ? 0 : verdict === 'REVISE' ? 1 : 2);

function dashboard(sum: typeof summary, rs: Result[], pics: string[]): string {
  const h = (s: unknown) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const color = { PASS: '#1a7f37', REVISE: '#9a6700', BLOCKED: '#cf222e' }[sum.verdict];
  const feat = Object.entries(sum.byFeature)
    .map(([f, v]) => `<div class="tile"><b>${v.pass}/${v.of}</b><span>${h(f)}</span></div>`)
    .join('');
  const rows = rs
    .map((r) => {
      const s = byId.get(r.id)!;
      return `<tr class="${r.status}"><td>${r.id}</td><td>${h(s.feature)}</td><td>${h(s.kind)}</td><td>${h(s.layer)}</td><td>${r.status}</td><td>${h(s.title)}</td><td>${r.ms ?? ''}</td><td>${r.evidence ? `<a href="${h(r.evidence)}">evidence</a>` : ''}</td><td><code>${h(r.repro ?? '')}</code>${r.error ? `<pre>${h(r.error.slice(0, 600))}</pre>` : ''}</td></tr>`;
    })
    .join('');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>foo batch-1 QA</title>
<style>body{font:14px system-ui;margin:16px;background:#fff;color:#1f2328}h1{color:${color}}.tiles{display:flex;gap:8px;flex-wrap:wrap}.tile{border:1px solid #d0d7de;border-radius:8px;padding:8px 12px}.tile b{display:block;font-size:20px}
table{border-collapse:collapse;width:100%;margin-top:12px}td,th{border-bottom:1px solid #d0d7de;padding:4px 6px;text-align:left;vertical-align:top}tr.fail td,tr.missing td{background:#fff1f0}tr.not-run td{color:#6e7781}pre{white-space:pre-wrap;margin:4px 0;font-size:12px}
.shots{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px}.shots img{width:100%;border:1px solid #d0d7de}@media(prefers-color-scheme:dark){body{background:#0d1117;color:#e6edf3}tr.fail td,tr.missing td{background:#3b1d1d}}</style>
<h1>foo batch-1 QA: ${sum.verdict}</h1><p>Tier <b>${sum.tier}</b> on <code>${h(sum.commit)}</code>, ${h(sum.at)}. Pass/fail from test runners only; AI-judge scores apart.</p>
<div class="tiles"><div class="tile"><b>${sum.counts.pass}/${sum.counts.ran}</b><span>scenarios pass</span></div><div class="tile"><b>${sum.counts.fail}</b><span>fail</span></div><div class="tile"><b>${sum.counts.missing}</b><span>blocked</span></div><div class="tile"><b>${sum.security.pass}/${sum.security.of}</b><span>security</span></div>
<div class="tile"><b>${sum.latency.realAiIntakeMs.p50 ?? '-'} / ${sum.latency.realAiIntakeMs.p95 ?? '-'} ms</b><span>real-AI reply p50 / p95</span></div><div class="tile"><b>${typeof sum.judge === 'string' ? 'not run' : `${sum.judge.checksPass}/${sum.judge.asks}`}</b><span>real-AI asks, checks pass (judge scores apart)</span></div></div>
<h2>By feature</h2><div class="tiles">${feat}</div>
<h2>Real-AI runs (B1-batch1)</h2><ul>${sum.latency.realAiRuns.map((r) => `<li>${h(r.at)} <code>${h(r.sha)}</code> ${r.ok ? 'pass' : '<b>FAIL</b>'}</li>`).join('') || '<li>not in this tier</li>'}</ul>
<h2>Scenarios</h2><table><tr><th>id</th><th>feature</th><th>kind</th><th>layer</th><th>result</th><th>scenario</th><th>ms</th><th>evidence</th><th>repro / error</th></tr>${rows}</table>
<h2>Screens</h2><div class="shots">${pics.map((p) => `<figure><img src="${h(p)}" alt="${h(p)}"><figcaption>${h(p)}</figcaption></figure>`).join('')}</div>
<p>${h(sum.cost)}</p></html>`;
}
