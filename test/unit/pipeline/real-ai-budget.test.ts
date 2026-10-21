// Spec: project testing rule §6 and Test-First Pipeline G4/G5. scripts/real-ai-budget.ts prices a real-AI run from the
// AI CLI's transcripts and sums the month against the cap; scripts/real-ai-pass-k.ts scores the nightly rounds.
import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  claudeUsage,
  codexUsage,
  costUsd,
  LEDGER_HEADER,
  ledgerRow,
  monthSpend,
  priceFor,
  readBudget,
} from '../../../scripts/real-ai-budget';
import { passK, readResults, table } from '../../../scripts/real-ai-pass-k';

const budget = readBudget(readFileSync('test/real-pc/budget.json', 'utf8'));

describe('the committed budget', () => {
  it('has a cap, an alert level and a catch-all price', () => {
    expect(budget.monthlyCapInr).toBeGreaterThan(0);
    expect(budget.alertAtPercent).toBeLessThan(100);
    expect(budget.pricesUsdPerMTok['*']).toBeDefined();
  });

  it('every listed price is at most the catch-all, so an unknown model never looks cheaper than it is', () => {
    const star = budget.pricesUsdPerMTok['*']!;
    for (const p of Object.values(budget.pricesUsdPerMTok)) {
      expect(p.in).toBeLessThanOrEqual(star.in);
      expect(p.out).toBeLessThanOrEqual(star.out);
    }
  });

  it('the top 10 nightly journeys start with the first run and are real journey files', () => {
    const top = readFileSync('test/real-pc/top10.txt', 'utf8').trim().split('\n');
    expect(top).toHaveLength(10);
    expect(top[0]).toBe('J01-J02-first-run');
    for (const j of top) expect(() => readFileSync(`test/real-pc/journeys/${j}.json`)).not.toThrow();
  });
});

describe('pricing', () => {
  it('exact model, then the longest family prefix, then the catch-all', () => {
    expect(priceFor(budget, 'claude-sonnet-5-5').in).toBe(2);
    expect(priceFor(budget, 'claude-sonnet-4-6').in).toBe(3);
    expect(priceFor(budget, 'gpt-5-mini-2026').in).toBe(0.25);
    expect(priceFor(budget, 'mystery-model')).toEqual(budget.pricesUsdPerMTok['*']);
  });

  it('a Claude transcript counts each message once, with its cache tokens, and skips synthetic lines', () => {
    const msg = (id: string, model = 'claude-sonnet-5-5') =>
      JSON.stringify({
        type: 'assistant',
        message: {
          id,
          model,
          usage: { input_tokens: 1000, output_tokens: 100, cache_creation_input_tokens: 2000, cache_read_input_tokens: 10000 },
        },
      });
    const jsonl = [
      msg('a'),
      msg('a'),
      msg('b'),
      JSON.stringify({ type: 'user', message: { content: 'hi' } }),
      msg('c', '<synthetic>'),
      'not json',
    ].join('\n');
    const usages = claudeUsage([jsonl]);
    expect(usages).toHaveLength(2);
    // per message: 1000×2 + 100×10 + 2000×2.5 + 10000×0.2 = 10 000 → $0.01; two messages → $0.02
    expect(costUsd(budget, usages)).toBeCloseTo(0.02, 6);
  });

  it('a Codex session counts its last running total, cached input at the cache rate', () => {
    const lines = [
      { type: 'turn_context', payload: { model: 'gpt-5' } },
      {
        type: 'event_msg',
        payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 100, cached_input_tokens: 0, output_tokens: 10 } } },
      },
      {
        type: 'event_msg',
        payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 1000, cached_input_tokens: 400, output_tokens: 100 } } },
      },
    ];
    expect(codexUsage([lines.map((l) => JSON.stringify(l)).join('\n')])).toEqual([
      { model: 'gpt-5', input: 600, output: 100, cacheWrite: 0, cacheRead: 400 },
    ]);
  });

  it('journeys with no transcripts are charged the flat estimate, marked so; no journeys cost nothing', () => {
    const base = { time: 't', run: '1', ai: 'claude', part: 'r1-s0' };
    expect(ledgerRow(budget, { ...base, journeys: 4, usages: [] })).toBe('t\t1\tclaude\tr1-s0\t4\t2.0000\testimate');
    expect(ledgerRow(budget, { ...base, journeys: 0, usages: [] })).toBe('t\t1\tclaude\tr1-s0\t0\t0.0000\ttranscripts');
  });
});

describe('the month against the cap', () => {
  const b = { ...budget, monthlyCapInr: 1000, alertAtPercent: 80, usdToInr: 100 };
  const ledger = (...usd: number[]) =>
    [LEDGER_HEADER, ...usd.map((u, i) => `t\trun${i % 2}\tclaude\ts0\t5\t${u}\ttranscripts`)].join('\n') + '\n';

  it('under the alert level is ok; the run count is distinct runs', () => {
    expect(monthSpend(b, ledger(1, 2))).toEqual({ spentUsd: 3, spentInr: 300, capInr: 1000, percent: 30, state: 'ok', runs: 2 });
  });

  it('at the alert level it alerts, and at the cap it is over', () => {
    expect(monthSpend(b, ledger(4, 4)).state).toBe('alert');
    expect(monthSpend(b, ledger(6, 4)).state).toBe('over');
  });

  it('an empty or missing ledger is zero spend', () => {
    expect(monthSpend(b, '')).toMatchObject({ spentInr: 0, state: 'ok', runs: 0 });
  });
});

describe('pass^k', () => {
  const r = (round: number, journey: string, passed: boolean) => ({ ai: 'claude', round, journey, passed });

  it('a journey passes only when it passed every round; a missed round is a fail', () => {
    const { rows, ok } = passK([
      r(1, 'J07', true),
      r(2, 'J07', true),
      r(3, 'J07', true),
      r(1, 'B04', true),
      r(2, 'B04', false),
      r(1, 'B05', true),
    ]);
    expect(ok).toBe(false);
    expect(rows.map((x) => `${x.journey} ${x.passes}/${x.rounds}`)).toEqual(['B04 1/3', 'B05 1/3', 'J07 3/3']);
    expect(table(rows)).toContain('| claude | B04 | 1/3 | **no** |');
    expect(passK([r(1, 'J07', true), r(2, 'J07', true)]).ok).toBe(true);
  });

  it('reads each round from the artifact folder names, and a journey run in two parts passes only if both did', () => {
    const dir = mkdtempSync(join(tmpdir(), 'passk-'));
    const put = (part: string, journey: string, failed: number) => {
      mkdirSync(join(dir, part, journey), { recursive: true });
      writeFileSync(join(dir, part, journey, 'summary.json'), JSON.stringify({ journey, steps: 5, failed }));
    };
    put('real-ai-claude-r1-s0', 'J01', 0);
    put('real-ai-claude-r1-s1', 'J01', 1);
    put('real-ai-claude-r2-s0', 'J01', 0);
    put('other-artifact', 'J01', 0);
    try {
      expect(readResults(dir).sort((a, b) => a.round - b.round)).toEqual([r(1, 'J01', false), r(2, 'J01', true)]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
