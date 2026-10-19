// Spec: 08-3 §16.1.4 (Gmail drafts: drafts.create with the card's approvals row, Change = drafts.update with the full message,
// Discard = drafts.delete, Send = drafts.send after the 5 s undo, never messages.send), §16.1 Calls (no retry on drafts.send),
// Signature (the default send-as signature appended below the body and shown on the card), Tokens (403 scope →
// CONN_SCOPE_MISSING); 10-acceptance-1 AT-015 (no compose permission → never "Send email", "Open in Gmail" instead; CR-0012
// G-M8-04: the draft stays in foo and Gmail's compose page opens prefilled), AT-053 (Undo within 5 s → Gmail has no sent
// message), AT-055 (a second email in the same chat still needs its own Send tap, R-13). M8 T6: main's real GmailDrafts port
// over the shared fake Google (HTTP seam), DraftService on main's ApprovalGate with a fake clock. Made-up addresses only.
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../src/shared/clock';
import { googleGmailDrafts, rawMessage } from '../../src/main/drafts/gmailDraftsGoogle';
import { DraftService } from '../../src/main/drafts/DraftService';
import type { DraftPayload } from '../../src/shared/types';
import { draftsState, fakeGmailDrafts, parseRaw } from '../fakes/connectors/gmail';
import { drive, fakeAccess, fakeGoogle, fakeGmailRead, gmailState } from '../fakes/connectors/gmail-read';
import { gateHarness, T0 } from '../unit/approvals/gateHarness';

const TO = { name: 'Rakesh Example', address: 'rakesh@example.com' };

function port() {
  const clock = new FakeClock(T0);
  const mail = gmailState();
  const drafts = draftsState();
  const g = fakeGoogle([fakeGmailDrafts(drafts, mail), fakeGmailRead(mail)], () => clock.now());
  const access = fakeAccess();
  const p = googleGmailDrafts({
    http: g.fetch,
    access: access.access,
    clock,
    connectionId: () => 'cn_gmail',
    base: 'https://gmail.example',
  });
  return { clock, mail, drafts, g, access, p };
}

