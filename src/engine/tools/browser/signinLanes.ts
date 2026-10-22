// Spec: 08-2 §8.4 (J13 lane chooser: saved login → fill it, on failure Sign in here "Your saved {site} login didn't work…";
// password → Sign in here (job NEEDS_YOU, the real Edge window brought to the front, not resized, with the docked banner;
// capture paused; detect success); OTP → the code box or Sign in here; CAPTCHA, passkey, phone approval, bank 3-D Secure →
// Take over; app accounts → Connect; timers: reminder toast at 10 min, cancel at 2 h with nothing booked), §8.3.3 (sign-in
// pause: no snapshot, screenshot, screencast or click on the page while it is in front, `page.__fooNoCapture = true`; only
// `page.url()` and the presence of a password / one-time-code field are read, every 1 s), §8.2 `job.needSignIn
// { site; kind }` (prepare; a runner signal that ends the step in NEEDS_YOU, X-125), §8.6 `chooseSignInLane(site, kind)`,
// §11.3 (`vault.use('fill_login')`: the value goes straight into the page; the AI knows only "your {site} login", AT-059),
// 05-3 §5.10.2 (lanes, titles, states: waiting → live → signed_in | skipped | timed_out | handed_back | withdrawn; 10 min toast,
// 2 h "I stopped the {job} because the sign-in wasn't done." [ Start again ]), §5.10.3 (the banner: address row from the
// page URL; success when the page URL and the password / code field both change, AT-057), §5.10.4 (activity
// `signed_in_site`, no values), 09 §9.27.3 (Edge `Browser.setWindowBounds({ windowState: 'normal' })` then `bringToFront()`;
// closing Edge during sign-in pauses the job and leaves the card `waiting`), 08-1 §3.3 `live:state` (`paused_signin`), 08-4
// §26.5 item 2 (a sign-in in progress is not interrupted). CR-0013 G-M9-10 (`reason` = the lane). M9 T7.
import type { Page } from 'playwright-core';
import { z } from 'zod';
import type { Clock, TimerId } from '../../../shared/clock';
import { t } from '../../../shared/copy/t';
import { newId } from '../../../shared/ids';
import { signInModeOf } from '../../../shared/schemas';
import type { JobRow, LiveState, SignInMode, SignInReason } from '../../../shared/types';
import type { RunnerCore } from '../../jobs/JobRunner';
import { activityRow } from '../../jobs/stopFlow';
import type { MainLink } from '../../protocol';
import type { NeedsUserCard, ToolDef, ToolOutcome } from '../ToolLayer';
import type { DriverWindow } from './browser';
import type { CaptureGuard } from './types';

/** §8.3.3: the URL and the sign-in field are read every 1 s; the banner follows Edge every 500 ms (09 §9.27.3). */
export const POLL_MS = 1_000;
export const BOUNDS_MS = 500;
/** 05-3 §5.10.2 / 07-2 J13 timers. */
export const REMIND_MS = 10 * 60_000;
export const CANCEL_MS = 2 * 60 * 60_000;

/** A password or one-time-code field: what "still on the sign-in form" means (§8.3.3, 05-3 §5.10.3 Detection). */
export const SIGNIN_FIELD =
  'input[type=password], input[autocomplete="one-time-code"], input[autocomplete="current-password"], input[autocomplete="new-password"]';
const USER_FIELD =
  'input[autocomplete="username"], input[type=email], input[name*="user" i], input[id*="user" i], input[name*="login" i], input[name*="email" i]';
const OTP_FIELD = 'input[autocomplete="one-time-code"], input[name*="otp" i], input[id*="otp" i], input[name*="code" i]';

export type NeedKind = 'password' | 'otp' | 'captcha' | 'passkey' | '3ds';
export type Lane = 'saved_login' | 'sign_in_here' | 'take_over' | 'connect';

/** 08-2 §8.4 app accounts: these sign-ins are the Connect card (C10, 08-3 §16), never a page foo waits on. */
const APP_ACCOUNT_HOSTS = /(^|\.)(accounts\.google\.com|login\.microsoftonline\.com|login\.live\.com)$/i;

