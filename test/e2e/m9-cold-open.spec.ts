// Spec: 08-2 §8.3.1 (foo's own browser, launched on first use with its own profile), §8.3.5 (a page waits for `load`, max
// 15 s; a page that never arrives is SITE_TIMEOUT). The lane tests warm foo's browser before their job (m9-lanes.ts), so this
// test keeps the cold case in sight: a fresh profile, no warm-up, and the time from the ask to the site seeing the first
// request, reported on every run. On windows-latest that first page has gone past 15 s (UX-14-01, UX-14-09); a person's
// very first browser job would then meet the same SITE_TIMEOUT, so a SITE_TIMEOUT here is a product finding, not a flake.
import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { browserJob, done, fooSaid, laneRun, tool } from './m9-lanes';

const ASK = 'open the deals page';
const RESULT = 'Opened the deals page.';

test('cold first page: a fresh foo browser opens its first page, and the time is reported (08-2 §8.3.5)', async () => {
  test.setTimeout(180_000);
  const run = await laneRun(
    (sites) => [...browserJob(ASK, 'Deals page'), tool('browser.open', { url: sites.signin('/cold') }), done(RESULT)],
    {
      warm: false,
    },
  );
  try {
    const askedAt = Date.now() - run.sites.started;
    await run.ask(ASK);
    // The job ends either way: a page past browser.open's cap ends the open with SITE_TIMEOUT and the next step is `done`.
    await run.until(() => fooSaid(run.page, RESULT).isVisible(), 'the job ends');
    const first = run.sites.requests.find((r) => r.path === '/cold');
    const timedOut = run
      .turns()
      .some((x) => x.purpose === 'step' && x.prompt.includes('Last observation') && x.prompt.includes('SITE_TIMEOUT'));
    // Reported, never asserted against the cap: the numbers are the finding (a SITE_TIMEOUT goes to the coordinator as a
    // product issue). askToRequestMs runs from the ask, so it also holds the intake turn, the job start and the browser's
    // launch; the 15 s cap starts at the navigation, so `siteTimeout` is the signal that the cap was hit.
    const report = { askToRequestMs: first ? first.ms - askedAt : null, siteTimeout: timedOut, platform: process.platform };
    test.info().annotations.push({ type: 'cold-first-open-ms', description: JSON.stringify(report) });
    console.log(`cold first open: ${JSON.stringify(report)}`);
    mkdirSync(join('qa-evidence', 'cold-open'), { recursive: true });
    writeFileSync(join('qa-evidence', 'cold-open', `${process.platform}-${Date.now()}.json`), JSON.stringify(report) + '\n');
    if (first) expect(report.askToRequestMs).toBeGreaterThan(0);
    else expect(timedOut, 'no request reached the site, so the open must have reported SITE_TIMEOUT').toBe(true);
  } finally {
    await run.close();
  }
});
