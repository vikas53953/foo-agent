// 09-windows §9.2 + 02-2 §F15.1 (X-143): the .ico holds the 14 sizes and equals a fresh render of the logo geometry.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ico, render, SIZES } from '../../scripts/build-icon';

describe('app icon', () => {
  it('has the 14 sizes', () => {
    const buf = readFileSync('resources/icons/foo.ico');
    expect(buf.readUInt16LE(4)).toBe(14);
    expect(SIZES).toEqual([16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72, 80, 96, 256]);
  });
  it('is fresh', () =>
    expect(readFileSync('resources/icons/foo.ico').equals(ico(SIZES.map((size) => ({ size, png: render(size) }))))).toBe(true));
});
