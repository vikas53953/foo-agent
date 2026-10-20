// AT-074 (re-learn part; 10-acceptance-1 §B, 08-3 §12.1, §12.6): a forgotten fact's hash + origin kind is tombstoned for 90
// days; the same fact from the same kind of source is not learned again until the tombstone expires. The prompt part
// (never in parts 5/5b) is T4's m6-prompt-forgotten test.
import { describe, expect, it } from 'vitest';
import type { LearnOp } from '../../src/engine/memory/MemoryService';
import { DAY, storeHarness } from './m6-store-harness';

const FROM_EMAIL: LearnOp = {
  text: 'Flies IndiGo to Goa',
  provenance: 'guessed',
  reason: 'from 2 bookings',
  originKind: 'gmail',
  origin: 'gmail:msg-1',
  category: 'travel',
  kind: 'fact',
  scope: 'global',
  private: false,
};

describe('AT-074 tombstones block re-learning', () => {
  it('AT-074: the same email re-yields nothing for 90 days: blocked at +89 d, learned again at +91 d', async () => {
    const h = storeHarness();
    const first = await h.svc.learn(FROM_EMAIL);
    expect(first.ok).toBe(true);
    const factId = (first as { value: { factId: string } }).value.factId;
    expect((await h.svc.cmd({ cmd: 'forget', factId })).ok).toBe(true);

    h.clock.advance(89 * DAY);
    // Spacing and case do not make it a new fact (CR-0010 G-M6-15 normalisation).
    expect(await h.svc.learn({ ...FROM_EMAIL, text: '  flies  IndiGo to goa ' })).toEqual({ ok: true, value: { skipped: 'tombstone' } });
    expect(h.rows()).toEqual([]);
    expect(h.read('memory/about-you.md')).toBe('# About you\n');

    h.clock.advance(2 * DAY);
    const again = await h.svc.learn(FROM_EMAIL);
    expect(again.ok && 'factId' in again.value).toBe(true);
    expect(h.rows()).toMatchObject([{ text: 'Flies IndiGo to Goa', origin: 'gmail:msg-1', origin_kind: 'gmail', provenance: 'guessed' }]);
  });

  it('AT-074: the tombstone is per origin kind: the same words said in chat are still learned', async () => {
    const h = storeHarness();
    const first = await h.svc.learn(FROM_EMAIL);
    await h.svc.cmd({ cmd: 'forget', factId: (first as { value: { factId: string } }).value.factId });
    const said = await h.svc.learn({ ...FROM_EMAIL, provenance: 'said', originKind: 'chat', origin: 'chat:c_1/m_1' });
    expect(said.ok && 'factId' in said.value).toBe(true);
  });

  it('AT-074: a sensitive guess is dropped and logged, never saved (§12.4.1)', async () => {
    const h = storeHarness();
    expect(await h.svc.learn({ ...FROM_EMAIL, text: 'Salary is ₹90,000' })).toEqual({ ok: true, value: { skipped: 'sensitive' } });
    expect(h.logs).toContain('memory.dropped_sensitive');
    expect(h.rows()).toEqual([]);
  });
});
