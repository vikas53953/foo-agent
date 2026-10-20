// Spec: 08-4 §27.3 (Firecrawl: POST {base}/scrape, Authorization Bearer, data.markdown / data.metadata.title / sourceURL).
// Fake Firecrawl.
import { json, type Handler } from './net';

export const FIRECRAWL_PAGE = {
  success: true,
  data: {
    markdown: '# Menu\n\n' + 'Margherita pizza, ₹450. '.repeat(1200),
    metadata: { title: 'Menu · Trattoria Uno', sourceURL: 'https://example-food.test/menu' },
  },
};

export function fakeFirecrawl(mode: { status?: number; body?: unknown } = {}): Handler {
  return (req) => {
    if (req.path === '/v2/scrape' && req.method === 'POST') {
      if (mode.status && mode.status !== 200) return json(mode.status, mode.body ?? { success: false });
      return json(200, mode.body ?? FIRECRAWL_PAGE);
    }
    return json(404, {});
  };
}
