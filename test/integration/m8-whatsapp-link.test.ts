// M8 T3 integration: the whole WhatsApp read path in one process, minus Electron. The real BridgeCore on the FOO_TEST fake
// phone ↔ the engine's real WhatsAppConnector ↔ main's real EngineBridge + WhatsAppMain on a migrated SQLite db. It walks
// 08-3 §16.4: Show QR code → a code → the phone scans → the whatsapp row is linked with the masked number and Activity
// `connected` → every group becomes a muted wa_mirror chat → a group message lands in that chat → Unlink (C-11) removes
// the row, the stored messages and the mirrors. No real WhatsApp account, no network, no send path.
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import type { MainLink } from '../../src/engine/protocol';
import { WhatsAppConnector, type WaPortLike } from '../../src/engine/tools/connectors/whatsapp';
import { EngineBridge } from '../../src/main/engine-supervisor/EngineBridge';
import { migrate } from '../../src/main/store/db';
import { chatOpen } from '../../src/main/store/queries';
import { memoryWaSession } from '../../src/main/vault/waSessionMemory';
import { WhatsAppMain } from '../../src/main/whatsapp/waMain';
import { FakeClock, TEST_EPOCH_MS } from '../../src/shared/clock';
import type { Result } from '../../src/shared/errors';
import { settingsDefaults } from '../../src/shared/settingsDefaults';
import type { Settings } from '../../src/shared/settings';
import { BridgeCore } from '../../src/wa-bridge/core';
import { FAKE_WA, FakePhone } from '../../src/wa-bridge/fakeSocket';

const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 20));
};

/** A port pair that delivers asynchronously, like a MessageChannel. */
function pair(): [WaPortLike, WaPortLike] {
  const mk = () => {
    let fn: ((e: { data: unknown }) => void) | null = null;
    return {
      peer: null as null | { deliver(d: unknown): void },
      deliver: (d: unknown) => queueMicrotask(() => fn?.({ data: d })),
      set: (f: typeof fn) => (fn = f),
    };
  };
  const a = mk();
  const b = mk();
  const port = (self: ReturnType<typeof mk>, other: ReturnType<typeof mk>): WaPortLike => ({
    postMessage: (m) => other.deliver(m),
    on: (_e, f) => self.set(f),
    start: () => {},
  });
  return [port(a, b), port(b, a)];
}

function world() {
  const clock = new FakeClock(TEST_EPOCH_MS);
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db);
  let settings: Settings = structuredClone(settingsDefaults);
  const listeners: ((s: Settings) => void)[] = [];
  const settingsStore = {
    get: () => settings,
    update: (fn: (s: Settings) => Settings) => {
      settings = fn(settings);
      for (const l of listeners) l(settings);
    },
    onChange: (fn: (s: Settings) => void) => {
      listeners.push(fn);
      return () => undefined;
    },
  };
  const events: { event: string; payload: unknown }[] = [];
  const emit = (event: string, payload: unknown) => void events.push({ event, payload });
  let wa: WhatsAppMain | null = null;
  const main = new EngineBridge({
    db,
    settings: settingsStore,
    emit: emit as never,
    emitMessage: () => undefined,
    emitChat: (id) => emit('chat:upsert', { id }),
    now: () => clock.now(),
    whatsapp: { report: (r) => wa?.report(r), vault: (req) => wa!.vault(req) },
  });
  main.live = true;
  const toEngine: { kind: string; payload: unknown }[] = [];
  main.post = (m) => void toEngine.push(m);
  let bridgeRuns = 0;
  wa = new WhatsAppMain({
    db,
    settings: settingsStore,
    engine: main,
    bridge: { startBridge: () => void (bridgeRuns += 1), stopBridge: () => undefined },
    session: memoryWaSession(),
    emit: emit as never,
    emitChat: (id) => emit('chat:upsert', { id }),
    emitSettings: () => emit('settings:changed', {}),
    chatRow: (id) => ({ id }) as never,
    now: () => clock.now(),
    unlinkGraceMs: 0,
  });
  // The engine's link to main goes straight into main's receive(), as the real port would.
  let seq = 0;
  const link: MainLink = {
    request: async <T>(kind: string, payload: unknown): Promise<Result<T>> => {
      seq += 1;
      return main.receive({ id: `t${seq}`, kind, payload })!.result as Result<T>;
    },
    send: (kind, payload) => {
      seq += 1;
      main.receive({ id: `t${seq}`, kind, payload });
    },
  } as MainLink;
  const connector = new WhatsAppConnector({ link, clock, settings: () => settings });
  const phone = new FakePhone(clock);
  const [enginePort, bridgePort] = pair();
  const core = new BridgeCore({ clock, send: (m) => bridgePort.postMessage(m), socket: phone.factory });
  bridgePort.on('message', (e) => void core.handle(e.data as never));
  // main → engine commands are applied the way Engine.handle routes them
  const pump = () => {
    for (const m of toEngine.splice(0)) {
      const p = m.payload as { target: string; cmd: 'linkStart' | 'linkCancel' | 'unlink' };
      if (m.kind === 'connection.cmd' && p.target === 'whatsapp') connector.command(p.cmd);
    }
  };
  return {
    clock,
    db,
    events,
    store: settingsStore,
    wa: wa!,
    connector,
    phone,
    enginePort,
    pump,
    settings: () => settings,
    bridgeRuns: () => bridgeRuns,
  };
}

