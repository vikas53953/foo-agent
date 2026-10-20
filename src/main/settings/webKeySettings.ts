// Spec: 08-0 §A `connections.web` (`refused.{p}` set true on CLOUD_AUTH from `webkey.check` or any later call, cleared on the
// next HTTP 200 from that provider and on Remove key; saving a web key writes `search` / `read` / `cloudBrowser`; the last
// saved search key is `search`), 08-1 §3.2 `secret:save` web_key row (main saves, sends `webkey.check`, then writes
// `connections.web.*` and `refused[name] = (result === 'refused')`), `secret:delete` on a web key resets its field to
// `this_pc` / `false` (X-127), 08-4 §27.3 item 1. Main owns settings.json (08-0 §A); the engine reports, main writes.
import type { Settings } from '../../shared/settings';
import type { WebProvider } from '../../shared/types';

type Web = Settings['connections']['web'];
type KeyCheck = 'ok' | 'refused' | 'unknown';

/** The vault target of a web key (08-0 §E.8, G-M9-13) → its provider; null for any other target. */
export function webProviderOfTarget(target: string): WebProvider | null {
  const m = /^foo\/web_key\/(exa|tavily|firecrawl|browseruse)$/.exec(target);
  return m ? (m[1] as WebProvider) : null;
}

export function webAfterKeySaved(web: Web, p: WebProvider, check: KeyCheck): Web {
  const refused = { ...web.refused, [p]: check === 'refused' };
  if (p === 'exa' || p === 'tavily') return { ...web, search: p, refused };
  if (p === 'firecrawl') return { ...web, read: 'firecrawl', refused };
  return { ...web, cloudBrowser: true, refused };
}

export function webAfterKeyRemoved(web: Web, p: WebProvider): Web {
  const refused = { ...web.refused, [p]: false };
  if (p === 'exa' || p === 'tavily') return { ...web, search: web.search === p ? 'this_pc' : web.search, refused };
  if (p === 'firecrawl') return { ...web, read: 'this_pc', refused };
  return { ...web, cloudBrowser: false, refused };
}

/** Writes `connections.web` through `fn`; true when it changed (the caller then tells the renderer). */
export function writeWeb(settings: { get(): Settings; update(fn: (s: Settings) => Settings): void }, fn: (w: Web) => Web): boolean {
  const before = settings.get().connections.web;
  const next = fn(before);
  if (JSON.stringify(next) === JSON.stringify(before)) return false;
  settings.update((s) => ({ ...s, connections: { ...s.connections, web: next } }));
  return true;
}
