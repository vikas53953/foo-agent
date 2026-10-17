// Windows file systems ignore case (09 §9.2): two module names that differ only in case resolve to one file there.
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('module names', () => {
  it('no two source modules differ only in case or extension', () => {
    const files = execFileSync('git', ['ls-files', 'src', 'test', 'scripts'], { encoding: 'utf8' }).split('\n').filter(Boolean);
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const f of files) {
      const key = f.replace(/\.(?:tsx?|mjs|js)$/, '').toLowerCase();
      const prev = seen.get(key);
      if (prev && /\.(?:tsx?|mjs|js)$/.test(f) && /\.(?:tsx?|mjs|js)$/.test(prev)) clashes.push(`${prev} ~ ${f}`);
      else seen.set(key, f);
    }
    expect(clashes).toEqual([]);
  });
});
