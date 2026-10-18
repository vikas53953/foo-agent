// Spec: 08-2 §8.2 `web.fetch` (URL policy re-checked on every redirect; hand-back domains never read; signed-in pages never sent
// to a cloud reader; Firecrawl with a key; else local GET with Edge UA, Accept-Language en-IN,hi;q=0.8, 2 MB cap, charset sniffing,
// JSDOM (scripts off) → Readability → Markdown ≤ 20,000; under ~500 chars → needsBrowser, read in the job window; 15-min cache;
// untrusted), §8.3.10, 08-4 §27.2 (ROUTE_ORDER), §27.3, AT-139.
import { describe, expect, it } from 'vitest';
import { EDGE_UA } from '../../../src/engine/tools/web/readability';
import { FETCH_CACHE_MS, WebTools } from '../../../src/engine/tools/web/WebTools';
import { fakeFirecrawl } from '../../fakes/web/firecrawl';
import { CLOUD_HOSTS, FakeNet, FakePage, fixture, html, keys, NO_KEYS_SETTINGS, world } from '../../fakes/web/net';

const ctx = { chatId: 'c_1', jobId: 'j_1', toolCallId: 'tc_9' };
const NEWS = 'https://news.example.test/city/cycle-lanes';
const SPA = 'https://results.example.test/menu';

function newsNet(): FakeNet {
  return new FakeNet()
    .on(
      'news.example.test',
      () => new Response(Buffer.from(fixture('news.html'), 'latin1'), { status: 200, headers: { 'content-type': 'text/html' } }),
    )
    .on('results.example.test', () => html(fixture('script-heavy.html')));
}

