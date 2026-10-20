// Spec: 04 §13.6 (bridge, MCP Apps SEP-1865 style JSON-RPC 2.0 over postMessage: the host accepts a message only when
// `event.source === frame.contentWindow` (a sandboxed frame's origin is `null`, so origin checks are not used), main
// validates every call with zod, allows 10 calls per second and logs every call through `page:rpc`; the host never sends
// HTML or DOM into the page after the first document, only JSON-RPC results), CR-0022 AT-360, X-180.
import { PAGE_MAX_HEIGHT, type PageRpcResult } from '../../shared/kit/page';

/** Calls past this many in one second are dropped here without reaching main (main's own limit is 10); a call main's schema refuses still counts here, so bad calls cannot flood the bridge. */
export const HOST_FLOOD_PER_SECOND = 12;
/** The largest message (as JSON) the host forwards to main. */
export const HOST_MAX_CALL_CHARS = 16_000;

/** A JSON copy of what the page posted (strips functions, prototypes and cycles), or null when it is not JSON. */
export function asJson(data: unknown): unknown {
  try {
    const s = JSON.stringify(data);
    if (s === undefined || s.length > HOST_MAX_CALL_CHARS) return null;
    return JSON.parse(s) as unknown;
  } catch {
    return null;
  }
}

/** The JSON-RPC id the page used, when it is one the schema allows, so a refusal can still answer it. */
export function callId(data: unknown): number | null {
  const id = (data as { id?: unknown } | null)?.id;
  return typeof id === 'number' && Number.isInteger(id) && id >= 0 ? id : null;
}

/** The answer posted back into the page: a JSON-RPC result or error, never markup. */
export function rpcReply(id: number, r: PageRpcResult): { jsonrpc: '2.0'; id: number; result: Record<string, never> } | RpcError {
  return r.ok
    ? { jsonrpc: '2.0', id, result: {} }
    : { jsonrpc: '2.0', id, error: { code: -32000, message: 'refused', data: { reason: r.refused } } };
}
type RpcError = { jsonrpc: '2.0'; id: number; error: { code: number; message: string; data: { reason: string } } };

/** The frame height for a `reportSize`: at most 600px; a taller page scrolls inside the frame. */
export const frameHeight = (reported: number) => Math.min(Math.max(0, Math.ceil(reported)), PAGE_MAX_HEIGHT);

/** A per-frame sliding one-second window. */
export function floodGate(limit = HOST_FLOOD_PER_SECOND): (now: number) => boolean {
  let recent: number[] = [];
  return (now) => {
    recent = recent.filter((t) => now - t < 1000);
    if (recent.length >= limit) return false;
    recent.push(now);
    return true;
  };
}

/** The domain C-26 names for a link ("This opens {domain}. Open it?"). */
export function linkDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
