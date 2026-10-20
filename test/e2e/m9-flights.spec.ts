// Spec: 10-acceptance-1 AT-157 ("book me a flight to Goa on Sat 12 Dec" → foo replies "I can find and compare flights, and
// open the booking page for you. Filling in passengers and paying for flights comes in a later version." with [ Compare
// flights ] and the link "Not now"; no Payment card, no booking Approval card and no paid/booked Activity row is ever created
// for a flight in v1), 08-2 §5.3.4 (X-81: the fixed reply before any AI turn; compare-and-open), 07-1 §7.0.8. M9 T8: the real
// app on the fake AI. The "opens the chosen page in Edge and hands over" clause is T7's take-over lane; it joins this spec
// when T7 lands (AT-157 stays pending until then).
import { expect, test } from '@playwright/test';
import { t } from '../../src/shared/copy/t';
import { TID } from '../../src/shared/testids';
import { SETUP_LINES, advanceUntil, lastCard, say, startBooking, stepLine } from './m9-booking-world';

const ASK = 'book me a flight to Goa on Sat 12 Dec';

test('AT-157 a flight booking ask gets the fixed reply before any AI turn; Compare runs a compare job that can never book', async () => {
  test.setTimeout(180_000);
  const w = await startBooking(() => [
    ...SETUP_LINES,
    {
      match: { purpose: 'intake', promptIncludes: 'flight to Goa' },
      reply: `<say></say><act>${JSON.stringify({
        decision: {
          kind: 'job',
          title: 'Flights to Goa',
          plan: [{ phraseKey: 'compare', slots: { what: 'flights' }, route: 'browser' }],
          estimate: { minutes: 2 },
          routeHint: ['browser'],
          needsApps: [],
        },
        usedMemoryIds: [],
      })}</act>`,
    },
    stepLine({
      kind: 'ask',
      card: {
        question: 'Which flight on Sat 12 Dec?',
        options: [
          { label: '6:05 AM · IndiGo', detail: '₹4,890 · nonstop' },
          { label: '9:40 AM · Air India', detail: '₹5,320 · nonstop' },
          { label: '1:15 PM · Akasa', detail: '₹4,610 · nonstop' },
        ],
      },
    }),
    // The AI tries to book anyway: the gate answers with the fixed reply; no Approval or Payment card.
    stepLine({
      kind: 'request_approval',
      draft: { verb: 'book', fields: { verb: 'book', payee: 'IndiGo', irreversible: false }, evidence: [] },
    }),
    stepLine({ kind: 'done', result: 'Here are the flights; book on the airline page when you are ready.', unverified: true }),
  ]);
  const { page } = w;
  try {
    await say(page, ASK);
    // Fixed lexicon before the AI (08-2 §5.3.4): the card is there without moving the clock.
    const scope = lastCard(page, TID.cardChoice);
    await expect(scope).toContainText(t('thread.flight_scope.body'));
    const options = scope.getByTestId(TID.cardChoiceOption);
    await expect(options).toHaveCount(2);
    await expect(options.nth(0)).toContainText(t('thread.flight_scope.button.compare'));
    await expect(options.nth(1)).toContainText(t('thread.flight_scope.button.not_now'));
    expect(w.db().prepare('SELECT count(*) AS n FROM jobs WHERE created_at > ?').get(Date.parse('2026-10-16T11:00:00+05:30'))).toEqual({
      n: 0,
    });

    await options.nth(0).click();
    const flights = page.getByTestId(TID.threadLog).locator(`[data-testid="${TID.cardChoice}"][data-card-state="asking"]`);
    await advanceUntil(page, flights);
    await expect(flights).toContainText('Which flight on Sat 12 Dec?');
    const flightsCard = await flights.getAttribute('data-card-id');
    const job = w.db().prepare('SELECT j.id, j.do_verbs FROM jobs j JOIN cards c ON c.job_id = j.id WHERE c.id = ?').get(flightsCard) as {
      id: string;
      do_verbs: string;
    };
    expect(JSON.parse(job.do_verbs)).toEqual([]);
    await flights.getByTestId(TID.cardChoiceOption).nth(0).click();

    await expect
      .poll(async () => {
        await page.evaluate(() => window.__fooTest!.clock.advance(500));
        return (w.db().prepare('SELECT state FROM jobs WHERE id = ?').get(job.id) as { state: string }).state;
      })
      .toMatch(/^done/u);
    // Never a booking Approval card, a Payment card, or a booked / paid Activity row for this flight.
    const cards = w.db().prepare("SELECT type FROM cards WHERE job_id = ? AND type IN ('approval', 'payment')").all(job.id);
    expect(cards).toEqual([]);
    expect(w.db().prepare('SELECT count(*) AS n FROM approvals WHERE job_id = ?').get(job.id)).toEqual({ n: 0 });
    expect(w.db().prepare("SELECT count(*) AS n FROM activity WHERE job_id = ? AND kind IN ('booked', 'paid')").get(job.id)).toEqual({
      n: 0,
    });
    await expect(page.getByTestId(TID.threadLog)).toContainText(t('thread.flight_scope.body'));
  } finally {
    await w.close();
  }
});

test('AT-157 Not now ends it: no job and no AI turn for the flight', async () => {
  const w = await startBooking(() => [...SETUP_LINES]);
  const { page } = w;
  try {
    await say(page, ASK);
    const scope = lastCard(page, TID.cardChoice);
    await scope.getByTestId(TID.cardChoiceOption).nth(1).click();
    await expect(scope).toHaveAttribute('data-card-state', 'answered');
    await page.evaluate(() => window.__fooTest!.clock.advance(5_000));
    expect(w.db().prepare('SELECT count(*) AS n FROM jobs WHERE created_at > ?').get(Date.parse('2026-10-16T11:00:00+05:30'))).toEqual({
      n: 0,
    });
  } finally {
    await w.close();
  }
});
