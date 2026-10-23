// Spec: 07 journeys §11.3 (real-AI journey contracts); every journey must carry executable hard proof.
// Metadata, screenshots and soft observations do not establish coverage.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { TID } from '../../src/shared/testids';

type Step = {
  do?: string;
  tid?: string;
  expectTid?: string;
  css?: string;
  count?: number;
  ms?: number;
  key?: string;
  expectKit?: string;
  expectJs?: string;
  expectText?: unknown;
  note?: string;
  re?: string;
  soft?: boolean;
  terminal?: 'reaction-only';
  transient?: boolean;
};

type Journey = {
  id?: string;
  covers?: string[];
  steps?: Step[];
};

const JOURNEY_DIR = join(process.cwd(), 'test', 'real-pc', 'journeys');
const files = readdirSync(JOURNEY_DIR)
  .filter((name) => name.endsWith('.json'))
  .sort();
const journeys = files.map((name) => ({ name, value: JSON.parse(readFileSync(join(JOURNEY_DIR, name), 'utf8')) as Journey }));
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
  ...[300, 301, 302, 303, 304, 305, 306, 309, 312, 315, 316, 317, 318, 322, 323, 324, 325, 326, 327].map((n) => `AT-${n}`),
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

const hasEndState = (step: Step) => !step.soft && Boolean(step.expectTid || step.expectKit || step.expectJs);

// Only predicates the driver actually executes can witness coverage.
const isCheckedStep = (step: Step) =>
  !step.soft &&
  Boolean(
    (step.do === 'waitReply' && hasEndState(step)) ||
    (step.do === 'expectText' && (step.tid || step.css) && typeof step.re === 'string' && step.re.length > 0) ||
    ((step.do === 'check' || step.do === 'waitFor') && (step.tid || step.css)),
  );

const isReactionOnlyCheck = (step: Step) =>
  !step.soft &&
  (step.do === 'check' || step.do === 'waitFor') &&
  typeof step.css === 'string' &&
  step.css.includes('bubble-reaction') &&
  step.css.includes(':not(:has(~');

const hasReactionOnlyProof = (steps: Step[], sendIndex: number, terminalIndex: number) => {
  const terminal = steps[terminalIndex];
  if (terminal?.terminal !== 'reaction-only' || terminal.do !== 'expectText' || !isCheckedStep(terminal) || typeof terminal.re !== 'string')
    return false;
  return steps.slice(sendIndex + 1, terminalIndex).some(isReactionOnlyCheck);
};

const hasFollowingRegexExpectText = (steps: Step[], waitIndex: number) => {
  for (let i = waitIndex + 1; i < steps.length; i += 1) {
    const step = steps[i];
    if (step === undefined) throw new Error('Missing journey step');
    if (step.do === 'send') break;
    if (step.do === 'expectText' && isCheckedStep(step)) return true;
  }
  return false;
};

const hasTerminalAfterSend = (steps: Step[], sendIndex: number) => {
  for (let i = sendIndex + 1; i < steps.length; i += 1) {
    const step = steps[i];
    if (step === undefined || step.do === 'send') return false;
    if (hasReactionOnlyProof(steps, sendIndex, i)) return true;
    if (!step.soft && step.do === 'waitReply' && (hasEndState(step) || hasFollowingRegexExpectText(steps, i))) return true;
    if (isReactionOnlyCheck(step)) continue;
    if (step.transient && isCheckedStep(step)) continue;
    if (step.transient && step.do === 'wait' && typeof step.ms === 'number' && step.ms > 0 && step.ms <= 30_000) continue;
    // Restart/close actions are intermediate transitions, never terminal proof.
    if (!step.soft && step.transient && (step.do === 'relaunch' || step.do === 'crashRelaunch')) continue;
    if (!step.soft && step.transient && step.do === 'key' && (step.key === 'Alt+F4' || step.key === 'Escape')) continue;
    return false;
  }
  return false;
};

