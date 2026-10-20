// Spec: 04 §13.6 (an AI page: HTML only, ≤ 512 KB; main serves it from `foo-page://{pageId}` with `pageId` =
// `pg_{UUIDv7}`; the bridge allows 10 calls per second; `openLink` is https only and opens after the C-26 dialog through
// `app:openExternal` with source `ai_page`), 08-1 §3.2 `page:open` / `page:rpc`, CR-0022 AT-359, AT-360, AT-361, X-180.
// The pages main is serving this run: one id per page block (reopening the same block keeps its id), never written to disk.
import { PAGE_MAX_BYTES } from '../../shared/kit/parse';
import { PAGE_RPC_PER_SECOND, PAGE_SCHEME } from '../../shared/kit/page';
import { newId } from '../../shared/ids';

export interface ServedPage {
  pageId: string;
  chatId: string;
  html: string;
}

/** A line that opens or closes a fence (the same rule as the bubble's markdownParse FENCE). */
const FENCE = /^\s*```\s*([\w+#.-]*)\s*$/;
const CLOSE = /^\s*```\s*$/;

/**
 * The bodies of the ```page fences at the top level of foo's text, in order, with whether each one closed. The bubble's
 * parser reads the same fences, so index n here is the n-th PageBlock in the bubble.
 */
export function pageBodies(text: string): { body: string; closed: boolean }[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out: { body: string; closed: boolean }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const fence = FENCE.exec(lines[i]!);
    if (!fence) continue;
    const body: string[] = [];
    i++;
    while (i < lines.length && !CLOSE.test(lines[i]!)) body.push(lines[i++]!);
    if ((fence[1] ?? '').toLowerCase() === 'page') out.push({ body: body.join('\n'), closed: i < lines.length });
  }
  return out;
}

export const pageBytes = (html: string) => Buffer.byteLength(html, 'utf8');

/** The page's one document URL: the only request its frame may make (04 §13.6). */
export const pageUrl = (pageId: string) => `${PAGE_SCHEME}://${pageId}/`;

/** How long a link a page asked to open stays openable through `app:openExternal` (the C-26 dialog is answered in it). */
export const LINK_TTL_MS = 60_000;
/** The most pages main keeps serving; past it the least recently used goes (its frame reopens it through `page:open`). */
export const MAX_PAGES = 32;

export class PageRegistry {
  /** In least-recently-used order: a page that is served or read again moves to the end. */
  private readonly byId = new Map<string, ServedPage & { source: string }>();
  private readonly bySource = new Map<string, string>();
  private readonly calls = new Map<string, number[]>();
  private readonly links = new Map<string, number>();

  /** Serves `html` for `source` (message + index, or card); the same source keeps its id. Over the cap: null. */
  serve(chatId: string, source: string, html: string, now: number): ServedPage | null {
    if (pageBytes(html) > PAGE_MAX_BYTES) return null;
    const known = this.bySource.get(source);
    const page = known ? this.byId.get(known) : undefined;
    if (page && page.chatId === chatId && page.html === html) return this.touch(page);
    if (known) this.drop(known);
    const fresh = { pageId: newId('pg', now), chatId, html, source };
    this.byId.set(fresh.pageId, fresh);
    this.bySource.set(source, fresh.pageId);
    for (const oldest of this.byId.keys()) {
      if (this.byId.size <= MAX_PAGES) break;
      this.drop(oldest);
    }
    return fresh;
  }

  get(pageId: string): ServedPage | undefined {
    const page = this.byId.get(pageId);
    return page && this.touch(page);
  }

  get size(): number {
    return this.byId.size;
  }

  /** 04 §13.6: at most {@link PAGE_RPC_PER_SECOND} calls in any one second per page; a refused call still counts. */
  allowCall(pageId: string, now: number): boolean {
    const recent = (this.calls.get(pageId) ?? []).filter((t) => now - t < 1000);
    recent.push(now);
    this.calls.set(pageId, recent);
    return recent.length <= PAGE_RPC_PER_SECOND;
  }

  /** An `openLink` call that passed every check: its URL may open once the user says Open in the C-26 dialog. */
  offerLink(url: string, now: number): void {
    for (const [known, until] of this.links) if (now > until) this.links.delete(known);
    this.links.set(url, now + LINK_TTL_MS);
  }

  /** `app:openExternal` target `ai_page`: true once for a URL a page offered in the last {@link LINK_TTL_MS}. */
  takeLink(url: string, now: number): boolean {
    const until = this.links.get(url);
    this.links.delete(url);
    return until !== undefined && now <= until;
  }

  private touch<P extends ServedPage & { source: string }>(page: P): P {
    this.byId.delete(page.pageId);
    this.byId.set(page.pageId, page);
    return page;
  }

  private drop(pageId: string): void {
    const page = this.byId.get(pageId);
    this.byId.delete(pageId);
    this.calls.delete(pageId);
    if (page && this.bySource.get(page.source) === pageId) this.bySource.delete(page.source);
  }
}

/** One registry for the app run (main's page scheme, `page:open`, `page:rpc` and `app:openExternal` share it). */
export const pages = new PageRegistry();
