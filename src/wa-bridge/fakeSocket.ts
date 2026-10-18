// Spec: 08-3 §22 (FOO_TEST runs never reach a real service: connectors are faked through the same seams), §22.4 (fake
// connectors), 08-3 §16.4.4 (a new QR about every 20 s). The socket a FOO_TEST bridge uses instead of Baileys: main's
// test channel plays the phone (scan, an incoming group message, logout). Fake numbers only (public repo).
import type { Clock, TimerId } from '../shared/clock';
import type { BridgeTestOp } from '../shared/waBridge';
import type { SocketFactory, WaSocketEvents } from './core';

/** The fake phone's own number and its groups. */
export const FAKE_WA = {
  me: '919876543210@s.whatsapp.net',
  groups: [
    { jid: '120363000000000001@g.us', name: 'Family group' },
    { jid: '120363000000000002@g.us', name: 'Society committee' },
  ],
} as const;

const QR_EVERY_MS = 20_000;

export class FakePhone {
  private events: WaSocketEvents | null = null;
  private pairing = false;
  private timer: TimerId | null = null;
  private codes = 0;

  constructor(private clock: Clock) {}

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
    this.events?.contacts(FAKE_WA.groups.map((g) => ({ ...g })));
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
