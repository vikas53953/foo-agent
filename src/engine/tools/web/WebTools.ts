// Spec: 08-2 §8.2 (`web.search` { query; max ≤ 10 }, `web.fetch` { url }, `web.browseCloud` { url; goal }: all reads; cloud
// on the user's own keys, else the local path; fallback silent; results wrapped untrusted §7.2 part 9; cost to the AI spend
// meter), §8.3.10 (hand-back domains: SITE_HANDBACK, never read), §8.3.12 a–h (cloud web tools), 08-4 §27.2 (ROUTE_ORDER),
// §27.3 (wire contract, error kinds, offline rule NET_OFFLINE, SEARCH_BUSY, cost rows), §24.14 (untrusted wrapper, source
// "web"), 08-4 §26.12 (web rows carry the chat and job they served), X-46, X-124, X-127.
import { PromptBuilder } from '../../prompt/PromptBuilder';
import { bingUrl, parseBing, type ParsedSearch } from './bing';
import { browseruse, MAX_STEPS, POLL_MS } from './browseruse';
import { cloudOutbound } from './cloudOutbound';
import { priceWebCall } from './cost';
import { ddgUrl, parseDdgHtml } from './ddgHtml';
import { exa } from './exa';
import { firecrawl } from './firecrawl';
import { cloudRequest, TIMEOUT_MS, type CloudRequest, type CloudResponse } from './http';
import { extract, localFetch } from './readability';
import { goalActs, hostMatches, isIrctc } from './refusals';
import { RestingClock } from './resting';
import { tavily } from './tavily';
import type { CloudErrorKind, ReadResult, SearchResult, WebCallContext, WebProvider, WebToolDeps, WebToolResult } from './types';

/** 08-4 §27.3 item 2: CLOUD_DOWN is 5xx, timeout or network (no status). */
const downStatus = (status: number | null): boolean => status === null || status >= 500;

/** 08-2 §8.2 `web.fetch`: 15-min cache per URL. */
export const FETCH_CACHE_MS = 15 * 60 * 1000;

type Verdict = 'ok' | 'URL_NOT_ALLOWED' | 'SITE_HANDBACK' | 'ROUTE_ORDER';

export class WebTools {
  readonly resting: RestingClock;
  private readonly cache = new Map<string, { at: number; read: ReadResult; via: WebProvider | 'this_pc' }>();

  constructor(private readonly d: WebToolDeps) {
    this.resting = new RestingClock(d.clock);
  }

  // ------------------------------------------------------------------ web.search

  async search(args: { query: string; max?: number }, ctx: WebCallContext): Promise<WebToolResult<SearchResult[]>> {
    if (!this.d.online()) return { ok: false, errorKind: 'NET_OFFLINE' };
    const max = Math.max(1, Math.min(args.max ?? 10, 10));
    const choice = this.d.settings().search;
    if (choice !== 'this_pc') {
      const cloud = await this.cloudSearch(choice, args.query, max, ctx);
      if (cloud) return this.done(cloud, ctx, choice);
    }
    return this.localSearch(args.query, max, ctx);
  }

  private async cloudSearch(p: 'exa' | 'tavily', query: string, max: number, ctx: WebCallContext): Promise<SearchResult[] | null> {
    const key = await this.cloudKey(p, 0);
    if (!key) return null;
    const out = cloudOutbound(this.d.scrub, { text: { query } });
    if (!out.ok || !out.text.query) return this.blocked(p, ctx);
    const client = p === 'exa' ? exa : tavily;
    const r = await this.call(p, ctx, client.search(this.d.resource[p].base, key, out.text.query!, max), TIMEOUT_MS[p]);
    return r.ok ? client.map(r.body).slice(0, max) : null;
  }

