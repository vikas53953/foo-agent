// Spec: 09 §9.27.1–§9.27.2 (the live window: `BrowserWindow({ width: 1024, height: 720, minWidth: 640, minHeight: 480,
// frame: false, titleBarStyle: 'hidden', titleBarOverlay, show: false })` centred on foo's main window display, same AUMID,
// title "{job} · foo"; one per job, a second request focuses it; ✕ closes the picture only, X-95; `done` closes 5 s after DONE
// unless focused; `job:watch` on while shown), 06-3 §11.2 (remembers its last size for the session; Stop closes it after 1 s),
// 08-0 §G.8 (`live:*` events go to the live window only), 08-1 §3.3 (`live:frame`, `live:state`), §3.1.1 (its channels are
// checked by ChannelGuard, `windowChannelAllowed`). The window manager is plain logic over `LiveWin`, so it is unit-tested
// with a fake clock; `electronLiveWindow` is the real BrowserWindow behind it.
import { dirname, join } from 'node:path';
import { BrowserWindow, nativeTheme, screen } from 'electron';
import { t } from '../../shared/copy/t';
import type { Clock, TimerId } from '../../shared/clock';
import { fail, ok, type Result } from '../../shared/errors';
import type { HostMatcher } from '../../shared/handback';
import type { EventChannel } from '../../shared/ipc';
import type { JobRow, JobState } from '../../shared/types';
import { tokens } from '../../shared/tokens';
import { maskFrame, type EngineFrame } from './liveMask';
import { overlayColours, preloadPath } from './mainWindow';
import { DEV_URL, isDev, isTrustedUrl } from './protocol';

/** The part of a BrowserWindow the manager uses. */
export interface LiveWin {
  send(channel: string, payload: unknown): void;
  focus(): void;
  isFocused(): boolean;
  isMinimized(): boolean;
  restore(): void;
  isDestroyed(): boolean;
  close(): void;
  onClosed(cb: () => void): void;
}

export interface LiveWindowsDeps {
  clock: Clock;
  job(jobId: string): JobRow | null;
  create(job: JobRow): LiveWin;
  /** Tells the engine to start or stop the screencast (`job.watch`). */
  watch(jobId: string, on: boolean): void;
  noCapture: HostMatcher;
}

export const DONE_CLOSE_MS = 5_000;
export const STOP_CLOSE_MS = 1_000;

const DONE: readonly JobState[] = ['done', 'done_unverified'];
/** A stopped job closes after 1 s (06-3 §11.2); a failed one too (no live-window words exist for it; implementation-notes). */
const ENDED: readonly JobState[] = ['cancelled', 'failed'];

interface Entry {
  win: LiveWin;
  timer: TimerId | null;
  closing: 'done' | 'ended' | null;
}

export class LiveWindows {
  private open_ = new Map<string, Entry>();

  constructor(private d: LiveWindowsDeps) {}

  /** `job:openWindow`. */
  open(jobId: string): Result<void> {
    const existing = this.open_.get(jobId);
    if (existing && !existing.win.isDestroyed()) {
      if (existing.win.isMinimized()) existing.win.restore();
      existing.win.focus();
      return ok(undefined);
    }
    const row = this.d.job(jobId);
    if (!row) return fail('JOB_GONE');
    if (!row.usesBrowser) return fail('BROWSER_MISSING');
    const win = this.d.create(row);
    const entry: Entry = { win, timer: null, closing: null };
    this.open_.set(jobId, entry);
    win.onClosed(() => {
      if (entry.timer !== null) this.d.clock.clearTimeout(entry.timer);
      if (this.open_.get(jobId) === entry) this.open_.delete(jobId);
      // X-95: closing the picture never stops the job; the engine only stops sending frames.
      this.d.watch(jobId, false);
    });
    return ok(undefined);
  }

  isOpen(jobId: string): boolean {
    return this.open_.has(jobId);
  }

