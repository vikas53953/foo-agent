// Spec: project testing rule §4–10 (Vikas 2026-10-21); 11-fidelity §11.2 (evidence beside every result); CR-0054 (batch
// 1: install, ai, name, chat, settings); Vikas 2026-10-27 "professionals test the actual app, every feature, like a user,
// and visually". The release gate's second half. The first half (release-gate.yml) drives the PACKAGED app with a real AI
// through test/real-pc/gate.txt and keeps every picture, video and step record. This script:
//   review  a separate reviewer (Sonnet, through the API, never the builder) looks at each picture beside the walkthrough
//           frame it names and the step's expected outcome, and says works / wrong-design / broken with plain reasons;
//   report  one HTML page per run: a verdict per feature, every checkpoint with its picture, reference and reason, the
//           waiting-state timeline, every control the sweeps clicked, and the other checks on the same commit.
// The gate passes only when every batch-1 feature is "works" and every other check on the commit is green.
//
// Usage:
//   tsx scripts/release-gate.ts review --runs <dir> --refs <dir> --out <dir> [--model claude-sonnet-5-5]
//   tsx scripts/release-gate.ts report --runs <dir> --refs <dir> --out <dir> [--checks <checks.json>] [--sha <sha>]
//   tsx scripts/release-gate.ts refs --runs <dir>   (prints the walkthrough ids the run names, for golden-render --ids)
// Exit code (report): 0 PASS, 1 FAIL (a feature is not "works" or a check is red), 2 BLOCKED (nothing ran or no review).
import Anthropic from '@anthropic-ai/sdk';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const GATE_FEATURES = ['install', 'ai', 'name', 'chat', 'settings', 'refusals'] as const;
const FEATURE_NAMES: Record<string, string> = {
  install: 'Install and open foo (the app as downloaded, restart, quit)',
  ai: 'Connect your AI (find it, your own key, a wrong key)',
  name: 'Name, face and vibe',
  chat: 'Just chatting, in your language',
  settings: 'Settings, by page or by asking',
  refusals: 'What batch 1 must refuse plainly (tasks, memory)',
  unassigned: 'Steps no feature claims (a failure here still turns the gate red)',
};
export type Verdict = 'works' | 'wrong-design' | 'broken';

interface StepResult {
  i: number;
  do: string;
  ok?: boolean;
  soft?: boolean;
  expect?: string;
  ref?: string;
  feature?: string;
  typed?: string;
  shot?: string;
  errorShot?: string;
  error?: string;
  refused?: string;
  lastReply?: string;
  firstReplyMs?: number | null;
  forbidden?: { badge: string; at: number };
  neverSeenMs?: number;
  didntGetThat?: boolean;
  stillWorking?: boolean;
  timeline?: { at: number; badges: string[]; reactions: string[]; thinking: boolean; streaming: number }[];
  watchShots?: { at: number; mark: number; shot: string; badges: string[]; thinking: boolean }[];
  truncated?: number;
  controls?: { tid: string; name: string; status: string; effect: string[]; issues: unknown[]; shot?: string; reason?: string }[];
  blocked?: string;
}
interface Summary {
  journey: string;
  title: string;
  feature?: string;
  videos?: string[];
  results: StepResult[];
}
export interface Checkpoint {
  id: string;
  journey: string;
  dir: string;
  feature: string;
  kind: 'answer' | 'waiting' | 'step' | 'sweep';
  shot?: string;
  expect: string;
  ref?: string;
  facts: string[];
  /** A failure the driver measured itself (a step that did not happen, 👀 seen, a dead control): no reviewer can overrule it. */
  measured?: string;
}
interface Review {
  id: string;
  verdict: Verdict;
  summary: string;
  problems: string[];
  by: string;
}

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);

export function loadRuns(runs: string): { dir: string; s: Summary }[] {
  if (!existsSync(runs)) return [];
  const out: { dir: string; s: Summary }[] = [];
  // Parts of a sharded run sit one level deeper (runs/s0/<stamp>-<journey>/).
  const walk = (d: string, depth: number) => {
    for (const n of readdirSync(d, { withFileTypes: true })) {
      if (!n.isDirectory()) continue;
      const p = join(d, n.name);
      if (existsSync(join(p, 'summary.json'))) out.push({ dir: p, s: JSON.parse(readFileSync(join(p, 'summary.json'), 'utf8')) });
      else if (depth < 2) walk(p, depth + 1);
    }
  };
  walk(runs, 0);
  return out.sort((a, b) => basename(a.dir).localeCompare(basename(b.dir)));
}

