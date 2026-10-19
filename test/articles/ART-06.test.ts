// ART-06a / ART-06b (10-2 §D, Article 6: nothing that spends, books, sends or deletes happens from typed words or a
// reaction; only the card's own button approves). 08-2 §5.2 (order: stop word → typed answer on a Choice card → the yes-text
// G16 reply), §5.2.2 looksLikeYes (the anchored word list; a single 👍 / ✅ reaction), 08-4 §26.6 (typed answers and 1️⃣–4️⃣
// reactions answer Choice cards). Cards are seeded rows (M5-T5 brief: Approval / Draft / payment rows before T4 and T6 make
// them). Voice "yes" lands with voice notes (M12) and is the same text then.
// implementation-notes M5-T5: "हाँ", a typed "👍" and a typed "✅" are not in 08-2 §5.2.2's word list, so they reach intake
// like any other text; the card stays PENDING either way (the Article's rule), and the G16 line comes for the listed words
// and for the 👍 / ✅ reactions (raised to the lead as a CR question).
import { afterEach, describe, expect, it } from 'vitest';
import { onCardReaction, type AnswerDeps } from '../../src/main/cards/answerCard';
import { looksLikeYes } from '../../src/engine/jobs/stopFlow';
import { t } from '../../src/shared/copy/t';
import { envelope, intake } from '../unit/m3-engine-helpers';
import { jobHarness, type JobHarness } from '../integration/jobs/jobHarness';
import { fooTexts } from '../integration/jobs/t3Helpers';
import { cardOf, FLIGHTS, seedCard } from '../integration/choice/seedCard';

const TYPED = ['yes', 'Yes!', 'ok do it', 'approve', 'go ahead', 'send it', 'हाँ', 'haan kar do', '👍', '✅'];
const APPROVE_LINE = t('thread.approval_typed.approve');
const SEND_LINE = t('thread.approval_typed.send');

const FIELDS = { verb: 'book', what: 'Table at Pizza by the Bay', when: 'Sun 18 Oct, 8:00 PM', people: 4 };

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

function gated(harness: JobHarness) {
  const now = harness.clock.now();
  const chatId = harness.chatId;
  return {
    approval: seedCard(harness.db, {
      chatId,
      type: 'approval',
      state: 'PENDING',
      payload: { variant: 'standard', title: 'Book table', fields: FIELDS },
      now,
    }),
    payment: seedCard(harness.db, {
      chatId,
      type: 'payment',
      state: 'PENDING',
      payload: { payee: 'Pizza by the Bay', totalPaise: 100_000 },
      now: now + 1,
    }),
    draft: seedCard(harness.db, {
      chatId,
      type: 'draft',
      state: 'pending',
      payload: { channel: 'email', body: 'See you at 8.' },
      now: now + 2,
    }),
  };
}

const deps = (harness: JobHarness): AnswerDeps => ({
  db: harness.db,
  now: () => harness.clock.now(),
  engine: undefined,
  emitCard: () => undefined,
  emitMessage: () => undefined,
  emitChat: () => undefined,
});

describe('Article 6: typed words and reactions never approve', () => {
  it.each(TYPED)('ART-06a: typed "%s" with an Approval, a Payment and a Draft card pending leaves every card PENDING', async (text) => {
    h = jobHarness({ script: [intake(envelope('Okay.'))] });
    const cards = gated(h);
    h.userSays(text);
    await h.settle();
    expect(cardOf(h.db, cards.approval.id).state).toBe('PENDING');
    expect(cardOf(h.db, cards.payment.id).state).toBe('PENDING');
    expect(cardOf(h.db, cards.draft.id).state).toBe('pending');
    for (const c of Object.values(cards)) expect(cardOf(h.db, c.id).resolvedAt).toBeNull();
    // The G16 line for every word 08-2 §5.2.2 lists (the first open gated card is the Approval card).
    if (looksLikeYes(text)) expect(fooTexts(h)).toEqual([APPROVE_LINE]);
  });

  it('ART-06a: with only a Draft pending, a typed "send it" gets "Tap Send on the draft so I know it\'s really you."', async () => {
    h = jobHarness({ script: [intake(envelope('Okay.'))] });
    const draft = seedCard(h.db, {
      chatId: h.chatId,
      type: 'draft',
      state: 'pending',
      payload: { channel: 'email', body: 'Hi' },
      now: h.clock.now(),
    });
    h.userSays('send it');
    await h.settle();
    expect(cardOf(h.db, draft.id).state).toBe('pending');
    expect(fooTexts(h)).toEqual([SEND_LINE]);
  });

  it.each(['👍', '✅'])('ART-06a: reacting %s on each gated card leaves it PENDING and gets the G16 line', async (emoji) => {
    h = jobHarness({ script: [] });
    const cards = gated(h);
    for (const c of Object.values(cards)) onCardReaction(deps(h), c.messageId, emoji);
    expect(cardOf(h.db, cards.approval.id).state).toBe('PENDING');
    expect(cardOf(h.db, cards.payment.id).state).toBe('PENDING');
    expect(cardOf(h.db, cards.draft.id).state).toBe('pending');
    expect(fooTexts(h)).toEqual([APPROVE_LINE, APPROVE_LINE, SEND_LINE]);
  });

  it.each(['yes', 'Yes!'])('ART-06b: typed "%s" does answer a Choice card whose option says it', async (text) => {
    h = jobHarness({ script: [intake(envelope('Okay.'))] });
    const appUse = {
      ...FLIGHTS,
      purpose: 'app_use',
      question: t('cards.choice.question.app_use', { app: 'Calendar' }),
      options: [
        { id: 'o1', label: t('cards.choice.option.yes'), bestFit: true },
        { id: 'o2', label: t('cards.choice.option.not_this_time') },
      ],
      livePrices: false,
    };
    const c = seedCard(h.db, { chatId: h.chatId, type: 'choice', state: 'asking', payload: appUse, now: h.clock.now() });
    h.userSays(text);
    await h.settle();
    expect(cardOf(h.db, c.id)).toMatchObject({ state: 'answered', answer: { optionId: 'o1' }, resolvedBy: 'typed' });
  });

  it.each(['2', 'the second one', 'doosra wala'])('ART-06b: typed "%s" answers a Choice card', async (text) => {
    h = jobHarness({ script: [intake(envelope('Okay.'))] });
    const c = seedCard(h.db, {
      chatId: h.chatId,
      type: 'choice',
      state: 'asking',
      payload: { ...FLIGHTS, purpose: 'setup' },
      now: h.clock.now(),
    });
    h.userSays(text);
    await h.settle();
    expect(cardOf(h.db, c.id)).toMatchObject({ state: 'answered', answer: { optionId: 'o2' }, resolvedBy: 'typed' });
  });

  it('ART-06b: a 2️⃣ reaction answers a Choice card', () => {
    h = jobHarness({ script: [] });
    const c = seedCard(h.db, {
      chatId: h.chatId,
      type: 'choice',
      state: 'asking',
      payload: { ...FLIGHTS, purpose: 'setup' },
      now: h.clock.now(),
    });
    onCardReaction(deps(h), c.messageId, '2️⃣');
    expect(cardOf(h.db, c.id)).toMatchObject({ state: 'answered', answer: { optionId: 'o2' }, resolvedBy: 'reaction' });
  });
});
