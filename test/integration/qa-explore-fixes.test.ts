// Spec: 08-4 §0 rule 4 (`{vibeLine}` = `identity.vibeLine`) and the identity block "Vibe: {vibeLine} {emoji}.": the talk
// style picked on Card 2c (06-1 §2.3) reaches every intake turn. QA explore F14 (26 Oct): the line was always empty.
import { afterEach, describe, expect, it } from 'vitest';
import { t } from '../../src/shared/copy/t';
import { intake, makeHarness, verified, type Harness } from '../unit/m3-engine-helpers';
import { BILLS_PLAN, jobHarness, jobIntake, step, tool } from './jobs/jobHarness';
import { until } from './jobs/t3Helpers';

let h: Harness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const reply = (say: string) => `<say>${say}</say><act>${JSON.stringify({ decision: { kind: 'reply' }, usedMemoryIds: [] })}</act>`;

describe('QA explore fixes · what the AI is told', () => {
  it('the talk style picked in setup is in the intake prompt', async () => {
    const line = t('setup.vibe.line.direct');
    h = makeHarness({
      script: [intake(reply('Done.'))],
      settings: (s) => verified()({ ...s, identity: { ...s.identity, vibe: 'direct', vibeLine: line } }),
      tools: {},
    });
    await h.idle();
    h.userSays('Hello');
    await h.idle();
    const turn = h.turnsJsonl().filter((x) => x.purpose === 'intake')[0]!;
    expect(String(turn.system) + String(turn.prompt)).toContain(`Vibe: ${line}`);
  });

  it('the talk style picked in setup is in every job step prompt too', async () => {
    const line = t('setup.vibe.line.warm');
    const jh = jobHarness({
      script: [
        jobIntake(BILLS_PLAN),
        tool('gmail.search', { query: 'bill' }),
        step({ kind: 'done', result: 'Two bills.', unverified: true }),
      ],
      settings: (s) => verified()({ ...s, identity: { ...s.identity, vibe: 'warm', vibeLine: line } }),
    });
    h = jh;
    jh.userSays('Find bills due this week');
    await until(jh, () => jh.turnsJsonl().some((x) => x.purpose === 'step'), 250);
    const turn = jh.turnsJsonl().find((x) => x.purpose === 'step')!;
    expect(String(turn.system) + String(turn.prompt)).toContain(`Vibe: ${line}`);
  });
});
