// Spec: 08-3 §22.9 seed sets, M4-tickets T5 demo ("seeded card rows, no engine: every M4 card renders in each state").
// Seed set `m4-cards` = the ux-world, plus two helper chats that hold one of each M4 job card: Errands (checklist live,
// plan pending, stuck asking, error shown, recovery shown, spend cap shown, a done job with its proof chip and receipt) and
// Home help (a job link to an Errands job). Step words come from the closed phrase catalogue (08-4 §26.1), never free text.
// Public repo: every name and number is made up.
import type { Db } from '../../store/db';
import { MIN, SeedWriter } from './writer';
import { seedUxWorld, type SeedResult } from './uxWorld';

type StepState = 'pending' | 'running' | 'done' | 'failed' | 'skipped' | 'waiting_user';

export function seedM4Cards(db: Db, now: number): SeedResult {
  const base = seedUxWorld(db, now);
  const w = new SeedWriter(db, 4);
  const refs: Record<string, string> = { ...base.refs };
  const at = (minAgo: number) => now - minAgo * MIN;
  const phrases = (jobId: string, steps: [string, Record<string, string>, StepState][]) => {
    db.prepare('DELETE FROM steps WHERE job_id = ?').run(jobId);
    const ins = db.prepare('INSERT INTO steps (id, job_id, idx, phrase_key, slots, state) VALUES (?, ?, ?, ?, ?, ?)');
    steps.forEach(([key, slots, state], idx) => ins.run(w.id('s', now), jobId, idx, key, JSON.stringify(slots), state));
    const cur = steps.findIndex((s) => s[2] === 'running' || s[2] === 'waiting_user');
    db.prepare('UPDATE jobs SET step_count = ?, current_step_idx = ? WHERE id = ?').run(steps.length, cur >= 0 ? cur : null, jobId);
  };

  db.transaction(() => {
    const errands = w.chat({
      kind: 'helper',
      title: 'Errands',
      at: at(1),
      createdAt: at(600),
      helper: { name: 'Errands', color: '--h-violet', face: 'letter:E', job: 'Runs small jobs for you.' },
    });
    const home = w.chat({
      kind: 'helper',
      title: 'Home help',
      at: at(2),
      createdAt: at(600),
      helper: { name: 'Home help', color: '--h-teal', face: 'letter:H', job: 'Looks after the house.' },
    });
    refs.errands = errands.chatId;
    refs.homeHelp = home.chatId;
    const h = errands.helperId!;
    const job = (title: string, state: Parameters<SeedWriter['job']>[0]['state'], minAgo: number, extra: Partial<Parameters<SeedWriter['job']>[0]> = {}) =>
      w.job({ chatId: errands.chatId, title, state, createdAt: at(minAgo), ownerHelperId: h, ...extra });
    const card = (type: Parameters<SeedWriter['card']>[1]['type'], state: string, minAgo: number, payload: Record<string, unknown>, jobId?: string) =>
      w.card(errands.chatId, { type, state, at: at(minAgo), payload, jobId, author: 'helper', helperId: h }).cardId;

    // Done with proof: a booked table, its result bubble, the proof chip and the receipt line (05-3 §5.15–§5.16).
    const dinner = job('Dinner table', 'done', 60, { finishedAt: at(52) });
    phrases(dinner, [
      ['check_sites', { sites: 'two restaurant sites' }, 'done'],
      ['book', { what: 'a table for 4' }, 'done'],
      ['find_proof', {}, 'done'],
    ]);
    const result = w.message(errands.chatId, { author: 'helper', helperId: h, text: 'Your table for 4 is booked for Sat 7:30 PM.', at: at(52), jobId: dinner });
    w.linkJob(dinner, { resultMessageId: result });
    db.prepare('UPDATE jobs SET proof = ?, spent_cost_paise = 300 WHERE id = ?').run(
      JSON.stringify({ kind: 'confirmation', code: 'TB40217', site: 'example-tables.in', seenInToolCallId: 'seed' }),
      dinner,
    );
    refs.dinnerJob = dinner;

    // Plan, pending (05-3 §5.12).
    const shoes = job('School shoes', 'needs_you', 40);
    phrases(shoes, [['wait_approve', {}, 'waiting_user']]);
    refs.planCard = card(
      'plan',
      'pending',
      40,
      {
        title: 'Find school shoes',
        steps: ['Look for black school shoes in size 4', 'Compare 3 shops', 'Show you before doing anything'],
        minutes: 6,
        costLine: '₹4',
        big: false,
      },
      shoes,
    );

    // Error, shown (05-3 §5.20): a site that did not open.
    const parcel = job('Parcel pickup', 'failed', 30, { finishedAt: at(28) });
    phrases(parcel, [
      ['check_site', { site: 'example-courier.in' }, 'failed'],
      ['fill_details', {}, 'pending'],
    ]);
    refs.errorCard = card(
      'error',
      'shown',
      28,
      {
        variant: 'error',
        kind: 'SITE_BLOCKED',
        whatHappened: 'example-courier.in didn’t open.',
        whatIsSafe: 'Nothing was booked or paid.',
        button: { label: 'Try again', action: { kind: 'retry' } },
        secondary: { label: 'Stop', action: { kind: 'stop' } },
        jobId: parcel,
        atStep: 1,
        of: 2,
      },
      parcel,
    );

    // Stuck, asking (05-3 §5.19).
    const gas = job('Gas cylinder', 'needs_you', 25, { usesBrowser: true });
    phrases(gas, [
      ['sign_in', { site: 'example-gas.in' }, 'done'],
      ['fill_details', {}, 'waiting_user'],
      ['pay', { payee: 'Example Gas' }, 'pending'],
    ]);
    refs.stuckCard = card(
      'stuck',
      'asking',
      22,
      {
        whatsWrong: 'The booking page keeps asking for a code I don’t have.',
        spentLine: '6 min, about ₹2',
        suggestion: 'I can try the phone booking page instead.',
        allowOtherWay: true,
      },
      gas,
    );

    // Recovery, shown (05-3 §5.20 recovery variant): foo restarted mid-job.
    const bill = job('Water bill', 'waiting', 18);
    phrases(bill, [
      ['read_bill', { biller: 'Water' }, 'done'],
      ['pay', { payee: 'Water board' }, 'pending'],
    ]);
    refs.recoveryCard = card(
      'error',
      'shown',
      18,
      {
        variant: 'recovery',
        kind: 'CRASH_RECOVERY',
        whatHappened: 'I closed before this job was done.',
        whatIsSafe: 'Nothing was paid.',
        button: { label: 'Carry on', action: { kind: 'resume_job' } },
        secondary: { label: 'Stop', action: { kind: 'stop' } },
        jobId: bill,
        atStep: 2,
        of: 2,
        doneLines: ['Read your Water bill'],
      },
      bill,
    );

    // Spend cap, shown (05-3 §5.21, AI variant): one job paused for the cap.
    const paused = job('Price watch', 'waiting', 15);
    phrases(paused, [['look_web', {}, 'running']]);
    db.prepare("UPDATE jobs SET waiting_reason = 'spend_cap' WHERE id = ?").run(paused);
    refs.spendCapCard = card('spend_cap', 'shown', 12, { which: 'ai', capPaise: 100_000, spentPaise: 100_000 });

    // Checklist, live (05-1 §5.2): the last card, so it sits at the bottom of the chat.
    const gift = job('Birthday gift', 'working', 8, { usesBrowser: true, lastProgressAt: at(1) });
    phrases(gift, [
      ['look_for', { what: 'a gift under ₹2,000' }, 'done'],
      ['compare', { what: '3 shops' }, 'done'],
      ['shortlist', { n: '3', what: 'gifts', rule: 'your budget' }, 'running'],
      ['wait_approve', {}, 'pending'],
    ]);
    db.prepare('UPDATE jobs SET spent_cost_paise = 200 WHERE id = ?').run(gift);
    refs.giftJob = gift;
    refs.checklistCard = card('checklist', 'live', 8, { title: 'Birthday gift' }, gift);

    // Job link in Home help, pointing at the gift job in Errands (05-3 §5.18.2).
    refs.jobLinkCard = w.card(home.chatId, { type: 'job_link', state: 'live', at: at(7), payload: { jobId: gift } }).cardId;
  })();
  const counts = w.finish(now);
  w.check();
  return { chats: base.chats + counts.chats, messages: base.messages + counts.messages, refs, media: base.media };
}
