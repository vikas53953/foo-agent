// Spec: AT-117 (the site blocks foo and no other route exists → FAILED ❌, error card with one alternative), 08-2 §5.4.2
// ('fail' → FAILED + error card), M4 pack §4 (the AI may fill only retry, open_url or dismiss; else the runner's pick and
// PROTOCOL_FIX_ACTION), 08-1 §4.5 (error payload), 08-0 §G.2 (error card state `shown`; checklist `failed`).
import { afterEach, describe, expect, it } from 'vitest';
import { t } from '../../../src/shared/copy/t';
import { jobHarness, jobIntake, step, tool, badgeSets, type JobHarness, type PlanStepIn } from './jobHarness';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const PLAN: PlanStepIn[] = [
  { phraseKey: 'check_site', slots: { site: 'stay.example' } },
  { phraseKey: 'compare', slots: { what: 'stays' } },
];

async function blocked(alternative?: Record<string, unknown>) {
  h = jobHarness({
    tools: { blockedSites: ['stay.example'] },
    script: [
      jobIntake(PLAN),
      tool('fake.site', { site: 'stay.example' }, { delayMs: 1_000 }),
      step({ kind: 'fail', reason: 'The site blocks me.', ...(alternative ? { alternative } : {}) }, { delayMs: 1_000 }),
    ],
  });
  const userId = h.userSays('Find a stay on stay.example');
  await h.settle();
  return userId;
}

describe('AT-117 · FAILED with one alternative', () => {
  it('SITE_BLOCKED → FAILED ❌, one error card with the site in its words, checklist failed', async () => {
    const userId = await blocked();
    const job = h!.job();
    expect(job.state).toBe('failed');
    expect(h!.message(userId).badge).toBe('failed');
    expect(badgeSets(h!, userId)).toEqual(['seen', 'working', 'failed']);
    const cards = h!.cards('error');
    expect(cards).toHaveLength(1);
    expect(cards[0]!.state).toBe('shown');
    expect(JSON.parse(String(cards[0]!.payload))).toEqual({
      variant: 'error',
      kind: 'SITE_BLOCKED',
      whatHappened: t('errors.site_blocked.what_happened', { site: 'stay.example' }),
      whatIsSafe: t('errors.site_blocked.what_is_safe'),
      button: { label: t('errors.site_blocked.button'), action: { kind: 'open_url', url: 'https://stay.example/' } },
      jobId: job.id,
    });
    expect(h!.cards('checklist')[0]!.state).toBe('failed');
    expect(h!.steps().map((s) => s.state)).toEqual(['failed', 'pending']);
  });

  it('an AI alternative outside retry / open_url / dismiss is refused (PROTOCOL_FIX_ACTION)', async () => {
    await blocked({ kind: 'use_backup' });
    const payload = JSON.parse(String(h!.cards('error')[0]!.payload)) as { button: { action: unknown } };
    expect(payload.button.action).toEqual({ kind: 'open_url', url: 'https://stay.example/' });
    expect(h!.logs.some((l) => l.kind === 'PROTOCOL_FIX_ACTION')).toBe(true);
  });

  it('an AI open_url alternative is kept', async () => {
    await blocked({ kind: 'open_url', url: 'https://stay.example/help' });
    const payload = JSON.parse(String(h!.cards('error')[0]!.payload)) as { button: { action: unknown } };
    expect(payload.button.action).toEqual({ kind: 'open_url', url: 'https://stay.example/help' });
  });
});
