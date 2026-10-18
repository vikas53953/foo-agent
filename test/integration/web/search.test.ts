// Spec: 08-2 §8.2 `web.search` (Exa key → Exa, Tavily key instead → Tavily; ≤ 10 results; untrusted wrap; no key, refused,
// quota or down → Bing in the job window, ads and AI-answer modules skipped; challenge → DuckDuckGo HTML once → SEARCH_BUSY;
// silent fallback; a used-up key adds one line to the next brief), §8.3.12 f (3 failures in a row → resting 1 h), 08-4 §27.3
// items 2–3 (error kinds; offline → NET_OFFLINE, no cloud and no Bing attempt), AT-138.
import { describe, expect, it } from 'vitest';
import { WebTools } from '../../../src/engine/tools/web/WebTools';
import { REST_MS } from '../../../src/engine/tools/web/resting';
import { fakeExa } from '../../fakes/web/exa';
import { fakeTavily } from '../../fakes/web/tavily';
import { EXA_KEY_SETTINGS, FakeNet, FakePage, fixture, keys, NO_KEYS_SETTINGS, world } from '../../fakes/web/net';

const ctx = { chatId: 'c_trips', jobId: 'j_1', toolCallId: 'tc_1' };
const bingPage = (url: string): string | null =>
  url.startsWith('https://www.bing.com/') ? fixture('bing.html') : url.startsWith('https://html.duckduckgo.com/') ? fixture('ddg.html') : null;

