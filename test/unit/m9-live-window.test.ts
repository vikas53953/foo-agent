// M9 T5: main's side of the live window. 09 §9.27.2 (one window per job, a second request focuses it; ✕ closes the picture
// only and never stops the job, X-95; `done` closes 5 s after DONE unless focused), 06-3 §11.2 (Stop closes the window after
// 1 s; frames masked in main: `no-capture-hosts.json` sites are blanked), 08-0 §G.8 (`live:*` go to the live window only),
// 08-1 §3.1.1 (the live window may call only job:stop, job:takeOver, job:handBack, job:watch). Fake clock and fake windows.
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  BrowserWindow: class {},
  nativeTheme: {},
  screen: {},
  systemPreferences: {},
  app: {},
  net: {},
  protocol: {},
}));

import { FakeClock } from '../../src/shared/clock';
import { createNoCapture } from '../../src/shared/handback';
import type { JobRow, JobState } from '../../src/shared/types';
import { maskFrame } from '../../src/main/windows/liveMask';
import { LiveWindows, type LiveWin } from '../../src/main/windows/liveWindow';
import { windowChannelAllowed } from '../../src/main/ipc/guard';
import noCaptureHosts from '../../resources/no-capture-hosts.json';

const noCapture = createNoCapture(noCaptureHosts);
const jpeg = new Uint8Array([0xff, 0xd8, 1, 2, 0xff, 0xd9]).buffer;
const frame = (pageUrl: string, jobId = 'j1') => ({ jobId, jpeg, w: 1280, h: 720, masked: true as const, nowLine: 'Now', pageUrl });

describe('main frame pass (06-3 §11.2, 08-4 §27.5)', () => {
  it('passes an ordinary page’s frame through and strips the page URL', () => {
    const out = maskFrame(frame('https://www.makemytrip.com/hotels'), noCapture);
    expect(out).toEqual({ jobId: 'j1', jpeg, w: 1280, h: 720, masked: true, nowLine: 'Now' });
    expect('pageUrl' in out).toBe(false);
  });

  it('blanks the picture on a no-capture host (3-D Secure pages)', () => {
    for (const u of ['https://acs.icicibank.com/pay', 'https://secure.icicibank.com/acs/challenge', 'https://x.3dsecure.io/p']) {
      const out = maskFrame(frame(u), noCapture);
      expect(out.jpeg.byteLength).toBe(0);
      expect(out.masked).toBe(true);
    }
  });

  it('blanks a frame whose page URL is missing or unreadable (fail closed)', () => {
    expect(maskFrame(frame(''), noCapture).jpeg.byteLength).toBe(0);
    expect(maskFrame(frame('not a url'), noCapture).jpeg.byteLength).toBe(0);
  });
});

class FakeWin implements LiveWin {
  sent: { channel: string; payload: unknown }[] = [];
  focused = false;
  minimized = false;
  destroyed = false;
  focusCalls = 0;
  private closedCbs: (() => void)[] = [];
  constructor(readonly jobId: string) {}
  send(channel: string, payload: unknown) {
    this.sent.push({ channel, payload });
  }
  focus() {
    this.focusCalls += 1;
    this.focused = true;
  }
  isFocused() {
    return this.focused;
  }
  isMinimized() {
    return this.minimized;
  }
  restore() {
    this.minimized = false;
  }
  isDestroyed() {
    return this.destroyed;
  }
  close() {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const cb of this.closedCbs) cb();
  }
  onClosed(cb: () => void) {
    this.closedCbs.push(cb);
  }
}

function job(id: string, state: JobState, o: Partial<JobRow> = {}): JobRow {
  return { id, state, usesBrowser: true, title: 'Goa stay', ...o } as JobRow;
}

function setup(rows: Record<string, JobRow> = { j1: job('j1', 'working'), j2: job('j2', 'working', { title: 'Cake' }) }) {
  const clock = new FakeClock();
  const wins: FakeWin[] = [];
  const watch = vi.fn();
  const stop = vi.fn();
  const live = new LiveWindows({
    clock,
    job: (id) => rows[id] ?? null,
    create: (row) => {
      const w = new FakeWin(row.id);
      wins.push(w);
      return w;
    },
    watch,
    noCapture,
  });
  return { clock, wins, watch, stop, live, rows };
}

