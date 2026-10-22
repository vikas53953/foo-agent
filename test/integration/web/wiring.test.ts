// Spec: 08-1 §2.4 (`webkey.check {provider}` → ok | refused | unknown), 08-4 §27.4 (hand-back sites from the shipped resource),
// §27.6 (localhost and private ranges blocked; FOO_TEST_ALLOW_HOSTS only in test builds), 08-2 §8.3.10.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { settingsDefaults } from '../../../src/shared/settingsDefaults';
import { createEngineWeb, defaultUrlAllowed } from '../../../src/engine/tools/web';
import { fakeExa } from '../../fakes/web/exa';
import { FakeNet, FakePage, makeRedactor } from '../../fakes/web/net';
import { FakeClock } from '../../../src/shared/clock';

function engineWeb(net: FakeNet, saved: Record<string, string> = {}) {
  const r = makeRedactor();
  return createEngineWeb({
    clock: new FakeClock(),
    fetch: net.fetch,
    resourcesDir: join(__dirname, '../../../resources'),
    env: {},
    testRun: true,
    settings: () => structuredClone(settingsDefaults),
    online: () => true,
    scrub: (t) => r.scrub(t),
    pricing: { usdToInr: 88, web: {} },
    recordTurn: () => undefined,
    newId: () => 't_1',
    log: () => undefined,
    keys: { use: async (p) => saved[p] ?? null },
    page: new FakePage(() => null),
  });
}

describe('engine wiring', () => {
  it('webkey.check: the saved key is checked once against the shipped web-tools.json base; no saved key → unknown', async () => {
    const net = new FakeNet().on('api.exa.ai', fakeExa());
    expect(await engineWeb(net, { exa: 'k' }).checkKey('exa')).toBe('ok');
    expect(net.to('api.exa.ai')).toHaveLength(1);
    expect(await engineWeb(net).checkKey('tavily')).toBe('unknown');
    expect(net.requests).toHaveLength(1);
  });

  it('a seeded hand-back site (08-4 §27.4) is never read', async () => {
    const net = new FakeNet();
    const r = await engineWeb(net).tools.fetch(
      { url: 'https://kite.zerodha.com/dashboard' },
      { chatId: null, jobId: null, toolCallId: 'tc' },
    );
    expect(r).toEqual({ ok: false, errorKind: 'SITE_HANDBACK' });
    expect(net.requests).toEqual([]);
  });

  it('URL policy: localhost and private ranges blocked; FOO_TEST_ALLOW_HOSTS passes only in test runs', () => {
    const prod = defaultUrlAllowed({ FOO_TEST_ALLOW_HOSTS: 'restaurant.test' }, false);
    const test = defaultUrlAllowed({ FOO_TEST_ALLOW_HOSTS: 'restaurant.test,127.0.0.1' }, true);
    for (const u of ['http://localhost/', 'http://127.0.0.1/', 'http://192.168.1.4/', 'http://10.0.0.2/', 'http://[::1]/', 'file:///C:/x'])
      expect(prod(new URL(u)), u).toBe(false);
    expect(prod(new URL('https://example.org/'))).toBe(true);
    expect(prod(new URL('https://restaurant.test/'))).toBe(true);
    expect(test(new URL('http://127.0.0.1/'))).toBe(true);
    expect(test(new URL('http://192.168.1.4/'))).toBe(false);
  });
});
