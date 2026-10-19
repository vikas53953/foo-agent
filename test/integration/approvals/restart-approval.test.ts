// Spec: 08-4 §28.1 item 8 (the approved action runs once, after the write-ahead), 08-2 §5.9 (an engine restart: rows are the
// truth, RAM is not), §9.1 + AT-111 (job half: an expired booking card cancels the job), 07-2 §4. M5 T7 review fix: the
// runner's open approval and its submit target are read back from main after a restart (CR-0009 G-M5-29 `submitRef`).
import { afterEach, describe, expect, it } from 'vitest';
import { jobHarness, step, type JobHarness } from '../jobs/jobHarness';
import { restartEngine } from '../jobs/restart';
import { bookScript, gateTools, secondLookOk } from './gateFlow';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

const approval = (x: JobHarness) =>
  x.db.prepare('SELECT state, submitted_at FROM approvals').get() as { state: string; submitted_at: number | null };

describe('an approval card that waits across an engine restart', () => {
  it('Approve after the restart runs the action exactly once, on the element the AI named', async () => {
    const before: string[] = [];
    h = jobHarness({ script: bookScript(), tools: { extra: gateTools(before) } });
    h.userSays('Book a table for 4 at Toit on Saturday');
    await h.settle();
    expect(approval(h).state).toBe('PENDING');

    const after: string[] = [];
    restartEngine(
      h,
      [secondLookOk(), step({ kind: 'done', result: 'Booked your table.', unverified: true })],
      { safeMode: false, cleanStart: true },
      {
        extra: gateTools(after),
      },
    );
    await h.settle();
    const card = h.cards('approval')[0]!;
    expect(h.approvals.approve({ cardId: String(card.id), nonce: String(card.nonce), scope: 'once', resolvedBy: 'tap' }).ok).toBe(true);
    await h.settle();
    expect([...before, ...after]).toEqual(['browser.submit']);
    const ap = approval(h);
    expect(ap.state).toBe('COMPLETED');
    expect(ap.submitted_at).not.toBeNull();
    const submit = h.toolCalls().find((c) => c.tool === 'browser.submit')!;
    expect(submit).toMatchObject({ gate: 'approved', outcome: 'ok' });
    expect(JSON.parse(String(submit.args))).toMatchObject({ ref: 'e9' });
    expect(h.job().state).toBe('done_unverified');
  });

  it('after the restart the booking card expires (the job-half expiry rule) → EXPIRED and the job CANCELLED', async () => {
    h = jobHarness({ script: bookScript(), tools: { extra: gateTools() } });
    h.userSays('Book a table for 4 at Toit on Saturday');
    await h.settle();
    restartEngine(h, [], { safeMode: false, cleanStart: true }, { extra: gateTools() });
    await h.settle();
    h.clock.advance(15 * 60_000);
    h.approvals.expireTick();
    await h.settle();
    expect(approval(h).state).toBe('EXPIRED');
    expect(h.job()).toMatchObject({ state: 'cancelled', stop_reason: 'approval_expired' });
  });
});
