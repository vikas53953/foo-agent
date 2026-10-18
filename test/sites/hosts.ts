// Spec: 08-3 §22.5 (test sites), 08-4 §27.6 (test hosts via FOO_TEST_ALLOW_HOSTS), §27.4 (hand-back pattern
// `^netbanking\.`). Every sandbox host sits under the reserved `.test` domain (RFC 6761), so no real host is ever named.
// The bank site's name starts with `netbanking.` so the production hand-back matcher catches it with no test override.

export const SITE_HOSTS = {
  restaurant: 'tablejoy.test',
  signin: 'railpass.test',
  captcha: 'captcha.test',
  botcheck: 'botcheck.test',
  injection: 'offers.test',
  handback: 'netbanking.sandbank.test',
  news: 'news.test',
} as const;

export type SiteName = keyof typeof SITE_HOSTS;

export const SITE_NAMES = Object.keys(SITE_HOSTS) as SiteName[];
