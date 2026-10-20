// Spec: ART-09 (10-2 §D, Article 9 "Fresh yes before switching how"): inside an approved booking, a switch to email and a new person
// each need a new Approval card before anything goes out. M8 T6: the email and new-person switches through main's
// DraftService (05-2 §5.7.2: Send opens the full Approval card §5.5 under the draft, no 5 s undo). A new site is the browser's
// switch (M9 browser rung, X-125 `rungOf`); it is not built yet and is left to that ticket (M8 decision log). Made-up only.
import { describe, expect, it } from 'vitest';
import { drive } from '../fakes/connectors/gmail-read';
import { TO, service, tap } from '../integration/m8-drafts-harness';

describe('ART-09 · a fresh yes before switching how', () => {
  function bookedJob() {
    const s = service();
    // The booking the user approved earlier in this job (main's gate wrote it; the switch reads it from the table).
    const book = s.h.open({ verb: 'book' });
    expect(s.h.gate.approve({ cardId: book.cardId, nonce: book.nonce, scope: 'once', resolvedBy: 'tap' }).ok).toBe(true);
    return s;
  }
  const fullCards = (s: ReturnType<typeof service>) =>
    (s.h.db.prepare("SELECT payload FROM cards WHERE type = 'approval'").all() as { payload: string }[])
      .map((c) => JSON.parse(c.payload) as { verb: string; title: string; hardLimit: boolean })
      .filter((p) => p.verb === 'send' || p.verb === 'switch');

  it('ART-09 inside an approved booking, a switch to email and a new person each open a new Approval card first', async () => {
    const s = bookedJob();
    // Switch to email: the restaurant's known address, inside the booked job.
    const mail = await s.drafts.create({ jobId: s.h.jobId, to: TO, subject: 'Table for 4', body: 'Can you hold it?' });
    if (!mail.ok) throw new Error(mail.error.kind);
    const r1 = s.drafts.send(tap(mail.value));
    if (!r1.ok) throw new Error(r1.error.kind);
    // No 5 s undo and no send: the full card is the only way on.
    expect(s.h.card(mail.value.cardId)).toMatchObject({ state: 'pending' });
    s.h.clock.now += 10_000;
    expect(await s.drafts.tick()).toEqual([]);
    expect(fullCards(s)).toEqual([expect.objectContaining({ verb: 'switch', title: 'Send email instead?', hardLimit: true })]);

    // A new person: someone the user has never emailed.
    const fresh = await s.drafts.create({
      jobId: s.h.jobId,
      to: { name: 'Priya New', address: 'priya.new@example.com' },
      subject: 'Dinner',
      body: 'Joining us?',
      isNew: true,
    });
    if (!fresh.ok) throw new Error(fresh.error.kind);
    expect(s.drafts.send(tap(fresh.value)).ok).toBe(true);
    expect(fullCards(s)).toHaveLength(2);
    expect(fullCards(s)[1]).toMatchObject({ title: 'Send this email to Priya New?', hardLimit: true });
    expect(s.store.sent).toEqual([]);
  });

  it('ART-09 the switch card’s tap sends the email and logs switched_route beside sent_email', async () => {
    const s = bookedJob();
    const mail = await drive(s.drafts.create({ jobId: s.h.jobId, to: TO, subject: 'Table for 4', body: 'Can you hold it?' }), s.clock);
    if (!mail.ok) throw new Error(mail.error.kind);
    const r = s.drafts.send(tap(mail.value));
    if (!r.ok) throw new Error(r.error.kind);
    const full = s.h.db
      .prepare("SELECT id, nonce FROM cards WHERE type = 'approval' AND json_extract(payload, '$.verb') = 'switch'")
      .get() as {
      id: string;
      nonce: string;
    };
    expect(s.h.gate.approve({ cardId: full.id, nonce: full.nonce, scope: 'once', resolvedBy: 'tap' }).ok).toBe(true);
    expect(await drive(s.drafts.fullApproved(r.value.approvalId, 'tap'), s.clock)).toBe(true);
    expect(s.store.sent).toHaveLength(1);
    const events = s.h.db.prepare('SELECT event FROM activity ORDER BY at, event').pluck().all();
    expect(events).toEqual(expect.arrayContaining(['sent_email', 'switched_route']));
    // main hands every approved card to DraftService; one that is no Draft's (the booking) is left alone.
    const book = s.h.db.prepare("SELECT id FROM approvals WHERE verb = 'book'").pluck().get() as string;
    expect(await s.drafts.fullApproved(book, 'tap')).toBe(false);
    expect(s.h.approval(book)).toMatchObject({ state: 'APPROVED' });
  });

  it('ART-09 a booking that already went through is not a switch: a later email to a known person is a plain Draft', async () => {
    const s = bookedJob();
    s.h.db.prepare("UPDATE approvals SET state = 'COMPLETED' WHERE verb = 'book'").run();
    const mail = await s.drafts.create({ jobId: s.h.jobId, to: TO, subject: 'Running late', body: 'Ten minutes.' });
    if (!mail.ok) throw new Error(mail.error.kind);
    expect(s.drafts.send(tap(mail.value)).ok).toBe(true);
    expect(s.h.card(mail.value.cardId)).toMatchObject({ state: 'undo_window' });
    expect(fullCards(s)).toEqual([]);
  });

  it('ART-09 without an approved booking, an email to a known person is not a switch (Send and its 5 s undo)', async () => {
    const s = service();
    const mail = await s.drafts.create({ jobId: s.h.jobId, to: TO, subject: 'Hi', body: 'Hello.' });
    if (!mail.ok) throw new Error(mail.error.kind);
    expect(s.drafts.send(tap(mail.value)).ok).toBe(true);
    expect(s.h.card(mail.value.cardId)).toMatchObject({ state: 'undo_window' });
    expect(fullCards(s)).toEqual([]);
  });
});
