// FID-21 (11-fidelity §11.5.3, X-189, CR-0031): every UX step, BP ref and trace row of a built milestone has a live row
// with an existing test file, or is a listed known gap; the list only shrinks.
import { describe, expect, it } from 'vitest';
import { checkCoverage, findGaps, repoInput, type CoverageInput } from '../../scripts/coverage-check';

const HEAD = 'R,J,AT / ART / PERF,UX step,BP ref,Spec §,Test file,Milestone,Status';
const input = (over: Partial<CoverageInput> = {}): CoverageInput => ({
  manifest: {
    ux: [
      { id: 'UX-14-05', milestone: 'M9' },
      { id: 'UX-14-01', milestone: 'M9' },
      { id: 'UX-20-01', milestone: 'M13' },
      { id: 'UX-14-02', milestone: 'M9' },
    ],
    bp: [{ id: 'BP-APP-L', milestone: 'M1' }],
    superseded: [{ id: 'UX-14-02' }],
  },
  trace: [
    HEAD,
    ',,,UX-14-01,,05-3 §5.10,test/fidelity/ux/UX-14.signin.spec.ts,M9,live',
    ',,,UX-14-05,,05-3 §5.10,test/fidelity/ux/UX-14.signin.spec.ts,M9,pending',
    ',,,,BP-APP-L,03-shell-1 §3.4,test/fidelity/bp/BP-shell.spec.ts,M1,live',
    ',,AT-039,,,08-2 §8.3.9,test/e2e/m9-booking.spec.ts,M9,pending',
  ].join('\n'),
  built: new Set(['M1', 'M9']),
  gaps: {},
  fileExists: () => true,
  ...over,
});

describe('FID-21 spec coverage', () => {
  it('a pending step, a step with no row and a pending AT of a built milestone are gaps; later milestones and superseded steps are not', () => {
    const gaps = findGaps(input());
    expect([...gaps.keys()].sort()).toEqual(['AT-039', 'UX-14-05']);
    expect(findGaps(input({ built: new Set(['M1']) })).size).toBe(0);
  });

  it('a live row whose test file is missing is a gap', () => {
    expect([...findGaps(input({ fileExists: (p) => !p.includes('bp/') })).keys()]).toContain('BP-APP-L');
  });

  it('a new gap fails; a listed gap passes; a listed id that is covered now fails (the list only shrinks)', () => {
    expect(checkCoverage(input())).toHaveLength(2);
    expect(checkCoverage(input({ gaps: { 'UX-14-05': 'CR-0030', 'AT-039': 'CR-0013' } }))).toEqual([]);
    const stale = checkCoverage(input({ gaps: { 'UX-14-05': 'CR-0030', 'AT-039': 'CR-0013', 'UX-14-01': 'old' } }));
    expect(stale).toEqual([expect.stringMatching(/UX-14-01 is covered now/)]);
    expect(checkCoverage(input({ gaps: { 'UX-14-05': ' ', 'AT-039': 'CR-0013' } }))).toEqual([expect.stringMatching(/no reason/)]);
  });

  it('the repo: every built milestone is covered or a listed gap', () => {
    expect(checkCoverage(repoInput())).toEqual([]);
  });
});
