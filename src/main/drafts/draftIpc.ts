// Spec: 08-1 §3.2 draft:update | send | undo | discard | openInApp; 08-0 §G.7 (X-65). M5-T6 fills the rows T1 stubbed; the
// router line in src/main/ipc/IpcRouter.ts stays T1's. Main's 1 s draft tick (like the approval expiry tick) sends each
// Draft whose 5 s undo window has closed, so a send happens with the window closed too. M5 T14: its second look goes to the
// engine (`draft.secondLook`, 08-2 §9.6, CR-0009 G-M5-39 (b)).
import { logEvent } from '../log/techLog';
import { shell } from 'electron';
import { deps } from '../deps';
import type { AppContext, IpcHandlers } from '../ipc/IpcRouter';
import { approvalGate, publish } from '../approvals/approvalIpc';
import { EXPIRY_TICK_MS } from '../approvals/expiry';
import { DraftService, type SecondLook } from './DraftService';
import { gmailDrafts } from './gmailDrafts';

const services = new WeakMap<AppContext['db'], DraftService>();

// M5 T14
/** The look's answer; 20 s for the AI turn plus one repair (08-4 §28.5), with room for the engine's queue. */
const LOOK_TIMEOUT_MS = 60_000;
async function askEngine(ctx: AppContext, approvalId: string, out: { content: string; recipients: string[] }): ReturnType<SecondLook> {
  const r = ctx.engine?.live
    ? await ctx.engine.request<Awaited<ReturnType<SecondLook>>>('draft.secondLook', { approvalId, ...out }, LOOK_TIMEOUT_MS)
    : null;
  return r?.ok ? r.value : { pass: false, held: { reason: 'cannot_check', verbing: 'sending' } };
}

/** The one DraftService of this app; its send tick starts with it. */
export function draftService(ctx: AppContext): DraftService {
  let s = services.get(ctx.db);
  if (s) return s;
  s = new DraftService({
    db: ctx.db,
    gate: approvalGate(ctx),
    now: () => deps.clock.now(),
    gmail: gmailDrafts,
    changed: (effects) => publish(ctx, effects),
    openExternal: (url) => shell.openExternal(url),
    // M5 T14 (08-2 §9.6, G-M5-39 (b)): the engine runs the look (the AI and the job's words are there); no engine → the
    // look can't run, so the draft is held (fail closed).
    secondLook: (a, out) => askEngine(ctx, a.id, out),
    dataDir: ctx.dataDir,
    log: (line) => console.info('drafts', JSON.stringify(line)),
  });
  services.set(ctx.db, s);
  const service = s;
  const timer = setInterval(() => {
    service
      .tick()
      .catch((e: unknown) =>
        logEvent({ lvl: 'error', mod: 'drafts', evt: 'DRAFT_TICK_FAILED', kind: e instanceof Error ? e.name : typeof e }),
      );
  }, EXPIRY_TICK_MS);
  timer.unref?.();
  return s;
}

export function draftIpc(ctx: AppContext): IpcHandlers<'draft:update' | 'draft:send' | 'draft:undo' | 'draft:discard' | 'draft:openInApp'> {
  const drafts = draftService(ctx);
  return {
    'draft:update': (req) => drafts.update(req),
    'draft:send': (req) => drafts.send(req),
    'draft:undo': (req) => drafts.undo(req),
    'draft:discard': (req) => drafts.discard(req),
    'draft:openInApp': (req) => drafts.openInApp(req),
  };
}
