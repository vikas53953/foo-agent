// ART-17 (10-2 §D, Article 17): a 6-step job produces exactly one checklist message id, edited in place; the chat's message
// count rises by 1 for the checklist and 1 for the result. 05-1 §5.2, 08-2 §5.4.1.
import { afterEach, describe, expect, it } from 'vitest';
import { jobHarness, sixStepScript, type JobHarness } from '../integration/jobs/jobHarness';

let h: JobHarness | null = null;
afterEach(() => {
  h?.close();
  h = null;
});

describe('ART-17 · one checklist for the life of a job', () => {
  it('6 steps → one checklist message, edited in place; +1 checklist +1 result', async () => {
    h = jobHarness({ script: sixStepScript() });
    h.userSays('Make me a list of bills and stays');
    const before = h.messages().length;
    await h.settle();
    expect(h.job().state).toBe('done_unverified');

    const checklists = h.cards('checklist');
    expect(checklists).toHaveLength(1);
    const ops = h.txs.filter((t) => t.ok).flatMap((t) => t.ops);
    const inserted = ops.filter(
      (o) => o.op === 'insert' && o.table === 'messages' && (o.row as { card_id?: string }).card_id === checklists[0]!.id,
    );
    expect(inserted).toHaveLength(1);
    // Edited in place: the same card row got updates, never a second insert.
    expect(ops.filter((o) => o.op === 'update' && o.table === 'cards' && o.id === checklists[0]!.id).length).toBeGreaterThanOrEqual(6);

    expect(h.messages().length - before).toBe(2);
    expect(h.messages().at(-1)!.text).toBe('Here is your list.');
  });
});
