// Spec: AT-111 (job half: a payment or booking card expires → the job CANCELLED; other cards keep the job NEEDS YOU, 08-2
// §9.1), AT-128 (job half: the job stopped elsewhere → its PENDING card WITHDRAWN "No longer needed. The job was stopped."),
// 07-2 §4 (needs_you → cancelled, stop_reason approval_expired), 08-2 §5.7 step 3, CR-0009 G-M5-18.
import { afterEach, describe, expect, it } from 'vitest';
import { jobHarness, jobIntake, step, tool, type JobHarness } from '../jobs/jobHarness';
import { BOOK_PLAN, bookScript, gateTools } from './gateFlow';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const approval = (x: JobHarness) => x.db.prepare('SELECT state FROM approvals').get() as { state: string };

describe('approval outcomes on the job', () => {
  it('AT-111 (job half) the booking card passes its 15 min → EXPIRED and the job CANCELLED (approval_expired)', async () => {
    h = jobHarness({ script: bookScript(), tools: { extra: gateTools() } });
    h.userSays('Book a table for 4 at Toit on Saturday');
    await h.settle();
    expect(h.job().state).toBe('needs_you');
    h.clock.advance(15 * 60_000);
    h.approvals.expireTick();
    await h.settle();
    expect(approval(h).state).toBe('EXPIRED');
    expect(h.job()).toMatchObject({ state: 'cancelled', stop_reason: 'approval_expired' });
  });

  it('AT-111 (job half) a delete card that expires keeps the job NEEDS YOU (Ask me again, 08-2 §9.1)', async () => {
    h = jobHarness({
      script: [
        jobIntake(BOOK_PLAN, { title: 'Delete the old booking' }),
        tool('fake.page', { site: 'table.example' }),
        step({
          kind: 'request_approval',
          draft: {
            verb: 'delete',
            fields: { verb: 'delete', item: 'Toit table', siteDomain: 'table.example', irreversible: false },
            evidence: [{ field: 'item', toolCallId: 'tc_000001', quote: 'Table for 4 at Toit' }],
          },
        }),
      ],
      tools: { extra: gateTools() },
    });
    h.userSays('Delete my old Toit booking');
    await h.settle();
    expect(h.cards('approval')[0]!.state).toBe('PENDING');
    h.clock.advance(60 * 60_000);
    h.approvals.expireTick();
    await h.settle();
    expect(approval(h).state).toBe('EXPIRED');
    expect(h.job().state).toBe('needs_you');
  });

  it('AT-128 (job half) the job is stopped elsewhere → its PENDING card WITHDRAWN, nothing runs', async () => {
    const ran: string[] = [];
    h = jobHarness({ script: bookScript(), tools: { extra: gateTools(ran) } });
    h.userSays('Book a table for 4 at Toit on Saturday');
    await h.settle();
    await h.engine.jobs.stopJob(String(h.job().id), 'user_button');
    await h.settle();
    h.approvals.expireTick();
    await h.settle();
    expect(h.job().state).toBe('cancelled');
    expect(approval(h).state).toBe('WITHDRAWN');
    expect(h.cards('approval')[0]!.state).toBe('WITHDRAWN');
    expect(ran).toEqual([]);
  });
});
