// 08-3 §22.1, §22.8: test:* channels exist only in FOO_TEST runs; 08-1 §3 sender check.
import { describe, expect, it } from 'vitest';
import { ChannelGuard, channelAllowed, testHooksEnabled, type SenderEvent } from '../../src/main/ipc/guard';

const DIRS = { FOO_DATA_DIR: 'd', FOO_LOCAL_DIR: 'l', FOO_OUT_DIR: 'o' };

function fakeIpc() {
  const handlers = new Map<string, (e: SenderEvent, arg?: unknown) => unknown>();
  return { handlers, handle: (ch: string, fn: (e: SenderEvent, arg?: unknown) => unknown) => void handlers.set(ch, fn) };
}

describe('IPC router guard', () => {
  it('refuses test:* without FOO_TEST=1', () => {
    const ipc = fakeIpc();
    const log: string[] = [];
    const guard = new ChannelGuard(
      ipc,
      () => true,
      { ...DIRS },
      (l) => log.push(l),
    );
    expect(guard.handle('test:clock', () => 1)).toBe(false);
    expect(guard.handle('test:reset', () => 1)).toBe(false);
    expect(ipc.handlers.size).toBe(0);
    expect(log[0]).toMatch(/^IPC_REJECTED test:clock/);
  });
  it('refuses test:* with FOO_TEST=1 but without the FOO_*_DIR overrides', () => {
    expect(channelAllowed('test:seed', { FOO_TEST: '1' })).toBe(false);
    expect(testHooksEnabled({ FOO_TEST: '1', FOO_DATA_DIR: 'd' })).toBe(false);
    expect(channelAllowed('test:seed', { FOO_TEST: 'true', ...DIRS })).toBe(false);
  });
  it('registers test:* in a test run and other channels always', () => {
    const ipc = fakeIpc();
    const guard = new ChannelGuard(
      ipc,
      () => true,
      { FOO_TEST: '1', ...DIRS },
      () => {},
    );
    expect(guard.handle('test:clock', () => 1)).toBe(true);
    expect(
      new ChannelGuard(
        fakeIpc(),
        () => true,
        {},
        () => {},
      ).handle('chats:list', () => 1),
    ).toBe(true);
    expect(guard.registered).toEqual(['test:clock']);
  });
  it('rejects calls from untrusted senders', () => {
    const ipc = fakeIpc();
    const guard = new ChannelGuard(
      ipc,
      (url) => url.startsWith('app://foo/'),
      { FOO_TEST: '1', ...DIRS },
      () => {},
    );
    guard.handle('test:clock', (arg: { n: number }) => arg.n + 1);
    const fn = ipc.handlers.get('test:clock')!;
    expect(fn({ senderFrame: { url: 'app://foo/index.html' } }, { n: 1 })).toBe(2);
    expect(() => fn({ senderFrame: { url: 'https://evil.example/' } }, { n: 1 })).toThrow(/IPC_REJECTED/);
    expect(() => fn({ senderFrame: null }, { n: 1 })).toThrow(/IPC_REJECTED/);
  });
});
