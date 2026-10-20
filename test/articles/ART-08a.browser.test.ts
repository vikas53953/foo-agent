// Spec: 10-acceptance-2 §D ART-08a (Article 8, the browser part: canaries seeded as a site password and a card number are
// typed by the person on pages in foo's browser; every file foo wrote, the snapshots, the step pictures, the stored tool calls
// and the captured AI request bodies are searched; 0 hits), 08-2 §8.3.6–§8.3.8 (masked-at-source fields read [hidden]; step
// pictures are taken with the mask on), §11.4 (the Redactor). The scan is test/canary/scan.ts; screenshots are searched as
// bytes here, and their pixels by the masker check (test/integration/browser/masker.test.ts), so OCR is listed as not covered.
import { describe, expect, it } from 'vitest';
import { CANARIES, groupedCard } from '../canary/canaries';
import { scan, summary } from '../canary/scan';
import { bookingWorld } from '../integration/browser/booking';
import { jobHarness, jobIntake, step, tool } from '../integration/jobs/jobHarness';
import { SITE_HOSTS } from '../sites/hosts';

const after = (t: string) => ({ match: { purpose: 'step', promptIncludes: `, ${t})` } });
const SEEDED = [CANARIES.sitePassword, CANARIES.cardNumber];

describe('ART-08a · canaries typed on pages in foo’s browser', () => {
  it('ART-08a a site password and a card number the person typed are in no snapshot, step picture, tool call, AI request or file', async () => {
    // The person types the values themselves as each page loads (foo never types a secret, 08-2 §8.2.1).
    const w = await bookingWorld({
      initScript: `document.addEventListener('DOMContentLoaded', () => {
        // A filled field marks the title, so the snapshot itself proves the value was on the page when foo read it.
        const set = (sel, v) => { const el = document.querySelector(sel); if (el) { el.value = v; document.title += ' (filled)'; } };
        set('input[name="username"]', 'sandbox-user');
        set('input[name="password"]', ${JSON.stringify(CANARIES.sitePassword.value)});
        set('input[name="card"]', ${JSON.stringify(groupedCard(CANARIES.cardNumber.value))});
      });`,
    });
    const h = jobHarness({
      script: [
        jobIntake([{ phraseKey: 'check_site', slots: { site: SITE_HOSTS.signin }, route: 'browser' }], { title: 'Look at two pages' }),
        tool('browser.open', { url: w.sb.url('signin', '/login') }),
        // The person has typed into the sign-in form and the card field by now (below); foo reads both pages.
        tool('browser.snapshot', {}, after('browser.open')),
        tool('browser.open', { url: w.sb.url('injection', '/') }, after('browser.snapshot')),
        step({ kind: 'done', result: 'Both pages read.', unverified: true }, { match: { purpose: 'step', promptIncludes: 'Card number' } }),
        tool('browser.snapshot', {}, { match: { purpose: 'step', promptIncludes: 'Weekend offers' } }),
      ],
      browser: w.browser,
    });
    try {
      h.userSays('Look at my RailPass page and the weekend offers');
      for (let n = 0; n < 5 && !String(h.job()?.state).startsWith('done'); n++) await h.settle(20).catch(() => undefined);
      expect(h.job()).toMatchObject({ state: 'done_unverified' });

      // Both snapshots ran with the values in the fields and read them as [hidden].
      const snaps = (h.toolCalls().filter((c) => c.tool === 'browser.snapshot') as { result: string }[]).map(
        (c) => (JSON.parse(c.result) as { snapshot: string; screenshot?: string }).snapshot,
      );
      expect(snaps).toHaveLength(2);
      expect(snaps[0]).toContain('Page: RailPass · sign in (filled) (filled)');
      expect(snaps[0]).toContain('textbox "Password" [hidden]');
      expect(snaps[1]).toContain('Page: Weekend offers (filled)');
      expect(snaps[1]).toContain('textbox "Card number" [hidden]');

      // The browser profile is searched too, after Edge has closed (its lock files are gone then).
      await w.browser.runtime.browser.shutdown();
      const turns = h.turnsJsonl().map((r, i) => ({ source: 'ai-request', label: `turns.jsonl#${i}`, text: JSON.stringify(r) }));
      const report = scan({ roots: { DATA: h.dir, BROWSER: w.dataDir }, texts: turns, canaries: SEEDED }, [
        { what: 'OCR of step pictures', why: 'pixels are checked by the masker (blur on every sensitive field)' },
      ]);
      expect(
        report.files.some((f) => f.includes('/steps/') && f.endsWith('.jpg')),
        JSON.stringify(report.files),
      ).toBe(true);
      expect(report.scanned.texts['ai-request']).toBeGreaterThan(0);
      expect(report.hits, summary(report)).toEqual([]);
    } finally {
      h.close();
      await w.close();
    }
  }, 90_000);
});
