// Spec: 08-1 §3.2 draft:update | send | undo | discard | openInApp; 08-0 §G.7 (X-65). M5-T6 fills the rows T1 stubbed; the
// router line in src/main/ipc/IpcRouter.ts stays T1's. Main's 1 s draft tick (like the approval expiry tick) sends each
// Draft whose 5 s undo window has closed, so a send happens with the window closed too.
import { shell } from 'electron';
import { deps } from '../deps';
import type { AppContext, IpcHandlers } from '../ipc/IpcRouter';
import { approvalGate, publish } from '../approvals/approvalIpc';
import { EXPIRY_TICK_MS } from '../approvals/expiry';
import { DraftService } from './DraftService';
import { gmailDrafts } from './gmailDrafts';

const services = new WeakMap<AppContext['db'], DraftService>();

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
    dataDir: ctx.dataDir,
    log: (line) => console.info('drafts', JSON.stringify(line)),
  });
  services.set(ctx.db, s);
  const service = s;
  const timer = setInterval(() => {
    service.tick().catch((e: unknown) => console.error('drafts.tick', e));
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
