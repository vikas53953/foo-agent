// Spec: 07 journeys §11.3 (real-AI journey contracts); Lane A keeps the executable R journeys honest without rewriting
// the older B/J/U baseline files owned by other lanes.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TID } from '../../src/shared/testids';

type Step = {
  do?: string;
  tid?: string;
  expectTid?: string;
  css?: string;
  expectKit?: string;
  expectJs?: string;
  expectText?: unknown;
  note?: string;
  re?: string;
};

type Journey = {
  id?: string;
  covers?: string[];
  steps?: Step[];
};

const JOURNEY_DIR = join(process.cwd(), 'test', 'real-pc', 'journeys');
const files = readdirSync(JOURNEY_DIR).filter((name) => name.endsWith('.json')).sort();
const journeys = files.map((name) => ({ name, value: JSON.parse(readFileSync(join(JOURNEY_DIR, name), 'utf8')) as Journey }));
const owned = (name: string) => name.startsWith('R-') || name === 'LaneA-smoke-5min.json';

const groupC = new Set([
  'AT-081',
  'AT-083',
  'AT-084',
  'AT-085',
  'AT-111',
  'AT-112',
  'AT-113',
  'AT-115',
  'AT-116',
  'AT-117',
  'AT-118a',
  'AT-119',
  'AT-122',
  'AT-123',
  'AT-124',
  'AT-127',
  'AT-132',
  'AT-133',
  'AT-056',
  'AT-057',
  'AT-059',
  'AT-060',
  'AT-211',
  'AT-273',
  'AT-279',
  'AT-282',
  'AT-284',
  'AT-285',
  'AT-353',
  'AT-354',
  'AT-356',
  'AT-357',
  'AT-359',
  'AT-360',
  'AT-361',
  'AT-362',
  'AT-421',
  'AT-422',
  'AT-423',
  'AT-431',
  'AT-433',
  'AT-434',
  'AT-440',
  ...[300, 301, 302, 303, 304, 305, 306, 309, 312, 315, 316, 317, 318, 322, 323, 324, 325, 326, 327].map(
    (n) => `AT-${n}`,
  ),
]);

const groupR = new Set([
  'AT-106',
  'AT-109',
  'AT-114',
  'AT-120',
  'AT-110',
  'AT-121',
  'AT-126',
  'AT-128',
  'AT-342',
  'AT-344',
  'AT-345',
  'AT-348',
  'AT-349',
  'AT-350',
  'AT-352',
  'AT-368',
  'AT-355',
  'AT-369',
  'AT-363',
  'AT-364',
  'AT-420',
  'AT-432',
  'AT-366',
  'AT-367',
  'AT-424',
  'AT-425',
  'AT-426',
  'AT-427',
  'AT-428',
  'AT-430',
  'AT-429',
  'AT-278',
  'AT-435',
]);

const hasEndState = (step: Step) =>
  Boolean(step.expectTid || step.expectKit || step.expectJs || (step.expectText && step.re));

const referencedIds = (journey: Journey) => {
  const ids = new Set<string>();
  for (const step of journey.steps ?? []) {
    if (step.tid) ids.add(step.tid);
    if (step.expectTid) ids.add(step.expectTid);
    for (const match of step.css?.matchAll(/data-testid\s*=\s*["']?([A-Za-z0-9_-]+)/g) ?? []) ids.add(match[1]);
  }
  return ids;
};

describe('real-PC journey contracts', () => {
  it('loads every journey and rejects unknown TIDs', () => {
    const known = new Set(Object.values(TID));
    const invalid = journeys.flatMap(({ name, value }) =>
      [...referencedIds(value)].filter((id) => !known.has(id)).map((id) => `${name}: ${id}`),
    );
    expect(invalid, invalid.join('\n')).toEqual([]);
  });

  it('keeps Group C out of every journey and limits owned coverage to Group R', () => {
    const invalid = journeys.flatMap(({ name, value }) =>
      (value.covers ?? [])
        .filter((id) => groupC.has(id) || (owned(name) && !groupR.has(id)))
        .map((id) => `${name}: ${id}`),
    );
    expect(invalid, invalid.join('\n')).toEqual([]);
  });

  it('requires an end-state check after every owned send', () => {
    const invalid = journeys.flatMap(({ name, value }) => {
      if (!owned(name)) return [];
      const steps = value.steps ?? [];
      return steps.flatMap((step, index) => {
        if (step.do !== 'send') return [];
        const next = steps[index + 1];
        return next?.do === 'waitReply' && hasEndState(next) ? [] : [`${name}: send at step ${index}`];
      });
    });
    expect(invalid, invalid.join('\n')).toEqual([]);
  });

  it('names every owned covered AT in a proof note', () => {
    const missing = journeys.flatMap(({ name, value }) => {
      if (!owned(name)) return [];
      const notes = (value.steps ?? []).map((step) => step.note ?? '').join('\n');
      return (value.covers ?? []).filter((id) => !notes.includes(id)).map((id) => `${name}: ${id}`);
    });
    expect(missing, missing.join('\n')).toEqual([]);
  });
});
