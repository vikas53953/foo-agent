// docs/build-method.md §4 (review depth by risk tier): the tier comes from the changed paths, never from the author.
import { describe, expect, it } from 'vitest';
import { LOW_MAX_LINES, reviewTier } from '../../scripts/review-tier';

describe('review-tier', () => {
  it('docs and skills only is low', () => {
    expect(reviewTier(['docs/build-method.md', '.claude/skills/foo-review/SKILL.md', 'README.md'], 40).tier).toBe('low');
  });

  it('a very large docs-only diff is still normal', () => {
    expect(reviewTier(['docs/x.md'], LOW_MAX_LINES + 1).tier).toBe('normal');
  });

  it('app or test code is normal', () => {
    expect(reviewTier(['src/renderer/chat/Bubble.tsx', 'test/unit/bubble.test.ts']).tier).toBe('normal');
    expect(reviewTier(['docs/a.md', 'src/main/jobs/queue.ts']).tier).toBe('normal');
  });

  it('a spec file under a nested docs-looking path is not low', () => {
    expect(reviewTier(['spec/constitution/00-README.md']).tier).toBe('high');
  });

  it.each([
    ['.github/workflows/ci.yml', 'CI workflows'],
    ['golden/manifest.json', 'spec or golden'],
    ['scripts/fid-guard.ts', 'fidelity gates'],
    ['eslint-rules/index.js', 'fidelity gates'],
    ['electron-builder.yml', 'installer'],
    ['pnpm-lock.yaml', 'dependencies'],
    ['src/main/vault/keyring.ts', 'keys and vault'],
    ['src/main/approvals/x.ts', 'spend approvals'],
    ['src/main/setup/aiFinder.ts', 'AI engine and finder'],
  ])('%s makes the change high (%s)', (file, name) => {
    const r = reviewTier(['docs/a.md', file]);
    expect(r.tier).toBe('high');
    expect(r.reasons[0]).toContain(name);
  });

  it('the tier script itself is high, so weakening it gets the deep review', () => {
    expect(reviewTier(['scripts/review-tier.ts']).tier).toBe('high');
  });

  it('an empty diff is normal, never low', () => {
    expect(reviewTier([]).tier).toBe('normal');
  });
});
