// Spec: 08-3 §22.4 (fake Calendar, in memory), §16.1 Calls (Calendar `primary` only: events.list(timeMin, timeMax,
// singleEvents=true, orderBy='startTime', maxResults=100) and events.insert). Made-up events only.
import type { FakeHandler } from './gmail-read';

export interface FakeEvent {
  id: string;
  summary: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  location?: string;
  description?: string;
}

export interface FakeCalendarState {
  events: FakeEvent[];
  inserted: FakeEvent[];
  nextId: number;
}

/** Two events on Fri 16 Oct 2026 (IST), one on Sat 17, one next week (outside today + tomorrow). */
export function calendarState(): FakeCalendarState {
  return {
    events: [
      {
        id: 'ev_standup',
        summary: 'Team standup',
        start: { dateTime: '2026-10-16T10:00:00+05:30' },
        end: { dateTime: '2026-10-16T10:15:00+05:30' },
      },
      {
        id: 'ev_dentist',
        summary: 'Dentist',
        start: { dateTime: '2026-10-16T17:30:00+05:30' },
        end: { dateTime: '2026-10-16T18:00:00+05:30' },
        location: 'Clinic, example road',
      },
      { id: 'ev_trip', summary: 'Day trip', start: { date: '2026-10-17' }, end: { date: '2026-10-18' } },
      {
        id: 'ev_later',
        summary: 'Later thing',
        start: { dateTime: '2026-10-21T09:00:00+05:30' },
        end: { dateTime: '2026-10-21T10:00:00+05:30' },
      },
    ],
    inserted: [],
    nextId: 1,
  };
}

const startMs = (e: FakeEvent) => Date.parse(e.start.dateTime ?? `${e.start.date}T00:00:00+05:30`);
const endMs = (e: FakeEvent) => Date.parse(e.end.dateTime ?? `${e.end.date}T00:00:00+05:30`);

const EVENTS = '/calendar/v3/calendars/primary/events';

export function fakeCalendar(state: FakeCalendarState): FakeHandler {
  return ({ method, url, body }) => {
    if (url.pathname !== EVENTS) return null;
    if (method === 'GET') {
      const min = Date.parse(url.searchParams.get('timeMin') ?? '');
      const max = Date.parse(url.searchParams.get('timeMax') ?? '');
      const items = [...state.events, ...state.inserted]
        .filter((e) => endMs(e) > min && startMs(e) < max)
        .sort((a, b) => startMs(a) - startMs(b))
        .slice(0, Number(url.searchParams.get('maxResults') ?? 250));
      return { status: 200, body: { items } };
    }
    if (method === 'POST') {
      const e = { ...(body as Omit<FakeEvent, 'id'>), id: `ev_new_${state.nextId++}` };
      state.inserted.push(e);
      return { status: 200, body: { ...e, htmlLink: `https://calendar.example.com/event?eid=${e.id}` } };
    }
    return null;
  };
}
