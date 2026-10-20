// Spec: 08-4 §27.3 (`web.search` Tavily: POST {base}/search, header `Authorization: Bearer {key}`, body { query, max_results:
// min(max,10), search_depth: "basic", country: "india", include_answer: false }; results[i] → { title, url, snippet: content
// (≤ 400 chars), site, date: published_date }; 10 s), 08-2 §8.2 `webSearch.tavily`.
import { field, hostOf, str, type CloudRequest } from './http';
import type { SearchResult } from './types';

export const tavily = {
  search(base: string, key: string, query: string, max: number): CloudRequest {
    return {
      method: 'POST',
      url: `${base}/search`,
      headers: { Authorization: `Bearer ${key}` },
      body: { query, max_results: Math.min(max, 10), search_depth: 'basic', country: 'india', include_answer: false },
    };
  },

  map(body: unknown): SearchResult[] {
    const rows = field(body, 'results');
    if (!Array.isArray(rows)) return [];
    return rows.slice(0, 10).flatMap((r: unknown) => {
      const url = str(field(r, 'url'));
      if (!url) return [];
      return [
        {
          title: str(field(r, 'title')) ?? '',
          url,
          snippet: (str(field(r, 'content')) ?? '').slice(0, 400),
          site: hostOf(url),
          date: str(field(r, 'published_date')),
        },
      ];
    });
  },
};
