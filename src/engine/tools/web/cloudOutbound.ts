// Spec: 08-2 §8.3.12 b (every outbound query, URL, goal and argument passes the Redactor (§11.4 R11); a registry or pattern
// hit removes the hit before sending, and a hit in a URL path or host blocks the call: CLOUD_SECRET_BLOCKED, local path used),
// 08-2 §8.2 web.fetch (URL passes the Redactor first: query params named token|key|code|sig|… stripped), §11.4 R11
// (`cloud.outbound` is the choke point), AT-140.

/** The Redactor's scrub (registry, then patterns). Hits come back as `[hidden]` or `•••• {last4}`. */
export type Scrub = (text: string) => { text: string; hits: number };

export interface OutboundPayload {
  /** Free text: query, goal. Hits are removed. */
  text?: Record<string, string>;
  /** URLs: a hit in host or path blocks the call; secret query params, userinfo and the fragment are dropped. */
  urls?: Record<string, string>;
}

export type OutboundResult =
  { ok: true; text: Record<string, string>; urls: Record<string, string> } | { ok: false; kind: 'CLOUD_SECRET_BLOCKED' };

/** The R11 names (08-2 §11.4 item 2 URL row), matched anywhere in the param name (`api_key`, `access_token`). */
const SECRET_PARAM = /token|key|code|sig|password|pwd|secret|auth/i;
const MARKS = /\[hidden\]|•••• \d{4}/gu;

function removeHits(scrub: Scrub, text: string): string {
  const r = scrub(text);
  if (r.hits === 0) return text;
  return r.text
    .replace(MARKS, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function hit(scrub: Scrub, text: string): boolean {
  let decoded = text;
  try {
    decoded = decodeURIComponent(text);
  } catch {
    // A malformed escape: check the raw text only.
  }
  return scrub(text).hits > 0 || scrub(decoded).hits > 0;
}

/** One URL through R11; null when the call must be blocked. */
export function outboundUrl(scrub: Scrub, raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (hit(scrub, u.hostname) || hit(scrub, u.pathname)) return null;
  u.username = '';
  u.password = '';
  u.hash = '';
  for (const [name, value] of [...u.searchParams]) {
    if (SECRET_PARAM.test(name) || hit(scrub, value)) u.searchParams.delete(name);
  }
  return u.toString();
}

/** `cloud.outbound(payload)`: the only way a payload reaches a cloud web service. */
export function cloudOutbound(scrub: Scrub, payload: OutboundPayload): OutboundResult {
  const urls: Record<string, string> = {};
  for (const [k, v] of Object.entries(payload.urls ?? {})) {
    const safe = outboundUrl(scrub, v);
    if (safe === null) return { ok: false, kind: 'CLOUD_SECRET_BLOCKED' };
    urls[k] = safe;
  }
  const text: Record<string, string> = {};
  for (const [k, v] of Object.entries(payload.text ?? {})) text[k] = removeHits(scrub, v);
  return { ok: true, text, urls };
}
