// Spec: 08-2 §8.2 (`browser.open` and `web.fetch` block localhost and private/link-local IP ranges), 08-4 §27.6 (test hosts),
// CR-0047 (the block applies to the address a name resolves to, not only to the name as written).
import { describe, expect, it } from 'vitest';
import { blockedAddress, isPrivateIp, resolvesPrivate } from '../../../src/engine/tools/net/address';

const dnsOf =
  (map: Record<string, string[]>) =>
  async (host: string): Promise<string[]> => {
    const a = map[host];
    if (!a) throw new Error('ENOTFOUND');
    return a;
  };

describe('private addresses (CR-0047)', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.1',
    '192.168.1.1',
    '169.254.169.254',
    '0.0.0.0',
    '::1',
    '::',
    'fd00::1',
    'fe80::1',
    '[::1]',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '[::ffff:a00:1]',
    '100.64.0.1',
    '100.127.255.254',
    '198.18.0.1',
    '224.0.0.1',
    '255.255.255.255',
    'fec0::1',
    'ff02::1',
    '::ffff:0:127.0.0.1',
    '64:ff9b::7f00:1',
    '64:ff9b::10.0.0.1',
    '2002:7f00:1::',
    '2002:c0a8:101::1',
    '127.0.0.1.',
  ])('%s is private', (ip) => expect(isPrivateIp(ip)).toBe(true));

  it.each([
    '8.8.8.8',
    '172.32.0.1',
    '192.169.0.1',
    '100.128.0.1',
    '64:ff9b::808:808',
    '100.128.0.1',
    '2606:4700::1111',
    '[2606:4700::1111]',
    '2002:808:808::',
    '64:ff9b::808:808',
  ])('%s is public', (ip) => expect(isPrivateIp(ip)).toBe(false));

  it('a public name that resolves to a private address is private', async () => {
    const lookup = dnsOf({ 'rebind.example': ['93.184.216.34', '127.0.0.1'], 'news.example': ['93.184.216.34'] });
    expect(await resolvesPrivate('rebind.example', lookup)).toBe(true);
    expect(await resolvesPrivate('news.example', lookup)).toBe(false);
    // Written as an address: no lookup needed.
    expect(await resolvesPrivate('10.0.0.1', lookup)).toBe(true);
  });

  it('localhost names are private with or without the trailing dot, whatever DNS says', async () => {
    const none = dnsOf({});
    for (const h of ['localhost', 'localhost.', 'x.localhost', 'x.localhost.', 'LOCALHOST..'])
      expect(await resolvesPrivate(h, none)).toBe(true);
    expect(await resolvesPrivate('rebind.example.', dnsOf({ 'rebind.example': ['127.0.0.1'] }))).toBe(true);
  });

  it('a name that does not resolve is left to fail on its own', async () => {
    expect(await resolvesPrivate('nowhere.example', dnsOf({}))).toBe(false);
  });

  it('only hosts on the test allow list skip the block', () => {
    expect(blockedAddress('rebind.example', '127.0.0.1', [])).toBe(true);
    expect(blockedAddress('tablejoy.test', '127.0.0.1', ['tablejoy.test'])).toBe(false);
    expect(blockedAddress('tablejoy.test.', '127.0.0.1', ['tablejoy.test'])).toBe(false);
    expect(blockedAddress('news.example', '93.184.216.34', [])).toBe(false);
  });
});
