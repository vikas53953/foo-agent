// Spec: CR-0041 (X-199), 08-4 §25.5 item 6 (F-092 as amended): real-AI run 13 (main 3a35be0, Claude CLI) reacted 👍 to
// "Order me a pizza from Dominos" and then said nothing for 3 minutes: an intake answer with no words left for a message of
// ≤ 6 words was a 👍. Now a 👍 comes only from intake kind `react` (an ack, AT-027); an empty answer gets one more intake turn
// with nothing shown, then the line "I didn't get that. Say it another way?". 10-acceptance-2 AT-440.
import { afterEach, describe, expect, it } from 'vitest';
import { t } from '../../src/shared/copy/t';
import { envelope, jobHarness, jobIntake, type JobHarness } from './jobs/jobHarness';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const PIZZA = 'Order me a pizza from Dominos';
const EMPTY = envelope('', { kind: 'reply' });
/** The Claude CLI's real intake answer to PIZZA on Wed 21 Oct (9 runs of 9 planned this kind of job). */
const REAL_PIZZA_JOB =
  '<say></say>\n<act>{"decision":{"kind":"job","title":"Pizza from Domino\'s","plan":[{"phraseKey":"check_site","slots":{"site":"Domino\'s"},"route":"browser"},{"phraseKey":"shortlist","slots":{"what":"pizzas"},"route":"browser"},{"phraseKey":"wait_pick","slots":{"what":"pizza and size"},"route":"handback"},{"phraseKey":"fill_details","slots":{"what":"delivery address"},"route":"browser"},{"phraseKey":"show_before","slots":{"what":"order and total"},"route":"browser"},{"phraseKey":"wait_approve","slots":{"what":"the order"},"route":"handback"},{"phraseKey":"pay","slots":{"what":"the order"},"route":"browser"}],"estimate":{"minutes":8},"routeHint":["browser","handback"],"needsApps":[]},"usedMemoryIds":[]}</act>';

const reactions = (x: JobHarness) => x.db.prepare('SELECT emoji FROM reactions').all() as { emoji: string }[];
const fooTexts = (x: JobHarness) =>
  (x.db.prepare("SELECT text FROM messages WHERE author_kind = 'foo' AND kind = 'text'").all() as { text: string }[]).map((m) => m.text);
const intakeTurns = (x: JobHarness) => x.db.prepare("SELECT COUNT(*) FROM ai_turns WHERE purpose = 'intake'").pluck().get();

describe('AT-440 · an empty intake answer is asked once more, then the user is told; never a 👍 on a real ask', () => {
  it('run 13: the pizza ask comes back empty once, the second turn plans the job: Plan card, no 👍', async () => {
    h = jobHarness({
      script: [
        { match: { purpose: 'intake' }, reply: EMPTY },
        { match: { purpose: 'intake' }, reply: REAL_PIZZA_JOB },
      ],
    });
    h.userSays(PIZZA);
    await h.settle();
    expect(reactions(h)).toEqual([]);
    expect(intakeTurns(h)).toBe(2);
    expect(h.cards('plan').map((c) => c.state)).toEqual(['pending']);
    expect(fooTexts(h)).toEqual([]);
  });

  it('a short real ask that comes back empty twice gets "I didn\'t get that", not a 👍', async () => {
    h = jobHarness({ script: [{ match: { purpose: 'intake' }, reply: EMPTY, once: false }] });
    h.userSays('Weather in Delhi today?');
    await h.settle();
    expect(reactions(h)).toEqual([]);
    expect(intakeTurns(h)).toBe(2);
    expect(fooTexts(h)).toEqual([t('thread.reply.empty')]);
  });

  it('after Change plan, the retried turn still carries the old plan', async () => {
    const GOA = [{ phraseKey: 'look_for', slots: { what: 'Goa stays under ₹8,000' } }];
    h = jobHarness({
      script: [
        jobIntake(GOA, { title: 'Goa stay', estimate: { minutes: 6 }, match: 'Find a Goa stay' }),
        { match: { purpose: 'intake', promptIncludes: 'make it cheaper' }, reply: EMPTY },
        jobIntake(GOA, { title: 'Goa stay', estimate: { minutes: 6 }, match: 'make it cheaper' }),
      ],
    });
    h.userSays('Find a Goa stay');
    await h.settle();
    h.answer(String(h.cards('plan')[0]!.id), 'change');
    await h.settle();
    h.userSays('make it cheaper');
    await h.settle();
    const prompts = h
      .turnsJsonl()
      .filter((r) => r.purpose === 'intake')
      .map((r) => String(r.prompt));
    expect(prompts).toHaveLength(3);
    expect(prompts[1]).toContain('The job:');
    expect(prompts[2]).toContain('The job:');
    expect(h.cards('plan').map((c) => c.state)).toEqual(['changed', 'pending']);
  });

  it('an ack still gets its 👍 from intake kind react, with one turn (the ack rule is unchanged)', async () => {
    h = jobHarness({ script: [{ match: { purpose: 'intake' }, reply: envelope('', { kind: 'react', emoji: '👍' }) }] });
    h.userSays('thanks!');
    await h.settle();
    expect(reactions(h)).toEqual([{ emoji: '👍' }]);
    expect(intakeTurns(h)).toBe(1);
    expect(fooTexts(h)).toEqual([]);
  });

  it('run 21 B14: each empty answer says which empty it was (no words, or all dropped), never the words', async () => {
    h = jobHarness({ script: [{ match: { purpose: 'intake' }, reply: EMPTY, once: false }] });
    h.userSays('Which news story is biggest in India today? One line.');
    await h.settle();
    const empties = h.logs.map((l) => l.evt).filter((e) => typeof e === 'string' && e.startsWith('chat.reply_empty'));
    expect(empties).toEqual(['chat.reply_empty.no_say', 'chat.reply_empty.shape', 'chat.reply_empty.no_say', 'chat.reply_empty.shape']);
    // R1 run 40638245705: the tag order of the empty reply, as an enum.
    expect(h.logs.filter((l) => l.evt === 'chat.reply_empty.shape').map((l) => l.kind)).toEqual([
      'say_empty_before_act',
      'say_empty_before_act',
    ]);
    expect(JSON.stringify(h.logs)).not.toContain('news story');
    expect(fooTexts(h)).toEqual([t('thread.reply.empty')]);
  });
});
