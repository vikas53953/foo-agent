// Spec: 09 §9.27.3 (one banner per job: frameless, not resizable or movable, skip taskbar, always on top, shown on demand;
// height 72 = address row 32 + banner 40 in both modes; width = Edge's width; docked at x = edge.x, y = edge.y +
// (outerHeight − innerHeight); follows Edge, hidden while Edge is minimised, closes with it; takes focus when shown; Alt+D
// = "I'm done" / "Hand back"), 05-3 §5.10.3 (states `waiting` (sign in), `in_control` (take over), `signed_in`: the success
// banner for 2 s, then the window closes; the address row comes from the page URL), X-121 (Edge is never resized).
// Electron-free: the window is behind `BannerWindow`, so the state machine and timers are unit-tested; signinBannerHost.ts
// makes the real BrowserWindow. The banner page reads its state from the URL hash (bannerHash ↔ parseBannerHash).
import { tokens } from '../../shared/tokens';
import type { SignInMode } from '../../shared/types';
import { trackWindow, type EdgeBounds, type ReadBounds } from './wintrack';

export type { EdgeBounds } from './wintrack';

export type BannerState = 'waiting' | 'in_control' | 'signed_in';
export type BannerAction = 'done' | 'hand_back';

/** 05-3 §5.10.3: address row 32 + banner 40 (`--banner-h`). */
export const BANNER_H = 32 + tokens.size['banner-h'];
export const SUCCESS_MS = 2_000;
export const ALT_D = 'Alt+D';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 09 §9.27.3 Docking: the top of Edge's page area, directly under Edge's own toolbar, Edge's width. */
export const dockRect = (e: EdgeBounds): Rect => ({ x: e.x, y: e.y + e.chromeTop, width: e.width, height: BANNER_H });

export interface BannerPage {
  jobId: string;
  state: BannerState;
  url: string;
  agentName: string;
}

/** The banner page's URL hash (no secrets: the page URL is what the address row shows anyway). */
export const bannerHash = (p: BannerPage): string =>
  `#${new URLSearchParams({ job: p.jobId, state: p.state, url: p.url, agent: p.agentName }).toString()}`;

export interface BannerWindow {
  setBounds(r: Rect): void;
  show(): void;
  hide(): void;
  focus(): void;
  /** Loads (or re-points) the banner page at this hash. */
  load(hash: string): void;
  close(): void;
  onClosed(cb: () => void): void;
}

export interface BannerDeps {
  create(): BannerWindow;
  agentName(): string;
  /** Alt+D: the same path as the banner's button (signin:done / job:handBack). */
  onAction(jobId: string, action: BannerAction): void;
  shortcut: { register(accel: string, cb: () => void): boolean; unregister(accel: string): void };
}

interface Open {
  win: BannerWindow;
  state: BannerState;
  url: string;
  stopTrack: () => void;
  closeTimer?: ReturnType<typeof setTimeout>;
  shownAt: number;
}

/** Every open sign-in banner, one per job. */
export class SigninBanners {
  private open_ = new Map<string, Open>();
  private seq = 0;

  constructor(private readonly d: BannerDeps) {}

  state(jobId: string): BannerState | undefined {
    return this.open_.get(jobId)?.state;
  }

  /** Brings up the banner for a sign-in (`waiting`) or a take-over (`in_control`), docked to the job's Edge window. */
  open(o: { jobId: string; mode: SignInMode; url: string; readBounds: ReadBounds }): void {
    const state: BannerState = o.mode === 'take_over' ? 'in_control' : 'waiting';
    const had = this.open_.get(o.jobId);
    if (had) {
      clearTimeout(had.closeTimer);
      had.state = state;
      had.url = o.url;
      had.shownAt = ++this.seq;
      this.render(o.jobId, had);
      had.win.focus();
      return;
    }
    const win = this.d.create();
    const entry: Open = { win, state, url: o.url, stopTrack: () => undefined, shownAt: ++this.seq };
    this.open_.set(o.jobId, entry);
    win.onClosed(() => this.forget(o.jobId, win));
    this.render(o.jobId, entry);
    let first = true;
    entry.stopTrack = trackWindow(o.readBounds, (b) => {
      if (!b) return this.close(o.jobId);
      if (b.minimised) return win.hide();
      win.setBounds(dockRect(b));
      win.show();
      if (first) win.focus();
      first = false;
    });
    this.syncShortcut();
  }

  /** The address row follows the page (`page.url()` every 1 s, read by the engine). */
  setUrl(jobId: string, url: string): void {
    const e = this.open_.get(jobId);
    if (!e || e.url === url) return;
    e.url = url;
    this.render(jobId, e);
  }

  /** "Looks like you're in. Carrying on…" for 2 s, then the window closes (Edge goes back behind foo). */
  signedIn(jobId: string): void {
    const e = this.open_.get(jobId);
    if (!e) return;
    e.state = 'signed_in';
    this.render(jobId, e);
    this.syncShortcut();
    clearTimeout(e.closeTimer);
    e.closeTimer = setTimeout(() => this.close(jobId), SUCCESS_MS);
  }

  close(jobId: string): void {
    const e = this.open_.get(jobId);
    if (!e) return;
    this.forget(jobId, e.win);
    e.win.close();
  }

  private forget(jobId: string, win: BannerWindow): void {
    const e = this.open_.get(jobId);
    if (!e || e.win !== win) return;
    e.stopTrack();
    clearTimeout(e.closeTimer);
    this.open_.delete(jobId);
    this.syncShortcut();
  }

  private render(jobId: string, e: Open): void {
    e.win.load(bannerHash({ jobId, state: e.state, url: e.url, agentName: this.d.agentName() }));
  }

  /** The banner shown last that still has a button. */
  private target(): [string, Open] | undefined {
    let best: [string, Open] | undefined;
    for (const pair of this.open_) if (pair[1].state !== 'signed_in' && (!best || pair[1].shownAt > best[1].shownAt)) best = pair;
    return best;
  }

  private keyed = false;
  private syncShortcut(): void {
    const want = !!this.target();
    if (want && !this.keyed) {
      this.keyed = this.d.shortcut.register(ALT_D, () => {
        const t = this.target();
        if (t) this.d.onAction(t[0], t[1].state === 'in_control' ? 'hand_back' : 'done');
      });
    } else if (!want && this.keyed) {
      this.d.shortcut.unregister(ALT_D);
      this.keyed = false;
    }
  }
}

export type { ReadBounds };
