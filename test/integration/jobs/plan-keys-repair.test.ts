// Spec: CR-0031 (X-189), 08-2 §5.3.3 (an intake plan with an unknown key, a runner-only key or a missing slot gets one
// repair turn, §7.5 repair.md; if the repaired plan is still not clean the first plan stands and each bad step falls back
// to `generic_working`, logged `chat.plan_keys`), 08-4 §26.1 (catalogue). The real-PC run of 2026-10-21 showed a real AI
// inventing keys; the prompt list (CR-0027) asks, this checks in code.
import { afterEach, describe, expect, it } from 'vitest';
import { planKeyIssues } from '../../../src/shared/phrases';
import { intake } from '../../unit/m3-engine-helpers';
import { jobHarness, type JobHarness } from './jobHarness';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

type Step = { phraseKey: string; slots?: Record<string, string> };

function act(plan: Step[]): string {
  const decision = {
    kind: 'job',
    title: 'Budget phones table',
    plan: plan.map((p) => ({ phraseKey: p.phraseKey, slots: p.slots ?? {}, route: 'browser' })),
    estimate: { minutes: 5 },
    routeHint: ['browser'],
    needsApps: [],
  };
  return JSON.stringify({ decision, usedMemoryIds: [] }, null, 2);
}
const reply = (plan: Step[]) => `<say></say>\n<act>\n${act(plan)}\n</act>\n`;
const repair = (text: string) => ({ match: { purpose: 'repair' as const }, reply: text });

const INVENTED: Step[] = [{ phraseKey: 'search_web' }, { phraseKey: 'compare', slots: { what: '3 budget phones' } }];
const FIXED: Step[] = [{ phraseKey: 'look_web' }, { phraseKey: 'compare', slots: { what: '3 budget phones' } }];

const planSteps = (x: JobHarness): string[] => (JSON.parse(String(x.cards('plan')[0]!.payload)) as { steps: string[] }).steps;
const repairs = (x: JobHarness) => x.turnsJsonl().filter((r) => r.purpose === 'repair');

describe('Plan keys are checked in code (CR-0031)', () => {
  it('planKeyIssues names unknown keys, runner-only keys and missing slots, and passes a clean plan', () => {
    expect(planKeyIssues(FIXED)).toBeNull();
    const issues = planKeyIssues([{ phraseKey: 'search_web' }, { phraseKey: 'stopped' }, { phraseKey: 'compare', slots: {} }]);
    expect(issues).toContain('step 1: "search_web" is not one of the listed phrase keys');
    expect(issues).toContain('step 2: "stopped" cannot be a plan step');
    expect(issues).toContain('step 3: "compare" needs {what}');
  });

  it('an invented key gets one repair turn, and the repaired plan reads its own steps', async () => {
    h = jobHarness({ script: [intake(reply(INVENTED)), repair(reply(FIXED))] });
    h.userSays('Make a table comparing 3 budget phones');
    await h.settle();
    const turns = repairs(h);
    expect(turns).toHaveLength(1);
    expect(String(turns[0]!.prompt)).toContain('"search_web" is not one of the listed phrase keys');
    expect(planSteps(h)).toEqual(['Look on the web', 'Compare 3 budget phones']);
  });

  it('a repair that is still wrong keeps the first plan, its bad step falling back to "Work on it"', async () => {
    h = jobHarness({ script: [intake(reply(INVENTED)), repair(reply([{ phraseKey: 'web_search' }]))] });
    h.userSays('Make a table comparing 3 budget phones');
    await h.settle();
    expect(repairs(h)).toHaveLength(1);
    expect(planSteps(h)).toEqual(['Work on it', 'Compare 3 budget phones']);
  });

  it('a broken repair reply also keeps the first plan (no second repair)', async () => {
    h = jobHarness({ script: [intake(reply(INVENTED)), repair('<say></say><act>not json</act>')] });
    h.userSays('Make a table comparing 3 budget phones');
    await h.settle();
    expect(repairs(h)).toHaveLength(1);
    expect(planSteps(h)).toEqual(['Work on it', 'Compare 3 budget phones']);
  });

  it('a clean plan never pays for a repair turn', async () => {
    h = jobHarness({ script: [intake(reply(FIXED))] });
    h.userSays('Make a table comparing 3 budget phones');
    await h.settle();
    expect(repairs(h)).toHaveLength(0);
    expect(planSteps(h)).toEqual(['Look on the web', 'Compare 3 budget phones']);
  });
});
