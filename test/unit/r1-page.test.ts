// Spec: 04 §13.6 (AI page: the `foo-page://{pageId}` document is the only request its frame may make; ≤ 512 KB; the
// bridge allows 10 calls per second, logs every call, refuses secret text and posts the Secret box; openLink only after
// main passed it), CR-0022 AT-357, AT-359, AT-360, AT-361, picks 12-14, X-180. Main's page modules, the host bridge
// helpers, and the release gate's fenced text (pick 14).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { MessageRow } from '../../src/shared/types';

vi.mock('electron', () => ({ protocol: {}, shell: { openExternal: vi.fn() }, BrowserWindow: class {} }));
const stored = vi.hoisted(() => ({ message: null as unknown }));
vi.mock('../../src/main/store/queries', async (real) => ({
  ...(await real<object>()),
  messageGet: () => stored.message,
}));

import { PAGE_MAX_HEIGHT, PAGE_RPC_PER_SECOND, PageRpcCallSchema } from '../../src/shared/kit/page';
import { PAGE_MAX_BYTES } from '../../src/shared/kit/parse';
import { newId } from '../../src/shared/ids';
import { LINK_TTL_MS, MAX_PAGES, pageBodies, PageRegistry, pageUrl } from '../../src/main/page/pages';
import { pageIdOf, pageRequestVerdict, PAGE_HEADERS } from '../../src/main/page/pageScheme';
import { callText, openPage, openPageLink, pageRpc, secretSlot } from '../../src/main/page/pageIpc';
import { asJson, callId, floodGate, frameHeight, linkDomain, rpcReply } from '../../src/renderer/page/bridge';
import { CSP } from '../../src/main/windows/protocol';
import { ReleaseGate } from '../../src/engine/prompt/releaseGate';
import { FakeClock } from '../../src/shared/clock';

const HTML = '<!doctype html><p>Food budget</p>';
const serve = (r = new PageRegistry(), html = HTML) => ({ r, page: r.serve('c_1', 'm:m_1:0', html, 1_000)! });

describe('page blocks in foo text', () => {
  it('finds each closed and open ```page fence in order and skips other fences', () => {
    const text = 'Hi\n\n```page\n<p>a</p>\n```\n\n```js\nx\n```\n\n```page\n<p>b</p>';
    expect(pageBodies(text)).toEqual([
      { body: '<p>a</p>', closed: true },
      { body: '<p>b</p>', closed: false },
    ]);
  });
});

describe('the page registry', () => {
  it('serves a page under a pg_ id and keeps the id when the same block is opened again', () => {
    const { r, page } = serve();
    expect(page.pageId).toMatch(/^pg_/);
    expect(r.serve('c_1', 'm:m_1:0', HTML, 2_000)!.pageId).toBe(page.pageId);
    expect(r.get(page.pageId)?.html).toBe(HTML);
    expect(pageUrl(page.pageId)).toBe(`foo-page://${page.pageId}/`);
  });

  it('refuses a page over 512 KB', () => {
    expect(new PageRegistry().serve('c_1', 's', 'x'.repeat(PAGE_MAX_BYTES + 1), 0)).toBeNull();
    expect(new PageRegistry().serve('c_1', 's', 'x'.repeat(PAGE_MAX_BYTES), 0)).not.toBeNull();
  });

  it('allows 10 calls in a second and refuses the 11th', () => {
    const { r, page } = serve();
    const answers = Array.from({ length: PAGE_RPC_PER_SECOND + 1 }, (_, i) => r.allowCall(page.pageId, 5_000 + i));
    expect(answers.filter(Boolean)).toHaveLength(PAGE_RPC_PER_SECOND);
    expect(answers.at(-1)).toBe(false);
    expect(r.allowCall(page.pageId, 7_000)).toBe(true);
  });

  it('opens an offered link once, and never one no page offered', () => {
    const r = new PageRegistry();
    r.offerLink('https://example.com/a', 0);
    expect(r.takeLink('https://example.com/a', 10)).toBe(true);
    expect(r.takeLink('https://example.com/a', 10)).toBe(false);
    expect(r.takeLink('https://example.com/b', 10)).toBe(false);
  });

  it('keeps an offered link for 60 s only, and sweeps old offers', () => {
    const r = new PageRegistry();
    expect(LINK_TTL_MS).toBe(60_000);
    r.offerLink('https://example.com/a', 0);
    expect(r.takeLink('https://example.com/a', LINK_TTL_MS + 1)).toBe(false);
    r.offerLink('https://example.com/b', 0);
    r.offerLink('https://example.com/c', LINK_TTL_MS + 1); // sweeps b
    r.offerLink('https://example.com/b', LINK_TTL_MS + 2);
    expect(r.takeLink('https://example.com/b', LINK_TTL_MS + 3)).toBe(true);
  });

  it('forgets the old page when a block is served with new HTML: its id, its calls', () => {
    const { r, page } = serve();
    r.allowCall(page.pageId, 1_000);
    const next = r.serve('c_1', 'm:m_1:0', '<p>edited</p>', 2_000)!;
    expect(next.pageId).not.toBe(page.pageId);
    expect(r.get(page.pageId)).toBeUndefined();
    expect(r.size).toBe(1);
  });

  it(`keeps at most ${MAX_PAGES} pages, dropping the least recently used`, () => {
    const r = new PageRegistry();
    const ids = Array.from({ length: MAX_PAGES }, (_, i) => r.serve('c_1', `m:m_${i}:0`, `<p>${i}</p>`, i)!.pageId);
    r.get(ids[0]!); // used again: now the newest
    const extra = r.serve('c_1', 'm:m_new:0', '<p>new</p>', 100)!;
    expect(r.size).toBe(MAX_PAGES);
    expect(r.get(ids[0]!)).toBeDefined();
    expect(r.get(ids[1]!)).toBeUndefined();
    expect(r.get(extra.pageId)).toBeDefined();
    // The dropped block gets a fresh id when it is opened again.
    expect(r.serve('c_1', 'm:m_1:0', '<p>1</p>', 200)!.pageId).not.toBe(ids[1]);
  });
});

