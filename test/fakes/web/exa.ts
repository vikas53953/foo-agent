// Spec: 08-4 §27.3 (Exa: POST {base}/search, header x-api-key, results[i] title/url/highlights/publishedDate). Fake Exa: answers
// with recorded-shape results (made-up places, no personal data) or the status a test asks for.
import { json, type Handler } from './net';

export const EXA_RESULTS = {
  requestId: 'req_fake',
  results: [
    { title: 'Trattoria Uno, Bandra West', url: 'https://example-food.test/trattoria-uno', publishedDate: '2026-09-01T00:00:00.000Z', highlights: ['Wood-fired pizza and fresh pasta on Hill Road.'] },
    { title: 'Pasta Corner', url: 'https://www.example-guide.test/bandra/pasta-corner', publishedDate: null, highlights: [] },
  ],
};

export function fakeExa(mode: { status?: number; body?: unknown } = {}): Handler {
  return (req) => {
    if (req.path === '/search' && req.method === 'POST') {
      if (mode.status && mode.status !== 200) return json(mode.status, mode.body ?? { error: 'fake' });
      return json(200, mode.body ?? EXA_RESULTS);
    }
    return json(404, { error: 'not found' });
  };
}
