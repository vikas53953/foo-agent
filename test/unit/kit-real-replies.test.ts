// Spec: 04 §13.5 (kit surface: an invalid or unknown component is dropped with "Couldn't show part of this"; CR-0046: small
// slips that leave the meaning whole are mended first), 08-4 §24.5
// (the generated catalog text names every limit), CR-0046 AT-441, AT-442, X-204; CR-0050 AT-443, X-208 (closing brackets the AI
// got wrong or left out are read as the ones due).
// Cassettes: test/fixtures/kit-replies/*.txt, real AI replies (or rebuilt from a real run's words, see the README there).
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KitComponentSchema } from '../../src/shared/kit/catalog';
import { mendComponent, parseKitBlock } from '../../src/shared/kit/parse';
import { catalogText, kitPromptSection } from '../../src/shared/kit/prompt';
import { foldFence, kitMessagesOf, type Surface } from '../../src/shared/kit/surface';

const DIR = 'test/fixtures/kit-replies';
const cassettes = readdirSync(DIR).filter((f) => f.endsWith('.txt'));

/** The surfaces a whole reply draws, the way the bubble folds them, and how many parts it had to drop. */
function draw(text: string): { surface: Surface; dropped: number } {
  const { messages, dropped } = kitMessagesOf(text);
  const folded = foldFence([messages], 0);
  return { surface: folded.surfaces[0]!, dropped: dropped + folded.dropped };
}

const create = '{"createSurface":{"surfaceId":"s1","catalogId":"foo.kit.v1"}}';
const one = (c: object) => `${create}\n${JSON.stringify({ updateComponents: { surfaceId: 's1', components: [c] } })}`;

describe('CR-0046 kit replies from real runs draw (AT-441)', () => {
  it('there is a cassette for each real run that showed the caption', () => {
    expect(cassettes).toEqual(
      expect.arrayContaining([
        'rebuilt-r1-phones-compare.txt',
        'rebuilt-b09-emi-calculator.txt',
        'real-run30-b09-emi-calculator.txt',
        'real-run30-b09-map-stops.txt',
        'real-run30-b09-gdp-chart.txt',
      ]),
    );
  });

  it.each(cassettes)('AT-441 %s draws with no "Couldn\'t show part of this"', (file) => {
    const { surface, dropped } = draw(readFileSync(`${DIR}/${file}`, 'utf8'));
    expect(dropped).toBe(0);
    expect(surface.components.root).toBeDefined();
  });

  it('AT-441 run 21 phones: the Compare keeps its 3 columns; a number reads as text, null and unknown keys are left out', () => {
    const { surface } = draw(readFileSync(`${DIR}/rebuilt-r1-phones-compare.txt`, 'utf8'));
    const root = surface.components.root!;
    expect(root.component).toBe('Compare');
    if (root.component !== 'Compare') return;
    expect(root.columns.map((c) => c.title)).toEqual(['Samsung Galaxy M35 5G', 'Redmi Note 13 5G', 'Realme Narzo 70 Pro']);
    expect(root.columns[0]!.rows[1]).toEqual({ label: 'RAM (GB)', value: '8' });
    expect(root).not.toHaveProperty('highlight');
    expect(root).not.toHaveProperty('why');
    expect(root.columns[2]).not.toHaveProperty('note');
  });

  it('AT-441 run 16 EMI: the Calculator keeps its inputs and formulas; "5000000" reads as a number', () => {
    const { surface } = draw(readFileSync(`${DIR}/rebuilt-b09-emi-calculator.txt`, 'utf8'));
    const root = surface.components.root!;
    expect(root.component).toBe('Calculator');
    if (root.component !== 'Calculator') return;
    expect(root.inputs).toEqual([
      { name: 'principal', label: 'Loan amount', value: 5_000_000 },
      { name: 'rate', label: 'Interest rate (% a year)', value: 8.5 },
      { name: 'years', label: 'Loan length (years)', value: 20 },
    ]);
    expect(root.outputs[0]).toEqual({ label: 'Monthly EMI', formula: 'round(pmt(rate/1200, years*12, principal))', unit: 'rupees' });
  });
});

