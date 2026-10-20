// Spec: 08-2 §8.3.7 (CDP `Page.startScreencast({ format:'jpeg', quality:60, maxWidth:1280, everyNthFrame:2 })` on the job page
// only while `job:watch` is on, throttled to ≤ 5 fps, each frame verified masked before forwarding and dropped when it cannot
// be verified; never during the sign-in pause; frames are not stored; "Now:" line = the running step phrase), §8.3.6 (mask
// verification: FrameVerifier, T3's masker), §8.3.3 (CaptureGuard, T7), 08-1 §3.3 (`live:frame { jobId, jpeg, w, h, masked:
// true, nowLine }`), 09 §9.27.2, 08-3 §20 (≤ 5 fps, ≤ 1280 px). The frame also carries `pageUrl` for main's no-capture pass
// (06-3 §11.2 "masked in main", `no-capture-hosts.json`); main strips it before the renderer sees the frame.
import type { Clock } from '../../../shared/clock';
import { fail, ok, type Result } from '../../../shared/errors';
import type { EventPayload } from '../../../shared/ipc';
import type { MainLink } from '../../protocol';
import { fakeBrowser } from './fakeBrowser';
import type { BrowserHandle, CaptureGuard, CdpSession, FrameVerifier, JobWindow } from './types';

export const SCREENCAST_PARAMS = { format: 'jpeg', quality: 60, maxWidth: 1280, everyNthFrame: 2 } as const;
/** ≤ 5 fps. */
export const MIN_FRAME_GAP_MS = 200;

export type EngineLiveFrame = EventPayload['live:frame'] & { pageUrl: string };

export interface ScreencastDeps {
  /** Null until foo's browser is running (T3). */
  browser(): BrowserHandle | null;
  verifier: FrameVerifier;
  guard: CaptureGuard;
  clock: Clock;
  send(frame: EngineLiveFrame): void;
  nowLine(jobId: string): string;
}

interface CdpFrame {
  data: string;
  sessionId: number;
  metadata?: { deviceWidth?: number; deviceHeight?: number };
}

interface Cast {
  win: JobWindow;
  session: CdpSession;
  off: (() => void)[];
  lastSentAt: number;
  busy: boolean;
}

export class Screencast {
  private casts = new Map<string, Cast>();
  /** A watch still waiting for its CDP session; an off (or a second on) in that gap finds it here. */
  private pending = new Map<string, symbol>();

  constructor(private d: ScreencastDeps) {}

  watching(jobId: string): boolean {
    return this.casts.has(jobId);
  }

  async watch(jobId: string, on: boolean): Promise<Result<void>> {
    if (!on) {
      this.pending.delete(jobId);
      await this.stop(jobId);
      return ok(undefined);
    }
    if (this.casts.has(jobId) || this.pending.has(jobId)) return ok(undefined);
    const win = this.d.browser()?.window(jobId);
    if (!win) return fail('LIVE_UNAVAILABLE');
    const token = Symbol(jobId);
    this.pending.set(jobId, token);
    const stillWanted = () => this.pending.get(jobId) === token;
    let session: CdpSession;
    try {
      session = await win.cdp();
    } catch {
      if (stillWanted()) this.pending.delete(jobId);
      return fail('LIVE_UNAVAILABLE');
    }
    if (!stillWanted()) {
      // Unwatched while the session was opening: nothing starts.
      await session.detach().catch(() => undefined);
      return ok(undefined);
    }
    this.pending.delete(jobId);
    const cast: Cast = { win, session, off: [], lastSentAt: Number.NEGATIVE_INFINITY, busy: false };
    this.casts.set(jobId, cast);
    cast.off.push(session.on('Page.screencastFrame', (p) => void this.onFrame(jobId, cast, p as CdpFrame)));
    cast.off.push(win.onClosed(() => void this.stop(jobId)));
    try {
      await session.send('Page.startScreencast', { ...SCREENCAST_PARAMS });
    } catch {
      if (this.casts.get(jobId) === cast) await this.stop(jobId);
      return fail('LIVE_UNAVAILABLE');
    }
    return ok(undefined);
  }

  async stopAll(): Promise<void> {
    this.pending.clear();
    await Promise.all([...this.casts.keys()].map((id) => this.stop(id)));
  }

  private async stop(jobId: string): Promise<void> {
    const cast = this.casts.get(jobId);
    if (!cast) return;
    this.casts.delete(jobId);
    for (const off of cast.off) off();
    await cast.session.send('Page.stopScreencast').catch(() => undefined);
    await cast.session.detach().catch(() => undefined);
  }

  private async onFrame(jobId: string, cast: Cast, p: CdpFrame): Promise<void> {
    // Every frame is acknowledged, sent or not: Chromium stops sending until it is.
    void cast.session.send('Page.screencastFrameAck', { sessionId: p.sessionId }).catch(() => undefined);
    const now = this.d.clock.now();
    if (cast.busy || now - cast.lastSentAt < MIN_FRAME_GAP_MS || this.d.guard.paused(jobId)) return;
    cast.busy = true;
    try {
      const verified = await this.d.verifier.verify(cast.win).catch(() => false);
      if (!verified || this.casts.get(jobId) !== cast || this.d.guard.paused(jobId)) return;
      const bytes = Buffer.from(p.data, 'base64');
      cast.lastSentAt = now;
      this.d.send({
        jobId,
        jpeg: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
        w: p.metadata?.deviceWidth ?? 0,
        h: p.metadata?.deviceHeight ?? 0,
        masked: true,
        nowLine: this.d.nowLine(jobId),
        pageUrl: cast.win.url(),
      });
    } finally {
      cast.busy = false;
    }
  }
}

/**
 * The engine's screencast on foo's browser (T3's `PlaywrightBrowser`) with T3's masker as the frame verifier. FOO_TEST runs
 * may name a folder of fake frames instead (FOO_FAKE_BROWSER; masked at source). With neither, every watch answers
 * LIVE_UNAVAILABLE and no frame is verified (fail closed). T7's sign-in lanes replace the guard.
 */
export function engineScreencast(o: {
  link: MainLink;
  clock: Clock;
  env: Record<string, string | undefined>;
  testRun: boolean;
  /** foo's browser and its masker; read on each watch, since the engine builds them after the screencast. */
  runtime?: () => { browser: BrowserHandle; masker: FrameVerifier } | null;
}): Screencast {
  const fake = o.testRun && o.env.FOO_FAKE_BROWSER ? fakeBrowser(o.env.FOO_FAKE_BROWSER) : null;
  return new Screencast({
    browser: () => fake ?? o.runtime?.()?.browser ?? null,
    verifier: {
      verify: async (win) => {
        if (fake) return true;
        const masker = o.runtime?.()?.masker;
        return masker ? masker.verify(win) : false;
      },
    },
    guard: { paused: () => false },
    clock: o.clock,
    send: (frame) => o.link.send('ui.patch', { event: 'live:frame', payload: frame }),
    nowLine: () => '',
  });
}
