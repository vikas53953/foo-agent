// Spec: 10-acceptance-2 §C.8 AT-322 (the renderer entry chunk ≤ 500 KB minified; a lazily loaded page shows its skeleton
// within 150ms), CR-0021 (P1 T10: the first script loses Settings, Memory and the schema library). Builds the renderer in
// memory with the app's own vite.config.ts and reads the chunks it would ship. The skeleton's timing is proven in the app
// (test/verify/p1-10-speed.journey.ts); here the skeleton's delay is pinned to the 06 §0.5 / AT-322 150ms.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { build, type Rollup } from 'vite';
import { beforeAll, describe, expect, it } from 'vitest';
import { motion } from '../../src/shared/tokens';

const ROOT = join(__dirname, '..', '..');
/** AT-322: the entry chunk, minified. */
const ENTRY_MAX = 500_000;
/**
 * P1 T10 first-script budget: the entry plus every chunk it imports statically (what the main window parses before its
 * first paint). 981 KB when T10 landed (1,133 KB before); new weight that is not needed for the first chat goes behind a
 * lazy import.
 */
const FIRST_SCRIPT_MAX = 1_024_000;

let chunks: Rollup.OutputChunk[] = [];
const entry = () => chunks.find((c) => c.isEntry && c.facadeModuleId?.endsWith('src/renderer/index.html'))!;
/** The entry and its static imports, transitively. */
function firstScript(): Rollup.OutputChunk[] {
  const byName = new Map(chunks.map((c) => [c.fileName, c]));
  const out = new Map<string, Rollup.OutputChunk>();
  const walk = (c: Rollup.OutputChunk) => {
    if (out.has(c.fileName)) return;
    out.set(c.fileName, c);
    for (const f of c.imports) if (byName.has(f)) walk(byName.get(f)!);
  };
  walk(entry());
  return [...out.values()];
}
const size = (c: Rollup.OutputChunk) => Buffer.byteLength(c.code, 'utf8');
const kb = (n: number) => `${(n / 1000).toFixed(1)} KB`;

beforeAll(async () => {
  // Vitest sets NODE_ENV=test, which would ship React's development build; the app ships the production one.
  const nodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const result = await build({
    configFile: join(ROOT, 'vite.config.ts'),
    mode: 'production',
    logLevel: 'silent',
    build: { write: false },
  }).finally(() => (process.env.NODE_ENV = nodeEnv));
  const outputs = (Array.isArray(result) ? result : [result]) as Rollup.RollupOutput[];
  chunks = outputs.flatMap((o) => o.output).filter((o): o is Rollup.OutputChunk => o.type === 'chunk');
}, 120_000);

describe('AT-322 first script', () => {
  it('AT-322: the renderer entry chunk is ≤ 500 KB minified, and the first script stays in its budget', () => {
    const first = firstScript();
    const total = first.reduce((n, c) => n + size(c), 0);
    console.log(`entry ${kb(size(entry()))}; first script ${kb(total)}: ${first.map((c) => `${c.fileName} ${kb(size(c))}`).join(', ')}`);
    expect(size(entry())).toBeLessThanOrEqual(ENTRY_MAX);
    expect(total).toBeLessThanOrEqual(FIRST_SCRIPT_MAX);
  });

  it('AT-322: Settings and Memory load lazily, and zod is not in the first script', () => {
    const modules = firstScript().flatMap((c) => Object.keys(c.modules));
    expect(modules.filter((m) => /src\/renderer\/screens\/(Memory\.tsx|settings\/SettingsPage\.tsx)$/.test(m))).toEqual([]);
    expect(modules.filter((m) => /node_modules\/.*\/zod\//.test(m))).toEqual([]);
    const lazy = chunks.filter((c) => !c.isEntry).flatMap((c) => Object.keys(c.modules));
    expect(lazy.some((m) => m.endsWith('src/renderer/screens/Memory.tsx'))).toBe(true);
    expect(lazy.some((m) => m.endsWith('src/renderer/screens/settings/SettingsPage.tsx'))).toBe(true);
  });

  it('AT-322: a lazy page shows its skeleton at 150ms (06 §0.5 delay-loading)', () => {
    expect(motion['delay-loading']).toBe(150);
    const src = readFileSync(join(ROOT, 'src/renderer/pages/lazyPages.tsx'), 'utf8');
    expect(src).toContain("motion['delay-loading']");
    expect(src).toContain('TID.screenLoading');
  });
});
