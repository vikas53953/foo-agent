// Spec: 08-1 §3.2 (`signin:done` / `signin:skip` → engine `signin.done` / `signin.skip`; `job:takeOver` → `job.takeOver
// { on: true }`; `job:handBack` → `job.handBack { jobId }`; JOB_GONE), §3.1.7 (main forwards, the engine writes the card
// and job rows), X-124 (one IPC call = exactly one engine message), X-135 (hand back has one meaning), 05-3 §5.10.4
// (requested, took over, handed back and skipped are tech-log lines; no values). `code:submit` waits for M5's SecretRegistry
// path (implementation-notes "M9 T6").
import { fail, ok, type Result } from '../../shared/errors';
import type { EngineBridge } from '../engine-supervisor/EngineBridge';
import type { Db } from '../store/db';
import type { AppContext, handle as Handle } from '../ipc/IpcRouter';
import type { SigninBanners } from '../windows/signinBanner';
import { electronBanners } from '../windows/signinBannerHost';

type JobChannel = 'signin:done' | 'signin:skip' | 'job:takeOver' | 'job:handBack';

export interface SigninDeps {
  /** The job's state, or null when there is no such job. */
  jobState(jobId: string): string | null;
  /** The state of the job's newest sign-in card, or null when it has none. */
  signinCardState(jobId: string): string | null;
  /** The engine port at call time (the supervisor may attach it after the channels are registered). */
  engine(): Pick<EngineBridge, 'send'> | undefined;
  log(line: string): void;
}

const OPEN_JOB: ReadonlySet<string> = new Set(['queued', 'working', 'needs_you', 'waiting']);
/** 08-0 §G.2: a sign-in card still asking the user. */
const OPEN_CARD: ReadonlySet<string> = new Set(['waiting', 'live']);

/** The four handlers, Electron-free. Each sends exactly one engine message or nothing. */
export function signinHandlers(d: SigninDeps): Record<JobChannel, (req: { jobId: string }) => Result<void>> {
  const forward = (jobId: string, needsCard: boolean, send: () => boolean, kind: string): Result<void> => {
    const state = d.jobState(jobId);
    if (state === null || !OPEN_JOB.has(state)) return fail('JOB_GONE');
    if (needsCard && !OPEN_CARD.has(d.signinCardState(jobId) ?? '')) return fail('JOB_GONE');
    if (!send()) return fail('UNKNOWN', 'engine not running');
    d.log(`signin: ${kind} ${jobId}`);
    return ok(undefined);
  };
  return {
    'signin:done': ({ jobId }) => forward(jobId, true, () => d.engine()?.send('signin.done', { jobId }) ?? false, 'signin.done'),
    'signin:skip': ({ jobId }) => forward(jobId, true, () => d.engine()?.send('signin.skip', { jobId }) ?? false, 'signin.skip'),
    'job:takeOver': ({ jobId }) =>
      forward(jobId, false, () => d.engine()?.send('job.takeOver', { jobId, on: true }) ?? false, 'job.takeOver'),
    'job:handBack': ({ jobId }) => forward(jobId, false, () => d.engine()?.send('job.handBack', { jobId }) ?? false, 'job.handBack'),
  };
}

/** Reads for the handlers from foo.db. */
export function signinDbReads(db: Db): Pick<SigninDeps, 'jobState' | 'signinCardState'> {
  const job = db.prepare('SELECT state FROM jobs WHERE id = ?').pluck();
  const card = db
    .prepare("SELECT state FROM cards WHERE job_id = ? AND type = 'signin' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1")
    .pluck();
  return {
    jobState: (id) => (job.get(id) as string | undefined) ?? null,
    signinCardState: (id) => (card.get(id) as string | undefined) ?? null,
  };
}

let banners: SigninBanners | null = null;

/**
 * The open sign-in banners (09 §9.27.3). The sign-in lanes (M9 T7) call `open` / `setUrl` / `signedIn` / `close` as the
 * engine reports the job's Edge window; null until the channels are registered.
 */
export const signinBanners = (): SigninBanners | null => banners;

/** Registers the four channels (IpcRouter's one line) and the banners, whose Alt+D goes through the same handlers. */
export function registerSigninIpc(ctx: AppContext, handle: typeof Handle): ReturnType<typeof signinHandlers> {
  const h = signinHandlers({
    ...signinDbReads(ctx.db),
    engine: () => ctx.engine,
    log: (line) => console.info(line),
  });
  for (const c of Object.keys(h) as JobChannel[]) handle(c, h[c]);
  banners = electronBanners({
    agentName: () => ctx.settings.get().identity.agentName,
    onAction: (jobId, action) => void (action === 'done' ? h['signin:done'] : h['job:handBack'])({ jobId }),
  });
  return h;
}
