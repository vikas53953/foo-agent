// M8 T3: the wa-bridge's protocol side (08-1 §2.4.2) on a fake socket. Expected values come from 08-3 §16.4: QR codes
// carry expiresAt = linkStartAt + 60_000 (§16.4.4); text only, media as "[photo]"; sender_label = wa_contacts.name ??
// pushName ?? masked number ("+91 98••• ••210"), "You" when from_me (X-129); row id 'wa_' + chat_jid + ':' + key.id.
// No real WhatsApp account is used anywhere: the socket is a fake.
import { describe, expect, it } from 'vitest';
import { BridgeCore, type WaSocketEvents } from '../../src/wa-bridge/core';
import { bridgeToEngineSchema, engineToBridgeSchema, maskWaNumber, type BridgeToEngine } from '../../src/shared/waBridge';
import { FakeClock, TEST_EPOCH_MS } from '../../src/shared/clock';

const ME = '919876543210@s.whatsapp.net';
const FAMILY = '120363000000000001@g.us';

function rig() {
  const clock = new FakeClock(TEST_EPOCH_MS);
  const out: BridgeToEngine[] = [];
  let events: WaSocketEvents | null = null;
  const opened: (Uint8Array | null)[] = [];
  const calls: string[] = [];
  const core = new BridgeCore({
    clock,
    send: (m) => out.push(bridgeToEngineSchema.parse(m)),
    socket: async ({ session, events: ev }) => {
      opened.push(session);
      events = ev;
      return {
        logout: async () => void calls.push('logout'),
        end: () => void calls.push('end'),
      };
    },
  });
  const cmd = async (kind: string, payload: unknown = {}) => core.handle(engineToBridgeSchema.parse({ id: 'x', kind, payload }));
  return { clock, out, core, cmd, opened, calls, ev: () => events!, kinds: () => out.map((m) => m.kind) };
}

describe('wa-bridge protocol (08-1 §2.4.2)', () => {
  it('rejects a send: this bridge has no send path (T7 adds it)', () => {
    expect(engineToBridgeSchema.safeParse({ id: '1', kind: 'wa.send', payload: { jid: ME, text: 'hi', draftCardId: 'k_1' } }).success).toBe(
      false,
    );
  });

  it('round-trips every T3 message through zod', () => {
    const msgs = [
      { id: '1', kind: 'wa.qr', payload: { qr: 'abc', expiresAt: 1 } },
      { id: '2', kind: 'wa.linked', payload: { jidMasked: '+91 98••• ••210', accountHash: 'h' } },
      { id: '3', kind: 'wa.state', payload: { state: 'open' } },
      { id: '4', kind: 'wa.creds', payload: { bytes: new Uint8Array([1, 2]) } },
      { id: '5', kind: 'wa.error', payload: { kind: 'WA_UNLINKED' } },
      { id: '6', kind: 'wa.contacts', payload: { contacts: [{ jid: FAMILY, name: 'Family' }] } },
    ];
    for (const m of msgs) expect(bridgeToEngineSchema.parse(m)).toEqual(m);
    expect(bridgeToEngineSchema.safeParse({ id: '7', kind: 'wa.qr', payload: { qr: '', expiresAt: 1 } }).success).toBe(false);
  });

  it('masks a number the way 06-2 §6.8 draws it', () => {
    expect(maskWaNumber(ME)).toBe('+91 98••• ••210');
    expect(maskWaNumber('919876543210:12@s.whatsapp.net')).toBe('+91 98••• ••210');
  });
});

