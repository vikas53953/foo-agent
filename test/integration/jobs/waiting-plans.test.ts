// Spec: CR-0028 (X-186), the real-PC run of 2026-10-21 (main 501aa1a, Claude CLI): two Plan cards waiting for Go, then
// "Find me a hotel in Goa for 2 nights next weekend under 6000 rupees a night". 08-4 §25.5 item 5 (intake `ask` → a Choice card,
// never the empty-reply line), 05-1 §5.3 (the card; ⏳ on the user's bubble while it asks), 08-4 §24.22 (the answer goes back
// with the message as a part 8 `Decisions:` line), 08-2 §5.3.3 (a job waiting on its Plan card stays queued until Go),
// 03-shell-1 §3.4.4–§3.4.5 and 03-shell-2 §3.7.3.1 (a plan waiting for Go is "Needs you", not "Working" or "Waiting for
// another job to finish").
import { afterEach, describe, expect, it } from 'vitest';
import { t } from '../../../src/shared/copy/t';
import { chatRows, jobRows } from '../../../src/main/store/queries';
import { doingLine, doingRows, shownState } from '../../../src/renderer/shell/doingNowRows';
import { chipCounts } from '../../../src/renderer/chatlist/rules';
import type { JobRow } from '../../../src/shared/types';
import { answerCard } from '../../../src/main/cards/answerCard';
import { jobHarness, jobIntake, step, type JobHarness } from './jobHarness';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const PHONES = 'Make a table comparing 3 budget phones under 20000 rupees';
const BOOKING = 'Book a table for 2 tomorrow at 8pm at a good vegetarian restaurant near Connaught Place, Delhi';
const HOTEL = 'Find me a hotel in Goa for 2 nights next weekend under 6000 rupees a night';

/** The Claude CLI's real answer to HOTEL on Wed 21 Oct (1 run in 6 asked; the others planned a job). */
const REAL_ASK =
  '<say></say>\n<act>{"decision":{"kind":"ask","card":{"question":"Which dates for the Goa hotel (2 nights)?","options":[{"label":"Fri 30 Oct – Sun 1 Nov","detail":"Next weekend, Friday check-in"},{"label":"Sat 31 Oct – Mon 2 Nov","detail":"Next weekend, Saturday check-in"},{"label":"Sat 24 Oct – Mon 26 Oct","detail":"This coming weekend"}],"reversible":true}},"usedMemoryIds":[]}</act>';

const FIVE_MIN = { estimate: { minutes: 5 } };
const script = () => [
  jobIntake([{ phraseKey: 'look_for', slots: { what: 'budget phones' } }], { ...FIVE_MIN, match: PHONES }),
  jobIntake([{ phraseKey: 'look_for', slots: { what: 'vegetarian restaurants' } }], { ...FIVE_MIN, match: BOOKING }),
  // The turn after the answer carries it; listed first so it wins over the ask line (file order, 08-3 §22.3).
  jobIntake([{ phraseKey: 'look_for', slots: { what: 'Goa hotels' } }], { ...FIVE_MIN, match: 'Decisions:' }),
  { match: { purpose: 'intake', promptIncludes: 'hotel in Goa' }, reply: REAL_ASK },
];

async function twoPlansThenHotel(): Promise<{ hotelId: string }> {
  h = jobHarness({ script: script() });
  h.userSays(PHONES);
  await h.settle();
  h.userSays(BOOKING);
  await h.settle();
  expect(h.cards('plan').map((c) => c.state)).toEqual(['pending', 'pending']);
  const hotelId = h.userSays(HOTEL);
  await h.settle();
  return { hotelId };
}

const texts = (hh: JobHarness) =>
  (hh.db.prepare("SELECT text FROM messages WHERE author_kind = 'foo' AND kind = 'text'").all() as { text: string }[]).map((m) => m.text);
const rows = (hh: JobHarness): JobRow[] => jobRows(hh.db, '1 = 1 ORDER BY created_at, id', [], hh.clock.now());
const fooChat = (hh: JobHarness) =>
  chatRows(hh.db, { now: hh.clock.now(), agentName: 'foo', draftPrefix: 'Draft:' }).find((c) => c.kind === 'foo' && !c.private)!;

