// Spec: 08-4 §26.2 (job title: do-jobs take the running form of the first acting step, read-only jobs the first looking step,
// else the AI's hint after the banned-word filter and the slot rule, else "Working on it"; > 40 chars → cut at the last space
// before char 39 + "…"; item 0: a `show_before` step goes before the first book/pay/send/post/buy/book_calendar step, a plan
// over 12 steps then drops its last non-acting step), 07-2 §4 + AT-120 ("Trying again: {title}"), X-131.
import { describe, expect, it } from 'vitest';
import { buildTitle, cutTitle, insertShowBefore, retryTitle } from '../../../src/engine/jobs/title';
import type { PlanStep } from '../../../src/shared/schemas';

const step = (phraseKey: string, slots: Record<string, string> = {}, route: PlanStep['route'] = 'api'): PlanStep =>
  ({ phraseKey, slots, route }) as PlanStep;
const noBan = () => false;

describe('08-4 §26.2 job title', () => {
  it('a do-job takes the running form of its first acting step', () => {
    const plan = [step('look_for', { what: 'stays' }), step('book', { what: 'Goa stay' })];
    expect(buildTitle({ intent: 'do', plan, hint: 'x', isBanned: noBan })).toBe('Booking Goa stay');
    expect(buildTitle({ intent: 'do', plan: [step('pay', { payee: 'Airtel' })], hint: '', isBanned: noBan })).toBe('Paying Airtel');
  });

  it('a read-only job takes the running form of its first looking step', () => {
    const plan = [step('read_email'), step('look_for', { what: 'bills due this week' })];
    expect(buildTitle({ intent: 'read_only', plan, hint: 'Bills', isBanned: noBan })).toBe('Reading your email');
  });

  it('no such step → the hint after the slot rule and banned words, else "Working on it"', () => {
    const plan = [step('writing')];
    expect(buildTitle({ intent: 'read_only', plan, hint: 'Sort my notes', isBanned: noBan })).toBe('Sort my notes');
    expect(buildTitle({ intent: 'read_only', plan, hint: 'Sort my notes; now!', isBanned: noBan })).toBe('Working on it');
    expect(buildTitle({ intent: 'read_only', plan, hint: 'Leverage synergy', isBanned: (t) => /leverage/i.test(t) })).toBe('Working on it');
  });

  it('a title over 40 chars is cut at the last space before char 39 and gets "…"', () => {
    const long = 'Looking for flats near the station with a big balcony';
    const cut = cutTitle(long);
    expect(cut).toBe('Looking for flats near the station…'); // the space after "with" is char 40, not before 39
    expect(cut.length).toBeLessThanOrEqual(40);
    expect(cutTitle('Short title')).toBe('Short title');
  });

  it('a retry is titled "Trying again: {title}", still ≤ 40 chars', () => {
    expect(retryTitle('Reading your email')).toBe('Trying again: Reading your email');
    expect(retryTitle('Looking for bills due this week').length).toBeLessThanOrEqual(40);
  });
});

describe('08-4 §26.2 item 0 · show-before step (X-131)', () => {
  it('goes right before the first acting step, with its -ing form and route', () => {
    const plan = insertShowBefore([step('look_for', { what: 'stays' }, 'browser'), step('book', { what: 'Goa stay' }, 'browser')]);
    expect(plan.map((s) => s.phraseKey)).toEqual(['look_for', 'show_before', 'book']);
    expect(plan[1]).toEqual({ phraseKey: 'show_before', slots: { acting: 'booking' }, route: 'browser' });
  });

  it('is not added twice and not added to read-only plans', () => {
    const once = insertShowBefore([step('show_before', { acting: 'paying' }), step('pay', { payee: 'Airtel' })]);
    expect(once.map((s) => s.phraseKey)).toEqual(['show_before', 'pay']);
    expect(insertShowBefore([step('read_email')]).map((s) => s.phraseKey)).toEqual(['read_email']);
  });

  it('a plan that grows past 12 drops its last non-acting step', () => {
    const plan = [
      ...Array.from({ length: 11 }, (_, i) => step('look_for', { what: `thing ${i}` })),
      step('send', { channel: 'email', to: 'Asha' }),
    ];
    const out = insertShowBefore(plan);
    expect(out).toHaveLength(12);
    expect(out.slice(-2).map((s) => s.phraseKey)).toEqual(['show_before', 'send']);
    expect(out.filter((s) => s.phraseKey === 'look_for')).toHaveLength(10);
  });
});
