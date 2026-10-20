// Spec: 08-2 §8.2 `web.fetch` local path (GET with Edge user agent, `Accept-Language: en-IN,hi;q=0.8`, 2 MB cap, charset
// sniffing; JSDOM with scripts and remote loading off → `@mozilla/readability` → Markdown ≤ 20,000 chars; under ~500 chars or
// not readable → `needsBrowser`; URL policy re-checked on every redirect), `webFetch.extract`, 08-4 §27.6 (test hosts).
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import type { Clock } from '../../../shared/clock';
import TurndownService from 'turndown';
import { MAX_READ_CHARS } from './firecrawl';
import { hostOf } from './http';
import type { HttpFetch, ReadResult } from './types';

export const EDGE_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0';
export const MAX_BYTES = 2 * 1024 * 1024;
export const MIN_READABLE_CHARS = 500;
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 20_000;

/** Readability on any HTML (fetched here, or rendered in foo's window); null = not readable or under ~500 chars. */
export function extract(html: string, url: string): ReadResult | null {
  // JSDOM defaults: scripts never run and no sub-resource is loaded.
  const dom = new JSDOM(html, { url });
  const article = new Readability(dom.window.document).parse();
  dom.window.close();
  if (!article?.content || (article.textContent ?? '').trim().length < MIN_READABLE_CHARS) return null;
  const md = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' }).turndown(article.content);
  return { text: md.slice(0, MAX_READ_CHARS), title: article.title ?? null, url, site: hostOf(url), date: article.publishedTime ?? null };
}

/** The body's charset: Content-Type, then a `<meta>` in the first 1,024 bytes, else UTF-8. */
export function sniffCharset(contentType: string | null, head: Uint8Array): string {
  const fromHeader = /charset=["']?([\w-]+)/i.exec(contentType ?? '')?.[1];
  const ascii = new TextDecoder('latin1').decode(head.slice(0, 1024));
  const fromMeta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(ascii)?.[1];
  for (const c of [fromHeader, fromMeta]) {
    if (!c) continue;
    try {
      new TextDecoder(c);
      return c;
    } catch {
      // Unknown label: try the next source.
    }
  }
  return 'utf-8';
}

async function readCapped(res: Response): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    const room = MAX_BYTES - n;
    chunks.push(value.length > room ? value.slice(0, room) : value);
    n += Math.min(value.length, room);
    if (n >= MAX_BYTES) {
      await reader.cancel().catch(() => undefined);
      break;
    }
  }
  const out = new Uint8Array(n);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

export type LocalFetch =
  | { kind: 'read'; read: ReadResult }
  | { kind: 'needsBrowser'; url: string }
  | { kind: 'blocked'; reason: 'URL_NOT_ALLOWED' | 'SITE_HANDBACK' }
  | { kind: 'failed' };

/** The local GET with the redirect hops checked one by one. */
export async function localFetch(
  deps: { fetch: HttpFetch; clock: Clock; check: (url: URL) => 'ok' | 'URL_NOT_ALLOWED' | 'SITE_HANDBACK' },
  url: string,
): Promise<LocalFetch> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let u: URL;
    try {
      u = new URL(current);
    } catch {
      return { kind: 'blocked', reason: 'URL_NOT_ALLOWED' };
    }
    const verdict = deps.check(u);
    if (verdict !== 'ok') return { kind: 'blocked', reason: verdict };
    let res: Response;
    const ctl = new AbortController();
    const timer = deps.clock.setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      res = await deps.fetch(u.toString(), {
        method: 'GET',
        redirect: 'manual',
        headers: {
          'user-agent': EDGE_UA,
          'accept-language': 'en-IN,hi;q=0.8',
          accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
        },
        signal: ctl.signal,
      });
    } catch {
      deps.clock.clearTimeout(timer);
      return { kind: 'failed' };
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      deps.clock.clearTimeout(timer);
      if (!loc) return { kind: 'failed' };
      current = new URL(loc, u).toString();
      continue;
    }
    if (res.status < 200 || res.status >= 300) {
      deps.clock.clearTimeout(timer);
      return { kind: 'failed' };
    }
    const type = res.headers.get('content-type');
    const bytes = await readCapped(res).finally(() => deps.clock.clearTimeout(timer));
    const text = new TextDecoder(sniffCharset(type, bytes)).decode(bytes);
    if (/^text\/plain/i.test(type ?? '')) {
      if (text.trim().length < MIN_READABLE_CHARS) return { kind: 'needsBrowser', url: u.toString() };
      return { kind: 'read', read: { text: text.slice(0, MAX_READ_CHARS), title: null, url: u.toString(), site: u.hostname, date: null } };
    }
    if (type && !/html|xml/i.test(type)) return { kind: 'needsBrowser', url: u.toString() };
    const read = extract(text, u.toString());
    return read ? { kind: 'read', read } : { kind: 'needsBrowser', url: u.toString() };
  }
  return { kind: 'failed' };
}