/** §8.6 `chooseSignInLane(site, kind)`: the lane, and the Sign-in card's `reason` (G-M9-10) when one is posted. */
export function chooseSignInLane(
  site: string,
  kind: NeedKind,
  o: { savedLogin?: boolean; savedFailed?: boolean; knownPuzzle?: boolean } = {},
): { lane: Lane; reason: SignInReason | null } {
  if (APP_ACCOUNT_HOSTS.test(site)) return { lane: 'connect', reason: null };
  switch (kind) {
    case 'password':
      if (o.savedFailed) return { lane: 'sign_in_here', reason: 'saved_login_failed' };
      return o.savedLogin ? { lane: 'saved_login', reason: null } : { lane: 'sign_in_here', reason: 'sign_in' };
    case 'otp':
      // A code by SMS or email on a sign-in page: the user types it on the page (the code box is the bank lane's link).
      return { lane: 'sign_in_here', reason: 'sign_in' };
    case 'captcha':
      return { lane: 'take_over', reason: o.knownPuzzle ? 'known_puzzle' : 'captcha' };
    case 'passkey':
      return { lane: 'take_over', reason: 'passkey' };
    case '3ds':
      return { lane: 'take_over', reason: 'bank_3ds' };
  }
}

/** 05-3 §5.10.2: lanes whose card has [ Take over ] wait for that tap; the others bring Edge to the front at once. */
const WAITS_FOR_TAP: ReadonlySet<SignInReason> = new Set(['captcha', 'known_puzzle']);

/** "+91 98••• ••210" (05-3 §5.10.2 bank lane): the country code, two digits, the last three; never the whole number. */
export function maskPhone(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, '');
  if (digits.length < 10) return null;
  const local = digits.slice(-10);
  const cc = digits.length > 10 ? `+${digits.slice(0, digits.length - 10)} ` : '';
  return `${cc}${local.slice(0, 2)}••• ••${local.slice(-3)}`;
}

/** Edge's outer rectangle for the docked banner (main's `EdgeBounds`, 09 §9.27.3). */
export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  chromeTop: number;
  minimised: boolean;
}

/** What the lanes need of the runner: its core (cards, rows, NEEDS_YOU) and the stop flow. */
export interface LaneRunner {
  core: RunnerCore;
  onCardAnswered(a: { cardId: string; answer?: unknown; resolvedBy: string }): Promise<void>;
  stop(jobId: string, reason: 'window_closed' | 'signin_timeout', report: boolean): Promise<unknown>;
}

export interface LaneDeps {
  clock: Clock;
  link: Pick<MainLink, 'request' | 'send'>;
  /** The job's Edge window, when it has one. */
  window(jobId: string): DriverWindow | undefined;
  /** Opens (or reuses) the job's window. */
  openWindow(jobId: string): Promise<boolean>;
  masker: { apply(page: Page): Promise<void>; remove(page: Page): Promise<void> };
  /** The next snapshot is sent whole: foo re-reads the page (§8.3.4, Hand back "re-reads the page"). */
  reread(jobId: string): void;
  /** SecretRegistry value of a handle (a typed code, `code.submit`), RAM only. */
  secret(handle: string): string | null;
  forget(handle: string): void;
  agentName(): string;
  log(evt: string, kind?: string): void;
}

/** One job's sign-in in progress. */
interface Pause {
  jobId: string;
  cardId: string;
  chatId: string;
  site: string;
  reason: SignInReason;
  mode: SignInMode;
  /** Where the sign-in page was when the card was posted (reopened there after Edge is closed). */
  url: string;
  /** A password / code field was on the page when the sign-in started. */
  field: boolean;
  /** Polls in a row that saw the page moved on with no sign-in field (a page mid-navigation reads empty once). */
  gone: number;
  /** Edge is in front with the banner (card `live`). */
  front: boolean;
  /** The user tapped Take over on the card: the mask is off and the banner is the control bar. */
  taken: boolean;
  requestId: string | null;
  timers: TimerId[];
}

/** The shared window side of a sign-in and a take-over: front, banner, live state, the 500 ms / 1 s poll. */
export class LaneWindows {
  private polls = new Map<string, { timer: TimerId; tick: number; url: string; stopClosed: () => void }>();

  constructor(private readonly d: LaneDeps) {}

  live(jobId: string, state: LiveState): void {
    this.d.link.send('ui.patch', { event: 'live:state', payload: { jobId, state } });
  }

  banner(jobId: string, op: 'open' | 'url' | 'bounds' | 'signed_in' | 'close', extra: Record<string, unknown> = {}): void {
    this.d.link.send('signin.banner', { jobId, op, ...extra });
  }

