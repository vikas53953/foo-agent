// M9 T5: the live window's state word (06-3 §11.2 states, 09 §9.27.2 `data-state`, G-M9-08 map from 08-1 §3.3 `live:state`)
// and the words each state shows (06-3 §11.2 copy, keys `live.window.*`, G-M9-14). Expected values are the spec's own.
import { describe, expect, it } from 'vitest';
import { t } from '../../src/shared/copy/t';
import type { JobState } from '../../src/shared/types';
import { liveNowLine, liveView, liveWindowState, type LiveInputs } from '../../src/renderer/live/liveState';

const base: LiveInputs = { jobState: 'working', engine: null, hasFrame: false, unavailable: false, prev: 'starting' };
const at = (o: Partial<LiveInputs>) => liveWindowState({ ...base, ...o });

describe('live window state (G-M9-08)', () => {
  it('maps the engine words running / paused_signin / taken_over / unavailable onto live / needs_you / in_control / cant_show', () => {
    expect(at({ engine: 'running', hasFrame: true })).toBe('live');
    expect(at({ engine: 'paused_signin', hasFrame: true })).toBe('needs_you');
    expect(at({ engine: 'taken_over', hasFrame: true })).toBe('in_control');
    expect(at({ engine: 'unavailable', hasFrame: true })).toBe('cant_show');
  });

  it('is starting until the first frame, then live', () => {
    expect(at({})).toBe('starting');
    expect(at({ engine: 'running' })).toBe('starting');
    expect(at({ hasFrame: true })).toBe('live');
  });

  it('takes starting / paused / done / needs_you from the job row', () => {
    expect(at({ jobState: 'queued' })).toBe('starting');
    expect(at({ jobState: 'waiting', hasFrame: true })).toBe('paused');
    expect(at({ jobState: 'needs_you', hasFrame: true })).toBe('needs_you');
    expect(at({ jobState: 'done', engine: 'running', hasFrame: true })).toBe('done');
    expect(at({ jobState: 'done_unverified', hasFrame: true })).toBe('done');
  });

  it('LIVE_UNAVAILABLE from job:watch is cant_show', () => {
    expect(at({ unavailable: true })).toBe('cant_show');
  });

  it('in control wins over a needs-you job; done wins over in control', () => {
    expect(at({ jobState: 'needs_you', engine: 'taken_over' })).toBe('in_control');
    expect(at({ jobState: 'done', engine: 'taken_over' })).toBe('done');
  });

  it('a stopped or failed job keeps the last state while the window closes (no words of its own)', () => {
    for (const s of ['cancelled', 'failed'] as JobState[]) expect(at({ jobState: s, prev: 'in_control' })).toBe('in_control');
  });
});

describe('live window words (06-3 §11.2)', () => {
  const view = (state: Parameters<typeof liveView>[0]['state'], o: Partial<Parameters<typeof liveView>[0]> = {}) =>
    liveView({ state, nowLine: '', waitingReason: null, agentName: 'foo', ...o });

  it('pill per state: LIVE / Needs you / YOU’RE IN CONTROL / PAUSED / ✓ Done', () => {
    expect(view('live').pill).toEqual({ tone: 'live', text: 'LIVE' });
    expect(view('needs_you').pill).toEqual({ tone: 'warn', text: 'Needs you' });
    expect(view('in_control').pill).toEqual({ tone: 'warn', text: 'YOU’RE IN CONTROL' });
    expect(view('paused').pill).toEqual({ tone: 'muted', text: 'PAUSED' });
    expect(view('done').pill).toEqual({ tone: 'ok', text: '✓ Done' });
  });

  it('Now line, paused reason, final screen, starting and can’t-show lines', () => {
    expect(view('live', { nowLine: 'Filling guest details on makemytrip.com' }).line).toBe('Now: Filling guest details on makemytrip.com');
    expect(view('needs_you', { nowLine: 'IRCTC wants you to sign in.' }).line).toBe('Now: IRCTC wants you to sign in.');
    expect(view('paused', { waitingReason: 'ai_down' }).line).toBe('Paused: your AI isn’t answering.');
    expect(view('paused', { waitingReason: 'net_offline' }).line).toBe('Paused: you’re offline.');
    expect(view('done', { nowLine: 'Booked, #HP82731' }).line).toBe('Final screen · Booked, #HP82731');
    expect(view('starting').line).toBe('Getting the browser ready…');
    expect(view('cant_show').line).toBe('I can’t show the live picture right now. The job is still running.');
  });

  it('only in control shows the control bar, with Hand back to {agentName}; Take over is hidden there (X-121)', () => {
    const c = view('in_control', { agentName: 'Mitra' });
    expect(c.controlBar).toBe('You’re in control in Edge. Mitra is paused.');
    expect(c.handBack).toBe('Hand back to Mitra');
    expect(c.takeOver).toBe(false);
    for (const s of ['starting', 'live', 'needs_you', 'paused', 'done', 'cant_show'] as const) {
      expect(view(s).controlBar).toBeNull();
      expect(view(s).takeOver).toBe(s !== 'done');
    }
  });

  it('title and Narrator name (G-M9-09: 06-3 words)', () => {
    expect(t('live.window.title', { job: 'Goa stay' })).toBe('Goa stay · foo');
    expect(t('live.window.name', { job: 'Goa stay' })).toBe('Goa stay, picture of foo’s browser');
  });
});

describe('live window Now line and buttons', () => {
  it('needs you and done take the job row’s line, not the step the last frame carried', () => {
    expect(liveNowLine('needs_you', 'Filling guest details', 'IRCTC wants you to sign in.')).toBe('IRCTC wants you to sign in.');
    expect(liveNowLine('done', 'Paying on makemytrip.com', 'Booked, #HP82731')).toBe('Booked, #HP82731');
    expect(liveNowLine('live', 'Filling guest details', 'Searching hotels')).toBe('Filling guest details');
    expect(liveNowLine('live', '', 'Searching hotels')).toBe('Searching hotels');
    expect(liveNowLine('done', 'Paying', '')).toBe('Paying');
  });

  it('done shows neither Take over nor Stop', () => {
    expect(liveView({ state: 'done', nowLine: 'Booked', waitingReason: null, agentName: 'foo' }).takeOver).toBe(false);
    expect(liveView({ state: 'live', nowLine: '', waitingReason: null, agentName: 'foo' }).takeOver).toBe(true);
  });
});