// pass^k: a journey run k times appears k times, as G2-chat, G2-chat·2, G2-chat·3; every round counts, none is re-run.
const runTag = (runs: { dir: string; s: Summary }[], dir: string) => {
  const same = runs.filter((x) => x.s.journey === runs.find((y) => y.dir === dir)!.s.journey);
  const k = same.findIndex((x) => x.dir === dir);
  return k > 0 ? `${same[0]!.s.journey}·${k + 1}` : same[0]!.s.journey;
};
const sec = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/** Every point the gate judges, in run order. Pure, so the unit test can feed it a summary. */
export function checkpoints(runs: { dir: string; s: Summary }[]): Checkpoint[] {
  const cps: Checkpoint[] = [];
  for (const { dir, s } of runs) {
    const tag = runTag(runs, dir);
    for (const r of s.results) {
      const feature = r.feature ?? s.feature ?? 'unassigned';
      const id = `${tag}#${r.i}`;
      const facts: string[] = [];
      if (r.typed) facts.push(`The user typed: "${r.typed}"`);
      if (r.firstReplyMs != null) facts.push(`First reply after ${sec(r.firstReplyMs)}`);
      if (r.lastReply) facts.push(`foo's reply, as text: "${r.lastReply.slice(0, 600)}"`);
      // The journey's own neverCss (CR-0066): what must never show while foo answers, here 👀.
      const forbidden = r.forbidden ?? (r.neverSeenMs !== undefined ? { badge: 'seen', at: r.neverSeenMs } : undefined);
      const failed = (r.ok === false && !r.soft) || !!forbidden;
      let measured: string | undefined;
      if (failed) {
        if (forbidden)
          measured = `${forbidden.badge === 'seen' ? '👀' : forbidden.badge} showed on the user's message ${sec(forbidden.at)} after sending`;
        else if (r.blocked) measured = `could not run: ${r.blocked}`;
        else if (r.didntGetThat) measured = 'foo answered "I didn\'t get that" to a clear message';
        else if (r.stillWorking) measured = 'foo was still writing when the step gave up';
        else if (r.do === 'sweep')
          measured = 'a control did nothing visible, could not be clicked, or broke the screen (see the sweep table)';
        else measured = r.error ? `step failed: ${r.error}` : `step "${r.do}" did not reach its end state`;
      }
      if (r.do === 'sweep') {
        cps.push({
          id,
          journey: tag,
          dir,
          feature,
          kind: 'sweep',
          expect: r.expect ?? 'every control does something visible',
          facts,
          measured,
        });
        continue;
      }
      for (const w of r.watchShots ?? []) {
        cps.push({
          id: `${id}@${w.mark}`,
          journey: tag,
          dir,
          feature,
          kind: 'waiting',
          shot: w.shot,
          ref: r.ref,
          expect:
            `WHILE WAITING, ${sec(w.at)} after the user sent "${r.typed ?? '(previous message)'}", before foo's answer was complete. ` +
            `The screen must show plainly that foo is working on it (the Thinking row: foo's small face where typing dots would be). ` +
            `The user's own message must not carry 👀. Nothing may be stuck, blank or overlapping.`,
          facts: [
            `Badges on the user's message at this moment: ${w.badges.join(', ') || 'none'}`,
            `Thinking row: ${w.thinking ? 'shown' : 'not shown'}`,
          ],
          measured: forbidden && forbidden.at <= w.at + 300 ? `👀 on the user's message at ${sec(forbidden.at)}` : undefined,
        });
      }
      const shot = r.shot ?? r.errorShot;
      if (!shot && !failed) continue;
      // A send's own record is folded into the waitReply that follows it; its typed text is shown there.
      if (r.do === 'send' && !shot) continue;
      cps.push({
        id,
        journey: tag,
        dir,
        feature,
        kind: r.do === 'waitReply' ? 'answer' : 'step',
        shot,
        ref: r.ref,
        expect: r.expect ?? `step "${r.do}" works`,
        facts,
        measured,
      });
    }
  }
  // The typed text belongs to the send; give it to the next answer of the same journey.
  for (const { dir, s } of runs) {
    const tag = runTag(runs, dir);
    s.results.forEach((r, k) => {
      if (r.do !== 'send' || !r.typed) return;
      const next = s.results.slice(k + 1).find((x) => x.do === 'waitReply');
      const cp = next && cps.find((c) => c.id === `${tag}#${next.i}`);
      if (cp && !cp.facts.some((f) => f.startsWith('The user typed'))) cp.facts.unshift(`The user typed: "${r.typed}"`);
      for (const w of cps.filter((c) => next && c.id.startsWith(`${tag}#${next.i}@`)))
        w.expect = w.expect.replace('"(previous message)"', `"${r.typed}"`);
    });
  }
  return cps;
}

