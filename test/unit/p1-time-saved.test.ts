// Spec: 10-acceptance-2 §C.8 AT-312 (time-saved table), CR-0021 pick 14 (one `StepKind` enum: search, read, fill, send,
// sign_in, pay, wait; per finished step search 2, read or compare 3, fill 6, send 3, sign in 2, pay or book 5, wait 0 min;
// summed, rounded to the nearest 5, shown only when ≥ 5 min) and pick 12 (the same enum gives the checklist icon).
// Expected minutes are written from the pick's table, never recomputed the way the code does.
import { describe, expect, it } from 'vitest';
import { PHRASES, type PhraseKey } from '../../src/shared/phrases';
import { STEP_KINDS, STEP_MINUTES, minutesSaved, stepKind } from '../../src/shared/timeSaved';

const done = (phraseKey: string) => ({ phraseKey, state: 'done' as const });

describe('AT-312 time saved is a fixed table (CR-0021 pick 14)', () => {
  it('AT-312 has the seven step kinds with the pick 14 minutes', () => {
    expect([...STEP_KINDS]).toEqual(['search', 'read', 'fill', 'send', 'sign_in', 'pay', 'wait']);
    expect(STEP_MINUTES).toEqual({ search: 2, read: 3, fill: 6, send: 3, sign_in: 2, pay: 5, wait: 0 });
  });

  it('AT-312 maps the runner phrases to their kind', () => {
    expect(stepKind('look_web')).toBe('search');
    expect(stepKind('check_site')).toBe('read');
    expect(stepKind('compare')).toBe('read');
    expect(stepKind('fill_details')).toBe('fill');
    expect(stepKind('send')).toBe('send');
    expect(stepKind('sign_in')).toBe('sign_in');
    expect(stepKind('pay')).toBe('pay');
    expect(stepKind('book')).toBe('pay');
    expect(stepKind('wait_approve')).toBe('wait');
    // Runner-only rows, the fallback phrase and unknown keys are no kind: no icon, no minutes.
    expect(stepKind('took_over')).toBeNull();
    expect(stepKind('stopped')).toBeNull();
    expect(stepKind('generic_working')).toBeNull();
    expect(stepKind('not_a_phrase')).toBeNull();
  });

  it('AT-312 every phrase in the catalogue has its decided kind', () => {
    const kinds = Object.fromEntries((Object.keys(PHRASES) as PhraseKey[]).map((k) => [k, stepKind(k)]));
    expect(kinds).toEqual({
      read_app: 'read',
      read_email: 'read',
      check_calendar: 'read',
      look_web: 'search',
      check_sites: 'read',
      check_site: 'read',
      wait_site: 'wait',
      look_for: 'search',
      compare: 'read',
      shortlist: 'read',
      wait_pick: 'wait',
      wait_approve: 'wait',
      show_before: 'wait',
      wait_signin: 'wait',
      fill_details: 'fill',
      book: 'pay',
      book_calendar: 'pay',
      pay: 'pay',
      add_calendar: 'fill',
      draft: 'fill',
      writing: 'fill',
      send: 'send',
      make_file: 'fill',
      use_pc: null,
      find_proof: 'read',
      blocked_try_next: null,
      took_over: null,
      stopped: null,
      find_trains: 'search',
      sign_in: 'sign_in',
      fill_passengers: 'fill',
      get_fare: 'read',
      wait_opens: 'wait',
      read_plans: 'read',
      read_bill: 'read',
      generic_working: null,
    });
  });

  it('AT-312 sums finished steps and rounds to the nearest 5', () => {
    // search 2 + read 3 + read 3 + read 3 + wait 0 + pay 5 = 16 → 15
    expect(
      minutesSaved([done('look_web'), done('check_site'), done('check_site'), done('compare'), done('wait_approve'), done('book')]),
    ).toBe(15);
    // fill 6 + send 3 = 9 → 10
    expect(minutesSaved([done('fill_details'), done('send')])).toBe(10);
    // read 3 + sign in 2 = 5 → 5
    expect(minutesSaved([done('check_site'), done('sign_in')])).toBe(5);
  });

  it('AT-312 counts only finished steps', () => {
    expect(minutesSaved([done('fill_details'), { phraseKey: 'pay', state: 'running' }, { phraseKey: 'send', state: 'pending' }])).toBe(5);
    expect(
      minutesSaved([
        { phraseKey: 'fill_details', state: 'failed' },
        { phraseKey: 'fill_details', state: 'skipped' },
      ]),
    ).toBeNull();
  });

  it('AT-312 hides anything under 5 min', () => {
    expect(minutesSaved([])).toBeNull();
    expect(minutesSaved([done('read_email')])).toBeNull(); // 3
    expect(minutesSaved([done('look_web'), done('sign_in')])).toBeNull(); // 4
    expect(minutesSaved([done('wait_pick'), done('generic_working'), done('took_over')])).toBeNull(); // 0
  });
});
