// FID-01: the vendored spec matches SPEC-MANIFEST.json. Copy check (08-0 §D) runs here too.
import { describe, expect, it } from 'vitest';
import { checkCopy } from '../../scripts/check-copy';
import { verify } from '../../scripts/spec-verify';

describe('fidelity guards', () => {
  it('FID-01 spec/ is unchanged', () => expect(verify()).toEqual([]));
  it('copy keys and words are valid', () => expect(checkCopy()).toEqual([]));
});
