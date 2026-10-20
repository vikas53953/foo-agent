// Spec: 04 §13.6 (AI page bridge, MCP Apps SEP-1865 style JSON-RPC over postMessage: the host accepts only messages whose
// source is the frame, validates every call with zod, 10 calls per second, logs every call through `page:rpc`; allowed
// calls reportSize (height capped at 600px), draftMessage (fills the composer, never sends), openLink (always the C-26
// dialog), requestAction (through the gate as if the user typed it)), 08-1 §3.2 `page:rpc`, CR-0022 AT-360, AT-361, X-180.
import { z } from 'zod';

export const PAGE_SCHEME = 'foo-page';
export const PAGE_MAX_HEIGHT = 600;
export const PAGE_RPC_PER_SECOND = 10;
/** The page id in `foo-page://{pageId}`: `pg_{UUIDv7}` (08-0 §E.7). */
export const PageIdSchema = z.string().regex(/^pg_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

const text = z.string().min(1).max(4000);

/** One JSON-RPC 2.0 request from the page. Anything else is refused before it reaches main. */
export const PageRpcCallSchema = z.discriminatedUnion('method', [
  z
    .object({
      jsonrpc: z.literal('2.0'),
      id: z.number().int().min(0),
      method: z.literal('reportSize'),
      params: z.object({ height: z.number().min(0).max(100_000) }).strict(),
    })
    .strict(),
  z
    .object({
      jsonrpc: z.literal('2.0'),
      id: z.number().int().min(0),
      method: z.literal('draftMessage'),
      params: z.object({ text }).strict(),
    })
    .strict(),
  z
    .object({
      jsonrpc: z.literal('2.0'),
      id: z.number().int().min(0),
      method: z.literal('openLink'),
      params: z.object({ url: z.url({ protocol: /^https$/ }).max(2000) }).strict(),
    })
    .strict(),
  z
    .object({
      jsonrpc: z.literal('2.0'),
      id: z.number().int().min(0),
      method: z.literal('requestAction'),
      params: z.object({ text }).strict(),
    })
    .strict(),
]);
export type PageRpcCall = z.infer<typeof PageRpcCallSchema>;
export type PageRpcMethod = PageRpcCall['method'];

/** What main answers a call with: done, or refused with why (a secret, the rate, a schema miss). */
export type PageRpcResult = { ok: true } | { ok: false; refused: 'secret' | 'rate' | 'schema' | 'declined' };

/** The `<iframe sandbox>` value: scripts only (never same-origin, popups, forms, top navigation, modals or downloads). */
export const PAGE_SANDBOX = 'allow-scripts';

/** The response header CSP main serves every page with (04 §13.6). */
export const PAGE_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'; frame-src 'none'; connect-src 'none'";