describe('08-3 §16.1.4 · the real Gmail drafts port', () => {
  it('create / update / send / delete are the four drafts calls, with the full message each time', async () => {
    const x = port();
    const made = await x.p.create({ to: TO.address, subject: 'Re: October rent', body: 'Hi Rakesh,\nTuesday works.' });
    expect(made).toEqual({ ok: true, value: { gmailDraftId: 'r_1', gmailMessageId: 'dm_1', threadId: 't_1' } });
    expect(parseRaw(x.drafts.drafts.get('r_1')!.raw)).toMatchObject({
      to: TO.address,
      subject: 'Re: October rent',
      body: 'Hi Rakesh,\r\nTuesday works.',
    });
    expect(await x.p.update('r_1', { to: TO.address, subject: 'Re: October rent', body: 'Shorter.', threadId: 't_1' })).toEqual({
      ok: true,
      value: undefined,
    });
    expect(parseRaw(x.drafts.drafts.get('r_1')!.raw).body).toBe('Shorter.');
    expect(x.drafts.drafts.get('r_1')!.threadId).toBe('t_1');
    const sent = await x.p.send('r_1');
    expect(sent).toEqual({ ok: true, value: { messageId: 'sm_2' } });
    expect(x.p.connectionId).toBe('cn_gmail');
    // Gmail's Sent folder holds it (the proof), and nothing was sent with messages.send.
    expect(x.mail.messages.find((m) => m.id === 'sm_2')).toMatchObject({ labels: ['SENT'], to: TO.address });
    expect(x.g.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      'POST /gmail/v1/users/me/drafts',
      'PUT /gmail/v1/users/me/drafts/r_1',
      'POST /gmail/v1/users/me/drafts/send',
    ]);
    await x.p.create({ to: TO.address, body: 'two' });
    expect(await x.p.delete('r_3')).toEqual({ ok: true, value: undefined });
    expect(x.drafts.calls).toEqual(['create', 'update:r_1', 'send:r_1', 'create', 'delete:r_3']);
    expect(x.g.requests.every((r) => r.auth === 'Bearer tok_0')).toBe(true);
  });

  it('drafts.send is tried once: a 503 is SEND_FAILED with no second send', async () => {
    const x = port();
    await x.p.create({ to: TO.address, body: 'hello' });
    x.g.failNext('/gmail/v1/users/me/drafts/send', { status: 503, body: { error: { code: 503 } } });
    expect(await drive(x.p.send('r_1'), x.clock)).toEqual({ ok: false, error: { kind: 'SEND_FAILED' } });
    expect(x.drafts.calls).toEqual(['create']);
    expect(x.g.requests.filter((r) => r.path.endsWith('/drafts/send'))).toHaveLength(1);
    expect(x.drafts.sent).toEqual([]);
  });

  it('a missing compose scope (403) flips the granted flag and answers CONN_SCOPE_MISSING', async () => {
    const x = port();
    x.g.failNext('/gmail/v1/users/me/drafts', {
      status: 403,
      body: { error: { code: 403, errors: [{ reason: 'insufficientPermissions' }] } },
    });
    expect(await x.p.create({ to: TO.address, body: 'hi' })).toEqual({ ok: false, error: { kind: 'CONN_SCOPE_MISSING' } });
    expect(x.access.missing).toEqual(['draft']);
  });

  it('Google refusing the refresh token is CONN_EXPIRED', async () => {
    const x = port();
    x.access.refuse = 'CONN_EXPIRED';
    expect(await x.p.create({ to: TO.address, body: 'hi' })).toEqual({ ok: false, error: { kind: 'CONN_EXPIRED' } });
  });

  it('the default send-as signature comes back as plain text, or null when Gmail has none', async () => {
    const x = port();
    x.mail.sendAs = [
      { sendAsEmail: 'other@example.com', isDefault: false, signature: 'Not this one' },
      { sendAsEmail: 'tester@example.com', isDefault: true, signature: '<div>Vikas Example<br>Bengaluru</div>' },
    ];
    expect(await x.p.signature()).toBe('Vikas Example\nBengaluru');
    x.mail.sendAs = [{ sendAsEmail: 'tester@example.com', isDefault: true, signature: '' }];
    expect(await x.p.signature()).toBeNull();
  });

  it('headers never carry a line break from the draft (no header injection)', () => {
    const raw = rawMessage({ to: 'a@example.com\r\nBcc: b@example.com', subject: 'Hi\r\nBcc: c@example.com', body: 'x' });
    const m = parseRaw(raw);
    expect(m.headers.bcc).toBeUndefined();
    expect(m.to).toBe('a@example.comBcc:b@example.com');
    expect(m.subject).toBe('Hi Bcc: c@example.com');
  });

  it('a subject outside ASCII is an RFC 2047 word', () => {
    const m = parseRaw(rawMessage({ to: 'a@example.com', subject: 'Rent ₹14,600', body: 'ok' }));
    expect(m.headers.subject).toMatch(/^=\?UTF-8\?B\?/);
    expect(m.subject).toBe('Rent ₹14,600');
  });
});

// ---- DraftService over the real port (the slices below) ----

function service(over: { granted?: { draft: boolean; send: boolean } } = {}) {
  const x = port();
  const h = gateHarness();
  const looks: string[] = [];
  const opened: string[] = [];
  const drafts = new DraftService({
    db: h.db,
    gate: h.gate,
    now: () => h.clock.now,
    gmail: () => x.p,
    changed: (e) => h.changed.push(e),
    secondLook: (a) => {
      looks.push(a.id);
      return Promise.resolve({ pass: true });
    },
    openExternal: (url) => void opened.push(url),
    signature: () => x.p.signature(),
    granted: () => over.granted ?? { draft: true, send: true },
    email: () => 'tester@example.com',
  });
  const payload = (cardId: string) => JSON.parse(String(h.card(cardId).payload)) as DraftPayload;
  return { ...x, store: x.drafts, h, drafts, looks, opened, payload };
}

const tap = (c: { cardId: string; nonce: string }) => ({ cardId: c.cardId, nonce: c.nonce, resolvedBy: 'tap' as const });

describe('M8 · DraftService on the real Gmail port', () => {
  it('the Gmail signature is appended below the body in Gmail and kept apart on the card', async () => {
    const s = service();
    const d = await s.drafts.create({ jobId: s.h.jobId, to: TO, subject: 'Re: rent', body: 'Hi Rakesh, Tuesday works.' });
    if (!d.ok) throw new Error(d.error.kind);
    expect(s.payload(d.value.cardId)).toMatchObject({
      body: 'Hi Rakesh, Tuesday works.',
      signature: 'Sent from foo tester',
      gmailDraftId: 'r_1',
      gmailMessageId: 'dm_1',
      threadId: 't_1',
      sendAllowed: true,
    });
    expect(parseRaw(s.store.drafts.get('r_1')!.raw).body).toBe('Hi Rakesh, Tuesday works.\r\n\r\nSent from foo tester');
  });
});

