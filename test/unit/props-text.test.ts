// Property tests (fast-check) for the pure text rules every reply passes through: 08-2 §7.3 / 08-4 §25.5 item 1 (the
// FOO/1 envelope parser), 04-2 §22.4 and 08-2 §11.4 (a card number never survives the redactor). Random inputs find the cases hand-picked examples miss.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseEnvelope } from '../../src/engine/prompt/envelope';
import { luhn, redactSecrets } from '../../src/shared/redactor';

const RUNS = Number(process.env.PROPS_RUNS ?? 500);
const noTags = (s: string): boolean => !/<\/?(say|act)>/.test(s);

describe('FOO/1 envelope parser', () => {
  it('never throws on any text, and the say never holds an <act> block', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'grapheme', maxLength: 400 }), (text) => {
        const e = parseEnvelope(text);
        expect(e.say).not.toContain('<act>');
        expect(typeof e.sayTagged).toBe('boolean');
        expect(e.act === undefined ? e.actError !== null : true).toBe(true);
      }),
      { numRuns: RUNS },
    );
  });

  it('a well-formed reply round-trips: the say and the act come back exactly', () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 200 }).filter(noTags),
        fc.jsonValue({ maxDepth: 3 }).filter((v) => noTags(JSON.stringify(v))),
        (say, act) => {
          const e = parseEnvelope(`<say>${say}</say>\n<act>${JSON.stringify(act)}</act>`);
          expect(e.sayTagged).toBe(true);
          expect(e.say).toBe(say);
          expect(e.actError).toBeNull();
          expect(e.act).toEqual(JSON.parse(JSON.stringify(act)));
        },
      ),
      { numRuns: RUNS },
    );
  });
});

describe('redactor', () => {
  // A Luhn-valid 16-digit card number (first digit 4), written plain, in fours, or with dashes.
  const card = fc
    .array(fc.integer({ min: 0, max: 9 }), { minLength: 14, maxLength: 14 })
    .map((ds) => {
      const body = `4${ds.join('')}`;
      const check = [...Array(10).keys()].find((d) => luhn(`${body}${d}`))!;
      return `${body}${check}`;
    })
    .chain((n) => fc.constantFrom(n, n.replace(/(\d{4})(?=\d)/g, '$1 '), n.replace(/(\d{4})(?=\d)/g, '$1-')));
  const words = fc.stringMatching(/^[A-Za-z ,.]{0,60}$/);

  it('a card number anywhere in a message never survives redaction, in any of its usual spellings', () => {
    fc.assert(
      fc.property(words, card, words, (before, n, after) => {
        const out = redactSecrets(`${before} ${n} ${after}`).text;
        const digits = n.replace(/\D/g, '');
        expect(out.replace(/\D/g, '')).not.toContain(digits);
        expect(out).toContain('••••');
      }),
      { numRuns: RUNS },
    );
  });
});
