// Spec: 08-2 §6.7 (error classification table, regexes, reset-time parsing), 08-4 §30.3 "Common" (HTTP: 401/403 →
// AI_KEY_INVALID, 429 → AI_LIMIT with retry-after → resetAt, 5xx/529 → AI_SERVICE_DOWN, body > 1 MB → PROTOCOL_INVALID).
import type { AiErrorKind, RawAiError } from './types';

export type Billing = 'plan' | 'key' | 'local';

export const RE_SIGNED_OUT = /not (logged|signed) in|login required|invalid (credentials|token)/i;
export const RE_LIMIT = /usage limit|rate limit|limit (reached|resets)/i;
export const RE_DOWN = /overloaded|service unavailable/i;
/** "unknown flag errors" (08-2 §6.7 AI_CLI_INCOMPATIBLE). The wording is a seed; the M3 spike captures pin it. */
export const RE_UNKNOWN_FLAG = /unknown (option|flag|argument)|unrecognized (option|argument)|unexpected argument/i;
/** CR-0025: the maker's service refuses an out-of-date CLI (real capture 2026-10-21, codex 0.144.4: "… requires a newer
 * version of Codex. Please upgrade to the latest app or CLI …"). Not "Upgrade to Pro", which is a plan limit. */
export const RE_OUTDATED = /requires a newer version|please (upgrade|update) to the latest/i;
export const RE_RESET_AT = /resets? (at )?(\d{1,2}(:\d{2})?\s?(am|pm))/i;
export const RE_TRY_AGAIN = /try again in (\d+) (minutes?|hours?)/i;
/** 08-4 §30.1 "unknown-model error" (seed wording). */
export const RE_UNKNOWN_MODEL = /unknown model|model[^\n]{0,80}(not found|does not exist|not supported|unavailable|invalid)|invalid model/i;

const OFFLINE_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ETIMEDOUT', 'ENETUNREACH', 'EHOSTUNREACH']);

/** HTTP status → kind (08-4 §30.3 common rules; 08-2 §6.7: 401/403 on a plan is AI_SIGNED_OUT). */
export function classifyHttp(status: number, billing: Billing): AiErrorKind | null {
  if (status === 401 || status === 403) return billing === 'plan' ? 'AI_SIGNED_OUT' : 'AI_KEY_INVALID';
  if (status === 429) return 'AI_LIMIT';
  if (status === 529 || (status >= 500 && status <= 599)) return 'AI_SERVICE_DOWN';
  return null;
}

/** Text signals (CLI stderr, error envelopes), in table order of 08-2 §6.7. */
export function classifyText(text: string): AiErrorKind | null {
  if (RE_SIGNED_OUT.test(text)) return 'AI_SIGNED_OUT';
  if (RE_LIMIT.test(text)) return 'AI_LIMIT';
  if (RE_DOWN.test(text)) return 'AI_SERVICE_DOWN';
  if (RE_UNKNOWN_FLAG.test(text) || RE_OUTDATED.test(text)) return 'AI_CLI_INCOMPATIBLE';
  return null;
}

export function classifyError(e: RawAiError, billing: Billing): AiErrorKind {
  if (e.timedOut) return 'AI_TIMEOUT';
  if (e.online === false) return 'NET_OFFLINE';
  if (e.http !== undefined) {
    const k = classifyHttp(e.http, billing);
    if (k) return k;
  }
  if (e.code && OFFLINE_CODES.has(e.code)) return 'NET_OFFLINE';
  const k = classifyText(`${e.message}\n${e.stderr ?? ''}`);
  if (k) return k;
  return 'UNKNOWN';
}

/** Offset (ms) of `timeZone` from UTC at instant `utcMs`. */
function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const n = (t: string): number => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour') % 24, n('minute'), n('second'));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** Wall-clock parts in `timeZone` at `utcMs`. */
function wallParts(utcMs: number, timeZone: string): { y: number; m: number; d: number } {
  const local = new Date(utcMs + zoneOffsetMs(utcMs, timeZone));
  return { y: local.getUTCFullYear(), m: local.getUTCMonth(), d: local.getUTCDate() };
}

/** UTC instant of wall time y-m-d h:min in `timeZone`. */
function zonedToUtc(y: number, m: number, d: number, h: number, min: number, timeZone: string): number {
  const guess = Date.UTC(y, m, d, h, min);
  let t = guess - zoneOffsetMs(guess, timeZone);
  t = guess - zoneOffsetMs(t, timeZone);
  return t;
}

/**
 * Reset time from CLI text (08-2 §6.7): "resets at 5pm" / "resets 5:30 pm" → the next such wall-clock time in
 * `timeZone` after `now`; "try again in 30 minutes" / "in 2 hours" → now + n. Undefined when neither is found.
 */
export function parseResetAt(text: string, now: number, timeZone: string): number | undefined {
  const a = RE_RESET_AT.exec(text);
  if (a?.[2]) {
    const m = /^(\d{1,2})(?::(\d{2}))?\s?(am|pm)$/i.exec(a[2].trim());
    if (m) {
      let h = Number(m[1]);
      const min = m[2] ? Number(m[2]) : 0;
      if (h >= 1 && h <= 12 && min < 60) {
        const pm = m[3]!.toLowerCase() === 'pm';
        if (h === 12) h = 0;
        if (pm) h += 12;
        const { y, m: mo, d } = wallParts(now, timeZone);
        let at = zonedToUtc(y, mo, d, h, min, timeZone);
        if (at <= now) at = zonedToUtc(y, mo, d + 1, h, min, timeZone);
        return at;
      }
    }
  }
  const b = RE_TRY_AGAIN.exec(text);
  if (b?.[1] && b[2]) {
    const n = Number(b[1]);
    return now + n * (b[2].toLowerCase().startsWith('hour') ? 3_600_000 : 60_000);
  }
  return undefined;
}

/** resetAt for a classified error: HTTP retry-after seconds first, then the text. */
export function resetAtFor(e: RawAiError, now: number, timeZone: string): number | undefined {
  if (e.retryAfterSec !== undefined && Number.isFinite(e.retryAfterSec) && e.retryAfterSec >= 0)
    return now + Math.round(e.retryAfterSec * 1000);
  return parseResetAt(`${e.message}\n${e.stderr ?? ''}`, now, timeZone);
}

/** `retry-after` header in seconds (08-4 §30.3); an HTTP-date or junk → undefined (15 min polling). */
export function parseRetryAfter(v: string | null): number | undefined {
  if (v === null) return undefined;
  const s = v.trim();
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : undefined;
}
