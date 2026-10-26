// Spec: 08-2 §8.3.1 (foo's own Edge, EDGE_ARGS), 08-4 §27.6 (the lane sites on 127.0.0.1 / localhost). Temporary diagnostic for
// UX-14-09 on windows-latest (main 5933f08, run 40413879471): browser.open of the CAPTCHA site on http://localhost timed out at
// commit (15 s) in a fresh Edge. This launches Edge the way foo does, on fresh profiles, and times the first navigation to each
// loopback name, with and without the system proxy, and logs what the sites received. It asserts nothing: it is evidence, and
// it is removed before the fix merges.
import { chromium, test } from '@playwright/test';
import { execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EDGE_ARGS } from '../../src/engine/tools/browser/browser';
import { serveLaneSites } from '../integration/browser/laneSites';

const ROUNDS = 6;

const sh = (cmd: string) => {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout: 20_000 }).trim();
  } catch (e) {
    return `(failed: ${e instanceof Error ? e.message.split('\n')[0] : String(e)})`;
  }
};

test('DIAG · first navigation to localhost and 127.0.0.1 in a fresh Edge, with and without the system proxy', async () => {
  test.skip(process.platform !== 'win32', 'Edge on Windows only');
  test.setTimeout(600_000);
  console.log(`DIAG winhttp: ${sh('netsh winhttp show proxy')}`);
  console.log(`DIAG inet: ${sh('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings"')}`);
  console.log(
    `DIAG localhost: ${sh('powershell -NoProfile -Command "Resolve-DnsName localhost | Format-Table -HideTableHeaders Name,IPAddress | Out-String"')}`,
  );
  const variants: { name: string; args: string[]; first: 'localhost' | 'v4' }[] = [
    { name: 'foo args, localhost first', args: [...EDGE_ARGS], first: 'localhost' },
    { name: 'foo args, 127.0.0.1 first', args: [...EDGE_ARGS], first: 'v4' },
    { name: 'no proxy, localhost first', args: [...EDGE_ARGS, '--no-proxy-server'], first: 'localhost' },
  ];
  for (const v of variants) {
    for (let i = 0; i < ROUNDS; i++) {
      const sites = await serveLaneSites();
      const dir = mkdtempSync(join(tmpdir(), 'foo-diag-edge-'));
      const t0 = Date.now();
      const ctx = await chromium.launchPersistentContext(dir, { channel: 'msedge', headless: false, viewport: null, args: v.args });
      const launched = Date.now() - t0;
      const page = ctx.pages()[0] ?? (await ctx.newPage());
      const urls = v.first === 'localhost' ? [sites.captcha(), sites.signin()] : [sites.signin(), sites.captcha()];
      const times: string[] = [];
      for (const url of urls) {
        const s = Date.now();
        const r = await page
          .goto(url, { waitUntil: 'commit', timeout: 60_000 })
          .then((res) => `${res?.status() ?? 0}`)
          .catch((e: unknown) => `ERR ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
        times.push(`${new URL(url).hostname} ${Date.now() - s}ms (${r})`);
      }
      const reqs = sites.requests.map((q) => `${q.ms}ms ${q.host.split(':')[0]} ${q.family} ${q.path}`).join('; ');
      console.log(`DIAG ${v.name} #${i + 1}: launch ${launched}ms; ${times.join(', ')}; sites got: ${reqs || 'nothing'}`);
      await ctx.close();
      await sites.close();
    }
  }
});
