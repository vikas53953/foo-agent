// Spec: 08-4 §27.3 (`web.search` Exa: POST {base}/search, header `x-api-key`, body { query, numResults: min(max,10), type:
// "auto", userLocation: "IN", contents.highlights { maxCharacters: 400, highlightsPerUrl: 1 } }; results[i] → { title, url,
// snippet: highlights[0] ?? "", site: hostname(url), date: publishedDate }; 10 s), 08-2 §8.2 `webSearch.exa`.
import { field, hostOf, str, type CloudRequest } from './http';
import type { SearchResult } from './types';

export const exa = {
  search(base: string, key: string, query: string, max: number): CloudRequest {
    return {
      method: 'POST',
      url: `${base}/search`,
      headers: { 'x-api-key': key },
      body: {
        query,
        numResults: Math.min(max, 10),
        type: 'auto',
        userLocation: 'IN',
        contents: { highlights: { maxCharacters: 400, highlightsPerUrl: 1 } },
      },
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
          snippet: str(field(r, 'highlights', 0)) ?? '',
          site: hostOf(url),
          date: str(field(r, 'publishedDate')),
        },
      ];
    });
  },
};
