// Spec: AT-077a (two jobs in one chat + "stop" → a Choice card `stop_which` "Stop which one?" with the two titles plus "Both",
// "All of them" for three; nothing stops until it is answered; unanswered for 15 min → `expired`, nothing stopped), 08-4
// §26.9 items 3–4 (not reversible, so never auto-picked).
import { afterEach, describe, expect, it } from 'vitest';
import { t } from '../../../src/shared/copy/t';
import { jobHarness, jobIntake, BILLS_PLAN, type JobHarness } from './jobHarness';
import { flush } from './t3Helpers';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

type StopCard = { question: string; options: { id: string; label: string }[]; purpose: string; reversible: boolean };
const stopCard = (x: JobHarness) => JSON.parse(String(x.cards('choice')[0]!.payload)) as StopCard;

/** Jobs that wait on their Plan cards (QUEUED, live) in one chat. */
async function queuedJobs(n: number): Promise<JobHarness> {
  const names = ['first', 'second', 'third'].slice(0, n);
  const x = jobHarness({ script: names.map((m) => jobIntake(BILLS_PLAN, { estimate: { minutes: 10 }, match: m })) });
  for (const m of names) {
    x.userSays(`${m}: find my bills`);
    await x.settle();
  }
  return x;
}

describe('AT-077a · "stop" with more than one job in the chat (08-4 §26.9)', () => {
  it('AT-077a two jobs → "Stop which one?" with both titles and "Both"; nothing stops until it is answered; one pick stops one', async () => {
    h = await queuedJobs(2);
    h.userSays('stop');
    await h.settle();
    const p = stopCard(h);
    expect(p).toMatchObject({ purpose: 'stop_which', question: 'Stop which one?', reversible: false });
    expect(p.options.map((o) => o.label)).toEqual([...h.jobs().map((j) => String(j.title)), 'Both']);
    expect(h.jobs().map((j) => j.state)).toEqual(['queued', 'queued']);

    h.answer(String(h.cards('choice')[0]!.id), 'o1');
    await h.settle();
    expect(h.jobs().map((j) => j.state)).toEqual(['cancelled', 'queued']);
  });

  it('AT-077a three jobs → the three titles plus "All of them"', async () => {
    h = await queuedJobs(3);
    h.userSays('stop');
    await h.settle();
    const p = stopCard(h);
    expect(p.options.map((o) => o.label)).toEqual([...h.jobs().map((j) => String(j.title)), t('cards.choice.option.stop_all')]);
    expect(t('cards.choice.option.stop_all')).toBe('All of them');
    h.answer(String(h.cards('choice')[0]!.id), 'o4');
    await h.settle();
    expect(h.jobs().map((j) => j.state)).toEqual(['cancelled', 'cancelled', 'cancelled']);
  });

  it('AT-077a unanswered for 15 min → `expired`, nothing stopped', async () => {
    h = await queuedJobs(2);
    h.userSays('stop');
    await h.settle();
    h.clock.advance(15 * 60_000);
    await flush();
    expect(h.cards('choice')[0]!.state).toBe('expired');
    expect(h.jobs().map((j) => j.state)).toEqual(['queued', 'queued']);
  });
});
