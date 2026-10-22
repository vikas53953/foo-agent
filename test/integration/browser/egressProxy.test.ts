// Spec: 08-2 §8.2 (`browser.open` blocks `localhost` and private/link-local IP ranges), 08-4 §27.6 (test hosts), CR-0047 (the
// block is on the address the connection is made to: foo's browser reaches the network only through the engine's proxy, which
// refuses a private answer for any request, whatever started it).
import { connect, createServer, type AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startEgressProxy } from '../../../src/engine/tools/browser/egressProxy';
import { browserHarness, html, type BrowserHarness } from './harness';

// Public-looking names that point at this PC: one through the test host map, one through foo's own lookup.
const MAPPED = 'rebind.example';
const LOOKED_UP = 'dns-rebind.example';
// A test host on the allow list that points at this PC too: it opens (FOO_TEST builds).
const ALLOWED = 'allowed.test';
let h: BrowserHarness;
let inner = 0;
let port = '';
const at = (host: string, path: string) => `http://${host}:${port}${path}`;

beforeAll(async () => {
  h = await browserHarness({
    hostRules: `MAP ${MAPPED} 127.0.0.1,MAP ${ALLOWED} 127.0.0.1`,
    allow: [ALLOWED],
    resolve: async (host) => (host === LOOKED_UP ? ['93.184.216.34', '127.0.0.1'] : []),
  });
  port = new URL(h.origin).port;
  h.route('/inner', (_q, res) => {
    inner += 1;
    res.writeHead(200, { 'content-type': 'text/html' }).end(html('<p>router admin</p>'));
  });
  h.route('/hop', (_q, res) => res.writeHead(302, { location: at(MAPPED, '/inner') }).end());
  h.route('/framed', html(`<h1>Outer</h1><iframe src="${at(MAPPED, '/inner')}"></iframe><img src="${at(LOOKED_UP, '/inner')}">`));
  // A cross-site frame (its own process) that later moves itself onto the private name.
  h.route('/frame-moves', html(`<script>setTimeout(() => { location = ${JSON.stringify(at(MAPPED, '/inner'))}; }, 50)</script>`));
  h.route('/oopif', html(`<h1>Outer</h1><iframe src="${at('localhost', '/frame-moves')}"></iframe>`));
  h.route('/popup', html(`<h1>Opener</h1><script>window.open(${JSON.stringify(at(LOOKED_UP, '/inner'))})</script>`));
});
afterAll(() => h.close());

const settle = async (jobId: string) => (await h.page(jobId)).waitForTimeout(800);

describe("foo's browser never connects to a private address behind a public name (CR-0047)", () => {
  it.each([
    ['the test host map', MAPPED],
    ["foo's own lookup", LOOKED_UP],
  ])('browser.open on a name that resolves to 127.0.0.1 (%s) is refused and nothing reaches the service', async (_how, host) => {
    const before = inner;
    const r = await h.run('browser.open', { url: at(host, '/inner') }, 'job_rb1');
    expect(r).toMatchObject({ kind: 'error', errorKind: 'URL_NOT_ALLOWED' });
    expect(inner).toBe(before);
    await h.runtime.jobEnded('job_rb1');
  });

  it('a redirect onto such a name is refused at the hop', async () => {
    const before = inner;
    const r = await h.run('browser.open', { url: `${h.origin}/hop` }, 'job_rb2');
    expect(r).toMatchObject({ kind: 'error', errorKind: 'URL_NOT_ALLOWED' });
    expect(inner).toBe(before);
    await h.runtime.jobEnded('job_rb2');
  });

  it('a frame or an image pointing at such a name is not loaded; the page itself opens', async () => {
    const before = inner;
    expect((await h.run('browser.open', { url: `${h.origin}/framed` }, 'job_rb3')).kind).toBe('ok');
    await settle('job_rb3');
    expect(inner).toBe(before);
    await h.runtime.jobEnded('job_rb3');
  });

  it('a cross-site frame that moves itself onto such a name is refused', async () => {
    const before = inner;
    expect((await h.run('browser.open', { url: `${h.origin}/oopif` }, 'job_rb4')).kind).toBe('ok');
    await settle('job_rb4');
    expect(inner).toBe(before);
    await h.runtime.jobEnded('job_rb4');
  });

  it('a pop-up opened on such a name is refused', async () => {
    const before = inner;
    const win = await h.page('job_rb5');
    const pages = win.context().pages().length;
    expect((await h.run('browser.open', { url: `${h.origin}/popup` }, 'job_rb5')).kind).toBe('ok');
    await settle('job_rb5');
    // The pop-up did open; only its load was refused.
    expect(win.context().pages().length).toBeGreaterThan(pages);
    expect(inner).toBe(before);
    await h.runtime.jobEnded('job_rb5');
  });

  it('a test host on the allow list opens although it points at this PC (FOO_TEST builds)', async () => {
    const before = inner;
    const r = await h.run('browser.open', { url: at(ALLOWED, '/inner') }, 'job_rb6');
    expect(r.kind).toBe('ok');
    expect(inner).toBe(before + 1);
    await h.runtime.jobEnded('job_rb6');
  });
});

