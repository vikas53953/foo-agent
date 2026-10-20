// Spec: 08-4 §27.3 (`web.fetch` Firecrawl: POST {base}/scrape, header `Authorization: Bearer {key}`, body { url, formats:
// ["markdown"], onlyMainContent: true, timeout: 30000 }; data.markdown (≤ 20,000 chars), data.metadata.title,
// data.metadata.sourceURL; success:false or no markdown → local path; 35 s), 08-2 §8.2 `webFetch.firecrawl`.
import { field, hostOf, str, type CloudRequest } from './http';
import type { ReadResult } from './types';

export const MAX_READ_CHARS = 20_000;

export const firecrawl = {
  scrape(base: string, key: string, url: string): CloudRequest {
    return {
      method: 'POST',
      url: `${base}/scrape`,
      headers: { Authorization: `Bearer ${key}` },
      body: { url, formats: ['markdown'], onlyMainContent: true, timeout: 30000 },
    };
  },

  /** null → the local path reads the page. */
  map(body: unknown, requested = ''): ReadResult | null {
    if (field(body, 'success') === false) return null;
    const md = str(field(body, 'data', 'markdown'));
    if (!md) return null;
    const url = str(field(body, 'data', 'metadata', 'sourceURL')) || requested;
    return { text: md.slice(0, MAX_READ_CHARS), title: str(field(body, 'data', 'metadata', 'title')), url, site: hostOf(url), date: null };
  },
};
