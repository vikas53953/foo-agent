// Spec: AT-110 (NEEDS YOU declined → CANCELLED with "Okay, I won't. {next step or 'Nothing else to do here.'}"), 07-2 §4
// (`declined`, stop_reason approval_declined), 08-4 §28.1 (a verified request_approval opens a PENDING Approval card and the
// job waits on it), §28.1 item 8 (Approve → write-ahead RUNNING → the side-effect tool once → COMPLETED).
import { afterEach, describe, expect, it } from 'vitest';
import { jobHarness, step, type JobHarness } from '../jobs/jobHarness';
import { bookScript, gateTools } from './gateFlow';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const texts = (x: JobHarness) => x.messages().filter((m) => m.kind === 'text' && m.author_kind === 'foo').map((m) => m.text);

describe('approval card from a job (08-4 §28.1)', () => {
  it('AT-110 Not now on the Approval card → CANCELLED, "Okay, I won’t. Nothing else to do here.", nothing booked', async () => {
    const ran: string[] = [];
    h = jobHarness({ script: bookScript(), tools: { extra: gateTools(ran) } });
    h.userSays('Book a table for 4 at Toit on Saturday');
    await h.settle();
    const job = h.job();
    expect(job.state).toBe('needs_you');
    const card = h.cards('approval')[0]!;
    expect(card.state).toBe('PENDING');
    expect(job.needs_you_card_id).toBe(card.id);
    const payload = JSON.parse(String(card.payload)) as { fields: { amountPaise: number }; title: string };
    // The AI said 1 paisa; the engine re-read ₹2,400 from the page (08-4 §28.1 item 1).
    expect(payload.fields.amountPaise).toBe(240_000);
    expect(payload.title).toBe('Book this table?');

    const r = h.approvals.decline({ cardId: String(card.id), nonce: String(card.nonce), resolvedBy: 'tap' });
    expect(r.ok).toBe(true);
    await h.settle();
    expect(h.job()).toMatchObject({ state: 'cancelled', stop_reason: 'approval_declined' });
    expect(h.cards('approval')[0]!.state).toBe('DECLINED');
    expect(texts(h)).toContain('Okay, I won’t. Nothing else to do here.');
    expect(ran).toEqual([]);
  });

  it('Approve → RUNNING written ahead → browser.submit once → COMPLETED; the AI sees it in "Approved so far"', async () => {
    const ran: string[] = [];
    h = jobHarness({
      script: bookScript([
        { ...step({ kind: 'done', result: 'Booked your table.', unverified: true }), match: { purpose: 'step', promptIncludes: '- book · payee: Toit' } },
      ]),
      tools: { extra: gateTools(ran) },
    });
    h.userSays('Book a table for 4 at Toit on Saturday');
    await h.settle();
    const card = h.cards('approval')[0]!;
    expect(h.approvals.approve({ cardId: String(card.id), nonce: String(card.nonce), scope: 'once', resolvedBy: 'tap' }).ok).toBe(true);
    await h.settle();
    expect(ran).toEqual(['browser.submit']);
    const ap = h.db.prepare('SELECT state, submitted_at FROM approvals').get() as { state: string; submitted_at: number | null };
    expect(ap.state).toBe('COMPLETED');
    expect(ap.submitted_at).not.toBeNull();
    const submit = h.toolCalls().find((c) => c.tool === 'browser.submit')!;
    expect(submit).toMatchObject({ gate: 'approved', outcome: 'ok' });
    expect(h.job().state).toBe('done_unverified');
  });
});
