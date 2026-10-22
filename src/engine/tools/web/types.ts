// Spec: 08-2 §8.2 (web.search / web.fetch / web.browseCloud rows; webSearch.* / webFetch.* / web.browseCloud functions and their
// returns `SearchResult[]`, `ReadResult | needsBrowser`), §8.3.12 (cloud web tools: the user's own keys only, R11 redaction,
// untrusted results, public signed-out reading for the cloud browser, cost toward the AI cap, silent local fallback, resting),
// 08-4 §27.3 (resources/web-tools.json, wire contract, key check, error kinds, offline rule, cost rows), 08-0 §B.2
// (`CostProviderId` web members), §E.8 / G-M9-13 (vault `foo/web_key/{provider}`, `vault.use` purpose `web_tool`), §A
// (`connections.web`). The seams M5 (vault), M4-T3 (spend meter) and M9-T3 (foo's Edge window) fill are interfaces here.
import type { Clock } from '../../../shared/clock';
import type { WebProvider } from '../../../shared/types';

export type { WebProvider };
/** The four cloud web services (08-0 §B.2 `CostProviderId` web members). */
export const WEB_PROVIDERS: readonly WebProvider[] = ['exa', 'tavily', 'firecrawl', 'browseruse'];

/** 08-4 §27.3 item 2: internal, never a card; written as `tool_calls.error_kind`. */
export type CloudErrorKind = 'CLOUD_AUTH' | 'CLOUD_QUOTA' | 'CLOUD_DOWN' | 'CLOUD_SECRET_BLOCKED';

/** Errors a web tool returns to the step runner (08-2 §8.2, 08-3 §21.2, 08-4 §27.2–§27.3). */
export type WebToolErrorKind =
  'needsBrowser' | 'SEARCH_BUSY' | 'NET_OFFLINE' | 'URL_NOT_ALLOWED' | 'SITE_HANDBACK' | 'SITE_BLOCKED' | 'ROUTE_ORDER' | 'USE_EDGE';

/** 08-4 §27.3 `resources/web-tools.json` (seeded by M9 T1). */
export interface WebToolsResource {
  version: string;
  exa: { base: string };
  tavily: { base: string };
  firecrawl: { base: string };
  browseruse: { base: string };
}

/** 08-2 §8.2 `web.search`: ≤ 10 of these. */
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  site: string;
  date: string | null;
}

/** 08-2 §8.2 `web.fetch` / `web.browseCloud`: Markdown or text ≤ 20,000 chars. */
export interface ReadResult {
  text: string;
  title: string | null;
  url: string;
  site: string;
  date: string | null;
  /** `web.browseCloud`: `steps[].url` as links (08-4 §27.3). */
  links?: string[];
}

/** 08-0 §A `connections.web` as the engine reads it. */
export interface WebSettings {
  search: 'exa' | 'tavily' | 'this_pc';
  read: 'firecrawl' | 'this_pc';
  cloudBrowser: boolean;
  refused: Record<WebProvider, boolean>;
}

/** M5 SecretVault: `vault.use({ purpose: 'web_tool', name: 'foo/web_key/{provider}' })`; null when no key is saved. */
export interface WebKeys {
  use(provider: WebProvider): Promise<string | null>;
}

/** M4-T3 AI spend meter (08-2 §5.10 item 4): true when month spent + this estimate would go over the AI cap. */
export interface SpendMeter {
  wouldCross(estimatePaise: number): boolean;
}

/** 08-2 §5.10.6 / 08-4 §27.3 item 5: one `ai_turns` row per cloud web call. */
export interface WebTurnRow {
  id: string;
  chat_id: string | null;
  job_id: string | null;
  purpose: 'web';
  provider_id: WebProvider;
  model_reported: null;
  cost_paise: number | null;
  cost_source: 'priced' | 'unknown';
  billing: 'key';
  duration_ms: number;
  outcome: 'ok' | 'error' | 'timeout';
  error_kind: CloudErrorKind | null;
  started_at: number;
}

