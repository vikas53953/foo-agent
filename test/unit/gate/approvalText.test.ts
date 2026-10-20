// Spec: 05-2 §5.5.2 (Approval card title and impact per kind, from the verified ApprovalFields only; the booking line
// "Pizza by the Bay, Marine Drive · Sun 18 Oct, 8:00 PM · 4 people"), 08-4 §28.1 item 7, F10 dates.
import { describe, expect, it } from 'vitest';
import { approvalText } from '../../../src/engine/gate/approvalText';

const o = { timeZone: 'Asia/Kolkata', now: Date.parse('2026-10-16T09:41:00+05:30') };

describe('approvalText (05-2 §5.5.2)', () => {
  it('book: place · when · party, with what nothing verified left out', () => {
    const when = { start: Date.parse('2026-10-18T20:00:00+05:30'), tz: 'Asia/Kolkata' };
    expect(approvalText({ verb: 'book', payee: 'Toit', partySize: 4, when, irreversible: false }, o)).toEqual({
      title: 'Book this table?',
      impact: 'Toit · Sun 18 Oct, 8:00 PM · 4 people',
    });
    expect(approvalText({ verb: 'book', payee: 'Toit', partySize: 4, irreversible: false }, o).impact).toBe('Toit · 4 people');
    expect(approvalText({ verb: 'book', item: 'Room for 2 nights', irreversible: false }, o)).toEqual({
      title: 'Book this stay?',
      impact: 'Room for 2 nights',
    });
  });

  it('delete: the thing and "permanent" impact; a cancel with terms reads the free window and the fee', () => {
    expect(approvalText({ verb: 'delete', item: 'Old receipts folder', irreversible: true }, o).title).toContain('Old receipts folder');
    const cancel = approvalText(
      {
        verb: 'delete',
        item: 'table',
        payee: 'Toit',
        cancelTerms: { refundable: true, freeUntil: Date.parse('2026-10-17T18:00:00+05:30'), feePaise: 100_000 },
        irreversible: true,
      },
      o,
    );
    expect(cancel.impact).toContain('₹1,000');
    expect(cancel.impact).toContain('Sat 17 Oct, 6:00 PM');
  });
});
