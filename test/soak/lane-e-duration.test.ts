import { describe, expect, it } from 'vitest';
import { FULL_SOAK_HOURS, resolveSoakDuration } from './lane-e-duration';

describe('Lane E soak duration contract', () => {
  it('marks an explicit one-hour run as partial and keeps eight hours as acceptance', () => {
    expect(resolveSoakDuration('1', true)).toEqual({
      hours: 1,
      partial: true,
      acceptanceHours: FULL_SOAK_HOURS,
    });
  });

  it('rejects one hour without the explicit partial flag', () => {
    expect(() => resolveSoakDuration('1', false)).toThrow(/--partial/u);
  });

  it('accepts the full eight-hour gate without partial mode', () => {
    expect(resolveSoakDuration(undefined, false)).toEqual({
      hours: FULL_SOAK_HOURS,
      partial: false,
      acceptanceHours: FULL_SOAK_HOURS,
    });
  });
});
