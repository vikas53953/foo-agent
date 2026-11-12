// CR-0072 (12 Nov 2026 build audit): the pipeline rules that used to be words only, as checks.
//   L1 batch scope   — features switched on (resources/features.json) belong to the active or a done batch
//                      (docs/batches.tsv); a batch is active only after the one before it was used by Vikas (used_on).
//   L3 layers        — every pipeline layer (docs/pipeline-layers.tsv) names what it replaces and its enforcer;
//                      --weekly also fails a running layer that has not run for 14 days (retire it or run it).
//   L4 QA split      — a PR that changes app code (src/) may not also change QA-owned tests, unless a commit says
//                      `QA-Split: <why>` (the builder never edits the bar it has to clear).
//   L4 proof         — a ready (non-draft) PR that changes src/ carries a `Proof:` block with the sha, the step record
//                      and the picture, or says "pre-check only".
//   L6 caps          — --weekly: at most 5 open PRs and no branch left from a merged or closed PR (needs GITHUB_TOKEN).
// Usage: tsx scripts/pipeline-check.ts                     (CI fast lane; PR checks run on pull_request events)
//        tsx scripts/pipeline-check.ts --weekly            (heartbeat; also the caps and stale layers)
//        tsx scripts/pipeline-check.ts --base <ref> [--body <text>] [--draft]   (locally)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export interface Batch {
  id: string;
  features: string[];
  state: 'active' | 'done' | 'draft' | 'locked';
  usedOn: string;
}

export interface Layer {
  layer: string;
  replaces: string;
  enforcer: string;
  lastRan: string;
  state: string;
}

export const STALE_DAYS = 14;
export const MAX_OPEN_PRS = 5;
export const QA_OWNED = /^(test\/qa\/|test\/qa-explore\/|test\/real-pc\/journeys\/|test\/real-pc\/gate\.txt$|test\/e2e\/qa-)/;

function tsv(text: string): Record<string, string>[] {
  const [head, ...rows] = text.split('\n').filter((l) => l.trim() && !l.startsWith('#'));
  const cols = (head ?? '').split('\t');
  return rows.map((r) => Object.fromEntries(r.split('\t').map((v, i) => [cols[i] ?? `c${i}`, v.trim()])));
}

export const parseBatches = (text: string): Batch[] =>
  tsv(text).map((r) => ({
    id: r.batch ?? '',
    features: (r.features ?? '')
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean),
    state: (r.state ?? 'draft') as Batch['state'],
    usedOn: r.used_on ?? '',
  }));

export const parseLayers = (text: string): Layer[] =>
  tsv(text).map((r) => ({
    layer: r.layer ?? '',
    replaces: r.replaces ?? '',
    enforcer: r.enforcer ?? '',
    lastRan: r.last_ran ?? '',
    state: r.state ?? '',
  }));

/** L1: one active batch, built only after the batch before it was used; nothing switched on beyond it. */
export function checkBatches(batches: Batch[], featuresOn: string[]): string[] {
  const problems: string[] = [];
  const active = batches.filter((b) => b.state === 'active');
  if (active.length !== 1) problems.push(`L1: docs/batches.tsv needs exactly one active batch (found ${active.length})`);
  batches.forEach((b, i) => {
    if (b.state !== 'active' || i === 0) return;
    const prev = batches[i - 1]!;
    if (prev.state !== 'done' || !prev.usedOn)
      problems.push(`L1: ${b.id} is active but ${prev.id} is not done with a used_on date (Vikas uses each batch for a day first)`);
  });
  const allowed = new Set(batches.filter((b) => b.state === 'active' || b.state === 'done').flatMap((b) => b.features));
  for (const f of featuresOn)
    if (!allowed.has(f)) problems.push(`L1: feature "${f}" is switched on but is not in the active or a done batch`);
  return problems;
}

