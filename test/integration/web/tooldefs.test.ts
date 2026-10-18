// Spec: 08-2 §8.2 (web tools are class `read`; `web.fetch` returns `ReadResult | needsBrowser`), 08-4 §27.1 (descriptions shown
// to the AI, exact), G-M9-13 / 08-0 §E.8 (`vault.use({ purpose: 'web_tool', name: 'foo/web_key/{provider}' })`).
import { describe, expect, it } from 'vitest';
import { memoryVault, vaultWebKeys, webToolDefs, type EngineWeb } from '../../../src/engine/tools/web';
import { WebTools } from '../../../src/engine/tools/web/WebTools';
import { FakeNet, fixture, html, world } from '../../fakes/web/net';

const run = { jobId: 'j_1', signal: new AbortController().signal, now: 0 };

describe('web ToolDefs', () => {
  it('three read tools with the §27.1 descriptions', () => {
    const defs = webToolDefs({ tools: new WebTools(world().deps), checkKey: async () => 'unknown' });
    expect(Object.values(defs).map((d) => [d.name, d.actionClass, d.description])).toEqual([
      ['web.search', 'read', 'Search the web. Returns up to 10 results with title, address and snippet.'],
      ['web.fetch', 'read', 'Read a public web page as text.'],
      [
        'web.browseCloud',
        'read',
        'Have a reading assistant browse public pages for a goal and report back. It cannot sign in, buy, book or send.',
      ],
    ]);
  });

  it('web.fetch: needsBrowser is a result, errors are error kinds, bad args are PROTOCOL_INVALID', async () => {
    const net = new FakeNet().on('results.example.test', () => html(fixture('script-heavy.html')));
    const web: EngineWeb = {
      tools: new WebTools(world({ net, isHandback: (u) => u.hostname === 'bank.test' }).deps),
      checkKey: async () => 'unknown',
    };
    const defs = webToolDefs(web);
    expect(await defs['web.fetch']!.run({ url: 'https://results.example.test/m' }, run)).toEqual({
      kind: 'ok',
      result: { needsBrowser: true, url: 'https://results.example.test/m' },
    });
    expect(await defs['web.fetch']!.run({ url: 'https://bank.test/' }, run)).toEqual({ kind: 'error', errorKind: 'SITE_HANDBACK' });
    expect(await defs['web.search']!.run({ q: 'x' }, run)).toEqual({ kind: 'error', errorKind: 'PROTOCOL_INVALID' });
  });

  it('keys come from vault.use with purpose web_tool and the foo/web_key name; the value is registered before use', async () => {
    const seen: string[] = [];
    const keys = vaultWebKeys(memoryVault({ 'foo/web_key/exa': 'k_exa' }), (h) => seen.push(h));
    expect(await keys.use('exa')).toBe('k_exa');
    expect(await keys.use('tavily')).toBeNull();
    expect(seen).toEqual(['foo/web_key/exa']);
  });
});
