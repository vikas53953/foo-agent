// Spec: 06-3 §11.2 (live window states, pills, lines and control bar; copy keys `live.window.*`, G-M9-14), 09 §9.27.2
// (`data-state` words; Take over keeps the window open in `in_control`, X-121), 08-1 §3.3 (`live:state` values), G-M9-08
// (running → live, paused_signin → needs_you, taken_over → in_control, unavailable → cant_show; starting / paused / done
// from the job row), AT-272 (in control: only Hand back to {agentName}, plus Stop).
import { t } from '../../shared/copy/t';
import type { JobState, LiveState, LiveWindowState, WaitingReason } from '../../shared/types';

export interface LiveInputs {
  jobState: JobState | null;
  /** The last `live:state` from main, or null before any. */
  engine: LiveState | null;
  hasFrame: boolean;
  /** `job:watch` answered LIVE_UNAVAILABLE (09 §9.27.2: `cant_show`). */
  unavailable: boolean;
  /** The state shown now; a stopped or failed job keeps it while main closes the window (06-3 has no words for them). */
  prev: LiveWindowState;
}

export function liveWindowState(i: LiveInputs): LiveWindowState {
  const job = i.jobState;
  if (job === 'done' || job === 'done_unverified') return 'done';
  if (job === 'cancelled' || job === 'failed') return i.prev;
  if (i.engine === 'taken_over') return 'in_control';
  if (i.unavailable || i.engine === 'unavailable') return 'cant_show';
  if (i.engine === 'paused_signin' || job === 'needs_you') return 'needs_you';
  if (job === 'waiting') return 'paused';
  if (job === null || job === 'queued' || !i.hasFrame) return 'starting';
  return 'live';
}

export type PillTone = 'live' | 'warn' | 'muted' | 'ok';

export interface LiveView {
  pill: { tone: PillTone; text: string } | null;
  line: string | null;
  takeOver: boolean;
  controlBar: string | null;
  handBack: string | null;
}

/** 03 / 05 §5.2 paused captions: the AI-side reasons share "your AI isn't answering". */
function pausedLine(reason: WaitingReason | null): string | null {
  switch (reason) {
    case 'ai_offline':
    case 'ai_down':
    case 'ai_signed_out':
    case 'ai_limit':
      return t('live.window.paused.ai_down');
    case 'spend_cap':
      return t('live.window.paused.spend_cap');
    case 'net_offline':
      return t('live.window.paused.net_offline');
    case 'asleep':
    case 'app_quit':
    case 'windows_shutdown':
      return t('live.window.paused.asleep');
    default:
      return null;
  }
}

function pill(state: LiveWindowState): LiveView['pill'] {
  switch (state) {
    case 'live':
      return { tone: 'live', text: t('live.window.pill.live') };
    case 'needs_you':
      return { tone: 'warn', text: t('live.window.pill.needs_you') };
    case 'in_control':
      return { tone: 'warn', text: t('live.window.pill.in_control') };
    case 'paused':
      return { tone: 'muted', text: t('live.window.pill.paused') };
    case 'done':
      return { tone: 'ok', text: t('live.window.pill.done') };
    default:
      return null;
  }
}

function line(state: LiveWindowState, nowLine: string, reason: WaitingReason | null): string | null {
  switch (state) {
    case 'starting':
      return t('live.window.starting');
    case 'cant_show':
      return t('live.window.cant_show');
    case 'paused':
      return pausedLine(reason);
    case 'done':
      return nowLine ? t('live.window.done', { result: nowLine }) : null;
    case 'in_control':
      return null;
    default:
      return nowLine ? t('live.window.now', { step: nowLine }) : null;
  }
}

/**
 * The phrase under the picture. Live: the step the last frame carried. Needs you and Done: the job row's line (the card's
 * question, the result), since the last frame still carries the step that was running before.
 */
export function liveNowLine(state: LiveWindowState, frameLine: string, jobLine: string): string {
  if (state === 'done' || state === 'needs_you') return jobLine || frameLine;
  return frameLine || jobLine;
}

export function liveView(o: { state: LiveWindowState; nowLine: string; waitingReason: WaitingReason | null; agentName: string }): LiveView {
  const inControl = o.state === 'in_control';
  return {
    pill: pill(o.state),
    line: line(o.state, o.nowLine, o.waitingReason),
    // Done: nothing is left to take over or stop.
    takeOver: !inControl && o.state !== 'done',
    controlBar: inControl ? t('live.window.control_bar', { agentName: o.agentName }) : null,
    handBack: inControl ? t('live.window.hand_back', { agentName: o.agentName }) : null,
  };
}
