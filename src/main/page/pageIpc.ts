// Spec: 04 §13.6 (bridge: validates every call with zod, allows 10 calls per second, logs every call through `page:rpc`;
// every call's text passes the 04-2 §22.4 patterns and the 08-2 §11.4 Redactor in main first, and a secret match refuses
// the call and posts the Secret box; `openLink` is https only and opens through `app:openExternal` with source `ai_page`
// after the C-26 dialog), 08-1 §3.2 `page:open` / `page:rpc`, CR-0022 AT-359, AT-360, AT-361, X-180.
// Main checks; the renderer then does what a passed call asks (resize, fill the composer, the C-26 dialog, send the text
// as if the user typed it, so the gate sees it like any message).
import { shell } from 'electron';
import { systemClock } from '../../shared/clock';
import { fail, ok, type Result } from '../../shared/errors';
import type { PageRpcCall, PageRpcResult } from '../../shared/kit/page';
import { findSecrets, Redactor, suggestedNameSlot } from '../../shared/redactor';
import type { SecretOfferSlot } from '../../shared/ipc';
import { cardRow, type DbRow } from '../db/rows';
import { deps } from '../deps';
import type { AppContext, IpcHandlers } from '../ipc/IpcRouter';
import { logEvent } from '../log/techLog';
import { mainRegistry } from '../secrets/registerValue';
import { messageGet } from '../store/queries';
import { secretIpc } from '../vault/secretIpc';
import { pageBodies, pages, type PageRegistry } from './pages';

const redactor = new Redactor({ clock: systemClock, registry: mainRegistry() });

/** The text a call carries (a URL counts: it may hold a key in its query). */
export function callText(call: PageRpcCall): string | null {
  switch (call.method) {
    case 'reportSize':
      return null;
    case 'draftMessage':
    case 'requestAction':
      return call.params.text;
    case 'openLink':
      return call.params.url;
  }
}

/** The Secret box slot for a secret match, or null when the text is clean (§22.4 patterns, then the registry of record). */
export function secretSlot(text: string): SecretOfferSlot | null {
  const hit = findSecrets(text)[0];
  if (hit) return suggestedNameSlot(hit);
  return redactor.redact(text).hits > 0 ? 'key' : null;
}

export interface PageRpcDeps {
  registry: PageRegistry;
  now(): number;
  /** Posts the Secret box in the page's chat (the `secret:offer` row). */
  offerSecret(chatId: string, slot: SecretOfferSlot): void;
}

/** One bridge call, in the order 04 §13.6 names: the page, the rate, the log, the secret check, then the call's own rule. */
export function pageRpc(d: PageRpcDeps, req: { chatId: string; pageId: string; call: PageRpcCall }): PageRpcResult {
  const page = d.registry.get(req.pageId);
  const method = req.call.method;
  if (!page || page.chatId !== req.chatId) {
    logEvent({ lvl: 'warn', mod: 'page', evt: 'PAGE_RPC', ids: { chatId: req.chatId }, kind: `${method} refused: schema` });
    return { ok: false, refused: 'schema' };
  }
  const now = d.now();
  if (!d.registry.allowCall(req.pageId, now)) {
    logEvent({ lvl: 'warn', mod: 'page', evt: 'PAGE_RPC', ids: { chatId: req.chatId }, kind: `${method} refused: rate` });
    return { ok: false, refused: 'rate' };
  }
  const text = callText(req.call);
  const slot = text === null ? null : secretSlot(text);
  if (slot) {
    logEvent({ lvl: 'warn', mod: 'page', evt: 'PAGE_RPC', ids: { chatId: req.chatId }, kind: `${method} refused: secret` });
    d.offerSecret(req.chatId, slot);
    return { ok: false, refused: 'secret' };
  }
  logEvent({ lvl: 'info', mod: 'page', evt: 'PAGE_RPC', ids: { chatId: req.chatId }, kind: method });
  if (req.call.method === 'openLink') d.registry.offerLink(req.call.params.url, now);
  return { ok: true };
}

type OpenReq = { chatId: string; messageId?: string; cardId?: string; index?: number; keptId?: string };

/** `page:open`: the block's HTML from the stored message or `ai_page` card, served under a page id. */
export function openPage(
  ctx: Pick<AppContext, 'db'>,
  registry: PageRegistry,
  req: OpenReq,
  now: number,
): { pageId: string } | { failed: 'too_large' | 'not_found' } {
  let html: string | undefined;
  let source: string;
  if (req.messageId) {
    const m = messageGet(ctx.db, req.messageId);
    if (!m || m.chatId !== req.chatId || m.authorKind === 'user' || m.status === 'streaming') return { failed: 'not_found' };
    const block = pageBodies(m.text)[req.index ?? 0];
    if (!block?.closed) return { failed: 'not_found' };
    html = block.body;
    source = `m:${m.id}:${req.index ?? 0}`;
  } else if (req.cardId) {
    const row = ctx.db.prepare("SELECT * FROM cards WHERE id = ? AND type = 'ai_page' AND deleted_at IS NULL").get(req.cardId) as
      DbRow | undefined;
    const card = row ? cardRow(row) : null;
    if (!card || card.chatId !== req.chatId || typeof card.payload.html !== 'string') return { failed: 'not_found' };
    html = card.payload.html;
    source = `k:${card.id}`;
  } else {
    // A kept page (`keptId`) is R1 T7's: it reads the `.foopage` blob and serves it through the same registry.
    return { failed: 'not_found' };
  }
  if (!html.trim()) return { failed: 'not_found' };
  const page = registry.serve(req.chatId, source, html, now);
  return page ? { pageId: page.pageId } : { failed: 'too_large' };
}

/** `app:openExternal` target `ai_page`: only a URL a page's `openLink` passed in main, once, after the C-26 Open. */
export async function openPageLink(url: string | undefined, opened: string[], registry: PageRegistry = pages): Promise<Result<void>> {
  if (!url || !/^https:\/\//.test(url) || !registry.takeLink(url, systemClock.now())) return fail('URL_NOT_ALLOWED');
  if (process.env.FOO_TEST === '1') opened.push(url);
  else await shell.openExternal(url);
  return ok(undefined);
}

export function pageIpc(ctx: AppContext): IpcHandlers<'page:open' | 'page:rpc'> {
  const offer = secretIpc(ctx)['secret:offer'];
  const d: PageRpcDeps = {
    registry: pages,
    // The rate is about real calls from a running page, so it reads the wall clock, not foo's (test) clock.
    now: () => systemClock.now(),
    offerSecret: (chatId, slot) => void Promise.resolve(offer({ chatId, slot })),
  };
  return {
    'page:open': (req) => ok(openPage(ctx, pages, req, deps.clock.now())),
    'page:rpc': (req) => ok(pageRpc(d, req)),
  };
}