const referencedIds = (journey: Journey) => {
  const ids = new Set<string>();
  for (const step of journey.steps ?? []) {
    if (step.tid) ids.add(step.tid);
    if (step.expectTid) ids.add(step.expectTid);
    if (step.expectKit) ids.add(step.expectKit);
    for (const match of step.css?.matchAll(/data-testid\s*=\s*["']?([A-Za-z0-9_-]+)/g) ?? []) {
      const id = match[1];
      if (id === undefined) throw new Error('Missing test-id regex capture');
      ids.add(id);
    }
  }
  return ids;
};

describe('real-PC journey contracts', () => {
  it('B05 uses an unclean crash transition before its recovery-card proof', () => {
    const b05 = journeys.find(({ name }) => name === 'B05-restart.json')?.value;
    const steps = b05?.steps ?? [];
    const goIndex = steps.findIndex((step) => step.do === 'clickIf' && step.tid === 'card-plan-go');
    const restartIndex = steps.findIndex(
      (step, index) => index > goIndex && (step.do === 'relaunch' || step.do === 'crashRelaunch'),
    );
    expect(goIndex).toBeGreaterThanOrEqual(0);
    expect(restartIndex).toBeGreaterThan(goIndex);
    expect(steps[restartIndex]?.do).toBe('crashRelaunch');
    expect(
      steps.slice(restartIndex + 1).some(
        (step) =>
          step.do === 'check' &&
          step.css?.includes('card-error') &&
          step.count === 1 &&
          step.note?.includes('AT-118'),
      ),
    ).toBe(true);
  });

  it('B02 proves the answered card before the next asking card', () => {
    const b02 = journeys.find(({ name }) => name === 'B02-choice.json')?.value;
    const initialProof = b02?.steps?.find((step) => step.do === 'waitReply' && step.shot === 'choice');
    const proof = b02?.steps?.find((step) => step.do === 'waitReply' && step.shot === 'typed-2');
    expect(initialProof?.expectJs).toBeTruthy();
    expect(proof?.expectJs).toBeTruthy();

    const evaluate = (state: string, summaryText: string, withNext = true, userText = '2', metaText = '9:01 AM') => {
      const initial = new JSDOM(
        `
        <main data-testid="thread-log">
          <div data-side="me" data-gap>
            <div data-testid="bubble-me"><div data-copy="user">initial request</div><div data-testid="bubble-meta">9:00 AM</div></div>
          </div>
          <div data-side="them" data-gap>
            <div data-testid="card-choice" data-card-id="choice-1" data-card-state="asking">
              <button data-testid="card-choice-option"><span data-copy="external">Road shoes</span></button>
              <button data-testid="card-choice-option"><span data-copy="external">Trail shoes</span></button>
            </div>
          </div>
        </main>
      `,
        { runScripts: 'outside-only' },
      );
      expect(initial.window.eval(initialProof!.expectJs!)).toBe(true);
      const initialLog = initial.window.document.querySelector('[data-testid="thread-log"]')!;
      const expectedId = initialLog.getAttribute('data-b02-choice-id');
      const expectedLabel = initialLog.getAttribute('data-b02-choice-option-2');
      expect(expectedId).toBe('choice-1');
      expect(expectedLabel).toBe('Trail shoes');
      initial.window.close();

      const dom = new JSDOM(
        `
        <main data-testid="thread-log" data-b02-choice-id="${expectedId}" data-b02-choice-option-2="${expectedLabel}">
          <div data-side="them" data-gap>
            <div data-testid="card-choice" data-card-id="choice-1" data-card-state="${state}" aria-label="You chose Trail shoes">
              <span data-copy="external">${summaryText}</span>
            </div>
          </div>
          <div data-side="me" data-gap>
            <div data-testid="bubble-me"><div data-copy="user">${userText}</div><div data-testid="bubble-meta">${metaText}</div></div>
          </div>
          ${
            withNext
              ? '<div data-side="them" data-gap><div data-testid="card-choice" data-card-id="choice-2" data-card-state="asking"><button data-testid="card-choice-option">Road shoes</button><button data-testid="card-choice-option">Trail shoes</button></div></div>'
              : ''
          }
        </main>
      `,
        { runScripts: 'outside-only' },
      );
      const result = dom.window.eval(proof!.expectJs!);
      dom.window.close();
      return result;
    };

    expect(evaluate('answered', 'Which trail shoe feature? → Trail shoes')).toBe(true);
    expect(evaluate('answered', 'Which trail shoe feature? → Road shoes')).toBe(false);
    expect(evaluate('asking', 'Which trail shoe feature? → Trail shoes')).toBe(false);
    expect(evaluate('answered', 'Which trail shoe feature? → Trail shoes', false)).toBe(true);
    expect(evaluate('answered', 'Which trail shoe feature? → Trail shoes', true, '1', '2')).toBe(false);
  });

  it('loads every journey and rejects unknown TIDs', () => {
    const known = new Set<string>(Object.values(TID));
    const invalid = journeys.flatMap(({ name, value }) =>
      [...referencedIds(value)].filter((id) => !known.has(id)).map((id) => `${name}: ${id}`),
    );
    expect(invalid, invalid.join('\n')).toEqual([]);
  });

  it('keeps Group C out of every journey and limits owned coverage to Group R', () => {
    const invalid = journeys.flatMap(({ name, value }) =>
      (value.covers ?? []).filter((id) => groupC.has(id) || (name.startsWith('R-') && !groupR.has(id))).map((id) => `${name}: ${id}`),
    );
    expect(invalid, invalid.join('\n')).toEqual([]);
  });

  it('requires an end-state check after every send in every journey', () => {
    const invalid = journeys.flatMap(({ name, value }) => {
      const steps = value.steps ?? [];
      return steps.flatMap((step, index) => {
        if (step.do !== 'send') return [];
        return hasTerminalAfterSend(steps, index) ? [] : [`${name}: send at step ${index}`];
      });
    });
    expect(invalid, invalid.join('\n')).toEqual([]);
  });

  it('ties every covered AT to a checked proof step', () => {
    const missing = journeys.flatMap(({ name, value }) => {
      const steps = value.steps ?? [];
      return (value.covers ?? [])
        .filter((id) => !steps.some((step) => (step.note ?? '').includes(id) && isCheckedStep(step)))
        .map((id) => `${name}: ${id}`);
    });
    expect(missing, missing.join('\n')).toEqual([]);
  });

  it('keeps reaction-only and transient contracts proof-backed', () => {
    const transientThenReply: Step[] = [
      { do: 'send' },
      { do: 'waitFor', css: '[data-testid="thread-thinking"]', transient: true },
      { do: 'waitReply', expectTid: 'bubble-foo' },
    ];
    const reactionOnly: Step[] = [
      { do: 'send' },
      {
        do: 'check',
        css: '[data-side="me"]:has([data-testid="bubble-reaction"]):not(:has(~ [data-testid="bubble-foo"]))',
      },
      { do: 'expectText', tid: 'bubble-reaction', re: '^(?:👍|❤️)$', terminal: 'reaction-only' },
    ];
    const missingReactionProof: Step[] = [{ do: 'send' }, { do: 'wait', ms: 20_000 }, { do: 'eval', expectText: '👍' }];

    expect(hasTerminalAfterSend(transientThenReply, 0)).toBe(true);
    expect(hasTerminalAfterSend(reactionOnly, 0)).toBe(true);
    expect(hasTerminalAfterSend(missingReactionProof, 0)).toBe(false);
    expect(
      hasTerminalAfterSend([{ do: 'send' }, { do: 'relaunch', transient: true }, { do: 'waitReply', expectTid: 'bubble-foo' }], 0),
    ).toBe(true);
    expect(hasTerminalAfterSend([{ do: 'send' }, { do: 'relaunch', transient: true }], 0)).toBe(false);
    expect(hasTerminalAfterSend([{ do: 'send' }, { do: 'key', key: 'Alt+F4', transient: true }, { do: 'waitReply' }], 0)).toBe(false);
    expect(hasTerminalAfterSend([{ do: 'send' }, { do: 'waitReply', expectTid: 'bubble-foo', soft: true }], 0)).toBe(false);
    expect(
      hasTerminalAfterSend([{ do: 'send' }, { do: 'waitReply', soft: true }, { do: 'expectText', tid: 'bubble-foo', re: 'answer' }], 0),
    ).toBe(false);
    expect(isCheckedStep({ do: 'eval', expectJs: 'true' })).toBe(false);
    expect(isCheckedStep({ do: 'check', expectJs: 'true' })).toBe(false);
    expect(isCheckedStep({ do: 'check', tid: 'bubble-foo', soft: true })).toBe(false);
  });
});
