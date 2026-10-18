// Spec: 08-2 §8.2 `web.search` local path second try (`https://html.duckduckgo.com/html/?q=` once after a Bing challenge page;
// a challenge here too → SEARCH_BUSY), `webSearch.ddgHtml`. Same fields as the Bing parser; ads skipped.
import { JSDOM } from 'jsdom';
import type { ParsedSearch } from './bing';
import { hostOf } from './http';
import type { SearchResult } from './types';

export function ddgUrl(query: string): string {
  return `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
}

const CHALLENGE = /anomaly|bots use duckduckgo|captcha|unusual traffic/i;

/** DuckDuckGo wraps links as `//duckduckgo.com/l/?uddg={encoded url}`. */
export function unwrapDdgLink(href: string): string {
  try {
    const u = new URL(href, 'https://html.duckduckgo.com/');
    const target = u.pathname === '/l/' ? u.searchParams.get('uddg') : null;
    return target ?? u.toString();
  } catch {
    return href;
  }
}

export function parseDdgHtml(html: string, max = 10): ParsedSearch {
  const doc = new JSDOM(html).window.document;
  const items = [...doc.querySelectorAll('.result')].filter((el) => !el.classList.contains('result--ad'));
  if (items.length === 0 && (doc.querySelector('#challenge-form, .anomaly-modal') || CHALLENGE.test(doc.body?.textContent ?? '')))
    return { kind: 'challenge' };
  const results: SearchResult[] = [];
  for (const el of items) {
    const a = el.querySelector('a.result__a[href]');
    const href = a?.getAttribute('href');
    if (!a || !href) continue;
    const url = unwrapDdgLink(href);
    if (!/^https?:\/\//.test(url)) continue;
    const snippet = el.querySelector('.result__snippet')?.textContent?.trim() ?? '';
    results.push({ title: a.textContent?.trim() ?? '', url, snippet: snippet.slice(0, 400), site: hostOf(url), date: null });
    if (results.length >= max) break;
  }
  return { kind: 'results', results };
}
