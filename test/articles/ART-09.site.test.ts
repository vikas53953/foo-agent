// Spec: ART-09 (10-2 §D, Article 9 "Fresh yes before switching how", the browser rung): inside an approved booking, a new site
// needs the person on a card before anything is done there. 08-2 §8.1 (acting with `book`/`buy`/`pay` on a domain other than
// `approval.fields.siteDomain` needs a new Approval card; reading other sites never does), §9.6 A (second look: the page's
// siteDomain == fields.siteDomain, any mismatch → HELD(mismatch) with the two values as chips), 08-4 §28.1 item 5 (siteDomain is
// the page's registrable domain). Made-up sandbox sites only (test/sites, `.test` names); the restaurant counts every POST.
import { afterEach, describe, expect, it } from 'vitest';
import { SITE_HOSTS } from '../sites/hosts';
import { secondLookOk } from '../integration/approvals/gateFlow';
import { bookingWorld, type BookingWorld } from '../integration/browser/booking';
import { jobHarness, jobIntake, step, tool, type JobHarness } from '../integration/jobs/jobHarness';

let h: JobHarness | null = null;
let w: BookingWorld | null = null;
afterEach(async () => {
  h?.close();
  h = null;
  await w?.close();
  w = null;
});

const bookTable = step({
  kind: 'request_approval',
  draft: {
    verb: 'book',
    fields: { verb: 'book', payee: 'Coastline Kitchen', partySize: 4, cancelTerms: { refundable: true, feePaise: 1 }, irreversible: false },
    evidence: [
      { field: 'payee', toolCallId: 'tc_000002', quote: 'Coastline Kitchen' },
      { field: 'cancelTerms', toolCallId: 'tc_000002', quote: 'No-show fee ₹1,000', ref: 'e3' },
    ],
  },
  submitRef: 'e3',
});

const rows = (x: JobHarness, sql: string) => x.db.prepare(sql).all() as Record<string, unknown>[];

describe('ART-09 · a fresh yes before switching to a new site', () => {
  it('ART-09 inside an approved booking, a move to a new site comes back on the card (HELD, place) and nothing is submitted', async () => {
    w = await bookingWorld();
    h = jobHarness({
      script: [
        jobIntake([{ phraseKey: 'check_site', slots: { site: SITE_HOSTS.restaurant }, route: 'browser' }], { title: 'Book a table' }),
        tool('browser.open', { url: w.sb.url('restaurant', '/book/coastline?party=4&time=8:00 PM') }),
        tool('browser.snapshot', {}),
        bookTable,
        secondLookOk(),
      ],
      browser: w.browser,
    });
    h.userSays('Book a table for 4 at Coastline Kitchen on Sunday');
    await h.settle(20);
    const card = rows(h, "SELECT * FROM cards WHERE type = 'approval'")[0]!;
    expect(JSON.parse(String(card.payload)).fields.siteDomain).toBe(SITE_HOSTS.restaurant);

    // The job's page is now on another site (a page link, or the AI moving on) when the approved click is due.
    const page = w.browser.runtime.page(String(h.job().id))!;
    await page.goto(w.sb.url('news', '/'));

    h.approvals.approve({ cardId: String(card.id), nonce: String(card.nonce), resolvedBy: 'tap', scope: 'once' });
    await h.settle(20);

    const a = rows(h, 'SELECT state, submitted_at FROM approvals')[0]!;
    expect(a).toMatchObject({ state: 'HELD', submitted_at: null });
    const held = JSON.parse(String(rows(h, "SELECT payload FROM cards WHERE type = 'approval'")[0]!.payload)).held;
    expect(held).toMatchObject({ reason: 'mismatch', userSaid: SITE_HOSTS.restaurant, actionHas: SITE_HOSTS.news });
    expect(h.toolCalls().some((c) => c.tool === 'browser.submit')).toBe(false);
    expect((await w.control()).counters.submits ?? 0).toBe(0);
  }, 60_000);

  it('ART-09 on the card’s own site the approved booking goes ahead (one POST), so the check only stops a switch', async () => {
    w = await bookingWorld();
    h = jobHarness({
      script: [
        jobIntake([{ phraseKey: 'check_site', slots: { site: SITE_HOSTS.restaurant }, route: 'browser' }], { title: 'Book a table' }),
        tool('browser.open', { url: w.sb.url('restaurant', '/book/coastline?party=4&time=8:00 PM') }),
        tool('browser.snapshot', {}),
        bookTable,
        secondLookOk(),
        step({ kind: 'done', result: 'Booked.', unverified: true }),
      ],
      browser: w.browser,
    });
    h.userSays('Book a table for 4 at Coastline Kitchen on Sunday');
    await h.settle(20);
    const card = rows(h, "SELECT * FROM cards WHERE type = 'approval'")[0]!;
    h.approvals.approve({ cardId: String(card.id), nonce: String(card.nonce), resolvedBy: 'tap', scope: 'once' });
    await h.settle(20);
    expect(rows(h, 'SELECT state FROM approvals')[0]).toMatchObject({ state: 'COMPLETED' });
    expect((await w.control()).counters.submits).toBe(1);
  }, 60_000);
});
