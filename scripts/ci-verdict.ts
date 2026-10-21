// Spec: docs/build-method.md §8 (no re-proving the same red tests); retro lever 3 (/mnt/project-files/foo/retro
// findings.md): every failing CI test is marked mine / known / new against docs/known-red.tsv and the base branch's own
// latest CI run, and a short digest replaces the 50k–230k-character logs that each ticket used to pull.
// Usage: tsx scripts/ci-verdict.ts <pr> [--repo owner/name] [--post]   (or scripts/ci-verdict.sh)
//        tsx scripts/ci-verdict.ts --log <file> [--base origin/main]  (a saved job log, e.g. from get_job_logs)
// Reads the public GitHub API (check-run annotations need no sign-in); GITHUB_TOKEN raises the rate limit and is
// needed only for --post. Exit 0 when every failure is known, 1 when any is mine or new, 2 on a usage error.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export type Failure = { job: string; jobId?: number; file: string; title: string; message: string };
export type KnownRow = { match: string; reason: string; owner: string; until: string; line: number };
export type Verdict = 'mine' | 'known' | 'new';
export type Classified = Failure & { verdict: Verdict; why: string };

export const MARKER = '<!-- foo-ci-verdict -->';
const KNOWN_HEADER = ['match', 'reason', 'owner', 'until'];

/** docs/known-red.tsv: header match/reason/owner/until; `#` lines and blank lines are skipped. */
export function parseKnownRed(tsv: string, today?: string): KnownRow[] {
  const latest = today ? new Date(Date.parse(today) + 14 * 864e5).toISOString().slice(0, 10) : undefined;
  const lines = tsv.replace(/\r/g, '').split('\n');
  const header = lines[0]?.split('\t') ?? [];
  if (KNOWN_HEADER.some((h, i) => header[i] !== h)) throw new Error(`known-red.tsv: header must be ${KNOWN_HEADER.join(' TAB ')}`);
  const rows: KnownRow[] = [];
  lines.slice(1).forEach((raw, i) => {
    if (!raw.trim() || raw.startsWith('#')) return;
    const [match = '', reason = '', owner = '', until = ''] = raw.split('\t');
    const line = i + 2;
    if (!match || !reason || !owner || !/^\d{4}-\d{2}-\d{2}$/.test(until))
      throw new Error(`known-red.tsv:${line}: every row needs match, reason, owner and an until date (YYYY-MM-DD)`);
    if (latest && until > latest) throw new Error(`known-red.tsv:${line}: until ${until} is more than 14 days out (latest ${latest})`);
    rows.push({ match, reason, owner, until, line });
  });
  return rows;
}

type Annotation = { path: string; annotation_level: string; title: string | null; message: string | null };

/** Test failures from one job's check-run annotations. The runner's own ".github" lines are not tests. */
export function failuresFromAnnotations(job: string, jobId: number | undefined, notes: Annotation[]): Failure[] {
  return notes
    .filter((a) => a.annotation_level === 'failure' && a.path !== '.github')
    .map((a) => ({
      job,
      jobId,
      file: slash(a.path),
      title: slash((a.title ?? '').trim() || a.path),
      message: firstLine(a.message ?? ''),
    }));
}

// vitest: " FAIL  test/unit/x.test.ts > suite > name"; Playwright list reporter: "  ✘  3 [electron] › test/e2e/a.spec.ts:10:5 › title (2.1s)".
const VITEST_FAIL = /^\s*(?:FAIL|×|✗)\s+(\S+\.test\.tsx?)\s+>\s+(.+?)\s*(?:\d+ms)?$/;
const PW_FAIL = /^\s*[✘×]\s+\d+\s+(?:\[[^\]]+\]\s+›\s+)?(\S+\.spec\.ts):\d+:\d+\s+›\s+(.+?)(?:\s+\([\d.]+m?s\))?$/;

/** Test failures from a saved job log (vitest default and Playwright list reporters). Timestamps are stripped. */
export function failuresFromLog(job: string, log: string): Failure[] {
  const seen = new Set<string>();
  const out: Failure[] = [];
  for (const raw of log.replace(/\r/g, '').split('\n')) {
    const line = raw.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s/, '');
    const m = VITEST_FAIL.exec(line) ?? PW_FAIL.exec(line);
    if (!m) continue;
    const file = m[1]!;
    const title = `${file} > ${m[2]!.trim()}`;
    if (seen.has(title)) continue;
    seen.add(title);
    out.push({ job, file, title, message: '' });
  }
  return out;
}

/** Same test, whatever reporter named it: the file plus the last title segment. */
function testKey(f: Pick<Failure, 'file' | 'title'>): string {
  const parts = f.title.split(/\s+(?:>|›)\s+/);
  return `${f.file}::${parts[parts.length - 1]!.trim()}`;
}

