// Spec: 08-3 §16.1 Calls (Calendar `calendarId='primary'` only; events.list(timeMin, timeMax, singleEvents=true,
// orderBy='startTime', maxResults=100); default window = today 00:00 to tomorrow 23:59 in settings.locale.timeZone unless
// the step names one; events.insert body { summary, start: { dateTime, timeZone }, end: { dateTime, timeZone }, location?,
// description? }, no attendees and no reminders in v1), Proof `calendar_event` (event id), 08-2 §8.2 rows `gcal.list` (read)
// and `gcal.create` (calendar_write, permission row p-calendar: the gate decides, §9), 08-4 §27.1 descriptions.
import { z } from 'zod';
import type { ToolDef } from '../ToolLayer';
import { GOOGLE_BASES, connOutcome, googleCall, qs, type GoogleCallDeps } from './limiter';

export const LIST_MAX = 100;

const partsFormat = new Map<string, Intl.DateTimeFormat>();
function zoneParts(t: number, timeZone: string): number[] {
  let f = partsFormat.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    partsFormat.set(timeZone, f);
  }
  const p = Object.fromEntries(f.formatToParts(new Date(t)).map((x) => [x.type, Number(x.value)]));
  return [p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!];
}

/** Milliseconds the zone is ahead of UTC at instant `t`. */
function offsetAt(t: number, timeZone: string): number {
  const [y, mo, d, h, mi, s] = zoneParts(t, timeZone);
  return Date.UTC(y!, mo!, d!, h!, mi!, s!) - Math.floor(t / 1000) * 1000;
}

/** The instant a local midnight (y, m, d may overflow) happens in the zone. */
function localMidnight(y: number, mo: number, d: number, timeZone: string): number {
  const guess = Date.UTC(y, mo, d);
  const first = guess - offsetAt(guess, timeZone);
  return guess - offsetAt(first, timeZone);
}

/** Today 00:00 to tomorrow 23:59:59.999 in `timeZone`, as ISO instants. */
export function dayWindow(now: number, timeZone: string): { timeMin: string; timeMax: string } {
  const [y, mo, d] = zoneParts(now, timeZone);
  const start = localMidnight(y!, mo!, d!, timeZone);
  const end = localMidnight(y!, mo!, d! + 2, timeZone) - 1;
  return { timeMin: new Date(start).toISOString(), timeMax: new Date(end).toISOString() };
}

export interface CalEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
}

interface RawEvent {
  id: string;
  summary?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

export interface CalendarDeps extends GoogleCallDeps {
  base?: string;
  timeZone(): string;
}

export type Calendar = ReturnType<typeof createCalendar>;

export function createCalendar(d: CalendarDeps) {
  const url = `${d.base ?? GOOGLE_BASES.calendar}/calendar/v3/calendars/primary/events`;
  return {
    async list(o: { from?: string; to?: string }): Promise<CalEvent[]> {
      const w = dayWindow(d.clock.now(), d.timeZone());
      const timeMin = o.from ? new Date(o.from).toISOString() : w.timeMin;
      const timeMax = o.to ? new Date(o.to).toISOString() : w.timeMax;
      const r = (await googleCall(d, {
        url: `${url}${qs({ timeMin, timeMax, singleEvents: true, orderBy: 'startTime', maxResults: LIST_MAX })}`,
        flag: 'read',
      })) as { items?: RawEvent[] } | null;
      return (r?.items ?? []).map((e) => {
        const allDay = !e.start?.dateTime;
        return {
          id: e.id,
          title: e.summary ?? '',
          start: e.start?.dateTime ?? e.start?.date ?? '',
          end: e.end?.dateTime ?? e.end?.date ?? '',
          allDay,
          ...(e.location ? { location: e.location } : {}),
        };
      });
    },
    async create(o: { title: string; start: string; end: string; location?: string; notes?: string }) {
      const timeZone = d.timeZone();
      const r = (await googleCall(d, {
        url,
        method: 'POST',
        flag: 'calendarWrite',
        body: {
          summary: o.title,
          start: { dateTime: o.start, timeZone },
          end: { dateTime: o.end, timeZone },
          ...(o.location ? { location: o.location } : {}),
          ...(o.notes ? { description: o.notes } : {}),
        },
      })) as { id?: string } | null;
      return { eventId: String(r?.id ?? ''), title: o.title, start: o.start };
    },
  };
}

const instant = z.string().refine((s) => !Number.isNaN(Date.parse(s)));
const listArgs = z
  .object({ from: instant.optional(), to: instant.optional() })
  .strict()
  .refine((a) => !a.from || !a.to || Date.parse(a.to) > Date.parse(a.from));
const createArgs = z
  .object({
    title: z.string().min(1).max(200),
    start: instant,
    end: instant,
    location: z.string().max(200).optional(),
    notes: z.string().max(2000).optional(),
  })
  .strict()
  .refine((a) => Date.parse(a.end) > Date.parse(a.start));

/** 08-2 §8.2 + 08-4 §27.1: read the calendar; add an event (the gate asks first, calendar_write). */
export function gcalTools(cal: Calendar): ToolDef[] {
  return [
    {
      name: 'gcal.list',
      actionClass: 'read',
      args: 'from?: string, to?: string',
      description: 'List calendar events between two times.',
      run: (args) => connOutcome((a) => listArgs.safeParse(a), args, async (a) => ({ kind: 'ok', result: await cal.list(a) })),
    },
    {
      name: 'gcal.create',
      actionClass: 'calendar_write',
      args: 'title: string, start: string, end: string, location?: string, notes?: string',
      description: 'Add a calendar event.',
      run: (args) => connOutcome((a) => createArgs.safeParse(a), args, async (a) => ({ kind: 'ok', result: await cal.create(a) })),
    },
  ];
}