describe('CR-0028 · an intake question is a Choice card, never "I didn\'t get that"', () => {
  it('the real CLI ask, with two plans waiting, posts the dates card and ⏳; no empty-reply line', async () => {
    const { hotelId } = await twoPlansThenHotel();
    expect(texts(h!)).not.toContain(t('thread.reply.empty'));
    const card = h!.cards('choice')[0]!;
    expect(card.state).toBe('asking');
    expect(card.job_id).toBeNull();
    const payload = JSON.parse(String(card.payload)) as { question: string; options: { id: string; label: string }[]; reversible: boolean };
    expect(payload.question).toBe('Which dates for the Goa hotel (2 nights)?');
    expect(payload.options.map((o) => o.id)).toEqual(['o1', 'o2', 'o3']);
    // Dates are real-world options: no auto-pick (08-4 §26.7).
    expect(payload.reversible).toBe(false);
    expect(h!.message(hotelId).badge).toBe('waiting');
    // The two plans were not touched and no third job started.
    expect(h!.jobs()).toHaveLength(2);
    expect(h!.cards('plan').map((c) => c.state)).toEqual(['pending', 'pending']);
  });

  it('a tap sends the message back to intake with "- Q: … → A: …"; the hotel plan follows', async () => {
    await twoPlansThenHotel();
    const card = h!.cards('choice')[0]!;
    // Through main's card:answer path, as a real tap goes (answerCard forwards it to the engine).
    const x = h!;
    const r = answerCard(
      {
        db: x.db,
        now: () => x.clock.now(),
        engine: x.bridge,
        emitCard: () => undefined,
        emitMessage: () => undefined,
        emitChat: () => undefined,
      },
      { cardId: String(card.id), nonce: String(card.nonce), answer: { optionId: 'o2' }, resolvedBy: 'tap' },
    );
    expect(r.ok).toBe(true);
    await h!.settle();
    expect(h!.cards('choice')[0]!.state).toBe('answered');
    const intakes = h!.turnsJsonl().filter((x) => x.purpose === 'intake');
    const last = String(intakes.at(-1)!.prompt);
    expect(last).toContain('Decisions:\n- Q: Which dates for the Goa hotel (2 nights)? → A: Sat 31 Oct – Mon 2 Nov');
    expect(last).toContain(HOTEL);
    expect(h!.cards('plan').map((c) => c.state)).toEqual(['pending', 'pending', 'pending']);
    expect(h!.jobs().every((j) => j.state === 'queued')).toBe(true);
    // A second tap on the answered card does nothing.
    h!.answer(String(card.id), 'o1');
    await h!.settle();
    expect(h!.jobs()).toHaveLength(3);
  });

  it('a typed answer ("2") does the same and is not a new ask', async () => {
    await twoPlansThenHotel();
    h!.userSays('2');
    await h!.settle();
    expect(h!.cards('choice')[0]!.state).toBe('answered');
    const last = String(
      h!
        .turnsJsonl()
        .filter((x) => x.purpose === 'intake')
        .at(-1)!.prompt,
    );
    expect(last).toContain('→ A: Sat 31 Oct – Mon 2 Nov');
    expect(h!.jobs()).toHaveLength(3);
    expect(texts(h!)).not.toContain(t('thread.reply.empty'));
  });
});

describe('CR-0028 · released words before an ask stay; Skip goes on with the Best fit', () => {
  it('a streamed sentence then kind ask: the sentence stands and the Choice card is posted', async () => {
    const act = REAL_ASK.slice(REAL_ASK.indexOf('<act>'));
    h = jobHarness({
      script: [
        {
          match: { purpose: 'intake' },
          chunks: [
            { text: '<say>One quick question first. ' },
            { text: 'Then I will look.</say>', delayMs: 2_000 },
            { text: act, delayMs: 10 },
          ],
        },
      ],
    });
    h.userSays(HOTEL);
    await h.settle();
    expect(h.cards('choice')).toHaveLength(1);
    expect(texts(h).some((x) => x.startsWith('One quick question first.'))).toBe(true);
    expect(texts(h)).not.toContain(t('thread.reply.empty'));
  });

  it('Skip (05-1 §5.3.3) sends option 1 as the answer', async () => {
    await twoPlansThenHotel();
    const card = h!.cards('choice')[0]!;
    const x = h!;
    const r = answerCard(
      {
        db: x.db,
        now: () => x.clock.now(),
        engine: x.bridge,
        emitCard: () => undefined,
        emitMessage: () => undefined,
        emitChat: () => undefined,
      },
      { cardId: String(card.id), nonce: String(card.nonce), answer: { skip: true }, resolvedBy: 'tap' },
    );
    expect(r.ok).toBe(true);
    await h!.settle();
    expect(h!.cards('choice')[0]!.state).toBe('skipped');
    const last = String(
      h!
        .turnsJsonl()
        .filter((y) => y.purpose === 'intake')
        .at(-1)!.prompt,
    );
    expect(last).toContain('→ A: Fri 30 Oct – Sun 1 Nov');
  });
});

describe('CR-0028 · a plan waiting for Go needs the user; it is not running', () => {
  it('Doing now reads "Needs you: {title}", the Working chip is empty, the pill is Needs you; Go moves it to working', async () => {
    h = jobHarness({
      script: [...script(), step({ kind: 'done', result: 'Done.', unverified: true })],
    });
    h.userSays(PHONES);
    await h.settle();
    h.userSays(BOOKING);
    await h.settle();
    const jobs = rows(h);
    expect(jobs.map((j) => [j.state, j.awaitingGo])).toEqual([
      ['queued', true],
      ['queued', true],
    ]);
    const ctx = { now: h.clock.now(), timeZone: 'Asia/Kolkata', ai: 'Claude', cards: {} };
    for (const j of doingRows(jobs, ctx.now, ctx.timeZone).rows) {
      expect(shownState(j)).toBe('needs_you');
      expect(doingLine(j, ctx)).toBe(t('app.panel.doing.line.needs_you', { title: j.title }));
      expect(doingLine(j, ctx)).not.toBe(t('app.panel.doing.line.queued'));
    }
    const chat = fooChat(h);
    expect(chat.pill).toBe('needs_you');
    expect(chat.list.running).toBe(false);
    expect(chipCounts([chat], h.clock.now())).toEqual({ needs_you: 1, working: 0 });

    // Go: the Plan card's tx re-sends its job, so the row stops reading "Needs you" at once.
    const upserts = () => h!.patches.filter((e) => e.event === 'job:upsert').length;
    const before = upserts();
    h.answer(String(h.cards('plan')[0]!.id), 'go');
    await h.settle();
    expect(upserts()).toBeGreaterThan(before);
    const after = rows(h);
    expect(after[0]!.awaitingGo).toBeUndefined();
    expect(after[1]!.awaitingGo).toBe(true);
  });

  it('a queued job with no Plan card still reads "Waiting for another job to finish"', () => {
    const j = { state: 'queued', awaitingGo: undefined } as unknown as JobRow;
    expect(shownState(j)).toBe('queued');
  });
});