function knownMatch(row: KnownRow, f: Failure): boolean {
  if (/^(AT|ART|PERF|UX|BP|J|U|B)-?\d/.test(row.match)) return new RegExp(`\\b${escape(row.match)}\\b`).test(f.title);
  if (row.match.includes('/')) return f.file === row.match || f.title.startsWith(`${row.match} >`) || f.file.startsWith(row.match);
  return f.title.includes(row.match);
}

export function classify(
  failures: Failure[],
  ctx: { known: KnownRow[]; today: string; changed: string[]; baseFailures: Failure[]; baseName: string },
): Classified[] {
  const changed = new Set(ctx.changed);
  const onBase = new Set(ctx.baseFailures.map(testKey));
  return failures.map((f) => {
    if (changed.has(f.file)) return { ...f, verdict: 'mine', why: 'this PR changes the test file' };
    const live = ctx.known.find((r) => r.until >= ctx.today && knownMatch(r, f));
    if (live) return { ...f, verdict: 'known', why: `known-red.tsv:${live.line} ${live.reason} (${live.owner}, until ${live.until})` };
    if (onBase.has(testKey(f))) return { ...f, verdict: 'known', why: `red on ${ctx.baseName} too` };
    const expired = ctx.known.find((r) => r.until < ctx.today && knownMatch(r, f));
    if (expired) return { ...f, verdict: 'new', why: `known-red.tsv:${expired.line} expired ${expired.until}: fix it or renew the row` };
    return { ...f, verdict: 'new', why: `not in known-red.tsv and green on ${ctx.baseName}` };
  });
}

export function digest(
  rows: Classified[],
  head: { label: string; sha: string },
  extra: { jobOnly: { job: string; jobId?: number; step: string }[]; knownRows: number; expiredRows: number; truncated?: string[] },
): string {
  const n = (v: Verdict) => rows.filter((r) => r.verdict === v).length;
  const out = [MARKER, `### CI verdict for ${head.label} at ${head.sha.slice(0, 7)}`];
  if (rows.length === 0 && extra.jobOnly.length === 0) {
    out.push('', 'No failing tests.');
    return out.join('\n') + '\n';
  }
  out.push(
    '',
    `**${n('mine')} mine · ${n('known')} known · ${n('new')} new** (known-red.tsv: ${extra.knownRows} rows, ${extra.expiredRows} expired)`,
  );
  if (rows.length) {
    out.push('', '| Verdict | Test | Job | Why |', '|---|---|---|---|');
    const order: Verdict[] = ['mine', 'new', 'known'];
    for (const r of [...rows].sort((a, b) => order.indexOf(a.verdict) - order.indexOf(b.verdict))) {
      const msg = r.message ? `<br>${cell(r.message)}` : '';
      out.push(`| ${r.verdict} | ${cell(r.title)}${msg} | ${cell(r.job)} | ${cell(r.why)} |`);
    }
  }
  for (const job of extra.truncated ?? [])
    out.push('', `- ${job}: GitHub keeps 10 annotations per step, so more tests may have failed; read the log tail.`);
  for (const j of extra.jobOnly)
    out.push('', `- ${j.job}: step "${j.step}" failed without a test annotation; read the log tail (job ${j.jobId ?? '?'}, ~100 lines).`);
  out.push(
    '',
    'Fix **mine**. Look at **new** first: a real regression, or a flake to root-cause (add a dated row to docs/known-red.tsv only with an owner). **known** needs no re-proof.',
  );
  return out.join('\n') + '\n';
}

