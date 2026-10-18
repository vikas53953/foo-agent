// Spec: 08-3 §16.1 Calls (self rate limit 5 requests/s; exponential backoff on 429/5xx, max 3 tries, never for drafts.send),
// Tokens (access token in RAM only; refresh on 401 once; 403 `insufficientPermissions` / `ACCESS_TOKEN_SCOPE_INSUFFICIENT` →
// the matching granted flag false + `CONN_SCOPE_MISSING`), §21.2 (`CONN_RATE_LIMITED`, `CONN_EXPIRED`, `CONN_REVOKED`),
// 08-2 §11.4 (nothing personal in logs: only kinds and status codes are logged). CR-0012 seams: HttpFetch, GoogleAccess.
// Every Gmail, Calendar and People call goes through `googleCall`.
import type { Clock } from '../../../shared/clock';
import type { ErrorKind } from '../../../shared/types';
import type { ToolOutcome } from '../ToolLayer';
import type { GoogleAccess, HttpFetch } from './types';

export type GrantFlag = 'read' | 'draft' | 'send' | 'calendarWrite' | 'contactsRead';
export type ConnErrorKind = Extract<
  ErrorKind,
  'CONN_EXPIRED' | 'CONN_REVOKED' | 'CONN_RATE_LIMITED' | 'CONN_SCOPE_MISSING' | 'NET_OFFLINE' | 'NOT_FOUND' | 'UNKNOWN'
>;

/** A Google call that failed, by the ErrorKind the tool reports. `status` is the HTTP status when there was one. */
export class ConnError extends Error {
  constructor(
    readonly kind: ConnErrorKind,
    readonly status?: number,
  ) {
    super(kind);
    this.name = 'ConnError';
  }
}

export const RATE_PER_SECOND = 5;
export const MAX_TRIES = 3;
/** First backoff wait; doubles each try (1 s, 2 s). */
export const BACKOFF_BASE_MS = 1_000;

const sleep = (clock: Clock, ms: number) => new Promise<void>((r) => clock.setTimeout(r, ms));

/** At most `perSecond` starts in any rolling second, in call order. */
export class RateLimiter {
  private starts: number[] = [];
  private tail: Promise<void> = Promise.resolve();

  constructor(
    private clock: Clock,
    private perSecond = RATE_PER_SECOND,
  ) {}

  take(): Promise<void> {
    const turn = this.tail.then(async () => {
      for (;;) {
        const now = this.clock.now();
        this.starts = this.starts.filter((t) => t > now - 1_000);
        if (this.starts.length < this.perSecond) {
          this.starts.push(now);
          return;
        }
        await sleep(this.clock, this.starts[0]! + 1_000 - now);
      }
    });
    this.tail = turn.catch(() => undefined);
    return turn;
  }
}

export interface GoogleCallDeps {
  http: HttpFetch;
  access: GoogleAccess;
  clock: Clock;
  limiter: RateLimiter;
  log?(evt: string, kind?: string): void;
}

export interface GoogleRequest {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  /** The granted flag this call needs (a 403 for a missing scope flips it). */
  flag: GrantFlag;
  /** drafts.send: one try only, whatever the answer (08-3 §16.1 Calls). */
  noRetry?: boolean;
}

const CONN_KINDS = new Set<string>(['CONN_EXPIRED', 'CONN_REVOKED']);

/** What GoogleAccess rejected with: an error carrying `kind` (or message) CONN_EXPIRED / CONN_REVOKED, else UNKNOWN. */
function accessKind(e: unknown): ConnErrorKind {
  if (e instanceof ConnError) return e.kind;
  const k = (e as { kind?: unknown } | null)?.kind ?? (e instanceof Error ? e.message : undefined);
  return typeof k === 'string' && CONN_KINDS.has(k) ? (k as ConnErrorKind) : 'UNKNOWN';
}

const SCOPE_REASONS = new Set(['insufficientPermissions', 'ACCESS_TOKEN_SCOPE_INSUFFICIENT']);
const RATE_REASONS = new Set(['rateLimitExceeded', 'userRateLimitExceeded', 'RATE_LIMIT_EXCEEDED']);

