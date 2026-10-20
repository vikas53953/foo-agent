// Spec: 10-acceptance-1 AT-018 (WhatsApp linked → foo never sends a WhatsApp message without a Draft card and a Send tap),
// AT-070 (a group: never without a full Approval card and a tap); 08-3 §16.4 Send (the Draft card's approvals row, approve
// once, 5 s undo, second look; groups and someone new: the full Approval card "Send this message to {name}?" with no undo;
// ≤ 30 sends a day: Send off with the daily-limit line until local midnight; proof: delivery ack ≥ 2 → `wa_delivered`),
// §16.4.2 ("That number isn't on WhatsApp." → no Send; "I can't check that number right now." → Send off until the bridge
// is open again), 05-2 §5.5.2 (Send WhatsApp, new number or group), §5.7.4 (Activity `sent_whatsapp`, recipient masked).
// M8 T7: main's DraftService on main's ApprovalGate with a fake clock and a fake engine WhatsApp port. Fake numbers only.
import { describe, expect, it } from 'vitest';
import { DraftService, UNDO_MS, type WaSendPort } from '../../src/main/drafts/DraftService';
import { localMidnight } from '../../src/main/drafts/channels';
import { fail, ok } from '../../src/shared/errors';
import type { DraftPayload } from '../../src/shared/types';
import { gateHarness } from '../unit/approvals/gateHarness';

const MOM = { jid: '919800000011@s.whatsapp.net', name: 'Mom', label: '+91 98••• ••011' };
const FAMILY = { jid: '120363000000000001@g.us', name: 'Building society' };
const TZ = 'Asia/Kolkata';

function service() {
  const h = gateHarness();
  const sends: { jid: string; text: string; draftCardId: string }[] = [];
  const checks: string[] = [];
  const port: WaSendPort & { failNext: boolean; checkAnswer: boolean | null } = {
    failNext: false,
    checkAnswer: true as boolean | null,
    send: async (req: { jid: string; text: string; draftCardId: string }) => {
      if (port.failNext) {
        port.failNext = false;
        return fail<{ waMessageId: string }>('SEND_FAILED');
      }
      sends.push(req);
      return ok({ waMessageId: `wa_${req.jid}:FOO${sends.length}` });
    },
    check: async (jid: string) => {
      checks.push(jid);
      return port.checkAnswer;
    },
  } satisfies WaSendPort & { failNext: boolean; checkAnswer: boolean | null };
  let wired: WaSendPort | null = port;
  const drafts = new DraftService({
    db: h.db,
    gate: h.gate,
    now: () => h.clock.now,
    gmail: () => null,
    changed: (e) => h.changed.push(e),
    secondLook: () => Promise.resolve({ pass: true }),
    whatsapp: () => wired,
    timeZone: () => TZ,
  });
  const payload = (cardId: string) => JSON.parse(String(h.card(cardId).payload)) as DraftPayload;
  const make = async (over: Partial<Parameters<DraftService['create']>[0]> = {}) => {
    const d = await drafts.create({
      jobId: h.jobId,
      channel: 'whatsapp',
      to: { name: MOM.name, address: MOM.label },
      waJid: MOM.jid,
      body: 'Reached safely, will call at 8.',
      ...over,
    });
    if (!d.ok) throw new Error(d.error.kind);
    return d.value;
  };
  const sendTap = (c: { cardId: string; nonce: string }) => drafts.send({ cardId: c.cardId, nonce: c.nonce, resolvedBy: 'tap' });
  const passWindow = async () => {
    h.clock.now += UNDO_MS;
    await drafts.tick();
  };
  return { h, drafts, sends, checks, port, payload, make, sendTap, passWindow, unwire: () => (wired = null) };
}

