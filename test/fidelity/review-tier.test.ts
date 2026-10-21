// docs/build-method.md §4 (review depth by risk tier): the tier comes from the changed paths, never from the author.
import { describe, expect, it } from 'vitest';
import { LOW_MAX_LINES, reviewTier } from '../../scripts/review-tier';

describe('review-tier', () => {
  it('docs and helper skills only is low', () => {
    expect(reviewTier(['docs/decisions/M9.tsv', '.claude/skills/unslop/SKILL.md', 'README.md'], 40).tier).toBe('low');
  });

  it('ordinary app code that is not on the high list stays normal', () => {
    expect(reviewTier(['src/renderer/chat/Composer.tsx', 'src/main/jobs/queue.ts']).tier).toBe('normal');
    expect(reviewTier(['src/main/jobs/queue.ts']).tier).toBe('normal');
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
    ['src/main/vault/keyring.ts', 'keys, logins and IPC trust'],
    ['src/main/approvals/x.ts', 'spend approvals'],
    ['src/main/setup/aiFinder.ts', 'AI engine'],
    ['src/engine/gate/GateLogic.ts', 'AI engine'],
    ['src/engine/redact/Redactor.ts', 'AI engine'],
    ['docs/cr/CR-0027-intake-phrase-keys.md', 'CR files'],
    ['CLAUDE.md', 'review and build rules'],
    ['docs/build-method.md', 'review and build rules'],
    ['.claude/skills/foo-review/SKILL.md', 'review and build rules'],
    ['.claude/settings.json', 'review and build rules'],
    ['scripts/tier-r.ts', 'fidelity gates'],
    ['scripts/golden/pixels.ts', 'fidelity gates'],
    ['test/fidelity/fid-guard.test.ts', 'fidelity gates'],
    ['vitest.config.ts', 'fidelity gates'],
    ['design/tokens.json', 'fidelity gates'],
    ['src/preload/index.ts', 'keys, logins and IPC trust'],
    ['src/main/connections/googleClient.ts', 'keys, logins and IPC trust'],
    ['src/main/ipc/guard.ts', 'keys, logins and IPC trust'],
    ['src/main/jobs/capWarning.ts', 'spend approvals and AI cap'],
    ['src/wa-bridge/index.ts', 'messages to other people'],
    ['src/main/drafts/x.ts', 'messages to other people'],
  ])('%s makes the change high (%s)', (file, name) => {
    const r = reviewTier(['docs/a.md', file]);
    expect(r.tier).toBe('high');
    expect(r.reasons.some((x) => x.startsWith(name))).toBe(true);
  });

  it('the tier script itself is high, so weakening it gets the deep review', () => {
    expect(reviewTier(['scripts/review-tier.ts']).tier).toBe('high');
  });

  it('an empty diff is normal, never low', () => {
    expect(reviewTier([]).tier).toBe('normal');
  });
});
