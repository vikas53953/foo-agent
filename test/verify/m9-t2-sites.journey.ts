// Spec: 08-3 §22.5 (restaurant test site), 08-4 §27.6 (sandbox names mapped onto 127.0.0.1), 10-1 AT-037 (submitted at
// most once, with a confirmation), AT-114a ("Booking code TJ8821"). foo-verify journey for M9 T2: starts the sandbox and
// drives the restaurant site in a real Chromium with Playwright directly (foo's own browser is T3's), trusting only the
// sandbox key, then books once and checks the submit counter is 1. Pictures go to qa-evidence/verify/m9-t2-sites/sandbox/.
//   xvfb-run -a pnpm tsx scripts/foo-verify.ts test/verify/m9-t2-sites.journey.ts
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Verify } from '../../scripts/foo-verify';
import { loadTestHosts } from '../../src/main/net/testHosts';
import { control } from '../sites/client';
import { startSandbox } from '../sites/server';

const PREINSTALLED = '/opt/pw-browsers/chromium';

export default async function journey(v: Verify): Promise<void> {
  const sb = await startSandbox();
  const hosts = loadTestHosts({ FOO_TEST: '1', FOO_TEST_ALLOW_HOSTS: sb.allowHosts });
  const out = join('qa-evidence', 'verify', 'm9-t2-sites', 'sandbox');
  mkdirSync(out, { recursive: true });
  const executablePath = process.env.FOO_VERIFY_CHROMIUM ?? (existsSync(PREINSTALLED) ? PREINSTALLED : undefined);
  const browser = await chromium.launch({
    executablePath,
    args: [
      '--no-proxy-server',
      `--host-resolver-rules=${hosts.resolverRules()}`,
      `--ignore-certificate-errors-spki-list=${sb.cert.spkiSha256}`,
    ],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
    const snap = async (n: number, name: string) => {
      const file = join(out, `${String(n).padStart(2, '0')}-${name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      return file;
    };
    const home = await page.goto(sb.url('restaurant'));
    if (home?.status() !== 200) throw new Error(`restaurant home: ${home?.status()}`);
    const tls = await home.securityDetails();
    v.note(`tablejoy.test served over HTTPS (${tls?.protocol}), sandbox cert trusted by SPKI pin, host mapped by FOO_TEST_ALLOW_HOSTS`);
    await page.getByLabel('People').fill('4');
    await page.getByRole('button', { name: 'Search' }).click();
    await page.waitForURL(/\/search\?/);
    const options = page.locator('li.option');
    if ((await options.count()) !== 3) throw new Error(`expected 3 options, got ${await options.count()}`);
    const loaded = await page.$$eval('li.option img', (imgs) => imgs.map((i) => (i as HTMLImageElement).naturalWidth));
    if (loaded.length !== 3 || loaded.some((w) => w === 0)) throw new Error(`photos not loaded: ${loaded.join(',')}`);
    v.note(`search shows 3 options, all 3 photos loaded (${await snap(1, 'results')})`);

    await options.first().getByRole('link', { name: 'See table' }).click();
    const fee = await page.locator('[data-field="no-show-fee"]').innerText();
    if (fee !== '₹1,000') throw new Error(`no-show fee ${fee}`);
    await page.getByLabel('Name').fill('Test Guest');
    await page.getByLabel('Phone').fill('+91 90000 00000');
    v.note(`booking form shows Charged now ₹0, No-show fee ${fee} (${await snap(2, 'booking-form')})`);

    await page.getByRole('button', { name: 'Book table' }).click();
    const code = await page.locator('[data-field="booking-code"]').innerText();
    if (code !== 'Booking code TJ8821') throw new Error(`confirmation: ${code}`);
    const submits = (await control(sb, 'restaurant')).counters.submits;
    if (submits !== 1) throw new Error(`submit counter ${submits}`);
    v.note(`one tap on Book table → "${code}", submit counter = ${submits} (${await snap(3, 'confirmation')})`);

    await page.getByRole('link', { name: 'Your bookings' }).click();
    if (!(await page.getByRole('cell', { name: 'TJ8821' }).isVisible())) throw new Error('history page has no TJ8821');
    v.note(`history page lists TJ8821 for Coastline Kitchen (${await snap(4, 'history')})`);
  } finally {
    await browser.close();
    await sb.close();
  }
}
