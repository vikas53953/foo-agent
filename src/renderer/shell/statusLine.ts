// Spec: 03-shell-2 §3.6.2.1 (status line, 14 rows, first match wins; rows 2–10 count this chat's jobs only),
// 03-shell-1 §3.0.2 (from the job runner, never AI text), 12-2 §12.30.4 (private chat idle line), 04 §10.11 (WhatsApp subtitle).
import { formatDate, formatTime } from '../../shared/format';
import { t } from '../../shared/copy/t';
import type { AiStatus, CardRow, ChatRow, HelperRow, JobRow, SetupState } from '../_m1b-stubs';

export type StatusTone = 'fg2' | 'warn' | 'accent' | 'ok';

export interface StatusInput {
  chat: ChatRow;
  /** Every job in the store; the function keeps this chat's live ones. */
  jobs: JobRow[];
  cards: Record<string, CardRow>;
  setup: SetupState;
  connection: 'online' | 'offline' | 'ai_down';
  ai: Pick<AiStatus, 'displayName' | 'state' | 'resetAt'>;
  takenOverJobIds: string[];
  typing: boolean;
  /** Quiet hours are on and the time is inside them (see quietUntil). */
  quiet: { until: number } | null;
  now: number;
  timeZone: string;
  agentName: string;
  helper: HelperRow | undefined;
  /** Group: member names after "You" ({agentName} first, then helpers). */
  memberNames: string[];
  /** wa_mirror: member count for the subtitle. */
  waMembers?: number;
}

export interface StatusResult {
  row: number;
  text: string;
  tone: StatusTone;
  dot?: boolean;
}

const sameDay = (a: number, b: number, timeZone: string) =>
  formatDate(a, 'date', { timeZone, now: b }) === formatDate(b, 'date', { timeZone, now: b });

/** Clock time when it is today, else "{day date}, {time}" (Article 21). */
export function untilText(at: number, now: number, timeZone: string): string {
  return sameDay(at, now, timeZone) ? formatTime(at, { timeZone }) : formatDate(at, 'full', { timeZone, now });
}

const LIVE: JobRow['state'][] = ['queued', 'working', 'needs_you', 'waiting'];

export function statusLine(s: StatusInput): StatusResult {
  const jobs = s.jobs.filter((j) => j.chatId === s.chat.id && LIVE.includes(j.state));
  const ai = s.ai.displayName;

  if (!s.setup.complete) {
    const n = Math.min(4, Math.max(1, s.setup.step));
    return { row: 1, text: t('chat_header.status.setting_up', { n }), tone: 'fg2' };
  }
  const needs = jobs.filter((j) => j.state === 'needs_you');
  if (needs.length === 1) {
    const card = needs[0]!.needsYouCardId ? s.cards[needs[0]!.needsYouCardId] : undefined;
    return { row: 2, text: t('chat_header.status.needs_you', { title: card?.title ?? needs[0]!.title }), tone: 'warn' };
  }
  if (needs.length > 1) return { row: 2, text: t('chat_header.status.needs_you_many', { count: needs.length }), tone: 'warn' };
  if (jobs.some((j) => s.takenOverJobIds.includes(j.id)))
    return { row: 3, text: t('chat_header.status.in_control'), tone: 'warn' };

  const reasons = new Set(jobs.filter((j) => j.state === 'waiting').map((j) => j.waitingReason));
  if (reasons.has('net_offline') || reasons.has('ai_offline'))
    return { row: 4, text: t('chat_header.status.paused_offline'), tone: 'fg2' };
  if (reasons.has('ai_down')) return { row: 5, text: t('chat_header.status.paused_ai_down', { ai }), tone: 'fg2' };
  if (reasons.has('ai_signed_out')) return { row: 5, text: t('chat_header.status.paused_signed_out', { ai }), tone: 'fg2' };
  if (reasons.has('ai_limit')) {
    const time = s.ai.resetAt ? untilText(s.ai.resetAt, s.now, s.timeZone) : '';
    return { row: 6, text: t('chat_header.status.paused_plan_limit', { ai, time }), tone: 'fg2' };
  }
  if (reasons.has('spend_cap')) return { row: 7, text: t('chat_header.status.paused_ai_cap'), tone: 'fg2' };

  if (s.typing) return { row: 8, text: t('chat_header.status.typing'), tone: 'accent' };

  const working = jobs.filter((j) => j.state === 'working');
  if (working.length === 1) {
    const j = working[0]!;
    if (j.stepCount > 0) {
      const n = Math.min(j.stepCount, (j.currentStepIdx ?? j.stepsDone) + 1);
      return { row: 9, text: t('chat_header.status.working_steps', { title: j.title, n, m: j.stepCount }), tone: 'accent' };
    }
    return { row: 9, text: t('chat_header.status.working', { title: j.title }), tone: 'accent' };
  }
  if (working.length > 1) return { row: 10, text: t('chat_header.status.working_many', { count: working.length }), tone: 'accent' };

  if (s.quiet) {
    const today = sameDay(s.quiet.until, s.now, s.timeZone);
    const time = formatTime(s.quiet.until, { timeZone: s.timeZone });
    return today
      ? { row: 11, text: t('chat_header.status.quiet', { time }), tone: 'fg2' }
      : {
          row: 11,
          text: t('chat_header.status.quiet_other_day', { date: formatDate(s.quiet.until, 'date', { timeZone: s.timeZone, now: s.now }), time }),
          tone: 'fg2',
        };
  }

  switch (s.chat.kind) {
    case 'foo':
      return s.chat.private
        ? { row: 12, text: t('chat_header.private.status_idle'), tone: 'fg2' }
        : { row: 12, text: t('chat_header.status.awake'), tone: 'ok', dot: true };
    case 'helper':
      return { row: 13, text: s.helper?.jobText ?? '', tone: 'fg2' };
    case 'group':
      return { row: 14, text: t('chat_header.status.members', { names: s.memberNames.join(', ') }), tone: 'fg2' };
    case 'wa_mirror':
      return { row: 14, text: t('chat_header.subtitle.wa_mirror', { count: s.waMembers ?? 0 }), tone: 'fg2' };
  }
}

/** Local HHMM minutes of `at` in `timeZone`, plus the weekday (0 = Sun). */
function localClock(at: number, timeZone: string): { min: number; wd: number } {
  const f = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: 'numeric', hourCycle: 'h23', weekday: 'short' });
  const parts = f.formatToParts(new Date(at));
  const get = (k: string) => parts.find((p) => p.type === k)!.value;
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { min: Number(get('hour')) * 60 + Number(get('minute')), wd };
}
const hhmm = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(2, 4));
const MIN = 60_000;

/**
 * When quiet hours (08-0 §A `notifications.quiet`) are on and `now` is inside them, the epoch ms they end; else null.
 * A window that crosses midnight (22:00–07:00) belongs to the day it starts on; `days` lists those start days.
 */
export function quietUntil(quiet: { on: boolean; from: string; to: string; days: number[] }, now: number, timeZone: string): number | null {
  if (!quiet.on) return null;
  const { min, wd } = localClock(now, timeZone);
  const from = hhmm(quiet.from);
  const to = hhmm(quiet.to);
  if (from === to) return null;
  if (from < to) {
    if (min >= from && min < to && quiet.days.includes(wd)) return now + (to - min) * MIN;
    return null;
  }
  if (min >= from && quiet.days.includes(wd)) return now + (24 * 60 - min + to) * MIN;
  if (min < to && quiet.days.includes((wd + 6) % 7)) return now + (to - min) * MIN;
  return null;
}