  private async localSearch(query: string, max: number, ctx: WebCallContext): Promise<WebToolResult<SearchResult[]>> {
    // The query leaves this PC for Bing too: secrets are removed the same way (§11.4).
    const q = cloudOutbound(this.d.scrub, { text: { query } });
    const clean = q.ok ? q.text.query! : '';
    const page = this.d.page;
    if (!page) {
      this.d.log('web.no_window');
      return { ok: false, errorKind: 'SEARCH_BUSY' };
    }
    const tries: [string, (html: string, max: number) => ParsedSearch][] = [
      [bingUrl(clean, this.d.searchLang?.() ?? 'en-IN'), parseBing],
      [ddgUrl(clean), parseDdgHtml],
    ];
    for (const [url, parse] of tries) {
      const loaded = await page.load(url, ctx.jobId, ctx.signal);
      if (!loaded) continue;
      const parsed = parse(loaded.html, max);
      if (parsed.kind === 'results') return this.done(parsed.results, ctx, 'this_pc');
      // A challenge page is never solved: one retry on DuckDuckGo, then SEARCH_BUSY.
    }
    return { ok: false, errorKind: 'SEARCH_BUSY' };
  }

  // ------------------------------------------------------------------- web.fetch

  async fetch(args: { url: string }, ctx: WebCallContext): Promise<WebToolResult<ReadResult>> {
    const url = this.parse(args.url);
    if (!url) return { ok: false, errorKind: 'URL_NOT_ALLOWED' };
    const verdict = this.verdict(url);
    if (verdict !== 'ok') return { ok: false, errorKind: verdict };
    if (!this.d.online()) return { ok: false, errorKind: 'NET_OFFLINE' };
    const hit = this.cache.get(url.toString());
    if (hit && this.d.clock.now() - hit.at < FETCH_CACHE_MS) return this.done(hit.read, ctx, hit.via);

    let via: WebProvider | 'this_pc' = 'this_pc';
    let read: ReadResult | null = null;
    // Pages that need the user's sign-in are never sent to a cloud reader.
    if (this.d.settings().read === 'firecrawl' && !this.held(url, ctx)) {
      read = await this.cloudRead(url.toString(), ctx);
      if (read) via = 'firecrawl';
    }
    if (!read) {
      const local = await this.localRead(url.toString(), ctx);
      if (local.kind === 'error') return { ok: false, errorKind: local.errorKind };
      read = local.read;
    }
    this.cache.set(url.toString(), { at: this.d.clock.now(), read, via });
    return this.done(read, ctx, via);
  }

  private async cloudRead(url: string, ctx: WebCallContext): Promise<ReadResult | null> {
    const key = await this.cloudKey('firecrawl', 0);
    if (!key) return null;
    const out = cloudOutbound(this.d.scrub, { urls: { url } });
    if (!out.ok) return this.blocked('firecrawl', ctx);
    const r = await this.call(
      'firecrawl',
      ctx,
      firecrawl.scrape(this.d.resource.firecrawl.base, key, out.urls.url!),
      TIMEOUT_MS.firecrawl,
      (body) => (firecrawl.map(body) ? null : 'CLOUD_DOWN'),
    );
    return r.ok ? firecrawl.map(r.body, url) : null;
  }

  private async localRead(
    url: string,
    ctx: WebCallContext,
  ): Promise<{ kind: 'read'; read: ReadResult } | { kind: 'error'; errorKind: 'URL_NOT_ALLOWED' | 'SITE_HANDBACK' | 'needsBrowser' }> {
    const local = await localFetch({ fetch: this.d.fetch, clock: this.d.clock, check: (u) => this.hopVerdict(u) }, url);
    if (local.kind === 'read') return local;
    if (local.kind === 'blocked') return { kind: 'error', errorKind: local.reason };
    // needsBrowser (or the GET failed): the engine reads it in the job window with the same extractor.
    const target = local.kind === 'needsBrowser' ? local.url : url;
    const loaded = this.d.page ? await this.d.page.load(target, ctx.jobId, ctx.signal) : null;
    if (!loaded) {
      this.d.log('web.no_window');
      return { kind: 'error', errorKind: 'needsBrowser' };
    }
    const rendered = extract(loaded.html, loaded.url);
    if (rendered) return { kind: 'read', read: rendered };
    const text =
      /<body[^>]*>([\s\S]*)<\/body>/i
        .exec(loaded.html)?.[1]
        ?.replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim() ?? '';
    return {
      kind: 'read',
      read: { text: text.slice(0, 20_000), title: null, url: loaded.url, site: new URL(loaded.url).hostname, date: null },
    };
  }