  /** 09 §9.27.3: restore a minimised Edge only (never resized), then bring it to the front. */
  async front(win: DriverWindow): Promise<void> {
    const s = await win.cdp().catch(() => null);
    if (s) {
      try {
        const w = await s.send<{ windowId: number; bounds: { windowState?: string } }>('Browser.getWindowForTarget');
        if (w.bounds.windowState === 'minimized')
          await s.send('Browser.setWindowBounds', { windowId: w.windowId, bounds: { windowState: 'normal' } });
      } catch {
        // A browser without the Browser domain (rare): bringToFront still works.
      } finally {
        await s.detach().catch(() => undefined);
      }
    }
    await win.bringToFront().catch(() => undefined);
  }

  async bounds(win: DriverWindow): Promise<WindowBounds | null> {
    const s = await win.cdp().catch(() => null);
    if (!s) return null;
    try {
      const w = await s.send<{ bounds: { left?: number; top?: number; width?: number; height?: number; windowState?: string } }>(
        'Browser.getWindowForTarget',
      );
      // outerHeight − innerHeight: Edge's own toolbar (the only page read while the banner is up, 09 §9.27.3 Docking).
      const chromeTop = await win
        .page()
        .evaluate(() => window.outerHeight - window.innerHeight)
        .catch(() => 0);
      const b = w.bounds;
      return {
        x: b.left ?? 0,
        y: b.top ?? 0,
        width: b.width ?? 0,
        height: b.height ?? 0,
        chromeTop: Math.max(0, chromeTop),
        minimised: b.windowState === 'minimized',
      };
    } catch {
      return null;
    } finally {
      await s.detach().catch(() => undefined);
    }
  }

  /**
   * Polls while the banner is up: bounds every 500 ms (the banner follows Edge), the URL and the sign-in field every 1 s
   * (`onCheck`). `onClosed` runs once when the user closes the window. Nothing else on the page is read.
   */
  watch(jobId: string, win: DriverWindow, onCheck: (url: string, field: boolean) => void, onClosed: () => void): void {
    this.unwatch(jobId);
    const stopClosed = win.onClosed(() => {
      this.unwatch(jobId);
      onClosed();
    });
    const entry = { timer: 0 as TimerId, tick: 0, url: win.url(), stopClosed };
    this.polls.set(jobId, entry);
    const tick = async () => {
      if (this.polls.get(jobId) !== entry) return;
      entry.tick += 1;
      const b = await this.bounds(win);
      if (this.polls.get(jobId) !== entry) return;
      if (b) this.banner(jobId, 'bounds', { bounds: b });
      if (entry.tick % (POLL_MS / BOUNDS_MS) === 0) {
        const url = win.url();
        if (url !== entry.url) {
          entry.url = url;
          this.banner(jobId, 'url', { url });
        }
        onCheck(url, await hasSigninField(win.page()));
      }
      if (this.polls.get(jobId) === entry) entry.timer = this.d.clock.setTimeout(() => void tick(), BOUNDS_MS);
    };
    entry.timer = this.d.clock.setTimeout(() => void tick(), 0);
  }

  unwatch(jobId: string): void {
    const p = this.polls.get(jobId);
    if (!p) return;
    this.polls.delete(jobId);
    this.d.clock.clearTimeout(p.timer);
    p.stopClosed();
  }

  /** §8.3.3 `page.__fooNoCapture`: the page-side marker of the pause (the engine's own check is `CaptureGuard`). */
  async noCapture(page: Page | undefined, on: boolean): Promise<void> {
    await page
      ?.evaluate((v) => {
        (window as unknown as { __fooNoCapture?: boolean }).__fooNoCapture = v;
      }, on)
      .catch(() => undefined);
  }
}

/** Whether a password or one-time-code field is on the page (presence only, never its value). */
export async function hasSigninField(page: Page): Promise<boolean> {
  return (
    (await page
      .locator(SIGNIN_FIELD)
      .count()
      .catch(() => 0)) > 0
  );
}

/** After a sign-in, whatever is still in a sign-in form reads `[hidden]` to the AI (AT-056: username too). */
async function markSigninForm(page: Page | undefined): Promise<void> {
  await page
    ?.locator('form:has(input[type=password]) input, form:has(input[autocomplete="one-time-code"]) input')
    .evaluateAll((els) => {
      for (const el of els) el.setAttribute('data-foo-secret', '');
    })
    .catch(() => undefined);
}

