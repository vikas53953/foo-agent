// Spec: 06-3 §11.2 (what the live window shows; the picture is frozen in paused and done, and keeps the last frame in control,
// 09 §9.27.2 / 08-2 §8.3.3), 08-1 §3.3 (`live:frame`, `live:state`), 08-5 §5 rule 2 (a row older than the one held is
// dropped), G-M9-08 (state map, liveState.ts). The live window is its own small React root (08-0 §G.8); the main window's
// `live` slice (08-0 §G.10, D-11) is a different thing and is not used here.
import type { EventPayload } from '../../shared/ipc';
import type { JobRow, LiveState, LiveWindowState } from '../../shared/types';
import { liveWindowState } from './liveState';

export interface LiveWindowModel {
  jobId: string;
  job: JobRow | null;
  agentName: string;
  engine: LiveState | null;
  unavailable: boolean;
  /** The latest masked JPEG; null before the first frame or when main blanked the page. */
  frame: ArrayBuffer | null;
  blank: boolean;
  /** The step phrase the last frame carried. */
  nowLine: string;
  shown: LiveWindowState;
}

export type LiveAction =
  | { type: 'job'; job: JobRow }
  | { type: 'frame'; frame: EventPayload['live:frame'] }
  | { type: 'state'; jobId: string; state: LiveState }
  | { type: 'unavailable' }
  | { type: 'agentName'; name: string };

export function initialLiveWindow(jobId: string): LiveWindowModel {
  return {
    jobId,
    job: null,
    agentName: 'foo',
    engine: null,
    unavailable: false,
    frame: null,
    blank: false,
    nowLine: '',
    shown: 'starting',
  };
}

const FROZEN: readonly LiveWindowState[] = ['in_control', 'paused', 'done'];

function settle(m: LiveWindowModel): LiveWindowModel {
  const shown = liveWindowState({
    jobState: m.job?.state ?? null,
    engine: m.engine,
    hasFrame: m.frame !== null || m.blank,
    unavailable: m.unavailable,
    prev: m.shown,
  });
  return shown === m.shown ? m : { ...m, shown };
}

export function liveReducer(m: LiveWindowModel, a: LiveAction): LiveWindowModel {
  switch (a.type) {
    case 'job':
      if (a.job.id !== m.jobId || (m.job && a.job.rev < m.job.rev)) return m;
      return settle({ ...m, job: a.job });
    case 'frame': {
      if (a.frame.jobId !== m.jobId || FROZEN.includes(m.shown)) return m;
      const blank = a.frame.jpeg.byteLength === 0;
      return settle({
        ...m,
        frame: blank ? null : a.frame.jpeg,
        blank,
        nowLine: a.frame.nowLine || m.nowLine,
        unavailable: false,
        engine: m.engine === 'unavailable' ? null : m.engine,
      });
    }
    case 'state':
      if (a.jobId !== m.jobId) return m;
      return settle({ ...m, engine: a.state });
    case 'unavailable':
      return settle({ ...m, unavailable: true });
    case 'agentName':
      return a.name === m.agentName ? m : { ...m, agentName: a.name };
  }
}
