// Spec: 04-2 §20.5 (when any inner stack is present the pill's top padding becomes 8px). M2 review D8: the stylesheet
// targeted `data-stacked` while the pill set `data-stacks`, so the 8px never applied. This guard checks that every
// `[data-…]` selector in the composer's stylesheets is set by some renderer component.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../src/renderer');
const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]));
const all = files(ROOT);
const code = all.filter((f) => /\.tsx?$/.test(f)).map((f) => readFileSync(f, 'utf8'));
/** Set on <html> by the shell's theme code, not by a component prop. */
const GLOBAL = new Set(['data-theme']);

describe('composer stylesheet attributes are set by the components (review D8)', () => {
  it('the pill sets data-stacked, the attribute §20.5’s padding rule targets', () => {
    const css = readFileSync(join(ROOT, 'composer/Composer.module.css'), 'utf8');
    const tsx = readFileSync(join(ROOT, 'composer/Composer.tsx'), 'utf8');
    expect(css).toMatch(/\.pill\[data-stacked\]\s*\{\s*padding-top: var\(--s1\);/);
    expect(tsx).toMatch(/className=\{styles\.pill\}[\s\S]{0,200}data-stacked=/);
    expect(tsx).not.toMatch(/data-stacks=/);
  });

  it('every [data-…] selector in composer/*.module.css has a setter', () => {
    const css = all.filter((f) => f.includes(`${join('renderer', 'composer')}`) && f.endsWith('.module.css'));
    const attrs = new Set(css.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/\[(data-[a-z-]+)/g)].map((m) => m[1]!)));
    const missing = [...attrs].filter((a) => !GLOBAL.has(a) && !code.some((c) => c.includes(`${a}=`) || c.includes(`'${a}'`)));
    expect(missing).toEqual([]);
  });
});