/** How long `job.needSignIn` waits for a loading page's address before the card names no site. */
export const HOST_WAIT_MS = 5_000;
/** The site a sign-in card names when the page has no address yet: never the AI's or the page's own words. */
export const NO_HOST = 'this site';

const hostOf = (url: string): string | null => {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
};

const needArgs = z
  .object({
    site: z.string().min(1).max(253),
    kind: z.enum(['password', 'otp', 'captcha', 'passkey', '3ds']),
    /** Bank lane: the number the page says the code went to (masked before it is shown, never stored whole). */
    sentTo: z.string().max(32).optional(),
  })
  .strict();

const loginSchema = z.object({ u: z.string(), p: z.string() });

/** The sign-in lanes: the `job.needSignIn` tool, the pause while a sign-in page is in front, and how it ends. */
export class SigninLanes implements CaptureGuard {
  private pauses = new Map<string, Pause>();
  private runner_: LaneRunner | null = null;
  readonly windows: LaneWindows;
  /** Take-over state is the take-over module's; a job it holds is paused here too. */
  private takenOver: (jobId: string) => boolean = () => false;

  constructor(private readonly d: LaneDeps) {
    this.windows = new LaneWindows(d);
  }

  attach(runner: LaneRunner, takenOver: (jobId: string) => boolean): void {
    this.runner_ = runner;
    this.takenOver = takenOver;
  }
  private get r(): LaneRunner {
    if (!this.runner_) throw new Error('SigninLanes used before attach()');
    return this.runner_;
  }

  /** CaptureGuard (§8.3.3): nothing is captured or clicked while a sign-in or a take-over is on. */
  paused(jobId: string): boolean {
    return this.pauses.has(jobId) || this.takenOver(jobId);
  }

  pause(jobId: string): Readonly<Pause> | undefined {
    return this.pauses.get(jobId);
  }

  // ---- the tool (08-2 §8.2, 08-4 §27.1) ----

  tool(): ToolDef {
    return {
      name: 'job.needSignIn',
      actionClass: 'prepare',
      args: 'site: string, kind: "password" | "otp" | "captcha" | "passkey" | "3ds", sentTo?: string',
      description: 'Tell the app the site needs the user to sign in, enter a code, solve a check or approve on their phone.',
      run: async (raw, ctx) => {
        const a = needArgs.safeParse(raw ?? {});
        if (!a.success) return { kind: 'error', errorKind: 'VALIDATION' };
        return this.need(ctx.jobId, a.data);
      },
    };
  }

  /** `job.needSignIn`: the lane for this page; a saved login is filled here, every other lane ends the step NEEDS_YOU. */
  async need(jobId: string, a: z.infer<typeof needArgs>): Promise<ToolOutcome> {
    const win = this.d.window(jobId);
    // The site is the page's own host (what the banner's address row shows), never a name from the page or the AI. A call
    // that lands while the page is still loading waits, at most HOST_WAIT_MS, for its address; with none, the card says
    // NO_HOST. Before, the AI's own name was shown when the call won the race (CR-0024 close-out, PR #85).
    if (win && !hostOf(win.url()))
      await win
        .page()
        .waitForURL((u) => hostOf(u.toString()) !== null, { timeout: HOST_WAIT_MS })
        .catch(() => undefined);
    const pageHost = win ? hostOf(win.url()) : null;
    const host = pageHost ?? NO_HOST;
    // With no address, the AI's name only picks the lane (an app account is Connect); the card never shows it.
    const laneHost = pageHost ?? a.site.toLowerCase();
    let lane = chooseSignInLane(laneHost, a.kind, { savedLogin: a.kind === 'password' && !!win });
    if (lane.lane === 'connect') return { kind: 'error', errorKind: 'ROUTE_ORDER' };
    if (lane.lane === 'saved_login') {
      const filled = win ? await this.savedLogin(jobId, host, win) : 'missing';
      // AT-059: the AI learns only that "your {site} login" worked; no field, value or page text.
      if (filled === 'signed_in') return { kind: 'ok', result: { signedIn: true, login: `your ${host} login`, url: win!.url() } };
      lane = chooseSignInLane(laneHost, a.kind, { savedFailed: filled === 'failed' });
    }
    return { kind: 'needs_user', card: this.card(jobId, host, lane.reason!, a.sentTo), result: { needsUser: 'signin', site: host } };
  }

