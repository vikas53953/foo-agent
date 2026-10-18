// Spec: 08-4 §27.3 (timeouts: Exa/Tavily 10 s, Firecrawl 35 s, Browser Use 180 s; item 2 error kinds: CLOUD_AUTH 401/403,
// CLOUD_QUOTA 402/429 or a vendor quota body, CLOUD_DOWN 5xx/timeout/network), 08-2 §6.3.1 (a key only in the request
// header, never logged). One JSON request to a cloud web service, classified.
import type { Clock } from '../../../shared/clock';
import type { CloudErrorKind, HttpFetch } from './types';

export const TIMEOUT_MS = { exa: 10_000, tavily: 10_000, firecrawl: 35_000, browseruse: 180_000 } as const;

export interface CloudRequest {
  method: 'GET' | 'POST' | 'PATCH';
  url: string;
  headers: Record<string, string>;
  body?: unknown;
}

export type CloudResponse =
  | { ok: true; status: number; body: unknown }
  | { ok: false; kind: Exclude<CloudErrorKind, 'CLOUD_SECRET_BLOCKED'>; status: number | null; timeout: boolean };

const QUOTA_BODY = /quota|credits?\b|insufficient|exceeded|usage limit|rate limit/i;

export function classifyStatus(status: number, bodyText: string): Exclude<CloudErrorKind, 'CLOUD_SECRET_BLOCKED'> {
  if (status === 401 || status === 403) return 'CLOUD_AUTH';
  if (status === 402 || status === 429 || QUOTA_BODY.test(bodyText)) return 'CLOUD_QUOTA';
  return 'CLOUD_DOWN';
}

/** Sends one request with a deadline on the injected clock; never throws. */
export async function cloudRequest(
  deps: { fetch: HttpFetch; clock: Clock },
  req: CloudRequest,
  timeoutMs: number,
): Promise<CloudResponse> {
  const ctl = new AbortController();
  let timedOut = false;
  const timer = deps.clock.setTimeout(() => {
    timedOut = true;
    ctl.abort();
  }, timeoutMs);
  try {
    const headers: Record<string, string> = { accept: 'application/json', ...req.headers };
    if (req.body !== undefined) headers['content-type'] = 'application/json';
    const res = await deps.fetch(req.url, {
      method: req.method,
      headers,
      body: req.body === undefined ? undefined : JSON.stringify(req.body),
      signal: ctl.signal,
      redirect: 'error',
    });
    const text = await res.text();
    if (res.status < 200 || res.status >= 300) return { ok: false, kind: classifyStatus(res.status, text), status: res.status, timeout: false };
    try {
      return { ok: true, status: res.status, body: text ? (JSON.parse(text) as unknown) : null };
    } catch {
      return { ok: false, kind: 'CLOUD_DOWN', status: res.status, timeout: false };
    }
  } catch {
    return { ok: false, kind: 'CLOUD_DOWN', status: null, timeout: timedOut };
  } finally {
    deps.clock.clearTimeout(timer);
  }
}

/** Reads a nested field without trusting the vendor's shape. */
export function field(obj: unknown, ...path: (string | number)[]): unknown {
  let cur = obj;
  for (const k of path) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string | number, unknown>)[k];
  }
  return cur;
}

export function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}