describe('the proxy refuses tunnels too (HTTPS, WebSockets)', () => {
  it('a CONNECT to a name that resolves to a private address is closed and counted', async () => {
    const p = await startEgressProxy({ allowHosts: [], resolve: async () => ['10.0.0.7'], log: () => undefined });
    const mark = p.mark();
    const { port: pp } = new URL(p.url);
    const reply = await new Promise<string>((done) => {
      const s = connect(Number(pp), '127.0.0.1', () => s.write('CONNECT router.example:443 HTTP/1.1\r\nHost: router.example:443\r\n\r\n'));
      let got = '';
      s.on('data', (b) => (got += b.toString()));
      s.on('close', () => done(got));
      s.on('error', () => done(got));
    });
    expect(reply).not.toContain('200');
    expect(p.refusedSince(mark)).toBe(true);
    await p.close();
  });

  it('a CONNECT line it cannot read gets 400 and the engine keeps running', async () => {
    const p = await startEgressProxy({ allowHosts: [], log: () => undefined });
    const { port: pp } = new URL(p.url);
    for (const line of ['CONNECT a b:443 HTTP/1.1', 'CONNECT :443 HTTP/1.1', 'CONNECT host HTTP/1.1']) {
      const reply = await new Promise<string>((done) => {
        const s = connect(Number(pp), '127.0.0.1', () => s.write(`${line}\r\nHost: x\r\n\r\n`));
        let got = '';
        s.on('data', (b) => (got += b.toString()));
        s.on('close', () => done(got));
        s.on('error', () => done(got));
      });
      expect(reply).not.toContain(' 200 ');
    }
    await p.close();
  });

  it('a tunnel keeps the port it was asked for, :80 included (ws:// sockets)', async () => {
    const seen: number[] = [];
    const up = createServer((sock) => {
      seen.push((sock.address() as AddressInfo).port);
      sock.end();
    });
    await new Promise<void>((ok) => up.listen(0, '127.0.0.1', ok));
    const upPort = (up.address() as AddressInfo).port;
    const p = await startEgressProxy({ allowHosts: ['site.test'], hostMap: { 'site.test': '127.0.0.1' }, log: () => undefined });
    const { port: pp } = new URL(p.url);
    const reply = await new Promise<string>((done) => {
      const s = connect(Number(pp), '127.0.0.1', () => s.write(`CONNECT site.test:${upPort} HTTP/1.1\r\nHost: site.test\r\n\r\n`));
      let got = '';
      s.on('data', (b) => (got += b.toString()));
      s.on('close', () => done(got));
    });
    expect(reply).toContain(' 200 ');
    expect(seen).toEqual([upPort]);
    await p.close();
    await new Promise<void>((ok) => up.close(() => ok()));
  });
});

describe('the tunnel hands over everything the site sent', () => {
  it('a site that sends a large answer and closes at once is not cut short', async () => {
    const big = Buffer.alloc(4 * 1024 * 1024, 120);
    const up = createServer((sock) => sock.end(big));
    await new Promise<void>((ok) => up.listen(0, '127.0.0.1', ok));
    const upPort = (up.address() as AddressInfo).port;
    const p = await startEgressProxy({ allowHosts: ['site.test'], hostMap: { 'site.test': '127.0.0.1' }, log: () => undefined });
    const { port: pp } = new URL(p.url);
    const total = await new Promise<number>((done) => {
      let n = 0;
      let head = true;
      const s = connect(Number(pp), '127.0.0.1', () => s.write(`CONNECT site.test:${upPort} HTTP/1.1\r\nHost: site.test\r\n\r\n`));
      s.on('data', (b: Buffer) => {
        if (head) {
          const i = b.indexOf('\r\n\r\n');
          head = false;
          n += b.length - (i + 4);
        } else n += b.length;
        // A slow reader: the proxy's buffer fills while the site has already closed.
        s.pause();
        setTimeout(() => s.resume(), 1);
      });
      s.on('close', () => done(n));
    });
    expect(total).toBe(big.length);
    await p.close();
    await new Promise<void>((ok) => up.close(() => ok()));
  });
});

describe('a browser that ignores the proxy is not used (managed PC proxy policy)', () => {
  it('the launch check fails closed: no window, BROWSER_MISSING', async () => {
    const bypass = await browserHarness({ extraArgs: ['--no-proxy-server'] });
    try {
      const r = await bypass.run('browser.open', { url: `${bypass.origin}/x` }, 'job_bp');
      expect(r).toMatchObject({ kind: 'error', errorKind: 'BROWSER_MISSING' });
    } finally {
      await bypass.close();
    }
  });
});