  /** SITE_CAPTCHA (the watchdog's challenge page, 08-2 §8.3.5): the CAPTCHA lane, never solved by foo (§8.4). */
  async challenge(job: JobRow): Promise<boolean> {
    const win = this.d.window(job.id);
    const host = (win && hostOf(win.url())) ?? NO_HOST;
    const card = this.card(job.id, host, chooseSignInLane(host, 'captcha').reason!);
    return (await this.r.core.needsYou(job, card)) !== null;
  }

  private card(jobId: string, site: string, reason: SignInReason, sentTo?: string): NeedsUserCard {
    const phone = reason === 'bank_3ds' && sentTo ? maskPhone(sentTo) : null;
    return {
      type: 'signin',
      state: 'waiting',
      payload: { mode: signInModeOf(reason), jobId, site, reason, ...(phone ? { phone } : {}) },
    };
  }

  /** §8.4 Saved login: `vault.use('fill_login')` straight into the page, then the form is sent. */
  private async savedLogin(jobId: string, host: string, win: DriverWindow): Promise<'signed_in' | 'failed' | 'missing'> {
    // SecretVault allows `fill_login` only for a running job on the login's domain (08-2 §11.3).
    await this.r.core.tx([{ op: 'update', table: 'jobs', id: jobId, set: { site_domain: host } }]);
    const r = await this.d.link.request<string>('vault.use', { purpose: 'fill_login', name: host, jobId }).catch(() => null);
    if (!r?.ok) return 'missing';
    let login: z.infer<typeof loginSchema>;
    try {
      login = loginSchema.parse(JSON.parse(r.value));
    } catch {
      return 'missing';
    }
    const page = win.page();
    const pw = page.locator('input[type=password]').first();
    const user = page.locator(USER_FIELD).first();
    if ((await pw.count()) === 0) return 'failed';
    const from = page.url();
    try {
      for (const [loc, value] of [
        [user, login.u],
        [pw, login.p],
      ] as const) {
        if ((await loc.count()) === 0) continue;
        // §8.3.6: fill functions mark what they fill, so the snapshot shows `[hidden]` and frames blur it.
        await loc.evaluate((el) => el.setAttribute('data-foo-secret', ''));
        await loc.fill(value, { timeout: 10_000 });
      }
      await pw.press('Enter', { timeout: 10_000 });
      await page.waitForLoadState('load', { timeout: 15_000 }).catch(() => undefined);
    } catch {
      this.d.log('signin.saved_login_fill', 'failed');
      return 'failed';
    }
    const left = page.url() !== from && (await page.locator('input[type=password]').count()) === 0;
    this.d.log('signin.saved_login', left ? 'ok' : 'failed');
    if (!left) await markSigninForm(page);
    return left ? 'signed_in' : 'failed';
  }

  // ---- the pause (the runner's NEEDS_YOU hook) ----

  /** A Sign-in card was posted and the job is NEEDS_YOU: pause capture, start the timers, bring Edge up (most lanes). */
  async begin(job: JobRow, cardId: string, card: NeedsUserCard): Promise<void> {
    if (card.type !== 'signin') return;
    const p = card.payload as { mode: SignInMode; site: string; reason: SignInReason };
    const win = this.d.window(job.id);
    const pause: Pause = {
      jobId: job.id,
      cardId,
      chatId: job.chatId,
      site: p.site,
      reason: p.reason,
      mode: p.mode,
      url: win?.url() ?? '',
      field: false,
      gone: 0,
      front: false,
      taken: false,
      requestId: null,
      timers: [],
    };
    // The pause holds from the moment the card is posted: nothing is captured or clicked while the page is read.
    this.end(job.id);
    this.pauses.set(job.id, pause);
    if (win) pause.field = await hasSigninField(win.page());
    await this.windows.noCapture(win?.page(), true);
    this.d.log('signin.requested', p.reason);
    pause.timers.push(
      this.d.clock.setTimeout(() => void this.remind(pause), REMIND_MS),
      this.d.clock.setTimeout(() => void this.timeOut(pause), CANCEL_MS),
    );
    // The bank lane posts its own code box first, so "Use the code box" answers a request the engine knows (T6 seam).
    if (p.reason === 'bank_3ds') await this.postCodeBox(job, pause, (card.payload as { phone?: string }).phone ?? '');
    if (!WAITS_FOR_TAP.has(p.reason)) await this.bringUp(pause, p.mode === 'take_over');
  }