describe('AT-015 · no compose permission: the draft stays in foo and "Open in Gmail" replaces "Send email"', () => {
  it('AT-015 no Gmail draft, no Send, the allow_send Connect card once, and Gmail compose opens prefilled', async () => {
    const s = service({ granted: { draft: false, send: false } });
    const d = await s.drafts.create({ jobId: s.h.jobId, to: TO, subject: 'Re: rent', body: 'Tuesday works.' });
    if (!d.ok) throw new Error(d.error.kind);
    expect(s.store.calls).toEqual([]);
    expect(s.payload(d.value.cardId)).toMatchObject({ sendAllowed: false, body: 'Tuesday works.' });
    expect(s.payload(d.value.cardId).gmailDraftId).toBeUndefined();
    // Send is refused: a draft foo cannot send never sends.
    expect(s.drafts.send(tap(d.value))).toEqual({ ok: false, error: { kind: 'CONN_SCOPE_MISSING' } });
    const connect = s.h.db.prepare("SELECT * FROM cards WHERE type = 'connect'").all() as { payload: string; state: string }[];
    expect(connect).toHaveLength(1);
    expect(JSON.parse(connect[0]!.payload)).toEqual({ variant: 'allow_send', app: 'gmail', scopes: ['gmail'] });
    expect(connect[0]!.state).toBe('offered');
    // A second draft in the same chat does not offer it again.
    const d2 = await s.drafts.create({ jobId: s.h.jobId, to: TO, subject: 'Two', body: 'Again.' });
    expect(d2.ok).toBe(true);
    expect(s.h.db.prepare("SELECT COUNT(*) FROM cards WHERE type = 'connect'").pluck().get()).toBe(1);
    // Change keeps working in foo only.
    const changed = await s.drafts.update({
      cardId: d.value.cardId,
      nonce: d.value.nonce,
      fields: { subject: 'Re: rent', body: 'Wednesday.' },
    });
    expect(changed.ok).toBe(true);
    expect(s.store.calls).toEqual([]);
    const nonce = String(s.h.card(d.value.cardId).nonce);
    void nonce;
    expect(await s.drafts.openInApp({ cardId: d.value.cardId })).toEqual({ ok: true, value: undefined });
    expect(s.opened).toEqual([
      'https://mail.google.com/mail/?authuser=tester%40example.com&view=cm&to=rakesh%40example.com&su=Re%3A%20rent&body=Wednesday.',
    ]);
    expect(s.h.card(d.value.cardId)).toMatchObject({ state: 'opened_in_app' });
    expect(s.store.sent).toEqual([]);
  });

  it('with a Gmail draft, Open in Gmail names the draft by its message id (08-3 §16.1.4)', async () => {
    const { gmailUrl } = await import('../../src/main/drafts/DraftService');
    const p = { gmailDraftId: 'r_1', gmailMessageId: 'dm_1', body: 'x' } as DraftPayload;
    expect(gmailUrl(p, 'tester@example.com')).toBe('https://mail.google.com/mail/?authuser=tester%40example.com#drafts/dm_1');
    expect(gmailUrl({ ...p, gmailMessageId: undefined } as DraftPayload, null)).toBe('https://mail.google.com/mail/#drafts');
  });
});