describe('AT-018 · a WhatsApp message goes out only after the Draft card and a Send tap', () => {
  it('AT-018 the draft alone sends nothing; Send opens the 5 s undo; only after it the one send, ✓ Sent, then Proof: Delivered', async () => {
    const s = service();
    const d = await s.make();
    expect(s.payload(d.cardId)).toMatchObject({ channel: 'whatsapp', to: { name: 'Mom', address: MOM.label }, waJid: MOM.jid });
    // Time alone never sends a draft (60 min, then expired, nothing sent).
    s.h.clock.now += 59 * 60_000;
    await s.drafts.tick();
    expect(s.sends).toEqual([]);
    const tapped = s.sendTap(d);
    expect(tapped.ok).toBe(true);
    expect(s.h.card(d.cardId).state).toBe('undo_window');
    await s.drafts.tick();
    expect(s.sends).toEqual([]);
    await s.passWindow();
    expect(s.sends).toEqual([{ jid: MOM.jid, text: 'Reached safely, will call at 8.', draftCardId: d.cardId }]);
    expect(s.h.card(d.cardId).state).toBe('sent');
    const sent = s.payload(d.cardId);
    expect(sent.sentMessageId).toBe(`wa_${MOM.jid}:FOO1`);
    expect(sent.delivered).toBeUndefined();
    expect(s.h.approval(d.approvalId)).toMatchObject({ state: 'COMPLETED', approved_via: 'card' });
    const act = s.h.db.prepare("SELECT * FROM activity WHERE event = 'sent_whatsapp'").all() as Record<string, unknown>[];
    expect(act).toHaveLength(1);
    expect(act[0]).toMatchObject({
      kind: 'sent',
      summary: 'Sent a WhatsApp message to Mom',
      to_label: MOM.label,
      approved_how: 'card_once',
    });
    // The message text never goes to the activity log.
    expect(JSON.stringify(act[0])).not.toContain('Reached safely');
    expect(s.drafts.waDelivered(`wa_${MOM.jid}:FOO1`)).toBe(true);
    expect(s.payload(d.cardId).delivered).toBe(true);
    expect(JSON.parse(String(s.h.approval(d.approvalId).proof))).toEqual({ kind: 'wa_delivered', waMessageId: `wa_${MOM.jid}:FOO1` });
    // A second delivered ack changes nothing.
    expect(s.drafts.waDelivered(`wa_${MOM.jid}:FOO1`)).toBe(false);
  });

  it('AT-018 Undo inside the 5 s leaves nothing sent, and a second message needs its own tap', async () => {
    const s = service();
    const a = await s.make();
    const tapped = s.sendTap(a);
    if (!tapped.ok) throw new Error(tapped.error.kind);
    expect(s.drafts.undo({ approvalId: tapped.value.approvalId })).toEqual({ ok: true, value: { undone: true } });
    await s.passWindow();
    expect(s.sends).toEqual([]);
    const b = await s.make({ body: 'Second one' });
    await s.passWindow();
    expect(s.sends).toEqual([]);
    expect(s.h.card(b.cardId).state).toBe('pending');
  });

  it('AT-018 a send the bridge refused is Failed; nothing is retried by itself, and Try again is a fresh draft', async () => {
    const s = service();
    const d = await s.make();
    s.port.failNext = true;
    s.sendTap(d);
    await s.passWindow();
    expect(s.h.card(d.cardId).state).toBe('failed');
    await s.passWindow();
    expect(s.sends).toEqual([]);
    const again = s.drafts.askAgain({ cardId: d.cardId });
    if (!again.ok) throw new Error(again.error.kind);
    expect(s.h.card(again.value.newCardId!).state).toBe('pending');
    expect(s.sends).toEqual([]);
  });

  it('no engine (no WhatsApp port) fails the send closed: Failed, never a silent send later', async () => {
    const s = service();
    s.unwire();
    const d = await s.make();
    s.sendTap(d);
    await s.passWindow();
    expect(s.h.card(d.cardId).state).toBe('failed');
  });
});

