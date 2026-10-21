// Spec: docs/build-method.md §4 (review depth by risk tier, Vikas 2026-10-21) and .claude/skills/foo-review (R4). Reads the
// changed paths of a diff and prints the review tier the change needs. The tier comes from what changed, never from who
// wrote it. It never edits, pushes or merges.
// Usage: tsx scripts/review-tier.ts [--base origin/main] [--head HEAD] [--json]
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export type Tier = 'low' | 'normal' | 'high';

/** Paths where a quiet mistake reaches the user's money, keys, AI login, installer or the fidelity gates. */
export const HIGH: { name: string; re: RegExp }[] = [
  { name: 'CI workflows', re: /^\.github\// },
  { name: 'spec or golden', re: /^(?:spec|golden)\// },
  {
    name: 'fidelity gates',
    re: /^(?:OWNERS\.yml|playwright\.config\.ts|eslint-rules\/|scripts\/(?:fid-guard|golden-bless|trace-check|spec-verify|review-tier)\.ts$)/,
  },
  { name: 'installer', re: /^(?:electron-builder\.yml|resources\/)/ },
  { name: 'dependencies', re: /^(?:package\.json|pnpm-lock\.yaml)$/ },
  { name: 'keys and vault', re: /^src\/main\/(?:vault|secrets)\// },
  { name: 'spend approvals', re: /^src\/main\/approvals\// },
  { name: 'AI engine and finder', re: /^src\/main\/(?:engine-supervisor|setup)\// },
];

/** Paths that cannot change what the app does. */
const LOW = /^(?:docs\/|\.claude\/skills\/|[^/]+\.md$)/;

/** A diff this large gets at least the normal review even if every file is low. */
export const LOW_MAX_LINES = 400;

export interface TierResult {
  tier: Tier;
  reasons: string[];
}

export function reviewTier(files: readonly string[], changedLines = 0): TierResult {
  const hits = HIGH.filter((h) => files.some((f) => h.re.test(f))).map((h) => {
    const first = files.find((f) => h.re.test(f));
    return `${h.name} (${first})`;
  });
  if (hits.length) return { tier: 'high', reasons: hits };
  if (files.length && files.every((f) => LOW.test(f))) {
    if (changedLines > LOW_MAX_LINES) return { tier: 'normal', reasons: [`docs only, but ${changedLines} lines changed`] };
    return { tier: 'low', reasons: ['docs and skills only'] };
  }
  return { tier: 'normal', reasons: files.length ? ['app or test code'] : ['no changes'] };
}

export const REVIEW: Record<Tier, string> = {
  low: 'one Sonnet reviewer; no verify step',
  normal: 'Fable reviewer + verify step on every act-on finding',
  high: 'Fable + Opus reviewers + verify step; Vikas-only items stay his (docs/build-method.md §5)',
};

const git = (...a: string[]) => execFileSync('git', a, { encoding: 'utf8' });

function main() {
  const { values } = parseArgs({
    options: {
      base: { type: 'string', default: 'origin/main' },
      head: { type: 'string', default: 'HEAD' },
      json: { type: 'boolean', default: false },
    },
  });
  const range = `${values.base}...${values.head}`;
  const files = git('diff', '--name-only', '--no-renames', range).split('\n').filter(Boolean);
  const lines = git('diff', '--numstat', '--no-renames', range)
    .split('\n')
    .filter(Boolean)
    .reduce(
      (n, row) =>
        n +
        row
          .split('\t')
          .slice(0, 2)
          .reduce((s, v) => s + (Number(v) || 0), 0),
      0,
    );
  const result = reviewTier(files, lines);
  if (values.json) console.log(JSON.stringify({ ...result, files: files.length, lines, review: REVIEW[result.tier] }));
  else
    console.log(
      `review-tier: ${result.tier.toUpperCase()} (${files.length} files, ${lines} lines): ${REVIEW[result.tier]}\n  ${result.reasons.join('\n  ')}`,
    );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
