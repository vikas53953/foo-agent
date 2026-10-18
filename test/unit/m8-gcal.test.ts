// Spec: 08-3 §16.1 Calls (Calendar `primary` only; events.list(timeMin, timeMax, singleEvents=true, orderBy='startTime',
// maxResults=100); default window = today 00:00 to tomorrow 23:59 in settings.locale.timeZone unless the step names one;
// events.insert body { summary, start: { dateTime, timeZone }, end: { dateTime, timeZone }, location?, description? }, no
// attendees, no reminders), Proof `calendar_event` (event id), 08-2 §8.2 rows gcal.list (read) / gcal.create (calendar_write),
// 08-4 §27.1 descriptions.
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../src/shared/clock';
import { RateLimiter } from '../../src/engine/tools/connectors/limiter';
import { createCalendar, dayWindow, gcalTools } from '../../src/engine/tools/connectors/gcal';
import { drive, fakeAccess, fakeGoogle } from '../fakes/connectors/gmail-read';
import { calendarState, fakeCalendar } from '../fakes/connectors/gcal';

function setup(timeZone = 'Asia/Kolkata') {
  const clock = new FakeClock(); // Fri 16 Oct 2026, 9:00 AM IST (X-10)
  const state = calendarState();
  const g = fakeGoogle([fakeCalendar(state)], () => clock.now());
  const a = fakeAccess();
  const cal = createCalendar({ http: g.fetch, access: a.access, clock, limiter: new RateLimiter(clock), timeZone: () => timeZone });
  const tools = Object.fromEntries(gcalTools(cal).map((t) => [t.name, t]));
  const run = (name: string, args: unknown) =>
    drive(tools[name]!.run(args, { jobId: 'j_1', signal: new AbortController().signal, now: clock.now() }), clock);
  return { clock, g, a, state, cal, tools, run };
}

describe('Calendar window in locale.timeZone', () => {
  it('today 00:00 to tomorrow 23:59 IST', () => {
    const w = dayWindow(new FakeClock().now(), 'Asia/Kolkata');
    expect(w).toEqual({ timeMin: '2026-10-15T18:30:00.000Z', timeMax: '2026-10-17T18:29:59.999Z' });
  });

  it('follows the zone: the same instant in New York is Thu 15 Oct', () => {
    const w = dayWindow(new FakeClock().now(), 'America/New_York');
    expect(w).toEqual({ timeMin: '2026-10-15T04:00:00.000Z', timeMax: '2026-10-17T03:59:59.999Z' });
  });

  it('a day with a DST change still starts at local midnight (London, Sun 25 Oct 2026)', () => {
    const w = dayWindow(Date.UTC(2026, 9, 25, 12, 0), 'Europe/London');
    expect(w).toEqual({ timeMin: '2026-10-24T23:00:00.000Z', timeMax: '2026-10-26T23:59:59.999Z' });
  });
});

describe('gcal.list', () => {
  it('no window named → today + tomorrow, primary, single events by start time, ≤ 100', async () => {
    const { run, g } = setup();
    const out = await run('gcal.list', {});
    expect(out).toEqual({
      kind: 'ok',
      result: [
        { id: 'ev_standup', title: 'Team standup', start: '2026-10-16T10:00:00+05:30', end: '2026-10-16T10:15:00+05:30', allDay: false },
        {
          id: 'ev_dentist',
          title: 'Dentist',
          start: '2026-10-16T17:30:00+05:30',
          end: '2026-10-16T18:00:00+05:30',
          allDay: false,
          location: 'Clinic, example road',
        },
        { id: 'ev_trip', title: 'Day trip', start: '2026-10-17', end: '2026-10-18', allDay: true },
      ],
    });
    expect(g.requests[0]).toMatchObject({
      host: 'www.googleapis.com',
      path: '/calendar/v3/calendars/primary/events',
      query: {
        timeMin: '2026-10-15T18:30:00.000Z',
        timeMax: '2026-10-17T18:29:59.999Z',
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '100',
      },
    });
  });

  it('a window the step names is used as given', async () => {
    const { run, g } = setup();
    const out = (await run('gcal.list', { from: '2026-10-21T00:00:00+05:30', to: '2026-10-22T00:00:00+05:30' })) as {
      result: { id: string }[];
    };
    expect(out.result.map((e) => e.id)).toEqual(['ev_later']);
    expect(g.requests[0]!.query).toMatchObject({ timeMin: '2026-10-20T18:30:00.000Z', timeMax: '2026-10-21T18:30:00.000Z' });
  });

  it('a bad time or to before from → VALIDATION, nothing sent', async () => {
    const { run, g } = setup();
    expect(await run('gcal.list', { from: 'soon' })).toEqual({ kind: 'error', errorKind: 'VALIDATION' });
    expect(await run('gcal.list', { from: '2026-10-22T00:00:00Z', to: '2026-10-21T00:00:00Z' })).toEqual({
      kind: 'error',
      errorKind: 'VALIDATION',
    });
    expect(g.requests).toHaveLength(0);
  });
});

describe('gcal.create', () => {
  it('inserts { summary, start/end dateTime + timeZone, location, description } and returns the event id', async () => {
    const { run, state, g } = setup();
    const out = await run('gcal.create', {
      title: 'Pay electricity bill',
      start: '2026-10-19T09:00:00+05:30',
      end: '2026-10-19T09:15:00+05:30',
      location: 'Home',
      notes: 'Power Co, ₹1,240',
    });
    expect(out).toEqual({ kind: 'ok', result: { eventId: 'ev_new_1', title: 'Pay electricity bill', start: '2026-10-19T09:00:00+05:30' } });
    expect(state.inserted[0]).toEqual({
      id: 'ev_new_1',
      summary: 'Pay electricity bill',
      start: { dateTime: '2026-10-19T09:00:00+05:30', timeZone: 'Asia/Kolkata' },
      end: { dateTime: '2026-10-19T09:15:00+05:30', timeZone: 'Asia/Kolkata' },
      location: 'Home',
      description: 'Power Co, ₹1,240',
    });
    expect(g.requests[0]).toMatchObject({ method: 'POST', path: '/calendar/v3/calendars/primary/events' });
  });

  it('a missing calendar.events scope → CONN_SCOPE_MISSING and the calendarWrite flag', async () => {
    const { run, g, a } = setup();
    g.failNext('/calendar/v3/', { status: 403, body: { error: { errors: [{ reason: 'insufficientPermissions' }] } } });
    const out = await run('gcal.create', { title: 'X', start: '2026-10-19T09:00:00+05:30', end: '2026-10-19T10:00:00+05:30' });
    expect(out).toEqual({ kind: 'error', errorKind: 'CONN_SCOPE_MISSING' });
    expect(a.missing).toEqual(['calendarWrite']);
  });

  it('end not after start → VALIDATION', async () => {
    const { run } = setup();
    expect(await run('gcal.create', { title: 'X', start: '2026-10-19T09:00:00Z', end: '2026-10-19T09:00:00Z' })).toEqual({
      kind: 'error',
      errorKind: 'VALIDATION',
    });
  });
});

describe('08-4 §27.1 · what the AI is told', () => {
  it('gcal.list is read; gcal.create is calendar_write (asks the user first)', () => {
    const { tools } = setup();
    expect(Object.values(tools).map((t) => [t.name, t.actionClass, t.args, t.description])).toEqual([
      ['gcal.list', 'read', 'from?: string, to?: string', 'List calendar events between two times.'],
      ['gcal.create', 'calendar_write', 'title: string, start: string, end: string, location?: string, notes?: string', 'Add a calendar event.'],
    ]);
  });
});