describe('web.fetch', () => {
  it('AT-139 no keys: no cloud host; the news page is read by Readability on this PC; the script page is read in foo’s window', async () => {
    const net = newsNet();
    const page = new FakePage((u) => (u === SPA ? fixture('script-heavy-rendered.html') : null));
    const w = world({ net, page });
    const tools = new WebTools(w.deps);

    const news = await tools.fetch({ url: NEWS }, ctx);
    expect(news.ok && news.via).toBe('this_pc');
    if (news.ok) {
      expect(news.data.title).toBe('Cycle lanes for the sea front');
      expect(news.data.text).toContain('cycle lanes along the sea front');
      expect(news.data.text).not.toContain('tracking');
      expect(news.forAi.startsWith('<untrusted source="web" ref="tc_9">')).toBe(true);
    }
    const spa = await tools.fetch({ url: SPA }, ctx);
    expect(page.loads).toEqual([SPA]);
    expect(spa.ok && spa.data.text).toContain('Pasta Corner lists twelve dishes');

    for (const h of Object.values(CLOUD_HOSTS)) expect(net.hosts()).not.toContain(h);
    expect(w.turns).toEqual([]);
  });

  it('the local GET sends the Edge user agent and Accept-Language, and sniffs the charset from <meta>', async () => {
    const net = newsNet();
    const r = await new WebTools(world({ net }).deps).fetch({ url: NEWS }, ctx);
    expect(net.requests[0]!.headers['user-agent']).toBe(EDGE_UA);
    expect(net.requests[0]!.headers['accept-language']).toBe('en-IN,hi;q=0.8');
    expect(r.ok && r.data.text).toContain('Café owners');
  });

  it('every redirect hop is re-checked: a redirect to a hand-back site is never read', async () => {
    const net = new FakeNet().on(
      'short.example.test',
      () => new Response(null, { status: 302, headers: { location: 'https://netbanking.example-bank.test/login' } }),
    );
    const w = world({ net, isHandback: (u) => u.hostname.startsWith('netbanking.') });
    expect(await new WebTools(w.deps).fetch({ url: 'https://short.example.test/x' }, ctx)).toEqual({
      ok: false,
      errorKind: 'SITE_HANDBACK',
    });
    expect(net.hosts()).toEqual(['short.example.test']);
  });

  it('hand-back, connector-covered and disallowed URLs are refused before any request', async () => {
    const w = world({
      isHandback: (u) => u.hostname === 'kite.example.test',
      routeOrder: (u) => (u.hostname === 'mail.google.com' ? 'gmail' : null),
      urlAllowed: (u) => u.hostname !== 'localhost',
    });
    const tools = new WebTools(w.deps);
    expect(await tools.fetch({ url: 'https://kite.example.test/' }, ctx)).toEqual({ ok: false, errorKind: 'SITE_HANDBACK' });
    expect(await tools.fetch({ url: 'https://mail.google.com/mail/u/0' }, ctx)).toEqual({ ok: false, errorKind: 'ROUTE_ORDER' });
    expect(await tools.fetch({ url: 'http://localhost:8080/' }, ctx)).toEqual({ ok: false, errorKind: 'URL_NOT_ALLOWED' });
    expect(await tools.fetch({ url: 'file:///C:/x' }, ctx)).toEqual({ ok: false, errorKind: 'URL_NOT_ALLOWED' });
    expect(w.net.requests).toEqual([]);
  });

  it('with a Firecrawl key the page is read by Firecrawl; a signed-in domain is read locally instead', async () => {
    const net = newsNet().on('api.firecrawl.dev', fakeFirecrawl());
    const w = world({ net, settings: () => ({ ...NO_KEYS_SETTINGS, read: 'firecrawl' }), keys: keys({ firecrawl: 'k_fc' }) });
    const tools = new WebTools(w.deps);
    const r = await tools.fetch({ url: NEWS }, ctx);
    expect(r.ok && r.via).toBe('firecrawl');
    expect(w.turns).toMatchObject([{ provider_id: 'firecrawl', cost_paise: 9, outcome: 'ok' }]);

    const held = await tools.fetch({ url: SPA.replace('results', 'shop') }, { ...ctx, heldDomains: ['shop.example.test'] });
    expect(held.ok).toBe(false);
    expect(net.to('api.firecrawl.dev')).toHaveLength(1);
  });

  it('Firecrawl down or success:false → local path, silently', async () => {
    for (const mode of [{ status: 503 }, { body: { success: false } }]) {
      const net = newsNet().on('api.firecrawl.dev', fakeFirecrawl(mode));
      const w = world({ net, settings: () => ({ ...NO_KEYS_SETTINGS, read: 'firecrawl' }), keys: keys({ firecrawl: 'k' }) });
      const r = await new WebTools(w.deps).fetch({ url: NEWS }, ctx);
      expect(r.ok && r.via).toBe('this_pc');
      expect(w.turns[0]).toMatchObject({ outcome: 'error', error_kind: 'CLOUD_DOWN' });
    }
  });

  it('15-min cache per URL', async () => {
    const net = newsNet();
    const w = world({ net });
    const tools = new WebTools(w.deps);
    await tools.fetch({ url: NEWS }, ctx);
    w.clock.advance(FETCH_CACHE_MS - 1);
    await tools.fetch({ url: NEWS }, ctx);
    expect(net.to('news.example.test')).toHaveLength(1);
    w.clock.advance(1);
    await tools.fetch({ url: NEWS }, ctx);
    expect(net.to('news.example.test')).toHaveLength(2);
  });

  it('a body over 2 MB is cut at 2 MB', async () => {
    const big = `<html><body><article><h1>Big</h1><p>${'word '.repeat(600_000)}</p></article></body></html>`;
    const net = new FakeNet().on('big.example.test', () => html(big));
    const r = await new WebTools(world({ net }).deps).fetch({ url: 'https://big.example.test/' }, ctx);
    expect(r.ok && r.data.text.length).toBeLessThanOrEqual(20_000);
  });

  it('needsBrowser with no job window yet is returned to the runner', async () => {
    const net = newsNet();
    expect(await new WebTools(world({ net }).deps).fetch({ url: SPA }, ctx)).toEqual({ ok: false, errorKind: 'needsBrowser' });
  });

  it('Firecrawl 404 on a dead page → local path, and three of them never rest Firecrawl', async () => {
    const net = newsNet().on('api.firecrawl.dev', fakeFirecrawl({ status: 404 }));
    const w = world({ net, settings: () => ({ ...NO_KEYS_SETTINGS, read: 'firecrawl' }), keys: keys({ firecrawl: 'k' }) });
    const tools = new WebTools(w.deps);
    for (let i = 0; i < 4; i++) {
      const r = await tools.fetch({ url: `${NEWS}?p=${i}` }, ctx);
      expect(r.ok && r.via).toBe('this_pc');
    }
    expect(tools.resting.isResting('firecrawl')).toBe(false);
    expect(net.to('api.firecrawl.dev')).toHaveLength(4);
  });
});
