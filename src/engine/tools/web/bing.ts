// Spec: 08-2 §8.2 `web.search` local path (`https://www.bing.com/search?q={q}&cc=IN&setlang={en-IN|hi}` in the job window,
// read by a fixed parser: title, url, snippet, site; ≤ 10; ads and AI-answer modules skipped; on a challenge page never solve),
// `webSearch.bing`.
import { JSDOM } from 'jsdom';
import { hostOf } from './http';
import type { SearchResult } from './types';

export function bingUrl(query: string, lang: 'en-IN' | 'hi'): string {
  return `https://www.bing.com/search?q=${encodeURIComponent(query)}&cc=IN&setlang=${lang}`;
}

const CHALLENGE = /captcha|unusual traffic|verify (?:that )?you are (?:a )?human|are you a robot|one last step/i;

/** Bing wraps result links as `bing.com/ck/a?…&u=a1{base64url(url)}`; returns the real target. */
export function unwrapBingLink(href: string): string {
  try {
    const u = new URL(href);
    if (!u.hostname.endsWith('bing.com') || !u.pathname.startsWith('/ck/')) return href;
    const enc = u.searchParams.get('u');
    if (!enc?.startsWith('a1')) return href;
    return Buffer.from(enc.slice(2), 'base64url').toString('utf8');
  } catch {
    return href;
  }
}

export type ParsedSearch = { kind: 'results'; results: SearchResult[] } | { kind: 'challenge' };

export function parseBing(html: string, max = 10): ParsedSearch {
  const doc = new JSDOM(html).window.document;
  const items = [...doc.querySelectorAll('#b_results > li.b_algo')];
  if (items.length === 0 && CHALLENGE.test(doc.body?.textContent ?? '')) return { kind: 'challenge' };
  const results: SearchResult[] = [];
  for (const li of items) {
    if (li.classList.contains('b_ad')) continue;
    const a = li.querySelector('h2 a[href]');
    const href = a?.getAttribute('href');
    if (!a || !href) continue;
    const url = unwrapBingLink(href);
    if (!/^https?:\/\//.test(url)) continue;
    const snippet = li.querySelector('.b_caption p, p[class^="b_lineclamp"], .b_snippet')?.textContent?.trim() ?? '';
    results.push({ title: a.textContent?.trim() ?? '', url, snippet: snippet.slice(0, 400), site: hostOf(url), date: null });
    if (results.length >= max) break;
  }
  return { kind: 'results', results };
}