/** A page loaded in foo's job window (M9 T3 `BrowserHandle`): the rendered HTML after load. */
export interface LoadedPage {
  url: string;
  html: string;
}
/** 08-2 §8.3.9: the site answered 403/429 on the document or showed a bot check; its text is never a read. */
export interface RefusedPage {
  refused: 'SITE_BLOCKED';
  url: string;
}
export interface PageLoader {
  /**
   * Loads `url` in the job's window; null when there is no job (or no browser), the job was stopped while waiting for a
   * window, the page never arrived, or it landed on a hand-back site (§8.3.10: never read); `refused` when the site blocked foo.
   */
  load(url: string, jobId: string | null, signal?: AbortSignal): Promise<LoadedPage | RefusedPage | null>;
}

/** The subset of `fetch` the web tools use (injected so tests capture every host). */
export type HttpFetch = (url: string, init: RequestInit) => Promise<Response>;

/** `pricing.json` `web` rows (08-4 §27.3 item 5). */
export type WebPricing = Partial<Record<WebProvider, { perCallUsd?: number; perStepUsd?: number }>>;

/** Who a call is made for (08-4 §26.12: web rows carry the chat and job they served). */
export interface WebCallContext {
  chatId: string | null;
  jobId: string | null;
  /** `tool_calls.id`: the untrusted wrapper's `ref`. */
  toolCallId: string;
  /** The job's stop signal: a window wait ends with it (08-4 §26.8 queue). */
  signal?: AbortSignal;
  /** Registrable domains this job holds a sign-in, saved login, card, personal field or approval for (08-2 §8.2 browseCloud). */
  heldDomains?: readonly string[];
}

export interface WebToolDeps {
  clock: Clock;
  /** Waits `ms` (Browser Use polling, 3 s); tests advance a fake clock. */
  sleep: (ms: number) => Promise<void>;
  fetch: HttpFetch;
  resource: WebToolsResource;
  pricing: { usdToInr: number; web: WebPricing };
  settings: () => WebSettings;
  keys: WebKeys;
  meter: SpendMeter;
  /** Writes the `ai_turns` row (engine db port). */
  recordTurn: (row: WebTurnRow) => void | Promise<void>;
  /** `net.online` (Art. 29). */
  online: () => boolean;
  /** The engine Redactor's `scrub` (08-2 §11.4 R11). */
  scrub: (text: string) => { text: string; hits: number };
  /** `src/shared/handback.ts` `handback.check(url)` (08-0 §E.9, M9 T1). */
  isHandback: (url: URL) => boolean;
  /** 08-4 §27.2: the connector app that covers this host while connected and on, else null. */
  routeOrder: (url: URL) => string | null;
  /** URL policy as `browser.open` (M9 T3; 08-4 §27.6 test hosts). */
  urlAllowed: (url: URL) => boolean;
  /** Biller sites always use foo's Edge (08-2 §8.3.12 d). */
  isBillerSite: (url: URL) => boolean;
  /** Bing `setlang` (08-2 §8.2): the user's language; default en-IN. */
  searchLang?: () => 'en-IN' | 'hi';
  /** foo's job window (local search and `needsBrowser`); absent until M9 T3 lands. */
  page?: PageLoader;
  newId: () => string;
  log: (kind: string, detail?: Record<string, string | number | boolean>) => void;
  /** A used-up key adds one line to the next brief (`cards.brief.line.web_key_quota`, M7). */
  onQuota?: (provider: WebProvider) => void;
  /** 401/403: main stores `connections.web.refused.{provider}` (08-0 §A, X-127); a re-saved key's check clears it. */
  onRefused?: (provider: WebProvider) => void;
}

/** What a tool returns to the runner: data for the AI already wrapped untrusted, or an error kind. */
export type WebToolResult<T> =
  | { ok: true; data: T; forAi: string; via: WebProvider | 'this_pc' }
  | { ok: false; errorKind: WebToolErrorKind; detail?: string; landed?: string };
