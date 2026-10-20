// Spec: 08-4 §27.3 (Tavily: POST {base}/search, Authorization Bearer, results[i] title/url/content/published_date). Fake Tavily.
import { json, type Handler } from './net';

export const TAVILY_RESULTS = {
  query: 'q',
  results: [{ title: 'Cafe Due', url: 'https://example-cafe.test/due', content: 'x'.repeat(600), published_date: '2026-10-01' }],
};

export function fakeTavily(mode: { status?: number; body?: unknown } = {}): Handler {
  return (req) => {
    if (req.path === '/search' && req.method === 'POST') {
      if (mode.status && mode.status !== 200) return json(mode.status, mode.body ?? { detail: 'fake' });
      return json(200, mode.body ?? TAVILY_RESULTS);
    }
    return json(404, {});
  };
}
