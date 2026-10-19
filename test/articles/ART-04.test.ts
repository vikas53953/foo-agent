// ART-04a (10-2 §D, Article 4): every Activity row with kind='sent' (`sent_email`) has a Draft card and an `approvals` row
// created before it (08-0 §G.4, §G.7). ART-04b: approve email 1, then email 2 to the same person in the same chat waits for
// its own tap (AT-055). M8 T6: main's DraftService over the real Gmail port and the fake Google; Gmail calls run under the
// port's fake clock (5 requests/s), so each is driven on it. Made-up addresses only.
import { describe, expect, it } from 'vitest';
import { drive } from '../fakes/connectors/gmail-read';
import { TO, service, tap } from '../integration/m8-drafts-harness';

describe('ART-04 · nothing goes out without its own Draft card and approval', () => {
  it('ART-04a every sent_email row has a Draft card id and an approvals row made before it', async () => {
    const s = service();
    // A known person (Send + the 5 s undo) and someone new (the full Approval card) both write a sent row.
    const known = await drive(s.drafts.create({ jobId: s.h.jobId, to: TO, subject: 'One', body: 'First.' }), s.clock);
    if (!known.ok) throw new Error(known.error.kind);
    expect(s.drafts.send(tap(known.value)).ok).toBe(true);
    s.h.clock.now += 5_000;
    await drive(s.drafts.tick(), s.clock);
    const fresh = await drive(
      s.drafts.create({
        jobId: s.h.jobId,
        to: { name: 'Priya New', address: 'priya.new@example.com' },
        subject: 'Two',
        body: 'Second.',
        isNew: true,
      }),
      s.clock,
    );
    if (!fresh.ok) throw new Error(fresh.error.kind);
    s.h.clock.now += 2_000; // the user reads the draft
    const r = s.drafts.send(tap(fresh.value));
    if (!r.ok) throw new Error(r.error.kind);
    const full = s.h.db.prepare("SELECT id, nonce FROM cards WHERE type = 'approval'").get() as { id: string; nonce: string };
    expect(s.h.gate.approve({ cardId: full.id, nonce: full.nonce, scope: 'once', resolvedBy: 'tap' }).ok).toBe(true);
    expect(await drive(s.drafts.fullApproved(r.value.approvalId, 'tap'), s.clock)).toBe(true);

    const rows = s.h.db
      .prepare(
        `SELECT a.at, a.event, p.created_at AS approved_row_at, c.type AS card_type
           FROM activity a
           LEFT JOIN approvals p ON p.id = a.approval_id
           LEFT JOIN cards c ON c.id = p.card_id
          WHERE a.kind = 'sent'`,
      )
      .all() as { at: number; event: string; approved_row_at: number | null; card_type: string | null }[];
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.event).toBe('sent_email');
      expect(row.card_type).toBe('draft');
      expect(row.approved_row_at).not.toBeNull();
      expect(row.approved_row_at!).toBeLessThan(row.at);
    }
    expect(s.store.sent).toHaveLength(2);
  });

  it('ART-04b approve email 1, then email 2 to the same person in the same chat waits for its own tap', async () => {
    const s = service();
    const one = await drive(s.drafts.create({ jobId: s.h.jobId, to: TO, subject: 'One', body: 'First.' }), s.clock);
    if (!one.ok) throw new Error(one.error.kind);
    expect(s.drafts.send(tap(one.value)).ok).toBe(true);
    s.h.clock.now += 5_000;
    expect(await drive(s.drafts.tick(), s.clock)).toEqual([one.value.approvalId]);
    const two = await drive(s.drafts.create({ jobId: s.h.jobId, to: TO, subject: 'Two', body: 'Second.' }), s.clock);
    if (!two.ok) throw new Error(two.error.kind);
    s.h.clock.now += 30 * 60_000;
    expect(await drive(s.drafts.tick(), s.clock)).toEqual([]);
    expect(s.h.approval(two.value.approvalId)).toMatchObject({ state: 'PENDING', approved_via: null });
    expect(s.store.sent).toHaveLength(1);
    // Its own tap sends it.
    expect(s.drafts.send(tap(two.value)).ok).toBe(true);
    s.h.clock.now += 5_000;
    expect(await drive(s.drafts.tick(), s.clock)).toEqual([two.value.approvalId]);
    expect(s.store.sent).toHaveLength(2);
  });
});
