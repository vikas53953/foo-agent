// Spec: 10-acceptance-2 ART-03 (Article 3, the browser rung): 40 read-only requests ("check…", "find…", "look at…", "see if…",
// "compare…", "is there…") → 0 approval or payment cards, 0 submissions; options shown + "Want me to book one?". 08-2 §8.2.1
// (a commit click — "Book table" — is refused with USE_SUBMIT; only `browser.submit` after an Approval may press it), §5.3.1
// (no do-verb → intent read_only), §9.4 (read_only → Choice offer_action), 08-4 §28.1 item 6. Here foo's real browser tools
// (headless) read the sandbox restaurant (test/sites, `.test` names); the site counts every POST in `submits`.
import { afterEach, describe, expect, it } from 'vitest';
import { t } from '../../src/shared/copy/t';
import { SITE_HOSTS } from '../sites/hosts';
import { bookingWorld, type BookingWorld } from '../integration/browser/booking';
import { jobHarness, jobIntake, step, tool, type JobHarness } from '../integration/jobs/jobHarness';
import type { FakeLineIn } from '../unit/m3-engine-helpers';

const hs: JobHarness[] = [];
let w: BookingWorld | null = null;
afterEach(async () => {
  for (const h of hs.splice(0)) h.close();
  await w?.close();
  w = null;
});

const LEADS = ['Check', 'Find', 'Look at', 'See if there are', 'Compare', 'Is there'];
const THINGS = [
  'tables at Coastline Kitchen for Sunday',
  'a table for 4 tonight',
  'dinner places open late',
  'the no-show fee at Coastline Kitchen',
  'a window table on Saturday',
  'tables for 2 at 8 PM',
  'how busy Coastline Kitchen is on Friday',
];
const ASKS = Array.from({ length: 40 }, (_, i) => `${LEADS[i % LEADS.length]} ${THINGS[i % THINGS.length]}`);

/** The AI's ask to book the table it read; on a read-only job the gate turns it into the offer. */
const askToBook = (after: string): FakeLineIn =>
  step(
    {
      kind: 'request_approval',
      draft: {
        verb: 'book',
        fields: { verb: 'book', payee: 'Coastline Kitchen', partySize: 4, cancelTerms: { refundable: true }, irreversible: false },
        evidence: [{ field: 'payee', toolCallId: 'tc_000002', quote: 'Coastline Kitchen' }],
      },
      submitRef: 'e3',
    },
    { match: { purpose: 'step', promptIncludes: after }, once: false },
  );

/** The real browser runs on wall time, so a job can still be working when one fake-clock settle ends: settle again. */
async function settled(x: JobHarness): Promise<void> {
  for (let n = 0; n < 5; n++) {
    await x.settle(20).catch(() => undefined);
    if (!x.jobs().some((j) => j.state === 'working')) return;
  }
  throw new Error(
    `a job never left working: ${JSON.stringify(x.jobs().map((j) => j.state))} ${JSON.stringify(x.cards().map((c) => [c.type, c.state]))}`,
  );
}

describe('Article 3 on the browser: look, never act, unless asked', () => {
  it(
    'ART-03 40 read-only requests on foo’s browser: 0 approval or payment cards, 0 submissions, each offers "Want me to book one?"',
    { timeout: 240_000 },
    async () => {
      w = await bookingWorld();
      const page = w.sb.url('restaurant', '/book/coastline?party=4&time=8:00 PM');
      // After "Not now" the AI shows what it found and ends the look.
      const done = step(
        { kind: 'done', result: 'Coastline Kitchen has a table for 4 at 8 PM.', unverified: true },
        { match: { purpose: 'step', promptIncludes: 'A: Not now' }, once: false },
      );
      const common = (title: string): FakeLineIn[] => [
        { ...jobIntake([{ phraseKey: 'check_site', slots: { site: SITE_HOSTS.restaurant }, route: 'browser' }], { title }), once: false },
        tool('browser.snapshot', {}, { match: { purpose: 'step', promptIncludes: ', browser.open)' }, once: false }),
        tool('browser.open', { url: page }, { once: false }),
      ];
      // Half the asks the AI presses "Book table" on the page itself (refused), then asks to book; the other half it asks at once.
      const clicker = jobHarness({
        script: [
          done,
          askToBook(', browser.click)'),
          tool('browser.click', { ref: 'e3' }, { match: { purpose: 'step', promptIncludes: ', browser.snapshot)' }, once: false }),
          ...common('Look at tables'),
        ],
        browser: w.browser,
      });
      const asker = jobHarness({ script: [done, askToBook(', browser.snapshot)'), ...common('Look at tables')], browser: w.browser });
      hs.push(clicker, asker);

      for (const [i, ask] of ASKS.entries()) {
        const x = i % 2 === 0 ? clicker : asker;
        x.userSaysIn(x.chat(`c${i}`), ask);
        await settled(x);
        // "Not now" ends the look, so its window closes (at most 3 job windows, 08-4 §26.8) and the next ask can open one.
        for (const c of x.cards('choice').filter((c) => c.state === 'asking')) {
          const notNow = (JSON.parse(String(c.payload)) as { options: { id: string; label: string }[] }).options.find(
            (o) => o.label === 'Not now',
          )!;
          x.answer(String(c.id), notNow.id);
        }
        await settled(x);
      }
      for (const x of hs) {
        expect(x.jobs().every((j) => j.intent === 'read_only')).toBe(true);
        expect(x.cards('approval')).toHaveLength(0);
        expect(x.cards('payment')).toHaveLength(0);
        const offers = x.cards('choice').map((c) => JSON.parse(String(c.payload)) as { question: string; options: { label: string }[] });
        expect(offers, JSON.stringify(x.cards().map((c) => [c.type, c.state, c.chat_id]))).toHaveLength(20);
        for (const o of offers) {
          expect(o.question).toBe('Want me to book one?');
          expect(o.options.map((p) => p.label)).toEqual(['Yes, book', 'Not now']);
        }
        expect(x.messages().some((m) => m.text === t('thread.injection.blocked'))).toBe(false);
        expect(x.db.prepare('SELECT COUNT(*) AS n FROM approvals').get()).toEqual({ n: 0 });
        expect(x.db.prepare("SELECT COUNT(*) AS n FROM tool_calls WHERE tool = 'browser.submit'").get()).toEqual({ n: 0 });
      }
      // Every pressed "Book table" was refused as a commit click before the page saw it.
      const clicks = clicker.db.prepare("SELECT * FROM tool_calls WHERE tool = 'browser.click'").all();
      expect(clicks).toHaveLength(20);
      for (const c of clicks) expect(JSON.stringify(c)).toContain('USE_SUBMIT');
      expect((await w.control()).counters.submits ?? 0).toBe(0);
    },
  );
});
