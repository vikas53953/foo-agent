// Spec: 08-0 §E.9 (`handback.ts` holds the one `handback.check(url)` matcher, X-129), 08-4 §27.4 (format and match rule of
// `resources/handback-sites.json`), §27.5 (`resources/no-capture-hosts.json` uses the same host/path matching), 08-2 §8.3.10
// (hand-back sites are never driven: `SITE_HANDBACK`). Callers load the resource file and build the matcher once; production
// matching is never widened for tests (the sandbox maps a test host onto a hand-back entry through its own seed list, M9 T2).
import { z } from 'zod';

const entry = z.string().min(1).max(253);
export const handbackSitesSchema = z
  .object({
    version: z.string(),
    categories: z
      .object({
        netbanking: z.array(entry),
        upiWeb: z.array(entry),
        trading: z.array(entry),
        crypto: z.array(entry),
        passwordManager: z.array(entry),
      })
      .strict(),
    patterns: z.array(z.string()),
  })
  .strict();
export type HandbackSites = z.infer<typeof handbackSitesSchema>;

export const hostListSchema = z.object({ version: z.string(), hosts: z.array(entry), patterns: z.array(z.string()) }).strict();
export type HostList = z.infer<typeof hostListSchema>;

export interface HostMatcher {
  check(url: string): boolean;
}

/**
 * 08-4 §27.4 match: an entry is a host or host + path prefix; `url.host === h || url.host.endsWith('.' + h)`, and when the entry
 * has a path, `url.pathname.startsWith(path)`; patterns are case-insensitive regexes on the host. A URL that does not parse
 * matches nothing.
 */
export function hostMatcher(entries: readonly string[], patterns: readonly string[]): HostMatcher {
  const parsed = entries.map((e) => {
    const slash = e.indexOf('/');
    return slash < 0 ? { host: e.toLowerCase(), path: '' } : { host: e.slice(0, slash).toLowerCase(), path: e.slice(slash) };
  });
  const res = patterns.map((p) => new RegExp(p, 'i'));
  return {
    check(url: string): boolean {
      let u: URL;
      try {
        u = new URL(url);
      } catch {
        return false;
      }
      const host = u.hostname.toLowerCase();
      if (res.some((r) => r.test(host))) return true;
      return parsed.some((p) => (host === p.host || host.endsWith('.' + p.host)) && (!p.path || u.pathname.startsWith(p.path)));
    },
  };
}

/** `handback.check(url)` over a parsed `handback-sites.json`. */
export function createHandback(sites: HandbackSites): HostMatcher {
  return hostMatcher(Object.values(sites.categories).flat(), sites.patterns);
}

/** The §27.5 no-capture matcher over a parsed `no-capture-hosts.json` (the page title/text rule of 08-2 §11.6 is extra). */
export function createNoCapture(list: HostList): HostMatcher {
  return hostMatcher(list.hosts, list.patterns);
}