describe('BridgeCore', () => {
  it('sends every QR of one attempt with expiresAt = linkStartAt + 60 s (§16.4.4)', async () => {
    const r = rig();
    await r.cmd('wa.linkStart');
    expect(r.opened).toEqual([null]);
    r.ev().qr('code-1');
    r.clock.advance(20_000);
    r.ev().qr('code-2');
    const qrs = r.out.filter((m) => m.kind === 'wa.qr').map((m) => m.payload);
    expect(qrs).toEqual([
      { qr: 'code-1', expiresAt: TEST_EPOCH_MS + 60_000 },
      { qr: 'code-2', expiresAt: TEST_EPOCH_MS + 60_000 },
    ]);
  });

  it('linkCancel closes the socket and later codes are not forwarded', async () => {
    const r = rig();
    await r.cmd('wa.linkStart');
    await r.cmd('wa.linkCancel');
    r.ev().qr('late');
    expect(r.calls).toContain('end');
    expect(r.kinds()).not.toContain('wa.qr');
  });

  it('on a scan reports linked with the masked number and a hash, never the number itself', async () => {
    const r = rig();
    await r.cmd('wa.linkStart');
    r.ev().open({ jid: ME });
    const linked = r.out.find((m) => m.kind === 'wa.linked');
    expect(linked?.payload).toMatchObject({ jidMasked: '+91 98••• ••210' });
    expect(JSON.stringify(r.out)).not.toContain('9876543210');
    expect(r.out.at(-1)?.payload).toEqual({ state: 'open' });
  });

  it('a saved session reconnects without a QR and without a second linked event', async () => {
    const r = rig();
    await r.cmd('wa.session', { bytes: new Uint8Array([7]) });
    expect(r.opened).toEqual([new Uint8Array([7])]);
    r.ev().open({ jid: ME });
    expect(r.out.map((m) => (m.kind === 'wa.state' ? m.payload.state : m.kind))).toEqual(['connecting', 'open']);
  });

  it('maps messages: text only, media as [photo], the sender label ladder, "You" for own messages', async () => {
    const r = rig();
    await r.cmd('wa.linkStart');
    r.ev().open({ jid: ME });
    r.ev().contacts([{ jid: '919800000001@s.whatsapp.net', name: 'Mom' }]);
    const base = { chatJid: FAMILY, starred: false, mentionsMe: false, at: TEST_EPOCH_MS };
    r.ev().messages([
      {
        ...base,
        keyId: 'A1',
        fromMe: false,
        participant: '919800000001@s.whatsapp.net',
        pushName: 'Mummy',
        text: 'Dinner at 8',
        media: false,
      },
      { ...base, keyId: 'A2', fromMe: false, participant: '919800000002@s.whatsapp.net', pushName: 'Ravi', text: undefined, media: true },
      { ...base, keyId: 'A3', fromMe: false, participant: '919800000003@s.whatsapp.net', text: 'ok', media: false },
      { ...base, keyId: 'A4', fromMe: true, participant: ME, pushName: 'Vik', text: 'coming', media: false },
      { ...base, keyId: 'A5', fromMe: false, participant: '919800000003@s.whatsapp.net', text: '', media: false },
    ]);
    const rows = r.out.filter((m) => m.kind === 'wa.message').map((m) => m.payload);
    expect(rows.map((x) => [x.id, x.senderLabel, x.text])).toEqual([
      [`wa_${FAMILY}:A1`, 'Mom', 'Dinner at 8'],
      [`wa_${FAMILY}:A2`, 'Ravi', '[photo]'],
      [`wa_${FAMILY}:A3`, '+91 98••• ••003', 'ok'],
      [`wa_${FAMILY}:A4`, 'You', 'coming'],
    ]);
    expect(rows[3]!.fromMe).toBe(true);
  });

  it('the phone removing foo reports logged_out and WA_UNLINKED (J19.6); a plain drop does not', async () => {
    const r = rig();
    await r.cmd('wa.session', { bytes: new Uint8Array([1]) });
    r.ev().open({ jid: ME });
    r.ev().close({ loggedOut: false });
    expect(r.kinds()).not.toContain('wa.error');
    r.ev().close({ loggedOut: true });
    expect(r.out.slice(-2).map((m) => m.payload)).toEqual([{ state: 'logged_out' }, { kind: 'WA_UNLINKED' }]);
  });

  it('a transient drop reconnects with the saved session after a back-off', async () => {
    const r = rig();
    await r.cmd('wa.session', { bytes: new Uint8Array([1]) });
    r.ev().creds(new Uint8Array([2]));
    r.ev().close({ loggedOut: false });
    expect(r.opened).toHaveLength(1);
    r.clock.advance(5_000);
    await Promise.resolve();
    expect(r.opened).toEqual([new Uint8Array([1]), new Uint8Array([2])]);
  });

  it('unlink logs the device out and reports no WA_UNLINKED error (the user asked for it)', async () => {
    const r = rig();
    await r.cmd('wa.session', { bytes: new Uint8Array([1]) });
    r.ev().open({ jid: ME });
    await r.cmd('wa.unlink');
    r.ev().close({ loggedOut: true });
    expect(r.calls).toContain('logout');
    expect(r.kinds()).not.toContain('wa.error');
  });

  it('forwards creds and contacts', async () => {
    const r = rig();
    await r.cmd('wa.linkStart');
    r.ev().creds(new Uint8Array([9]));
    r.ev().contacts([{ jid: FAMILY, name: 'Family group' }]);
    expect(r.out.find((m) => m.kind === 'wa.creds')?.payload).toEqual({ bytes: new Uint8Array([9]) });
    expect(r.out.find((m) => m.kind === 'wa.contacts')?.payload).toEqual({ contacts: [{ jid: FAMILY, name: 'Family group' }] });
  });
});