  /** Edge to the front with its banner (`waiting`, or `in_control` for a take-over); the card reads LIVE. */
  private async bringUp(pause: Pause, takeOver: boolean): Promise<boolean> {
    let win = this.d.window(pause.jobId);
    if (!win) {
      // Edge was closed during the sign-in (09 §9.27.3): open it again at the sign-in page.
      if (!(await this.d.openWindow(pause.jobId))) return false;
      win = this.d.window(pause.jobId);
      if (!win) return false;
      if (pause.url)
        await win
          .page()
          .goto(pause.url, { waitUntil: 'load', timeout: 15_000 })
          .catch(() => undefined);
      await this.windows.noCapture(win.page(), true);
    }
    if (takeOver && !pause.taken) {
      pause.taken = true;
      // §8.3.6: the mask is removed on take-over so the user sees what they type.
      await this.d.masker.remove(win.page()).catch(() => undefined);
      // CR-0030 pick 3 (UX-14-09 "Adds ✋ You took over to the checklist"): the same row as a running job's take-over.
      const job = await this.r.core.job(pause.jobId);
      const took = job ? await this.r.core.tookOverOps(job) : [];
      if (took.length) await this.r.core.tx(took);
    }
    await this.windows.front(win);
    const mode: SignInMode = pause.taken ? 'take_over' : 'sign_in_here';
    this.windows.banner(pause.jobId, 'open', { mode, url: win.url(), bounds: await this.windows.bounds(win) });
    this.windows.live(pause.jobId, pause.taken ? 'taken_over' : 'paused_signin');
    if (!pause.front) {
      pause.front = true;
      await this.cardState(pause, 'live');
    }
    this.windows.watch(
      pause.jobId,
      win,
      (url, field) => {
        // AT-057: on the plain sign-in lanes the page leaving the form (URL and field both changed) is the success.
        if (pause.taken || pause.mode !== 'sign_in_here' || this.pauses.get(pause.jobId) !== pause) return;
        pause.gone = url !== pause.url && pause.field && !field ? pause.gone + 1 : 0;
        if (pause.gone === 2) void this.success(pause, 'auto');
      },
      () => void this.closed(pause),
    );
    return true;
  }

  private async cardState(pause: Pause, state: 'live' | 'waiting'): Promise<void> {
    await this.r.core.tx([{ op: 'update', table: 'cards', id: pause.cardId, set: { state } }]);
  }

  /** 09 §9.27.3: Edge closed during a sign-in pauses the job; the card goes back to `waiting` so it can be opened again. */
  private async closed(pause: Pause): Promise<void> {
    if (this.pauses.get(pause.jobId) !== pause) return;
    if (pause.taken) {
      // A take-over that the user ends by closing Edge is Stop (J18, AT-078), with the Stop report.
      this.end(pause.jobId);
      this.windows.banner(pause.jobId, 'close');
      await this.r.stop(pause.jobId, 'window_closed', true);
      return;
    }
    pause.front = false;
    this.windows.banner(pause.jobId, 'close');
    this.d.log('signin.window_closed');
    await this.cardState(pause, 'waiting');
  }

  // ---- what the user does (engine messages, X-124) ----

  /** `signin.done`: "I'm done" on the card or the banner (Alt+D). With Edge closed it opens it again at the sign-in page. */
  async done(jobId: string): Promise<void> {
    const pause = this.pauses.get(jobId);
    if (!pause) return this.orphan(jobId, { end: 'signed_in' });
    if (!this.d.window(jobId) || (!pause.front && WAITS_FOR_TAP.has(pause.reason))) {
      await this.bringUp(pause, false);
      return;
    }
    await this.success(pause, 'tap');
  }

  /** `signin.skip`: the card reads "Skipped. I'll try another way."; the job carries on without the sign-in. */
  async skip(jobId: string): Promise<void> {
    const pause = this.pauses.get(jobId);
    if (!pause) return this.orphan(jobId, { skip: true });
    this.d.log('signin.skipped', pause.reason);
    await this.release(pause, false);
    await this.r.onCardAnswered({ cardId: pause.cardId, answer: { skip: true }, resolvedBy: 'tap' });
  }

