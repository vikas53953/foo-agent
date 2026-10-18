// Spec: 08-3 §22.1 and §22.8 (test:* channels exist only in test runs: FOO_TEST=1 with the FOO_*_DIR overrides, 08-0 §E.6),
// 08-1 §3 (every channel sender-checked; §3.1.1 each window only its own channels; a refused call is logged IPC_REJECTED, 08-3 §21.4). No electron import, so the
// guard is unit-tested in plain Node.
export const TEST_CHANNEL_PREFIX = 'test:';

type Env = Record<string, string | undefined>;

export function testHooksEnabled(env: Env = process.env): boolean {
  return env.FOO_TEST === '1' && !!env.FOO_DATA_DIR && !!env.FOO_LOCAL_DIR && !!env.FOO_OUT_DIR;
}

export function channelAllowed(channel: string, env: Env = process.env): boolean {
  return !channel.startsWith(TEST_CHANNEL_PREFIX) || testHooksEnabled(env);
}

/**
 * 08-1 §3.1.1: the channels each of foo's windows may call; `main` calls every channel. The window is told by the page path
 * of the sender (09 §9.27: `windows/live.html`, `windows/signin-banner.html`; the viewer arrives with its milestone).
 */
export const WINDOW_CHANNELS: Record<string, readonly string[]> = {
  '/windows/live.html': ['job:stop', 'job:takeOver', 'job:handBack', 'job:watch'],
  '/windows/signin-banner.html': ['signin:done', 'signin:skip', 'job:handBack'],
  '/windows/viewer.html': ['files:open', 'files:showInFolder'],
};

export function windowChannelAllowed(url: string, channel: string): boolean {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return false;
  }
  const allowed = WINDOW_CHANNELS[path];
  return !allowed || allowed.includes(channel);
}

export interface SenderEvent {
  senderFrame?: { url: string } | null;
}

/** The part of Electron's ipcMain the guard uses. */
export interface IpcMainLike {
  handle(channel: string, listener: (event: SenderEvent, ...args: unknown[]) => unknown): void;
}

export class IpcRejected extends Error {
  readonly kind = 'IPC_REJECTED';
  constructor(channel: string, why: string) {
    super(`IPC_REJECTED ${channel}: ${why}`);
  }
}

/** Registers invoke handlers, refusing test:* outside test runs and calls from untrusted senders. */
export class ChannelGuard {
  readonly registered: string[] = [];

  constructor(
    private readonly ipc: IpcMainLike,
    private readonly trusted: (url: string) => boolean,
    private readonly env: Env = process.env,
    private readonly log: (line: string) => void = (line) => console.warn(line),
  ) {}

  handle<A, R>(channel: string, fn: (arg: A) => R | Promise<R>): boolean {
    if (!channelAllowed(channel, this.env)) {
      this.log(`IPC_REJECTED ${channel}: test channels need FOO_TEST=1 and the FOO_*_DIR overrides`);
      return false;
    }
    this.ipc.handle(channel, (event, arg) => {
      const url = event.senderFrame?.url ?? '';
      if (!this.trusted(url)) {
        this.log(`IPC_REJECTED ${channel}: untrusted sender`);
        throw new IpcRejected(channel, 'untrusted sender');
      }
      if (!windowChannelAllowed(url, channel)) {
        this.log(`IPC_REJECTED ${channel}: not a channel of this window`);
        throw new IpcRejected(channel, 'not a channel of this window');
      }
      return fn(arg as A);
    });
    this.registered.push(channel);
    return true;
  }
}
