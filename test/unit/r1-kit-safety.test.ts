// Spec: 10-acceptance-2 §C.9 AT-370 (ShortForm and TextField refuse values that match 04-2 §22.4 and offer the Secret
// box), AT-371 (Calculator formulas go through shared/kit/evaluate.ts; no `eval`, `Function` or dynamic import in the kit
// bundle); 04 §13.5, Article 8, CR-0022 pick 5, X-180. R1 T4. The tap-through in the real app is in
// test/e2e/r1-numbers-forms.spec.ts (AT-351).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluate } from '../../src/shared/kit/evaluate';
import { asksForSecret, firstSecret } from '../../src/renderer/kit/SecretRefused';
import { formValues } from '../../src/renderer/kit/ShortForm';

const ROOT = join(__dirname, '../..');
const KIT_DIRS = ['src/shared/kit', 'src/renderer/kit'];
const sources = () =>
  KIT_DIRS.flatMap((d) =>
    readdirSync(join(ROOT, d))
      .filter((f) => /\.tsx?$/.test(f))
      .map((f) => ({ file: `${d}/${f}`, text: readFileSync(join(ROOT, d, f), 'utf8') })),
  );
// A fake key shaped like P1 (an `sk-` key); not a real secret.
const FAKE_KEY = 'sk-proj-EXAMPLEexample0123456789abcd';

describe('kit safety (04 §13.5, Article 8)', () => {
  it('AT-370 · ShortForm and TextField values that match 04-2 §22.4 are caught with what the Secret box offer moves, and a ShortForm never draws a field that asks for a secret', () => {
    // A labelled password: only what follows the label moves into the Secret box, named "Password".
    expect(firstSecret(['Asha', 'password: Tiger#2026'])).toEqual({
      text: 'password: Tiger#2026',
      value: 'Tiger#2026',
      slot: 'password',
      rest: '',
    });
    // A key inside other words: the key moves (named for its kind), the words stay in the field.
    expect(firstSecret([`my key ${FAKE_KEY} thanks`])).toMatchObject({ value: FAKE_KEY, slot: 'openai', rest: 'my key  thanks' });
    // A card number that passes Luhn (a test number) is caught; ordinary values pass.
    expect(firstSecret(['4111 1111 1111 1111'])?.slot).toBe('card');
    expect(firstSecret(['Asha Rao', 'asha@example.com', '+91 98765 43210', '4', '2026-11-02'])).toBeNull();
    // A ShortForm field whose label asks for a secret is not drawn and never sends; "PIN code" (postal) is a normal field.
    for (const label of ['Password', 'UPI PIN', 'OTP', 'Card number', 'CVV', 'API key', 'पासवर्ड']) expect(asksForSecret(label)).toBe(true);
    for (const label of ['Name', 'PIN code', 'Pincode', 'Guests', 'Date']) expect(asksForSecret(label)).toBe(false);
    const fields = [
      { name: 'who', label: 'Name', type: 'text' as const },
      { name: 'pw', label: 'Password', type: 'text' as const },
      { name: 'guests', label: 'Guests', type: 'number' as const },
    ];
    expect(formValues(fields, { who: ' Asha ', pw: 'hunter22', guests: '4' })).toEqual({ who: 'Asha', guests: 4 });
  });

  it('AT-371 · Calculator never runs code: formulas go through shared/kit/evaluate.ts, no eval, Function or dynamic import in the kit', () => {
    for (const { file, text } of sources()) {
      const code = text.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(code, file).not.toMatch(/\beval\s*\(/);
      expect(code, file).not.toMatch(/\bnew\s+Function\b|\bFunction\s*\(/);
      expect(code, file).not.toMatch(/\bimport\s*\(/);
      expect(code, file).not.toMatch(/\bset(?:Timeout|Interval)\s*\(\s*['"`]/);
    }
    // The Calculator draws its results through evaluate().
    expect(readFileSync(join(ROOT, 'src/renderer/kit/Calculator.tsx'), 'utf8')).toContain("from '../../shared/kit/evaluate'");
    // Anything outside the grammar is "can't work this out", never run.
    const vars = { bill: 2400, people: 4 };
    for (const f of [
      'alert(1)',
      'constructor',
      'bill.constructor',
      '__proto__',
      'toString',
      'hasOwnProperty',
      'this',
      'bill; people',
      'bill = 1',
      '`x`',
      '"1"',
      'process.exit(1)',
      'Math.max(1)',
      'bill[0]',
      '',
      '('.repeat(40) + '1' + ')'.repeat(40),
    ])
      expect(evaluate(f, vars), f).toBeNull();
    expect(evaluate('bill / people', vars)).toBe(600);
  });
});