/** The `reason` strings of a Google error body (v1 `errors[]` and v2 `details[]`). */
function reasons(body: unknown): string[] {
  const err = (body as { error?: { errors?: { reason?: unknown }[]; details?: { reason?: unknown }[] } } | null)?.error;
  return [...(err?.errors ?? []), ...(err?.details ?? [])].map((x) => x.reason).filter((r): r is string => typeof r === 'string');
}

async function bodyOf(r: { json(): Promise<unknown> }): Promise<unknown> {
  try {
    return await r.json();
  } catch {
    return null;
  }
}

/** One Google API call: rate limit, bearer token, 401 refresh once, 403 scope, backoff on 429/5xx. Resolves the JSON body. */
export async function googleCall(d: GoogleCallDeps, req: GoogleRequest): Promise<unknown> {
  let token: string;
  try {
    token = await d.access.accessToken();
  } catch (e) {
    throw new ConnError(accessKind(e));
  }
  let refreshed = false;
  const tries = req.noRetry ? 1 : MAX_TRIES;
  for (let attempt = 1; ; attempt++) {
    await d.limiter.take();
    let res: Awaited<ReturnType<HttpFetch>>;
    try {
      res = await d.http(req.url, {
        method: req.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(req.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(req.body !== undefined ? { body: JSON.stringify(req.body) } : {}),
      });
    } catch {
      d.log?.('google.call', 'NET_OFFLINE');
      throw new ConnError('NET_OFFLINE');
    }
    const status = res.status;
    if (status >= 200 && status < 300) return status === 204 ? null : bodyOf(res);
    if (status === 401) {
      if (refreshed) throw new ConnError('CONN_EXPIRED', status);
      refreshed = true;
      try {
        token = await d.access.refreshAfter401();
      } catch (e) {
        throw new ConnError(accessKind(e), status);
      }
      attempt -= 1; // the 401 retry is not a backoff try
      continue;
    }
    const body = await bodyOf(res);
    const why = reasons(body);
    if (status === 403 && why.some((r) => SCOPE_REASONS.has(r))) {
      await d.access.scopeMissing(req.flag);
      d.log?.('google.call', 'CONN_SCOPE_MISSING');
      throw new ConnError('CONN_SCOPE_MISSING', status);
    }
    const rateLimited = status === 429 || (status === 403 && why.some((r) => RATE_REASONS.has(r)));
    if (status === 404) throw new ConnError('NOT_FOUND', status);
    if (!rateLimited && status < 500) throw new ConnError('UNKNOWN', status);
    if (attempt >= tries) {
      d.log?.('google.call', rateLimited ? 'CONN_RATE_LIMITED' : `HTTP_${status}`);
      throw new ConnError(rateLimited ? 'CONN_RATE_LIMITED' : 'UNKNOWN', status);
    }
    await sleep(d.clock, BACKOFF_BASE_MS * 2 ** (attempt - 1));
  }
}

/** The real Google API hosts (ART-15b allow-list, G-M8-01). Tests and the FOO_TEST journey pass a fake base instead. */
export const GOOGLE_BASES = {
  gmail: 'https://gmail.googleapis.com',
  calendar: 'https://www.googleapis.com',
  people: 'https://people.googleapis.com',
} as const;
export type GoogleBases = { [K in keyof typeof GOOGLE_BASES]: string };

/** A query string from defined values only. */
export function qs(params: Record<string, string | number | boolean | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** A tool body for a connector call: bad args → VALIDATION; a ConnError → its kind; anything else → UNKNOWN. */
export async function connOutcome<A>(
  parse: (args: unknown) => { success: true; data: A } | { success: false },
  args: unknown,
  run: (a: A) => Promise<ToolOutcome>,
): Promise<ToolOutcome> {
  const parsed = parse(args ?? {});
  if (!parsed.success) return { kind: 'error', errorKind: 'VALIDATION' };
  try {
    return await run(parsed.data);
  } catch (e) {
    return { kind: 'error', errorKind: e instanceof ConnError ? e.kind : 'UNKNOWN' };
  }
}
