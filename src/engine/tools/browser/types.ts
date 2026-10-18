// Spec: 08-2 §8.3 (foo's own Edge, driven by playwright-core over CDP; one window per job, ≤ 3, 08-4 §26.8), §8.3.3
// (capture paused while a sign-in page is in front), §8.3.6 (mask stylesheet, per-frame computed-style check), §8.3.7
// (screencast only while watched), 08-0 §G.8 (X-66: Edge always external). CR-0013 (M9 T1): the seam every M9 ticket codes
// against. T3 implements it with playwright-core (Edge on Windows, Playwright Chromium in the container); T5 (screencast),
// T7 (sign-in lanes) and T8 (submit) only consume it, so each can be tested with a fake.
import type { Result } from '../../../shared/errors';

/** A CDP session on one job window's page target (playwright-core `CDPSession`, narrowed). */
export interface CdpSession {
  send<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
  /** Returns the unsubscribe function. */
  on(event: string, cb: (params: unknown) => void): () => void;
  detach(): Promise<void>;
}

/** One job's Edge window (08-2 §8.3.2). */
export interface JobWindow {
  readonly jobId: string;
  /** The page's current URL (`page.url()`). */
  url(): string;
  cdp(): Promise<CdpSession>;
  bringToFront(): Promise<void>;
  close(): Promise<void>;
  /** The user closed the window (09 §9.27.3: during sign-in → pause; during take-over → Stop). Returns unsubscribe. */
  onClosed(cb: () => void): () => void;
}

export interface BrowserHandle {
  /** `browser.ensure`: launch or reuse the persistent profile. `BROWSER_MISSING` when neither Edge nor Chrome starts. */
  ensure(): Promise<Result<void>>;
  /** A window for this job (reused if open). At most 3 job windows; a 4th job waits (queued caption, 08-4 §26.8). */
  openWindow(jobId: string): Promise<Result<JobWindow>>;
  window(jobId: string): JobWindow | undefined;
  closeWindow(jobId: string): Promise<void>;
}

/** 08-2 §8.3.6: true only when every sensitive element in every frame of the window is verified blurred; frames that
 * cannot be verified are dropped (never sent). T3's masker implements it; T5's screencast calls it. */
export interface FrameVerifier {
  verify(win: JobWindow): Promise<boolean>;
}

/** 08-2 §8.3.3: while a sign-in / OTP / 3DS page is in front, nothing is captured (`__fooNoCapture`). T7 owns the state;
 * snapshot, step screenshots and screencast ask it before every capture. */
export interface CaptureGuard {
  paused(jobId: string): boolean;
}
