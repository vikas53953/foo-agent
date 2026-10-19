// Spec: 08-2 §5.6 (watchdog every 5 s: slow = no step finished for 60 s, badge stays 🛠 with "Taking longer than usual",
// never ⏳; stuck rules no_progress 180 s of WORKING time, fail_streak ≥ 3, cost > 2 × estimate, the same normalised URL 5 ×
// in a row), 08-4 §26.3 item 6 (budget: 60 step turns, 25 tool calls a step, 150 a job; time: 30 min WORKING, or 3 ×
// est_minutes when est_minutes ≥ 5), §26.4 items 2–3 ("What I'd do" from facts; the spent line), AT-116a.
import { describe, expect, it } from 'vitest';
import { t } from '../../../src/shared/copy/t';
import {
  NO_PROGRESS_MS,
  SLOW_MS,
  WATCHDOG_MS,
  isSlow,
  normaliseUrl,
  spentLine,
  stuckCheck,
  stuckSuggestion,
  type StuckInput,
} from '../../../src/engine/jobs/watchdog';

const NOW = 1_000_000_000;
const base = (o: Partial<StuckInput> = {}): StuckInput => ({
  now: NOW,
  lastProgressAt: NOW - 10_000,
  workingMs: 60_000,
  failStreak: 0,
  spentTokens: 1_000,
  estTokens: 12_000,
  billing: 'plan',
  spentCostPaise: 0,
  estCostPaise: null,
  estMinutes: 2,
  stepTurns: 3,
  toolCallsStep: 2,
  toolCallsJob: 4,
  navUrls: [],
  ...o,
});

describe('08-2 §5.6 numbers', () => {
  it('watchdog every 5 s; slow at 60 s; stuck at 180 s', () => {
    expect(WATCHDOG_MS).toBe(5_000);
    expect(SLOW_MS).toBe(60_000);
    expect(NO_PROGRESS_MS).toBe(180_000);
  });
});

describe('AT-116a · slow is not stuck', () => {
  it('AT-116a: 60 s with no step finished → slow; no stuck card before 3 min', () => {
    expect(isSlow(NOW, NOW - 59_999)).toBe(false);
    expect(isSlow(NOW, NOW - 60_000)).toBe(true);
    // Slow for two minutes: still no stuck signal, so the badge stays 🛠 (the runner never writes ⏳ for slow).
    expect(stuckCheck(base({ lastProgressAt: NOW - 120_000 }))).toBeNull();
    expect(stuckCheck(base({ lastProgressAt: NOW - 180_000 }))).toBeNull();
    expect(stuckCheck(base({ lastProgressAt: NOW - 180_001 }))?.rule).toBe('no_progress');
  });
});

describe('08-2 §5.6 stuck rules', () => {
  it('fail_streak ≥ 3', () => {
    expect(stuckCheck(base({ failStreak: 2 }))).toBeNull();
    expect(stuckCheck(base({ failStreak: 3 }))?.rule).toBe('fail_streak');
  });

  it('cost: tokens > 2 × estimate (any billing); key: paise > 2 × estimate', () => {
    expect(stuckCheck(base({ spentTokens: 24_000 }))).toBeNull();
    expect(stuckCheck(base({ spentTokens: 24_001 }))?.rule).toBe('cost');
    const key = { billing: 'key' as const, estCostPaise: 100 };
    expect(stuckCheck(base({ ...key, spentCostPaise: 200 }))).toBeNull();
    expect(stuckCheck(base({ ...key, spentCostPaise: 201 }))?.rule).toBe('cost');
    // Plan billing has no ₹ estimate: only the token rule applies.
    expect(stuckCheck(base({ spentCostPaise: 10_000 }))).toBeNull();
  });

  it('url_loop: the same normalised URL 5 times in a row', () => {
    const same = ['https://a.example/s?b=2&a=1', 'https://a.example/s?a=1&b=2#x', 'https://A.example/s?a=1&b=2'];
    expect(stuckCheck(base({ navUrls: [...same, same[0]!] }))).toBeNull();
    expect(stuckCheck(base({ navUrls: [...same, ...same.slice(0, 2)] }))?.rule).toBe('url_loop');
    expect(stuckCheck(base({ navUrls: [...same, 'https://a.example/other', ...same.slice(0, 1)] }))).toBeNull();
  });

  it('budget: 60 step turns, 25 tool calls in a step, 150 in a job', () => {
    expect(stuckCheck(base({ stepTurns: 59, toolCallsStep: 24, toolCallsJob: 149 }))).toBeNull();
    expect(stuckCheck(base({ stepTurns: 60 }))?.rule).toBe('budget');
    expect(stuckCheck(base({ toolCallsStep: 25 }))?.rule).toBe('budget');
    expect(stuckCheck(base({ toolCallsJob: 150 }))?.rule).toBe('budget');
  });

  it('time: 30 min WORKING, or 3 × est_minutes when est_minutes ≥ 5', () => {
    expect(stuckCheck(base({ workingMs: 30 * 60_000 - 1 }))).toBeNull();
    expect(stuckCheck(base({ workingMs: 30 * 60_000 }))?.rule).toBe('time');
    expect(stuckCheck(base({ estMinutes: 5, workingMs: 15 * 60_000 }))?.rule).toBe('time');
    // Under 5 estimated minutes the 3 × rule does not apply.
    expect(stuckCheck(base({ estMinutes: 4, workingMs: 13 * 60_000 }))).toBeNull();
  });

  it('a signal carries its time and a short tech-log detail', () => {
    const s = stuckCheck(base({ failStreak: 3 }))!;
    expect(s.at).toBe(NOW);
    expect(s.detail.length).toBeLessThanOrEqual(80);
  });
});

describe('normaliseUrl', () => {
  it('origin + path, query sorted, fragment dropped', () => {
    expect(normaliseUrl('https://Shop.example/a/b?z=1&a=2#top')).toBe('https://shop.example/a/b?a=2&z=1');
    expect(normaliseUrl('not a url')).toBe('not a url');
  });
});

describe('08-4 §26.4 items 2–3', () => {
  it('(a) a named site not opened yet → "try {site} instead"', () => {
    expect(stuckSuggestion({ sites: ['a.example', 'b.example'], opened: (s) => s === 'a.example', book: false, business: null })).toBe(
      t('cards.stuck.suggestion.try_site', { site: 'b.example' }),
    );
  });
  it('(b) a book job with a business email seen → "email {business} instead"', () => {
    expect(stuckSuggestion({ sites: ['a.example'], opened: () => true, book: true, business: 'stay@hotel.example' })).toBe(
      t('cards.stuck.suggestion.email', { business: 'stay@hotel.example' }),
    );
  });
  it('(c) otherwise → "open the page for you"', () => {
    expect(stuckSuggestion({ sites: [], opened: () => true, book: false, business: null })).toBe(t('cards.stuck.suggestion.open_page'));
  });

  it('spent line: key billing shows ₹ and minutes; plan and local only minutes', () => {
    expect(spentLine('key', 1_250, 3 * 60_000)).toBe(t('cards.stuck.spent_line.key', { x: '₹12.50', m: 3 }));
    expect(spentLine('plan', 0, 3 * 60_000 + 20_000)).toBe(t('cards.stuck.spent_line.minutes', { m: 3 }));
    expect(spentLine('local', 0, 10_000)).toBe(t('cards.stuck.spent_line.minutes', { m: 1 }));
  });
});