describe('page:open', () => {
  const PAGE_TEXT = 'Here.\n\n```page\n<p>Food budget</p>\n```';
  const row = (over: Partial<MessageRow>) =>
    ({ id: 'm_1', chatId: 'c_1', authorKind: 'foo', status: 'complete', deletedAt: null, text: PAGE_TEXT, ...over }) as MessageRow;
  const open = (over: Partial<MessageRow>) => {
    stored.message = row(over);
    return openPage({ db: {} as never }, new PageRegistry(), { chatId: 'c_1', messageId: 'm_1', index: 0 }, 0);
  };

  it("serves a page only from foo's own live reply (CR-0022 pick 12)", () => {
    expect(open({})).toHaveProperty('pageId');
    for (const authorKind of ['user', 'helper', 'system'] as const) expect(open({ authorKind })).toEqual({ failed: 'not_found' });
    expect(open({ deletedAt: 5 })).toEqual({ failed: 'not_found' });
    expect(open({ status: 'streaming' })).toEqual({ failed: 'not_found' });
    expect(open({ chatId: 'c_2' })).toEqual({ failed: 'not_found' });
  });
});

describe('the foo-page scheme and the request rule', () => {
  it('names a page id only for the exact document URL', () => {
    const id = newId('pg');
    expect(pageIdOf(`foo-page://${id}/`)).toBe(id);
    for (const bad of [`foo-page://${id}/x`, `foo-page://${id}/?a=1`, `app://${id}/`, 'foo-page://pg_nope/', 'nonsense'])
      expect(pageIdOf(bad)).toBeNull();
  });

  it('turns DNS prefetch off for page documents', () => {
    expect(PAGE_HEADERS['X-DNS-Prefetch-Control']).toBe('off');
  });

  it('keeps one onBeforeRequest listener: only the page deny rule sets it (a second one would replace it)', () => {
    const callers: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(name) && /\.onBeforeRequest\(/.test(readFileSync(path, 'utf8'))) callers.push(path);
      }
    };
    walk('src');
    expect(callers).toEqual([join('src', 'main', 'page', 'pageScheme.ts')]);
  });

  it('serves pages with the 04 §13.6 header CSP, and the app CSP allows only foo-page frames', () => {
    expect(PAGE_HEADERS['Content-Security-Policy']).toBe(
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'; frame-src 'none'; connect-src 'none'",
    );
    expect(CSP).toBe(
      "default-src 'self' app:; img-src 'self' app: data: blob:; style-src 'self' 'unsafe-inline'; connect-src 'none'; frame-src foo-page:",
    );
  });

  it('allows only the page document; denies fetches, images, navigations and other pages from the frame', () => {
    const { r, page } = serve();
    const doc = pageUrl(page.pageId);
    const other = r.serve('c_1', 'm:m_2:0', '<p>other</p>', 0)!;
    const verdict = (url: string, resourceType: string, frameUrl?: string) => pageRequestVerdict({ url, resourceType, frameUrl }, r);
    expect(verdict(doc, 'subFrame', 'app://foo/index.html')).toBe('allow');
    expect(verdict(doc, 'subFrame', doc)).toBe('allow');
    expect(verdict('https://example.com/x', 'xhr', doc)).toBe('deny');
    expect(verdict('https://example.com/a.png', 'image', doc)).toBe('deny');
    expect(verdict('https://example.com/', 'subFrame', doc)).toBe('deny');
    expect(verdict(pageUrl(other.pageId), 'subFrame', doc)).toBe('deny');
    expect(verdict(pageUrl(newId('pg')), 'subFrame', 'app://foo/index.html')).toBe('deny');
    expect(verdict(`${doc}x`, 'subFrame', 'app://foo/index.html')).toBe('deny');
    expect(verdict(doc, 'xhr', 'app://foo/index.html')).toBe('deny');
    // foo's own requests are not the rule's.
    expect(verdict('app://foo/assets/main.js', 'script', 'app://foo/index.html')).toBe('allow');
  });
});