describe('AT-070 · a group (or someone new) needs the full Approval card and its tap', () => {
  it('AT-070 Send on a group draft opens "Send this message to {group}?"; only that tap sends, with no 5 s undo', async () => {
    const s = service();
    const d = await s.make({ to: { name: FAMILY.name, address: FAMILY.name }, waJid: FAMILY.jid, isGroup: true });
    const tapped = s.sendTap(d);
    if (!tapped.ok) throw new Error(tapped.error.kind);
    const p = s.payload(d.cardId);
    expect(p.approvalCardId).toBeDefined();
    expect(s.h.card(d.cardId).state).toBe('pending');
    const full = JSON.parse(String(s.h.card(p.approvalCardId!).payload)) as { title: string; impact: string };
    expect(full.title).toBe('Send this message to Building society?');
    expect(full.impact).toBe('Will send to Building society from your WhatsApp. Can’t be unsent.');
    // Waiting on the full card sends nothing, however long.
    await s.passWindow();
    expect(s.sends).toEqual([]);
    // The user approves the full card (card:approve moves it; the Draft service follows).
    const fullApproval = s.h.gate.byCard(p.approvalCardId!)!;
    expect(
      s.h.gate.approve({ cardId: p.approvalCardId!, nonce: String(s.h.card(p.approvalCardId!).nonce), scope: 'once', resolvedBy: 'tap' })
        .ok,
    ).toBe(true);
    expect(await s.drafts.fullApproved(fullApproval.id, 'tap')).toBe(true);
    expect(s.sends.map((x) => x.jid)).toEqual([FAMILY.jid]);
    expect(s.h.card(d.cardId).state).toBe('sent');
    expect(s.h.gate.get(fullApproval.id)!.state).toBe('COMPLETED');
  });

  it('AT-070 "Not now" on the full card sends nothing and gives the draft back', async () => {
    const s = service();
    const d = await s.make({ to: { name: FAMILY.name, address: FAMILY.name }, waJid: FAMILY.jid, isGroup: true });
    s.sendTap(d);
    const fullCard = s.payload(d.cardId).approvalCardId!;
    const full = s.h.gate.byCard(fullCard)!;
    expect(s.h.gate.decline({ cardId: fullCard, nonce: String(s.h.card(fullCard).nonce), resolvedBy: 'tap' }).ok).toBe(true);
    s.drafts.fullDeclined(full.id);
    await s.passWindow();
    expect(s.sends).toEqual([]);
    expect(s.payload(d.cardId).approvalCardId).toBeUndefined();
  });

  it('someone new (no chat in a year, not in contacts) is a hard-limit draft too', async () => {
    const s = service();
    const d = await s.make({ isNew: true });
    s.sendTap(d);
    expect(s.payload(d.cardId).approvalCardId).toBeDefined();
    await s.passWindow();
    expect(s.sends).toEqual([]);
  });
});

describe('08-3 §16.4 · limits and the number check', () => {
  it('at 30 sends since local midnight Send stays off with the limit line, until the next local midnight', async () => {
    const s = service();
    // 11:50 PM: the draft is still in its 60 min when the day turns.
    s.h.clock.now = localMidnight(s.h.clock.now, TZ, 1) - 10 * 60_000;
    const insert = s.h.db.prepare(
      "INSERT INTO activity (id, at, kind, event, actor, summary, outcome) VALUES (?, ?, 'sent', 'sent_whatsapp', 'foo', 'x', 'done')",
    );
    for (let i = 0; i < 30; i++) insert.run(`act_${i}`, s.h.clock.now - i * 60_000);
    // One from yesterday does not count.
    insert.run('act_old', localMidnight(s.h.clock.now, TZ) - 1);
    const d = await s.make();
    const midnight = localMidnight(s.h.clock.now, TZ, 1);
    expect(s.payload(d.cardId).waLimitUntil).toBe(midnight);
    expect(s.sendTap(d)).toEqual({ ok: false, error: { kind: 'VALIDATION' } });
    expect(s.h.card(d.cardId).state).toBe('pending');
    s.h.clock.now = midnight;
    await s.drafts.tick();
    expect(s.payload(d.cardId).waLimitUntil).toBeUndefined();
    // The next day's count starts at 0.
    expect(s.sendTap({ ...d, nonce: String(s.h.card(d.cardId).nonce) }).ok).toBe(true);
  });

  it('29 sends today still lets the 30th go', async () => {
    const s = service();
    const insert = s.h.db.prepare(
      "INSERT INTO activity (id, at, kind, event, actor, summary, outcome) VALUES (?, ?, 'sent', 'sent_whatsapp', 'foo', 'x', 'done')",
    );
    for (let i = 0; i < 29; i++) insert.run(`act_${i}`, s.h.clock.now - i * 1000);
    const d = await s.make();
    expect(s.payload(d.cardId).waLimitUntil).toBeUndefined();
    expect(s.sendTap(d).ok).toBe(true);
  });

  it('"That number isn\'t on WhatsApp." has no Send; "I can\'t check that number right now." until the bridge is open again', async () => {
    const s = service();
    const notOn = await s.make({ waCheck: 'not_on' });
    expect(s.sendTap(notOn)).toEqual({ ok: false, error: { kind: 'VALIDATION' } });
    const cant = await s.make({ waCheck: 'cant_check' });
    expect(s.sendTap(cant)).toEqual({ ok: false, error: { kind: 'VALIDATION' } });
    s.port.checkAnswer = null;
    await s.drafts.waOpen();
    expect(s.payload(cant.cardId).waCheck).toBe('cant_check');
    s.port.checkAnswer = true;
    await s.drafts.waOpen();
    expect(s.payload(cant.cardId).waCheck).toBeUndefined();
    expect(s.checks).toEqual([MOM.jid, MOM.jid]);
    const fresh = s.h.card(cant.cardId);
    expect(s.sendTap({ cardId: cant.cardId, nonce: String(fresh.nonce) }).ok).toBe(true);
  });
});
