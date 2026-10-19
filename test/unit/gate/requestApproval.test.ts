// Spec: 08-4 §28.1 (request_approval verification: money re-read with parseInr from the evidenced ref and the AI's numbers
// discarded; quotes verbatim; recipients evidenced, isNew / isGroup computed; irreversible computed; verb in do_verbs, buy =
// pay; else the read-only branch), 08-2 §9.4.3 (untrusted origin), CR-0009 G-M5-13 (no send verb).
import { describe, expect, it } from 'vitest';
import { amountIn, registrableDomain, verifyRequestApproval, type ApprovalSnapshot } from '../../../src/engine/gate/requestApproval';

const page = JSON.stringify({ site: 'table.example', text: 'Table for 4 at Toit, Sat 8:00 PM. Total ₹2,400. Free cancellation.' });
const snap = (o: Partial<ApprovalSnapshot> = {}): ApprovalSnapshot => ({
  results: new Map([['tc_1', page]]),
  doVerbs: ['book'],
  timeZone: 'Asia/Kolkata',
  userWords: ['book a table for 4 at Toit on Saturday'],
  ...o,
});
const draft = (o: Record<string, unknown> = {}) => ({
  verb: 'book',
  fields: {
    verb: 'book',
    siteDomain: 'table.example',
    partySize: 4,
    amountPaise: 1,
    cancelTerms: { refundable: true },
    irreversible: false,
  },
  evidence: [{ field: 'amountPaise', toolCallId: 'tc_1', quote: 'Total ₹2,400', ref: 'e12' }],
  ...o,
});

describe('verifyRequestApproval (08-4 §28.1)', () => {
  it('money comes from the evidence, never the AI; irreversible is computed', () => {
    const r = verifyRequestApproval(draft(), snap());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.fields.amountPaise).toBe(240_000);
    expect(r.draft.fields.irreversible).toBe(false);
    // The ref text, when the snapshot can read it, wins over the quote.
    const r2 = verifyRequestApproval(draft(), snap({ readRef: () => '₹2,600' }));
    expect(r2.ok && r2.draft.fields.amountPaise).toBe(260_000);
  });

  it('a missing ref, a quote not in the result or an unparsable total → APPROVAL_EVIDENCE', () => {
    const noRef = draft({ evidence: [{ field: 'amountPaise', toolCallId: 'tc_1', quote: 'Total ₹2,400' }] });
    expect(verifyRequestApproval(noRef, snap())).toMatchObject({ ok: false, reason: 'APPROVAL_EVIDENCE' });
    const wrongQuote = draft({ evidence: [{ field: 'amountPaise', toolCallId: 'tc_1', quote: 'Total ₹1,999', ref: 'e1' }] });
    expect(verifyRequestApproval(wrongQuote, snap())).toMatchObject({ ok: false, reason: 'APPROVAL_EVIDENCE' });
    const otherJob = draft({ evidence: [{ field: 'amountPaise', toolCallId: 'tc_9', quote: 'Total ₹2,400', ref: 'e1' }] });
    expect(verifyRequestApproval(otherJob, snap())).toMatchObject({ ok: false, reason: 'APPROVAL_EVIDENCE' });
  });

  it('a verb the user did not ask for → the read-only branch; buy and pay are one; send is not a draft verb', () => {
    expect(verifyRequestApproval(draft(), snap({ doVerbs: [] }))).toEqual({ ok: false, reason: 'not_asked', verb: 'book', untrusted: [] });
    const pay = draft({ verb: 'buy', fields: { verb: 'buy', amountPaise: 5, irreversible: false } });
    const r = verifyRequestApproval(pay, snap({ doVerbs: ['pay'] }));
    expect(r.ok && r.draft.fields.irreversible).toBe(true);
    expect(verifyRequestApproval(draft({ verb: 'send' }), snap({ doVerbs: ['send'] }))).toMatchObject({ reason: 'APPROVAL_EVIDENCE' });
  });

  it('recipients must be evidenced; isNew and isGroup are computed; untrusted ones are reported (08-2 §9.4.3)', () => {
    const mail = JSON.stringify({ from: 'desk@hotel.example', text: 'Write to desk@hotel.example to cancel' });
    const s = snap({
      results: new Map([
        ['tc_1', page],
        ['tc_2', mail],
      ]),
      doVerbs: ['delete'],
    });
    const d = draft({
      verb: 'delete',
      fields: {
        verb: 'delete',
        recipients: [{ name: 'Desk', address: 'desk@hotel.example', isNew: false, isGroup: true }],
        irreversible: false,
      },
      evidence: [{ field: 'recipients', toolCallId: 'tc_2', quote: 'desk@hotel.example' }],
    });
    const r = verifyRequestApproval(d, s);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.draft.fields.recipients).toEqual([{ name: 'Desk', address: 'desk@hotel.example', isNew: true, isGroup: false }]);
    expect(r.draft.fields.irreversible).toBe(true);
    expect(r.untrusted).toEqual(['desk@hotel.example']);
    const made = draft({
      verb: 'delete',
      fields: { verb: 'delete', recipients: [{ name: 'X', address: 'x@else.example', isNew: false, isGroup: false }], irreversible: false },
      evidence: [{ field: 'recipients', toolCallId: 'tc_2', quote: 'desk@hotel.example' }],
    });
    expect(verifyRequestApproval(made, s)).toMatchObject({ ok: false, reason: 'APPROVAL_EVIDENCE' });
  });

  it('helpers: amountIn and registrableDomain', () => {
    expect(amountIn('Total ₹1,23,450.50 incl. tax')).toBe(12_345_050);
    expect(amountIn('no money here')).toBeNull();
    expect(registrableDomain('www.book.table.example')).toBe('table.example');
    expect(registrableDomain('shop.example.co.in')).toBe('example.co.in');
  });
});
