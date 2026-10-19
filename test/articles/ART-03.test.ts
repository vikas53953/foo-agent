// Spec: 10-acceptance-2 ART-03 (Article 3, gate part): 40 read-only requests ("check…", "find…", "look at…", "see if…",
// "compare…", "is there…") across tables, hotels, flights and bills → 0 approval or payment cards, 0 submissions; options
// shown + "Want me to book one?". 08-2 §5.3.1 (no do-verb → intent read_only), §9.4 (read_only → Choice offer_action; the
// fake AI tries a book tool directly or asks for an approval), 08-4 §28.1 item 6.
import { afterEach, describe, expect, it } from 'vitest';
import { jobHarness, jobIntake, tool, type JobHarness } from '../integration/jobs/jobHarness';
import { BOOK_PLAN, bookRequest, gateTools } from '../integration/approvals/gateFlow';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const LEADS = ['Check', 'Find', 'Look at', 'See if there are', 'Compare', 'Is there'];
const THINGS = [
  'tables at Toit for Saturday',
  'hotels in Goa next weekend',
  'flights to Pune on Friday',
  'my electricity bill this month',
  'a room near the station',
  'trains to Jaipur on Monday',
  'dinner places open late',
];
const ASKS = Array.from({ length: 40 }, (_, i) => `${LEADS[i % LEADS.length]} ${THINGS[i % THINGS.length]}`);

describe('Article 3: look, never act, unless asked', () => {
  it(
    'ART-03 40 read-only requests: 0 approval or payment cards, 0 submissions, each offers "Want me to book one?"',
    { timeout: 60_000 },
    async () => {
      const ran: string[] = [];
      h = jobHarness({
        script: [
          { ...jobIntake(BOOK_PLAN, { title: 'Look at tables' }), once: false },
          // Half the asks the AI calls a booking tool directly; the other half it asks for an approval.
          { ...tool('fake.book', { to: 'table.example' }), once: false },
        ],
        tools: { extra: gateTools(ran) },
      });
      const h2 = jobHarness({
        script: [
          { ...jobIntake(BOOK_PLAN, { title: 'Look at stays' }), once: false },
          // After the page read (its observation is in part 8) the AI asks for an approval it was never given (no payee, so
          // the untrusted-origin branch, ART-05 territory, stays out of this article).
          { ...bookRequest('tc_000001', null), match: { purpose: 'step', promptIncludes: 'Last observation' }, once: false },
          { ...tool('fake.page', { site: 'table.example' }), once: false },
        ],
        tools: { extra: gateTools(ran) },
      });
      try {
        for (const [i, ask] of ASKS.entries()) {
          const x = i % 2 === 0 ? h : h2;
          x.userSaysIn(x.chat(`c${i}`), ask);
          await x.settle();
        }
        for (const x of [h, h2]) {
          const jobs = x.jobs();
          expect(jobs.every((j) => j.intent === 'read_only')).toBe(true);
          expect(x.cards('approval')).toHaveLength(0);
          expect(x.cards('payment')).toHaveLength(0);
          const offers = x.cards('choice').map((c) => JSON.parse(String(c.payload)) as { question: string; options: { label: string }[] });
          expect(offers, JSON.stringify(x.cards().map((c) => [c.type, c.state, c.chat_id]))).toHaveLength(20);
          // 08-1 §3.2: a tap sends the card's nonce, which card:answer accepts only as 32 hex.
          for (const c of x.cards('choice')) expect(String(c.nonce)).toMatch(/^[0-9a-f]{32}$/);
          for (const o of offers) {
            expect(o.question).toBe('Want me to book one?');
            expect(o.options.map((p) => p.label)).toEqual(['Yes, book', 'Not now']);
          }
          expect(x.db.prepare('SELECT COUNT(*) AS n FROM approvals').get()).toEqual({ n: 0 });
        }
        expect(ran).toEqual([]);
      } finally {
        h2.close();
      }
    },
  );
});
