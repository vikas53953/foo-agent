// Spec: 03-shell-2 §3.7.3.1 (Doing now: order, 5 rows max with ≤ 2 finished, line 2 copy; X-148 In progress / Scheduled / Done
// tabs), §3.7.4 (per-chat scope). Pure functions; DoingNow.tsx renders them. CR-0028 (X-186): a QUEUED job whose Plan card
// waits for Go shows as NEEDS YOU ("Needs you: {title}", Warning glyph), never "Waiting for another job to finish".
import { t } from '../../shared/copy/t';
import type { CardRow, ChatRow, JobRow, RoutineRow } from '../../shared/types';
import { titleOfCard } from '../cards/registry';
import type { IconName } from '../ui/icons/registry';
import { untilText } from './statusLine';

export const DOING_MAX = 5;
export const DOING_MAX_FINISHED = 2;
const DAY = 24 * 3_600_000;

const LIVE_ORDER: JobRow['state'][] = ['needs_you', 'working', 'queued', 'waiting'];
const FINISHED: JobRow['state'][] = ['done', 'done_unverified', 'failed'];
const ENDED: JobRow['state'][] = ['done', 'done_unverified', 'failed', 'cancelled'];

/** §3.7.4: foo's chat sees every job; a helper chat its own; a group the jobs started in it; the private chat its own. */
export function jobsInScope(jobs: JobRow[], chat: ChatRow): JobRow[] {
  switch (chat.kind) {
    case 'foo':
      return chat.private ? jobs.filter((j) => j.chatId === chat.id) : jobs;
    case 'helper':
      return jobs.filter((j) => j.chatId === chat.id || (j.ownerKind === 'helper' && j.ownerId === chat.helperId));
    case 'group':
      return jobs.filter((j) => j.originChatId === chat.id);
    case 'wa_mirror':
      return jobs.filter((j) => j.chatId === chat.id);
  }
}

const startedAt = (j: JobRow) => j.startedAt ?? j.createdAt;
const finishedAt = (j: JobRow) => j.finishedAt ?? 0;

function sameLocalDay(a: number, b: number, timeZone: string): boolean {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return f.format(new Date(a)) === f.format(new Date(b));
}

export interface Rows<T> {
  rows: T[];
  total: number;
}

/** CR-0028: the state a Doing now row shows; a job waiting for its Plan card's Go needs the user. */
export function shownState(j: Pick<JobRow, 'state' | 'awaitingGo'>): JobRow['state'] {
  return j.state === 'queued' && j.awaitingGo === true ? 'needs_you' : j.state;
}

/** "In progress": NEEDS YOU, WORKING, QUEUED, WAITING (newest start first in each), then DONE/FAILED finished today. */
export function doingRows(jobs: JobRow[], now: number, timeZone: string): Rows<JobRow> {
  const live = LIVE_ORDER.flatMap((st) => jobs.filter((j) => shownState(j) === st).sort((a, b) => startedAt(b) - startedAt(a)));
  const finished = jobs
    .filter((j) => FINISHED.includes(j.state) && j.finishedAt !== null && sameLocalDay(j.finishedAt, now, timeZone))
    .sort((a, b) => finishedAt(b) - finishedAt(a));
  const liveShown = live.slice(0, DOING_MAX);
  const finishedShown = finished.slice(0, Math.min(DOING_MAX_FINISHED, DOING_MAX - liveShown.length));
  return { rows: [...liveShown, ...finishedShown], total: live.length + finished.length };
}

/** "Done": DONE/FAILED/CANCELLED in the last 7 days, newest first. */
export function doneRows(jobs: JobRow[], now: number): Rows<JobRow> {
  const all = jobs
    .filter((j) => ENDED.includes(j.state) && j.finishedAt !== null && now - j.finishedAt <= 7 * DAY)
    .sort((a, b) => finishedAt(b) - finishedAt(a));
  return { rows: all.slice(0, DOING_MAX), total: all.length };
}

/** "Scheduled": this chat's routines with their next run, soonest first. */
export function scheduledRows(routines: RoutineRow[], chatId: string): Rows<RoutineRow> {
  const all = routines
    .filter((r) => r.ownerChatId === chatId && r.state !== 'deleted')
    .sort((a, b) => (a.nextRunAt ?? Infinity) - (b.nextRunAt ?? Infinity));
  return { rows: all.slice(0, DOING_MAX), total: all.length };
}

export interface LineCtx {
  now: number;
  timeZone: string;
  ai: string;
  cards: Record<string, CardRow>;
}

function waitingReason(j: JobRow, ai: string): string | null {
  switch (j.waitingReason) {
    case 'net_offline':
    case 'ai_offline':
      return t('app.panel.doing.reason.offline');
    case 'ai_down':
      return t('app.panel.doing.reason.ai_down', { ai });
    case 'ai_signed_out':
      return t('app.panel.doing.reason.signed_out', { ai });
    case 'ai_limit':
      return t('app.panel.doing.reason.ai_limit', { ai });
    case 'spend_cap':
      return t('app.panel.doing.reason.cap');
    case 'asleep':
      return t('app.panel.doing.reason.asleep');
    default:
      return null;
  }
}

/** Line 2 of a Doing-now row (§3.7.3.1). */
export function doingLine(j: JobRow, c: LineCtx): string {
  switch (shownState(j)) {
    case 'working': {
      const n = Math.min(Math.max(j.stepCount, 1), (j.currentStepIdx ?? j.stepsDone) + 1);
      return t('app.panel.doing.line.working', { n, m: j.stepCount, step: j.nowLine });
    }
    case 'queued':
      return t('app.panel.doing.line.queued');
    case 'waiting': {
      const reason = waitingReason(j, c.ai);
      return reason ? t('app.panel.doing.line.waiting', { reason }) : t('app.panel.doing.line.paused');
    }
    case 'needs_you': {
      const card = j.needsYouCardId ? c.cards[j.needsYouCardId] : undefined;
      return t('app.panel.doing.line.needs_you', { title: titleOfCard(card) ?? j.title });
    }
    case 'done':
    case 'done_unverified':
      return t('app.panel.doing.line.done', { time: untilText(finishedAt(j), c.now, c.timeZone) });
    case 'failed':
    case 'cancelled':
      return t('app.panel.doing.line.failed', { time: untilText(finishedAt(j), c.now, c.timeZone) });
  }
}

/** Glyph per state (§3.7.3.1). */
export function doingGlyph(state: JobRow['state']): { icon: IconName | null; tone: 'accent' | 'fg3' | 'fg2' | 'warn' | 'ok' | 'bad' } {
  switch (state) {
    case 'working':
      return { icon: null, tone: 'accent' };
    case 'queued':
      return { icon: 'Clock', tone: 'fg3' };
    case 'waiting':
      return { icon: 'Clock', tone: 'fg2' };
    case 'needs_you':
      return { icon: 'Warning', tone: 'warn' };
    case 'done':
    case 'done_unverified':
      return { icon: 'CheckmarkCircle', tone: 'ok' };
    case 'failed':
    case 'cancelled':
      return { icon: 'ErrorCircle', tone: 'bad' };
  }
}

/** A job "has foo's browser open" (§3.6.2.2): it uses the browser and is live. */
export const hasLiveBrowser = (j: JobRow) => j.usesBrowser && (j.state === 'working' || j.state === 'needs_you');
export const canStop = (j: JobRow) => LIVE_ORDER.includes(j.state);
