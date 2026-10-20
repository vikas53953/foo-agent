// Spec: 04 §6.5 ("foo read:" line: the people, places, dates, times and amounts foo understood from the user's message,
// joined by " · "; built by the engine from the redacted text only, so it never shows a secret; stored as JSON `string[]` in
// `messages.understood`; hidden when nothing was found, in groups and in WhatsApp mirrors), 08-2 §11.4 (redaction first),
// 08-1 §4.2 item 6, 02-2 §F19.2 (₹ exact form), §F19.3 / Article 21 ("Fri 23 Oct, 7:00 PM"; the weekday is computed from
// the real date), CR-0022 (X-180), AT-363. R1 T6: no AI call; the same rules run for every AI, local ones included
// (R1.tsv "foo read: rule-based").
import { t } from '../../shared/copy/t';
import { formatInr } from '../../shared/format';
import { findSecrets, MASK, redactSecrets } from '../../shared/redactor';

/** 04 §6.5 is one line with ellipsis; the tooltip lists the rest. More than this is noise. */
export const UNDERSTOOD_MAX = 8;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const DAY_MS = 86_400_000;

const WEEKDAY_RE = String.raw`(?:mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)`;
const MONTH_RE = String.raw`(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)`;
/** One to three capitalised words: a name or a place ("Toit", "MG Road", "Riya"). Used without the `i` flag. */
const PROPER = String.raw`(\p{Lu}[\p{L}'’&.-]*(?:\s+\p{Lu}[\p{L}'’&.-]*){0,2})`;
/** Words after "for {n}" that make it a length, a date or an amount, not a party size. */
const NOT_PEOPLE = new RegExp(
  String.raw`^(?:(?:hours?|hrs?|days?|nights?|mins?|minutes?|weeks?|months?|years?|yrs?|rupees?|rs|inr|kg|km|am|pm|k|thousand|hundred|lakhs?|lacs?|crores?|${MONTH_RE})\b|%|:)`,
  'iu',
);
/** Capitalised words that end a name run: pronouns, day words and small words a sentence in title case carries. */
const NOT_NAME =
  /^(?:I|Me|My|Him|Her|Them|Us|It|You|AM|PM|OK|Today|Tomorrow|Tonight|About|The|A|An|And|Or|For|At|On|In|To|Please|Book|Buy|Pay|Send)$/u;
const WEEKDAY_ONLY = new RegExp(String.raw`^${WEEKDAY_RE}$`, 'iu');
const MONTH_ONLY = new RegExp(String.raw`^${MONTH_RE}$`, 'iu');
/** A three-letter weekday that starts a longer name ("Sun Pharma"). */
const SHORT_WEEKDAY = /^(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/u;

interface Hit {
  at: number;
  text: string;
}
interface Day {
  /** Days since the epoch (a calendar day, no zone). */
  n: number;
  at: number;
  end: number;
}
interface Clock {
  h: number;
  mi: number;
  at: number;
  end: number;
}

export interface UnderstoodContext {
  now: number;
  timeZone: string;
}

/**
 * The "foo read:" items of one user message, in the order they appear (people, places, dates, times, amounts). The text
 * is redacted first and an item that still holds a mask or a secret is dropped (04 §6.5 "never shows a secret").
 */
export function understoodItems(raw: string, ctx: UnderstoodContext): string[] {
  const text = redactSecrets(raw.normalize('NFKC')).text;
  const hits: Hit[] = [...people(text), ...places(text), ...when(text, ctx), ...amounts(text)];
  hits.sort((a, b) => a.at - b.at);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of hits) {
    const v = h.text.trim();
    const key = v.toLowerCase();
    if (!v || seen.has(key) || v.includes(MASK) || findSecrets(v).length) continue;
    seen.add(key);
    out.push(v);
    if (out.length === UNDERSTOOD_MAX) break;
  }
  return out;
}

/**
 * The leading name words of a capitalised run, or '' when it opens with a word that is not a name. A place may open with a
 * short weekday when another name word follows ("Sun Pharma"); otherwise a weekday or a month ends the run.
 */
