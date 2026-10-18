// Spec: 08-4 §27.3 (wire contract per provider: request, response mapping, timeouts; item 1 key check: 200 → ok, 401/403 →
// refused, anything else → unknown; item 2 error kinds), 08-1 §2.4 `webkey.check`.
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../src/shared/clock';
import { browseruse } from '../../../src/engine/tools/web/browseruse';
import { exa } from '../../../src/engine/tools/web/exa';
import { firecrawl } from '../../../src/engine/tools/web/firecrawl';
import { cloudRequest, TIMEOUT_MS } from '../../../src/engine/tools/web/http';
import { checkWebKey } from '../../../src/engine/tools/web/keyCheck';
import { tavily } from '../../../src/engine/tools/web/tavily';
import { fakeBrowserUse } from '../../fakes/web/browseruse';
import { fakeExa } from '../../fakes/web/exa';
import { fakeFirecrawl } from '../../fakes/web/firecrawl';
import { FakeNet, json, RESOURCE } from '../../fakes/web/net';
import { fakeTavily } from '../../fakes/web/tavily';

const clock = new FakeClock();

describe('provider clients against their fakes (08-4 §27.3)', () => {
  it('Exa: POST /search with x-api-key and the India-biased body; maps highlights[0] and the host', async () => {
    const net = new FakeNet().on('api.exa.ai', fakeExa());
    const r = await cloudRequest({ fetch: net.fetch, clock }, exa.search(RESOURCE.exa.base, 'k_exa', 'italian bandra', 25), TIMEOUT_MS.exa);
    expect(r.ok).toBe(true);
    const sent = net.requests[0]!;
    expect(sent.headers['x-api-key']).toBe('k_exa');
    expect(JSON.parse(sent.body)).toEqual({
      query: 'italian bandra',
      numResults: 10,
      type: 'auto',
      userLocation: 'IN',
      contents: { highlights: { maxCharacters: 400, highlightsPerUrl: 1 } },
    });
    expect(exa.map(r.ok ? r.body : null)).toEqual([
      { title: 'Trattoria Uno, Bandra West', url: 'https://example-food.test/trattoria-uno', snippet: 'Wood-fired pizza and fresh pasta on Hill Road.', site: 'example-food.test', date: '2026-09-01T00:00:00.000Z' },
      { title: 'Pasta Corner', url: 'https://www.example-guide.test/bandra/pasta-corner', snippet: '', site: 'www.example-guide.test', date: null },
    ]);
  });

  it('Tavily: POST /search with Bearer and basic depth for India; content cut to 400 chars', async () => {
    const net = new FakeNet().on('api.tavily.com', fakeTavily());
    const r = await cloudRequest({ fetch: net.fetch, clock }, tavily.search(RESOURCE.tavily.base, 'k_tav', 'cafe', 5), TIMEOUT_MS.tavily);
    expect(net.requests[0]!.headers.authorization).toBe('Bearer k_tav');
    expect(JSON.parse(net.requests[0]!.body)).toEqual({ query: 'cafe', max_results: 5, search_depth: 'basic', country: 'india', include_answer: false });
    const [hit] = tavily.map(r.ok ? r.body : null);
    expect(hit!.snippet).toHaveLength(400);
    expect(hit!.date).toBe('2026-10-01');
  });

  it('Firecrawl: POST /v2/scrape for main-content markdown; markdown capped at 20,000 chars; success:false → null', async () => {
    const net = new FakeNet().on('api.firecrawl.dev', fakeFirecrawl());
    const r = await cloudRequest(
      { fetch: net.fetch, clock },
      firecrawl.scrape(RESOURCE.firecrawl.base, 'k_fc', 'https://example-food.test/menu'),
      TIMEOUT_MS.firecrawl,
    );
    expect(net.requests[0]!.headers.authorization).toBe('Bearer k_fc');
    expect(JSON.parse(net.requests[0]!.body)).toEqual({ url: 'https://example-food.test/menu', formats: ['markdown'], onlyMainContent: true, timeout: 30000 });
    const page = firecrawl.map(r.ok ? r.body : null);
    expect(page!.text.length).toBe(20_000);
    expect(page!.title).toBe('Menu · Trattoria Uno');
    expect(page!.site).toBe('example-food.test');
    expect(firecrawl.map({ success: false })).toBeNull();
    expect(firecrawl.map({ success: true, data: {} })).toBeNull();
  });

  it('Browser Use: POST /tasks with the header, allowedDomains = the start host and maxSteps 20', () => {
    const req = browseruse.create(RESOURCE.browseruse.base, 'k_bu', 'list italian places', 'https://example-guide.test/bandra');
    expect(req.url).toBe('https://api.browser-use.com/api/v2/tasks');
    expect(req.headers['X-Browser-Use-API-Key']).toBe('k_bu');
    expect(req.body).toEqual({ task: 'list italian places', startUrl: 'https://example-guide.test/bandra', allowedDomains: ['example-guide.test'], maxSteps: 20 });
    expect(browseruse.stop(RESOURCE.browseruse.base, 'k_bu', 'task_1')).toMatchObject({ method: 'PATCH', body: { action: 'stop' } });
  });

  it('errors: 401/403 → CLOUD_AUTH, 402/429 → CLOUD_QUOTA, 5xx and network → CLOUD_DOWN', async () => {
    const cases: [number, string][] = [
      [401, 'CLOUD_AUTH'],
      [403, 'CLOUD_AUTH'],
      [402, 'CLOUD_QUOTA'],
      [429, 'CLOUD_QUOTA'],
      [500, 'CLOUD_DOWN'],
      [503, 'CLOUD_DOWN'],
    ];
    for (const [status, kind] of cases) {
      const net = new FakeNet().on('api.exa.ai', fakeExa({ status }));
      const r = await cloudRequest({ fetch: net.fetch, clock }, exa.search(RESOURCE.exa.base, 'k', 'q', 3), 10_000);
      expect(r.ok ? 'ok' : r.kind).toBe(kind);
    }
    const quotaBody = new FakeNet().on('api.exa.ai', () => json(400, { error: 'You have run out of credits' }));
    const q = await cloudRequest({ fetch: quotaBody.fetch, clock }, exa.search(RESOURCE.exa.base, 'k', 'q', 3), 10_000);
    expect(q.ok ? 'ok' : q.kind).toBe('CLOUD_QUOTA');
    const offline = await cloudRequest({ fetch: new FakeNet().fetch, clock }, exa.search(RESOURCE.exa.base, 'k', 'q', 3), 10_000);
    expect(offline.ok ? 'ok' : offline.kind).toBe('CLOUD_DOWN');
  });

  it('a request past its deadline is aborted and is CLOUD_DOWN', async () => {
    const c = new FakeClock();
    const hang = (_u: string, init: RequestInit): Promise<Response> =>
      new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    const p = cloudRequest({ fetch: hang, clock: c }, exa.search(RESOURCE.exa.base, 'k', 'q', 3), TIMEOUT_MS.exa);
    c.advance(TIMEOUT_MS.exa);
    expect(await p).toEqual({ ok: false, kind: 'CLOUD_DOWN', status: null, timeout: true });
  });
});

