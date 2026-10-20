// Spec: 04 §13.5 (kit `Calculator`: inputs and results; two-way controls write the surface's data model), CR-0022 pick 5
// (formulas are text read by shared/kit/evaluate.ts, never code), AT-347 (outputs recompute from the inputs; a bad formula
// shows "Can't work this out"), 02 §F19.1–F19.2 (en-IN numbers; money in the exact ₹ form), X-180. R1 T4.
// An input named `people` reads and writes the data model at `people` (relative to its list item), so a Stepper or Slider
// bound to `/people` drives the same number and every part bound there updates at once (AT-342). Until the model holds a
// number there, the input's own value stands.
import { t } from '../../shared/copy/t';
import { formatInr } from '../../shared/format';
import { evaluate } from '../../shared/kit/evaluate';
import { TID } from '../../shared/testids';
import { formatValue } from './LineChart';
import styles from './NumbersForms.module.css';

export type CalcUnit = 'number' | 'rupees' | 'percent';
export interface CalcInput {
  name: string;
  label: string;
  value: number;
}
export interface CalcOutput {
  label: string;
  formula: string;
  unit?: CalcUnit;
}

/** One result as shown: money exact to the paisa (₹10,747.70), other numbers by the 02 rules (≤ 1 decimal, "8%"). */
export function formatResult(v: number, unit: CalcUnit = 'number'): string {
  if (unit === 'rupees') {
    const paise = Math.round(v * 100);
    return Number.isSafeInteger(paise) ? formatInr(paise).replace('-', '−') : formatValue(v);
  }
  return formatValue(v, unit);
}

/** Every output's value from the inputs, or null where the formula can't be worked out. */
export function calculate(outputs: readonly CalcOutput[], vars: Readonly<Record<string, number>>): (number | null)[] {
  return outputs.map((o) => evaluate(o.formula, vars));
}

export function Calculator({
  inputs,
  outputs,
  values,
  onInput,
}: {
  inputs: CalcInput[];
  outputs: CalcOutput[];
  /** The inputs' current values by name (the data model's number, else the input's own value). */
  values: Record<string, number>;
  onInput(name: string, v: number): void;
}) {
  const results = calculate(outputs, values);
  return (
    <div className={styles.piece} data-testid={TID.kitCalculator}>
      <div className={styles.fields}>
        {inputs.map((i) => (
          <label key={i.name} className={styles.field}>
            <span data-copy="ai">{i.label}</span>
            <input
              className={styles.input}
              type="number"
              inputMode="decimal"
              data-input={i.name}
              value={Number.isFinite(values[i.name]) ? values[i.name] : ''}
              onChange={(e) => {
                const v = e.target.valueAsNumber;
                if (Number.isFinite(v)) onInput(i.name, v);
              }}
            />
          </label>
        ))}
      </div>
      <dl className={styles.results} aria-live="polite">
        {outputs.map((o, k) => {
          const v = results[k] ?? null;
          return (
            <div key={k} className={styles.result} data-output={k}>
              <dt data-copy="ai">{o.label}</dt>
              <dd className={v === null ? styles.cannot : styles.number}>
                {v === null ? t('kit.calculator.cannot') : formatResult(v, o.unit)}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
