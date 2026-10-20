// M4 T5 cards (CR-0008): 05-1 §5.2 Checklist rows, fold, right label, paused line, footer and summary; G-M4-06 ("Stopped
// by you" only for the user's stop reasons); 05-3 §5.12 Plan fold (X-131), §5.15 Proof chip words, §5.18.2 job link status,
// §5.21 "Wait until" date; 05-1 §0.1 registry (every M4 type has a component); the copy keys and test ids the cards use.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkNewCap,
  planWithdrawn,
  checklistFooter,
  checklistRightLabel,
  checklistView,
  jobLinkStatus,
  nextMonthStart,
  pausedLine,
  planRows,
  proofChip,
  stepOf,
} from '../../src/renderer/cards/jobCards';
import { t } from '../../src/shared/copy/t';
import { formatDate } from '../../src/shared/format';
import type { StepRow } from '../../src/shared/types';

const IST = 'Asia/Kolkata';
let n = 0;
const step = (
  idx: number,
  state: StepRow['state'],
  phraseKey = 'check_site',
  slots: Record<string, unknown> = { site: 'MakeMyTrip' },
): StepRow => ({
  id: `s_${++n}`,
  jobId: 'j_1',
  idx,
  phraseKey,
  slots,
  state,
  attempts: 0,
  route: null,
  rev: 1,
  startedAt: null,
  finishedAt: null,
});
const words = (v: ReturnType<typeof checklistView>) => v.lines.map((l) => [l.state, l.text]);

describe('Checklist rows (05-1 §5.2.2–§5.2.3)', () => {
  it('uses the done / running / next phrase forms for done, current and not-started rows', () => {
    const v = checklistView({ state: 'working', stopReason: null }, [
      step(0, 'done', 'check_sites', { sites: 'Booking.com, MakeMyTrip' }),
      step(1, 'running'),
      step(2, 'pending', 'look_web', {}),
    ]);
    expect(words(v)).toEqual([
      ['done', 'Checked Booking.com, MakeMyTrip'],
      ['current', 'Checking MakeMyTrip'],
      ['next', 'Look on the web'],
    ]);
    expect(v.folded).toBe(0);
  });

  it('a step waiting on the user reads the waiting phrase; an unknown key or bad slot reads generic_working', () => {
    const v = checklistView({ state: 'needs_you', stopReason: null }, [
      step(0, 'done', 'made_up_key', {}),
      step(1, 'waiting_user', 'wait_pick', {}),
      step(2, 'pending', 'check_site', { site: 'x'.repeat(41) }),
    ]);
    expect(words(v)).toEqual([
      ['done', 'Done this part'],
      ['waiting', 'Waiting for you to pick one ›'],
      ['next', 'Work on it'],
    ]);
  });

  it('QUEUED is a single row "Waiting for another job to finish"', () => {
    expect(words(checklistView({ state: 'queued', stopReason: null }, [step(0, 'pending'), step(1, 'pending')]))).toEqual([
      ['next', 'Waiting for another job to finish'],
    ]);
  });

  it('CANCELLED by the user ends with "Stopped by you"; a system cancel does not (G-M4-06)', () => {
    const steps = [step(0, 'done'), step(1, 'pending')];
    expect(words(checklistView({ state: 'cancelled', stopReason: 'user_button' }, steps)).at(-1)).toEqual(['stopped', 'Stopped by you']);
    expect(words(checklistView({ state: 'cancelled', stopReason: 'stuck_stop' }, steps)).at(-1)).toEqual(['stopped', 'Stopped by you']);
    expect(words(checklistView({ state: 'cancelled', stopReason: 'approval_expired' }, steps)).at(-1)?.[0]).toBe('next');
    // nothing runs once the job is CANCELLED: the runner's running / waiting rows read as not started
    const left = [step(0, 'done'), step(1, 'running'), step(2, 'waiting_user')];
    expect(words(checklistView({ state: 'cancelled', stopReason: 'user_button' }, left)).map((w) => w[0])).toEqual([
      'done',
      'next',
      'next',
      'stopped',
    ]);
  });

  it('shows at most 6 rows: finished steps fold into one top row "✓ {n} steps done · Show"', () => {
    const steps = [0, 1, 2, 3, 4].map((i) => step(i, 'done')).concat([step(5, 'running'), step(6, 'pending'), step(7, 'pending')]);
    const v = checklistView({ state: 'working', stopReason: null }, steps);
    expect(v.folded).toBe(3);
    expect(v.lines).toHaveLength(5); // + the fold row = 6
    expect(v.lines[0]!.index).toBe(3);
    expect(t('cards.checklist.show_done', { n: v.folded })).toBe('3 steps done · Show'); // the ✓ is the Fluent Checkmark icon beside it (CR-0021 pick 19);
    expect(checklistView({ state: 'working', stopReason: null }, steps, true).lines).toHaveLength(8);
  });

  it('right label: live checklist / Paused while WAITING / Didn’t finish when FAILED', () => {
    expect(checklistRightLabel('working')).toBe('live checklist');
    expect(checklistRightLabel('waiting')).toBe('Paused');
    expect(checklistRightLabel('failed')).toBe('Didn’t finish');
  });

  it('paused line by waiting reason (05-1 §5.2.2); quit and shutdown show none (08-4 §26.10)', () => {
    expect(pausedLine('ai_down')).toBe('Paused: your AI isn’t answering');
    expect(pausedLine('spend_cap')).toBe('Paused: you’ve reached this month’s AI cap');
    expect(pausedLine('asleep')).toBe('Paused: your PC went to sleep');
    expect(pausedLine('net_offline')).toBe('Paused: you’re offline');
    expect(pausedLine('app_quit')).toBeNull();
  });

  it('footer: "{n} min · uses about ₹{x} of your AI", "under 1 min"; step {k} of {n}', () => {
    const start = 1_760_000_000_000;
    const f = checklistFooter({ startedAt: start, createdAt: start, spentCostPaise: 300 }, start + 4 * 60_000 + 59_000, 'key');
    expect(t('cards.checklist.footer_text.key', { duration: f.duration, x: '₹3' })).toBe('4 min · uses about ₹3 of your AI');
    const g = checklistFooter({ startedAt: start, createdAt: start, spentCostPaise: 0 }, start + 30_000, 'plan');
    expect(g.duration).toBe('under 1 min');
    expect(g.costPaise).toBeNull();
    expect(stepOf({ currentStepIdx: 2, stepsDone: 2, stepCount: 4 })).toEqual({ k: 3, n: 4 });
    expect(t('cards.checklist.summary_done', { n: 4, m: 6 })).toBe('Done · 4 steps · 6 min');
  });
});