describe('webkey.check → ok | refused | unknown (08-4 §27.3 item 1)', () => {
  it('uses one harmless call per provider and maps 200 / 401-403 / other', async () => {
    const bu = fakeBrowserUse();
    const net = new FakeNet()
      .on('api.exa.ai', fakeExa())
      .on('api.tavily.com', fakeTavily({ status: 401 }))
      .on('api.firecrawl.dev', fakeFirecrawl({ status: 500 }))
      .on('api.browser-use.com', bu.handler);
    const deps = { fetch: net.fetch, clock, resource: RESOURCE };
    expect(await checkWebKey(deps, 'exa', 'k1')).toBe('ok');
    expect(await checkWebKey(deps, 'tavily', 'k2')).toBe('refused');
    expect(await checkWebKey(deps, 'firecrawl', 'k3')).toBe('unknown');
    expect(await checkWebKey(deps, 'browseruse', 'k4')).toBe('ok');
    expect(JSON.parse(net.to('api.exa.ai')[0]!.body).query).toBe('foo');
    expect(JSON.parse(net.to('api.tavily.com')[0]!.body).query).toBe('foo');
    expect(JSON.parse(net.to('api.firecrawl.dev')[0]!.body).url).toBe('https://example.com');
    expect(net.to('api.browser-use.com')[0]).toMatchObject({ method: 'GET', path: '/api/v2/me' });
  });
});
