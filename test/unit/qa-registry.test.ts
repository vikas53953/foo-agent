// Spec: project testing rule §7 (every feature maps to a test; gaps fail CI), Vikas's QA ask of 2026-10-25 (30–50 batch-1
// scenarios with negative cases), CR-0054 (batch 1). Keeps test/qa/scenarios.ts honest: every scenario names a test file
// that exists and a title that file really holds, ids are unique, and each batch-1 feature has a negative case. (Whether the
// test passes is `pnpm qa`'s job; a title that no longer matches also shows there as "could not run".)
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FEATURES } from '../../src/shared/features';
import { SCENARIOS } from '../qa/scenarios';

const runnable = SCENARIOS.filter((s) => s.layer === 'vitest' || s.layer === 'playwright');

/** The test's own title: the full name minus any describe() title the file holds. */
function leaf(file: string, test: string): string {
  const src = readFileSync(file, 'utf8');
  const describes = [...src.matchAll(/describe\((['`"])(.+?)\1/g)].map((m) => m[2]!.replace(/\$\{\w+\}/g, '').trim());
  for (const d of describes.sort((a, b) => b.length - a.length)) if (test.startsWith(`${d} `)) return test.slice(d.length + 1);
  return test;
}
/** A title as it can appear in source: as typed, with \' escapes, or with a ${…} part. */
function holds(src: string, title: string): boolean {
  if (src.includes(title) || src.includes(title.replace(/'/g, "\\'"))) return true;
  const head = title.split(/ at once| \d+ ms later/)[0]!;
  return head !== title && src.includes(head);
}

describe('QA batch-1 scenario list', () => {
  it('has 30 to 50 scenarios with unique ids', () => {
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(30);
    expect(SCENARIOS.length).toBeLessThanOrEqual(50);
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length);
  });

  it('covers only batch-1 features, each with a negative or security case', () => {
    const batch1 = FEATURES.filter((f) => f.batch === 1).map((f) => f.id as string);
    for (const f of batch1) {
      expect(SCENARIOS.some((s) => s.feature === f)).toBe(true);
      expect(SCENARIOS.some((s) => s.feature === f && ['negative', 'security', 'reliability'].includes(s.kind))).toBe(true);
    }
    expect(SCENARIOS.every((s) => batch1.includes(s.feature) || s.feature === 'gating')).toBe(true);
  });

  it.each(runnable.map((s) => [s.id, s] as const))('%s names a test file that holds its title', (_id, s) => {
    expect(existsSync(s.file)).toBe(true);
    expect(holds(readFileSync(s.file, 'utf8'), leaf(s.file, s.test!))).toBe(true);
  });
});