describe('web.search', () => {
  it('AT-138 with an Exa key the fake Exa endpoint is called once and results reach the AI wrapped as untrusted', async () => {
    const net = new FakeNet().on('api.exa.ai', fakeExa());
    const page = new FakePage(bingPage);
    const w = world({ net, page, settings: () => EXA_KEY_SETTINGS, keys: keys({ exa: 'k_exa_fake' }) });
    const r = await new WebTools(w.deps).search({ query: 'Italian places in Bandra' }, ctx);
    expect(net.to('api.exa.ai')).toHaveLength(1);
    expect(page.loads).toEqual([]);
    expect(r.ok && r.via).toBe('exa');
    if (!r.ok) return;
    expect(r.data.map((x) => x.title)).toEqual(['Trattoria Uno, Bandra West', 'Pasta Corner']);
    expect(r.forAi.startsWith('<untrusted source="web" ref="tc_1">')).toBe(true);
    expect(r.forAi.endsWith('</untrusted>')).toBe(true);
    expect(w.turns).toMatchObject([{ purpose: 'web', provider_id: 'exa', billing: 'key', cost_source: 'priced', cost_paise: 44, outcome: 'ok', chat_id: 'c_trips', job_id: 'j_1' }]);
  });

  it.each([401, 429, 500])('AT-138 Exa %i → the same search runs on Bing in foo’s window, silently', async (status) => {
    const net = new FakeNet().on('api.exa.ai', fakeExa({ status }));
    const page = new FakePage(bingPage);
    const w = world({ net, page, settings: () => EXA_KEY_SETTINGS, keys: keys({ exa: 'k_exa_fake' }) });
    const r = await new WebTools(w.deps).search({ query: 'Italian places in Bandra' }, ctx);
    expect(r.ok && r.via).toBe('this_pc');
    expect(page.loads).toEqual(['https://www.bing.com/search?q=Italian%20places%20in%20Bandra&cc=IN&setlang=en-IN']);
    if (r.ok) expect(r.data.map((x) => x.url)).toEqual(['https://example-food.test/trattoria-uno', 'https://www.example-guide.test/bandra/pasta-corner']);
    expect(w.turns[0]).toMatchObject({ outcome: 'error', error_kind: status === 401 ? 'CLOUD_AUTH' : status === 429 ? 'CLOUD_QUOTA' : 'CLOUD_DOWN' });
    // A used-up key adds one line to the next brief; a refused key is stored by main; neither is a message now.
    expect(w.quota).toEqual(status === 429 ? ['exa'] : []);
    expect(w.refused).toEqual(status === 401 ? ['exa'] : []);
  });

  it('Bing ads and the AI-answer module are skipped; at most max results', async () => {
    const w = world({ page: new FakePage(bingPage) });
    const r = await new WebTools(w.deps).search({ query: 'pizza', max: 1 }, ctx);
    expect(r.ok && r.data).toEqual([
      { title: 'Trattoria Uno, Bandra West', url: 'https://example-food.test/trattoria-uno', snippet: 'Wood-fired pizza and fresh pasta on Hill Road.', site: 'example-food.test', date: null },
    ]);
  });

  it('a Bing challenge is never solved: one retry on DuckDuckGo HTML, then SEARCH_BUSY', async () => {
    const ddgOk = new FakePage((u) => (u.includes('bing.com') ? fixture('bing-challenge.html') : fixture('ddg.html')));
    const r1 = await new WebTools(world({ page: ddgOk }).deps).search({ query: 'cafe' }, ctx);
    expect(ddgOk.loads.map((u) => new URL(u).host)).toEqual(['www.bing.com', 'html.duckduckgo.com']);
    expect(r1.ok && r1.data).toEqual([{ title: 'Cafe Due', url: 'https://example-cafe.test/due', snippet: 'Italian cafe with garden seating.', site: 'example-cafe.test', date: null }]);

    const both = new FakePage((u) => (u.includes('bing.com') ? fixture('bing-challenge.html') : fixture('ddg-challenge.html')));
    const r2 = await new WebTools(world({ page: both }).deps).search({ query: 'cafe' }, ctx);
    expect(r2).toEqual({ ok: false, errorKind: 'SEARCH_BUSY' });
    expect(both.loads).toHaveLength(2);
  });

  it('Tavily is used when it is the saved search service', async () => {
    const net = new FakeNet().on('api.tavily.com', fakeTavily());
    const w = world({ net, settings: () => ({ ...NO_KEYS_SETTINGS, search: 'tavily' }), keys: keys({ tavily: 'k_tav' }) });
    const r = await new WebTools(w.deps).search({ query: 'cafe' }, ctx);
    expect(r.ok && r.via).toBe('tavily');
    expect(net.hosts()).toEqual(['api.tavily.com']);
  });

  it('a refused key is not called again; local path instead', async () => {
    const net = new FakeNet().on('api.exa.ai', fakeExa());
    const w = world({ net, page: new FakePage(bingPage), settings: () => ({ ...EXA_KEY_SETTINGS, refused: { ...EXA_KEY_SETTINGS.refused, exa: true } }), keys: keys({ exa: 'k' }) });
    const r = await new WebTools(w.deps).search({ query: 'cafe' }, ctx);
    expect(r.ok && r.via).toBe('this_pc');
    expect(net.requests).toEqual([]);
  });

  it('3 failures in a row → Exa rests for 1 h, then is tried again', async () => {
    const net = new FakeNet().on('api.exa.ai', fakeExa({ status: 503 }));
    const w = world({ net, page: new FakePage(bingPage), settings: () => EXA_KEY_SETTINGS, keys: keys({ exa: 'k' }) });
    const tools = new WebTools(w.deps);
    for (let i = 0; i < 4; i++) await tools.search({ query: 'cafe' }, ctx);
    expect(net.to('api.exa.ai')).toHaveLength(3);
    w.clock.advance(REST_MS - 1);
    await tools.search({ query: 'cafe' }, ctx);
    expect(net.to('api.exa.ai')).toHaveLength(3);
    w.clock.advance(1);
    await tools.search({ query: 'cafe' }, ctx);
    expect(net.to('api.exa.ai')).toHaveLength(4);
  });

  it('offline: NET_OFFLINE with no cloud and no Bing attempt', async () => {
    const net = new FakeNet().on('api.exa.ai', fakeExa());
    const page = new FakePage(bingPage);
    const w = world({ net, page, online: () => false, settings: () => EXA_KEY_SETTINGS, keys: keys({ exa: 'k' }) });
    expect(await new WebTools(w.deps).search({ query: 'cafe' }, ctx)).toEqual({ ok: false, errorKind: 'NET_OFFLINE' });
    expect(net.requests).toEqual([]);
    expect(page.loads).toEqual([]);
  });

  it('Bing setlang follows the user’s language', async () => {
    const page = new FakePage(bingPage);
    await new WebTools(world({ page, searchLang: () => 'hi' }).deps).search({ query: 'cafe' }, ctx);
    expect(page.loads[0]).toContain('&setlang=hi');
  });
});