  // -------------------------------------------------------------- web.browseCloud

  async browseCloud(args: { url: string; goal: string }, ctx: WebCallContext): Promise<WebToolResult<ReadResult>> {
    const url = this.parse(args.url);
    if (!url) return { ok: false, errorKind: 'URL_NOT_ALLOWED' };
    const verdict = this.verdict(url);
    if (verdict !== 'ok') return { ok: false, errorKind: verdict };
    const s = this.d.settings();
    if (!s.cloudBrowser || this.held(url, ctx) || isIrctc(url) || this.d.isBillerSite(url) || goalActs(args.goal))
      return { ok: false, errorKind: 'USE_EDGE' };
    if (!this.d.online()) return { ok: false, errorKind: 'NET_OFFLINE' };
    const key = await this.cloudKey('browseruse', MAX_STEPS);
    if (!key) return { ok: false, errorKind: 'USE_EDGE' };
    const out = cloudOutbound(this.d.scrub, { text: { goal: args.goal }, urls: { url: url.toString() } });
    if (!out.ok) {
      this.blocked('browseruse', ctx);
      return { ok: false, errorKind: 'USE_EDGE' };
    }
    const read = await this.runTask(key, out.text.goal!, out.urls.url!, ctx);
    return read ? this.done(read, ctx, 'browseruse') : { ok: false, errorKind: 'USE_EDGE' };
  }

  private async runTask(key: string, goal: string, url: string, ctx: WebCallContext): Promise<ReadResult | null> {
    const base = this.d.resource.browseruse.base;
    const startedAt = this.d.clock.now();
    const deadline = startedAt + TIMEOUT_MS.browseruse;
    const net = { fetch: this.d.fetch, clock: this.d.clock };
    const created = await cloudRequest(net, browseruse.create(base, key, goal, url), TIMEOUT_MS.exa);
    const id = created.ok ? browseruse.taskId(created.body) : null;
    if (!created.ok || !id) {
      this.settle(
        'browseruse',
        ctx,
        startedAt,
        created.ok ? 'CLOUD_DOWN' : created.kind,
        created.ok ? false : created.timeout,
        0,
        created.ok || downStatus(created.status),
      );
      return null;
    }
    let last: unknown = null;
    let failed: { kind: CloudErrorKind; rests: boolean } = { kind: 'CLOUD_DOWN', rests: true };
    for (;;) {
      if (this.d.clock.now() + POLL_MS > deadline) break;
      await this.d.sleep(POLL_MS);
      const r = await cloudRequest(net, browseruse.get(base, key, id), Math.max(1, deadline - this.d.clock.now()));
      if (!r.ok) {
        failed = { kind: r.kind, rests: downStatus(r.status) };
        break;
      }
      last = r.body;
      const st = browseruse.status(r.body);
      if (st === 'finished') {
        this.settle('browseruse', ctx, startedAt, null, false, browseruse.steps(r.body));
        return browseruse.map(r.body, url);
      }
      if (st === 'other') break;
    }
    // Any other terminal status, a failed poll or the deadline: stop the task; the step moves to foo's Edge.
    await cloudRequest(net, browseruse.stop(base, key, id), TIMEOUT_MS.exa);
    this.settle('browseruse', ctx, startedAt, failed.kind, this.d.clock.now() >= deadline - POLL_MS, browseruse.steps(last), failed.rests);
    return null;
  }

  // ---------------------------------------------------------------------- shared

  private parse(raw: string): URL | null {
    try {
      const u = new URL(raw);
      return u.protocol === 'https:' || u.protocol === 'http:' ? u : null;
    } catch {
      return null;
    }
  }

  private verdict(url: URL): Verdict {
    if (!this.d.urlAllowed(url)) return 'URL_NOT_ALLOWED';
    if (this.d.isHandback(url)) return 'SITE_HANDBACK';
    if (this.d.routeOrder(url)) return 'ROUTE_ORDER';
    return 'ok';
  }

