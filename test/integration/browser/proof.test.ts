// Spec: AT-114a (a booking whose confirmation page shows a 6-character code next to the word "code" ("Booking code TJ8821")
// → `finish()` finds it in the pre-redaction result, the job is DONE (not done_unverified) and the Proof chip shows the code;
// the OTP rule does not hide it), 08-4 §26.11 (RAM results first, else the stored redacted result), 08-2 §5.8 (the proof is
// checked from recorded tool results, never from the AI's words). Booked on the sandbox restaurant with foo's real browser.
import { afterEach, describe, expect, it } from 'vitest';
import { redactSecrets } from '../../../src/shared/redactor';
import { secondLookOk } from '../approvals/gateFlow';
import { jobHarness, jobIntake, step, tool, type JobHarness } from '../jobs/jobHarness';
import { bookingWorld, type BookingWorld } from './booking';

let h: JobHarness | null = null;
let w: BookingWorld | null = null;
afterEach(async () => {
  h?.close();
  h = null;
  await w?.close();
  w = null;
});

const proof = (code: string, seenInToolCallId = 'tc_000003') => ({ kind: 'confirmation', code, site: 'tablejoy.test', seenInToolCallId });

async function book(done: Record<string, unknown>): Promise<JobHarness> {
  w = await bookingWorld();
  h = jobHarness({
    script: [
      jobIntake([{ phraseKey: 'check_site', slots: { site: 'tablejoy.test' }, route: 'browser' }], { title: 'Book a table' }),
      tool('browser.open', { url: w.sb.url('restaurant', '/book/coastline?party=4&time=8:00 PM') }),
      tool('browser.snapshot', {}),
      step({
        kind: 'request_approval',
        draft: {
          verb: 'book',
          fields: {
            verb: 'book',
            payee: 'Coastline Kitchen',
            partySize: 4,
            cancelTerms: { refundable: true, feePaise: 1 },
            irreversible: false,
          },
          evidence: [{ field: 'cancelTerms', toolCallId: 'tc_000002', quote: 'No-show fee ₹1,000', ref: 'e3' }],
        },
        submitRef: 'e3',
      }),
      secondLookOk(),
      step({ kind: 'done', ...done }),
    ],
    browser: w.browser,
  });
  h.userSays('Book a table for 4 at Coastline Kitchen on Sunday');
  await h.settle(20);
  const card = h.db.prepare("SELECT * FROM cards WHERE type = 'approval'").get() as Record<string, unknown>;
  h.approvals.approve({ cardId: String(card.id), nonce: String(card.nonce), resolvedBy: 'tap', scope: 'once' });
  await h.settle(20);
  return h;
}

describe('AT-114a · the booking code is proof', () => {
  it('AT-114a "Booking code TJ8821" on the confirmation page → DONE with the code as proof, and it is not hidden', async () => {
    const x = await book({ result: 'Booked. Your code is TJ8821.', proof: proof('TJ8821') });
    expect(x.toolCalls().find((c) => c.id === 'tc_000003')?.tool).toBe('browser.submit');
    const job = x.job();
    expect(job.state).toBe('done');
    // The Proof chip renders from the stored proof: the code itself.
    expect(JSON.parse(String(job.proof))).toEqual(proof('TJ8821'));
    // The OTP rule does not catch a confirmation-shaped code: the stored (redacted) result still shows it.
    expect(String(x.toolCalls().find((c) => c.id === 'tc_000003')!.result)).toContain('Booking code TJ8821');
    expect(redactSecrets('Booking code TJ8821').hits).toBe(0);
  }, 60_000);

  it('AT-114a a code the page never showed → done_unverified, nothing stored as proof', async () => {
    const x = await book({ result: 'Booked.', proof: proof('ZZ9999') });
    expect(x.job().state).toBe('done_unverified');
    expect(x.job().proof).toBeNull();
  }, 60_000);
});
