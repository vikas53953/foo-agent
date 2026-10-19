// Spec: 08-2 §9.4.2 (fresh terms: price, slot, fee, recipient; any difference from the approved fields), §9.7
// (`liveTermsCheck` → `{ same, diff }`), 08-2 §10.4 (any amount, up or down, J10), M5 map fix 9 (the pure `checkLiveTerms`
// M9's readLiveTerms calls).
import { describe, expect, it } from 'vitest';
import { checkLiveTerms } from '../../../src/engine/gate/liveTerms';
import type { ApprovalFields } from '../../../src/shared/types';

const approved: ApprovalFields = {
  verb: 'book',
  payee: 'Toit',
  siteDomain: 'table.example',
  amountPaise: 240_000,
  when: { start: Date.UTC(2026, 9, 24, 14, 30), tz: 'Asia/Kolkata' },
  partySize: 4,
  recipients: [{ name: 'Asha', address: 'asha@example.com', isNew: false, isGroup: false }],
  cancelTerms: { refundable: false, feePaise: 20_000 },
  irreversible: true,
};

describe('checkLiveTerms (08-2 §9.4.2)', () => {
  it('the same terms read again → same, nothing changed', () => {
    expect(checkLiveTerms(approved, { amountPaise: 240_000, when: approved.when!, payee: 'Toit' })).toEqual({
      same: true,
      changed: [],
      diff: {},
    });
  });

  it('a price up or down → price, with the two amounts', () => {
    const up = checkLiveTerms(approved, { amountPaise: 260_000 });
    expect(up).toEqual({ same: false, changed: ['price'], diff: { price: { from: 240_000, to: 260_000 } } });
    expect(checkLiveTerms(approved, { amountPaise: 230_000 }).changed).toEqual(['price']);
  });

  it('a slot, a fee and a recipient change each name their term, in that order', () => {
    const r = checkLiveTerms(approved, {
      when: { start: Date.UTC(2026, 9, 24, 15, 0), tz: 'Asia/Kolkata' },
      cancelTerms: { refundable: false, feePaise: 30_000 },
      recipients: [{ name: 'Asha', address: 'asha.k@example.com', isNew: true, isGroup: false }],
    });
    expect(r.same).toBe(false);
    expect(r.changed).toEqual(['time', 'recipient', 'fee']);
    expect(r.diff.fee).toEqual({ from: 20_000, to: 30_000 });
    expect(r.diff.recipient).toEqual({ from: 'asha@example.com', to: 'asha.k@example.com' });
  });

  it('a new payee is a recipient change; a term the read could not see is not a change', () => {
    expect(checkLiveTerms(approved, { payee: 'Toit Indiranagar' }).changed).toEqual(['recipient']);
    expect(checkLiveTerms(approved, {})).toEqual({ same: true, changed: [], diff: {} });
  });

  it('recipient addresses compare without case', () => {
    expect(checkLiveTerms(approved, { recipients: [{ name: 'A', address: 'ASHA@example.com', isNew: false, isGroup: false }] }).same).toBe(
      true,
    );
  });
});
