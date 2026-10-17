// FID-11: design/tokens.json equals the spec (02-foundations F1–F5, F7 in the vendored spec/).
// FID-12: the generated token files are fresh (equal a new build of tokens.json).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildCss, buildPaper, buildTs, flatten, OUTPUTS, readTree } from '../../scripts/build-tokens';

const spec = readFileSync('spec/constitution/02-foundations.md', 'utf8');
const section = (from: string, to: string) => spec.slice(spec.indexOf(from), spec.indexOf(to, spec.indexOf(from)));
const tree = readTree();
const flat = flatten(tree);
const byName = new Map(flat.map((f) => [f.name, f.token]));
const norm = (v: unknown) => String(v).replace(/\s+/g, '').toUpperCase();

describe('FID-11 tokens.json = spec', () => {
  it('every colour row in F2 matches (light and dark)', () => {
    const rows = [
      ...section('## F2.', '### Helper colours').matchAll(
        /^\| `(--[a-z0-9-]+)`(?: \/ `(--[a-z0-9-]+)`)? \| `([^`]+)`(?: \/ `([^`]+)`)? \| `([^`]+)`(?: \/ `([^`]+)`)? \|/gm,
      ),
    ];
    expect(rows.length).toBeGreaterThan(30);
    let checked = 0;
    for (const [, a, b, l1, l2, d1, d2] of rows) {
      const pairs: [string, string, string][] = [[a!, l1!, d1!]];
      if (b) pairs.push([b, l2!, d2!]);
      for (const [name, light, dark] of pairs) {
        const tok = byName.get(name);
        expect(tok, name).toBeDefined();
        expect(norm(tok!.$value), `${name} light`).toBe(norm(light));
        const tokDark = tok!.$extensions?.foo?.modes?.dark ?? tok!.$value;
        if (dark !== 'same') expect(norm(tokDark), `${name} dark`).toBe(norm(dark));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(40);
  });

  it('helper colours match', () => {
    for (const [, name, hex] of section('### Helper colours', '## F3.').matchAll(/`(--h-[a-z]+) (#[0-9A-F]{6})`/g)) {
      expect(norm(byName.get(name!)?.$value), name).toBe(norm(hex));
    }
  });

  it('spacing (F3) matches', () => {
    for (const [, name, px] of section('## F3.', 'Fixed rhythm').matchAll(/`(--s-?\d): (\d+px)`/g))
      expect(byName.get(name!)?.$value, name).toBe(px);
  });

  it('radius (F4) matches', () => {
    for (const [, name, px] of section('## F4.', 'Borders:').matchAll(/^\| `(--r-[a-z]+)` \| (\d+px) \|/gm))
      expect(byName.get(name!)?.$value, name).toBe(px);
  });

  it('type scale (F1) matches', () => {
    const rows = [...section('## F1.', 'Rules:').matchAll(/^\| `(--t-[a-z-]+)` \| (\d+)\/(\d+) \| (\d+) \| ([^|]+) \|/gm)];
    expect(rows.length).toBe(12);
    for (const [, name, size, lh, weight, tracking] of rows) {
      const v = byName.get(name!)?.$value as { fontSize: string; lineHeight: string; fontWeight: number; letterSpacing: string };
      expect(v, name).toBeDefined();
      expect([v.fontSize, v.lineHeight, v.fontWeight]).toEqual([`${size}px`, `${lh}px`, Number(weight)]);
      const tr = tracking!.trim().replace('−', '-').replace('+', '');
      expect(v.letterSpacing, `${name} tracking`).toBe(tr);
    }
  });

  it('motion durations (F7) match', () => {
    for (const [, name, ms] of section('## F7.', 'What animates').matchAll(/^\| `(--m-(?:fast|normal|slow))` \| (\d+ms) \|/gm)) {
      expect(byName.get(name!)?.$value, name).toBe(ms);
    }
  });

  it('shared sizes (F5) match', () => {
    for (const [, name, px] of section('## F5.', 'All sizes above').matchAll(/^\| `(--[a-z-]+)` \| (\d+px)/gm)) {
      expect(byName.get(name!)?.$value, name).toBe(px);
    }
  });
});

describe('FID-12 generated token files are fresh', () => {
  it.each([
    [OUTPUTS.css, buildCss],
    [OUTPUTS.ts, buildTs],
    [OUTPUTS.paper, buildPaper],
  ] as const)('%s', (file, build) => expect(readFileSync(file, 'utf8')).toBe(build(tree)));
});
