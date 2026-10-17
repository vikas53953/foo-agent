// FID-18 (11-fidelity §11.5.3): spec/trace.csv agrees with the test titles (no orphans, every live id in its file).
import { describe, expect, it } from 'vitest';
import { checkRepo, checkTrace, HEADER, parseCsv, titleIds } from '../../scripts/trace-check';

// Synthetic sources are built so this file's own text holds no test title with an id.
const kw = 'test';
const src = (...titles: string[]) => titles.map((t) => `${kw}('${t}', () => {});`).join('\n');
const csv = (...rows: string[]) => [HEADER.join(','), ...rows].join('\n') + '\n';

describe('FID-18 trace matrix', () => {
  it('the repo matrix matches the test titles', () => expect(checkRepo()).toEqual([]));
  it('parses quoted CSV cells', () => expect(parseCsv('a,"b, c","d ""e"""\n')).toEqual([['a', 'b, c', 'd "e"']]));
  it('reads ids from test titles only', () => {
    expect(titleIds(src('AT-122 · pays once', 'UX-13-07 · card', 'plain'))).toEqual(['AT-122', 'UX-13-07']);
    expect(titleIds(`const id = 'AT-001';`)).toEqual([]);
  });
  it('a live row needs its id in a test title of the named file', () => {
    const t = csv('R6,J10,AT-122,UX-13-09,,05-cards-2 §5.6,test/e2e/a.spec.ts,M10,live');
    expect(checkTrace(t, { 'test/e2e/a.spec.ts': src('AT-122 · x', 'UX-13-09 · y') })).toEqual([]);
    expect(checkTrace(t, { 'test/e2e/a.spec.ts': src('AT-122 · x') })).toEqual([
      'trace.csv:2: test/e2e/a.spec.ts has no test titled with UX-13-09',
    ]);
    expect(checkTrace(t, {})[0]).toMatch(/does not exist/);
  });
  it('orphan ids and ids in the wrong file fail', () => {
    const t = csv(',,ART-02a,,,01-articles Art. 2,test/a.test.ts,M0,live');
    expect(checkTrace(t, { 'test/a.test.ts': src('ART-02a x', 'AT-999 z') })).toEqual([
      'orphan: test/a.test.ts has a test titled AT-999, which trace.csv does not know',
    ]);
    expect(checkTrace(t, { 'test/a.test.ts': src('ART-02a x'), 'test/b.test.ts': src('ART-02a again') })).toEqual([
      'ART-02a: trace.csv names test/a.test.ts, but the test is in test/b.test.ts',
    ]);
  });
  it('pending rows may name files that do not exist yet; bad rows are reported', () => {
    expect(checkTrace(csv(',,,,BP-APP-L,03-shell-1 §3.4,test/fidelity/bp/x.spec.ts,M1,pending'), {})).toEqual([]);
    expect(checkTrace(csv(',,,,,,,M1,later'), {})).toEqual([
      'trace.csv:2: no AT/ART/PERF/UX/BP id',
      'trace.csv:2: Spec § is empty',
      'trace.csv:2: Status must be live or pending',
      'trace.csv:2: no test file',
    ]);
    expect(checkTrace('R,J\n', {})[0]).toMatch(/^header must be/);
  });
});