describe('AT-053 / AT-055 · Undo and one tap per email (real Gmail port)', () => {
  it('AT-053 Undo within 5 s: Gmail has no sent message, and the draft is still there', async () => {
    const s = service();
    const d = await s.drafts.create({ jobId: s.h.jobId, to: TO, subject: 'Re: rent', body: 'Tuesday works.' });
    if (!d.ok) throw new Error(d.error.kind);
    const sent = s.drafts.send(tap(d.value));
    if (!sent.ok) throw new Error(sent.error.kind);
    s.h.clock.now += 4_000;
    expect(s.drafts.undo({ approvalId: sent.value.approvalId })).toEqual({ ok: true, value: { undone: true } });
    s.h.clock.now += 10_000;
    expect(await s.drafts.tick()).toEqual([]);
    expect(s.store.sent).toEqual([]);
    expect(s.store.calls).toEqual(['create']);
    expect(s.store.drafts.has('r_1')).toBe(true);
    expect(s.mail.messages.some((m) => m.labels?.includes('SENT'))).toBe(false);
    expect(s.h.card(d.value.cardId)).toMatchObject({ state: 'pending' });
    expect(s.payload(d.value.cardId).undone).toBe(true);
  });

  it('AT-055 a second email to the same person in the same chat still needs its own Send tap (R-13)', async () => {
    const s = service();
    const one = await s.drafts.create({ jobId: s.h.jobId, to: TO, subject: 'One', body: 'First.' });
    if (!one.ok) throw new Error(one.error.kind);
    expect(s.drafts.send(tap(one.value)).ok).toBe(true);
    s.h.clock.now += 5_000;
    expect(await s.drafts.tick()).toEqual([one.value.approvalId]);
    expect(s.store.sent).toHaveLength(1);
    const two = await s.drafts.create({ jobId: s.h.jobId, to: TO, subject: 'Two', body: 'Second.' });
    if (!two.ok) throw new Error(two.error.kind);
    // Minutes pass with no tap: nothing goes out, and the second draft waits PENDING with no rule behind it.
    for (let i = 0; i < 10; i++) {
      s.h.clock.now += 60_000;
      expect(await s.drafts.tick()).toEqual([]);
    }
    expect(s.store.sent).toHaveLength(1);
    expect(s.h.approval(two.value.approvalId)).toMatchObject({ state: 'PENDING', approved_via: null });
    expect(s.h.db.prepare("SELECT COUNT(*) FROM approvals WHERE approved_via = 'rule'").pluck().get()).toBe(0);
  });
});

describe('05-2 §5.7.2 · someone new: Send opens the full Approval card, with no 5 s undo', () => {
  it('the draft waits "Waiting for your OK below"; the full card has no scope chips; its tap sends once', async () => {
    const s = service();
    const NEW = { name: 'Priya New', address: 'priya.new@example.com' };
    const d = await s.drafts.create({ jobId: s.h.jobId, to: NEW, subject: 'Goa dates', body: 'Hi Priya, 12 to 14 Dec?', isNew: true });
    if (!d.ok) throw new Error(d.error.kind);
    expect(s.h.approval(d.value.approvalId)).toMatchObject({ hard_limit: 1, state: 'PENDING' });
    expect(s.payload(d.value.cardId).to).toEqual({ ...NEW, isNew: true });
    const r = s.drafts.send(tap(d.value));
    if (!r.ok) throw new Error(r.error.kind);
    // No undo window: the draft's own approval is untouched, and nothing was sent.
    expect(s.h.approval(d.value.approvalId)).toMatchObject({ state: 'PENDING', undo_until: null });
    const full = s.h.db.prepare("SELECT * FROM cards WHERE type = 'approval'").get() as { id: string; payload: string; state: string };
    const fp = JSON.parse(full.payload) as Record<string, unknown>;
    expect(fp).toMatchObject({
      verb: 'send',
      title: 'Send this email to Priya New?',
      impact: 'Will send to priya.new@example.com from your Gmail. You haven’t emailed them before. Can’t be unsent.',
      hardLimit: true,
      // "Just this once" only: the scope control is not drawn (05-2 §5.5.1, AT-052 "no scope chips").
      scopes: ['once'],
    });
    expect(s.payload(d.value.cardId).approvalCardId).toBe(full.id);
    // A second Send names the same card.
    expect((s.drafts.send(tap(d.value)) as { value: { approvalId: string } }).value.approvalId).toBe(r.value.approvalId);
    expect(s.h.db.prepare("SELECT COUNT(*) FROM cards WHERE type = 'approval'").pluck().get()).toBe(1);
    // Approve the full card (main's gate), then the draft goes out now.
    const nonce = String((s.h.db.prepare('SELECT nonce FROM cards WHERE id = ?').get(full.id) as { nonce: string }).nonce);
    expect(s.h.gate.approve({ cardId: full.id, nonce, scope: 'once', resolvedBy: 'tap' }).ok).toBe(true);
    expect(await s.drafts.fullApproved(r.value.approvalId, 'tap')).toBe(true);
    expect(s.store.sent).toHaveLength(1);
    expect(s.looks).toEqual([d.value.approvalId]);
    expect(s.h.card(d.value.cardId)).toMatchObject({ state: 'sent' });
    expect(s.h.approval(d.value.approvalId)).toMatchObject({ state: 'COMPLETED', approved_via: 'card' });
    expect(s.h.approval(r.value.approvalId)).toMatchObject({ state: 'COMPLETED' });
    expect(JSON.parse(String(s.h.approval(r.value.approvalId).proof))).toMatchObject({ kind: 'sent_folder', messageId: 'sm_2' });
  });

  it('"Not now" on the full card leaves the draft pending, with nothing sent', async () => {
    const s = service();
    const d = await s.drafts.create({ jobId: s.h.jobId, to: TO, subject: 'Hi', body: 'Hello.', isNew: true });
    if (!d.ok) throw new Error(d.error.kind);
    const r = s.drafts.send(tap(d.value));
    if (!r.ok) throw new Error(r.error.kind);
    const full = s.h.db.prepare("SELECT id, nonce FROM cards WHERE type = 'approval'").get() as { id: string; nonce: string };
    expect(s.h.gate.decline({ cardId: full.id, nonce: full.nonce, resolvedBy: 'tap' }).ok).toBe(true);
    s.drafts.fullDeclined(r.value.approvalId);
    expect(s.payload(d.value.cardId).approvalCardId).toBeUndefined();
    expect(s.h.card(d.value.cardId)).toMatchObject({ state: 'pending' });
    expect(await s.drafts.fullApproved(r.value.approvalId, 'tap')).toBe(false);
    expect(s.store.sent).toEqual([]);
  });
});

