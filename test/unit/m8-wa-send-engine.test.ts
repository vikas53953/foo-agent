// M8 T7: the engine's WhatsApp send queue (08-3 §16.4 Send: ≥ 3 s between sends, the engine's FIFO queue, never shown as
// an error; bridge send errors arrive as `wa.error { kind: 'SEND_FAILED' }`; proof: delivery ack ≥ 2 → `wa_delivered`) and the
// number check (§16.4.2: `wa.onWhatsApp`; a bridge that is not `open` → "I can't check that number right now."), against a
// fake bridge port. Fake numbers only.
import { beforeEach, describe, expect, it } from 'vitest';
import { WhatsAppConnector } from '../../src/engine/tools/connectors/whatsapp';
import type { MainLink } from '../../src/engine/protocol';
import { FakeClock, TEST_EPOCH_MS } from '../../src/shared/clock';
import { ok } from '../../src/shared/errors';
import { settingsDefaults } from '../../src/shared/settingsDefaults';
import { waMessageId, waSendKeyId } from '../../src/shared/waBridge';
import { FakeWaBridgePort } from '../fakes/connectors/whatsapp-bridge';

const MOM = '919800000011@s.whatsapp.net';
const DAD = '919800000012@s.whatsapp.net';

let clock: FakeClock;
let port: FakeWaBridgePort;
let wa: WhatsAppConnector;
let sent: { kind: string; payload: Record<string, unknown> }[];

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};
const sends = () => port.received.filter((m) => m.kind === 'wa.send').map((m) => m.payload as { jid: string; draftCardId: string });
const reports = () => sent.filter((s) => s.kind === 'wa.report').map((s) => s.payload);
const idOf = (jid: string, card: string) => waMessageId(jid, waSendKeyId(card));

beforeEach(async () => {
  clock = new FakeClock(TEST_EPOCH_MS);
  port = new FakeWaBridgePort();
  sent = [];
  const link: MainLink = {
    request: async <T>() => ok({ bytes: null }) as never as T,
    send: (kind, payload) => void sent.push({ kind, payload: payload as Record<string, unknown> }),
  } as MainLink;
  wa = new WhatsAppConnector({ link, clock, settings: () => structuredClone(settingsDefaults) });
  await wa.attach(port);
  port.emit('wa.state', { state: 'open' });
  await flush();
});

describe('08-3 §16.4 Send · the engine queue', () => {
  it('one send goes to the bridge and answers its message id once the server acks it', async () => {
    const r = wa.send({ jid: MOM, text: 'Reached safely', draftCardId: 'k_1' });
    await flush();
    expect(sends()).toEqual([{ jid: MOM, text: 'Reached safely', draftCardId: 'k_1' }]);
    port.emit('wa.ack', { waMessageId: idOf(MOM, 'k_1'), level: 1 });
    expect(await r).toEqual({ ok: true, value: { waMessageId: idOf(MOM, 'k_1') } });
  });

  it('keeps at least 3 s between two sends (FIFO), so the second waits instead of failing', async () => {
    const a = wa.send({ jid: MOM, text: 'one', draftCardId: 'k_1' });
    const b = wa.send({ jid: DAD, text: 'two', draftCardId: 'k_2' });
    await flush();
    port.emit('wa.ack', { waMessageId: idOf(MOM, 'k_1'), level: 1 });
    expect((await a).ok).toBe(true);
    await flush();
    expect(sends().map((s) => s.draftCardId)).toEqual(['k_1']);
    clock.advance(2_999);
    await flush();
    expect(sends().map((s) => s.draftCardId)).toEqual(['k_1']);
    clock.advance(1);
    await flush();
    expect(sends().map((s) => s.draftCardId)).toEqual(['k_1', 'k_2']);
    port.emit('wa.ack', { waMessageId: idOf(DAD, 'k_2'), level: 1 });
    expect(await b).toEqual({ ok: true, value: { waMessageId: idOf(DAD, 'k_2') } });
  });

  it('a bridge SEND_FAILED fails that send, and the queue goes on to the next', async () => {
    const a = wa.send({ jid: MOM, text: 'one', draftCardId: 'k_1' });
    const b = wa.send({ jid: DAD, text: 'two', draftCardId: 'k_2' });
    await flush();
    port.emit('wa.error', { kind: 'SEND_FAILED' });
    expect(await a).toEqual({ ok: false, error: { kind: 'SEND_FAILED' } });
    clock.advance(3_000);
    await flush();
    expect(sends().map((s) => s.draftCardId)).toEqual(['k_1', 'k_2']);
    port.emit('wa.ack', { waMessageId: idOf(DAD, 'k_2'), level: 1 });
    expect((await b).ok).toBe(true);
  });

  it('a bridge that is not open fails at once, before anything is posted', async () => {
    port.emit('wa.state', { state: 'closed' });
    await flush();
    expect(await wa.send({ jid: MOM, text: 'one', draftCardId: 'k_1' })).toEqual({ ok: false, error: { kind: 'SEND_FAILED' } });
    expect(sends()).toEqual([]);
  });

  it('no answer from the bridge in 30 s is SEND_FAILED (the card says nothing went out only if the bridge said so: logged)', async () => {
    const a = wa.send({ jid: MOM, text: 'one', draftCardId: 'k_1' });
    await flush();
    clock.advance(30_000);
    expect(await a).toEqual({ ok: false, error: { kind: 'SEND_FAILED' } });
  });

  it('a delivery ack (level ≥ 2) is reported to main as delivered; level 1 alone is not', async () => {
    port.emit('wa.ack', { waMessageId: idOf(MOM, 'k_1'), level: 1 });
    port.emit('wa.ack', { waMessageId: idOf(MOM, 'k_1'), level: 2 });
    port.emit('wa.ack', { waMessageId: idOf(MOM, 'k_1'), level: 3 });
    await flush();
    expect(reports().filter((r) => r.event === 'delivered')).toEqual([{ event: 'delivered', waMessageId: idOf(MOM, 'k_1') }]);
  });
});

describe('08-3 §16.4.2 · the number check', () => {
  it('asks wa.onWhatsApp and answers true / false', async () => {
    const yes = wa.check(MOM);
    await flush();
    expect(port.received.at(-1)).toMatchObject({ kind: 'wa.onWhatsApp', payload: { jids: [MOM] } });
    port.emit('wa.onWhatsApp.result', { results: [{ jid: MOM, exists: true }] });
    expect(await yes).toBe(true);
    const no = wa.check(DAD);
    await flush();
    port.emit('wa.onWhatsApp.result', { results: [{ jid: DAD, exists: false }] });
    expect(await no).toBe(false);
  });

  it('a bridge that is not open, or no answer in 10 s, is null ("I can\'t check that number right now.")', async () => {
    const late = wa.check(MOM);
    await flush();
    clock.advance(10_000);
    expect(await late).toBeNull();
    port.emit('wa.state', { state: 'connecting' });
    await flush();
    expect(await wa.check(MOM)).toBeNull();
  });

  it('reports the bridge opening again, so main can re-check drafts it could not check', async () => {
    port.emit('wa.state', { state: 'closed' });
    port.emit('wa.state', { state: 'open' });
    await flush();
    expect(reports().filter((r) => r.event === 'open')).toHaveLength(2);
  });
});