  /** After an engine restart the pauses are gone but the job still waits on its Sign-in card: the tap answers that card. */
  private async orphan(jobId: string, answer: { end: 'signed_in' } | { skip: true }): Promise<void> {
    const job = await this.r.core.job(jobId);
    if (job?.state !== 'needs_you' || !job.needsYouCardId) return;
    const card = await this.r.core.query<{ type: string }>('cardById', job.needsYouCardId);
    if (card?.type !== 'signin') return;
    this.d.log('signin.resumed_after_restart');
    await this.r.onCardAnswered({ cardId: job.needsYouCardId, answer, resolvedBy: 'tap' });
  }

  /** Take over on the Sign-in card (`job.takeOver` while the card asks): the banner becomes the control bar. */
  async takeOver(jobId: string): Promise<boolean> {
    const pause = this.pauses.get(jobId);
    if (!pause) return false;
    this.d.log('signin.took_over', pause.reason);
    await this.bringUp(pause, true);
    return true;
  }

  /** Hand back on a sign-in card's take-over: the card ends `handed_back` and the job carries on (X-135). */
  async handBack(jobId: string): Promise<boolean> {
    const pause = this.pauses.get(jobId);
    if (!pause) return false;
    this.d.log('signin.handed_back', pause.reason);
    // The passkey / bank lanes have no Take over tap: their banner's Hand back is the same "I'm done".
    if (!pause.taken) {
      await this.success(pause, 'tap');
      return true;
    }
    await this.release(pause, true);
    this.windows.banner(jobId, 'close');
    const job = await this.r.core.job(jobId);
    if (job) await this.r.core.tx([this.r.core.textOp(job, t('cards.signin.hand_back_line'))]);
    await this.r.onCardAnswered({ cardId: pause.cardId, answer: { end: 'handed_back' }, resolvedBy: 'tap' });
    return true;
  }

  /** `code.submit` (M5's code box): the code is typed into the bank page's code field, then forgotten (08-2 §8.4 OTP row). */
  async codeSubmitted(requestId: string, codeRef: string): Promise<boolean> {
    const pause = [...this.pauses.values()].find((p) => p.requestId === requestId);
    const code = this.d.secret(codeRef);
    try {
      return pause && code ? await this.fillCode(pause, code) : false;
    } finally {
      this.d.forget(codeRef);
    }
  }

  private async fillCode(pause: Pause, code: string): Promise<boolean> {
    const page = this.d.window(pause.jobId)?.page();
    const field = page?.locator(OTP_FIELD).first();
    if (!page || !field || (await field.count()) === 0) return false;
    try {
      await field.evaluate((el) => el.setAttribute('data-foo-secret', ''));
      await field.fill(code, { timeout: 10_000 });
      await field.press('Enter', { timeout: 10_000 });
    } catch {
      return false;
    }
    this.d.log('signin.code_typed');
    return true;
  }

  // ---- ends ----

  /** Signed in (the page moved on, or I'm done / Hand back): the success banner, capture back, the job carries on. */
  private async success(pause: Pause, by: 'auto' | 'tap'): Promise<void> {
    if (this.pauses.get(pause.jobId) !== pause) return;
    this.d.log('signin.signed_in', by);
    await this.release(pause, pause.taken);
    this.windows.banner(pause.jobId, 'signed_in');
    const job = await this.r.core.job(pause.jobId);
    if (job)
      await this.r.core.tx([
        {
          op: 'activity',
          row: activityRow({
            kind: 'connected',
            event: 'signed_in_site',
            actor: 'user',
            chatId: job.chatId,
            jobId: job.id,
            summary: t('cards.checklist.sign_in.done', { site: pause.site }),
            outcome: 'done',
          }),
        },
      ]);
    await this.r.onCardAnswered({ cardId: pause.cardId, answer: { end: 'signed_in' }, resolvedBy: by === 'auto' ? 'auto' : 'tap' });
    // 08-2 §8.4 / 05-3 §5.10.2: after a password sign-in (no saved login), foo offers once per site to save it.
    if (job && pause.reason === 'sign_in') await this.offerSaveLogin(job, pause.site);
  }

