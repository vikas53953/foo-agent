// Spec: Art. 15 (nothing leaves the PC except to services the user chose), 08-2 §8.3.12 a (the user's own keys only; no foo
// server, no foo-paid key), AT-137 web part (a network capture during web jobs: search, page and browse traffic goes only to the
// services whose keys are saved), ART-15b.
import { describe, expect, it } from 'vitest';
import { WebTools } from '../../src/engine/tools/web/WebTools';
import type { WebProvider, WebSettings } from '../../src/engine/tools/web/types';
import { fakeBrowserUse } from '../fakes/web/browseruse';
import { fakeExa } from '../fakes/web/exa';
import { fakeFirecrawl } from '../fakes/web/firecrawl';
import { CLOUD_HOSTS, FakeNet, FakePage, fixture, html, keys, NO_KEYS_SETTINGS, world } from '../fakes/web/net';
import { fakeTavily } from '../fakes/web/tavily';

/** Sites the jobs themselves ask to read (allowed whatever keys are saved). */
const SITES = ['news.example.test', 'results.example.test'];

async function runJobs(saved: Partial<Record<WebProvider, string>>, settings: WebSettings): Promise<string[]> {
  const net = new FakeNet()
    .on(CLOUD_HOSTS.exa, fakeExa())
    .on(CLOUD_HOSTS.tavily, fakeTavily())
    .on(CLOUD_HOSTS.firecrawl, fakeFirecrawl())
    .on(CLOUD_HOSTS.browseruse, fakeBrowserUse().handler)
    .on('news.example.test', () => html(fixture('news.html')))
    .on('results.example.test', () => html(fixture('script-heavy.html')));
  const page = new FakePage((u) => (u.includes('bing.com') ? fixture('bing.html') : fixture('script-heavy-rendered.html')));
  const w = world({ net, page, settings: () => settings, keys: keys(saved) });
  const tools = new WebTools(w.deps);
  const ctx = { chatId: 'c_1', jobId: 'j_1', toolCallId: 'tc_n' };
  await tools.search({ query: 'italian places in bandra' }, ctx);
  await tools.fetch({ url: 'https://news.example.test/city' }, ctx);
  await tools.fetch({ url: 'https://results.example.test/menu' }, ctx);
  await tools.browseCloud({ url: 'https://news.example.test/city', goal: 'list the main points' }, ctx);
  return net.hosts();
}

describe('ART-net-web: web traffic goes only to services whose keys are saved', () => {
  it('AT-137 no keys: no cloud web host at all', async () => {
    const hosts = await runJobs({}, NO_KEYS_SETTINGS);
    expect(hosts.filter((h) => !SITES.includes(h))).toEqual([]);
  });

  it('AT-137 an Exa key only: Exa and nothing else in the cloud', async () => {
    const hosts = await runJobs({ exa: 'k' }, { ...NO_KEYS_SETTINGS, search: 'exa' });
    expect(hosts.filter((h) => !SITES.includes(h))).toEqual([CLOUD_HOSTS.exa]);
  });

  it('AT-137 settings point at a service whose key is missing: that service is never contacted', async () => {
    const hosts = await runJobs({ tavily: 'k' }, { ...NO_KEYS_SETTINGS, search: 'tavily', read: 'firecrawl', cloudBrowser: true });
    expect(hosts.filter((h) => !SITES.includes(h))).toEqual([CLOUD_HOSTS.tavily]);
  });

  it('AT-137 all four keys: exactly the four services, no other host', async () => {
    const hosts = await runJobs(
      { tavily: 'k1', firecrawl: 'k2', browseruse: 'k3' },
      { ...NO_KEYS_SETTINGS, search: 'tavily', read: 'firecrawl', cloudBrowser: true },
    );
    expect(hosts.filter((h) => !SITES.includes(h)).sort()).toEqual(
      [CLOUD_HOSTS.browseruse, CLOUD_HOSTS.firecrawl, CLOUD_HOSTS.tavily].sort(),
    );
  });
});
