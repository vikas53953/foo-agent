// Spec: 08-2 §8.2 (`web.fetch` local path: GET, URL policy as `browser.open` re-checked on every redirect), 08-4 §27.6 (test
// hosts), CR-0047 (the private-range block is checked on the address the connection is made to, so a public name that
// resolves to 127.0.0.1 never reaches a service on this PC).
import { createServer, type Server } from 'node:http';
import { createServer as createRawServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { guardedGet } from '../../../src/engine/tools/net/guardedGet';
import { WebTools } from '../../../src/engine/tools/web/WebTools';
import { world } from '../../fakes/web/net';

let server: Server;
let port = 0;
let hits = 0;
beforeAll(async () => {
  server = createServer((req, res) => {
    hits += 1;
    if (req.url === '/gz') {
      res.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' }).end(gzipSync('<p>squeezed</p>'));
      return;
    }
    if (req.url === '/move') {
      res.writeHead(302, { location: '/plain' }).end();
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'x-ua': req.headers['user-agent'] ?? '' }).end('<p>local service</p>');
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => new Promise<void>((ok) => server.close(() => ok())));

// "rebind.example" is a public-looking name that points at this PC.
const resolve = async (host: string) => (host === 'rebind.example' || host === 'tablejoy.test' ? ['127.0.0.1'] : ['93.184.216.34']);

describe('the local web read connects only to public addresses (CR-0047)', () => {
  it('a public name that resolves to 127.0.0.1 is refused before any byte reaches the service', async () => {
    const before = hits;
    const get = guardedGet({ allowHosts: [], resolve });
    await expect(get(`http://rebind.example:${port}/plain`, { method: 'GET' })).rejects.toThrow(/URL_NOT_ALLOWED/);
    expect(hits).toBe(before);
  });

  it('an address written as 127.0.0.1 is refused too', async () => {
    const get = guardedGet({ allowHosts: [], resolve });
    await expect(get(`http://127.0.0.1:${port}/plain`, { method: 'GET' })).rejects.toThrow(/URL_NOT_ALLOWED/);
  });

  it('a test host on the allow list is read (test builds), with headers, gzip and manual redirects', async () => {
    const get = guardedGet({ allowHosts: ['tablejoy.test'], resolve });
    const r = await get(`http://tablejoy.test:${port}/plain`, { method: 'GET', headers: { 'user-agent': 'foo-test' } });
    expect(r.status).toBe(200);
    expect(r.headers.get('x-ua')).toBe('foo-test');
    expect(await r.text()).toContain('local service');
    expect(await (await get(`http://tablejoy.test:${port}/gz`, { method: 'GET' })).text()).toBe('<p>squeezed</p>');
    const moved = await get(`http://tablejoy.test:${port}/move`, { method: 'GET', redirect: 'manual' });
    expect(moved.status).toBe(302);
    expect(moved.headers.get('location')).toBe('/plain');
  });

  it('an aborted read stops', async () => {
    const get = guardedGet({ allowHosts: ['tablejoy.test'], resolve });
    const ac = new AbortController();
    ac.abort();
    await expect(get(`http://tablejoy.test:${port}/plain`, { method: 'GET', signal: ac.signal })).rejects.toThrow();
  });

  it('localhost names are refused with or without the trailing dot, whatever DNS says', async () => {
    const get = guardedGet({ allowHosts: [], resolve: async () => ['93.184.216.34'] });
    for (const h of ['localhost.', 'x.localhost', 'x.localhost.'])
      await expect(get(`http://${h}:${port}/plain`, { method: 'GET' })).rejects.toThrow(/URL_NOT_ALLOWED/);
  });

  it('a status the Response type cannot carry is a failed read, never a crash', async () => {
    const raw = createRawServer((sock) => sock.once('data', () => sock.end('HTTP/1.1 999 Odd\r\ncontent-length: 2\r\n\r\nok')));
    await new Promise<void>((ok) => raw.listen(0, '127.0.0.1', ok));
    const rawPort = (raw.address() as AddressInfo).port;
    const get = guardedGet({ allowHosts: ['tablejoy.test'], resolve });
    await expect(get(`http://tablejoy.test:${rawPort}/`, { method: 'GET' })).rejects.toThrow(/HTTP_STATUS_999/);
    await new Promise<void>((ok) => raw.close(() => ok()));
  });

  it('web.fetch reports the refusal as URL_NOT_ALLOWED, not as a page that needs the browser', async () => {
    const w = world({ localGet: guardedGet({ allowHosts: [], resolve }) });
    const r = await new WebTools(w.deps).fetch(
      { url: `http://rebind.example:${port}/plain` },
      { chatId: 'c_1', jobId: 'job_1', toolCallId: 'tc_1' },
    );
    expect(r).toEqual({ ok: false, errorKind: 'URL_NOT_ALLOWED' });
  });
});