describe('CR-0046 what is mended and what is still dropped (AT-441)', () => {
  const mended: [string, object, object][] = [
    ['an unknown key', { id: 'd', component: 'Divider', color: 'grey' }, { id: 'd', component: 'Divider' }],
    ['null on an optional key', { id: 't', component: 'Text', text: 'Hi', variant: null }, { id: 't', component: 'Text', text: 'Hi' }],
    ['a number where text goes', { id: 't', component: 'Text', text: 42 }, { id: 't', component: 'Text', text: '42' }],
    [
      'a plain number in quotes',
      { id: 's', component: 'Stepper', label: 'Guests', value: '12', min: 0, max: '50' },
      { id: 's', component: 'Stepper', label: 'Guests', value: 12, min: 0, max: 50 },
    ],
    [
      'an emoji label over 80 characters, cut by whole emoji',
      { id: 'c', component: 'CheckBox', label: '😀'.repeat(81), value: true },
      { id: 'c', component: 'CheckBox', label: `${'😀'.repeat(79)}…`, value: true },
    ],
    [
      'a label over 80 characters',
      { id: 'c', component: 'CheckBox', label: 'x'.repeat(95), value: true },
      { id: 'c', component: 'CheckBox', label: `${'x'.repeat(79)}…`, value: true },
    ],
  ];
  it.each(mended)('AT-441 mends %s', (_why, raw, want) => {
    expect(mendComponent(raw)).toEqual(want);
    const p = parseKitBlock(one(raw), false);
    expect(p.dropped).toBe(0);
  });

  const dropped: [string, object][] = [
    ['an unknown component', { id: 'h', component: 'Hologram' }],
    ['a missing required key', { id: 'g', component: 'GoalRing', value: 3, label: 'Saved' }],
    [
      'a value outside its list',
      { id: 'f', component: 'ShortForm', fields: [{ name: 'pin', label: 'PIN', type: 'password' }], action: { event: { name: 'go' } } },
    ],
    [
      'a Calculator input name the formulas cannot read',
      {
        id: 'k',
        component: 'Calculator',
        inputs: [{ name: 'loan_amount', label: 'Loan', value: 1 }],
        outputs: [{ label: 'x', formula: 'loan_amount' }],
      },
    ],
    ['too few items', { id: 'c', component: 'Compare', columns: [{ title: 'Only one', rows: [{ label: 'a', value: 'b' }] }] }],
    ['the app-only composer.fill action', { id: 'b', component: 'Button', child: 't', action: { event: { name: 'composer.fill' } } }],
    ['a web image', { id: 'i', component: 'Image', url: 'https://example.com/a.png', alt: 'a' }],
    [
      'a formula over 200 characters (never cut)',
      {
        id: 'k',
        component: 'Calculator',
        inputs: [{ name: 'a', label: 'A', value: 1 }],
        outputs: [{ label: 'x', formula: `a${'+a'.repeat(100)}` }],
      },
    ],
    ['a number as an id or action name (never read as text)', { id: 'b', component: 'Button', child: 't', action: { event: { name: 5 } } }],
    [
      'a number as a formula',
      { id: 'k', component: 'Calculator', inputs: [{ name: 'a', label: 'A', value: 1 }], outputs: [{ label: 'x', formula: 42 }] },
    ],
    ['a number that is not plain', { id: 's', component: 'Stepper', label: 'Loan', value: '50,00,000', min: 0, max: 1 }],
  ];
  it.each(dropped)('AT-354 still drops %s', (_why, raw) => {
    expect(mendComponent(raw)).toBeNull();
    expect(parseKitBlock(one(raw), false).dropped).toBe(1);
  });

  it('a message with an unknown key or a null is mended too; another catalog is still refused', () => {
    const msg =
      '{"updateComponents":{"surfaceId":"s1","catalogId":"foo.kit.v1","components":[{"id":"root","component":"Divider"}]},"type":"update"}';
    expect(parseKitBlock(`${create}\n${msg}`, false)).toMatchObject({
      dropped: 0,
      messages: [{}, { updateComponents: { surfaceId: 's1' } }],
    });
    expect(parseKitBlock('{"createSurface":{"surfaceId":"s","catalogId":"https://a2ui.org/basic"}}', false).dropped).toBe(1);
  });

  it('a data-model update with a null path is still refused, never read as the root', () => {
    expect(parseKitBlock(`${create}\n{"updateDataModel":{"surfaceId":"s1","path":null,"value":{"x":1}}}`, false).dropped).toBe(1);
  });

  it('every component that is already valid comes back unchanged', () => {
    const ok = {
      id: 'c',
      component: 'Compare',
      columns: [
        { title: 'A', rows: [{ label: 'a', value: 'b' }] },
        { title: 'B', rows: [{ label: 'a', value: 'c' }] },
      ],
      highlight: 1,
      why: 'Cheaper',
    };
    expect(KitComponentSchema.parse(ok)).toEqual(ok);
    expect(mendComponent(ok)).toEqual(ok);
  });
});

describe('CR-0046 the prompt teaches the limits the checker uses (AT-442)', () => {
  it('AT-442 the catalog text names lengths, counts and the input-name pattern', () => {
    const text = catalogText();
    expect(text).toContain('- Compare {columns: [{title: string ≤80, rows: [{label: string ≤80, value: string ≤200}] 1–12}] 2–3');
    expect(text).toContain('inputs: [{name: string matching ^[a-z][a-zA-Z0-9]{0,23}$, label: string ≤80, value: number}] 1–8');
    expect(text).toContain('formula: string ≤200');
  });

  it('AT-442 the kit section says to use only the keys shown and to leave an unused optional key out', () => {
    expect(kitPromptSection('balanced')).toContain(
      'Use only the keys shown (? marks optional ones); leave an optional key out instead of writing null.',
    );
  });
});

