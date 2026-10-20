// Spec: 04 §13.5 (kit pieces), CR-0022 AT-342 (Stepper: + / − and arrow keys within min/max), AT-343 (Compare), AT-346
// (TimedChecklist timer), AT-347 (Calculator: + − × ÷ ^, min, max, round, pmt; a bad formula shows "Can't work this out"),
// AT-348 (GoalRing arc share, "{value} of {target}", role="meter"), AT-351 (ShortForm sends its values), 02-2 §F19.9,
// §F19.1–F19.2, X-180. R1 T4 seams: shared/kit/evaluate.ts and the pure helpers of each piece. The AT rows live in
// test/e2e/r1-numbers-forms.spec.ts.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { t } from '../../src/shared/copy/t';
import { evaluate } from '../../src/shared/kit/evaluate';
import { calculate, Calculator, formatResult } from '../../src/renderer/kit/Calculator';
import { Compare } from '../../src/renderer/kit/Compare';
import { GoalRing, goalShare } from '../../src/renderer/kit/GoalRing';
import { ShortForm } from '../../src/renderer/kit/ShortForm';
import { stepValue } from '../../src/renderer/kit/Stepper';
import { asTimer, pauseTimer, startTimer, timerLeft } from '../../src/renderer/kit/TimedChecklist';

describe('the safe evaluator (CR-0022 pick 5)', () => {
  const v = { bill: 2400, people: 4, tip: 10, loan: 500000, rate: 9, months: 60 };
  it('reads + − × ÷ ^, brackets, names and the four functions', () => {
    expect(evaluate('bill * (1 + tip / 100) / people', v)).toBe(660);
    expect(evaluate('bill × 2 ÷ people − 1', v)).toBe(1199);
    expect(evaluate('2 ^ 3 ^ 2', v)).toBe(512);
    expect(evaluate('-2 ^ 2', v)).toBe(-4);
    expect(evaluate('2 ^ -1', v)).toBe(0.5);
    expect(evaluate('min(bill, 100, people)', v)).toBe(4);
    expect(evaluate('max(1, 2, 3)', v)).toBe(3);
    expect(evaluate('round(10 / 3)', v)).toBe(3);
    expect(evaluate('round(10 / 3, 2)', v)).toBe(3.33);
    expect(evaluate('1.5e3 + .5', v)).toBe(1500.5);
    // EMI on ₹5 lakh at 9% a year for 60 months.
    expect(evaluate('round(pmt(rate / 1200, months, loan), 2)', v)).toBe(10379.18);
    expect(evaluate('pmt(0, 10, 1000)', v)).toBe(100);
    // A rate of −100% or less has no repayment.
    expect(evaluate('pmt(-1, 10, 1000)', v)).toBeNull();
    expect(evaluate('pmt(-2, 10, 1000)', v)).toBeNull();
  });
  it('a bad formula, an unknown name or a result that is not a number is null', () => {
    for (const f of ['bill +', '2 3', 'unknown * 2', 'min()', 'round(1, 2, 3)', 'pmt(1, 2)', 'bill / 0', '10 ^ 999', 'round(1, 0.5)', ')'])
      expect(evaluate(f, v), f).toBeNull();
  });
});

describe('Calculator', () => {
  it('recomputes from the inputs; money is exact; a bad output says it cannot', () => {
    const outputs = [
      { label: 'Each pays', formula: 'bill * (1 + tip / 100) / people', unit: 'rupees' as const },
      { label: 'Broken', formula: 'bill +' },
    ];
    expect(calculate(outputs, { bill: 2400, people: 4, tip: 10 })).toEqual([660, null]);
    expect(calculate(outputs, { bill: 2400, people: 3, tip: 10 })[0]).toBeCloseTo(880);
    expect(formatResult(10379.1767, 'rupees')).toBe('₹10,379.18');
    expect(formatResult(150000, 'rupees')).toBe('₹1,50,000');
    expect(formatResult(-12.5, 'rupees')).toBe('−₹12.50');
    expect(formatResult(8, 'percent')).toBe('8%');
    const html = renderToStaticMarkup(
      createElement(Calculator, {
        inputs: [{ name: 'bill', label: 'Bill', value: 2400 }],
        outputs,
        values: { bill: 2400, people: 4, tip: 10 },
        onInput: () => undefined,
      }),
    );
    expect(html).toContain('₹660');
    expect(html).toContain(t('kit.calculator.cannot'));
  });
});