function nameRun(run: string, place: boolean): string {
  const words = run.split(/\s+/u);
  const named = (w: string) => !NOT_NAME.test(w) && !WEEKDAY_ONLY.test(w) && !MONTH_ONLY.test(w);
  if (place && words.length > 1 && SHORT_WEEKDAY.test(words[0]!) && named(words[1]!)) {
    const rest = words.slice(1).findIndex((w) => !named(w));
    return words.slice(0, rest < 0 ? words.length : rest + 1).join(' ');
  }
  const end = words.findIndex((w) => !named(w));
  return words.slice(0, end < 0 ? words.length : end).join(' ');
}

function people(text: string): Hit[] {
  const out: Hit[] = [];
  for (const m of text.matchAll(/\bfor\s+(\d{1,2})\b(?:\s+(?:people|persons|guests|adults|of us))?/giu)) {
    const n = Number(m[1]);
    const after = text.slice(m.index + m[0].length).trimStart();
    if (n < 1 || n > 40 || NOT_PEOPLE.test(after)) continue;
    out.push({ at: m.index, text: t('bubble.read.people', { n }) });
  }
  for (const m of text.matchAll(
    new RegExp(String.raw`\b(?:[Ww]ith|[Cc]all|[Tt]ext|[Ee]mail|[Mm]essage|[Rr]emind|[Tt]ell|[Aa]sk)\s+${PROPER}`, 'gu'),
  )) {
    const name = nameRun(m[1]!, false);
    if (name) out.push({ at: m.index + m[0].length - m[1]!.length, text: name });
  }
  return out;
}

function places(text: string): Hit[] {
  const out: Hit[] = [];
  for (const m of text.matchAll(new RegExp(String.raw`\b(?:[Aa]t|[Ii]n|[Tt]o|[Nn]ear|[Ff]rom)\s+${PROPER}`, 'gu'))) {
    const name = nameRun(m[1]!, true);
    if (name) out.push({ at: m.index + m[0].length - m[1]!.length, text: name });
  }
  return out;
}

function amounts(text: string): Hit[] {
  const out: Hit[] = [];
  const re = /(?:₹\s?|\b(?:rs\.?|inr)\s?)(\d[\d,]*(?:\.\d{1,2})?)|\b(\d[\d,]*(?:\.\d{1,2})?)\s?(?:rupees|rs\b)/giu;
  for (const m of text.matchAll(re)) {
    const n = Number((m[1] ?? m[2]!).replace(/,/g, ''));
    if (!Number.isFinite(n) || n <= 0 || n > 1e12) continue;
    out.push({ at: m.index, text: formatInr(Math.round(n * 100)) });
  }
  return out;
}