describe('live windows (09 §9.27.2)', () => {
  it('opens one window per job; a second request focuses it', () => {
    const { live, wins } = setup();
    expect(live.open('j1').ok).toBe(true);
    expect(live.open('j1').ok).toBe(true);
    expect(wins).toHaveLength(1);
    expect(wins[0]!.focusCalls).toBe(1);
    live.open('j2');
    expect(wins).toHaveLength(2);
  });

  it('a minimised window is restored and focused on a second request', () => {
    const { live, wins } = setup();
    live.open('j1');
    wins[0]!.minimized = true;
    live.open('j1');
    expect(wins[0]!.minimized).toBe(false);
  });

  it('refuses a job that is gone or does not use the browser', () => {
    const { live } = setup({ j3: job('j3', 'working', { usesBrowser: false }) });
    expect(live.open('nope')).toMatchObject({ ok: false, error: { kind: 'JOB_GONE' } });
    expect(live.open('j3')).toMatchObject({ ok: false, error: { kind: 'BROWSER_MISSING' } });
  });

  it('✕ closes only the picture: the engine stops sending frames, the job is never stopped (X-95)', () => {
    const { live, wins, watch, rows } = setup();
    live.open('j1');
    wins[0]!.close();
    expect(watch).toHaveBeenCalledWith('j1', false);
    expect(rows.j1!.state).toBe('working');
    // a new request opens a fresh window
    live.open('j1');
    expect(wins).toHaveLength(2);
  });

  it('sends live:* only to that job’s window, masked; other windows and the main window get nothing', () => {
    const { live, wins } = setup();
    live.open('j1');
    live.open('j2');
    expect(live.route('live:frame', frame('https://www.makemytrip.com/'))).toBe(true);
    expect(wins[0]!.sent).toEqual([
      { channel: 'live:frame', payload: { jobId: 'j1', jpeg, w: 1280, h: 720, masked: true, nowLine: 'Now' } },
    ]);
    expect(wins[1]!.sent).toEqual([]);
    expect(live.route('live:state', { jobId: 'j2', state: 'taken_over' })).toBe(true);
    expect(wins[1]!.sent).toEqual([{ channel: 'live:state', payload: { jobId: 'j2', state: 'taken_over' } }]);
    // a frame for a job with no window is swallowed, never broadcast
    expect(live.route('live:frame', frame('https://a.example/', 'j9'))).toBe(true);
    expect(live.route('job:upsert', job('j1', 'working'))).toBe(false);
  });

  it('done closes the window 5 s after DONE', () => {
    const { live, wins, clock } = setup();
    live.open('j1');
    live.route('job:upsert', job('j1', 'done'));
    clock.advance(4_999);
    expect(wins[0]!.destroyed).toBe(false);
    clock.advance(1);
    expect(wins[0]!.destroyed).toBe(true);
  });

  it('done does not close a focused window', () => {
    const { live, wins, clock } = setup();
    live.open('j1');
    wins[0]!.focused = true;
    live.route('job:upsert', job('j1', 'done_unverified'));
    clock.advance(10_000);
    expect(wins[0]!.destroyed).toBe(false);
  });

  it('Stop (the job is cancelled) closes the window after 1 s, focused or not', () => {
    const { live, wins, clock } = setup();
    live.open('j1');
    wins[0]!.focused = true;
    live.route('job:upsert', job('j1', 'cancelled'));
    clock.advance(999);
    expect(wins[0]!.destroyed).toBe(false);
    clock.advance(1);
    expect(wins[0]!.destroyed).toBe(true);
  });

  it('a repeated DONE row does not restart the 5 s timer', () => {
    const { live, wins, clock } = setup();
    live.open('j1');
    live.route('job:upsert', job('j1', 'done'));
    clock.advance(3_000);
    live.route('job:upsert', job('j1', 'done'));
    clock.advance(2_000);
    expect(wins[0]!.destroyed).toBe(true);
  });
});

describe('window channel allow-list (08-1 §3.1.1)', () => {
  const LIVE = 'app://foo/windows/live.html?job=j1';
  const BANNER = 'app://foo/windows/signin-banner.html';
  const MAIN = 'app://foo/index.html';

  it('the live window may call only job:stop, job:takeOver, job:handBack and job:watch', () => {
    for (const c of ['job:stop', 'job:takeOver', 'job:handBack', 'job:watch']) expect(windowChannelAllowed(LIVE, c)).toBe(true);
    for (const c of ['job:openWindow', 'message:send', 'settings:set', 'app:getBootstrap', 'test:seed', 'signin:done'])
      expect(windowChannelAllowed(LIVE, c)).toBe(false);
  });

  it('the sign-in banner may call only signin:done, signin:skip and job:handBack', () => {
    for (const c of ['signin:done', 'signin:skip', 'job:handBack']) expect(windowChannelAllowed(BANNER, c)).toBe(true);
    for (const c of ['job:stop', 'job:watch', 'message:send']) expect(windowChannelAllowed(BANNER, c)).toBe(false);
  });

  it('the main window keeps every channel', () => {
    for (const c of ['message:send', 'job:openWindow', 'job:watch', 'test:seed']) expect(windowChannelAllowed(MAIN, c)).toBe(true);
  });
});