  /**
   * Every main → renderer event passes here first. `live:*` go to their job's window only (masked; never broadcast) and the
   * answer is true; job rows start the close timers and the answer is false (they still go to every window).
   */
  route(event: EventChannel, payload: unknown): boolean {
    if (event === 'live:frame') {
      const f = payload as EngineFrame;
      this.sendTo(f.jobId, event, maskFrame(f, this.d.noCapture));
      return true;
    }
    if (event === 'live:state') {
      const s = payload as { jobId: string };
      this.sendTo(s.jobId, event, payload);
      return true;
    }
    if (event === 'job:upsert') this.jobChanged(payload as JobRow);
    return false;
  }

  private sendTo(jobId: string, channel: string, payload: unknown): void {
    const e = this.open_.get(jobId);
    if (e && !e.win.isDestroyed()) e.win.send(channel, payload);
  }

  private jobChanged(row: JobRow): void {
    const e = this.open_.get(row.id);
    if (!e) return;
    const closing = DONE.includes(row.state) ? 'done' : ENDED.includes(row.state) ? 'ended' : null;
    if (closing === e.closing) return;
    if (e.timer !== null) this.d.clock.clearTimeout(e.timer);
    e.timer = null;
    e.closing = closing;
    if (closing === 'done')
      e.timer = this.d.clock.setTimeout(() => {
        if (!e.win.isFocused()) e.win.close();
      }, DONE_CLOSE_MS);
    else if (closing === 'ended') e.timer = this.d.clock.setTimeout(() => e.win.close(), STOP_CLOSE_MS);
  }
}

// ---------------------------------------------------------------- the real window

const SIZE = { width: 1024, height: 720 };
const MIN = { width: 640, height: 480 };
/** 06-3 §11.2: remembers its last size for the session. */
let lastSize = { ...SIZE };

export function liveUrl(jobId: string): string {
  const base = isDev() ? `${DEV_URL}/windows/live.html` : 'app://foo/windows/live.html';
  return `${base}?job=${encodeURIComponent(jobId)}`;
}

export function electronLiveWindow(job: JobRow, o: { main: BrowserWindow | null; initial: (send: LiveWin['send']) => void }): LiveWin {
  const area =
    o.main && !o.main.isDestroyed() ? screen.getDisplayMatching(o.main.getBounds()).workArea : screen.getPrimaryDisplay().workArea;
  const width = Math.min(lastSize.width, area.width);
  const height = Math.min(lastSize.height, area.height);
  const th = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  const win = new BrowserWindow({
    x: area.x + Math.round((area.width - width) / 2),
    y: area.y + Math.round((area.height - height) / 2),
    width,
    height,
    minWidth: MIN.width,
    minHeight: MIN.height,
    show: false,
    frame: false,
    title: t('live.window.title', { job: job.title }),
    backgroundColor: tokens.colors['--bg-sidebar'][th],
    titleBarStyle: 'hidden',
    titleBarOverlay: { ...overlayColours(), height: tokens.size['titlebar-h'] },
    webPreferences: { preload: join(dirname(preloadPath()), 'preloadLive.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  });
  win.on('page-title-updated', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => {
    if (!isTrustedUrl(url)) e.preventDefault();
  });
  win.on('resize', () => {
    if (!win.isMaximized() && !win.isMinimized()) {
      const [w, h] = win.getSize();
      lastSize = { width: w!, height: h! };
    }
  });
  const onTheme = () => {
    if (!win.isDestroyed()) win.setTitleBarOverlay({ ...overlayColours(), height: tokens.size['titlebar-h'] });
  };
  nativeTheme.on('updated', onTheme);
  win.on('closed', () => nativeTheme.off('updated', onTheme));
  const send: LiveWin['send'] = (channel, payload) => {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  };
  // The live window may not call the read channels (08-1 §3.1.1): main hands it its job row and settings when it loads.
  win.webContents.on('did-finish-load', () => o.initial(send));
  win.once('ready-to-show', () => win.show());
  void win.loadURL(liveUrl(job.id));
  return {
    send,
    focus: () => win.focus(),
    isFocused: () => !win.isDestroyed() && win.isFocused(),
    isMinimized: () => !win.isDestroyed() && win.isMinimized(),
    restore: () => win.restore(),
    isDestroyed: () => win.isDestroyed(),
    close: () => {
      if (!win.isDestroyed()) win.close();
    },
    onClosed: (cb) => win.on('closed', cb),
  };
}
