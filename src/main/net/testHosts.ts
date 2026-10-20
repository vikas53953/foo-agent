// Spec: 08-4 §27.6 (test hosts, F-088: in FOO_TEST=1 builds only, hosts in FOO_TEST_ALLOW_HOSTS bypass the localhost /
// private-range block of browser.open and web.fetch), 08-0 §E.6 (test overrides), 08-3 §22.1 (FOO_TEST build flag).
// Loading it outside a FOO_TEST=1 run throws, so production can't pick up the list by accident. Matching is exact host
// name only, and only names under the reserved `.test` domain (RFC 6761) are accepted, so the list can never open a
// real site or a private address; the production hand-back and block lists are not touched.

export interface TestHosts {
  /** The allowed names, normalised (lower case, no trailing dot), in list order. */
  readonly hosts: readonly string[];
  /** True only for an exact listed name (case and a trailing dot ignored). */
  allows(hostname: string): boolean;
  /** Chromium `--host-resolver-rules` value mapping every listed name onto `target`. Empty when nothing is listed. */
  resolverRules(target?: string): string;
}

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

const normalise = (h: string) => h.trim().toLowerCase().replace(/\.$/, '');

function validTestName(h: string): boolean {
  const labels = h.split('.');
  return h.length <= 253 && labels.length >= 2 && labels.at(-1) === 'test' && labels.every((l) => LABEL.test(l));
}

export function loadTestHosts(env: NodeJS.ProcessEnv = process.env): TestHosts {
  if (env.FOO_TEST !== '1') {
    throw new Error('FOO_TEST_ALLOW_HOSTS is honoured only in FOO_TEST=1 builds (08-4 §27.6)');
  }
  const hosts: string[] = [];
  for (const raw of (env.FOO_TEST_ALLOW_HOSTS ?? '').split(',')) {
    const h = normalise(raw);
    if (h === '') continue;
    if (!validTestName(h)) {
      throw new Error(`FOO_TEST_ALLOW_HOSTS: "${raw.trim()}" is not a host name under .test`);
    }
    if (!hosts.includes(h)) hosts.push(h);
  }
  const set = new Set(hosts);
  return {
    hosts,
    allows: (hostname) => set.has(normalise(hostname)),
    resolverRules: (target = '127.0.0.1') => hosts.map((h) => `MAP ${h} ${target}`).join(','),
  };
}
