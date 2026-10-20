// Spec: 08-4 §27.3 item 1 (key check: one call with a fixed harmless input: Exa/Tavily query "foo", Firecrawl url
// "https://example.com", Browser Use GET {base}/me; HTTP 200 → saved; 401/403 → "refused"; anything else → saved, local-path
// state until the first successful call), 08-1 §2.4 MainToEngine `webkey.check {provider}` → ok | refused | unknown (X-124, X-127).
import type { Clock } from '../../../shared/clock';
import { browseruse } from './browseruse';
import { exa } from './exa';
import { firecrawl } from './firecrawl';
import { cloudRequest, TIMEOUT_MS, type CloudRequest } from './http';
import { tavily } from './tavily';
import type { HttpFetch, WebProvider, WebToolsResource } from './types';

export type KeyCheck = 'ok' | 'refused' | 'unknown';

export function keyCheckRequest(resource: WebToolsResource, provider: WebProvider, key: string): CloudRequest {
  switch (provider) {
    case 'exa':
      return exa.search(resource.exa.base, key, 'foo', 1);
    case 'tavily':
      return tavily.search(resource.tavily.base, key, 'foo', 1);
    case 'firecrawl':
      return firecrawl.scrape(resource.firecrawl.base, key, 'https://example.com');
    case 'browseruse':
      return browseruse.me(resource.browseruse.base, key);
  }
}

export async function checkWebKey(
  deps: { fetch: HttpFetch; clock: Clock; resource: WebToolsResource },
  provider: WebProvider,
  key: string,
): Promise<KeyCheck> {
  const timeout = provider === 'browseruse' ? TIMEOUT_MS.exa : TIMEOUT_MS[provider];
  const r = await cloudRequest(deps, keyCheckRequest(deps.resource, provider, key), timeout);
  if (r.ok) return 'ok';
  return r.status === 401 || r.status === 403 ? 'refused' : 'unknown';
}
