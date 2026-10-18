// Spec: 08-4 §27.6 (test hosts: FOO_TEST_ALLOW_HOSTS honoured only in FOO_TEST=1 builds), 08-0 §E.6 (test overrides),
// 08-3 §22.1 (FOO_TEST build flag). The list maps sandbox names onto 127.0.0.1 and never widens production matching.
import { describe, expect, it } from 'vitest';
import { loadTestHosts } from '../../src/main/net/testHosts';
import { SITE_HOSTS } from '../sites/hosts';

const env = (o: Record<string, string | undefined>) => o as NodeJS.ProcessEnv;

describe('FOO_TEST_ALLOW_HOSTS', () => {
  it('refuses to load without FOO_TEST=1', () => {
    for (const FOO_TEST of [undefined, '', '0', 'true', 'yes']) {
      expect(() => loadTestHosts(env({ FOO_TEST, FOO_TEST_ALLOW_HOSTS: 'tablejoy.test' }))).toThrow(/FOO_TEST=1/);
    }
    expect(() => loadTestHosts(env({}))).toThrow(/FOO_TEST=1/);
  });

  it('parses a comma-separated list: trims, lower-cases, drops a trailing dot and duplicates', () => {
    const h = loadTestHosts(env({ FOO_TEST: '1', FOO_TEST_ALLOW_HOSTS: ' Tablejoy.TEST , news.test.,news.test,, ' }));
    expect(h.hosts).toEqual(['tablejoy.test', 'news.test']);
  });

  it('no list means nothing is allowed', () => {
    const h = loadTestHosts(env({ FOO_TEST: '1' }));
    expect(h.hosts).toEqual([]);
    expect(h.allows('tablejoy.test')).toBe(false);
    expect(h.resolverRules()).toBe('');
  });

  it('matches exact host names only: no subdomain, suffix, port trick or localhost', () => {
    const h = loadTestHosts(env({ FOO_TEST: '1', FOO_TEST_ALLOW_HOSTS: 'tablejoy.test' }));
    expect(h.allows('tablejoy.test')).toBe(true);
    expect(h.allows('TABLEJOY.test.')).toBe(true);
    for (const other of ['evil.tablejoy.test', 'tablejoy.test.com', 'xtablejoy.test', 'localhost', '127.0.0.1', '']) {
      expect(h.allows(other)).toBe(false);
    }
  });

  it('refuses entries that are not names under the reserved .test domain', () => {
    for (const bad of ['example.com', 'localhost', '127.0.0.1', '*.test', 'tablejoy.test:443', 'a..test', '-a.test', 'test']) {
      expect(() => loadTestHosts(env({ FOO_TEST: '1', FOO_TEST_ALLOW_HOSTS: bad }))).toThrow(/FOO_TEST_ALLOW_HOSTS/);
    }
  });

  it("gives Chromium's host-resolver rules mapping each host onto 127.0.0.1", () => {
    const h = loadTestHosts(env({ FOO_TEST: '1', FOO_TEST_ALLOW_HOSTS: 'tablejoy.test,news.test' }));
    expect(h.resolverRules()).toBe('MAP tablejoy.test 127.0.0.1,MAP news.test 127.0.0.1');
  });

  it('accepts every sandbox site host', () => {
    const all = Object.values(SITE_HOSTS);
    const h = loadTestHosts(env({ FOO_TEST: '1', FOO_TEST_ALLOW_HOSTS: all.join(',') }));
    expect(h.hosts).toEqual(all);
  });
});
