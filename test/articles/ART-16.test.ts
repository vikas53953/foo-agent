// ART-16 (10-2 §D, Article 16): the badge sequence of every job path T2 runs matches 07-2 §7.4 + SM-A1/A2, every badge value is
// one of 08-0 §F (`seen, working, waiting, done, done_unverified, failed, stopped`), and foo posts no standalone
// acknowledgement ("ok", "okay", "on it", "sure", "will do"). The Stop and stuck paths (SM-A11/A12) arrive with M4 T3.
import { afterEach, describe, expect, it } from 'vitest';
import { badgeSets, BILLS_PLAN, jobHarness, jobIntake, step, tool, type JobHarness, type PlanStepIn } from '../integration/jobs/jobHarness';
import type { FakeLineIn } from '../unit/m3-engine-helpers';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const BADGES = new Set(['seen', 'working', 'waiting', 'done', 'done_unverified', 'failed', 'stopped']);
const ACK = /^\s*(ok|okay|on it|sure|will do)[\s.!]*$/i;
const SITE_PLAN: PlanStepIn[] = [{ phraseKey: 'check_site', slots: { site: 'stay.example' } }, { phraseKey: 'find_proof' }];

interface Path {
  name: string;
  plan?: typeof BILLS_PLAN;
  minutes?: number;
  tools?: { blockedSites?: string[] };
  script: FakeLineIn[];
  /** Taps after the first settle: [card type, choice]. */
  taps?: [string, string][];
  badges: string[];
}

const PATHS: Path[] = [
  {
    name: 'DONE with a checked proof',
    plan: SITE_PLAN,
    script: [
      tool('fake.site', { site: 'stay.example' }),
      step({
        kind: 'done',
        result: 'Booked. Reference ABC123.',
        proof: { kind: 'confirmation', code: 'ABC123', site: 'stay.example', seenInToolCallId: 'tc_000001' },
      }),
    ],
    badges: ['seen', 'working', 'done'],
  },
  {
    name: 'done_unverified',
    script: [tool('gmail.search', { query: 'bill' }), step({ kind: 'done', result: 'Two bills.', unverified: true })],
    badges: ['seen', 'working', 'done_unverified'],
  },
  {
    name: 'NEEDS_YOU then answered',
    script: [
      step({ kind: 'ask', card: { question: 'Which month?', options: [{ label: 'October' }, { label: 'September' }] } }),
      step({ kind: 'done', result: 'Done.', unverified: true }),
    ],
    taps: [['choice', 'o1']],
    badges: ['seen', 'working', 'waiting', 'working', 'done_unverified'],
  },
  {
    name: 'FAILED',
    plan: SITE_PLAN,
    tools: { blockedSites: ['stay.example'] },
    script: [tool('fake.site', { site: 'stay.example' }), step({ kind: 'fail', reason: 'Blocked.' })],
    badges: ['seen', 'working', 'failed'],
  },
  {
    name: 'Plan card, Go',
    minutes: 5,
    script: [tool('gmail.search', { query: 'bill' }), step({ kind: 'done', result: 'Two bills.', unverified: true })],
    taps: [['plan', 'go']],
    badges: ['seen', 'working', 'done_unverified'],
  },
  {
    name: 'Plan card, Change plan',
    minutes: 5,
    script: [],
    taps: [['plan', 'change']],
    badges: ['seen', 'stopped'],
  },
];

describe('ART-16 · badge sequences', () => {
  it.each(PATHS)('$name', async (p) => {
    h = jobHarness({
      tools: p.tools,
      script: [jobIntake(p.plan ?? BILLS_PLAN, p.minutes ? { estimate: { minutes: p.minutes } } : {}), ...p.script],
    });
    const userId = h.userSays('Do the job');
    await h.settle();
    for (const [type, choice] of p.taps ?? []) {
      h.answer(String(h.cards(type).at(-1)!.id), choice);
      await h.settle();
    }
    const seq = badgeSets(h, userId);
    // A repeated value is one badge on screen; the sequence is what the bubble shows.
    const shown = seq.filter((b, i) => b !== seq[i - 1]);
    expect(shown).toEqual(p.badges);
    expect(seq.every((b) => BADGES.has(String(b)))).toBe(true);
    expect(h.messages().filter((m) => m.author_kind === 'foo' && ACK.test(String(m.text ?? '')))).toEqual([]);
  });
});