const daysBetween = (a: string, b: Date) => (b.getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000;

/** L3: each layer names what it replaces and its enforcer; weekly, a running layer must have run in 14 days. */
export function checkLayers(layers: Layer[], today: Date, weekly: boolean): string[] {
  const problems: string[] = [];
  for (const l of layers) {
    if (!['running', 'retired'].includes(l.state)) problems.push(`L3: "${l.layer}" has state "${l.state}" (running or retired)`);
    if (l.state === 'retired') continue;
    if (!l.enforcer) problems.push(`L3: "${l.layer}" names no enforcer (write "words only" if that is the truth)`);
    if (!l.replaces) problems.push(`L3: "${l.layer}" does not say what it replaces`);
    if (weekly && (!l.lastRan || daysBetween(l.lastRan, today) > STALE_DAYS))
      problems.push(`L3: "${l.layer}" has not run since ${l.lastRan || 'ever'}: run it or retire it`);
  }
  return problems;
}

/** L4: app code and QA-owned tests do not change in the same PR unless a commit explains why. */
export function checkQaSplit(files: string[], text: string): string[] {
  const app = files.some((f) => f.startsWith('src/'));
  const qa = files.filter((f) => QA_OWNED.test(f));
  if (!app || !qa.length || /^QA-Split:\s*\S/m.test(text)) return [];
  return [`L4: this PR changes app code and QA-owned tests (${qa.join(', ')}); split it, or add a "QA-Split: <why>" trailer`];
}

/** L4: a ready PR that changes app code shows its proof, or says it is a pre-check only. */
export function checkProof(files: string[], body: string, draft: boolean): string[] {
  if (draft || !files.some((f) => f.startsWith('src/'))) return [];
  if (/pre-check only/i.test(body)) return [];
  const block = body.split(/^#+\s*Proof\b|^Proof:/im)[1];
  if (block && /\b[0-9a-f]{7,40}\b/.test(block) && /\.png\b/i.test(block) && /\b(summary|thread|record)\b/i.test(block)) return [];
  return ['L4: a ready PR that changes src/ needs a Proof block (main or head sha, the step record, the screenshot) or "pre-check only"'];
}

interface GhRef {
  ref: string;
}
interface GhPr {
  state: string;
  merged_at: string | null;
  head: { ref: string };
}

/** L6: open PRs at or under the cap; no branch whose PR was merged or closed. */
export function checkCaps(openPrs: number, branches: string[], closedPrBranches: string[]): string[] {
  const problems: string[] = [];
  if (openPrs > MAX_OPEN_PRS) problems.push(`L6: ${openPrs} open PRs (cap ${MAX_OPEN_PRS})`);
  const done = new Set(closedPrBranches);
  const stale = branches.filter((b) => done.has(b));
  if (stale.length) problems.push(`L6: ${stale.length} branches left from merged or closed PRs (first: ${stale.slice(0, 5).join(', ')})`);
  return problems;
}

async function gh<T>(path: string): Promise<T[]> {
  const repo = process.env.GITHUB_REPOSITORY ?? 'vikas53953/foo-agent';
  const out: T[] = [];
  for (let page = 1; page < 20; page++) {
    const res = await fetch(`https://api.github.com/repos/${repo}/${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`, {
      headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json' },
    });
    if (!res.ok) throw new Error(`GitHub ${path}: ${res.status}`);
    const rows = (await res.json()) as T[];
    out.push(...rows);
    if (rows.length < 100) break;
  }
  return out;
}

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

async function main() {
  const { values } = parseArgs({
    options: {
      weekly: { type: 'boolean', default: false },
      base: { type: 'string' },
      body: { type: 'string' },
      draft: { type: 'boolean', default: false },
    },
  });
  const problems: string[] = [];
  const featuresOn = (JSON.parse(readFileSync('resources/features.json', 'utf8')) as { on: string[] }).on;
  problems.push(...checkBatches(parseBatches(readFileSync('docs/batches.tsv', 'utf8')), featuresOn));
  problems.push(...checkLayers(parseLayers(readFileSync('docs/pipeline-layers.tsv', 'utf8')), new Date(), values.weekly));

  let base = values.base;
  let body = values.body ?? '';
  let draft = values.draft;
  let head = 'HEAD';
  if (!base && process.env.GITHUB_EVENT_PATH) {
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')) as Record<string, unknown>;
    const pr = event.pull_request as { base: { sha: string }; head: { sha: string }; body: string | null; draft: boolean } | undefined;
    if (pr) {
      base = pr.base.sha;
      head = pr.head.sha;
      body = pr.body ?? '';
      draft = pr.draft;
    }
  }
  if (base) {
    const files = git('diff', '--name-only', '--no-renames', `${base}...${head}`).split('\n').filter(Boolean);
    const text = `${git('log', '--format=%B', `${base}..${head}`)}\n${body}`;
    problems.push(...checkQaSplit(files, text), ...checkProof(files, body, draft));
  }

  if (values.weekly) {
    if (!process.env.GITHUB_TOKEN) problems.push('L6: GITHUB_TOKEN is not set, so the caps were not counted');
    else {
      const open = await gh<GhPr>('pulls?state=open');
      const closed = await gh<GhPr>('pulls?state=closed');
      const branches = (await gh<GhRef & { name: string }>('branches')).map((b) => b.name);
      const protectedNames = new Set(['main', 'evidence']);
      problems.push(
        ...checkCaps(
          open.length,
          branches.filter((b) => !protectedNames.has(b)),
          closed.map((p) => p.head.ref).filter((r) => !open.some((o) => o.head.ref === r)),
        ),
      );
    }
  }

  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log(`pipeline-check: batches, layers${base ? ', QA split, proof' : ''}${values.weekly ? ', caps' : ''} OK`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) void main();