describe('Checklist: max 6 rows visible (05-1 §5.2.1, T5-11)', () => {
  it('8 steps with 1 done: the fold row plus 5 rows; the not-started tail waits until rows fold', () => {
    const steps = [step(0, 'done'), step(1, 'running'), ...[2, 3, 4, 5, 6, 7].map((i) => step(i, 'pending'))];
    const v = checklistView({ state: 'working', stopReason: null }, steps);
    expect(v.folded).toBe(1);
    expect(v.lines.length + (v.folded > 0 ? 1 : 0)).toBeLessThanOrEqual(6);
    expect(v.lines.map((l) => l.index)).toEqual([1, 2, 3, 4, 5]);
  });

  it('nothing done yet: 6 rows, the current one first; a stopped row is never cut', () => {
    const steps = [step(0, 'running'), ...[1, 2, 3, 4, 5, 6, 7].map((i) => step(i, 'pending'))];
    expect(checklistView({ state: 'working', stopReason: null }, steps).lines.map((l) => l.index)).toEqual([0, 1, 2, 3, 4, 5]);
    const stopped = checklistView({ state: 'cancelled', stopReason: 'user_button' }, steps);
    expect(stopped.lines).toHaveLength(6);
    expect(stopped.lines.at(-1)!.state).toBe('stopped');
  });
});

describe('Plan card withdrawn summary (05-3 §5.12.2, 05-1 §0.5)', () => {
  it('only the 24 h timeout (resolvedBy auto) says “didn’t hear back” with Start again; stopped elsewhere is the Withdrawn look, no buttons', () => {
    expect(planWithdrawn('Goa stay', 'auto')).toEqual({ text: 'I didn’t start Goa stay because I didn’t hear back.', startAgain: true });
    expect(planWithdrawn('Goa stay', 'system')).toEqual({ text: 'No longer needed. The job was stopped.', startAgain: false });
    expect(planWithdrawn('Goa stay', null)).toEqual({ text: 'No longer needed. The job was stopped.', startAgain: false });
  });
});

describe('Plan card (05-3 §5.12, X-131)', () => {
  it('shows all of up to 6 steps; beyond 6 the first 5 and "…and {n} more · Show"', () => {
    expect(planRows(['a', 'b', 'c', 'd', 'e', 'f'])).toEqual({ shown: ['a', 'b', 'c', 'd', 'e', 'f'], more: 0 });
    const r = planRows(['1', '2', '3', '4', '5', '6', '7', '8', '9']);
    expect(r).toEqual({ shown: ['1', '2', '3', '4', '5'], more: 4 });
    expect(t('cards.plan.show_all', { n: r.more })).toBe('…and 4 more · Show');
    expect(planRows(['1', '2', '3', '4', '5', '6', '7'], true).shown).toHaveLength(7);
  });
});

