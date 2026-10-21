// Spec: 11-fidelity §11.5.3 FID-18 (every UX step and BP ref is mapped), FID-21 (X-189, CR-0031: spec coverage of built
// milestones). A milestone is built once its close-out wrote `docs/fidelity/<M>.audit.json`. Every UX step and BP ref of
// golden/manifest.json in a built milestone, and every trace.csv row of one, needs a `live` trace row whose test file
// exists; superseded steps (manifest `superseded`) are exempt. Known gaps are listed, each with its reason, in
// `docs/fidelity/coverage-gaps.json`; a new gap fails, and so does a listed one that is no longer a gap (the list only
// shrinks; adding to it needs a CR, fid-guard FID-06). The 4 browser screens UX-14/15 that never got built would have failed here.
// Usage: tsx scripts/coverage-check.ts
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTrace } from './trace-check';

export const GAPS_FILE = 'docs/fidelity/coverage-gaps.json';

interface ManifestItem {
  id: string;
  milestone?: string | null;
}
export interface CoverageInput {
  manifest: { ux: ManifestItem[]; bp: ManifestItem[]; superseded: { id: string }[] };
  trace: string;
  built: ReadonlySet<string>;
  gaps: Record<string, string>;
  fileExists: (path: string) => boolean;
}

/** Ids of built milestones that have no live trace row with an existing test file, each with why. */
export function findGaps(input: CoverageInput): Map<string, string> {
  const { rows } = readTrace(input.trace);
  const superseded = new Set(input.manifest.superseded.map((s) => s.id));
  const live = new Set<string>();
  const want = new Map<string, string>();
  for (const r of rows) {
    const file = (r.cells['Test file'] ?? '').split('\\').join('/');
    const ok = r.cells.Status === 'live' && input.fileExists(file);
    for (const id of r.ids) {
      if (ok) live.add(id);
      if (input.built.has(r.cells.Milestone ?? '')) want.set(id, r.cells.Milestone!);
    }
  }
  for (const item of [...input.manifest.ux, ...input.manifest.bp])
    if (item.milestone && input.built.has(item.milestone)) want.set(item.id, item.milestone);
  const gaps = new Map<string, string>();
  for (const [id, m] of want) if (!live.has(id) && !superseded.has(id)) gaps.set(id, `${m}: no live trace row with an existing test file`);
  return gaps;
}

export function checkCoverage(input: CoverageInput): string[] {
  const gaps = findGaps(input);
  const problems: string[] = [];
  for (const [id, why] of gaps)
    if (!(id in input.gaps)) problems.push(`FID-21: ${id} (${why}). Build and test it, or list it in ${GAPS_FILE} with a CR`);
  for (const id of Object.keys(input.gaps)) if (!gaps.has(id)) problems.push(`FID-21: ${id} is covered now; remove it from ${GAPS_FILE}`);
  for (const [id, reason] of Object.entries(input.gaps)) if (!reason.trim()) problems.push(`FID-21: ${id} in ${GAPS_FILE} has no reason`);
  return problems;
}

export function repoInput(): CoverageInput {
  return {
    manifest: JSON.parse(readFileSync(join('golden', 'manifest.json'), 'utf8')) as CoverageInput['manifest'],
    trace: readFileSync(join('spec', 'trace.csv'), 'utf8'),
    built: new Set(
      readdirSync(join('docs', 'fidelity'))
        .filter((f) => f.endsWith('.audit.json'))
        .map((f) => f.slice(0, -'.audit.json'.length)),
    ),
    gaps: existsSync(GAPS_FILE) ? (JSON.parse(readFileSync(GAPS_FILE, 'utf8')) as { gaps: Record<string, string> }).gaps : {},
    fileExists: (p) => p !== '' && existsSync(p),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const input = repoInput();
  const problems = checkCoverage(input);
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log(
    `FID-21: built milestones ${[...input.built].sort().join(', ')} covered; ${Object.keys(input.gaps).length} known gaps listed`,
  );
}