describe('CR-0050 closing brackets the AI got wrong or left out (AT-443)', () => {
  const comps = (c: object) => JSON.stringify({ updateComponents: { surfaceId: 's1', components: [c] } });
  const calc = {
    id: 'root',
    component: 'Calculator',
    inputs: [{ name: 'a', label: 'A', value: 1 }],
    outputs: [{ label: 'x', formula: 'a*2', unit: 'rupees' }],
  };
  const good = comps(calc);
  // Run 30 EMI: `}]}}]}` where `}]}]}}` is due.
  const swapped = good.replace(/\}\]\}\]\}\}$/, '}]}}]}');

  it.each([
    ['run 30 EMI: `]` and `}` swapped at the end of the list', 'real-run30-b09-emi-calculator.txt', 'Calculator'],
    ['run 30 map: the last closers left out', 'real-run30-b09-map-stops.txt', 'MapStops'],
    ['run 30 chart: `}` and `]` swapped near the end', 'real-run30-b09-gdp-chart.txt', 'LineChart'],
  ])('AT-443 %s still draws', (_why, file, component) => {
    const { surface, dropped } = draw(readFileSync(`${DIR}/${file}`, 'utf8'));
    expect(dropped).toBe(0);
    expect(surface.components.root?.component).toBe(component);
  });

  it('AT-443 a swapped closer is read as the one due, and the piece is the one written', () => {
    expect(swapped).not.toBe(good);
    expect(() => JSON.parse(swapped)).toThrow();
    const p = parseKitBlock(`${create}\n${swapped}`, false);
    expect(p.dropped).toBe(0);
    expect(p.messages[1]).toEqual(JSON.parse(good));
  });

  it('AT-443 closers left out at the end of the reply are added; while streaming the message is held back instead', () => {
    const cut = good.slice(0, -4);
    expect(parseKitBlock(`${create}\n${cut}`, false)).toMatchObject({ dropped: 0, pending: false, messages: [{}, JSON.parse(good)] });
    expect(parseKitBlock(`${create}\n${cut}`, true)).toMatchObject({ dropped: 0, pending: true });
    expect(parseKitBlock(`${create}\n${cut}`, true).messages).toHaveLength(1);
  });

  it('AT-443 a reply cut inside a text value is still dropped, never guessed', () => {
    const cut = good.slice(0, good.indexOf('rupees') + 3);
    expect(parseKitBlock(`${create}\n${cut}`, false)).toMatchObject({ dropped: 1, messages: [{}] });
  });

  it('AT-443 a line that starts a new message ends the open one before it', () => {
    const open = good.slice(0, -3);
    const data = '{"updateDataModel":{"surfaceId":"s1","path":"/","value":{"a":2}}}';
    const p = parseKitBlock(`${create}\n${open}\n${data}`, false);
    expect(p.dropped).toBe(0);
    expect(p.messages).toEqual([JSON.parse(create), JSON.parse(good), JSON.parse(data)]);
  });

  it('AT-443 a closer too many after a message is left out, as before', () => {
    const p = parseKitBlock(`${create}\n${good}}`, false);
    expect(p).toMatchObject({ dropped: 0, messages: [{}, JSON.parse(good)] });
  });

  it('AT-443 a data value that only looks like a new message is not cut', () => {
    const data = [
      '{"updateDataModel": {"surfaceId": "s1", "path": "/", "value": {',
      '  "rows": [',
      '    {"createSurface": "x"},',
      '    {"deleteSurface": "y"}',
      '  ]',
      '}}}',
    ].join('\n');
    const p = parseKitBlock(`${create}\n${data}`, false);
    expect(p.dropped).toBe(0);
    expect(p.messages[1]).toEqual(JSON.parse(data));
  });

  it('AT-443 a closing bracket inside a text value is left alone', () => {
    const text = comps({ id: 'root', component: 'Text', text: 'Pay ₹5,000 }] by Friday ]}' });
    const p = parseKitBlock(`${create}\n${text}`, false);
    expect(p.dropped).toBe(0);
    expect(p.messages[1]).toEqual(JSON.parse(text));
  });

  it('AT-443 valid replies read exactly as before, pretty-printed or in an outer array', () => {
    const pretty = JSON.stringify(JSON.parse(good), null, 2);
    expect(parseKitBlock(`${create}\n${pretty}`, false).messages[1]).toEqual(JSON.parse(good));
    expect(parseKitBlock(`[${create},\n${good}]`, false)).toMatchObject({ dropped: 0, messages: [{}, JSON.parse(good)] });
  });

  it('AT-443 the mended brackets are still checked: what the catalog refuses is still dropped', () => {
    const bad = comps({ id: 'root', component: 'Hologram', parts: [{ a: 1 }] }).replace(/\}\]\}\]\}\}$/, '}]}}]}');
    expect(parseKitBlock(`${create}\n${bad}`, false).dropped).toBe(1);
    expect(parseKitBlock(`${create}\nhello {"a":1}`, false).dropped).toBeGreaterThan(0);
  });
});