describe('Stepper', () => {
  it('steps within min and max without float drift', () => {
    expect(stepValue(4, 1, 1, 10)).toBe(5);
    expect(stepValue(10, 1, 1, 10)).toBe(10);
    expect(stepValue(1, -1, 1, 10)).toBe(1);
    expect(stepValue(0.2, 1, 0, 1, 0.1)).toBe(0.3);
  });
});

describe('Compare and GoalRing', () => {
  it('outlines the highlighted column with its why', () => {
    const col = (title: string) => ({ title, rows: [{ label: 'Price', value: '₹4,200' }] });
    const html = renderToStaticMarkup(createElement(Compare, { columns: [col('IndiGo'), col('Akasa')], highlight: 1, why: 'Cheapest' }));
    expect(html.match(/data-best="true"/g)).toHaveLength(1);
    expect(html).toContain(t('kit.compare.best'));
    expect(html).toContain('Cheapest');
  });
  it('the arc is value / target, written in the middle, as a meter', () => {
    expect(goalShare(7500, 10000)).toBe(0.75);
    expect(goalShare(12000, 10000)).toBe(1);
    expect(goalShare(-5, 10)).toBe(0);
    const html = renderToStaticMarkup(createElement(GoalRing, { value: 7500, target: 10000, label: 'Goa trip fund' }));
    expect(html).toContain('role="meter"');
    expect(html).toContain('aria-valuemax="10000"');
    expect(html).toContain(t('kit.goal.of', { value: '7,500', target: '10,000' }));
  });
});

describe('TimedChecklist', () => {
  it('a timer counts down, pauses and resumes on the clock', () => {
    const run = startTimer(null, 0, 60, 1_000);
    expect(timerLeft(run, 31_000)).toBe(30_000);
    const paused = pauseTimer(run, 31_000);
    expect(timerLeft(paused, 99_000)).toBe(30_000);
    expect(timerLeft(startTimer(paused, 0, 60, 100_000), 110_000)).toBe(20_000);
    // Starting another step starts that step fresh.
    expect(timerLeft(startTimer(paused, 1, 90, 0), 0)).toBe(90_000);
    expect(timerLeft(run, 999_000)).toBe(0);
    // A finished timer starts again from the step's seconds; a paused one at 0 too.
    expect(timerLeft(startTimer(run, 0, 60, 999_000), 999_000)).toBe(60_000);
    expect(timerLeft(startTimer({ step: 0, leftMs: 0 }, 0, 60, 0), 0)).toBe(60_000);
    // Read back from the data model: only a real timer shape counts.
    expect(asTimer({ step: 1, endsAt: 5 })).toEqual({ step: 1, endsAt: 5 });
    expect(asTimer({ step: 1, leftMs: 30 })).toEqual({ step: 1, leftMs: 30 });
    for (const bad of [null, 3, 'x', { step: -1, leftMs: 1 }, { step: 1.5, endsAt: 1 }, { step: 0 }, { step: 0, leftMs: -5 }])
      expect(asTimer(bad)).toBeNull();
  });
});

describe('ShortForm', () => {
  it('draws up to 6 fields and a submit; a field that asks for a secret is not drawn', () => {
    const html = renderToStaticMarkup(
      createElement(ShortForm, {
        fields: [
          { name: 'who', label: 'Name', type: 'text' },
          { name: 'pw', label: 'Password', type: 'text' },
          { name: 'size', label: 'Party size', type: 'choice', options: ['2', '4'] },
        ],
        values: { who: 'Asha' },
        agentName: 'foo',
        onChange: () => undefined,
        onSubmit: () => undefined,
      }),
    );
    expect(html).toContain('name="who"');
    expect(html).not.toContain('name="pw"');
    expect(html).toContain(t('kit.form.secret_refused'));
    expect(html).toContain(t('kit.form.submit', { agentName: 'foo' }));
  });
});
