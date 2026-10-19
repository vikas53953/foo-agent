// Spec: 10-acceptance-2 ART-05b (Article 5: every permission chip at its most permissive allowed value plus every allowed
// "Always" rule; each hard limit (address, phone, payment, irreversible, public post, new person) still asks with "I'll
// always ask for this one."), 08-2 §9.2 (hard-limit column), §9.4 (no `always` and no rule for a hard limit), §9.5 (rules
// never cover hard limits), 08-0 §A.2 (locks), 05-2 §5.5.2 (hardLimit → the line, scope "Just this once" only).
// The Approval card half runs through a real job (book, delete); the gate half covers pay (Payment card, M10), a send to a
// new person (the Draft card, M8) and a public post (never in v1: handed back, never posted by foo).
import { afterEach, describe, expect, it } from 'vitest';
import { createGate, type GateCall, type GateJob } from '../../src/engine/gate/GateLogic';
import { isHardLimit } from '../../src/engine/gate/classes';
import { settingsDefaults } from '../../src/shared/settingsDefaults';
import type { ApprovalFields } from '../../src/shared/types';
import { jobHarness, jobIntake, step, tool, type JobHarness } from '../integration/jobs/jobHarness';
import { BOOK_PLAN, gateTools, permissive } from '../integration/approvals/gateFlow';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const NOW = Date.UTC(2026, 9, 17, 6, 0);
const amount = { field: 'amountPaise', toolCallId: 'tc_000001', quote: 'Total ₹2,400', ref: 'e7' };
const book = (extra: Partial<ApprovalFields>) => ({
  verb: 'book',
  fields: { verb: 'book', payee: 'Toit', partySize: 4, amountPaise: 1, cancelTerms: { refundable: true }, irreversible: false, ...extra },
  evidence: [amount],
});

const CARDS: [string, string, Record<string, unknown>][] = [
  ['address', 'Book the table at Toit for 4', book({ personalShared: ['address'] })],
  ['phone', 'Book the table at Toit for 4', book({ personalShared: ['phone'] })],
  ['no free cancel', 'Book the table at Toit for 4', book({ cancelTerms: { refundable: false } })],
  [
    'irreversible delete',
    'Delete my old booking at Toit',
    {
      verb: 'delete',
      fields: { verb: 'delete', item: 'Table for 4 at Toit', irreversible: false },
      evidence: [{ field: 'item', toolCallId: 'tc_000001', quote: 'Table for 4 at Toit' }],
    },
  ],
];

describe('Article 5: hard limits always ask', () => {
  it(
    'ART-05b most permissive chips + every allowed rule: each hard limit still asks, "I’ll always ask for this one."',
    { timeout: 60_000 },
    async () => {
      const ran: string[] = [];
      for (const [label, ask, draft] of CARDS) {
        h = jobHarness({
          settings: permissive(),
          script: [
            jobIntake(BOOK_PLAN, { title: 'Book a table' }),
            tool('fake.page', { site: 'table.example' }),
            step({ kind: 'request_approval', draft, submitRef: 'e9' }),
          ],
          tools: { extra: gateTools(ran) },
        });
        h.userSays(ask);
        await h.settle();
        const cards = h.cards('approval');
        expect(cards, label).toHaveLength(1);
        const p = JSON.parse(String(cards[0]!.payload)) as { hardLimit: boolean; scopes: string[] };
        // hardLimit is what draws "I'll always ask for this one." (Approval.tsx) and leaves only "Just this once".
        expect([p.hardLimit, p.scopes], label).toEqual([true, ['once']]);
        expect(h.db.prepare('SELECT hard_limit, state FROM approvals').get(), label).toEqual({ hard_limit: 1, state: 'PENDING' });
        expect(h.job().state, label).toBe('needs_you');
        h.close();
        h = null;
      }
      expect(ran).toEqual([]);

      // The gate half: the same permissive settings, every rule; pay, a new person, a public post.
      const s = permissive()(structuredClone(settingsDefaults));
      const gate = createGate({ settings: () => s, now: () => NOW });
      const job: GateJob = { id: 'j1', intent: 'do', doVerbs: ['book', 'pay', 'send', 'post'], ownerId: null, appAnswers: new Map() };
      const decide = (c: GateCall) => gate.decide(job, c);
      const pay: ApprovalFields = { verb: 'pay', payee: 'Power Co', amountPaise: 240_000, irreversible: true };
      expect(decide({ tool: 'browser.submit', cls: 'pay', fields: pay })).toEqual({ kind: 'CARD', hard: true });
      const newPerson: GateCall = {
        tool: 'gmail.send',
        cls: 'send',
        fields: {
          verb: 'send',
          recipients: [{ name: 'Asha', address: 'asha@example.com', isNew: true, isGroup: false }],
          irreversible: true,
        },
      };
      // A send is never the AI's: it is the Draft card's own approval, and a new person keeps it a hard limit there.
      expect(decide(newPerson)).toEqual({ kind: 'DRAFT_SEND' });
      expect(isHardLimit('send', newPerson.fields, NOW)).toBe(true);
      expect(decide({ tool: 'x.post', cls: 'post' })).toEqual({ kind: 'HAND_BACK' });
    },
  );
});
