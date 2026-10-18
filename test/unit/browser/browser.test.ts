// Spec: 08-2 §8.3.1 (playwright-core launches the installed Edge, persistent profile `{DATA}\browser\profile`, channel msedge,
// headless false, viewport null, acceptDownloads, the five args; fallback channel chrome with `{DATA}\browser\profile-chrome`;
// neither → BROWSER_MISSING), §8.2 `browser.open` (http/https only; file:, chrome:, edge:, about: except blank, localhost and
// private / link-local ranges blocked; FOO_TEST_ALLOW_HOSTS in test builds, 08-4 §27.6), §8.3.10 (hand-back → SITE_HANDBACK).
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EDGE_ARGS, checkUrl, launchPlan } from '../../../src/engine/tools/browser/browser';
import { createHandback } from '../../../src/shared/handback';

const DATA = 'C:\\Users\\a\\AppData\\Roaming\\foo';

describe('08-2 §8.3.1 launch plan', () => {
  it('Windows: Edge first with the foo profile and the exact args, then Chrome with its own profile', () => {
    const plan = launchPlan({ platform: 'win32', dataDir: DATA, exists: () => false });
    expect(plan.map((p) => p.channel)).toEqual(['msedge', 'chrome']);
    expect(plan[0]?.userDataDir).toBe(join(DATA, 'browser', 'profile'));
    expect(plan[1]?.userDataDir).toBe(join(DATA, 'browser', 'profile-chrome'));
    for (const p of plan)
      expect(p.options).toEqual({ headless: false, viewport: null, acceptDownloads: true, args: [...EDGE_ARGS], channel: p.channel });
    expect(EDGE_ARGS).toEqual([
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--no-first-run',
      '--no-default-browser-check',
    ]);
  });
  it("Linux (the container and CI): Playwright's Chromium when present, then Chrome", () => {
    const plan = launchPlan({ platform: 'linux', dataDir: '/d', exists: (p) => p === '/opt/pw-browsers/chromium' });
    expect(plan[0]?.options.executablePath).toBe('/opt/pw-browsers/chromium');
    expect(plan[0]?.options.channel).toBeUndefined();
    expect(plan[1]?.channel).toBe('chrome');
    expect(launchPlan({ platform: 'linux', dataDir: '/d', exists: () => false }).map((p) => p.channel)).toEqual(['chrome']);
  });
  it('tests may run headless; the app never does', () => {
    const plan = launchPlan({ platform: 'win32', dataDir: DATA, exists: () => false, headless: true });
    expect(plan[0]?.options.headless).toBe(true);
  });
});

describe('08-2 §8.2 browser.open URL rule', () => {
  const handback = createHandback({
    version: 't',
    categories: { netbanking: ['netbanking.hdfcbank.com'], upiWeb: [], trading: ['kite.zerodha.com'], crypto: [], passwordManager: [] },
    patterns: [],
  });
  const rule = (url: string, allowHosts: string[] = []) => checkUrl(url, { handback, allowHosts });

  it.each(['https://www.zomato.com/bangalore', 'http://example.com/a?b=1', 'about:blank'])('allows %s', (u) => {
    expect(rule(u)).toEqual({ ok: true, value: u });
  });
  it.each([
    'file:///C:/Windows/win.ini',
    'chrome://settings',
    'edge://settings',
    'about:config',
    'javascript:alert(1)',
    'data:text/html,hi',
    'http://localhost:3000',
    'http://app.localhost/',
    'http://127.0.0.1/',
    'http://10.1.2.3/',
    'http://172.16.0.1/',
    'http://172.31.255.255/',
    'http://192.168.1.1/',
    'http://169.254.169.254/latest/meta-data',
    'http://0.0.0.0/',
    'http://[::1]/',
    'http://[fe80::1]/',
    'http://[fd00::1]/',
    'http://[::ffff:127.0.0.1]/',
    'not a url',
  ])('refuses %s with URL_NOT_ALLOWED', (u) => {
    expect(rule(u)).toEqual({ ok: false, error: { kind: 'URL_NOT_ALLOWED' } });
  });
  it('172.32.x is public', () => expect(rule('http://172.32.0.1/').ok).toBe(true));
  it('hand-back sites return SITE_HANDBACK', () => {
    expect(rule('https://netbanking.hdfcbank.com/login')).toEqual({ ok: false, error: { kind: 'SITE_HANDBACK' } });
    expect(rule('https://kite.zerodha.com/')).toEqual({ ok: false, error: { kind: 'SITE_HANDBACK' } });
  });
  it('FOO_TEST_ALLOW_HOSTS opens the localhost block for the listed hosts only', () => {
    expect(rule('https://127.0.0.1:8443/menu', ['127.0.0.1']).ok).toBe(true);
    expect(rule('https://localhost:8443/', ['127.0.0.1']).ok).toBe(false);
  });
});