  /** Every redirect hop of the local read is re-checked (08-2 §8.2 web.fetch). */
  private hopVerdict(url: URL): 'ok' | 'URL_NOT_ALLOWED' | 'SITE_HANDBACK' {
    if (!this.d.urlAllowed(url)) return 'URL_NOT_ALLOWED';
    return this.d.isHandback(url) ? 'SITE_HANDBACK' : 'ok';
  }

  /** The job holds a sign-in, saved login, card, personal field or approval for this domain. */
  private held(url: URL, ctx: WebCallContext): boolean {
    return (ctx.heldDomains ?? []).some((d) => hostMatches(url.hostname, d));
  }

  /** The saved key when this provider may be used now: not refused, not resting, and under the AI cap. */
  private async cloudKey(p: WebProvider, steps: number): Promise<string | null> {
    if (this.d.settings().refused[p] || this.resting.isResting(p)) return null;
    const key = await this.d.keys.use(p);
    if (!key) return null;
    const est = priceWebCall(this.d.pricing, p, steps).paise ?? 0;
    if (this.d.meter.wouldCross(est)) {
      this.d.log('web.cap_local', { provider: p });
      return null;
    }
    return key;
  }

  private blocked(p: WebProvider, ctx: WebCallContext): null {
    this.d.log('CLOUD_SECRET_BLOCKED', { provider: p, toolCallId: ctx.toolCallId });
    return null;
  }

  private async call(
    p: WebProvider,
    ctx: WebCallContext,
    req: CloudRequest,
    timeoutMs: number,
    bodyError?: (body: unknown) => CloudErrorKind | null,
  ): Promise<CloudResponse> {
    const startedAt = this.d.clock.now();
    const r = await cloudRequest({ fetch: this.d.fetch, clock: this.d.clock }, req, timeoutMs);
    const kind = r.ok ? (bodyError?.(r.body) ?? null) : r.kind;
    this.settle(p, ctx, startedAt, kind, r.ok ? false : r.timeout, 0, r.ok || downStatus(r.status));
    return kind && r.ok ? { ok: false, kind: 'CLOUD_DOWN', status: r.status, timeout: false } : r;
  }

  /** The `ai_turns` row, the resting streak, and the refused / quota notices for one finished cloud call. */
  private settle(
    p: WebProvider,
    ctx: WebCallContext,
    startedAt: number,
    kind: CloudErrorKind | null,
    timeout: boolean,
    steps: number,
    /** CLOUD_DOWN from a 5xx, timeout, network or unusable body; a dead page's other 4xx goes local without resting. */
    rests = true,
  ): void {
    const cost = priceWebCall(this.d.pricing, p, steps);
    if (cost.source === 'unknown') this.d.log('pricing.missing', { provider: p });
    void this.d.recordTurn({
      id: this.d.newId(),
      chat_id: ctx.chatId,
      job_id: ctx.jobId,
      purpose: 'web',
      provider_id: p,
      model_reported: null,
      cost_paise: cost.paise,
      cost_source: cost.source,
      billing: 'key',
      duration_ms: this.d.clock.now() - startedAt,
      outcome: kind === null ? 'ok' : timeout ? 'timeout' : 'error',
      error_kind: kind,
      started_at: startedAt,
    });
    if (kind === null) {
      this.resting.ok(p);
      return;
    }
    // 08-4 §27.3 item 2: only CLOUD_DOWN counts toward the 3-in-a-row resting streak.
    if (kind === 'CLOUD_DOWN' && rests) this.resting.fail(p);
    if (kind === 'CLOUD_AUTH') this.d.onRefused?.(p);
    if (kind === 'CLOUD_QUOTA') this.d.onQuota?.(p);
  }

  private done<T>(data: T, ctx: WebCallContext, via: WebProvider | 'this_pc'): WebToolResult<T> {
    return { ok: true, data, via, forAi: PromptBuilder.untrusted('web', ctx.toolCallId, JSON.stringify(data)) };
  }
}
