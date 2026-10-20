// M8 T3: the engine's WhatsApp connector (08-3 §16.4, §16.4.4) against a fake bridge port. Expected values from the spec:
// the QR goes to the renderer as `whatsapp:qr { png, expiresAt }` with expiresAt = linkStartAt + 60_000 and a 200 px PNG;
// 60 s with no scan → linkCancel; the third failed link → WA_LINK_FAILED (status disconnected); ingest writes wa_messages
// through db.tx; `connections.whatsapp.read=false` and `hiddenJids` stop ingest; each wa.creds goes to vault.encrypt.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PNG } from 'pngjs';
import { WhatsAppConnector } from '../../src/engine/tools/connectors/whatsapp';
import type { DbOp, MainLink } from '../../src/engine/protocol';
import { FakeClock, TEST_EPOCH_MS } from '../../src/shared/clock';
import { ok } from '../../src/shared/errors';
import { settingsDefaults } from '../../src/shared/settingsDefaults';
import type { Settings } from '../../src/shared/settings';
import { FakeWaBridgePort } from '../fakes/connectors/whatsapp-bridge';

const FAMILY = '120363000000000001@g.us';

let clock: FakeClock;
let settings: Settings;
let port: FakeWaBridgePort;
let wa: WhatsAppConnector;
let requests: { kind: string; payload: unknown }[];
let sent: { kind: string; payload: Record<string, unknown> }[];
let session: Uint8Array | null;

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 50));
};
const txOps = () => requests.filter((r) => r.kind === 'db.tx').flatMap((r) => (r.payload as { ops: DbOp[] }).ops);
const reports = () => sent.filter((s) => s.kind === 'wa.report').map((s) => s.payload);
const qrPatches = () =>
  sent
    .filter((s) => s.kind === 'ui.patch' && s.payload.event === 'whatsapp:qr')
    .map((s) => s.payload.payload as { png: string; expiresAt: number });

beforeEach(() => {
  clock = new FakeClock(TEST_EPOCH_MS);
  settings = structuredClone(settingsDefaults);
  port = new FakeWaBridgePort();
  requests = [];
  sent = [];
  session = null;
  const link: MainLink = {
    request: async <T>(kind: string, payload: unknown) => {
      requests.push({ kind, payload });
      if (kind === 'vault.decrypt') return ok({ bytes: session }) as never as T;
      return ok({ ids: [], revs: [] }) as never as T;
    },
    send: (kind, payload) => void sent.push({ kind, payload: payload as Record<string, unknown> }),
  } as MainLink;
  wa = new WhatsAppConnector({ link, clock, settings: () => settings });
});

