// Spec: 08-1 §2.4 (MainToEngine `webkey.check {provider}` → ok | refused | unknown), 08-4 §27.3 (`resources/web-tools.json`,
// key check), §27.4 (`resources/handback-sites.json` through `src/shared/handback.ts`, X-129), §27.6 (FOO_TEST_ALLOW_HOSTS:
// test builds only), 08-2 §8.2 (web.fetch URL policy as browser.open), 08-0 §E.8 (vault `foo/web_key/{provider}`). Builds the
// engine's web tools from the resource files. Keys come through `vaultWebKeys` over M5's `vault.use` (Engine.ts; tests pass an
// in-memory vault, and with none every call takes the local path). Until their milestones land: no AI spend meter (M4-T3: the
// default never crosses, harmless while no key exists); no connectors (M8) so no ROUTE_ORDER host; no biller list (M10); no job window (M9 T3), whose
// `browser.open` URL policy replaces the default below when it lands.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isIP } from 'node:net';
import type { Clock } from '../../../shared/clock';
import { createHandback, handbackSitesSchema } from '../../../shared/handback';
import type { Settings } from '../../../shared/settings';
import { checkWebKey, type KeyCheck } from './keyCheck';
import { memoryVault, vaultWebKeys } from './keys';
import type { HttpFetch, PageLoader, SpendMeter, WebKeys, WebPricing, WebProvider, WebToolsResource, WebTurnRow } from './types';
import { WebTools } from './WebTools';

export { WebTools } from './WebTools';
export { memoryVault, vaultWebKeys } from './keys';
export { webToolDefs } from './toolDefs';
export type { KeyCheck } from './keyCheck';

const PRIVATE_V4 = [/^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^0\./];

/** 08-4 §27.6: localhost and private ranges are blocked; in FOO_TEST builds the hosts in FOO_TEST_ALLOW_HOSTS pass. */
export function defaultUrlAllowed(env: Record<string, string | undefined>, testRun: boolean): (url: URL) => boolean {
  const allow = testRun
    ? new Set(
        (env.FOO_TEST_ALLOW_HOSTS ?? '')
          .split(',')
          .map((h) => h.trim().toLowerCase())
          .filter(Boolean),
      )
    : new Set<string>();
  return (url) => {
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (allow.has(host) || allow.has(url.host.toLowerCase())) return true;
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return false;
    if (isIP(host) === 4) return !PRIVATE_V4.some((r) => r.test(host));
    if (isIP(host) === 6) return !(host === '::1' || /^f[cd]/.test(host) || /^fe80/.test(host) || host === '::');
    return true;
  };
}

export interface EngineWebOptions {
  clock: Clock;
  fetch: HttpFetch;
  resourcesDir: string;
  env: Record<string, string | undefined>;
  testRun: boolean;
  settings: () => Settings;
  online: () => boolean;
  scrub: (text: string) => { text: string; hits: number };
  pricing: { usdToInr: number; web: WebPricing };
  recordTurn: (row: WebTurnRow) => void | Promise<void>;
  newId: () => string;
  log: (kind: string) => void;
  keys?: WebKeys;
  meter?: SpendMeter;
  /** 401/403 at run time: main stores `connections.web.refused.{provider}` (X-127); a re-saved key's check clears it. */
  onRefused?: (provider: WebProvider) => void;
  /** A used-up key: one line in the next brief (`cards.brief.line.web_key_quota`). */
  onQuota?: (provider: WebProvider) => void;
  page?: PageLoader;
}

export interface EngineWeb {
  tools: WebTools;
  /** `webkey.check`: the saved key, one harmless call (08-4 §27.3 item 1); no saved key → unknown. */
  checkKey(provider: WebProvider): Promise<KeyCheck>;
}

export function createEngineWeb(o: EngineWebOptions): EngineWeb {
  const read = (f: string): unknown => JSON.parse(readFileSync(join(o.resourcesDir, f), 'utf8'));
  const resource = read('web-tools.json') as WebToolsResource;
  const handback = createHandback(handbackSitesSchema.parse(read('handback-sites.json')));
  const keys: WebKeys = o.keys ?? vaultWebKeys(memoryVault());
  const tools = new WebTools({
    clock: o.clock,
    sleep: (ms) => new Promise((r) => o.clock.setTimeout(r, ms)),
    fetch: o.fetch,
    resource,
    pricing: o.pricing,
    settings: () => o.settings().connections.web,
    keys,
    meter: o.meter ?? { wouldCross: () => false },
    recordTurn: o.recordTurn,
    online: o.online,
    scrub: o.scrub,
    isHandback: (u) => handback.check(u.toString()),
    routeOrder: () => null,
    urlAllowed: defaultUrlAllowed(o.env, o.testRun),
    isBillerSite: () => false,
    page: o.page,
    newId: o.newId,
    log: (kind) => o.log(kind),
    onRefused: o.onRefused,
    onQuota: o.onQuota,
  });
  return {
    tools,
    async checkKey(provider) {
      const key = await keys.use(provider);
      if (!key) return 'unknown';
      return checkWebKey({ fetch: o.fetch, clock: o.clock, resource }, provider, key);
    },
  };
}
