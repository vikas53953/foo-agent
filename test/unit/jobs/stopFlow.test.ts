// Spec: 08-2 §5.2.1 (isStopCommand: the anchored stop regex, trimmed and lower-cased; anything longer is not a stop),
// §5.2.2 (looksLikeYes only triggers the G16 reply), §5.7 step 4 (the stop report is built only from activity rows: done
// rows of kinds sent, paid, booked, deleted), 08-4 §26.9 item 1 ("stop everything" → stopAll), CR-0008 G-M4-14 (the bare
// word "cancel" is a stop; "cancel my booking" is the delete verb, not a stop).
import { describe, expect, it } from 'vitest';
import { t } from '../../../src/shared/copy/t';
import { isStopCommand, isStopEverything, looksLikeYes, stopAllReportText, stopReportText } from '../../../src/engine/jobs/stopFlow';
import type { ActivityRow } from '../../../src/shared/types';

describe('08-2 §5.2.1 isStopCommand', () => {
  it.each([
    'stop',
    'Stop',
    '  STOP  ',
    'stop.',
    'stop!',
    'stop that',
    'stop it',
    'cancel',
    'stop everything',
    'ruko',
    'ruk jao',
    'bas',
    'band karo',
    'rok do',
    'bas!!',
  ])('"%s" is a stop', (text) => expect(isStopCommand(text)).toBe(true));

  it.each([
    'cancel my booking',
    'stop at the Taj and W only',
    'only look at Taj and W',
    'basically yes',
    'stopwatch',
    'stop the music please',
    '',
  ])('"%s" is not a stop (G-M4-14: longer text may be a steer)', (text) => expect(isStopCommand(text)).toBe(false));

  it('"stop everything" means every job (08-4 §26.9 item 1)', () => {
    expect(isStopEverything('Stop everything.')).toBe(true);
    expect(isStopEverything('stop')).toBe(false);
  });
});

describe('08-2 §5.2.2 looksLikeYes', () => {
  it.each(['yes', 'Yep', 'ok', 'okay go ahead', 'haan', 'theek hai', 'kar do', 'book it', 'approve', 'pay'])('"%s" looks like yes', (x) =>
    expect(looksLikeYes(x)).toBe(true),
  );
  it.each(['no', 'not yet', 'yesterday was fine', 'okra'])('"%s" does not', (x) => expect(looksLikeYes(x)).toBe(false));
});

const row = (o: Partial<ActivityRow>): ActivityRow => ({
  id: 'act_1',
  at: 0,
  kind: 'sent',
  event: 'sent_email',
  actor: 'foo',
  chatId: null,
  chatTitle: null,
  jobId: 'j1',
  approvalId: null,
  paymentId: null,
  routineId: null,
  summary: 'sent the email to Rakesh',
  toLabel: null,
  fromLabel: null,
  amountPaise: null,
  approvedHow: null,
  ruleText: null,
  proofKind: null,
  proofRef: null,
  outcome: 'done',
  fields: null,
  ...o,
});

describe('08-2 §5.7 step 4 stop report (from activity rows only)', () => {
  const tz = { timeZone: 'Asia/Kolkata' };
  // 03:44 UTC = 9:14 AM IST.
  const at = Date.UTC(2026, 9, 18, 3, 44);

  it('no done rows → "Stopped. Nothing was booked, paid or sent."', () => {
    expect(stopReportText([], tz)).toBe(t('thread.stop.report.nothing'));
  });

  it('a failed or unknown row, or a non-action kind, does not count as done', () => {
    const rows = [row({ outcome: 'failed' }), row({ outcome: 'unknown' }), row({ kind: 'stopped', event: 'stopped_job' })];
    expect(stopReportText(rows, tz)).toBe(t('thread.stop.report.nothing'));
  });

  it('a done send row → the partial report with its summary and time', () => {
    expect(stopReportText([row({ at })], tz)).toBe(
      t('thread.stop.report.partial', { summary: 'sent the email to Rakesh', time: '9:14 AM' }),
    );
  });
});

describe('J18 "Stop everything" combined report (06-3 §14 C-13, CR-0030 pick 1)', () => {
  it('nothing done → "Stopped 3 jobs: …. Nothing was booked, paid or sent."', () => {
    expect(stopAllReportText(['Goa stay', 'Airtel bill', 'Delhi flights'], [])).toBe(
      'Stopped 3 jobs: Goa stay, Airtel bill, Delhi flights. Nothing was booked, paid or sent.',
    );
  });

  it('one job reads "Stopped 1 job: …"', () => {
    expect(stopAllReportText(['Goa stay'], [])).toBe('Stopped 1 job: Goa stay. Nothing was booked, paid or sent.');
  });

  it('a send done earlier and no payment → "Nothing was paid." and what was already done', () => {
    expect(stopAllReportText(['Goa stay', 'Airtel bill'], [row({ summary: 'Sent an email to Rakesh Sharma' })])).toBe(
      'Stopped 2 jobs: Goa stay, Airtel bill. Nothing was paid. Already done before the stop: Sent an email to Rakesh Sharma.',
    );
  });

  it('a payment done earlier is never hidden behind "Nothing was paid."', () => {
    const text = stopAllReportText(['Airtel bill'], [row({ kind: 'paid', event: 'paid', summary: 'Paid ₹1,179 to Airtel' })]);
    expect(text).not.toContain(t('thread.stop.all.nothing_paid'));
    expect(text).toContain('Paid ₹1,179 to Airtel');
  });
});
