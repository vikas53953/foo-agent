// M9 T5: the live window's own state (06-3 §11.2, 09 §9.27.2): it keeps only its job's row, the agent's name, the last
// `live:state` and the latest masked frame; frames for other jobs are ignored; the picture freezes in in_control (frames pause
// during take-over, 08-2 §8.3.3), paused and done; an empty frame (main's no-capture pass) shows no picture; LIVE_UNAVAILABLE
// from job:watch is cant_show.
import { describe, expect, it } from 'vitest';
import type { JobRow } from '../../src/shared/types';
import { initialLiveWindow, liveReducer, type LiveAction } from '../../src/renderer/live/liveStore';

const row = (o: Partial<JobRow> = {}) => ({ id: 'j1', state: 'working', title: 'Goa stay', nowLine: '', rev: 1, ...o }) as JobRow;
const bytes = (n: number) => new Uint8Array([0xff, 0xd8, n, 0xff, 0xd9]).buffer;
const frame = (jobId = 'j1', jpeg = bytes(1), nowLine = 'Filling guest details') =>
  ({ type: 'frame', frame: { jobId, jpeg, w: 1280, h: 720, masked: true, nowLine } }) as LiveAction;

function run(...actions: LiveAction[]) {
  return actions.reduce(liveReducer, initialLiveWindow('j1'));
}

describe('live window store', () => {
  it('starts in starting; the first frame of a working job makes it live', () => {
    expect(initialLiveWindow('j1').shown).toBe('starting');
    const s = run({ type: 'job', job: row() }, frame());
    expect(s.shown).toBe('live');
    expect(s.frame?.byteLength).toBe(5);
    expect(s.nowLine).toBe('Filling guest details');
  });

  it('ignores rows and frames of other jobs, and older revs of its own', () => {
    const s = run({ type: 'job', job: row({ rev: 3 }) }, { type: 'job', job: row({ id: 'j2', state: 'done' }) }, frame('j2'));
    expect(s.job?.state).toBe('working');
    expect(s.frame).toBeNull();
    expect(run({ type: 'job', job: row({ rev: 3 }) }, { type: 'job', job: row({ rev: 2, state: 'done' }) }).job?.rev).toBe(3);
  });

  it('freezes the picture in control, paused and done', () => {
    const first = bytes(1);
    const inControl = run(
      { type: 'job', job: row() },
      frame('j1', first),
      { type: 'state', jobId: 'j1', state: 'taken_over' },
      frame('j1', bytes(2)),
    );
    expect(inControl.shown).toBe('in_control');
    expect(inControl.frame).toBe(first);
    const done = run(
      { type: 'job', job: row() },
      frame('j1', first),
      { type: 'job', job: row({ state: 'done', rev: 2 }) },
      frame('j1', bytes(2)),
    );
    expect(done.shown).toBe('done');
    expect(done.frame).toBe(first);
  });

  it('hand back (live:state running) returns to live', () => {
    const s = run(
      { type: 'job', job: row() },
      frame(),
      { type: 'state', jobId: 'j1', state: 'taken_over' },
      { type: 'state', jobId: 'j1', state: 'running' },
    );
    expect(s.shown).toBe('live');
  });

  it('an empty frame from main shows no picture', () => {
    const s = run({ type: 'job', job: row() }, frame('j1', new ArrayBuffer(0)));
    expect(s.frame).toBeNull();
    expect(s.blank).toBe(true);
  });

  it('LIVE_UNAVAILABLE is cant_show; the agent name follows settings', () => {
    const s = run({ type: 'job', job: row() }, { type: 'unavailable' }, { type: 'agentName', name: 'Mitra' });
    expect(s.shown).toBe('cant_show');
    expect(s.agentName).toBe('Mitra');
  });
});
