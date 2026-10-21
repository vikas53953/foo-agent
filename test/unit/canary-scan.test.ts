// Spec: 10-acceptance-2 §D ART-08a (the canary scan of every file foo wrote, the browser profile included) and §G.8 (scan
// reports). A running browser deletes temp files (Default/Network/Sdch Dictionaries…tmp on windows-latest) between the scan's
// listing and its read: such a file is listed in notCovered, and every other read error still fails the scan.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CANARIES } from '../canary/canaries';
import { scan } from '../canary/scan';

const dirs: string[] = [];
const world = () => {
  const dir = mkdtempSync(join(tmpdir(), 'foo-scan-'));
  dirs.push(dir);
  mkdirSync(join(dir, 'Network'));
  writeFileSync(join(dir, 'Network', 'Sdch Dictionaries.tmp'), 'temp');
  writeFileSync(join(dir, 'kept.txt'), `card ${CANARIES.cardNumber.value}`);
  return dir;
};
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

describe('canary scan: a file deleted while the scan runs', () => {
  it('is listed in notCovered, and the files still there are searched', () => {
    const dir = world();
    const report = scan({
      roots: { BROWSER: dir },
      texts: [],
      canaries: [CANARIES.cardNumber],
      // The browser deletes its temp file after the listing, just before the read.
      read: (p) => {
        if (p.endsWith('.tmp')) rmSync(p);
        return readFileSync(p);
      },
    });
    expect(report.notCovered).toEqual([{ what: 'BROWSER/Network/Sdch Dictionaries.tmp', why: expect.stringContaining('deleted') }]);
    expect(report.files).toEqual(['BROWSER/kept.txt']);
    expect(report.hits.map((h) => h.where)).toEqual(['BROWSER/kept.txt']);
  });

  it('any other read error still fails the scan', () => {
    const dir = world();
    const denied = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
    const read = (p: string) => {
      if (p.endsWith('.tmp')) throw denied;
      return readFileSync(p);
    };
    expect(() => scan({ roots: { BROWSER: dir }, texts: [], canaries: [CANARIES.cardNumber], read })).toThrow('EACCES');
  });
});