describe('page:rpc in main', () => {
  const world = () => {
    const { r, page } = serve();
    const offers: string[] = [];
    let now = 10_000;
    const d = { registry: r, now: () => now++, offerSecret: (_c: string, slot: string) => void offers.push(slot) };
    return { r, page, offers, d };
  };
  const call = (method: string, params: object) => PageRpcCallSchema.parse({ jsonrpc: '2.0', id: 1, method, params });

  it('passes a clean call and offers its link', () => {
    const { r, page, d } = world();
    expect(pageRpc(d, { chatId: 'c_1', pageId: page.pageId, call: call('openLink', { url: 'https://example.com/menu' }) })).toEqual({
      ok: true,
    });
    expect(r.takeLink('https://example.com/menu', 10_100)).toBe(true);
  });

  it('refuses secret text and posts the Secret box', () => {
    const { page, offers, d } = world();
    const text = 'my key is sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789';
    expect(secretSlot(text)).toBe('openai');
    expect(pageRpc(d, { chatId: 'c_1', pageId: page.pageId, call: call('requestAction', { text }) })).toEqual({
      ok: false,
      refused: 'secret',
    });
    expect(offers).toEqual(['openai']);
  });

  it('refuses a page from another chat or one main is not serving', () => {
    const { page, d } = world();
    expect(pageRpc(d, { chatId: 'c_2', pageId: page.pageId, call: call('reportSize', { height: 10 }) }).ok).toBe(false);
    expect(pageRpc(d, { chatId: 'c_1', pageId: newId('pg'), call: call('reportSize', { height: 10 }) }).ok).toBe(false);
  });

  it('refuses the 11th call in a second', () => {
    const { page, d } = world();
    const results = Array.from({ length: 11 }, () =>
      pageRpc(d, { chatId: 'c_1', pageId: page.pageId, call: call('reportSize', { height: 100 }) }),
    );
    expect(results.at(-1)).toEqual({ ok: false, refused: 'rate' });
  });

  it('reads the text of each call (a URL counts) and none of reportSize', () => {
    expect(callText(call('reportSize', { height: 1 }))).toBeNull();
    expect(callText(call('draftMessage', { text: 'hi' }))).toBe('hi');
    expect(callText(call('openLink', { url: 'https://example.com/' }))).toBe('https://example.com/');
  });

  it('refuses links that are not https in the call schema', () => {
    expect(PageRpcCallSchema.safeParse({ jsonrpc: '2.0', id: 1, method: 'openLink', params: { url: 'http://example.com' } }).success).toBe(
      false,
    );
  });

  it('opens an ai_page link through app:openExternal only after the page offered it', async () => {
    const r = new PageRegistry();
    const opened: string[] = [];
    expect((await openPageLink('https://example.com/', opened, r)).ok).toBe(false);
    r.offerLink('https://example.com/', Date.now());
    const prev = process.env.FOO_TEST;
    process.env.FOO_TEST = '1';
    expect((await openPageLink('https://example.com/', opened, r)).ok).toBe(true);
    process.env.FOO_TEST = prev;
    expect(opened).toEqual(['https://example.com/']);
  });
});

