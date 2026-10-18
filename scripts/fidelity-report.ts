// Spec: 11-fidelity §11.6.2 (fidelity report: qa-evidence/M{n}/fidelity.html, self-contained, light and dark, plus
// fidelity.json; sections 1–9 with the "For Vikas" box at the top), §11.6.1 (fresh evidence only: commit and CI run id
// printed; anything without evidence is UNVERIFIABLE), FID-04 (runner identity in every report).
// Inputs (each optional; a missing one is named in the report): Vitest JSON, Playwright JSON, golden/ref (+ determinism),
// golden/runner.json, Tier R results, FID-14 results, ESLint JSON, docs/fidelity/M{n}.audit.json, spec/trace.csv.
// Usage: tsx scripts/fidelity-report.ts [--milestone M1] [--out qa-evidence/M1] [--vitest golden/out/results/vitest.json]
//        [--e2e test-results/e2e.json] [--refs golden/ref] [--tier-r golden/out/tier-r] [--runner golden/runner.json]
//        [--fid14 test-results] [--eslint golden/out/results/eslint.json]
// --fid14 takes one FID-14 JSON file or a folder, whose fid-14*.json files (one per E2E that measures spec values: M0's
// window rows, M1's shell rows, M2's message and composer rows) are merged in name order.
// (Vitest and ESLint JSON live outside test-results/, which Playwright empties when the E2E run starts.)
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { readManifest } from './golden-manifest';
import { setSha256 } from './spec-verify';
import { readTrace } from './trace-check';

export type Status = 'DONE' | 'PARTIAL' | 'NOT DONE' | 'CHANGED' | 'UNVERIFIABLE';
export type TestStatus = 'passed' | 'failed' | 'skipped';
export interface TestCase {
  suite: 'unit' | 'e2e';
  file: string;
  title: string;
  status: TestStatus;
}

const readJson = <T>(file: string | undefined): T | null =>
  file && existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : null;

type Fid14Row = { id: string; ok: boolean; expected: string; measured: string; note?: string };
/** FID-14 results from one file, or merged from every fid-14*.json in a folder; null when there are none. */
export function readFid14(path: string | undefined): Fid14Row[] | null {
  if (!path || !existsSync(path)) return null;
  if (!statSync(path).isDirectory()) return readJson<Fid14Row[]>(path);
  const files = readdirSync(path)
    .filter((n) => /^fid-14.*\.json$/.test(n))
    .sort();
  return files.length ? files.flatMap((n) => readJson<Fid14Row[]>(join(path, n)) ?? []) : null;
}

// ---------- inputs ----------
interface VitestJson {
  testResults: { name: string; assertionResults: { fullName: string; status: string }[] }[];
}
export function vitestCases(j: VitestJson | null, root = process.cwd()): TestCase[] {
  if (!j) return [];
  return j.testResults.flatMap((f) =>
    f.assertionResults.map((a) => ({
      suite: 'unit' as const,
      file: f.name
        .replace(root, '')
        .replace(/^[\\/]/, '')
        .split('\\')
        .join('/'),
      title: a.fullName,
      status: (a.status === 'passed' ? 'passed' : a.status === 'failed' ? 'failed' : 'skipped') as TestStatus,
    })),
  );
}