describe('05-2 §5.7.2 · Offline at Send', () => {
  it('Send offline is NET_OFFLINE with nothing moved; "Yes, send when online" queues it; back online it sends after the 5 s undo', async () => {
    const s = service();
    let online = false;
    const drafts = new DraftService({
      db: s.h.db,
      gate: s.h.gate,
      now: () => s.h.clock.now,
      gmail: () => s.p,
      changed: () => undefined,
      secondLook: () => Promise.resolve({ pass: true }),
      online: () => online,
    });
    const d = await drafts.create({ jobId: s.h.jobId, to: TO, subject: 'Hi', body: 'Hello.' });
    if (!d.ok) throw new Error(d.error.kind);
    expect(drafts.send(tap(d.value))).toEqual({ ok: false, error: { kind: 'NET_OFFLINE' } });
    expect(s.h.approval(d.value.approvalId)).toMatchObject({ state: 'PENDING' });
    const q = drafts.queueOffline(tap(d.value));
    expect(q.ok && q.value.state).toBe('queued_offline');
    expect(s.h.approval(d.value.approvalId)).toMatchObject({ state: 'APPROVED', approved_via: 'card', undo_until: null });
    s.h.clock.now += 60_000;
    expect(await drafts.tick()).toEqual([]);
    online = true;
    expect(drafts.resumeQueued()).toEqual([d.value.approvalId]);
    expect(s.h.card(d.value.cardId)).toMatchObject({ state: 'undo_window' });
    s.h.clock.now += 5_000;
    expect(await drafts.tick()).toEqual([d.value.approvalId]);
    expect(s.store.sent).toHaveLength(1);
  });

  it('Cancel on a queued draft takes it back to a pending draft', async () => {
    const s = service();
    const drafts = new DraftService({
      db: s.h.db,
      gate: s.h.gate,
      now: () => s.h.clock.now,
      gmail: () => s.p,
      changed: () => undefined,
      secondLook: () => Promise.resolve({ pass: true }),
      online: () => false,
    });
    const d = await drafts.create({ jobId: s.h.jobId, to: TO, subject: 'Hi', body: 'Hello.' });
    if (!d.ok) throw new Error(d.error.kind);
    expect(drafts.queueOffline(tap(d.value)).ok).toBe(true);
    expect(drafts.undo({ approvalId: d.value.approvalId })).toEqual({ ok: true, value: { undone: true } });
    expect(s.h.card(d.value.cardId)).toMatchObject({ state: 'pending' });
    expect(s.payload(d.value.cardId).undone).toBe(false);
    expect(drafts.resumeQueued()).toEqual([]);
  });
});
