// Spec: 08-2 §11.4 item 3 (context rules): `toast` masks third-party emails "r***@gmail.com" and phones "+91 98••• ••210"
// (J20); `log` masks every email and phone (§19.1); `group` (08-3 §17.3.3, X-126) masks as toast does and replaces the
// amounts of the job's succeeded payments (F11 forms "₹14,600", "14600", "14,600.00") with "the amount", private facts with
// "something private" (exact and NFKC case-insensitive), shared addresses with "the address". Made-up people only.
import { describe, expect, it } from 'vitest';
import { FakeClock, TEST_EPOCH_MS } from '../../../src/shared/clock';
import { HIDDEN, maskEmail, maskPhone, Redactor } from '../../../src/shared/redactor';

const r = new Redactor({ clock: new FakeClock(TEST_EPOCH_MS) });

describe('08-2 §11.4 context rules', () => {
  it('the mask shapes are the spec examples', () => {
    expect(maskEmail('riya.test@gmail.com')).toBe('r***@gmail.com');
    expect(maskPhone('9876543210', '91')).toBe('+91 98••• ••210');
    expect(maskPhone('98765 43210')).toBe('98••• ••210');
  });

  it('toast: third-party emails and phones are masked; the user’s own email stays', () => {
    const text = 'Sent to riya.test@gmail.com and me (owner.test@gmail.com), call +91 98765 43210';
    expect(r.redact(text, { channel: 'toast', ownEmails: ['Owner.Test@gmail.com'] }).text).toBe(
      'Sent to r***@gmail.com and me (owner.test@gmail.com), call +91 98••• ••210',
    );
  });

  it('toast: a PNR, a landline-looking reference and a price are not phone numbers', () => {
    for (const t of ['PNR 9512367890', 'order #9988776655', 'it costs ₹14,600', 'call 1800 209 1234'])
      expect(r.redact(t, { channel: 'toast' }).text).toBe(t);
  });

  it('no channel: emails and phones stay (stored text keeps them)', () => {
    const t = 'riya.test@gmail.com 9876543210';
    expect(r.redact(t).text).toBe(t);
  });

  it('log: every email and phone is masked, the own address too, and secrets are still hidden', () => {
    expect(
      r.redact('owner.test@gmail.com 9876543210 key sk-proj-FAKE0canary0value0000000000', {
        channel: 'log',
        ownEmails: ['owner.test@gmail.com'],
      }).text,
    ).toBe(`o***@gmail.com 98••• ••210 key ${HIDDEN}`);
  });

  it('group: amounts of succeeded payments in every F11 form become "the amount"', () => {
    const out = r.redact('Paid ₹14,600 (14600 total, 14,600.00 incl. tax). Next bill ₹1,46,000.', {
      channel: 'group',
      paidAmountsPaise: [1_460_000],
    }).text;
    expect(out).toBe('Paid the amount (the amount total, the amount incl. tax). Next bill ₹1,46,000.');
  });

  it('group: private facts (NFKC, any case) and shared addresses are replaced; contacts masked as in toast', () => {
    const out = r.redact('Booked near ＦＬＡＴ 12, Lotus Lane for riya.test@gmail.com; she takes Insulin daily.', {
      channel: 'group',
      privateFacts: ['takes insulin daily'],
      sharedAddresses: ['FLAT 12, Lotus Lane'],
    }).text;
    expect(out).toBe('Booked near the address for r***@gmail.com; she something private.');
  });
});