  /** 05-2 §5.8.4 Login variant's question, once per site (08-3 §15 `suggestions` key `save_login:{domain}`, never twice). The
   * answer is main's (src/main/cards/answerCard.ts): Save posts the Login Secret box, Don't save dismisses the key for good.
   * The values typed on the page are never read: the person types them again in the box (CR-0030 pick 4). */
  private async offerSaveLogin(job: JobRow, site: string): Promise<void> {
    // No page address (NO_HOST): no site to name or key the login by, and never the AI's own name (PR #85), so no offer.
    if (site === NO_HOST) return;
    const key = `save_login:${site}`;
    if ((await this.r.core.query<string>('suggestionState', key)) !== null) return;
    // 05-2 §5.8.6 "Groups: never": the Login box can't be posted in a group, so neither is the question that opens it.
    if ((await this.r.core.query<{ kind: string }>('chatOpen', job.chatId))?.kind === 'group') return;
    const now = this.d.clock.now();
    const question = t('cards.secret.login.offer', { site });
    const { ops } = this.r.core.cardOps(
      job.chatId,
      'choice',
      'asking',
      {
        purpose: 'job',
        question,
        options: [
          { id: 'o1', label: t('cards.secret.login.save') },
          { id: 'o2', label: t('cards.secret.login.dont_save') },
        ],
        multi: false,
        aiReversible: false,
        reversible: false,
        livePrices: false,
        saveLogin: { site },
      },
      null,
      job.ownerId,
    );
    await this.r.core.tx([
      {
        op: 'insert',
        table: 'suggestions',
        row: { id: newId('sg', now), key, kind: 'save_login', text: question, state: 'offered', offered_at: now },
      },
      ...ops,
    ]);
  }

  /** Ends the pause: timers and poll stop, the mask goes back on, the page is captured again and re-read whole. */
  private async release(pause: Pause, remask: boolean): Promise<void> {
    this.end(pause.jobId);
    const page = this.d.window(pause.jobId)?.page();
    if (page) {
      await markSigninForm(page);
      if (remask) await this.d.masker.apply(page).catch(() => undefined);
      await this.windows.noCapture(page, false);
    }
    this.d.reread(pause.jobId);
    this.windows.live(pause.jobId, 'running');
  }

  /** Forgets a job's pause (its timers and poll). The job ended, or a new sign-in replaces it. */
  end(jobId: string): void {
    const p = this.pauses.get(jobId);
    if (!p) return;
    this.pauses.delete(jobId);
    for (const id of p.timers) this.d.clock.clearTimeout(id);
    this.windows.unwatch(jobId);
  }

  /** The job reached a final state (stopped, cancelled): no banner, no timers. */
  jobEnded(jobId: string): void {
    if (!this.pauses.has(jobId)) return;
    this.end(jobId);
    this.windows.banner(jobId, 'close');
  }

  private async remind(pause: Pause): Promise<void> {
    if (this.pauses.get(pause.jobId) !== pause) return;
    this.d.link.send('notify', {
      kind: 'signin',
      chatId: pause.chatId,
      title: this.d.agentName(),
      body: t('cards.signin.reminder_toast', { site: pause.site }),
      prompted: true,
      ref: pause.cardId,
    });
  }

  /** AT-060: 2 h with no sign-in → the card `timed_out`, the job CANCELLED with nothing booked, and Start again. */
  private async timeOut(pause: Pause): Promise<void> {
    if (this.pauses.get(pause.jobId) !== pause) return;
    this.end(pause.jobId);
    this.windows.banner(pause.jobId, 'close');
    const job = await this.r.core.job(pause.jobId);
    if (!job) return;
    const now = this.d.clock.now();
    await this.r.core.tx([
      { op: 'update', table: 'cards', id: pause.cardId, set: { state: 'timed_out', resolved_by: 'auto', resolved_at: now } },
    ]);
    await this.r.stop(pause.jobId, 'signin_timeout', false);
    await this.r.core.tx([
      this.r.core.textOp(job, t('cards.signin.timed_out_line', { what: job.title.charAt(0).toLowerCase() + job.title.slice(1) })),
    ]);
  }

  /** The bank lane's asking `otp` code box (M5 Secret box), carrying the request the engine answers in `codeSubmitted`. */
  private async postCodeBox(job: JobRow, pause: Pause, phone: string): Promise<void> {
    const core = this.r.core;
    const requestId = `${pause.cardId}-otp`;
    const { ops } = core.cardOps(
      job.chatId,
      'secret',
      'asking',
      {
        secretKind: 'otp',
        name: t('composer.paste.name.otp'),
        why: '',
        fields: [{ key: 'code', label: '', masked: true }],
        requestId,
        ...(phone ? { sentTo: phone } : {}),
      },
      job.id,
      job.ownerId,
    );
    const r = await core.tx(ops);
    if (r.ok) pause.requestId = requestId;
  }
}
