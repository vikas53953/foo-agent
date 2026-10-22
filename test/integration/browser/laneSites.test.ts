// Spec: 08-3 §22.5 (test sites: the CAPTCHA site is served as `localhost` beside the sign-in site on 127.0.0.1). The browser
// tries `localhost` on [::1] first where the machine has IPv6, so the CAPTCHA page must answer there too, never another program.
import { request } from 'node:http';
import { createServer } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serveLaneSites, type LaneSites } from './laneSites';

const hasV6 = await new Promise<boolean>((ok) => {
  const s = createServer();
  s.once('error', () => ok(false));
  s.listen(0, '::1', () => s.close(() => ok(true)));
});

const get = (host: string, port: number) =>
  new Promise<{ status: number; body: string }>((ok, fail) => {
    const r = request({ host, port, path: '/', headers: { host: `localhost:${port}` } }, (res) => {
      let body = '';
      res.on('data', (c: Buffer) => (body += c.toString('utf8')));
      res.on('end', () => ok({ status: res.statusCode ?? 0, body }));
    });
    r.on('error', fail);
    r.end();
  });

let sites: LaneSites;
beforeAll(async () => {
  sites = await serveLaneSites();
});
afterAll(async () => sites?.close());

describe('lane sites: `localhost` reaches the CAPTCHA site on every loopback the browser may try', () => {
  it('127.0.0.1', async () => {
    expect(await get('127.0.0.1', sites.port)).toMatchObject({ status: 200, body: expect.stringContaining('human') });
  });
  it.skipIf(!hasV6)('[::1] (machines with IPv6, such as windows-latest)', async () => {
    expect(sites.ipv6).toBe(true);
    expect(await get('::1', sites.port)).toMatchObject({ status: 200, body: expect.stringContaining('human') });
  });
});
