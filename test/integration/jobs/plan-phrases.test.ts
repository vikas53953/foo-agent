// Spec: CR-0027 (X-185): 08-4 §24.5 intake.md carries {phraseKeys}, the §26.1 list step.md already had, so a real AI writes
// plan steps with catalogue keys; 08-2 §5.3.3 (an unknown key → `generic_working`, "Work on it"), 05-3 §5.12.2 (Plan card rows
// read the `next` form). Real-PC run 2026-10-21: every Plan card row read "Work on it" because intake never listed the keys.
import { afterEach, describe, expect, it } from 'vitest';
import { PHRASE_KEY_LIST } from '../../../src/engine/prompt/PromptBuilder';
import { intake } from '../../unit/m3-engine-helpers';
import { jobHarness, type JobHarness } from './jobHarness';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

/**
 * A reply shaped like the Claude CLI's on a real PC: an empty <say>, then the act as pretty-printed JSON on its own lines
 * with a trailing newline (not the one-line JSON of the fake AI helpers).
 */
function realCliJob(title: string, plan: { phraseKey: string; slots?: Record<string, string>; route?: string }[]): string {
  const act = {
    decision: {
      kind: 'job',
      title,
      plan: plan.map((p) => ({ phraseKey: p.phraseKey, slots: p.slots ?? {}, route: p.route ?? 'browser' })),
      estimate: { minutes: 5 },
      routeHint: ['browser'],
      needsApps: [],
    },
    usedMemoryIds: [],
  };
  return `<say></say>\n<act>\n${JSON.stringify(act, null, 2)}\n</act>\n`;
}

const planSteps = (x: JobHarness): string[] => (JSON.parse(String(x.cards('plan')[0]!.payload)) as { steps: string[] }).steps;

describe('Plan card rows use the AI step titles (CR-0027)', () => {
  it('the intake system prompt lists the phrase keys a plan may use, the same list as step.md', async () => {
    h = jobHarness({ script: [intake(realCliJob('Budget phones', [{ phraseKey: 'look_web' }]))] });
    h.userSays('Make a table comparing 3 budget phones');
    await h.settle();
    const turn = h
      .turnsJsonl()
      .filter((r) => r.purpose === 'intake')
      .at(-1)!;
    const system = String(turn.system);
    expect(system).toContain(`Plan steps use only these phrase keys: ${PHRASE_KEY_LIST}\n`);
    expect(PHRASE_KEY_LIST.startsWith('read_app {app}, read_email, check_calendar, look_web, check_sites {sites},')).toBe(true);
    expect(PHRASE_KEY_LIST).toContain('compare {what}');
    // Runner-only keys never go in a plan.
    for (const k of ['blocked_try_next', 'took_over', 'stopped']) expect(PHRASE_KEY_LIST).not.toMatch(new RegExp(`\\b${k}\\b`));
  });

  it('a real-CLI plan for "a table comparing 3 budget phones" reads its own 4 steps', async () => {
    h = jobHarness({
      script: [
        intake(
          realCliJob('Budget phones table', [
            { phraseKey: 'look_web' },
            { phraseKey: 'look_for', slots: { what: 'budget phones under ₹15,000' } },
            { phraseKey: 'compare', slots: { what: '3 budget phones' } },
            { phraseKey: 'make_file', slots: { what: 'a comparison table' } },
          ]),
        ),
      ],
    });
    h.userSays('Make a table comparing 3 budget phones');
    await h.settle();
    expect(planSteps(h)).toEqual([
      'Look on the web',
      'Look for budget phones under ₹15,000',
      'Compare 3 budget phones',
      'Make a comparison table',
    ]);
  });

  it('a real-CLI plan for "book a table for 2 near CP" reads its own 3 steps', async () => {
    h = jobHarness({
      script: [
        intake(
          realCliJob('Table for 2 near CP', [
            { phraseKey: 'look_for', slots: { what: 'restaurants near CP' } },
            { phraseKey: 'check_site', slots: { site: 'tables.example.com' } },
            { phraseKey: 'show_before', slots: { acting: 'booking' } },
          ]),
        ),
      ],
    });
    h.userSays('Book a table for 2 near CP tonight');
    await h.settle();
    expect(planSteps(h)).toEqual(['Look for restaurants near CP', 'Check tables.example.com', 'Show you before booking']);
  });

  it('keys outside the catalogue (what the AI wrote when intake had no list) still fall back to "Work on it"', async () => {
    h = jobHarness({
      script: [
        intake(
          realCliJob('Budget phones table', [
            { phraseKey: 'search_web' },
            { phraseKey: 'compare_phones' },
            { phraseKey: 'create_table' },
            { phraseKey: 'present_results' },
          ]),
        ),
      ],
    });
    h.userSays('Make a table comparing 3 budget phones');
    await h.settle();
    expect(planSteps(h)).toEqual(['Work on it', 'Work on it', 'Work on it', 'Work on it']);
  });
});