/** Per feature: broken beats wrong-design beats works; a feature with no checkpoint is not tested. */
/** A journey round the run was meant to have but has no record of (the driver crashed before writing it) is broken
 * for every feature it covers: pass^k counts the rounds that should have run, not the ones that happened to finish. */
export function missingRuns(
  runs: { dir: string; s: Summary }[],
  expected: { journey: string; features: string[]; count: number }[],
): Checkpoint[] {
  const out: Checkpoint[] = [];
  for (const e of expected) {
    const found = runs.filter((r) => r.s.journey === e.journey).length;
    for (let k = found; k < e.count; k++)
      for (const feature of e.features)
        out.push({
          id: `${e.journey}·${k + 1}#missing`,
          journey: e.journey,
          dir: '',
          feature,
          kind: 'step',
          expect: `${e.journey} round ${k + 1} runs to the end`,
          facts: [],
          measured: `${e.journey} round ${k + 1} left no record: it crashed or never ran`,
        });
  }
  return out;
}

/** A failure the team already knows about (test/real-pc/known-red.json). It is named on the report with its owner and fix,
 * and it still turns the gate red: there are no known-red waivers. */
export interface KnownRed {
  journey: string;
  /** The step number in the journey; left out, every step of the journey matches. */
  step?: number;
  bug: string;
  owner: string;
  fix: string;
}
export function knownRedFor(c: Checkpoint, known: KnownRed[]): KnownRed | undefined {
  const step = Number(c.id.split('#')[1]?.split('@')[0]);
  return known.find((k) => k.journey === c.journey.split('·')[0] && (k.step === undefined || k.step === step));
}

/** The other checks a release needs green on the same commit; one that is missing or skipped is not green. */
export const REQUIRED_CHECKS = [
  { prefix: 'Fast lane', count: 1 },
  { prefix: 'Full suite', count: 4 },
  { prefix: 'Golden lane', count: 1 },
];
export function checkRows(checks: { name: string; conclusion: string | null; url?: string }[]) {
  const rows = checks.map((c) => ({
    ...c,
    green: c.conclusion === 'success' || (c.conclusion === 'skipped' && c.name.startsWith('Screen change')),
  }));
  for (const r of REQUIRED_CHECKS) {
    const n = checks.filter((c) => c.name.startsWith(r.prefix)).length;
    for (let k = n; k < r.count; k++) rows.push({ name: `${r.prefix} (missing on this commit)`, conclusion: null, green: false });
  }
  return rows;
}

/** Measured beats reviewed; a sweep is judged by what it measured (every control did something), not by a reviewer. */
export function verdictOf(c: Checkpoint, reviews: Map<string, Review>): Verdict | 'not-reviewed' {
  if (c.measured) return 'broken';
  if (c.kind === 'sweep' || (!c.shot && c.kind === 'step')) return 'works';
  const v = reviews.get(c.id)?.verdict;
  return v === 'works' || v === 'wrong-design' || v === 'broken' ? v : 'not-reviewed';
}

export function featureVerdicts(cps: Checkpoint[], reviews: Map<string, Review>) {
  // Any failed journey turns the gate red: a checkpoint outside the batch-1 features gets its own row, never dropped.
  const extra = [...new Set(cps.map((c) => c.feature))].filter((f) => !(GATE_FEATURES as readonly string[]).includes(f));
  return [...GATE_FEATURES, ...extra].map((f) => {
    const mine = cps.filter((c) => c.feature === f);
    const v = mine.map((c) => verdictOf(c, reviews));
    const verdict = !mine.length
      ? 'not-tested'
      : v.includes('broken')
        ? 'broken'
        : v.includes('not-reviewed')
          ? 'not-reviewed'
          : v.includes('wrong-design')
            ? 'wrong-design'
            : 'works';
    return {
      feature: f,
      name: FEATURE_NAMES[f] ?? f,
      verdict,
      checkpoints: mine.length,
      broken: v.filter((x) => x === 'broken').length,
      wrong: v.filter((x) => x === 'wrong-design').length,
    };
  });
}