/** Today's calendar day in the zone (days since the epoch) and its year. */
function today(ctx: UnderstoodContext): { n: number; y: number } {
  const [y, mo, d] = new Intl.DateTimeFormat('en-CA', { timeZone: ctx.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(ctx.now)
    .split('-')
    .map(Number) as [number, number, number];
  return { n: Math.round(Date.UTC(y, mo - 1, d) / DAY_MS), y };
}

function days(text: string, ctx: UnderstoodContext): Day[] {
  const now = today(ctx);
  const out: Day[] = [];
  for (const m of text.matchAll(/\b(today|tonight|tomorrow|day after tomorrow)\b/giu)) {
    const w = m[1]!.toLowerCase();
    out.push({ n: now.n + (w === 'tomorrow' ? 1 : w.startsWith('day after') ? 2 : 0), at: m.index, end: m.index + m[0].length });
  }
  for (const m of text.matchAll(new RegExp(String.raw`\b(?:(on|next|this|by|until|till|coming)\s+)?(${WEEKDAY_RE})\b`, 'giu'))) {
    // "I sat down" is not a Saturday: a weekday is capitalised or follows a word that names a day.
    if (!m[1] && !/^\p{Lu}/u.test(m[2]!)) continue;
    // "Sun Pharma" is a name: a bare short weekday followed by a capitalised word is not a day.
    if (!m[1] && SHORT_WEEKDAY.test(m[2]!) && /^\s+\p{Lu}/u.test(text.slice(m.index + m[0].length))) continue;
    const wd = WEEKDAYS.findIndex((w) => m[2]!.toLowerCase().startsWith(w.toLowerCase()));
    const todayWd = new Date(now.n * DAY_MS).getUTCDay();
    let ahead = (wd - todayWd + 7) % 7;
    if (m[1]?.toLowerCase() === 'next' && ahead === 0) ahead = 7;
    out.push({ n: now.n + ahead, at: m.index, end: m.index + m[0].length });
  }
  const dated = [
    new RegExp(String.raw`\b(\d{1,2})(?:st|nd|rd|th)?\s+(${MONTH_RE})\b`, 'giu'),
    new RegExp(String.raw`\b(${MONTH_RE})\s+(\d{1,2})(?:st|nd|rd|th)?\b`, 'giu'),
  ];
  dated.forEach((re, i) => {
    for (const m of text.matchAll(re)) {
      const d = Number(i === 0 ? m[1] : m[2]);
      const mo = MONTHS.findIndex((x) => (i === 0 ? m[2]! : m[1]!).toLowerCase().startsWith(x.toLowerCase()));
      if (d < 1 || d > 31 || mo < 0) continue;
      let n = Math.round(Date.UTC(now.y, mo, d) / DAY_MS);
      if (n < now.n) n = Math.round(Date.UTC(now.y + 1, mo, d) / DAY_MS);
      out.push({ n, at: m.index, end: m.index + m[0].length });
    }
  });
  // "Fri 23 Oct" names one day twice; keep the earliest-starting mention of each overlapping run.
  out.sort((a, b) => a.at - b.at);
  return out.filter((d, i) => !out.slice(0, i).some((e) => d.at < e.end + 2 && e.n === d.n));
}

function clocks(text: string): Clock[] {
  const out: Clock[] = [];
  for (const m of text.matchAll(/\b(\d{1,2})(?:[:.](\d{2}))?\s?(am|pm|a\.m\.|p\.m\.)(?![\p{L}])/giu)) {
    let h = Number(m[1]);
    const mi = Number(m[2] ?? 0);
    if (h < 1 || h > 12 || mi > 59) continue;
    const pm = m[3]!.toLowerCase().startsWith('p');
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
    out.push({ h, mi, at: m.index, end: m.index + m[0].length });
  }
  for (const m of text.matchAll(/\b([01]?\d|2[0-3]):([0-5]\d)\b(?!\s?(?:am|pm|a\.m\.|p\.m\.))/giu)) {
    out.push({ h: Number(m[1]), mi: Number(m[2]), at: m.index, end: m.index + m[0].length });
  }
  return out.sort((a, b) => a.at - b.at);
}

function dayText(n: number, ctx: UnderstoodContext): string {
  const d = new Date(n * DAY_MS);
  const base = `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  return d.getUTCFullYear() === today(ctx).y ? base : `${base} ${d.getUTCFullYear()}`;
}

function clockText(c: Pick<Clock, 'h' | 'mi'>): string {
  const h = c.h % 12 === 0 ? 12 : c.h % 12;
  return `${h}:${String(c.mi).padStart(2, '0')} ${c.h < 12 ? 'AM' : 'PM'}`;
}

/** Dates and times; a time within a few words of a date joins it ("Fri 23 Oct, 7:00 PM", Article 21). */
function when(text: string, ctx: UnderstoodContext): Hit[] {
  const ds = days(text, ctx);
  const cs = clocks(text);
  const used = new Set<Clock>();
  const out: Hit[] = [];
  for (const d of ds) {
    const c = cs.find((x) => !used.has(x) && (x.at >= d.end ? x.at - d.end : d.at - x.end) <= 12);
    if (c) used.add(c);
    out.push({ at: d.at, text: c ? `${dayText(d.n, ctx)}, ${clockText(c)}` : dayText(d.n, ctx) });
  }
  for (const c of cs) if (!used.has(c)) out.push({ at: c.at, text: clockText(c) });
  return out;
}
