// M5-T6: AT-133 (10-acceptance-1 §B, 07-2 SM-A8): a known-recipient Draft card is an approval card from the moment it is
// made (08-0 §G.7, X-65). Send = approve once (`approved_via='card'`) → the 5 s Undo → the second look → Gmail drafts.send;
// Change = drafts.update (same PENDING approval, re-hashed, new nonce; 08-1 §3.2); Discard = drafts.delete (WITHDRAWN).
// Main's ApprovalGate over the real migrations, a fake clock, and the fake Gmail of CR-0009 G-M5-12.
import { describe, expect, it } from 'vitest';
import { DraftService, type SecondLook } from '../../../src/main/drafts/DraftService';
import type { DraftPayload } from '../../../src/shared/types';
import { fakeGmail, type FakeGmail } from '../../fakes/connectors/gmail';
import { gateHarness, T0, type GateHarness } from '../../unit/approvals/gateHarness';

const TO = { name: 'Priya Example', address: 'priya@example.com' };
const DRAFT = { to: TO, subject: 'Re: October rent', body: 'Hi Priya, I will pay the rent on Tuesday. Thanks.' };

interface World {
  h: GateHarness;
  gmail: FakeGmail;
  drafts: DraftService;
  looks: string[];
}

function world(secondLook?: SecondLook): World {
  const h = gateHarness();
  const gmail = fakeGmail();
  const looks: string[] = [];
  const drafts = new DraftService({
    db: h.db,
    gate: h.gate,
    now: () => h.clock.now,
    gmail: () => gmail,
    changed: (e) => h.changed.push(e),
    secondLook:
      secondLook ??
      ((a) => {
        looks.push(a.id);
        return Promise.resolve({ pass: true });
      }),
  });
  return { h, gmail, drafts, looks };
}

async function made(w: World) {
  const r = await w.drafts.create({ jobId: w.h.jobId, ...DRAFT });
  if (!r.ok) throw new Error(`create refused: ${r.error.kind}`);
  return r.value;
}

const payload = (w: World, cardId: string) => JSON.parse(String(w.h.card(cardId).payload)) as DraftPayload;
const tap = (c: { cardId: string; nonce: string }) => ({ cardId: c.cardId, nonce: c.nonce, resolvedBy: 'tap' as const });