interface PwSuite {
  title: string;
  file?: string;
  specs?: { title: string; file?: string; tests: { status: string }[] }[];
  suites?: PwSuite[];
}
/** Playwright names files from its testDir (`test`): `e2e/…`, `fidelity/bp/…`, `fidelity/ux/…`; older runs from `test/e2e`. */
const e2eFile = (f: string) => (/^(e2e|fidelity)\//.test(f) ? `test/${f}` : `test/e2e/${f}`);

export function playwrightCases(j: { suites: PwSuite[] } | null): TestCase[] {
  if (!j) return [];
  const out: TestCase[] = [];
  const walk = (s: PwSuite, file: string) => {
    for (const spec of s.specs ?? [])
      for (const t of spec.tests) {
        const status: TestStatus = t.status === 'skipped' ? 'skipped' : t.status === 'expected' ? 'passed' : 'failed';
        out.push({ suite: 'e2e', file: e2eFile(spec.file ?? file), title: spec.title, status });
      }
    for (const c of s.suites ?? []) walk(c, c.file ?? file);
  };
  for (const s of j.suites) walk(s, s.file ?? s.title);
  return out;
}

export function evidenceStatus(cases: TestCase[], needle: string): Status | null {
  const hits = cases.filter((c) => c.title.includes(needle) && c.status !== 'skipped');
  if (!hits.length) return null;
  return hits.every((c) => c.status === 'passed') ? 'DONE' : 'NOT DONE';
}

export interface AuditRow {
  group: string;
  item: string;
  status: Status;
  /** One needle or several: `test:{title part}`, `refs`, `determinism`, `runner`, `fid14`. Every one must pass. */
  evidence?: string | string[];
  /**
   * §11.6.1: evidence turns a row DONE only when it covers the whole item (`"whole"`). Otherwise (the default) passing
   * evidence makes it PARTIAL at most, and `manual` names the check that covers the rest (review D7).
   */
  covers?: 'whole' | 'part';
  /** The named manual check for what the evidence does not cover (who, where, what). */
  manual?: string;
  note?: string;
}

const evidenceList = (row: AuditRow): string[] => (row.evidence === undefined ? [] : [row.evidence].flat());

/**
 * An audit row against this run's evidence (§11.6.1, §11.6.2). No evidence: the row's own status. Any needle failing:
 * NOT DONE. Any needle without a result: UNVERIFIABLE. All passing: DONE only when the row says the evidence covers the
 * whole item; otherwise PARTIAL (the rest is the row's `manual` check). A CHANGED row stays CHANGED (it needs a CR).
 */
export function resolveAudit(row: AuditRow, one: (needle: string) => Status | null): Status {
  const evs = evidenceList(row);
  if (!evs.length || row.status === 'CHANGED') return row.status;
  const got = evs.map((e) => one(e) ?? row.status);
  if (got.includes('NOT DONE')) return 'NOT DONE';
  if (got.some((s) => s !== 'DONE')) return got.includes('PARTIAL') ? 'PARTIAL' : 'UNVERIFIABLE';
  return row.covers === 'whole' ? 'DONE' : 'PARTIAL';
}

interface TierRJson {
  id: string;
  theme: string;
  verdict: 'pass' | 'review' | 'fail' | 'disputed';
  disputed?: { cr: string; checks: string[] } | null;
  r1: { verdict: string };
  r2: { verdict: string; anchors: { name: string; dPos: number | null; dSize: number | null }[] };
  r3: { verdict: string; anchors: { name: string; deltaE: number | null }[] };
  r4: { verdict: string; ratio: number | null; skipped: string | null };
  r5: { ratio: number; heatmap: string | null };
  ref: string;
  app: string;
}

interface RefJson {
  id: string;
  family: string;
  files: Record<string, { png: string; sha256: string }>;
}

export interface Report {
  reportId: string;
  milestone: string;
  generatedAt: string;
  commit: string | null;
  head: string | null;
  ci: { runId: string | null; runUrl: string | null };
  spec: { version: string; setSha256: string };
  runner: unknown;
  fid04: Status;
  builders: string[];
  reviewer: { name: string | null; signed: boolean };
  verdict: 'PASS' | 'PASS WITH CR' | 'FAIL';
  verdictReasons: string[];
  missingInputs: string[];
  forVikas: { tryNow: string[]; changed: string[]; needsYes: string[] };
  audit: (AuditRow & { resolved: Status })[];
  golden: {
    counts: { pass: number; review: number; fail: number; disputed: number; notBuilt: number };
    refsRendered: { id: string; family: string; themes: string[] }[];
    determinism: unknown;
    rows: {
      id: string;
      theme: string;
      verdict: string;
      r1: string;
      r2: string;
      r3: string;
      r4: string;
      r5: number;
      ref: string | null;
      app: string | null;
      diff: string | null;
    }[];
    notBuilt: string[];
  };
  copy: { fid09: Status; fid10: Status; art02a: Status | 'NOT RUN' };
  tokens: { eslintErrors: number | null; stylelint: string; fid11: Status | 'NOT RUN'; fid12: Status | 'NOT RUN'; fid14: unknown[] };
  behaviour: {
    totals: Record<'unit' | 'e2e', Record<TestStatus, number>>;
    ids: { id: string; status: TestStatus; file: string }[];
    failed: TestCase[];
    trace: { live: number; pending: number; byMilestone: Record<string, number> };
  };
  gaps: { crs: { id: string; title: string; status: string }[]; notes: string };
  deviations: string[];
}

const ID = /\b(AT-\d{3}[a-z]?|ART-\d{2}[a-z]?|PERF-\d{2}|UX-\d{2}-\d{2}|BP-[A-Z]+(?:-[A-Z0-9]+)+)\b/g;

function crs(): Report['gaps']['crs'] {
  const dir = join('docs', 'cr');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => /^CR-\d{4}/.test(n) && !n.startsWith('CR-0000'))
    .sort()
    .map((n) => {
      const text = readFileSync(join(dir, n), 'utf8');
      return {
        id: n.slice(0, 7),
        title: (text.match(/^#\s*(.+)$/m)?.[1] ?? n).replace(/^CR-\d{4}\s*[:·-]\s*/, '').trim(),
        status: (text.match(/\*\*Status:\*\*\s*(.+)$/m)?.[1] ?? text.match(/^Status:\s*(.+)$/m)?.[1] ?? 'unknown').trim(),
      };
    });
}

export function build(opts: {
  milestone: string;
  vitest: VitestJson | null;
  e2e: { suites: PwSuite[] } | null;
  refsDir: string;
  tierRDir: string;
  runner: Record<string, unknown> | null;
  fid14: { id: string; ok: boolean; expected: string; measured: string }[] | null;
  eslint: { errorCount: number }[] | null;
  audit: { rows: AuditRow[] } | null;
  env: Record<string, string | undefined>;
}): Report {
  const cases = [...vitestCases(opts.vitest), ...playwrightCases(opts.e2e)];
  const missingInputs: string[] = [];
  if (!opts.vitest) missingInputs.push('unit test results (Vitest JSON)');
  if (!opts.e2e) missingInputs.push('E2E results (Playwright JSON)');
  if (!opts.runner) missingInputs.push('golden runner identity (golden/runner.json)');
  if (!opts.fid14) missingInputs.push('FID-14 results');

  // Golden references and Tier R.
  const manifest = readManifest();
  const refsRendered: Report['golden']['refsRendered'] = [];
  for (const fam of ['bp', 'ux']) {
    const dir = join(opts.refsDir, fam);
    if (!existsSync(dir)) continue;
    for (const n of readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .sort()) {
      const r = JSON.parse(readFileSync(join(dir, n), 'utf8')) as RefJson;
      refsRendered.push({ id: r.id, family: fam, themes: Object.keys(r.files) });
    }
  }
  const determinism = readJson<{ differing: string[] }>(join(opts.refsDir, 'determinism.json'));
  const tierR: TierRJson[] = existsSync(opts.tierRDir)
    ? readdirSync(opts.tierRDir)
        .filter((f) => f.endsWith('.tier-r.json'))
        .sort()
        .map((f) => JSON.parse(readFileSync(join(opts.tierRDir, f), 'utf8')) as TierRJson)
    : [];
  const wanted = [
    ...manifest.bp.filter((b) => b.milestone === opts.milestone).map((b) => b.id),
    // A UX step counts for its chapter's milestone and for the earlier milestone that first tests it (CR-0003).
    ...manifest.ux.filter((u) => u.milestone === opts.milestone || u.firstTested === opts.milestone).map((u) => u.id),
  ];
  const built = new Set(tierR.map((t) => t.id));
  const notBuilt = wanted.filter((id) => !built.has(id));
  const img = (p: string | null) => (p && existsSync(p) ? `data:image/png;base64,${readFileSync(p).toString('base64')}` : null);
  const rows: Report['golden']['rows'] = tierR.map((t) => ({
    id: t.id,
    theme: t.theme,
    verdict: t.verdict,
    r1: t.r1.verdict,
    r2: `${t.r2.verdict} (${t.r2.anchors.map((a) => `${a.name} ${a.dPos ?? '–'}/${a.dSize ?? '–'} px`).join(', ')})`,
    r3: `${t.r3.verdict} (${t.r3.anchors.map((a) => `${a.name} ΔE ${a.deltaE ?? '–'}`).join(', ')})`,
    r4: t.r4.skipped ? `skipped: ${t.r4.skipped}` : `${t.r4.verdict} (${((t.r4.ratio ?? 0) * 100).toFixed(2)} %)`,
    r5: t.r5.ratio,
    ref: img(t.ref),
    app: img(t.app),
    diff: img(t.r5.heatmap ? join(opts.tierRDir, t.r5.heatmap) : null),
  }));
  // Not-built references still appear side by side (reference | not built | –), light and dark.
  for (const id of notBuilt) {
    const r = refsRendered.find((x) => x.id === id);
    const fam = r?.family ?? (id.startsWith('UX') ? 'ux' : 'bp');
    for (const theme of r?.themes.length ? r.themes : ['light']) {
      rows.push({
        id,
        theme,
        verdict: 'not built',
        r1: '–',
        r2: '–',
        r3: '–',
        r4: '–',
        r5: Number.NaN,
        ref: img(join(opts.refsDir, fam, `${id}.${theme}.png`)),
        app: null,
        diff: null,
      });
    }
  }
  const counts = {
    pass: tierR.filter((t) => t.verdict === 'pass').length,
    review: tierR.filter((t) => t.verdict === 'review').length,
    fail: tierR.filter((t) => t.verdict === 'fail').length,
    disputed: tierR.filter((t) => t.verdict === 'disputed').length,
    notBuilt: notBuilt.length,
  };

  // Audit rows, resolved against the evidence of this run.
  const one = (ev: string): Status | null => {
    if (ev === 'refs') return refsRendered.length ? 'DONE' : 'UNVERIFIABLE';
    if (ev === 'determinism') return determinism ? (determinism.differing.length ? 'NOT DONE' : 'DONE') : 'UNVERIFIABLE';
    if (ev === 'runner') return opts.runner ? 'DONE' : 'UNVERIFIABLE';
    if (ev === 'fid14') return opts.fid14 ? (opts.fid14.every((r) => r.ok) ? 'DONE' : 'NOT DONE') : 'UNVERIFIABLE';
    if (ev.startsWith('test:')) return evidenceStatus(cases, ev.slice(5)) ?? 'UNVERIFIABLE';
    return null;
  };
  const audit = (opts.audit?.rows ?? []).map((r) => ({ ...r, resolved: resolveAudit(r, one) }));
  if (!opts.audit) missingInputs.push(`audit list (docs/fidelity/${opts.milestone}.audit.json)`);

  const failed = cases.filter((c) => c.status === 'failed');
  const ids = cases.flatMap((c) => [...new Set(c.title.match(ID) ?? [])].map((id) => ({ id, status: c.status, file: c.file })));
  const totals = { unit: { passed: 0, failed: 0, skipped: 0 }, e2e: { passed: 0, failed: 0, skipped: 0 } };
  for (const c of cases) totals[c.suite][c.status]++;
  const trace = readTrace(readFileSync(join('spec', 'trace.csv'), 'utf8')).rows;
  const byMilestone: Record<string, number> = {};
  for (const r of trace) byMilestone[r.cells.Milestone ?? '?'] = (byMilestone[r.cells.Milestone ?? '?'] ?? 0) + 1;
  const fid = (needle: string): Status | 'NOT RUN' => evidenceStatus(cases, needle) ?? 'NOT RUN';
  const eslintErrors = opts.eslint ? opts.eslint.reduce((n, f) => n + f.errorCount, 0) : null;
  const fid14Failed = (opts.fid14 ?? []).filter((r) => !r.ok);

  const verdictReasons: string[] = [];
  if (failed.length) verdictReasons.push(`${failed.length} test(s) failed`);
  if (counts.fail) verdictReasons.push(`${counts.fail} Tier R step(s) failed`);
  if (fid14Failed.length) verdictReasons.push(`FID-14 rows failed: ${fid14Failed.map((r) => r.id).join(', ')}`);
  if (determinism?.differing.length) verdictReasons.push(`FID-03: ${determinism.differing.length} reference PNG(s) not byte-identical`);
  if (eslintErrors) verdictReasons.push(`${eslintErrors} lint error(s)`);
  if (missingInputs.length) verdictReasons.push(`missing evidence: ${missingInputs.join('; ')}`);
  const open = audit.filter((a) => a.resolved !== 'DONE');
  if (open.length) verdictReasons.push(`${open.length} audit item(s) not DONE (the milestone is not complete)`);
  if (audit.some((a) => a.resolved === 'CHANGED')) verdictReasons.push('CHANGED items need an approved CR');
  const verdict: Report['verdict'] = verdictReasons.length ? 'FAIL' : 'PASS';

  const runId = opts.env.GITHUB_RUN_ID ?? null;
  const commit = opts.env.GITHUB_SHA ?? null;
  const head = opts.env.FOO_HEAD_SHA ?? commit;
  const runUrl =
    runId && opts.env.GITHUB_REPOSITORY
      ? `${opts.env.GITHUB_SERVER_URL ?? 'https://github.com'}/${opts.env.GITHUB_REPOSITORY}/actions/runs/${runId}`
      : null;
  const runner = opts.runner as { pinned?: string | null; matchesPinned?: boolean | null } | null;
  const fid04: Status = !runner ? 'UNVERIFIABLE' : runner.pinned == null ? 'UNVERIFIABLE' : runner.matchesPinned ? 'DONE' : 'NOT DONE';
  const shell = notBuilt.length === wanted.length && wanted.length > 0;

  return {
    reportId: `${opts.milestone}-${(head ?? 'local').slice(0, 7)}-${runId ?? 'local'}`,
    milestone: opts.milestone,
    generatedAt: new Date().toISOString(),
    commit,
    head,
    ci: { runId, runUrl },
    spec: {
      version: (JSON.parse(readFileSync(join('spec', 'SPEC-MANIFEST.json'), 'utf8')) as { version: string }).version,
      setSha256: setSha256(),
    },
    runner: opts.runner,
    fid04,
    builders: (opts.env.FOO_BUILDERS ?? 'builder agent').split(',').map((s) => s.trim()),
    reviewer: { name: opts.env.FOO_REVIEWER ?? null, signed: false },
    verdict,
    verdictReasons,
    missingInputs,
    forVikas: {
      tryNow: shell
        ? [
            `Nothing new to try yet: none of the ${wanted.length} ${opts.milestone} drawings is built in the app. This run shows that the checking machinery works.`,
          ]
        : [`${opts.milestone}: ${counts.pass} of ${wanted.length} drawings match; open the side-by-side rows below.`],
      changed: counts.review
        ? [`${counts.review} picture(s) differ a little from the drawing and need your look (Review rows).`]
        : ['Nothing differs from the drawings so far.'],
      needsYes: crs()
        .filter((c) => !/^Approved/i.test(c.status))
        .map((c) => `${c.id}: ${c.title} (${c.status})`),
    },
    audit,
    golden: { counts, refsRendered, determinism, rows, notBuilt },
    copy: { fid09: 'NOT DONE', fid10: 'NOT DONE', art02a: fid('ART-02a') },
    tokens: {
      eslintErrors,
      stylelint: 'not installed yet (FID-13 Stylelint half; ART-24a scans styles today)',
      fid11: fid('FID-11'),
      fid12: fid('FID-12'),
      fid14: opts.fid14 ?? [],
    },
    behaviour: {
      totals,
      ids,
      failed,
      trace: {
        live: trace.filter((r) => r.cells.Status === 'live').length,
        pending: trace.filter((r) => r.cells.Status === 'pending').length,
        byMilestone,
      },
    },
    gaps: { crs: crs(), notes: `Conservative picks and deferrals: implementation-notes.md (the ## ${opts.milestone} sections).` },
    deviations: ['Not reviewed yet: the independent reviewer adds what no test caught.'],
  };
}

// ---------- HTML ----------
const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const badge = (s: string) => `<span class="b b-${esc(s.toLowerCase().replace(/[^a-z]+/g, '-'))}">${esc(s)}</span>`;
const table = (head: string[], rows: string[][]) =>
  `<div class="tw"><table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${
    rows.length
      ? rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${head.length}">None.</td></tr>`
  }</tbody></table></div>`;
const pic = (src: string | null, alt: string) =>
  src ? `<img src="${src}" alt="${esc(alt)}" loading="lazy">` : `<div class="none">${esc(alt)}</div>`;

export function html(r: Report): string {
  const g = r.golden;
  const runner = (r.runner ?? {}) as {
    os?: {
      platform?: string;
      release?: string;
      windows?: { productName?: string; displayVersion?: string; currentBuild?: string; ubr?: string } | null;
    };
    image?: { os?: string | null; version?: string | null };
    fonts?: Record<string, boolean | string>;
    chromium?: string;
    electron?: string | null;
    engine?: string;
  };
  const win = runner.os?.windows;
  const runnerLine = runner.os
    ? `${win ? `${win.productName ?? 'Windows'} ${win.displayVersion ?? ''} build ${win.currentBuild ?? '?'}.${win.ubr ?? '?'}` : `${runner.os.platform} ${runner.os.release}`} · image ${runner.image?.os ?? '–'} ${runner.image?.version ?? ''} · ${runner.engine} Chromium ${runner.chromium ?? '?'}${runner.electron ? ` (Electron ${runner.electron})` : ''}`
    : 'not recorded';
  const fonts = runner.fonts
    ? `Segoe UI Variable ${runner.fonts.segoeUIVariable ? 'yes' : 'no'} · Segoe UI Emoji ${runner.fonts.segoeUIEmoji ? 'yes' : 'no'} · Nirmala UI ${runner.fonts.nirmalaUI ? 'yes' : 'no'}`
    : 'not recorded';
  const vik = r.forVikas;
  const golden = g.rows.map((row) => [
    `<b>${esc(row.id)}</b><br>${esc(row.theme)}<br>${badge(row.verdict)}`,
    pic(row.ref, 'no reference image'),
    pic(row.app, 'not built yet'),
    pic(row.diff, '–'),
    `R1 ${esc(row.r1)}<br>R2 ${esc(row.r2)}<br>R3 ${esc(row.r3)}<br>R4 ${esc(row.r4)}<br>R5 ${Number.isNaN(row.r5) ? '–' : `${(row.r5 * 100).toFixed(2)} %`}`,
  ]);
  return `<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>foo ${esc(r.milestone)} fidelity report</title>
<style>
:root{--bg:#FFFFFF;--fg:#0B0B10;--fg2:#55555F;--line:#E4E4EA;--panel:#F6F6F9;--ok:#17804D;--warn:#9A6200;--bad:#C4302B;--acc:#2B3FD6;color-scheme:light}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#0D0D11;--fg:#F1F1F5;--fg2:#B0B0BC;--line:#26262E;--panel:#16161C;--ok:#4CC38A;--warn:#F2B84B;--bad:#FF7A72;--acc:#8C9BFF;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#0D0D11;--fg:#F1F1F5;--fg2:#B0B0BC;--line:#26262E;--panel:#16161C;--ok:#4CC38A;--warn:#F2B84B;--bad:#FF7A72;--acc:#8C9BFF;color-scheme:dark}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 "Segoe UI Variable","Segoe UI",system-ui,sans-serif}
main{max-width:1180px;margin:0 auto;padding:24px 16px 64px}h1{font-size:26px;margin:0 0 4px}h2{font-size:19px;margin:36px 0 10px;padding-top:12px;border-top:1px solid var(--line)}
.sub{color:var(--fg2)}.vikas{background:var(--panel);border:2px solid var(--acc);border-radius:12px;padding:16px 20px;margin:18px 0}.vikas h2{border:0;margin:0 0 8px;padding:0}
.vikas ul{margin:4px 0 10px;padding-left:20px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px 20px}
.kv b{display:block;font-size:12px;color:var(--fg2);font-weight:600}.tw{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:14px}
th,td{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}th{font-size:12px;color:var(--fg2)}
img{max-width:100%;height:auto;border:1px solid var(--line);border-radius:4px;background:#fff}td img{max-width:300px;max-height:420px;width:auto}.none{color:var(--fg2);font-style:italic}
.b{display:inline-block;padding:1px 8px;border-radius:999px;font-size:12px;font-weight:600;border:1px solid currentColor;white-space:nowrap}
.b-done,.b-pass{color:var(--ok)}.b-not-done,.b-fail,.b-failed{color:var(--bad)}.b-partial,.b-review,.b-disputed,.b-unverifiable,.b-changed,.b-not-run,.b-not-built{color:var(--warn)}
.verdict{font-size:20px}button{font:inherit;background:var(--panel);color:var(--fg);border:1px solid var(--line);border-radius:999px;padding:4px 14px;cursor:pointer;float:right}
code{font-family:Consolas,ui-monospace,monospace;font-size:13px;word-break:break-all}
</style>
</head>
<body>
<main>
<button type="button" id="theme">Light / dark</button>
<h1>foo · ${esc(r.milestone)} fidelity report</h1>
<p class="sub">Report ${esc(r.reportId)} · ${esc(r.generatedAt)}</p>

<section class="vikas" aria-labelledby="v">
<h2 id="v">For Vikas</h2>
<p class="verdict">Verdict: ${badge(r.verdict)}</p>
${r.verdictReasons.length ? `<p>Why: ${r.verdictReasons.map(esc).join('; ')}.</p>` : ''}
<b>What you can try now</b><ul>${vik.tryNow.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
<b>What changed from the drawings, and why</b><ul>${vik.changed.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
<b>What needs your yes</b><ul>${vik.needsYes.length ? vik.needsYes.map((s) => `<li>${esc(s)}</li>`).join('') : '<li>Nothing.</li>'}</ul>
</section>

<h2>1 · Header</h2>
<div class="grid kv">
<div><b>Milestone</b>${esc(r.milestone)}</div>
<div><b>Commit</b><code>${esc(r.head ?? 'local')}</code>${r.commit && r.commit !== r.head ? `<br><small>tested merge <code>${esc(r.commit)}</code></small>` : ''}</div>
<div><b>CI run</b>${r.ci.runUrl ? `<a href="${esc(r.ci.runUrl)}">${esc(r.ci.runId)}</a>` : 'not in CI (local)'}</div>
<div><b>Spec</b>${esc(r.spec.version)}<br><code>${esc(r.spec.setSha256)}</code></div>
<div><b>Golden runner (FID-04)</b>${esc(runnerLine)}<br>${esc(fonts)}<br>pinned image: ${badge(r.fid04)}</div>
<div><b>Builder · reviewer</b>${esc(r.builders.join(', '))} · ${r.reviewer.signed ? esc(r.reviewer.name) : 'not signed yet'}</div>
</div>

<h2>2 · Plan vs built audit</h2>
${table(
  ['Group', 'Item', 'Status', 'Evidence / note'],
  r.audit.map((a) => [
    esc(a.group),
    esc(a.item),
    badge(a.resolved),
    esc(
      [
        evidenceList(a).join(' + '),
        a.covers === 'whole' ? '' : evidenceList(a).length ? 'covers part of the item' : '',
        a.resolved !== 'DONE' && a.manual ? `manual check: ${a.manual}` : '',
        a.note,
      ]
        .filter(Boolean)
        .join(' · '),
    ),
  ]),
)}

<h2>3 · Golden summary</h2>
<p>Tier R: ${g.counts.pass} pass · ${g.counts.review} review · ${g.counts.fail} fail · ${g.counts.disputed} disputed · ${g.counts.notBuilt} not built yet. References rendered this run: ${g.refsRendered.length}${
    g.determinism
      ? ` · FID-03 re-render: ${(g.determinism as { differing: string[] }).differing.length ? badge('FAIL') : badge('PASS')}`
      : ''
  }. Tier B baselines: ${existsSync(join('golden', 'app')) ? readdirSync(join('golden', 'app')).filter((f) => f.endsWith('.png')).length : 0}.</p>
${table(['Step', 'Reference', 'App', 'Diff', 'R1–R5'], golden)}

<h2>4 · Copy</h2>
${table(
  ['Check', 'Result'],
  [
    ['FID-09 runtime copy match', `${badge(r.copy.fid09)} built with the M1 runtime copy check`],
    ['FID-10 copy coverage', `${badge(r.copy.fid10)} built with the M1 runtime copy check`],
    ['ART-02a banned words', badge(r.copy.art02a)],
  ],
)}

<h2>5 · Tokens and values</h2>
${table(
  ['Check', 'Result'],
  [
    [
      'ESLint errors (incl. foo/no-raw-design-values)',
      r.tokens.eslintErrors === null
        ? badge('NOT RUN')
        : r.tokens.eslintErrors === 0
          ? `${badge('PASS')} 0`
          : `${badge('FAIL')} ${r.tokens.eslintErrors}`,
    ],
    ['Stylelint', esc(r.tokens.stylelint)],
    ['FID-11 tokens.json = spec', badge(r.tokens.fid11)],
    ['FID-12 generated token files fresh', badge(r.tokens.fid12)],
  ],
)}
${table(
  ['FID-14 row', 'Expected', 'Measured', 'Result'],
  (r.tokens.fid14 as { id: string; ok: boolean; expected: string; measured: string }[]).map((x) => [
    esc(x.id),
    esc(x.expected),
    esc(x.measured),
    badge(x.ok ? 'PASS' : 'FAIL'),
  ]),
)}

<h2>6 · Behaviour</h2>
<p>Unit/article/fidelity: ${r.behaviour.totals.unit.passed} passed · ${r.behaviour.totals.unit.failed} failed · ${r.behaviour.totals.unit.skipped} skipped. E2E: ${r.behaviour.totals.e2e.passed} passed · ${r.behaviour.totals.e2e.failed} failed · ${r.behaviour.totals.e2e.skipped} skipped.</p>
${table(
  ['AT / ART / PERF / UX / BP id', 'Status', 'File'],
  r.behaviour.ids.map((i) => [esc(i.id), badge(i.status), `<code>${esc(i.file)}</code>`]),
)}
${
  r.behaviour.failed.length
    ? table(
        ['Failed test', 'File'],
        r.behaviour.failed.map((f) => [esc(f.title), `<code>${esc(f.file)}</code>`]),
      )
    : ''
}
<p>Traceability (spec/trace.csv): ${r.behaviour.trace.live} live rows · ${r.behaviour.trace.pending} pending · by milestone ${esc(JSON.stringify(r.behaviour.trace.byMilestone))}. State-machine coverage: not built (FID-16/17, M4).</p>

<h2>7 · Gaps and CRs</h2>
${table(
  ['CR', 'Title', 'Status'],
  r.gaps.crs.map((c) => [esc(c.id), esc(c.title), esc(c.status)]),
)}
<p>${esc(r.gaps.notes)}</p>

<h2>8 · Deviations found by reading</h2>
<ul>${r.deviations.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>
${r.missingInputs.length ? `<p class="sub">Missing inputs (reported as UNVERIFIABLE): ${r.missingInputs.map(esc).join('; ')}.</p>` : ''}
</main>
<script>
document.getElementById('theme').addEventListener('click', function () {
  var root = document.documentElement;
  var dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
});
</script>
</body>
</html>
`;
}

function main() {
  const { values } = parseArgs({
    options: {
      milestone: { type: 'string', default: process.env.FIDELITY_MILESTONE ?? 'M1' },
      out: { type: 'string' },
      vitest: { type: 'string', default: join('golden', 'out', 'results', 'vitest.json') },
      e2e: { type: 'string', default: join('test-results', 'e2e.json') },
      refs: { type: 'string', default: join('golden', 'ref') },
      'tier-r': { type: 'string', default: join('golden', 'out', 'tier-r') },
      runner: { type: 'string', default: join('golden', 'runner.json') },
      fid14: { type: 'string', default: 'test-results' },
      eslint: { type: 'string', default: join('golden', 'out', 'results', 'eslint.json') },
    },
  });
  const milestone = values.milestone!;
  const out = values.out ?? join('qa-evidence', milestone);
  const report = build({
    milestone,
    vitest: readJson(values.vitest),
    e2e: readJson(values.e2e),
    refsDir: values.refs!,
    tierRDir: values['tier-r']!,
    runner: readJson(values.runner),
    fid14: readFid14(values.fid14),
    eslint: readJson(values.eslint),
    audit: readJson(join('docs', 'fidelity', `${milestone}.audit.json`)),
    env: process.env,
  });
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'fidelity.html'), html(report));
  const { golden, ...rest } = report;
  const json = {
    ...rest,
    golden: { ...golden, rows: golden.rows.map(({ ref, app, diff, ...row }) => ({ ...row, ref: !!ref, app: !!app, diff: !!diff })) },
  };
  writeFileSync(join(out, 'fidelity.json'), JSON.stringify(json, null, 2) + '\n');
  console.log(
    `${join(out, 'fidelity.html')}: ${report.verdict}${report.verdictReasons.length ? ` (${report.verdictReasons.join('; ')})` : ''}`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