describe('the host bridge helpers', () => {
  it('caps the frame at 600px', () => {
    expect(frameHeight(240.2)).toBe(241);
    expect(frameHeight(5_000)).toBe(PAGE_MAX_HEIGHT);
    expect(frameHeight(-3)).toBe(0);
  });

  it('answers with JSON-RPC results or errors, never markup', () => {
    expect(rpcReply(3, { ok: true })).toEqual({ jsonrpc: '2.0', id: 3, result: {} });
    expect(rpcReply(4, { ok: false, refused: 'rate' })).toEqual({
      jsonrpc: '2.0',
      id: 4,
      error: { code: -32000, message: 'refused', data: { reason: 'rate' } },
    });
  });

  it('copies only JSON, reads the call id, gates floods and names link domains', () => {
    expect(asJson({ a: 1, f: () => 1 })).toEqual({ a: 1 });
    expect(asJson('x'.repeat(20_000))).toBeNull();
    expect(callId({ id: 7 })).toBe(7);
    expect(callId({ id: '7' })).toBeNull();
    const gate = floodGate(2);
    expect([gate(0), gate(1), gate(2), gate(1_500)]).toEqual([true, true, false, true]);
    expect(linkDomain('https://www.example.com/a')).toBe('example.com');
  });
});

describe('fenced text in the release gate (CR-0022 pick 14)', () => {
  const PAGE = '```page\n<script>var plan = JSON.parse("{}");</script>\n```';
  const A2UI = '```a2ui\n{"token":"t1"}\n```';

  const run = async (chunks: string[], streaming: boolean, redactor?: { scrub: (t: string) => { text: string; hits: number } }) => {
    const clock = new FakeClock();
    const out: string[] = [];
    const rewrites: string[] = [];
    const gate = new ReleaseGate({
      clock,
      ...(redactor ? { redactor } : {}),
      rewrite: async (x) => (rewrites.push(x), null),
      onRelease: (x) => out.push(x),
      onSayClosed: () => undefined,
    });
    if (streaming) clock.advance(1_500);
    for (const c of chunks) {
      gate.feed(c);
      await Promise.resolve();
    }
    gate.end();
    await gate.done;
    return { text: out.join(''), out, rewrites };
  };

  it('streams a page script with "JSON" and an a2ui line with "token" unchanged; prose outside is still filtered', async () => {
    const say = `Your token is ready.\n\n${PAGE}\n\n${A2UI}\n\nThe JSON is gone. Done.`;
    const r = await run(['<say>', say.slice(0, 40), say.slice(40, 90), say.slice(90), '</say>'], true);
    expect(r.text).toContain(PAGE);
    expect(r.text).toContain(A2UI);
    expect(r.text.startsWith('Your key is ready.')).toBe(true);
    expect(r.text).not.toMatch(/The JSON is gone/);
    expect(r.text.endsWith('Done.')).toBe(true);
    expect(r.rewrites).toEqual(['The JSON is gone. ']);
  });

  it('does the same when the whole reply comes at once', async () => {
    const r = await run([`<say>A token.\n\n${PAGE}\n\n${A2UI}</say>`], false);
    expect(r.out).toEqual([`A key.\n\n${PAGE}\n\n${A2UI}`]);
    expect(r.rewrites).toEqual([]);
  });

  it('keeps a closing fence after a blank line fenced, whole and streamed', async () => {
    const say = 'Hi.\n```js\nvar a = "JSON";\n\n```\nThe JSON is here. ok.';
    for (const streaming of [false, true]) {
      const r = await run(['<say>', say.slice(0, 20), say.slice(20), '</say>'], streaming);
      expect(r.text).toContain('```js\nvar a = "JSON";\n\n```\n');
      expect(r.text.endsWith('ok.')).toBe(true);
    }
  });

  it('still runs the Redactor inside a fence', async () => {
    const scrub = (t: string) => ({ text: t.replace(/sk-[\w-]+/g, '[hidden]'), hits: 1 });
    const r = await run([`<say>Here.\n\n\`\`\`page\n<p>sk-proj-Abc123</p>\n\`\`\`</say>`], false, { scrub });
    expect(r.text).toBe('Here.\n\n```page\n<p>[hidden]</p>\n```');
  });
});