interface UxFrame {
  id: string;
  title: string;
  c: string;
  s: string;
  f: string;
}
const manifest = () =>
  JSON.parse(readFileSync(join('golden', 'manifest.json'), 'utf8')) as { ux: UxFrame[]; superseded: { id: string; decision: string }[] };
const refFile = (refs: string, id: string | undefined, dark: boolean) => {
  if (!id) return undefined;
  const f = join(refs, 'ux', `${id}.${dark ? 'dark' : 'light'}.png`);
  return existsSync(f) ? f : undefined;
};
const png = (f: string) => ({
  type: 'image' as const,
  source: { type: 'base64' as const, media_type: 'image/png' as const, data: readFileSync(f).toString('base64') },
});

const SYSTEM = `You are an independent QA reviewer for "foo", a WhatsApp-style personal assistant app for Windows. You did not build it and you owe the builders nothing. You look at one screenshot of the real packaged app, taken while a test robot used it like an ordinary non-technical person, often with a real AI that takes several seconds to answer.

Judge what a user would see. Give one verdict:
- "works": the screen does what the expected outcome says and looks like a finished, polished product of the reference design.
- "wrong-design": it works, but differs from the reference design or the expected outcome in a way a user would notice (layout, spacing, missing or extra element, wrong words, jargon, clipped or overlapping text, wrong colours, emoji that should not be there).
- "broken": the expected outcome did not happen, or the screen shows an error, a blank or white area, something stuck, overlapping controls covering words, a crash, a fake confirmation, or a reply that ignores what the user wrote.

Rules:
- The expected outcome is the current approved behaviour and wins where it differs from the reference picture. The reference is the original walkthrough frame: use it for look and feel, layout and tone, not for exact data (names, times, prices and chat history differ). The test build has only five features on, so the reference may show helpers, filters, a side panel, money lines or other chats that this build rightly hides; their absence is not a fault.
- Batch 1 must not show job filter chips, a spend line, "later batch"/"test version" jargon, or 👀 on a plain chat message.
- Be specific: name the element and what is wrong in plain words. Do not invent problems you cannot see. Do not pass something because it is close.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'summary', 'problems'],
  properties: {
    verdict: { type: 'string', enum: ['works', 'wrong-design', 'broken'] },
    summary: { type: 'string', description: 'One plain sentence a non-technical person understands.' },
    problems: { type: 'array', items: { type: 'string' }, description: 'Each visible problem, one per item; empty when it works.' },
  },
};

async function review() {
  const runs = opt('--runs')!;
  const refs = opt('--refs') ?? 'gate-refs';
  const out = opt('--out')!;
  const model = opt('--model') ?? 'claude-sonnet-5-5';
  mkdirSync(out, { recursive: true });
  const ux = new Map(manifest().ux.map((u) => [u.id, u]));
  const cps = checkpoints(loadRuns(runs)).filter((c) => c.shot && !c.measured);
  const client = new Anthropic();
  const reviews: Review[] = [];
  let next = 0;
  const worker = async () => {
    while (next < cps.length) {
      const c = cps[next++]!;
      const frame = c.ref ? ux.get(c.ref) : undefined;
      const dark = /dark/i.test(c.shot!) && !/light/i.test(c.shot!);
      const ref = refFile(refs, c.ref, dark);
      const text = [
        `Feature: ${FEATURE_NAMES[c.feature] ?? c.feature}`,
        `Expected outcome: ${c.expect}`,
        ...c.facts,
        frame
          ? `Reference walkthrough frame ${frame.id} (${frame.title}). The user: ${frame.c} They see: ${frame.s} foo: ${frame.f}`
          : 'No reference frame for this step: judge against the expected outcome and general polish.',
        'Image 1 is the real app. ' + (ref ? 'Image 2 is the reference design.' : ''),
      ].join('\n');
      try {
        const content: Anthropic.Beta.BetaContentBlockParam[] = [png(join(c.dir, c.shot!))];
        if (ref) content.push(png(ref));
        content.push({ type: 'text', text });
        const res = await client.beta.messages.create({
          model,
          max_tokens: 4000,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
          system: SYSTEM,
          messages: [{ role: 'user', content }],
        });
        if (res.stop_reason === 'refusal') throw new Error('the reviewer declined');
        const t = res.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text');
        const v = JSON.parse(t?.text ?? '{}') as Omit<Review, 'id' | 'by'>;
        reviews.push({ id: c.id, ...v, by: res.model });
        console.log(`${c.id}: ${v.verdict} · ${v.summary}`);
      } catch (e) {
        // No verdict is not a pass: the checkpoint stays "not-reviewed" and the gate is blocked.
        console.error(`${c.id}: review failed: ${e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : String(e)}`);
      }
    }
  };
  await Promise.all([1, 2, 3, 4].map(worker));
  writeFileSync(join(out, 'review.json'), JSON.stringify(reviews, null, 2));
  console.log(`reviewed ${reviews.length} of ${cps.length} pictures`);
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
const LABEL: Record<string, string> = {
  works: 'Works',
  'wrong-design': 'Works but wrong vs design',
  broken: 'Broken',
  'not-tested': 'Not tested',
  'not-reviewed': 'Not reviewed',
};

function report() {
  const runsDir = opt('--runs')!;
  const refs = opt('--refs') ?? 'gate-refs';
  const out = opt('--out')!;
  const sha = opt('--sha') ?? '';
  mkdirSync(join(out, 'shots'), { recursive: true });
  const runs = loadRuns(runsDir);
  // --expect given but the file is gone (a lost upload) must not quietly drop the every-round check.
  const expectFile = opt('--expect');
  const known: KnownRed[] = opt('--known') && existsSync(opt('--known')!) ? JSON.parse(readFileSync(opt('--known')!, 'utf8')) : [];
  if (expectFile && !existsSync(expectFile)) {
    console.error(`release gate: BLOCKED · ${expectFile} is missing, so the rounds that should have run are unknown`);
    process.exit(2);
  }
  const expected = expectFile ? JSON.parse(readFileSync(expectFile, 'utf8')) : [];
  const cps = [...checkpoints(runs), ...missingRuns(runs, expected)];
  const reviewFile = join(out, 'review.json');
  const reviews = new Map<string, Review>(
    existsSync(reviewFile) ? (JSON.parse(readFileSync(reviewFile, 'utf8')) as Review[]).map((r) => [r.id, r]) : [],
  );
  const checks: { name: string; conclusion: string | null; url?: string }[] =
    opt('--checks') && existsSync(opt('--checks')!) ? JSON.parse(readFileSync(opt('--checks')!, 'utf8')) : [];
  const feats = featureVerdicts(cps, reviews);
  const rows = checkRows(checks);
  const status =
    !runs.length || feats.some((f) => f.verdict === 'not-reviewed')
      ? 'BLOCKED'
      : feats.every((f) => f.verdict === 'works') && rows.every((c) => c.green)
        ? 'PASS'
        : 'FAIL';

  const copy = (dir: string, f?: string) => {
    if (!f || !existsSync(join(dir, f))) return undefined;
    const name = `${basename(dir)}-${f}`.replace(/[^\w.-]+/g, '_');
    copyFileSync(join(dir, f), join(out, 'shots', name));
    return `shots/${name}`;
  };
  const refCopy = (id?: string) => {
    const f = refFile(refs, id, false);
    if (!f) return undefined;
    mkdirSync(join(out, 'refs'), { recursive: true });
    copyFileSync(f, join(out, 'refs', basename(f)));
    return `refs/${basename(f)}`;
  };

  const knownLine = (c: Checkpoint) => {
    const k = knownRedFor(c, known);
    return k
      ? `<p><b>Known red:</b> ${esc(k.bug)} · owner ${esc(k.owner)} · fix ${esc(k.fix)} (still blocks the release)</p>`
      : '<p class="bad"><b>New failure:</b> not on the known-red list.</p>';
  };
  const failures = cps.filter((c) => verdictOf(c, reviews) === 'broken');
  const failureRows = failures
    .map((c) => {
      const k = knownRedFor(c, known);
      return `<tr><td><code>${esc(c.id)}</code></td><td>${esc(c.measured ?? 'the reviewer found it broken')}</td><td>${k ? `known: ${esc(k.bug)}, ${esc(k.owner)}, fix ${esc(k.fix)}` : '<b class="bad">new</b>'}</td></tr>`;
    })
    .join('');
  const featureRows = feats
    .map(
      (f) =>
        `<tr><td>${esc(f.name)}</td><td><span class="v ${f.verdict}">${LABEL[f.verdict]}</span></td><td>${f.checkpoints}</td><td>${f.broken}</td><td>${f.wrong}</td></tr>`,
    )
    .join('');
  const cards = feats
    .map(({ feature: f }) => {
      const mine = cps.filter((c) => c.feature === f);
      if (!mine.length)
        return `<section><h2>${esc(FEATURE_NAMES[f] ?? f)}</h2><p class="muted">No journey reached this feature: not tested, so the gate fails.</p></section>`;
      const items = mine
        .map((c) => {
          const v = verdictOf(c, reviews);
          const r = reviews.get(c.id);
          const run = runs.find((x) => x.dir === c.dir);
          const step = run?.s.results.find((x) => `${runTag(runs, c.dir)}#${x.i}` === c.id.split('@')[0]);
          const shot = copy(c.dir, c.shot);
          const ref = refCopy(c.ref);
          const timeline = step?.timeline?.length
            ? `<details><summary>What the user saw while waiting</summary><table class="small"><tr><th>after</th><th>badge on my message</th><th>Thinking row</th><th>foo writing</th></tr>${step.timeline
                .map(
                  (t) =>
                    `<tr><td>${sec(t.at)}</td><td>${esc(t.badges.map((b) => (b === 'seen' ? '👀' : b)).join(' ') || '—')}</td><td>${t.thinking ? 'yes' : '—'}</td><td>${t.streaming ? 'yes' : '—'}</td></tr>`,
                )
                .join('')}</table></details>`
            : '';
          const sweep = step?.controls?.length
            ? `${step.truncated ? `<p class="bad">${step.truncated} more controls on this screen were not clicked (cap reached).</p>` : ''}<table class="small"><tr><th>control</th><th>result</th><th>what happened</th></tr>${step.controls
                .map(
                  (k) =>
                    `<tr class="${k.status}"><td>${esc(k.name || k.tid)}<br><code>${esc(k.tid)}</code></td><td>${esc(k.status)}</td><td>${esc([...k.effect, k.reason ?? '', ...k.issues.map((i) => JSON.stringify(i).slice(0, 160))].filter(Boolean).join(' · '))}${k.shot ? ` <a href="${copy(c.dir, k.shot)}">picture</a>` : ''}</td></tr>`,
                )
                .join('')}</table>`
            : step?.blocked
              ? `<p class="muted">${esc(step.blocked)}</p>`
              : '';
          return `<article class="cp"><header><span class="v ${v}">${LABEL[v]}</span> <b>${esc(c.kind === 'waiting' ? 'While waiting' : c.kind === 'sweep' ? 'Every control clicked' : 'Step')}</b> <code>${esc(c.id)}</code></header>
<p><b>Expected:</b> ${esc(c.expect)}</p>
${c.measured ? `<p class="bad"><b>Measured:</b> ${esc(c.measured)}</p>${knownLine(c)}` : ''}
${r ? `<p><b>Reviewer:</b> ${esc(r.summary)}</p>${r.problems.length ? `<ul>${r.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}` : ''}
${c.facts.length ? `<p class="muted">${c.facts.map(esc).join('<br>')}</p>` : ''}
<div class="pics">${shot ? `<figure><a href="${shot}"><img src="${shot}" loading="lazy" alt=""></a><figcaption>The app</figcaption></figure>` : ''}${ref ? `<figure><a href="${ref}"><img src="${ref}" loading="lazy" alt=""></a><figcaption>Design ${esc(c.ref)}</figcaption></figure>` : ''}</div>
${timeline}${sweep}</article>`;
        })
        .join('');
      const fv = feats.find((x) => x.feature === f)!;
      return `<section><h2>${esc(FEATURE_NAMES[f] ?? f)} <span class="v ${fv.verdict}">${LABEL[fv.verdict]}</span></h2>${items}</section>`;
    })
    .join('');
  const videos = runs
    .flatMap(({ dir, s }) =>
      (s.videos ?? []).map(
        (v) => `<li>${esc(s.journey)}: <a href="videos/${esc(basename(dir))}/${esc(basename(v))}">${esc(basename(v))}</a></li>`,
      ),
    )
    .join('');
  const checkHtml = rows
    .map(
      (c) =>
        `<tr><td>${esc(c.name)}</td><td><span class="v ${c.green ? 'works' : 'broken'}">${esc(c.conclusion ?? 'missing or not finished')}</span></td></tr>`,
    )
    .join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>foo release gate</title>
<style>
:root{--bg:#fff;--fg:#14161a;--muted:#5d6470;--line:#e3e6ea;--ok:#0f7b3f;--okbg:#e5f5ec;--warn:#8a5a00;--warnbg:#fff3d6;--bad:#b42318;--badbg:#fde8e7;--card:#f7f8fa}
@media (prefers-color-scheme:dark){:root{--bg:#121417;--fg:#e8eaed;--muted:#9aa1ab;--line:#2a2e34;--ok:#5fd393;--okbg:#14301f;--warn:#f2c14e;--warnbg:#3a2e10;--bad:#ff8a80;--badbg:#3b1514;--card:#1a1d21}}
body{margin:0;padding:16px;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,Segoe UI,sans-serif}main{max-width:1100px;margin:auto}
h1{font-size:24px;margin:0 0 4px}h2{font-size:19px;margin:32px 0 8px}.muted{color:var(--muted)}table{border-collapse:collapse;width:100%;margin:8px 0}td,th{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}
.small{font-size:13px}.v{display:inline-block;padding:1px 8px;border-radius:10px;font-size:13px;font-weight:600}.works{color:var(--ok);background:var(--okbg)}.wrong-design{color:var(--warn);background:var(--warnbg)}
.broken,.not-tested,.not-reviewed,.FAIL,.BLOCKED{color:var(--bad);background:var(--badbg)}.PASS{color:var(--ok);background:var(--okbg)}tr.fail td{color:var(--bad)}.bad{color:var(--bad)}
.cp{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px;margin:10px 0}.cp.works{background:var(--card)}.pics{display:flex;gap:8px;flex-wrap:wrap}.pics figure{margin:0;flex:1 1 300px;min-width:0}
.pics img{width:100%;border:1px solid var(--line);border-radius:6px}figcaption{font-size:12px;color:var(--muted)}code{font-size:12px;overflow-wrap:anywhere}.big{font-size:20px;padding:4px 14px}
</style></head><body><main>
<h1>foo release gate <span class="v big ${status}">${status}</span></h1>
<p class="muted">Commit ${esc(sha)} · the packaged app (the same files Vikas downloads) driven like a user with a real AI · pictures checked by a separate reviewer · ${new Date().toISOString()}</p>
<p>${status === 'PASS' ? 'Every batch-1 feature works and every other check on this commit is green: this build may go to Vikas.' : 'This build must not go to Vikas until every row below says Works.'}</p>
<h2>Features</h2><table><tr><th>Feature</th><th>Verdict</th><th>Checkpoints</th><th>Broken</th><th>Wrong vs design</th></tr>${featureRows}</table>
${failures.length ? `<h2>Every failure (${failures.length})</h2><table><tr><th>Where</th><th>What went wrong</th><th>Known red or new</th></tr>${failureRows}</table>` : ''}
<h2>Other checks on this commit</h2><table>${checkHtml}</table>
${videos ? `<h2>Videos</h2><p class="muted">In the run's release-gate-report download.</p><ul>${videos}</ul>` : ''}
${cards}
</main></body></html>`;
  writeFileSync(join(out, 'index.html'), html);
  writeFileSync(
    join(out, 'verdict.json'),
    JSON.stringify({ status, sha, features: feats, checks, reviewed: reviews.size, checkpoints: cps.length }, null, 2),
  );
  for (const { dir, s } of runs)
    for (const v of s.videos ?? []) {
      mkdirSync(join(out, 'videos', basename(dir)), { recursive: true });
      if (existsSync(join(dir, v))) copyFileSync(join(dir, v), join(out, 'videos', basename(dir), basename(v)));
    }
  console.log(`release gate: ${status} · ${feats.map((f) => `${f.feature} ${f.verdict}`).join(' · ')}`);
  process.exit(status === 'PASS' ? 0 : status === 'FAIL' ? 1 : 2);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (cmd === 'review')
    review().catch((e) => {
      console.error(e);
      process.exit(2);
    });
  else if (cmd === 'report') report();
  else if (cmd === 'refs') {
    const ids = new Set<string>();
    for (const { s } of loadRuns(opt('--runs')!)) for (const r of s.results) if (r.ref) ids.add(r.ref);
    console.log([...ids].join(','));
  } else {
    console.error('usage: release-gate.ts review|report|refs --runs <dir> ...');
    process.exit(2);
  }
}
