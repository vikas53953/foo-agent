// Spec: 08-2 §8.3.9 (after a block (`SITE_BLOCKED`) the engine updates `site_notes.flags` and appends a dated line to
// `sites\{domain}.md`; step turns receive the flags for every domain in play; `blocksAutomation` seen within 14 days → the AI
// is told to skip that site, J9 "Zomato blocked me"), 08-1 §4.3.13 (`site_notes`). Driven on the sandbox bot-check site with
// foo's real browser.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyEvent, BLOCK_SKIP_MS, blockedRecently, promptLines } from '../../../src/engine/tools/browser/siteNotes';
import { jobHarness, jobIntake, step, tool, type JobHarness } from '../jobs/jobHarness';
import { bookingWorld, type BookingWorld } from './booking';

let h: JobHarness | null = null;
let w: BookingWorld | null = null;
afterEach(async () => {
  h?.close();
  h = null;
  await w?.close();
  w = null;
});

describe('08-2 §8.3.9 site notes', () => {
  it('a block is noted (flags + dated line) and the next step turn is told to skip the site', async () => {
    w = await bookingWorld();
    h = jobHarness({
      script: [
        jobIntake([{ phraseKey: 'check_site', slots: { site: 'botcheck.test' }, route: 'browser' }], { title: 'Book a table' }),
        tool('browser.open', { url: w.sb.url('botcheck', '/book') }),
        step({ kind: 'done', result: 'That site blocked me.', unverified: true }),
      ],
      browser: w.browser,
    });
    h.userSays('Book a table for 4 on Sunday');
    await h.settle(20);
    expect(h.toolCalls()[0]!.error_kind).toBe('SITE_BLOCKED');
    const row = h.db.prepare("SELECT flags FROM site_notes WHERE domain = 'botcheck.test'").get() as { flags: string };
    const flags = JSON.parse(row.flags) as { blocksAutomation?: number };
    expect(typeof flags.blocksAutomation).toBe('number');
    const md = join(h.dir, 'data', 'sites', 'botcheck.test.md');
    expect(existsSync(md)).toBe(true);
    expect(readFileSync(md, 'utf8')).toMatch(/^# botcheck\.test\n\n- \d{4}-\d{2}-\d{2}: blocked foo/u);
    const steps = h.turnsJsonl().filter((t) => t.purpose === 'step');
    expect(String(steps.at(-1)!.prompt)).toContain('botcheck.test: blocked foo on');
    expect(String(steps.at(-1)!.prompt)).toContain('Skip this site');
    expect(String(steps[0]!.prompt)).not.toContain('Site notes:');
  }, 60_000);

  it('blocksAutomation counts 14 days from the block; a later success clears it; other flags are only described', () => {
    const at = Date.UTC(2026, 9, 1);
    const blocked = applyEvent({}, 'blocked', at);
    expect(blockedRecently(blocked, at + BLOCK_SKIP_MS - 1)).toBe(true);
    expect(blockedRecently(blocked, at + BLOCK_SKIP_MS)).toBe(false);
    expect(applyEvent(blocked, 'booked', at + 1)).toEqual({ bookingWorks: true });
    const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    expect(promptLines({ 'a.test': blocked, 'b.test': { captchaAlways: true, bookingWorks: true } }, at, iso)).toEqual([
      'Site notes:',
      '- a.test: blocked foo on 2026-10-01. Skip this site; use another one.',
      '- b.test: shows a CAPTCHA, booking worked before.',
    ]);
    expect(promptLines({ 'a.test': blocked }, at + BLOCK_SKIP_MS, iso)).toEqual([]);
  });
});
