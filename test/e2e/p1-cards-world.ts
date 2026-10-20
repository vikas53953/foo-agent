// Spec: 10-acceptance-2 §C.8 AT-310–AT-312, CR-0021 picks 12–15. Shared script for the P1 T7 cards spec and its foo-verify
// journey: a booking job on the M9 sandbox restaurant whose plan has a search step, a read step naming three places (the
// source pile), the runner's "Show you before booking" and the booking; the AI ticks steps off with `step_done` (08-2 §5.4,
// not a tool call, so the tool-call numbers of `requestBooking` / `bookedLine` hold). Fictional places; never a real booking.
import type { Sandbox } from '../sites/server';
import type { FakeLine } from './fakeAi';
import { SETUP_LINES, bookedLine, requestBooking, stepLine, toolLine } from './m9-booking-world';

export const CARDS_ASK = 'book a table for 4 at an Italian place in Bandra on Sunday';
/** 08-4 §26.1: a slot is at most 40 characters. */
export const CARDS_SITES = 'Coastline, Saffron Table and Bay Leaf';
/** 08-2 §5.3: the runner names the job from its booking verb ("Booking {what}"); the intake title is the AI's proposal. */
export const CARDS_JOB_TITLE = 'Booking a table for 4';
/** Pick 14 table for the finished steps: search 2 + read 3 + wait 0 + book 5 = 10. */
export const CARDS_SAVED_MIN = 10;

const intake: FakeLine = {
  match: { purpose: 'intake', promptIncludes: CARDS_ASK },
  reply: `<say></say><act>${JSON.stringify({
    decision: {
      kind: 'job',
      title: 'Table for 4 on Sunday',
      plan: [
        { phraseKey: 'look_web', slots: {}, route: 'browser' },
        { phraseKey: 'check_sites', slots: { sites: CARDS_SITES }, route: 'browser' },
        { phraseKey: 'book', slots: { what: 'a table for 4' }, route: 'browser' },
      ],
      estimate: { minutes: 3 },
      routeHint: ['browser'],
      needsApps: [],
    },
    usedMemoryIds: [],
  })}</act>`,
};

/** The whole run; `proven: false` ends on a code the site never showed, so the job is DONE "⚠ Not checked live". */
export function cardsLines(sb: Sandbox, proven = true): FakeLine[] {
  return [
    ...SETUP_LINES,
    intake,
    toolLine('browser.open', { url: sb.url('restaurant', '/') }),
    toolLine('browser.snapshot', {}),
    stepLine({ kind: 'step_done', idx: 0 }),
    stepLine({ kind: 'step_done', idx: 1 }),
    toolLine('browser.open', { url: sb.url('restaurant', '/book/coastline?party=4&time=8:00 PM') }),
    toolLine('browser.snapshot', {}),
    requestBooking(4),
    stepLine({ kind: 'step_done', idx: 2 }),
    proven
      ? bookedLine(5)
      : stepLine({
          kind: 'done',
          result: 'Booked. Coastline Kitchen, Sun 18 Oct at 8:00 PM for 4. Your code is ZZ0000.',
          proof: { kind: 'confirmation', code: 'ZZ0000', site: 'tablejoy.test', seenInToolCallId: 'tc_000005' },
        }),
  ];
}