/** Windows runners annotate with backslashes; the PR's file list uses forward slashes. */
function slash(s: string): string {
  return s.replace(/\\/g, '/');
}
function firstLine(s: string): string {
  const l = s.split('\n').find((x) => x.trim()) ?? '';
  return l.length > 140 ? `${l.slice(0, 137)}...` : l.trim();
}
function cell(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------- GitHub (public API) ----------

type CheckRun = { id: number; name: string; conclusion: string | null; head_sha: string };
type Job = { id: number; name: string; conclusion: string | null; steps?: { name: string; conclusion: string | null }[] };

async function api<T>(repo: string, path: string, init?: RequestInit): Promise<T> {
  const token = process.env.GITHUB_TOKEN;
  const res = await fetch(`https://api.github.com/repos/${repo}/${path}`, {
    ...init,
    headers: { accept: 'application/vnd.github+json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...init?.headers },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status} on ${path}`);
  return (await res.json()) as T;
}

const BAD = new Set(['failure', 'timed_out', 'cancelled']);

async function failuresAt(
  repo: string,
  sha: string,
): Promise<{ failures: Failure[]; jobOnly: { job: string; jobId: number; step: string }[]; truncated: string[] }> {
  const { check_runs } = await api<{ check_runs: CheckRun[] }>(repo, `commits/${sha}/check-runs?per_page=100`);
  const failures: Failure[] = [];
  const jobOnly: { job: string; jobId: number; step: string }[] = [];
  const truncated: string[] = [];
  for (const run of check_runs.filter((c) => c.conclusion && BAD.has(c.conclusion))) {
    const notes = await api<Annotation[]>(repo, `check-runs/${run.id}/annotations?per_page=100`);
    const fs = failuresFromAnnotations(run.name, run.id, notes);
    failures.push(...fs);
    if (notes.filter((a) => a.annotation_level === 'failure').length >= 10) truncated.push(run.name);
    if (fs.length === 0) {
      const job = await api<Job>(repo, `actions/jobs/${run.id}`).catch(() => undefined);
      const step = job?.steps?.find((s) => s.conclusion && BAD.has(s.conclusion))?.name ?? 'unknown';
      jobOnly.push({ job: run.name, jobId: run.id, step });
    }
  }
  return { failures, jobOnly, truncated };
}

/** The base branch's newest finished CI run: what is red there is not this PR's. */
async function baseFailures(repo: string, base: string): Promise<Failure[]> {
  const { workflow_runs } = await api<{ workflow_runs: { name: string; head_sha: string; conclusion: string | null }[] }>(
    repo,
    `actions/runs?branch=${encodeURIComponent(base)}&status=completed&per_page=20`,
  );
  // A cancelled run has no annotations, so it would make every red-on-base test look new.
  const run = workflow_runs.find((r) => r.name === 'CI' && (r.conclusion === 'success' || r.conclusion === 'failure'));
  return run ? (await failuresAt(repo, run.head_sha)).failures : [];
}

async function changedFiles(repo: string, pr: number): Promise<string[]> {
  const out: string[] = [];
  for (let page = 1; page <= 30; page++) {
    const batch = await api<{ filename: string }[]>(repo, `pulls/${pr}/files?per_page=100&page=${page}`);
    out.push(...batch.map((f) => f.filename));
    if (batch.length < 100) break;
  }
  return out;
}

async function post(repo: string, pr: number, body: string): Promise<void> {
  if (!process.env.GITHUB_TOKEN) throw new Error('--post needs GITHUB_TOKEN');
  const comments = await api<{ id: number; body: string }[]>(repo, `issues/${pr}/comments?per_page=100`);
  const mine = comments.find((c) => c.body.startsWith(MARKER));
  const init = { method: mine ? 'PATCH' : 'POST', body: JSON.stringify({ body }) };
  await api(repo, mine ? `issues/comments/${mine.id}` : `issues/${pr}/comments`, init);
}

async function main(argv: string[]): Promise<number> {
  const opt = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const repo = opt('--repo') ?? 'vikas53953/foo-agent';
  const today = new Date().toISOString().slice(0, 10);
  const known = parseKnownRed(readFileSync('docs/known-red.tsv', 'utf8'), today);
  const expiredRows = known.filter((r) => r.until < today).length;
  const log = opt('--log');
  if (log) {
    const base = opt('--base') ?? 'origin/main';
    const changed = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
    const rows = classify(failuresFromLog('log', readFileSync(log, 'utf8')), { known, today, changed, baseFailures: [], baseName: base });
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    process.stdout.write(digest(rows, { label: log, sha }, { jobOnly: [], knownRows: known.length, expiredRows }));
    return rows.some((r) => r.verdict !== 'known') ? 1 : 0;
  }
  const pr = Number(argv.find((a) => /^\d+$/.test(a)));
  if (!pr) {
    console.error('usage: tsx scripts/ci-verdict.ts <pr> [--repo owner/name] [--post] | --log <file> [--base origin/main]');
    return 2;
  }
  const p = await api<{ head: { sha: string }; base: { ref: string } }>(repo, `pulls/${pr}`);
  const [{ failures, jobOnly, truncated }, changed, onBase] = await Promise.all([
    failuresAt(repo, p.head.sha),
    changedFiles(repo, pr),
    baseFailures(repo, p.base.ref),
  ]);
  const rows = classify(failures, { known, today, changed, baseFailures: onBase, baseName: p.base.ref });
  const body = digest(rows, { label: `#${pr}`, sha: p.head.sha }, { jobOnly, knownRows: known.length, expiredRows, truncated });
  process.stdout.write(body);
  if (argv.includes('--post')) await post(repo, pr, body);
  return rows.some((r) => r.verdict !== 'known') || jobOnly.length ? 1 : 0;
}

const isCli = !!process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli)
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e: unknown) => {
      console.error(e instanceof Error ? e.message : e);
      process.exit(2);
    },
  );
