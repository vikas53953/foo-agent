// Spec: 10-acceptance-2 §C.8 (X-179, CR-0021): AT-300 spring tokens, AT-315 one icon set, AT-316 type, AT-317 dark depth.
// Values come from the spec text (02 §F1, §F4, §F7; CR-0021 picks 1, 2, 15–17, 19), read here from design/tokens.json and
// the generated tokens.css, and the source scans read the files as written.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { motion } from '../../src/shared/tokens';

const ROOT = join(__dirname, '..', '..');
const css = readFileSync(join(ROOT, 'src/renderer/styles/tokens.css'), 'utf8');
const tree = JSON.parse(readFileSync(join(ROOT, 'design/tokens.json'), 'utf8'));

function files(dir: string, ext: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p, ext) : ext.test(name) ? [p] : [];
  });
}

/** Source text with comments removed (spec headers quote ✓ and 700). */
const code = (p: string) =>
  readFileSync(p, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const points = (v: string) =>
  v
    .replace(/^linear\(|\)$/g, '')
    .split(',')
    .map(Number);

describe('P1 contracts (CR-0021)', () => {
  it('AT-300 springs are CSS linear() with quiet overshoot, and exits are not slower than entrances', () => {
    for (const name of ['spring', 'spring-soft']) {
      const v = tree.ease[name].$value as string;
      expect(v.startsWith('linear(')).toBe(true);
      const p = points(v);
      expect(p[0]).toBe(0);
      expect(p.at(-1)).toBe(1);
      expect(Math.max(...p)).toBeLessThanOrEqual(1.04);
    }
    expect(Math.max(...points(tree.ease['spring-soft'].$value))).toBe(1);
    expect(motion.spring).toBe(400);
    expect(motion.normal).toBeLessThanOrEqual(Math.min(motion.slow, motion.spring));
    // Basic and Off turn the springs into fades.
    expect(css).toMatch(/:root\[data-motion='basic'\] \{[^}]*--ease-spring: var\(--ease-basic\);/);
    expect(css).toMatch(/:root\[data-motion='off'\] \{[^}]*--m-spring: 83ms;/);
  });

  it('AT-300 reduced motion lives only in tokens.css (FE-24)', () => {
    const offenders = files(join(ROOT, 'src/renderer'), /\.css$/)
      .filter((p) => !p.endsWith(join('styles', 'tokens.css')))
      .filter((p) => code(p).includes('prefers-reduced-motion'));
    expect(offenders).toEqual([]);
  });

  it('AT-315 no "✓" text glyph in copy or renderer code', () => {
    const copy = JSON.parse(readFileSync(join(ROOT, 'src/shared/copy/en-IN.json'), 'utf8')) as Record<string, string>;
    expect(Object.entries(copy).filter(([, v]) => v.includes('✓'))).toEqual([]);
    const offenders = files(join(ROOT, 'src/renderer'), /\.tsx?$/).filter((p) => code(p).includes('✓'));
    expect(offenders).toEqual([]);
  });

  it('AT-316 subtitle is 17/24 and weight 700 comes only from --weight-money', () => {
    expect(tree.t.subtitle.$value).toMatchObject({ fontSize: '17px', lineHeight: '24px', fontWeight: 600 });
    expect(tree.weight.money.$value).toBe(700);
    const offenders = files(join(ROOT, 'src/renderer'), /\.css$/)
      .filter((p) => !p.endsWith(join('styles', 'tokens.css')))
      .filter((p) => /font-weight:\s*(700|bold)\b/.test(code(p)));
    expect(offenders).toEqual([]);
  });

  it('AT-317 dark shadows are an edge ring plus two layers; light unchanged', () => {
    const edge = '0 0 0 1px rgba(255,255,255,.06)';
    for (const k of ['4', '16', '28']) {
      const dark = tree.shadow[k].$extensions.foo.modes.dark as string;
      expect(dark.startsWith(edge)).toBe(true);
      expect(dark.split('),').length).toBe(3);
    }
    expect(tree.shadow['4'].$value).toBe('0 2px 8px rgba(11,11,16,.08)');
    expect(tree.shadow['16'].$value).toBe('0 8px 24px rgba(11,11,16,.14)');
    expect(tree.shadow['28'].$value).toBe('0 16px 48px rgba(11,11,16,.22)');
  });
});