describe('M8 T3: link WhatsApp, mirror the groups, read a message, unlink', () => {
  it('walks the whole read path on the fake phone', async () => {
    const w = world();
    await w.connector.attach(w.enginePort);
    expect(w.wa.linkStart().ok).toBe(true);
    expect(w.bridgeRuns()).toBe(1);
    w.pump();
    await settle();
    const qr = w.events.find((e) => e.event === 'whatsapp:qr')?.payload as { png: string; expiresAt: number };
    expect(qr.expiresAt).toBe(TEST_EPOCH_MS + 60_000);
    expect(qr.png).toMatch(/^data:image\/png;base64,/);

    w.phone.act({ op: 'scan' });
    await settle();
    const row = w.db.prepare("SELECT status, account_label FROM connections WHERE app = 'whatsapp'").get();
    expect(row).toEqual({ status: 'connected', account_label: '+91 98••• ••210' });
    expect(w.db.prepare("SELECT summary FROM activity WHERE event = 'connected'").pluck().get()).toBe(
      'Connected WhatsApp (+91 98••• ••210)',
    );
    const mirrors = w.db.prepare("SELECT id, title, wa_jid FROM chats WHERE kind = 'wa_mirror' ORDER BY title").all() as {
      id: string;
      title: string;
      wa_jid: string;
    }[];
    expect(mirrors.map((m) => m.title)).toEqual(FAKE_WA.groups.map((g) => g.name));
    for (const m of mirrors) expect(w.settings().notifications.mutedChats[m.id]).toBe('forever');

    // the link stays: 60 s later nothing is cancelled
    w.clock.advance(60_000);
    await settle();
    expect(w.db.prepare("SELECT status FROM connections WHERE app = 'whatsapp'").pluck().get()).toBe('connected');

    const family = FAKE_WA.groups[0].jid;
    w.phone.act({
      op: 'message',
      chatJid: family,
      keyId: 'K1',
      sender: '919800000001@s.whatsapp.net',
      pushName: 'Mom',
      text: 'Dinner at 8?',
      at: w.clock.now(),
    });
    w.phone.act({
      op: 'message',
      chatJid: family,
      keyId: 'K1',
      sender: '919800000001@s.whatsapp.net',
      pushName: 'Mom',
      text: 'Dinner at 8?',
      at: w.clock.now(),
    });
    await settle();
    const famId = mirrors.find((m) => m.wa_jid === family)!.id;
    const open = chatOpen(w.db, famId, w.clock.now())!;
    expect(open.waMessages?.map((m) => [m.senderLabel, m.text])).toEqual([['Mom', 'Dinner at 8?']]);
    expect(open.messages).toEqual([]);
    expect(w.db.prepare('SELECT unread_count FROM chats WHERE id = ?').pluck().get(famId)).toBe(1);

    expect(w.wa.unlink().ok).toBe(true);
    w.pump();
    await settle();
    expect(w.db.prepare("SELECT COUNT(*) FROM connections WHERE app = 'whatsapp'").pluck().get()).toBe(0);
    expect(w.db.prepare("SELECT COUNT(*) FROM chats WHERE kind = 'wa_mirror' AND deleted_at IS NULL").pluck().get()).toBe(0);
    expect(w.db.prepare('SELECT COUNT(*) FROM wa_messages').pluck().get()).toBe(0);
    expect(w.events.filter((e) => e.event === 'chat:removed')).toHaveLength(2);
    expect(w.db.prepare("SELECT summary FROM activity WHERE event = 'disconnected'").pluck().get()).toBe('Disconnected WhatsApp');
  });

  it('a group hidden with "Hide from foo" stops ingest; read=false deletes what was stored', async () => {
    const w = world();
    await w.connector.attach(w.enginePort);
    w.wa.linkStart();
    w.pump();
    await settle();
    w.phone.act({ op: 'scan' });
    await settle();
    const [fam, soc] = FAKE_WA.groups.map((g) => g.jid);
    const famId = w.db.prepare('SELECT id FROM chats WHERE wa_jid = ?').pluck().get(fam) as string;
    expect(w.wa.archive(famId, true).ok).toBe(true);
    expect(w.settings().connections.whatsapp.hiddenJids).toEqual([fam]);
    const say = (jid: string, key: string) =>
      w.phone.act({ op: 'message', chatJid: jid, keyId: key, sender: '919800000002@s.whatsapp.net', text: 'hi', at: w.clock.now() });
    say(fam!, 'H1');
    say(soc!, 'S1');
    await settle();
    expect(w.db.prepare('SELECT chat_jid FROM wa_messages').pluck().all()).toEqual([soc]);

    w.store.update((s) => ({ ...s, connections: { ...s.connections, whatsapp: { ...s.connections.whatsapp, read: false } } }));
    expect(w.db.prepare('SELECT COUNT(*) FROM wa_messages').pluck().get()).toBe(0);
    say(soc!, 'S2');
    await settle();
    expect(w.db.prepare('SELECT COUNT(*) FROM wa_messages').pluck().get()).toBe(0);
  });

  it('three codes left unscanned for 60 s each end in WA_LINK_FAILED on the row', async () => {
    const w = world();
    await w.connector.attach(w.enginePort);
    for (let i = 0; i < 3; i++) {
      w.wa.linkStart();
      w.pump();
      await settle();
      w.clock.advance(60_000);
      await settle();
    }
    expect(w.db.prepare("SELECT status, last_error_kind FROM connections WHERE app = 'whatsapp'").get()).toEqual({
      status: 'disconnected',
      last_error_kind: 'WA_LINK_FAILED',
    });
  });
});
