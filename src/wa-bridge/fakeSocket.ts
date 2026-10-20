// Spec: 08-3 §22 (FOO_TEST runs never reach a real service: connectors are faked through the same seams), §22.4 (fake
// connectors), 08-3 §16.4.4 (a new QR about every 20 s). The socket a FOO_TEST bridge uses instead of Baileys: main's
// test channel plays the phone (scan, an incoming group message, logout). Fake numbers only (public repo).
// M8 T7: it records every outbound message (so a test can count that nothing was sent) and answers delivered for each;
// `notOnWhatsApp` is the one number `wa.onWhatsApp` says has no WhatsApp.
import type { Clock, TimerId } from '../shared/clock';
import type { BridgeTestOp } from '../shared/waBridge';
import type { SocketFactory, WaSocketEvents } from './core';

/** The fake phone's own number and its groups (the ux-world's two mirrors, 08-3 §22.9, so a seeded world and a link agree). */
export const FAKE_WA = {
  me: '919876543210@s.whatsapp.net',
  groups: [
    { jid: '120363000000000001@g.us', name: 'Building society' },
    { jid: '120363000000000002@g.us', name: 'School friends' },
  ],
  // M8 T7
  notOnWhatsApp: '919800000099@s.whatsapp.net',
  /** One person in the phone's address book, so a draft "to Mom" finds her (08-3 §16.4.2 (3)). */
  people: [{ jid: '919800000011@s.whatsapp.net', name: 'Mom' }],
} as const;

const QR_EVERY_MS = 20_000;

export class FakePhone {
  private events: WaSocketEvents | null = null;
  private pairing = false;
  private timer: TimerId | null = null;
  private codes = 0;
  // M8 T7
  /** Every message the bridge sent through this phone, in order. */
  readonly outbound: { jid: string; text: string; keyId: string }[] = [];

  /** `sent` tells a FOO_TEST main about each one, so an e2e can count what went out (AT-269: nothing from a mirror). */
  constructor(
    private clock: Clock,
    private sent: (m: { jid: string; keyId: string }) => void = () => undefined,
  ) {}

  readonly factory: SocketFactory = async ({ session, events }) => {
    this.stop();
    this.events = events;
    this.pairing = session === null;
    if (this.pairing) this.nextCode();
    else queueMicrotask(() => this.events === events && this.online());
    return {
      logout: async () => this.stop(),
      end: () => {
        if (this.events === events) this.stop();
      },
      // M8 T7: the server takes it at once; the phone answers delivered (ack 2) right after.
      sendText: async (jid, text, keyId) => {
        if (this.events !== events) throw new Error('closed');
        this.outbound.push({ jid, text, keyId });
        this.sent({ jid, keyId });
        setTimeout(() => this.events === events && events.acks([{ chatJid: jid, keyId, level: 2 }]), 0);
      },
      onWhatsApp: async (jids) => jids.map((jid) => ({ jid, exists: jid !== FAKE_WA.notOnWhatsApp })),
    };
  };

  private nextCode(): void {
    this.codes += 1;
    this.events?.qr(`foo-fake-qr-${this.codes}`);
    this.timer = this.clock.setTimeout(() => this.nextCode(), QR_EVERY_MS);
  }

  private stop(): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
    this.events = null;
    this.pairing = false;
  }

  private online(): void {
    this.events?.open({ jid: FAKE_WA.me });
    this.events?.contacts([...FAKE_WA.groups, ...FAKE_WA.people].map((g) => ({ ...g })));
  }

  /** One phone action from the test channel. */
  act(op: BridgeTestOp): void {
    const ev = this.events;
    if (!ev) return;
    switch (op.op) {
      case 'scan':
        if (!this.pairing) return;
        if (this.timer !== null) this.clock.clearTimeout(this.timer);
        this.timer = null;
        this.pairing = false;
        ev.creds(new TextEncoder().encode(JSON.stringify({ fake: true, me: FAKE_WA.me })));
        this.online();
        return;
      case 'message':
        ev.messages([
          {
            chatJid: op.chatJid,
            keyId: op.keyId,
            fromMe: op.sender === FAKE_WA.me,
            participant: op.sender,
            ...(op.pushName ? { pushName: op.pushName } : {}),
            ...(op.text ? { text: op.text } : {}),
            media: Boolean(op.media),
            at: op.at,
            starred: false,
            mentionsMe: false,
          },
        ]);
        return;
      case 'logout':
        this.stop();
        ev.close({ loggedOut: true });
        return;
      case 'fail':
        this.stop();
        ev.close({ loggedOut: false });
        return;
    }
  }
}
