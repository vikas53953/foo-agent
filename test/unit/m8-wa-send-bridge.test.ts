// M8 T7: the wa-bridge's send side (08-1 §2.4.2 `wa.send { jid; text; draftCardId }`, `wa.onWhatsApp { jids }` →
// `wa.onWhatsApp.result { results: { jid; exists }[] }`, `wa.ack { waMessageId; level }`, send errors as
// `wa.error { kind: 'SEND_FAILED' }`; 08-3 §16.4 proof: delivery ack ≥ 2 → `wa_delivered`). The socket is a fake; the
// FOO_TEST fake phone records what it was asked to send. Fake numbers only.
import { describe, expect, it } from 'vitest';
import { BridgeCore, type WaSocketEvents } from '../../src/wa-bridge/core';
import { FAKE_WA, FakePhone } from '../../src/wa-bridge/fakeSocket';
import { bridgeToEngineSchema, engineToBridgeSchema, waMessageId, waSendKeyId, type BridgeToEngine } from '../../src/shared/waBridge';
import { FakeClock, TEST_EPOCH_MS } from '../../src/shared/clock';

const ME = '919876543210@s.whatsapp.net';
const MOM = '919800000011@s.whatsapp.net';

function rig(opts: { sendFails?: boolean } = {}) {
  const clock = new FakeClock(TEST_EPOCH_MS);
  const out: BridgeToEngine[] = [];
  let events: WaSocketEvents | null = null;
  const sent: { jid: string; text: string; keyId: string }[] = [];
  const core = new BridgeCore({
    clock,
    send: (m) => out.push(bridgeToEngineSchema.parse(m)),
    socket: async ({ events: ev }) => {
      events = ev;
      return {
        logout: async () => undefined,
        end: () => undefined,
        sendText: async (jid, text, keyId) => {
          if (opts.sendFails) throw new Error('socket closed');
          sent.push({ jid, text, keyId });
        },
        onWhatsApp: async (jids) => jids.map((jid) => ({ jid, exists: jid !== '919800000099@s.whatsapp.net' })),
      };
    },
  });
  const cmd = async (kind: string, payload: unknown = {}) => core.handle(engineToBridgeSchema.parse({ id: 'x', kind, payload }));
  const open = async () => {
    await cmd('wa.session', { bytes: new Uint8Array([1]) });
    events!.open({ jid: ME });
  };
  return { clock, out, core, cmd, open, sent, ev: () => events!, of: (k: string) => out.filter((m) => m.kind === k) };
}

describe('08-1 §2.4.2 · wa.send on an open socket', () => {
  it('sends the text with a key id made from the draft card, and answers ack level 1 (the server has it)', async () => {
    const r = rig();
    await r.open();
    await r.cmd('wa.send', { jid: MOM, text: 'Reached safely', draftCardId: 'k_01' });
    expect(r.sent).toEqual([{ jid: MOM, text: 'Reached safely', keyId: waSendKeyId('k_01') }]);
    expect(r.of('wa.ack').map((m) => m.payload)).toEqual([{ waMessageId: waMessageId(MOM, waSendKeyId('k_01')), level: 1 }]);
    expect(r.of('wa.error')).toEqual([]);
  });

  it('later acks from the phone go on as wa.ack with their level (2 = delivered)', async () => {
    const r = rig();
    await r.open();
    r.ev().acks([{ chatJid: MOM, keyId: 'ABC', level: 2 }]);
    expect(r.of('wa.ack').map((m) => m.payload)).toEqual([{ waMessageId: waMessageId(MOM, 'ABC'), level: 2 }]);
  });

  it('a socket that throws is SEND_FAILED, and no ack is made up', async () => {
    const r = rig({ sendFails: true });
    await r.open();
    await r.cmd('wa.send', { jid: MOM, text: 'hi', draftCardId: 'k_02' });
    expect(r.of('wa.error').map((m) => m.payload)).toEqual([{ kind: 'SEND_FAILED' }]);
    expect(r.of('wa.ack')).toEqual([]);
  });

  it('no open socket (still connecting, closed, or never linked) is SEND_FAILED without trying', async () => {
    const r = rig();
    await r.cmd('wa.send', { jid: MOM, text: 'hi', draftCardId: 'k_03' });
    await r.cmd('wa.session', { bytes: new Uint8Array([1]) });
    await r.cmd('wa.send', { jid: MOM, text: 'hi', draftCardId: 'k_04' });
    expect(r.sent).toEqual([]);
    expect(r.of('wa.error')).toHaveLength(2);
  });
});

describe('08-1 §2.4.2 · wa.onWhatsApp', () => {
  it('answers exists per jid while open', async () => {
    const r = rig();
    await r.open();
    await r.cmd('wa.onWhatsApp', { jids: [MOM, '919800000099@s.whatsapp.net'] });
    expect(r.of('wa.onWhatsApp.result').map((m) => m.payload)).toEqual([
      {
        results: [
          { jid: MOM, exists: true },
          { jid: '919800000099@s.whatsapp.net', exists: false },
        ],
      },
    ]);
  });

  it('says nothing while the socket is not open (the engine reads that as "can\'t check")', async () => {
    const r = rig();
    await r.cmd('wa.onWhatsApp', { jids: [MOM] });
    expect(r.of('wa.onWhatsApp.result')).toEqual([]);
  });
});

describe('FOO_TEST fake phone', () => {
  it('records each outbound message and answers delivered (ack 2) for it', async () => {
    const clock = new FakeClock(TEST_EPOCH_MS);
    const phone = new FakePhone(clock);
    const out: BridgeToEngine[] = [];
    const core = new BridgeCore({ clock, send: (m) => out.push(bridgeToEngineSchema.parse(m)), socket: phone.factory });
    await core.handle(engineToBridgeSchema.parse({ id: '1', kind: 'wa.session', payload: { bytes: new Uint8Array([1]) } }));
    await Promise.resolve();
    await core.handle(engineToBridgeSchema.parse({ id: '2', kind: 'wa.send', payload: { jid: MOM, text: 'hello', draftCardId: 'k_9' } }));
    await new Promise((res) => setTimeout(res, 0));
    expect(phone.outbound).toEqual([{ jid: MOM, text: 'hello', keyId: waSendKeyId('k_9') }]);
    expect(out.filter((m) => m.kind === 'wa.ack').map((m) => (m.payload as { level: number }).level)).toEqual([1, 2]);
    await core.handle(engineToBridgeSchema.parse({ id: '3', kind: 'wa.onWhatsApp', payload: { jids: [FAKE_WA.notOnWhatsApp, MOM] } }));
    expect(out.at(-1)).toMatchObject({
      kind: 'wa.onWhatsApp.result',
      payload: {
        results: [
          { jid: FAKE_WA.notOnWhatsApp, exists: false },
          { jid: MOM, exists: true },
        ],
      },
    });
  });
});