describe('Proof chip (05-3 §5.15.2)', () => {
  const chip = (p: Parameters<typeof proofChip>[0]) => {
    const c = proofChip(p)!;
    return [c.state, c.text];
  };
  it('words per proof kind', () => {
    expect(chip({ kind: 'confirmation', code: 'TJ88213', site: 'makemytrip.com', seenInToolCallId: 't1' })).toEqual([
      'confirmation',
      'Proof: booking #TJ88213',
    ]);
    expect(chip({ kind: 'confirmation', code: '2134567890', site: 'irctc.co.in', seenInToolCallId: 't1' })).toEqual([
      'confirmation',
      'Proof: PNR 2134567890',
    ]);
    expect(chip({ kind: 'email', connectionId: 'g', messageId: 'm', from: 'MakeMyTrip', subject: 's' })).toEqual([
      'email',
      'Proof: email from MakeMyTrip',
    ]);
    expect(chip({ kind: 'sent_folder', connectionId: 'g', messageId: 'm' })).toEqual(['sent_folder', 'Proof: in your Gmail Sent folder']);
    expect(chip({ kind: 'wa_delivered', waMessageId: 'w' })).toEqual(['wa_delivered', 'Proof: Delivered']);
    expect(chip({ kind: 'screenshot', path: 'p', stepId: 's' })).toEqual(['screenshot', 'Proof: screenshot']);
    expect(chip({ kind: 'read_source', source: 'Family group', count: 42 })).toEqual([
      'read_source',
      'Proof: Family group · 42 messages read',
    ]);
  });
});

describe('Job link card and Spend-cap card', () => {
  it('job link status words follow the runner state (05-3 §5.18.2)', () => {
    expect(jobLinkStatus('working', 2, 4).text).toBe('Working · step 2 of 4');
    expect(jobLinkStatus('needs_you', 1, 4).text).toBe('Needs you');
    expect(jobLinkStatus('done_unverified', 1, 4).text).toBe('Done');
    expect(jobLinkStatus('failed', 1, 4).text).toBe('Didn’t finish');
    expect(jobLinkStatus('cancelled', 1, 4).text).toBe('Stopped');
  });

  it('“Wait until” is the first day of next month in the user’s zone (05-3 §5.21: “Wait until Sun 1 Nov”)', () => {
    const fri16Oct = Date.UTC(2026, 9, 16, 4, 11); // Fri 16 Oct 2026, 9:41 AM IST
    const at = nextMonthStart(fri16Oct, IST);
    expect(at).toBe(Date.UTC(2026, 9, 31, 18, 30)); // 00:00 IST on Sun 1 Nov
    expect(t('cards.spend_cap.wait', { date: formatDate(at, 'date', { timeZone: IST, now: fri16Oct }) })).toBe('Wait until Sun 1 Nov');
    expect(nextMonthStart(Date.UTC(2026, 11, 20), IST)).toBe(Date.UTC(2026, 11, 31, 18, 30));
  });
});

describe('registry and words (05-1 §0.1, §0.4)', () => {
  const src = (f: string) => readFileSync(join(__dirname, '../../src/renderer/cards', f), 'utf8');
  it('every M4 card type has its component in the registry', () => {
    const reg = src('renderCard.tsx');
    for (const [type, comp] of [
      ['checklist', 'Checklist'],
      ['plan', 'Plan'],
      ['stuck', 'Stuck'],
      ['error', 'ErrorCard'],
      ['spend_cap', 'SpendCap'],
      ['job_link', 'JobLink'],
    ])
      expect(reg).toMatch(new RegExp(`${type}:\\s*${comp}\\b`));
  });

  it('the T5 copy keys are no longer pending (check:copy sees them used)', () => {
    const pending = JSON.parse(readFileSync(join(__dirname, '../../scripts/copy-pending.json'), 'utf8')) as {
      keys: Record<string, string>;
    };
    expect(Object.entries(pending.keys).filter(([, who]) => who.startsWith('M4-T5'))).toEqual([]);
  });
});

describe('C-21 raise the AI cap (06-3 §14)', () => {
  it('minimum is the current cap + ₹100, maximum ₹1,00,000, words only in rupees', () => {
    expect(checkNewCap('', 100_000)).toEqual({ ok: false, error: 'empty' });
    expect(checkNewCap('12a', 100_000)).toEqual({ ok: false, error: 'nan' });
    expect(checkNewCap('1,050', 100_000)).toEqual({ ok: false, error: 'min' });
    expect(checkNewCap('₹1,100', 100_000)).toEqual({ ok: true, paise: 110_000 });
    expect(checkNewCap('1,00,000', 100_000)).toEqual({ ok: true, paise: 10_000_000 });
    expect(checkNewCap('100001', 100_000)).toEqual({ ok: false, error: 'max' });
    expect(t('dialog.c_21.error_min', { min: '₹1,100' })).toBe('The new cap has to be at least ₹1,100.');
  });
});