describe('Draft card lifecycle (08-0 §G.7, X-65)', () => {
  it('AT-133 a known-recipient Draft has a PENDING approvals row (60 min) from the moment it is made', async () => {
    const w = world();
    const d = await made(w);
    expect(w.gmail.calls).toEqual(['create']);
    expect(w.h.approval(d.approvalId)).toMatchObject({
      card_id: d.cardId,
      verb: 'send',
      hard_limit: 0,
      state: 'PENDING',
      approved_via: null,
      expires_at: T0 + 60 * 60_000,
    });
    expect(w.h.card(d.cardId)).toMatchObject({ type: 'draft', state: 'pending', expires_at: T0 + 60 * 60_000 });
    expect(payload(w, d.cardId)).toMatchObject({
      approvalId: d.approvalId,
      channel: 'email',
      to: { ...TO, isNew: false },
      subject: DRAFT.subject,
      body: DRAFT.body,
      gmailDraftId: 'gd_1',
      edited: false,
      sendAllowed: true,
    });
  });

  it('AT-133 Send = APPROVED via card → 5 s Undo window → second look → Gmail drafts.send → sent', async () => {
    const w = world();
    const d = await made(w);
    w.h.clock.now = T0 + 120_000;
    const sent = w.drafts.send(tap(d));
    expect(sent).toEqual({ ok: true, value: { approvalId: d.approvalId, undoUntil: T0 + 125_000 } });
    expect(w.h.approval(d.approvalId)).toMatchObject({
      state: 'APPROVED',
      approved_via: 'card',
      scope: 'once',
      approved_at: T0 + 120_000,
      undo_until: T0 + 125_000,
    });
    expect(w.h.card(d.cardId)).toMatchObject({ state: 'undo_window', resolved_by: 'tap' });
    expect(payload(w, d.cardId).undoUntil).toBe(T0 + 125_000);

    // Inside the 5 s nothing goes out.
    w.h.clock.now = T0 + 124_999;
    expect(await w.drafts.tick()).toEqual([]);
    expect(w.gmail.calls).toEqual(['create']);
    expect(w.looks).toEqual([]);

    w.h.clock.now = T0 + 125_000;
    expect(await w.drafts.tick()).toEqual([d.approvalId]);
    expect(w.looks).toEqual([d.approvalId]);
    expect(w.gmail.calls).toEqual(['create', 'send:gd_1']);
    expect(w.gmail.sent.map((s) => s.msg)).toEqual([{ to: TO.address, subject: DRAFT.subject, body: DRAFT.body }]);
    expect(w.h.approval(d.approvalId)).toMatchObject({ state: 'COMPLETED', submitted_at: T0 + 125_000 });
    expect(JSON.parse(String(w.h.approval(d.approvalId).proof))).toEqual({
      kind: 'sent_folder',
      connectionId: w.gmail.connectionId,
      messageId: 'gm_2',
    });
    expect(w.h.card(d.cardId)).toMatchObject({ state: 'sent' });
    expect(payload(w, d.cardId)).toMatchObject({ sentAt: T0 + 125_000, sentMessageId: 'gm_2' });
    const act = w.h.db.prepare('SELECT * FROM activity WHERE approval_id = ?').all(d.approvalId) as Record<string, unknown>[];
    expect(act).toHaveLength(1);
    expect(act[0]).toMatchObject({
      kind: 'sent',
      event: 'sent_email',
      summary: 'Sent an email to Priya Example',
      to_label: 'p***@example.com',
      approved_how: 'card_once',
      proof_kind: 'sent_folder',
      proof_ref: 'gm_2',
      outcome: 'done',
    });
    // Body text never goes to the activity log (05-2 §5.7.4).
    expect(JSON.stringify(act[0])).not.toContain('Tuesday');

    // A later tick sends nothing again.
    w.h.clock.now = T0 + 200_000;
    expect(await w.drafts.tick()).toEqual([]);
    expect(w.gmail.sent).toHaveLength(1);
  });

  it('AT-133 Undo inside the 5 s: back to a fresh PENDING approval (expiry reset to 60 min), "Not sent", nothing sent', async () => {
    const w = world();
    const d = await made(w);
    w.h.clock.now = T0 + 60_000;
    expect(w.drafts.send(tap(d)).ok).toBe(true);
    w.h.clock.now = T0 + 63_000;
    expect(w.drafts.undo({ approvalId: d.approvalId })).toEqual({ ok: true, value: { undone: true } });
    expect(w.h.approval(d.approvalId)).toMatchObject({
      state: 'PENDING',
      approved_at: null,
      approved_via: null,
      scope: null,
      undo_until: null,
      expires_at: T0 + 63_000 + 60 * 60_000,
    });
    const card = w.h.card(d.cardId);
    expect(card).toMatchObject({ state: 'pending', expires_at: T0 + 63_000 + 60 * 60_000, resolved_by: null });
    expect(card.nonce).not.toBe(d.nonce);
    expect(payload(w, d.cardId)).toMatchObject({ undone: true });
    expect(payload(w, d.cardId).undoUntil).toBeUndefined();
    w.h.clock.now = T0 + 70_000;
    expect(await w.drafts.tick()).toEqual([]);
    expect(w.gmail.calls).toEqual(['create']);
    // The old nonce is spent; Send again with the new one starts a new 5 s window.
    expect(w.drafts.send(tap(d))).toEqual({ ok: false, error: { kind: 'CARD_STALE' } });
    expect(w.drafts.send(tap({ cardId: d.cardId, nonce: String(card.nonce) })).ok).toBe(true);
  });

  it('AT-133 Undo after the 5 s is refused (TOO_LATE); the send has already run', async () => {
    const w = world();
    const d = await made(w);
    w.drafts.send(tap(d));
    w.h.clock.now = T0 + 5_000;
    await w.drafts.tick();
    expect(w.drafts.undo({ approvalId: d.approvalId })).toEqual({ ok: false, error: { kind: 'TOO_LATE' } });
    expect(w.h.card(d.cardId)).toMatchObject({ state: 'sent' });
  });

  it('AT-133 Change = Gmail drafts.update; same PENDING approval re-hashed; new nonce; "edited"', async () => {
    const w = world();
    const d = await made(w);
    const before = w.h.approval(d.approvalId);
    const r = await w.drafts.update({ cardId: d.cardId, nonce: d.nonce, fields: { subject: 'Rent', body: 'Hi Priya, paying Tuesday.' } });
    expect(r.ok).toBe(true);
    expect(w.gmail.calls).toEqual(['create', 'update:gd_1']);
    expect(w.gmail.drafts.get('gd_1')).toEqual({ to: TO.address, subject: 'Rent', body: 'Hi Priya, paying Tuesday.' });
    const after = w.h.approval(d.approvalId);
    expect(after).toMatchObject({ id: d.approvalId, state: 'PENDING', expires_at: before.expires_at });
    expect(after.fields_hash).not.toBe(before.fields_hash);
    const card = w.h.card(d.cardId);
    expect(card.state).toBe('pending');
    expect(card.nonce).not.toBe(d.nonce);
    expect(payload(w, d.cardId)).toMatchObject({ subject: 'Rent', body: 'Hi Priya, paying Tuesday.', edited: true });
    // The recipient is not editable in the card (05-2 §5.7.1).
    expect(
      await w.drafts.update({ cardId: d.cardId, nonce: String(card.nonce), fields: { to: 'someone@example.com', body: 'x' } }),
    ).toEqual({ ok: false, error: { kind: 'VALIDATION' } });
  });

  it('AT-133 Discard = Gmail drafts.delete; the approval becomes WITHDRAWN; "Draft discarded"', async () => {
    const w = world();
    const d = await made(w);
    const r = await w.drafts.discard(tap(d));
    expect(r.ok && r.value.state).toBe('discarded');
    expect(w.gmail.calls).toEqual(['create', 'delete:gd_1']);
    expect(w.h.approval(d.approvalId).state).toBe('WITHDRAWN');
    expect(w.h.card(d.cardId)).toMatchObject({ state: 'discarded', resolved_by: 'tap' });
    expect(w.drafts.send(tap(d))).toEqual({ ok: false, error: { kind: 'CARD_STALE' } });
  });

  it('AT-133 moves through the approval states like any approval card: 60 min unanswered → expired, Send refused', async () => {
    const w = world();
    const d = await made(w);
    w.h.clock.now = T0 + 60 * 60_000;
    expect(w.drafts.send(tap(d))).toEqual({ ok: false, error: { kind: 'CARD_EXPIRED' } });
    expect(w.h.gate.expireTick()).toEqual([d.approvalId]);
    expect(w.h.approval(d.approvalId).state).toBe('EXPIRED');
    expect(w.h.card(d.cardId)).toMatchObject({ state: 'expired', resolved_by: 'system' });
    expect(w.gmail.calls).toEqual(['create']);
  });

  it('Ask me again on an expired Draft: a fresh pending Draft card (new approval, 60 min) on the same Gmail draft', async () => {
    const w = world();
    const d = await made(w);
    w.h.clock.now = T0 + 60 * 60_000;
    w.h.gate.expireTick();
    const again = w.drafts.askAgain({ cardId: d.cardId });
    if (!again.ok || !again.value.newCardId) throw new Error('no fresh card');
    const fresh = w.h.card(again.value.newCardId);
    expect(fresh).toMatchObject({ type: 'draft', state: 'pending', supersedes_id: d.cardId });
    const p = payload(w, again.value.newCardId);
    expect(p).toMatchObject({ gmailDraftId: 'gd_1', body: DRAFT.body });
    expect(w.h.approval(p.approvalId)).toMatchObject({ state: 'PENDING', expires_at: T0 + 120 * 60_000 });
    expect(w.h.card(d.cardId).state).toBe('expired');
    expect(w.drafts.askAgain({ cardId: again.value.newCardId })).toEqual({ ok: false, error: { kind: 'CARD_STALE' } });
  });

  it('a stale nonce is refused; a stopped job withdraws the pending Draft (08-2 §5.7)', async () => {
    const w = world();
    const d = await made(w);
    expect(w.drafts.send({ ...tap(d), nonce: '0'.repeat(32) })).toEqual({ ok: false, error: { kind: 'CARD_STALE' } });
    w.h.db.prepare("UPDATE jobs SET state = 'cancelled', stop_reason = 'user_button', finished_at = ? WHERE id = ?").run(T0, w.h.jobId);
    expect(w.h.gate.expireTick()).toEqual([d.approvalId]);
    expect(w.h.card(d.cardId).state).toBe('withdrawn');
  });

  it('Gmail refuses the send: FAILED, the card shows failed, nothing went out', async () => {
    const w = world();
    const d = await made(w);
    w.drafts.send(tap(d));
    w.gmail.failNext('send', 'SEND_FAILED');
    w.h.clock.now = T0 + 5_000;
    await w.drafts.tick();
    expect(w.h.approval(d.approvalId)).toMatchObject({ state: 'FAILED', failure_kind: 'SEND_FAILED' });
    expect(w.h.card(d.cardId).state).toBe('failed');
    expect(w.gmail.sent).toHaveLength(0);
    expect(w.h.db.prepare('SELECT COUNT(*) FROM activity').pluck().get()).toBe(0);
  });

  it('the second look runs after the undo window and before the send; a held look stops the send (T8 fills the port)', async () => {
    const order: string[] = [];
    const w = world(() => {
      order.push('look');
      return Promise.resolve({ pass: false });
    });
    const d = await made(w);
    w.drafts.send(tap(d));
    w.h.clock.now = T0 + 5_000;
    expect(await w.drafts.tick()).toEqual([]);
    expect(order).toEqual(['look']);
    expect(w.gmail.sent).toHaveLength(0);
    // M5 T14: a look that can't say why holds all the same (fail closed, 08-2 §9.6): HELD, cannot_check.
    expect(w.h.approval(d.approvalId)).toMatchObject({ state: 'HELD', undo_until: null });
    expect(payload(w, d.cardId).held).toEqual({ reason: 'cannot_check', verbing: 'sending' });
    // A held look runs once, not every tick.
    w.h.clock.now = T0 + 6_000;
    expect(await w.drafts.tick()).toEqual([]);
    expect(order).toEqual(['look']);
  });

  // M5 T14 (05-2 §5.7.2 HELD, 08-2 §9.6, 08-3 §16.1, SM-A4, G-M5-03, G-M5-39 (b))
  describe('second look on a Draft send (T14)', () => {
    const MONDAY = { reason: 'mismatch' as const, userSaid: 'Monday 19 Oct', actionHas: 'Tuesday 20 Oct' };
    const heldWorld = () => {
      const seen: { content: string; recipients: string[] }[] = [];
      const w = world((_a, out) => {
        seen.push(out);
        return Promise.resolve({
          pass: false,
          held: MONDAY,
          result: { at: T0 + 5_000, deterministic: { ok: true, mismatches: [] }, ai: { ok: false, note: 'date: Monday ≠ Tuesday' } },
        });
      });
      return { w, seen };
    };
    const heldDraft = async (w: World) => {
      const d = await made(w);
      w.drafts.send(tap(d));
      w.h.clock.now = T0 + 5_000;
      await w.drafts.tick();
      return d;
    };

    it('the look reads the card text and the outgoing address; a mismatch holds: HELD, the card stays pending with the held values, nothing sent', async () => {
      const { w, seen } = heldWorld();
      const d = await heldDraft(w);
      expect(seen).toEqual([{ content: `${DRAFT.subject}\n${DRAFT.body}`, recipients: [TO.address] }]);
      expect(w.gmail.sent).toHaveLength(0);
      expect(w.h.approval(d.approvalId)).toMatchObject({ state: 'HELD', undo_until: null, submitted_at: null });
      expect(JSON.parse(String(w.h.approval(d.approvalId).second_look))).toMatchObject({ ai: { ok: false } });
      expect(w.h.card(d.cardId).state).toBe('pending');
      expect(payload(w, d.cardId).held).toEqual(MONDAY);
      // Send / Change / Discard on a held card are stale: only the two values answer it.
      expect(w.drafts.send(tap(d))).toEqual({ ok: false, error: { kind: 'CARD_STALE' } });
    });

    it("picking the draft's value sends it at once, without a second look", async () => {
      const { w, seen } = heldWorld();
      const d = await heldDraft(w);
      const r = w.drafts.heldPick({ ...tap(d), optionId: 'action' });
      expect(r.ok).toBe(true);
      await new Promise((res) => setTimeout(res, 0));
      expect(seen).toHaveLength(1);
      expect(w.gmail.sent).toHaveLength(1);
      expect(w.h.approval(d.approvalId).state).toBe('COMPLETED');
      expect(w.h.card(d.cardId).state).toBe('sent');
      expect(payload(w, d.cardId).held).toBeUndefined();
    });

    it("after the draft's value is picked, a crash before the send leaves it on the tick's list, which sends it without a look", async () => {
      const { w, seen } = heldWorld();
      const d = await heldDraft(w);
      // The in-memory send never runs (a crash): the pick is committed, then main's tick finds it.
      const original = w.h.gate.draftMove.bind(w.h.gate);
      let block = true;
      w.h.gate.draftMove = (id, ev, x) =>
        block && ev === 'submit' ? ((block = false), { ok: false, error: { kind: 'CARD_STALE' } }) : original(id, ev, x);
      expect(w.drafts.heldPick({ ...tap(d), optionId: 'action' }).ok).toBe(true);
      await new Promise((res) => setTimeout(res, 0));
      expect(w.gmail.sent).toHaveLength(0);
      expect(w.h.approval(d.approvalId)).toMatchObject({ state: 'APPROVED', submitted_at: null });
      expect(await w.drafts.tick()).toEqual([d.approvalId]);
      expect(seen).toHaveLength(1);
      expect(w.gmail.sent).toHaveLength(1);
      expect(w.h.card(d.cardId).state).toBe('sent');
    });

    it("picking the user's own value: nothing sent, HELD → DECLINED, the card superseded by a fresh pending Draft on the same Gmail draft", async () => {
      const { w } = heldWorld();
      const d = await heldDraft(w);
      expect(w.drafts.heldPick({ ...tap(d), optionId: 'own' }).ok).toBe(true);
      expect(w.gmail.sent).toHaveLength(0);
      expect(w.h.approval(d.approvalId).state).toBe('DECLINED');
      expect(w.h.card(d.cardId).state).toBe('superseded');
      const fresh = w.h.db.prepare('SELECT id, state, payload FROM cards WHERE supersedes_id = ?').get(d.cardId) as {
        id: string;
        state: string;
        payload: string;
      };
      expect(fresh.state).toBe('pending');
      expect(JSON.parse(fresh.payload)).toMatchObject({ gmailDraftId: 'gd_1', body: DRAFT.body });
      expect(JSON.parse(fresh.payload).held).toBeUndefined();
      expect(w.h.db.prepare('SELECT state FROM approvals WHERE card_id = ?').pluck().get(fresh.id)).toBe('PENDING');
      // Once only.
      expect(w.drafts.heldPick({ ...tap(d), optionId: 'own' })).toEqual({ ok: false, error: { kind: 'CARD_STALE' } });
    });

    it('a pass stores the look on the row and sends', async () => {
      const result = { at: T0 + 5_000, deterministic: { ok: true, mismatches: [] }, ai: { ok: true, note: '' } };
      const w = world(() => Promise.resolve({ pass: true, result }));
      const d = await made(w);
      w.drafts.send(tap(d));
      w.h.clock.now = T0 + 5_000;
      expect(await w.drafts.tick()).toEqual([d.approvalId]);
      expect(JSON.parse(String(w.h.approval(d.approvalId).second_look))).toEqual(result);
    });
  });

  it('a Send that lands while Gmail saves a Change wins: the change is refused and Gmail gets the approved words back', async () => {
    const w = world();
    const d = await made(w);
    const update = w.gmail.update.bind(w.gmail);
    let raced = false;
    w.gmail.update = async (id, msg) => {
      const r = await update(id, msg);
      if (!raced) {
        raced = true;
        expect(w.drafts.send(tap(d)).ok).toBe(true);
      }
      return r;
    };
    const r = await w.drafts.update({ cardId: d.cardId, nonce: d.nonce, fields: { subject: 'Rent', body: 'Changed words.' } });
    expect(r).toEqual({ ok: false, error: { kind: 'CARD_STALE' } });
    expect(w.gmail.drafts.get('gd_1')).toEqual({ to: TO.address, subject: DRAFT.subject, body: DRAFT.body });
    expect(payload(w, d.cardId)).toMatchObject({ body: DRAFT.body, edited: false });
    w.h.clock.now = T0 + 5_000;
    expect(await w.drafts.tick()).toEqual([d.approvalId]);
  });

  it('a Draft the gate refuses to record leaves no Gmail draft behind', async () => {
    const w = world();
    w.h.gate.createDraft = () => ({ ok: false, error: { kind: 'DB_NOT_WRITABLE' } });
    const r = await w.drafts.create({ jobId: w.h.jobId, ...DRAFT });
    expect(r).toEqual({ ok: false, error: { kind: 'DB_NOT_WRITABLE' } });
    expect(w.gmail.calls).toEqual(['create', 'delete:gd_1']);
    expect(w.gmail.drafts.size).toBe(0);
  });

  it('No send permission: Open in Gmail opens the Gmail draft and the card reads opened_in_app; the approval is withdrawn', async () => {
    const w = world();
    const opened: string[] = [];
    const drafts = new DraftService({
      db: w.h.db,
      gate: w.h.gate,
      now: () => w.h.clock.now,
      gmail: () => w.gmail,
      changed: () => undefined,
      secondLook: () => Promise.resolve({ pass: true }),
      // The card is folded before Gmail opens, so a failed open never leaves a live approval behind.
      openExternal: (url) => void opened.push(`${url} ${String(w.h.card(r.value.cardId).state)}`),
    });
    const r = await drafts.create({ jobId: w.h.jobId, ...DRAFT, sendAllowed: false }).then((x) => {
      if (!x.ok) throw new Error('create refused');
      return x;
    });
    expect(drafts.send(tap(r.value))).toEqual({ ok: false, error: { kind: 'CONN_SCOPE_MISSING' } });
    expect(await drafts.openInApp({ cardId: r.value.cardId })).toEqual({ ok: true, value: undefined });
    expect(opened).toEqual(['https://mail.google.com/mail/#drafts opened_in_app']);
    expect(w.h.card(r.value.cardId).state).toBe('opened_in_app');
    expect(w.h.approval(r.value.approvalId).state).toBe('WITHDRAWN');
  });
});
