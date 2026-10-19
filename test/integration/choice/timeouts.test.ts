// Spec: AT-033 (a reversible-preference question unanswered for 15 min → foo picks Best fit and says so in one line), AT-034
// (a flight choice unanswered → foo never picks and cancels after 24 h; "Search again"), J8 timeout rules (one reminder
// toast at 15 min for a real-world choice), 05-1 §5.3.2 / §5.3.3 (`auto_picked`, `expired`), 08-4 §26.7 (only an effectively
// reversible card auto-picks), 08-0 StopReason `choice_timeout`.
import { afterEach, describe, expect, it } from 'vitest';
import { CHOICE_EXPIRE_MS, CHOICE_NUDGE_MS } from '../../../src/engine/cards/choiceTimeouts';
import { t } from '../../../src/shared/copy/t';
import { jobHarness, jobIntake, step, type JobHarness } from '../jobs/jobHarness';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const PLAN = [{ phraseKey: 'read_email' as const }, { phraseKey: 'look_for' as const, slots: { what: 'flights' } }];
const fooTexts = (x: JobHarness) =>
  x
    .messages()
    .filter((m) => m.kind === 'text' && m.author_kind === 'foo')
    .map((m) => m.text);
const notifies = (x: JobHarness) => x.logs.filter((l) => l.mod === 'notify');

/** Real time passes in small steps while the fake clock jumps, so the 15 s tick runs at the new time. */
async function jump(x: JobHarness, ms: number): Promise<void> {
  x.clock.advance(ms);
  await x.settle(15_000);
}

describe('choice timeouts (J8)', () => {
  it('AT-033 a reversible preference unanswered for 15 min → Best fit, `auto_picked`, one line, the job goes on', async () => {
    h = jobHarness({
      script: [
        jobIntake(PLAN, { title: 'Summarise my mail' }),
        step({
          kind: 'ask',
          card: { question: 'How long should the summary be?', options: [{ label: 'Short' }, { label: 'Long' }], reversible: true },
        }),
        {
          ...step({ kind: 'done', result: 'Here is a short summary.', unverified: true }),
          match: { purpose: 'step', promptIncludes: '→ A: Short' },
        },
      ],
    });
    h.userSays('summarise my mail from this week');
    await h.settle();
    const card = h.cards('choice')[0]!;
    expect(JSON.parse(String(card.payload))).toMatchObject({ reversible: true });
    await jump(h, CHOICE_NUDGE_MS - 60_000);
    expect(h.cards('choice')[0]!.state).toBe('asking');
    await jump(h, 60_000);
    expect(h.cards('choice')[0]).toMatchObject({ state: 'auto_picked', resolved_by: 'auto' });
    expect(JSON.parse(String(h.cards('choice')[0]!.answer))).toEqual({ optionId: 'o1' });
    expect(fooTexts(h)).toContain(t('cards.choice.auto_picked_line', { option: 'Short' }));
    expect(t('cards.choice.auto_picked_line', { option: 'Short' })).toBe(
      'I went with Short since I didn’t hear back. Say the word if you want another.',
    );
    expect(h.job().state).toBe('done_unverified');
  });

  it('AT-034 a flight choice is never picked: one reminder at 15 min, then at 24 h the job is CANCELLED (`choice_timeout`) with the stop line', async () => {
    h = jobHarness({
      script: [
        jobIntake(PLAN, { title: 'Delhi flight search' }),
        step({
          kind: 'ask',
          card: {
            question: 'Which flight time works for Delhi on Friday?',
            options: [{ label: 'IndiGo 10:15' }, { label: 'Air India 7:10' }],
            reversible: true,
          },
        }),
      ],
    });
    h.userSays('find me a flight to Delhi on Friday');
    await h.settle();
    // The AI said reversible, but a time in the options makes it a real-world choice (08-4 §26.7).
    expect(JSON.parse(String(h.cards('choice')[0]!.payload))).toMatchObject({ aiReversible: true, reversible: false });
    await jump(h, CHOICE_NUDGE_MS);
    expect(h.cards('choice')[0]!.state).toBe('asking');
    expect(notifies(h)).toHaveLength(1);
    await jump(h, 60 * 60_000);
    expect(notifies(h)).toHaveLength(1); // one reminder only
    await jump(h, CHOICE_EXPIRE_MS - CHOICE_NUDGE_MS - 60 * 60_000);
    expect(h.cards('choice')[0]).toMatchObject({ state: 'expired', resolved_by: 'auto' });
    expect(h.cards('choice')[0]!.answer).toBeNull();
    expect(h.job()).toMatchObject({ state: 'cancelled', stop_reason: 'choice_timeout' });
    expect(fooTexts(h)).toContain(
      'I stopped the reading your email because I didn’t hear back. Options change fast, so ask me again when you’re ready.',
    );
  });
});
