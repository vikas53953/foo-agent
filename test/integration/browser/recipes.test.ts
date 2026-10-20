// Spec: AT-144 (a saved recipe, when the job replays it: every step is matched by role and name before acting, no value (name,
// date, card data) is stored in the recipe, and the final click is never replayed: it goes through `browser.submit` with this
// job's own approval), 08-2 §8.3.11 (saved after DONE with proof; replay hints only where role + name match on a matching URL;
// the AI confirms each step), 08-1 §4.3.13 (`site_recipes`). M9 T8: on the sandbox restaurant (the brief's AT-144 site) with
// foo's real browser; made-up name and number.
import { afterEach, describe, expect, it } from 'vitest';
import { secondLookOk } from '../approvals/gateFlow';
import { jobHarness, jobIntake, step, tool, type FakeLineIn, type JobHarness } from '../jobs/jobHarness';
import { bookingWorld, type BookingWorld } from './booking';

let h: JobHarness | null = null;
let w: BookingWorld | null = null;
afterEach(async () => {
  h?.close();
  h = null;
  await w?.close();
  w = null;
});

const NAME = 'Asha Verma';
const PHONE = '98765 43210';

function bookingLines(world: BookingWorld, n: number, page = '/book/coastline?party=4&time=8:00 PM'): FakeLineIn[] {
  // Tool call ids count across both jobs: job 1 is tc_000001…tc_000005, job 2 starts at tc_000006.
  const base = (n - 1) * 5;
  const tc = (i: number) => `tc_${String(base + i).padStart(6, '0')}`;
  return [
    jobIntake([{ phraseKey: 'check_site', slots: { site: 'tablejoy.test' }, route: 'browser' }], { title: 'Book a table' }),
    tool('browser.open', { url: world.sb.url('restaurant', page) }),
    tool('browser.snapshot', {}),
    tool('browser.type', { ref: 'e1', text: NAME }),
    tool('browser.type', { ref: 'e2', text: PHONE }),
    step({
      kind: 'request_approval',
      draft: {
        verb: 'book',
        fields: {
          verb: 'book',
          payee: 'Coastline Kitchen',
          partySize: 4,
          cancelTerms: { refundable: true, feePaise: 1 },
          irreversible: false,
        },
        evidence: [{ field: 'cancelTerms', toolCallId: tc(2), quote: 'No-show fee ₹1,000', ref: 'e3' }],
      },
      submitRef: 'e3',
    }),
    secondLookOk(),
    step({
      kind: 'done',
      result: 'Booked. Your code is TJ8821.',
      proof: { kind: 'confirmation', code: 'TJ8821', site: 'tablejoy.test', seenInToolCallId: tc(5) },
    }),
  ];
}

async function bookOnce(x: JobHarness): Promise<string> {
  const before = new Set(x.jobs().map((j) => String(j.id)));
  x.userSays('Book a table for 4 at Coastline Kitchen on Sunday');
  await x.settle(20);
  const card = x.db.prepare("SELECT * FROM cards WHERE type = 'approval' AND state = 'PENDING'").get() as Record<string, unknown>;
  x.approvals.approve({ cardId: String(card.id), nonce: String(card.nonce), resolvedBy: 'tap', scope: 'once' });
  await x.settle(20);
  return String(x.jobs().find((j) => !before.has(String(j.id)))!.id);
}

describe('AT-144 · site recipes', () => {
  it('AT-144 saved after DONE with proof by role and name only; replayed by role + name; the book click is this job’s own submit', async () => {
    w = await bookingWorld();
    h = jobHarness({ script: [...bookingLines(w, 1), ...bookingLines(w, 2)], browser: w.browser });

    const first = await bookOnce(h);
    expect(h.job(first).state).toBe('done');
    const row = h.db.prepare("SELECT * FROM site_recipes WHERE domain = 'tablejoy.test'").get() as Record<string, unknown>;
    expect(String(row.id)).toMatch(/^rcp_/u);
    expect(row.url_pattern).toBe(w.sb.url('restaurant', '/book/coastline'));
    expect(JSON.parse(String(row.steps_json))).toEqual([
      { instruction: 'type', role: 'textbox', name: 'Name', fallbackSelector: 'input', variableName: 'name' },
      { instruction: 'type', role: 'textbox', name: 'Phone', fallbackSelector: 'input[type="tel"]', variableName: 'phone' },
    ]);
    // No value: not the name, the number, the party size or the time; no commit step.
    const stored = JSON.stringify(row);
    for (const v of [NAME, PHONE, 'party=4', '8:00', 'Book table', 'submit']) expect(stored).not.toContain(v);
    expect(row.success_count).toBe(1);

    const second = await bookOnce(h);
    expect(h.job(second).state).toBe('done');
    // The replay: the step turn after the snapshot names each saved step with this page's ref, matched by role + name.
    const steps = h
      .turnsJsonl()
      .filter((t) => t.purpose === 'step')
      .map((t) => String(t.prompt));
    const replayed = steps.filter((p) => p.includes('Saved steps for this site'));
    expect(replayed.length).toBeGreaterThan(0);
    const lines = replayed[0]!.split('\n');
    const at = lines.findIndex((l) => l.startsWith('Saved steps for this site'));
    expect(lines.slice(at + 1, at + 3)).toEqual([
      '1. type [e1] textbox "Name" with this job\'s name',
      '2. type [e2] textbox "Phone" with this job\'s phone',
    ]);
    // The Book table button is not among the saved steps.
    expect(lines[at + 3] ?? '').not.toMatch(/^\d+\. /u);
    // The final click went through browser.submit with job 2's own approval.
    const submit = h.toolCalls(second).find((c) => c.tool === 'browser.submit')!;
    const approval = h.db.prepare('SELECT id, job_id FROM approvals WHERE id = ?').get(submit.approval_id) as { job_id: string };
    expect(approval.job_id).toBe(second);
    expect((await w.control()).counters.submits).toBe(2);
    const again = h.db.prepare("SELECT success_count FROM site_recipes WHERE domain = 'tablejoy.test'").get() as { success_count: number };
    expect(again.success_count).toBe(2);
  }, 90_000);

  it('AT-144 a page whose controls do not match by role + name gets no replay line (a miss is left to the AI)', async () => {
    w = await bookingWorld();
    h = jobHarness({ script: [...bookingLines(w, 1)], browser: w.browser });
    await bookOnce(h);
    const recipe = h.db.prepare("SELECT url_pattern, steps_json FROM site_recipes WHERE domain = 'tablejoy.test'").get() as {
      url_pattern: string;
      steps_json: string;
    };
    const steps = JSON.parse(recipe.steps_json) as { role: string; name: string }[];
    const matched = w.browser.runtime.recipes.match('job_other', { urlPattern: recipe.url_pattern, steps: steps as never });
    expect(matched).toEqual([]);
  }, 90_000);
});
