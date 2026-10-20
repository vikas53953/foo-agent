// Spec: 04 §13.5 (Calculator: outputs recompute from the inputs), CR-0022 pick 5 (formulas are text read by this
// evaluator, never code: no `eval`, `Function` or dynamic import), 10-acceptance-2 §C.9 AT-347 (+ − × ÷ ^, min, max,
// round, pmt; a bad formula shows "Can't work this out"), AT-371, X-180. R1 T4.
// A small recursive-descent reader over a closed grammar: numbers, the Calculator's input names, + - * / ^ ( ) and four
// functions. Anything else, or a result that is not a finite number, is null.

/** The longest formula the catalog lets through (catalog.ts Calculator `formula`). */
const MAX_LENGTH = 200;
/** Nesting deeper than this is refused (bounds the recursion). */
const MAX_DEPTH = 32;

type Token = { k: 'num'; v: number } | { k: 'name'; v: string } | { k: 'op'; v: string };

/** "×", "÷" and the U+2212 minus read as their keyboard forms, so a formula can be written the way it is shown. */
const ALIASES: Record<string, string> = { '×': '*', '÷': '/', '−': '-' };

function tokens(src: string): Token[] | null {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = ALIASES[src[i]!] ?? src[i]!;
    if (/\s/u.test(ch)) {
      i++;
      continue;
    }
    if ('+-*/^(),'.includes(ch)) {
      out.push({ k: 'op', v: ch });
      i++;
      continue;
    }
    const num = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/iu.exec(src.slice(i));
    if (num) {
      out.push({ k: 'num', v: Number(num[0]) });
      i += num[0].length;
      continue;
    }
    const name = /^[A-Za-z][A-Za-z0-9]*/u.exec(src.slice(i));
    if (!name) return null;
    out.push({ k: 'name', v: name[0] });
    i += name[0].length;
  }
  return out;
}

/** pmt(rate, periods, principal): the even payment that pays a loan back (an EMI), as a positive amount. */
function pmt(rate: number, periods: number, principal: number): number {
  // A rate of −100% or less has no repayment (1 + rate is 0 or negative).
  if (periods <= 0 || rate <= -1) return NaN;
  if (rate === 0) return principal / periods;
  return (principal * rate) / (1 - (1 + rate) ** -periods);
}

const FUNCTIONS: Record<string, { arity: [number, number]; fn: (...a: number[]) => number }> = {
  min: { arity: [1, 8], fn: (...a) => Math.min(...a) },
  max: { arity: [1, 8], fn: (...a) => Math.max(...a) },
  round: { arity: [1, 2], fn: (x, digits = 0) => (Number.isInteger(digits) ? Math.round(x * 10 ** digits) / 10 ** digits : NaN) },
  pmt: { arity: [3, 3], fn: (r, n, p) => pmt(r!, n!, p!) },
};
const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

class Reader {
  private at = 0;
  constructor(
    private readonly toks: Token[],
    private readonly vars: Readonly<Record<string, number>>,
  ) {}

  private peek(): Token | undefined {
    return this.toks[this.at];
  }
  private isOp(v: string): boolean {
    const t = this.peek();
    return t?.k === 'op' && t.v === v;
  }
  private take(v: string): void {
    if (!this.isOp(v)) throw new Error('expected');
    this.at++;
  }

  whole(): number {
    const v = this.sum(0);
    if (this.at !== this.toks.length) throw new Error('trailing');
    return v;
  }

  // sum := product (("+" | "-") product)*
  private sum(d: number): number {
    let v = this.product(d);
    while (this.isOp('+') || this.isOp('-')) {
      const op = (this.toks[this.at++] as { v: string }).v;
      const r = this.product(d);
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }

  // product := unary (("*" | "/") unary)*
  private product(d: number): number {
    let v = this.unary(d);
    while (this.isOp('*') || this.isOp('/')) {
      const op = (this.toks[this.at++] as { v: string }).v;
      const r = this.unary(d);
      v = op === '*' ? v * r : v / r;
    }
    return v;
  }

  // unary := ("-" | "+") unary | power   (so -2^2 is -(2^2), as on paper)
  private unary(d: number): number {
    if (d > MAX_DEPTH) throw new Error('deep');
    if (this.isOp('-')) {
      this.at++;
      return -this.unary(d + 1);
    }
    if (this.isOp('+')) {
      this.at++;
      return this.unary(d + 1);
    }
    return this.power(d);
  }

  // power := atom ("^" unary)?   (right-associative: 2^3^2 is 2^(3^2))
  private power(d: number): number {
    const base = this.atom(d);
    if (!this.isOp('^')) return base;
    this.at++;
    return base ** this.unary(d + 1);
  }

  // atom := number | name | name "(" sum ("," sum)* ")" | "(" sum ")"
  private atom(d: number): number {
    const t = this.peek();
    if (!t) throw new Error('end');
    if (t.k === 'num') {
      this.at++;
      return t.v;
    }
    if (t.k === 'op') {
      this.take('(');
      const v = this.sum(d + 1);
      this.take(')');
      return v;
    }
    this.at++;
    if (this.isOp('(')) {
      if (!has(FUNCTIONS, t.v)) throw new Error('unknown function');
      const f = FUNCTIONS[t.v]!;
      this.at++;
      const args = [this.sum(d + 1)];
      while (this.isOp(',')) {
        this.at++;
        args.push(this.sum(d + 1));
      }
      this.take(')');
      if (args.length < f.arity[0] || args.length > f.arity[1]) throw new Error('arity');
      return f.fn(...args);
    }
    if (!has(this.vars, t.v)) throw new Error('unknown name');
    return this.vars[t.v]!;
  }
}

/**
 * The value of one Calculator formula with the inputs by name, or null when the formula is not in the grammar, names
 * something that is not an input or a function, or the result is not a finite number (÷ 0, a huge power).
 */
export function evaluate(formula: string, vars: Readonly<Record<string, number>>): number | null {
  if (formula.length > MAX_LENGTH) return null;
  const toks = tokens(formula);
  if (!toks || toks.length === 0) return null;
  try {
    const v = new Reader(toks, vars).whole();
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}
