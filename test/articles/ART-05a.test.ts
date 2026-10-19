// Spec: 10-acceptance-2 ART-05a (Article 5: the connector and browser layer refuses any send, buy, book, post or delete
// without an APPROVED approval id, including a fake AI that calls the action directly; 100 % refused), 08-2 §9.4 (the gate
// runs for every tool call), §8.2 (engine-only tools), pack M5 §7 risk 1 (AI-called acting / engine-only tool → USE_SUBMIT),
// 08-0 §A.2 (post is never in v1: a hand-back, not a run). The ToolLayer unit half is test/unit/tools/ToolLayer.test.ts.
import { afterEach, describe, expect, it } from 'vitest';
import { jobHarness, jobIntake, step, tool, type JobHarness } from '../integration/jobs/jobHarness';
import { BOOK_PLAN, gateTools, permissive } from '../integration/approvals/gateFlow';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

// The fake AI calls each acting tool itself, some with a made-up approval id, in a job whose ask names every verb.
const DIRECT = [
  ['fake.book', { to: 'table.example' }],
  ['fake.pay', { to: 'pay.example', approvalId: 'ap_forged' }],
  ['fake.delete', { to: 'table.example' }],
  ['fake.post', { to: 'x.example' }],
  ['gmail.send', { to: 'asha@example.com', approvalId: 'ap_forged' }],
  ['browser.fillCard', { to: 'pay.example' }],
  ['browser.submit', { to: 'table.example', approvalId: 'ap_forged' }],
] as const;

describe('Article 5: nothing acts without an approved approval', () => {
  it(
    'ART-05a a fake AI calling send, buy, book, post or delete directly: 100 % refused, 0 runs, 0 approvals',
    { timeout: 60_000 },
    async () => {
      const ran: string[] = [];
      let refused = 0;
      for (const [name, args] of DIRECT) {
        h = jobHarness({
          settings: permissive(),
          script: [
            jobIntake(BOOK_PLAN, { title: 'Do it all' }),
            tool(name, args),
            step({ kind: 'done', result: 'Done.', unverified: true }),
          ],
          tools: { extra: gateTools(ran) },
        });
        h.userSays('Book the table at Toit, pay the bill, delete the old booking, post about it and send it to Asha');
        await h.settle();
        expect(h.job().intent).toBe('do');
        const row = h.toolCalls().find((c) => c.tool === name);
        expect(row, name).toBeDefined();
        // An acting or engine-only call is USE_SUBMIT; post (never in v1) is handed back. Neither runs.
        const want = name === 'fake.post' ? ['handed_back', null] : ['blocked', 'USE_SUBMIT'];
        expect([row!.gate, row!.error_kind, row!.approval_id], name).toEqual([...want, null]);
        refused += 1;
        expect(h.db.prepare('SELECT COUNT(*) AS n FROM approvals').get()).toEqual({ n: 0 });
        h.close();
        h = null;
      }
      expect(refused / DIRECT.length).toBe(1);
      expect(ran).toEqual([]);
    },
  );
});