describe('link and QR (08-3 §16.4.4)', () => {
  it('waits for the port, then starts the link and reports connecting', async () => {
    wa.command('linkStart');
    expect(port.received).toEqual([]);
    await wa.attach(port);
    expect(port.started).toBe(true);
    expect(port.kinds()).toEqual(['wa.session', 'wa.linkStart']);
    expect(reports()).toContainEqual({ event: 'status', status: 'connecting', errorKind: null });
  });

  it('a saved session is handed to the bridge on attach (vault.decrypt)', async () => {
    session = new Uint8Array([4, 2]);
    await wa.attach(port);
    expect(requests[0]).toEqual({ kind: 'vault.decrypt', payload: { blobRef: 'wa-session' } });
    expect(port.received[0]).toMatchObject({ kind: 'wa.session', payload: { bytes: new Uint8Array([4, 2]) } });
  });

  it('renders each code as a 200 px PNG data URL with the attempt expiry', async () => {
    await wa.attach(port);
    wa.command('linkStart');
    port.emit('wa.qr', { qr: 'code-1', expiresAt: TEST_EPOCH_MS + 60_000 });
    // Drawing the PNG takes real time, more than flush's 50 ms on a loaded runner.
    await vi.waitFor(() => expect(qrPatches()).toHaveLength(1), { timeout: 5_000 });
    const [p] = qrPatches();
    expect(p?.expiresAt).toBe(TEST_EPOCH_MS + 60_000);
    expect(p?.png.startsWith('data:image/png;base64,')).toBe(true);
    const img = PNG.sync.read(Buffer.from(p!.png.split(',')[1]!, 'base64'));
    expect([img.width, img.height]).toEqual([200, 200]);
  });

  it('60 s with no scan cancels the link; the third failure is WA_LINK_FAILED', async () => {
    await wa.attach(port);
    for (let i = 1; i <= 3; i++) {
      wa.command('linkStart');
      clock.advance(59_999);
      expect(port.kinds().at(-1)).toBe('wa.linkStart');
      clock.advance(1);
      expect(port.kinds().at(-1)).toBe('wa.linkCancel');
    }
    const ends = reports().filter((r) => r.status === 'disconnected');
    expect(ends.map((r) => r.errorKind)).toEqual([null, null, 'WA_LINK_FAILED']);
  });

  it('a scan stops the expiry and reports the linked account', async () => {
    await wa.attach(port);
    wa.command('linkStart');
    port.emit('wa.linked', { jidMasked: '+91 98••• ••210', accountHash: 'abc' });
    clock.advance(120_000);
    expect(port.kinds()).not.toContain('wa.linkCancel');
    expect(reports()).toContainEqual({ event: 'linked', accountLabel: '+91 98••• ••210', accountHash: 'abc' });
  });

  it('every creds update goes to vault.encrypt', async () => {
    await wa.attach(port);
    port.emit('wa.creds', { bytes: new Uint8Array([1, 2, 3]) });
    await flush();
    expect(requests).toContainEqual({ kind: 'vault.encrypt', payload: { blobRef: 'wa-session', bytes: new Uint8Array([1, 2, 3]) } });
  });

  it('the phone unlinking foo reports unlinked + WA_UNLINKED; the user unlinking does not', async () => {
    await wa.attach(port);
    port.emit('wa.error', { kind: 'WA_UNLINKED' });
    expect(reports().at(-1)).toEqual({ event: 'status', status: 'unlinked', errorKind: 'WA_UNLINKED' });
    wa.command('unlink');
    expect(port.kinds().at(-1)).toBe('wa.unlink');
  });

  it('never posts a send to the bridge', async () => {
    await wa.attach(port);
    wa.command('linkStart');
    port.emit('wa.message', msg('X1'));
    await flush();
    expect(port.refused).toEqual([]);
    expect(port.kinds().some((k) => k.includes('send'))).toBe(false);
  });
});

const msg = (keyId: string, chatJid = FAMILY) => ({
  id: `wa_${chatJid}:${keyId}`,
  chatJid,
  fromMe: false,
  senderLabel: 'Mom',
  text: 'Dinner at 8',
  at: TEST_EPOCH_MS,
  starred: false,
  mentionsMe: false,
});

describe('ingest (08-3 §16.4, §16.4.3)', () => {
  beforeEach(async () => {
    await wa.attach(port);
  });

  it('writes each message as a wa_messages insert with the spec id', async () => {
    port.emit('wa.message', msg('A1'));
    await flush();
    expect(txOps()).toEqual([
      {
        op: 'insert',
        table: 'wa_messages',
        row: {
          id: `wa_${FAMILY}:A1`,
          chat_jid: FAMILY,
          from_me: 0,
          sender_label: 'Mom',
          text: 'Dinner at 8',
          at: TEST_EPOCH_MS,
          starred: 0,
          mentions_me: 0,
        },
        redact: ['text'],
      },
    ]);
  });

  it('stores contacts and reports the groups for their mirrors', async () => {
    port.emit('wa.contacts', {
      contacts: [
        { jid: FAMILY, name: 'Family group' },
        { jid: '919800000001@s.whatsapp.net', name: 'Mom', phone: '+919800000001' },
      ],
    });
    await flush();
    expect(txOps().map((o) => (o.op === 'insert' ? [o.table, o.row.jid] : o.op))).toEqual([
      ['wa_contacts', FAMILY],
      ['wa_contacts', '919800000001@s.whatsapp.net'],
    ]);
    expect(reports().at(-1)).toEqual({ event: 'groups', groups: [{ jid: FAMILY, title: 'Family group' }] });
  });

  it('read=false stops ingest of messages and contacts', async () => {
    settings.connections.whatsapp.read = false;
    port.emit('wa.message', msg('A1'));
    port.emit('wa.contacts', { contacts: [{ jid: FAMILY, name: 'Family group' }] });
    await flush();
    expect(txOps()).toEqual([]);
  });

  it('a hidden group (hiddenJids) is not ingested; other chats still are', async () => {
    settings.connections.whatsapp.hiddenJids = [FAMILY];
    port.emit('wa.message', msg('A1'));
    port.emit('wa.message', msg('B1', '919800000001@s.whatsapp.net'));
    await flush();
    expect(txOps().map((o) => (o.op === 'insert' ? o.row.chat_jid : null))).toEqual(['919800000001@s.whatsapp.net']);
  });
});
